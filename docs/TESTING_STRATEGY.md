# TESTING STRATEGY DOCUMENT

# Competitive CBT Platform

---

## 1. DOCUMENT PURPOSE

This document defines the complete testing strategy for the CBT Platform. It covers test types, test layers, tools, coverage targets, per-module test plans, failure recovery tests, load testing, security testing, and regression strategy.

---

## 2. TESTING PYRAMID

```
                    ┌───────────┐
                    │   E2E     │  ~10% (Playwright)
                    │  Tests    │  Critical user journeys
                    └─────┬─────┘
                    ┌─────┴─────┐
                    │ Integration│  ~25% (Vitest + supertest)
                    │  Tests     │  API + DB + WS
                    └─────┬─────┘
                    ┌─────┴─────┐
                    │   Unit    │  ~65% (Vitest)
                    │  Tests    │  Functions, services, components
                    └───────────┘
```

### 2.1 Coverage Targets

| Layer                        | Target Coverage | Tool                     |
| ---------------------------- | --------------- | ------------------------ |
| Server (services, utils)     | ≥ 85%           | Vitest + c8              |
| Server (routes)              | ≥ 80%           | Vitest + supertest       |
| Admin Dashboard (components) | ≥ 75%           | Vitest + Testing Library |
| Client (main process)        | ≥ 80%           | Vitest                   |
| Client (renderer)            | ≥ 75%           | Vitest + Testing Library |
| Shared (types, utils)        | ≥ 90%           | Vitest                   |

---

## 3. TEST TYPES

### 3.1 Unit Tests

| Aspect    | Details                                                    |
| --------- | ---------------------------------------------------------- |
| Tool      | Vitest 2.x                                                 |
| What      | Individual functions, services, utilities, pure components |
| Mocking   | `vi.mock()` for Drizzle, WebSocket, external deps          |
| Assertion | `expect` (Vitest built-in)                                 |
| Speed     | < 10s for full suite                                       |
| Run on    | Every commit (pre-push hook) + CI                          |

**Example:**

```typescript
describe("GradingEngine.gradeAnswer", () => {
  it("should award full marks for correct MCQ single answer", () => {
    const result = gradeAnswer({
      questionType: "mcq_single",
      correctOptionIds: ["opt-1"],
      selectedOptionIds: ["opt-1"],
      marks: 4,
      negativeMarks: 1,
    });
    expect(result.score).toBe(4);
    expect(result.isCorrect).toBe(true);
  });

  it("should deduct negative marks for wrong answer", () => {
    const result = gradeAnswer({
      questionType: "mcq_single",
      correctOptionIds: ["opt-1"],
      selectedOptionIds: ["opt-2"],
      marks: 4,
      negativeMarks: 1,
    });
    expect(result.score).toBe(-1);
    expect(result.isCorrect).toBe(false);
  });
});
```

### 3.2 Integration Tests

| Aspect   | Details                                                                  |
| -------- | ------------------------------------------------------------------------ |
| Tool     | Vitest + supertest (REST), `ws` client (WebSocket)                       |
| What     | API routes with real database (test DB), WebSocket events                |
| Database | Separate test database (`cbt_test`); migrated before each suite          |
| Setup    | `beforeAll`: migrate + seed; `afterEach`: truncate; `afterAll`: teardown |
| Speed    | < 60s for full suite                                                     |
| Run on   | CI (every PR)                                                            |

**Example:**

```typescript
describe("POST /api/v1/auth/login", () => {
  beforeEach(async () => {
    await seedTestUser({ email: "test@example.com", password: "Pass123!" });
  });

  it("should return JWT tokens on valid credentials", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      email: "test@example.com",
      password: "Pass123!",
      deviceId: "DEV-001",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.email).toBe("test@example.com");
  });

  it("should return 401 on invalid password", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      email: "test@example.com",
      password: "wrong",
      deviceId: "DEV-001",
    });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});
```

### 3.3 End-to-End (E2E) Tests

| Aspect      | Details                                                                        |
| ----------- | ------------------------------------------------------------------------------ |
| Tool        | Playwright 1.x                                                                 |
| What        | Full user journeys: login -> create exam -> start -> answer -> submit -> grade |
| Environment | Staging server with test database                                              |
| Speed       | < 5 min for full suite                                                         |
| Run on      | CI (on merge to main) + pre-release                                            |

**Critical E2E Scenarios:**

| #   | Scenario                    | Steps                                                                                                     |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------------- |
| E1  | Admin creates exam          | Login -> Question Bank -> Create Questions -> Create Exam -> Add Sections -> Add Questions -> Save        |
| E2  | Admin schedules batch       | Login -> Select Exam -> Create Batch -> Assign Candidates -> Publish -> Activate                          |
| E3  | Candidate takes exam        | Login -> View Exams -> Start -> Answer questions -> Navigate sections -> Submit -> Confirm                |
| E4  | Candidate crash recovery    | Login -> Start -> Answer -> Kill app -> Restart -> Login -> Resume -> Verify answers restored             |
| E5  | Admin monitors live exam    | Login -> Open Monitoring -> Subscribe to batch -> View snapshot -> Check candidate status -> Send warning |
| E6  | Auto-submit on timer expiry | Login -> Start -> Wait for timer -> Verify auto-submit triggered -> Verify status = auto_submitted        |
| E7  | Offline resilience          | Login -> Start -> Answer -> Disconnect network -> Continue answering -> Reconnect -> Verify sync          |
| E8  | Results and grading         | Complete exam -> Trigger grading -> View results -> Check rank list -> Export results                     |

### 3.4 Security Tests

| Test                  | Tool            | Description                                                                  |
| --------------------- | --------------- | ---------------------------------------------------------------------------- |
| SQL Injection         | Manual + Vitest | All Drizzle queries use parameterized inputs; verify no raw SQL              |
| XSS                   | Manual + CSP    | Verify CSP headers; no `dangerouslySetInnerHTML` without sanitization        |
| CSRF                  | Manual          | Verify JWT-based auth (no cookies); verify SameSite if cookies used          |
| Authentication bypass | Vitest          | Attempt access without token; with expired token; with revoked token         |
| Authorization bypass  | Vitest          | Candidate accessing admin endpoints; proctor accessing super_admin endpoints |
| Rate limit bypass     | Vitest          | Exceed rate limits; verify 429 response                                      |
| Replay attack         | Vitest          | Reuse nonce; verify rejection                                                |
| JWT tampering         | Vitest          | Modify JWT payload; verify signature failure                                 |
| Device spoofing       | Vitest          | Wrong device ID; wrong hardware hash; verify rejection                       |
| Audit log tampering   | Vitest          | Attempt UPDATE/DELETE on audit_logs; verify trigger blocks                   |
| Path traversal        | Vitest          | File upload with `../` in filename; verify sanitization                      |

### 3.5 Failure Recovery Tests

| #   | Scenario                | Setup                                          | Expected Behavior                                                  |
| --- | ----------------------- | ---------------------------------------------- | ------------------------------------------------------------------ |
| F1  | Client crash mid-exam   | Candidate answering -> kill WPF client process | App restarts, re-login, resume from last synced state              |
| F2  | Server crash mid-exam   | Candidate answering -> kill Node.js process    | PM2 restarts server, clients reconnect, resume                     |
| F3  | Network switch failure  | All clients connected -> disable switch port   | Clients go offline, continue locally, queue answers                |
| F4  | Network recovery        | Clients offline -> re-enable switch            | Clients auto-reconnect, sync queued answers                        |
| F5  | PostgreSQL crash        | Server running -> kill PostgreSQL              | Server detects, PM2 restarts PG, server reconnects                 |
| F6  | Nginx crash             | Server running -> kill Nginx                   | PM2/service restarts Nginx, clients reconnect                      |
| F7  | Disk full               | Fill disk to 100%                              | Server detects, alerts admin, graceful degradation                 |
| F8  | Power outage + restore  | Cut power -> restore power                     | All machines boot, auto-start, resume exams                        |
| F9  | Client clock tampering  | Change client system time                      | Server detects drift, corrects timer, logs violation               |
| F10 | Duplicate connection    | Same candidate logs in on second machine       | First connection closed, second allowed (or vice versa per policy) |
| F11 | Token expiry mid-exam   | Wait 15 min during exam                        | Client auto-refreshes token, no exam disruption                    |
| F12 | WebSocket message flood | Send 1000 events/second from client            | Rate limiter blocks, connection not dropped                        |

### 3.6 Load Tests

| Tool | k6 (Grafana) |
| ---- | ------------ |

| Test                       | Target                            | Duration | Metrics                                   |
| -------------------------- | --------------------------------- | -------- | ----------------------------------------- |
| L1: REST API baseline      | 100 RPS                           | 5 min    | p95 < 200ms, 0 errors                     |
| L2: WebSocket connections  | 500 concurrent                    | 10 min   | All connected, heartbeat stable           |
| L3: Answer save throughput | 500 clients x 1 save/5s = 100 RPS | 10 min   | p95 < 100ms, 0 data loss                  |
| L4: Full exam simulation   | 500 candidates                    | 30 min   | Login, start, answer 50 Qs, submit, grade |
| L5: Monitoring dashboard   | 1 admin + 500 candidates          | 10 min   | Snapshot updates < 1s, no UI freeze       |
| L6: Burst login            | 500 logins in 60s                 | 1 min    | All succeed, p95 < 500ms                  |
| L7: Peak stress            | 1,000 concurrent                  | 30 min   | Validate breaking point / resilience      |

**k6 Script Example:**

```javascript
import ws from "k6/ws";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "2m", target: 500 },
    { duration: "10m", target: 500 },
    { duration: "2m", target: 0 },
  ],
};

export default function () {
  const url = "wss://exam-server/ws?token=...";

  ws.connect(url, {}, (socket) => {
    socket.on("open", () => {
      // Send heartbeat
      socket.send(
        JSON.stringify({
          type: "heartbeat",
          data: {
            attemptId: "test",
            currentQuestionId: "q1",
            remainingTimeSecs: 3600,
          },
        }),
      );

      // Send answer every 5 seconds
      setInterval(() => {
        socket.send(
          JSON.stringify({
            type: "answer:save",
            data: {
              attemptId: "test",
              questionId: "q1",
              answerData: { selectedOptionIds: ["opt-1"] },
              status: "answered",
              timeSpentSecs: 5,
              nonce: "test-nonce",
              timestamp: new Date().toISOString(),
              signature: "test-sig",
            },
          }),
        );
      }, 5000);
    });

    socket.on("message", (data) => {
      check(data, {
        "received confirmation": (d) => JSON.parse(d).type === "answer:saved",
      });
    });
  });

  sleep(1);
}
```

### 3.7 Regression Tests

| Strategy                  | Implementation                                                 |
| ------------------------- | -------------------------------------------------------------- |
| All tests run on every PR | CI pipeline: unit + integration                                |
| E2E on merge to main      | CI pipeline: Playwright suite                                  |
| Snapshot tests            | Vitest snapshot for API responses, component output            |
| Bug fix verification      | Every bug fix must include a regression test                   |
| Pre-release gate          | All tests must pass before any release tag                     |
| Module regression         | After changes to one module, run that module's full test suite |

---

## 4. PER-MODULE TEST PLAN

### Module 1: Foundation & Core Backend

| Test                                      | Type        | Description                                  |
| ----------------------------------------- | ----------- | -------------------------------------------- |
| Auth: login valid credentials             | Integration | POST /auth/login returns 200 + tokens        |
| Auth: login invalid credentials           | Integration | POST /auth/login returns 401                 |
| Auth: login locked account                | Integration | 5 failed attempts -> 423 LOCKED_OUT          |
| Auth: token refresh                       | Integration | POST /auth/refresh returns new access token  |
| Auth: token revocation                    | Integration | Logout -> old token rejected                 |
| Auth: device validation                   | Integration | Unregistered device -> 403                   |
| RBAC: candidate accessing admin route     | Integration | Returns 403 FORBIDDEN                        |
| RBAC: proctor accessing super_admin route | Integration | Returns 403 FORBIDDEN                        |
| User CRUD                                 | Integration | Create, read, update, delete user            |
| Audit log: append-only                    | Integration | UPDATE/DELETE on audit_logs -> error         |
| Audit log: hash chain                     | Unit        | Verify hash chain integrity                  |
| Password hashing                          | Unit        | Argon2id hash + verify (via @node-rs/argon2) |
| JWT generation/verification               | Unit        | Token contains correct claims                |

### Module 2: Question Bank Management

| Test                       | Type        | Description                                      |
| -------------------------- | ----------- | ------------------------------------------------ |
| Question CRUD              | Integration | Create, read, update, delete question            |
| Question validation        | Unit        | Invalid type, missing fields -> validation error |
| Question options CRUD      | Integration | Add, update, remove options                      |
| Question tags              | Integration | Add, remove, search by tags                      |
| Question import (JSON)     | Integration | Import 100 questions from JSON                   |
| Question import (Excel)    | Integration | Import 100 questions from Excel                  |
| Question export            | Integration | Export questions to JSON/Excel                   |
| Question approval workflow | Integration | Create -> approve -> verify approved_by set      |
| Question versioning        | Integration | Update question -> version history created       |
| Question encryption        | Unit        | Encrypt/decrypt question content                 |
| Question filtering         | Integration | Filter by subject, topic, difficulty, type       |
| Media upload               | Integration | Upload image for question -> URL returned        |

### Module 3: Exam Creation & Configuration

| Test                        | Type        | Description                                           |
| --------------------------- | ----------- | ----------------------------------------------------- |
| Exam CRUD                   | Integration | Create, read, update, delete exam                     |
| Exam section CRUD           | Integration | Add, update, remove sections                          |
| Exam question assignment    | Integration | Add questions to sections                             |
| Exam validation             | Unit        | Duration > 0, total_marks > 0, etc.                   |
| Marking scheme              | Unit        | Positive marks, negative marks, partial marks         |
| Question selection strategy | Unit        | Static, random, hybrid selection logic                |
| Shuffle logic               | Unit        | Question shuffle, option shuffle algorithms           |
| Exam batch creation         | Integration | Create batch, assign to center                        |
| Exam batch lifecycle        | Integration | draft -> scheduled -> published -> active -> finished |
| Candidate assignment        | Integration | Assign candidates to batch                            |

### Module 4: Candidate Management

| Test                       | Type        | Description                               |
| -------------------------- | ----------- | ----------------------------------------- |
| Candidate CRUD             | Integration | Create, read, update, delete candidate    |
| Bulk import                | Integration | Import 500 candidates from Excel          |
| Admit card generation      | Integration | Generate PDF admit card                   |
| Candidate-batch assignment | Integration | Assign candidate to exam batch            |
| Duplicate prevention       | Integration | Same candidate in same batch twice -> 409 |

### Module 5: Exam Client Application

| Test                         | Type | Description                                                |
| ---------------------------- | ---- | ---------------------------------------------------------- |
| Client startup               | E2E  | App launches in kiosk mode                                 |
| VM detection                 | Unit | VM signatures detected -> refuse start                     |
| Login flow                   | E2E  | Enter credentials -> login -> exam list                    |
| Exam start                   | E2E  | Click start -> questions load -> timer starts              |
| Question navigation          | E2E  | Navigate between questions, sections                       |
| Answer save (online)         | E2E  | Select answer -> local save -> server save -> confirmation |
| Answer save (offline)        | E2E  | Disconnect -> answer -> verify local save                  |
| Mark for review              | E2E  | Click mark -> status updated -> palette updated            |
| Timer countdown              | Unit | Timer decrements correctly                                 |
| Auto-submit on timer expiry  | E2E  | Wait for timer -> auto-submit triggered                    |
| Submit confirmation          | E2E  | Click submit -> summary -> confirm -> submitted            |
| Lockdown: Alt+F4             | E2E  | Press Alt+F4 -> blocked, violation logged                  |
| Lockdown: PrintScreen        | E2E  | Press PrintScreen -> blocked, clipboard cleared            |
| Lockdown: DevTools           | E2E  | Try to open DevTools -> blocked, violation logged          |
| Lockdown: window blur        | E2E  | Alt+Tab -> blur detected -> refocus, violation logged      |
| Accessibility: high contrast | E2E  | Toggle high contrast -> UI changes                         |
| Accessibility: font size     | E2E  | Change font size -> UI scales                              |

### Module 6: Exam Session Management (Server)

| Test                    | Type        | Description                                            |
| ----------------------- | ----------- | ------------------------------------------------------ |
| WebSocket connection    | Integration | Connect with valid token -> connection:open            |
| WebSocket auth failure  | Integration | Connect with invalid token -> close 4001               |
| Exam:start event        | Integration | Send exam:start -> attempt created -> exam:started     |
| Answer:save event       | Integration | Send answer:save -> answer UPSERTED -> answer:saved    |
| Answer:save_batch event | Integration | Send 10 answers -> all saved -> all confirmed          |
| Heartbeat               | Integration | Send heartbeat -> heartbeat:ack with server time       |
| Time sync               | Integration | Client drift > 5s -> session:time_sync sent            |
| Exam:submit event       | Integration | Send exam:submit -> status SUBMITTED -> exam:submitted |
| Auto-submit on timer    | Integration | Timer reaches 0 -> exam:auto_submitted sent            |
| Admin pause             | Integration | Admin pauses -> exam:paused sent to candidate          |
| Admin resume            | Integration | Admin resumes -> exam:resumed sent to candidate        |
| Admin terminate         | Integration | Admin terminates -> exam:terminated sent to candidate  |
| Duplicate connection    | Integration | Same attempt, 2 connections -> old closed              |
| Rate limiting           | Integration | 31 events/second -> connection:error 4003              |
| Nonce replay            | Integration | Reuse nonce -> answer:save_error                       |
| Signature tampering     | Integration | Modify signature -> answer:save_error                  |
| Crash recovery          | Integration | Reconnect -> session:resume with correct data          |

### Module 7: Live Monitoring & Proctoring

| Test                    | Type        | Description                                            |
| ----------------------- | ----------- | ------------------------------------------------------ |
| Monitor subscribe       | Integration | Admin subscribes -> monitor:snapshot received          |
| Monitor unsubscribe     | Integration | Admin unsubscribes -> no more snapshots                |
| Candidate status update | Integration | Candidate submits -> monitor:candidate_update sent     |
| Violation alert         | Integration | Client reports violation -> monitor:alert sent         |
| Proctor warning         | Integration | Proctor sends warning -> session:warning to candidate  |
| Proctor pause           | Integration | Proctor pauses candidate -> exam:paused to candidate   |
| Proctor terminate       | Integration | Proctor terminates -> exam:terminated to candidate     |
| Snapshot accuracy       | Integration | 500 candidates -> verify counts match DB               |
| Server health           | Integration | GET /monitor/server-health -> CPU, memory, connections |

### Module 8: Results & Analytics

| Test                       | Type        | Description                                         |
| -------------------------- | ----------- | --------------------------------------------------- |
| Auto-grading MCQ single    | Unit        | Correct answer -> full marks                        |
| Auto-grading MCQ multiple  | Unit        | All correct -> full marks; partial -> partial marks |
| Auto-grading with negative | Unit        | Wrong answer -> negative marks                      |
| Score calculation          | Unit        | Total = sum of question scores                      |
| Percentile calculation     | Unit        | Verify percentile rank formula                      |
| Rank list generation       | Integration | 500 candidates -> rank list sorted by score         |
| Section-wise breakdown     | Integration | Per-section scores in scorecard                     |
| Scorecard PDF generation   | Integration | Generate PDF -> verify file exists                  |
| Question analysis          | Integration | Difficulty index, discrimination index              |
| Analytics export           | Integration | Export to Excel/CSV                                 |
| Certificate generation     | Integration | Passed candidate -> certificate with unique number  |

### Module 9: Security Hardening & Audit

| Test                   | Type     | Description                               |
| ---------------------- | -------- | ----------------------------------------- |
| SQL injection attempt  | Security | Drizzle parameterized queries; no raw SQL |
| XSS attempt            | Security | Input with `<script>` -> sanitized        |
| JWT tampering          | Security | Modified payload -> signature failure     |
| Token replay           | Security | Reuse nonce -> rejected                   |
| Audit log integrity    | Security | Verify hash chain; tamper -> detect       |
| Rate limit enforcement | Security | Exceed limit -> 429                       |
| Device spoofing        | Security | Wrong hardware hash -> rejected           |
| VM detection           | Security | VM -> client refuses to start             |
| Lockdown bypass        | Security | All keyboard shortcuts blocked            |
| Path traversal         | Security | `../` in filename -> sanitized            |
| Password brute force   | Security | 5 attempts -> lockout                     |
| Permission escalation  | Security | Candidate -> admin endpoint -> 403        |

---

## 5. TEST ENVIRONMENT

### 5.1 Environments

| Environment         | Purpose            | Database               | Data                      |
| ------------------- | ------------------ | ---------------------- | ------------------------- |
| Local (dev)         | Developer testing  | `cbt_dev`              | Seed data                 |
| CI (GitHub Actions) | Automated tests    | `cbt_test` (ephemeral) | Migrated + seeded per run |
| Staging             | E2E + load testing | `cbt_staging`          | Production-like seed      |
| Production          | Live exams         | `cbt_platform`         | Real data                 |

### 5.2 CI Test Pipeline

```
GitHub PR Created
       │
       ▼
┌──────────────────────────┐
│  Job 1: Lint + Type Check│
│  - ESLint                │
│  - TypeScript (tsc)      │
│  - Prettier check        │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  Job 2: Unit Tests       │
│  - Vitest (all packages) │
│  - Coverage report       │
│  - Fail if < 80%         │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  Job 3: Integration Tests│
│  - Start PostgreSQL      │
│    (GitHub Actions       │
│     service container)   │
│  - Run Drizzle migrate    │
│  - Run integration tests │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  Job 4: Security Scan    │
│  - Snyk dependency scan  │
│  - npm audit             │
│  - ESLint security rules │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  All Jobs Pass?          │
│  YES -> PR can be merged │
│  NO  -> Block merge      │
└──────────────────────────┘
```

### 5.3 Pre-Release Pipeline

```
Merge to Main
       │
       ▼
┌──────────────────────────┐
│  Job 1-4 (same as PR)    │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  Job 5: E2E Tests        │
│  - Deploy to staging     │
│  - Run Playwright suite  │
│  - All 8 scenarios pass  │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  Job 6: Load Tests       │
│  - k6 against staging    │
│  - 500 concurrent users  │
│  - p95 < 500ms, 0 errors │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  All Pass?               │
│  YES -> Tag release      │
│  NO  -> Notify team      │
└──────────────────────────┘
```

---

## 6. TEST DATA MANAGEMENT

### 6.1 Seed Data

| Entity            | Count | Notes                                      |
| ----------------- | ----- | ------------------------------------------ |
| Institutions      | 1     | "Test Institute"                           |
| Centers           | 2     | "Center A", "Center B"                     |
| Batches           | 2     | "Batch 2026-A", "Batch 2026-B"             |
| Users (admin)     | 3     | super_admin, exam_admin, proctor           |
| Users (candidate) | 50    | candidate1-50@test.com                     |
| Subjects          | 5     | Physics, Chemistry, Math, Biology, English |
| Topics            | 15    | 3 per subject                              |
| Questions         | 100   | Mix of types, difficulties                 |
| Exams             | 2     | "Mock Test 1", "Mock Test 2"               |
| Exam batches      | 2     | One active, one scheduled                  |
| Devices           | 50    | DEV-001 to DEV-050                         |

### 6.2 Test Data Factory

```typescript
// tests/factories/question.factory.ts
export function createQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: randomUUID(),
    questionBankId: overrides.questionBankId ?? 'qb-test-1',
    subjectId: overrides.subjectId ?? 'subj-physics',
    topicId: overrides.topicId ?? 'topic-mechanics',
    type: overrides.type ?? 'mcq_single',
    difficulty: overrides.difficulty ?? 'medium',
    marks: overrides.marks ?? 4,
    negativeMarks: overrides.negativeMarks ?? 1,
    content: overrides.content ?? { text: 'Test question?' },
    options: overrides.options ?? [
      { id: 'opt-1', text: 'A', isCorrect: true, displayOrder: 1 },
      { id: 'opt-2', text: 'B', isCorrect: false, displayOrder: 2 },
    ],
    ...
  };
}
```

---

## 7. TEST TOOLS SUMMARY

| Tool                   | Version | Purpose                           |
| ---------------------- | ------- | --------------------------------- |
| Vitest                 | 2.x     | Unit + integration test runner    |
| @testing-library/react | 16.x    | React component testing           |
| supertest              | 7.x     | HTTP API integration testing      |
| Playwright             | 1.x     | E2E browser testing               |
| k6                     | latest  | Load testing                      |
| Snyk                   | latest  | Dependency vulnerability scanning |
| ESLint                 | 9.x     | Linting + security rules          |
| c8                     | latest  | Code coverage                     |
| Drizzle Kit            | latest  | Test database migrations          |

---

## 8. DOCUMENT METADATA

| Field                | Value                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Document Version** | 2.0 (Architecture Frozen)                                                                                                                |
| **Date Created**     | 2026-07-16                                                                                                                               |
| **Status**           | FROZEN — Architecture v1.0                                                                                                               |
| **Author**           | AI Agent (Architect Mode)                                                                                                                |
| **Prerequisites**    | PRD v2.0 (Frozen), TDR v2.0 (Frozen), SAD v2.0 (Frozen)                                                                                  |
| **Freeze Rule**      | Changes require: business requirement change, security issue, prototype failure, or performance test failure. No changes for preference. |
