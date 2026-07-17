# DATABASE DESIGN DOCUMENT

# Competitive CBT Platform

---

## 1. DOCUMENT PURPOSE

This document defines the complete database schema for the CBT Platform. No migration is written until this document is reviewed and approved. It covers entity definitions, relationships, naming conventions, indexing strategy, partitioning strategy, constraints, and migration plan.

---

## 2. NAMING CONVENTIONS

| Element                 | Convention                       | Example                                                         |
| ----------------------- | -------------------------------- | --------------------------------------------------------------- |
| Tables                  | `snake_case`, plural             | `question_banks`, `exam_sections`                               |
| Columns                 | `snake_case`                     | `created_at`, `exam_batch_id`                                   |
| Primary keys            | `id` (UUIDv7)                    | `id UUID PRIMARY KEY DEFAULT uuidv7()` (PostgreSQL 18 built-in) |
| Foreign keys            | `<table_singular>_id`            | `exam_id`, `candidate_id`                                       |
| Join tables             | `<table_a>_<table_b>`            | `exam_batch_candidate`                                          |
| Indexes                 | `idx_<table>_<columns>`          | `idx_answers_attempt_question`                                  |
| Unique constraints      | `uq_<table>_<columns>`           | `uq_users_email`                                                |
| Check constraints       | `ck_<table>_<description>`       | `ck_exams_duration_positive`                                    |
| Foreign key constraints | `fk_<table>_<column>`            | `fk_attempts_exam_batch_id`                                     |
| Enums                   | `snake_case` type name           | `exam_status`, `attempt_status`                                 |
| Timestamps              | `<event>_at` (UTC)               | `created_at`, `submitted_at`, `started_at`                      |
| Booleans                | `is_<adjective>` or `has_<noun>` | `is_active`, `has_negative_marking`                             |
| JSON columns            | `<name>_json`                    | `metadata_json`, `settings_json`                                |

---

## 3. ENUM TYPES

```sql
-- User roles
CREATE TYPE user_role AS ENUM (
  'super_admin',
  'exam_admin',
  'proctor',
  'question_author',
  'candidate'
);

-- Question types
CREATE TYPE question_type AS ENUM (
  'mcq_single',        -- Single correct answer
  'mcq_multiple',      -- Multiple correct answers
  'fill_in_blank',     -- Text input
  'essay',             -- Subjective long-form
  'true_false',        -- Binary answer
  'matching',          -- Match pairs
  'assertion_reason',  -- Assertion + reasoning
  'comprehension',     -- Passage-based
  'drag_drop',         -- Drag and drop ordering
  'image_based',       -- Image-based question
  'audio_video',       -- Audio/Video-based question
  'numerical',         -- Numerical answer
  'matrix_match'       -- Matrix matching (multiple columns)
);

-- Difficulty levels
CREATE TYPE difficulty_level AS ENUM (
  'easy',
  'medium',
  'hard',
  'very_hard'
);

-- Cognitive levels (Bloom's Taxonomy)
CREATE TYPE cognitive_level AS ENUM (
  'remember',
  'understand',
  'apply',
  'analyze',
  'evaluate',
  'create'
);

-- Exam status lifecycle
CREATE TYPE exam_status AS ENUM (
  'draft',
  'scheduled',
  'published',
  'active',
  'paused',
  'submission_window',
  'finished',
  'results_published',
  'archived'
);

-- Attempt status
CREATE TYPE attempt_status AS ENUM (
  'not_started',
  'in_progress',
  'paused',
  'submitted',
  'auto_submitted',
  'force_submitted',
  'terminated',
  'abandoned'
);

-- Answer status
CREATE TYPE answer_status AS ENUM (
  'not_visited',
  'visited',
  'answered',
  'marked_for_review',
  'answered_and_marked'
);

-- Question selection strategy
CREATE TYPE selection_strategy AS ENUM (
  'static',      -- Fixed set of questions
  'random',      -- Random from pool
  'hybrid'       -- Mix of fixed + random
);

-- Navigation mode
CREATE TYPE navigation_mode AS ENUM (
  'free',        -- Jump between any question/section
  'linear',      -- Sequential only
  'section_free' -- Free within section, linear across sections
);

-- Device status
CREATE TYPE device_status AS ENUM (
  'registered',
  'active',
  'suspended',
  'decommissioned'
);

-- Violation type
CREATE TYPE violation_type AS ENUM (
  'tab_switch',
  'window_blur',
  'process_violation',
  'clipboard_access',
  'screenshot_attempt',
  'vm_detected',
  'multiple_faces',
  'gaze_away',
  'browser_devtools',
  'time_manipulation'
);

-- Violation severity
CREATE TYPE violation_severity AS ENUM (
  'low',
  'medium',
  'high',
  'critical'
);

-- Audit action
CREATE TYPE audit_action AS ENUM (
  'create',
  'read',
  'update',
  'delete',
  'login',
  'logout',
  'export',
  'import',
  'publish',
  'activate',
  'pause',
  'resume',
  'submit',
  'terminate',
  'grade',
  'config_change'
);

-- Proctoring action
CREATE TYPE proctoring_action AS ENUM (
  'warn',
  'pause',
  'terminate',
  'message',
  'dismiss'
);
```

---

## 4. ENTITY RELATIONSHIP DIAGRAM (ERD)

### 4.1 Organizational Entities

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ institutions │     │    users     │     │    roles     │
│──────────────│     │──────────────│     │──────────────│
│ id (PK)      │◄──┐ │ id (PK)      │  ┌─►│ id (PK)      │
│ name         │   └─│ institution_id│  │  │ name         │
│ code         │     │ email         │  │  │ description  │
│ address      │     │ password_hash │  │  └──────────────┘
│ contact      │     │ full_name     │  │
│ is_active    │     │ role          │  │  ┌──────────────┐
│ created_at   │     │ phone         │  │  │  permissions │
│ updated_at   │     │ is_active     │  │  │──────────────│
└──────────────┘     │ last_login_at │  │  │ id (PK)      │
                     │ created_at    │  └──│ role         │
                     │ updated_at    │     │ resource     │
                     └──────────────┘     │ action       │
                                          │ created_at   │
                                          └──────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   centers    │     │   batches    │     │  candidates  │
│──────────────│     │──────────────│     │──────────────│
│ id (PK)      │◄──┐ │ id (PK)      │  ┌──│ id (PK)      │
│ institution_id│  └─│ center_id    │  │  │ user_id (FK) │
│ name         │     │ name         │  │  │ batch_id (FK)│
│ code         │     │ code         │  │  │ roll_number  │
│ address      │     │ start_date   │  │  │ admit_card_no│
│ capacity     │     │ end_date     │  │  │ photo_url    │
│ is_active    │     │ is_active    │  │  │ is_active    │
│ created_at   │     │ created_at   │  │  │ created_at   │
│ updated_at   │     │ updated_at   │  │  │ updated_at   │
└──────────────┘     └──────────────┘  │  └──────────────┘
                                        │
                                        │  ┌─────────────────────────┐
                                        └──│ exam_batch_candidate    │
                                           │─────────────────────────│
                                           │ id (PK)                 │
                                           │ exam_batch_id (FK)      │
                                           │ candidate_id (FK)       │
                                           │ assigned_at             │
                                           │ UNIQUE(exam_batch_id,   │
                                           │   candidate_id)         │
                                           └─────────────────────────┘
```

### 4.2 Academic Entities

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│   subjects   │     │    topics    │     │ question_banks   │
│──────────────│     │──────────────│     │──────────────────│
│ id (PK)      │◄──┐ │ id (PK)      │  ┌──│ id (PK)          │
│ name         │   └─│ subject_id   │  │  │ name             │
│ code         │     │ name         │  │  │ description      │
│ description  │     │ description  │  │  │ is_active        │
│ is_active    │     │ parent_topic_id│ │  │ created_by (FK)  │
│ created_at   │     │ is_active    │  │  │ created_at       │
│ updated_at   │     │ created_at   │  │  │ updated_at       │
└──────────────┘     │ updated_at   │  │  └──────────────────┘
                     └──────────────┘  │
                                       │  ┌──────────────────┐
                                       └──│   questions      │
                                          │──────────────────│
                                          │ id (PK)          │
                                          │ question_bank_id │
                                          │ subject_id (FK)  │
                                          │ topic_id (FK)    │
                                          │ type (ENUM)      │
                                          │ difficulty       │
                                          │ cognitive_level  │
                                          │ marks            │
                                          │ negative_marks   │
                                          │ estimated_time   │
                                          │ content_json     │
                                          │ media_urls_json  │
                                          │ solution_json    │
                                          │ is_active        │
                                          │ version          │
                                          │ created_by (FK)  │
                                          │ approved_by (FK) │
                                          │ created_at       │
                                          │ updated_at       │
                                          └──────────────────┘
                                                     │
                    ┌────────────────────────────────┤
                    │                                │
          ┌─────────┴────────┐         ┌─────────────┴────────┐
          │ question_options │         │  question_tags       │
          │──────────────────│         │──────────────────────│
          │ id (PK)          │         │ id (PK)              │
          │ question_id (FK) │         │ question_id (FK)     │
          │ option_text      │         │ tag                  │
          │ option_media_url │         │ created_at           │
          │ is_correct       │         └──────────────────────┘
          │ display_order    │
          │ created_at       │         ┌──────────────────────┐
          └──────────────────┘         │ question_versions    │
                                       │──────────────────────│
                                       │ id (PK)              │
                                       │ question_id (FK)     │
                                       │ version_number       │
                                       │ content_json         │
                                       │ changed_by (FK)      │
                                       │ change_reason        │
                                       │ created_at           │
                                       └──────────────────────┘
```

### 4.3 Exam Entities

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│      exams       │     │   exam_sections  │     │  exam_questions  │
│──────────────────│     │──────────────────│     │──────────────────│
│ id (PK)          │◄──┐ │ id (PK)          │  ┌──│ id (PK)          │
│ name             │   └─│ exam_id (FK)     │  │  │ exam_section_id  │
│ description      │     │ name             │  │  │   (FK)           │
│ code             │     │ section_order    │  │  │ question_id (FK) │
│ duration_minutes │     │ duration_minutes │  │  │ display_order    │
│ total_marks      │     │ total_marks      │  │  │ marks            │
│ passing_marks    │     │ negative_marking │  │  │ negative_marks   │
│ has_negative     │     │   _percentage    │  │  │ is_optional      │
│   _marking       │     │ question_count   │  │  │ created_at       │
│ selection_strategy│    │ navigation_mode  │  │  └──────────────────┘
│ navigation_mode  │     │ shuffle_questions│  │
│ shuffle_questions│     │ shuffle_options  │  │
│ shuffle_options  │     │ instructions     │  │
│ instructions     │     │   _json          │  │
│   _json          │     │ created_at       │  │
│ result_visibility│     │ updated_at       │  │
│ is_active        │     └──────────────────┘  │
│ created_by (FK)  │                           │
│ created_at       │     ┌──────────────────┐  │
│ updated_at       │     │  exam_batches    │  │
└──────────────────┘     │──────────────────│  │
                         │ id (PK)          │  │
                         │ exam_id (FK)     │  │
                         │ batch_id (FK)    │  │
                         │ center_id (FK)   │  │
                         │ name             │  │
                         │ status (ENUM)    │  │
                         │ shift_number     │  │
                         │ scheduled_start  │  │
                         │   _at            │  │
                         │ scheduled_end_at │  │
                         │ actual_start_at  │  │
                         │ actual_end_at    │  │
                         │ grace_period_min │  │
                         │ instructions_json│  │
                         │ settings_json    │  │
                         │ created_by (FK)  │  │
                         │ created_at       │  │
                         │ updated_at       │  │
                         └──────────────────┘  │
                                               │
                         ┌─────────────────────┴────────┐
                         │   exam_schedules             │
                         │──────────────────────────────│
                         │ id (PK)                      │
                         │ exam_batch_id (FK)           │
                         │ start_at                     │
                         │ end_at                       │
                         │ is_active                    │
                         │ created_at                   │
                         └──────────────────────────────┘
```

### 4.4 Execution Entities

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│    attempts      │     │     answers      │     │ answer_snapshots │
│──────────────────│     │──────────────────│     │──────────────────│
│ id (PK)          │◄──┐ │ id (PK)          │  ┌──│ id (PK)          │
│ exam_batch_id(FK)│   └─│ attempt_id (FK)  │  │  │ answer_id (FK)   │
│ candidate_id(FK) │     │ question_id (FK) │  │  │ snapshot_json    │
│ device_id (FK)   │     │ answer_data_json │  │  │ created_at       │
│ status (ENUM)    │     │ status (ENUM)    │  │  └──────────────────┘
│ started_at       │     │ time_spent_secs  │  │
│ submitted_at     │     │ is_marked_review │  │
│ remaining_time   │     │ first_visited_at │  │
│   _secs          │     │ last_updated_at  │  │
│ last_question_id │     │ created_at       │  │
│   _seen          │     │ updated_at       │  │
│ ip_address       │     └──────────────────┘  │
│ user_agent       │                           │
│ is_reconnected   │     ┌──────────────────┐  │
│ reconnected_count│     │   event_logs     │  │
│   _at            │     │──────────────────│  │
│ created_at       │     │ id (PK)          │  │
│ updated_at       │     │ attempt_id (FK)  │  │
└──────────────────┘     │ event_type       │  │
                         │ event_data_json  │  │
                         │ severity         │  │
                         │ timestamp        │  │
                         │ client_timestamp │  │
                         │ created_at       │  │
                         └──────────────────┘  │
                                               │
                         ┌─────────────────────┘
                         │ (event_logs also
                         │  references violations)
                         │
                         ┌──────────────────┐
                         │ violation_reports│
                         │──────────────────│
                         │ id (PK)          │
                         │ attempt_id (FK)  │
                         │ violation_type   │
                         │ severity         │
                         │ description      │
                         │ evidence_url     │
                         │ proctor_action   │
                         │ proctor_id (FK)  │
                         │ resolved         │
                         │ resolved_at      │
                         │ resolved_by(FK)  │
                         │ created_at       │
                         │ updated_at       │
                         └──────────────────┘
```

### 4.5 Results Entities

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│     scores       │     │   scorecards     │     │ analytics_       │
│──────────────────│     │──────────────────│     │   snapshots      │
│ id (PK)          │     │ id (PK)          │     │──────────────────│
│ attempt_id (FK)  │     │ attempt_id (FK)  │     │ id (PK)          │
│ total_marks      │     │ candidate_id(FK) │     │ exam_batch_id(FK)│
│ marks_obtained   │     │ rank             │     │ snapshot_json    │
│ negative_marks   │     │ percentile       │     │ snapshot_type    │
│ net_score        │     │ total_score      │     │   (batch/inst)   │
│ is_passed        │     │ generated_at     │     │ created_at       │
│ section_scores   │     │ pdf_url          │     └──────────────────┘
│   _json          │     │ created_at       │
│ created_at       │     └──────────────────┘
└──────────────────┘
                                                ┌──────────────────┐
                                                │   certificates   │
                                                │──────────────────│
                                                │ id (PK)          │
                                                │ attempt_id (FK)  │
                                                │ candidate_id(FK) │
                                                │ certificate_no   │
                                                │ template_id (FK) │
                                                │ issued_at        │
                                                │ pdf_url          │
                                                │ created_at       │
                                                └──────────────────┘
```

### 4.6 Security Entities

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ device_registr.  │     │  session_tokens  │     │   audit_logs     │
│──────────────────│     │──────────────────│     │──────────────────│
│ id (PK)          │     │ id (PK)          │     │ id (PK)          │
│ device_id        │     │ user_id (FK)     │     │ user_id (FK)     │
│   (unique)       │     │ token_jti        │     │ action (ENUM)    │
│ device_name      │     │ token_type       │     │ resource_type    │
│ mac_address      │     │   (access/refresh)│    │ resource_id      │
│ hardware_hash    │     │ device_id (FK)   │     │ old_value_json   │
│ ip_address       │     │ attempt_id (FK)  │     │ new_value_json   │
│ center_id (FK)   │     │ expires_at       │     │ ip_address       │
│ status (ENUM)    │     │ is_revoked       │     │ user_agent       │
│ registered_by    │     │ revoked_at       │     │ timestamp        │
│   (FK)           │     │ created_at       │     │ prev_hash        │
│ last_seen_at     │     │ updated_at       │     │ current_hash     │
│ created_at       │     └──────────────────┘     │ created_at       │
│ updated_at       │                              └──────────────────┘
└──────────────────┘
                                                ┌──────────────────┐
                                                │ proctoring_      │
                                                │   events         │
                                                │──────────────────│
                                                │ id (PK)          │
                                                │ attempt_id (FK)  │
                                                │ event_type       │
                                                │ event_data_json  │
                                                │ media_url        │
                                                │ created_at       │
                                                └──────────────────┘
```

### 4.7 Configuration Entities

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ system_settings  │     │ security_policies│     │ proctoring_      │
│──────────────────│     │──────────────────│     │   configs        │
│ id (PK)          │     │ id (PK)          │     │──────────────────│
│ key              │     │ policy_name      │     │ id (PK)          │
│ value            │     │ description      │     │ exam_batch_id(FK)│
│ value_type       │     │ settings_json    │     │ enable_ai        │
│   (string/int/   │     │ is_active        │     │   _proctoring    │
│    bool/json)    │     │ created_at       │     │ enable_webcam    │
│ description      │     │ updated_at       │     │ enable_screen    │
│ is_editable      │     └──────────────────┘     │   _capture       │
│ updated_by (FK)  │                              │ sensitivity      │
│ updated_at       │                              │   _level         │
│ created_at       │                              │ settings_json    │
└──────────────────┘                              │ created_at       │
                                                  │ updated_at       │
                                                  └──────────────────┘
```

---

## 5. COMPLETE TABLE DEFINITIONS

### 5.1 Organizational Tables

#### `institutions`

| Column        | Type         | Constraints            | Description                                  |
| ------------- | ------------ | ---------------------- | -------------------------------------------- |
| id            | UUID         | PK, DEFAULT uuidv7()   | Unique identifier (timestamp-ordered UUIDv7) |
| name          | VARCHAR(255) | NOT NULL               | Institution name                             |
| code          | VARCHAR(50)  | NOT NULL, UNIQUE       | Short code                                   |
| address       | TEXT         | NULL                   | Address                                      |
| contact_email | VARCHAR(255) | NULL                   | Contact email                                |
| contact_phone | VARCHAR(20)  | NULL                   | Contact phone                                |
| is_active     | BOOLEAN      | NOT NULL DEFAULT true  | Active flag                                  |
| created_at    | TIMESTAMPTZ  | NOT NULL DEFAULT NOW() | Creation time                                |
| updated_at    | TIMESTAMPTZ  | NOT NULL DEFAULT NOW() | Last update                                  |

#### `users`

| Column             | Type         | Constraints                   | Description                         |
| ------------------ | ------------ | ----------------------------- | ----------------------------------- |
| id                 | UUID         | PK, DEFAULT gen_random_uuid() | Unique identifier                   |
| institution_id     | UUID         | FK -> institutions.id, NULL   | Institution (NULL for super_admin)  |
| email              | VARCHAR(255) | NOT NULL, UNIQUE              | Login email                         |
| password_hash      | VARCHAR(255) | NOT NULL                      | Argon2id hash (via @node-rs/argon2) |
| full_name          | VARCHAR(255) | NOT NULL                      | Full name                           |
| role               | user_role    | NOT NULL                      | User role                           |
| phone              | VARCHAR(20)  | NULL                          | Phone number                        |
| is_active          | BOOLEAN      | NOT NULL DEFAULT true         | Active flag                         |
| last_login_at      | TIMESTAMPTZ  | NULL                          | Last login time                     |
| failed_login_count | INT          | NOT NULL DEFAULT 0            | Failed attempts                     |
| locked_until       | TIMESTAMPTZ  | NULL                          | Lock expiry                         |
| created_at         | TIMESTAMPTZ  | NOT NULL DEFAULT NOW()        | Creation time                       |
| updated_at         | TIMESTAMPTZ  | NOT NULL DEFAULT NOW()        | Last update                         |

#### `roles` / `permissions`

| Table       | Column      | Type         | Constraints                |
| ----------- | ----------- | ------------ | -------------------------- |
| roles       | id          | UUID         | PK                         |
| roles       | name        | user_role    | NOT NULL, UNIQUE           |
| roles       | description | TEXT         | NULL                       |
| permissions | id          | UUID         | PK                         |
| permissions | role        | user_role    | NOT NULL, FK -> roles.name |
| permissions | resource    | VARCHAR(100) | NOT NULL                   |
| permissions | action      | VARCHAR(50)  | NOT NULL                   |
| permissions | created_at  | TIMESTAMPTZ  | NOT NULL DEFAULT NOW()     |

#### `centers`

| Column         | Type         | Constraints                     | Description        |
| -------------- | ------------ | ------------------------------- | ------------------ |
| id             | UUID         | PK                              | Unique identifier  |
| institution_id | UUID         | FK -> institutions.id, NOT NULL | Parent institution |
| name           | VARCHAR(255) | NOT NULL                        | Center name        |
| code           | VARCHAR(50)  | NOT NULL, UNIQUE                | Short code         |
| address        | TEXT         | NULL                            | Address            |
| capacity       | INT          | NOT NULL DEFAULT 100            | Max candidates     |
| is_active      | BOOLEAN      | NOT NULL DEFAULT true           | Active flag        |
| created_at     | TIMESTAMPTZ  | NOT NULL DEFAULT NOW()          |                    |
| updated_at     | TIMESTAMPTZ  | NOT NULL DEFAULT NOW()          |                    |

#### `batches`

| Column     | Type         | Constraints                | Description       |
| ---------- | ------------ | -------------------------- | ----------------- |
| id         | UUID         | PK                         | Unique identifier |
| center_id  | UUID         | FK -> centers.id, NOT NULL | Parent center     |
| name       | VARCHAR(255) | NOT NULL                   | Batch name        |
| code       | VARCHAR(50)  | NOT NULL                   | Short code        |
| start_date | DATE         | NOT NULL                   | Batch start       |
| end_date   | DATE         | NULL                       | Batch end         |
| is_active  | BOOLEAN      | NOT NULL DEFAULT true      | Active flag       |
| created_at | TIMESTAMPTZ  | NOT NULL DEFAULT NOW()     |                   |
| updated_at | TIMESTAMPTZ  | NOT NULL DEFAULT NOW()     |                   |

#### `candidates`

| Column            | Type         | Constraints              | Description         |
| ----------------- | ------------ | ------------------------ | ------------------- |
| id                | UUID         | PK                       | Unique identifier   |
| user_id           | UUID         | FK -> users.id, NOT NULL | Linked user account |
| batch_id          | UUID         | FK -> batches.id, NULL   | Assigned batch      |
| roll_number       | VARCHAR(50)  | NULL                     | Roll number         |
| admit_card_number | VARCHAR(50)  | NULL                     | Admit card number   |
| photo_url         | VARCHAR(500) | NULL                     | Photo path          |
| is_active         | BOOLEAN      | NOT NULL DEFAULT true    | Active flag         |
| created_at        | TIMESTAMPTZ  | NOT NULL DEFAULT NOW()   |                     |
| updated_at        | TIMESTAMPTZ  | NOT NULL DEFAULT NOW()   |                     |

#### `exam_batch_candidate`

| Column        | Type        | Constraints                     | Description       |
| ------------- | ----------- | ------------------------------- | ----------------- |
| id            | UUID        | PK                              | Unique identifier |
| exam_batch_id | UUID        | FK -> exam_batches.id, NOT NULL | Exam batch        |
| candidate_id  | UUID        | FK -> candidates.id, NOT NULL   | Candidate         |
| assigned_at   | TIMESTAMPTZ | NOT NULL DEFAULT NOW()          | Assignment time   |

**Unique constraint:** `uq_exam_batch_candidate (exam_batch_id, candidate_id)`

### 5.2 Academic Tables

#### `subjects`

| Column      | Type         | Constraints            | Description       |
| ----------- | ------------ | ---------------------- | ----------------- |
| id          | UUID         | PK                     | Unique identifier |
| name        | VARCHAR(255) | NOT NULL               | Subject name      |
| code        | VARCHAR(50)  | NOT NULL, UNIQUE       | Short code        |
| description | TEXT         | NULL                   | Description       |
| is_active   | BOOLEAN      | NOT NULL DEFAULT true  | Active flag       |
| created_at  | TIMESTAMPTZ  | NOT NULL DEFAULT NOW() |                   |
| updated_at  | TIMESTAMPTZ  | NOT NULL DEFAULT NOW() |                   |

#### `topics`

| Column          | Type         | Constraints                 | Description               |
| --------------- | ------------ | --------------------------- | ------------------------- |
| id              | UUID         | PK                          | Unique identifier         |
| subject_id      | UUID         | FK -> subjects.id, NOT NULL | Parent subject            |
| name            | VARCHAR(255) | NOT NULL                    | Topic name                |
| description     | TEXT         | NULL                        | Description               |
| parent_topic_id | UUID         | FK -> topics.id, NULL       | Parent topic (sub-topics) |
| is_active       | BOOLEAN      | NOT NULL DEFAULT true       | Active flag               |
| created_at      | TIMESTAMPTZ  | NOT NULL DEFAULT NOW()      |                           |
| updated_at      | TIMESTAMPTZ  | NOT NULL DEFAULT NOW()      |                           |

#### `question_banks`

| Column      | Type         | Constraints              | Description       |
| ----------- | ------------ | ------------------------ | ----------------- |
| id          | UUID         | PK                       | Unique identifier |
| name        | VARCHAR(255) | NOT NULL                 | Bank name         |
| description | TEXT         | NULL                     | Description       |
| is_active   | BOOLEAN      | NOT NULL DEFAULT true    | Active flag       |
| created_by  | UUID         | FK -> users.id, NOT NULL | Creator           |
| created_at  | TIMESTAMPTZ  | NOT NULL DEFAULT NOW()   |                   |
| updated_at  | TIMESTAMPTZ  | NOT NULL DEFAULT NOW()   |                   |

#### `questions`

| Column              | Type             | Constraints                       | Description                                  |
| ------------------- | ---------------- | --------------------------------- | -------------------------------------------- |
| id                  | UUID             | PK                                | Unique identifier                            |
| question_bank_id    | UUID             | FK -> question_banks.id, NOT NULL | Parent bank                                  |
| subject_id          | UUID             | FK -> subjects.id, NOT NULL       | Subject                                      |
| topic_id            | UUID             | FK -> topics.id, NULL             | Topic                                        |
| type                | question_type    | NOT NULL                          | Question type                                |
| difficulty          | difficulty_level | NOT NULL DEFAULT 'medium'         | Difficulty                                   |
| cognitive_level     | cognitive_level  | NULL                              | Bloom's level                                |
| marks               | DECIMAL(6,2)     | NOT NULL                          | Positive marks                               |
| negative_marks      | DECIMAL(6,2)     | NOT NULL DEFAULT 0                | Negative marks                               |
| estimated_time_secs | INT              | NULL                              | Estimated time                               |
| content_json        | JSONB            | NOT NULL                          | Question content (text, media refs, formula) |
| media_urls_json     | JSONB            | NULL                              | Media file references                        |
| solution_json       | JSONB            | NULL                              | Solution/explanation                         |
| is_active           | BOOLEAN          | NOT NULL DEFAULT true             | Active flag                                  |
| version             | INT              | NOT NULL DEFAULT 1                | Revision version                             |
| created_by          | UUID             | FK -> users.id, NOT NULL          | Author                                       |
| approved_by         | UUID             | FK -> users.id, NULL              | Approver                                     |
| approved_at         | TIMESTAMPTZ      | NULL                              | Approval time                                |
| usage_count         | INT              | NOT NULL DEFAULT 0                | Times used in exams                          |
| error_count         | INT              | NOT NULL DEFAULT 0                | Reported errors                              |
| created_at          | TIMESTAMPTZ      | NOT NULL DEFAULT NOW()            |                                              |
| updated_at          | TIMESTAMPTZ      | NOT NULL DEFAULT NOW()            |                                              |

#### `question_options`

| Column           | Type         | Constraints                  | Description         |
| ---------------- | ------------ | ---------------------------- | ------------------- |
| id               | UUID         | PK                           | Unique identifier   |
| question_id      | UUID         | FK -> questions.id, NOT NULL | Parent question     |
| option_text      | TEXT         | NOT NULL                     | Option content      |
| option_media_url | VARCHAR(500) | NULL                         | Media for option    |
| is_correct       | BOOLEAN      | NOT NULL                     | Correct answer flag |
| display_order    | INT          | NOT NULL                     | Display order       |
| created_at       | TIMESTAMPTZ  | NOT NULL DEFAULT NOW()       |                     |

#### `question_tags`

| Column      | Type         | Constraints                  | Description       |
| ----------- | ------------ | ---------------------------- | ----------------- |
| id          | UUID         | PK                           | Unique identifier |
| question_id | UUID         | FK -> questions.id, NOT NULL | Parent question   |
| tag         | VARCHAR(100) | NOT NULL                     | Tag value         |
| created_at  | TIMESTAMPTZ  | NOT NULL DEFAULT NOW()       |                   |

**Unique constraint:** `uq_question_tags (question_id, tag)`

#### `question_versions`

| Column         | Type        | Constraints                  | Description           |
| -------------- | ----------- | ---------------------------- | --------------------- |
| id             | UUID        | PK                           | Unique identifier     |
| question_id    | UUID        | FK -> questions.id, NOT NULL | Parent question       |
| version_number | INT         | NOT NULL                     | Version number        |
| content_json   | JSONB       | NOT NULL                     | Full content snapshot |
| changed_by     | UUID        | FK -> users.id, NOT NULL     | Editor                |
| change_reason  | TEXT        | NULL                         | Reason for change     |
| created_at     | TIMESTAMPTZ | NOT NULL DEFAULT NOW()       |                       |

### 5.3 Exam Tables

#### `exams`

| Column               | Type               | Constraints                | Description                |
| -------------------- | ------------------ | -------------------------- | -------------------------- |
| id                   | UUID               | PK                         | Unique identifier          |
| name                 | VARCHAR(255)       | NOT NULL                   | Exam name                  |
| description          | TEXT               | NULL                       | Description                |
| code                 | VARCHAR(50)        | NOT NULL, UNIQUE           | Short code                 |
| duration_minutes     | INT                | NOT NULL, CHECK > 0        | Total duration             |
| total_marks          | DECIMAL(8,2)       | NOT NULL                   | Total marks                |
| passing_marks        | DECIMAL(8,2)       | NULL                       | Pass threshold             |
| has_negative_marking | BOOLEAN            | NOT NULL DEFAULT false     | Negative marking flag      |
| selection_strategy   | selection_strategy | NOT NULL DEFAULT 'static'  | Question selection         |
| navigation_mode      | navigation_mode    | NOT NULL DEFAULT 'free'    | Navigation mode            |
| shuffle_questions    | BOOLEAN            | NOT NULL DEFAULT false     | Shuffle questions          |
| shuffle_options      | BOOLEAN            | NOT NULL DEFAULT false     | Shuffle options            |
| instructions_json    | JSONB              | NULL                       | Pre-exam instructions      |
| result_visibility    | VARCHAR(20)        | NOT NULL DEFAULT 'delayed' | instant/delayed/score_only |
| is_active            | BOOLEAN            | NOT NULL DEFAULT true      | Active flag                |
| created_by           | UUID               | FK -> users.id, NOT NULL   | Creator                    |
| created_at           | TIMESTAMPTZ        | NOT NULL DEFAULT NOW()     |                            |
| updated_at           | TIMESTAMPTZ        | NOT NULL DEFAULT NOW()     |                            |

#### `exam_sections`

| Column                      | Type            | Constraints              | Description              |
| --------------------------- | --------------- | ------------------------ | ------------------------ |
| id                          | UUID            | PK                       | Unique identifier        |
| exam_id                     | UUID            | FK -> exams.id, NOT NULL | Parent exam              |
| name                        | VARCHAR(255)    | NOT NULL                 | Section name             |
| section_order               | INT             | NOT NULL                 | Display order            |
| duration_minutes            | INT             | NULL                     | Section-specific timer   |
| total_marks                 | DECIMAL(8,2)    | NOT NULL                 | Section marks            |
| negative_marking_percentage | DECIMAL(5,2)    | NOT NULL DEFAULT 0       | Negative %               |
| question_count              | INT             | NOT NULL                 | Questions in section     |
| navigation_mode             | navigation_mode | NULL                     | Override exam navigation |
| shuffle_questions           | BOOLEAN         | NOT NULL DEFAULT false   | Shuffle within section   |
| shuffle_options             | BOOLEAN         | NOT NULL DEFAULT false   | Shuffle options          |
| instructions_json           | JSONB           | NULL                     | Section instructions     |
| created_at                  | TIMESTAMPTZ     | NOT NULL DEFAULT NOW()   |                          |
| updated_at                  | TIMESTAMPTZ     | NOT NULL DEFAULT NOW()   |                          |

#### `exam_questions`

| Column          | Type         | Constraints                      | Description        |
| --------------- | ------------ | -------------------------------- | ------------------ |
| id              | UUID         | PK                               | Unique identifier  |
| exam_section_id | UUID         | FK -> exam_sections.id, NOT NULL | Parent section     |
| question_id     | UUID         | FK -> questions.id, NOT NULL     | Question from bank |
| display_order   | INT          | NOT NULL                         | Display order      |
| marks           | DECIMAL(6,2) | NOT NULL                         | Marks (override)   |
| negative_marks  | DECIMAL(6,2) | NOT NULL DEFAULT 0               | Negative marks     |
| is_optional     | BOOLEAN      | NOT NULL DEFAULT false           | Optional flag      |
| created_at      | TIMESTAMPTZ  | NOT NULL DEFAULT NOW()           |                    |

#### `exam_batches`

| Column               | Type         | Constraints              | Description                 |
| -------------------- | ------------ | ------------------------ | --------------------------- |
| id                   | UUID         | PK                       | Unique identifier           |
| exam_id              | UUID         | FK -> exams.id, NOT NULL | Parent exam                 |
| batch_id             | UUID         | FK -> batches.id, NULL   | Candidate batch             |
| center_id            | UUID         | FK -> centers.id, NULL   | Exam center                 |
| name                 | VARCHAR(255) | NOT NULL                 | Batch name                  |
| status               | exam_status  | NOT NULL DEFAULT 'draft' | Lifecycle status            |
| shift_number         | INT          | NOT NULL DEFAULT 1       | Shift number                |
| scheduled_start_at   | TIMESTAMPTZ  | NOT NULL                 | Planned start               |
| scheduled_end_at     | TIMESTAMPTZ  | NOT NULL                 | Planned end                 |
| actual_start_at      | TIMESTAMPTZ  | NULL                     | Actual start                |
| actual_end_at        | TIMESTAMPTZ  | NULL                     | Actual end                  |
| grace_period_minutes | INT          | NOT NULL DEFAULT 5       | Late submission grace       |
| instructions_json    | JSONB        | NULL                     | Batch-specific instructions |
| settings_json        | JSONB        | NULL                     | Batch-specific settings     |
| created_by           | UUID         | FK -> users.id, NOT NULL | Creator                     |
| created_at           | TIMESTAMPTZ  | NOT NULL DEFAULT NOW()   |                             |
| updated_at           | TIMESTAMPTZ  | NOT NULL DEFAULT NOW()   |                             |

#### `exam_schedules`

| Column        | Type        | Constraints                     | Description       |
| ------------- | ----------- | ------------------------------- | ----------------- |
| id            | UUID        | PK                              | Unique identifier |
| exam_batch_id | UUID        | FK -> exam_batches.id, NOT NULL | Parent batch      |
| start_at      | TIMESTAMPTZ | NOT NULL                        | Window start      |
| end_at        | TIMESTAMPTZ | NOT NULL                        | Window end        |
| is_active     | BOOLEAN     | NOT NULL DEFAULT true           | Active flag       |
| created_at    | TIMESTAMPTZ | NOT NULL DEFAULT NOW()          |                   |

### 5.4 Execution Tables

#### `attempts`

| Column                | Type           | Constraints                             | Description                     |
| --------------------- | -------------- | --------------------------------------- | ------------------------------- |
| id                    | UUID           | PK                                      | Unique identifier               |
| exam_batch_id         | UUID           | FK -> exam_batches.id, NOT NULL         | Exam batch                      |
| candidate_id          | UUID           | FK -> candidates.id, NOT NULL           | Candidate                       |
| device_id             | UUID           | FK -> device_registrations.id, NOT NULL | Device                          |
| status                | attempt_status | NOT NULL DEFAULT 'not_started'          | Attempt status                  |
| started_at            | TIMESTAMPTZ    | NULL                                    | Start time                      |
| submitted_at          | TIMESTAMPTZ    | NULL                                    | Submit time                     |
| remaining_time_secs   | INT            | NULL                                    | Timer snapshot (crash recovery) |
| last_question_id_seen | UUID           | NULL                                    | Last question (resume point)    |
| ip_address            | INET           | NULL                                    | Client IP                       |
| user_agent            | TEXT           | NULL                                    | Client user agent               |
| is_reconnected        | BOOLEAN        | NOT NULL DEFAULT false                  | Reconnected flag                |
| reconnected_count     | INT            | NOT NULL DEFAULT 0                      | Reconnect count                 |
| reconnected_at        | TIMESTAMPTZ    | NULL                                    | Last reconnect time             |
| created_at            | TIMESTAMPTZ    | NOT NULL DEFAULT NOW()                  |                                 |
| updated_at            | TIMESTAMPTZ    | NOT NULL DEFAULT NOW()                  |                                 |

**Unique constraint:** `uq_attempts (exam_batch_id, candidate_id)` — one attempt per candidate per exam batch

#### `answers`

| Column               | Type          | Constraints                    | Description       |
| -------------------- | ------------- | ------------------------------ | ----------------- |
| id                   | UUID          | PK                             | Unique identifier |
| attempt_id           | UUID          | FK -> attempts.id, NOT NULL    | Parent attempt    |
| question_id          | UUID          | FK -> questions.id, NOT NULL   | Question          |
| answer_data_json     | JSONB         | NULL                           | Answer content    |
| status               | answer_status | NOT NULL DEFAULT 'not_visited' | Answer status     |
| time_spent_secs      | INT           | NOT NULL DEFAULT 0             | Time on question  |
| is_marked_for_review | BOOLEAN       | NOT NULL DEFAULT false         | Review flag       |
| first_visited_at     | TIMESTAMPTZ   | NULL                           | First visit time  |
| last_updated_at      | TIMESTAMPTZ   | NULL                           | Last modification |
| created_at           | TIMESTAMPTZ   | NOT NULL DEFAULT NOW()         |                   |
| updated_at           | TIMESTAMPTZ   | NOT NULL DEFAULT NOW()         |                   |

**Unique constraint:** `uq_answers (attempt_id, question_id)` — one answer per question per attempt

#### `answer_snapshots`

| Column        | Type        | Constraints                | Description          |
| ------------- | ----------- | -------------------------- | -------------------- |
| id            | UUID        | PK                         | Unique identifier    |
| answer_id     | UUID        | FK -> answers.id, NOT NULL | Parent answer        |
| snapshot_json | JSONB       | NOT NULL                   | Full answer snapshot |
| created_at    | TIMESTAMPTZ | NOT NULL DEFAULT NOW()     | Snapshot time        |

#### `event_logs`

| Column           | Type        | Constraints                 | Description          |
| ---------------- | ----------- | --------------------------- | -------------------- |
| id               | UUID        | PK                          | Unique identifier    |
| attempt_id       | UUID        | FK -> attempts.id, NOT NULL | Parent attempt       |
| event_type       | VARCHAR(50) | NOT NULL                    | Event type           |
| event_data_json  | JSONB       | NULL                        | Event details        |
| severity         | VARCHAR(20) | NOT NULL DEFAULT 'info'     | info/warning/error   |
| client_timestamp | TIMESTAMPTZ | NULL                        | Client-reported time |
| created_at       | TIMESTAMPTZ | NOT NULL DEFAULT NOW()      | Server time          |

#### `violation_reports`

| Column         | Type               | Constraints                 | Description       |
| -------------- | ------------------ | --------------------------- | ----------------- |
| id             | UUID               | PK                          | Unique identifier |
| attempt_id     | UUID               | FK -> attempts.id, NOT NULL | Parent attempt    |
| violation_type | violation_type     | NOT NULL                    | Violation type    |
| severity       | violation_severity | NOT NULL                    | Severity level    |
| description    | TEXT               | NOT NULL                    | Description       |
| evidence_url   | VARCHAR(500)       | NULL                        | Evidence media    |
| proctor_action | proctoring_action  | NULL                        | Action taken      |
| proctor_id     | UUID               | FK -> users.id, NULL        | Acting proctor    |
| is_resolved    | BOOLEAN            | NOT NULL DEFAULT false      | Resolution flag   |
| resolved_at    | TIMESTAMPTZ        | NULL                        | Resolution time   |
| resolved_by    | UUID               | FK -> users.id, NULL        | Resolver          |
| created_at     | TIMESTAMPTZ        | NOT NULL DEFAULT NOW()      |                   |
| updated_at     | TIMESTAMPTZ        | NOT NULL DEFAULT NOW()      |                   |

### 5.5 Results Tables

#### `scores`

| Column              | Type         | Constraints                         | Description           |
| ------------------- | ------------ | ----------------------------------- | --------------------- |
| id                  | UUID         | PK                                  | Unique identifier     |
| attempt_id          | UUID         | FK -> attempts.id, NOT NULL, UNIQUE | Parent attempt        |
| total_marks         | DECIMAL(8,2) | NOT NULL                            | Exam total            |
| marks_obtained      | DECIMAL(8,2) | NOT NULL                            | Raw score             |
| negative_marks      | DECIMAL(8,2) | NOT NULL DEFAULT 0                  | Negative deduction    |
| net_score           | DECIMAL(8,2) | NOT NULL                            | Final score           |
| is_passed           | BOOLEAN      | NOT NULL                            | Pass/fail             |
| section_scores_json | JSONB        | NULL                                | Per-section breakdown |
| created_at          | TIMESTAMPTZ  | NOT NULL DEFAULT NOW()              |                       |

#### `scorecards`

| Column       | Type         | Constraints                         | Description       |
| ------------ | ------------ | ----------------------------------- | ----------------- |
| id           | UUID         | PK                                  | Unique identifier |
| attempt_id   | UUID         | FK -> attempts.id, NOT NULL, UNIQUE | Parent attempt    |
| candidate_id | UUID         | FK -> candidates.id, NOT NULL       | Candidate         |
| rank         | INT          | NULL                                | Rank in batch     |
| percentile   | DECIMAL(6,3) | NULL                                | Percentile        |
| total_score  | DECIMAL(8,2) | NOT NULL                            | Score             |
| generated_at | TIMESTAMPTZ  | NOT NULL DEFAULT NOW()              | Generation time   |
| pdf_url      | VARCHAR(500) | NULL                                | PDF file path     |
| created_at   | TIMESTAMPTZ  | NOT NULL DEFAULT NOW()              |                   |

#### `analytics_snapshots`

| Column        | Type        | Constraints                     | Description         |
| ------------- | ----------- | ------------------------------- | ------------------- |
| id            | UUID        | PK                              | Unique identifier   |
| exam_batch_id | UUID        | FK -> exam_batches.id, NOT NULL | Parent batch        |
| snapshot_json | JSONB       | NOT NULL                        | Full analytics data |
| snapshot_type | VARCHAR(20) | NOT NULL                        | batch/institution   |
| created_at    | TIMESTAMPTZ | NOT NULL DEFAULT NOW()          |                     |

#### `certificates`

| Column             | Type         | Constraints                   | Description        |
| ------------------ | ------------ | ----------------------------- | ------------------ |
| id                 | UUID         | PK                            | Unique identifier  |
| attempt_id         | UUID         | FK -> attempts.id, NOT NULL   | Parent attempt     |
| candidate_id       | UUID         | FK -> candidates.id, NOT NULL | Candidate          |
| certificate_number | VARCHAR(50)  | NOT NULL, UNIQUE              | Certificate number |
| template_id        | UUID         | NULL                          | Template reference |
| issued_at          | TIMESTAMPTZ  | NOT NULL DEFAULT NOW()        | Issue time         |
| pdf_url            | VARCHAR(500) | NULL                          | PDF file path      |
| created_at         | TIMESTAMPTZ  | NOT NULL DEFAULT NOW()        |                    |

### 5.6 Security Tables

#### `device_registrations`

| Column        | Type          | Constraints                   | Description          |
| ------------- | ------------- | ----------------------------- | -------------------- |
| id            | UUID          | PK                            | Unique identifier    |
| device_id     | VARCHAR(255)  | NOT NULL, UNIQUE              | Device identifier    |
| device_name   | VARCHAR(255)  | NULL                          | Machine name         |
| mac_address   | VARCHAR(17)   | NOT NULL                      | MAC address          |
| hardware_hash | VARCHAR(255)  | NOT NULL                      | Hardware fingerprint |
| ip_address    | INET          | NULL                          | Last known IP        |
| center_id     | UUID          | FK -> centers.id, NULL        | Assigned center      |
| status        | device_status | NOT NULL DEFAULT 'registered' | Device status        |
| registered_by | UUID          | FK -> users.id, NOT NULL      | Registrar            |
| last_seen_at  | TIMESTAMPTZ   | NULL                          | Last heartbeat       |
| created_at    | TIMESTAMPTZ   | NOT NULL DEFAULT NOW()        |                      |
| updated_at    | TIMESTAMPTZ   | NOT NULL DEFAULT NOW()        |                      |

#### `session_tokens`

| Column     | Type         | Constraints                         | Description       |
| ---------- | ------------ | ----------------------------------- | ----------------- |
| id         | UUID         | PK                                  | Unique identifier |
| user_id    | UUID         | FK -> users.id, NOT NULL            | User              |
| token_jti  | VARCHAR(255) | NOT NULL, UNIQUE                    | JWT ID            |
| token_type | VARCHAR(10)  | NOT NULL                            | access/refresh    |
| device_id  | UUID         | FK -> device_registrations.id, NULL | Bound device      |
| attempt_id | UUID         | FK -> attempts.id, NULL             | Bound attempt     |
| expires_at | TIMESTAMPTZ  | NOT NULL                            | Expiry time       |
| is_revoked | BOOLEAN      | NOT NULL DEFAULT false              | Revocation flag   |
| revoked_at | TIMESTAMPTZ  | NULL                                | Revocation time   |
| created_at | TIMESTAMPTZ  | NOT NULL DEFAULT NOW()              |                   |
| updated_at | TIMESTAMPTZ  | NOT NULL DEFAULT NOW()              |                   |

#### `audit_logs`

| Column         | Type         | Constraints            | Description               |
| -------------- | ------------ | ---------------------- | ------------------------- |
| id             | UUID         | PK                     | Unique identifier         |
| user_id        | UUID         | FK -> users.id, NULL   | Actor (NULL for system)   |
| action         | audit_action | NOT NULL               | Action type               |
| resource_type  | VARCHAR(100) | NOT NULL               | Resource type             |
| resource_id    | UUID         | NULL                   | Resource ID               |
| old_value_json | JSONB        | NULL                   | Before state              |
| new_value_json | JSONB        | NULL                   | After state               |
| ip_address     | INET         | NULL                   | Source IP                 |
| user_agent     | TEXT         | NULL                   | Client info               |
| timestamp      | TIMESTAMPTZ  | NOT NULL DEFAULT NOW() | Action time               |
| prev_hash      | VARCHAR(64)  | NULL                   | Previous log hash (chain) |
| current_hash   | VARCHAR(64)  | NOT NULL               | Current log hash          |
| created_at     | TIMESTAMPTZ  | NOT NULL DEFAULT NOW() |                           |

#### `proctoring_events`

| Column          | Type         | Constraints                 | Description       |
| --------------- | ------------ | --------------------------- | ----------------- |
| id              | UUID         | PK                          | Unique identifier |
| attempt_id      | UUID         | FK -> attempts.id, NOT NULL | Parent attempt    |
| event_type      | VARCHAR(50)  | NOT NULL                    | Event type        |
| event_data_json | JSONB        | NULL                        | Event details     |
| media_url       | VARCHAR(500) | NULL                        | Media evidence    |
| created_at      | TIMESTAMPTZ  | NOT NULL DEFAULT NOW()      |                   |

### 5.7 Configuration Tables

#### `system_settings`

| Column      | Type         | Constraints            | Description          |
| ----------- | ------------ | ---------------------- | -------------------- |
| id          | UUID         | PK                     | Unique identifier    |
| key         | VARCHAR(100) | NOT NULL, UNIQUE       | Setting key          |
| value       | TEXT         | NOT NULL               | Setting value        |
| value_type  | VARCHAR(20)  | NOT NULL               | string/int/bool/json |
| description | TEXT         | NULL                   | Description          |
| is_editable | BOOLEAN      | NOT NULL DEFAULT true  | Editable flag        |
| updated_by  | UUID         | FK -> users.id, NULL   | Last editor          |
| updated_at  | TIMESTAMPTZ  | NOT NULL DEFAULT NOW() |                      |
| created_at  | TIMESTAMPTZ  | NOT NULL DEFAULT NOW() |                      |

#### `security_policies`

| Column        | Type         | Constraints            | Description       |
| ------------- | ------------ | ---------------------- | ----------------- |
| id            | UUID         | PK                     | Unique identifier |
| policy_name   | VARCHAR(100) | NOT NULL, UNIQUE       | Policy name       |
| description   | TEXT         | NULL                   | Description       |
| settings_json | JSONB        | NOT NULL               | Policy settings   |
| is_active     | BOOLEAN      | NOT NULL DEFAULT true  | Active flag       |
| created_at    | TIMESTAMPTZ  | NOT NULL DEFAULT NOW() |                   |
| updated_at    | TIMESTAMPTZ  | NOT NULL DEFAULT NOW() |                   |

#### `proctoring_configs`

| Column                | Type        | Constraints                             | Description         |
| --------------------- | ----------- | --------------------------------------- | ------------------- |
| id                    | UUID        | PK                                      | Unique identifier   |
| exam_batch_id         | UUID        | FK -> exam_batches.id, NOT NULL, UNIQUE | Parent batch        |
| enable_ai_proctoring  | BOOLEAN     | NOT NULL DEFAULT false                  | AI flag             |
| enable_webcam         | BOOLEAN     | NOT NULL DEFAULT false                  | Webcam flag         |
| enable_screen_capture | BOOLEAN     | NOT NULL DEFAULT false                  | Screen capture      |
| sensitivity_level     | VARCHAR(20) | NOT NULL DEFAULT 'medium'               | low/medium/high     |
| settings_json         | JSONB       | NULL                                    | Additional settings |
| created_at            | TIMESTAMPTZ | NOT NULL DEFAULT NOW()                  |                     |
| updated_at            | TIMESTAMPTZ | NOT NULL DEFAULT NOW()                  |                     |

---

## 6. INDEX STRATEGY

### 6.1 Primary Indexes (All tables)

All tables have `PRIMARY KEY (id)` using UUID with B-tree index.

### 6.2 Foreign Key Indexes

Every foreign key column gets an index for join performance:

```sql
-- Users
CREATE INDEX idx_users_institution_id ON users(institution_id);
CREATE INDEX idx_users_role ON users(role);

-- Candidates
CREATE INDEX idx_candidates_user_id ON candidates(user_id);
CREATE INDEX idx_candidates_batch_id ON candidates(batch_id);

-- Questions
CREATE INDEX idx_questions_question_bank_id ON questions(question_bank_id);
CREATE INDEX idx_questions_subject_id ON questions(subject_id);
CREATE INDEX idx_questions_topic_id ON questions(topic_id);
CREATE INDEX idx_questions_type ON questions(type);
CREATE INDEX idx_questions_difficulty ON questions(difficulty);
CREATE INDEX idx_questions_is_active ON questions(is_active);

-- Question options
CREATE INDEX idx_question_options_question_id ON question_options(question_id);

-- Exam sections
CREATE INDEX idx_exam_sections_exam_id ON exam_sections(exam_id);

-- Exam questions
CREATE INDEX idx_exam_questions_exam_section_id ON exam_questions(exam_section_id);
CREATE INDEX idx_exam_questions_question_id ON exam_questions(question_id);

-- Exam batches
CREATE INDEX idx_exam_batches_exam_id ON exam_batches(exam_id);
CREATE INDEX idx_exam_batches_center_id ON exam_batches(center_id);
CREATE INDEX idx_exam_batches_status ON exam_batches(status);
CREATE INDEX idx_exam_batches_scheduled_start ON exam_batches(scheduled_start_at);

-- Attempts
CREATE INDEX idx_attempts_exam_batch_id ON attempts(exam_batch_id);
CREATE INDEX idx_attempts_candidate_id ON attempts(candidate_id);
CREATE INDEX idx_attempts_device_id ON attempts(device_id);
CREATE INDEX idx_attempts_status ON attempts(status);

-- Answers (CRITICAL - high write volume)
CREATE INDEX idx_answers_attempt_id ON answers(attempt_id);
CREATE INDEX idx_answers_question_id ON answers(question_id);
CREATE INDEX idx_answers_status ON answers(status);

-- Event logs
CREATE INDEX idx_event_logs_attempt_id ON event_logs(attempt_id);
CREATE INDEX idx_event_logs_event_type ON event_logs(event_type);
CREATE INDEX idx_event_logs_created_at ON event_logs(created_at);

-- Violation reports
CREATE INDEX idx_violation_reports_attempt_id ON violation_reports(attempt_id);
CREATE INDEX idx_violation_reports_severity ON violation_reports(severity);

-- Audit logs
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);

-- Session tokens
CREATE INDEX idx_session_tokens_user_id ON session_tokens(user_id);
CREATE INDEX idx_session_tokens_token_jti ON session_tokens(token_jti);
CREATE INDEX idx_session_tokens_expires_at ON session_tokens(expires_at);
CREATE INDEX idx_session_tokens_is_revoked ON session_tokens(is_revoked);

-- Device registrations
CREATE INDEX idx_device_registrations_center_id ON device_registrations(center_id);
CREATE INDEX idx_device_registrations_status ON device_registrations(status);
```

### 6.3 Composite Indexes (Critical for Performance)

```sql
-- CRITICAL: Answer lookup by attempt + question (high-frequency UPSERT)
CREATE INDEX idx_answers_attempt_question ON answers(attempt_id, question_id);

-- Attempt lookup by batch + candidate (login flow)
CREATE INDEX idx_attempts_batch_candidate ON attempts(exam_batch_id, candidate_id);

-- Exam batch candidate lookup
CREATE INDEX idx_exam_batch_candidate_batch ON exam_batch_candidate(exam_batch_id);
CREATE INDEX idx_exam_batch_candidate_candidate ON exam_batch_candidate(candidate_id);

-- Question filtering by subject + difficulty (question bank UI)
CREATE INDEX idx_questions_subject_difficulty ON questions(subject_id, difficulty);

-- Question filtering by subject + topic (question bank UI)
CREATE INDEX idx_questions_subject_topic ON questions(subject_id, topic_id);

-- Audit log search by user + action + time
CREATE INDEX idx_audit_logs_user_action_time ON audit_logs(user_id, action, timestamp);

-- Event log search by attempt + time
CREATE INDEX idx_event_logs_attempt_time ON event_logs(attempt_id, created_at);

-- Score lookup by batch (rank calculation)
CREATE INDEX idx_scores_attempt_batch ON scores(attempt_id);
```

### 6.4 JSONB GIN Indexes

```sql
-- Question content search (JSONB)
CREATE INDEX idx_questions_content_gin ON questions USING GIN (content_json);

-- Answer data search (JSONB)
CREATE INDEX idx_answers_data_gin ON answers USING GIN (answer_data_json);

-- Exam settings search (JSONB)
CREATE INDEX idx_exam_batches_settings_gin ON exam_batches USING GIN (settings_json);
```

---

## 7. PARTITION STRATEGY

### 7.1 High-Volume Tables

Two tables are expected to have very high volume and should be partitioned:

#### `answers` — Partition by `attempt_id` range

```sql
-- Partition answers by exam batch (via attempt_id relationship)
-- Strategy: Partition by created_at month for archival efficiency
CREATE TABLE answers (
  id UUID DEFAULT uuidv7(),
  attempt_id UUID NOT NULL,
  question_id UUID NOT NULL,
  answer_data_json JSONB,
  status answer_status NOT NULL DEFAULT 'not_visited',
  time_spent_secs INT NOT NULL DEFAULT 0,
  is_marked_for_review BOOLEAN NOT NULL DEFAULT false,
  first_visited_at TIMESTAMPTZ,
  last_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Monthly partitions
CREATE TABLE answers_2026_07 PARTITION OF answers
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE answers_2026_08 PARTITION OF answers
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
-- ... future partitions created by cron job
```

#### `event_logs` — Partition by `created_at` month

```sql
CREATE TABLE event_logs (
  id UUID DEFAULT uuidv7(),
  attempt_id UUID NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_data_json JSONB,
  severity VARCHAR(20) NOT NULL DEFAULT 'info',
  client_timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Monthly partitions
CREATE TABLE event_logs_2026_07 PARTITION OF event_logs
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
```

#### `audit_logs` — Partition by `created_at` month

```sql
CREATE TABLE audit_logs (
  id UUID DEFAULT uuidv7(),
  user_id UUID,
  action audit_action NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id UUID,
  old_value_json JSONB,
  new_value_json JSONB,
  ip_address INET,
  user_agent TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prev_hash VARCHAR(64),
  current_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
```

### 7.2 Partition Management

| Task                     | Implementation                                                   |
| ------------------------ | ---------------------------------------------------------------- |
| Create future partitions | Cron job / scheduled task creates partitions 3 months in advance |
| Archive old partitions   | Detach partitions older than 1 year; export to archive           |
| Partition pruning        | Queries with `created_at` filter automatically prune partitions  |

---

## 8. CONSTRAINTS SUMMARY

### 8.1 Check Constraints

```sql
ALTER TABLE exams ADD CONSTRAINT ck_exams_duration_positive CHECK (duration_minutes > 0);
ALTER TABLE exams ADD CONSTRAINT ck_exams_total_marks_positive CHECK (total_marks > 0);
ALTER TABLE exam_sections ADD CONSTRAINT ck_exam_sections_order_positive CHECK (section_order > 0);
ALTER TABLE exam_sections ADD CONSTRAINT ck_exam_sections_question_count CHECK (question_count > 0);
ALTER TABLE questions ADD CONSTRAINT ck_questions_marks_positive CHECK (marks > 0);
ALTER TABLE questions ADD CONSTRAINT ck_questions_negative_marks CHECK (negative_marks >= 0);
ALTER TABLE attempts ADD CONSTRAINT ck_attempts_remaining_time CHECK (remaining_time_secs >= 0);
ALTER TABLE answers ADD CONSTRAINT ck_answers_time_spent CHECK (time_spent_secs >= 0);
ALTER TABLE scores ADD CONSTRAINT ck_scores_marks CHECK (marks_obtained >= 0 AND net_score >= 0);
```

### 8.2 Unique Constraints

```sql
ALTER TABLE users ADD CONSTRAINT uq_users_email UNIQUE (email);
ALTER TABLE institutions ADD CONSTRAINT uq_institutions_code UNIQUE (code);
ALTER TABLE centers ADD CONSTRAINT uq_centers_code UNIQUE (code);
ALTER TABLE subjects ADD CONSTRAINT uq_subjects_code UNIQUE (code);
ALTER TABLE exams ADD CONSTRAINT uq_exams_code UNIQUE (code);
ALTER TABLE device_registrations ADD CONSTRAINT uq_device_registrations_device_id UNIQUE (device_id);
ALTER TABLE session_tokens ADD CONSTRAINT uq_session_tokens_token_jti UNIQUE (token_jti);
ALTER TABLE attempts ADD CONSTRAINT uq_attempts_batch_candidate UNIQUE (exam_batch_id, candidate_id);
ALTER TABLE answers ADD CONSTRAINT uq_answers_attempt_question UNIQUE (attempt_id, question_id);
ALTER TABLE exam_batch_candidate ADD CONSTRAINT uq_exam_batch_candidate UNIQUE (exam_batch_id, candidate_id);
ALTER TABLE question_tags ADD CONSTRAINT uq_question_tags UNIQUE (question_id, tag);
ALTER TABLE certificates ADD CONSTRAINT uq_certificates_number UNIQUE (certificate_number);
ALTER TABLE system_settings ADD CONSTRAINT uq_system_settings_key UNIQUE (key);
ALTER TABLE security_policies ADD CONSTRAINT uq_security_policies_name UNIQUE (policy_name);
```

### 8.3 Foreign Key Cascade Rules

| FK                                                 | Rule               | Rationale                             |
| -------------------------------------------------- | ------------------ | ------------------------------------- |
| users.institution_id -> institutions.id            | ON DELETE SET NULL | Keep user even if institution deleted |
| centers.institution_id -> institutions.id          | ON DELETE CASCADE  | Delete centers with institution       |
| batches.center_id -> centers.id                    | ON DELETE CASCADE  | Delete batches with center            |
| questions.question_bank_id -> question_banks.id    | ON DELETE RESTRICT | Never delete bank with questions      |
| question_options.question_id -> questions.id       | ON DELETE CASCADE  | Delete options with question          |
| exam_sections.exam_id -> exams.id                  | ON DELETE CASCADE  | Delete sections with exam             |
| exam_questions.exam_section_id -> exam_sections.id | ON DELETE CASCADE  | Delete with section                   |
| exam_batches.exam_id -> exams.id                   | ON DELETE RESTRICT | Never delete exam with batches        |
| attempts.exam_batch_id -> exam_batches.id          | ON DELETE RESTRICT | Never delete batch with attempts      |
| answers.attempt_id -> attempts.id                  | ON DELETE CASCADE  | Delete answers with attempt           |
| event_logs.attempt_id -> attempts.id               | ON DELETE CASCADE  | Delete logs with attempt              |
| scores.attempt_id -> attempts.id                   | ON DELETE CASCADE  | Delete scores with attempt            |
| session_tokens.user_id -> users.id                 | ON DELETE CASCADE  | Delete tokens with user               |

---

## 9. ENCRYPTION STRATEGY

### 9.1 Encryption at Rest

| Data                                              | Encryption Method                               | Justification                                                  |
| ------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------- |
| Question content (`content_json`)                 | Application-level AES-256-GCM                   | Questions are high-value; encrypt before storing               |
| Question options (`option_text` for correct flag) | Application-level AES-256-GCM                   | Prevent direct DB access revealing answers                     |
| Answer data (`answer_data_json`)                  | Not encrypted (protected by DB access controls) | Answers need frequent read/write; DB-level security sufficient |
| Password hashes                                   | bcrypt (cost factor 12)                         | Industry standard                                              |
| Audit log hash chain                              | SHA-256 chaining                                | Tamper-evident                                                 |

### 9.2 Encryption Implementation

```
Application Layer:
  - AES-256-GCM for question content encryption/decryption
  - Key stored in environment variable (never in database)
  - Key rotation: documented procedure (re-encrypt all questions)

Database Layer:
  - PostgreSQL TLS for connections (if needed on LAN)
  - Column-level encryption for sensitive fields (via application)
  - pgcrypto extension for additional crypto functions if needed
```

---

## 10. MIGRATION PLAN

### 10.1 Migration Order

Migrations must be applied in dependency order:

```
Migration 001: Create enum types
  ↓
Migration 002: Create organizational tables (institutions, users, roles, permissions)
  ↓
Migration 003: Create center/batch tables (centers, batches, candidates, exam_batch_candidate)
  ↓
Migration 004: Create academic tables (subjects, topics, question_banks, questions, question_options, question_tags, question_versions)
  ↓
Migration 005: Create exam tables (exams, exam_sections, exam_questions, exam_batches, exam_schedules)
  ↓
Migration 006: Create execution tables (attempts, answers, answer_snapshots, event_logs, violation_reports)
  ↓
Migration 007: Create results tables (scores, scorecards, analytics_snapshots, certificates)
  ↓
Migration 008: Create security tables (device_registrations, session_tokens, audit_logs, proctoring_events)
  ↓
Migration 009: Create configuration tables (system_settings, security_policies, proctoring_configs)
  ↓
Migration 010: Create all indexes
  ↓
Migration 011: Create partitioned tables (answers, event_logs, audit_logs)
  ↓
Migration 012: Seed default data (super_admin user, default roles, default permissions, default system settings)
```

### 10.2 Migration Tooling

| Tool                  | Purpose                                                          |
| --------------------- | ---------------------------------------------------------------- |
| Drizzle Kit           | Schema versioning, migration generation (`drizzle-kit generate`) |
| `drizzle-kit push`    | Development: push schema changes directly                        |
| `drizzle-kit migrate` | Production: apply pending migrations                             |
| `drizzle-kit studio`  | Visual database browser and inspector                            |

### 10.3 Seed Data

```sql
-- Default super admin
INSERT INTO users (email, password_hash, full_name, role)
VALUES ('admin@cbt.local', '<argon2id_hash>', 'Super Admin', 'super_admin');

-- Default roles
INSERT INTO roles (name, description) VALUES
  ('super_admin', 'Full system access'),
  ('exam_admin', 'Exam management and monitoring'),
  ('proctor', 'Live exam monitoring and intervention'),
  ('question_author', 'Question bank management'),
  ('candidate', 'Take exams');

-- Default permissions (role -> resource -> action)
-- super_admin: ALL resources, ALL actions
-- exam_admin: exams, question_banks, candidates, results, monitoring (CRUD)
-- proctor: monitoring, violations (READ, UPDATE)
-- question_author: questions, question_banks (CRUD)
-- candidate: exams, answers (READ, UPDATE own)

-- Default system settings
INSERT INTO system_settings (key, value, value_type, description) VALUES
  ('jwt_access_token_expiry_minutes', '15', 'int', 'Access token expiry'),
  ('jwt_refresh_token_expiry_hours', '24', 'int', 'Refresh token expiry'),
  ('heartbeat_interval_seconds', '30', 'int', 'Client heartbeat interval'),
  ('max_heartbeat_misses', '3', 'int', 'Disconnect threshold'),
  ('answer_save_batch_size', '10', 'int', 'Max answers per batch sync'),
  ('max_concurrent_connections', '600', 'int', 'WebSocket connection limit'),
  ('rate_limit_api_per_minute', '120', 'int', 'API rate limit'),
  ('rate_limit_ws_per_second', '30', 'int', 'WebSocket rate limit'),
  ('min_password_length', '8', 'int', 'Minimum password length'),
  ('max_login_attempts', '5', 'int', 'Max failed login attempts'),
  ('lockout_duration_minutes', '15', 'int', 'Account lockout duration');
```

---

## 11. PERFORMANCE CONSIDERATIONS

### 11.1 Connection Pooling

| Setting                           | Value | Rationale                                         |
| --------------------------------- | ----- | ------------------------------------------------- |
| `max_connections`                 | 200   | 500 clients + admin + internal = ~150-180 peak    |
| Drizzle connection pool (pg-pool) | 20    | Shared across all queries; sufficient for Fastify |

### 11.2 PostgreSQL 18 Configuration (LAN Deployment)

```ini
# postgresql.conf (PostgreSQL 18, tuned for 16GB RAM, 8-core server)
shared_buffers = 4GB              # 25% of RAM
effective_cache_size = 12GB       # 75% of RAM
work_mem = 64MB                   # Per-query sort/hash
maintenance_work_mem = 512MB      # Vacuum, index creation
max_connections = 200             # Connection limit
random_page_cost = 1.1            # SSD-optimized
effective_io_concurrency = 16     # PG18 default (was 200 in PG16); tuned for async I/O
io_method = worker                # PG18 async I/O (default in 18.x)
wal_buffers = 16MB                # WAL write buffer
checkpoint_completion_target = 0.9
min_wal_size = 1GB
max_wal_size = 4GB
synchronous_commit = normal       # Balance durability vs write performance
```

### 11.3 Query Optimization

| Query Pattern                | Optimization                                                 |
| ---------------------------- | ------------------------------------------------------------ |
| Answer UPSERT                | `INSERT ... ON CONFLICT (attempt_id, question_id) DO UPDATE` |
| Rank calculation             | Window function: `RANK() OVER (ORDER BY net_score DESC)`     |
| Percentile                   | `PERCENT_RANK() OVER (ORDER BY net_score ASC)`               |
| Question selection (random)  | `ORDER BY RANDOM() LIMIT N` with subject/difficulty filter   |
| Live monitoring snapshot     | Single query with `COUNT` + `GROUP BY status`                |
| Audit log chain verification | Sequential scan with hash recomputation                      |

---

## 12. DOCUMENT METADATA

| Field                | Value                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Document Version** | 2.0 (Architecture Frozen)                                                                                                                |
| **Date Created**     | 2026-07-16                                                                                                                               |
| **Status**           | FROZEN — Architecture v1.0                                                                                                               |
| **Author**           | AI Agent (Architect Mode)                                                                                                                |
| **Prerequisites**    | PRD v2.0 (Frozen), TDR v2.0 (Frozen), SAD v2.0 (Frozen)                                                                                  |
| **Freeze Rule**      | Changes require: business requirement change, security issue, prototype failure, or performance test failure. No changes for preference. |
| **Tables**           | 30 tables across 7 entity groups                                                                                                         |
| **Enums**            | 12 enum types                                                                                                                            |
| **Indexes**          | 40+ indexes (FK, composite, GIN)                                                                                                         |
