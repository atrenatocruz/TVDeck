# TVDeck setup (Milestone 4)

Requirements: Windows 11 (x64), Node 22+, npm 10+, Microsoft Edge. The PC and phone must be on the same network.

## Install and run

```
npm install
npm run dev
```

`npm run dev` starts one process on port 7420 (override with `TVDECK_PORT`). It serves the phone remote and the TV launcher with Vite hot reload and accepts WebSocket connections on `/ws`.

## The launcher

On start the server opens the launcher: Microsoft Edge in app mode, fullscreen, with its own profile in `%LOCALAPPDATA%\TVDeck\edge-launcher`. The window is titled exactly `TVDeck`; if one already exists it is reused. Its access key is stored next to the phone token in `secret.json`, so a server restart does not orphan an open launcher.

- Skip auto-launch with `npm run dev:headless` or `npm start -- --no-launcher` (or `TVDECK_NO_LAUNCHER=1`). You can then open `http://localhost:7420/launcher/#k=<launcherKey from secret.json>` in any browser while developing.
- Move with the arrow keys (or the phone D-pad), OK/Enter to open, Esc to jump back to the first tile. Mouse hover and click work too.
- Phone Home raises the launcher. If its window was closed, the server finds it again or relaunches it.
- Tiles come from `config/tiles.json`, hot-reloaded. See [CONFIG.md](CONFIG.md).
- OK on a tile opens the app (see [Apps](#apps)). The tile shows "Opening" until the app is in front, and a small dot marks apps that are still running behind the launcher.

The console prints a banner like:

```
http://192.168.1.20:7420/remote/#t=<token>
```

Open that URL on your phone. The token lives in the URL fragment, so it is never sent in HTTP requests. The page stores it in `localStorage`, then removes it from the address bar. The token itself is saved in `%LOCALAPPDATA%\TVDeck\secret.json`.

**Windows Firewall:** the first time, Windows may ask whether Node.js can accept connections. Allow it on Private networks. If the phone cannot connect, check that your Wi-Fi network is set to Private.

If the phone shows "Not paired", open the URL from the console again.

## Apps

- **Web tiles** open in their own fullscreen Edge window, using a separate persistent profile in `%LOCALAPPDATA%\TVDeck\edge-apps`. **Sign in once per service** (Netflix, YouTube, ...) the first time; the logins are kept in that profile.
- Opening a tile again brings its existing window to the front instead of starting another one. **Home** raises the launcher and leaves every app running.
- The phone's **Back** sends Esc, or Alt+Left for tiles with `"backKey": "browserBack"` (see [CONFIG.md](CONFIG.md)). The phone's status pill shows which app is in front, for example "Connected · YouTube".
- If an app can't be opened (missing file or folder, no window within 10 s, 15 s for `steam://` style links), the launcher and the phone show a short message.
- `TVDECK_DATA_DIR` moves the data folder (secrets, paired devices, Edge profiles) away from `%LOCALAPPDATA%\TVDeck`. Handy for testing without touching your real setup; use it together with `TVDECK_CONFIG` and `TVDECK_PORT`.

### Netflix quality

Edge plays Netflix with PlayReady, which is what allows 1080p and 4K (Chrome and most embedded browsers are limited to 720p). For 4K you also need an HDCP 2.2 display chain and the **HEVC Video Extensions** from the Microsoft Store. To check what you actually get, play something and press `Ctrl+Alt+Shift+D` in the player: the overlay shows the playing resolution and codec.

## Production build

```
npm run build
npm start
```

`npm start` serves the built remote and launcher from `packages/remote/dist` and `packages/launcher/dist`.

## Checks

```
npm run typecheck
npm test
node scripts/ws-check.mjs   # with the server running: auth/origin/hello checks over a real socket
```

`ws-check` never sends keypress messages, so it cannot press keys on the PC.

## Spike scripts (manual, open real windows)

These answer the two biggest risks. They open and close their own windows only.

### `npm run spike:input`

Opens a throwaway Edge window whose page records key events in its title. It checks that the window is in front **before** injecting anything, then sends arrows, Enter, Esc, Backspace and the text `héllo ✓`, and reads the results back. It also moves the mouse by +50,0 and back. Do not touch the keyboard or mouse while it runs.

```
PASS  key up  SendInput=2/2, page saw ArrowUp
```

`PASS` means Windows accepted the events and the page received them. `FAIL ... window lost focus` means something else took focus mid-run and the script refused to inject. `SendInput=0/2` usually means the target is elevated (see limits). The mouse line reports the real cursor delta. Windows pointer acceleration can make it differ from 50.

### `npm run spike:home`

Opens a stand-in window titled "TVDeck", then for Notepad, a fullscreen Edge window and Steam Big Picture (only if Steam is installed) it puts that window in front and runs the "Home" routine. Each line shows which step of the escalation ladder raised the launcher:

```
PASS  notepad  launcher raised via step: alt+setForeground
```

Steps: `alt+setForeground` (synthetic Alt, then SetForegroundWindow), `attachThreadInput`, `minimizeForeground`. `FAIL` means all three failed. `SKIP` means the scenario could not be set up. Steam is left running if the spike started Big Picture.

### `npm run spike:m4`

Opens a throwaway Edge window whose page records mouse moves, clicks, double clicks, right clicks, wheel deltas and keys in its title. Before **every** injection the window must be in front (and for mouse steps, under the pointer), otherwise that step is skipped and nothing is injected. It then drives the same functions the phone uses: `mouseMove`, `mouseClick` (single, double, right), `mouseScroll` (both axes), `typeText` with an accent, a symbol and an emoji, and the Backspace, Enter, Space and Tab keys. Finally it presses volume up then down, mute twice and play/pause twice (all net zero, but the Windows volume overlay will flash and a playing track may blip). The cursor is restored afterwards. Do not touch the keyboard or mouse while it runs.

## Touchpad, text and media (phone remote)

The remote has three tabs: **Remote** (D-pad, OK, Back, Home, media and volume), **Touchpad** and **Apps**. The last tab is remembered.

### Touchpad gestures

| Gesture | Result |
|---|---|
| One finger drag | Move the pointer (relative, with a speed-dependent curve) |
| Tap (under about 200 ms, under 8 px of travel) | Left click |
| Two quick taps | Double click (two left clicks, Windows does the rest, so single taps have no delay) |
| Two-finger tap | Right click |
| Two-finger drag | Scroll, both axes, natural direction (the page follows your fingers) |

Slow, Normal and Fast change how far the pointer travels per finger movement. Click-and-drag (hold, then drag) is not supported yet because the protocol only has whole clicks.

### Text input

Tap the field at the top of the Touchpad tab and type on the phone keyboard. Committed text is typed on the PC (accents and emoji work); while the keyboard is composing a word the text stays on the phone and is sent when the word is committed. Backspace, Space, Enter and Tab have their own buttons (Backspace repeats while held). Typing is limited to about 1500 characters per second.

### Windows "Enhance pointer precision"

Windows applies its own acceleration to injected relative moves when **Enhance pointer precision** is on (Settings, Bluetooth and devices, Mouse, Additional mouse settings, Pointer Options). TVDeck already applies a curve on the server (`ACCEL` in `packages/server/src/win32/input.ts`), so for a predictable feel turn Windows' option off. If the pointer is too fast or slow, change Slow/Normal/Fast on the phone first.

### Safe testing without moving the pointer

Start the server with `TVDECK_DRY_INPUT=1` and every input is printed as `[dry-input] ...` instead of being injected.

## Known limits

- **UIPI:** a normal process cannot send input to elevated windows (Task Manager, installers, apps run as administrator). `SendInput` reports fewer events than requested and the server logs a warning. Run TVDeck elevated to reach them (planned as an option for the autostart task).
- **Secure desktop:** UAC prompts and the lock screen are never reachable, by design.
- **Exclusive-fullscreen games** may ignore focus changes.
- Voice input on the phone depends on the phone keyboard's own dictation, which commits text like normal typing.
