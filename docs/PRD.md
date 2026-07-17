# PRODUCT REQUIREMENTS DOCUMENT (PRD)

# Competitive Computer Based Test (CBT/CBE) Platform

---

## 1. PROJECT OVERVIEW

### 1.1 Objective

Build a production-grade Competitive CBT Platform comparable to enterprise systems used for competitive examinations (e.g., JEE, NEET, UPSC, banking recruitment, university entrance). The platform must handle high-stakes, high-concurrency exams with integrity, security, and reliability.

### 1.2 Scope

- **IN SCOPE:** Software platform only — Backend Server, Admin Dashboard, Exam Client Application, Question Bank Management, Exam Session Management, Results & Analytics, Security & Proctoring, Reporting.
- **OUT OF SCOPE:** Infrastructure — Windows OS, Exam Client auto-start, LAN setup, DHCP, NetBoot, Kiosk Mode configuration, Group Policy. All assumed to exist and be managed separately.

### 1.3 Target Users

| Role                                | Description                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| **Super Admin**                     | Full system control, all modules, configuration, audit.                            |
| **Exam Administrator**              | Create/schedule exams, manage question banks, monitor live exams, publish results. |
| **Proctor/Invigilator**             | Monitor live exam sessions, view alerts, intervene on violations.                  |
| **Question Author/Content Creator** | Create/edit questions, manage question banks, import/export.                       |
| **Candidate/Student**               | Take exams in a secure, locked-down environment.                                   |

### 1.4 Performance Targets

- **Design Capacity:** 500 concurrent candidates on a single server
- **Validation Targets:** 750 (normal stress test), 1,000 (peak stress test)
- **Deployment:** Single exam center, single physical server, LAN only
- Minimize CPU, RAM, network traffic
- Prefer event-driven communication (WebSocket) over polling
- Sub-500ms response time for exam interactions

### 1.5 Server Specification (Reference)

| Resource | Minimum                        | Recommended             |
| -------- | ------------------------------ | ----------------------- |
| CPU      | 8 cores                        | 16 cores                |
| RAM      | 16 GB                          | 32 GB                   |
| Storage  | 500 GB SSD                     | 1 TB NVMe SSD           |
| Network  | 1 Gbps LAN                     | 1 Gbps LAN              |
| OS       | Ubuntu Server / Windows Server | Ubuntu Server 24.04 LTS |

---

## 2. SYSTEM ARCHITECTURE (RESEARCHED)

### 2.1 Architecture Pattern

Based on research of enterprise CBT platforms (Bynaric, Addmen, ConductExam, Mazatron, ThinkExam, SchoolShell, Decabin), the recommended architecture is:

**LAN-Based, Offline-First, Client-Server Architecture with Real-Time WebSocket Communication**

- Exam Server runs on a local machine within the exam center LAN
- Exam Client connects to server over LAN (no internet required for exam delivery)
- Admin Dashboard is a web application accessible from admin/proctor machines on the same LAN
- All data stays within the premises (zero external network exposure)
- Optional cloud sync for post-exam data aggregation and centralized result processing

### 2.2 Core Components

#### A. Exam Server (Backend)

- REST API for CRUD operations (exam creation, question bank, user management, results)
- WebSocket server for real-time exam session management, live monitoring, proctoring feeds
- Authentication & authorization service (JWT-based, role-based access control)
- Exam session lifecycle manager (scheduled -> active -> paused -> finished)
- Auto-grading engine for objective questions
- Result processing & analytics engine
- Audit logging service (all admin actions, candidate events, security incidents)
- Encrypted question bank storage & delivery
- Device registration & validation service
- Backup & recovery service

#### B. Admin Dashboard (Web Application)

- **Dashboard Overview:** Real-time view of active sessions, server health, candidate counts, system alerts
- **Question Bank Management:** Create/edit/import/export questions, tag by subject/topic/difficulty, support 20+ question types (MCQ, multi-select, fill-in-blank, essay, drag-drop, matching matrix, audio/video, formula, image-based)
- **Exam Creation Wizard:** Configure exam parameters (duration, sections, marking scheme, negative marking, pass/fail thresholds, question selection strategy — static/dynamic/randomized, shuffle options, section-wise timing)
- **Exam Scheduling:** Date/time windows, shift management, center allocation, candidate batch assignment
- **Candidate Management:** Bulk import (CSV/Excel), registration, admit card generation, credential assignment
- **Live Exam Monitoring:** Real-time dashboard showing all active sessions, candidate status (in-progress/submitted/disconnected), proctoring alerts, tab-switch violations, connection health
- **Proctoring Console:** View candidate webcam feeds (if enabled), screen activity, violation alerts, escalation actions (warn/pause/terminate)
- **Results & Analytics:** Auto-grading, percentile calculation, subject-wise breakdown, question difficulty index, item analysis (IRT), scorecard generation, certificate generation, export to PDF/Excel
- **User & Role Management:** Admin/sub-admin/content creator/proctor roles, granular permissions
- **Audit Trail:** All admin actions logged, tamper-evident logs, exportable audit reports
- **System Configuration:** Server settings, security policies, proctoring sensitivity, backup schedules

#### C. Exam Client (Candidate-Facing Application)

**Login & Authentication:**

- Candidate credentials, biometric/photo verification (optional), device registration validation

**Exam Interface:**

- Question display with all supported types (MCQ, essay, fill-in-blank, etc.)
- Countdown timer (exam-level and section-level)
- Question palette/navigation grid (answered/unanswered/marked-for-review/visited)
- Section navigation with section-wise timing
- Mark for review functionality
- Question status indicators
- Auto-save answers (every keystroke/selection is a transaction)
- Auto-submit on timer expiry
- Submit confirmation screen with summary

**Security & Lockdown:**

- Kiosk mode (full-screen, no navigation elements)
- Disable Alt+Tab, Alt+F4, Ctrl+Alt+Del, Print Screen, right-click
- Block task bar, start menu, other applications
- Tab-switch/window-switch detection and logging
- VM detection (refuse to run on virtual machines)
- URL filter (only allow exam server)
- Certificate pinning (prevent MITM)
- Clipboard disabled
- Screen recording blocked
- Process monitoring (terminate/hide unauthorized processes)

**Offline Resilience:**

- State-aware local storage — if connection drops, exam continues locally
- Atomic data commit protocol — every answer is a transaction
- Auto-reconnect and encrypted micro-packet sync when connection restores
- Zero data loss guarantee

**Accessibility:**

- High-contrast mode
- Font size adjustment
- Screen reader compatibility
- Extra time allocation for accommodations
- Multi-language/Unicode support

#### D. Database Layer

Based on researched enterprise schemas (Academic Suite, Examinator, ConductExam):

**Key Entity Groups:**

1. **Organizational:** institutions, users, roles, classes/batches, centers
2. **Academic:** subjects, topics, question_banks, questions, question_options, question_tags
3. **Exam:** exams (blueprints), exam_sections, exam_batches (sessions), exam_schedules, candidate_assignments
4. **Execution:** attempts, answers, answer_snapshots, event_logs (anti-cheating)
5. **Results:** scores, scorecards, analytics_snapshots, certificates
6. **Security:** audit_logs, device_registrations, session_tokens, proctoring_events, violation_reports
7. **Configuration:** system_settings, security_policies, proctoring_configs

**Critical Design Decisions:**

- Relational database (PostgreSQL recommended) for ACID compliance on exam data
- Composite index on (attempt_id, question_id) for high-write answer table
- Store remaining_time snapshot for crash recovery
- JSON columns for flexible question metadata
- Encrypted storage for question bank content
- Partitioning for high-volume tables (answers, event_logs)

---

## 3. DETAILED FEATURE SPECIFICATIONS

### 3.1 Question Bank Management

- **Question Types:** MCQ (single correct), MCQ (multiple correct), Fill-in-the-blank, Essay/Subjective, Drag-and-drop, Matching matrix, Assertion-Reason, Comprehension passages, Image-based, Audio/Video-based, Mathematical formula (LaTeX/MathML), True/False
- **Metadata Tagging:** Subject -> Topic -> Sub-topic -> Difficulty level -> Cognitive level (Bloom's taxonomy) -> Marks -> Estimated time
- **Bulk Operations:** Import from Excel/Word/JSON, Export to Excel/PDF/JSON
- **Media Support:** Images, audio, video, mathematical equations, chemical structures
- **Version Control:** Question revision history, approval workflow
- **Quality Metrics:** Discrimination index, difficulty index, usage count, error rate tracking
- **Randomization:** Logic-based question selection, option shuffling per candidate

### 3.2 Exam Creation & Configuration

- **Exam Blueprint:** Define sections, questions per section, marks per question, negative marking
- **Question Selection:** Static (fixed set) or Dynamic (random from pool by criteria) or Hybrid
- **Marking Scheme:** Positive marks, negative marks, partial marking, section-wise cut-offs
- **Timing:** Overall duration, section-wise duration, per-question timer (optional)
- **Navigation:** Free navigation (jump between sections/questions) or linear (sequential only)
- **Access Control:** IP-based restrictions, device-based restrictions, candidate whitelist
- **Instructions:** Custom instructions page before exam start
- **Result Visibility:** Instant results, delayed results, score-only vs detailed review
- **Multi-shift Support:** Same exam across multiple shifts with different question sets

### 3.3 Exam Session Lifecycle

```
SCHEDULED -> PUBLISHED -> ACTIVE -> [PAUSED] -> SUBMISSION_WINDOW -> FINISHED -> RESULTS_PUBLISHED
```

- Server-controlled start/stop
- Grace period for late submissions
- Auto-submit on timer expiry
- Manual force-submit by admin (emergency)
- Session recovery after client crash/reboot
- Re-login capability (with admin approval) after disconnection

### 3.4 Security & Integrity

- **Authentication:** Candidate credentials + optional biometric/photo verification
- **Session Security:** JWT tokens with short expiry, refresh tokens, session binding to device
- **Data Encryption:** TLS for transport, AES-256 for question bank at rest, cryptographic signing of answers
- **Anti-Cheating:** Tab-switch detection, window blur detection, process monitoring, clipboard blocking, screen capture prevention, VM detection
- **Replay Attack Prevention:** Nonce-based request validation, timestamp validation
- **MITM Prevention:** Certificate pinning, LAN-only communication
- **Audit Trail:** Immutable logs of all actions (admin, candidate, system), tamper-evident chaining
- **Device Registration:** Pre-registered device IDs, MAC address validation, hardware fingerprinting

### 3.5 Proctoring (Optional — Capability-Triggered)

> **Trigger:** When proctoring is enabled, a separate Python microservice is introduced. The core platform defines a `ProctoringService` interface only — implementation technology is decided at build time.

- **AI-Based:** Face detection/recognition, liveness detection, multiple face detection, gaze tracking
- **Monitoring:** Periodic photo capture, screen capture, audio monitoring
- **Alerts:** Configurable thresholds, auto-warn, auto-pause, auto-terminate
- **Human Proctor:** Live feed viewing, click-to-intervene, chat with candidate
- **Reporting:** Violation reports with timeline evidence, severity scoring

### 3.6 Results & Analytics

- **Auto-Grading:** Instant grading for objective questions, manual grading interface for subjective
- **Score Calculation:** Raw scores, normalized scores, percentile ranks, rank lists
- **Analytics:**
  - Student-level: Score, subject-wise breakdown, time analysis, accuracy, comparison with batch average
  - Batch-level: Aggregate performance, question-wise analysis, difficulty distribution
  - Institution-level: Cross-batch comparison, trend analysis, pass/fail rates
- **Reports:** Scorecards, merit lists, question analysis reports, statistical summaries
- **Exports:** PDF, Excel, CSV
- **Certificate Generation:** Custom templates, auto-delivery to qualified candidates

---

## 4. TECH STACK (FROZEN — Architecture v1.0)

Based on research of enterprise CBT implementations and architecture review:

| Component         | Technology                                       | Alternatives Considered           |
| ----------------- | ------------------------------------------------ | --------------------------------- |
| Backend           | Node.js 24 LTS + Fastify 5                       | Python FastAPI, Go, .NET          |
| Database          | PostgreSQL 18 (async I/O, UUIDv7, skip scan)     | MySQL, SQLite (for single-server) |
| ORM               | Drizzle ORM (SQL-first, zero overhead)           | Prisma 6, Kysely                  |
| Real-time         | WebSocket (ws)                                   | Server-Sent Events, Socket.io     |
| Admin Dashboard   | React 19 + Vite 6 + TailwindCSS 4 + shadcn/ui    | Vue.js, Angular                   |
| Exam Client       | C# WPF (.NET 8) + CommunityToolkit.Mvvm          | Qt, Safe Exam Browser, WinUI 3    |
| Exam Launcher     | C# (.NET 8 Native AOT, shared solution)          | Node.js script, PowerShell        |
| State Mgmt        | Zustand v5 + TanStack Query v5 (admin dashboard) | Redux Toolkit, Jotai              |
| Authentication    | JWT + Argon2id (OWASP 2026 first choice)         | Session-based, OAuth2, bcrypt     |
| Local DB (Client) | Microsoft.Data.Sqlite + SQLCipher (encrypted)    | better-sqlite3, SQLitePCLRaw      |
| File Storage      | Local filesystem (LAN)                           | MinIO, S3-compatible              |
| API Style         | REST + WebSocket                                 | GraphQL, gRPC                     |
| Process Manager   | PM2 (cluster mode)                               | systemd, Docker                   |
| Reverse Proxy     | Nginx (sticky sessions for WebSocket)            | Caddy, HAProxy                    |
| Logging           | Pino (structured JSON)                           | Winston, Bunyan                   |

### 4.1 Monorepo Structure

```
cbt-platform/
├── apps/
│   ├── exam-server/          # Fastify backend
│   ├── admin-dashboard/      # React admin web app
│   ├── windows-client/       # C# WPF exam client + launcher (Visual Studio solution)
│   │   ├── ExamClient/       # WPF .NET 8 exam client
│   │   ├── ExamLauncher/     # Native AOT watchdog
│   │   └── Shared/           # Shared class library
├── packages/
│   ├── contracts/            # Public API types, WebSocket events, enums
│   ├── validation/           # Zod schemas, JSON Schema, business rules
│   ├── shared/               # Utilities, constants, permissions, feature flags
│   ├── ui/                   # Shared React components
│   ├── config/               # Shared configuration
│   └── logger/               # Shared logging utilities
├── infra/
│   ├── nginx/
│   ├── scripts/
│   └── deployment/
└── docs/
```

### 4.2 Architecture Principles

- **Modular Monolith:** Core exam platform (auth, sessions, questions, answers, grading, monitoring) runs as a single Fastify process. No microservices for core functionality.
- **Capability-Triggered Services:** Additional services (AI proctoring) may be introduced only when a capability requires an independent runtime. The trigger is capability, not fashion.
- **Single Server:** No Redis, no Kubernetes, no distributed architecture. One physical server handles everything.
- **Offline-First Client:** Every answer is saved to local encrypted SQLite before syncing to server.
- **Signed Exam Manifest:** Server signs the exam schedule at start. Client follows the signed manifest — no client-generated timers.

### Build vs. Buy Consideration

- **Safe Exam Browser (SEB):** Open-source, production-grade kiosk browser. Evaluated but not selected — the project uses a native C# WPF client with Win32 lockdown instead. SEB is MPL licensed, supports Windows/macOS/iOS, has encrypted config files, VM detection, certificate pinning, process monitoring. **Recommendation: Build custom WPF-based kiosk client with native Win32 lockdown (selected approach).**
- **Question Bank Frameworks:** No production-grade open-source CBT question bank framework found that meets enterprise requirements. **Recommendation: Build custom.**
- **Exam Engine:** No production-grade open-source exam engine found for competitive exam scenarios. **Recommendation: Build custom.**

---

## 5. MODULE BREAKDOWN (FOR ITERATIVE DEVELOPMENT)

### 5.1 Gated Iterative Workflow

Each module follows a strict iterative lifecycle with gated approvals:

```
Research Gate → Design Gate → Implement Gate → Test Gate → Review Gate → APPROVED
```

- **No module implementation begins until Phase 0 is fully approved.**
- **Each module requires its own design review before implementation.**
- **Each module requires test sign-off before merging.**
- **Each phase requires user demo and approval before proceeding to the next.**

### 5.2 Phase 0: Discovery & Architecture (Pre-Implementation)

All Phase 0 deliverables must be reviewed and approved before any production code is written.

| #    | Deliverable                    | Document                        | Status      |
| ---- | ------------------------------ | ------------------------------- | ----------- |
| 0.1  | Phase 0 Plan                   | `docs/PHASE_0_PLAN.md`          | ✅ Complete |
| 0.2  | Technology Decision Record     | `docs/TDR.md`                   | ✅ Complete |
| 0.3  | System Architecture Document   | `docs/SAD.md`                   | ✅ Complete |
| 0.4  | Database Design Document       | `docs/DATABASE_DESIGN.md`       | ✅ Complete |
| 0.5  | API Specification              | `docs/API_SPECIFICATION.md`     | ✅ Complete |
| 0.6  | Security Architecture          | `docs/SECURITY_ARCHITECTURE.md` | ✅ Complete |
| 0.7  | Client Architecture            | `docs/CLIENT_ARCHITECTURE.md`   | ✅ Complete |
| 0.8  | Testing Strategy               | `docs/TESTING_STRATEGY.md`      | ✅ Complete |
| 0.9  | Development Standards          | `docs/DEV_STANDARDS.md`         | ✅ Complete |
| 0.10 | Risk Register & Milestone Plan | `docs/RISK_REGISTER.md`         | ✅ Complete |

### 5.3 Implementation Modules

| Module | Name                             | Description                                                                              | Phase |
| ------ | -------------------------------- | ---------------------------------------------------------------------------------------- | ----- |
| 1      | Foundation & Core Backend        | Project setup, database schema, authentication, user/role management, base API structure | 1     |
| 2      | Question Bank Management         | CRUD for questions, question types, tagging, import/export, admin UI                     | 1     |
| 3      | Exam Creation & Configuration    | Exam blueprint, sections, marking scheme, scheduling, admin wizard UI                    | 1     |
| 4      | Candidate Management             | Registration, bulk import, credentials, admit cards, batch/center assignment             | 1     |
| 5      | Exam Client Application          | Login, exam interface, timer, navigation, auto-save, submit, kiosk lockdown              | 2     |
| 6      | Exam Session Management (Server) | Session lifecycle, WebSocket real-time, device validation, crash recovery                | 2     |
| 7      | Live Monitoring & Proctoring     | Real-time admin dashboard, candidate status, alerts, proctoring console                  | 3     |
| 8      | Results & Analytics              | Auto-grading, score calculation, analytics, reports, scorecards, exports                 | 3     |
| 9      | Security Hardening & Audit       | Encryption, audit trail, anti-cheating, penetration testing, security review             | 4     |
| 10     | Performance & Load Testing       | Load testing (750 normal, 1000 peak), optimization, validation                           | 4     |

---

## 6. RESEARCH SOURCES

1. **Bynaric Systems** — AI-Enabled Online Examination Platform case study (architecture, proctoring, scalability)
2. **Addmen Group** — Distributed CBT Architecture (multi-server, centralized results, redundancy)
3. **ConductExam** — Enterprise CBT Software (question bank, kiosk security, offline sync, analytics, IRT)
4. **Safe Exam Browser (SEB)** — Open-source kiosk browser (lockdown features, VM detection, cert pinning)
5. **SchoolShell** — Offline/LAN-based CBT (local server, zero-internet, LAN exam delivery)
6. **Decabin Technology** — CBT App (admin dashboard, question bank, offline capability)
7. **Academic Suite (DEV Community)** — Database design for online exam system (PostgreSQL schema, ERD, optimization)
8. **Examinator (GitHub)** — Exam platform architecture (Bun + Elysia, WebSocket, MySQL, real-time admin)
9. **Kushalkhemka/online_examination_system (GitHub)** — Full-stack exam system (Node.js, React, Supabase, Socket.io, AI proctoring)
10. **Mazatron Enterprise** — End-to-end CBT solutions (registration, admit cards, biometric, multi-shift, result processing)
11. **ThinkExam** — CBT exam platform (scheduling, monitoring, cloud sync)
12. **Edu Excellent** — AI-driven exam software (role-based dashboards, remote proctoring, analytics)
13. **Talview** — Live Pop-In Watch Dashboard (AI proctoring, automated actions, audit logs)
14. **ScoreExam** — Offline CBT exam creator (question bank, offline sync, analytics)
15. **SimExams** — CBT Author + Exam Engine (desktop-based question creation and exam delivery)

---

## 7. DISASTER RECOVERY REQUIREMENTS

The platform must handle common failure scenarios gracefully. Infrastructure failures (server hardware, power, OS) are the exam center's responsibility. The software handles application-level recovery.

| Failure             | Recovery                                                                    |
| ------------------- | --------------------------------------------------------------------------- |
| Client app crash    | ExamLauncher restarts client → SQLite restore → reconnect                   |
| Windows restart     | Auto-start → SQLite restore → reconnect                                     |
| Network loss        | Offline mode → SQLite queue → auto-sync on reconnect                        |
| Server crash        | Clients continue on signed manifest → delta sync when server returns        |
| PostgreSQL crash    | Client queues locally → sync after DB recovery                              |
| PC hardware failure | Move candidate to another PC → admin pauses timer → server restores session |

**Key Requirements:**

- Candidate timer pause/resume (invigilator-only capability) for PC transfers
- Exam Incident Log — every unusual event recorded (network loss, restart, pause, crash, offline mode, recovery)
- Post-exam automatic PostgreSQL backup (compressed)
- Known residual risk: If both local SQLite corrupts AND server is unavailable, unsynchronized answers may be lost

---

## 8. DOCUMENT METADATA

| Field                | Value                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Document Version** | 3.0 (Architecture Frozen — Client Stack Changed)                                                                                         |
| **Date Created**     | 2026-07-16                                                                                                                               |
| **Status**           | FROZEN — Architecture v2.0 (Client: C# WPF)                                                                                              |
| **Author**           | AI Agent (Architect Mode)                                                                                                                |
| **Reviewed By**      | Project Owner                                                                                                                            |
| **Approved By**      | Project Owner                                                                                                                            |
| **Next Phase**       | Phase 0: Discovery & Architecture — ALL deliverables complete (see Section 5.2)                                                          |
| **Phase 0 Status**   | All 10 deliverables created — awaiting user review and sign-off to begin implementation                                                  |
| **Freeze Rule**      | Changes require: business requirement change, security issue, prototype failure, or performance test failure. No changes for preference. |
| **Note**             | This PRD defines WHAT to build. Architecture docs define HOW. No production code until Phase 0 is approved by user.                      |
