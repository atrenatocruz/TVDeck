// TVDeck.exe: one click to get the TV launcher.
// - TVDeck already running: touches <data>\home.request, and the server brings the launcher forward.
// - Not running: starts it hidden (the "TVDeck" logon task if installed, else scripts\tvdeck-hidden.vbs);
//   the server opens the launcher by itself.
// Built by `npm run app:build` (scripts/build-app.mjs) with the C# compiler that ships with Windows.
using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Windows.Forms;

static class TVDeckApp
{
    [STAThread]
    static int Main()
    {
        string root = Path.GetDirectoryName(Path.GetDirectoryName(Application.ExecutablePath));
        string dataDir = Environment.GetEnvironmentVariable("TVDECK_DATA_DIR");
        if (string.IsNullOrEmpty(dataDir))
            dataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "TVDeck");
        int port;
        if (!int.TryParse(Environment.GetEnvironmentVariable("TVDECK_PORT"), out port)) port = 7420;

        if (IsListening(port))
        {
            Directory.CreateDirectory(dataDir);
            File.WriteAllText(Path.Combine(dataDir, "home.request"), DateTime.UtcNow.ToString("o"));
            return 0;
        }

        if (!File.Exists(Path.Combine(root, "packages", "launcher", "dist", "index.html")) ||
            !File.Exists(Path.Combine(root, "packages", "remote", "dist", "index.html")))
        {
            MessageBox.Show("TVDeck isn't built yet. In the TVDeck folder run:\n\n    npm run build",
                "TVDeck", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 1;
        }

        if (Run("schtasks.exe", "/run /tn TVDeck") == 0) return 0;

        string vbs = Path.Combine(root, "scripts", "tvdeck-hidden.vbs");
        Process.Start(new ProcessStartInfo("wscript.exe", "//B //Nologo \"" + vbs + "\"")
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = root,
        });
        return 0;
    }

    static bool IsListening(int port)
    {
        try
        {
            using (var c = new TcpClient())
            {
                var ar = c.BeginConnect("127.0.0.1", port, null, null);
                bool ok = ar.AsyncWaitHandle.WaitOne(600) && c.Connected;
                if (ok) c.EndConnect(ar);
                return ok;
            }
        }
        catch
        {
            return false;
        }
    }

    static int Run(string file, string args)
    {
        try
        {
            var p = Process.Start(new ProcessStartInfo(file, args)
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            });
            p.WaitForExit(5000);
            return p.HasExited ? p.ExitCode : -1;
        }
        catch
        {
            return -1;
        }
    }
}
