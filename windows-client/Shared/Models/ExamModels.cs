using System.Text.Json.Serialization;

namespace CBT.Shared.Models;

/// <summary>
/// Exam manifest as defined in SECURITY_ARCHITECTURE.md Section 17.3
/// and CLIENT_ARCHITECTURE.md Section 4.2.
/// Signed with Ed25519 by offline private key.
/// </summary>
public sealed class ExamManifest
{
    [JsonPropertyName("manifestId")]
    public string ManifestId { get; set; } = string.Empty;

    [JsonPropertyName("examId")]
    public string ExamId { get; set; } = string.Empty;

    [JsonPropertyName("examBatchId")]
    public string ExamBatchId { get; set; } = string.Empty;

    [JsonPropertyName("version")]
    public int Version { get; set; }

    [JsonPropertyName("issuedAt")]
    public string IssuedAt { get; set; } = string.Empty;

    [JsonPropertyName("expiresAt")]
    public string ExpiresAt { get; set; } = string.Empty;

    [JsonPropertyName("exam")]
    public ManifestExamInfo Exam { get; set; } = new();

    [JsonPropertyName("server")]
    public ManifestServerInfo Server { get; set; } = new();
}

public sealed class ManifestExamInfo
{
    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("durationMinutes")]
    public int DurationMinutes { get; set; }

    [JsonPropertyName("sections")]
    public List<ManifestSectionInfo> Sections { get; set; } = [];

    [JsonPropertyName("markingScheme")]
    public MarkingScheme MarkingScheme { get; set; } = new();

    [JsonPropertyName("navigationMode")]
    public string NavigationMode { get; set; } = "free";

    [JsonPropertyName("shuffleQuestions")]
    public bool ShuffleQuestions { get; set; }

    [JsonPropertyName("shuffleOptions")]
    public bool ShuffleOptions { get; set; }
}

public sealed class ManifestSectionInfo
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("durationMinutes")]
    public int? DurationMinutes { get; set; }

    [JsonPropertyName("questionCount")]
    public int QuestionCount { get; set; }
}

public sealed class MarkingScheme
{
    [JsonPropertyName("correct")]
    public double Correct { get; set; }

    [JsonPropertyName("incorrect")]
    public double Incorrect { get; set; }

    [JsonPropertyName("unattempted")]
    public double Unattempted { get; set; }
}

public sealed class ManifestServerInfo
{
    [JsonPropertyName("endpoint")]
    public string Endpoint { get; set; } = string.Empty;

    [JsonPropertyName("certificateFingerprint")]
    public string CertificateFingerprint { get; set; } = string.Empty;
}

/// <summary>
/// Signed manifest wrapper (manifest JSON + Ed25519 signature).
/// </summary>
public sealed class SignedManifest
{
    [JsonPropertyName("manifest")]
    public ExamManifest Manifest { get; set; } = new();

    [JsonPropertyName("signature")]
    public string Signature { get; set; } = string.Empty;
}

/// <summary>
/// Question model as delivered to the client.
/// Based on API_SPECIFICATION.md Section 7.2.
/// </summary>
public sealed class Question
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("sectionId")]
    public string SectionId { get; set; } = string.Empty;

    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("displayOrder")]
    public int DisplayOrder { get; set; }

    [JsonPropertyName("marks")]
    [JsonConverter(typeof(FlexibleDoubleConverter))]
    public double Marks { get; set; }

    [JsonPropertyName("negativeMarks")]
    [JsonConverter(typeof(FlexibleDoubleConverter))]
    public double NegativeMarks { get; set; }

    [JsonPropertyName("content")]
    public QuestionContent Content { get; set; } = new();

    [JsonPropertyName("options")]
    public List<QuestionOption>? Options { get; set; }
}

public sealed class QuestionContent
{
    [JsonPropertyName("text")]
    public string Text { get; set; } = string.Empty;

    [JsonPropertyName("latex")]
    public string? Latex { get; set; }

    [JsonPropertyName("passageId")]
    public string? PassageId { get; set; }

    [JsonPropertyName("imageUrl")]
    public string? ImageUrl { get; set; }

    [JsonPropertyName("audioUrl")]
    public string? AudioUrl { get; set; }

    [JsonPropertyName("videoUrl")]
    public string? VideoUrl { get; set; }
}

public sealed class QuestionOption
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("text")]
    public string Text { get; set; } = string.Empty;

    [JsonPropertyName("optionMediaUrl")]
    public string? OptionMediaUrl { get; set; }

    [JsonPropertyName("displayOrder")]
    public int DisplayOrder { get; set; }
}

/// <summary>
/// Answer data structure for different question types.
/// Based on API_SPECIFICATION.md Section 7.4.
/// </summary>
public sealed class AnswerData
{
    [JsonPropertyName("selectedOptionIds")]
    public List<string>? SelectedOptionIds { get; set; }

    [JsonPropertyName("textInput")]
    public string? TextInput { get; set; }

    [JsonPropertyName("numericalAnswer")]
    public double? NumericalAnswer { get; set; }

    [JsonPropertyName("matchingPairs")]
    public List<MatchingPair>? MatchingPairs { get; set; }

    [JsonPropertyName("dragDropOrder")]
    public List<string>? DragDropOrder { get; set; }
}

public sealed class MatchingPair
{
    [JsonPropertyName("leftId")]
    public string LeftId { get; set; } = string.Empty;

    [JsonPropertyName("rightId")]
    public string RightId { get; set; } = string.Empty;
}

/// <summary>
/// Candidate exam assignment info.
/// </summary>
public sealed class CandidateExamInfo
{
    [JsonPropertyName("examBatchId")]
    public string ExamBatchId { get; set; } = string.Empty;

    [JsonPropertyName("examName")]
    public string ExamName { get; set; } = string.Empty;

    [JsonPropertyName("durationMinutes")]
    public int DurationMinutes { get; set; }

    [JsonPropertyName("totalMarks")]
    [JsonConverter(typeof(FlexibleDoubleConverter))]
    public double TotalMarks { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("scheduledAt")]
    public string? ScheduledAt { get; set; }

    [JsonPropertyName("instructions")]
    public ExamInstructions? Instructions { get; set; }
}

public sealed class ExamInstructions
{
    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("body")]
    public string Body { get; set; } = string.Empty;

    [JsonPropertyName("rules")]
    public List<string> Rules { get; set; } = [];
}

/// <summary>
/// Handles JSON deserialization of doubles that may come as strings (PostgreSQL NUMERIC type).
/// </summary>
public sealed class FlexibleDoubleConverter : System.Text.Json.Serialization.JsonConverter<double>
{
    public override double Read(ref System.Text.Json.Utf8JsonReader reader, Type typeToConvert, System.Text.Json.JsonSerializerOptions options)
    {
        if (reader.TokenType == System.Text.Json.JsonTokenType.String)
        {
            var str = reader.GetString();
            return double.TryParse(str, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var val) ? val : 0;
        }
        return reader.GetDouble();
    }

    public override void Write(System.Text.Json.Utf8JsonWriter writer, double value, System.Text.Json.JsonSerializerOptions options)
    {
        writer.WriteNumberValue(value);
    }
}
