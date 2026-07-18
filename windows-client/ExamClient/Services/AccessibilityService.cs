using System.Windows;
using Serilog;

using Application = System.Windows.Application;

namespace CBT.ExamClient.Services;

/// <summary>
/// Accessibility service providing theme switching and font scaling.
/// As specified in CLIENT_ARCHITECTURE.md Section 13.
/// 
/// Features:
/// - High-contrast mode (ResourceDictionary theme toggle)
/// - Font size adjustment (3 levels: small/medium/large via DynamicResource)
/// - Keyboard navigation (Tab/Enter/Space for all interactions)
/// - Multi-language support (resource files + CultureInfo)
/// </summary>
public sealed class AccessibilityService
{
    private const string DefaultThemePath = "Resources/Themes/DefaultTheme.xaml";
    private const string HighContrastThemePath = "Resources/Themes/HighContrastTheme.xaml";

    private FontScale _currentFontScale = FontScale.Medium;
    private bool _isHighContrast;

    /// <summary>
    /// Current font scale level.
    /// </summary>
    public FontScale CurrentFontScale => _currentFontScale;

    /// <summary>
    /// Whether high-contrast mode is active.
    /// </summary>
    public bool IsHighContrast => _isHighContrast;

    /// <summary>
    /// Toggles high-contrast mode on/off.
    /// CLIENT_ARCHITECTURE.md §13: "ResourceDictionary theme toggle; WPF HighContrast theme support"
    /// </summary>
    public void ToggleHighContrast()
    {
        _isHighContrast = !_isHighContrast;

        var app = Application.Current;
        if (app is null) return;

        // Remove current theme
        var toRemove = app.Resources.MergedDictionaries
            .FirstOrDefault(d => d.Source?.OriginalString.Contains("Theme") == true);
        if (toRemove is not null)
        {
            app.Resources.MergedDictionaries.Remove(toRemove);
        }

        // Add new theme
        var themePath = _isHighContrast ? HighContrastThemePath : DefaultThemePath;
        app.Resources.MergedDictionaries.Add(new ResourceDictionary
        {
            Source = new Uri(themePath, UriKind.Relative)
        });

        Log.Information("Theme switched to {Theme}", _isHighContrast ? "HighContrast" : "Default");
    }

    /// <summary>
    /// Sets the font scale level (small, medium, large).
    /// CLIENT_ARCHITECTURE.md §13: "3 levels (small/medium/large); DynamicResource font scaling"
    /// </summary>
    public void SetFontScale(FontScale scale)
    {
        _currentFontScale = scale;

        var app = Application.Current;
        if (app is null) return;

        var (small, medium, large) = scale switch
        {
            FontScale.Small => (11.0, 13.0, 15.0),
            FontScale.Medium => (12.0, 14.0, 16.0),
            FontScale.Large => (14.0, 17.0, 20.0),
            _ => (12.0, 14.0, 16.0)
        };

        app.Resources["FontSizeSmall"] = small;
        app.Resources["FontSizeMedium"] = medium;
        app.Resources["FontSizeLarge"] = large;

        Log.Information("Font scale set to {Scale}", scale);
    }

    /// <summary>
    /// Cycles to the next font scale (Small → Medium → Large → Small).
    /// </summary>
    public void CycleFontScale()
    {
        var next = _currentFontScale switch
        {
            FontScale.Small => FontScale.Medium,
            FontScale.Medium => FontScale.Large,
            FontScale.Large => FontScale.Small,
            _ => FontScale.Medium
        };
        SetFontScale(next);
    }
}

/// <summary>
/// Font scale levels for accessibility.
/// </summary>
public enum FontScale
{
    Small,
    Medium,
    Large
}
