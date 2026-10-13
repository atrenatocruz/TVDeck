# HTTPS and remote access with Tailscale

Tailscale gives the PC a private HTTPS address (`https://<pc>.<tailnet>.ts.net`). That makes the phone remote **installable** as an app, lets it **keep the screen awake**, and works **away from home**, without opening any router port. Without it TVDeck still works on your home network over plain http (see [LAN http fallback](#lan-http-fallback)).

## 1. Install Tailscale

1. Install Tailscale on the PC and on the phone and sign in to the **same account** on both. Check that both appear in the admin console (https://login.tailscale.com/admin/machines).
2. In the admin console open **DNS**, make sure **MagicDNS** is on, and click **Enable HTTPS** under HTTPS Certificates. (Certificate names are published in a public log; if your tailnet name is sensitive, read the note shown there first.)

## 2. Serve TVDeck over HTTPS

Start TVDeck (`npm start` or the autostart task), then in a terminal on the PC:

```
tailscale serve --bg 7420
```

Use your `TVDECK_PORT` if you changed it. Check it with `tailscale serve status`. The remote is now at:

```
https://<pc>.<tailnet>.ts.net/remote/
```

With `--bg` the setting survives reboots. Do not use `tailscale funnel`: that publishes TVDeck to the whole internet.

## 3. Pair through the HTTPS address

Restart TVDeck once after enabling `serve`. At start it runs `tailscale status --json` and `tailscale serve status --json` (2 second timeout each). If `serve` forwards to this TVDeck port, the QR code on the TV uses `https://<pc>.<tailnet>.ts.net` automatically. The console and `tvdeck.log` say what was chosen:

```
[net] pairing base from tailscale serve: https://<pc>.<tailnet>.ts.net
```

If you see "no tailscale serve for port ..." instead, `serve` is not configured for that port, Tailscale is not running, or the `tailscale` command is not on the PATH of the process that started TVDeck (a Task Scheduler start uses your user PATH, so sign out and in after installing Tailscale). You can always set the address yourself: `TVDECK_PUBLIC_URL=https://<pc>.<tailnet>.ts.net`.

Then open **Phones** on the launcher, choose **Pair a new phone**, and scan the QR code with the phone (Tailscale must be connected on the phone).

## 4. Install the remote as an app

- **Android (Chrome):** open the HTTPS address, then menu, **Install app**. It opens standalone, without browser bars.
- **iPhone (Safari):** open the HTTPS address, Share, **Add to Home Screen**. If the home-screen app shows "Not paired" (iOS may keep its storage separate from Safari), open it and pair again from the TV.

The app caches only its own interface, never the connection to the PC, so it opens instantly and shows "TV is offline" when the PC is unreachable. While it is in front it keeps the phone screen awake (not available over http).

## 5. Away from home

With Tailscale connected on the phone, the same `https://<pc>.<tailnet>.ts.net/remote/` address works from mobile data or any Wi-Fi. The PC must be on, signed in (the launcher and input live in your Windows session) and running TVDeck. Pairing is still required; an unpaired phone can do nothing.

## Lock it down: Tailscale only

If phones only use the HTTPS address, make the server listen on the loopback interface only:

```
set TVDECK_BIND=127.0.0.1
```

For the autostart task set it as a user variable (`setx TVDECK_BIND 127.0.0.1`) and restart the task. `tailscale serve` still reaches TVDeck because it connects from the PC itself, but nothing else on your LAN can. Pairing then has to use the Tailscale URL.

How security holds behind `serve`: every connection arrives from 127.0.0.1, so TVDeck never trusts loopback and every socket must authenticate with a paired device token. WebSocket upgrades need an `Origin` equal to the `Host`. In case the proxy rewrites `Host`, TVDeck also accepts an Origin equal to the configured or detected public URL host, or the `X-Forwarded-Host` header (the latter only when the connection comes from loopback).

## LAN http fallback

Without Tailscale, open `http://<pc-ip>:7420/remote/` (the QR code does this). Pairing and control are the same, but browsers treat plain http as insecure: you cannot install it as an app, there is no offline shell, and the screen is not kept awake. Bookmark the page instead.

## Troubleshooting

| Symptom | Fix |
|---|---|
| QR still shows `http://192.168...` | `tailscale serve status` must show a proxy to `http://127.0.0.1:7420`. Restart TVDeck, read the `[net]` line in `%LOCALAPPDATA%\TVDeck\logs\tvdeck.log`, or set `TVDECK_PUBLIC_URL`. |
| Certificate error in the browser | HTTPS certificates are not enabled in the admin console, or you are not using the exact `.ts.net` name from `tailscale status`. |
| "Can't connect" from the phone | Tailscale is not connected on the phone, or the PC is asleep or signed out. |
| Pairing says "expired" | Codes live 5 minutes and are single use. Show a new one on the TV. |
| Remote shows "TV is offline" | The PC is off or asleep, or TVDeck is not running (check the autostart task and the log). |
| WebSocket refused ("bad origin" in the log) | The page was opened through an address `serve` does not publish. Use the `.ts.net` address, or set `TVDECK_PUBLIC_URL` to the host you use. |
| "Install app" is missing | The page must be https and the service worker registered. Reload once and try again. |
