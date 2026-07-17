# API SPECIFICATION

# Competitive CBT Platform

---

## 1. DOCUMENT PURPOSE

This document defines the complete API contract for the CBT Platform. No backend or frontend code is written until this contract is reviewed and approved. It covers REST endpoints, WebSocket events, request/response models, error formats, authentication flow, versioning, and rate limits.

---

## 2. API CONVENTIONS

### 2.1 Base URL

```
REST:   https://<exam-server-ip>/api/v1
WebSocket: wss://<exam-server-ip>/ws
```

### 2.2 Versioning

- URL-based versioning: `/api/v1/...`
- Breaking changes require `/api/v2/...` with backward compatibility for 1 major version
- Non-breaking changes (additive) do not require version bump

### 2.3 Content Type

- Request: `application/json`
- Response: `application/json`
- File uploads: `multipart/form-data`

### 2.4 Authentication

| Route Type             | Auth Method      | Header                                           |
| ---------------------- | ---------------- | ------------------------------------------------ |
| Public (login, health) | None             | N/A                                              |
| Admin REST             | JWT Access Token | `Authorization: Bearer <access_token>`           |
| Candidate REST         | JWT Access Token | `Authorization: Bearer <access_token>`           |
| WebSocket              | JWT Access Token | `?token=<access_token>` (query param on connect) |

### 2.5 Standard Response Envelope

**Success:**

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

**Error:**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is required",
    "details": [{ "field": "email", "message": "Email is required" }]
  }
}
```

### 2.6 Error Codes

| Code                        | HTTP Status | Description                                 |
| --------------------------- | ----------- | ------------------------------------------- |
| `VALIDATION_ERROR`          | 400         | Request validation failed                   |
| `UNAUTHORIZED`              | 401         | Missing or invalid token                    |
| `FORBIDDEN`                 | 403         | Insufficient permissions                    |
| `NOT_FOUND`                 | 404         | Resource not found                          |
| `CONFLICT`                  | 409         | Duplicate or conflicting state              |
| `RATE_LIMITED`              | 429         | Too many requests                           |
| `INTERNAL_ERROR`            | 500         | Server error                                |
| `SERVICE_UNAVAILABLE`       | 503         | Server overloaded or maintenance            |
| `EXAM_NOT_ACTIVE`           | 423         | Exam batch not in active state              |
| `DEVICE_NOT_REGISTERED`     | 403         | Device not registered or suspended          |
| `ATTEMPT_ALREADY_SUBMITTED` | 409         | Exam already submitted                      |
| `TOKEN_EXPIRED`             | 401         | JWT token expired                           |
| `TOKEN_REVOKED`             | 401         | JWT token revoked                           |
| `LOCKED_OUT`                | 423         | Account locked due to failed login attempts |

### 2.7 Pagination

| Parameter  | Default           | Max | Description            |
| ---------- | ----------------- | --- | ---------------------- |
| `page`     | 1                 | -   | Page number            |
| `pageSize` | 20                | 100 | Items per page         |
| `sort`     | `created_at:desc` | -   | Sort field:direction   |
| `search`   | -                 | -   | Full-text search query |

### 2.8 Rate Limiting

| Endpoint Category   | Limit | Window     | Key           |
| ------------------- | ----- | ---------- | ------------- |
| Auth (login)        | 5     | per minute | IP + email    |
| Auth (refresh)      | 10    | per minute | IP + user_id  |
| Admin REST (read)   | 120   | per minute | user_id       |
| Admin REST (write)  | 60    | per minute | user_id       |
| Candidate REST      | 60    | per minute | user_id       |
| WebSocket events    | 30    | per second | connection_id |
| WebSocket heartbeat | 2     | per minute | connection_id |

Rate limit headers:

```
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 119
X-RateLimit-Reset: 1721138400
```

---

## 3. AUTHENTICATION FLOW

### 3.1 Login

```
POST /api/v1/auth/login
```

**Request:**

```json
{
  "email": "candidate@example.com",
  "password": "SecurePass123!",
  "deviceId": "DEV-001-HASH123"
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbG...",
    "refreshToken": "eyJhbG...",
    "expiresIn": 900,
    "user": {
      "id": "uuid",
      "email": "candidate@example.com",
      "fullName": "John Doe",
      "role": "candidate"
    }
  }
}
```

**Error (401):** `UNAUTHORIZED` — Invalid credentials
**Error (403):** `DEVICE_NOT_REGISTERED` — Device not registered
**Error (423):** `LOCKED_OUT` — Account locked

### 3.2 Token Refresh

```
POST /api/v1/auth/refresh
```

**Request:**

```json
{
  "refreshToken": "eyJhbG..."
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbG...",
    "expiresIn": 900
  }
}
```

### 3.3 Logout

```
POST /api/v1/auth/logout
Authorization: Bearer <accessToken>
```

**Request:**

```json
{
  "refreshToken": "eyJhbG..."
}
```

**Response (200):**

```json
{
  "success": true,
  "data": { "message": "Logged out successfully" }
}
```

### 3.4 Change Password

```
POST /api/v1/auth/change-password
Authorization: Bearer <accessToken>
```

**Request:**

```json
{
  "currentPassword": "OldPass123!",
  "newPassword": "NewPass456!"
}
```

### 3.5 Get Current User

```
GET /api/v1/auth/me
Authorization: Bearer <accessToken>
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "fullName": "John Doe",
    "role": "exam_admin",
    "institution": { "id": "uuid", "name": "Test Institute" },
    "permissions": ["exams:read", "exams:write", ...]
  }
}
```

---

## 4. REST API — ADMIN ENDPOINTS

### 4.1 User Management

| Method | Path                 | Description                   | Roles       |
| ------ | -------------------- | ----------------------------- | ----------- |
| GET    | `/api/v1/users`      | List users (paginated)        | super_admin |
| GET    | `/api/v1/users/:id`  | Get user by ID                | super_admin |
| POST   | `/api/v1/users`      | Create user                   | super_admin |
| PUT    | `/api/v1/users/:id`  | Update user                   | super_admin |
| DELETE | `/api/v1/users/:id`  | Deactivate user (soft delete) | super_admin |
| POST   | `/api/v1/users/bulk` | Bulk import users             | super_admin |

**POST /api/v1/users — Request:**

```json
{
  "email": "proctor@example.com",
  "password": "SecurePass123!",
  "fullName": "Jane Smith",
  "role": "proctor",
  "institutionId": "uuid",
  "phone": "+1234567890"
}
```

**POST /api/v1/users/bulk — Request:**

```json
{
  "users": [
    {
      "email": "c1@example.com",
      "password": "Pass1!",
      "fullName": "Cand 1",
      "role": "candidate"
    },
    {
      "email": "c2@example.com",
      "password": "Pass2!",
      "fullName": "Cand 2",
      "role": "candidate"
    }
  ]
}
```

### 4.2 Institution & Center Management

| Method | Path                       | Description        | Roles                   |
| ------ | -------------------------- | ------------------ | ----------------------- |
| GET    | `/api/v1/institutions`     | List institutions  | super_admin             |
| POST   | `/api/v1/institutions`     | Create institution | super_admin             |
| PUT    | `/api/v1/institutions/:id` | Update institution | super_admin             |
| DELETE | `/api/v1/institutions/:id` | Delete institution | super_admin             |
| GET    | `/api/v1/centers`          | List centers       | super_admin, exam_admin |
| POST   | `/api/v1/centers`          | Create center      | super_admin             |
| PUT    | `/api/v1/centers/:id`      | Update center      | super_admin             |
| GET    | `/api/v1/batches`          | List batches       | super_admin, exam_admin |
| POST   | `/api/v1/batches`          | Create batch       | super_admin, exam_admin |
| PUT    | `/api/v1/batches/:id`      | Update batch       | super_admin, exam_admin |

### 4.3 Subject & Topic Management

| Method | Path                          | Description             | Roles                   |
| ------ | ----------------------------- | ----------------------- | ----------------------- |
| GET    | `/api/v1/subjects`            | List subjects           | all authenticated       |
| POST   | `/api/v1/subjects`            | Create subject          | super_admin, exam_admin |
| PUT    | `/api/v1/subjects/:id`        | Update subject          | super_admin, exam_admin |
| GET    | `/api/v1/subjects/:id/topics` | List topics for subject | all authenticated       |
| POST   | `/api/v1/topics`              | Create topic            | super_admin, exam_admin |
| PUT    | `/api/v1/topics/:id`          | Update topic            | super_admin, exam_admin |

### 4.4 Question Bank Management

| Method | Path                                   | Description                   | Roles                                    |
| ------ | -------------------------------------- | ----------------------------- | ---------------------------------------- |
| GET    | `/api/v1/question-banks`               | List question banks           | super_admin, exam_admin, question_author |
| POST   | `/api/v1/question-banks`               | Create question bank          | super_admin, exam_admin                  |
| PUT    | `/api/v1/question-banks/:id`           | Update question bank          | super_admin, exam_admin                  |
| GET    | `/api/v1/question-banks/:id/questions` | List questions in bank        | super_admin, exam_admin, question_author |
| POST   | `/api/v1/questions`                    | Create question               | super_admin, exam_admin, question_author |
| GET    | `/api/v1/questions/:id`                | Get question by ID            | super_admin, exam_admin, question_author |
| PUT    | `/api/v1/questions/:id`                | Update question               | super_admin, exam_author                 |
| DELETE | `/api/v1/questions/:id`                | Deactivate question           | super_admin, exam_admin                  |
| POST   | `/api/v1/questions/:id/approve`        | Approve question              | super_admin, exam_admin                  |
| GET    | `/api/v1/questions/:id/versions`       | Get question version history  | super_admin, exam_author                 |
| POST   | `/api/v1/questions/import`             | Import questions (JSON/Excel) | super_admin, exam_admin                  |
| GET    | `/api/v1/questions/export`             | Export questions (JSON/Excel) | super_admin, exam_admin                  |
| POST   | `/api/v1/questions/:id/media`          | Upload media for question     | super_admin, exam_author                 |

**POST /api/v1/questions — Request:**

```json
{
  "questionBankId": "uuid",
  "subjectId": "uuid",
  "topicId": "uuid",
  "type": "mcq_single",
  "difficulty": "medium",
  "cognitiveLevel": "apply",
  "marks": 4.0,
  "negativeMarks": 1.0,
  "estimatedTimeSecs": 120,
  "content": {
    "text": "What is the capital of France?",
    "latex": null,
    "passageId": null
  },
  "mediaUrls": [],
  "options": [
    { "text": "London", "isCorrect": false, "displayOrder": 1 },
    { "text": "Paris", "isCorrect": true, "displayOrder": 2 },
    { "text": "Berlin", "isCorrect": false, "displayOrder": 3 },
    { "text": "Madrid", "isCorrect": false, "displayOrder": 4 }
  ],
  "solution": {
    "text": "Paris is the capital of France.",
    "explanation": "France's capital city is Paris, located in the north-central part of the country."
  },
  "tags": ["geography", "europe", "capitals"]
}
```

**GET /api/v1/questions — Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `questionBankId` | UUID | Filter by bank |
| `subjectId` | UUID | Filter by subject |
| `topicId` | UUID | Filter by topic |
| `type` | string | Filter by question type |
| `difficulty` | string | Filter by difficulty |
| `isActive` | boolean | Filter active/inactive |
| `isApproved` | boolean | Filter approved/unapproved |
| `search` | string | Full-text search in content |

### 4.5 Exam Management

| Method | Path                                                    | Description                  | Roles                   |
| ------ | ------------------------------------------------------- | ---------------------------- | ----------------------- |
| GET    | `/api/v1/exams`                                         | List exams                   | super_admin, exam_admin |
| POST   | `/api/v1/exams`                                         | Create exam                  | super_admin, exam_admin |
| GET    | `/api/v1/exams/:id`                                     | Get exam with sections       | super_admin, exam_admin |
| PUT    | `/api/v1/exams/:id`                                     | Update exam                  | super_admin, exam_admin |
| DELETE | `/api/v1/exams/:id`                                     | Deactivate exam              | super_admin             |
| POST   | `/api/v1/exams/:id/sections`                            | Add section to exam          | super_admin, exam_admin |
| PUT    | `/api/v1/exams/:id/sections/:sectionId`                 | Update section               | super_admin, exam_admin |
| DELETE | `/api/v1/exams/:id/sections/:sectionId`                 | Remove section               | super_admin, exam_admin |
| POST   | `/api/v1/exams/:id/sections/:sectionId/questions`       | Add questions to section     | super_admin, exam_admin |
| PUT    | `/api/v1/exams/:id/sections/:sectionId/questions/:eqId` | Update exam question         | super_admin, exam_admin |
| DELETE | `/api/v1/exams/:id/sections/:sectionId/questions/:eqId` | Remove question from section | super_admin, exam_admin |

**POST /api/v1/exams — Request:**

```json
{
  "name": "JEE Mock Test 1",
  "code": "JEE-MOCK-001",
  "description": "Full-length JEE mock test",
  "durationMinutes": 180,
  "totalMarks": 300,
  "passingMarks": 100,
  "hasNegativeMarking": true,
  "selectionStrategy": "static",
  "navigationMode": "free",
  "shuffleQuestions": false,
  "shuffleOptions": true,
  "instructions": {
    "title": "JEE Mock Test 1",
    "body": "Read all instructions carefully before starting.",
    "rules": ["No calculators", "No electronic devices"]
  },
  "resultVisibility": "delayed"
}
```

### 4.6 Exam Batch (Session) Management

| Method | Path                                       | Description                            | Roles                            |
| ------ | ------------------------------------------ | -------------------------------------- | -------------------------------- |
| GET    | `/api/v1/exam-batches`                     | List exam batches                      | super_admin, exam_admin          |
| POST   | `/api/v1/exam-batches`                     | Create exam batch                      | super_admin, exam_admin          |
| GET    | `/api/v1/exam-batches/:id`                 | Get batch details                      | super_admin, exam_admin          |
| PUT    | `/api/v1/exam-batches/:id`                 | Update batch                           | super_admin, exam_admin          |
| POST   | `/api/v1/exam-batches/:id/publish`         | Publish batch (scheduled -> published) | super_admin, exam_admin          |
| POST   | `/api/v1/exam-batches/:id/activate`        | Activate batch (published -> active)   | super_admin, exam_admin          |
| POST   | `/api/v1/exam-batches/:id/pause`           | Pause batch (active -> paused)         | super_admin, exam_admin          |
| POST   | `/api/v1/exam-batches/:id/resume`          | Resume batch (paused -> active)        | super_admin, exam_admin          |
| POST   | `/api/v1/exam-batches/:id/finish`          | Finish batch                           | super_admin, exam_admin          |
| POST   | `/api/v1/exam-batches/:id/publish-results` | Publish results                        | super_admin, exam_admin          |
| POST   | `/api/v1/exam-batches/:id/candidates`      | Assign candidates to batch             | super_admin, exam_admin          |
| GET    | `/api/v1/exam-batches/:id/candidates`      | List candidates in batch               | super_admin, exam_admin          |
| GET    | `/api/v1/exam-batches/:id/attempts`        | List attempts in batch                 | super_admin, exam_admin          |
| GET    | `/api/v1/exam-batches/:id/monitor`         | Get monitoring snapshot                | super_admin, exam_admin, proctor |

### 4.7 Candidate Management

| Method | Path                                | Description               | Roles                   |
| ------ | ----------------------------------- | ------------------------- | ----------------------- |
| GET    | `/api/v1/candidates`                | List candidates           | super_admin, exam_admin |
| POST   | `/api/v1/candidates`                | Create candidate          | super_admin, exam_admin |
| GET    | `/api/v1/candidates/:id`            | Get candidate             | super_admin, exam_admin |
| PUT    | `/api/v1/candidates/:id`            | Update candidate          | super_admin, exam_admin |
| POST   | `/api/v1/candidates/bulk`           | Bulk import candidates    | super_admin, exam_admin |
| GET    | `/api/v1/candidates/:id/admit-card` | Generate admit card (PDF) | super_admin, exam_admin |

### 4.8 Device Management

| Method | Path                           | Description             | Roles                   |
| ------ | ------------------------------ | ----------------------- | ----------------------- |
| GET    | `/api/v1/devices`              | List registered devices | super_admin, exam_admin |
| POST   | `/api/v1/devices`              | Register device         | super_admin             |
| GET    | `/api/v1/devices/:id`          | Get device details      | super_admin, exam_admin |
| PUT    | `/api/v1/devices/:id`          | Update device           | super_admin             |
| POST   | `/api/v1/devices/:id/suspend`  | Suspend device          | super_admin             |
| POST   | `/api/v1/devices/:id/activate` | Activate device         | super_admin             |

### 4.9 Monitoring

| Method | Path                                               | Description               | Roles                            |
| ------ | -------------------------------------------------- | ------------------------- | -------------------------------- |
| GET    | `/api/v1/monitor/batches`                          | List active exam batches  | super_admin, exam_admin, proctor |
| GET    | `/api/v1/monitor/batches/:id/snapshot`             | Get real-time snapshot    | super_admin, exam_admin, proctor |
| GET    | `/api/v1/monitor/batches/:id/candidates`           | List candidate statuses   | super_admin, exam_admin, proctor |
| GET    | `/api/v1/monitor/candidates/:attemptId`            | Get candidate detail      | super_admin, exam_admin, proctor |
| GET    | `/api/v1/monitor/candidates/:attemptId/violations` | Get violations            | super_admin, exam_admin, proctor |
| POST   | `/api/v1/monitor/candidates/:attemptId/warn`       | Send warning to candidate | super_admin, exam_admin, proctor |
| POST   | `/api/v1/monitor/candidates/:attemptId/pause`      | Pause candidate exam      | super_admin, exam_admin          |
| POST   | `/api/v1/monitor/candidates/:attemptId/terminate`  | Terminate candidate exam  | super_admin, exam_admin          |
| GET    | `/api/v1/monitor/server-health`                    | Get server health metrics | super_admin, exam_admin          |

**GET /api/v1/monitor/batches/:id/snapshot — Response:**

```json
{
  "success": true,
  "data": {
    "examBatchId": "uuid",
    "examName": "JEE Mock Test 1",
    "status": "active",
    "totalCandidates": 500,
    "statusBreakdown": {
      "inProgress": 487,
      "submitted": 10,
      "autoSubmitted": 0,
      "disconnected": 3
    },
    "averageProgress": 45.2,
    "violations": {
      "total": 5,
      "bySeverity": { "low": 2, "medium": 2, "high": 1, "critical": 0 }
    },
    "serverHealth": {
      "cpuUsage": 42.5,
      "memoryUsage": 58.3,
      "activeConnections": 490,
      "uptime": 3600
    }
  }
}
```

### 4.10 Results & Analytics

| Method | Path                                         | Description                | Roles                   |
| ------ | -------------------------------------------- | -------------------------- | ----------------------- |
| POST   | `/api/v1/exam-batches/:id/grade`             | Trigger auto-grading       | super_admin, exam_admin |
| GET    | `/api/v1/exam-batches/:id/results`           | List results               | super_admin, exam_admin |
| GET    | `/api/v1/exam-batches/:id/rank-list`         | Get rank list              | super_admin, exam_admin |
| GET    | `/api/v1/attempts/:id/scorecard`             | Get candidate scorecard    | super_admin, exam_admin |
| GET    | `/api/v1/exam-batches/:id/analytics`         | Get analytics snapshot     | super_admin, exam_admin |
| GET    | `/api/v1/exam-batches/:id/question-analysis` | Get question-wise analysis | super_admin, exam_admin |
| GET    | `/api/v1/exam-batches/:id/export-results`    | Export results (PDF/Excel) | super_admin, exam_admin |
| GET    | `/api/v1/attempts/:id/scorecard/pdf`         | Download scorecard PDF     | super_admin, exam_admin |

### 4.11 Audit & System

| Method | Path                            | Description                   | Roles       |
| ------ | ------------------------------- | ----------------------------- | ----------- |
| GET    | `/api/v1/audit-logs`            | List audit logs (paginated)   | super_admin |
| GET    | `/api/v1/audit-logs/export`     | Export audit logs             | super_admin |
| GET    | `/api/v1/system-settings`       | List system settings          | super_admin |
| PUT    | `/api/v1/system-settings/:key`  | Update system setting         | super_admin |
| GET    | `/api/v1/security-policies`     | List security policies        | super_admin |
| PUT    | `/api/v1/security-policies/:id` | Update security policy        | super_admin |
| GET    | `/api/v1/health`                | Health check (public)         | none        |
| GET    | `/api/v1/health/detailed`       | Detailed health (includes DB) | super_admin |

---

## 5. REST API — CANDIDATE ENDPOINTS

### 5.1 Exam Access

| Method | Path                                            | Description                                | Auth      |
| ------ | ----------------------------------------------- | ------------------------------------------ | --------- |
| GET    | `/api/v1/candidate/exams`                       | List assigned exams                        | candidate |
| GET    | `/api/v1/candidate/exams/:batchId`              | Get exam metadata (sections, instructions) | candidate |
| GET    | `/api/v1/candidate/exams/:batchId/questions`    | Get questions for exam (encrypted)         | candidate |
| POST   | `/api/v1/candidate/exams/:batchId/start`        | Start exam attempt                         | candidate |
| POST   | `/api/v1/candidate/exams/:batchId/submit`       | Submit exam                                | candidate |
| GET    | `/api/v1/candidate/attempts/:attemptId/status`  | Get attempt status                         | candidate |
| GET    | `/api/v1/candidate/attempts/:attemptId/answers` | Get saved answers (for resume)             | candidate |

**POST /api/v1/candidate/exams/:batchId/start — Request:**

```json
{
  "deviceId": "DEV-001-HASH123"
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "attemptId": "uuid",
    "examBatchId": "uuid",
    "status": "in_progress",
    "startedAt": "2026-07-16T10:00:00Z",
    "durationSeconds": 10800,
    "remainingTimeSeconds": 10800,
    "sections": [
      {
        "id": "uuid",
        "name": "Physics",
        "sectionOrder": 1,
        "durationMinutes": 60,
        "questionCount": 25,
        "totalMarks": 100
      }
    ]
  }
}
```

**Error (423):** `EXAM_NOT_ACTIVE` — Exam batch not active
**Error (409):** `ATTEMPT_ALREADY_SUBMITTED` — Already submitted
**Error (403):** `DEVICE_NOT_REGISTERED` — Device not registered

### 5.2 Answer Save (REST fallback)

| Method | Path                                                               | Description                            | Auth      |
| ------ | ------------------------------------------------------------------ | -------------------------------------- | --------- |
| PUT    | `/api/v1/candidate/attempts/:attemptId/answers`                    | Save answer (REST)                     | candidate |
| PUT    | `/api/v1/candidate/attempts/:attemptId/answers/batch`              | Save multiple answers                  | candidate |
| PUT    | `/api/v1/candidate/attempts/:attemptId/answers/:questionId/status` | Update answer status (mark for review) | candidate |

**PUT /api/v1/candidate/attempts/:attemptId/answers — Request:**

```json
{
  "questionId": "uuid",
  "answerData": {
    "selectedOptionIds": ["uuid-1"]
  },
  "status": "answered",
  "timeSpentSecs": 45,
  "nonce": "abc123def456",
  "timestamp": "2026-07-16T10:05:00Z",
  "signature": "hmac-sha256-signature"
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "questionId": "uuid",
    "status": "answered",
    "serverTimestamp": "2026-07-16T10:05:00.123Z",
    "confirmed": true
  }
}
```

---

## 6. WEBSOCKET EVENT SPECIFICATION

### 6.1 Connection

```
CONNECT wss://<exam-server-ip>/ws?token=<accessToken>
```

**On connect:**

- Server validates JWT
- Server identifies user role and active attempt (if any)
- Server joins connection to appropriate room (exam_batch_id for candidates, admin room for admins)
- Server sends `connection:open` event

**Connection events:**

| Event                  | Direction        | Description            |
| ---------------------- | ---------------- | ---------------------- |
| `connection:open`      | Server -> Client | Connection established |
| `connection:close`     | Server -> Client | Connection closing     |
| `connection:error`     | Server -> Client | Connection error       |
| `connection:heartbeat` | Bidirectional    | Keep-alive ping/pong   |

**`connection:open` payload:**

```json
{
  "type": "connection:open",
  "data": {
    "connectionId": "conn-uuid",
    "serverTime": "2026-07-16T10:00:00Z",
    "heartbeatInterval": 30
  }
}
```

### 6.2 Candidate Events (Client -> Server)

| Event                  | Description                                   | Payload                                                |
| ---------------------- | --------------------------------------------- | ------------------------------------------------------ |
| `exam:start`           | Start exam session                            | `{ attemptId }`                                        |
| `answer:save`          | Save single answer                            | See below                                              |
| `answer:save_batch`    | Save multiple answers                         | `{ answers: [...] }`                                   |
| `answer:status_update` | Update answer status (mark for review, visit) | `{ attemptId, questionId, status, timeSpentSecs }`     |
| `section:navigate`     | Navigate to section                           | `{ attemptId, sectionId }`                             |
| `question:navigate`    | Navigate to question                          | `{ attemptId, questionId, sectionId }`                 |
| `exam:submit`          | Submit exam                                   | `{ attemptId, nonce, signature }`                      |
| `heartbeat`            | Client heartbeat                              | `{ attemptId, currentQuestionId, remainingTimeSecs }`  |
| `violation:report`     | Client-side violation detected                | `{ attemptId, violationType, description, timestamp }` |

**`answer:save` payload:**

```json
{
  "type": "answer:save",
  "data": {
    "attemptId": "uuid",
    "questionId": "uuid",
    "answerData": {
      "selectedOptionIds": ["uuid-1", "uuid-3"]
    },
    "status": "answered",
    "timeSpentSecs": 45,
    "nonce": "random-nonce-string",
    "timestamp": "2026-07-16T10:05:00Z",
    "signature": "hmac-sha256(answer_data + nonce + timestamp, session_key)"
  }
}
```

### 6.3 Candidate Events (Server -> Client)

| Event                      | Description                        | Payload                                                           |
| -------------------------- | ---------------------------------- | ----------------------------------------------------------------- |
| `answer:saved`             | Answer save confirmed              | `{ questionId, serverTimestamp, confirmed: true }`                |
| `answer:save_error`        | Answer save failed                 | `{ questionId, error: { code, message } }`                        |
| `exam:started`             | Exam session started               | `{ attemptId, remainingTimeSecs, sections }`                      |
| `exam:submitted`           | Exam submission confirmed          | `{ attemptId, status, submittedAt }`                              |
| `exam:auto_submit_warning` | Auto-submit warning (5 min before) | `{ attemptId, remainingTimeSecs }`                                |
| `exam:auto_submitted`      | Auto-submit triggered by server    | `{ attemptId, reason: "time_expired" }`                           |
| `exam:paused`              | Exam paused by admin               | `{ attemptId, reason, pausedAt }`                                 |
| `exam:resumed`             | Exam resumed by admin              | `{ attemptId, remainingTimeSecs, resumedAt }`                     |
| `exam:terminated`          | Exam terminated by admin           | `{ attemptId, reason, terminatedAt }`                             |
| `session:warning`          | Proctor warning                    | `{ attemptId, message, fromProctor }`                             |
| `session:time_sync`        | Server time correction             | `{ serverTime, remainingTimeSecs, driftSecs }`                    |
| `session:resume`           | Session resume data (on reconnect) | `{ attemptId, remainingTimeSecs, lastQuestionId, unsyncedCount }` |
| `heartbeat:ack`            | Heartbeat acknowledgment           | `{ serverTime, remainingTimeSecs }`                               |

### 6.4 Admin/Proctor Events (Client -> Server)

| Event                      | Description                        | Payload                  |
| -------------------------- | ---------------------------------- | ------------------------ |
| `monitor:subscribe`        | Subscribe to exam batch monitoring | `{ examBatchId }`        |
| `monitor:unsubscribe`      | Unsubscribe from monitoring        | `{ examBatchId }`        |
| `monitor:candidate_detail` | Request candidate detail           | `{ attemptId }`          |
| `proctor:warn`             | Send warning to candidate          | `{ attemptId, message }` |
| `proctor:pause`            | Pause candidate exam               | `{ attemptId, reason }`  |
| `proctor:terminate`        | Terminate candidate exam           | `{ attemptId, reason }`  |
| `proctor:message`          | Send message to candidate          | `{ attemptId, message }` |

### 6.5 Admin/Proctor Events (Server -> Client)

| Event                      | Description               | Payload                                                          |
| -------------------------- | ------------------------- | ---------------------------------------------------------------- |
| `monitor:snapshot`         | Periodic batch snapshot   | See monitoring snapshot                                          |
| `monitor:candidate_update` | Candidate status change   | `{ attemptId, oldStatus, newStatus, timestamp }`                 |
| `monitor:alert`            | Violation alert           | `{ attemptId, violationType, severity, description, timestamp }` |
| `monitor:candidate_detail` | Candidate detail response | `{ attemptId, status, progress, answers, violations }`           |
| `monitor:connection_stats` | Connection statistics     | `{ totalConnections, activeConnections, disconnectedCount }`     |
| `proctor:action_confirmed` | Proctor action confirmed  | `{ attemptId, action, confirmed: true }`                         |

**`monitor:snapshot` payload:**

```json
{
  "type": "monitor:snapshot",
  "data": {
    "examBatchId": "uuid",
    "timestamp": "2026-07-16T10:05:00Z",
    "candidates": [
      {
        "attemptId": "uuid",
        "candidateId": "uuid",
        "candidateName": "John D.",
        "status": "in_progress",
        "progress": 45,
        "answeredCount": 22,
        "remainingTimeSecs": 5400,
        "lastActivity": "2026-07-16T10:04:30Z",
        "violations": 0,
        "currentSection": "Physics"
      }
    ],
    "summary": {
      "total": 500,
      "inProgress": 487,
      "submitted": 10,
      "disconnected": 3,
      "totalViolations": 5
    }
  }
}
```

### 6.6 WebSocket Error Handling

| Scenario                   | Server Action                                  | Client Action              |
| -------------------------- | ---------------------------------------------- | -------------------------- |
| Invalid JWT on connect     | Close connection with code 4001                | Re-authenticate            |
| JWT expired during session | Send `connection:error` with code 4002, close  | Refresh token, reconnect   |
| Rate limit exceeded        | Send `connection:error` with code 4003         | Back off, reduce frequency |
| Invalid event format       | Send `connection:error` with code 4004         | Fix payload, retry         |
| Unknown event type         | Ignore, send `connection:error` with code 4005 | Log and continue           |

**WebSocket close codes:**

| Code | Description                         |
| ---- | ----------------------------------- |
| 1000 | Normal closure                      |
| 1001 | Going away (server shutdown)        |
| 1006 | Abnormal closure (network drop)     |
| 4001 | Authentication failed               |
| 4002 | Token expired                       |
| 4003 | Rate limit exceeded                 |
| 4004 | Protocol violation                  |
| 4005 | Exam batch ended                    |
| 4006 | Device suspended                    |
| 4007 | Duplicate connection (same attempt) |

---

## 7. DATA MODELS (SHARED TYPESCRIPT)

### 7.1 User

```typescript
interface User {
  id: string;
  email: string;
  fullName: string;
  role:
    | "super_admin"
    | "exam_admin"
    | "proctor"
    | "question_author"
    | "candidate";
  institutionId: string | null;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### 7.2 Question

```typescript
interface Question {
  id: string;
  questionBankId: string;
  subjectId: string;
  topicId: string | null;
  type: QuestionType;
  difficulty: "easy" | "medium" | "hard" | "very_hard";
  cognitiveLevel: string | null;
  marks: number;
  negativeMarks: number;
  estimatedTimeSecs: number | null;
  content: {
    text: string;
    latex?: string;
    passageId?: string;
    imageUrl?: string;
    audioUrl?: string;
    videoUrl?: string;
  };
  options?: QuestionOption[];
  solution?: {
    text: string;
    explanation: string;
  };
  tags: string[];
  isActive: boolean;
  version: number;
  isApproved: boolean;
  createdAt: string;
  updatedAt: string;
}

interface QuestionOption {
  id: string;
  text: string;
  optionMediaUrl: string | null;
  isCorrect: boolean;
  displayOrder: number;
}
```

### 7.3 Exam

```typescript
interface Exam {
  id: string;
  name: string;
  code: string;
  description: string | null;
  durationMinutes: number;
  totalMarks: number;
  passingMarks: number | null;
  hasNegativeMarking: boolean;
  selectionStrategy: "static" | "random" | "hybrid";
  navigationMode: "free" | "linear" | "section_free";
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  instructions: {
    title: string;
    body: string;
    rules: string[];
  } | null;
  resultVisibility: "instant" | "delayed" | "score_only";
  sections: ExamSection[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ExamSection {
  id: string;
  examId: string;
  name: string;
  sectionOrder: number;
  durationMinutes: number | null;
  totalMarks: number;
  negativeMarkingPercentage: number;
  questionCount: number;
  navigationMode: "free" | "linear" | "section_free" | null;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  instructions: object | null;
}
```

### 7.4 Attempt & Answer

```typescript
interface Attempt {
  id: string;
  examBatchId: string;
  candidateId: string;
  deviceId: string;
  status:
    | "not_started"
    | "in_progress"
    | "paused"
    | "submitted"
    | "auto_submitted"
    | "force_submitted"
    | "terminated"
    | "abandoned";
  startedAt: string | null;
  submittedAt: string | null;
  remainingTimeSecs: number | null;
  lastQuestionIdSeen: string | null;
  isReconnected: boolean;
  reconnectedCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Answer {
  id: string;
  attemptId: string;
  questionId: string;
  answerData: {
    selectedOptionIds?: string[];
    textInput?: string;
    numericalAnswer?: number;
    matchingPairs?: { leftId: string; rightId: string }[];
    dragDropOrder?: string[];
  } | null;
  status:
    | "not_visited"
    | "visited"
    | "answered"
    | "marked_for_review"
    | "answered_and_marked";
  timeSpentSecs: number;
  isMarkedForReview: boolean;
  firstVisitedAt: string | null;
  lastUpdatedAt: string | null;
}
```

### 7.5 WebSocket Message Envelope

```typescript
interface WSMessage<T = unknown> {
  type: string;
  data: T;
  id?: string; // Message ID for acknowledgements
  timestamp: string; // ISO 8601
}

interface WSResponse<T = unknown> {
  type: string;
  data: T;
  id?: string; // Matches request ID
  error?: {
    code: string;
    message: string;
  };
}
```

---

## 8. FILE UPLOAD SPECIFICATION

### 8.1 Media Upload (Questions)

```
POST /api/v1/questions/:id/media
Content-Type: multipart/form-data
Authorization: Bearer <accessToken>
```

**Form fields:**
| Field | Type | Description |
|-------|------|-------------|
| `file` | File | Image (PNG/JPG/WebP, max 5MB), Audio (MP3/WAV, max 20MB), Video (MP4/WebM, max 50MB) |
| `mediaType` | String | `image` / `audio` / `video` |

**Response (201):**

```json
{
  "success": true,
  "data": {
    "mediaUrl": "/media/questions/uuid/image.png",
    "mediaType": "image",
    "fileSize": 102400,
    "mimeType": "image/png"
  }
}
```

### 8.2 Bulk Import (Questions)

```
POST /api/v1/questions/import
Content-Type: multipart/form-data
```

**Form fields:**
| Field | Type | Description |
|-------|------|-------------|
| `file` | File | JSON, Excel (.xlsx), or CSV |
| `questionBankId` | String | Target question bank |
| `subjectId` | String | Default subject |

### 8.3 Bulk Import (Candidates)

```
POST /api/v1/candidates/bulk
Content-Type: multipart/form-data
```

**Form fields:**
| Field | Type | Description |
|-------|------|-------------|
| `file` | File | Excel (.xlsx) or CSV with columns: email, fullName, batchId |
| `batchId` | String | Target batch |

---

## 9. DOCUMENT METADATA

| Field                | Value                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Document Version** | 2.0 (Architecture Frozen)                                                                                                                |
| **Date Created**     | 2026-07-16                                                                                                                               |
| **Status**           | FROZEN — Architecture v1.0                                                                                                               |
| **Author**           | AI Agent (Architect Mode)                                                                                                                |
| **Prerequisites**    | PRD v2.0 (Frozen), TDR v2.0 (Frozen), SAD v2.0 (Frozen), DATABASE_DESIGN v2.0                                                            |
| **Freeze Rule**      | Changes require: business requirement change, security issue, prototype failure, or performance test failure. No changes for preference. |
| **REST Endpoints**   | 80+ endpoints across 11 resource groups                                                                                                  |
| **WebSocket Events** | 30+ events (candidate + admin)                                                                                                           |
