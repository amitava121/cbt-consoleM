# RISK REGISTER & MILESTONE PLAN

# Competitive CBT Platform

---

## 1. DOCUMENT PURPOSE

This document identifies, categorizes, and mitigates risks for the CBT Platform. It also defines the milestone plan with gated approvals for each phase and module.

---

## 2. RISK REGISTER

### 2.1 Risk Categories

| Category    | Code | Description                                         |
| ----------- | ---- | --------------------------------------------------- |
| Technical   | TECH | Architecture, technology, performance, integration  |
| Security    | SEC  | Authentication, data protection, cheating, breaches |
| Operational | OPS  | Deployment, infrastructure, network, power          |
| Schedule    | SCH  | Timeline, dependencies, delays                      |
| Resource    | RES  | Team, skills, availability                          |
| Compliance  | COMP | Data privacy, audit requirements                    |

### 2.2 Risk Scoring

| Severity | Score | Definition                                    |
| -------- | ----- | --------------------------------------------- |
| Critical | 5     | Exam integrity compromised or system unusable |
| High     | 4     | Major feature failure; significant impact     |
| Medium   | 3     | Moderate impact; workaround available         |
| Low      | 2     | Minor impact; easily mitigated                |
| Minimal  | 1     | Negligible impact                             |

**Risk Score = Probability (1-5) × Severity (1-5)**

| Score Range | Risk Level | Action                                  |
| ----------- | ---------- | --------------------------------------- |
| 20-25       | Critical   | Immediate mitigation required; escalate |
| 12-19       | High       | Mitigation plan before next milestone   |
| 6-11        | Medium     | Mitigation plan during current phase    |
| 1-5         | Low        | Monitor; mitigate if risk materializes  |

### 2.3 Risk Table

| ID  | Category | Risk                                                                                | Probability | Severity | Score | Level  | Mitigation                                                                                                                           | Owner        | Status |
| --- | -------- | ----------------------------------------------------------------------------------- | ----------- | -------- | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------ |
| R01 | TECH     | WebSocket connection drops under high load (500 clients)                            | 3           | 5        | 15    | High   | Load test with k6 at 500 concurrent; tune Node.js event loop; use `ws` with permessage-deflate; connection pooling                   | Backend      | Open   |
| R02 | TECH     | PostgreSQL write contention on `answers` table during peak                          | 3           | 4        | 12    | High   | Composite index on (attempt_id, question_id); UPSERT with ON CONFLICT; connection pooling; partition by month                        | Backend      | Open   |
| R03 | TECH     | WPF client memory leak during long exam (3 hours)                                   | 3           | 4        | 12    | High   | Profile memory during 3-hour test; LRU cache for images; cleanup on question navigation; monitor with process metrics                | Client       | Open   |
| R04 | TECH     | Timer drift between client and server                                               | 4           | 3        | 12    | High   | Server-authoritative timer; heartbeat time sync every 30s; reject client time for scoring; display server time                       | Backend      | Open   |
| R05 | TECH     | Question decryption latency on exam start                                           | 2           | 3        | 6     | Medium | Pre-decrypt questions in App startup; cache decrypted content in memory; benchmark with 500 questions                                | Client       | Open   |
| R06 | TECH     | Large question bank import (10,000+ questions) causes timeout                       | 3           | 3        | 9     | Medium | Batch import in chunks of 100; background worker; progress tracking; resume on failure                                               | Backend      | Open   |
| R07 | SEC      | Client lockdown bypass via keyboard shortcut not intercepted                        | 3           | 5        | 15    | High   | GPO enforcement (OS level); WH_KEYBOARD_LL hook; test all known bypass methods; regular penetration testing                          | Client + Sec | Open   |
| R08 | SEC      | JWT token stolen and replayed on different machine                                  | 2           | 5        | 10    | High   | Device binding in JWT claims; hardware hash verification; nonce-based replay protection; short access token expiry (15min)           | Security     | Open   |
| R09 | SEC      | Question bank leaked via database access                                            | 2           | 5        | 10    | High   | AES-256 encryption at rest; PostgreSQL localhost binding; pg_hba.conf restriction; OS-level file permissions; audit logging          | Security     | Open   |
| R10 | SEC      | Audit log tampering                                                                 | 2           | 4        | 8     | Medium | Hash chain (SHA-256); append-only DB triggers; regular integrity verification; separate log storage                                  | Security     | Open   |
| R11 | SEC      | Man-in-the-middle attack on LAN                                                     | 2           | 5        | 10    | High   | TLS 1.2+ with certificate pinning; self-signed cert with pinned fingerprint; Nginx TLS config; no HTTP fallback                      | Security     | Open   |
| R12 | SEC      | SQL injection via unsanitized input                                                 | 2           | 5        | 10    | High   | Prisma parameterized queries; JSON Schema validation; ESLint security rules; no raw SQL with user input                              | Backend      | Open   |
| R13 | SEC      | XSS via question content (rich text)                                                | 3           | 4        | 12    | High   | Sanitize all user-generated content; CSP headers; no `dangerouslySetInnerHTML` without sanitization; DOMPurify                       | Frontend     | Open   |
| R14 | OPS      | Server machine hardware failure during live exam                                    | 2           | 5        | 10    | High   | UPS for server; PM2 auto-restart; PostgreSQL WAL backup; spare server machine on standby                                             | Ops          | Open   |
| R15 | OPS      | Network switch failure during live exam                                             | 2           | 5        | 10    | High   | Redundant switch (if available); clients continue offline; auto-reconnect on network restore; UPS for network equipment              | Ops          | Open   |
| R16 | OPS      | Power outage at exam center                                                         | 3           | 5        | 15    | High   | UPS for server (15min min); GPO auto-login + auto-start; clients resume from local SQLite; documented recovery procedure             | Ops          | Open   |
| R17 | OPS      | Disk full on server during exam                                                     | 2           | 4        | 8     | Medium | Disk space monitoring; pre-exam disk check; log rotation; backup cleanup; alert admin at 80% capacity                                | Ops          | Open   |
| R18 | OPS      | PM2 fails to restart Node.js after crash                                            | 2           | 5        | 10    | High   | PM2 max_restarts config; Windows Service fallback; monitoring alert on process death; manual restart procedure                       | Ops          | Open   |
| R19 | SCH      | Module 5 (Exam Client) takes longer than estimated                                  | 4           | 3        | 12    | High   | Start client architecture early; prototype lockdown features first; parallel development of server + client; buffer time in schedule | PM           | Open   |
| R20 | SCH      | Database schema changes required after Module 1                                     | 3           | 3        | 9     | Medium | Thorough Phase 0 database review; Prisma migration discipline; backward-compatible migrations; test data factory                     | Backend      | Open   |
| R21 | SCH      | Integration between modules (e.g., client + server WebSocket) has unexpected issues | 4           | 3        | 12    | High   | API contract first; integration tests in CI; early integration testing (Module 5+6); mock server for client dev                      | PM           | Open   |
| R22 | RES      | Single developer bottleneck on critical path                                        | 4           | 4        | 16    | High   | Cross-training; pair programming on critical modules; documentation; code review for knowledge sharing                               | PM           | Open   |
| R23 | TECH     | WPF/.NET 8 compatibility issues with Windows version                                | 2           | 4        | 8     | Medium | Test on target Windows versions (10/11); pin .NET 8 SDK; test lockdown features per OS version; self-contained deployment            | Client       | Open   |
| R24 | TECH     | SQLCipher native library issues on Windows                                          | 3           | 3        | 9     | Medium | Use SQLitePCLRaw.bundle_e_sqlcipher; test on target Windows; self-contained deployment includes native libs; CI build test           | Client       | Open   |
| R25 | SEC      | Candidate uses virtual machine to bypass lockdown                                   | 3           | 4        | 12    | High   | VM detection on startup (WMI checks); refuse to start on VM; log violation; GPO enforcement                                          | Client + Sec | Open   |
| R26 | SEC      | Candidate modifies local SQLite to change answers                                   | 2           | 4        | 8     | Medium | SQLCipher encryption; key derived from hardware hash; server-authoritative answers; sync verification on reconnect                   | Client + Sec | Open   |
| R27 | TECH     | Load testing reveals performance bottleneck at 300+ clients                         | 3           | 4        | 12    | High   | Early load testing (Module 6); profile and optimize; connection pooling; query optimization; in-memory cache tuning                  | Backend      | Open   |
| R28 | COMP     | Audit log format does not meet institutional requirements                           | 2           | 3        | 6     | Medium | Review audit requirements with stakeholders; configurable log format; export capabilities; hash chain for integrity                  | Backend      | Open   |

### 2.4 Risk Heat Map

```
Severity →  1        2        3        4        5
Prob ↓
5          |        |        |        |        |
4          |        |        | R19    | R22    |
           |        |        | R21    |        |
3          |        |        | R01    | R03    | R16
           |        |        | R02    | R07    |
           |        |        | R04    | R25    |
           |        |        | R06    |        |
           |        |        | R27    |        |
2          |        | R05    | R20    | R09    | R08
           |        |        | R28    | R10    | R11
           |        |        |        | R14    | R12
           |        |        |        | R15    |
           |        |        |        | R17    |
           |        |        |        | R18    |
           |        |        |        | R26    |
           |        |        |        | R23    |
1          |        |        |        |        |
```

---

## 3. MILESTONE PLAN

### 3.1 Phase Overview

| Phase   | Name                                 | Duration   | Status      |
| ------- | ------------------------------------ | ---------- | ----------- |
| Phase 0 | Discovery & Architecture             | 2-3 weeks  | In Progress |
| Phase 1 | Module 1-4 (Backend + Admin)         | 8-10 weeks | Pending     |
| Phase 2 | Module 5-6 (Client + Session)        | 6-8 weeks  | Pending     |
| Phase 3 | Module 7-8 (Monitoring + Results)    | 4-5 weeks  | Pending     |
| Phase 4 | Module 9-10 (Security + Performance) | 3-4 weeks  | Pending     |

### 3.2 Phase 0 Milestones (Current)

| Milestone   | Deliverable                        | Approval Gate                     | Status      |
| ----------- | ---------------------------------- | --------------------------------- | ----------- |
| M0.1        | PRD v1.0 Frozen                    | User approval                     | ✅ Complete |
| M0.2        | Phase 0 Plan                       | User approval                     | ✅ Complete |
| M0.3        | Technology Decision Record (TDR)   | User approval                     | ✅ Complete |
| M0.4        | System Architecture Document (SAD) | User approval                     | ✅ Complete |
| M0.5        | Database Design Document           | User approval                     | ✅ Complete |
| M0.6        | API Specification                  | User approval                     | ✅ Complete |
| M0.7        | Security Architecture Document     | User approval                     | ✅ Complete |
| M0.8        | Client Architecture Document       | User approval                     | ✅ Complete |
| M0.9        | Testing Strategy Document          | User approval                     | ✅ Complete |
| M0.10       | Development Standards Document     | User approval                     | ✅ Complete |
| M0.11       | Risk Register & Milestone Plan     | User approval                     | ✅ Complete |
| **M0.EXIT** | **Phase 0 Sign-off**               | **User approval to start coding** | **Pending** |

### 3.3 Phase 1 Milestones (Module 1-4)

| Milestone   | Deliverable                                                    | Approval Gate                         | Est. Duration |
| ----------- | -------------------------------------------------------------- | ------------------------------------- | ------------- |
| M1.1        | Project setup (monorepo, pnpm, tsconfig, ESLint, Prettier, CI) | Build passes, lint passes             | 3 days        |
| M1.2        | Database schema + migrations (all 30 tables)                   | Migration applies cleanly; seed works | 3 days        |
| M1.3        | Auth service (login, refresh, logout, JWT, device validation)  | Integration tests pass                | 5 days        |
| M1.4        | RBAC middleware + permission system                            | All role tests pass                   | 2 days        |
| M1.5        | User management CRUD (admin)                                   | API + admin UI                        | 3 days        |
| M1.6        | Institution/Center/Batch management                            | API + admin UI                        | 3 days        |
| M1.7        | Subject/Topic management                                       | API + admin UI                        | 2 days        |
| M1.8        | Question Bank CRUD (all 12 types)                              | API + admin UI                        | 5 days        |
| M1.9        | Question import/export (JSON, Excel)                           | Integration tests pass                | 3 days        |
| M1.10       | Exam creation wizard (sections, questions, marking)            | API + admin UI                        | 5 days        |
| M1.11       | Exam batch management + lifecycle                              | API + admin UI                        | 3 days        |
| M1.12       | Candidate management + bulk import                             | API + admin UI                        | 3 days        |
| M1.13       | Device registration + management                               | API + admin UI                        | 2 days        |
| **M1.EXIT** | **Phase 1 Review**                                             | **All tests pass; user demo**         | **1 day**     |

### 3.4 Phase 2 Milestones (Module 5-6)

| Milestone   | Deliverable                                                | Approval Gate                       | Est. Duration |
| ----------- | ---------------------------------------------------------- | ----------------------------------- | ------------- |
| M2.1        | WPF app scaffold (App.xaml, MainWindow, Views, ViewModels) | App launches in kiosk mode          | 3 days        |
| M2.2        | Lockdown enforcement (all measures)                        | All bypass tests pass               | 5 days        |
| M2.3        | Login flow + device validation                             | E2E login test passes               | 3 days        |
| M2.4        | Exam UI (question rendering, all types)                    | All question types render           | 5 days        |
| M2.5        | Timer + section navigation + question palette              | E2E navigation test passes          | 3 days        |
| M2.6        | Auto-save (local SQLite + WS sync)                         | Offline test passes                 | 4 days        |
| M2.7        | WebSocket server (events, rooms, heartbeat)                | Integration tests pass              | 5 days        |
| M2.8        | Exam session lifecycle (start, pause, resume, submit)      | E2E exam flow passes                | 4 days        |
| M2.9        | Crash recovery + reconnect                                 | Recovery E2E test passes            | 4 days        |
| M2.10       | Server-authoritative timer + auto-submit                   | Timer tests pass                    | 2 days        |
| **M2.EXIT** | **Phase 2 Review**                                         | **Full exam E2E passes; user demo** | **1 day**     |

### 3.5 Phase 3 Milestones (Module 7-8)

| Milestone   | Deliverable                                           | Approval Gate                      | Est. Duration |
| ----------- | ----------------------------------------------------- | ---------------------------------- | ------------- |
| M3.1        | Live monitoring dashboard (snapshot, candidates)      | E2E monitoring test passes         | 4 days        |
| M3.2        | Proctoring console (warn, pause, terminate)           | E2E proctoring test passes         | 3 days        |
| M3.3        | Violation reporting + alerts                          | Integration tests pass             | 3 days        |
| M3.4        | Auto-grading engine (all objective types)             | Unit tests pass                    | 4 days        |
| M3.5        | Score calculation + percentile + rank list            | Unit + integration tests pass      | 3 days        |
| M3.6        | Scorecard generation (PDF)                            | Integration test passes            | 2 days        |
| M3.7        | Analytics (item analysis, difficulty, discrimination) | Unit tests pass                    | 3 days        |
| M3.8        | Results export (PDF, Excel, CSV)                      | Integration tests pass             | 2 days        |
| **M3.EXIT** | **Phase 3 Review**                                    | **Full monitoring + grading demo** | **1 day**     |

### 3.6 Phase 4 Milestones (Module 9-10)

| Milestone   | Deliverable                          | Approval Gate                    | Est. Duration |
| ----------- | ------------------------------------ | -------------------------------- | ------------- |
| M4.1        | Audit log hash chain + verification  | Security tests pass              | 2 days        |
| M4.2        | Question encryption at rest          | Security tests pass              | 2 days        |
| M4.3        | Replay protection (nonce + HMAC)     | Security tests pass              | 3 days        |
| M4.4        | Certificate pinning (WPF client)     | Security tests pass              | 2 days        |
| M4.5        | Penetration testing (internal)       | All findings resolved            | 5 days        |
| M4.6        | Load testing (500 concurrent)        | p95 < 500ms, 0 errors            | 3 days        |
| M4.7        | Performance optimization (if needed) | Load test passes                 | 3 days        |
| M4.8        | Documentation finalization           | All docs updated                 | 2 days        |
| **M4.EXIT** | **Production Readiness Review**      | **User sign-off for production** | **1 day**     |

### 3.7 Gantt Chart (Simplified)

```
Week:  1  2  3  4  5  6  7  8  9  10 11 12 13 14 15 16 17 18 19 20 21 22 23 24
       │  │  │  │  │  │  │  │  │  │  │  │  │  │  │  │  │  │  │  │  │  │  │
P0:    ████████████
                    ▲ Phase 0 Exit (Architecture Approved)
P1:                ████████████████████████
                                            ▲ Phase 1 Exit (Backend + Admin)
P2:                                        ████████████████████████
                                                                    ▲ Phase 2 Exit (Client + Session)
P3:                                                                ████████████████████
                                                                                        ▲ Phase 3 Exit (Monitoring + Results)
P4:                                                                                        ████████████████
                                                                                                                ▲ Production Ready
```

---

## 4. APPROVAL GATES

### 4.1 Gate Criteria

| Gate         | Criteria                                                    | Approver |
| ------------ | ----------------------------------------------------------- | -------- |
| Phase 0 Exit | All 11 deliverables reviewed and approved                   | User     |
| Phase 1 Exit | All Module 1-4 tests pass; admin UI demo                    | User     |
| Phase 2 Exit | Full exam E2E passes (login -> exam -> submit); client demo | User     |
| Phase 3 Exit | Monitoring + grading + results demo                         | User     |
| Phase 4 Exit | Load test passes; security scan clean; production readiness | User     |

### 4.2 Gate Process

```
1. Developer completes all milestone tasks
2. Run full test suite (unit + integration + E2E)
3. Generate test coverage report
4. Prepare demo / walkthrough
5. Present to user for review
6. User approves or requests changes
7. If approved: proceed to next phase
8. If changes requested: address and re-present
```

---

## 5. DEPENDENCY MAP

```
Phase 0 (Architecture)
    │
    ├── No dependencies (start immediately)
    │
    ▼
Phase 1 (Module 1-4: Backend + Admin)
    │
    ├── Depends on: Phase 0 (all docs approved)
    ├── M1.1 (setup) → M1.2 (DB) → M1.3 (auth) → M1.4 (RBAC)
    ├── M1.5-M1.7 (user/org/subject) → parallel after M1.4
    ├── M1.8-M1.9 (question bank) → after M1.7
    ├── M1.10-M1.11 (exam) → after M1.8
    ├── M1.12 (candidates) → after M1.6
    └── M1.13 (devices) → after M1.3
    │
    ▼
Phase 2 (Module 5-6: Client + Session)
    │
    ├── Depends on: Phase 1 (auth, question bank, exam APIs ready)
    ├── M2.1-M2.2 (WPF + lockdown) → parallel with M2.7
    ├── M2.3 (login) → after M2.1, M2.7
    ├── M2.4-M2.5 (exam UI) → after M2.3
    ├── M2.6 (auto-save) → after M2.4, M2.7
    ├── M2.7 (WS server) → after Phase 1
    ├── M2.8 (session lifecycle) → after M2.6, M2.7
    ├── M2.9 (crash recovery) → after M2.8
    └── M2.10 (timer) → after M2.8
    │
    ▼
Phase 3 (Module 7-8: Monitoring + Results)
    │
    ├── Depends on: Phase 2 (exam sessions working)
    ├── M3.1-M3.3 (monitoring) → after Phase 2
    ├── M3.4-M3.5 (grading) → after Phase 2
    ├── M3.6-M3.8 (results) → after M3.5
    └── Can run in parallel with Phase 4
    │
    ▼
Phase 4 (Module 9-10: Security + Performance)
    │
    ├── Depends on: Phase 2 (client working)
    ├── M4.1-M4.4 (security hardening) → after Phase 2
    ├── M4.5 (pen testing) → after M4.1-M4.4
    ├── M4.6-M4.7 (load testing) → after Phase 3
    └── M4.8 (docs) → after all
```

---

## 6. RISK REVIEW CADENCE

| Frequency      | Activity                  | Participants    |
| -------------- | ------------------------- | --------------- |
| Weekly         | Risk review standup       | Dev team        |
| Per phase exit | Full risk register review | Dev team + User |
| On incident    | Ad-hoc risk assessment    | Dev team + User |
| Monthly        | Risk register update      | Dev team        |

---

## 7. CONTINGENCY PLANS

### 7.1 Schedule Contingency

| Scenario                                               | Contingency                                                                       |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Module 5 (Client) delayed by > 1 week                  | Parallelize server work; use mock server for client dev; reduce scope of Phase 3  |
| Load testing reveals bottleneck at 300 clients         | Optimize queries; tune in-memory cache; upgrade server hardware (more cores, RAM) |
| Security penetration test finds critical vulnerability | Stop all other work; fix vulnerability; re-test; delay production release         |

### 7.2 Technical Contingency

| Scenario                                | Contingency                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| WPF lockdown insufficient               | Integrate Safe Exam Browser (SEB) as fallback; or add more Win32 hooks               |
| PostgreSQL performance inadequate       | Tune PostgreSQL config; add indexes; optimize queries; upgrade server hardware       |
| SQLCipher library issues on Windows     | Test on target Windows; use official SQLitePCLRaw bundles; self-contained deployment |
| WebSocket unreliable at 500 connections | Switch to Socket.io (has reconnection built-in); or implement polling fallback       |

---

## 8. DOCUMENT METADATA

| Field                        | Value                                                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Document Version**         | 3.0 (Architecture Frozen — Client Stack Changed)                                                                                         |
| **Date Created**             | 2026-07-16                                                                                                                               |
| **Status**                   | FROZEN — Architecture v2.0 (Client: C# WPF)                                                                                              |
| **Author**                   | AI Agent (Architect Mode)                                                                                                                |
| **Prerequisites**            | All Phase 0 deliverables (Frozen)                                                                                                        |
| **Freeze Rule**              | Changes require: business requirement change, security issue, prototype failure, or performance test failure. No changes for preference. |
| **Risks Identified**         | 28 risks across 6 categories                                                                                                             |
| **Milestones**               | 40+ milestones across 5 phases                                                                                                           |
| **Total Estimated Duration** | 22-24 weeks (5-6 months)                                                                                                                 |
