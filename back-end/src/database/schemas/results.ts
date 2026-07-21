import {
    decimal,
    index,
    integer,
    jsonb,
    pgTable,
    timestamp,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";
import { examBatches } from "./exam.js";
import { attempts } from "./execution.js";
import { candidates } from "./organizational.js";

export const scores = pgTable(
  "scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id)
      .unique(),
    totalMarks: decimal("total_marks", { precision: 8, scale: 2 }).notNull(),
    marksObtained: decimal("marks_obtained", {
      precision: 8,
      scale: 2,
    }).notNull(),
    netScore: decimal("net_score", { precision: 8, scale: 2 }).notNull(),
    sectionScoresJson: jsonb("section_scores_json"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_scores_attempt_id").on(table.attemptId)],
);

export const scorecards = pgTable(
  "scorecards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id)
      .unique(),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id),
    rank: integer("rank"),
    percentile: decimal("percentile", { precision: 6, scale: 3 }),
    totalScore: decimal("total_score", { precision: 8, scale: 2 }).notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    pdfUrl: varchar("pdf_url", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_scorecards_candidate_id").on(table.candidateId)],
);

export const analyticsSnapshots = pgTable(
  "analytics_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    examBatchId: uuid("exam_batch_id")
      .notNull()
      .references(() => examBatches.id),
    snapshotJson: jsonb("snapshot_json").notNull(),
    snapshotType: varchar("snapshot_type", { length: 20 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_analytics_snapshots_exam_batch_id").on(table.examBatchId),
  ],
);

export const certificates = pgTable(
  "certificates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id),
    certificateNumber: varchar("certificate_number", { length: 50 })
      .notNull()
      .unique(),
    templateId: uuid("template_id"),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    pdfUrl: varchar("pdf_url", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_certificates_attempt_id").on(table.attemptId)],
);
