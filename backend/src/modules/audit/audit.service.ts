import { Injectable } from '@nestjs/common';
import { db } from '../../database/db';
import { auditLogs } from '../../database/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';

@Injectable()
export class AuditService {
  async log(params: {
    actorId?: string;
    actorEmail?: string;
    action: string;
    entityType: string;
    entityId?: string;
    before?: any;
    after?: any;
    locationId?: string;
  }) {
    return db.insert(auditLogs).values(params).returning();
  }

  async getForEntity(entityType: string, entityId: string) {
    return db.select().from(auditLogs)
      .where(and(eq(auditLogs.entityType, entityType), eq(auditLogs.entityId, entityId)))
      .orderBy(desc(auditLogs.createdAt));
  }

  async export(locationId: string, from: Date, to: Date) {
    return db.select().from(auditLogs)
      .where(
        and(
          eq(auditLogs.locationId, locationId),
          gte(auditLogs.createdAt, from),
          lte(auditLogs.createdAt, to),
        )
      )
      .orderBy(desc(auditLogs.createdAt));
  }
}
