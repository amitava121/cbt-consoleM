DROP TABLE "exam_schedules" CASCADE;--> statement-breakpoint
ALTER TABLE "questions" DROP COLUMN "marks";--> statement-breakpoint
ALTER TABLE "questions" DROP COLUMN "negative_marks";--> statement-breakpoint
ALTER TABLE "questions" DROP COLUMN "estimated_time_secs";--> statement-breakpoint
ALTER TABLE "exam_batches" DROP COLUMN "shift_number";--> statement-breakpoint
ALTER TABLE "exam_questions" DROP COLUMN "marks";--> statement-breakpoint
ALTER TABLE "exam_questions" DROP COLUMN "negative_marks";--> statement-breakpoint
ALTER TABLE "exam_sections" DROP COLUMN "negative_marking_percentage";--> statement-breakpoint
ALTER TABLE "exams" DROP COLUMN "passing_marks";--> statement-breakpoint
ALTER TABLE "exams" DROP COLUMN "has_negative_marking";--> statement-breakpoint
ALTER TABLE "batches" DROP COLUMN "is_active";--> statement-breakpoint
ALTER TABLE "institutions" DROP COLUMN "is_active";--> statement-breakpoint
ALTER TABLE "scores" DROP COLUMN "negative_marks";--> statement-breakpoint
ALTER TABLE "scores" DROP COLUMN "is_passed";