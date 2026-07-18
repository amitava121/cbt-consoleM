using System.IO;
using System.Security.Cryptography;
using System.Text;
using CBT.Shared.Configuration;
using CBT.Shared.Models;
using Microsoft.Data.Sqlite;
using Serilog;

namespace CBT.ExamClient.Services;

/// <summary>
/// Local SQLite database service with SQLCipher encryption.
/// Schema as defined in CLIENT_ARCHITECTURE.md Section 6.2.
/// Encryption as defined in CLIENT_ARCHITECTURE.md Section 11.
/// Key derivation: SHA256(hardware_hash + attempt_id + app_secret)
/// </summary>
public sealed class LocalDbService : ILocalDbService, IDisposable
{
    private readonly string _appSecret;
    private SqliteConnection? _connection;
    private string? _dbKey;

    public LocalDbService(CBT.Shared.Configuration.AppSettings settings)
    {
        // App secret should be unique per build — loaded from embedded config
        // For production, this is set during the build pipeline
        _appSecret = Environment.GetEnvironmentVariable("CBT_APP_SECRET")
            ?? "CBT_EXAM_CLIENT_SECRET_DEFAULT_CHANGE_IN_PRODUCTION";
    }

    public async Task InitializeAsync(string attemptId, string hardwareHash)
    {
        // Derive encryption key: SHA256(hardware_hash + attempt_id + app_secret)
        var keyInput = hardwareHash + attemptId + _appSecret;
        var keyBytes = SHA256.HashData(Encoding.UTF8.GetBytes(keyInput));
        _dbKey = Convert.ToHexString(keyBytes).ToLowerInvariant();

        var dbPath = AppSettingsManager.GetDatabasePath();
        Directory.CreateDirectory(Path.GetDirectoryName(dbPath)!);

        // Attempt to open with the derived key
        // If the file exists but was encrypted with a different key (different attempt),
        // delete and recreate — the local DB is a cache, server is authoritative.
        var opened = await TryOpenDatabaseAsync(dbPath);
        if (!opened)
        {
            Log.Warning("Local database invalid or encrypted with different key — recreating");
            Close();
            try { File.Delete(dbPath); } catch { }
            // Also delete WAL/SHM files if they exist
            try { File.Delete(dbPath + "-wal"); } catch { }
            try { File.Delete(dbPath + "-shm"); } catch { }

            opened = await TryOpenDatabaseAsync(dbPath);
            if (!opened)
            {
                throw new InvalidOperationException("Failed to create local database after reset");
            }
        }

        // Create tables
        await CreateTablesAsync();

        Log.Information("Local encrypted database initialized for attempt {AttemptId}", attemptId);
    }

    private async Task<bool> TryOpenDatabaseAsync(string dbPath)
    {
        try
        {
            var connectionString = new SqliteConnectionStringBuilder
            {
                DataSource = dbPath,
                Mode = SqliteOpenMode.ReadWriteCreate
            }.ToString();

            _connection = new SqliteConnection(connectionString);
            await _connection.OpenAsync();

            // Apply SQLCipher encryption key
            using var keyCmd = _connection.CreateCommand();
            keyCmd.CommandText = $"PRAGMA key = 'x\"{_dbKey}\"';";
            await keyCmd.ExecuteNonQueryAsync();

            // Enable WAL mode for performance
            using var walCmd = _connection.CreateCommand();
            walCmd.CommandText = "PRAGMA journal_mode = WAL;";
            await walCmd.ExecuteNonQueryAsync();

            // Verify the database is accessible with this key
            using var verifyCmd = _connection.CreateCommand();
            verifyCmd.CommandText = "SELECT count(*) FROM sqlite_master;";
            await verifyCmd.ExecuteScalarAsync();

            return true;
        }
        catch (Exception ex)
        {
            Log.Debug(ex, "Failed to open database with current key");
            _connection?.Close();
            _connection?.Dispose();
            _connection = null;
            return false;
        }
    }

    private async Task CreateTablesAsync()
    {
        using var cmd = _connection!.CreateCommand();
        cmd.CommandText = """
            CREATE TABLE IF NOT EXISTS local_answers (
                id TEXT PRIMARY KEY,
                attempt_id TEXT NOT NULL,
                question_id TEXT NOT NULL,
                answer_data TEXT,
                status TEXT NOT NULL,
                time_spent_secs INTEGER DEFAULT 0,
                is_marked_for_review INTEGER DEFAULT 0,
                nonce TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                synced_at TEXT
            );

            CREATE TABLE IF NOT EXISTS local_exam_state (
                id TEXT PRIMARY KEY,
                current_question_id TEXT,
                current_section_id TEXT,
                remaining_time_secs INTEGER,
                started_at TEXT,
                last_heartbeat_at TEXT,
                is_online INTEGER DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS sync_queue (
                id TEXT PRIMARY KEY,
                question_id TEXT NOT NULL,
                answer_data TEXT NOT NULL,
                nonce TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                signature TEXT NOT NULL,
                retry_count INTEGER DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_local_answers_attempt ON local_answers(attempt_id);
            CREATE INDEX IF NOT EXISTS idx_local_answers_status ON local_answers(status);
            CREATE INDEX IF NOT EXISTS idx_sync_queue_created ON sync_queue(created_at);
            """;
        await cmd.ExecuteNonQueryAsync();
    }

    public void Close()
    {
        _connection?.Close();
        _connection?.Dispose();
        _connection = null;
        _dbKey = null;
        Log.Information("Local database closed and key cleared from memory");
    }

    public async Task<LocalExamState?> GetActiveExamStateAsync()
    {
        EnsureOpen();
        using var cmd = _connection!.CreateCommand();
        cmd.CommandText = "SELECT * FROM local_exam_state LIMIT 1;";

        using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync()) return null;

        return new LocalExamState
        {
            AttemptId = reader.GetString(0),
            CurrentQuestionId = reader.IsDBNull(1) ? null : reader.GetString(1),
            CurrentSectionId = reader.IsDBNull(2) ? null : reader.GetString(2),
            RemainingTimeSecs = reader.GetInt32(3),
            StartedAt = reader.IsDBNull(4) ? string.Empty : reader.GetString(4),
            LastHeartbeatAt = reader.IsDBNull(5) ? string.Empty : reader.GetString(5),
            IsOnline = reader.GetInt32(6) == 1
        };
    }

    public async Task SaveExamStateAsync(LocalExamState state)
    {
        EnsureOpen();
        using var cmd = _connection!.CreateCommand();
        cmd.CommandText = """
            INSERT OR REPLACE INTO local_exam_state 
            (id, current_question_id, current_section_id, remaining_time_secs, started_at, last_heartbeat_at, is_online)
            VALUES ($id, $currentQuestionId, $currentSectionId, $remainingTimeSecs, $startedAt, $lastHeartbeatAt, $isOnline);
            """;
        cmd.Parameters.AddWithValue("$id", state.AttemptId);
        cmd.Parameters.AddWithValue("$currentQuestionId", (object?)state.CurrentQuestionId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$currentSectionId", (object?)state.CurrentSectionId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$remainingTimeSecs", state.RemainingTimeSecs);
        cmd.Parameters.AddWithValue("$startedAt", state.StartedAt);
        cmd.Parameters.AddWithValue("$lastHeartbeatAt", state.LastHeartbeatAt);
        cmd.Parameters.AddWithValue("$isOnline", state.IsOnline ? 1 : 0);

        await cmd.ExecuteNonQueryAsync();
    }

    public async Task SaveAnswerAsync(LocalAnswer answer)
    {
        EnsureOpen();
        using var cmd = _connection!.CreateCommand();
        cmd.CommandText = """
            INSERT OR REPLACE INTO local_answers 
            (id, attempt_id, question_id, answer_data, status, time_spent_secs, is_marked_for_review, nonce, created_at, updated_at, synced_at)
            VALUES ($id, $attemptId, $questionId, $answerData, $status, $timeSpentSecs, $isMarked, $nonce, $createdAt, $updatedAt, $syncedAt);
            """;
        cmd.Parameters.AddWithValue("$id", answer.Id);
        cmd.Parameters.AddWithValue("$attemptId", answer.AttemptId);
        cmd.Parameters.AddWithValue("$questionId", answer.QuestionId);
        cmd.Parameters.AddWithValue("$answerData", (object?)answer.AnswerDataJson ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$status", answer.Status.ToString());
        cmd.Parameters.AddWithValue("$timeSpentSecs", answer.TimeSpentSecs);
        cmd.Parameters.AddWithValue("$isMarked", answer.IsMarkedForReview ? 1 : 0);
        cmd.Parameters.AddWithValue("$nonce", (object?)answer.Nonce ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$createdAt", answer.CreatedAt);
        cmd.Parameters.AddWithValue("$updatedAt", answer.UpdatedAt);
        cmd.Parameters.AddWithValue("$syncedAt", (object?)answer.SyncedAt ?? DBNull.Value);

        await cmd.ExecuteNonQueryAsync();
    }

    public async Task UpdateAnswerSyncStatusAsync(string questionId, SyncStatus status, string? syncedAt = null)
    {
        EnsureOpen();
        using var cmd = _connection!.CreateCommand();
        cmd.CommandText = """
            UPDATE local_answers 
            SET status = $status, updated_at = $updatedAt, synced_at = $syncedAt
            WHERE question_id = $questionId;
            """;
        cmd.Parameters.AddWithValue("$status", status.ToString());
        cmd.Parameters.AddWithValue("$updatedAt", DateTime.UtcNow.ToString("O"));
        cmd.Parameters.AddWithValue("$syncedAt", (object?)syncedAt ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$questionId", questionId);

        await cmd.ExecuteNonQueryAsync();
    }

    public async Task<List<LocalAnswer>> GetAllAnswersAsync(string attemptId)
    {
        EnsureOpen();
        using var cmd = _connection!.CreateCommand();
        cmd.CommandText = "SELECT * FROM local_answers WHERE attempt_id = $attemptId;";
        cmd.Parameters.AddWithValue("$attemptId", attemptId);

        return await ReadAnswersAsync(cmd);
    }

    public async Task<List<LocalAnswer>> GetUnsyncedAnswersAsync(string attemptId)
    {
        EnsureOpen();
        using var cmd = _connection!.CreateCommand();
        cmd.CommandText = """
            SELECT * FROM local_answers 
            WHERE attempt_id = $attemptId AND status != 'Synced';
            """;
        cmd.Parameters.AddWithValue("$attemptId", attemptId);

        return await ReadAnswersAsync(cmd);
    }

    public async Task AddToSyncQueueAsync(SyncQueueItem item)
    {
        EnsureOpen();
        using var cmd = _connection!.CreateCommand();
        cmd.CommandText = """
            INSERT OR REPLACE INTO sync_queue 
            (id, question_id, answer_data, nonce, timestamp, signature, retry_count, created_at)
            VALUES ($id, $questionId, $answerData, $nonce, $timestamp, $signature, $retryCount, $createdAt);
            """;
        cmd.Parameters.AddWithValue("$id", item.Id);
        cmd.Parameters.AddWithValue("$questionId", item.QuestionId);
        cmd.Parameters.AddWithValue("$answerData", item.AnswerDataJson);
        cmd.Parameters.AddWithValue("$nonce", item.Nonce);
        cmd.Parameters.AddWithValue("$timestamp", item.Timestamp);
        cmd.Parameters.AddWithValue("$signature", item.Signature);
        cmd.Parameters.AddWithValue("$retryCount", item.RetryCount);
        cmd.Parameters.AddWithValue("$createdAt", item.CreatedAt);

        await cmd.ExecuteNonQueryAsync();
    }

    public async Task<List<SyncQueueItem>> GetSyncQueueAsync()
    {
        EnsureOpen();
        using var cmd = _connection!.CreateCommand();
        cmd.CommandText = "SELECT * FROM sync_queue ORDER BY created_at ASC;";

        var items = new List<SyncQueueItem>();
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            items.Add(new SyncQueueItem
            {
                Id = reader.GetString(0),
                QuestionId = reader.GetString(1),
                AnswerDataJson = reader.GetString(2),
                Nonce = reader.GetString(3),
                Timestamp = reader.GetString(4),
                Signature = reader.GetString(5),
                RetryCount = reader.GetInt32(6),
                CreatedAt = reader.GetString(7)
            });
        }

        return items;
    }

    public async Task ClearSyncQueueAsync()
    {
        EnsureOpen();
        using var cmd = _connection!.CreateCommand();
        cmd.CommandText = "DELETE FROM sync_queue;";
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task RemoveFromSyncQueueAsync(string id)
    {
        EnsureOpen();
        using var cmd = _connection!.CreateCommand();
        cmd.CommandText = "DELETE FROM sync_queue WHERE id = $id;";
        cmd.Parameters.AddWithValue("$id", id);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task ClearAllAsync()
    {
        EnsureOpen();
        using var cmd = _connection!.CreateCommand();
        cmd.CommandText = """
            DELETE FROM local_answers;
            DELETE FROM local_exam_state;
            DELETE FROM sync_queue;
            """;
        await cmd.ExecuteNonQueryAsync();
        Log.Information("All local data cleared");
    }

    public async Task<bool> CheckIntegrityAsync()
    {
        EnsureOpen();
        using var cmd = _connection!.CreateCommand();
        cmd.CommandText = "PRAGMA integrity_check;";
        var result = await cmd.ExecuteScalarAsync();
        return result?.ToString() == "ok";
    }

    private async Task<List<LocalAnswer>> ReadAnswersAsync(SqliteCommand cmd)
    {
        var answers = new List<LocalAnswer>();
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            answers.Add(new LocalAnswer
            {
                Id = reader.GetString(0),
                AttemptId = reader.GetString(1),
                QuestionId = reader.GetString(2),
                AnswerDataJson = reader.IsDBNull(3) ? null : reader.GetString(3),
                Status = Enum.TryParse<SyncStatus>(reader.GetString(4), out var s) ? s : SyncStatus.SavedLocal,
                TimeSpentSecs = reader.GetInt32(5),
                IsMarkedForReview = reader.GetInt32(6) == 1,
                Nonce = reader.IsDBNull(7) ? null : reader.GetString(7),
                CreatedAt = reader.GetString(8),
                UpdatedAt = reader.GetString(9),
                SyncedAt = reader.IsDBNull(10) ? null : reader.GetString(10)
            });
        }

        return answers;
    }

    private void EnsureOpen()
    {
        if (_connection is null || _connection.State != System.Data.ConnectionState.Open)
        {
            throw new InvalidOperationException("Local database is not initialized. Call InitializeAsync first.");
        }
    }

    public void Dispose()
    {
        Close();
    }
}
