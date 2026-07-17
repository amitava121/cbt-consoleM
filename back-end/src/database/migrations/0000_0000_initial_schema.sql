CREATE TYPE "public"."answer_status" AS ENUM('not_visited', 'visited', 'answered', 'marked_for_review', 'answered_and_marked');--> statement-breakpoint
CREATE TYPE "public"."attempt_status" AS ENUM('not_started', 'in_progress', 'paused', 'submitted', 'auto_submitted', 'force_submitted', 'terminated', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('create', 'read', 'update', 'delete', 'login', 'logout', 'export', 'import', 'publish', 'activate', 'pause', 'resume', 'submit', 'terminate', 'grade', 'config_change');--> statement-breakpoint
CREATE TYPE "public"."cognitive_level" AS ENUM('remember', 'understand', 'apply', 'analyze', 'evaluate', 'create');--> statement-breakpoint
CREATE TYPE "public"."device_status" AS ENUM('registered', 'active', 'suspended', 'decommissioned');--> statement-breakpoint
CREATE TYPE "public"."difficulty_level" AS ENUM('easy', 'medium', 'hard', 'very_hard');--> statement-breakpoint
CREATE TYPE "public"."exam_status" AS ENUM('draft', 'scheduled', 'published', 'active', 'paused', 'submission_window', 'finished', 'results_published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."navigation_mode" AS ENUM('free', 'linear', 'section_free');--> statement-breakpoint
CREATE TYPE "public"."proctoring_action" AS ENUM('warn', 'pause', 'terminate', 'message', 'dismiss');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('mcq_single', 'mcq_multiple', 'fill_in_blank', 'essay', 'true_false', 'matching', 'assertion_reason', 'comprehension', 'drag_drop', 'image_based', 'audio_video', 'numerical', 'matrix_match');--> statement-breakpoint
CREATE TYPE "public"."selection_strategy" AS ENUM('static', 'random', 'hybrid');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'exam_admin', 'proctor', 'question_author', 'candidate');--> statement-breakpoint
CREATE TYPE "public"."violation_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."violation_type" AS ENUM('tab_switch', 'window_blur', 'process_violation', 'clipboard_access', 'screenshot_attempt', 'vm_detected', 'multiple_faces', 'gaze_away', 'browser_devtools', 'time_manipulation');--> statement-breakpoint
CREATE TABLE "question_banks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"option_text" text NOT NULL,
	"option_media_url" varchar(500),
	"is_correct" boolean NOT NULL,
	"display_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"tag" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_question_tags_question_tag" UNIQUE("question_id","tag")
);
--> statement-breakpoint
CREATE TABLE "question_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"content_json" jsonb NOT NULL,
	"changed_by" uuid NOT NULL,
	"change_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_question_versions_question_version" UNIQUE("question_id","version_number")
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_bank_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"topic_id" uuid,
	"type" "question_type" NOT NULL,
	"difficulty" "difficulty_level" DEFAULT 'medium' NOT NULL,
	"cognitive_level" "cognitive_level",
	"marks" numeric(6, 2) NOT NULL,
	"negative_marks" numeric(6, 2) DEFAULT '0' NOT NULL,
	"estimated_time_secs" integer,
	"content_json" jsonb NOT NULL,
	"media_urls_json" jsonb,
	"solution_json" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(50) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subjects_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"parent_topic_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proctoring_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_batch_id" uuid NOT NULL,
	"enable_ai_proctoring" boolean DEFAULT false NOT NULL,
	"enable_webcam" boolean DEFAULT false NOT NULL,
	"enable_screen_capture" boolean DEFAULT false NOT NULL,
	"sensitivity_level" varchar(20) DEFAULT 'medium' NOT NULL,
	"settings_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proctoring_configs_exam_batch_id_unique" UNIQUE("exam_batch_id")
);
--> statement-breakpoint
CREATE TABLE "security_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_name" varchar(100) NOT NULL,
	"description" text,
	"settings_json" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "security_policies_policy_name_unique" UNIQUE("policy_name")
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" text NOT NULL,
	"value_type" varchar(20) NOT NULL,
	"description" text,
	"is_editable" boolean DEFAULT true NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "exam_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"batch_id" uuid,
	"center_id" uuid,
	"name" varchar(255) NOT NULL,
	"status" "exam_status" DEFAULT 'draft' NOT NULL,
	"shift_number" integer DEFAULT 1 NOT NULL,
	"scheduled_start_at" timestamp with time zone NOT NULL,
	"scheduled_end_at" timestamp with time zone NOT NULL,
	"actual_start_at" timestamp with time zone,
	"actual_end_at" timestamp with time zone,
	"grace_period_minutes" integer DEFAULT 5 NOT NULL,
	"instructions_json" jsonb,
	"settings_json" jsonb,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_section_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"display_order" integer NOT NULL,
	"marks" numeric(6, 2) NOT NULL,
	"negative_marks" numeric(6, 2) DEFAULT '0' NOT NULL,
	"is_optional" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_batch_id" uuid NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"section_order" integer NOT NULL,
	"duration_minutes" integer,
	"total_marks" numeric(8, 2) NOT NULL,
	"negative_marking_percentage" numeric(5, 2) DEFAULT '0' NOT NULL,
	"question_count" integer NOT NULL,
	"navigation_mode" "navigation_mode",
	"shuffle_questions" boolean DEFAULT false NOT NULL,
	"shuffle_options" boolean DEFAULT false NOT NULL,
	"instructions_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"code" varchar(50) NOT NULL,
	"duration_minutes" integer NOT NULL,
	"total_marks" numeric(8, 2) NOT NULL,
	"passing_marks" numeric(8, 2),
	"has_negative_marking" boolean DEFAULT false NOT NULL,
	"selection_strategy" "selection_strategy" DEFAULT 'static' NOT NULL,
	"navigation_mode" "navigation_mode" DEFAULT 'free' NOT NULL,
	"shuffle_questions" boolean DEFAULT false NOT NULL,
	"shuffle_options" boolean DEFAULT false NOT NULL,
	"instructions_json" jsonb,
	"result_visibility" varchar(20) DEFAULT 'delayed' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exams_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "answer_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"answer_id" uuid NOT NULL,
	"snapshot_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"answer_data_json" jsonb,
	"status" "answer_status" DEFAULT 'not_visited' NOT NULL,
	"time_spent_secs" integer DEFAULT 0 NOT NULL,
	"is_marked_for_review" boolean DEFAULT false NOT NULL,
	"first_visited_at" timestamp with time zone,
	"last_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_answers_attempt_question" UNIQUE("attempt_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_batch_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"status" "attempt_status" DEFAULT 'not_started' NOT NULL,
	"started_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"remaining_time_secs" integer,
	"last_question_id_seen" uuid,
	"ip_address" varchar(45),
	"user_agent" text,
	"is_reconnected" boolean DEFAULT false NOT NULL,
	"reconnected_count" integer DEFAULT 0 NOT NULL,
	"reconnected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_attempts_exam_batch_candidate" UNIQUE("exam_batch_id","candidate_id")
);
--> statement-breakpoint
CREATE TABLE "event_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"event_data_json" jsonb,
	"severity" varchar(20) DEFAULT 'info' NOT NULL,
	"client_timestamp" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proctoring_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"event_data_json" jsonb,
	"media_url" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_jti" varchar(255) NOT NULL,
	"token_type" varchar(10) NOT NULL,
	"device_id" uuid,
	"attempt_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"is_revoked" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_tokens_token_jti_unique" UNIQUE("token_jti")
);
--> statement-breakpoint
CREATE TABLE "violation_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"violation_type" "violation_type" NOT NULL,
	"severity" "violation_severity" NOT NULL,
	"description" text NOT NULL,
	"evidence_url" varchar(500),
	"proctor_action" "proctoring_action",
	"proctor_id" uuid,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"center_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(50) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_batches_center_id_code" UNIQUE("center_id","code")
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"batch_id" uuid,
	"roll_number" varchar(50),
	"admit_card_number" varchar(50),
	"photo_url" varchar(500),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidates_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "centers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(50) NOT NULL,
	"address" text,
	"capacity" integer DEFAULT 100 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "centers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "exam_batch_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_batch_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_exam_batch_candidates_exam_batch_candidate" UNIQUE("exam_batch_id","candidate_id")
);
--> statement-breakpoint
CREATE TABLE "institutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(50) NOT NULL,
	"address" text,
	"contact_email" varchar(255),
	"contact_phone" varchar(20),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institutions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" "user_role" NOT NULL,
	"resource" varchar(100) NOT NULL,
	"action" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_permissions_role_resource_action" UNIQUE("role","resource","action")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" "user_role" NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"role" "user_role" NOT NULL,
	"phone" varchar(20),
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" "audit_action" NOT NULL,
	"resource_type" varchar(100) NOT NULL,
	"resource_id" uuid,
	"old_value_json" jsonb,
	"new_value_json" jsonb,
	"ip_address" varchar(45),
	"user_agent" text,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"prev_hash" varchar(64),
	"current_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" varchar(255) NOT NULL,
	"device_name" varchar(255),
	"mac_address" varchar(17) NOT NULL,
	"hardware_hash" varchar(255) NOT NULL,
	"ip_address" varchar(45),
	"center_id" uuid,
	"status" "device_status" DEFAULT 'registered' NOT NULL,
	"registered_by" uuid NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_registrations_device_id_unique" UNIQUE("device_id")
);
--> statement-breakpoint
CREATE TABLE "analytics_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_batch_id" uuid NOT NULL,
	"snapshot_json" jsonb NOT NULL,
	"snapshot_type" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"certificate_number" varchar(50) NOT NULL,
	"template_id" uuid,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pdf_url" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certificates_certificate_number_unique" UNIQUE("certificate_number")
);
--> statement-breakpoint
CREATE TABLE "scorecards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"rank" integer,
	"percentile" numeric(6, 3),
	"total_score" numeric(8, 2) NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pdf_url" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scorecards_attempt_id_unique" UNIQUE("attempt_id")
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"total_marks" numeric(8, 2) NOT NULL,
	"marks_obtained" numeric(8, 2) NOT NULL,
	"negative_marks" numeric(8, 2) DEFAULT '0' NOT NULL,
	"net_score" numeric(8, 2) NOT NULL,
	"is_passed" boolean NOT NULL,
	"section_scores_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scores_attempt_id_unique" UNIQUE("attempt_id")
);
--> statement-breakpoint
ALTER TABLE "question_banks" ADD CONSTRAINT "question_banks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_tags" ADD CONSTRAINT "question_tags_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_question_bank_id_question_banks_id_fk" FOREIGN KEY ("question_bank_id") REFERENCES "public"."question_banks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proctoring_configs" ADD CONSTRAINT "proctoring_configs_exam_batch_id_exam_batches_id_fk" FOREIGN KEY ("exam_batch_id") REFERENCES "public"."exam_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_batches" ADD CONSTRAINT "exam_batches_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_batches" ADD CONSTRAINT "exam_batches_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_batches" ADD CONSTRAINT "exam_batches_center_id_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_batches" ADD CONSTRAINT "exam_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_exam_section_id_exam_sections_id_fk" FOREIGN KEY ("exam_section_id") REFERENCES "public"."exam_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_exam_batch_id_exam_batches_id_fk" FOREIGN KEY ("exam_batch_id") REFERENCES "public"."exam_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_sections" ADD CONSTRAINT "exam_sections_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_snapshots" ADD CONSTRAINT "answer_snapshots_answer_id_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."answers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_exam_batch_id_exam_batches_id_fk" FOREIGN KEY ("exam_batch_id") REFERENCES "public"."exam_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_device_id_device_registrations_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."device_registrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_logs" ADD CONSTRAINT "event_logs_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proctoring_events" ADD CONSTRAINT "proctoring_events_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_tokens" ADD CONSTRAINT "session_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_tokens" ADD CONSTRAINT "session_tokens_device_id_device_registrations_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."device_registrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_tokens" ADD CONSTRAINT "session_tokens_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violation_reports" ADD CONSTRAINT "violation_reports_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violation_reports" ADD CONSTRAINT "violation_reports_proctor_id_users_id_fk" FOREIGN KEY ("proctor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violation_reports" ADD CONSTRAINT "violation_reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_center_id_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centers" ADD CONSTRAINT "centers_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_batch_candidates" ADD CONSTRAINT "exam_batch_candidates_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissions" ADD CONSTRAINT "fk_permissions_role" FOREIGN KEY ("role") REFERENCES "public"."roles"("name") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_registrations" ADD CONSTRAINT "device_registrations_center_id_centers_id_fk" FOREIGN KEY ("center_id") REFERENCES "public"."centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_registrations" ADD CONSTRAINT "device_registrations_registered_by_users_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_exam_batch_id_exam_batches_id_fk" FOREIGN KEY ("exam_batch_id") REFERENCES "public"."exam_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_question_banks_created_by" ON "question_banks" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_question_options_question_id" ON "question_options" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "idx_question_tags_tag" ON "question_tags" USING btree ("tag");--> statement-breakpoint
CREATE INDEX "idx_question_versions_question_id" ON "question_versions" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "idx_questions_question_bank_id" ON "questions" USING btree ("question_bank_id");--> statement-breakpoint
CREATE INDEX "idx_questions_subject_id" ON "questions" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "idx_questions_topic_id" ON "questions" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "idx_questions_type" ON "questions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_questions_difficulty" ON "questions" USING btree ("difficulty");--> statement-breakpoint
CREATE INDEX "idx_topics_subject_id" ON "topics" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "idx_topics_parent_topic_id" ON "topics" USING btree ("parent_topic_id");--> statement-breakpoint
CREATE INDEX "idx_proctoring_configs_exam_batch_id" ON "proctoring_configs" USING btree ("exam_batch_id");--> statement-breakpoint
CREATE INDEX "idx_security_policies_policy_name" ON "security_policies" USING btree ("policy_name");--> statement-breakpoint
CREATE INDEX "idx_system_settings_key" ON "system_settings" USING btree ("key");--> statement-breakpoint
CREATE INDEX "idx_exam_batches_exam_id" ON "exam_batches" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "idx_exam_batches_batch_id" ON "exam_batches" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "idx_exam_batches_center_id" ON "exam_batches" USING btree ("center_id");--> statement-breakpoint
CREATE INDEX "idx_exam_batches_status" ON "exam_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_exam_questions_exam_section_id" ON "exam_questions" USING btree ("exam_section_id");--> statement-breakpoint
CREATE INDEX "idx_exam_questions_question_id" ON "exam_questions" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "idx_exam_schedules_exam_batch_id" ON "exam_schedules" USING btree ("exam_batch_id");--> statement-breakpoint
CREATE INDEX "idx_exam_sections_exam_id" ON "exam_sections" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "idx_exams_created_by" ON "exams" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_answer_snapshots_answer_id" ON "answer_snapshots" USING btree ("answer_id");--> statement-breakpoint
CREATE INDEX "idx_answers_attempt_id" ON "answers" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "idx_answers_question_id" ON "answers" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "idx_attempts_exam_batch_id" ON "attempts" USING btree ("exam_batch_id");--> statement-breakpoint
CREATE INDEX "idx_attempts_candidate_id" ON "attempts" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "idx_attempts_device_id" ON "attempts" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "idx_attempts_status" ON "attempts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_event_logs_attempt_id" ON "event_logs" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "idx_proctoring_events_attempt_id" ON "proctoring_events" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "idx_session_tokens_user_id" ON "session_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_session_tokens_device_id" ON "session_tokens" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "idx_session_tokens_attempt_id" ON "session_tokens" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "idx_violation_reports_attempt_id" ON "violation_reports" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "idx_candidates_batch_id" ON "candidates" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "idx_centers_institution_id" ON "centers" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "idx_exam_batch_candidates_exam_batch_id" ON "exam_batch_candidates" USING btree ("exam_batch_id");--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_users_institution_id" ON "users" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_user_id" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_resource" ON "audit_logs" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_timestamp" ON "audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_device_registrations_center_id" ON "device_registrations" USING btree ("center_id");--> statement-breakpoint
CREATE INDEX "idx_device_registrations_status" ON "device_registrations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_analytics_snapshots_exam_batch_id" ON "analytics_snapshots" USING btree ("exam_batch_id");--> statement-breakpoint
CREATE INDEX "idx_certificates_attempt_id" ON "certificates" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "idx_scorecards_candidate_id" ON "scorecards" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "idx_scores_attempt_id" ON "scores" USING btree ("attempt_id");