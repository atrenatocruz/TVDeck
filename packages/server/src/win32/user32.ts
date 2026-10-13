/**
 * koffi bindings for the handful of user32/kernel32 calls TVDeck needs.
 * On non-Windows platforms a logging stub with the same shape is exported so
 * unit tests and typecheck still work.
 */
import koffi from "koffi";

export interface InputRecord {
  type: number; // 0 mouse, 1 keyboard
  u: {
    mi?: { dx: number; dy: number; mouseData: number; dwFlags: number; time: number; dwExtraInfo: number };
    ki?: { wVk: number; wScan: number; dwFlags: number; time: number; dwExtraInfo: number };
  };
}

export interface Native {
  available: boolean;
  SendInput(inputs: InputRecord[]): number;
  MapVirtualKeyW(code: number, mapType: number): number;
  GetForegroundWindow(): number;
  SetForegroundWindow(hwnd: number): boolean;
  BringWindowToTop(hwnd: number): boolean;
  ShowWindow(hwnd: number, cmd: number): boolean;
  IsIconic(hwnd: number): boolean;
  IsWindow(hwnd: number): boolean;
  IsWindowVisible(hwnd: number): boolean;
  GetWindowText(hwnd: number): string;
  GetClassName(hwnd: number): string;
  GetWindowThreadProcessId(hwnd: number): { tid: number; pid: number };
  AttachThreadInput(from: number, to: number, attach: boolean): boolean;
  AllowSetForegroundWindow(pid: number): boolean;
  EnumWindows(cb: (hwnd: number) => void): void;
  PostMessage(hwnd: number, msg: number, wparam: number, lparam: number): boolean;
  GetCurrentThreadId(): number;
  GetCursorPos(): { x: number; y: number };
  ProcessImagePath(pid: number): string | null;
}

export const WM_CLOSE = 0x0010;
export const SW_MINIMIZE = 6;
export const SW_RESTORE = 9;

function makeStub(): Native {
  const warn = (n: string) => console.warn(`[win32] ${n} ignored: not running on Windows`);
  return {
    available: false,
    SendInput: () => (warn("SendInput"), 0),
    MapVirtualKeyW: () => 0,
    GetForegroundWindow: () => 0,
    SetForegroundWindow: () => false,
    BringWindowToTop: () => false,
    ShowWindow: () => false,
    IsIconic: () => false,
    IsWindow: () => false,
    IsWindowVisible: () => false,
    GetWindowText: () => "",
    GetClassName: () => "",
    GetWindowThreadProcessId: () => ({ tid: 0, pid: 0 }),
    AttachThreadInput: () => false,
    AllowSetForegroundWindow: () => false,
    EnumWindows: () => {},
    PostMessage: () => false,
    GetCurrentThreadId: () => 0,
    GetCursorPos: () => ({ x: 0, y: 0 }),
    ProcessImagePath: () => null,
  };
}

function makeNative(): Native {
  const user32 = koffi.load("user32.dll");
  const kernel32 = koffi.load("kernel32.dll");

  // intptr_t stands in for HWND/HANDLE so values round-trip as plain JS numbers.
  const MOUSEINPUT = koffi.struct("MOUSEINPUT", {
    dx: "int32", dy: "int32", mouseData: "uint32", dwFlags: "uint32", time: "uint32", dwExtraInfo: "uintptr_t",
  });
  const KEYBDINPUT = koffi.struct("KEYBDINPUT", {
    wVk: "uint16", wScan: "uint16", dwFlags: "uint32", time: "uint32", dwExtraInfo: "uintptr_t",
  });
  const HARDWAREINPUT = koffi.struct("HARDWAREINPUT", { uMsg: "uint32", wParamL: "uint16", wParamH: "uint16" });
  const INPUT_U = koffi.union("INPUT_U", { mi: MOUSEINPUT, ki: KEYBDINPUT, hi: HARDWAREINPUT });
  const INPUT = koffi.struct("INPUT", { type: "uint32", u: INPUT_U });
  const INPUT_SIZE = koffi.sizeof(INPUT);
  if (INPUT_SIZE !== 40) throw new Error(`INPUT struct is ${INPUT_SIZE} bytes, expected 40 (x64 only)`);
  koffi.struct("POINT", { x: "int32", y: "int32" });

  const EnumProc = koffi.proto("bool __stdcall EnumWindowsProc(intptr_t hwnd, intptr_t lparam)");

  const f = {
    SendInput: user32.func("uint32 __stdcall SendInput(uint32 cInputs, INPUT *pInputs, int cbSize)"),
    MapVirtualKeyW: user32.func("uint32 __stdcall MapVirtualKeyW(uint32 code, uint32 mapType)"),
    GetForegroundWindow: user32.func("intptr_t __stdcall GetForegroundWindow()"),
    SetForegroundWindow: user32.func("bool __stdcall SetForegroundWindow(intptr_t hwnd)"),
    BringWindowToTop: user32.func("bool __stdcall BringWindowToTop(intptr_t hwnd)"),
    ShowWindow: user32.func("bool __stdcall ShowWindow(intptr_t hwnd, int cmd)"),
    IsIconic: user32.func("bool __stdcall IsIconic(intptr_t hwnd)"),
    IsWindow: user32.func("bool __stdcall IsWindow(intptr_t hwnd)"),
    IsWindowVisible: user32.func("bool __stdcall IsWindowVisible(intptr_t hwnd)"),
    GetWindowTextW: user32.func("int __stdcall GetWindowTextW(intptr_t hwnd, _Out_ uint8_t *buf, int max)"),
    GetClassNameW: user32.func("int __stdcall GetClassNameW(intptr_t hwnd, _Out_ uint8_t *buf, int max)"),
    GetWindowThreadProcessId: user32.func("uint32 __stdcall GetWindowThreadProcessId(intptr_t hwnd, _Out_ uint32_t *pid)"),
    AttachThreadInput: user32.func("bool __stdcall AttachThreadInput(uint32 from, uint32 to, bool attach)"),
    AllowSetForegroundWindow: user32.func("bool __stdcall AllowSetForegroundWindow(int32 pid)"),
    EnumWindows: user32.func("bool __stdcall EnumWindows(EnumWindowsProc *cb, intptr_t lparam)"),
    PostMessageW: user32.func("bool __stdcall PostMessageW(intptr_t hwnd, uint32 msg, uintptr_t wparam, intptr_t lparam)"),
    GetCursorPos: user32.func("bool __stdcall GetCursorPos(_Out_ POINT *p)"),
    GetCurrentThreadId: kernel32.func("uint32 __stdcall GetCurrentThreadId()"),
    OpenProcess: kernel32.func("intptr_t __stdcall OpenProcess(uint32 access, bool inherit, uint32 pid)"),
    CloseHandle: kernel32.func("bool __stdcall CloseHandle(intptr_t h)"),
    QueryFullProcessImageNameW: kernel32.func(
      "bool __stdcall QueryFullProcessImageNameW(intptr_t h, uint32 flags, _Out_ uint8_t *buf, _Inout_ uint32_t *size)",
    ),
  };

  const readText = (fn: (buf: Buffer, n: number) => number): string => {
    const buf = Buffer.alloc(1024);
    const n = fn(buf, 512);
    return n > 0 ? buf.toString("utf16le", 0, n * 2) : "";
  };

  return {
    available: true,
    SendInput: (inputs) => f.SendInput(inputs.length, inputs, INPUT_SIZE),
    MapVirtualKeyW: (c, t) => f.MapVirtualKeyW(c, t),
    GetForegroundWindow: () => Number(f.GetForegroundWindow()),
    SetForegroundWindow: (h) => f.SetForegroundWindow(h),
    BringWindowToTop: (h) => f.BringWindowToTop(h),
    ShowWindow: (h, c) => f.ShowWindow(h, c),
    IsIconic: (h) => f.IsIconic(h),
    IsWindow: (h) => f.IsWindow(h),
    IsWindowVisible: (h) => f.IsWindowVisible(h),
    GetWindowText: (h) => readText((b, n) => f.GetWindowTextW(h, b, n)),
    GetClassName: (h) => readText((b, n) => f.GetClassNameW(h, b, n)),
    GetWindowThreadProcessId: (h) => {
      const pid = [0];
      const tid = f.GetWindowThreadProcessId(h, pid) as number;
      return { tid, pid: pid[0] ?? 0 };
    },
    AttachThreadInput: (a, b, att) => f.AttachThreadInput(a, b, att),
    AllowSetForegroundWindow: (pid) => f.AllowSetForegroundWindow(pid),
    EnumWindows: (cb) => {
      const reg = koffi.register((hwnd: number) => {
        cb(Number(hwnd));
        return true;
      }, koffi.pointer(EnumProc));
      try {
        f.EnumWindows(reg, 0);
      } finally {
        koffi.unregister(reg);
      }
    },
    PostMessage: (h, m, w, l) => f.PostMessageW(h, m, w, l),
    GetCurrentThreadId: () => f.GetCurrentThreadId(),
    GetCursorPos: () => {
      const p = { x: 0, y: 0 };
      f.GetCursorPos(p);
      return { x: p.x, y: p.y };
    },
    ProcessImagePath: (pid) => {
      const h = Number(f.OpenProcess(0x1000, false, pid)); // PROCESS_QUERY_LIMITED_INFORMATION
      if (!h) return null;
      try {
        const buf = Buffer.alloc(2048);
        const size = [1024];
        const ok = f.QueryFullProcessImageNameW(h, 0, buf, size);
        return ok ? buf.toString("utf16le", 0, (size[0] ?? 0) * 2) : null;
      } finally {
        f.CloseHandle(h);
      }
    },
  };
}

export const native: Native = process.platform === "win32" ? makeNative() : makeStub();
