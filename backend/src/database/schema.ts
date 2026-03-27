import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  pgEnum,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const userRoleEnum = pgEnum('user_role', ['admin', 'manager', 'staff']);
export const swapStatusEnum = pgEnum('swap_status', ['pending', 'accepted', 'approved', 'rejected', 'cancelled', 'expired']);
export const notificationTypeEnum = pgEnum('notification_type', [
  'shift_assigned', 'shift_changed', 'shift_published', 'swap_requested',
  'swap_accepted', 'swap_approved', 'swap_rejected', 'swap_cancelled',
  'drop_requested', 'drop_claimed', 'overtime_warning', 'availability_changed',
]);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  role: userRoleEnum('role').notNull().default('staff'),
  skills: text('skills')
  .array()
  .notNull()
  .default(sql`'{}'::text[]`),
  desiredHoursPerWeek: integer('desired_hours_per_week').default(40),
  notifyInApp: boolean('notify_in_app').notNull().default(true),
  notifyEmail: boolean('notify_email').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const locations = pgTable('locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  address: varchar('address', { length: 500 }),
  timezone: varchar('timezone', { length: 100 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Staff certified at locations
export const userLocations = pgTable('user_locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  locationId: uuid('location_id').notNull().references(() => locations.id, { onDelete: 'cascade' }),
  certifiedAt: timestamp('certified_at', { withTimezone: true }).notNull().defaultNow(),
  decertifiedAt: timestamp('decertified_at', { withTimezone: true }),
}, (t) => ({
  uniq: uniqueIndex('user_location_uniq').on(t.userId, t.locationId),
}));

// Manager assigned to locations
export const managerLocations = pgTable('manager_locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  locationId: uuid('location_id').notNull().references(() => locations.id, { onDelete: 'cascade' }),
}, (t) => ({
  uniq: uniqueIndex('manager_location_uniq').on(t.userId, t.locationId),
}));

// Weekly recurring availability (day 0=Sun..6=Sat)
export const availability = pgTable('availability', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  dayOfWeek: integer('day_of_week').notNull(), // 0-6
  startTime: varchar('start_time', { length: 5 }).notNull(), // HH:MM
  endTime: varchar('end_time', { length: 5 }).notNull(), // HH:MM
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// One-off availability exceptions
export const availabilityExceptions = pgTable('availability_exceptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  date: varchar('date', { length: 10 }).notNull(), // YYYY-MM-DD
  isAvailable: boolean('is_available').notNull().default(false),
  startTime: varchar('start_time', { length: 5 }), // HH:MM if available
  endTime: varchar('end_time', { length: 5 }), // HH:MM if available
  reason: varchar('reason', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const shifts = pgTable('shifts', {
  id: uuid('id').primaryKey().defaultRandom(),
  locationId: uuid('location_id').notNull().references(() => locations.id),
  requiredSkill: varchar('required_skill', { length: 100 }).notNull(),
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }).notNull(),
  headcount: integer('headcount').notNull().default(1),
  isPublished: boolean('is_published').notNull().default(false),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  isPremium: boolean('is_premium').notNull().default(false), // Fri/Sat evening
  notes: text('notes'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  locationIdx: index('shift_location_idx').on(t.locationId),
  startTimeIdx: index('shift_start_time_idx').on(t.startTime),
}));

export const shiftAssignments = pgTable('shift_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  shiftId: uuid('shift_id').notNull().references(() => shifts.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  assignedBy: uuid('assigned_by').notNull().references(() => users.id),
}, (t) => ({
  uniq: uniqueIndex('shift_assignment_uniq').on(t.shiftId, t.userId),
  userIdx: index('assignment_user_idx').on(t.userId),
}));

export const swapRequests = pgTable('swap_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  requesterId: uuid('requester_id').notNull().references(() => users.id),
  requesterAssignmentId: uuid('requester_assignment_id').notNull().references(() => shiftAssignments.id),
  targetUserId: uuid('target_user_id').references(() => users.id), // null = drop request
  targetAssignmentId: uuid('target_assignment_id').references(() => shiftAssignments.id), // null = drop
  status: swapStatusEnum('status').notNull().default('pending'),
  managerApproverId: uuid('manager_approver_id').references(() => users.id),
  requesterNote: text('requester_note'),
  managerNote: text('manager_note'),
  expiresAt: timestamp('expires_at', { withTimezone: true }), // for drop requests
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: notificationTypeEnum('type').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message').notNull(),
  data: jsonb('data'),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('notification_user_idx').on(t.userId),
}));

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').references(() => users.id),
  actorEmail: varchar('actor_email', { length: 255 }),
  action: varchar('action', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 100 }).notNull(),
  entityId: uuid('entity_id'),
  before: jsonb('before'),
  after: jsonb('after'),
  locationId: uuid('location_id').references(() => locations.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  entityIdx: index('audit_entity_idx').on(t.entityType, t.entityId),
  locationIdx: index('audit_location_idx').on(t.locationId),
  createdAtIdx: index('audit_created_at_idx').on(t.createdAt),
}));

export type User = typeof users.$inferSelect;
export type Location = typeof locations.$inferSelect;
export type Shift = typeof shifts.$inferSelect;
export type ShiftAssignment = typeof shiftAssignments.$inferSelect;
export type SwapRequest = typeof swapRequests.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type Availability = typeof availability.$inferSelect;
export type AvailabilityException = typeof availabilityExceptions.$inferSelect;
