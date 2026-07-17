import {
    index,
    jsonb,
    pgTable,
    text,
    timestamp,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";
import { auditActionEnum, deviceStatusEnum } from "./enums.js";
import { centers, users } from "./organizational.js";

export const deviceRegistrations = pgTable(
  "device_registrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: varchar("device_id", { length: 255 }).notNull().unique(),
    deviceName: varchar("device_name", { length: 255 }),
    macAddress: varchar("mac_address", { length: 17 }).notNull(),
    hardwareHash: varchar("hardware_hash", { length: 255 }).notNull(),
    ipAddress: varchar("ip_address", { length: 45 }),
    centerId: uuid("center_id").references(() => centers.id),
    status: deviceStatusEnum("status").notNull().default("registered"),
    registeredBy: uuid("registered_by")
      .notNull()
      .references(() => users.id),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_device_registrations_center_id").on(table.centerId),
    index("idx_device_registrations_status").on(table.status),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    action: auditActionEnum("action").notNull(),
    resourceType: varchar("resource_type", { length: 100 }).notNull(),
    resourceId: uuid("resource_id"),
    oldValueJson: jsonb("old_value_json"),
    newValueJson: jsonb("new_value_json"),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    timestamp: timestamp("timestamp", { withTimezone: true })
      .notNull()
      .defaultNow(),
    prevHash: varchar("prev_hash", { length: 64 }),
    currentHash: varchar("current_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_audit_logs_user_id").on(table.userId),
    index("idx_audit_logs_resource").on(table.resourceType, table.resourceId),
    index("idx_audit_logs_timestamp").on(table.timestamp),
  ],
);
