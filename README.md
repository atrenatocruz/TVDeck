# TVDeck

Turn a Windows 11 PC that is connected to a TV into a TV box. A fullscreen launcher shows your apps, and your phone becomes the remote, including inside the apps you open.

## Status

| Milestone | Scope | State |
|---|---|---|
| M1 | Server, phone remote D-pad, input and Home risk spikes | done |
| M2 | Launcher with config-driven tiles | planned |
| M3 | App launching and Home | planned |
| M4 | Touchpad, text, media and volume | planned |
| M5 | Pairing and device revocation | planned |
| M6 | PWA over Tailscale, autostart | planned |

## Quick start

```
npm install
npm run dev
```

Open the URL printed in the console on your phone. See [docs/SETUP.md](docs/SETUP.md) for the firewall prompt, the spike scripts and known limits.

## Layout

- `packages/protocol`: zod schemas shared by server and clients
- `packages/server`: HTTP, WebSocket, auth and Win32 input (koffi + SendInput)
- `packages/remote`: the phone remote (Preact + Vite)

Scripts: `npm run dev | build | start | test | typecheck | spike:input | spike:home`.
