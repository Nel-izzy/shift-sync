import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import { addDays, startOfWeek, setHours, setMinutes } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';

export async function runSeed(pool: Pool) {
  const hash = (pw: string) => bcrypt.hashSync(pw, 10);

  const q = (text: string, values?: any[]) => pool.query(text, values);

  // Users
  const adminId = (await q(
    `INSERT INTO users (email, password_hash, first_name, last_name, role, skills, desired_hours_per_week)
     VALUES ($1,$2,$3,$4,'admin','{management}',40) ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id`,
    ['admin@coastaleats.com', hash('Admin123!'), 'Corporate', 'Admin']
  )).rows[0].id;

  const mgrWestId = (await q(
    `INSERT INTO users (email, password_hash, first_name, last_name, role, skills)
     VALUES ($1,$2,'Diana','Chen','manager','{management}') ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id`,
    ['manager.west@coastaleats.com', hash('Manager123!')]
  )).rows[0].id;

  const mgrEastId = (await q(
    `INSERT INTO users (email, password_hash, first_name, last_name, role, skills)
     VALUES ($1,$2,'Marcus','Webb','manager','{management}') ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id`,
    ['manager.east@coastaleats.com', hash('Manager123!')]
  )).rows[0].id;

  const staffData = [
    ['sarah.jones@coastaleats.com', 'Sarah', 'Jones', '{bartender,server}', 30],
    ['john.smith@coastaleats.com', 'John', 'Smith', '{bartender,"line cook"}', 40],
    ['maria.garcia@coastaleats.com', 'Maria', 'Garcia', '{server,host}', 35],
    ['james.lee@coastaleats.com', 'James', 'Lee', '{"line cook"}', 40],
    ['aisha.patel@coastaleats.com', 'Aisha', 'Patel', '{bartender,server,host}', 25],
    ['carlos.mendez@coastaleats.com', 'Carlos', 'Mendez', '{"line cook",server}', 40],
    ['emily.watson@coastaleats.com', 'Emily', 'Watson', '{server,host}', 20],
    ['tyler.brooks@coastaleats.com', 'Tyler', 'Brooks', '{bartender}', 32],
  ];

  const staffIds: Record<string, string> = {};
  for (const [email, first, last, skills, desired] of staffData) {
    const row = await q(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, skills, desired_hours_per_week)
       VALUES ($1,$2,$3,$4,'staff',$5::text[],$6) ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id`,
      [email, hash('Staff123!'), first, last, skills, desired]
    );
    staffIds[email as string] = row.rows[0].id;
  }

  const [sarah, john, maria, james, aisha, carlos, emily, tyler] = [
    staffIds['sarah.jones@coastaleats.com'],
    staffIds['john.smith@coastaleats.com'],
    staffIds['maria.garcia@coastaleats.com'],
    staffIds['james.lee@coastaleats.com'],
    staffIds['aisha.patel@coastaleats.com'],
    staffIds['carlos.mendez@coastaleats.com'],
    staffIds['emily.watson@coastaleats.com'],
    staffIds['tyler.brooks@coastaleats.com'],
  ];

  // Locations
  const locLA = (await q(
    `INSERT INTO locations (name, address, timezone) VALUES ($1,$2,$3) RETURNING id`,
    ['Coastal Eats - Los Angeles', '1234 Sunset Blvd, Los Angeles, CA 90028', 'America/Los_Angeles']
  )).rows[0].id;

  const locSD = (await q(
    `INSERT INTO locations (name, address, timezone) VALUES ($1,$2,$3) RETURNING id`,
    ['Coastal Eats - San Diego', '567 Harbor Dr, San Diego, CA 92101', 'America/Los_Angeles']
  )).rows[0].id;

  const locNY = (await q(
    `INSERT INTO locations (name, address, timezone) VALUES ($1,$2,$3) RETURNING id`,
    ['Coastal Eats - New York', '890 5th Avenue, New York, NY 10022', 'America/New_York']
  )).rows[0].id;

  const locMIA = (await q(
    `INSERT INTO locations (name, address, timezone) VALUES ($1,$2,$3) RETURNING id`,
    ['Coastal Eats - Miami', '321 Ocean Drive, Miami Beach, FL 33139', 'America/New_York']
  )).rows[0].id;

  // Manager-location assignments
  for (const [uid, lid] of [[mgrWestId, locLA],[mgrWestId, locSD],[mgrEastId, locNY],[mgrEastId, locMIA]]) {
    await q(`INSERT INTO manager_locations (user_id, location_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [uid, lid]);
  }

  // Staff certifications
  const certs = [
    [sarah, locLA], [sarah, locNY],
    [john, locLA], [john, locSD],
    [maria, locLA],
    [james, locNY], [james, locMIA],
    [aisha, locLA], [aisha, locSD], [aisha, locNY], [aisha, locMIA],
    [carlos, locSD], [carlos, locMIA],
    [emily, locNY],
    [tyler, locLA], [tyler, locSD],
  ];
  for (const [uid, lid] of certs) {
    await q(`INSERT INTO user_locations (user_id, location_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [uid, lid]);
  }

  // Availability
  const avails: [string, number, string, string][] = [
    ...[0,1,2,3,4,5,6].map(d => [sarah, d, '09:00', '17:00'] as [string,number,string,string]),
    ...[1,2,3,4,5,6].map(d => [john, d, '06:00', '22:00'] as [string,number,string,string]),
    ...[1,2,3,4,5].map(d => [maria, d, '10:00', '20:00'] as [string,number,string,string]),
    ...[0,1,2,3,4,5,6].map(d => [james, d, '14:00', '23:59'] as [string,number,string,string]),
    ...[0,1,2,3,4,5,6].map(d => [aisha, d, '08:00', '23:59'] as [string,number,string,string]),
    ...[0,3,4,5,6].map(d => [carlos, d, '15:00', '23:59'] as [string,number,string,string]),
    ...[1,2,3,4].map(d => [emily, d, '10:00', '18:00'] as [string,number,string,string]),
    ...[0,2,3,4,5,6].map(d => [tyler, d, d === 0 ? '14:00' : '16:00', '23:59'] as [string,number,string,string]),
  ];
  for (const [uid, day, start, end] of avails) {
    await q(`INSERT INTO availability (user_id, day_of_week, start_time, end_time) VALUES ($1,$2,$3,$4)`, [uid, day, start, end]);
  }

  // Shifts for current week
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const mkTime = (tz: string, offset: number, hour: number, min = 0) => {
    const d = setMinutes(setHours(addDays(weekStart, offset), hour), min);
    return fromZonedTime(d, tz).toISOString();
  };
  const LA = 'America/Los_Angeles';
  const NY = 'America/New_York';

  // LA shifts
  const laShift1 = (await q(
    `INSERT INTO shifts (location_id, required_skill, start_time, end_time, headcount, is_published, published_at, created_by)
     VALUES ($1,'server',$2,$3,2,true,NOW(),$4) RETURNING id`,
    [locLA, mkTime(LA,0,11), mkTime(LA,0,15), mgrWestId]
  )).rows[0].id;

  const laShift2 = (await q(
    `INSERT INTO shifts (location_id, required_skill, start_time, end_time, headcount, is_published, published_at, created_by)
     VALUES ($1,'bartender',$2,$3,1,true,NOW(),$4) RETURNING id`,
    [locLA, mkTime(LA,0,17), mkTime(LA,0,23), mgrWestId]
  )).rows[0].id;

  const laShift3 = (await q(
    `INSERT INTO shifts (location_id, required_skill, start_time, end_time, headcount, is_published, published_at, is_premium, created_by)
     VALUES ($1,'bartender',$2,$3,2,true,NOW(),true,$4) RETURNING id`,
    [locLA, mkTime(LA,4,18), mkTime(LA,5,2), mgrWestId]
  )).rows[0].id;

  const laShift4 = (await q(
    `INSERT INTO shifts (location_id, required_skill, start_time, end_time, headcount, is_published, published_at, is_premium, created_by)
     VALUES ($1,'server',$2,$3,3,true,NOW(),true,$4) RETURNING id`,
    [locLA, mkTime(LA,5,18), mkTime(LA,5,23), mgrWestId]
  )).rows[0].id;

  const laShift5 = (await q(
    `INSERT INTO shifts (location_id, required_skill, start_time, end_time, headcount, is_published, published_at, created_by)
     VALUES ($1,'line cook',$2,$3,1,true,NOW(),$4) RETURNING id`,
    [locLA, mkTime(LA,1,10), mkTime(LA,1,18), mgrWestId]
  )).rows[0].id;

  // NY shifts
  const nyShift1 = (await q(
    `INSERT INTO shifts (location_id, required_skill, start_time, end_time, headcount, is_published, published_at, created_by)
     VALUES ($1,'server',$2,$3,2,true,NOW(),$4) RETURNING id`,
    [locNY, mkTime(NY,0,17), mkTime(NY,0,23), mgrEastId]
  )).rows[0].id;

  const nyShift2 = (await q(
    `INSERT INTO shifts (location_id, required_skill, start_time, end_time, headcount, is_published, published_at, is_premium, created_by)
     VALUES ($1,'bartender',$2,$3,1,true,NOW(),true,$4) RETURNING id`,
    [locNY, mkTime(NY,5,19), mkTime(NY,6,1), mgrEastId]
  )).rows[0].id;

  const nyShift3 = (await q(
    `INSERT INTO shifts (location_id, required_skill, start_time, end_time, headcount, is_published, published_at, created_by)
     VALUES ($1,'line cook',$2,$3,1,true,NOW(),$4) RETURNING id`,
    [locNY, mkTime(NY,2,14), mkTime(NY,2,22), mgrEastId]
  )).rows[0].id;

  // SD shifts (overtime scenario - John already has 24h)
  const sdShift1 = (await q(
    `INSERT INTO shifts (location_id, required_skill, start_time, end_time, headcount, is_published, published_at, created_by)
     VALUES ($1,'bartender',$2,$3,1,true,NOW(),$4) RETURNING id`,
    [locSD, mkTime(LA,1,8), mkTime(LA,1,16), mgrWestId]
  )).rows[0].id;

  const sdShift2 = (await q(
    `INSERT INTO shifts (location_id, required_skill, start_time, end_time, headcount, is_published, published_at, created_by)
     VALUES ($1,'bartender',$2,$3,1,true,NOW(),$4) RETURNING id`,
    [locSD, mkTime(LA,2,8), mkTime(LA,2,16), mgrWestId]
  )).rows[0].id;

  const sdShift3 = (await q(
    `INSERT INTO shifts (location_id, required_skill, start_time, end_time, headcount, is_published, published_at, created_by)
     VALUES ($1,'bartender',$2,$3,1,true,NOW(),$4) RETURNING id`,
    [locSD, mkTime(LA,3,8), mkTime(LA,3,16), mgrWestId]
  )).rows[0].id;

  // Assignments
  const assignments: [string, string, string][] = [
    [laShift1, maria, mgrWestId],
    [laShift1, emily, mgrWestId],
    [laShift2, tyler, mgrWestId],
    [laShift3, john, mgrWestId],
    [laShift4, aisha, mgrWestId],
    [laShift5, james, mgrWestId],
    [nyShift1, sarah, mgrEastId],
    [nyShift3, james, mgrEastId],
    [sdShift1, john, mgrWestId],
    [sdShift2, john, mgrWestId],
    [sdShift3, john, mgrWestId],
  ];

  for (const [shiftId, userId, assignedBy] of assignments) {
    await q(
      `INSERT INTO shift_assignments (shift_id, user_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [shiftId, userId, assignedBy]
    );
  }

  // Audit entries
  await q(
    `INSERT INTO audit_logs (actor_id, actor_email, action, entity_type, entity_id, location_id, after)
     VALUES ($1,$2,'PUBLISH_SCHEDULE','location',$3,$4,$5)`,
    [mgrWestId, 'manager.west@coastaleats.com', locLA, locLA, JSON.stringify({ note: 'Initial seed' })]
  );
}
