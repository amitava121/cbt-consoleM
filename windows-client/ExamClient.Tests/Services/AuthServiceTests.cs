using CBT.ExamClient.Services;
using CBT.Shared.Models;
using FluentAssertions;

namespace CBT.ExamClient.Tests.Services;

/// <summary>
/// Tests for the in-memory AuthService.
/// Verifies CLIENT_ARCHITECTURE.md Section 4.3 compliance.
/// </summary>
public class AuthServiceTests
{
    [Fact]
    public void InitialState_IsNotAuthenticated()
    {
        var service = new AuthService();

        service.IsAuthenticated.Should().BeFalse();
        service.AccessToken.Should().BeNull();
        service.RefreshToken.Should().BeNull();
        service.CurrentUser.Should().BeNull();
        service.AttemptId.Should().BeNull();
    }

    [Fact]
    public void SetTokens_MakesAuthenticated()
    {
        var service = new AuthService();

        service.SetTokens("access-token", "refresh-token", 900);

        service.IsAuthenticated.Should().BeTrue();
        service.AccessToken.Should().Be("access-token");
        service.RefreshToken.Should().Be("refresh-token");
    }

    [Fact]
    public void SetTokens_SetsExpiryWithBuffer()
    {
        var service = new AuthService();
        var beforeSet = DateTime.UtcNow;

        service.SetTokens("token", "refresh", 900); // 15 min

        // Should expire at UtcNow + (900 - 30) seconds = UtcNow + 870s
        service.TokenExpiresAt.Should().NotBeNull();
        service.TokenExpiresAt!.Value.Should().BeAfter(beforeSet.AddSeconds(860));
        service.TokenExpiresAt!.Value.Should().BeBefore(beforeSet.AddSeconds(880));
    }

    [Fact]
    public void IsTokenExpired_WhenNoToken_ReturnsTrue()
    {
        var service = new AuthService();

        service.IsTokenExpired().Should().BeTrue();
    }

    [Fact]
    public void IsTokenExpired_WhenFreshToken_ReturnsFalse()
    {
        var service = new AuthService();
        service.SetTokens("token", "refresh", 900);

        service.IsTokenExpired().Should().BeFalse();
    }

    [Fact]
    public void IsTokenExpired_WhenExpired_ReturnsTrue()
    {
        var service = new AuthService();
        service.SetTokens("token", "refresh", 0); // Expires immediately (minus 30s buffer)

        service.IsTokenExpired().Should().BeTrue();
    }

    [Fact]
    public void UpdateAccessToken_UpdatesTokenAndExpiry()
    {
        var service = new AuthService();
        service.SetTokens("old-token", "refresh", 900);

        service.UpdateAccessToken("new-token", 1800);

        service.AccessToken.Should().Be("new-token");
        service.RefreshToken.Should().Be("refresh"); // Unchanged
    }

    [Fact]
    public void SetExamSession_StoresAttemptAndBatch()
    {
        var service = new AuthService();

        service.SetExamSession("attempt-123", "batch-456");

        service.AttemptId.Should().Be("attempt-123");
        service.ExamBatchId.Should().Be("batch-456");
    }

    [Fact]
    public void SetUser_StoresUserInfo()
    {
        var service = new AuthService();
        var user = new UserInfo { Id = "u1", Email = "test@test.com", FullName = "Test User", Role = "candidate" };

        service.SetUser(user);

        service.CurrentUser.Should().NotBeNull();
        service.CurrentUser!.Email.Should().Be("test@test.com");
    }

    [Fact]
    public void Clear_ResetsAllState()
    {
        var service = new AuthService();
        service.SetTokens("token", "refresh", 900);
        service.SetUser(new UserInfo { Id = "u1" });
        service.SetExamSession("a1", "b1");

        service.Clear();

        service.IsAuthenticated.Should().BeFalse();
        service.AccessToken.Should().BeNull();
        service.RefreshToken.Should().BeNull();
        service.CurrentUser.Should().BeNull();
        service.AttemptId.Should().BeNull();
        service.ExamBatchId.Should().BeNull();
    }
}
