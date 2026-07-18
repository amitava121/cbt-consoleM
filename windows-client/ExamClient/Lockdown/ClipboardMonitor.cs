using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using Serilog;

using Clipboard = System.Windows.Clipboard;

namespace CBT.ExamClient.Lockdown;

/// <summary>
/// Monitors and blocks clipboard access during exams.
/// As specified in CLIENT_ARCHITECTURE.md Section 10.1:
/// "Clipboard disabled — AddClipboardFormatListener; clear on change"
/// 
/// Uses Win32 AddClipboardFormatListener to receive WM_CLIPBOARDUPDATE messages.
/// When clipboard content changes, immediately clears it.
/// </summary>
public sealed class ClipboardMonitor : IDisposable
{
    private const int WM_CLIPBOARDUPDATE = 0x031D;

    private IntPtr _hwnd;
    private HwndSource? _hwndSource;
    private bool _isMonitoring;

    /// <summary>
    /// Raised when a clipboard access attempt is detected and blocked.
    /// </summary>
    public event EventHandler? ClipboardViolationDetected;

    /// <summary>
    /// Starts monitoring the clipboard. Must be called after the window is initialized.
    /// </summary>
    /// <param name="window">The main WPF window</param>
    public void Start(Window window)
    {
        if (_isMonitoring) return;

        _hwnd = new WindowInteropHelper(window).Handle;
        _hwndSource = HwndSource.FromHwnd(_hwnd);
        _hwndSource?.AddHook(WndProc);

        // Register for clipboard notifications
        if (!AddClipboardFormatListener(_hwnd))
        {
            Log.Error("Failed to register clipboard listener. Error: {Error}",
                Marshal.GetLastWin32Error());
            return;
        }

        // Clear clipboard immediately on start
        ClearClipboard();

        _isMonitoring = true;
        Log.Information("Clipboard monitor started");
    }

    /// <summary>
    /// Stops monitoring the clipboard.
    /// </summary>
    public void Stop()
    {
        if (!_isMonitoring) return;

        RemoveClipboardFormatListener(_hwnd);
        _hwndSource?.RemoveHook(WndProc);
        _isMonitoring = false;

        Log.Information("Clipboard monitor stopped");
    }

    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == WM_CLIPBOARDUPDATE)
        {
            Log.Warning("Clipboard change detected — clearing clipboard");
            ClearClipboard();
            ClipboardViolationDetected?.Invoke(this, EventArgs.Empty);
            handled = true;
        }

        return IntPtr.Zero;
    }

    private static void ClearClipboard()
    {
        try
        {
            Clipboard.Clear();
        }
        catch (Exception ex)
        {
            // Clipboard may be locked by another process
            Log.Debug(ex, "Failed to clear clipboard — may be locked");
        }
    }

    public void Dispose()
    {
        Stop();
    }

    // P/Invoke
    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool AddClipboardFormatListener(IntPtr hwnd);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool RemoveClipboardFormatListener(IntPtr hwnd);
}
