# SECURITY ARCHITECTURE DOCUMENT

# Competitive CBT Platform

---

## 1. DOCUMENT PURPOSE

This document defines the complete security architecture for the CBT Platform. It covers authentication, authorization, device registration, JWT lifecycle, TLS, replay protection, audit logging, secret management, encryption, secure updates, threat modeling, and OWASP compliance.

**Security Principle: Never trust client data. All client input is untrusted until validated server-side.**

---

## 2. THREAT MODEL (STRIDE ANALYSIS)

### 2.1 STRIDE Framework

| Threat Category            | Threat                                     | Impact                     | Mitigation                                                                          |
| -------------------------- | ------------------------------------------ | -------------------------- | ----------------------------------------------------------------------------------- |
| **Spoofing**               | Candidate impersonates another candidate   | Exam integrity compromised | JWT device binding + credential verification + device fingerprint                   |
| **Spoofing**               | Rogue server impersonates exam server      | Answer theft, MITM         | TLS with certificate pinning on client                                              |
| **Tampering**              | Candidate modifies answer after submission | Score manipulation         | Server-authoritative timestamps + answer signing + audit trail                      |
| **Tampering**              | Candidate modifies local timer             | Extra exam time            | Server-authoritative timer; client time is display-only                             |
| **Tampering**              | Admin tampers with audit logs              | Cover tracks               | Tamper-evident hash chain; append-only logs; separate log storage                   |
| **Tampering**              | Question bank content stolen from DB       | Exam leak                  | AES-256 encryption at rest; access controls; audit logging                          |
| **Repudiation**            | Candidate denies submitting answers        | Dispute                    | Cryptographic answer signing; server timestamps; audit trail                        |
| **Repudiation**            | Admin denies performing action             | Accountability             | Audit log with user ID, IP, timestamp, hash chain                                   |
| **Information Disclosure** | Questions leaked before exam               | Exam invalid               | Questions encrypted at rest; delivered only after exam:start; not cached in browser |
| **Information Disclosure** | Answers visible to other candidates        | Privacy violation          | Per-attempt data isolation; RBAC; no cross-candidate queries                        |
| **Information Disclosure** | Passwords exposed in logs                  | Credential theft           | Pino redaction filters; passwords never logged                                      |
| **Denial of Service**      | Client floods server with requests         | Exam disruption            | Rate limiting (Nginx + application); WebSocket message limits                       |
| **Denial of Service**      | Malicious client opens many connections    | Resource exhaustion        | Connection limits per device; duplicate connection detection                        |
| **Elevation of Privilege** | Candidate accesses admin endpoints         | Full system compromise     | RBAC enforcement on every route; JWT role verification                              |
| **Elevation of Privilege** | Candidate modifies their role in JWT       | Admin access               | JWT signature verification; server-side role lookup from DB                         |

### 2.2 Attack Surface Map

```
┌─────────────────────────────────────────────────────────────────────┐
│  ATTACK SURFACES                                                    │
│                                                                     │
│  1. REST API Endpoints (/api/v1/*)                                 │
│     - Input validation, auth, RBAC, rate limiting                  │
│                                                                     │
│  2. WebSocket Connection (/ws)                                     │
│     - Token validation, event validation, rate limiting            │
│                                                                     │
│  3. Admin Dashboard (web application)                              │
│     - XSS, CSRF, auth token storage                                │
│                                                                     │
│  4. Exam Client (C# WPF app)                                     │
│     - Lockdown bypass, local data encryption, native Win32 security  │
│                                                                     │
│  5. Database (PostgreSQL)                                          │
│     - Access control, encryption at rest, connection security      │
│                                                                     │
│  6. File Storage (media, logs, backups)                            │
│     - File permissions, encryption, access control                 │
│                                                                     │
│  7. Network (LAN)                                                  │
│     - TLS, firewall, no internet exposure                          │
│                                                                     │
│  8. Nginx (Reverse Proxy)                                          │
│     - TLS config, rate limiting, header security                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. AUTHENTICATION ARCHITECTURE

### 3.1 Authentication Flow

```
                    LOGIN FLOW
                    ==========

Candidate/Admin
    │
    │  1. Submit credentials (email + password + deviceId)
    │
    ▼
┌──────────────┐
│  Nginx (TLS) │  2. TLS termination
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Fastify     │  3. Rate limit check (5/min per IP+email)
│  Auth Route  │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Auth Service│  4. Lookup user by email
│              │  5. Check account lock (failed_login_count >= 5)
│              │  6. Verify password (argon2.verify)
│              │  7. Check user is active
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Device      │  8. Verify device_id is registered
│  Validation  │  9. Check device status (active)
│              │ 10. Check device belongs to candidate's center
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Token       │ 11. Generate access token (JWT, 15min)
│  Generation  │ 12. Generate refresh token (JWT, 24h)
│              │ 13. Store token JTI in session_tokens table
│              │ 14. Update last_login_at, reset failed_login_count
└──────┬───────┘
       │
       ▼
    Return access_token + refresh_token
```

### 3.2 Password Security

| Policy              | Value                                                   | Rationale                                                                                  |
| ------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Minimum length      | 8 characters                                            | Baseline security                                                                          |
| Hashing algorithm   | Argon2id                                                | OWASP 2026 first choice; memory-hard (defeats GPU/ASIC); RFC 9106                          |
| Argon2id parameters | memoryCost: 65536 (64 MiB), timeCost: 3, parallelism: 1 | ~100ms per hash (balances security vs performance)                                         |
| Max failed attempts | 5                                                       | Prevent brute force                                                                        |
| Lockout duration    | 15 minutes                                              | Temporary lock after 5 failures                                                            |
| Password reset      | Admin-initiated only                                    | No email in LAN environment                                                                |
| Password storage    | Argon2id hash only                                      | Never store plaintext or reversibly encrypted; no 72-byte truncation limit (unlike bcrypt) |

### 3.3 JWT Token Design

#### Access Token

```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "sub": "user-uuid",
    "email": "user@example.com",
    "role": "candidate",
    "deviceId": "device-uuid",
    "attemptId": "attempt-uuid",
    "examBatchId": "batch-uuid",
    "jti": "unique-token-id",
    "iat": 1721138000,
    "exp": 1721138900
  }
}
```

| Claim         | Description                               |
| ------------- | ----------------------------------------- |
| `sub`         | User ID (UUID)                            |
| `email`       | User email (for audit)                    |
| `role`        | User role (for RBAC)                      |
| `deviceId`    | Bound device ID (device binding)          |
| `attemptId`   | Bound attempt ID (for candidates only)    |
| `examBatchId` | Bound exam batch ID (for candidates only) |
| `jti`         | Unique token identifier (for revocation)  |
| `iat`         | Issued at (Unix timestamp)                |
| `exp`         | Expiry (Unix timestamp, iat + 900s)       |

#### Refresh Token

```json
{
  "payload": {
    "sub": "user-uuid",
    "jti": "unique-refresh-token-id",
    "type": "refresh",
    "iat": 1721138000,
    "exp": 1721224400
  }
}
```

### 3.4 JWT Lifecycle

```
                    JWT LIFECYCLE
                    =============

    ┌──────────┐
    │  Login   │
    └────┬─────┘
         │
         ▼
    ┌──────────┐     ┌──────────┐
    │  Access  │────►│  Expired │
    │  Token   │     │  (15min) │
    │  (valid) │     └────┬─────┘
    └────┬─────┘          │
         │                │
         │                ▼
         │          ┌──────────┐
         │          │  Refresh │
         │          │  Token   │
         │          │  (24h)   │
         │          └────┬─────┘
         │               │
         │               ▼
         │          ┌──────────┐
         │          │  POST    │
         │          │  /auth/  │
         │          │  refresh │
         │          └────┬─────┘
         │               │
         │               ▼
         │          ┌──────────┐
         └──────────┤  New     │
                    │  Access  │
                    │  Token   │
                    └──────────┘

    REVOCATION PATH:
    ┌──────────┐
    │  Logout  │──► Mark session_tokens.is_revoked = true
    └──────────┘
    ┌──────────┐
    │  Admin   │──► Revoke by user_id or jti
    │  Revoke  │
    └──────────┘
    ┌──────────┐
    │  Device  │──► Revoke all tokens for device_id
    │  Suspend │
    └──────────┘
    ┌──────────┐
    │  Exam    │──► Revoke all tokens for attempt_id
    │  End     │
    └──────────┘
```

### 3.5 Token Validation Pipeline

Every authenticated request goes through:

```
1. Extract token from Authorization header
2. Verify JWT signature (HMAC-SHA256 with server secret)
3. Check expiry (exp > current_time)
4. Check revocation (session_tokens table, is_revoked = false)
5. Verify device binding (token deviceId matches requesting device)
6. Verify attempt binding (if candidate, token attemptId matches active attempt)
7. Load user from database (verify user is still active)
8. Attach user context to request
```

---

## 4. AUTHORIZATION (RBAC)

### 4.1 Permission Matrix

| Resource              | super_admin | exam_admin | proctor      | question_author | candidate      |
| --------------------- | ----------- | ---------- | ------------ | --------------- | -------------- |
| **Users**             | CRUD        | Read       | -            | -               | -              |
| **Institutions**      | CRUD        | Read       | -            | -               | -              |
| **Centers**           | CRUD        | Read       | -            | -               | -              |
| **Batches**           | CRUD        | CRUD       | Read         | -               | -              |
| **Candidates**        | CRUD        | CRUD       | Read         | -               | Read (own)     |
| **Subjects**          | CRUD        | CRUD       | -            | Read            | -              |
| **Question Banks**    | CRUD        | CRUD       | -            | CRUD            | -              |
| **Questions**         | CRUD        | CRUD       | -            | CRUD            | -              |
| **Exams**             | CRUD        | CRUD       | -            | -               | -              |
| **Exam Batches**      | CRUD        | CRUD       | Read         | -               | -              |
| **Exam Lifecycle**    | All         | All        | -            | -               | -              |
| **Monitoring**        | Full        | Full       | Read + Warn  | -               | -              |
| **Proctoring**        | All         | All        | Warn + Pause | -               | -              |
| **Results**           | Full        | Full       | -            | -               | Read (own)     |
| **Analytics**         | Full        | Full       | -            | -               | -              |
| **Audit Logs**        | Full        | -          | -            | -               | -              |
| **System Settings**   | CRUD        | -          | -            | -               | -              |
| **Security Policies** | CRUD        | -          | -            | -               | -              |
| **Devices**           | CRUD        | Read       | -            | -               | -              |
| **Exam Taking**       | -           | -          | -            | -               | Start + Submit |

### 4.2 RBAC Implementation

```typescript
// Middleware: verifyRole
function verifyRole(...allowedRoles: UserRole[]) {
  return async (request, reply) => {
    const user = request.user; // Set by auth middleware
    if (!allowedRoles.includes(user.role)) {
      return reply.code(403).send({
        success: false,
        error: { code: "FORBIDDEN", message: "Insufficient permissions" },
      });
    }
  };
}

// Middleware: verifyPermission
function verifyPermission(resource: string, action: string) {
  return async (request, reply) => {
    const user = request.user;
    const hasPermission = await permissionService.check(
      user.role,
      resource,
      action,
    );
    if (!hasPermission) {
      return reply.code(403).send({
        success: false,
        error: { code: "FORBIDDEN", message: `Cannot ${action} ${resource}` },
      });
    }
  };
}

// Route definition example
fastify.post(
  "/api/v1/questions",
  {
    preHandler: [
      authenticate,
      verifyRole("super_admin", "exam_admin", "question_author"),
      verifyPermission("questions", "create"),
    ],
    schema: { body: createQuestionSchema },
  },
  createQuestionHandler,
);
```

### 4.3 Data-Level Authorization

Beyond role-based access, data-level isolation is enforced:

| Rule                                                                 | Implementation                                                              |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Candidates can only access their own attempts and answers            | Query filters: `WHERE candidate_id = request.user.id`                       |
| Proctors can only monitor batches assigned to their center           | Query filters: `WHERE center_id = proctor.center_id`                        |
| Question authors can only edit questions they created (unless admin) | Query filters: `WHERE created_by = request.user.id OR role = 'super_admin'` |
| Exam admins can only manage exams for their institution              | Query filters: `WHERE institution_id = admin.institution_id`                |

---

## 5. DEVICE REGISTRATION & VALIDATION

### 5.1 Device Registration Flow

```
Admin                Exam Server              Client Machine
  │                      │                        │
  │  Register device     │                        │
  │  (MAC, name, center) │                        │
  │─────────────────────►│                        │
  │                      │  Store device record   │
  │                      │  status: registered    │
  │  Device ID returned  │                        │
  │◄─────────────────────│                        │
  │                      │                        │
  │  Install exam client │                        │
  │  with device ID      │                        │
  │──────────────────────────────────────────────►│
  │                      │                        │
  │                      │  On client launch:     │
  │                      │  Generate hardware     │
  │                      │  hash (CPU + RAM +     │
  │                      │  disk serial + MAC)    │
  │                      │                        │
  │  Client login        │                        │
  │                      │◄───────────────────────│
  │                      │  Verify device_id      │
  │                      │  + hardware_hash       │
  │                      │  match registration    │
  │                      │                        │
  │                      │  Update last_seen_at   │
  │                      │  status: active        │
  │                      │───────────────────────►│
  │                      │                        │
```

### 5.2 Hardware Fingerprint

The hardware hash is generated from:

| Component    | Source (Windows)                          | Purpose               |
| ------------ | ----------------------------------------- | --------------------- |
| CPU ID       | WMI: `Win32_Processor.ProcessorId`        | Unique CPU identifier |
| MAC address  | `os.networkInterfaces()`                  | Network interface     |
| Disk serial  | WMI: `Win32_DiskDrive.SerialNumber`       | Primary disk          |
| Machine UUID | WMI: `Win32_ComputerSystemProduct.UUID`   | Machine UUID          |
| OS serial    | WMI: `Win32_OperatingSystem.SerialNumber` | OS installation       |

**Hash generation:**

```
hardware_hash = SHA256(cpu_id + mac_address + disk_serial + machine_uuid + os_serial)
```

### 5.3 Device Validation on Login

| Check                                          | Action on Failure                                  |
| ---------------------------------------------- | -------------------------------------------------- |
| Device ID exists in `device_registrations`     | Reject: `DEVICE_NOT_REGISTERED`                    |
| Device status is `active` or `registered`      | Reject: `DEVICE_NOT_REGISTERED`                    |
| Hardware hash matches registration             | Reject: `DEVICE_NOT_REGISTERED` (possible cloning) |
| Device center matches exam batch center        | Reject: `FORBIDDEN`                                |
| Device not already connected (duplicate check) | Reject: close old connection, allow new            |

---

## 6. TLS & TRANSPORT SECURITY

### 6.1 TLS Configuration

| Setting              | Value                                                                             | Rationale                                    |
| -------------------- | --------------------------------------------------------------------------------- | -------------------------------------------- |
| TLS version          | 1.2 minimum, 1.3 preferred                                                        | 1.3 has best security; 1.2 for compatibility |
| Cipher suites        | TLS_AES_256_GCM_SHA384, TLS_CHACHA20_POLY1305_SHA256, ECDHE-RSA-AES256-GCM-SHA384 | Strong ciphers only                          |
| Certificate type     | Self-signed for LAN (internal CA)                                                 | No external CA needed in LAN                 |
| Certificate pinning  | Client pins server certificate fingerprint                                        | Prevent MITM even if CA compromised          |
| HSTS                 | Enabled (max-age=31536000, includeSubDomains)                                     | Force HTTPS                                  |
| Certificate rotation | Manual (documented procedure)                                                     | LAN environment, no auto-rotation            |

### 6.2 Nginx TLS Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name exam-server;

    ssl_certificate /etc/nginx/ssl/server.crt;
    ssl_certificate_key /etc/nginx/ssl/server.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'self' wss:; font-src 'self'; object-src 'none'; frame-ancestors 'none'" always;
}
```

### 6.3 Certificate Pinning (WPF Client)

```csharp
// In WPF client — HttpClientHandler with custom certificate validation
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;

public class CertificatePinner
{
    private const string ExpectedFingerprint =
        "ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789";

    public HttpClientHandler CreatePinnedHandler()
    {
        return new HttpClientHandler
        {
            ServerCertificateCustomValidationCallback = (msg, cert, chain, errors) =>
            {
                if (errors == SslPolicyErrors.None)
                    return true;

                // Allow self-signed cert if fingerprint matches
                var fingerprint = cert?.GetCertHashString();
                return fingerprint == ExpectedFingerprint;
            }
        };
    }
}

// For ClientWebSocket, use ClientWebSocketOptions.RemoteCertificateValidationCallback
var ws = new ClientWebSocket();
ws.Options.RemoteCertificateValidationCallback = (msg, cert, chain, errors) =>
{
    var fingerprint = cert?.GetCertHashString();
    return fingerprint == CertificatePinner.ExpectedFingerprint;
};
```

---

## 7. REPLAY ATTACK PREVENTION

### 7.1 Nonce-Based Protection

Every state-changing client request (answer save, exam submit) must include:

| Field       | Description                                           | Validation                                                   |
| ----------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| `nonce`     | Random 32-character string (crypto.randomBytes)       | Must be unique per attempt; stored in in-memory Map with TTL |
| `timestamp` | Client ISO 8601 timestamp                             | Must be within ±60 seconds of server time                    |
| `signature` | HMAC-SHA256(payload + nonce + timestamp, session_key) | Must match server-computed signature                         |

### 7.2 Validation Pipeline

```
1. Extract nonce, timestamp, signature from request
2. Verify timestamp is within ±60s of server time
   └── If outside window: reject (replay or clock skew)
3. Check nonce not already used (lookup in in-memory nonce cache)
   └── If already used: reject (replay attack)
4. Compute expected signature: HMAC-SHA256(payload + nonce + timestamp, session_key)
5. Compare with provided signature (constant-time comparison)
   └── If mismatch: reject (tampering)
6. Store nonce in in-memory cache with TTL (5 minutes)
7. Process request
```

### 7.3 Session Key

The session key for HMAC signing is derived from:

```
session_key = HKDF(
  base_key = JWT access token signature,
  info = "answer_signing" + attempt_id,
  length = 32 bytes
)
```

This ensures the key is unique per attempt and tied to the JWT session.

---

## 8. AUDIT LOGGING

### 8.1 Audit Log Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  AUDIT LOG PIPELINE                                          │
│                                                             │
│  Action Occurs (API request, WebSocket event, admin action) │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────┐                                          │
│  │  Audit       │  Capture: user_id, action, resource,     │
│  │  Middleware  │  old_value, new_value, ip, user_agent    │
│  └──────┬───────┘                                          │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────┐                                          │
│  │  Hash Chain  │  prev_hash = last_log.current_hash       │
│  │  Calculator  │  current_hash = SHA256(prev_hash +       │
│  │              │    user_id + action + resource_id +      │
│  │              │    timestamp + payload)                   │
│  └──────┬───────┘                                          │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────┐                                          │
│  │  PostgreSQL  │  INSERT into audit_logs (append-only)    │
│  │  audit_logs  │  No UPDATE or DELETE allowed             │
│  └──────────────┘                                          │
│                                                             │
│  VERIFICATION:                                              │
│  Recompute hash chain from first log to last                │
│  If any hash doesn't match -> log was tampered              │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 Audit Log Rules

| Rule                         | Implementation                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| Append-only                  | Database triggers prevent UPDATE and DELETE on audit_logs                                         |
| Tamper-evident               | Each log entry includes hash of previous entry (chain)                                            |
| Every admin action logged    | Create, update, delete, publish, activate, pause, resume, submit, terminate, grade, config_change |
| Every candidate event logged | Login, exam start, answer save, submit, reconnect, violation                                      |
| Every system event logged    | Server start, server crash, DB backup, migration                                                  |
| PII redaction                | Passwords, tokens, and sensitive data redacted before logging                                     |
| Export capability            | Admin can export audit logs as PDF/CSV with digital signature                                     |

### 8.3 Database Trigger for Append-Only

```sql
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only. UPDATE and DELETE are not allowed.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_update_audit_logs
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

CREATE TRIGGER no_delete_audit_logs
  BEFORE DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();
```

### 8.4 Hash Chain Verification

```typescript
async function verifyAuditLogIntegrity(): Promise<{
  valid: boolean;
  brokenAt?: string;
}> {
  const logs = await db
    .select()
    .from(auditLogs)
    .orderBy(asc(auditLogs.createdAt));
  let prevHash = null;

  for (const log of logs) {
    const expectedHash = sha256(
      prevHash +
        log.userId +
        log.action +
        log.resourceId +
        log.timestamp +
        log.currentHash,
    );
    if (expectedHash !== log.currentHash) {
      return { valid: false, brokenAt: log.id };
    }
    prevHash = log.currentHash;
  }

  return { valid: true };
}
```

---

## 9. SECRET MANAGEMENT

### 9.1 Secrets Inventory

| Secret                  | Storage                                              | Rotation                        |
| ----------------------- | ---------------------------------------------------- | ------------------------------- |
| JWT signing key         | Environment variable (`JWT_SECRET`)                  | Manual, documented procedure    |
| Question encryption key | Environment variable (`QUESTION_ENCRYPTION_KEY`)     | Manual, requires re-encryption  |
| Database password       | Environment variable (`DATABASE_URL`)                | Manual, update pg_hba.conf      |
| Argon2id pepper         | Environment variable (`ARGON2_PEPPER`)               | Manual, requires password reset |
| TLS private key         | File (`/etc/nginx/ssl/server.key`)                   | Manual, generate new CSR        |
| Admin default password  | Generated at seed time, forced change on first login | One-time                        |

### 9.2 Secret Storage Rules

| Rule                    | Implementation                                                |
| ----------------------- | ------------------------------------------------------------- |
| Never in source code    | Environment variables only; `.env` file in `.gitignore`       |
| Never in database       | Encryption keys stored as OS environment variables            |
| Never in logs           | Pino redaction filters strip secrets from log output          |
| Never in error messages | Generic error messages; secrets not included in stack traces  |
| `.env.example` template | Template file with placeholder values committed to repo       |
| Production secrets      | Set via PM2 ecosystem config or Windows environment variables |

### 9.3 Environment Variable Template

```env
# .env.example (committed to repo)

# Server
NODE_ENV=production
PORT=3000
HOST=127.0.0.1

# Database
DATABASE_URL=postgresql://cbt_user:CHANGE_ME@localhost:5432/cbt_platform

# JWT
JWT_SECRET=CHANGE_ME_TO_RANDOM_64_CHAR_STRING
JWT_ACCESS_EXPIRY_MINUTES=15
JWT_REFRESH_EXPIRY_HOURS=24

# Encryption
QUESTION_ENCRYPTION_KEY=CHANGE_ME_TO_RANDOM_32_BYTE_HEX
ARGON2_PEPPER=CHANGE_ME_TO_RANDOM_STRING
ARGON2_MEMORY_COST=65536
ARGON2_TIME_COST=3
ARGON2_PARALLELISM=1

# Rate Limiting
RATE_LIMIT_API_PER_MINUTE=120
RATE_LIMIT_WS_PER_SECOND=30

# WebSocket
WS_HEARTBEAT_INTERVAL_SECONDS=30
WS_MAX_MISSED_HEARTBEATS=3
WS_MAX_CONNECTIONS=600

# Logging
LOG_LEVEL=info
```

---

## 10. ENCRYPTION STRATEGY

### 10.1 Encryption Layers

```
┌─────────────────────────────────────────────────────────────┐
│  ENCRYPTION LAYERS                                           │
│                                                             │
│  Layer 1: Transport (TLS 1.2/1.3)                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  All HTTP and WebSocket traffic encrypted via TLS    │   │
│  │  Certificate pinning on WPF client                  │   │
│  │  Self-signed certificate for LAN (internal CA)       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Layer 2: Application (AES-256-GCM)                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Question content encrypted before DB storage        │   │
│  │  Question options (correct flag) encrypted            │   │
│  │  Solution/explanation encrypted                       │   │
│  │  Key: QUESTION_ENCRYPTION_KEY (env variable)          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Layer 3: Database (PostgreSQL security)                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Connection: localhost only (127.0.0.1)              │   │
│  │  Auth: pg_hba.conf rejects non-local connections     │   │
│  │  Roles: cbt_user with limited privileges             │   │
│  │  Data at rest: OS-level disk encryption (BitLocker)  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Layer 4: Client (WPF local storage)                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Local SQLite encrypted with SQLCipher (AES-256)    │   │
│  │  Key derived from hardware hash + attempt_id         │   │
│  │  Key not persisted; regenerated on each session      │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 10.2 Question Encryption Implementation

```typescript
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY = Buffer.from(process.env.QUESTION_ENCRYPTION_KEY, "hex");

function encrypt(data: string): { encrypted: string; iv: string; tag: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(data, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    encrypted: encrypted.toString("hex"),
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
  };
}

function decrypt(encrypted: string, iv: string, tag: string): string {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    KEY,
    Buffer.from(iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
```

---

## 11. ANTI-CHEATING MEASURES

### 11.1 Client-Side Detection

| Measure                  | Detection Method                          | Server Action                           |
| ------------------------ | ----------------------------------------- | --------------------------------------- |
| Tab switch / window blur | WPF `OnDeactivated` + Win32 `WM_ACTIVATE` | Log event + increment violation counter |
| Alt+Tab / Alt+F4         | `WH_KEYBOARD_LL` hook intercept           | Log event + block action                |
| Print Screen             | `WH_KEYBOARD_LL` hook; clear clipboard    | Log event + clear clipboard             |
| Right-click              | WPF `PreviewMouseRightButtonDown` handler | Log event                               |
| Clipboard access         | `AddClipboardFormatListener` monitoring   | Log event + clear clipboard             |
| DevTools                 | N/A — no browser engine in WPF            | No DevTools to exploit                  |
| VM detection             | Check WMI for VM signatures               | Refuse to start exam                    |
| Process monitoring       | Enumerate running processes               | Log unauthorized processes              |
| Screen recording         | Check for recording software              | Log + warn candidate                    |
| Multiple monitors        | Check display count                       | Log + restrict to single display        |

### 11.2 Server-Side Validation

| Measure                          | Detection Method                          | Action                                  |
| -------------------------------- | ----------------------------------------- | --------------------------------------- |
| Answer timestamp manipulation    | Compare client timestamp with server time | Reject if drift > 60s                   |
| Replay attack                    | Nonce tracking                            | Reject duplicate nonces                 |
| Answer injection (outside exam)  | Verify attempt status is `in_progress`    | Reject if not active                    |
| Answer modification after submit | Verify attempt status before UPSERT       | Reject if submitted                     |
| Excessive answer changes         | Track update count per answer             | Log if > 10 changes per question        |
| Multiple connections per attempt | Track active WebSocket connections        | Close old, allow new                    |
| Timer manipulation               | Server-authoritative timer                | Ignore client-reported time for scoring |

### 11.3 Violation Escalation

```
Violation Detected
       │
       ▼
┌──────────────┐
│  Log Event   │  Always: create event_log + violation_report
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Severity    │
│  Assessment  │
└──────┬───────┘
       │
       ├──── LOW ──────► Log only, notify proctor dashboard
       │
       ├──── MEDIUM ───► Log + notify proctor + auto-warn candidate
       │
       ├──── HIGH ─────► Log + notify proctor + auto-warn + flag for review
       │
       └──── CRITICAL ─► Log + notify proctor + auto-pause exam
                         (proctor decides: resume or terminate)
```

---

## 12. SECURE UPDATE MECHANISM

### 12.1 Client Update Flow

```
┌──────────────────────────────────────────────────────┐
│  CLIENT UPDATE PROCESS                                │
│                                                      │
│  1. Admin uploads new client version to server       │
│     (PUT /api/v1/system/client-version)              │
│                                                      │
│  2. Server stores version manifest:                  │
│     { version, downloadUrl, sha256, releaseNotes }   │
│                                                      │
│  3. On client launch (pre-exam):                     │
│     - Client checks current version vs server        │
│     - If update available, download + verify SHA256  │
│     - Apply update (signed installer package)        │
│     - Restart client                                 │
│                                                      │
│  4. During exam: NO updates (locked down)            │
│                                                      │
│  5. Post-exam: Client checks for updates on next     │
│     launch                                           │
└──────────────────────────────────────────────────────┘
```

### 12.2 Update Security

| Control               | Implementation                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------- |
| Code signing          | Authenticode signing with code signing certificate                                            |
| Integrity check       | SHA-256 hash verification before applying                                                     |
| Download over TLS     | All downloads via HTTPS                                                                       |
| No update during exam | Client checks for updates only pre-exam and post-exam                                         |
| Rollback              | Previous version retained; auto-rollback if new version fails to start                        |
| Manifest signing      | Update manifest signed with server's private key; verified with public key embedded in client |

---

## 13. OWASP TOP 10 COMPLIANCE

| OWASP Risk                           | Status       | Mitigation                                                                                   |
| ------------------------------------ | ------------ | -------------------------------------------------------------------------------------------- |
| **A01: Broken Access Control**       | ✅ Mitigated | RBAC on every route; data-level isolation; JWT device binding                                |
| **A02: Cryptographic Failures**      | ✅ Mitigated | TLS 1.2+; AES-256-GCM for question encryption; Argon2id for passwords; no weak ciphers       |
| **A03: Injection**                   | ✅ Mitigated | Drizzle parameterized queries; JSON Schema input validation; no raw SQL with user input      |
| **A04: Insecure Design**             | ✅ Mitigated | Threat modeling (STRIDE); security architecture document; defense in depth                   |
| **A05: Security Misconfiguration**   | ✅ Mitigated | Nginx security headers; WPF native security; PostgreSQL localhost binding; `.env` management |
| **A06: Vulnerable Components**       | ✅ Mitigated | Snyk dependency scanning in CI; `npm audit`; regular dependency updates                      |
| **A07: Auth Failures**               | ✅ Mitigated | Argon2id + pepper; account lockout; JWT revocation; device binding; rate limiting            |
| **A08: Software/Data Integrity**     | ✅ Mitigated | Answer signing (HMAC); audit log hash chain; update signature verification                   |
| **A09: Logging/Monitoring Failures** | ✅ Mitigated | Pino structured logging; audit trail; tamper-evident logs; real-time monitoring              |
| **A10: SSRF**                        | ✅ Mitigated | LAN-only; no outbound requests; firewall blocks internet; URL allowlist                      |

---

## 14. WPF CLIENT SECURITY

### 14.1 Native Windows Security Model

The WPF client is a **single native Windows process** — no browser engine, no renderer process, no IPC boundary. This eliminates entire categories of security concerns:

| Risk                       | WPF Status     | Explanation                                          |
| -------------------------- | -------------- | ---------------------------------------------------- |
| Renderer process escape    | **Eliminated** | No renderer process; no browser sandbox to escape    |
| IPC message tampering      | **Eliminated** | No IPC; all code runs in one process                 |
| `nodeIntegration` bypass   | **Eliminated** | No Node.js; no browser context                       |
| `contextIsolation` bypass  | **Eliminated** | No JavaScript context isolation needed               |
| DevTools access            | **Eliminated** | No browser DevTools; no remote debugging port        |
| CSP bypass                 | **Eliminated** | No Content Security Policy needed; no HTML rendering |
| Preload script injection   | **Eliminated** | No preload script; no contextBridge                  |
| `webview` tag exploitation | **Eliminated** | No webview tag; no embedded browser                  |

### 14.2 WPF Security Configuration

```xml
<!-- App.xaml — Window security settings -->
<Window
    WindowStyle="None"
    WindowState="Maximized"
    Topmost="True"
    ResizeMode="NoResize"
    ShowInTaskbar="True"
    IsManipulationEnabled="False"
    Cursor="Arrow">
    <!-- No browser engine; no script injection surface -->
</Window>
```

```csharp
// App.xaml.cs — Security hardening
public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        // Disable Win32 features that could be exploited
        DisableAccessibilityFeatures();
        EnforceSingleInstance();

        // Verify code signature of the running executable
        VerifyAssemblySignature();

        base.OnStartup(e);
    }

    private void DisableAccessibilityFeatures()
    {
        // Disable Windows accessibility shortcuts that could bypass lockdown
        // (Sticky Keys, Filter Keys, etc.)
        SystemParametersInfo(SPI_SETSTICKYKEYS, 0, IntPtr.Zero, 0);
        SystemParametersInfo(SPI_SETFILTERKEYS, 0, IntPtr.Zero, 0);
    }

    private void EnforceSingleInstance()
    {
        var mutex = new Mutex(true, "Global\\ExamClientSingleton", out bool createdNew);
        if (!createdNew)
        {
            Log.Error("Multiple instance attempt detected");
            Current.Shutdown();
        }
    }
}
```

### 14.3 No IPC = No IPC Attack Surface

The WPF client has **no inter-process communication boundary**. All services (WebSocket, SQLite, crypto, lockdown) run in the same process as the UI. This means:

- No IPC channel whitelist needed
- No message schema validation across processes
- No contextBridge exposure
- No preload script security boundary
- No risk of renderer process accessing Node.js APIs

The entire application is compiled to native code — there is no JavaScript runtime, no V8 engine, no Chromium sandbox. The attack surface is the Win32 API and .NET runtime, both of which are well-understood and hardened.

### 14.4 WebView2 Security (for complex HTML fragments)

When WebView2 is used for specific question content (complex HTML/CSS), it is:

| Control            | Implementation                                                 |
| ------------------ | -------------------------------------------------------------- |
| Isolated WebView2  | Used only for question content rendering; no navigation        |
| Navigation blocked | `NavigationStarting` event cancels all navigation              |
| Script disabled    | `IsWebMessageEnabled = false`; no script injection             |
| DevTools disabled  | WebView2 DevTools programmatically disabled                    |
| Content sandboxed  | Only pre-rendered HTML from server; no user input in WebView2  |
| Size limited       | WebView2 fills only the question content area; not full window |

---

## 15. DATABASE SECURITY

### 15.1 PostgreSQL Access Control

| Setting           | Value                           | Rationale                       |
| ----------------- | ------------------------------- | ------------------------------- |
| Listen address    | `127.0.0.1`                     | Only local connections          |
| `pg_hba.conf`     | Reject all non-local            | No remote DB access             |
| Database user     | `cbt_user`                      | Least privilege                 |
| Password auth     | `scram-sha-256`                 | Strong auth method              |
| SSL connections   | Not needed (localhost)          | Local connections only          |
| Schema access     | Only `public` schema            | No superuser access             |
| Table permissions | CRUD on application tables only | No DDL permissions for app user |

### 15.2 Data Protection

| Data              | Protection                                                      |
| ----------------- | --------------------------------------------------------------- |
| Passwords         | Argon2id hash (never plaintext; @node-rs/argon2 native binding) |
| Question content  | AES-256-GCM encrypted in application                            |
| JWT secret        | Environment variable (never in DB)                              |
| Audit logs        | Append-only + hash chain                                        |
| Backups           | Encrypted backup files (pg_dump + AES-256)                      |
| Connection string | Environment variable (never in code)                            |

---

## 16. INCIDENT RESPONSE

### 16.1 Incident Classification

| Severity     | Example                       | Response Time | Action                                                      |
| ------------ | ----------------------------- | ------------- | ----------------------------------------------------------- |
| **Critical** | Server crash during live exam | Immediate     | PM2 auto-restart; admin notified; candidates auto-reconnect |
| **Critical** | Database corruption           | Immediate     | Restore from WAL backup; switch to read-only mode           |
| **High**     | Mass client disconnections    | < 5 min       | Network team notified; check switch; clients auto-reconnect |
| **High**     | Security breach detected      | < 5 min       | Revoke affected tokens; audit log review; admin notified    |
| **Medium**   | Single client crash           | < 15 min      | Client auto-recovers via crash recovery flow                |
| **Medium**   | Rate limit triggered          | Automatic     | Rate limiter handles automatically; log for review          |
| **Low**      | Minor violation detected      | Post-exam     | Logged for review; no immediate action                      |

### 16.2 Post-Exam Security Review

After each exam batch:

1. Export audit logs for the batch
2. Verify audit log hash chain integrity
3. Review all violation reports
4. Cross-check answer timestamps with server time
5. Verify no answers were modified after submission
6. Check for duplicate device connections
7. Review proctor actions log
8. Generate security summary report

---

## 17. SIGNED EXAM MANIFEST

### 17.1 Overview

The Exam Manifest is a cryptographically signed document that defines the authoritative exam parameters. It is signed offline with a private key that never touches the exam server. The WPF client verifies the manifest using a public key embedded in the application binary.

**Security Principle:** The exam server cannot forge or modify exam rules. The signing key is offline. The client is the auditor.

### 17.2 Signing Key Management

| Key           | Location                                                  | Purpose                           |
| ------------- | --------------------------------------------------------- | --------------------------------- |
| Private key   | Offline USB drive / HSM (never on exam server)            | Sign exam manifests before exam   |
| Public key    | Embedded in WPF client binary (Resources/exam-public.pem) | Verify manifest on client startup |
| Key algorithm | Ed25519                                                   | Fast signing + verification       |
| Key rotation  | Manual; requires client update                            | Infrequent, controlled            |

### 17.3 Manifest Structure

```json
{
  "manifestId": "uuid",
  "examId": "uuid",
  "examBatchId": "uuid",
  "version": 1,
  "issuedAt": "2026-07-16T08:00:00Z",
  "expiresAt": "2026-07-16T11:00:00Z",
  "exam": {
    "title": "JEE Mock Test 1",
    "durationMinutes": 180,
    "sections": [
      {
        "id": "uuid",
        "name": "Physics",
        "durationMinutes": 60,
        "questionCount": 30
      },
      {
        "id": "uuid",
        "name": "Chemistry",
        "durationMinutes": 60,
        "questionCount": 30
      },
      {
        "id": "uuid",
        "name": "Mathematics",
        "durationMinutes": 60,
        "questionCount": 30
      }
    ],
    "markingScheme": { "correct": 4, "incorrect": -1, "unattempted": 0 },
    "navigationMode": "free",
    "shuffleQuestions": true,
    "shuffleOptions": true
  },
  "server": {
    "endpoint": "https://exam-server.local",
    "certificateFingerprint": "AB:CD:EF:..."
  }
}
```

### 17.4 Signing Flow

```
OFFLINE SIGNING (Pre-Exam)
=========================

Exam Admin (Offline Machine)
    │
    │  1. Create exam configuration in admin dashboard
    │  2. Export exam manifest JSON
    │  3. Sign manifest with Ed25519 private key (offline)
    │  4. Upload signed manifest to exam server
    │
    ▼
Exam Server
    │
    │  5. Store signed manifest (manifest + signature)
    │  6. Serve manifest to clients on exam:start
    │
    ▼
WPF Client
    │
    │  7. Receive signed manifest
    │  8. Verify Ed25519 signature with embedded public key
    │  9. Verify manifest not expired
    │  10. Verify server certificate fingerprint matches manifest
    │  11. If valid: use manifest as authoritative exam rules
    │  12. If invalid: REFUSE to start exam, log security event
    │
    ▼
Exam Proceeds with Server-Authoritative Timer
```

### 17.5 Client as Auditor

The WPF client acts as the auditor of exam integrity:

| Check                        | Action on Failure                                      |
| ---------------------------- | ------------------------------------------------------ |
| Manifest signature valid     | Refuse to start; log `MANIFEST_SIGNATURE_INVALID`      |
| Manifest not expired         | Refuse to start; log `MANIFEST_EXPIRED`                |
| Server cert matches manifest | Refuse to connect; log `CERT_FINGERPRINT_MISMATCH`     |
| Timer from manifest duration | Ignore any server timer that exceeds manifest duration |
| Section timing from manifest | Ignore server section changes not in manifest          |
| Marking scheme from manifest | Use manifest scheme for local score calculation        |

---

## 18. SIGNED SECURITY POLICIES

### 18.1 Overview

Security policies (lockdown rules, allowed processes, blocked shortcuts, proctoring settings) are signed with the same offline Ed25519 private key used for the exam manifest. The client verifies policies using the embedded public key.

### 18.2 Policy Structure

```json
{
  "policyId": "uuid",
  "version": 1,
  "issuedAt": "2026-07-16T08:00:00Z",
  "policies": {
    "lockdown": {
      "blockAltTab": true,
      "blockAltF4": true,
      "blockCtrlAltDel": true,
      "blockPrintScreen": true,
      "blockRightClick": true,
      "disableClipboard": true,
      "disableTaskbar": true,
      "kioskMode": true,
      "alwaysOnTop": true
    },
    "processControl": {
      "allowedProcesses": ["exam-client.exe", "exam-launcher.exe"],
      "killUnauthorized": true
    },
    "network": {
      "allowedEndpoint": "https://exam-server.local",
      "blockAllOtherTraffic": true
    },
    "vmDetection": {
      "enabled": true,
      "refuseOnVM": true
    },
    "monitoring": {
      "heartbeatIntervalSeconds": 30,
      "maxMissedHeartbeats": 3
    }
  }
}
```

### 18.3 Policy Verification Flow

```
Client Startup
    │
    │  1. Load signed policy from server (or embedded default)
    │  2. Verify Ed25519 signature with embedded public key
    │  3. If valid: apply policy as lockdown configuration
    │  4. If invalid: use embedded default policy (fail-safe)
    │  5. Log policy version + verification result
    │
    ▼
Lockdown Applied
```

### 18.4 Fail-Safe Default

If policy verification fails (e.g., server compromised, signature invalid), the client falls back to a **hardcoded default policy** embedded in the binary. This default is the most restrictive configuration. The client never applies a less restrictive policy than the default.

---

## 19. DOCUMENT METADATA

| Field                | Value                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Document Version** | 3.0 (Architecture Frozen — Client Stack Changed)                                                                                         |
| **Date Created**     | 2026-07-16                                                                                                                               |
| **Status**           | FROZEN — Architecture v2.0 (Client: C# WPF)                                                                                              |
| **Author**           | AI Agent (Architect Mode)                                                                                                                |
| **Prerequisites**    | PRD v3.0 (Frozen), TDR v3.0 (Frozen), SAD v3.0 (Frozen)                                                                                  |
| **Freeze Rule**      | Changes require: business requirement change, security issue, prototype failure, or performance test failure. No changes for preference. |
