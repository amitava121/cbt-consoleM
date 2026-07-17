# DEVELOPMENT STANDARDS DOCUMENT

# Competitive CBT Platform

---

## 1. DOCUMENT PURPOSE

This document defines the coding standards, Git workflow, CI/CD pipeline, code review process, and development conventions for the CBT Platform. All contributors must follow these standards.

---

## 2. CODING STANDARDS

### 2.1 TypeScript Standards

| Rule                           | Standard                              | Enforcement                                                |
| ------------------------------ | ------------------------------------- | ---------------------------------------------------------- |
| Strict mode                    | `strict: true` in tsconfig            | tsc compiler                                               |
| No `any`                       | Use `unknown` or proper types         | ESLint `@typescript-eslint/no-explicit-any`                |
| No `// @ts-ignore`             | Fix the type error                    | ESLint `@typescript-eslint/ban-ts-comment`                 |
| Explicit return types          | On all exported functions             | ESLint `@typescript-eslint/explicit-module-boundary-types` |
| No unused variables            | Remove or prefix with `_`             | ESLint `@typescript-eslint/no-unused-vars`                 |
| Prefer `interface` over `type` | For object shapes                     | Code review                                                |
| Use `enum` for fixed values    | Only for union types with < 10 values | Code review                                                |
| Prefer `as const` over enum    | For large unions                      | Code review                                                |
| No `var`                       | Use `const` or `let`                  | ESLint `no-var`                                            |
| Prefer arrow functions         | For callbacks and closures            | Code review                                                |
| Destructuring                  | Use object/array destructuring        | Code review                                                |

### 2.2 File Naming

| Type       | Convention                    | Example               |
| ---------- | ----------------------------- | --------------------- |
| Components | `PascalCase.tsx`              | `QuestionPalette.tsx` |
| Hooks      | `camelCase.ts` (prefix `use`) | `useExamTimer.ts`     |
| Services   | `camelCase.ts`                | `authService.ts`      |
| Utils      | `camelCase.ts`                | `cryptoUtils.ts`      |
| Types      | `camelCase.ts`                | `examTypes.ts`        |
| Constants  | `camelCase.ts`                | `apiConstants.ts`     |
| Test files | `*.test.ts` or `*.spec.ts`    | `authService.test.ts` |
| Config     | `camelCase.ts` or `.json`     | `tsconfig.json`       |
| CSS        | `kebab-case.css`              | `exam-palette.css`    |

### 2.3 Folder Structure (per app)

```
src/
├── routes/          # API route handlers (server)
├── pages/           # Page components (admin dashboard)
├── components/      # Reusable React components (admin dashboard)
├── hooks/           # Custom React hooks (admin dashboard)
├── services/        # Business logic / API clients
├── stores/          # State management (Zustand — admin dashboard)
├── middleware/      # Express/Fastify middleware
├── plugins/         # Fastify plugins
├── workers/         # Background workers
├── lib/             # App-specific utilities
├── types/           # TypeScript type definitions
├── constants/       # Constants and config
└── index.ts         # Entry point
```

### 2.3a C# WPF Client Structure (windows-client/)

```
windows-client/
├── ExamClient/              # WPF .NET 8 exam client
│   ├── App.xaml             # Application resources, styles
│   ├── App.xaml.cs          # Startup, DI, single-instance
│   ├── MainWindow.xaml      # Kiosk-mode main window
│   ├── MainWindow.xaml.cs   # Window events, lockdown hooks
│   ├── Views/               # XAML views (LoginView, ExamView, etc.)
│   ├── ViewModels/          # MVVM ViewModels (CommunityToolkit.Mvvm)
│   ├── Services/            # ApiService, WebSocketService, LocalDbService
│   ├── Models/              # Data models / DTOs
│   ├── Lockdown/            # Win32 P/Invoke, keyboard hook, window mgmt
│   ├── Crypto/              # Ed25519 verification, SQLCipher key derivation
│   ├── Resources/           # exam-public.pem, XAML ResourceDictionaries
│   └── ExamClient.csproj    # Project file (.NET 8)
├── ExamLauncher/            # C# .NET 8 Native AOT watchdog
│   ├── Program.cs           # Main entry point
│   └── ExamLauncher.csproj  # AOT project file
└── Shared/                  # Shared class library
    ├── Models/              # Shared DTOs, enums
    ├── Crypto/              # Shared crypto utilities
    ├── Logger/              # Serilog shared config
    └── Shared.csproj        # Class library project
```

### 2.4 Import Order

```typescript
// 1. Node.js built-ins
import { randomUUID } from "crypto";

// 2. External packages
import { FastifyInstance } from "fastify";
import { z } from "zod";

// 3. Internal packages (from shared)
import { Question, AttemptStatus } from "@cbt/shared";

// 4. App modules (absolute paths)
import { authService } from "@/services/authService";
import { validateToken } from "@/middleware/auth";

// 5. Relative imports
import { QuestionCard } from "./QuestionCard";
import { useExamTimer } from "./useExamTimer";

// 6. Types
import type { Exam } from "@/types/exam";
```

### 2.5 Error Handling

```typescript
// Service layer: throw typed errors
class ExamNotFoundError extends Error {
  constructor(public examId: string) {
    super(`Exam not found: ${examId}`);
    this.name = "ExamNotFoundError";
  }
}

// Route layer: catch and format
fastify.get("/api/v1/exams/:id", async (request, reply) => {
  try {
    const exam = await examService.getById(request.params.id);
    return reply.send({ success: true, data: exam });
  } catch (error) {
    if (error instanceof ExamNotFoundError) {
      return reply.code(404).send({
        success: false,
        error: { code: "NOT_FOUND", message: error.message },
      });
    }
    request.log.error(error);
    return reply.code(500).send({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
  }
});
```

### 2.6 Logging Standards

| Level   | Usage                       | Example                                                         |
| ------- | --------------------------- | --------------------------------------------------------------- |
| `error` | Unhandled errors, crashes   | `log.error({ err, userId }, 'Failed to save answer')`           |
| `warn`  | Expected but notable issues | `log.warn({ attemptId, drift }, 'Client clock drift detected')` |
| `info`  | Significant events          | `log.info({ userId, role }, 'User logged in')`                  |
| `debug` | Development diagnostics     | `log.debug({ query, params }, 'Executing query')`               |
| `trace` | Very detailed diagnostics   | `log.trace({ wsEvent }, 'WebSocket event received')`            |

**Rules:**

- Never log passwords, tokens, or secrets (Pino redaction)
- Always include context object (not string interpolation)
- Use child loggers for request-scoped context

```typescript
// Good
log.info({ userId: user.id, action: "login" }, "User logged in");

// Bad
log.info(`User ${user.id} logged in`);
```

### 2.7 React Component Standards (Admin Dashboard)

| Rule                     | Standard                                                                          |
| ------------------------ | --------------------------------------------------------------------------------- |
| Function components only | No class components                                                               |
| Props interface          | Define above component                                                            |
| Default export           | Only for page components                                                          |
| Named export             | For reusable components                                                           |
| Props destructuring      | Always destructure in function params                                             |
| Conditional rendering    | Use `&&` or ternary, not `if` in JSX                                              |
| List keys                | Use stable IDs, not array index                                                   |
| Side effects             | Only in `useEffect`, never in render                                              |
| State updates            | Use functional updates: `setState(prev => ...)`                                   |
| React Compiler           | Enabled in vite.config.ts — no manual `useMemo`/`useCallback`/`React.memo` needed |
| Admin state              | Zustand v5 stores in `stores/` directory; use selectors for precise re-renders    |
| Server state             | TanStack Query v5 for all API calls; `useQuery`/`useMutation` hooks               |
| UI components            | shadcn/ui components in `components/ui/`; copy-paste pattern, not npm import      |

### 2.8 C# WPF Client Standards

| Rule                   | Standard                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------- |
| MVVM pattern           | CommunityToolkit.Mvvm — `[ObservableProperty]`, `[RelayCommand]` source generators |
| View/ViewModel pairing | `LoginView.xaml` ↔ `LoginViewModel.cs` in corresponding folders                    |
| Dependency injection   | `Microsoft.Extensions.DependencyInjection` in `App.xaml.cs`                        |
| File naming            | `PascalCase.xaml` for views, `PascalCase.cs` for code-behind and ViewModels        |
| XAML styling           | Use `ResourceDictionary` for themes; no inline styles except one-off cases         |
| Data binding           | `x:Bind` or `{Binding}` with `INotifyPropertyChanged` (via `[ObservableProperty]`) |
| Async operations       | Use `async/await`; never block UI thread; use `Dispatcher.Invoke` if needed        |
| No IPC                 | Single-process; ViewModels call Services directly; no inter-process communication  |
| Lockdown code          | All Win32 P/Invoke in `Lockdown/` folder; documented with MSDN references          |
| Local DB access        | `Microsoft.Data.Sqlite` with `using` statements; synchronous API; WAL mode         |
| Logging                | Serilog structured logging; shared config from `Shared/Logger/`                    |
| Error handling         | Global `DispatcherUnhandledException` handler; log + show error + restart          |
| Test naming            | `*Tests.cs` in `ExamClient.Tests/` project; xUnit + FluentAssertions               |

```csharp
// Standard ViewModel pattern
public partial class ExamViewModel : ObservableObject
{
    private readonly IApiService _apiService;
    private readonly IWebSocketService _webSocketService;
    private readonly ILocalDbService _localDb;

    [ObservableProperty]
    private Question? _currentQuestion;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(SaveAnswerCommand))]
    private string? _selectedOptionId;

    public ExamViewModel(
        IApiService apiService,
        IWebSocketService webSocketService,
        ILocalDbService localDb)
    {
        _apiService = apiService;
        _webSocketService = webSocketService;
        _localDb = localDb;
    }

    [RelayCommand(CanExecute = nameof(CanSaveAnswer))]
    private async Task SaveAnswerAsync()
    {
        await _localDb.SaveAnswerAsync(CurrentQuestion!.Id, SelectedOptionId!);
        await _webSocketService.SendAnswerSaveAsync(CurrentQuestion.Id, SelectedOptionId!);
    }

    private bool CanSaveAnswer() =>
        CurrentQuestion is not null && SelectedOptionId is not null;
}
```

---

## 3. GIT STRATEGY

### 3.1 Branch Strategy

```
main (protected)
  │
  ├── develop (integration branch)
  │     │
  │     ├── feature/module-1-auth
  │     ├── feature/module-2-question-bank
  │     ├── fix/answer-save-race-condition
  │     └── refactor/exam-state-machine
  │
  └── release/v1.0.0
```

### 3.2 Branch Naming

| Type     | Pattern                      | Example                          |
| -------- | ---------------------------- | -------------------------------- |
| Feature  | `feature/<module>-<feature>` | `feature/module-1-auth-service`  |
| Bug fix  | `fix/<description>`          | `fix/answer-save-race-condition` |
| Refactor | `refactor/<description>`     | `refactor/exam-state-machine`    |
| Hotfix   | `hotfix/<description>`       | `hotfix/timer-drift`             |
| Release  | `release/v<version>`         | `release/v1.0.0`                 |
| Docs     | `docs/<description>`         | `docs/update-api-specification`  |

### 3.3 Commit Convention (Conventional Commits)

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

| Type       | Description                           |
| ---------- | ------------------------------------- |
| `feat`     | New feature                           |
| `fix`      | Bug fix                               |
| `refactor` | Code refactoring (no behavior change) |
| `perf`     | Performance improvement               |
| `test`     | Adding or fixing tests                |
| `docs`     | Documentation changes                 |
| `style`    | Code style changes (formatting, etc.) |
| `chore`    | Build, dependencies, tooling          |
| `ci`       | CI/CD changes                         |

**Examples:**

```
feat(auth): implement JWT device binding
fix(exam): resolve timer drift on reconnect
refactor(answers): simplify UPSERT logic
test(questions): add integration tests for import
docs(api): update WebSocket event specification
```

### 3.4 Pull Request Process

| Step | Action                                                    |
| ---- | --------------------------------------------------------- |
| 1    | Create branch from `develop`                              |
| 2    | Write code + tests                                        |
| 3    | Run `pnpm lint && pnpm test` locally                      |
| 4    | Push branch and create PR to `develop`                    |
| 5    | Fill PR template (description, testing, breaking changes) |
| 6    | Request review from at least 1 reviewer                   |
| 7    | Address review comments                                   |
| 8    | Once approved, squash and merge                           |
| 9    | Delete branch after merge                                 |

### 3.5 PR Template

```markdown
## Description

[What does this PR do? Why?]

## Type of Change

- [ ] Feature (new functionality)
- [ ] Bug fix (non-breaking)
- [ ] Refactor (non-breaking)
- [ ] Breaking change
- [ ] Documentation
- [ ] Test

## Testing

- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing done
- [ ] Coverage maintained/improved

## Breaking Changes

[If applicable, describe migration steps]

## Checklist

- [ ] Code follows coding standards
- [ ] Self-review done
- [ ] Comments added for complex logic
- [ ] No new warnings introduced
- [ ] Secrets not committed
```

### 3.6 Code Review Standards

| Aspect          | Requirement                                        |
| --------------- | -------------------------------------------------- |
| Reviewer count  | Minimum 1 reviewer (2 for critical modules)        |
| Review SLA      | 24 hours for non-critical, 4 hours for hotfix      |
| Review focus    | Logic, security, performance, tests, style         |
| Approve         | Only if all checks pass and no unresolved comments |
| Request changes | For bugs, security issues, or standard violations  |
| Comment         | For suggestions and questions (non-blocking)       |
| Self-review     | Required before requesting review                  |

---

## 4. CI/CD PIPELINE

### 4.1 GitHub Actions Workflows

#### CI Pipeline (`.github/workflows/ci.yml`)

```yaml
name: CI

on:
  pull_request:
    branches: [develop, main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm format:check

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck

  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:unit -- --coverage
      - run: pnpm test:coverage:check

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: cbt_test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: cbt_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @cbt/server drizzle-kit migrate
        env:
          DATABASE_URL: postgresql://cbt_test:test@localhost:5432/cbt_test
      - run: pnpm test:integration
        env:
          DATABASE_URL: postgresql://cbt_test:test@localhost:5432/cbt_test

  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm audit --audit-level=high
      - uses: snyk/actions/node@master
        with:
          command: test
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
```

#### E2E Pipeline (`.github/workflows/e2e.yml`)

```yaml
name: E2E Tests

on:
  push:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: cbt_e2e
          POSTGRES_PASSWORD: test
          POSTGRES_DB: cbt_e2e
        ports:
          - 5432:5432
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @cbt/server drizzle-kit migrate
        env:
          DATABASE_URL: postgresql://cbt_e2e:test@localhost:5432/cbt_e2e
      - run: ppm --filter @cbt/server seed
        env:
          DATABASE_URL: postgresql://cbt_e2e:test@localhost:5432/cbt_e2e
      - run: pnpm --filter @cbt/server start &
        env:
          DATABASE_URL: postgresql://cbt_e2e:test@localhost:5432/cbt_e2e
          JWT_SECRET: test-secret
          NODE_ENV: test
      - run: pnpm test:e2e
```

### 4.2 Package Scripts

```json
{
  "scripts": {
    "dev": "pnpm --parallel --filter '*' dev",
    "build": "pnpm --filter '*' build",
    "lint": "eslint . --ext .ts,.tsx",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit",
    "test:unit": "vitest run",
    "test:unit:watch": "vitest",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:e2e": "playwright test",
    "test:coverage:check": "c8 check-coverage --lines 80 --functions 80 --branches 75",
    "db:migrate": "pnpm --filter @cbt/server drizzle-kit generate",
    "db:push": "pnpm --filter @cbt/server drizzle-kit push",
    "db:deploy": "pnpm --filter @cbt/server drizzle-kit migrate",
    "db:seed": "pnpm --filter @cbt/server tsx src/seed.ts",
    "db:studio": "pnpm --filter @cbt/server drizzle-kit studio"
  }
}
```

---

## 5. DEPENDENCY MANAGEMENT

### 5.1 Package Manager

| Tool      | Version                    |
| --------- | -------------------------- |
| pnpm      | 9.x                        |
| Node.js   | 22.x LTS                   |
| Workspace | pnpm workspaces (monorepo) |

### 5.2 Dependency Rules

| Rule                       | Enforcement                                             |
| -------------------------- | ------------------------------------------------------- |
| Lock file committed        | `pnpm-lock.yaml` always committed                       |
| No `latest`                | Pin all dependencies to exact versions                  |
| Security audit             | `pnpm audit` in CI; fail on `high` or `critical`        |
| Snyk scan                  | Run on every PR and weekly schedule                     |
| Update policy              | Monthly dependency review; update patch versions weekly |
| No new deps without review | All new dependencies require security review            |
| Bundle size                | Monitor bundle size; alert if > 10% increase            |

### 5.3 Shared Package Dependencies

```
@cbt/shared (shared types, schemas, utils)
  ├── Used by: @cbt/server, @cbt/admin, @cbt/client
  └── No external runtime deps (types only)
```

---

## 6. ENVIRONMENT MANAGEMENT

### 6.1 Environment Variables

| Environment | File                                    | Committed         |
| ----------- | --------------------------------------- | ----------------- |
| Development | `.env`                                  | No (`.gitignore`) |
| Template    | `.env.example`                          | Yes               |
| CI          | GitHub Actions secrets                  | N/A               |
| Production  | PM2 ecosystem config / Windows env vars | No                |

### 6.2 Required Environment Variables

See `SECURITY_ARCHITECTURE.md` Section 9.3 for the complete list.

---

## 7. DATABASE MIGRATION STANDARDS

### 7.1 Migration Rules

| Rule                                    | Enforcement                                         |
| --------------------------------------- | --------------------------------------------------- |
| Never edit existing migrations          | Always create new migration                         |
| Test on shadow DB                       | `drizzle-kit push` to a throwaway DB for validation |
| Review SQL                              | Generated SQL must be reviewed in PR                |
| No data migrations in schema migrations | Separate migration for data changes                 |
| Destructive changes                     | Require explicit approval (DROP, TRUNCATE)          |
| Backward compatible                     | Migrations must not break running server            |
| Migration naming                        | `drizzle-kit generate --name <descriptive_name>`    |

### 7.2 Migration Workflow

```
1. Modify drizzle/schema.ts
2. Run: pnpm db:migrate --name <description>
3. Review generated SQL
4. Test locally
5. Commit schema.ts + migration files
6. PR review includes migration review
7. On merge: CI runs `drizzle-kit migrate` against test DB
8. On release: `drizzle-kit migrate` against production
```

---

## 8. RELEASE PROCESS

### 8.1 Versioning

| Type                | Format                      | Example         |
| ------------------- | --------------------------- | --------------- |
| Semantic versioning | `MAJOR.MINOR.PATCH`         | `1.2.3`         |
| Pre-release         | `MAJOR.MINOR.PATCH-alpha.N` | `1.0.0-alpha.1` |
| Release candidate   | `MAJOR.MINOR.PATCH-rc.N`    | `1.0.0-rc.1`    |

### 8.2 Release Steps

| Step | Action                                                |
| ---- | ----------------------------------------------------- |
| 1    | Create `release/vX.Y.Z` branch from `develop`         |
| 2    | Run full test suite (unit + integration + E2E + load) |
| 3    | Update version in `package.json` files                |
| 4    | Update `CHANGELOG.md`                                 |
| 5    | Create PR to `main`                                   |
| 6    | Review and merge to `main`                            |
| 7    | Tag release: `git tag vX.Y.Z`                         |
| 8    | Build production artifacts (server, admin, client)    |
| 9    | Deploy to production                                  |
| 10   | Merge `main` back to `develop`                        |

### 8.3 Changelog Format

```markdown
# Changelog

## [1.0.0] - 2026-07-20

### Added

- JWT-based authentication with device binding
- Question bank management with 12 question types
- Exam creation wizard with sections and marking schemes
- Real-time WebSocket exam session management
- Auto-save with offline resilience
- Live monitoring dashboard for proctors
- Auto-grading engine for objective questions

### Fixed

- Timer drift correction on reconnect
- Race condition in answer UPSERT

### Changed

- Migrated from Express to Fastify for performance
- Switched from Socket.io to ws for lower overhead

### Security

- Added certificate pinning on WPF client
- Implemented nonce-based replay protection
- Added audit log hash chain for tamper detection
```

---

## 9. PRE-COMMIT HOOKS

### 9.1 Husky + lint-staged

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,yml,yaml}": ["prettier --write"]
  }
}
```

### 9.2 Pre-Push Hook

```bash
#!/bin/sh
# .husky/pre-push

pnpm typecheck && pnpm test:unit
```

---

## 10. DOCUMENTATION STANDARDS

### 10.1 Code Documentation

| Element          | Requirement                                    |
| ---------------- | ---------------------------------------------- |
| Public functions | JSDoc with `@param`, `@returns`, `@throws`     |
| Complex logic    | Inline comment explaining "why", not "what"    |
| TODOs            | `// TODO: [description]` with issue reference  |
| FIXMEs           | `// FIXME: [description]` with issue reference |
| File headers     | Not required (file name is sufficient)         |

### 10.2 JSDoc Example

```typescript
/**
 * Grades a single answer for an objective question.
 *
 * @param params - Grading parameters
 * @param params.questionType - Type of question (mcq_single, mcq_multiple, etc.)
 * @param params.correctOptionIds - IDs of correct options
 * @param params.selectedOptionIds - IDs selected by candidate
 * @param params.marks - Positive marks for correct answer
 * @param params.negativeMarks - Negative marks for wrong answer
 * @returns Grading result with score, isCorrect, and isPartial
 * @throws {Error} If question type is not supported
 */
function gradeAnswer(params: GradeParams): GradeResult {
  // ...
}
```

---

## 11. PERFORMANCE STANDARDS

### 11.1 API Response Times

| Endpoint Type                  | Target p95 | Max    |
| ------------------------------ | ---------- | ------ |
| Auth (login)                   | 200ms      | 500ms  |
| Admin CRUD (read)              | 100ms      | 300ms  |
| Admin CRUD (write)             | 200ms      | 500ms  |
| Candidate (start exam)         | 500ms      | 1000ms |
| Candidate (save answer via WS) | 50ms       | 200ms  |
| Monitoring snapshot            | 200ms      | 500ms  |

### 11.2 Bundle Size Limits

| App             | Max Size (gzipped)             |
| --------------- | ------------------------------ |
| Admin Dashboard | < 500KB                        |
| Client Binary   | < 50MB (self-contained .NET 8) |
| Server          | N/A (not bundled for browser)  |

### 11.3 Database Query Limits

| Query Type               | Max Execution Time |
| ------------------------ | ------------------ |
| Single row lookup        | < 10ms             |
| List query (paginated)   | < 50ms             |
| Aggregate query          | < 100ms            |
| Complex join (analytics) | < 500ms            |

---

## 12. DOCUMENT METADATA

| Field                | Value                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Document Version** | 3.0 (Architecture Frozen — Client Stack Changed)                                                                                         |
| **Date Created**     | 2026-07-16                                                                                                                               |
| **Status**           | FROZEN — Architecture v2.0 (Client: C# WPF)                                                                                              |
| **Author**           | AI Agent (Architect Mode)                                                                                                                |
| **Prerequisites**    | PRD v3.0 (Frozen), TDR v3.0 (Frozen), SAD v3.0 (Frozen)                                                                                  |
| **Freeze Rule**      | Changes require: business requirement change, security issue, prototype failure, or performance test failure. No changes for preference. |
