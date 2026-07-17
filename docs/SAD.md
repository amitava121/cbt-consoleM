# SYSTEM ARCHITECTURE DOCUMENT (SAD)

# Competitive CBT Platform

---

## 1. DOCUMENT PURPOSE

This document defines the complete software architecture for the CBT Platform. It covers system context, container decomposition, component design, deployment topology, network architecture, trust boundaries, key sequence flows, data flows, and failure scenarios.

**PRD defines WHAT to build. This document defines HOW it will be built.**

---

## 2. ARCHITECTURE OVERVIEW

### 2.1 Architecture Style

**LAN-Based, Offline-First, Client-Server Architecture with Real-Time WebSocket Communication**

The system operates entirely within an exam center's Local Area Network. No internet dependency for exam delivery. All components communicate over the LAN.

### 2.2 Key Architectural Decisions

| Decision                               | Rationale                                                                                         | Reference         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------- |
| Single-server deployment (permanent)   | 500 clients served by one server; no multi-server scaling path                                    | TDR-01, TDR-03    |
| Modular monolith                       | Core exam platform as single Fastify process; no microservices for core functionality             | TDR-01            |
| WebSocket for real-time, REST for CRUD | WebSocket for exam session events (answer save, heartbeat, monitoring); REST for admin operations | TDR-05            |
| Offline-first client with local SQLite | Client continues exam if connection drops; syncs on reconnect                                     | PRD Section 2.2.C |
| Signed Exam Manifest                   | Server signs exam schedule at start; client follows signed manifest — no client-generated timers  | SAD Section 11.4  |
| JWT for authentication                 | Stateless; no session store needed; device-binding via claims                                     | TDR-06            |
| PostgreSQL for primary database        | ACID compliance; MVCC for concurrent writes; JSONB for flexible metadata                          | TDR-03            |
| UNLOGGED monitoring table              | Transient operational state in PostgreSQL UNLOGGED table; no Redis needed                         | SAD Section 11.5  |
| Nginx with sticky sessions             | TLS termination; WebSocket proxy with sticky session affinity for PM2 cluster                     | TDR-12            |
| PM2 cluster mode                       | Multi-core utilization; sticky sessions ensure WebSocket routing to correct worker                | TDR-01            |
| Signed security policies               | Offline private key signing; client verifies with embedded public key                             | SAD Section 11.6  |
| ExamLauncher (C# Native AOT)           | Watchdog process; starts client, restarts on crash, prevents multiple instances                   | TDR-18            |
| C# WPF client                          | Windows-only project; team knows C#; native lockdown; shared solution with launcher               | TDR-07            |
| No Redis, no Kubernetes                | Single server architecture; no distributed components                                             | TDR-01            |

---

## 3. C4 MODEL — LEVEL 1: SYSTEM CONTEXT

```
                           EXAM CENTER LAN (10.0.0.0/24)
                    ┌──────────────────────────────────────┐
                    │                                      │
                    │   ┌─────────────────────────────┐    │
                    │   │                             │    │
                    │   │     CBT PLATFORM            │    │
                    │   │  (Software System)          │    │
                    │   │                             │    │
                    │   │  - Exam Server              │    │
                    │   │  - Admin Dashboard          │    │
                    │   │  - Exam Client              │    │
                    │   │  - Database                 │    │
                    │   │                             │    │
                    │   └─────────────────────────────┘    │
                    │                                      │
                    └──────────────────────────────────────┘
                               ▲          ▲          ▲
                               │          │          │
                    ┌──────────┘          │          └──────────┐
                    │                     │                     │
              ┌─────┴─────┐        ┌──────┴──────┐        ┌──────┴──────┐
              │  CANDIDATE │        │   ADMIN /   │        │   EXTERNAL  │
              │  (Student) │        │  PROCTOR    │        │   SYSTEMS   │
              │            │        │             │        │ (Optional)  │
              │ Takes exam │        │ Manages     │        │ Cloud sync  │
              │ on client  │        │ exams,      │        │ for results │
              │ machine    │        │ monitors    │        │ aggregation │
              └────────────┘        └─────────────┘        └─────────────┘
```

### Actors

| Actor                   | Description                                    | Interaction                                                           |
| ----------------------- | ---------------------------------------------- | --------------------------------------------------------------------- |
| **Candidate**           | Student taking the exam                        | Interacts with Exam Client on a locked-down Windows machine           |
| **Exam Administrator**  | Creates/schedules exams, manages question bank | Interacts with Admin Dashboard via web browser on admin machine       |
| **Proctor/Invigilator** | Monitors live exam sessions                    | Interacts with Admin Dashboard (monitoring console) via web browser   |
| **Super Admin**         | Full system control, configuration, audit      | Interacts with Admin Dashboard via web browser                        |
| **Question Author**     | Creates/edits questions                        | Interacts with Admin Dashboard (question bank module) via web browser |

### External Systems

| System                                  | Interaction                                 | Status       |
| --------------------------------------- | ------------------------------------------- | ------------ |
| **Windows Group Policy** (out of scope) | Kiosk mode enforcement, auto-start, NetBoot | Pre-existing |
| **DHCP Server** (out of scope)          | IP assignment for exam center machines      | Pre-existing |

---

## 4. C4 MODEL — LEVEL 2: CONTAINER DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              CBT PLATFORM (CONTAINERS)                               │
│                                                                                      │
│  ┌──────────────────┐    HTTPS/WS     ┌─────────────────┐    TCP/SQL    ┌─────────┐ │
│  │                  │ ◄─────────────► │                 │ ◄──────────► │         │ │
│  │  ADMIN DASHBOARD │                 │  EXAM SERVER    │              │POSTGRESQL│ │
│  │  (React SPA)     │                 │  (Node.js +     │              │  18     │ │
│  │                  │                 │  Fastify)       │              │         │ │
│  │  - Vite build    │                 │                 │              └─────────┘ │
│  │  - TailwindCSS   │                 │  - REST API     │                            │
│  │  - shadcn/ui     │                 │  - WebSocket    │    File I/O   ┌─────────┐ │
│  │                  │                 │  - Auth service │ ◄──────────► │ FILE    │ │
│  └──────────────────┘                 │  - Grading      │              │ STORAGE │ │
│                                       │  - Audit log    │              │ (Media) │ │
│  ┌──────────────────┐    WS/HTTPS     │  - Monitoring   │              └─────────┘ │
│  │                  │ ◄─────────────► │                 │                            │
│  │  EXAM CLIENT     │                 │                 │                            │
│  │  (C# WPF +       │                 │                 │                            │
│  │   .NET 8)        │                 │                 │                            │
│  │                  │                 │                 │                            │
│  │  - Kiosk mode    │                 └─────────────────┘                            │
│  │  - Local SQLite  │                                                                 │
│  │  - Auto-save     │                                                                 │
│  │  - Lockdown      │                                                                 │
│  │  - Manifest ver. │                                                                 │
│  └──────────────────┘                                                                 │
│                                                                                      │
│  ┌──────────────────┐                                                                 │
│  │  EXAM LAUNCHER   │  C# (.NET 8 Native AOT)                                         │
│  │  (Watchdog)      │  - Starts ExamClient                                            │
│  │                  │  - Restarts on crash                                            │
│  │                  │  - Prevents multiple instances                                  │
│  │                  │  - Collects crash logs                                          │
│  └──────────────────┘                                                                 │
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │  NGINX (REVERSE PROXY)                                                        │   │
│  │  - TLS termination                                                            │   │
│  │  - WebSocket proxy (STICKY SESSIONS)                                          │   │
│  │  - Static file serving (Admin Dashboard)                                      │   │
│  │  - Rate limiting                                                              │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                      │
│  ┌──────────────────┐                                                                 │
│  │  PM2             │  Process manager for Exam Server                             │
│  │  (Process Mgr)   │  - Auto-restart on crash                                     │
│  │                  │  - Cluster mode (4-8 workers)                                │
│  │                  │  - Sticky session affinity via Nginx                         │
│  └──────────────────┘                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Container Descriptions

| Container           | Technology                              | Responsibility                                                                                                           |
| ------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Exam Server**     | Node.js 24 + Fastify 5                  | REST API, WebSocket server, authentication, exam session management, grading, audit logging                              |
| **Admin Dashboard** | React 19 + Vite 6 + TailwindCSS 4       | Web UI for exam management, question bank, monitoring, results, analytics                                                |
| **Exam Client**     | C# WPF + .NET 8 + CommunityToolkit.Mvvm | Desktop kiosk application for candidates; native lockdown, exam interface, offline resilience                            |
| **Exam Launcher**   | C# (.NET 8 Native AOT)                  | Watchdog process; starts client, restarts on crash, prevents multiple instances, crash logs; shared solution with client |
| **PostgreSQL**      | PostgreSQL 18                           | Primary database; all exam data, user data, audit logs; UNLOGGED monitoring table                                        |
| **Nginx**           | Nginx                                   | Reverse proxy; TLS termination; WebSocket proxy with sticky sessions; static file serving                                |
| **PM2**             | PM2                                     | Process manager; auto-restart; cluster mode (4-8 workers); log management                                                |
| **File Storage**    | Local filesystem                        | Media files (question images, audio, video); backups                                                                     |

### Communication Patterns

| From            | To           | Protocol        | Purpose                                                         |
| --------------- | ------------ | --------------- | --------------------------------------------------------------- |
| Admin Dashboard | Nginx        | HTTPS (REST)    | CRUD operations (exam creation, question bank, user management) |
| Admin Dashboard | Nginx        | WSS (WebSocket) | Live monitoring, real-time candidate status, proctoring feeds   |
| Exam Client     | Nginx        | WSS (WebSocket) | Exam session events (answer save, heartbeat, submit)            |
| Exam Client     | Nginx        | HTTPS (REST)    | Login, exam metadata fetch, submit                              |
| Nginx           | Exam Server  | HTTP (proxied)  | REST API proxying                                               |
| Nginx           | Exam Server  | WS (proxied)    | WebSocket proxying                                              |
| Exam Server     | PostgreSQL   | TCP (SQL)       | Database queries                                                |
| Exam Server     | File Storage | File I/O        | Media read/write, backups                                       |
| Exam Client     | Local SQLite | File I/O        | Offline answer storage, state persistence                       |

---

## 5. C4 MODEL — LEVEL 3: COMPONENT DIAGRAM (EXAM SERVER)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  EXAM SERVER (Node.js + Fastify)                                        │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  REST API    │  │  WebSocket   │  │  Auth        │  │  Audit     │ │
│  │  Router      │  │  Server      │  │  Service     │  │  Service   │ │
│  │              │  │              │  │              │  │            │ │
│  │  - /api/v1/  │  │  - /ws       │  │  - JWT       │  │  - Log     │ │
│  │    auth       │  │  - Event     │  │    issue     │  │    events  │ │
│  │  - /api/v1/  │  │    router    │  │  - JWT       │  │  - Tamper- │ │
│  │    questions  │  │  - Room      │  │    verify    │  │    evident │ │
│  │  - /api/v1/  │  │    manager   │  │  - RBAC      │  │    chain   │ │
│  │    exams      │  │  - Heartbeat │  │  - Password  │  │  - Export  │ │
│  │  - /api/v1/  │  │    monitor   │  │    hash      │  │            │ │
│  │    candidates │  │              │  │              │  │            │ │
│  │  - /api/v1/  │  │              │  │              │  │            │ │
│  │    results    │  │              │  │              │  │            │ │
│  │  - /api/v1/  │  │              │  │              │  │            │ │
│  │    monitor    │  │              │  │              │  │            │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬─────┘ │
│         │                 │                 │                 │       │
│         └────────┬────────┴────────┬────────┘                 │       │
│                  │                 │                          │       │
│         ┌────────┴─────────┐  ┌────┴──────────────┐           │       │
│         │  Exam Session    │  │  Grading Engine   │           │       │
│         │  Manager         │  │                   │           │       │
│         │                   │  │  - Auto-grade    │           │       │
│         │  - Lifecycle      │  │    objective     │           │       │
│         │  - State machine  │  │  - Score calc    │           │       │
│         │  - Crash recovery │  │  - Percentile    │           │       │
│         │  - Device valid.  │  │  - Rank list     │           │       │
│         └────────┬─────────┘  └────┬──────────────┘           │       │
│                  │                 │                          │       │
│         ┌────────┴─────────┐  ┌────┴──────────────┐           │       │
│         │  Question Bank   │  │  Analytics Engine │           │       │
│         │  Service         │  │                   │           │       │
│         │  - CRUD          │  │  - Item analysis  │           │       │
│         │  - Import/export │  │  - Difficulty idx │           │       │
│         │  - Encryption    │  │  - Discrimination │           │       │
│         │  - Randomization │  │  - Trends         │           │       │
│         └────────┬─────────┘  └────┬──────────────┘           │       │
│                  │                 │                          │       │
│         ┌────────┴─────────────────┴──────────────────────────┘       │
│         │                                                              │
│         │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│         │  │  Drizzle ORM │  │  Pino Logger │  │  Cache (L1)      │  │
│         │  │  (Database)  │  │  (Logging)   │  │  (lru-cache)     │  │
│         │  └──────┬───────┘  └──────────────┘  └──────────────────┘  │
│         │         │                                                      │
└─────────┼─────────┼──────────────────────────────────────────────────────┘
          │         │
          ▼         ▼
    ┌──────────┐  PostgreSQL 18
    │PostgreSQL│
    │   18     │
    └──────────┘
```

### Component Responsibilities

| Component                 | Responsibility                                                      | Key Interfaces                           |
| ------------------------- | ------------------------------------------------------------------- | ---------------------------------------- |
| **REST API Router**       | Handles all HTTP CRUD operations                                    | Fastify routes, JSON Schema validation   |
| **WebSocket Server**      | Real-time bidirectional communication                               | `ws` library, custom event protocol      |
| **Auth Service**          | JWT issuance, verification, RBAC, password hashing                  | @node-rs/argon2 (Argon2id), jsonwebtoken |
| **Audit Service**         | Immutable logging of all actions, tamper-evident chain              | Pino + file-based append-only log        |
| **Exam Session Manager**  | Session lifecycle, state machine, crash recovery, device validation | State machine, WebSocket rooms           |
| **Grading Engine**        | Auto-grading, score calculation, percentile, rank lists             | Drizzle queries, statistical functions   |
| **Question Bank Service** | Question CRUD, import/export, encryption, randomization             | Drizzle, AES-256, shuffle algorithms     |
| **Analytics Engine**      | Item analysis, difficulty index, discrimination index, trends       | Drizzle aggregate queries                |
| **Drizzle ORM**           | Database access, migrations, type-safe queries                      | Drizzle Client (pg-pool)                 |
| **Pino Logger**           | Structured JSON logging with request context                        | Pino + child loggers                     |
| **Cache (L1)**            | In-memory cache for hot data (exam config, sessions, settings)      | lru-cache                                |

---

## 6. DEPLOYMENT ARCHITECTURE

### 6.1 Single-Server Deployment (Production)

```
┌─────────────────────────────────────────────────────────────────────┐
│  EXAM SERVER MACHINE (16-core CPU, 32GB RAM, 1TB NVMe SSD)        │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  NGINX (Port 443/80)                                        │   │
│  │  - TLS certificate (self-signed for LAN)                    │   │
│  │  - Proxy /api/* -> localhost:3000 (sticky sessions)        │   │
│  │  - Proxy /ws -> localhost:3000 (WebSocket upgrade, sticky) │   │
│  │  - Serve /admin/* -> static React build                    │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────┴──────────────────────────────────┐   │
│  │  PM2 (Process Manager)                                      │   │
│  │  - Exam Server: cluster mode (4-8 workers)                 │   │
│  │  - Auto-restart on crash                                    │   │
│  │  - Log rotation                                              │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────┴──────────────────────────────────┐   │
│  │  EXAM SERVER (Node.js + Fastify, port 3000)                 │   │
│  │  - REST API                                                  │   │
│  │  - WebSocket server                                          │   │
│  │  - Drizzle Client -> PostgreSQL                              │   │
│  │  - UNLOGGED monitoring_state table                           │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────┴──────────────────────────────────┐   │
│  │  POSTGRESQL 18 (port 5432)                                  │   │
│  │  - Database: cbt_platform                                   │   │
│  │  - max_connections: 200                                     │   │
│  │  - shared_buffers: 4GB                                      │   │
│  │  - UNLOGGED table: monitoring_state (no WAL)               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  FILE STORAGE                                                │   │
│  │  - C:\cbt\media\ (question images, audio, video)            │   │
│  │  - C:\cbt\backups\ (database backups)                       │   │
│  │  - C:\cbt\logs\ (audit logs, application logs)              │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
          │
          │ LAN (10.0.0.0/24)
          │
    ┌─────┴──────────────────────────────────────────────────────┐
    │                                                            │
    │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
    │  │ CLIENT 1     │  │ CLIENT 2     │  │ CLIENT N     │    │
    │  │ (Windows)    │  │ (Windows)    │  │ (Windows)    │    │
    │  │              │  │              │  │              │    │
    │  │ ExamLauncher │  │ ExamLauncher │  │ ExamLauncher │    │
    │  │   ↓          │  │   ↓          │  │   ↓          │    │
    │  │ WPF Exam     │  │ WPF Exam     │  │ WPF Exam     │    │
    │  │ Exam Client  │  │ Exam Client  │  │ Exam Client  │    │
    │  │              │  │              │  │              │    │
    │  │ Local SQLite │  │ Local SQLite │  │ Local SQLite │    │
    │  │ (encrypted)  │  │ (encrypted)  │  │ (encrypted)  │    │
    │  └──────────────┘  └──────────────┘  └──────────────┘    │
    │                                                            │
    │  ┌──────────────┐  ┌──────────────┐                      │
    │  │ ADMIN MACHINE│  │ PROCTOR      │                      │
    │  │ (Windows)    │  │ MACHINE      │                      │
    │  │              │  │ (Windows)    │                      │
    │  │ Web Browser  │  │              │                      │
    │  │ Admin        │  │ Web Browser  │                      │
    │  │ Dashboard    │  │ Monitoring   │                      │
    │  └──────────────┘  └──────────────┘                      │
    │                                                            │
    └────────────────────────────────────────────────────────────┘
```

### 6.2 PM2 Cluster & Sticky Sessions

PM2 runs the Exam Server in cluster mode with 4-8 workers (depending on CPU cores). Nginx must route WebSocket connections with sticky session affinity to ensure a client's WebSocket reconnects to the same worker.

**Nginx upstream configuration (sticky sessions):**

```nginx
upstream exam_server {
    ip_hash;  # Sticky session by client IP
    server 127.0.0.1:3000;
}
```

**Why sticky sessions are required:**

- WebSocket connections are long-lived and stateful per worker
- Without sticky sessions, reconnects may land on a different worker and lose connection state
- PM2 cluster mode does NOT automatically solve WebSocket routing

### 6.3 Server Capacity Planning

| Resource               | Capacity | Utilization at 500 Clients                                     |
| ---------------------- | -------- | -------------------------------------------------------------- |
| CPU                    | 16-core  | ~25-40% (WebSocket + DB)                                       |
| RAM                    | 32GB     | ~12-16GB (Node.js 4GB + PostgreSQL 8GB + Nginx 0.5GB + OS 4GB) |
| Network                | 1 Gbps   | ~50-100 Mbps (WebSocket events + media)                        |
| PostgreSQL connections | 200 max  | ~100-150 active (connection pooling)                           |
| WebSocket connections  | 500      | ~1.5MB memory (ws: 3KB/conn)                                   |

**Validation targets:** 750 (normal stress), 1,000 (peak stress). Official capacity: 500.

---

## 7. NETWORK TOPOLOGY

### 7.1 LAN Network Architecture

```
                    INTERNET (NOT USED DURING EXAM)
                         │
                         │ (Firewall blocks all
                         │  inbound/outbound during exam)
                         │
    ┌────────────────────┴───────────────────────────────┐
    │                EXAM CENTER LAN                      │
    │                10.0.0.0/24                          │
    │                DHCP: 10.0.0.100-200                 │
    │                                                    │
    │   ┌──────────┐                                     │
    │   │  SWITCH  │                                     │
    │   │  (L2)    │                                     │
    │   └────┬─────┘                                     │
    │        │                                           │
    │   ┌────┴──────────────────────────────────────┐   │
    │   │                                          │   │
    │   │  10.0.0.10 (Exam Server)                 │   │
    │   │  - Nginx: 443/80                         │   │
    │   │  - Node.js: 3000 (internal)              │   │
    │   │  - PostgreSQL: 5432 (internal)           │   │
    │   │                                          │   │
    │   │  10.0.0.11 (Admin Machine)               │   │
    │   │  - Web Browser -> 10.0.0.10:443          │   │
    │   │                                          │   │
    │   │  10.0.0.12 (Proctor Machine)             │   │
    │   │  - Web Browser -> 10.0.0.10:443          │   │
    │   │                                          │   │
    │   │  10.0.0.100-200 (Client Machines)        │   │
    │   │  - WPF Client -> 10.0.0.10:443            │   │
    │   │                                          │   │
    │   └──────────────────────────────────────────┘   │
    └──────────────────────────────────────────────────┘
```

### 7.2 Port Allocation

| Service     | Port | Protocol | Bound To  | Purpose                              |
| ----------- | ---- | -------- | --------- | ------------------------------------ |
| Nginx HTTP  | 80   | TCP      | 0.0.0.0   | Redirect to HTTPS                    |
| Nginx HTTPS | 443  | TCP      | 0.0.0.0   | REST API, WebSocket, Admin Dashboard |
| Node.js     | 3000 | TCP      | 127.0.0.1 | Internal (behind Nginx)              |
| PostgreSQL  | 5432 | TCP      | 127.0.0.1 | Internal (local only)                |

### 7.3 Network Security

| Rule                 | Direction     | Source      | Destination         | Action                  |
| -------------------- | ------------- | ----------- | ------------------- | ----------------------- |
| Allow HTTPS/WS       | Inbound       | 10.0.0.0/24 | 10.0.0.10:443       | Allow                   |
| Block Node.js direct | Inbound       | Any         | 10.0.0.10:3000      | Deny                    |
| Block PostgreSQL     | Inbound       | Any         | 10.0.0.10:5432      | Deny                    |
| Block internet       | Outbound      | 10.0.0.10   | 0.0.0.0/0 (non-LAN) | Deny (during exam)      |
| Allow DHCP           | Bidirectional | 10.0.0.0/24 | DHCP Server         | Allow                   |
| Allow DNS (internal) | Outbound      | 10.0.0.10   | 10.0.0.1:53         | Allow (if internal DNS) |

---

## 8. TRUST BOUNDARIES

### 8.1 Trust Zones

```
┌─────────────────────────────────────────────────────────────────┐
│  ZONE 0: TRUSTED (Server Internal)                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  - Node.js process                                        │    │
│  │  - PostgreSQL                                             │    │
│  │  - File system (media, logs, backups)                    │    │
│  │  - PM2                                                    │    │
│  │                                                           │    │
│  │  Trust Level: FULL                                        │    │
│  │  Access: localhost only                                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ZONE 1: SEMI-TRUSTED (LAN - Admin/Proctor)                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  - Admin machine web browser                              │    │
│  │  - Proctor machine web browser                            │    │
│  │                                                           │    │
│  │  Trust Level: MEDIUM (authenticated admin users)         │    │
│  │  Access: HTTPS to Nginx (443)                             │    │
│  │  Auth: JWT (admin/proctor role)                           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ZONE 2: UNTRUSTED (LAN - Client Machines)                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  - Candidate machines (WPF client)                        │    │
│  │                                                           │    │
│  │  Trust Level: LOW (candidates are untrusted)              │    │
│  │  Access: HTTPS/WSS to Nginx (443)                        │    │
│  │  Auth: JWT (candidate role, device-bound)                 │    │
│  │  Constraints: Never trust client data; validate all input │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ZONE 3: UNTRUSTED (External - Blocked)                         │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  - Internet                                               │    │
│  │                                                           │    │
│  │  Trust Level: NONE                                        │    │
│  │  Access: BLOCKED (firewall)                               │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 Trust Boundary Rules

| Boundary         | From           | To             | Security Controls                                                   |
| ---------------- | -------------- | -------------- | ------------------------------------------------------------------- |
| Zone 0 -> Zone 1 | Server         | Admin browser  | TLS, JWT auth, RBAC, input validation                               |
| Zone 0 -> Zone 2 | Server         | Client machine | TLS, JWT auth (device-bound), input validation, anti-replay (nonce) |
| Zone 1 -> Zone 0 | Admin browser  | Server         | TLS, JWT, CSRF protection, rate limiting                            |
| Zone 2 -> Zone 0 | Client machine | Server         | TLS, JWT (device-bound), nonce, rate limiting, answer signing       |
| Zone 3 -> Any    | Internet       | Any            | Firewall: DENY ALL                                                  |

### 8.3 Data Trust Rules

| Data Source               | Trust Level      | Validation Required                                                                        |
| ------------------------- | ---------------- | ------------------------------------------------------------------------------------------ |
| Client answer submissions | **UNTRUSTED**    | Schema validation, range checks, type checks, signature verification, timestamp validation |
| Client heartbeat/status   | **UNTRUSTED**    | Schema validation, rate limiting, timestamp validation                                     |
| Admin API requests        | **SEMI-TRUSTED** | JWT verification, RBAC check, input validation, audit log                                  |
| Database reads            | **TRUSTED**      | None (server-generated)                                                                    |
| Question bank content     | **TRUSTED**      | Server-generated, encrypted at rest                                                        |

---

## 9. KEY SEQUENCE DIAGRAMS

### 9.1 Candidate Login & Exam Start

```
Candidate    Exam Client    Nginx    Exam Server    PostgreSQL
    │            │            │           │              │
    │  Enter     │            │           │              │
    │  credentials│           │           │              │
    │───────────►│            │           │              │
    │            │  POST /api/v1/auth/login              │
    │            │───────────►│           │              │
    │            │            │  proxy    │              │
    │            │            │──────────►│              │
    │            │            │           │  verify creds│
    │            │            │           │─────────────►│
    │            │            │           │  user record │
    │            │            │           │◄─────────────│
    │            │            │           │              │
    │            │            │           │  verify device│
    │            │            │           │  registration│
    │            │            │           │─────────────►│
    │            │            │           │  device OK   │
    │            │            │           │◄─────────────│
    │            │            │           │              │
    │            │            │           │  issue JWT   │
    │            │            │           │  (access +   │
    │            │            │           │   refresh)   │
    │            │            │  200 OK   │              │
    │            │            │  + tokens │              │
    │            │            │◄──────────│              │
    │            │  tokens    │           │              │
    │            │◄───────────┘           │              │
    │            │            │           │              │
    │            │  GET /api/v1/exams/:id/metadata       │
    │            │───────────►│           │              │
    │            │            │──────────►│              │
    │            │            │           │  fetch exam  │
    │            │            │           │  + questions │
    │            │            │           │─────────────►│
    │            │            │           │  exam data   │
    │            │            │           │◄─────────────│
    │            │            │  200 OK   │              │
    │            │            │  + exam   │              │
    │            │            │◄──────────│              │
    │            │  exam data │           │              │
    │            │◄───────────┘           │              │
    │            │            │           │              │
    │            │  WS connect /ws        │              │
    │            │───────────►│           │              │
    │            │            │  upgrade  │              │
    │            │            │──────────►│              │
    │            │            │           │  create      │
    │            │            │           │  attempt     │
    │            │            │           │─────────────►│
    │            │            │           │  attempt_id  │
    │            │            │           │◄─────────────│
    │            │            │           │              │
    │            │            │           │  join room   │
    │            │            │           │  (exam_batch)│
    │            │            │  WS open  │              │
    │            │            │◄──────────│              │
    │            │  connected│           │              │
    │            │◄───────────┘           │              │
    │            │            │           │              │
    │  Exam UI   │            │           │              │
    │  rendered  │            │           │              │
    │◄───────────┘            │           │              │
    │            │            │           │              │
```

### 9.2 Answer Save Flow (Auto-Save)

```
Candidate    Exam Client              Exam Server    PostgreSQL
    │            │                        │              │
    │  Select    │                        │              │
    │  answer    │                        │              │
    │───────────►│                        │              │
    │            │                        │              │
    │            │  1. Save to local      │              │
    │            │     SQLite (immediate) │              │
    │            │  ┌─────────────────┐   │              │
    │            │  │ local_answer    │   │              │
    │            │  │ (encrypted)     │   │              │
    │            │  └─────────────────┘   │              │
    │            │                        │              │
    │            │  2. WS event:          │              │
    │            │  answer:save           │              │
    │            │  {                     │              │
    │            │    attempt_id,         │              │
    │            │    question_id,        │              │
    │            │    answer_data,        │              │
    │            │    timestamp,          │              │
    │            │    nonce,              │              │
    │            │    signature           │              │
    │            │  }                     │              │
    │            │──────────────────────►│              │
    │            │                        │              │
    │            │                        │  3. Verify   │
    │            │                        │     signature│
    │            │                        │     + nonce  │
    │            │                        │              │
    │            │                        │  4. UPSERT   │
    │            │                        │     answer   │
    │            │                        │─────────────►│
    │            │                        │  5. OK       │
    │            │                        │◄─────────────│
    │            │                        │              │
    │            │  6. WS event:          │              │
    │            │  answer:saved          │              │
    │            │  {                     │              │
    │            │    question_id,        │              │
    │            │    server_timestamp,   │              │
    │            │    status: "confirmed" │              │
    │            │  }                     │              │
    │            │◄──────────────────────│              │
    │            │                        │              │
    │            │  7. Mark local as      │              │
    │            │     "synced"           │              │
    │            │                        │              │
```

### 9.3 Crash Recovery Flow

```
Candidate    Exam Client              Exam Server    PostgreSQL
    │            │                        │              │
    │  Machine   │                        │              │
    │  reboots   │                        │              │
    │            │                        │              │
    │  Auto-     │                        │              │
    │  start     │                        │              │
    │  (GPO)     │                        │              │
    │            │                        │              │
    │            │  1. ExamLauncher starts │              │
    │            │     WPF client (kiosk) │              │
    │            │                        │              │
    │            │  2. Check local SQLite │              │
    │            │     for unsynced       │              │
    │            │     answers            │              │
    │            │                        │              │
    │            │  3. POST /api/v1/      │              │
    │            │     auth/login         │              │
    │            │──────────────────────►│              │
    │            │                        │              │
    │            │                        │  verify creds│
    │            │                        │  + device    │
    │            │                        │─────────────►│
    │            │                        │◄─────────────│
    │            │                        │              │
    │            │  4. JWT issued         │              │
    │            │◄──────────────────────│              │
    │            │                        │              │
    │            │  5. WS connect /ws     │              │
    │            │──────────────────────►│              │
    │            │                        │              │
    │            │                        │  6. Check    │
    │            │                        │     existing │
    │            │                        │     attempt  │
    │            │                        │     status   │
    │            │                        │─────────────►│
    │            │                        │  attempt:    │
    │            │                        │  ACTIVE      │
    │            │                        │◄─────────────│
    │            │                        │              │
    │            │  7. WS event:          │              │
    │            │  session:resume        │              │
    │            │  {                     │              │
    │            │    attempt_id,         │              │
    │            │    remaining_time,     │              │
    │            │    last_question_id    │              │
    │            │  }                     │              │
    │            │◄──────────────────────│              │
    │            │                        │              │
    │            │  8. Sync unsynced      │              │
    │            │     local answers      │              │
    │            │  (batch WS events)     │              │
    │            │──────────────────────►│              │
    │            │                        │  UPSERT      │
    │            │                        │─────────────►│
    │            │                        │◄─────────────│
    │            │                        │              │
    │            │  9. All confirmed      │              │
    │            │◄──────────────────────│              │
    │            │                        │              │
    │  Exam     │                        │              │
    │  resumes  │                        │              │
    │  at last  │                        │              │
    │  question │                        │              │
    │◄───────────┘                        │              │
```

### 9.4 Exam Submit Flow

```
Candidate    Exam Client              Exam Server    PostgreSQL
    │            │                        │              │
    │  Click     │                        │              │
    │  "Submit"  │                        │              │
    │───────────►│                        │              │
    │            │                        │              │
    │            │  Show confirmation     │              │
    │            │  screen with summary:  │              │
    │            │  - Answered: X         │              │
    │            │  - Unanswered: Y       │              │
    │            │  - Marked for review: Z│              │
    │            │                        │              │
    │  Confirm   │                        │              │
    │───────────►│                        │              │
    │            │                        │              │
    │            │  1. Sync all unsynced  │              │
    │            │     local answers      │              │
    │            │──────────────────────►│              │
    │            │                        │  UPSERT all  │
    │            │                        │─────────────►│
    │            │                        │◄─────────────│
    │            │                        │              │
    │            │  2. WS event:          │              │
    │            │  exam:submit           │              │
    │            │  {                     │              │
    │            │    attempt_id,         │              │
    │            │    timestamp,          │              │
    │            │    nonce,              │              │
    │            │    signature           │              │
    │            │  }                     │              │
    │            │──────────────────────►│              │
    │            │                        │              │
    │            │                        │  3. Verify   │
    │            │                        │     all      │
    │            │                        │     answers  │
    │            │                        │     present  │
    │            │                        │              │
    │            │                        │  4. Update   │
    │            │                        │     attempt  │
    │            │                        │     status:  │
    │            │                        │     SUBMITTED│
    │            │                        │─────────────►│
    │            │                        │◄─────────────│
    │            │                        │              │
    │            │                        │  5. Trigger  │
    │            │                        │     auto-    │
    │            │                        │     grading  │
    │            │                        │     (async)  │
    │            │                        │              │
    │            │  6. WS event:          │              │
    │            │  exam:submitted        │              │
    │            │  {                     │              │
    │            │    attempt_id,         │              │
    │            │    status: "SUBMITTED",│              │
    │            │    submitted_at: ...   │              │
    │            │  }                     │              │
    │            │◄──────────────────────│              │
    │            │                        │              │
    │  Show      │                        │              │
    │  "Exam     │                        │              │
    │  submitted"│                        │              │
    │  screen    │                        │              │
    │◄───────────┘                        │              │
    │            │                        │              │
    │            │  Close client          │              │
    │            │  (or show results      │              │
    │            │   if instant results)  │              │
```

### 9.5 Admin Live Monitoring Flow

```
Admin         Admin Dashboard           Exam Server    PostgreSQL
    │            │                        │              │
    │  Open      │                        │              │
    │  monitoring│                        │              │
    │  dashboard │                        │              │
    │───────────►│                        │              │
    │            │                        │              │
    │            │  WS connect /ws        │              │
    │            │  (admin auth)          │              │
    │            │──────────────────────►│              │
    │            │                        │              │
    │            │                        │  join admin  │
    │            │                        │  room        │
    │            │◄──────────────────────│              │
    │            │                        │              │
    │            │  WS event:             │              │
    │            │  monitor:subscribe     │              │
    │            │  {exam_batch_id}       │              │
    │            │──────────────────────►│              │
    │            │                        │              │
    │            │                        │  fetch active │
    │            │                        │  attempts    │
    │            │                        │─────────────►│
    │            │                        │  candidates  │
    │            │                        │◄─────────────│
    │            │                        │              │
    │            │  WS event (push):      │              │
    │            │  monitor:snapshot      │              │
    │            │  {                     │              │
    │            │    candidates: [       │              │
    │            │      {id, status,      │              │
    │            │       progress,        │              │
    │            │       time_remaining,  │              │
    │            │       last_activity,   │              │
    │            │       violations: 0},  │              │
    │            │      ...               │              │
    │            │    ],                  │              │
    │            │    total: 500,         │              │
    │            │    active: 487,        │              │
    │            │    submitted: 10,      │              │
    │            │    disconnected: 3     │              │
    │            │  }                     │              │
    │            │◄──────────────────────│              │
    │            │                        │              │
    │  Live      │                        │              │
    │  dashboard │                        │              │
    │  rendered  │                        │              │
    │◄───────────┘                        │              │
    │            │                        │              │
    │            │  (Continuous updates   │              │
    │            │   pushed every 5s or   │              │
    │            │   on state change)     │              │
    │            │                        │              │
    │            │  WS event (push):      │              │
    │            │  monitor:alert         │              │
    │            │  {                     │              │
    │            │    candidate_id,       │              │
    │            │    type: "TAB_SWITCH", │              │
    │            │    severity: "HIGH",   │              │
    │            │    timestamp: ...      │              │
    │            │  }                     │              │
    │            │◄──────────────────────│              │
    │            │                        │              │
    │  Alert     │                        │              │
    │  shown     │                        │              │
    │◄───────────┘                        │              │
```

---

## 10. DATA FLOW DIAGRAMS

### 10.1 Question Bank Data Flow

```
Question Author    Admin Dashboard    Exam Server    PostgreSQL    File Storage
    │                  │                  │              │              │
    │  Create question │                  │              │              │
    │─────────────────►│                  │              │              │
    │                  │  POST /api/v1/   │              │              │
    │                  │  questions       │              │              │
    │                  │─────────────────►│              │              │
    │                  │                  │  Validate    │              │
    │                  │                  │  + sanitize  │              │
    │                  │                  │              │              │
    │                  │                  │  If media:   │              │
    │                  │                  │  encrypt +   │              │
    │                  │                  │  save file   │              │
    │                  │                  │─────────────────────────────►│
    │                  │                  │              │              │
    │                  │                  │  INSERT      │              │
    │                  │                  │  question    │              │
    │                  │                  │─────────────►│              │
    │                  │                  │  question_id │              │
    │                  │                  │◄─────────────│              │
    │                  │                  │              │              │
    │                  │  201 Created     │              │              │
    │                  │  + question_id   │              │              │
    │                  │◄─────────────────│              │              │
    │  Success         │                  │              │              │
    │◄─────────────────┘                  │              │              │
```

### 10.2 Exam Delivery Data Flow

```
Exam Server              PostgreSQL           Client (WPF)
    │                        │                      │
    │  1. Admin publishes    │                      │
    │     exam (REST)        │                      │
    │───────────────────────►│                      │
    │                        │                      │
    │  2. Client connects    │                      │
    │     (WS)               │                      │
    │◄──────────────────────────────────────────────│
    │                        │                      │
    │  3. Fetch exam config  │                      │
    │     + questions        │                      │
    │───────────────────────►│                      │
    │  questions (encrypted) │                      │
    │◄───────────────────────│                      │
    │                        │                      │
    │  4. Deliver questions  │                      │
    │     to client (WS)     │                      │
    │──────────────────────────────────────────────►│
    │                        │                      │
    │  5. Client saves       │                      │
    │     answers (WS)       │                      │
    │◄──────────────────────────────────────────────│
    │                        │                      │
    │  6. UPSERT answers     │                      │
    │───────────────────────►│                      │
    │  confirmed             │                      │
    │◄───────────────────────│                      │
    │                        │                      │
    │  7. Confirm to client  │                      │
    │──────────────────────────────────────────────►│
    │                        │                      │
    │  8. Client submits     │                      │
    │◄──────────────────────────────────────────────│
    │                        │                      │
    │  9. Update attempt     │                      │
    │     status: SUBMITTED  │                      │
    │───────────────────────►│                      │
    │◄───────────────────────│                      │
    │                        │                      │
    │  10. Auto-grade        │                      │
    │      (async worker)    │                      │
    │───────────────────────►│                      │
    │  score                 │                      │
    │◄───────────────────────│                      │
    │                        │                      │
```

---

## 11. FAILURE SCENARIOS & RECOVERY

### 11.1 Failure Scenario Matrix

| #   | Failure                        | Impact                      | Detection                                         | Recovery                                                                 | RTO       |
| --- | ------------------------------ | --------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------ | --------- |
| F1  | Client app crash               | Candidate loses connection  | ExamLauncher: process exit                        | ExamLauncher restarts client → SQLite restore → reconnect                | < 30s     |
| F2  | Windows restart                | Candidate loses connection  | N/A                                               | ExamLauncher auto-starts → SQLite restore → reconnect                    | < 2 min   |
| F3  | Network switch failure         | All clients lose connection | Server: mass heartbeat loss                       | Clients enter offline mode (signed manifest) → auto-sync on reconnect    | < 15 min  |
| F4  | Exam server crash              | All clients lose connection | PM2: process exit                                 | PM2 auto-restart (< 5s); clients reconnect and delta sync                | < 30s     |
| F5  | PostgreSQL crash               | Server cannot persist data  | Node.js: connection error                         | PM2 restarts server; PostgreSQL auto-restart via service                 | < 60s     |
| F6  | Disk full (server)             | Cannot save answers/media   | Server: disk space check                          | Alert admin; clear old logs/backups; expand disk                         | Manual    |
| F7  | Power outage (center)          | All machines off            | N/A                                               | On power restore, all machines boot, auto-start, resume from SQLite      | < 30 min  |
| F8  | Client network cable unplugged | One client loses connection | Server: missed heartbeats                         | Client continues offline (SQLite + signed manifest); auto-syncs          | < 2 min   |
| F9  | Nginx crash                    | No HTTP/WS access           | PM2: process exit                                 | PM2 auto-restart; or Windows service auto-restart                        | < 10s     |
| F10 | Client clock tampering         | Timer manipulation          | Server: compare client timestamp with server time | Server-authoritative timer via signed manifest; reject skewed timestamps | Immediate |
| F11 | PC hardware failure            | Candidate cannot continue   | Server: missed heartbeats                         | Admin pauses timer → move candidate to new PC → server restores session  | < 10 min  |
| F12 | SQLite corruption (client)     | Local answers at risk       | Client: SQLite integrity check                    | Reconnect server → download last ACK state → continue                    | < 5 min   |

**Known Residual Risk:** If both the local encrypted SQLite store becomes unrecoverable AND the server is unavailable before recent answers have synchronized, unsynchronized responses may be lost. This is a compound failure (two independent failures) and is accepted as a documented residual risk.

### 11.2 Recovery Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  RECOVERY LAYERS                                                 │
│                                                                  │
│  Layer 1: Client-Side (Offline Resilience)                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  - Local SQLite database (encrypted)                     │    │
│  │  - All answers saved locally first (every change)        │    │
│  │  - Signed Exam Manifest stored locally                   │    │
│  │  - Exam state persisted (current question, timer)        │    │
│  │  - Auto-reconnect with exponential backoff               │    │
│  │  - Delta sync on reconnect (send unsynced answers)       │    │
│  │  - Recovery package generation if server never returns    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Layer 2: Client-Side (Process Resilience)                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  - ExamLauncher (C# Native AOT) watches ExamClient       │    │
│  │  - Restarts on crash automatically                       │    │
│  │  - Prevents multiple instances                           │    │
│  │  - Collects crash logs                                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Layer 3: Server-Side (Process Resilience)                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  - PM2 auto-restart on crash (max 10 retries)            │    │
│  │  - Graceful shutdown (finish in-flight requests)          │    │
│  │  - Attempt status persisted (ACTIVE -> recovery)          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Layer 4: Database (Data Resilience)                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  - Post-exam automatic backup (pg_dump, compressed)      │    │
│  │  - remaining_time snapshot per attempt                   │    │
│  │  - answer_snapshots table for audit trail                │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 11.3 Server-Authoritative Timer (Signed Exam Manifest)

The exam timer is **server-authoritative** via a signed Exam Manifest. The client never generates its own timer.

**At exam start, the server sends a signed Exam Manifest:**

```json
{
  "exam_id": "uuid-v7",
  "candidate_id": "uuid-v7",
  "attempt_id": "uuid-v7",
  "start_time": "2026-07-16T10:00:00Z",
  "end_time": "2026-07-16T13:00:00Z",
  "grace_period_minutes": 5,
  "exam_rules": { ... },
  "manifest_signature": "RSA-SHA256:..."
}
```

The client stores the manifest in local SQLite and follows it.

| Aspect            | Implementation                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------- |
| Timer source      | Signed Exam Manifest (server-signed at exam start)                                            |
| Client display    | Client counts down based on manifest end_time, syncs with server on heartbeat                 |
| Client drift      | Client counts down locally for UI smoothness, but syncs with server every 30s (heartbeat)     |
| Tamper resistance | Manifest is cryptographically signed; client rejects unsigned or altered manifests            |
| Auto-submit       | Client auto-submits when manifest end_time + grace_period is reached                          |
| Pause handling    | Server pauses timer on admin pause; manifest supports pause windows; resumes on admin unpause |
| Offline operation | If server crashes, client continues using signed manifest — timer remains authoritative       |

### 11.4 Monitoring Architecture (UNLOGGED Table)

Monitoring uses a PostgreSQL UNLOGGED table for transient operational state. No Redis.

```sql
CREATE UNLOGGED TABLE monitoring_state (
    attempt_id UUID PRIMARY KEY,
    worker_id INT,
    status VARCHAR(50),
    heartbeat_at TIMESTAMP,
    latency_ms INT,
    current_question_id UUID,
    progress INT,
    exam_batch_id UUID
);
```

**Why UNLOGGED?**

- Skip WAL writes — 3-5x faster than regular tables
- No replication — fine, monitoring is transient
- Survives worker crashes — data is in PostgreSQL, not in worker memory
- All PM2 workers can write — `INSERT ON CONFLICT UPDATE` per heartbeat
- Admin queries one table — `SELECT * FROM monitoring_state WHERE exam_batch_id = ?`

**Data classification:**

| Class         | Storage               | Examples                                           |
| ------------- | --------------------- | -------------------------------------------------- |
| Persistent    | PostgreSQL (WAL)      | Answers, sessions, audit, results, incident logs   |
| Operational   | PostgreSQL (UNLOGGED) | Heartbeat, connection state, latency, progress     |
| Configuration | PostgreSQL (WAL)      | Device registration, policy version, exam settings |

**Monitoring flow:**

```
Exam Client → Heartbeat → PM2 Worker → UPSERT → UNLOGGED monitoring_state → Admin Dashboard
```

Admin dashboard refreshes every 2-3 seconds via REST API querying the UNLOGGED table.

### 11.5 Signed Security Policies

Security policies (lockdown configuration) are digitally signed with an offline private key.

**Signing flow:**

```
Security Admin (offline machine)
    ↓
Sign policy.json with private key
    ↓
Output: policy.json + policy.sig
    ↓
Upload to Exam Server
    ↓
Server distributes (cannot modify — no private key)
    ↓
Client verifies with embedded public key
    ↓
Accept or reject
```

**Key principles:**

- Private key is NEVER on the exam server
- Server is a dumb courier — it can deliver but cannot forge
- Client embeds the trusted public key at build time
- Unsigned or invalid policies are rejected
- Policy updates without client rebuild

### 11.6 Candidate Timer Pause/Resume

Invigilator-only capability for PC transfer scenarios.

**APIs:**

```
POST /api/admin/candidates/{id}/pause
POST /api/admin/candidates/{id}/resume
```

**Flow:**

```
PC Failure
    ↓
Invigilator pauses candidate
    ↓
Move candidate to new PC
    ↓
Invigilator resumes candidate
    ↓
Server restores session on new device
```

The signed Exam Manifest supports pause windows so the client can verify legitimate pauses. The timeline remains auditable.

### 11.7 Exam Incident Log

Every unusual event is recorded in an exam incident log for audit purposes:

| Event                     | Trigger                          |
| ------------------------- | -------------------------------- |
| Network lost              | Client detects disconnect        |
| Network restored          | Client reconnects                |
| Client restarted          | ExamLauncher restarts ExamClient |
| PC restarted              | Windows reboot detected          |
| Candidate paused          | Admin pauses timer               |
| Candidate resumed         | Admin resumes timer              |
| Device transfer           | Candidate logs in on new device  |
| Crash detected            | ExamLauncher logs crash          |
| Offline mode entered      | Client enters offline mode       |
| Offline mode exited       | Client exits offline mode        |
| Manual reconciliation     | Admin triggers reconciliation    |
| Recovery package imported | Admin imports recovery package   |

### 11.8 Crash Recovery Flow (Server Crash)

```
Server Crashes
    ↓
Client detects disconnect
    ↓
Client enters Offline Recovery Mode
    ↓
Client continues using SIGNED Exam Manifest
    • End time
    • Grace period
    • Exam rules
    ↓
Every answer stored in encrypted SQLite
    ↓
Reconnect attempted continuously
```

If server comes back:

```
Server Restored
    ↓
Client reconnects
    ↓
Manifest verified
    ↓
Delta Sync (send unsynced answers)
    ↓
UPSERT answers
    ↓
Server ACK
    ↓
SQLite queue cleared
    ↓
Exam finalized
```

If server never comes back:

```
Exam Ends (manifest timer expires)
    ↓
Client locks exam
    ↓
Create encrypted recovery package
    ↓
Admin restores server
    ↓
Import recovery packages
    ↓
Manifest verification
    ↓
Answer verification
    ↓
Finalize exam
```

---

## 12. CAPACITY & VALIDATION

### 12.1 Design Capacity

- **Official Target:** 500 concurrent candidates
- **Deployment:** Single exam center, single physical server
- **No multi-server scaling path** — the architecture is designed for one server permanently

### 12.2 Validation Targets

| Test Level    | Concurrent Clients | Purpose                              |
| ------------- | ------------------ | ------------------------------------ |
| Normal stress | 750                | Validate 50% headroom                |
| Peak stress   | 1,000              | Validate breaking point / resilience |

### 12.3 Architecture Principles

- **Modular Monolith:** Core exam platform (auth, sessions, questions, answers, grading, monitoring) runs as a single Fastify process. No microservices for core functionality.
- **Capability-Triggered Services:** Additional services (AI proctoring) may be introduced only when a capability requires an independent runtime. The trigger is capability, not fashion.
- **Single Server:** No Redis, no Kubernetes, no distributed architecture. One physical server handles everything.
- **No Phase-Based Scaling:** The architecture does not define Phase 1 / Phase 2 scaling. The system is designed for 500 concurrent candidates on a single server, period.

---

## 13. PROJECT STRUCTURE (MONOREPO)

```
cbe_console/
├── docs/                           # All documentation
│   ├── PRD.md                      # Product Requirements Document
│   ├── PHASE_0_PLAN.md             # Phase 0 plan
│   ├── TDR.md                      # Technology Decision Record
│   ├── SAD.md                      # System Architecture Document (this file)
│   ├── DATABASE_DESIGN.md          # Database Design Document
│   ├── API_SPECIFICATION.md        # API Specification
│   ├── SECURITY_ARCHITECTURE.md    # Security Architecture
│   ├── CLIENT_ARCHITECTURE.md      # Client Architecture
│   ├── TESTING_STRATEGY.md         # Testing Strategy
│   ├── DEV_STANDARDS.md            # Development Standards
│   └── RISK_REGISTER.md            # Risk Register & Milestones
│
├── packages/                       # Shared packages
│   ├── contracts/                  # Public API types, WebSocket events, enums
│   ├── validation/                 # Zod schemas, JSON Schema, business rules
│   ├── shared/                     # Utilities, constants, permissions, feature flags
│   ├── ui/                         # Shared React components
│   ├── config/                     # Shared configuration
│   └── logger/                     # Shared logging utilities
│
├── apps/                           # Applications
│   ├── exam-server/                # Exam Server (Node.js + Fastify)
│   │   ├── src/
│   │   │   ├── routes/              # REST API routes
│   │   │   ├── ws/                  # WebSocket handlers
│   │   │   ├── services/            # Business logic
│   │   │   ├── middleware/          # Auth, error handling, logging
│   │   │   ├── plugins/             # Fastify plugins
│   │   │   ├── workers/             # Background workers (grading, analytics)
│   │   │   ├── lib/                 # Server-specific utilities
│   │   │   └── index.ts             # Entry point
│   │   ├── drizzle/                 # Drizzle schema + migrations
│   │   │   ├── schema.ts
│   │   │   └── migrations/
│   │   ├── tests/                   # Server tests
│   │   └── package.json
│   │
│   ├── admin-dashboard/            # Admin Dashboard (React + Vite)
│   │   ├── src/
│   │   │   ├── components/          # Reusable UI components
│   │   │   ├── pages/               # Page components
│   │   │   ├── hooks/               # Custom React hooks
│   │   │   ├── stores/              # Zustand state management
│   │   │   ├── services/            # TanStack Query API client services
│   │   │   └── lib/                 # Admin-specific utilities
│   │   ├── public/
│   │   ├── tests/                   # Admin dashboard tests
│   │   └── package.json
│   │
│   ├── windows-client/             # Windows Client (C# .NET 8 — Visual Studio Solution)
│   │   ├── ExamLauncher/           # Watchdog process (Native AOT)
│   │   │   ├── Program.cs          # Main entry point
│   │   │   ├── Watchdog.cs         # Process monitoring + restart
│   │   │   ├── CrashLogger.cs      # Crash log collection
│   │   │   └── ExamLauncher.csproj # .NET project file (Native AOT)
│   │   ├── ExamClient/             # Exam Client (WPF .NET 8)
│   │   │   ├── App.xaml            # WPF application entry
│   │   │   ├── App.xaml.cs
│   │   │   ├── Views/              # XAML views (login, exam, submit)
│   │   │   │   ├── LoginView.xaml
│   │   │   │   ├── ExamView.xaml
│   │   │   │   └── SubmitView.xaml
│   │   │   ├── ViewModels/         # MVVM ViewModels (CommunityToolkit.Mvvm)
│   │   │   │   ├── LoginViewModel.cs
│   │   │   │   ├── ExamViewModel.cs
│   │   │   │   └── SubmitViewModel.cs
│   │   │   ├── Services/           # Client services
│   │   │   │   ├── WebSocketService.cs   # ClientWebSocket wrapper
│   │   │   │   ├── ApiService.cs         # REST API client
│   │   │   │   ├── SQLiteService.cs      # Local SQLite (SQLCipher)
│   │   │   │   ├── ManifestVerifier.cs   # Signed exam manifest verification
│   │   │   │   ├── PolicyVerifier.cs     # Signed security policy verification
│   │   │   │   └── DeltaSyncService.cs   # Delta sync on reconnection
│   │   │   ├── Lockdown/           # Win32 P/Invoke lockdown
│   │   │   │   ├── KeyboardHook.cs       # WH_KEYBOARD_LL hook
│   │   │   │   ├── WindowHelper.cs       # SetWindowPos, fullscreen
│   │   │   │   ├── ProcessMonitor.cs     # Unauthorized process detection
│   │   │   │   └── VMDetector.cs         # VM detection
│   │   │   ├── Resources/          # Embedded resources (public key, icons)
│   │   │   └── ExamClient.csproj   # .NET project file (WPF)
│   │   ├── Shared/                 # Shared class library (Launcher + Client)
│   │   │   ├── Logging/            # Shared logging
│   │   │   ├── Configuration/      # Shared configuration
│   │   │   ├── Data/               # SQLite data access layer
│   │   │   ├── Models/             # Shared data models
│   │   │   ├── Crypto/             # Encryption utilities
│   │   │   └── Shared.csproj       # .NET project file (class library)
│   │   └── windows-client.sln      # Visual Studio solution file
│   │
│
├── infra/                          # Infrastructure configuration
│   ├── nginx/                      # Nginx configuration
│   │   ├── nginx.conf
│   │   └── ssl/                     # TLS certificates
│   ├── pm2/                        # PM2 ecosystem config
│   │   └── ecosystem.config.js
│   └── scripts/                     # Build/deploy scripts
│       ├── build.sh
│       ├── deploy.sh
│       └── seed.sh                  # Database seeding
│
├── package.json                    # Root package.json (workspace)
├── pnpm-workspace.yaml             # pnpm workspace config
├── tsconfig.base.json              # Shared TypeScript config
├── .github/                        # GitHub Actions CI/CD
│   └── workflows/
└── README.md
```

---

## 14. DOCUMENT METADATA

| Field                | Value                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Document Version** | 3.0 (Architecture Frozen — Client Stack Changed)                                                                                         |
| **Date Created**     | 2026-07-16                                                                                                                               |
| **Status**           | FROZEN — Architecture v2.0 (Client: C# WPF)                                                                                              |
| **Author**           | AI Agent (Architect Mode)                                                                                                                |
| **Prerequisites**    | PRD v3.0 (Frozen), TDR v3.0 (Frozen)                                                                                                     |
| **Freeze Rule**      | Changes require: business requirement change, security issue, prototype failure, or performance test failure. No changes for preference. |
