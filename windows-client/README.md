# CBT Platform — Windows Exam Client

> **⚠️ DEPRECATED — This module is no longer actively maintained.**
> The platform is switching to **Safe Exam Browser (SEB)** for exam delivery.
> Files are kept for reference. CI builds are disabled (`if: false` in workflow).
> To re-enable, remove the `if: false` line in `.github/workflows/windows-client-tests.yml`.

.NET 8 WPF secure kiosk exam client with Native AOT `ExamLauncher` watchdog.

## Projects

| Project          | Description                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------ |
| **ExamClient**   | WPF .NET 8 kiosk application (MVVM, CommunityToolkit.Mvvm, SQLCipher offline cache)        |
| **ExamLauncher** | Native AOT watchdog — starts, monitors, and restarts ExamClient on crash                   |
| **Shared**       | Class library shared between ExamClient and ExamLauncher (models, crypto, logging, config) |

## Build

Requires Windows + .NET 8 SDK with WPF workload.

```powershell
dotnet build windows-client\WindowsClient.sln
```

Publish AOT watchdog:

```powershell
dotnet publish windows-client\ExamLauncher\ExamLauncher.csproj -c Release -r win-x64
```

## Architecture

- **Single WPF process** — no browser shell, no IPC
- **Server communication** — REST (HttpClient) + WebSocket (ClientWebSocket) to Node.js/Fastify backend
- **Server database** — PostgreSQL 18 (backend team manages)
- **Client offline cache** — SQLCipher-encrypted SQLite (local answers, exam state, sync queue)
- **Security** — Ed25519 manifest/policy verification, HMAC answer signing, certificate pinning, VM detection, keyboard lockdown
- **Offline resilience** — answers saved locally first, queued for sync, delta sync on reconnect
