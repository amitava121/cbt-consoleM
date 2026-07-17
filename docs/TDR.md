# TECHNOLOGY DECISION RECORD (TDR)

# Competitive CBT Platform

---

## 1. PURPOSE

This document formally records every technology decision for the CBT Platform, including alternatives considered, trade-offs evaluated, and justification for the final choice. No technology is adopted without a documented decision record.

---

## 2. EVALUATION CRITERIA

Each technology is evaluated against:

| Criterion              | Weight | Description                                               |
| ---------------------- | ------ | --------------------------------------------------------- |
| Performance            | High   | Ability to meet 500 concurrent clients on a single server |
| Security               | High   | Built-in security features, attack surface, compliance    |
| Reliability            | High   | Stability under load, failure recovery, data integrity    |
| Ecosystem Maturity     | Medium | Community size, library availability, long-term support   |
| Team Velocity          | Medium | Learning curve, development speed, tooling quality        |
| Operational Simplicity | Medium | Deployment complexity, monitoring, maintenance burden     |
| LAN Suitability        | High   | Performance in offline/LAN-only environments              |
| Windows Compatibility  | High   | Must run on Windows (exam center machines)                |

---

## 3. DECISION SUMMARY

| Component             | Decision                                           | Status          |
| --------------------- | -------------------------------------------------- | --------------- |
| Backend Runtime       | Node.js 24 LTS                                     | Approved (v2.0) |
| Backend Framework     | Fastify 5.x                                        | Approved        |
| Database              | PostgreSQL 18                                      | Approved (v2.0) |
| Cache                 | In-Memory (lru-cache) — no Redis                   | Approved (v2.0) |
| WebSocket             | `ws` (primary) + custom protocol                   | Approved        |
| Authentication        | JWT (access + refresh) + Argon2id                  | Approved (v2.0) |
| Desktop Client        | C# WPF (.NET 8)                                    | Approved (v3.0) |
| Admin Dashboard       | React 19 + Vite 6 + TailwindCSS 4 + React Compiler | Approved (v2.0) |
| Logging               | Pino (structured)                                  | Approved        |
| Monitoring            | PostgreSQL UNLOGGED table + custom dashboard       | Approved (v2.0) |
| CI/CD                 | GitHub Actions                                     | Approved        |
| File Storage          | Local filesystem (LAN)                             | Approved        |
| API Style             | REST (v1) + WebSocket events                       | Approved        |
| ORM / Query Builder   | Drizzle ORM                                        | Approved (v2.0) |
| State Management      | Zustand (admin) + CommunityToolkit.Mvvm (client)   | Approved (v3.0) |
| UI Components         | shadcn/ui (Radix + Tailwind)                       | Approved (v2.0) |
| Local SQLite (Client) | Microsoft.Data.Sqlite + SQLCipher                  | Approved (v3.0) |
| Test Framework        | Vitest + Playwright                                | Approved        |
| Process Manager       | PM2 (cluster mode, sticky sessions)                | Approved (v2.0) |
| Reverse Proxy         | Nginx (sticky sessions for WS)                     | Approved (v2.0) |
| Exam Launcher         | C# (.NET 8, shared solution with client)           | Approved (v3.0) |

---

## 4. DETAILED DECISION RECORDS

---

### TDR-01: Backend Runtime

| Field        | Value                    |
| ------------ | ------------------------ |
| **Decision** | Node.js 24 LTS (Krypton) |
| **Status**   | Approved (v2.0)          |
| **Date**     | 2026-07-16               |

#### Candidates Evaluated

| Candidate               | Pros                                                                                                                                                                                                                                                                                                                                                                                                                                            | Cons                                                                                                                                                          | Verdict      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **Node.js 24 LTS**      | Event-driven I/O excels at concurrent connections; WebSocket native support; single language across backend + frontend; massive ecosystem (npm); mature WebSocket libraries (`ws`, Socket.io); proven at scale (Discord, Trello); fast development velocity; Active LTS Oct 2025–Apr 2027; V8 13.x improvements (JSON serialization, string ops, long-running server perf); native test runner; native WebSocket client; `node:sqlite` built-in | Single-threaded (CPU-bound work blocks event loop); higher memory per connection than Go; V8 garbage collection pauses under extreme load                     | **Selected** |
| **Go**                  | Superior raw performance; goroutines handle massive concurrency with minimal memory; compiled binary (no runtime dependency); excellent for CPU-bound work; fast startup; low memory footprint; strong typing                                                                                                                                                                                                                                   | Smaller ecosystem for WebSocket; steeper learning curve; no shared language with frontend; slower development velocity for CRUD-heavy apps; less ORM maturity | Rejected     |
| **Python (FastAPI)**    | Fast development; excellent for AI/ML integration (future proctoring); type hints + auto docs; async support; large community                                                                                                                                                                                                                                                                                                                   | Slower runtime performance; GIL limits true concurrency; higher memory usage; WebSocket performance lags Node.js and Go; packaging complexity on Windows      | Rejected     |
| **.NET (ASP.NET Core)** | Excellent performance (competitive with Go); strong typing; mature WebSocket support; first-class Windows support; Entity Framework ORM                                                                                                                                                                                                                                                                                                         | Heavier runtime; C# ecosystem smaller than npm for web tooling; licensing considerations; team would need C# expertise; overkill for this use case            | Rejected     |

#### Justification

Node.js is selected because:

1. **Concurrency model fits the use case:** Exam server is I/O-bound (WebSocket connections, database queries, file reads) — not CPU-bound. Node.js's event loop excels at this.
2. **Single language stack:** Using JavaScript/TypeScript across backend and admin dashboard reduces context switching and enables code sharing (types, validation schemas, API contracts). The exam client uses C# WPF (.NET 8) — see TDR-07.
3. **WebSocket ecosystem:** Node.js has the most mature WebSocket libraries (`ws` handles 65K+ connections per process with ~3KB memory per connection). Critical for 500+ concurrent exam clients.
4. **Team velocity:** Fastify + Drizzle + TypeScript enables rapid API development with type safety and near-zero ORM overhead.
5. **Windows compatibility:** Node.js runs natively on Windows with first-class support.
6. **Cluster mode:** PM2 cluster mode with 4-8 workers utilizes all CPU cores. Nginx sticky sessions ensure WebSocket routing to the correct worker.
7. **Node.js 24 LTS advantages:** V8 13.x brings measurable improvements to JSON serialization and string operations — directly benefiting the high-volume answer-save and event-log workloads. Native `node:sqlite` provides a built-in SQLite driver (not used; client uses Microsoft.Data.Sqlite + SQLCipher).

#### Risks & Mitigations

| Risk                                           | Mitigation                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Single-threaded event loop blocked by CPU work | Offload CPU-intensive tasks (grading, analytics) to worker threads or child processes       |
| Memory pressure at 500+ WebSocket connections  | Use `ws` (3KB/conn) not Socket.io (8KB/conn); monitor memory; implement connection limits   |
| V8 GC pauses under extreme load                | Use `--max-old-space-size` tuning; monitor GC events with Pino; load test before production |

---

### TDR-02: Backend Framework

| Field        | Value       |
| ------------ | ----------- |
| **Decision** | Fastify 5.x |
| **Status**   | Approved    |
| **Date**     | 2026-07-16  |

#### Candidates Evaluated

| Candidate           | Pros                                                                                                                                                                          | Cons                                                                                                              | Verdict      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------ |
| **Fastify 5.x**     | 2-3x faster than Express; schema-based validation (JSON Schema); built-in serialization; plugin ecosystem; TypeScript first-class; low overhead; mature and production-proven | Smaller community than Express; plugin compatibility narrower                                                     | **Selected** |
| **Express 5.x**     | Largest ecosystem; most tutorials; middleware everywhere; well-known                                                                                                          | Slower than Fastify; no built-in validation; callback-based (though async supported); bloated middleware patterns | Rejected     |
| **NestJS**          | Opinionated architecture; dependency injection; decorators; modular; Angular-like; built-in WebSocket gateway                                                                 | Heavy abstraction; steep learning curve; overkill for this project size; slower than Fastify                      | Rejected     |
| **Elysia.js (Bun)** | Extremely fast; type-safe; modern API; Bun runtime                                                                                                                            | Bun is newer, less battle-tested; smaller ecosystem; Windows support less mature                                  | Rejected     |
| **Hono**            | Ultra-lightweight; very fast; works on multiple runimes; type-safe                                                                                                            | Primarily designed for edge/serverless; less suited for long-running server with WebSocket                        | Rejected     |

#### Justification

1. **Performance:** Fastify is 2-3x faster than Express with lower overhead — critical for 500+ concurrent requests.
2. **Schema validation:** Built-in JSON Schema validation ensures request/response integrity without extra middleware.
3. **TypeScript native:** First-class TypeScript support with auto-generated types from schemas.
4. **Plugin architecture:** Clean separation of concerns (auth, database, WebSocket, logging as plugins).
5. **Production-proven:** Used by major companies; stable releases; active maintenance.

---

### TDR-03: Database

| Field        | Value           |
| ------------ | --------------- |
| **Decision** | PostgreSQL 18   |
| **Status**   | Approved (v2.0) |
| **Date**     | 2026-07-16      |

#### Candidates Evaluated

| Candidate         | Pros                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Cons                                                                                                                                                                                                     | Verdict      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **PostgreSQL 18** | Full ACID compliance; best-in-class MVCC (readers never block writers); JSONB for flexible question metadata; excellent complex query performance; partitioning support; permissive license; most popular DB among professional developers (2025 survey); rich extension ecosystem; **async I/O subsystem (up to 3x cold-read performance)**; **built-in `uuidv7()` for timestamp-ordered IDs (18% index size reduction, 2.4x faster bulk inserts)**; **skip scan for multicolumn B-tree indexes (94ms → 0.2ms)**; **preserved planner stats through pg_upgrade**; **virtual generated columns**; **SIMD JSON processing**; **improved hash joins and GROUP BY**; **OAuth 2.0 authentication** | Requires server process (more ops than SQLite); configuration tuning needed for performance; higher resource consumption than SQLite; wait for 18.4+ for production stability (18.4 released April 2026) | **Selected** |
| **MySQL 8**       | Excellent read performance; wide hosting support; InnoDB ACID compliance; simpler to operate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Weaker on complex queries; less flexible replication; GPL license (Oracle-owned); fewer advanced data types; JSON support basic                                                                          | Rejected     |
| **SQLite**        | Zero setup; file-based; excellent for local/embedded; lowest resource usage; perfect for single-server                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | **Critical:** Single concurrent writer — database-wide write lock; cannot support 500 candidates submitting answers simultaneously; no multi-user network access; no user management                     | Rejected     |

#### Justification

1. **Concurrent writes are critical:** 500 candidates will be saving answers simultaneously. PostgreSQL's MVCC handles this excellently — readers never block writers, writers never block readers. SQLite's single-writer lock is a hard blocker.
2. **ACID integrity:** Exam data integrity is non-negotiable. PostgreSQL has been fully ACID-compliant since 2001 with the cleanest MVCC implementation.
3. **JSONB for question metadata:** Questions have variable structures (MCQ options, essay prompts, media references, LaTeX formulas). PostgreSQL's JSONB with indexing provides flexible schema + query performance. PostgreSQL 18 adds SIMD-accelerated JSON processing for faster JSONB operations.
4. **Complex queries:** Result processing requires complex joins, aggregations, window functions (percentile calculation, rank lists). PostgreSQL's query planner outperforms MySQL by 10x on poorly-indexed complex queries. PG18's improved hash joins and GROUP BY reduce memory usage and improve analytics query performance.
5. **Partitioning:** High-volume tables (answers, event_logs) can be partitioned by exam_batch_id for efficient queries and archival.
6. **Windows support:** PostgreSQL runs natively on Windows with full features.
7. **UUIDv7 for primary keys:** PG18's built-in `uuidv7()` generates timestamp-ordered UUIDs that cluster at the right edge of B-tree indexes — 18% smaller indexes and 2.4x faster bulk inserts compared to UUIDv4. Critical for the high-volume `answers` and `event_logs` tables.
8. **Skip scan:** PG18's skip scan enables multicolumn B-tree indexes to serve queries that omit leading column conditions — reducing the number of indexes needed and improving query performance for status-based lookups.
9. **Async I/O:** PG18's async I/O subsystem delivers up to 3x performance for cold-cache sequential scans and 35-40% improvement on mixed workloads — directly benefiting the analytics queries in the results module.

#### Risks & Mitigations

| Risk                                         | Mitigation                                                                                                                                                                 |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resource consumption on low-spec exam server | Tune `shared_buffers`, `work_mem`, `max_connections` for LAN deployment; use connection pooling (pg-pool with Drizzle); set `effective_io_concurrency = 16` (PG18 default) |
| Complex setup on Windows                     | Use official PostgreSQL Windows installer; document setup in deployment guide; consider embedded PostgreSQL for simpler deployments                                        |
| Single point of failure                      | Implement automated WAL archiving + point-in-time recovery; daily full backups; document recovery procedure                                                                |

---

### TDR-04: Cache Layer

| Field        | Value                            |
| ------------ | -------------------------------- |
| **Decision** | In-Memory (lru-cache) — no Redis |
| **Status**   | Approved (v2.0)                  |
| **Date**     | 2026-07-16                       |

#### Candidates Evaluated

| Candidate                 | Pros                                                                                                                                                      | Cons                                                                                                                    | Verdict      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------ |
| **In-Memory (lru-cache)** | Zero network overhead; nanosecond reads; no extra infrastructure; trivial implementation; no serialization cost; perfect for single-server LAN deployment | Does not survive restart; not shared across instances; per-process duplication; no pub/sub                              | **Selected** |
| **Redis 7**               | Shared cache across instances; survives restarts; atomic operations (INCR for rate limiting); pub/sub for real-time events; can serve as session store    | Network round trip (~0.1-0.5ms on LAN); extra infrastructure; serialization overhead; single-threaded command execution | **Rejected** |
| **No cache**              | Simplest; no cache invalidation bugs; no stale data                                                                                                       | Database will be hit on every request; cannot meet performance targets under 500 concurrent clients                     | Rejected     |

#### Justification

1. **Single-server architecture:** In-memory cache is optimal. Research confirms that for single-instance deployments with a local database, in-memory cache is faster than Redis (nanoseconds vs. 0.1-0.5ms network hop). The exam server runs on one machine — no cross-instance consistency needed.
2. **What to cache:** Exam configurations, question bank metadata, user sessions, active exam session state, system settings. These are read frequently and change rarely during an exam.
3. **No Redis:** Redis is not needed for a single-server deployment. It adds infrastructure complexity, network overhead, and operational burden with no benefit. The architecture is permanently single-server — there is no future Phase 2 where Redis would be introduced.
4. **Monitoring without Redis:** Transient operational state (heartbeats, connection status, latency) is stored in a PostgreSQL UNLOGGED table, not Redis. This avoids WAL overhead while keeping monitoring data queryable by all PM2 workers.

---

### TDR-05: WebSocket Library

| Field        | Value                                     |
| ------------ | ----------------------------------------- |
| **Decision** | `ws` (primary) with custom protocol layer |
| **Status**   | Approved                                  |
| **Date**     | 2026-07-16                                |

#### Candidates Evaluated

| Candidate          | Pros                                                                                                                                                                                                             | Cons                                                                                                                                                             | Verdict      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **`ws`**           | 3-5x faster than Socket.io; ~3KB memory per connection; 65K+ max connections per process; zero dependencies; RFC 6455 compliant; used by Discord, Trello; 125K msg/sec (1KB payload); lowest latency (p99: 12ms) | No auto-reconnect (must build); no rooms/namespaces (must build); no fallback transport; no built-in broadcasting                                                | **Selected** |
| **Socket.io**      | Auto-reconnect; rooms/namespaces; HTTP long-polling fallback; built-in broadcasting; Redis adapter for multi-server scaling; acknowledgements                                                                    | 2.5x slower than `ws`; ~8KB memory per connection; 20K max connections; 82K msg/sec; 45KB browser bundle; higher latency (p99: 32ms); stateful (harder to scale) | Rejected     |
| **uWebSockets.js** | Fastest (140K msg/sec); lowest memory (~0.9KB/conn); C++ addon                                                                                                                                                   | C++ addon introduces build complexity; potential stability risks on Windows; less production-proven; less documentation                                          | Rejected     |

#### Justification

1. **Performance is critical:** 500 concurrent candidates will each have a WebSocket connection sending answer saves, heartbeats, and status updates. `ws` handles 65K+ connections per process with 3KB memory each — Socket.io tops out at ~20K with 8KB each.
2. **LAN environment:** No need for HTTP long-polling fallback (Socket.io's main advantage). LAN connections are stable; WebSocket works reliably.
3. **Custom protocol:** We need custom events (exam:start, answer:save, heartbeat, proctor:alert, session:pause). Building a thin event layer on `ws` is straightforward and gives full control.
4. **Reconnection:** We need custom reconnection logic anyway (state-aware reconnect with exam state sync), so Socket.io's built-in reconnection doesn't save us meaningful work.
5. **Memory efficiency:** At 500 connections, `ws` uses ~1.5MB vs Socket.io's ~4MB — significant for a single-server deployment.

#### Custom Layer to Build

| Feature          | Implementation                                               |
| ---------------- | ------------------------------------------------------------ |
| Event naming     | `type:event_name` format (e.g., `exam:start`, `answer:save`) |
| Auto-reconnect   | Exponential backoff with jitter; state sync on reconnect     |
| Rooms            | Map-based grouping (exam_batch_id -> Set<WebSocket>)         |
| Broadcasting     | Iterate room members, send to each                           |
| Heartbeat        | Ping/pong every 30s; terminate on 3 missed pongs             |
| Acknowledgements | Message ID + response tracking with timeout                  |

---

### TDR-06: Authentication

| Field        | Value                                                              |
| ------------ | ------------------------------------------------------------------ |
| **Decision** | JWT (access token + refresh token) + Argon2id for password hashing |
| **Status**   | Approved (v2.0)                                                    |
| **Date**     | 2026-07-16                                                         |

#### Candidates Evaluated

| Candidate                  | Pros                                                                                                                                                                                                    | Cons                                                                                                                        | Verdict      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **JWT (access + refresh)** | Stateless (no server-side session lookup); scales well; standard format; device binding via claims; short-lived access tokens (15min) + long-lived refresh tokens (24h); well-understood security model | Token revocation requires blacklist; refresh token storage on client; larger token size than session ID                     | **Selected** |
| **Server-side sessions**   | Simple revocation (delete session); small cookie; well-understood                                                                                                                                       | Requires session store (in-memory or Redis); not stateless; harder to scale across servers; session lookup on every request | Rejected     |
| **OAuth 2.0 / OIDC**       | Industry standard; delegated authorization; SSO support                                                                                                                                                 | Overkill for LAN-based exam system; adds complexity; no external identity provider in LAN environment                       | Rejected     |

#### Justification

1. **LAN environment:** No external identity provider available. JWT is self-contained — no external dependency.
2. **Stateless:** JWT doesn't require server-side session storage for validation (signature verification only). Critical for performance at 500+ concurrent authenticated connections.
3. **Device binding:** JWT claims can include device_id, exam_batch_id, and attempt_id — binding the token to a specific exam session on a specific device.
4. **Short-lived access tokens:** 15-minute expiry limits window of token theft. Refresh tokens (24h) allow seamless re-authentication during long exams.
5. **Argon2id:** OWASP 2026 Password Storage Cheat Sheet first choice. Memory-hard (defeats GPU/ASIC attacks), RFC 9106 standardized, no 72-byte password truncation limit (unlike bcrypt). Parameters: `memoryCost: 65536` (64 MiB), `timeCost: 3`, `parallelism: 1`. Uses `@node-rs/argon2` (native binding, not pure-JS).

#### Token Design

| Token Type    | Expiry     | Claims                                                         | Storage                                               |
| ------------- | ---------- | -------------------------------------------------------------- | ----------------------------------------------------- |
| Access Token  | 15 minutes | sub, role, device_id, exam_batch_id, attempt_id, iat, exp, jti | In-memory (client)                                    |
| Refresh Token | 24 hours   | sub, role, device_id, jti, iat, exp                            | Encrypted local storage (client) + whitelist (server) |

---

### TDR-07: Desktop Client Framework (Exam Client)

| Field        | Value                                   |
| ------------ | --------------------------------------- |
| **Decision** | C# WPF (.NET 8) + CommunityToolkit.Mvvm |
| **Status**   | Approved (v3.0)                         |
| **Date**     | 2026-07-16                              |

#### Candidates Evaluated

| Candidate                               | Pros                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Cons                                                                                                                                                                                                                                                                                                     | Verdict                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **C# WPF (.NET 8)**                     | Native Windows performance; smallest memory footprint (~50MB); direct Win32 API access for lockdown (WH_KEYBOARD_LL, SetWindowPos); first-class Windows integration; mature framework (since 2006); huge documentation; excellent third-party control ecosystem; single Visual Studio solution with ExamLauncher; shared code (logging, SQLite, WebSocket, auth, models); MVVM pattern well-established; no browser engine overhead; no IPC complexity (single process); .NET 8 LTS support | Windows-only (not cross-platform); XAML learning curve; no web technology reuse with admin dashboard; math rendering requires server-side pre-rendering or WebView2 fragment                                                                                                                             | **Selected**                                                     |
| **Browser Shell (Chromium + React)**    | Rendering consistency (bundled Chromium); mature ecosystem; Node.js backend access; rich DevTools; huge community; React code sharing with admin dashboard; npm ecosystem access                                                                                                                                                                                                                                                                                                            | Large bundle (85-200MB); high memory (180-250MB idle); slower startup (1-3s); security requires careful config; team has no experience — high learning curve (main/renderer process, IPC, preload, packaging, auto-updater, native modules); adds entire technology stack with no cross-platform benefit | Rejected                                                         |
| **WinUI 3 (Windows App SDK)**           | Native Windows UI; modern Fluent Design; native Win32 interop; lightweight; first-party Microsoft support                                                                                                                                                                                                                                                                                                                                                                                   | Still evolving; smaller community; less documentation than WPF; fewer third-party controls; newer API surface means more edge cases; maturity matters more than modernity for mission-critical exam systems                                                                                              | Rejected                                                         |
| **Tauri 2.x + React**                   | 96% smaller bundle than browser shells; 75% less memory; 3.7x faster startup; declarative security model; Rust backend                                                                                                                                                                                                                                                                                                                                                                      | Rust backend — team would need Rust expertise; system webview inconsistency; smaller ecosystem; no Node.js ecosystem access                                                                                                                                                                              | Rejected                                                         |
| **Qt (C++/Python)**                     | Cross-platform native; excellent performance; mature; QML for UI                                                                                                                                                                                                                                                                                                                                                                                                                            | C++ complexity or Python performance; steeper learning curve; licensing considerations (LGPL/commercial)                                                                                                                                                                                                 | Rejected                                                         |
| **Safe Exam Browser (SEB) integration** | Open-source; production-grade lockdown; VM detection; cert pinning; process monitoring; MPL licensed                                                                                                                                                                                                                                                                                                                                                                                        | SEB is a lockdown browser, not a full application framework; still need separate web app; SEB config is complex; limited customization; depends on external LMS                                                                                                                                          | Rejected (as primary framework; may integrate lockdown concepts) |

#### Justification

1. **Windows-only project:** The exam client targets Windows only. No macOS, Linux, or mobile client is planned. A native Windows framework is the natural fit — no need for a cross-platform abstraction layer (Chromium, WebView2) that adds overhead without benefit.
2. **Delivery risk optimization:** Technology choice should optimize for delivery risk, not just technical elegance. The team has no desktop web-shell experience. Adopting a browser-based shell requires learning: main vs renderer process, IPC, preload scripts, browser security model, packaging, auto-updater, Windows integration, native modules. C# WPF eliminates this entire learning curve — the team already builds the ExamLauncher in C#.
3. **Single technology stack:** The ExamLauncher is already C# (.NET 8). Using C# for the client means one Visual Studio solution, one installer, one deployment. Launcher and client share: logging, configuration, SQLite access, WebSocket client, authentication, data models. No separate Node.js/web-shell toolchain for the client.
4. **Native lockdown:** WPF provides direct Win32 API access for keyboard hooks (WH_KEYBOARD_LL), window management (SetWindowPos, SetWindowLong), process monitoring, and clipboard control. No browser security sandbox to work around — the application is a native Windows process with full OS API access.
5. **Maturity over modernity:** WPF has been production-ready since 2006. It has 18+ years of documentation, Stack Overflow answers, third-party controls, and battle-tested patterns. WinUI 3 is Microsoft's newer framework but is still evolving. For a mission-critical exam system, maturity matters more than modernity.
6. **Resource efficiency:** WPF client uses ~50MB RAM vs browser-shell's 180-250MB. Startup is <500ms vs browser-shell's 1-3s. On exam center machines (potentially older hardware), this matters.
7. **Math rendering approach:** LaTeX/math rendering is handled via server-side pre-rendering to SVG/PNG images. Questions are delivered with pre-rendered images — the client displays them natively. This eliminates the need for a JavaScript rendering engine (KaTeX/MathJax) on the client. For complex HTML fragments, a WebView2 control can be embedded for specific question content only.
8. **Rejection of browser-based shells:** Browser-based desktop shells (Chromium-based, Tauri) were evaluated but rejected because the project targets Windows only, the team has no experience with them, and adopting one would increase delivery risk without providing significant benefits for a predominantly MCQ-based examination client. A native C# client provides better Windows integration, simpler deployment, and aligns with the team's technology stack.

#### Architecture

```
WindowsClient (Visual Studio Solution)
    │
    ├── ExamLauncher (C# .NET 8)
    │   ├── Process monitoring
    │   ├── Crash recovery
    │   └── Single instance enforcement
    │
    ├── ExamClient (C# WPF .NET 8)
    │   ├── Views (XAML)
    │   ├── ViewModels (CommunityToolkit.Mvvm)
    │   ├── Services (WebSocket, REST, SQLite, Auth)
    │   └── Lockdown (Win32 P/Invoke)
    │
    └── Shared (Class Library)
        ├── Logging
        ├── Configuration
        ├── SQLite data access
        ├── WebSocket client
        ├── Authentication
        └── Data models
```

#### Math Rendering Strategy

| Approach               | Implementation                                           | When to Use                                |
| ---------------------- | -------------------------------------------------------- | ------------------------------------------ |
| Server-side pre-render | LaTeX → SVG/PNG at question authoring time; stored in DB | Default for all math content               |
| WebView2 fragment      | Embedded WebView2 for complex HTML/CSS question content  | Only when pre-rendered images insufficient |
| Native WPF             | Unicode math symbols, basic formatting                   | Simple equations, inline notation          |

---

### TDR-08: Admin Dashboard Framework

| Field        | Value                                                                             |
| ------------ | --------------------------------------------------------------------------------- |
| **Decision** | React 19 + Vite 6 (Rolldown) + TailwindCSS 4 (Oxide) + React Compiler + shadcn/ui |
| **Status**   | Approved (v2.0)                                                                   |
| **Date**     | 2026-07-16                                                                        |

#### Candidates Evaluated

| Candidate                                                          | Pros                                                                                                                                                                                                                                                                                                                                                                                  | Cons                                                                                                                        | Verdict      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **React 19 + Vite 6 + TailwindCSS 4 + React Compiler + shadcn/ui** | Largest ecosystem; most developers; React Compiler eliminates manual memoization (40% fewer re-renders); Vite 6 with Rolldown engine (7x faster builds); TailwindCSS 4 with Oxide engine (3.78x faster full builds, 182x faster incremental); shadcn/ui (Radix + Tailwind, zero runtime overhead, AAA accessibility); excellent TypeScript support; shared types with admin dashboard | React can be complex (hooks, state management); more boilerplate than Vue                                                   | **Selected** |
| **Vue 3 + Vite**                                                   | Simpler API; smaller bundle; SFC pattern; good TypeScript support                                                                                                                                                                                                                                                                                                                     | Smaller ecosystem than React; fewer enterprise component libraries; team would need Vue expertise                           | Rejected     |
| **Angular 19**                                                     | Opinionated architecture; built-in routing, forms, HTTP; good for enterprise teams; dependency injection                                                                                                                                                                                                                                                                              | Steeper learning curve; more boilerplate; heavier framework; less flexible; slower build times                              | Rejected     |
| **SvelteKit**                                                      | Smallest bundle; compile-time optimization; simplest syntax; excellent performance                                                                                                                                                                                                                                                                                                    | Smallest ecosystem; fewer enterprise components; Svelte 5 runes API is new; less battle-tested for complex admin dashboards | Rejected     |

#### Justification

1. **Ecosystem:** React has the largest ecosystem of UI components, charts (Recharts, Nivo), data tables (TanStack Table), and form libraries (React Hook Form). Critical for building a feature-rich admin dashboard quickly.
2. **Code sharing:** Shared TypeScript types, API client, and validation schemas within the admin dashboard codebase. The exam client (C# WPF) shares API contracts via generated TypeScript types from the server.
3. **shadcn/ui:** Top pick for React projects in 2026. Tailwind-native, copy-paste components, zero runtime overhead, built on Radix UI with AAA accessibility. Perfect for enterprise admin UI.
4. **Vite 6 with Rolldown:** Rust-based bundler engine — 7x faster production builds, unified dev/prod compilation, aggressive tree shaking. Sub-second HMR keeps development velocity high.
5. **TailwindCSS 4 with Oxide engine:** Rust-based CSS engine — 3.78x faster full builds, 182x faster incremental rebuilds (35ms → 192μs). CSS-first config, no PostCSS dependency, automatic content detection.
6. **React Compiler:** Automatic memoization at build time — eliminates manual `useMemo`/`useCallback`/`React.memo`. Reduces re-render overhead by up to 40% in complex UI trees (question palette, candidate list, analytics dashboards).

---

### TDR-09: ORM / Query Builder

| Field        | Value           |
| ------------ | --------------- |
| **Decision** | Drizzle ORM     |
| **Status**   | Approved (v2.0) |
| **Date**     | 2026-07-16      |

#### Candidates Evaluated

| Candidate                  | Pros                                                                                                                                                                                                                                                                                                                                                                                                                                          | Cons                                                                                                                                                                                                          | Verdict         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| **Drizzle ORM**            | Type-safe SQL-like API; zero overhead (no query engine binary); 2.7x throughput vs Prisma (11,800 vs 4,300 req/s); ~12KB bundle vs Prisma's ~1.6MB (130x smaller); near-zero cold start (8-15ms vs 180-320ms); lower RSS (92MB vs 110MB); SQL-first with full TypeScript inference; prepared statements by default; edge-compatible; Drizzle Studio for visual DB browsing; works natively with Fastify as plugin; Drizzle Kit for migrations | Smaller community than Prisma; less hand-holding for beginners; no auto-generated client (schema is code-first)                                                                                               | **Selected**    |
| **Prisma 6**               | Type-safe database access; auto-generated types from schema; migration system; excellent DX; query builder + raw SQL escape hatch; connection pooling; PostgreSQL first-class support; visual schema editor                                                                                                                                                                                                                                   | Adds a query engine layer (significant overhead); larger node_modules (~1.6MB bundle); 2.7x slower throughput than Drizzle; 180-320ms cold start; higher memory usage; less control over raw SQL optimization | Rejected (v2.0) |
| **TypeORM**                | Mature; decorators; active record + data mapper patterns                                                                                                                                                                                                                                                                                                                                                                                      | History of bugs; slower development; type safety less robust; query builder API less ergonomic                                                                                                                | Rejected        |
| **Raw SQL (pg + pg-pool)** | Maximum performance; full control; no abstraction overhead                                                                                                                                                                                                                                                                                                                                                                                    | No type safety; manual migration management; verbose; error-prone; slower development                                                                                                                         | Rejected        |

#### Justification

1. **Type safety:** Drizzle provides full TypeScript type inference from schema definitions. API request/response types, database models, and query results are all type-safe — preventing runtime errors.
2. **Performance is critical:** Drizzle achieves 11,800 req/s vs Prisma's 4,300 req/s (2.7x throughput). Near-zero cold start (8-15ms vs 180-320ms). For a high-stakes CBT platform with sub-500ms response time targets, this directly contributes to meeting performance goals.
3. **SQL-first approach:** Drizzle's SQL-like API gives finer control over query optimization — critical for the complex analytics queries in the results module (percentile calculation, rank lists, item analysis). No hidden query engine layer.
4. **Minimal overhead:** ~12KB bundle vs Prisma's ~1.6MB (130x smaller). No engine binary to download or maintain. Lower RSS (92MB vs 110MB). This matters on the exam server where resources are shared with WebSocket connections.
5. **Migration system:** Drizzle Kit provides versioned migrations with schema push/pull/generate. While less polished than Prisma Migrate, it is sufficient for our needs and improving rapidly.
6. **Connection pooling:** Uses `pg-pool` directly — industry-standard connection pooling prevents PostgreSQL connection exhaustion under 500+ concurrent clients.
7. **Fastify integration:** Drizzle works natively as a Fastify plugin via `fastify-drizzle` — clean dependency injection and request-scoped access.
8. **Edge-compatible:** Future-proofing for edge-deployed services if a capability requires it.

---

### TDR-10: Logging

| Field        | Value                          |
| ------------ | ------------------------------ |
| **Decision** | Pino (structured JSON logging) |
| **Status**   | Approved                       |
| **Date**     | 2026-07-16                     |

#### Candidates Evaluated

| Candidate       | Pros                                                                                                                                                                     | Cons                                                                      | Verdict      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ------------ |
| **Pino**        | Fastest Node.js logger (3-5x faster than Winston); structured JSON output; low overhead; log levels; child loggers for request context; transport system for log routing | JSON output less human-readable (needs pino-pretty for dev)               | **Selected** |
| **Winston**     | Most popular; transports (file, console, HTTP); human-readable; large community                                                                                          | Slower than Pino; higher overhead; less structured by default             | Rejected     |
| **Console.log** | Zero dependency; simplest                                                                                                                                                | No levels; no structure; no file rotation; no async; not production-grade | Rejected     |

#### Justification

1. **Performance:** Pino is 3-5x faster than Winston. Under 500+ concurrent connections with frequent logging (answer saves, heartbeats, audit events), logging overhead matters.
2. **Structured logging:** JSON output enables log aggregation, searching, and analysis. Critical for audit trail and debugging.
3. **Child loggers:** Each request can have a child logger with request ID, user ID, and exam batch ID — automatic context in every log line.
4. **Audit trail:** Pino's structured output can be directed to both console (for monitoring) and file (for audit archive).

---

### TDR-11: Process Manager

| Field        | Value      |
| ------------ | ---------- |
| **Decision** | PM2        |
| **Status**   | Approved   |
| **Date**     | 2026-07-16 |

#### Candidates Evaluated

| Candidate                          | Pros                                                                                                                                                               | Cons                                                                                           | Verdict      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------ |
| **PM2**                            | Process management; auto-restart on crash; cluster mode (multi-core); log management; startup script (Windows service); monitoring dashboard; zero-downtime reload | Adds a layer of abstraction; configuration file format                                         | **Selected** |
| **Windows Service (node-windows)** | Native Windows service; no extra process                                                                                                                           | Limited features; no cluster mode; no monitoring; manual log management                        | Rejected     |
| **Docker**                         | Container isolation; reproducible; portable                                                                                                                        | Overkill for LAN deployment; Docker on Windows adds overhead; complexity for exam center staff | Rejected     |
| **Systemd / equivalent**           | Linux standard                                                                                                                                                     | Not applicable on Windows                                                                      | Rejected     |

#### Justification

1. **Auto-restart:** If the exam server crashes during an exam, PM2 automatically restarts it within seconds. Critical for exam continuity.
2. **Cluster mode:** PM2 can run multiple Node.js processes (one per CPU core) for horizontal scaling on a single machine. Nginx sticky sessions ensure WebSocket connections route to the correct worker.
3. **Windows service:** PM2 can install as a Windows service via `pm2-windows-startup`, ensuring the exam server starts automatically on boot.
4. **Log management:** PM2 captures stdout/stderr, manages log rotation, and provides log streaming — integrates with Pino's output.
5. **Monitoring:** PM2 monit shows real-time CPU, memory, and request metrics — useful during exam monitoring.

---

### TDR-12: Reverse Proxy

| Field        | Value      |
| ------------ | ---------- |
| **Decision** | Nginx      |
| **Status**   | Approved   |
| **Date**     | 2026-07-16 |

#### Candidates Evaluated

| Candidate            | Pros                                                                                                                                          | Cons                                                                                                           | Verdict      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------ |
| **Nginx**            | Industry standard; WebSocket proxy support; static file serving; SSL/TLS termination; load balancing; rate limiting; Windows binary available | Configuration syntax learning curve; Windows version has some limitations vs Linux                             | **Selected** |
| **Caddy**            | Automatic HTTPS; simpler config; modern; WebSocket support                                                                                    | Less battle-tested than Nginx; smaller community; fewer performance tuning options                             | Rejected     |
| **No reverse proxy** | Simplest; fewer moving parts                                                                                                                  | No TLS termination; no load balancing; no static file optimization; no rate limiting; Node.js directly exposed | Rejected     |

#### Justification

1. **WebSocket proxy:** Nginx properly proxies WebSocket connections (Upgrade headers) — essential for routing client WebSocket connections to the Node.js server.
2. **TLS termination:** Nginx handles TLS certificates for LAN HTTPS — the Node.js server doesn't need to manage certificates directly.
3. **Static files:** Admin dashboard (React build) served as static files by Nginx — faster than Node.js serving static files.
4. **Rate limiting:** Nginx can rate-limit API requests — defense against abuse.
5. **Sticky sessions:** Nginx `ip_hash` ensures WebSocket connections are routed to the correct PM2 worker — essential for cluster mode.

---

### TDR-13: Test Framework

| Field        | Value                                                    |
| ------------ | -------------------------------------------------------- |
| **Decision** | Vitest (unit/integration) + Playwright (E2E) + k6 (load) |
| **Status**   | Approved                                                 |
| **Date**     | 2026-07-16                                               |

#### Candidates Evaluated

| Category         | Candidates                     | Decision                                                                                    |
| ---------------- | ------------------------------ | ------------------------------------------------------------------------------------------- |
| Unit/Integration | Vitest, Jest, Mocha            | **Vitest** — fastest, Vite-native, Jest-compatible API, ESM support                         |
| E2E              | Playwright, Cypress, Puppeteer | **Playwright** — cross-browser, auto-wait, network interception, fastest E2E                |
| Load             | k6, Artillery, Locust          | **k6** — Go-based (high performance), JavaScript test scripts, CLI-friendly, good reporting |
| Security         | OWASP ZAP, Snyk, npm audit     | **All three** — ZAP for penetration testing, Snyk for dependency scanning, npm audit for CI |

#### Justification

1. **Vitest:** Shares Vite configuration with the admin dashboard; fastest test runner for Node.js/TypeScript; Jest-compatible API eases migration.
2. **Playwright:** Tests admin dashboard (Chromium). Single E2E framework for the web layer. Auto-wait eliminates flaky tests. WPF client tested separately with xUnit UI automation.
3. **k6:** Must simulate 500+ concurrent WebSocket connections with answer saves, heartbeats, and status updates. k6 handles this with minimal resources (Go runtime). JavaScript test scripts align with team skills.

---

### TDR-14: CI/CD

| Field        | Value          |
| ------------ | -------------- |
| **Decision** | GitHub Actions |
| **Status**   | Approved       |
| **Date**     | 2026-07-16     |

#### Candidates Evaluated

| Candidate          | Pros                                                                                                                                      | Cons                                                                 | Verdict      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------ |
| **GitHub Actions** | Integrated with GitHub; free for public repos; large ecosystem of actions; matrix builds; self-hosted runners for Windows; Docker support | YAML can get complex; limited concurrent jobs on free tier           | **Selected** |
| **GitLab CI**      | Built-in CI/CD; Docker-native; good Windows support                                                                                       | Requires GitLab migration; less ecosystem than GitHub Actions        | Rejected     |
| **Jenkins**        | Most customizable; self-hosted; huge plugin ecosystem                                                                                     | Requires infrastructure; complex setup; maintenance burden; UI dated | Rejected     |
| **Azure DevOps**   | Enterprise-grade; Windows-native; Azure integration                                                                                       | Microsoft lock-in; pricing; overkill for this project                | Rejected     |

#### Justification

1. **GitHub-native:** If the repository is on GitHub, Actions is the natural choice — no external CI service to manage.
2. **Self-hosted Windows runner:** For testing WPF exam client and Windows-specific features, a self-hosted Windows runner provides the exact environment.
3. **Matrix builds:** Test against multiple Node.js versions, multiple Windows versions, multiple PostgreSQL versions.
4. **Ecosystem:** Pre-built actions for Drizzle Kit migrations, Playwright tests, Snyk scans, Docker builds.

---

### TDR-15: State Management

| Field        | Value                                                                             |
| ------------ | --------------------------------------------------------------------------------- |
| **Decision** | Zustand v5 + TanStack Query v5 (Admin Dashboard) + CommunityToolkit.Mvvm (Client) |
| **Status**   | Approved (v3.0)                                                                   |
| **Date**     | 2026-07-16                                                                        |

#### Admin Dashboard (React)

| Candidate         | Pros                                                                                                                                                         | Cons                                                                                                         | Verdict      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------ |
| **Zustand v5**    | 1.1KB gzipped; no Provider needed; selector-based subscriptions; `persist` middleware for localStorage; 37M weekly downloads; excellent TypeScript inference | Manual selector discipline required to prevent unnecessary re-renders (though React Compiler mitigates this) | **Selected** |
| **Jotai v2**      | 3.4KB gzipped; atomic re-rendering (automatic per-atom); React Suspense integration; bottom-up composition                                                   | Smaller community (3.7M downloads); less intuitive for store-shaped state; no outside-React access           | Rejected     |
| **Redux Toolkit** | Mature; large ecosystem; DevTools; middleware                                                                                                                | 11KB gzipped; significant boilerplate; overkill for this use case; slower development velocity               | Rejected     |
| **React Context** | Built-in; zero bundle cost; no dependency                                                                                                                    | Re-renders all consumers on any state change; no selector optimization; performance issues at scale          | Rejected     |

#### Exam Client (WPF)

| Candidate                 | Pros                                                                                                                                                                                                                                         | Cons                                                                                                             | Verdict      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------ |
| **CommunityToolkit.Mvvm** | Official Microsoft MVVM framework; source generators (ObservableProperty, RelayCommand); INotifyPropertyChanged source generation; dependency injection; messenger for cross-view communication; lightweight; well-documented; .NET 8 native | Slightly more boilerplate than React hooks; XAML binding learning curve                                          | **Selected** |
| **Prism**                 | Mature MVVM framework; navigation; module catalog; event aggregator                                                                                                                                                                          | Heavier; more opinionated; less aligned with modern .NET source generator patterns; declining community momentum | Rejected     |
| **Caliburn.Micro**        | Convention-based binding; auto-wire; minimal XAML                                                                                                                                                                                            | Conventions can be magical/hard to debug; smaller community; less active maintenance                             | Rejected     |
| **Manual INPC**           | Full control; no dependency                                                                                                                                                                                                                  | Extremely verbose; error-prone; no source generators; high boilerplate                                           | Rejected     |

#### Justification

1. **Admin Dashboard:** Zustand (UI state) + TanStack Query (server state) + React 19 Compiler (auto-memoization). This is the definitive 2026 frontend state management stack for React applications.
2. **Exam Client:** CommunityToolkit.Mvvm is the official Microsoft MVVM framework for .NET 8. It uses C# source generators to eliminate boilerplate — `[ObservableProperty]` generates INotifyPropertyChanged, `[RelayCommand]` generates ICommand bindings. This is the modern, idiomatic way to build WPF applications.
3. **No Zustand on client:** The exam client is WPF, not React. Zustand is a React-only library. CommunityToolkit.Mvvm is the WPF equivalent — it provides observable properties, commands, and messaging between ViewModels.
4. **Messenger pattern:** CommunityToolkit.Mvvm's `IMessenger` enables cross-ViewModel communication (e.g., exam state changes notifying the timer, palette, and question display ViewModels) — equivalent to Zustand's store subscriptions.

---

### TDR-16: UI Component Library (Admin Dashboard)

| Field        | Value                            |
| ------------ | -------------------------------- |
| **Decision** | shadcn/ui (Admin Dashboard only) |
| **Status**   | Approved (v3.0)                  |
| **Date**     | 2026-07-16                       |

#### Candidates Evaluated

| Candidate             | Pros                                                                                                                                                                                                                    | Cons                                                                                                       | Verdict      |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------ |
| **shadcn/ui**         | Top pick for React in 2026; Tailwind-native; copy-paste components (own the code); zero runtime overhead; built on Radix UI (AAA accessibility); customizable; no vendor lock-in; registry system for custom components | Requires manual component installation (not npm install); no built-in theme system (use Tailwind)          | **Selected** |
| **MUI (Material UI)** | 100+ pre-built components; mature; theming system; large community                                                                                                                                                      | Runtime overhead (emotion/styled-components); larger bundle; Material Design aesthetic harder to customize | Rejected     |
| **Ant Design**        | Enterprise-focused; 60+ components; rich feature set                                                                                                                                                                    | Heavy bundle; less flexible styling; Chinese ecosystem dominance; design language less modern              | Rejected     |
| **Chakra UI**         | Good DX; accessible; style props                                                                                                                                                                                        | Smaller ecosystem; v3 breaking changes; less enterprise adoption                                           | Rejected     |

#### Justification

1. **Zero runtime overhead:** Components are copied into the project (not imported from a library). No CSS-in-JS runtime. Styles are pure TailwindCSS utilities.
2. **AAA accessibility:** Built on Radix UI primitives — WCAG AAA compliant. Critical for an exam platform that must support accessibility accommodations.
3. **Full ownership:** Component source code lives in the repository. No dependency updates breaking the UI. Customize freely for exam-specific needs.
4. **TailwindCSS 4 native:** Components use TailwindCSS 4 utilities — consistent with the Oxide engine for maximum build performance.
5. **Scope:** shadcn/ui is used only for the admin dashboard (React). The exam client (WPF) uses native WPF controls and custom XAML styles. No shared UI components between admin and client — they are entirely different technology stacks.

---

### TDR-17: Local SQLite (WPF Client)

| Field        | Value                                            |
| ------------ | ------------------------------------------------ |
| **Decision** | Microsoft.Data.Sqlite + SQLitePCLRaw (SQLCipher) |
| **Status**   | Approved (v3.0)                                  |
| **Date**     | 2026-07-16                                       |

#### Candidates Evaluated

| Candidate                             | Pros                                                                                                                                                                                                                | Cons                                                                                         | Verdict      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------ |
| **Microsoft.Data.Sqlite + SQLCipher** | Official Microsoft SQLite provider for .NET; SQLCipher encryption (AES-256); WAL mode; synchronous API (matches SQLite's single-writer model); lightweight; NuGet packages; well-documented; integrates with .NET 8 | SQLCipher adds native dependency (but pre-built NuGet packages available)                    | **Selected** |
| **System.Data.SQLite + encryption**   | Mature; ADO.NET provider; encryption support                                                                                                                                                                        | Less actively maintained; heavier; not the recommended Microsoft provider                    | Rejected     |
| **SQLite-net**                        | Lightweight ORM; simple; popular in mobile/Xamarin                                                                                                                                                                  | Not a full ADO.NET provider; limited encryption support; less suitable for complex exam data | Rejected     |
| **better-sqlite3-multiple-ciphers**   | Fastest Node.js SQLite driver; encryption support                                                                                                                                                                   | Node.js only — not available for C#/.NET; would require Node.js runtime on client            | Rejected     |

#### Justification

1. **Official Microsoft provider:** `Microsoft.Data.Sqlite` is the official .NET SQLite provider maintained by Microsoft. It integrates natively with .NET 8, Entity Framework Core (if needed), and the .NET ecosystem.
2. **SQLCipher encryption:** `SQLitePCLRaw.bundle_e_sqlcipher` provides AES-256 encryption at rest — critical for securing local answer data on exam center machines. The encryption key is derived from hardware hash + attempt_id + app_secret.
3. **Synchronous API:** SQLite's single-writer model means synchronous APIs are optimal. `Microsoft.Data.Sqlite` uses synchronous ADO.NET-style commands — no async overhead for simple transactions.
4. **WAL mode:** Write-Ahead Logging enables concurrent reads during writes — important when the exam UI reads previous answers while saving new ones.
5. **Shared library:** The SQLite data access layer lives in the `Shared` class library, used by both ExamLauncher and ExamClient. No duplication.
6. **No Node.js dependency:** The previous choice (better-sqlite3-multiple-ciphers) required Node.js on the client. With WPF, the client is pure .NET — no Node.js runtime needed.

---

### TDR-18: Exam Launcher (Watchdog Process)

| Field        | Value                                    |
| ------------ | ---------------------------------------- |
| **Decision** | C# (.NET 8, shared solution with client) |
| **Status**   | Approved (v3.0)                          |
| **Date**     | 2026-07-16                               |

#### Candidates Evaluated

| Candidate                   | Pros                                                                                                                                                                                                                                                                           | Cons                                                                                                                                                     | Verdict      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **C# (.NET 8 Native AOT)**  | Native Windows process management; single self-contained executable (no runtime dependency); fast startup (<100ms); direct Win32 API access; process monitoring; crash log collection; Native AOT produces small binary (~10MB); shares solution and libraries with WPF client | Requires .NET SDK for build; Windows-only (which is fine for this project)                                                                               | **Selected** |
| **Node.js (child_process)** | Same language as main app; can share types; npm ecosystem; simple implementation                                                                                                                                                                                               | Cannot reliably self-monitor — if Node.js launcher crashes, who watches the watcher?; larger memory footprint; slower startup; not a true native process | **Rejected** |
| **PowerShell script**       | Zero dependency; native to Windows; simple                                                                                                                                                                                                                                     | No compiled binary; easily modified/tampered; no crash log collection; not a proper process manager; security concern                                    | **Rejected** |
| **C++ (Win32)**             | Smallest binary; direct API access; maximum performance                                                                                                                                                                                                                        | Build complexity; memory management; longer development time; overkill for a watchdog                                                                    | **Rejected** |

#### Justification

1. **True watchdog independence:** The launcher must be a separate native process that survives exam client crashes. C# Native AOT produces a self-contained executable with no runtime dependency — if the WPF client crashes, the launcher continues running.
2. **Process management:** Direct access to Win32 process APIs (CreateProcess, WaitForSingleObject, GetExitCodeProcess) for reliable process monitoring and restart.
3. **Crash log collection:** The launcher captures Windows crash events (WER) and writes structured crash logs for post-exam analysis.
4. **Single instance enforcement:** Uses named mutex to prevent multiple launcher instances from running simultaneously.
5. **Native AOT benefits:** .NET 8 Native AOT compiles to native code ahead-of-time — no JIT, no runtime installation needed, fast startup, small binary. The launcher runs as a lean native process.
6. **Windows-only is fine:** The exam client runs on Windows only. Cross-platform support is not a requirement for the launcher.
7. **Shared solution:** The launcher and exam client are in the same Visual Studio solution. They share a `Shared` class library containing logging, configuration, SQLite data access, WebSocket client, authentication, and data models. One solution, one build pipeline, one installer.

#### Responsibilities

| Responsibility             | Implementation                                          |
| -------------------------- | ------------------------------------------------------- |
| Start ExamClient           | Launch WPF process with lockdown flags                  |
| Monitor ExamClient         | WaitForSingleObject on process handle; poll every 500ms |
| Restart on crash           | Relaunch with backoff (immediate, 2s, 5s, 10s, max 3)   |
| Prevent multiple instances | Named mutex: Global\\ExamLauncherSingleton              |
| Collect crash logs         | Capture WER reports; write to C:\cbt\crash_logs\        |
| Graceful shutdown          | Send WM_CLOSE before TerminateProcess                   |
| Auto-start on Windows boot | Registry entry or scheduled task                        |

---

## 5. CAPABILITY-DRIVEN EVOLUTION MATRIX

The architecture is frozen. Future changes are driven by capabilities, not phases. The following matrix defines what would trigger a change:

| Capability Need             | Trigger                                      | Architecture Change Required                                    |
| --------------------------- | -------------------------------------------- | --------------------------------------------------------------- |
| AI proctoring               | Business requirement for webcam monitoring   | Add separate Python microservice for AI inference               |
| Multi-center coordination   | Business requirement for cross-center exams  | Add cloud sync service (post-exam aggregation only)             |
| >500 concurrent candidates  | Performance test failure at 500              | Upgrade server hardware (more cores, RAM) — still single server |
| >1000 concurrent candidates | Validated need exceeding single-server limit | Would require architecture review (not planned)                 |

**No changes are made for preference, fashion, or premature optimization.**

---

## 6. DOCUMENT METADATA

| Field                | Value                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Document Version** | 3.0 (Architecture Frozen — Client Stack Changed)                                                                                         |
| **Date Created**     | 2026-07-16                                                                                                                               |
| **Status**           | FROZEN — Architecture v2.0 (Client: C# WPF)                                                                                              |
| **Author**           | AI Agent (Architect Mode)                                                                                                                |
| **Prerequisite**     | PRD v3.0 (Frozen)                                                                                                                        |
| **Freeze Rule**      | Changes require: business requirement change, security issue, prototype failure, or performance test failure. No changes for preference. |
| **Research Sources** | See Section 7                                                                                                                            |

---

## 7. RESEARCH SOURCES

1. **Index.dev** — Go vs Node.js vs FastAPI Backend Comparison 2026
2. **Acquaintsoft** — FastAPI vs Node.js vs Go: 2026 Benchmark Reality Check
3. **Talent500** — Backend 2025: Node.js vs Python vs Go vs Java
4. **DevPlaybook** — PostgreSQL vs MySQL vs SQLite Comparison
5. **Valley4Techs** — MySQL vs PostgreSQL vs SQLite 2026 Guide
6. **AiTechWorlds** — PostgreSQL vs MySQL vs SQLite 2026
7. **DigitalOcean** — SQLite vs MySQL vs PostgreSQL Comparison
8. **DEV Community (axiom_agent)** — Node.js WebSockets: Socket.IO vs ws, Scaling, Reconnection
9. **AINews** — ws: The Unshakeable Foundation of Node.js Real-Time Communication
10. **Sinkron (Academic Paper)** — Comparative Performance Benchmarking of WebSocket Libraries
11. **DEV Community (alex_aslam)** — When to Use ws vs socket.io
12. **Evil Martians** — Benchmarking 5 WebSocket Servers for Node.js
13. **youngju.dev** — Tauri 2 vs Browser Shells Deep Dive 2026
14. **JavaScript News** — Tauri vs Browser Shells: Bundle Size and Memory 2026
15. **Alan Regaya** — Tauri vs Browser Shells: Lessons Shipping in Both
16. **Tech-Insider** — Tauri vs Browser Shells 2026 Comparison
17. **Patotski** — Redis Caching vs Local In-Memory Cache
18. **Danić** — Do You Really Need Redis?
19. **Baransel** — Caching in Node.js: When In-Memory Beats Redis
20. **C# Corner** — In-Process Caching vs Redis in Microservices
21. **pkgpulse** — Best Desktop App Frameworks 2026
22. **pkgpulse** — Node.js 24 LTS Upgrade Guide 2026
23. **postgresql.org** — PostgreSQL 18 Release Announcement
24. **birjob.com** — PostgreSQL 18 in Production: Async I/O Performance
25. **blog.elest.io** — PostgreSQL 18: 5 Features That Matter for Production
26. **sqg.dev** — SQLite Driver Benchmark: better-sqlite3 vs node:sqlite vs libSQL
27. **marcus-pousette/sqlite3-bench** — Node.js SQLite Implementation Benchmarks
28. **m4heshd/better-sqlite3-multiple-ciphers** — GitHub: Encrypted SQLite for Node.js
29. **toolchew.com** — Zustand vs Jotai: 2026 State Management Comparison
30. **starterpick.com** — State Management Boilerplate Guide 2026
31. **youngju.dev** — State Management Complete Comparison 2025/2026
32. **guptadeepak.com** — Password Hashing 2026: bcrypt vs Argon2 vs scrypt vs PBKDF2
33. **shattered.io** — Argon2 Password Hashing in Node.js 2026
34. **workos.com** — Picking a Password Hash: Argon2, bcrypt, scrypt
35. **hirenodejs.com** — Node.js Pino Logging in 2026: Production Guide
36. **dev.to (chintansahah35)** — Winston vs Pino in 2026: Production Comparison
37. **techplained.com** — Caddy vs Nginx 2026: Performance Benchmarks
38. **byteiota.com** — Tailwind v4: 5x Faster Builds with Rust Oxide Engine 2026
39. **techsy.io** — Turbopack vs Webpack vs Vite 2026: Real Benchmarks
40. **designrevision.com** — Best React Component Libraries 2026
41. **shadcnspace.com** — The Ultimate shadcn/ui Handbook 2026
42. **tech-insider.org** — Drizzle ORM Tutorial: Type-Safe Postgres 2026
43. **dev.to (sameer_saleem)** — The Ultimate Guide to Drizzle ORM + PostgreSQL 2025
