using System.Windows.Controls;
using CBT.ExamClient.ViewModels;
using Microsoft.Extensions.DependencyInjection;

namespace CBT.ExamClient.Views;

/// <summary>
/// Exam list page — shows assigned exams after login.
/// Paired with ExamListViewModel.
/// </summary>
public partial class ExamListView : Page
{
    public ExamListView()
    {
        InitializeComponent();
        DataContext = App.Services.GetRequiredService<ExamListViewModel>();
    }

    private async void OnPageLoaded(object sender, System.Windows.RoutedEventArgs e)
    {
        if (DataContext is ExamListViewModel vm)
        {
            await vm.LoadExamsCommand.ExecuteAsync(null);
        }
    }
}
