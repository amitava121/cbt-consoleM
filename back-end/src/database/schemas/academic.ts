import {
    boolean,
    decimal,
    index,
    integer,
    jsonb,
    pgTable,
    text,
    timestamp,
    unique,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";
import {
    cognitiveLevelEnum,
    difficultyLevelEnum,
    questionTypeEnum,
} from "./enums.js";
import { users } from "./organizational.js";

export const subjects = pgTable("subjects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const topics = pgTable(
  "topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    parentTopicId: uuid("parent_topic_id"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_topics_subject_id").on(table.subjectId),
    index("idx_topics_parent_topic_id").on(table.parentTopicId),
  ],
);

export const questionBanks = pgTable(
  "question_banks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
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
  (table) => [index("idx_question_banks_created_by").on(table.createdBy)],
);

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionBankId: uuid("question_bank_id")
      .notNull()
      .references(() => questionBanks.id),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id),
    topicId: uuid("topic_id").references(() => topics.id),
    type: questionTypeEnum("type").notNull(),
    difficulty: difficultyLevelEnum("difficulty").notNull().default("medium"),
    cognitiveLevel: cognitiveLevelEnum("cognitive_level"),
    marks: decimal("marks", { precision: 6, scale: 2 }).notNull(),
    negativeMarks: decimal("negative_marks", { precision: 6, scale: 2 })
      .notNull()
      .default("0"),
    estimatedTimeSecs: integer("estimated_time_secs"),
    contentJson: jsonb("content_json").notNull(),
    mediaUrlsJson: jsonb("media_urls_json"),
    solutionJson: jsonb("solution_json"),
    isActive: boolean("is_active").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    usageCount: integer("usage_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_questions_question_bank_id").on(table.questionBankId),
    index("idx_questions_subject_id").on(table.subjectId),
    index("idx_questions_topic_id").on(table.topicId),
    index("idx_questions_type").on(table.type),
    index("idx_questions_difficulty").on(table.difficulty),
  ],
);

export const questionOptions = pgTable(
  "question_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id),
    optionText: text("option_text").notNull(),
    optionMediaUrl: varchar("option_media_url", { length: 500 }),
    isCorrect: boolean("is_correct").notNull(),
    displayOrder: integer("display_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_question_options_question_id").on(table.questionId)],
);

export const questionTags = pgTable(
  "question_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id),
    tag: varchar("tag", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("uq_question_tags_question_tag").on(table.questionId, table.tag),
    index("idx_question_tags_tag").on(table.tag),
  ],
);

export const questionVersions = pgTable(
  "question_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id),
    versionNumber: integer("version_number").notNull(),
    contentJson: jsonb("content_json").notNull(),
    changedBy: uuid("changed_by")
      .notNull()
      .references(() => users.id),
    changeReason: text("change_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("uq_question_versions_question_version").on(
      table.questionId,
      table.versionNumber,
    ),
    index("idx_question_versions_question_id").on(table.questionId),
  ],
);
