using System.Windows;
using System.Windows.Controls;
using CBT.ExamClient.Services;
using CBT.ExamClient.ViewModels;
using Microsoft.Extensions.DependencyInjection;

using RadioButton = System.Windows.Controls.RadioButton;
using CheckBox = System.Windows.Controls.CheckBox;
using TextBox = System.Windows.Controls.TextBox;
using Button = System.Windows.Controls.Button;

namespace CBT.ExamClient.Views;

/// <summary>
/// Exam page code-behind — handles UI events and wires them to AnswerInputService.
/// MVVM binding handles display; code-behind handles specific UI interactions
/// that require direct element access (RadioButton groups, TextBox events).
/// </summary>
public partial class ExamView : Page
{
    private readonly ExamViewModel _viewModel;
    private readonly AnswerInputService _answerInput;

    public ExamView()
    {
        InitializeComponent();
        _viewModel = App.Services.GetRequiredService<ExamViewModel>();
        _answerInput = App.Services.GetRequiredService<AnswerInputService>();
        DataContext = _viewModel;
    }

    /// <summary>
    /// MCQ Single — radio button clicked.
    /// Immediate save per CLIENT_ARCHITECTURE.md §6.3.
    /// </summary>
    private async void OnMcqOptionClicked(object sender, RoutedEventArgs e)
    {
        if (sender is RadioButton rb && rb.Tag is string optionId && _viewModel.CurrentQuestion is not null)
        {
            await _answerInput.OnOptionSelectedAsync(
                _viewModel.CurrentQuestion.Id,
                [optionId],
                GetCurrentTimeSpent(),
                GetCurrentMarkedStatus());

            UpdatePaletteAnswered();
        }
    }

    /// <summary>
    /// MCQ Multiple — checkbox clicked.
    /// Immediate save per CLIENT_ARCHITECTURE.md §6.3.
    /// </summary>
    private async void OnMcqMultipleOptionClicked(object sender, RoutedEventArgs e)
    {
        if (_viewModel.CurrentQuestion is null) return;

        // Collect all checked options
        var selectedIds = new List<string>();
        // Walk up to find the ItemsControl and check all CheckBoxes
        if (sender is CheckBox)
        {
            var parent = (sender as FrameworkElement)?.Parent;
            while (parent is not null && parent is not ItemsControl)
            {
                parent = (parent as FrameworkElement)?.Parent as DependencyObject;
            }
            // For simplicity, track via ViewModel binding
        }

        // Use the ViewModel's palette to track selected options
        if (sender is CheckBox cb && cb.Tag is string optionId)
        {
            var currentSelected = _viewModel.GetSelectedOptionIds();
            if (cb.IsChecked == true)
                currentSelected.Add(optionId);
            else
                currentSelected.Remove(optionId);

            await _answerInput.OnOptionSelectedAsync(
                _viewModel.CurrentQuestion.Id,
                currentSelected,
                GetCurrentTimeSpent(),
                GetCurrentMarkedStatus());

            UpdatePaletteAnswered();
        }
    }

    /// <summary>
    /// Text answer (essay/fill-in) changed — debounced 500ms.
    /// CLIENT_ARCHITECTURE.md §6.3: "Text input — Debounced (500ms after last keystroke)"
    /// </summary>
    private void OnTextAnswerChanged(object sender, TextChangedEventArgs e)
    {
        if (_viewModel.CurrentQuestion is null) return;
        var text = (sender as TextBox)?.Text ?? string.Empty;

        _answerInput.OnTextInputChanged(
            _viewModel.CurrentQuestion.Id,
            text,
            GetCurrentTimeSpent(),
            GetCurrentMarkedStatus());

        if (!string.IsNullOrWhiteSpace(text))
            UpdatePaletteAnswered();
    }

    /// <summary>
    /// Numerical answer changed — debounced via text change.
    /// </summary>
    private void OnNumericalAnswerChanged(object sender, TextChangedEventArgs e)
    {
        if (_viewModel.CurrentQuestion is null) return;
        var text = (sender as TextBox)?.Text ?? string.Empty;

        if (double.TryParse(text, out var value))
        {
            _answerInput.OnTextInputChanged(
                _viewModel.CurrentQuestion.Id,
                text,
                GetCurrentTimeSpent(),
                GetCurrentMarkedStatus());

            UpdatePaletteAnswered();
        }
    }

    /// <summary>
    /// True/False option clicked.
    /// </summary>
    private async void OnTrueFalseClicked(object sender, RoutedEventArgs e)
    {
        if (sender is RadioButton rb && rb.Tag is string value && _viewModel.CurrentQuestion is not null)
        {
            await _answerInput.OnOptionSelectedAsync(
                _viewModel.CurrentQuestion.Id,
                [value],
                GetCurrentTimeSpent(),
                GetCurrentMarkedStatus());

            UpdatePaletteAnswered();
        }
    }

    /// <summary>
    /// Palette item clicked — navigate to that question.
    /// </summary>
    private void OnPaletteItemClicked(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is int qNum)
        {
            _viewModel.GoToQuestionCommand.Execute(qNum - 1); // Convert 1-based to 0-based index
        }
    }

    /// <summary>
    /// Clear answer for current question.
    /// </summary>
    private async void OnClearAnswerClicked(object sender, RoutedEventArgs e)
    {
        if (_viewModel.CurrentQuestion is null) return;

        // Clear via AnswerInputService with null/empty answer
        await _answerInput.OnOptionSelectedAsync(
            _viewModel.CurrentQuestion.Id,
            [],
            GetCurrentTimeSpent(),
            GetCurrentMarkedStatus());

        // Update palette to "visited" (not answered)
        var item = _viewModel.QuestionPalette.FirstOrDefault(
            p => p.QuestionId == _viewModel.CurrentQuestion.Id);
        if (item is not null)
        {
            item.AnswerStatus = CBT.Shared.Models.AnswerStatus.Visited;
            item.AnswerDataJson = null;
        }
    }

    private void UpdatePaletteAnswered()
    {
        if (_viewModel.CurrentQuestion is null) return;
        var item = _viewModel.QuestionPalette.FirstOrDefault(
            p => p.QuestionId == _viewModel.CurrentQuestion.Id);
        if (item is not null)
        {
            item.AnswerStatus = item.IsMarkedForReview
                ? CBT.Shared.Models.AnswerStatus.AnsweredAndMarked
                : CBT.Shared.Models.AnswerStatus.Answered;
        }
    }

    private int GetCurrentTimeSpent()
    {
        if (_viewModel.CurrentQuestion is null) return 0;
        var item = _viewModel.QuestionPalette.FirstOrDefault(
            p => p.QuestionId == _viewModel.CurrentQuestion.Id);
        return item?.TimeSpentSecs ?? 0;
    }

    private bool GetCurrentMarkedStatus()
    {
        if (_viewModel.CurrentQuestion is null) return false;
        var item = _viewModel.QuestionPalette.FirstOrDefault(
            p => p.QuestionId == _viewModel.CurrentQuestion.Id);
        return item?.IsMarkedForReview ?? false;
    }
}
