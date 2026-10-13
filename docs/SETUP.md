# TVDeck setup

Requirements: Windows 11 (x64), Node 22+, npm 10+, Microsoft Edge. The PC and phone must be on the same network.

## Install and run

```
npm install
npm run dev
```

`npm run dev` starts one process on port 7420 (override with `TVDECK_PORT`). It serves the phone remote and the TV launcher with Vite hot reload and accepts WebSocket connections on `/ws`.

## The launcher

On start the server opens the launcher: Microsoft Edge in app mode, fullscreen, with its own profile in `%LOCALAPPDATA%\TVDeck\edge-launcher`. The window is titled exactly `TVDeck`; if one already exists it is reused. Its access key is stored in `secret.json`, so a server restart does not orphan an open launcher.

- If the launcher window disappears while the server runs (Edge crashed or the window was closed), the server starts it again after about 5 seconds, backing off (10 s, 20 s, up to 60 s) if it keeps dying.
- Skip auto-launch with `npm run dev:headless` or `npm start -- --no-launcher` (or `TVDECK_NO_LAUNCHER=1`). You can then open `http://localhost:7420/launcher/#k=<launcherKey from secret.json>` in any browser while developing.
- Move with the arrow keys (or the phone D-pad), OK/Enter to open, Esc to jump back to the first tile. Mouse hover and click work too.
- Phone Home raises the launcher. If its window was closed, the server finds it again or relaunches it.
- Tiles come from `config/tiles.json`, hot-reloaded. See [CONFIG.md](CONFIG.md).
- OK on a tile opens the app (see [Apps](#apps)). The tile shows "Opening" until the app is in front, and a small dot marks apps that are still running behind the launcher.

## Pairing a phone

1. Start TVDeck. The launcher shows a QR code by itself while no phone is paired. Later, choose **Phones** (press Up from the first row, then OK) and **Pair a new phone**.
2. Scan the QR code with the phone camera and open the link. The phone connects and becomes the remote. The TV confirms with "Paired with <name>".

The code in the QR is single use, expires after 5 minutes and is replaced by a new one automatically. Starting a new pairing, or closing the QR screen on the TV, cancels the previous code at once. The link carries the code in the URL fragment (`#pair=...`), so it is never sent in an HTTP request; the page strips it from the address bar right away.

The phone receives a device token once and keeps it in `localStorage` and IndexedDB. Only a SHA-256 hash of the token is stored on the PC, in `%LOCALAPPDATA%\TVDeck\devices.json`.

The QR link uses, in order: `TVDECK_PUBLIC_URL`; the HTTPS address of `tailscale serve` if it is set up for this port (found automatically, see [TAILSCALE.md](TAILSCALE.md)); otherwise `http://<first LAN IPv4>:<port>`. The server logs which one it chose at start.

### Removing a phone

- On the TV: **Phones**, select the phone, OK, then **Remove** (Cancel is selected by default).
- From a terminal: `npm run devices -- list` and `npm run devices -- revoke <id>`. A running server notices the change within a second.

Either way the phone's open connection is closed immediately and its token stops working. The phone then shows "Not paired".

### Upgrading from M1-M4

The old shared token is off by default. Open the launcher and pair the phone once by scanning the QR code. If you must keep the old link for a while, start the server with `TVDECK_ALLOW_SHARED_TOKEN=1` (it logs a warning); the console no longer prints the token link.

**Windows Firewall:** the first time, Windows may ask whether Node.js can accept connections. Allow it on Private networks. If the phone cannot connect, check that your Wi-Fi network is set to Private.

If the phone shows "Not paired" or "Code expired", show a new code on the TV and scan it again.

## Security model

- Everything on the network needs a credential: the launcher uses a random per-install key (in the launch URL fragment), phones use per-device 256-bit tokens, and pairing codes are 128-bit, single-use and short-lived.
- Loopback is not trusted: behind `tailscale serve` all connections arrive from 127.0.0.1, so every connection authenticates.
- WebSocket upgrades must carry an `Origin` that matches the `Host` (blocks cross-site hijacking).
- Failed authentication is rate limited per remote address (10 failures in 5 minutes, then blocked for the rest of the window). Behind `tailscale serve` all clients share one address; that is acceptable because guessing 128/256-bit values is not feasible anyway.
- Tokens are compared in constant time and stored hashed. `devices.json` and `secret.json` live in your Windows profile folder.
- Limits: anyone who can see the QR code during its 5 minutes can pair, so pair on your own screen. Closing the QR screen invalidates its code immediately. Input injected by a paired phone has the full power of your keyboard and mouse.

**Windows Firewall:** the first time, Windows may ask whether Node.js can accept connections. Allow it on Private networks. If the phone cannot connect, check that your Wi-Fi network is set to Private.

## Apps

- **Web tiles** open in their own fullscreen Edge window, using a separate persistent profile in `%LOCALAPPDATA%\TVDeck\edge-apps`. **Sign in once per service** (Netflix, YouTube, ...) the first time; the logins are kept in that profile.
- Opening a tile again brings its existing window to the front instead of starting another one. **Home** raises the launcher and leaves every app running.
- The phone's **Back** sends Esc, or Alt+Left for tiles with `"backKey": "browserBack"` (see [CONFIG.md](CONFIG.md)). The phone's status pill shows which app is in front, for example "Connected · YouTube".
- If an app can't be opened (missing file or folder, no window within 10 s, 15 s for `steam://` style links), the launcher and the phone show a short message.
- `TVDECK_DATA_DIR` moves the data folder (secrets, paired devices, Edge profiles) away from `%LOCALAPPDATA%\TVDeck`. Handy for testing without touching your real setup; use it together with `TVDECK_CONFIG` and `TVDECK_PORT`.

### Netflix quality

Edge plays Netflix with PlayReady, which is what allows 1080p and 4K (Chrome and most embedded browsers are limited to 720p). For 4K you also need an HDCP 2.2 display chain and the **HEVC Video Extensions** from the Microsoft Store. To check what you actually get, play something and press `Ctrl+Alt+Shift+D` in the player: the overlay shows the playing resolution and codec.

## Production build and autostart

```
npm run build
npm start
```

`npm start` serves the built remote and launcher from `packages/remote/dist` and `packages/launcher/dist`. If either is missing it stops with "run npm run build first".

### Start at logon

```
npm run autostart:install
```

This registers a Task Scheduler task named **TVDeck**. It runs as you (interactive, no password stored, which the launcher window and key injection need), starts 15 seconds after you sign in, and restarts up to 3 times (one minute apart) if the server exits with an error. Running it again replaces the task. `npm run autostart:remove` deletes it. Start it without logging out with `Start-ScheduledTask -TaskName TVDeck`, stop it with `Stop-ScheduledTask -TaskName TVDeck`.

The task runs `scripts\tvdeck-hidden.vbs` through `wscript.exe`. A VBScript `Run` with window style 0 creates the console hidden from the start, so nothing flashes on the TV at logon (`powershell -WindowStyle Hidden` briefly shows a window). Because the script waits for the server, Task Scheduler sees its exit code and the restart policy works. The working directory is the repo root. After pulling changes, run `npm run build` and restart the task.

**Run as administrator (optional):** from an administrator PowerShell, `powershell -File scripts\autostart-install.ps1 -Elevated` sets "Run with highest privileges". Windows (UIPI) blocks input from a normal process into elevated windows such as Task Manager or installers; an elevated TVDeck can reach them. Everything TVDeck starts then also runs elevated, so only do this if you need it.

### Logs

Everything the server prints is also written to `%LOCALAPPDATA%\TVDeck\logs\tvdeck.log` (or `<TVDECK_DATA_DIR>\logs`). At 5 MB it rotates to `tvdeck.log.1`, then `.2`; older data is dropped.

### Network binding

`TVDECK_BIND` sets the address the server listens on (default `0.0.0.0`, all adapters). Use `127.0.0.1` when phones only come through `tailscale serve`; nothing on your LAN can then reach the server directly. See [TAILSCALE.md](TAILSCALE.md).

### Spike scripts

`npm run spike:input`, `spike:home` and `spike:m4` are manual checks that open and close their own windows (a throwaway Edge page that records key and mouse events, a stand-in launcher for Home against Notepad, fullscreen Edge and Steam Big Picture). Each prints PASS, FAIL or SKIP per step and never injects input unless its target window is in front. Do not touch the keyboard or mouse while one runs. `TVDECK_DRY_INPUT=1` prints every input as `[dry-input] ...` instead of sending it.

## Hiding TVDeck while you use the PC

Settings (press Up from the apps to reach the gear) > **Hide TVDeck** closes the launcher and keeps it closed: it won't reopen by itself. Home or Power on the Xiaomi remote, Home on the phone, or the TVDeck app brings it back. The server keeps running in the background, so the remotes keep working.

## TVDeck app (Start menu / Desktop)

```
npm run build
npm run app:install
```

`app:install` builds `app\TVDeck.exe` (with the TVDeck icon, compiled by the C# compiler that ships with Windows) and adds **TVDeck** shortcuts to the Start menu and the Desktop. Right-click it in the Start menu to pin it to Start or the taskbar.

- TVDeck running: the app brings the launcher to the front (it writes `home.request` in the data folder; the server checks that file twice a second).
- TVDeck not running: it starts it hidden, through the `TVDeck` logon task if installed (`npm run autostart:install`), otherwise directly; the launcher opens by itself.
- Not built yet: it says to run `npm run build`.

The phone remote's home-screen icon uses the same logo (`packages/remote/public/icon.svg`; `npm run icons` regenerates the PNGs).

## Xiaomi Bluetooth remote

A paired Xiaomi Mi Box S remote (XMRM-006) works as a second remote next to the phone. Every button runs the same code path as the matching phone button.

**Pair it:** unplug the Mi Box, press Win+R, run `DevicePairingWizard`, hold Back and Home together for about 10 seconds until the remote shows up as "Xiaomi RC", and pair it.

| Button | Action |
| --- | --- |
| Up, Down, Left, Right | Arrow keys. Hold to repeat (after 400 ms, every 90 ms). |
| OK | Enter |
| Back | Per-tile back: Esc, or Alt+Left for tiles with `"backKey": "browserBack"` |
| Home | Brings the launcher forward (apps keep running) |
| Apps (grid) | Home by default |
| Netflix, Prime Video | Open the tile with id `netflix` / `prime` by default |
| Assistant | Nothing by default |
| Volume +/- | Windows handles these itself; TVDeck leaves them alone |
| Power | Like a TV box. Launcher open: closes the apps TVDeck opened and the launcher, then puts the PC to sleep. Launcher closed: opens it. TVDeck must be running (`npm run autostart:install`). The remote usually can't wake the PC; use the PC's power button, keyboard or mouse. Set `"power": "home"` to only bring the launcher |

Remap Apps, Assistant, Netflix and Prime Video with the `remote` block in `tiles.json` ([CONFIG.md](CONFIG.md#xiaomi-remote)).

**How it works:** the arrows, OK and the colour buttons only exist as raw HID reports on the remote's Consumer Control interface, which TVDeck reads with `node-hid` (shared access, Windows keeps using the device). Home and Back reach Windows as the Browser Home and Browser Back keys, so TVDeck registers them as global hotkeys so that neither Windows nor Edge acts on them. **This also captures Browser Home/Back keys from regular keyboards while TVDeck runs.** Set `TVDECK_CAPTURE_BROWSER_KEYS=0` to turn that off (the remote's Home and Back buttons then do whatever Windows does). If another program already owns those keys, TVDeck logs a warning and carries on.

The remote sleeps when idle and reconnects on the next press; TVDeck looks for it every 3 seconds and logs only the connect and disconnect. `npm run remote:probe` prints decoded buttons and raw bytes for 60 seconds and injects nothing, which is how to map a new button (unknown bits are also written to the log at debug level). `TVDECK_DRY_INPUT=1` logs the remote's actions instead of performing them.

## Phone remote notes

- Three tabs: Remote, Touchpad (drag to move, tap to click, two-finger tap to right-click, two-finger drag to scroll) and Apps (the launcher tiles with their icons; tap to open).
- Remote tab: a swipe surface — swipe to move one step, a long flick moves several, keep the finger down to keep moving, tap for OK. Switch to **D-pad** (a click-ring with OK in the middle) with the Swipe / D-pad control at the bottom of the surface; the choice is remembered. Under it: Back, Home, Play/Pause, Mute and a volume rocker (hold to repeat).
- The keyboard button (top right) opens the text field with the phone keyboard up.
- Text typed in the field on the Touchpad tab is typed on the PC; Backspace, Space, Enter and Tab have their own buttons.
- If the PC can't be reached for about 5 seconds the remote shows "TV is offline" and keeps retrying (Try now skips the wait). That is different from "Not paired", which means the phone has no valid credentials.
- With Windows "Enhance pointer precision" on, pointer speed gets double acceleration. Turn it off for a predictable feel, or use Slow/Normal/Fast on the phone.

## Known limits

See the [README](../README.md#known-limits): secure desktop (UAC, lock screen), elevated windows (UIPI), exclusive-fullscreen games, Steam Big Picture matching, and HTTPS being needed for install and wake lock.
