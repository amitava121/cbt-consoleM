using CBT.ExamClient.Services;
using CBT.ExamClient.ViewModels;
using CBT.Shared.Models;
using FluentAssertions;
using NSubstitute;
using NSubstitute.ExceptionExtensions;

namespace CBT.ExamClient.Tests.Services;

/// <summary>
/// Tests for the JWT token refresh service.
/// Verifies SECURITY_ARCHITECTURE.md Section 3.4 compliance.
/// </summary>
public class TokenRefreshServiceTests
{
    private readonly IApiService _mockApi;
    private readonly IAuthService _authService;
    private readonly INavigationService _mockNav;
    private readonly TokenRefreshService _service;

    public TokenRefreshServiceTests()
    {
        _mockApi = Substitute.For<IApiService>();
        _authService = new AuthService();
        _mockNav = Substitute.For<INavigationService>();
        _service = new TokenRefreshService(_mockApi, _authService, _mockNav);
    }

    [Fact]
    public async Task ForceRefreshAsync_Success_UpdatesToken()
    {
        _authService.SetTokens("old-token", "valid-refresh", 900);
        _mockApi.RefreshTokenAsync("valid-refresh")
            .Returns(new RefreshTokenResponseData { AccessToken = "new-token", ExpiresIn = 900 });

        var result = await _service.ForceRefreshAsync();

        result.Should().BeTrue();
        _authService.AccessToken.Should().Be("new-token");
    }

    [Fact]
    public async Task ForceRefreshAsync_NoRefreshToken_ReturnsFalse()
    {
        // No tokens set — refresh token is null

        var result = await _service.ForceRefreshAsync();

        result.Should().BeFalse();
    }

    [Fact]
    public async Task ForceRefreshAsync_TokenExpired_RaisesReLoginRequired()
    {
        _authService.SetTokens("old-token", "expired-refresh", 900);
        _mockApi.RefreshTokenAsync("expired-refresh")
            .Throws(new ApiException("TOKEN_EXPIRED", "Refresh token expired", 401));

        bool reLoginRaised = false;
        _service.ReLoginRequired += (_, _) => reLoginRaised = true;

        var result = await _service.ForceRefreshAsync();

        result.Should().BeFalse();
        reLoginRaised.Should().BeTrue();
    }

    [Fact]
    public async Task ForceRefreshAsync_NetworkError_ReturnsFalse_NoReLogin()
    {
        _authService.SetTokens("old-token", "refresh", 900);
        _mockApi.RefreshTokenAsync("refresh")
            .Throws(new Exception("Network error"));

        bool reLoginRaised = false;
        _service.ReLoginRequired += (_, _) => reLoginRaised = true;

        var result = await _service.ForceRefreshAsync();

        result.Should().BeFalse();
        reLoginRaised.Should().BeFalse(); // Network error shouldn't force re-login
    }
}
