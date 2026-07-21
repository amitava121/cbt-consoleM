ALTER TABLE "topics" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "topics" CASCADE;--> statement-breakpoint
ALTER TABLE "questions" DROP CONSTRAINT "questions_topic_id_topics_id_fk";
--> statement-breakpoint
ALTER TABLE "questions" DROP CONSTRAINT "questions_approved_by_users_id_fk";
--> statement-breakpoint
DROP INDEX "idx_questions_topic_id";--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "subject_id" uuid;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "scheduled_start_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_exams_subject_id" ON "exams" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "idx_exams_batch_id" ON "exams" USING btree ("batch_id");--> statement-breakpoint
ALTER TABLE "questions" DROP COLUMN "topic_id";--> statement-breakpoint
ALTER TABLE "questions" DROP COLUMN "approved_by";--> statement-breakpoint
ALTER TABLE "questions" DROP COLUMN "approved_at";