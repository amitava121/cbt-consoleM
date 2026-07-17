# CLIENT ARCHITECTURE DOCUMENT

# Competitive CBT Platform — Exam Client (C# WPF)

---

## 1. DOCUMENT PURPOSE

This document defines the complete architecture for the Exam Client application (C# WPF + .NET 8). It covers startup flow, login, exam state machine, auto-save, heartbeat, crash recovery, local storage, encryption, reconnect strategy, lockdown enforcement, and render performance.

---

## 2. CLIENT OVERVIEW

### 2.1 Technology Stack

| Component      | Technology                                       | Purpose                                                                                          |
| -------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Framework      | WPF (.NET 8)                                     | Native Windows desktop application; XAML UI; direct Win32 API access for lockdown                |
| MVVM           | CommunityToolkit.Mvvm                            | Source generators (ObservableProperty, RelayCommand); INotifyPropertyChanged; IMessenger         |
| Local DB       | Microsoft.Data.Sqlite + SQLitePCLRaw (SQLCipher) | Offline answer storage; AES-256 encryption; synchronous ADO.NET API; WAL mode                    |
| Encryption     | SQLCipher (via SQLitePCLRaw.bundle_e_sqlcipher)  | AES-256 encrypted local SQLite; key derived from hardware hash + attempt_id + app_secret         |
| Math rendering | Server-side pre-rendered SVG/PNG                 | LaTeX → SVG/PNG at authoring time; client displays natively; WebView2 for complex HTML fragments |
| HTTP           | HttpClient                                       | REST API calls (login, metadata, submit)                                                         |
| WebSocket      | System.Net.WebSockets.ClientWebSocket            | Real-time answer save, heartbeat, events                                                         |
| Styling        | XAML + ResourceDictionary                        | Native WPF styling; high-contrast themes; font scaling                                           |
| Logging        | Serilog                                          | Structured logging to file; shared with ExamLauncher via Shared library                          |

### 2.2 Process Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  WPF EXAM CLIENT (Single Process)                           │
│                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐          │
│  │  VIEWS (XAML)       │  │  VIEWMODELS          │          │
│  │  - LoginView        │◄─┤  (CommunityToolkit)  │          │
│  │  - ExamView         │  │  - LoginViewModel    │          │
│  │  - SubmitView       │  │  - ExamViewModel     │          │
│  │  - QuestionPalette  │  │  - SubmitViewModel   │          │
│  │  - TimerDisplay     │  │  - QuestionPaletteVM │          │
│  └─────────────────────┘  └──────────┬──────────┘          │
│                                      │ DataBinding           │
│  ┌──────────────────────────────────┐                       │
│  │  SERVICES                        │                       │
│  │  - WebSocketService              │                       │
│  │    (ClientWebSocket)             │                       │
│  │  - ApiService (HttpClient)       │                       │
│  │  - SQLiteService (SQLCipher)     │                       │
│  │  - ManifestVerifier (Ed25519)    │                       │
│  │  - DeltaSyncService              │                       │
│  └──────────────────────────────────┘                       │
│  ┌──────────────────────────────────┐                       │
│  │  LOCKDOWN (Win32 P/Invoke)       │                       │
│  │  - KeyboardHook (WH_KEYBOARD_LL) │                       │
│  │  - WindowHelper (SetWindowPos)   │                       │
│  │  - ProcessMonitor                │                       │
│  │  - VMDetector                    │                       │
│  └──────────────────────────────────┘                       │
│  ┌──────────────────────────────────┐                       │
│  │  SHARED LIBRARY (Class Library)  │                       │
│  │  - Logging (Serilog)             │                       │
│  │  - Configuration                 │                       │
│  │  - Data Models                   │                       │
│  │  - Crypto utilities              │                       │
│  │  - SQLite data access            │                       │
│  └──────────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Single-Process Architecture (No IPC)

The WPF client runs as a **single native Windows process**. There is no IPC boundary — Views, ViewModels, and Services all run in the same process.

| Responsibility       | Location | Rationale                                                                  |
| -------------------- | -------- | -------------------------------------------------------------------------- |
| WebSocket connection | Service  | Managed by WebSocketService; survives View navigation; runs on UI thread   |
| SQLite operations    | Service  | Synchronous ADO.NET calls; no blocking concern (WPF dispatcher handles UI) |
| Crypto operations    | Service  | System.Security.Cryptography; key management in-memory; never serialized   |
| Lockdown hooks       | Lockdown | Win32 WH_KEYBOARD_LL hook; SetWindowPos; process monitoring                |
| UI rendering         | Views    | Native WPF rendering; XAML data binding; no browser engine overhead        |

**Key advantage:** No IPC means no serialization boundary, no security sandbox to work around, and no process crash isolation issues. The entire client is one native Windows process with direct API access.

---

## 3. STARTUP FLOW

### 3.1 Boot Sequence

```
Machine Power On
       │
       ▼
Windows Boot (GPO auto-login)
       │
       ▼
ExamLauncher Auto-Start (Windows Registry / Scheduled Task)
       │
       ▼
ExamLauncher starts WPF Client (kiosk mode)
       │
       ▼
┌──────────────────────────────┐
│  1. APP INIT (App.xaml.cs)    │
│  - Check for VM (refuse if VM)│
│  - Generate hardware hash     │
│  - Load device ID from config │
│  - Load embedded public key   │
│    (Resources/exam-public.pem)│
│  - Fetch signed security      │
│    policy from server         │
│  - Verify policy signature    │
│    (Ed25519 with embedded key)│
│  - Apply lockdown per policy  │
│  - Initialize SQLite (encrypted)│
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  2. CREATE MAIN WINDOW        │
│  - WindowStyle: None          │
│  - WindowState: Maximized     │
│  - Topmost: true              │
│  - ResizeMode: NoResize       │
│  - Enable lockdown hooks      │
│    (per signed policy)        │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  3. SHOW SPLASH + HEALTH      │
│  - Show splash screen         │
│  - Check server connectivity  │
│    (GET /api/v1/health)       │
└──────────┬───────────────────┘
           │
           ├──── Server reachable ───► Show Login Screen
           │
           └──── Server unreachable ──► Show "Waiting for Server"
                                         (auto-retry every 5s)
```

### 3.2 ExamLauncher Integration

The ExamLauncher (C# .NET 8 Native AOT) is the parent process that manages the WPF client lifecycle. Both are in the same Visual Studio solution and share a class library:

```
ExamLauncher (Native AOT executable)
       │
       +---> Starts WPF client (ExamClient.exe)
       │
       +---> Monitors process via WaitForSingleObject
       │     - Poll every 500ms
       │
       +---> If WPF client crashes:
       │     - Restart with backoff (immediate, 2s, 5s, 10s)
       │     - Max 3 restart attempts
       │     - Collect WER crash logs
       │
       +---> Single instance enforcement:
       │     - Named mutex: Global\\ExamLauncherSingleton
       │
       +---> Auto-start on Windows boot:
             - Registry entry or scheduled task
```

| Launcher Responsibility    | Implementation                                          |
| -------------------------- | ------------------------------------------------------- |
| Start ExamClient           | Launch WPF process with kiosk flags                     |
| Monitor ExamClient         | WaitForSingleObject on process handle; poll every 500ms |
| Restart on crash           | Relaunch with backoff (immediate, 2s, 5s, 10s, max 3)   |
| Prevent multiple instances | Named mutex: Global\\ExamLauncherSingleton              |
| Collect crash logs         | Capture WER reports; write to C:\cbt\crash_logs\        |
| Graceful shutdown          | Send WM_CLOSE before TerminateProcess                   |

### 3.3 VM Detection

```csharp
// Check for virtual machine indicators
using System.Management;

public static class VMDetector
{
    private static readonly string[] VmSignatures =
    {
        "VMware", "VirtualBox", "QEMU", "Xen",
        "Hyper-V", "Parallels", "KVM", "Virtual Machine"
    };

    public static bool IsVirtualMachine()
    {
        // Check computer model
        using var searcher = new ManagementObjectSearcher(
            "SELECT Model FROM Win32_ComputerSystem");
        foreach (var obj in searcher.Get())
        {
            var model = obj["Model"]?.ToString() ?? "";
            if (VmSignatures.Any(s => model.Contains(s, StringComparison.OrdinalIgnoreCase)))
                return true;
        }

        // Check BIOS version
        using var biosSearcher = new ManagementObjectSearcher(
            "SELECT SMBIOSBIOSVersion, Manufacturer FROM Win32_BIOS");
        foreach (var obj in biosSearcher.Get())
        {
            var bios = obj["SMBIOSBIOSVersion"]?.ToString() ?? "";
            var manufacturer = obj["Manufacturer"]?.ToString() ?? "";
            if (VmSignatures.Any(s => bios.Contains(s, StringComparison.OrdinalIgnoreCase) ||
                                      manufacturer.Contains(s, StringComparison.OrdinalIgnoreCase)))
                return true;
        }

        // Check for VM-specific processes
        var processes = Process.GetProcesses();
        foreach (var proc in processes)
        {
            if (VmSignatures.Any(s => proc.ProcessName.Contains(s, StringComparison.OrdinalIgnoreCase)))
                return true;
        }

        return false;
    }
}
```

---

## 4. LOGIN FLOW

### 4.1 Login Sequence

```
┌──────────────┐
│  Login Screen│
│  (WPF View)  │
│              │
│  Email: ____ │
│  Pass:  ____ │
│              │
│  [LOGIN]     │
└──────┬───────┘
       │
       │  User clicks LOGIN
       ▼
┌──────────────────────────────┐
│  LoginViewModel.LoginCommand │
│  - Calls ApiService.Login() │
│    { email, password,       │
│      deviceId }             │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  ApiService:                 │
│  1. POST /api/v1/auth/login  │
│     (with deviceId + hw hash)│
│  2. Receive JWT tokens       │
│  3. Store tokens in memory   │
│     (AuthService singleton)  │
│  4. Open WebSocket connection│
│     wss://server/ws?token=   │
│  5. Return success to VM     │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  ApiService:                 │
│  1. GET /api/v1/candidate/   │
│     exams                    │
│  2. Return assigned exams    │
│     to ViewModel             │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  ExamViewModel:              │
│  - Show exam list            │
│  - Show exam instructions    │
│  - [START EXAM] button       │
└──────────────────────────────┘
```

### 4.2 Signed Manifest Verification (Exam Start)

When the candidate clicks "Start Exam", the client fetches and verifies the signed Exam Manifest before proceeding:

```
Candidate clicks "Start Exam"
       │
       ▼
┌──────────────────────────────────┐
│  1. FETCH SIGNED MANIFEST         │
│  - GET /api/v1/exam/manifest      │
│  - Receive: manifest JSON +       │
│    Ed25519 signature              │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  2. VERIFY SIGNATURE              │
│  - Load embedded public key       │
│    (resources/exam-public.pem)    │
│  - Verify Ed25519 signature       │
│  - If INVALID: refuse to start,   │
│    log MANIFEST_SIGNATURE_INVALID │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  3. VERIFY MANIFEST FIELDS        │
│  - Check expiresAt > now          │
│  - Check server cert fingerprint  │
│    matches manifest               │
│  - Check exam batch is active     │
│  - If any fail: refuse to start   │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  4. USE MANIFEST AS AUTHORITATIVE │
│  - Duration from manifest         │
│  - Sections from manifest         │
│  - Marking scheme from manifest   │
│  - Timer = manifest duration      │
│  - Server timer must not exceed   │
│    manifest duration              │
└──────────┬───────────────────────┘
           │
           ▼
   Proceed to LOADING state
   (fetch questions, decrypt, cache)
```

### 4.3 Token Storage

| Token              | Storage                           | Rationale                                            |
| ------------------ | --------------------------------- | ---------------------------------------------------- |
| Access token       | AuthService singleton (in-memory) | Never written to disk; survives View navigation      |
| Refresh token      | AuthService singleton (in-memory) | Same; survives View navigation but not app restart   |
| Session key (HMAC) | Derived in AuthService            | Computed from JWT signature; never stored separately |

On app restart (crash recovery): Re-login required; tokens are not persisted to disk for security.

---

## 5. EXAM STATE MACHINE

### 5.1 States

```
                    ┌─────────────┐
                    │  IDLE       │
                    │  (login     │
                    │   screen)   │
                    └──────┬──────┘
                           │
                     exam:start
                           │
                           ▼
                    ┌─────────────┐
                    │  LOADING    │
                    │  (fetching  │
                    │   questions)│
                    └──────┬──────┘
                           │
                    questions loaded
                           │
                           ▼
              ┌─────────────────────┐
              │  IN_PROGRESS         │◄──────────────┐
              │                      │               │
              │  - Questions visible │               │
              │  - Timer running     │    resume     │
              │  - Auto-save active  │───────────────┘
              │  - Heartbeat active  │
              └─────┬───┬───┬───────┘
                    │   │   │
          ┌─────────┘   │   └──────────┐
          │             │              │
          ▼             ▼              ▼
   ┌────────────┐ ┌──────────┐  ┌────────────┐
   │  PAUSED    │ │ OFFLINE  │  │  SUBMIT_   │
   │            │ │          │  │  CONFIRM   │
   │ (admin     │ │ (network │  │            │
   │  pause)    │ │  drop)   │  │ (user      │
   │            │ │          │  │  clicks    │
   │ Timer      │ │ Timer    │  │  submit)   │
   │ stopped    │ │ continues│  │            │
   │ locally    │ │ locally  │  │ Shows      │
   │            │ │          │  │ summary    │
   └─────┬──────┘ └────┬─────┘  └─────┬──────┘
         │             │              │
     resume         reconnect     confirm
         │             │              │
         │             │              ▼
         │             │        ┌────────────┐
         └─────────────┼────────┤  SUBMITTING │
                       │        │             │
                       │        │ - Sync all  │
                       │        │   answers   │
                       │        │ - Send      │
                       │        │   exam:submit│
                       └────────┤             │
                                └──────┬──────┘
                                       │
                                server confirms
                                       │
                                       ▼
                                ┌────────────┐
                                │  SUBMITTED │
                                │            │
                                │ - Show     │
                                │   success  │
                                │ - Clear    │
                                │   local DB │
                                │ - Close or │
                                │   show     │
                                │   results  │
                                └────────────┘

    SPECIAL TRANSITIONS:
    ┌─────────────┐         ┌──────────────┐
    │  IN_PROGRESS│────────►│  TERMINATED  │
    │  / PAUSED   │ admin   │              │
    │             │ term.   │  Exam ended  │
    └─────────────┘         └──────────────┘

    ┌─────────────┐         ┌──────────────┐
    │  IN_PROGRESS│────────►│  AUTO_       │
    │             │ timer   │  SUBMITTED   │
    │             │ expires │              │
    └─────────────┘         └──────────────┘
```

### 5.2 State Transition Rules

| From State     | To State       | Trigger                          | Actions                                           |
| -------------- | -------------- | -------------------------------- | ------------------------------------------------- |
| IDLE           | LOADING        | User clicks "Start Exam"         | Fetch questions, decrypt, cache locally           |
| LOADING        | IN_PROGRESS    | Questions loaded                 | Start timer, enable auto-save, start heartbeat    |
| IN_PROGRESS    | PAUSED         | Server event `exam:paused`       | Stop timer, show pause screen, keep connection    |
| PAUSED         | IN_PROGRESS    | Server event `exam:resumed`      | Resume timer, restore UI                          |
| IN_PROGRESS    | OFFLINE        | WebSocket disconnect detected    | Switch to local-only mode, show offline indicator |
| OFFLINE        | IN_PROGRESS    | WebSocket reconnected            | Sync unsynced answers, restore online mode        |
| IN_PROGRESS    | SUBMIT_CONFIRM | User clicks "Submit"             | Show summary screen                               |
| SUBMIT_CONFIRM | SUBMITTING     | User confirms submission         | Sync all answers, send exam:submit                |
| SUBMIT_CONFIRM | IN_PROGRESS    | User clicks "Go Back"            | Return to exam                                    |
| SUBMITTING     | SUBMITTED      | Server confirms `exam:submitted` | Show success, clear local DB                      |
| IN_PROGRESS    | AUTO_SUBMITTED | Timer reaches 0                  | Auto-trigger submit flow                          |
| IN_PROGRESS    | TERMINATED     | Server event `exam:terminated`   | Show termination message, lock UI                 |
| OFFLINE        | SUBMITTING     | User clicks "Submit" (offline)   | Queue submit, sync on reconnect                   |

---

## 6. AUTO-SAVE MECHANISM

### 6.1 Save Pipeline (Every Answer Change)

```
User changes answer (selects option, types text, etc.)
       │
       ▼
┌──────────────────────────────┐
│  STEP 1: LOCAL SAVE (sync)   │
│  - Write to SQLite immediately│
│  - Status: "saved_local"     │
│  - Zero latency to user      │
│  - Guaranteed no data loss   │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  STEP 2: SERVER SAVE (async) │
│  - If online:                │
│  │  - Generate nonce         │
│  │  - Generate HMAC signature│
│  │  - Send WS answer:save    │
│  │  - Status: "syncing"      │
│  │                           │
│  - If offline:               │
│     - Queue in sync queue    │
│     - Status: "pending_sync" │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  STEP 3: CONFIRMATION        │
│  - Receive answer:saved      │
│  - Update SQLite status:     │
│    "synced"                  │
│  - Update UI indicator       │
│    (green checkmark)         │
└──────────────────────────────┘
```

### 6.2 Local SQLite Schema

```sql
-- Client-side SQLite (encrypted via Microsoft.Data.Sqlite + SQLCipher)
CREATE TABLE local_answers (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  answer_data TEXT,          -- JSON string
  status TEXT NOT NULL,      -- saved_local | syncing | synced | pending_sync
  time_spent_secs INTEGER DEFAULT 0,
  is_marked_for_review INTEGER DEFAULT 0,
  nonce TEXT,                -- For replay protection
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TEXT             -- When server confirmed
);

CREATE TABLE local_exam_state (
  id TEXT PRIMARY KEY,       -- attempt_id
  current_question_id TEXT,
  current_section_id TEXT,
  remaining_time_secs INTEGER,
  started_at TEXT,
  last_heartbeat_at TEXT,
  is_online INTEGER DEFAULT 1
);

CREATE TABLE sync_queue (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  answer_data TEXT NOT NULL,
  nonce TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  signature TEXT NOT NULL,
  retry_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_local_answers_attempt ON local_answers(attempt_id);
CREATE INDEX idx_local_answers_status ON local_answers(status);
CREATE INDEX idx_sync_queue_created ON sync_queue(created_at);
```

### 6.3 Save Frequency

| Trigger                    | Action                                 | Rationale                            |
| -------------------------- | -------------------------------------- | ------------------------------------ |
| Option selection (MCQ)     | Immediate local save + WS send         | User expects instant feedback        |
| Text input (essay/fill-in) | Debounced (500ms after last keystroke) | Avoid excessive saves during typing  |
| Mark for review            | Immediate local save + WS send         | Status change, not content           |
| Question navigation        | Save current question state            | Ensure state preserved on navigation |
| Section navigation         | Save current section state             | Ensure section state preserved       |
| Timer tick (every 30s)     | Save remaining_time to local + server  | Crash recovery snapshot              |
| Before submit              | Force sync all unsynced answers        | Ensure all data on server            |
| App close (if allowed)     | Force sync all + save state            | Graceful shutdown                    |

---

## 7. HEARTBEAT PROTOCOL

### 7.1 Heartbeat Flow

```
Every 30 seconds:
       │
       ▼
┌──────────────────────────────┐
│  Client -> Server            │
│  WS event: heartbeat         │
│  {                           │
│    attemptId: "uuid",        │
│    currentQuestionId: "uuid",│
│    remainingTimeSecs: 5400,  │
│    timestamp: "2026-..."     │
│  }                           │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  Server processes:           │
│  1. Update attempt.          │
│     last_seen_at             │
│  2. Update attempt.          │
│     remaining_time_secs      │
│  3. Check time drift         │
│  4. Update monitoring        │
│     snapshot                 │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  Server -> Client            │
│  WS event: heartbeat:ack     │
│  {                           │
│    serverTime: "2026-...",   │
│    remainingTimeSecs: 5400,  │
│    driftSecs: 0              │
│  }                           │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  Client processes:           │
│  1. If driftSecs > 5:        │
│     - Adjust local timer     │
│     - Show time correction   │
│  2. Update connection status │
│     indicator (online)       │
└──────────────────────────────┘
```

### 7.2 Missed Heartbeat Handling

| Missed Heartbeats | Client Action                               | Server Action                                  |
| ----------------- | ------------------------------------------- | ---------------------------------------------- |
| 1 (30s)           | No action; retry on next interval           | No action                                      |
| 2 (60s)           | Show "Connection unstable" warning          | Mark candidate as "unstable" in monitoring     |
| 3 (90s)           | Switch to OFFLINE mode; show offline banner | Mark candidate as "disconnected" in monitoring |
| 5+ (150s)         | Continue offline; attempt reconnect         | Keep attempt active; allow reconnect           |

### 7.3 Ping/Pong (Connection-Level)

In addition to application-level heartbeats, WebSocket protocol-level ping/pong:

| Interval   | Implementation                                 |
| ---------- | ---------------------------------------------- |
| 15 seconds | Server sends WebSocket PING                    |
| Response   | Client must respond with PONG within 10s       |
| No PONG    | Server terminates connection (close code 1006) |

---

## 8. CRASH RECOVERY FLOW

### 8.1 Recovery Sequence

```
Machine Crashes / Reboots / Power Loss
       │
       ▼
Windows Boots (GPO auto-login)
       │
       ▼
WPF Client Auto-Starts
       │
       ▼
┌──────────────────────────────────┐
│  1. APP INIT (App.xaml.cs)        │
│  - Detect VM                      │
│  - Generate hardware hash         │
│  - Open encrypted SQLite          │
│  - Check local_exam_state table   │
│    for active attempt             │
└──────────┬───────────────────────┘
           │
           │  Active attempt found?
           │
     ┌─────┴─────┐
     │           │
   YES         NO
     │           │
     ▼           ▼
┌──────────┐  ┌──────────┐
│ RECOVERY │  │  NORMAL  │
│  MODE    │  │  LOGIN   │
└────┬─────┘  └──────────┘
     │
     ▼
┌──────────────────────────────────┐
│  2. RECOVERY: SHOW RECOVERY SCREEN│
│  "Exam in progress.              │
│   Please log in to resume."      │
│  (Pre-fill email from last session│
│   stored in local config)        │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  3. RE-LOGIN                      │
│  - POST /api/v1/auth/login        │
│  - Same device ID + hardware hash │
│  - Receive new JWT tokens         │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  4. WS RECONNECT                  │
│  - Connect to /ws with new token  │
│  - Send session:resume event      │
│    { attemptId: from local state }│
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  5. SERVER VALIDATES              │
│  - Check attempt exists           │
│  - Check attempt status =         │
│    in_progress                    │
│  - Check exam batch is active     │
│  - Return session:resume data:    │
│    { remainingTimeSecs,           │
│      lastQuestionId,              │
│      serverAnswers (for diff) }   │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  6. SYNC UNSYNCED ANSWERS         │
│  - Read sync_queue from SQLite    │
│  - Batch send all unsynced        │
│    answers via WS                 │
│  - Server UPSERTs each answer     │
│  - Server confirms each           │
│  - Clear sync_queue               │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  7. RESUME EXAM                   │
│  - Navigate to last_question_id   │
│  - Restore timer from server's    │
│    remainingTimeSecs              │
│  - Restore answer states from     │
│    local SQLite                   │
│  - Resume auto-save + heartbeat   │
│  - Show "Exam resumed" toast      │
└──────────────────────────────────┘
```

### 8.2 Recovery Data Sources

| Data               | Source                            | Purpose                                            |
| ------------------ | --------------------------------- | -------------------------------------------------- |
| Attempt ID         | Local SQLite (`local_exam_state`) | Identify which exam to resume                      |
| Last question seen | Local SQLite (`local_exam_state`) | Navigate to correct question                       |
| Remaining time     | Server (authoritative)            | Server recalculates based on started_at + duration |
| Unsynced answers   | Local SQLite (`sync_queue`)       | Sync to server                                     |
| Synced answers     | Server (authoritative)            | Already persisted                                  |
| Answer statuses    | Local SQLite (`local_answers`)    | Restore UI palette (answered/marked/visited)       |

### 8.3 Delta Sync (Recovery)

On reconnect after crash or offline period, the client performs a **delta sync** — only sending answers that the server does not already have:

```
Client reconnects to server
       │
       ▼
┌──────────────────────────────────┐
│  1. REQUEST SERVER ANSWER STATE   │
│  - WS event: sync:delta           │
│  - Send: attemptId                │
│  - Receive: list of question_ids  │
│    the server has + timestamps    │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  2. COMPUTE DELTA                 │
│  - Compare local_answers with     │
│    server's answer list           │
│  - Identify:                      │
│    a) New answers (server missing)│
│    b) Updated answers (local newer)│
│    c) Conflicting (server newer)  │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  3. SEND DELTA                    │
│  - Batch send only new + updated  │
│    answers via WS                 │
│  - For conflicts: server wins     │
│    (server-authoritative)         │
│  - Server confirms each answer    │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  4. RECONCILE LOCAL STATE         │
│  - Update local_answers status    │
│    to "synced" for confirmed      │
│  - Clear sync_queue               │
│  - Update UI palette              │
└──────────────────────────────────┘
```

### 8.4 Offline Recovery Package

The client stores a **recovery package** on disk that enables exam resumption even after a full machine reboot:

| Component        | Location                           | Purpose                                      |
| ---------------- | ---------------------------------- | -------------------------------------------- |
| Encrypted SQLite | `%APPDATA%/cbt-exam/local.db`      | All local answers + exam state               |
| Device config    | `%APPDATA%/cbt-exam/config.json`   | Device ID, last email, server endpoint       |
| Manifest cache   | `%APPDATA%/cbt-exam/manifest.json` | Last verified exam manifest (for validation) |
| Crash logs       | `C:\cbt\crash_logs\`               | WER reports collected by ExamLauncher        |

**Recovery Package Security:**

- SQLite is encrypted with key derived from hardware hash + attempt_id + app_secret
- Config file contains no tokens or credentials (only device ID + email hint)
- Manifest cache is signed (Ed25519); client re-verifies on load
- Without the correct hardware hash, the SQLite database is unreadable

---

## 9. RECONNECT STRATEGY

### 9.1 Reconnect Algorithm

```
WebSocket Disconnects
       │
       ▼
┌──────────────────────────────┐
│  Switch to OFFLINE mode      │
│  - Show offline banner       │
│  - Continue exam locally     │
│  - Queue answers to          │
│    sync_queue                │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  Attempt Reconnect           │
│  - Exponential backoff:      │
│    Attempt 1: 1s delay       │
│    Attempt 2: 2s delay       │
│    Attempt 3: 4s delay       │
│    Attempt 4: 8s delay       │
│    Attempt 5: 16s delay      │
│    Attempt 6+: 30s (max)     │
│  - Jitter: ±20% of delay     │
│  - Max attempts: unlimited   │
│    (exam must continue)      │
└──────────┬───────────────────┘
           │
     ┌─────┴─────┐
     │           │
  CONNECTED   STILL OFFLINE
     │           │
     ▼           ▼
┌──────────┐  ┌──────────────────┐
│  SYNC    │  │  Continue offline │
│  PHASE   │  │  - Keep queuing   │
└────┬─────┘  │  - Keep retrying  │
     │        └──────────────────┘
     ▼
┌──────────────────────────────┐
│  1. Re-authenticate          │
│     (if token expired)       │
│  2. Reconnect WebSocket      │
│  3. Send session:resume      │
│  4. Batch sync sync_queue    │
│  5. Clear sync_queue         │
│  6. Switch to ONLINE mode    │
│  7. Resume heartbeat         │
└──────────────────────────────┘
```

### 9.2 Token Expiry During Offline

| Scenario                           | Action                                                       |
| ---------------------------------- | ------------------------------------------------------------ |
| Access token expires while offline | Continue offline; queue answers                              |
| On reconnect, token expired        | Use refresh token to get new access token; then reconnect WS |
| Refresh token also expired         | Force re-login; show login screen; resume after login        |

---

## 10. LOCKDOWN ENFORCEMENT

### 10.1 Lockdown Measures

| Measure              | Implementation (WPF/Win32)                              | Bypass Prevention                  |
| -------------------- | ------------------------------------------------------- | ---------------------------------- |
| Full-screen kiosk    | `WindowState=Maximized; WindowStyle=None; Topmost=true` | GPO disables Task Manager          |
| Always on top        | `Topmost=true` + `SetWindowPos(HWND_TOPMOST)`           | Cannot be covered by other windows |
| No window frame      | `WindowStyle=WindowStyle.None`                          | No close/minimize/maximize buttons |
| Disable Alt+F4       | `WH_KEYBOARD_LL` hook intercepts Alt+F4                 | Intercept before OS handles        |
| Disable Alt+Tab      | `WH_KEYBOARD_LL` hook intercepts Alt+Tab (best effort)  | GPO also enforces                  |
| Disable Ctrl+Alt+Del | GPO (out of scope)                                      | OS-level enforcement               |
| Disable Print Screen | `WH_KEYBOARD_LL` hook; clear clipboard on intercept     | Intercept and clear                |
| Disable right-click  | WPF `PreviewMouseRightButtonDown` handler               | UI-level interception              |
| Disable clipboard    | `AddClipboardFormatListener`; clear on change           | Win32 clipboard monitoring         |
| Disable DevTools     | N/A — no browser engine in WPF                          | No DevTools to disable             |
| Block URL navigation | N/A — no browser navigation in WPF                      | Only API calls to exam server      |
| Disable new windows  | Single-window WPF app; no popup capability              | No popups                          |
| VM detection         | WMI checks on startup (VMDetector.cs)                   | Refuse to start                    |
| Process monitoring   | `Process.GetProcesses()` enumeration; log unauthorized  | Report to server                   |
| Single monitor check | `SystemParameters.MonitorCount` / `Screen.AllScreens`   | Prevent secondary display use      |

### 10.2 Keyboard Hook (WH_KEYBOARD_LL)

```csharp
using System.Diagnostics;
using System.Runtime.InteropServices;

public class KeyboardHook : IDisposable
{
    private const int WH_KEYBOARD_LL = 13;
    private const int WM_KEYDOWN = 0x0100;
    private const int WM_SYSKEYDOWN = 0x0104;

    private IntPtr _hookId = IntPtr.Zero;
    private LowLevelKeyboardProc _proc;

    // Blocked key combinations
    private static readonly (Keys key, bool alt)[] BlockedKeys =
    {
        (Keys.F4, true),           // Alt+F4
        (Keys.Tab, true),          // Alt+Tab (best effort)
        (Keys.PrintScreen, false), // PrintScreen
        (Keys.C, true),            // Alt+C (optional clipboard)
    };

    public void Install()
    {
        _proc = HookCallback;
        using var curProcess = Process.GetCurrentProcess();
        using var curModule = curProcess.MainModule!;
        _hookId = SetWindowsHookEx(WH_KEYBOARD_LL, _proc,
            GetModuleHandle(curModule.ModuleName), 0);
    }

    private IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0 && (wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN))
        {
            var vkCode = Marshal.ReadInt32(lParam);
            var key = (Keys)vkCode;
            var alt = (Control.ModifierKeys & Keys.Alt) != 0;

            foreach (var (blockedKey, requireAlt) in BlockedKeys)
            {
                if (key == blockedKey && alt == requireAlt)
                {
                    LogViolation($"blocked_key_{key}_alt_{alt}");
                    if (key == Keys.PrintScreen)
                        Clipboard.Clear();
                    return 1; // Suppress the key
                }
            }
        }
        return CallNextHookEx(_hookId, nCode, wParam, lParam);
    }

    private static void LogViolation(string type) =>
        Serilog.Log.Warning("Lockdown violation: {Type}", type);

    // P/Invoke declarations omitted for brevity
    [DllImport("user32.dll")] private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);
    [DllImport("user32.dll")] private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll")] private static extern IntPtr GetModuleHandle(string lpModuleName);

    private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

    public void Dispose()
    {
        if (_hookId != IntPtr.Zero)
            UnhookWindowsHookEx(_hookId);
    }

    [DllImport("user32.dll")] private static extern bool UnhookWindowsHookEx(IntPtr hhk);
}
```

### 10.3 Window Blur Detection

```csharp
// In the main Window class
protected override void OnDeactivated(EventArgs e)
{
    base.OnDeactivated(e);
    Log.Warning("Window deactivated (blur detected)");
    // Immediately bring window back to focus
    Activate();
    Topmost = true;
    // Re-enforce kiosk mode
    WindowState = WindowState.Maximized;
}

// Also handle the Win32 WM_ACTIVATE message for more reliable detection
protected override void OnSourceInitialized(EventArgs e)
{
    base.OnSourceInitialized(e);
    var hwnd = new WindowInteropHelper(this).Handle;
    var src = HwndSource.FromHwnd(hwnd);
    src?.AddHook(WndProc);
}

private static IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
{
    const int WM_ACTIVATE = 0x0006;
    if (msg == WM_ACTIVATE && wParam.ToInt64() == 0) // WA_INACTIVE
    {
        Log.Warning("Window lost focus via WM_ACTIVATE");
        // Force focus back
        SetForegroundWindow(hwnd);
    }
    return IntPtr.Zero;
}

[DllImport("user32.dll")]
private static extern bool SetForegroundWindow(IntPtr hWnd);
```

---

## 11. LOCAL STORAGE ENCRYPTION

### 11.1 SQLite Encryption (Microsoft.Data.Sqlite + SQLCipher)

| Aspect         | Implementation                                             |
| -------------- | ---------------------------------------------------------- |
| Encryption     | AES-256 (SQLCipher via SQLitePCLRaw.bundle_e_sqlcipher)    |
| Key derivation | PBKDF2-HMAC-SHA512 (SQLCipher default; 256,000 iterations) |
| Key source     | `SHA256(hardware_hash + attempt_id + app_secret)`          |
| Key storage    | In-memory only; never written to disk                      |
| Key lifetime   | Generated on exam start; destroyed on exam submit/close    |
| Database file  | `%APPDATA%/cbt-exam/local.db` (encrypted)                  |
| Without key    | Database is unreadable (even with file access)             |

### 11.2 Key Generation Flow

```
Exam Start
    │
    ▼
┌────────────────────────────┐
│  1. Get hardware_hash      │
│     (from main process)    │
└──────────┬─────────────────┘
           │
           ▼
┌────────────────────────────┐
│  2. Get attempt_id         │
│     (from server response) │
└──────────┬─────────────────┘
           │
           ▼
┌────────────────────────────┐
│  3. Get app_secret         │
│     (embedded in app,      │
│      unique per build)     │
└──────────┬─────────────────┘
           │
           ▼
┌────────────────────────────┐
│  4. db_key = SHA256(       │
│       hardware_hash +      │
│       attempt_id +         │
│       app_secret           │
│     )                      │
└──────────┬─────────────────┘
           │
           ▼
┌────────────────────────────┐
│  5. Open SQLite with key   │
│     var conn = new        │
│       SqliteConnection(); │
│     conn.ConnectionString│
│       = $"Data Source=    │
│         local.db;";       │
│     conn.Open();          │
│     using var cmd =       │
│       conn.CreateCommand();│
│     cmd.CommandText =     │
│       $"PRAGMA key =      │
│         '{dbKey}';";      │
│     cmd.ExecuteNonQuery();│
└────────────────────────────┘
```

---

## 12. RENDER PERFORMANCE STRATEGY

### 12.1 Question Rendering

| Question Type    | Rendering Strategy                                      | Performance |
| ---------------- | ------------------------------------------------------- | ----------- |
| MCQ (text)       | WPF RadioButton/CheckBox with data binding              | Instant     |
| MCQ (with image) | Preload image on question load; cache in memory         | < 100ms     |
| LaTeX/Math       | Server-side pre-rendered SVG/PNG; display via Image     | Instant     |
| Audio            | MediaElement with preload                               | Buffered    |
| Video            | MediaElement with preload                               | Buffered    |
| Comprehension    | Passage + questions in single view; lazy load questions | < 200ms     |
| Drag-and-drop    | WPF Drag/Drop or GongSolutions.Wpf.DragDrop             | < 100ms     |
| Matching matrix  | Grid/UniformGrid with drag/click                        | < 100ms     |
| Complex HTML     | WebView2 control (embedded; for specific fragments)     | < 200ms     |

### 12.2 Performance Optimizations

| Optimization             | Implementation                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| Question caching         | All questions loaded at exam start; cached in memory                                                  |
| No network on navigation | Questions are local; no fetch on question switch                                                      |
| Image preloading         | Images for current + adjacent questions preloaded                                                     |
| Timer optimization       | DispatcherTimer for smooth countdown; update via data binding                                         |
| Minimal re-renders       | CommunityToolkit.Mvvm `[ObservableProperty]` + partial notifications; only affected ViewModels update |
| Virtual scrolling        | If > 100 questions in palette, use VirtualizingStackPanel                                             |
| UI virtualization        | WPF virtualizes large lists natively; no manual optimization needed                                   |
| Debounced text input     | 500ms debounce for essay/fill-in answers                                                              |

### 12.3 Memory Management

| Item            | Size                    | Management                            |
| --------------- | ----------------------- | ------------------------------------- |
| Questions (all) | ~5-20MB (500 questions) | Loaded once, kept in memory           |
| Images (cached) | ~50-200MB               | LRU cache; max 50 images in memory    |
| Audio/Video     | Streamed on demand      | Not cached in memory                  |
| Local SQLite    | ~1-5MB                  | Disk-based; minimal memory            |
| WPF UI elements | ~10-15MB                | Normal WPF memory; virtualized lists  |
| Total target    | < 100MB                 | Acceptable for dedicated exam machine |

---

## 13. ACCESSIBILITY

### 13.1 Accessibility Features

| Feature              | Implementation                                                           |
| -------------------- | ------------------------------------------------------------------------ |
| High-contrast mode   | ResourceDictionary theme toggle; WPF HighContrast theme support          |
| Font size adjustment | 3 levels (small/medium/large); DynamicResource font scaling              |
| Screen reader        | AutomationProperties.Name on all interactive elements; UI Automation     |
| Extra time           | Server-side; `remaining_time_secs` adjusted per candidate                |
| Multi-language       | .resx resource files; CultureInfo switching; Unicode support             |
| Keyboard navigation  | Tab/Enter/Space for all interactions; arrow keys for question navigation |

---

## 14. DOCUMENT METADATA

| Field                | Value                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Document Version** | 3.0 (Architecture Frozen — Client Stack Changed)                                                                                         |
| **Date Created**     | 2026-07-16                                                                                                                               |
| **Status**           | FROZEN — Architecture v2.0 (Client: C# WPF)                                                                                              |
| **Author**           | AI Agent (Architect Mode)                                                                                                                |
| **Prerequisites**    | PRD v3.0 (Frozen), TDR v3.0 (Frozen), SAD v3.0 (Frozen), SECURITY_ARCHITECTURE v2.0                                                      |
| **Freeze Rule**      | Changes require: business requirement change, security issue, prototype failure, or performance test failure. No changes for preference. |
