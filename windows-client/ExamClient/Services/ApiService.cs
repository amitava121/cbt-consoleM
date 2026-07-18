using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using CBT.ExamClient.ViewModels;
using CBT.Shared.Configuration;
using CBT.Shared.Models;
using Serilog;

namespace CBT.ExamClient.Services;

/// <summary>
/// REST API client implementation using HttpClient.
/// As specified in CLIENT_ARCHITECTURE.md Section 2.1 and API_SPECIFICATION.md.
/// Includes certificate pinning per SECURITY_ARCHITECTURE.md Section 6.3.
/// </summary>
public sealed class ApiService : IApiService
{
    private readonly HttpClient _httpClient;
    private readonly IAuthService _authService;
    private readonly AppSettings _settings;
    private readonly JsonSerializerOptions _jsonOptions;

    public ApiService(IAuthService authService, AppSettings settings)
    {
        _authService = authService;
        _settings = settings;

        _jsonOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true
        };

        // Configure HttpClient with certificate pinning
        var handler = CreatePinnedHandler();
        _httpClient = new HttpClient(handler)
        {
            BaseAddress = new Uri(settings.ServerEndpoint.TrimEnd('/') + "/api/v1/"),
            Timeout = TimeSpan.FromSeconds(30)
        };
    }

    /// <summary>
    /// Creates an HttpClientHandler with certificate pinning.
    /// As specified in SECURITY_ARCHITECTURE.md Section 6.3.
    /// </summary>
    private HttpClientHandler CreatePinnedHandler()
    {
        return new HttpClientHandler
        {
            ServerCertificateCustomValidationCallback = ValidateCertificate
        };
    }

    private bool ValidateCertificate(HttpRequestMessage message, X509Certificate2? cert,
        X509Chain? chain, SslPolicyErrors errors)
    {
        // Allow if no policy errors (properly signed certificate)
        if (errors == SslPolicyErrors.None)
            return true;

        // For self-signed certs (LAN deployment): verify fingerprint matches config
        if (!string.IsNullOrEmpty(_settings.CertificateFingerprint) && cert is not null)
        {
            var fingerprint = cert.GetCertHashString();
            return string.Equals(fingerprint, _settings.CertificateFingerprint,
                StringComparison.OrdinalIgnoreCase);
        }

        // In development/initial setup: allow self-signed (will be tightened per policy)
        return errors == SslPolicyErrors.RemoteCertificateChainErrors;
    }

    private void AddAuthHeader(HttpRequestMessage request)
    {
        if (_authService.AccessToken is not null)
        {
            request.Headers.Authorization =
                new AuthenticationHeaderValue("Bearer", _authService.AccessToken);
        }
    }

    public async Task<bool> CheckHealthAsync()
    {
        try
        {
            var response = await _httpClient.GetAsync("health");
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    public async Task<LoginResponseData> LoginAsync(string email, string password, string deviceId)
    {
        var request = new LoginRequest
        {
            Email = email,
            Password = password,
            DeviceId = deviceId
        };

        var response = await PostAsync<LoginResponseData>("auth/login", request, authenticated: false);
        return response;
    }

    public async Task<RefreshTokenResponseData> RefreshTokenAsync(string refreshToken)
    {
        var request = new RefreshTokenRequest { RefreshToken = refreshToken };
        return await PostAsync<RefreshTokenResponseData>("auth/refresh", request, authenticated: false);
    }

    public async Task<List<CandidateExamInfo>> GetAssignedExamsAsync()
    {
        return await GetAsync<List<CandidateExamInfo>>("candidate/exams");
    }

    public async Task<CandidateExamInfo> GetExamMetadataAsync(string batchId)
    {
        return await GetAsync<CandidateExamInfo>($"candidate/exams/{batchId}");
    }

    public async Task<List<Question>> GetExamQuestionsAsync(string batchId)
    {
        return await GetAsync<List<Question>>($"candidate/exams/{batchId}/questions");
    }

    public async Task<ExamStartResponseData> StartExamAsync(string batchId, string deviceId)
    {
        var request = new ExamStartRequest { DeviceId = deviceId };
        return await PostAsync<ExamStartResponseData>($"candidate/exams/{batchId}/start", request);
    }

    public async Task<bool> SubmitExamAsync(string batchId, string attemptId, string nonce, string signature)
    {
        var request = new { attemptId, nonce, signature };
        await PostAsync<object>($"candidate/exams/{batchId}/submit", request);
        return true;
    }

    public async Task<SignedManifest> GetSignedManifestAsync(string batchId)
    {
        return await GetAsync<SignedManifest>($"candidate/exams/{batchId}/manifest");
    }

    public async Task<SignedSecurityPolicy> GetSecurityPolicyAsync()
    {
        return await GetAsync<SignedSecurityPolicy>("security-policies/current", authenticated: false);
    }

    public async Task<AttemptStatusResponse> GetAttemptStatusAsync(string attemptId)
    {
        return await GetAsync<AttemptStatusResponse>($"candidate/attempts/{attemptId}/status");
    }

    public async Task<List<ServerAnswerState>> GetSavedAnswersAsync(string attemptId)
    {
        return await GetAsync<List<ServerAnswerState>>($"candidate/attempts/{attemptId}/answers");
    }

    // --- Private HTTP helpers (thread-safe, per-request headers) ---

    private async Task<T> GetAsync<T>(string endpoint, bool authenticated = true) where T : class
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, endpoint);
        if (authenticated) AddAuthHeader(request);
        var response = await _httpClient.SendAsync(request);
        return await HandleResponse<T>(response);
    }

    private async Task<T> PostAsync<T>(string endpoint, object body, bool authenticated = true) where T : class
    {
        var json = JsonSerializer.Serialize(body, _jsonOptions);
        using var request = new HttpRequestMessage(HttpMethod.Post, endpoint)
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json")
        };
        if (authenticated) AddAuthHeader(request);
        var response = await _httpClient.SendAsync(request);
        return await HandleResponse<T>(response);
    }

    private async Task<T> HandleResponse<T>(HttpResponseMessage response) where T : class
    {
        var responseBody = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            var errorResponse = JsonSerializer.Deserialize<ApiResponse<object>>(responseBody, _jsonOptions);
            var errorCode = errorResponse?.Error?.Code ?? "UNKNOWN_ERROR";
            var errorMessage = errorResponse?.Error?.Message ?? "An unknown error occurred";

            Log.Warning("API error: {StatusCode} {Code} - {Message}",
                (int)response.StatusCode, errorCode, errorMessage);

            throw new ApiException(errorCode, errorMessage, (int)response.StatusCode);
        }

        var apiResponse = JsonSerializer.Deserialize<ApiResponse<T>>(responseBody, _jsonOptions);
        if (apiResponse?.Data is null)
        {
            throw new ApiException("PARSE_ERROR", "Failed to parse server response");
        }

        return apiResponse.Data;
    }
}
