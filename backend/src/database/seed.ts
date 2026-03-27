import 'reflect-metadata';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as bcrypt from 'bcrypt';
import * as schema from './schema';
import { addDays, startOfWeek, setHours, setMinutes } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://shiftsync:shiftsync@localhost:5432/shiftsync';

async function seed() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool, { schema });

  console.log('🌱 Seeding database...');

  // Clear existing data
  await pool.query('TRUNCATE audit_logs, notifications, swap_requests, shift_assignments, shifts, availability_exceptions, availability, manager_locations, user_locations, locations, users CASCADE');

  const hash = (pw: string) => bcrypt.hashSync(pw, 10);

  // --- Users ---
  const [admin] = await db.insert(schema.users).values({
    email: 'admin@coastaleats.com',
    passwordHash: hash('Admin123!'),
    firstName: 'Corporate',
    lastName: 'Admin',
    role: 'admin',
    skills: ['management'],
    desiredHoursPerWeek: 40,
  }).returning();

  const [managerWest] = await db.insert(schema.users).values({
    email: 'manager.west@coastaleats.com',
    passwordHash: hash('Manager123!'),
    firstName: 'Diana',
    lastName: 'Chen',
    role: 'manager',
    skills: ['management'],
    desiredHoursPerWeek: 40,
  }).returning();

  const [managerEast] = await db.insert(schema.users).values({
    email: 'manager.east@coastaleats.com',
    passwordHash: hash('Manager123!'),
    firstName: 'Marcus',
    lastName: 'Webb',
    role: 'manager',
    skills: ['management'],
    desiredHoursPerWeek: 40,
  }).returning();

  // Staff
  const staffData = [
    { email: 'sarah.jones@coastaleats.com', firstName: 'Sarah', lastName: 'Jones', skills: ['bartender', 'server'], desired: 30 },
    { email: 'john.smith@coastaleats.com', firstName: 'John', lastName: 'Smith', skills: ['bartender', 'line cook'], desired: 40 },
    { email: 'maria.garcia@coastaleats.com', firstName: 'Maria', lastName: 'Garcia', skills: ['server', 'host'], desired: 35 },
    { email: 'james.lee@coastaleats.com', firstName: 'James', lastName: 'Lee', skills: ['line cook'], desired: 40 },
    { email: 'aisha.patel@coastaleats.com', firstName: 'Aisha', lastName: 'Patel', skills: ['bartender', 'server', 'host'], desired: 25 },
    { email: 'carlos.mendez@coastaleats.com', firstName: 'Carlos', lastName: 'Mendez', skills: ['line cook', 'server'], desired: 40 },
    { email: 'emily.watson@coastaleats.com', firstName: 'Emily', lastName: 'Watson', skills: ['server', 'host'], desired: 20 },
    { email: 'tyler.brooks@coastaleats.com', firstName: 'Tyler', lastName: 'Brooks', skills: ['bartender'], desired: 32 },
  ];

  const staffUsers = await db.insert(schema.users).values(
    staffData.map(s => ({
      email: s.email,
      passwordHash: hash('Staff123!'),
      firstName: s.firstName,
      lastName: s.lastName,
      role: 'staff' as const,
      skills: s.skills,
      desiredHoursPerWeek: s.desired,
    }))
  ).returning();

  const [sarah, john, maria, james, aisha, carlos, emily, tyler] = staffUsers;

  // --- Locations ---
  const [locationLA] = await db.insert(schema.locations).values({
    name: 'Coastal Eats - Los Angeles',
    address: '1234 Sunset Blvd, Los Angeles, CA 90028',
    timezone: 'America/Los_Angeles',
  }).returning();

  const [locationSD] = await db.insert(schema.locations).values({
    name: 'Coastal Eats - San Diego',
    address: '567 Harbor Dr, San Diego, CA 92101',
    timezone: 'America/Los_Angeles',
  }).returning();

  const [locationNY] = await db.insert(schema.locations).values({
    name: 'Coastal Eats - New York',
    address: '890 5th Avenue, New York, NY 10022',
    timezone: 'America/New_York',
  }).returning();

  const [locationMIA] = await db.insert(schema.locations).values({
    name: 'Coastal Eats - Miami',
    address: '321 Ocean Drive, Miami Beach, FL 33139',
    timezone: 'America/New_York',
  }).returning();

  // --- Manager assignments ---
  await db.insert(schema.managerLocations).values([
    { userId: managerWest.id, locationId: locationLA.id },
    { userId: managerWest.id, locationId: locationSD.id },
    { userId: managerEast.id, locationId: locationNY.id },
    { userId: managerEast.id, locationId: locationMIA.id },
  ]);

  // --- Staff certifications ---
  await db.insert(schema.userLocations).values([
    // Sarah: LA + NY (cross-timezone scenario)
    { userId: sarah.id, locationId: locationLA.id },
    { userId: sarah.id, locationId: locationNY.id },
    // John: LA + SD
    { userId: john.id, locationId: locationLA.id },
    { userId: john.id, locationId: locationSD.id },
    // Maria: LA only
    { userId: maria.id, locationId: locationLA.id },
    // James: NY + Miami
    { userId: james.id, locationId: locationNY.id },
    { userId: james.id, locationId: locationMIA.id },
    // Aisha: all locations (experienced)
    { userId: aisha.id, locationId: locationLA.id },
    { userId: aisha.id, locationId: locationSD.id },
    { userId: aisha.id, locationId: locationNY.id },
    { userId: aisha.id, locationId: locationMIA.id },
    // Carlos: SD + Miami
    { userId: carlos.id, locationId: locationSD.id },
    { userId: carlos.id, locationId: locationMIA.id },
    // Emily: NY only
    { userId: emily.id, locationId: locationNY.id },
    // Tyler: LA + SD
    { userId: tyler.id, locationId: locationLA.id },
    { userId: tyler.id, locationId: locationSD.id },
  ]);

  // --- Availability ---
  const availRecords = [];
  // Sarah: 9am-5pm every day (timezone tangle scenario)
  for (let d = 0; d <= 6; d++) {
    availRecords.push({ userId: sarah.id, dayOfWeek: d, startTime: '09:00', endTime: '17:00' });
  }
  // John: Mon-Sat 6am-10pm
  for (let d = 1; d <= 6; d++) {
    availRecords.push({ userId: john.id, dayOfWeek: d, startTime: '06:00', endTime: '22:00' });
  }
  // Maria: Mon-Fri 10am-8pm
  for (let d = 1; d <= 5; d++) {
    availRecords.push({ userId: maria.id, dayOfWeek: d, startTime: '10:00', endTime: '20:00' });
  }
  // James: All days 2pm-midnight
  for (let d = 0; d <= 6; d++) {
    availRecords.push({ userId: james.id, dayOfWeek: d, startTime: '14:00', endTime: '23:59' });
  }
  // Aisha: All days open
  for (let d = 0; d <= 6; d++) {
    availRecords.push({ userId: aisha.id, dayOfWeek: d, startTime: '08:00', endTime: '23:59' });
  }
  // Carlos: Wed-Sun 3pm-2am
  for (let d = 0; d <= 6; d++) {
    if (d === 3 || d === 4 || d === 5 || d === 6 || d === 0) {
      availRecords.push({ userId: carlos.id, dayOfWeek: d, startTime: '15:00', endTime: '23:59' });
    }
  }
  // Emily: Mon-Thu only
  for (let d = 1; d <= 4; d++) {
    availRecords.push({ userId: emily.id, dayOfWeek: d, startTime: '10:00', endTime: '18:00' });
  }
  // Tyler: Tue-Sun evenings
  for (let d = 2; d <= 6; d++) {
    availRecords.push({ userId: tyler.id, dayOfWeek: d, startTime: '16:00', endTime: '23:59' });
  }
  availRecords.push({ userId: tyler.id, dayOfWeek: 0, startTime: '14:00', endTime: '23:59' });

  await db.insert(schema.availability).values(availRecords);

  // --- Shifts for current week ---
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday

  const makeShiftTime = (tz: string, daysOffset: number, hour: number, minute = 0) => {
    const localDate = addDays(weekStart, daysOffset);
    const localWithTime = setMinutes(setHours(localDate, hour), minute);
    return fromZonedTime(localWithTime, tz);
  };

  const laShifts = await db.insert(schema.shifts).values([
    // Mon lunch
    {
      locationId: locationLA.id, requiredSkill: 'server', headcount: 2,
      startTime: makeShiftTime('America/Los_Angeles', 0, 11),
      endTime: makeShiftTime('America/Los_Angeles', 0, 15),
      isPublished: true, publishedAt: new Date(), createdBy: managerWest.id,
    },
    // Mon dinner
    {
      locationId: locationLA.id, requiredSkill: 'bartender', headcount: 1,
      startTime: makeShiftTime('America/Los_Angeles', 0, 17),
      endTime: makeShiftTime('America/Los_Angeles', 0, 23),
      isPublished: true, publishedAt: new Date(), createdBy: managerWest.id,
    },
    // Fri evening (premium)
    {
      locationId: locationLA.id, requiredSkill: 'bartender', headcount: 2,
      startTime: makeShiftTime('America/Los_Angeles', 4, 18),
      endTime: makeShiftTime('America/Los_Angeles', 5, 2), // overnight
      isPublished: true, publishedAt: new Date(), isPremium: true, createdBy: managerWest.id,
    },
    // Sat evening (premium)
    {
      locationId: locationLA.id, requiredSkill: 'server', headcount: 3,
      startTime: makeShiftTime('America/Los_Angeles', 5, 18),
      endTime: makeShiftTime('America/Los_Angeles', 5, 23),
      isPublished: true, publishedAt: new Date(), isPremium: true, createdBy: managerWest.id,
    },
    // Tue line cook
    {
      locationId: locationLA.id, requiredSkill: 'line cook', headcount: 1,
      startTime: makeShiftTime('America/Los_Angeles', 1, 10),
      endTime: makeShiftTime('America/Los_Angeles', 1, 18),
      isPublished: true, publishedAt: new Date(), createdBy: managerWest.id,
    },
  ]).returning();

  const nyShifts = await db.insert(schema.shifts).values([
    // Mon evening NY
    {
      locationId: locationNY.id, requiredSkill: 'server', headcount: 2,
      startTime: makeShiftTime('America/New_York', 0, 17),
      endTime: makeShiftTime('America/New_York', 0, 23),
      isPublished: true, publishedAt: new Date(), createdBy: managerEast.id,
    },
    // Sat evening NY (premium)
    {
      locationId: locationNY.id, requiredSkill: 'bartender', headcount: 1,
      startTime: makeShiftTime('America/New_York', 5, 19),
      endTime: makeShiftTime('America/New_York', 6, 1),
      isPublished: true, publishedAt: new Date(), isPremium: true, createdBy: managerEast.id,
    },
    // Wed line cook NY
    {
      locationId: locationNY.id, requiredSkill: 'line cook', headcount: 1,
      startTime: makeShiftTime('America/New_York', 2, 14),
      endTime: makeShiftTime('America/New_York', 2, 22),
      isPublished: true, publishedAt: new Date(), createdBy: managerEast.id,
    },
  ]).returning();

  // --- Assignments ---
  await db.insert(schema.shiftAssignments).values([
    { shiftId: laShifts[0].id, userId: maria.id, assignedBy: managerWest.id },
    { shiftId: laShifts[0].id, userId: emily.id, assignedBy: managerWest.id },
    { shiftId: laShifts[1].id, userId: tyler.id, assignedBy: managerWest.id },
    { shiftId: laShifts[2].id, userId: john.id, assignedBy: managerWest.id },
    { shiftId: laShifts[3].id, userId: aisha.id, assignedBy: managerWest.id },
    { shiftId: laShifts[4].id, userId: james.id, assignedBy: managerWest.id },
    { shiftId: nyShifts[0].id, userId: sarah.id, assignedBy: managerEast.id },
    { shiftId: nyShifts[2].id, userId: james.id, assignedBy: managerEast.id },
  ]);

  // Overtime scenario: John already has many hours this week
  const overtimeShifts = await db.insert(schema.shifts).values([
    {
      locationId: locationSD.id, requiredSkill: 'bartender', headcount: 1,
      startTime: makeShiftTime('America/Los_Angeles', 1, 8),
      endTime: makeShiftTime('America/Los_Angeles', 1, 16),
      isPublished: true, publishedAt: new Date(), createdBy: managerWest.id,
    },
    {
      locationId: locationSD.id, requiredSkill: 'bartender', headcount: 1,
      startTime: makeShiftTime('America/Los_Angeles', 2, 8),
      endTime: makeShiftTime('America/Los_Angeles', 2, 16),
      isPublished: true, publishedAt: new Date(), createdBy: managerWest.id,
    },
    {
      locationId: locationSD.id, requiredSkill: 'bartender', headcount: 1,
      startTime: makeShiftTime('America/Los_Angeles', 3, 8),
      endTime: makeShiftTime('America/Los_Angeles', 3, 16),
      isPublished: true, publishedAt: new Date(), createdBy: managerWest.id,
    },
    {
      locationId: locationSD.id, requiredSkill: 'line cook', headcount: 1,
      startTime: makeShiftTime('America/Los_Angeles', 4, 9),
      endTime: makeShiftTime('America/Los_Angeles', 4, 17),
      isPublished: false, createdBy: managerWest.id,
    },
  ]).returning();

  // John already has ~32hrs this week before Friday
  await db.insert(schema.shiftAssignments).values([
    { shiftId: overtimeShifts[0].id, userId: john.id, assignedBy: managerWest.id },
    { shiftId: overtimeShifts[1].id, userId: john.id, assignedBy: managerWest.id },
    { shiftId: overtimeShifts[2].id, userId: john.id, assignedBy: managerWest.id },
  ]);

  // Audit log entries
  await db.insert(schema.auditLogs).values([
    {
      actorId: managerWest.id,
      actorEmail: managerWest.email,
      action: 'PUBLISH_SCHEDULE',
      entityType: 'location',
      entityId: locationLA.id,
      locationId: locationLA.id,
      after: { week: weekStart.toISOString(), shiftsPublished: laShifts.length },
    },
    {
      actorId: managerEast.id,
      actorEmail: managerEast.email,
      action: 'PUBLISH_SCHEDULE',
      entityType: 'location',
      entityId: locationNY.id,
      locationId: locationNY.id,
      after: { week: weekStart.toISOString(), shiftsPublished: nyShifts.length },
    },
  ]);

  console.log('✅ Seed complete!');
  console.log('\n📋 Login credentials:');
  console.log('  admin@coastaleats.com       / Admin123!');
  console.log('  manager.west@coastaleats.com / Manager123!  (LA + SD)');
  console.log('  manager.east@coastaleats.com / Manager123!  (NY + Miami)');
  console.log('  sarah.jones@coastaleats.com  / Staff123!   (LA + NY, timezone tangle)');
  console.log('  john.smith@coastaleats.com   / Staff123!   (near overtime)');
  console.log('  aisha.patel@coastaleats.com  / Staff123!   (all locations)');

  await pool.end();
}

seed().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
