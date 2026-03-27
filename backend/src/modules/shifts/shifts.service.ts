import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { IsString, IsDateString, IsInt, IsOptional, IsUUID, Min, Max } from 'class-validator';
import { db } from '../../database/db';
import {
  shifts, shiftAssignments, users, locations, managerLocations,
} from '../../database/schema';
import { eq, and, gte, lte, inArray, sql, desc } from 'drizzle-orm';
import { ConstraintService } from './constraint.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { startOfWeek, endOfWeek, isFriday, isSaturday, getHours, differenceInHours } from 'date-fns';
import { swapRequests } from '../../database/schema';

export class CreateShiftDto {
  @IsUUID() locationId: string;
  @IsString() requiredSkill: string;
  @IsDateString() startTime: string;
  @IsDateString() endTime: string;
  @IsInt() @Min(1) @Max(20) headcount: number;
  @IsOptional() @IsString() notes?: string;
}

export class AssignStaffDto {
  @IsUUID() userId: string;
}

@Injectable()
export class ShiftsService {
  constructor(
    private constraints: ConstraintService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private gateway: NotificationsGateway,
  ) {}

  private isPremiumShift(start: Date): boolean {
    const h = getHours(start);
    return (isFriday(start) || isSaturday(start)) && h >= 17;
  }

  async create(dto: CreateShiftDto, actor: { id: string; role: string }) {
    if (actor.role === 'manager') {
      await this.assertManagerAccess(actor.id, dto.locationId);
    }

    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);

    if (end <= start) throw new BadRequestException('Shift end time must be after start time');

    const [shift] = await db.insert(shifts).values({
      locationId: dto.locationId,
      requiredSkill: dto.requiredSkill,
      startTime: start,
      endTime: end,
      headcount: dto.headcount,
      notes: dto.notes,
      isPremium: this.isPremiumShift(start),
      createdBy: actor.id,
    }).returning();

    await this.audit.log({
      actorId: actor.id,
      action: 'CREATE_SHIFT',
      entityType: 'shift',
      entityId: shift.id,
      locationId: dto.locationId,
      after: shift,
    });

    return shift;
  }

  async findAll(user: { id: string; role: string }, params: {
    locationId?: string;
    weekStart?: string;
    weekEnd?: string;
  }) {
    let locationIds: string[] = [];

    if (params.locationId) {
      locationIds = [params.locationId];
    } else if (user.role === 'manager') {
      const ml = await db.select({ locationId: managerLocations.locationId })
        .from(managerLocations).where(eq(managerLocations.userId, user.id));
      locationIds = ml.map(r => r.locationId);
    }

    let query = db.select({
      shift: shifts,
      location: locations,
    })
      .from(shifts)
      .innerJoin(locations, eq(shifts.locationId, locations.id));

    const conditions = [];
    if (locationIds.length > 0) conditions.push(inArray(shifts.locationId, locationIds));

    if (user.role === 'staff') {
      conditions.push(eq(shifts.isPublished, true));
    }

    if (params.weekStart) conditions.push(gte(shifts.startTime, new Date(params.weekStart)));
    if (params.weekEnd) conditions.push(lte(shifts.startTime, new Date(params.weekEnd)));

    if (conditions.length) query = query.where(and(...conditions)) as any;

    const rows = await query.orderBy(shifts.startTime);

    // Load assignments
    const shiftIds = rows.map(r => r.shift.id);
    const assignments = shiftIds.length > 0
      ? await db.select({ assignment: shiftAssignments, user: users })
        .from(shiftAssignments)
        .innerJoin(users, eq(shiftAssignments.userId, users.id))
        .where(inArray(shiftAssignments.shiftId, shiftIds))
      : [];

    return rows.map(r => ({
      ...r.shift,
      location: r.location,
      assignments: assignments
        .filter(a => a.assignment.shiftId === r.shift.id)
        .map(a => ({
          id: a.assignment.id,
          userId: a.user.id,
          firstName: a.user.firstName,
          lastName: a.user.lastName,
          email: a.user.email,
          assignedAt: a.assignment.assignedAt,
        })),
    }));
  }

  async findOne(id: string) {
    const [shift] = await db.select({ shift: shifts, location: locations })
      .from(shifts)
      .innerJoin(locations, eq(shifts.locationId, locations.id))
      .where(eq(shifts.id, id))
      .limit(1);

    if (!shift) throw new NotFoundException('Shift not found');

    const assigned = await db.select({ assignment: shiftAssignments, user: users })
      .from(shiftAssignments)
      .innerJoin(users, eq(shiftAssignments.userId, users.id))
      .where(eq(shiftAssignments.shiftId, id));

    return {
      ...shift.shift,
      location: shift.location,
      assignments: assigned.map(a => ({
        id: a.assignment.id,
        userId: a.user.id,
        firstName: a.user.firstName,
        lastName: a.user.lastName,
        email: a.user.email,
        skills: a.user.skills,
        assignedAt: a.assignment.assignedAt,
      })),
    };
  }

  async assign(shiftId: string, dto: AssignStaffDto, actor: { id: string; role: string }) {
    const [shift] = await db.select().from(shifts).where(eq(shifts.id, shiftId)).limit(1);
    if (!shift) throw new NotFoundException('Shift not found');

    if (actor.role === 'manager') await this.assertManagerAccess(actor.id, shift.locationId);

    // Run constraint checks
    const result = await this.constraints.validateAssignment(dto.userId, shiftId);

    if (!result.valid) {
      // Find alternatives to include in error
      const alts = await this.constraints.findAlternatives(shiftId, dto.userId);
      throw new BadRequestException({
        message: 'Assignment violates scheduling constraints',
        violations: result.violations,
        warnings: result.warnings,
        alternatives: alts,
      });
    }

    // Check headcount
    const existingCount = await db.select().from(shiftAssignments)
      .where(eq(shiftAssignments.shiftId, shiftId));
    if (existingCount.length >= shift.headcount) {
      throw new BadRequestException(`Shift already has ${shift.headcount} staff assigned (maximum reached)`);
    }

    // Optimistic lock: check for concurrent assignment
    const existing = await db.select().from(shiftAssignments)
      .where(and(eq(shiftAssignments.shiftId, shiftId), eq(shiftAssignments.userId, dto.userId)))
      .limit(1);
    if (existing.length > 0) throw new BadRequestException('Staff member is already assigned to this shift');

    const [assignment] = await db.insert(shiftAssignments).values({
      shiftId, userId: dto.userId, assignedBy: actor.id,
    }).returning();

    await this.audit.log({
      actorId: actor.id,
      action: 'ASSIGN_STAFF',
      entityType: 'shift',
      entityId: shiftId,
      locationId: shift.locationId,
      after: { userId: dto.userId, shiftId },
    });

    // Notify staff
    const [user] = await db.select().from(users).where(eq(users.id, dto.userId)).limit(1);
    if (user) {
      await this.notifications.create(
        dto.userId,
        'shift_assigned',
        'New Shift Assigned',
        `You have been assigned a shift on ${shift.startTime.toLocaleDateString()}.`,
        { shiftId },
      );
    }

    // Broadcast to location room
    this.gateway.broadcastToRoom(`location:${shift.locationId}`, 'shift_updated', { shiftId });

    return { assignment, warnings: result.warnings };
  }

  async unassign(shiftId: string, userId: string, actor: { id: string; role: string }) {
    const [shift] = await db.select().from(shifts).where(eq(shifts.id, shiftId)).limit(1);
    if (!shift) throw new NotFoundException('Shift not found');

    if (actor.role === 'manager') await this.assertManagerAccess(actor.id, shift.locationId);

    // Cancel any pending swaps for this assignment
    const [assignment] = await db.select().from(shiftAssignments)
      .where(and(eq(shiftAssignments.shiftId, shiftId), eq(shiftAssignments.userId, userId)))
      .limit(1);

    if (!assignment) throw new NotFoundException('Assignment not found');

    // Auto-cancel pending swaps
    await db.update(swapRequests)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(
        and(
          eq(swapRequests.requesterAssignmentId, assignment.id),
          eq(swapRequests.status, 'pending'),
        )
      );

    await db.delete(shiftAssignments)
      .where(and(eq(shiftAssignments.shiftId, shiftId), eq(shiftAssignments.userId, userId)));

    await this.audit.log({
      actorId: actor.id,
      action: 'UNASSIGN_STAFF',
      entityType: 'shift',
      entityId: shiftId,
      locationId: shift.locationId,
      before: { userId, shiftId },
    });

    this.gateway.broadcastToRoom(`location:${shift.locationId}`, 'shift_updated', { shiftId });
  }

  async publish(shiftId: string, actor: { id: string; role: string }) {
    const [shift] = await db.select().from(shifts).where(eq(shifts.id, shiftId)).limit(1);
    if (!shift) throw new NotFoundException('Shift not found');
    if (actor.role === 'manager') await this.assertManagerAccess(actor.id, shift.locationId);

    const [updated] = await db.update(shifts)
      .set({ isPublished: true, publishedAt: new Date(), updatedAt: new Date() })
      .where(eq(shifts.id, shiftId))
      .returning();

    // Notify assigned staff
    const assigned = await db.select({ userId: shiftAssignments.userId })
      .from(shiftAssignments).where(eq(shiftAssignments.shiftId, shiftId));

    await this.notifications.notifyMany(
      assigned.map(a => a.userId),
      'shift_published',
      'Schedule Published',
      `Your schedule for ${shift.startTime.toLocaleDateString()} has been published.`,
      { shiftId },
    );

    this.gateway.broadcastToRoom(`location:${shift.locationId}`, 'schedule_published', { shiftId, locationId: shift.locationId });

    await this.audit.log({
      actorId: actor.id, action: 'PUBLISH_SHIFT', entityType: 'shift',
      entityId: shiftId, locationId: shift.locationId,
    });

    return updated;
  }

  async publishWeek(locationId: string, weekStart: string, actor: { id: string; role: string }) {
    if (actor.role === 'manager') await this.assertManagerAccess(actor.id, locationId);

    const ws = new Date(weekStart);
    const we = endOfWeek(ws, { weekStartsOn: 1 });

    const toPublish = await db.select().from(shifts).where(
      and(
        eq(shifts.locationId, locationId),
        eq(shifts.isPublished, false),
        gte(shifts.startTime, ws),
        lte(shifts.startTime, we),
      )
    );

    for (const s of toPublish) {
      await this.publish(s.id, actor);
    }

    return { published: toPublish.length };
  }

  async unpublish(shiftId: string, actor: { id: string; role: string }) {
    const [shift] = await db.select().from(shifts).where(eq(shifts.id, shiftId)).limit(1);
    if (!shift) throw new NotFoundException('Shift not found');
    if (actor.role === 'manager') await this.assertManagerAccess(actor.id, shift.locationId);

    // Check cutoff: cannot unpublish within 48 hours of shift start
    const hoursUntilShift = differenceInHours(shift.startTime, new Date());
    if (hoursUntilShift < 48) {
      throw new BadRequestException(`Cannot unpublish within 48 hours of shift start (${hoursUntilShift}h remaining)`);
    }

    const [updated] = await db.update(shifts)
      .set({ isPublished: false, publishedAt: null, updatedAt: new Date() })
      .where(eq(shifts.id, shiftId)).returning();

    await this.audit.log({
      actorId: actor.id, action: 'UNPUBLISH_SHIFT', entityType: 'shift',
      entityId: shiftId, locationId: shift.locationId,
    });

    return updated;
  }

  async checkAssignment(shiftId: string, userId: string) {
    const result = await this.constraints.validateAssignment(userId, shiftId);
    const alternatives = result.valid ? [] : await this.constraints.findAlternatives(shiftId, userId);
    return { ...result, alternatives };
  }

  async getWeeklyOvertimeDashboard(locationId: string, weekStart: string, actor: any) {
    if (actor.role === 'manager') await this.assertManagerAccess(actor.id, locationId);

    const ws = new Date(weekStart);
    const we = endOfWeek(ws, { weekStartsOn: 1 });

    const locationShifts = await db.select({ shift: shifts, assignment: shiftAssignments, user: users })
      .from(shifts)
      .innerJoin(shiftAssignments, eq(shifts.id, shiftAssignments.shiftId))
      .innerJoin(users, eq(shiftAssignments.userId, users.id))
      .where(and(
        eq(shifts.locationId, locationId),
        gte(shifts.startTime, ws),
        lte(shifts.startTime, we),
      ));

    // Group by user
    const byUser: Record<string, { user: any; hours: number; shifts: any[]; overtimeHours: number }> = {};
    for (const row of locationShifts) {
      const uid = row.user.id;
      if (!byUser[uid]) {
        byUser[uid] = { user: row.user, hours: 0, shifts: [], overtimeHours: 0 };
      }
      const h = differenceInHours(new Date(row.shift.endTime), new Date(row.shift.startTime));
      byUser[uid].hours += h;
      byUser[uid].shifts.push(row.shift);
    }

    for (const entry of Object.values(byUser)) {
      entry.overtimeHours = Math.max(0, entry.hours - 40);
    }

    return Object.values(byUser).sort((a, b) => b.hours - a.hours);
  }

  async getOnDutyNow(locationId: string) {
    const now = new Date();
    return db.select({ shift: shifts, user: users })
      .from(shifts)
      .innerJoin(shiftAssignments, eq(shifts.id, shiftAssignments.shiftId))
      .innerJoin(users, eq(shiftAssignments.userId, users.id))
      .where(and(
        eq(shifts.locationId, locationId),
        lte(shifts.startTime, now),
        gte(shifts.endTime, now),
        eq(shifts.isPublished, true),
      ));
  }

  private async assertManagerAccess(managerId: string, locationId: string) {
    const [row] = await db.select().from(managerLocations)
      .where(and(eq(managerLocations.userId, managerId), eq(managerLocations.locationId, locationId)))
      .limit(1);
    if (!row) throw new ForbiddenException('You do not manage this location');
  }
}
