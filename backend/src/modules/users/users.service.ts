import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { db } from '../../database/db';
import {
  users, userLocations, availability, availabilityExceptions, managerLocations,
} from '../../database/schema';
import { eq, and, sql } from 'drizzle-orm';

export class UpdateProfileDto {
  @IsOptional() @IsBoolean() notifyInApp?: boolean;
  @IsOptional() @IsBoolean() notifyEmail?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(80) desiredHoursPerWeek?: number;
}

export class SetAvailabilityDto {
  @IsArray() windows: { dayOfWeek: number; startTime: string; endTime: string }[];
}

export class SetExceptionDto {
  @IsString() date: string;
  @IsBoolean() isAvailable: boolean;
  @IsOptional() @IsString() startTime?: string;
  @IsOptional() @IsString() endTime?: string;
  @IsOptional() @IsString() reason?: string;
}

@Injectable()
export class UsersService {
  async findAll() {
    return db.select({
      id: users.id, email: users.email,
      firstName: users.firstName, lastName: users.lastName,
      role: users.role, skills: users.skills,
      desiredHoursPerWeek: users.desiredHoursPerWeek,
      isActive: users.isActive, createdAt: users.createdAt,
    }).from(users).where(eq(users.isActive, true));
  }

  async findOne(id: string) {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!user) throw new NotFoundException('User not found');
    const { passwordHash: _, ...safe } = user;
    return safe;
  }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    await db.update(users).set({ ...dto, updatedAt: new Date() }).where(eq(users.id, id));
    return this.findOne(id);
  }

  async getAvailability(userId: string) {
    const recurring = await db.select().from(availability).where(eq(availability.userId, userId));
    const exceptions = await db.select().from(availabilityExceptions)
      .where(eq(availabilityExceptions.userId, userId));
    return { recurring, exceptions };
  }

  async setAvailability(userId: string, dto: SetAvailabilityDto) {
    await db.delete(availability).where(eq(availability.userId, userId));
    if (dto.windows.length > 0) {
      await db.insert(availability).values(dto.windows.map(w => ({ userId, ...w })));
    }
    return this.getAvailability(userId);
  }

  async setException(userId: string, dto: SetExceptionDto) {
    await db.delete(availabilityExceptions)
      .where(and(eq(availabilityExceptions.userId, userId), eq(availabilityExceptions.date, dto.date)));
    const [ex] = await db.insert(availabilityExceptions).values({ userId, ...dto }).returning();
    return ex;
  }

  async deleteException(userId: string, exceptionId: string) {
    await db.delete(availabilityExceptions)
      .where(and(eq(availabilityExceptions.id, exceptionId), eq(availabilityExceptions.userId, userId)));
  }

  async certifyAtLocation(userId: string, locationId: string) {
    await db.insert(userLocations).values({ userId, locationId })
      .onConflictDoNothing();
  }

  async decertifyFromLocation(userId: string, locationId: string) {
    await db.update(userLocations)
      .set({ decertifiedAt: new Date() })
      .where(and(eq(userLocations.userId, userId), eq(userLocations.locationId, locationId)));
  }

  async getLocations(userId: string) {
    return db.select().from(userLocations)
      .where(and(eq(userLocations.userId, userId), sql`${userLocations.decertifiedAt} IS NULL`));
  }
}
