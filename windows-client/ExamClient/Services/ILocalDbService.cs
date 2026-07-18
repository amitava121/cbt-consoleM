using CBT.Shared.Models;

namespace CBT.ExamClient.Services;

/// <summary>
/// Local SQLite (SQLCipher encrypted) database service interface.
/// Schema as defined in CLIENT_ARCHITECTURE.md Section 6.2.
/// Encryption as defined in CLIENT_ARCHITECTURE.md Section 11.
/// </summary>
public interface ILocalDbService
{
    /// <summary>
    /// Initializes the encrypted database with the given key.
    /// Key = SHA256(hardware_hash + attempt_id + app_secret)
    /// </summary>
    Task InitializeAsync(string attemptId, string hardwareHash);

    /// <summary>
    /// Closes the database connection and clears the key from memory.
    /// </summary>
    void Close();

    /// <summary>
    /// Checks if there is an active exam state (for crash recovery).
    /// </summary>
    Task<LocalExamState?> GetActiveExamStateAsync();

    /// <summary>
    /// Saves or updates the local exam state.
    /// </summary>
    Task SaveExamStateAsync(LocalExamState state);

    /// <summary>
    /// Saves an answer to the local database (immediate, synchronous-like).
    /// Status will be set to SavedLocal.
    /// </summary>
    Task SaveAnswerAsync(LocalAnswer answer);

    /// <summary>
    /// Updates the sync status of an answer.
    /// </summary>
    Task UpdateAnswerSyncStatusAsync(string questionId, SyncStatus status, string? syncedAt = null);

    /// <summary>
    /// Gets all answers for the current attempt.
    /// </summary>
    Task<List<LocalAnswer>> GetAllAnswersAsync(string attemptId);

    /// <summary>
    /// Gets answers that have not been synced to the server.
    /// </summary>
    Task<List<LocalAnswer>> GetUnsyncedAnswersAsync(string attemptId);

    /// <summary>
    /// Adds an item to the sync queue for offline mode.
    /// </summary>
    Task AddToSyncQueueAsync(SyncQueueItem item);

    /// <summary>
    /// Gets all items in the sync queue.
    /// </summary>
    Task<List<SyncQueueItem>> GetSyncQueueAsync();

    /// <summary>
    /// Removes items from the sync queue after successful sync.
    /// </summary>
    Task ClearSyncQueueAsync();

    /// <summary>
    /// Removes a specific item from the sync queue.
    /// </summary>
    Task RemoveFromSyncQueueAsync(string id);

    /// <summary>
    /// Clears all local data (on exam submit or termination).
    /// </summary>
    Task ClearAllAsync();

    /// <summary>
    /// Performs a database integrity check.
    /// </summary>
    Task<bool> CheckIntegrityAsync();
}

/// <summary>
/// Local exam state persisted in SQLite for crash recovery.
/// Maps to local_exam_state table.
/// </summary>
public sealed class LocalExamState
{
    public string AttemptId { get; set; } = string.Empty;
    public string? CurrentQuestionId { get; set; }
    public string? CurrentSectionId { get; set; }
    public int RemainingTimeSecs { get; set; }
    public string StartedAt { get; set; } = string.Empty;
    public string LastHeartbeatAt { get; set; } = string.Empty;
    public bool IsOnline { get; set; } = true;
}

/// <summary>
/// Local answer stored in SQLite.
/// Maps to local_answers table.
/// </summary>
public sealed class LocalAnswer
{
    public string Id { get; set; } = string.Empty;
    public string AttemptId { get; set; } = string.Empty;
    public string QuestionId { get; set; } = string.Empty;
    public string? AnswerDataJson { get; set; }
    public SyncStatus Status { get; set; }
    public int TimeSpentSecs { get; set; }
    public bool IsMarkedForReview { get; set; }
    public string? Nonce { get; set; }
    public string CreatedAt { get; set; } = string.Empty;
    public string UpdatedAt { get; set; } = string.Empty;
    public string? SyncedAt { get; set; }
}

/// <summary>
/// Sync queue item for offline mode.
/// Maps to sync_queue table.
/// </summary>
public sealed class SyncQueueItem
{
    public string Id { get; set; } = string.Empty;
    public string QuestionId { get; set; } = string.Empty;
    public string AnswerDataJson { get; set; } = string.Empty;
    public string Nonce { get; set; } = string.Empty;
    public string Timestamp { get; set; } = string.Empty;
    public string Signature { get; set; } = string.Empty;
    public int RetryCount { get; set; }
    public string CreatedAt { get; set; } = string.Empty;
}
