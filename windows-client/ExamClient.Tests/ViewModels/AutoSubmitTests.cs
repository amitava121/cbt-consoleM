using System.Text.Json;
using CBT.ExamClient.Services;
using CBT.ExamClient.ViewModels;
using CBT.Shared.Models;
using FluentAssertions;

namespace CBT.ExamClient.Tests.ViewModels;

/// <summary>
/// Minimal tests verifying server-initiated auto-submit handling:
/// - SessionAutoSubmittedPayload deserializes correctly from server JSON
/// - ExamViewModel transitions to AutoSubmitted state when event fires
/// </summary>
public class AutoSubmitTests
{
    private static (ExamViewModel vm, StubWebSocketService ws) CreateViewModelWithWebSocket()
    {
        var ws = new StubWebSocketService();
        var vm = new ExamViewModel(
            Substitute.For<IApiService>(),
            ws,
            Substitute.For<ILocalDbService>(),
            Substitute.For<IAuthService>(),
            Substitute.For<INavigationService>());
        return (vm, ws);
    }

    [Fact]
    public void SessionAutoSubmittedPayload_DeserializesFromServerJson()
    {
        var json = """
        {
            "attemptId": "att-123",
            "candidateId": "cand-456",
            "reason": "time_expired",
            "serverTime": 1700000000000
        }
        """;

        var options = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true,
        };

        var payload = JsonSerializer.Deserialize<SessionAutoSubmittedPayload>(json, options);

        payload.Should().NotBeNull();
        payload!.AttemptId.Should().Be("att-123");
        payload.CandidateId.Should().Be("cand-456");
        payload.Reason.Should().Be("time_expired");
        payload.ServerTime.Should().Be(1700000000000);
    }

    [Fact]
    public void OnSessionAutoSubmitted_SetsRemainingTimeToZeroAndTransitionsState()
    {
        var (vm, ws) = CreateViewModelWithWebSocket();
        vm.RemainingTimeSeconds = 300;
        vm.ExamState = ExamState.InProgress;

        ws.RaiseSessionAutoSubmitted(new SessionAutoSubmittedPayload
        {
            AttemptId = "att-1",
            CandidateId = "cand-1",
            Reason = "time_expired",
        });

        vm.RemainingTimeSeconds.Should().Be(0);
        vm.ExamState.Should().Be(ExamState.AutoSubmitted);
        vm.TimerDisplay.Should().Be("00:00:00");
    }

    [Fact]
    public void OnSessionAutoSubmitted_FromPausedState_AlsoTransitions()
    {
        var (vm, ws) = CreateViewModelWithWebSocket();
        vm.RemainingTimeSeconds = 120;
        vm.ExamState = ExamState.Paused;

        ws.RaiseSessionAutoSubmitted(new SessionAutoSubmittedPayload
        {
            AttemptId = "att-2",
            Reason = "time_expired",
        });

        vm.ExamState.Should().Be(ExamState.AutoSubmitted);
        vm.RemainingTimeSeconds.Should().Be(0);
    }

    [Fact]
    public void OnExamTerminated_TransitionsToTerminated()
    {
        var (vm, ws) = CreateViewModelWithWebSocket();
        vm.ExamState = ExamState.InProgress;

        ws.RaiseExamTerminated(new ExamTerminatedPayload
        {
            AttemptId = "att-3",
            Reason = "admin_terminate",
        });

        vm.ExamState.Should().Be(ExamState.Terminated);
    }
}

/// <summary>
/// Minimal stub for IWebSocketService that can raise events manually.
/// Avoids NSubstitute's Raise.EventWith constraint requiring EventArgs.
/// </summary>
internal class StubWebSocketService : IWebSocketService
{
    public string ConnectionId { get; set; } = string.Empty;
    public bool IsConnected { get; set; }

    public event EventHandler<ConnectionOpenPayload>? ConnectionOpened;
    public event EventHandler<AnswerSavedPayload>? AnswerSaved;
    public event EventHandler<HeartbeatAckPayload>? HeartbeatAcknowledged;
    public event EventHandler<ExamPausedPayload>? ExamPaused;
    public event EventHandler<ExamResumedPayload>? ExamResumed;
    public event EventHandler<ExamTerminatedPayload>? ExamTerminated;
    public event EventHandler<SessionResumePayload>? SessionResumed;
    public event EventHandler<SessionWarningPayload>? WarningReceived;
    public event EventHandler<ExamSubmittedPayload>? ExamSubmitted;
    public event EventHandler<SessionAutoSubmittedPayload>? SessionAutoSubmitted;
    public event EventHandler<TimeSyncPayload>? TimeSynced;
    public event EventHandler<SyncDeltaResponsePayload>? DeltaSyncReceived;
    public event EventHandler? Disconnected;
    public event EventHandler? Reconnected;

    public void RaiseSessionAutoSubmitted(SessionAutoSubmittedPayload payload)
        => SessionAutoSubmitted?.Invoke(this, payload);

    public void RaiseExamTerminated(ExamTerminatedPayload payload)
        => ExamTerminated?.Invoke(this, payload);

    // Unused methods — stub implementations
    public Task ConnectAsync(string url, string? token = null) => Task.CompletedTask;
    public Task DisconnectAsync() => Task.CompletedTask;
    public Task SendHelloAsync(string attemptId, string candidateId, string examBatchId) => Task.CompletedTask;
    public Task SendAnswerSaveAsync(string questionId, string answer) => Task.CompletedTask;
    public Task SendAnswerBatchAsync(Dictionary<string, string> answers) => Task.CompletedTask;
    public Task SendExamSubmitAsync(string attemptId, string nonce, string signature) => Task.CompletedTask;
    public Task SendHeartbeatAsync() => Task.CompletedTask;
    public Task SendSessionResumeAsync(string attemptId) => Task.CompletedTask;
    public Task SendWarningAckAsync(string warningId) => Task.CompletedTask;
}
