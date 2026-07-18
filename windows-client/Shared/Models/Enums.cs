namespace CBT.Shared.Models;

/// <summary>
/// User roles as defined in DATABASE_DESIGN.md Section 3.
/// </summary>
public enum UserRole
{
    SuperAdmin,
    ExamAdmin,
    Proctor,
    QuestionAuthor,
    Candidate
}

/// <summary>
/// Question types supported by the platform.
/// </summary>
public enum QuestionType
{
    McqSingle,
    McqMultiple,
    FillInBlank,
    Essay,
    TrueFalse,
    Matching,
    AssertionReason,
    Comprehension,
    DragDrop,
    ImageBased,
    AudioVideo,
    Numerical,
    MatrixMatch
}

/// <summary>
/// Difficulty levels for questions.
/// </summary>
public enum DifficultyLevel
{
    Easy,
    Medium,
    Hard,
    VeryHard
}

/// <summary>
/// Exam batch lifecycle status.
/// </summary>
public enum ExamStatus
{
    Draft,
    Scheduled,
    Published,
    Active,
    Paused,
    SubmissionWindow,
    Finished,
    ResultsPublished,
    Archived
}

/// <summary>
/// Attempt status as defined in DATABASE_DESIGN.md and API_SPECIFICATION.md.
/// </summary>
public enum AttemptStatus
{
    NotStarted,
    InProgress,
    Paused,
    Submitted,
    AutoSubmitted,
    ForceSubmitted,
    Terminated,
    Abandoned
}

/// <summary>
/// Answer status for question palette display.
/// </summary>
public enum AnswerStatus
{
    NotVisited,
    Visited,
    Answered,
    MarkedForReview,
    AnsweredAndMarked
}

/// <summary>
/// Exam state machine states as defined in CLIENT_ARCHITECTURE.md Section 5.
/// </summary>
public enum ExamState
{
    Idle,
    Loading,
    InProgress,
    Paused,
    Offline,
    SubmitConfirm,
    Submitting,
    Submitted,
    AutoSubmitted,
    Terminated
}

/// <summary>
/// Sync status for local answers.
/// </summary>
public enum SyncStatus
{
    SavedLocal,
    Syncing,
    Synced,
    PendingSync
}

/// <summary>
/// Navigation mode for exams.
/// </summary>
public enum NavigationMode
{
    Free,
    Linear,
    SectionFree
}

/// <summary>
/// Violation severity levels.
/// </summary>
public enum ViolationSeverity
{
    Low,
    Medium,
    High,
    Critical
}
