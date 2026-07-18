using CBT.Shared.Crypto;
using FluentAssertions;

namespace CBT.ExamClient.Tests.Crypto;

/// <summary>
/// Tests for HMAC-SHA256 answer signing.
/// Verifies SECURITY_ARCHITECTURE.md Section 7 compliance.
/// </summary>
public class HmacSignerTests
{
    [Fact]
    public void GenerateNonce_Returns32HexCharacters()
    {
        var nonce = HmacSigner.GenerateNonce();

        nonce.Should().HaveLength(32);
        nonce.Should().MatchRegex("^[0-9a-f]{32}$");
    }

    [Fact]
    public void GenerateNonce_IsUnique()
    {
        var nonces = Enumerable.Range(0, 100).Select(_ => HmacSigner.GenerateNonce()).ToList();

        nonces.Distinct().Count().Should().Be(100);
    }

    [Fact]
    public void Sign_ProducesDeterministicSignature()
    {
        var key = new byte[32];
        Array.Fill(key, (byte)0xAB);
        var signer = new HmacSigner(key);

        var sig1 = signer.Sign("payload", "nonce123", "2026-01-01T00:00:00Z");
        var sig2 = signer.Sign("payload", "nonce123", "2026-01-01T00:00:00Z");

        sig1.Should().Be(sig2);
    }

    [Fact]
    public void Sign_DifferentPayloads_ProduceDifferentSignatures()
    {
        var key = new byte[32];
        Array.Fill(key, (byte)0xAB);
        var signer = new HmacSigner(key);

        var sig1 = signer.Sign("payload1", "nonce123", "2026-01-01T00:00:00Z");
        var sig2 = signer.Sign("payload2", "nonce123", "2026-01-01T00:00:00Z");

        sig1.Should().NotBe(sig2);
    }

    [Fact]
    public void Sign_DifferentNonces_ProduceDifferentSignatures()
    {
        var key = new byte[32];
        Array.Fill(key, (byte)0xAB);
        var signer = new HmacSigner(key);

        var sig1 = signer.Sign("payload", "nonce111", "2026-01-01T00:00:00Z");
        var sig2 = signer.Sign("payload", "nonce222", "2026-01-01T00:00:00Z");

        sig1.Should().NotBe(sig2);
    }

    [Fact]
    public void DeriveFromToken_ValidJwt_DoesNotThrow()
    {
        // Minimal valid JWT structure (header.payload.signature)
        var jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
        var attemptId = "test-attempt-id";

        var act = () => HmacSigner.DeriveFromToken(jwt, attemptId);

        act.Should().NotThrow();
    }

    [Fact]
    public void DeriveFromToken_InvalidJwt_Throws()
    {
        var act = () => HmacSigner.DeriveFromToken("not-a-jwt", "attempt-id");

        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void DeriveFromToken_SameInputs_ProduceSameKey()
    {
        var jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

        var signer1 = HmacSigner.DeriveFromToken(jwt, "attempt-1");
        var signer2 = HmacSigner.DeriveFromToken(jwt, "attempt-1");

        var sig1 = signer1.Sign("data", "nonce", "ts");
        var sig2 = signer2.Sign("data", "nonce", "ts");

        sig1.Should().Be(sig2);
    }

    [Fact]
    public void DeriveFromToken_DifferentAttempts_ProduceDifferentKeys()
    {
        var jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

        var signer1 = HmacSigner.DeriveFromToken(jwt, "attempt-1");
        var signer2 = HmacSigner.DeriveFromToken(jwt, "attempt-2");

        var sig1 = signer1.Sign("data", "nonce", "ts");
        var sig2 = signer2.Sign("data", "nonce", "ts");

        sig1.Should().NotBe(sig2);
    }
}
