using System.Diagnostics;

namespace ExamLauncher;

class Program
{
    static int Main(string[] args)
    {
        // ExamLauncher is the native AOT watchdog process.
        // Its job is to launch the WPF exam client, ensure it stays alive,
        // enforce lockdown policies, and report status to the backend.
        Console.WriteLine("ExamLauncher watchdog started.");

        string clientPath = args.Length > 0 ? args[0] : "CBEConsoleClient.exe";
        if (!File.Exists(clientPath))
        {
            Console.WriteLine($"Client executable not found: {clientPath}");
            return 1;
        }

        var startInfo = new ProcessStartInfo(clientPath)
        {
            UseShellExecute = false,
        };

        using var process = Process.Start(startInfo);
        if (process is null)
        {
            Console.WriteLine("Failed to start client process.");
            return 2;
        }

        Console.WriteLine($"Client started with PID {process.Id}. Watching...");
        process.WaitForExit();
        Console.WriteLine($"Client exited with code {process.ExitCode}.");
        return process.ExitCode;
    }
}
