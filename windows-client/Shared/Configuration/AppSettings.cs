using System.Text.Json.Serialization;

namespace CBT.Shared.Configuration;

/// <summary>
/// Application configuration stored in %APPDATA%/cbt-exam/config.json.
/// As specified in CLIENT_ARCHITECTURE.md Section 8.4.
/// Contains no tokens or credentials — only device ID + email hint + server endpoint.
/// </summary>
public sealed class AppSettings
{
    [JsonPropertyName("deviceId")]
    public string DeviceId { get; set; } = string.Empty;

    [JsonPropertyName("serverEndpoint")]
    public string ServerEndpoint { get; set; } = "https://10.0.0.10";

    [JsonPropertyName("lastEmail")]
    public string LastEmail { get; set; } = string.Empty;

    [JsonPropertyName("certificateFingerprint")]
    public string CertificateFingerprint { get; set; } = string.Empty;

    /// <summary>
    /// When true, disables all kiosk lockdown features for development/testing.
    /// Production deployments MUST set this to false.
    /// </summary>
    [JsonPropertyName("developmentMode")]
    public bool DevelopmentMode { get; set; } = false;
}

/// <summary>
/// Manages reading and writing the application configuration file.
/// </summary>
public static class AppSettingsManager
{
    private static readonly string ConfigDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "cbt-exam");

    private static readonly string ConfigFilePath = Path.Combine(ConfigDirectory, "config.json");

    /// <summary>
    /// Loads application settings from disk.
    /// </summary>
    public static AppSettings Load()
    {
        if (!File.Exists(ConfigFilePath))
            return new AppSettings();

        try
        {
            var json = File.ReadAllText(ConfigFilePath);
            return System.Text.Json.JsonSerializer.Deserialize<AppSettings>(json) ?? new AppSettings();
        }
        catch
        {
            return new AppSettings();
        }
    }

    /// <summary>
    /// Saves application settings to disk.
    /// </summary>
    public static void Save(AppSettings settings)
    {
        Directory.CreateDirectory(ConfigDirectory);
        var json = System.Text.Json.JsonSerializer.Serialize(settings, new System.Text.Json.JsonSerializerOptions
        {
            WriteIndented = true
        });
        File.WriteAllText(ConfigFilePath, json);
    }

    /// <summary>
    /// Gets the application data directory path.
    /// </summary>
    public static string GetAppDataDirectory() => ConfigDirectory;

    /// <summary>
    /// Gets the path to the local encrypted SQLite database.
    /// </summary>
    public static string GetDatabasePath() => Path.Combine(ConfigDirectory, "local.db");

    /// <summary>
    /// Gets the path to the cached manifest file.
    /// </summary>
    public static string GetManifestCachePath() => Path.Combine(ConfigDirectory, "manifest.json");
}
