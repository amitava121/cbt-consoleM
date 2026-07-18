using System.Windows.Controls;
using CBT.ExamClient.ViewModels;
using Microsoft.Extensions.DependencyInjection;

namespace CBT.ExamClient.Views;

/// <summary>
/// Login page — authenticates the candidate.
/// Paired with LoginViewModel per MVVM pattern.
/// </summary>
public partial class LoginView : Page
{
    public LoginView()
    {
        InitializeComponent();
        DataContext = App.Services.GetRequiredService<LoginViewModel>();

        // Wire up the PasswordBox (WPF PasswordBox doesn't support data binding for security)
        PasswordBox.PasswordChanged += (_, _) =>
        {
            if (DataContext is LoginViewModel vm)
            {
                vm.Password = PasswordBox.Password;
            }
        };
    }
}
