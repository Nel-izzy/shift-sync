import { Injectable, NotFoundException } from '@nestjs/common';
import {
  IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, Min,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { db } from '../../database/db';
import {
  users, userLocations, availability, availabilityExceptions, locations,
  shifts, shiftAssignments,
} from '../../database/schema';
import { eq, and, sql } from 'drizzle-orm';

export class AvailabilityWindowDto {
  @IsInt() dayOfWeek: number;
  @IsString() startTime: string;
  @IsString() endTime: string;
}

export class SetAvailabilityDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AvailabilityWindowDto)
  windows: AvailabilityWindowDto[];
}

export class SetExceptionDto {
  @IsString() date: string;
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean() isAvailable: boolean;
  @IsOptional() @IsString() startTime?: string;
  @IsOptional() @IsString() endTime?: string;
  @IsOptional() @IsString() reason?: string;
}

export class UpdateProfileDto {
  @IsOptional() @IsBoolean() notifyInApp?: boolean;
  @IsOptional() @IsBoolean() notifyEmail?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(80) desiredHoursPerWeek?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) skills?: string[];
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
    const update: any = { updatedAt: new Date() };
    if (dto.notifyInApp !== undefined) update.notifyInApp = dto.notifyInApp;
    if (dto.notifyEmail !== undefined) update.notifyEmail = dto.notifyEmail;
    if (dto.desiredHoursPerWeek !== undefined) update.desiredHoursPerWeek = dto.desiredHoursPerWeek;
    if (dto.skills !== undefined) update.skills = dto.skills;
    await db.update(users).set(update).where(eq(users.id, id));
    return this.findOne(id);
  }

  async getAvailability(userId: string) {
    const recurring = await db.select().from(availability)
      .where(eq(availability.userId, userId))
      .orderBy(availability.dayOfWeek);
    const exceptions = await db.select().from(availabilityExceptions)
      .where(eq(availabilityExceptions.userId, userId))
      .orderBy(availabilityExceptions.date);
    return { recurring, exceptions };
  }

  async setAvailability(userId: string, dto: SetAvailabilityDto) {
    await db.delete(availability).where(eq(availability.userId, userId));
    if (dto.windows && dto.windows.length > 0) {
      await db.insert(availability).values(
        dto.windows.map(w => ({
          userId,
          dayOfWeek: w.dayOfWeek,
          startTime: w.startTime,
          endTime: w.endTime,
        }))
      );
    }
    return this.getAvailability(userId);
  }

  async setException(userId: string, dto: SetExceptionDto) {
    // Upsert: delete existing exception for same date first
    await db.delete(availabilityExceptions)
      .where(and(
        eq(availabilityExceptions.userId, userId),
        eq(availabilityExceptions.date, dto.date),
      ));
    const [ex] = await db.insert(availabilityExceptions).values({
      userId,
      date: dto.date,
      isAvailable: dto.isAvailable,
      startTime: dto.isAvailable ? (dto.startTime ?? null) : null,
      endTime: dto.isAvailable ? (dto.endTime ?? null) : null,
      reason: dto.reason ?? null,
    }).returning();
    return ex;
  }

  async deleteException(userId: string, exceptionId: string) {
    await db.delete(availabilityExceptions)
      .where(and(
        eq(availabilityExceptions.id, exceptionId),
        eq(availabilityExceptions.userId, userId),
      ));
    return { deleted: true };
  }

  async getMyAssignments(userId: string) {
    return db.select({
      assignment: shiftAssignments,
      shift: shifts,
      location: locations,
    })
      .from(shiftAssignments)
      .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
      .innerJoin(locations, eq(shifts.locationId, locations.id))
      .where(and(
        eq(shiftAssignments.userId, userId),
        sql`${shifts.startTime} >= NOW()`,
      ))
      .orderBy(shifts.startTime);
  }

  async certifyAtLocation(userId: string, locationId: string) {
    await db.insert(userLocations).values({ userId, locationId })
      .onConflictDoNothing();
    return { userId, locationId, certified: true };
  }

  async decertifyFromLocation(userId: string, locationId: string) {
    await db.update(userLocations)
      .set({ decertifiedAt: new Date() })
      .where(and(
        eq(userLocations.userId, userId),
        eq(userLocations.locationId, locationId),
      ));
    return { userId, locationId, decertified: true };
  }

  async getUserLocations(userId: string) {
    return db.select({ location: locations, cert: userLocations })
      .from(userLocations)
      .innerJoin(locations, eq(userLocations.locationId, locations.id))
      .where(and(
        eq(userLocations.userId, userId),
        sql`${userLocations.decertifiedAt} IS NULL`,
      ));
  }
}
