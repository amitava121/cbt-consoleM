using System.Windows.Controls;
using CBT.ExamClient.ViewModels;
using Microsoft.Extensions.DependencyInjection;

namespace CBT.ExamClient.Views;

/// <summary>
/// Submit confirmation page — shows exam summary before final submission.
/// Paired with SubmitViewModel per MVVM pattern.
/// </summary>
public partial class SubmitView : Page
{
    public SubmitView()
    {
        InitializeComponent();
        DataContext = App.Services.GetRequiredService<SubmitViewModel>();
    }
}
