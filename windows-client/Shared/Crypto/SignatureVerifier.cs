using System.Security.Cryptography;
using System.Text;

namespace CBT.Shared.Crypto;

/// <summary>
/// Verifies Ed25519 signatures for exam manifests and security policies.
/// As specified in CLIENT_ARCHITECTURE.md Section 4.2 and SECURITY_ARCHITECTURE.md Section 17.
/// The public key is embedded in the client binary at build time.
/// </summary>
public class SignatureVerifier
{
    private readonly byte[] _publicKey;

    /// <summary>
    /// Creates a signature verifier with the given Ed25519 public key bytes.
    /// </summary>
    /// <param name="publicKeyBytes">The Ed25519 public key (32 bytes)</param>
    public SignatureVerifier(byte[] publicKeyBytes)
    {
        _publicKey = publicKeyBytes ?? throw new ArgumentNullException(nameof(publicKeyBytes));
    }

    /// <summary>
    /// Creates a signature verifier by loading the public key from a PEM string.
    /// </summary>
    public static SignatureVerifier FromPem(string pemContent)
    {
        using var ed25519 = ECDsa.Create();
        ed25519.ImportFromPem(pemContent);
        var keyBytes = ed25519.ExportSubjectPublicKeyInfo();
        return new SignatureVerifier(keyBytes);
    }

    /// <summary>
    /// Verifies an Ed25519 signature over the given data.
    /// </summary>
    /// <param name="data">The data that was signed (typically the manifest/policy JSON)</param>
    /// <param name="signatureBase64">The Base64-encoded signature</param>
    /// <returns>True if the signature is valid</returns>
    public virtual bool Verify(string data, string signatureBase64)
    {
        try
        {
            var dataBytes = Encoding.UTF8.GetBytes(data);
            var signatureBytes = Convert.FromBase64String(signatureBase64);

            using var ed25519 = ECDsa.Create();
            ed25519.ImportSubjectPublicKeyInfo(_publicKey, out _);
            return ed25519.VerifyData(dataBytes, signatureBytes, HashAlgorithmName.SHA256);
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Verifies an Ed25519 signature over raw byte data.
    /// </summary>
    public bool Verify(byte[] data, byte[] signature)
    {
        try
        {
            using var ed25519 = ECDsa.Create();
            ed25519.ImportSubjectPublicKeyInfo(_publicKey, out _);
            return ed25519.VerifyData(data, signature, HashAlgorithmName.SHA256);
        }
        catch
        {
            return false;
        }
    }
}
