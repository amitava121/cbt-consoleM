using System.Text.Json;
using CBT.Shared.Crypto;
using CBT.Shared.Models;
using Serilog;

namespace CBT.ExamClient.Crypto;

/// <summary>
/// Verifies signed security policies using the embedded Ed25519 public key.
/// As specified in SECURITY_ARCHITECTURE.md Section 18.
/// 
/// If verification fails, falls back to the hardcoded default policy (most restrictive).
/// The client never applies a less restrictive policy than the default.
/// </summary>
public sealed class PolicyVerifier
{
    private readonly SignatureVerifier? _signatureVerifier;

    public PolicyVerifier(SignatureVerifier? signatureVerifier)
    {
        _signatureVerifier = signatureVerifier;
    }

    /// <summary>
    /// Verifies and returns the security policy.
    /// Falls back to hardcoded default if verification fails.
    /// </summary>
    public SecurityPolicy VerifyAndGetPolicy(SignedSecurityPolicy signedPolicy)
    {
        if (_signatureVerifier is null)
        {
            Log.Warning("No public key for policy verification — using default policy");
            return DefaultSecurityPolicy.Create();
        }

        try
        {
            var policyJson = JsonSerializer.Serialize(signedPolicy.Policy, new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            });

            if (_signatureVerifier.Verify(policyJson, signedPolicy.Signature))
            {
                Log.Information("Security policy verified. Version: {Version}", signedPolicy.Policy.Version);
                return signedPolicy.Policy;
            }
            else
            {
                Log.Error("Security policy signature INVALID — using fail-safe default");
                return DefaultSecurityPolicy.Create();
            }
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Policy verification error — using fail-safe default");
            return DefaultSecurityPolicy.Create();
        }
    }
}
