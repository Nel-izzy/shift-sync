import { Injectable } from '@nestjs/common';
import { db } from '../../database/db';
import { shifts, shiftAssignments, users, userLocations } from '../../database/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { differenceInHours, startOfWeek, endOfWeek, format } from 'date-fns';

@Injectable()
export class AnalyticsService {
  async getDistributionReport(locationId: string, from: Date, to: Date) {
    const rows = await db.select({
      user: users,
      shift: shifts,
      assignment: shiftAssignments,
    })
      .from(shiftAssignments)
      .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
      .innerJoin(users, eq(shiftAssignments.userId, users.id))
      .where(and(
        eq(shifts.locationId, locationId),
        gte(shifts.startTime, from),
        lte(shifts.startTime, to),
      ));

    const byUser: Record<string, {
      userId: string;
      name: string;
      totalHours: number;
      totalShifts: number;
      premiumShifts: number;
      premiumHours: number;
      desiredHours: number;
      hoursDiff: number;
    }> = {};

    for (const row of rows) {
      const uid = row.user.id;
      const hours = differenceInHours(new Date(row.shift.endTime), new Date(row.shift.startTime));
      const weeks = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (7 * 24 * 60 * 60 * 1000)));
      const desiredTotal = (row.user.desiredHoursPerWeek || 40) * weeks;

      if (!byUser[uid]) {
        byUser[uid] = {
          userId: uid,
          name: `${row.user.firstName} ${row.user.lastName}`,
          totalHours: 0,
          totalShifts: 0,
          premiumShifts: 0,
          premiumHours: 0,
          desiredHours: desiredTotal,
          hoursDiff: 0,
        };
      }

      byUser[uid].totalHours += hours;
      byUser[uid].totalShifts++;
      if (row.shift.isPremium) {
        byUser[uid].premiumShifts++;
        byUser[uid].premiumHours += hours;
      }
    }

    for (const entry of Object.values(byUser)) {
      entry.hoursDiff = entry.totalHours - entry.desiredHours;
    }

    return Object.values(byUser).sort((a, b) => b.totalHours - a.totalHours);
  }

  async getFairnessReport(locationId: string, from: Date, to: Date) {
    const dist = await this.getDistributionReport(locationId, from, to);
    const totalPremiumShifts = dist.reduce((s, u) => s + u.premiumShifts, 0);
    const staffCount = dist.length;

    const expectedPremiumPerPerson = staffCount > 0 ? totalPremiumShifts / staffCount : 0;

    const fairnessScores = dist.map(u => ({
      ...u,
      fairnessScore: expectedPremiumPerPerson > 0
        ? Math.round((1 - Math.abs(u.premiumShifts - expectedPremiumPerPerson) / expectedPremiumPerPerson) * 100)
        : 100,
      premiumDeviation: u.premiumShifts - expectedPremiumPerPerson,
    }));

    const overallFairness = fairnessScores.length > 0
      ? Math.round(fairnessScores.reduce((s, u) => s + u.fairnessScore, 0) / fairnessScores.length)
      : 100;

    return {
      overallFairness,
      expectedPremiumPerPerson: Math.round(expectedPremiumPerPerson * 10) / 10,
      staff: fairnessScores,
    };
  }

  async getWeeklyProjection(locationId: string, weekStart: string) {
    const ws = new Date(weekStart);
    const we = endOfWeek(ws, { weekStartsOn: 1 });

    const rows = await db.select({ shift: shifts, assignment: shiftAssignments, user: users })
      .from(shifts)
      .innerJoin(shiftAssignments, eq(shifts.id, shiftAssignments.shiftId))
      .innerJoin(users, eq(shiftAssignments.userId, users.id))
      .where(and(
        eq(shifts.locationId, locationId),
        gte(shifts.startTime, ws),
        lte(shifts.startTime, we),
      ));

    const byUser: Record<string, { name: string; hours: number; overtimeHours: number; overtimeCost: number }> = {};
    const OVERTIME_RATE = 1.5;
    const BASE_HOURLY = 18;

    for (const row of rows) {
      const uid = row.user.id;
      const h = differenceInHours(new Date(row.shift.endTime), new Date(row.shift.startTime));
      if (!byUser[uid]) byUser[uid] = { name: `${row.user.firstName} ${row.user.lastName}`, hours: 0, overtimeHours: 0, overtimeCost: 0 };
      byUser[uid].hours += h;
    }

    let totalOvertimeCost = 0;
    for (const entry of Object.values(byUser)) {
      entry.overtimeHours = Math.max(0, entry.hours - 40);
      entry.overtimeCost = entry.overtimeHours * BASE_HOURLY * OVERTIME_RATE;
      totalOvertimeCost += entry.overtimeCost;
    }

    return {
      staff: Object.values(byUser),
      totalProjectedOvertimeCost: totalOvertimeCost,
      currency: 'USD',
    };
  }
}
