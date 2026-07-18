using System.Windows.Controls;
using CBT.ExamClient.Views;
using Serilog;

namespace CBT.ExamClient.Services;

/// <summary>
/// Concrete navigation service — manages Frame navigation between pages.
/// </summary>
public sealed class NavigationService : INavigationService
{
    public Frame? MainFrame { get; set; }

    public void NavigateToLogin()
    {
        Log.Information("Navigating to LoginView");
        MainFrame?.Navigate(new LoginView());
    }

    public void NavigateToExamList()
    {
        Log.Information("Navigating to ExamListView");
        MainFrame?.Navigate(new ExamListView());
    }

    public void NavigateToExam()
    {
        Log.Information("Navigating to ExamView");
        MainFrame?.Navigate(new ExamView());
    }

    public void NavigateToSubmitConfirmation()
    {
        Log.Information("Navigating to SubmitView");
        MainFrame?.Navigate(new SubmitView());
    }

    public void NavigateToSubmitted()
    {
        Log.Information("Navigating to SubmittedView");
        MainFrame?.Navigate(new SubmittedView());
    }

    public void NavigateToRecovery()
    {
        Log.Information("Navigating to RecoveryView");
        MainFrame?.Navigate(new RecoveryView());
    }
}
