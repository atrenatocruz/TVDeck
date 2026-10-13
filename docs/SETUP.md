# TVDeck setup (Milestone 2)

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
- Opening apps arrives in Milestone 3; for now OK shows a message.

The console prints a banner like:

```
http://192.168.1.20:7420/remote/#t=<token>
```

Open that URL on your phone. The token lives in the URL fragment, so it is never sent in HTTP requests. The page stores it in `localStorage`, then removes it from the address bar. The token itself is saved in `%LOCALAPPDATA%\TVDeck\secret.json`.

**Windows Firewall:** the first time, Windows may ask whether Node.js can accept connections. Allow it on Private networks. If the phone cannot connect, check that your Wi-Fi network is set to Private.

If the phone shows "Not paired", open the URL from the console again.

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

## Known limits

- **UIPI:** a normal process cannot send input to elevated windows (Task Manager, installers, apps run as administrator). `SendInput` reports fewer events than requested and the server logs a warning. Run TVDeck elevated to reach them (planned as an option for the autostart task).
- **Secure desktop:** UAC prompts and the lock screen are never reachable, by design.
- **Exclusive-fullscreen games** may ignore focus changes.
- Voice and virtual keyboards on the phone are not supported yet. Text entry comes in Milestone 4.
