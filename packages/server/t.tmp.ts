import { native as n } from "./src/win32/user32.ts";
const fg = n.GetForegroundWindow();
const t = n.GetWindowThreadProcessId(fg);
console.log(fg, JSON.stringify(n.GetWindowText(fg)), n.GetClassName(fg), t, n.ProcessImagePath(t.pid), n.GetCursorPos(), n.GetCurrentThreadId());
let c = 0;
n.EnumWindows(() => { c++; });
console.log("windows", c);
console.log("empty send", n.SendInput([]));
