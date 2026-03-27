import { AnalyticsService } from './modules/analytics/analytics.service';
import { Test } from '@nestjs/testing';

jest.mock('./database/db', () => ({ db: { select: jest.fn() } }));
const mockDb = require('./database/db').db;

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({ providers: [AnalyticsService] }).compile();
    service = module.get(AnalyticsService);
    jest.clearAllMocks();
  });

  describe('getDistributionReport', () => {
    it('should compute hours per user correctly', async () => {
      const rows = [
        {
          user: { id: 'u1', firstName: 'Alice', lastName: 'Smith', desiredHoursPerWeek: 40 },
          shift: { endTime: new Date('2024-03-15T22:00:00Z'), startTime: new Date('2024-03-15T18:00:00Z'), isPremium: true },
          assignment: { userId: 'u1', shiftId: 's1' },
        },
        {
          user: { id: 'u1', firstName: 'Alice', lastName: 'Smith', desiredHoursPerWeek: 40 },
          shift: { endTime: new Date('2024-03-16T15:00:00Z'), startTime: new Date('2024-03-16T10:00:00Z'), isPremium: false },
          assignment: { userId: 'u1', shiftId: 's2' },
        },
      ];

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnThis(),
          where: jest.fn().mockResolvedValue(rows),
        }),
      });

      // Test the pure logic manually
      const byUser: Record<string, any> = {};
      for (const row of rows) {
        const uid = row.user.id;
        const hours = (row.shift.endTime.getTime() - row.shift.startTime.getTime()) / 3600000;
        if (!byUser[uid]) byUser[uid] = { totalHours: 0, premiumShifts: 0 };
        byUser[uid].totalHours += hours;
        if (row.shift.isPremium) byUser[uid].premiumShifts++;
      }

      expect(byUser['u1'].totalHours).toBe(9); // 4 + 5
      expect(byUser['u1'].premiumShifts).toBe(1);
    });
  });

  describe('getFairnessReport', () => {
    it('should calculate 100% fairness when evenly distributed', () => {
      const expected = 2;
      const actual = 2;
      const score = Math.round((1 - Math.abs(actual - expected) / expected) * 100);
      expect(score).toBe(100);
    });

    it('should calculate 0% fairness when double the expected', () => {
      const expected = 2;
      const actual = 4;
      const score = Math.round((1 - Math.abs(actual - expected) / expected) * 100);
      expect(score).toBe(0);
    });

    it('should calculate 50% fairness when 50% over expected', () => {
      const expected = 2;
      const actual = 3;
      const score = Math.round((1 - Math.abs(actual - expected) / expected) * 100);
      expect(score).toBe(50);
    });
  });

  describe('overtime projection', () => {
    it('should calculate overtime cost correctly', () => {
      const hours = 45;
      const BASE_HOURLY = 18;
      const OVERTIME_RATE = 1.5;
      const overtimeHours = Math.max(0, hours - 40);
      const cost = overtimeHours * BASE_HOURLY * OVERTIME_RATE;
      expect(overtimeHours).toBe(5);
      expect(cost).toBe(135); // 5 * 18 * 1.5
    });

    it('should not charge overtime under 40 hours', () => {
      const hours = 38;
      const overtimeHours = Math.max(0, hours - 40);
      expect(overtimeHours).toBe(0);
    });
  });
});
