// TVDeckKeyboard.exe: the on-screen TV keyboard and text-field detector, driven by the TVDeck server.
//
// stdout (one JSON object per line):
//   {"ev":"focus","edit":true,"password":false,"pid":123}   a text field got focus (UI Automation)
//   {"ev":"focus","edit":false,"pid":123}                    focus moved to something else
//   {"ev":"text","text":"a"}  {"ev":"key","key":"backspace|enter"}  {"ev":"closed"}
// stdin (one command per line): show [password] | hide | nav up|down|left|right | ok | back | quit
//
// The window never takes focus (WS_EX_NOACTIVATE), so the text field keeps it and the server can type
// into it with SendInput. Built by the server on first use (or `npm run app:build`).
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Automation;
using System.Windows.Forms;

static class Program
{
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    static readonly object outLock = new object();
    static readonly System.IO.StreamWriter stdout = new System.IO.StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true };

    public static void Emit(string json)
    {
        lock (outLock) { stdout.Write(json + "\n"); }
    }

    public static string Esc(string s)
    {
        var b = new StringBuilder();
        foreach (char c in s)
        {
            if (c == '"' || c == '\\') b.Append('\\').Append(c);
            else if (c < 0x20) b.AppendFormat("\\u{0:x4}", (int)c);
            else b.Append(c);
        }
        return b.ToString();
    }

    [STAThread]
    static void Main()
    {
        SetProcessDPIAware();
        Application.EnableVisualStyles();
        var kb = new KeyboardForm();
        var handle = kb.Handle; // create the window so Invoke works before it is shown

        var watcher = new Thread(FocusWatcher.Run) { IsBackground = true };
        watcher.SetApartmentState(ApartmentState.MTA);
        watcher.Start();

        var reader = new Thread(() =>
        {
            string line;
            var stdin = new System.IO.StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
            while ((line = stdin.ReadLine()) != null)
            {
                string cmd = line.Trim();
                if (cmd.Length == 0) continue;
                try { kb.BeginInvoke((Action)(() => kb.Command(cmd))); } catch { }
                if (cmd == "quit") break;
            }
            try { kb.BeginInvoke((Action)(() => Application.Exit())); } catch { }
        }) { IsBackground = true };
        reader.Start();

        Application.Run();
    }
}

static class FocusWatcher
{
    public static void Run()
    {
        try
        {
            Automation.AddAutomationFocusChangedEventHandler((s, e) =>
            {
                try
                {
                    var el = s as AutomationElement;
                    if (el == null) return;
                    var info = el.Current;
                    bool edit = false;
                    if (info.ControlType == ControlType.Edit || info.ControlType == ControlType.ComboBox)
                    {
                        object vp;
                        edit = !el.TryGetCurrentPattern(ValuePattern.Pattern, out vp) || !((ValuePattern)vp).Current.IsReadOnly;
                    }
                    if (edit)
                        Program.Emit("{\"ev\":\"focus\",\"edit\":true,\"password\":" + (info.IsPassword ? "true" : "false") + ",\"pid\":" + info.ProcessId + "}");
                    else
                        Program.Emit("{\"ev\":\"focus\",\"edit\":false,\"pid\":" + info.ProcessId + "}");
                }
                catch { }
            });
        }
        catch (Exception ex)
        {
            Program.Emit("{\"ev\":\"error\",\"message\":\"" + Program.Esc(ex.Message) + "\"}");
        }
    }
}

class Key
{
    public string Label;   // what is drawn
    public string Action;  // "t:<text>" types, or a command: shift, layer:<name>, backspace, space, enter, close
    public float Width;    // in key units
    public RectangleF Rect;
    public Key(string label, string action, float width = 1f) { Label = label; Action = action; Width = width; }
}

class KeyboardForm : Form
{
    const int WS_EX_NOACTIVATE = 0x08000000, WS_EX_TOOLWINDOW = 0x00000080, WS_EX_TOPMOST = 0x00000008;
    const int WM_MOUSEACTIVATE = 0x0021, MA_NOACTIVATE = 3;

    string layer = "abc";
    bool shift, password;
    int row, col;
    readonly StringBuilder typed = new StringBuilder();
    List<List<Key>> rows = new List<List<Key>>();

    static readonly Color Bg = Color.FromArgb(255, 20, 20, 24);
    static readonly Color KeyBg = Color.FromArgb(255, 44, 44, 52);
    static readonly Color KeyBg2 = Color.FromArgb(255, 34, 34, 40);
    static readonly Color Text1 = Color.FromArgb(255, 245, 245, 247);
    static readonly Color Text2 = Color.FromArgb(160, 255, 255, 255);

    public KeyboardForm()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        BackColor = Bg;
        DoubleBuffered = true;
        Text = "TVDeck Keyboard";
        Build();
        MouseClick += (s, e) =>
        {
            for (int r = 0; r < rows.Count; r++)
                for (int c = 0; c < rows[r].Count; c++)
                    if (rows[r][c].Rect.Contains(e.Location)) { row = r; col = c; Invalidate(); Press(); return; }
        };
    }

    protected override bool ShowWithoutActivation { get { return true; } }

    protected override CreateParams CreateParams
    {
        get { var cp = base.CreateParams; cp.ExStyle |= WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_TOPMOST; return cp; }
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WM_MOUSEACTIVATE) { m.Result = (IntPtr)MA_NOACTIVATE; return; }
        base.WndProc(ref m);
    }

    static List<Key> Chars(string s) { var l = new List<Key>(); foreach (char c in s) l.Add(new Key(c.ToString(), "t:" + c)); return l; }

    void Build()
    {
        rows = new List<List<Key>>();
        if (layer == "abc")
        {
            rows.Add(Chars("1234567890"));
            rows.Add(Chars("qwertyuiop"));
            rows.Add(Chars("asdfghjklç"));
            var r4 = new List<Key> { new Key("⇧", "shift", 1.5f) }; r4.AddRange(Chars("zxcvbnm")); r4.Add(new Key("⌫", "backspace", 1.5f));
            rows.Add(r4);
            if (shift) foreach (var r in rows) foreach (var k in r) if (k.Action.StartsWith("t:")) { k.Label = k.Label.ToUpperInvariant(); k.Action = "t:" + k.Label; }
        }
        else if (layer == "sym")
        {
            rows.Add(Chars("1234567890"));
            rows.Add(Chars("!\"#$%&/()="));
            rows.Add(Chars("?'+*-_:;,<"));
            var r4 = new List<Key> { new Key(">", "t:>") }; r4.AddRange(Chars("[]{}\\|~^€")); r4.Add(new Key("⌫", "backspace", 1.5f));
            rows.Add(r4);
        }
        else
        {
            rows.Add(Chars("áàâãéêíóôõ"));
            rows.Add(Chars("úüçñ€£«»¿¡"));
            rows.Add(Chars("ÁÀÂÃÉÊÍÓÔÕ"));
            var r4 = new List<Key>(); r4.AddRange(Chars("ÚÜÇÑ°ºª§")); r4.Add(new Key("⌫", "backspace", 1.5f));
            rows.Add(r4);
        }
        rows.Add(new List<Key>
        {
            new Key(layer == "abc" ? "?123" : "abc", layer == "abc" ? "layer:sym" : "layer:abc", 1.5f),
            new Key("áç", layer == "acc" ? "layer:abc" : "layer:acc", 1.2f),
            new Key("@", "t:@"),
            new Key("space", "space", 3.6f),
            new Key(".", "t:."),
            new Key(".com", "t:.com", 1.4f),
            new Key("Enter", "enter", 1.8f),
        });
        if (row >= rows.Count) row = rows.Count - 1;
        if (col >= rows[row].Count) col = rows[row].Count - 1;
        Layout2();
    }

    void Layout2()
    {
        var scr = Screen.PrimaryScreen.Bounds;
        int w = (int)(scr.Width * 0.64), h = (int)(scr.Height * 0.44);
        Bounds = new Rectangle(scr.Left + (scr.Width - w) / 2, scr.Bottom - h - (int)(scr.Height * 0.04), w, h);
        using (var path = Round(new RectangleF(0, 0, w, h), h * 0.07f)) Region = new Region(path);

        float pad = w * 0.025f, top = h * 0.2f, gap = w * 0.009f;
        float rowH = (h - top - pad - gap * (rows.Count - 1)) / rows.Count;
        for (int r = 0; r < rows.Count; r++)
        {
            float units = 0; foreach (var k in rows[r]) units += k.Width;
            float unitW = (w - 2 * pad - gap * (rows[r].Count - 1)) / Math.Max(units, 10f);
            float rowW = units * unitW + gap * (rows[r].Count - 1);
            float x = (w - rowW) / 2, y = top + r * (rowH + gap);
            foreach (var k in rows[r]) { k.Rect = new RectangleF(x, y, k.Width * unitW, rowH); x += k.Width * unitW + gap; }
        }
    }

    static GraphicsPath Round(RectangleF r, float rad)
    {
        var p = new GraphicsPath(); float d = rad * 2;
        p.AddArc(r.X, r.Y, d, d, 180, 90); p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90); p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        p.CloseFigure(); return p;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
        float h = Height;
        using (var titleFont = new Font("Segoe UI", h * 0.045f, FontStyle.Regular, GraphicsUnit.Pixel))
        using (var typedFont = new Font("Segoe UI Semibold", h * 0.06f, FontStyle.Regular, GraphicsUnit.Pixel))
        using (var b2 = new SolidBrush(Text2))
        using (var b1 = new SolidBrush(Text1))
        {
            float x = Width * 0.03f;
            g.DrawString(password ? "Password" : "Keyboard", titleFont, b2, x, h * 0.035f);
            string shown = password ? new string('•', typed.Length) : typed.ToString();
            if (shown.Length > 48) shown = "…" + shown.Substring(shown.Length - 48);
            g.DrawString(shown + "▏", typedFont, b1, x, h * 0.09f);
            string hint = "OK type · Back close";
            var sz = g.MeasureString(hint, titleFont);
            g.DrawString(hint, titleFont, b2, Width - x - sz.Width, h * 0.035f);
        }
        for (int r = 0; r < rows.Count; r++)
            for (int c = 0; c < rows[r].Count; c++)
            {
                var k = rows[r][c];
                bool sel = r == row && c == col;
                bool special = !k.Action.StartsWith("t:") || k.Label.Length > 1;
                var rect = k.Rect;
                if (sel) rect.Inflate(rect.Height * 0.06f, rect.Height * 0.06f);
                using (var path = Round(rect, rect.Height * 0.22f))
                using (var fill = new SolidBrush(sel ? Color.FromArgb(255, 245, 245, 247) : (special ? KeyBg2 : KeyBg)))
                    g.FillPath(fill, path);
                bool on = k.Action == "shift" && shift;
                using (var f = new Font("Segoe UI Semibold", rect.Height * (k.Label.Length > 2 ? 0.3f : 0.42f), FontStyle.Regular, GraphicsUnit.Pixel))
                using (var tb = new SolidBrush(sel ? Color.FromArgb(255, 16, 16, 20) : (on ? Color.FromArgb(255, 120, 200, 255) : Text1)))
                {
                    var fmt = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
                    g.DrawString(k.Label, f, tb, rect, fmt);
                }
            }
    }

    public void Command(string cmd)
    {
        if (cmd.StartsWith("show"))
        {
            password = cmd.Contains("password");
            typed.Clear(); layer = "abc"; shift = false; row = 1; col = 0; Build();
            if (!Visible) Show();
            Invalidate();
        }
        else if (cmd == "hide") { if (Visible) Hide(); }
        else if (cmd.StartsWith("nav ")) MoveSel(cmd.Substring(4));
        else if (cmd == "ok") Press();
        else if (cmd == "back") { Hide(); Program.Emit("{\"ev\":\"closed\"}"); }
    }

    void MoveSel(string dir)
    {
        if (dir == "left") col = (col - 1 + rows[row].Count) % rows[row].Count;
        else if (dir == "right") col = (col + 1) % rows[row].Count;
        else
        {
            var cur = rows[row][col].Rect;
            float cx = cur.X + cur.Width / 2;
            int nr = dir == "up" ? row - 1 : row + 1;
            if (nr < 0 || nr >= rows.Count) return;
            int best = 0; float bestD = float.MaxValue;
            for (int c = 0; c < rows[nr].Count; c++)
            {
                var k = rows[nr][c].Rect; float d = Math.Abs(k.X + k.Width / 2 - cx);
                if (d < bestD) { bestD = d; best = c; }
            }
            row = nr; col = best;
        }
        Invalidate();
    }

    void Press()
    {
        var k = rows[row][col];
        string a = k.Action;
        if (a.StartsWith("t:"))
        {
            string t = a.Substring(2);
            typed.Append(t);
            Program.Emit("{\"ev\":\"text\",\"text\":\"" + Program.Esc(t) + "\"}");
            if (shift && layer == "abc") { shift = false; Build(); }
        }
        else if (a == "space") { typed.Append(' '); Program.Emit("{\"ev\":\"text\",\"text\":\" \"}"); }
        else if (a == "backspace") { if (typed.Length > 0) typed.Length--; Program.Emit("{\"ev\":\"key\",\"key\":\"backspace\"}"); }
        else if (a == "enter") { Program.Emit("{\"ev\":\"key\",\"key\":\"enter\"}"); Hide(); Program.Emit("{\"ev\":\"closed\"}"); }
        else if (a == "shift") { shift = !shift; Build(); }
        else if (a.StartsWith("layer:")) { layer = a.Substring(6); shift = false; row = 0; col = 0; Build(); }
        Invalidate();
    }
}
