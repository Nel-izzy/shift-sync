import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { db } from '../../database/db';
import { locations, managerLocations, userLocations, users } from '../../database/schema';
import { eq, and, sql } from 'drizzle-orm';

@Injectable()
export class LocationsService {
  async findAll(user: { id: string; role: string }) {
    if (user.role === 'admin') {
      return db.select().from(locations).where(eq(locations.isActive, true));
    }
    if (user.role === 'manager') {
      return db.select({ location: locations })
        .from(locations)
        .innerJoin(managerLocations, and(
          eq(managerLocations.locationId, locations.id),
          eq(managerLocations.userId, user.id),
        ))
        .where(eq(locations.isActive, true))
        .then(rows => rows.map(r => r.location));
    }
    // Staff: return locations they're certified at
    return db.select({ location: locations })
      .from(locations)
      .innerJoin(userLocations, and(
        eq(userLocations.locationId, locations.id),
        eq(userLocations.userId, user.id),
        sql`${userLocations.decertifiedAt} IS NULL`,
      ))
      .where(eq(locations.isActive, true))
      .then(rows => rows.map(r => r.location));
  }

  async findOne(id: string) {
    const [loc] = await db.select().from(locations).where(eq(locations.id, id)).limit(1);
    if (!loc) throw new NotFoundException('Location not found');
    return loc;
  }

  async getStaff(locationId: string) {
    return db.select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      skills: users.skills,
      desiredHoursPerWeek: users.desiredHoursPerWeek,
      certifiedAt: userLocations.certifiedAt,
    })
      .from(userLocations)
      .innerJoin(users, eq(userLocations.userId, users.id))
      .where(and(
        eq(userLocations.locationId, locationId),
        sql`${userLocations.decertifiedAt} IS NULL`,
        eq(users.isActive, true),
      ));
  }

  async assertManagerAccess(managerId: string, locationId: string) {
    const [row] = await db.select().from(managerLocations)
      .where(and(eq(managerLocations.userId, managerId), eq(managerLocations.locationId, locationId)))
      .limit(1);
    if (!row) throw new ForbiddenException('You do not manage this location');
  }
}
