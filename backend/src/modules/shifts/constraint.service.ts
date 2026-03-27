import { Injectable, BadRequestException } from '@nestjs/common';
import { db } from '../../database/db';
import {
  shifts, shiftAssignments, users, userLocations,
  availability, availabilityExceptions, locations,
} from '../../database/schema';
import { eq, and, gte, lte, ne, inArray, sql } from 'drizzle-orm';
import { differenceInHours, differenceInMinutes, startOfWeek, endOfWeek, addDays, format, getDay } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

export interface ConstraintViolation {
  rule: string;
  message: string;
  suggestions?: { userId: string; name: string; reason: string }[];
}

export interface ConstraintResult {
  valid: boolean;
  violations: ConstraintViolation[];
  warnings: ConstraintViolation[];
  weeklyHours?: number;
  projectedWeeklyHours?: number;
}

@Injectable()
export class ConstraintService {

  async validateAssignment(
    userId: string,
    shiftId: string,
    excludeAssignmentId?: string,
  ): Promise<ConstraintResult> {
    const violations: ConstraintViolation[] = [];
    const warnings: ConstraintViolation[] = [];

    // Load shift details
    const [shift] = await db.select().from(shifts).where(eq(shifts.id, shiftId)).limit(1);
    if (!shift) throw new BadRequestException('Shift not found');

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new BadRequestException('User not found');

    // 1. Skill check
    if (!user.skills.includes(shift.requiredSkill)) {
      violations.push({
        rule: 'SKILL_MISMATCH',
        message: `${user.firstName} does not have the required skill "${shift.requiredSkill}". Their skills: ${user.skills.join(', ') || 'none'}.`,
      });
    }

    // 2. Location certification
    const [cert] = await db.select().from(userLocations).where(
      and(
        eq(userLocations.userId, userId),
        eq(userLocations.locationId, shift.locationId),
        sql`${userLocations.decertifiedAt} IS NULL`,
      )
    ).limit(1);

    if (!cert) {
      violations.push({
        rule: 'NOT_CERTIFIED',
        message: `${user.firstName} is not certified to work at this location.`,
      });
    }

    // 3. Double-booking check (overlapping shifts)
    const overlappingQuery = db.select({ shiftId: shiftAssignments.shiftId })
      .from(shiftAssignments)
      .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
      .where(
        and(
          eq(shiftAssignments.userId, userId),
          excludeAssignmentId ? ne(shiftAssignments.id, excludeAssignmentId) : sql`TRUE`,
          sql`${shifts.startTime} < ${shift.endTime}`,
          sql`${shifts.endTime} > ${shift.startTime}`,
        )
      );

    const overlapping = await overlappingQuery;
    if (overlapping.length > 0) {
      violations.push({
        rule: 'DOUBLE_BOOKING',
        message: `${user.firstName} is already assigned to an overlapping shift during this time.`,
      });
    }

    // 4. Minimum 10-hour gap between shifts
    const gapViolation = await this.checkMinimumGap(userId, shift, excludeAssignmentId);
    if (gapViolation) violations.push(gapViolation);

    // 5. Availability check
    const availViolation = await this.checkAvailability(userId, shift);
    if (availViolation) violations.push(availViolation);

    // 6. Daily hours check (>8 warning, >12 hard block)
    const dailyCheck = await this.checkDailyHours(userId, shift, excludeAssignmentId);
    if (dailyCheck.hardBlock) violations.push(dailyCheck.hardBlock);
    else if (dailyCheck.warning) warnings.push(dailyCheck.warning);

    // 7. Weekly hours and overtime
    const newShiftHours = differenceInHours(shift.endTime, shift.startTime);
    const { currentHours } = await this.getWeeklyHours(userId, shift.startTime, excludeAssignmentId);
    const projectedHours = currentHours + newShiftHours;

    if (projectedHours > 40) {
      warnings.push({
        rule: 'OVERTIME',
        message: `This assignment will put ${user.firstName} at ${projectedHours.toFixed(1)} hours this week (${newShiftHours.toFixed(1)}h shift + ${currentHours.toFixed(1)}h already scheduled). Overtime applies after 40 hours.`,
      });
    } else if (currentHours >= 35) {
      warnings.push({
        rule: 'APPROACHING_OVERTIME',
        message: `${user.firstName} already has ${currentHours.toFixed(1)} hours this week. Adding this shift brings them to ${projectedHours.toFixed(1)} hours.`,
      });
    }

    // 8. Consecutive days check
    const consecutiveCheck = await this.checkConsecutiveDays(userId, shift, excludeAssignmentId);
    if (consecutiveCheck) warnings.push(consecutiveCheck);

    return {
      valid: violations.length === 0,
      violations,
      warnings,
      weeklyHours: currentHours,
      projectedWeeklyHours: projectedHours,
    };
  }

  private async checkMinimumGap(
    userId: string,
    shift: typeof shifts.$inferSelect,
    excludeId?: string,
  ): Promise<ConstraintViolation | null> {
    // Find shifts that end within 10 hours before this shift starts
    // or start within 10 hours after this shift ends
    const tenHoursBefore = new Date(shift.startTime.getTime() - 10 * 60 * 60 * 1000);
    const tenHoursAfter = new Date(shift.endTime.getTime() + 10 * 60 * 60 * 1000);

    const nearby = await db.select()
      .from(shiftAssignments)
      .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
      .where(
        and(
          eq(shiftAssignments.userId, userId),
          excludeId ? ne(shiftAssignments.id, excludeId) : sql`TRUE`,
          sql`(
            (${shifts.endTime} > ${tenHoursBefore} AND ${shifts.endTime} <= ${shift.startTime})
            OR
            (${shifts.startTime} >= ${shift.endTime} AND ${shifts.startTime} < ${tenHoursAfter})
          )`,
        )
      );

    if (nearby.length === 0) return null;

    for (const row of nearby) {
      const s = (row as any).shifts;
      const gapAfter = differenceInHours(new Date(shift.startTime), new Date(s.endTime));
      const gapBefore = differenceInHours(new Date(s.startTime), new Date(shift.endTime));

      if (gapAfter >= 0 && gapAfter < 10) {
        return {
          rule: 'INSUFFICIENT_REST',
          message: `Only ${gapAfter} hours rest between previous shift end and this shift start. Minimum 10 hours required.`,
        };
      }
      if (gapBefore >= 0 && gapBefore < 10) {
        return {
          rule: 'INSUFFICIENT_REST',
          message: `Only ${gapBefore} hours rest between this shift end and next shift start. Minimum 10 hours required.`,
        };
      }
    }
    return null;
  }

  private async checkAvailability(
    userId: string,
    shift: typeof shifts.$inferSelect,
  ): Promise<ConstraintViolation | null> {
    // Load shift location timezone
    const [loc] = await db.select().from(locations)
      .where(eq(locations.id, shift.locationId)).limit(1);

    const tz = loc?.timezone || 'UTC';

    // Check one-off exception first
    const shiftDateLocal = toZonedTime(shift.startTime, tz);
    const dateStr = format(shiftDateLocal, 'yyyy-MM-dd');

    const [exception] = await db.select().from(availabilityExceptions)
      .where(and(eq(availabilityExceptions.userId, userId), eq(availabilityExceptions.date, dateStr)))
      .limit(1);

    if (exception) {
      if (!exception.isAvailable) {
        return { rule: 'UNAVAILABLE', message: `Staff member marked as unavailable on ${dateStr}.` };
      }
      // Check exception window
      if (exception.startTime && exception.endTime) {
        const shiftStart = format(shiftDateLocal, 'HH:mm');
        const shiftEnd = format(toZonedTime(shift.endTime, tz), 'HH:mm');
        if (shiftStart < exception.startTime || shiftEnd > exception.endTime) {
          return {
            rule: 'OUTSIDE_AVAILABILITY',
            message: `Shift falls outside staff member's availability exception window (${exception.startTime}–${exception.endTime}) for ${dateStr}.`,
          };
        }
      }
      return null; // exception says available
    }

    // Check recurring availability
    const dayOfWeek = getDay(shiftDateLocal); // 0=Sun
    const avails = await db.select().from(availability)
      .where(and(eq(availability.userId, userId), eq(availability.dayOfWeek, dayOfWeek)));

    if (avails.length === 0) {
      return { rule: 'NO_AVAILABILITY', message: `Staff member has no availability set for ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dayOfWeek]}s.` };
    }

    const shiftStartLocal = format(shiftDateLocal, 'HH:mm');
    // For overnight shifts, end time check uses next day; simplify to start time check
    const fits = avails.some(a => shiftStartLocal >= a.startTime && shiftStartLocal < a.endTime);
    if (!fits) {
      return {
        rule: 'OUTSIDE_AVAILABILITY',
        message: `Shift start time (${shiftStartLocal} ${tz}) falls outside staff member's available hours on ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dayOfWeek]}s (${avails.map(a => `${a.startTime}–${a.endTime}`).join(', ')}).`,
      };
    }

    return null;
  }

  private async checkDailyHours(
    userId: string,
    shift: typeof shifts.$inferSelect,
    excludeId?: string,
  ): Promise<{ warning?: ConstraintViolation; hardBlock?: ConstraintViolation }> {
    const dayStart = new Date(shift.startTime);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(shift.startTime);
    dayEnd.setHours(23, 59, 59, 999);

    const dayShifts = await db.select()
      .from(shiftAssignments)
      .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
      .where(
        and(
          eq(shiftAssignments.userId, userId),
          excludeId ? ne(shiftAssignments.id, excludeId) : sql`TRUE`,
          gte(shifts.startTime, dayStart),
          lte(shifts.startTime, dayEnd),
        )
      );

    const existingHours = dayShifts.reduce((sum, row) => {
      const s = (row as any).shifts;
      return sum + differenceInHours(new Date(s.endTime), new Date(s.startTime));
    }, 0);

    const shiftHours = differenceInHours(shift.endTime, shift.startTime);
    const total = existingHours + shiftHours;

    if (total > 12) {
      return {
        hardBlock: {
          rule: 'DAILY_HOURS_EXCEEDED',
          message: `This assignment would result in ${total} hours in a single day. Maximum is 12 hours.`,
        },
      };
    }
    if (total > 8) {
      return {
        warning: {
          rule: 'DAILY_HOURS_WARNING',
          message: `This assignment results in ${total} hours in a single day (exceeds 8-hour standard).`,
        },
      };
    }
    return {};
  }

  async getWeeklyHours(userId: string, referenceDate: Date, excludeAssignmentId?: string) {
    const weekStart = startOfWeek(referenceDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(referenceDate, { weekStartsOn: 1 });

    const weekShifts = await db.select()
      .from(shiftAssignments)
      .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
      .where(
        and(
          eq(shiftAssignments.userId, userId),
          excludeAssignmentId ? ne(shiftAssignments.id, excludeAssignmentId) : sql`TRUE`,
          gte(shifts.startTime, weekStart),
          lte(shifts.startTime, weekEnd),
        )
      );

    const currentHours = weekShifts.reduce((sum, row) => {
      const s = (row as any).shifts;
      return sum + differenceInHours(new Date(s.endTime), new Date(s.startTime));
    }, 0);

    return { currentHours, shiftHours: 0 };
  }

  private async checkConsecutiveDays(
    userId: string,
    shift: typeof shifts.$inferSelect,
    excludeId?: string,
  ): Promise<ConstraintViolation | null> {
    // Check 7-day window around shift date
    const windowStart = addDays(shift.startTime, -7);
    const windowEnd = addDays(shift.startTime, 7);

    const windowShifts = await db.select()
      .from(shiftAssignments)
      .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
      .where(
        and(
          eq(shiftAssignments.userId, userId),
          excludeId ? ne(shiftAssignments.id, excludeId) : sql`TRUE`,
          gte(shifts.startTime, windowStart),
          lte(shifts.startTime, windowEnd),
        )
      );

    // Build set of worked days
    const workedDays = new Set<string>();
    for (const row of windowShifts) {
      const s = (row as any).shifts;
      workedDays.add(format(new Date(s.startTime), 'yyyy-MM-dd'));
    }
    workedDays.add(format(shift.startTime, 'yyyy-MM-dd'));

    // Count max consecutive
    let maxConsecutive = 0;
    let current = 0;
    let checkDay = addDays(shift.startTime, -7);

    for (let i = 0; i <= 14; i++) {
      if (workedDays.has(format(checkDay, 'yyyy-MM-dd'))) {
        current++;
        maxConsecutive = Math.max(maxConsecutive, current);
      } else {
        current = 0;
      }
      checkDay = addDays(checkDay, 1);
    }

    if (maxConsecutive >= 7) {
      return {
        rule: 'SEVENTH_CONSECUTIVE_DAY',
        message: `This would be the 7th consecutive work day. Manager override with documented reason required.`,
      };
    }
    if (maxConsecutive === 6) {
      return {
        rule: 'SIXTH_CONSECUTIVE_DAY',
        message: `This would be the 6th consecutive work day. Consider giving staff a day off.`,
      };
    }
    return null;
  }

  async findAlternatives(shiftId: string, excludeUserId?: string): Promise<{ userId: string; name: string; reason: string }[]> {
    const [shift] = await db.select().from(shifts).where(eq(shifts.id, shiftId)).limit(1);
    if (!shift) return [];

    // Find certified staff with matching skill
    const certified = await db.select({ userId: userLocations.userId })
      .from(userLocations)
      .innerJoin(users, eq(userLocations.userId, users.id))
      .where(
        and(
          eq(userLocations.locationId, shift.locationId),
          sql`${userLocations.decertifiedAt} IS NULL`,
          eq(users.isActive, true),
          sql`${users.skills} @> ARRAY[${shift.requiredSkill}]::text[]`,
          excludeUserId ? ne(userLocations.userId, excludeUserId) : sql`TRUE`,
        )
      );

    const alternatives: { userId: string; name: string; reason: string }[] = [];

    for (const { userId } of certified) {
      const result = await this.validateAssignment(userId, shiftId);
      if (result.valid) {
        const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (u) {
          alternatives.push({
            userId: u.id,
            name: `${u.firstName} ${u.lastName}`,
            reason: `Available, certified, and has "${shift.requiredSkill}" skill`,
          });
        }
      }
    }

    return alternatives.slice(0, 5); // Return top 5
  }
}
