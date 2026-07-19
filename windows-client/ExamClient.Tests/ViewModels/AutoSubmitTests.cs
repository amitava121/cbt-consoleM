using System.Text.Json;
using CBT.ExamClient.Services;
using CBT.ExamClient.ViewModels;
using CBT.Shared.Models;
using FluentAssertions;
using NSubstitute;

namespace CBT.ExamClient.Tests.ViewModels;

/// <summary>
/// Minimal tests verifying server-initiated auto-submit handling:
/// - SessionAutoSubmittedPayload deserializes correctly from server JSON
/// - ExamViewModel transitions to AutoSubmitted state when event fires
/// </summary>
public class AutoSubmitTests
{
    private static (ExamViewModel vm, IWebSocketService ws) CreateViewModelWithWebSocket()
    {
        var ws = Substitute.For<IWebSocketService>();
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

        ws.SessionAutoSubmitted += Raise.EventWith(
            ws,
            new SessionAutoSubmittedPayload
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

        ws.SessionAutoSubmitted += Raise.EventWith(
            ws,
            new SessionAutoSubmittedPayload
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

        ws.ExamTerminated += Raise.EventWith(
            ws,
            new ExamTerminatedPayload
            {
                AttemptId = "att-3",
                Reason = "admin_terminate",
            });

        vm.ExamState.Should().Be(ExamState.Terminated);
    }
}
