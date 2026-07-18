using CBT.ExamClient.Crypto;
using CBT.Shared.Crypto;
using CBT.Shared.Models;
using FluentAssertions;

namespace CBT.ExamClient.Tests.Crypto;

/// <summary>
/// Tests for signed exam manifest verification.
/// Verifies CLIENT_ARCHITECTURE.md Section 4.2 and SECURITY_ARCHITECTURE.md Section 17.
/// </summary>
public class ManifestVerifierTests
{
    [Fact]
    public void Verify_NullSignatureVerifier_ReturnsPublicKeyMissing()
    {
        var verifier = new ManifestVerifier(null);
        var manifest = CreateValidSignedManifest();

        var result = verifier.Verify(manifest, "");

        result.IsValid.Should().BeFalse();
        result.Error.Should().Be("MANIFEST_PUBLIC_KEY_MISSING");
    }

    [Fact]
    public void Verify_ExpiredManifest_ReturnsExpiredError()
    {
        // Create a mock verifier that always returns true for signature
        var mockKey = new byte[32];
        var verifier = new ManifestVerifier(new AlwaysValidSignatureVerifier());

        var manifest = CreateValidSignedManifest();
        manifest.Manifest.ExpiresAt = "2020-01-01T00:00:00Z"; // Expired

        var result = verifier.Verify(manifest, "");

        result.IsValid.Should().BeFalse();
        result.Error.Should().Be("MANIFEST_EXPIRED");
    }

    [Fact]
    public void Verify_InvalidExpiryFormat_ReturnsInvalidExpiry()
    {
        var verifier = new ManifestVerifier(new AlwaysValidSignatureVerifier());
        var manifest = CreateValidSignedManifest();
        manifest.Manifest.ExpiresAt = "not-a-date";

        var result = verifier.Verify(manifest, "");

        result.IsValid.Should().BeFalse();
        result.Error.Should().Be("MANIFEST_INVALID_EXPIRY");
    }

    [Fact]
    public void Verify_CertFingerprintMismatch_ReturnsMismatchError()
    {
        var verifier = new ManifestVerifier(new AlwaysValidSignatureVerifier());
        var manifest = CreateValidSignedManifest();
        manifest.Manifest.Server.CertificateFingerprint = "EXPECTED_FINGERPRINT";

        var result = verifier.Verify(manifest, "DIFFERENT_FINGERPRINT");

        result.IsValid.Should().BeFalse();
        result.Error.Should().Be("CERT_FINGERPRINT_MISMATCH");
    }

    [Fact]
    public void Verify_ValidManifest_ReturnsSuccess()
    {
        var verifier = new ManifestVerifier(new AlwaysValidSignatureVerifier());
        var manifest = CreateValidSignedManifest();

        var result = verifier.Verify(manifest, "");

        result.IsValid.Should().BeTrue();
        result.Manifest.Should().NotBeNull();
        result.Error.Should().BeNull();
    }

    [Fact]
    public void Verify_MatchingCertFingerprint_ReturnsSuccess()
    {
        var verifier = new ManifestVerifier(new AlwaysValidSignatureVerifier());
        var manifest = CreateValidSignedManifest();
        manifest.Manifest.Server.CertificateFingerprint = "AB:CD:EF";

        var result = verifier.Verify(manifest, "AB:CD:EF");

        result.IsValid.Should().BeTrue();
    }

    private static SignedManifest CreateValidSignedManifest() => new()
    {
        Manifest = new ExamManifest
        {
            ManifestId = "test-manifest",
            ExamId = "exam-1",
            ExamBatchId = "batch-1",
            Version = 1,
            IssuedAt = DateTime.UtcNow.ToString("O"),
            ExpiresAt = DateTime.UtcNow.AddHours(4).ToString("O"),
            Exam = new ManifestExamInfo
            {
                Title = "Test Exam",
                DurationMinutes = 180,
                NavigationMode = "free"
            },
            Server = new ManifestServerInfo
            {
                Endpoint = "https://exam-server.local",
                CertificateFingerprint = ""
            }
        },
        Signature = "test-signature"
    };

    /// <summary>
    /// Test double that always returns true for signature verification.
    /// </summary>
    private sealed class AlwaysValidSignatureVerifier : SignatureVerifier
    {
        public AlwaysValidSignatureVerifier() : base(new byte[32]) { }

        public override bool Verify(string data, string signatureBase64) => true;
    }
}
