using CBT.ExamClient.Services;
using CBT.Shared.Models;
using FluentAssertions;

namespace CBT.ExamClient.Tests.Services;

/// <summary>
/// Tests for the SQLCipher-encrypted local database service.
/// Verifies CLIENT_ARCHITECTURE.md Section 6.2 and 11 compliance.
/// </summary>
public class LocalDbServiceTests : IAsyncLifetime
{
    private readonly LocalDbService _service;
    private const string TestAttemptId = "test-attempt-001";
    private const string TestHardwareHash = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

    public LocalDbServiceTests()
    {
        // Set environment variable for app secret
        Environment.SetEnvironmentVariable("CBT_APP_SECRET", "test-secret-for-unit-tests");
        _service = new LocalDbService(new CBT.Shared.Configuration.AppSettings());
    }

    public async Task InitializeAsync()
    {
        await _service.InitializeAsync(TestAttemptId, TestHardwareHash);
    }

    public async Task DisposeAsync()
    {
        _service.Dispose();
        // Allow SQLite to fully release file handles
        await Task.Delay(100);
        GC.Collect();
        GC.WaitForPendingFinalizers();
        // Clean up test database and WAL/shm files
        var dbPath = CBT.Shared.Configuration.AppSettingsManager.GetDatabasePath();
        foreach (var path in new[] { dbPath, dbPath + "-wal", dbPath + "-shm" })
        {
            try { if (File.Exists(path)) File.Delete(path); }
            catch { /* best effort cleanup */ }
        }
    }

    [Fact]
    public async Task InitializeAsync_CreatesDatabase()
    {
        var integrity = await _service.CheckIntegrityAsync();
        integrity.Should().BeTrue();
    }

    [Fact]
    public async Task SaveAnswerAsync_PersistsAnswer()
    {
        var answer = CreateTestAnswer("q1");

        await _service.SaveAnswerAsync(answer);

        var answers = await _service.GetAllAnswersAsync(TestAttemptId);
        answers.Should().ContainSingle();
        answers[0].QuestionId.Should().Be("q1");
    }

    [Fact]
    public async Task GetUnsyncedAnswersAsync_ReturnsOnlyUnsynced()
    {
        await _service.SaveAnswerAsync(CreateTestAnswer("q1"));
        await _service.SaveAnswerAsync(CreateTestAnswer("q2"));
        await _service.UpdateAnswerSyncStatusAsync("q1", SyncStatus.Synced, DateTime.UtcNow.ToString("O"));

        var unsynced = await _service.GetUnsyncedAnswersAsync(TestAttemptId);

        unsynced.Should().HaveCount(1);
        unsynced[0].QuestionId.Should().Be("q2");
    }

    [Fact]
    public async Task SaveExamStateAsync_PersistsState()
    {
        var state = new LocalExamState
        {
            AttemptId = TestAttemptId,
            CurrentQuestionId = "q5",
            RemainingTimeSecs = 5400,
            StartedAt = DateTime.UtcNow.ToString("O"),
            LastHeartbeatAt = DateTime.UtcNow.ToString("O"),
            IsOnline = true
        };

        await _service.SaveExamStateAsync(state);

        var loaded = await _service.GetActiveExamStateAsync();
        loaded.Should().NotBeNull();
        loaded!.AttemptId.Should().Be(TestAttemptId);
        loaded.CurrentQuestionId.Should().Be("q5");
        loaded.RemainingTimeSecs.Should().Be(5400);
    }

    [Fact]
    public async Task AddToSyncQueueAsync_PersistsItem()
    {
        var item = new SyncQueueItem
        {
            Id = Guid.NewGuid().ToString(),
            QuestionId = "q1",
            AnswerDataJson = "{}",
            Nonce = "nonce123",
            Timestamp = DateTime.UtcNow.ToString("O"),
            Signature = "sig",
            CreatedAt = DateTime.UtcNow.ToString("O")
        };

        await _service.AddToSyncQueueAsync(item);

        var queue = await _service.GetSyncQueueAsync();
        queue.Should().ContainSingle();
        queue[0].QuestionId.Should().Be("q1");
    }

    [Fact]
    public async Task ClearSyncQueueAsync_RemovesAllItems()
    {
        await _service.AddToSyncQueueAsync(new SyncQueueItem
        {
            Id = "1", QuestionId = "q1", AnswerDataJson = "{}", Nonce = "n",
            Timestamp = "t", Signature = "s", CreatedAt = DateTime.UtcNow.ToString("O")
        });
        await _service.AddToSyncQueueAsync(new SyncQueueItem
        {
            Id = "2", QuestionId = "q2", AnswerDataJson = "{}", Nonce = "n",
            Timestamp = "t", Signature = "s", CreatedAt = DateTime.UtcNow.ToString("O")
        });

        await _service.ClearSyncQueueAsync();

        var queue = await _service.GetSyncQueueAsync();
        queue.Should().BeEmpty();
    }

    [Fact]
    public async Task ClearAllAsync_RemovesEverything()
    {
        await _service.SaveAnswerAsync(CreateTestAnswer("q1"));
        await _service.SaveExamStateAsync(new LocalExamState
        {
            AttemptId = TestAttemptId, RemainingTimeSecs = 100,
            StartedAt = "t", LastHeartbeatAt = "t"
        });

        await _service.ClearAllAsync();

        (await _service.GetAllAnswersAsync(TestAttemptId)).Should().BeEmpty();
        (await _service.GetActiveExamStateAsync()).Should().BeNull();
        (await _service.GetSyncQueueAsync()).Should().BeEmpty();
    }

    private LocalAnswer CreateTestAnswer(string questionId) => new()
    {
        Id = Guid.NewGuid().ToString(),
        AttemptId = TestAttemptId,
        QuestionId = questionId,
        AnswerDataJson = "{\"selectedOptionIds\":[\"opt1\"]}",
        Status = SyncStatus.SavedLocal,
        TimeSpentSecs = 30,
        IsMarkedForReview = false,
        Nonce = "nonce",
        CreatedAt = DateTime.UtcNow.ToString("O"),
        UpdatedAt = DateTime.UtcNow.ToString("O")
    };
}
