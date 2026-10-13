# TVDeck

Turn a Windows 11 PC that is connected to a TV into a TV box. A fullscreen launcher shows your apps, and your phone becomes the remote, including inside the apps you open.

## Features

- **Launcher:** a 10-foot fullscreen UI in Edge app mode, with tiles from `config/tiles.json` (hot reloaded) and focus navigation by phone or keyboard.
- **Apps:** web tiles (Netflix, YouTube, ...) in their own persistent Edge profile, desktop apps, folders and `steam://` links. Home always brings the launcher back; apps keep running.
- **Phone remote (PWA):** D-pad, OK, Back, Home, media and volume, a touchpad with gestures, text entry, an Apps tab. Installable, keeps the screen awake, and shows a calm offline screen when the PC is unreachable.
- **Pairing:** scan a QR code on the TV once. Each phone gets its own revocable token; remove phones from the TV or with `npm run devices`.
- **Anywhere access:** optional HTTPS through Tailscale, so the remote also works away from home. See [docs/TAILSCALE.md](docs/TAILSCALE.md).
- **Runs by itself:** a Task Scheduler entry starts the server hidden at logon, logs to a rotating file, and relaunches the launcher if it ever disappears.

## Quick start (development)

```
npm install
npm run dev
```

`npm run dev` also opens the launcher fullscreen on the PC (`npm run dev:headless` skips that). Scan the QR code on the TV with your phone. Details, firewall prompt and security model: [docs/SETUP.md](docs/SETUP.md).

## Production and autostart

```
npm run build              # builds the remote (with its service worker and icons) and the launcher
npm start                  # serves the built apps; refuses to start if you forgot to build
npm run autostart:install  # starts TVDeck hidden at every logon (Task Scheduler task "TVDeck")
npm run autostart:remove   # undoes it
```

Logs go to `%LOCALAPPDATA%\TVDeck\logs\tvdeck.log` (5 MB x 3 files). Environment variables: `TVDECK_PORT` (7420), `TVDECK_BIND` (`0.0.0.0`; use `127.0.0.1` for Tailscale-only), `TVDECK_PUBLIC_URL`, `TVDECK_DATA_DIR`, `TVDECK_CONFIG`, `TVDECK_NO_LAUNCHER=1`, `TVDECK_DRY_INPUT=1`.

## Docs

- [docs/SETUP.md](docs/SETUP.md): install, launcher, pairing, apps, autostart, security model
- [docs/TAILSCALE.md](docs/TAILSCALE.md): HTTPS, installing the PWA, using it away from home
- [docs/CONFIG.md](docs/CONFIG.md): tiles and rows

## Layout

- `packages/protocol`: zod schemas shared by server and clients
- `packages/server`: HTTP, WebSocket, auth and Win32 input (koffi + SendInput)
- `packages/remote`: the phone remote (Preact + Vite, PWA)
- `packages/launcher`: the fullscreen TV launcher (Preact + Vite)
- `scripts/`: autostart install/remove, `ws-check.mjs`, `gen-icons.mjs`

Scripts: `npm run dev | dev:headless | build | start | test | typecheck | icons | devices | autostart:install | autostart:remove | spike:input | spike:home | spike:m4`.

## Checks

```
npm run typecheck
npm test
TVDECK_PORT=7421 TVDECK_DATA_DIR=<server data dir> node scripts/ws-check.mjs
```

`ws-check` runs the real pairing flow against a running server (it needs the server's data dir to read the launcher key, and it leaves a "ws-check" device there, so use a throwaway server and data dir). It never sends keypress messages, so it cannot press keys on the PC.

## Known limits

- **Secure desktop:** UAC prompts and the lock screen are never reachable, by design.
- **Elevated windows (UIPI):** a normal process cannot send input to elevated windows (Task Manager, installers, apps run as administrator). `SendInput` reports fewer events than requested and the server logs a warning. `powershell -File scripts/autostart-install.ps1 -Elevated` (from an administrator PowerShell) runs TVDeck with highest privileges to reach them; the trade-off is that the whole server runs elevated.
- **Exclusive-fullscreen games** may ignore focus changes, so Home may not always get the launcher on top.
- **Steam Big Picture:** window matching has only been checked against the Big Picture names known today. If Steam changes them, Home or the tile state for Steam may misbehave; check the server log for the window title.
- **VLC** is not installed on the author's PC, so desktop-app tiles were not tested with VLC itself.
- **Wake lock and installing the PWA need HTTPS** (Tailscale). Over plain http on the LAN the remote works as a normal web page.
- Click-and-drag on the touchpad is not supported. Voice input depends on the phone keyboard's own dictation.
- Tailscale could not be tested end to end on the development PC (it is not installed there). The CLI parsing and the Origin logic have unit tests.

The manual spike scripts (`npm run spike:input | spike:home | spike:m4`) are described in [docs/SETUP.md](docs/SETUP.md).
