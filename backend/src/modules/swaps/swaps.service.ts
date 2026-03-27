import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { IsUUID, IsOptional, IsString } from 'class-validator';
import { Cron } from '@nestjs/schedule';
import { db } from '../../database/db';
import {
  swapRequests, shiftAssignments, shifts, users, managerLocations,
} from '../../database/schema';
import { eq, and, or, lt, inArray } from 'drizzle-orm';
import { ConstraintService } from '../shifts/constraint.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { AuditService } from '../audit/audit.service';
import { addHours, differenceInHours } from 'date-fns';

export class CreateSwapDto {
  @IsUUID() requesterAssignmentId: string;
  @IsOptional() @IsUUID() targetAssignmentId?: string;
  @IsOptional() @IsString() note?: string;
}

export class RespondSwapDto {
  @IsString() action: 'accept' | 'reject';
  @IsOptional() @IsString() note?: string;
}

export class ApproveSwapDto {
  @IsString() action: 'approve' | 'reject';
  @IsOptional() @IsString() note?: string;
}

@Injectable()
export class SwapsService {
  constructor(
    private constraints: ConstraintService,
    private notifications: NotificationsService,
    private gateway: NotificationsGateway,
    private audit: AuditService,
  ) {}

  async create(dto: CreateSwapDto, requesterId: string) {
    // Check pending requests limit
    const pending = await db.select().from(swapRequests)
      .where(and(eq(swapRequests.requesterId, requesterId), eq(swapRequests.status, 'pending')));
    if (pending.length >= 3) {
      throw new BadRequestException('Maximum 3 pending swap/drop requests allowed at once');
    }

    // Load requester assignment
    const [reqAssignment] = await db.select({ a: shiftAssignments, s: shifts })
      .from(shiftAssignments)
      .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
      .where(and(eq(shiftAssignments.id, dto.requesterAssignmentId), eq(shiftAssignments.userId, requesterId)))
      .limit(1);

    if (!reqAssignment) throw new NotFoundException('Assignment not found or does not belong to you');

    // Cannot swap a shift that starts within 24h (drop expiry rule)
    const hoursUntil = differenceInHours(new Date(reqAssignment.s.startTime), new Date());
    if (hoursUntil < 0) throw new BadRequestException('Cannot swap a shift that has already started');

    const isDropRequest = !dto.targetAssignmentId;
    let expiresAt: Date | undefined;
    let targetUserId: string | undefined;

    if (isDropRequest) {
      // Drop expires 24h before shift
      expiresAt = addHours(new Date(reqAssignment.s.startTime), -24);
    } else {
      // Validate target assignment exists
      const [tgtAssignment] = await db.select({ a: shiftAssignments, s: shifts })
        .from(shiftAssignments)
        .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
        .where(eq(shiftAssignments.id, dto.targetAssignmentId))
        .limit(1);

      if (!tgtAssignment) throw new NotFoundException('Target assignment not found');
      targetUserId = tgtAssignment.a.userId;

      // Validate the swap would work for both parties (constraint check)
      const reqCheck = await this.constraints.validateAssignment(
        requesterId, tgtAssignment.a.shiftId, dto.requesterAssignmentId,
      );
      const tgtCheck = await this.constraints.validateAssignment(
        targetUserId, reqAssignment.a.shiftId, dto.targetAssignmentId,
      );

      if (!reqCheck.valid || !tgtCheck.valid) {
        throw new BadRequestException({
          message: 'Swap is not feasible due to scheduling constraints',
          requesterViolations: reqCheck.violations,
          targetViolations: tgtCheck.violations,
        });
      }
    }

    const [swap] = await db.insert(swapRequests).values({
      requesterId,
      requesterAssignmentId: dto.requesterAssignmentId,
      targetUserId,
      targetAssignmentId: dto.targetAssignmentId,
      requesterNote: dto.note,
      expiresAt,
    }).returning();

    // Notify target or managers
    if (isDropRequest) {
      // Notify managers of the location
      const managers = await db.select({ userId: managerLocations.userId })
        .from(managerLocations)
        .where(eq(managerLocations.locationId, reqAssignment.s.locationId));

      await this.notifications.notifyMany(
        managers.map(m => m.userId),
        'drop_requested',
        'Shift Drop Request',
        `A shift on ${reqAssignment.s.startTime.toLocaleDateString()} has been put up for grabs.`,
        { swapId: swap.id, shiftId: reqAssignment.s.id },
      );
    } else {
      await this.notifications.create(
        targetUserId,
        'swap_requested',
        'Swap Request',
        `${reqAssignment.a.userId === requesterId ? 'Someone' : ''} wants to swap shifts with you.`,
        { swapId: swap.id },
      );
    }

    return swap;
  }

  async respond(swapId: string, dto: RespondSwapDto, responderId: string) {
    const [swap] = await db.select().from(swapRequests).where(eq(swapRequests.id, swapId)).limit(1);
    if (!swap) throw new NotFoundException('Swap request not found');
    if (swap.targetUserId !== responderId) throw new ForbiddenException('Not the target of this swap');
    if (swap.status !== 'pending') throw new BadRequestException(`Swap is already ${swap.status}`);

    const newStatus = dto.action === 'accept' ? 'accepted' : 'rejected';
    const [updated] = await db.update(swapRequests)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(swapRequests.id, swapId)).returning();

    // Notify requester
    await this.notifications.create(
      swap.requesterId,
      dto.action === 'accept' ? 'swap_accepted' : 'swap_rejected',
      dto.action === 'accept' ? 'Swap Accepted' : 'Swap Rejected',
      dto.action === 'accept'
        ? 'Your swap request was accepted. Awaiting manager approval.'
        : 'Your swap request was declined.',
      { swapId },
    );

    if (dto.action === 'accept') {
      // Notify managers
      const [reqShift] = await db.select({ s: shifts })
        .from(shiftAssignments)
        .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
        .where(eq(shiftAssignments.id, swap.requesterAssignmentId))
        .limit(1);

      if (reqShift) {
        const managers = await db.select({ userId: managerLocations.userId })
          .from(managerLocations)
          .where(eq(managerLocations.locationId, reqShift.s.locationId));

        await this.notifications.notifyMany(
          managers.map(m => m.userId),
          'swap_requested',
          'Swap Needs Approval',
          'A shift swap has been accepted and requires your approval.',
          { swapId },
        );
      }
    }

    return updated;
  }

  async managerApprove(swapId: string, dto: ApproveSwapDto, managerId: string) {
    const [swap] = await db.select().from(swapRequests).where(eq(swapRequests.id, swapId)).limit(1);
    if (!swap) throw new NotFoundException('Swap request not found');
    if (swap.status !== 'accepted') throw new BadRequestException('Swap must be accepted by both parties before manager approval');

    if (dto.action === 'approve') {
      // Execute the swap
      if (swap.targetAssignmentId) {
        // Swap: exchange userId on both assignments
        const [reqA] = await db.select().from(shiftAssignments).where(eq(shiftAssignments.id, swap.requesterAssignmentId)).limit(1);
        const [tgtA] = await db.select().from(shiftAssignments).where(eq(shiftAssignments.id, swap.targetAssignmentId)).limit(1);

        if (!reqA || !tgtA) throw new BadRequestException('Assignment no longer exists');

        await db.update(shiftAssignments).set({ userId: tgtA.userId }).where(eq(shiftAssignments.id, reqA.id));
        await db.update(shiftAssignments).set({ userId: reqA.userId }).where(eq(shiftAssignments.id, tgtA.id));
      } else {
        // Drop: reassign to whoever claimed it (in this simplified flow, unassign requester)
        await db.delete(shiftAssignments).where(eq(shiftAssignments.id, swap.requesterAssignmentId));
      }

      await db.update(swapRequests)
        .set({ status: 'approved', managerApproverId: managerId, managerNote: dto.note, updatedAt: new Date() })
        .where(eq(swapRequests.id, swapId));

      // Notify both parties
      const notifyIds = [swap.requesterId];
      if (swap.targetUserId) notifyIds.push(swap.targetUserId);

      await this.notifications.notifyMany(
        notifyIds,
        'swap_approved',
        'Swap Approved',
        'Your shift swap has been approved by the manager.',
        { swapId },
      );
    } else {
      await db.update(swapRequests)
        .set({ status: 'rejected', managerApproverId: managerId, managerNote: dto.note, updatedAt: new Date() })
        .where(eq(swapRequests.id, swapId));

      const notifyIds = [swap.requesterId];
      if (swap.targetUserId) notifyIds.push(swap.targetUserId);

      await this.notifications.notifyMany(notifyIds, 'swap_rejected', 'Swap Rejected',
        `Your swap request was rejected by the manager. ${dto.note || ''}`, { swapId });
    }

    await this.audit.log({
      actorId: managerId, action: `SWAP_${dto.action.toUpperCase()}`,
      entityType: 'swap', entityId: swapId,
    });

    return db.select().from(swapRequests).where(eq(swapRequests.id, swapId)).limit(1).then(r => r[0]);
  }

  async cancel(swapId: string, userId: string) {
    const [swap] = await db.select().from(swapRequests).where(eq(swapRequests.id, swapId)).limit(1);
    if (!swap) throw new NotFoundException('Swap not found');
    if (swap.requesterId !== userId) throw new ForbiddenException('Only the requester can cancel');
    if (!['pending', 'accepted'].includes(swap.status)) {
      throw new BadRequestException(`Cannot cancel a swap with status: ${swap.status}`);
    }

    await db.update(swapRequests)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(swapRequests.id, swapId));

    if (swap.targetUserId) {
      await this.notifications.create(
        swap.targetUserId, 'swap_cancelled', 'Swap Cancelled',
        'The swap request you received has been cancelled.', { swapId },
      );
    }
  }

  async list(user: { id: string; role: string }) {
    if (user.role === 'staff') {
      return db.select().from(swapRequests)
        .where(or(eq(swapRequests.requesterId, user.id), eq(swapRequests.targetUserId, user.id)));
    }
    // Managers/admin see all
    return db.select().from(swapRequests).orderBy(swapRequests.createdAt);
  }

  async findAvailableDrops(locationId: string, userId: string) {
    // Find published drop requests for shifts at this location the user is qualified for
    const drops = await db.select({
      swap: swapRequests,
      shift: shifts,
    })
      .from(swapRequests)
      .innerJoin(shiftAssignments, eq(swapRequests.requesterAssignmentId, shiftAssignments.id))
      .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
      .where(
        and(
          eq(swapRequests.status, 'pending'),
          eq(shifts.locationId, locationId),
        )
      );

    // Filter by user qualification
    const eligible = [];
    for (const d of drops) {
      const check = await this.constraints.validateAssignment(userId, d.shift.id);
      if (check.valid) eligible.push(d);
    }
    return eligible;
  }

  async claimDrop(swapId: string, userId: string) {
    const [swap] = await db.select().from(swapRequests).where(eq(swapRequests.id, swapId)).limit(1);
    if (!swap || swap.status !== 'pending' || swap.targetUserId !== null) {
      throw new BadRequestException('Drop request is not available');
    }

    const [reqAssignment] = await db.select({ a: shiftAssignments, s: shifts })
      .from(shiftAssignments)
      .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
      .where(eq(shiftAssignments.id, swap.requesterAssignmentId))
      .limit(1);

    if (!reqAssignment) throw new NotFoundException('Assignment no longer exists');

    // Validate claimer
    const check = await this.constraints.validateAssignment(userId, reqAssignment.a.shiftId);
    if (!check.valid) {
      throw new BadRequestException({ message: 'You cannot claim this shift', violations: check.violations });
    }

    // Update swap with target (claimer) and set to accepted - now needs manager approval
    await db.update(swapRequests)
      .set({ targetUserId: userId, status: 'accepted', updatedAt: new Date() })
      .where(eq(swapRequests.id, swapId));

    // Notify managers
    const managers = await db.select({ userId: managerLocations.userId })
      .from(managerLocations)
      .where(eq(managerLocations.locationId, reqAssignment.s.locationId));

    await this.notifications.notifyMany(
      managers.map(m => m.userId),
      'drop_claimed',
      'Drop Request Claimed',
      `A dropped shift has been claimed and needs your approval.`,
      { swapId },
    );

    return { message: 'Drop claimed. Awaiting manager approval.' };
  }

  @Cron('*/15 * * * *')
  async expireDropRequests() {
    const now = new Date();
    await db.update(swapRequests)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(and(
        eq(swapRequests.status, 'pending'),
        lt(swapRequests.expiresAt, now),
      ));
  }
}
