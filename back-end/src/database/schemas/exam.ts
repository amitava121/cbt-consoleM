import {
    boolean,
    decimal,
    index,
    integer,
    jsonb,
    pgTable,
    text,
    timestamp,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";
import { questions } from "./academic.js";
import {
    examStatusEnum,
    navigationModeEnum,
    selectionStrategyEnum,
} from "./enums.js";
import { batches, centers, users } from "./organizational.js";

export const exams = pgTable(
  "exams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    code: varchar("code", { length: 50 }).notNull().unique(),
    durationMinutes: integer("duration_minutes").notNull(),
    totalMarks: decimal("total_marks", { precision: 8, scale: 2 }).notNull(),
    passingMarks: decimal("passing_marks", { precision: 8, scale: 2 }),
    hasNegativeMarking: boolean("has_negative_marking")
      .notNull()
      .default(false),
    selectionStrategy: selectionStrategyEnum("selection_strategy")
      .notNull()
      .default("static"),
    navigationMode: navigationModeEnum("navigation_mode")
      .notNull()
      .default("free"),
    shuffleQuestions: boolean("shuffle_questions").notNull().default(false),
    shuffleOptions: boolean("shuffle_options").notNull().default(false),
    instructionsJson: jsonb("instructions_json"),
    resultVisibility: varchar("result_visibility", { length: 20 })
      .notNull()
      .default("delayed"),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_exams_created_by").on(table.createdBy)],
);

export const examSections = pgTable(
  "exam_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id),
    name: varchar("name", { length: 255 }).notNull(),
    sectionOrder: integer("section_order").notNull(),
    durationMinutes: integer("duration_minutes"),
    totalMarks: decimal("total_marks", { precision: 8, scale: 2 }).notNull(),
    negativeMarkingPercentage: decimal("negative_marking_percentage", {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default("0"),
    questionCount: integer("question_count").notNull(),
    navigationMode: navigationModeEnum("navigation_mode"),
    shuffleQuestions: boolean("shuffle_questions").notNull().default(false),
    shuffleOptions: boolean("shuffle_options").notNull().default(false),
    instructionsJson: jsonb("instructions_json"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_exam_sections_exam_id").on(table.examId)],
);

export const examQuestions = pgTable(
  "exam_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    examSectionId: uuid("exam_section_id")
      .notNull()
      .references(() => examSections.id),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id),
    displayOrder: integer("display_order").notNull(),
    marks: decimal("marks", { precision: 6, scale: 2 }).notNull(),
    negativeMarks: decimal("negative_marks", { precision: 6, scale: 2 })
      .notNull()
      .default("0"),
    isOptional: boolean("is_optional").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_exam_questions_exam_section_id").on(table.examSectionId),
    index("idx_exam_questions_question_id").on(table.questionId),
  ],
);

export const examBatches = pgTable(
  "exam_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id),
    batchId: uuid("batch_id").references(() => batches.id),
    centerId: uuid("center_id").references(() => centers.id),
    name: varchar("name", { length: 255 }).notNull(),
    status: examStatusEnum("status").notNull().default("draft"),
    shiftNumber: integer("shift_number").notNull().default(1),
    scheduledStartAt: timestamp("scheduled_start_at", {
      withTimezone: true,
    }).notNull(),
    scheduledEndAt: timestamp("scheduled_end_at", {
      withTimezone: true,
    }).notNull(),
    actualStartAt: timestamp("actual_start_at", { withTimezone: true }),
    actualEndAt: timestamp("actual_end_at", { withTimezone: true }),
    gracePeriodMinutes: integer("grace_period_minutes").notNull().default(5),
    instructionsJson: jsonb("instructions_json"),
    settingsJson: jsonb("settings_json"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_exam_batches_exam_id").on(table.examId),
    index("idx_exam_batches_batch_id").on(table.batchId),
    index("idx_exam_batches_center_id").on(table.centerId),
    index("idx_exam_batches_status").on(table.status),
  ],
);

export const examSchedules = pgTable(
  "exam_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    examBatchId: uuid("exam_batch_id")
      .notNull()
      .references(() => examBatches.id),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_exam_schedules_exam_batch_id").on(table.examBatchId)],
);
