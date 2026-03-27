import { Injectable } from '@nestjs/common';
import { db } from '../../database/db';
import { notifications, users } from '../../database/schema';
import { eq, and, desc } from 'drizzle-orm';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
  constructor(private gateway: NotificationsGateway) {}

  async create(
    userId: string,
    type: typeof notifications.$inferInsert['type'],
    title: string,
    message: string,
    data?: Record<string, any>,
  ) {
    const [notif] = await db.insert(notifications).values({
      userId, type, title, message, data,
    }).returning();

    // Check user notification preferences
    const [user] = await db.select({ notifyInApp: users.notifyInApp })
      .from(users).where(eq(users.id, userId)).limit(1);

    if (user?.notifyInApp) {
      this.gateway.sendToUser(userId, 'notification', notif);
    }

    return notif;
  }

  async notifyMany(
    userIds: string[],
    type: typeof notifications.$inferInsert['type'],
    title: string,
    message: string,
    data?: Record<string, any>,
  ) {
    for (const userId of userIds) {
      await this.create(userId, type, title, message, data);
    }
  }

  async list(userId: string, unreadOnly = false) {
    const base = db.select().from(notifications).where(
      unreadOnly
        ? and(eq(notifications.userId, userId), eq(notifications.isRead, false))
        : eq(notifications.userId, userId)
    ).orderBy(desc(notifications.createdAt)).limit(50);

    return base;
  }

  async markRead(notificationId: string, userId: string) {
    await db.update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
  }

  async markAllRead(userId: string) {
    await db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));
  }

  async unreadCount(userId: string): Promise<number> {
    const result = await db.select().from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return result.length;
  }
}
