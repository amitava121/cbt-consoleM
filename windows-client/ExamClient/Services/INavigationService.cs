using System.Windows.Controls;

namespace CBT.ExamClient.Services;

/// <summary>
/// Navigation service for switching between views in the main frame.
/// Manages Login → ExamList → Exam → Submit → Submitted flow.
/// As specified in CLIENT_ARCHITECTURE.md Section 5.1 state machine.
/// </summary>
public interface INavigationService
{
    /// <summary>
    /// Navigates to the Login view.
    /// </summary>
    void NavigateToLogin();

    /// <summary>
    /// Navigates to the Exam List view (post-login, shows assigned exams).
    /// </summary>
    void NavigateToExamList();

    /// <summary>
    /// Navigates to the Exam view (active exam session).
    /// </summary>
    void NavigateToExam();

    /// <summary>
    /// Navigates to the Submit Confirmation view.
    /// </summary>
    void NavigateToSubmitConfirmation();

    /// <summary>
    /// Navigates to the Submitted view (exam complete).
    /// </summary>
    void NavigateToSubmitted();

    /// <summary>
    /// Navigates to the Recovery view (crash recovery detected).
    /// </summary>
    void NavigateToRecovery();

    /// <summary>
    /// Gets or sets the main frame used for navigation.
    /// </summary>
    Frame? MainFrame { get; set; }
}
