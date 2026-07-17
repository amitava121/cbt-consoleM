# CBE Console — Windows Client

.NET 8 WPF secure exam client plus a native AOT `ExamLauncher` watchdog process.

## Projects

- **CBEConsoleClient** — WPF .NET 8 app (full-screen kiosk, MVVM, CommunityToolkit.Mvvm)
- **ExamLauncher** — Native AOT console watchdog that launches and monitors the client

## Build

Requires Windows + .NET 8 SDK + WPF workload.

```powershell
dotnet build windows-client\CBEConsole.sln
```

Publish AOT watchdog:

```powershell
dotnet publish windows-client\ExamLauncher\ExamLauncher.csproj -c Release -r win-x64
```

## Architecture notes

- Single WPF process; no browser shell or IPC.
- Lockdown logic (key blocking, VM detection, URL filter) will be implemented in Win32 calls inside `MainWindow`/`Services`.
- Local SQLite/SQLCipher storage for offline resilience.
- Certificate pinning configured for LAN backend communication.
