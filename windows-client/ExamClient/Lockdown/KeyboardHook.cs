using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using CBT.Shared.Models;
using Serilog;

namespace CBT.ExamClient.Lockdown;

/// <summary>
/// Low-level keyboard hook (WH_KEYBOARD_LL) for blocking key combinations.
/// As specified in CLIENT_ARCHITECTURE.md Section 10.2.
/// Intercepts Alt+F4, Alt+Tab, PrintScreen, and other blocked keys.
/// </summary>
public sealed class KeyboardHook : IDisposable
{
    private const int WH_KEYBOARD_LL = 13;
    private const int WM_KEYDOWN = 0x0100;
    private const int WM_SYSKEYDOWN = 0x0104;

    private IntPtr _hookId = IntPtr.Zero;
    private readonly LowLevelKeyboardProc _proc;
    private readonly LockdownPolicy _policy;

    private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

    public KeyboardHook(LockdownPolicy policy)
    {
        _policy = policy;
        _proc = HookCallback;
    }

    /// <summary>
    /// Installs the keyboard hook.
    /// </summary>
    public void Install()
    {
        using var curProcess = Process.GetCurrentProcess();
        using var curModule = curProcess.MainModule!;
        _hookId = SetWindowsHookEx(WH_KEYBOARD_LL, _proc,
            GetModuleHandle(curModule.ModuleName!), 0);

        if (_hookId == IntPtr.Zero)
        {
            Log.Error("Failed to install keyboard hook. Error: {Error}", Marshal.GetLastWin32Error());
        }
    }

    private IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0 && (wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN))
        {
            var vkCode = (Keys)Marshal.ReadInt32(lParam);
            bool altPressed = (GetAsyncKeyState((int)Keys.LMenu) & 0x8000) != 0 ||
                              (GetAsyncKeyState((int)Keys.RMenu) & 0x8000) != 0;

            // Block Alt+F4
            if (_policy.BlockAltF4 && vkCode == Keys.F4 && altPressed)
            {
                Log.Warning("Lockdown violation: Alt+F4 blocked");
                return (IntPtr)1; // Suppress
            }

            // Block Alt+Tab (best effort — GPO also enforces)
            if (_policy.BlockAltTab && vkCode == Keys.Tab && altPressed)
            {
                Log.Warning("Lockdown violation: Alt+Tab blocked");
                return (IntPtr)1;
            }

            // Block PrintScreen
            if (_policy.BlockPrintScreen && vkCode == Keys.PrintScreen)
            {
                Log.Warning("Lockdown violation: PrintScreen blocked — clearing clipboard");
                try { System.Windows.Clipboard.Clear(); } catch { }
                return (IntPtr)1;
            }

            // Block Windows key
            if (vkCode == Keys.LWin || vkCode == Keys.RWin)
            {
                Log.Warning("Lockdown violation: Windows key blocked");
                return (IntPtr)1;
            }

            // Block Alt+Escape
            if (vkCode == Keys.Escape && altPressed)
            {
                Log.Warning("Lockdown violation: Alt+Escape blocked");
                return (IntPtr)1;
            }

            // Block Ctrl+Escape (Start Menu)
            bool ctrlPressed = (GetAsyncKeyState((int)Keys.LControlKey) & 0x8000) != 0 ||
                               (GetAsyncKeyState((int)Keys.RControlKey) & 0x8000) != 0;
            if (vkCode == Keys.Escape && ctrlPressed)
            {
                Log.Warning("Lockdown violation: Ctrl+Escape blocked");
                return (IntPtr)1;
            }
        }

        return CallNextHookEx(_hookId, nCode, wParam, lParam);
    }

    public void Dispose()
    {
        if (_hookId != IntPtr.Zero)
        {
            UnhookWindowsHookEx(_hookId);
            _hookId = IntPtr.Zero;
            Log.Information("Keyboard hook uninstalled");
        }
    }

    // P/Invoke declarations
    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string lpModuleName);

    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int vKey);
}
