using System.Reflection;
using System.Text.Json;
using CBT.Shared.Crypto;
using CBT.Shared.Models;
using Serilog;

namespace CBT.ExamClient.Crypto;

/// <summary>
/// Verifies signed exam manifests using the embedded Ed25519 public key.
/// As specified in CLIENT_ARCHITECTURE.md Section 4.2 and SECURITY_ARCHITECTURE.md Section 17.
/// 
/// Verification steps:
/// 1. Load embedded public key (Resources/exam-public.pem)
/// 2. Verify Ed25519 signature
/// 3. Check manifest not expired
/// 4. Check server certificate fingerprint matches
/// 5. If invalid: refuse to start, log MANIFEST_SIGNATURE_INVALID
/// </summary>
public sealed class ManifestVerifier
{
    private readonly SignatureVerifier? _signatureVerifier;

    public ManifestVerifier(SignatureVerifier? signatureVerifier)
    {
        _signatureVerifier = signatureVerifier;
    }

    /// <summary>
    /// Verifies a signed exam manifest.
    /// Returns the manifest if valid, or null if verification fails.
    /// </summary>
    public ManifestVerificationResult Verify(SignedManifest signedManifest, string expectedCertFingerprint, bool developmentMode = false)
    {
        var result = new ManifestVerificationResult();

        // In development mode, skip signature verification if signature is empty
        if (developmentMode && string.IsNullOrEmpty(signedManifest.Signature))
        {
            Log.Warning("DEVELOPMENT MODE — skipping manifest signature verification (empty signature)");
            // Still check expiry
            if (DateTime.TryParse(signedManifest.Manifest.ExpiresAt, out var devExpiry))
            {
                if (DateTime.UtcNow > devExpiry)
                {
                    result.Error = "MANIFEST_EXPIRED";
                    return result;
                }
            }
            result.IsValid = true;
            result.Manifest = signedManifest.Manifest;
            return result;
        }

        // Step 1: Verify signature
        if (_signatureVerifier is null)
        {
            Log.Error("No public key available for manifest verification");
            result.Error = "MANIFEST_PUBLIC_KEY_MISSING";
            return result;
        }

        var manifestJson = JsonSerializer.Serialize(signedManifest.Manifest, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        });

        if (!_signatureVerifier.Verify(manifestJson, signedManifest.Signature))
        {
            Log.Error("Manifest signature verification FAILED — possible tampering");
            result.Error = "MANIFEST_SIGNATURE_INVALID";
            return result;
        }

        Log.Information("Manifest signature verified successfully");

        // Step 2: Check expiry
        if (DateTime.TryParse(signedManifest.Manifest.ExpiresAt, out var expiresAt))
        {
            if (DateTime.UtcNow > expiresAt)
            {
                Log.Error("Manifest expired at {ExpiresAt}", expiresAt);
                result.Error = "MANIFEST_EXPIRED";
                return result;
            }
        }
        else
        {
            Log.Error("Manifest has invalid expiresAt field");
            result.Error = "MANIFEST_INVALID_EXPIRY";
            return result;
        }

        // Step 3: Verify server certificate fingerprint
        if (!string.IsNullOrEmpty(expectedCertFingerprint) &&
            !string.IsNullOrEmpty(signedManifest.Manifest.Server.CertificateFingerprint))
        {
            if (!string.Equals(expectedCertFingerprint,
                signedManifest.Manifest.Server.CertificateFingerprint,
                StringComparison.OrdinalIgnoreCase))
            {
                Log.Error("Server certificate fingerprint mismatch. Expected: {Expected}, Got: {Got}",
                    expectedCertFingerprint, signedManifest.Manifest.Server.CertificateFingerprint);
                result.Error = "CERT_FINGERPRINT_MISMATCH";
                return result;
            }
        }

        // All checks passed
        result.IsValid = true;
        result.Manifest = signedManifest.Manifest;
        return result;
    }
}

/// <summary>
/// Result of manifest verification.
/// </summary>
public sealed class ManifestVerificationResult
{
    public bool IsValid { get; set; }
    public ExamManifest? Manifest { get; set; }
    public string? Error { get; set; }
}
