using CBT.Shared.Models;

namespace CBT.ExamClient.Services;

/// <summary>
/// Delta synchronization service for crash recovery and reconnection.
/// As specified in CLIENT_ARCHITECTURE.md Section 8.3.
/// 
/// On reconnect after crash or offline period, the client performs a delta sync:
/// 1. Request server answer state (sync:delta event)
/// 2. Compare local answers with server's list
/// 3. Send only new/updated answers (server missing or local newer)
/// 4. For conflicts: server wins (server-authoritative)
/// 5. Reconcile local state
/// </summary>
public interface IDeltaSyncService
{
    /// <summary>
    /// Performs a complete delta sync after reconnection.
    /// Sends only answers the server doesn't have or where local is newer.
    /// </summary>
    /// <param name="attemptId">The active attempt ID</param>
    Task PerformDeltaSyncAsync(string attemptId);

    /// <summary>
    /// Performs crash recovery: re-login, reconnect WS, restore exam state.
    /// Full flow as specified in CLIENT_ARCHITECTURE.md Section 8.1.
    /// </summary>
    /// <param name="attemptId">The attempt ID from local state</param>
    Task<CrashRecoveryResult> PerformCrashRecoveryAsync(string attemptId);

    /// <summary>
    /// Flushes the sync queue by sending all pending items to the server.
    /// Used on reconnect and before exam submission.
    /// </summary>
    Task FlushSyncQueueAsync();

    /// <summary>
    /// Whether a sync operation is currently in progress.
    /// </summary>
    bool IsSyncing { get; }
}

/// <summary>
/// Result of crash recovery attempt.
/// </summary>
public sealed class CrashRecoveryResult
{
    public bool Success { get; set; }
    public int RemainingTimeSeconds { get; set; }
    public string? LastQuestionId { get; set; }
    public string? Error { get; set; }
    public int SyncedAnswerCount { get; set; }
}
