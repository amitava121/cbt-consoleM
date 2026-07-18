using System.Security.Cryptography;
using System.Text;

namespace CBT.Shared.Crypto;

/// <summary>
/// HMAC-SHA256 signer for answer save requests and exam submission.
/// As specified in SECURITY_ARCHITECTURE.md Section 7.
/// session_key = HKDF(JWT signature, "answer_signing" + attempt_id, 32 bytes)
/// </summary>
public sealed class HmacSigner
{
    private readonly byte[] _sessionKey;

    public HmacSigner(byte[] sessionKey)
    {
        _sessionKey = sessionKey ?? throw new ArgumentNullException(nameof(sessionKey));
    }

    /// <summary>
    /// Derives the session key from the JWT access token signature and attempt ID.
    /// session_key = HKDF(base_key = JWT_signature, info = "answer_signing" + attempt_id, length = 32)
    /// </summary>
    public static HmacSigner DeriveFromToken(string accessToken, string attemptId)
    {
        // Extract JWT signature (last segment after second '.')
        var parts = accessToken.Split('.');
        if (parts.Length != 3)
            throw new ArgumentException("Invalid JWT token format", nameof(accessToken));

        var signatureBytes = Convert.FromBase64String(PadBase64(parts[2]));
        var info = Encoding.UTF8.GetBytes("answer_signing" + attemptId);

        // HKDF to derive the session key
        var sessionKey = HKDF.DeriveKey(
            HashAlgorithmName.SHA256,
            ikm: signatureBytes,
            outputLength: 32,
            info: info);

        return new HmacSigner(sessionKey);
    }

    /// <summary>
    /// Signs the payload with HMAC-SHA256.
    /// signature = HMAC-SHA256(payload + nonce + timestamp, session_key)
    /// </summary>
    public string Sign(string payload, string nonce, string timestamp)
    {
        var data = Encoding.UTF8.GetBytes(payload + nonce + timestamp);
        var hash = HMACSHA256.HashData(_sessionKey, data);
        return Convert.ToBase64String(hash);
    }

    /// <summary>
    /// Generates a cryptographically random nonce (32 hex characters).
    /// </summary>
    public static string GenerateNonce()
    {
        var bytes = RandomNumberGenerator.GetBytes(16);
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private static string PadBase64(string base64Url)
    {
        // Convert Base64Url to standard Base64
        var result = base64Url.Replace('-', '+').Replace('_', '/');
        switch (result.Length % 4)
        {
            case 2: result += "=="; break;
            case 3: result += "="; break;
        }
        return result;
    }
}
