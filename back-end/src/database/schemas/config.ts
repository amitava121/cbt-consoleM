import {
    boolean,
    index,
    jsonb,
    pgTable,
    text,
    timestamp,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";
import { examBatches } from "./exam.js";
import { users } from "./organizational.js";

export const systemSettings = pgTable(
  "system_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: varchar("key", { length: 100 }).notNull().unique(),
    value: text("value").notNull(),
    valueType: varchar("value_type", { length: 20 }).notNull(),
    description: text("description"),
    isEditable: boolean("is_editable").notNull().default(true),
    updatedBy: uuid("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_system_settings_key").on(table.key)],
);

export const securityPolicies = pgTable(
  "security_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    policyName: varchar("policy_name", { length: 100 }).notNull().unique(),
    description: text("description"),
    settingsJson: jsonb("settings_json").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_security_policies_policy_name").on(table.policyName)],
);

export const proctoringConfigs = pgTable(
  "proctoring_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    examBatchId: uuid("exam_batch_id")
      .notNull()
      .references(() => examBatches.id)
      .unique(),
    enableAiProctoring: boolean("enable_ai_proctoring")
      .notNull()
      .default(false),
    enableWebcam: boolean("enable_webcam").notNull().default(false),
    enableScreenCapture: boolean("enable_screen_capture")
      .notNull()
      .default(false),
    sensitivityLevel: varchar("sensitivity_level", { length: 20 })
      .notNull()
      .default("medium"),
    settingsJson: jsonb("settings_json"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_proctoring_configs_exam_batch_id").on(table.examBatchId),
  ],
);
