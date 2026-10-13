# Configuring tiles

The launcher is built from `config/tiles.json`. On first run TVDeck copies `config/tiles.example.json` to `config/tiles.json` (which is git-ignored, so your edits stay yours). Set `TVDECK_CONFIG` to use a different file; its folder then also holds `icons/`.

The file is watched. Save it and the launcher and every connected remote update within about a second, with no restart. If the file is invalid JSON or breaks a rule below, TVDeck keeps your last working setup and the launcher shows a banner with what is wrong (for example `rows.0.tiles.2.url: "web" tiles need a url`). Fix the file and the banner goes away.

## Shape

```json
{
  "rows": [
    {
      "title": "Watch",
      "tiles": [
        { "id": "netflix", "title": "Netflix", "type": "web", "url": "https://www.netflix.com/browse", "accent": "#e5384a" }
      ]
    }
  ]
}
```

Rows appear top to bottom, tiles left to right. Empty rows are skipped.

## Row fields

| Field | Required | Meaning |
|---|---|---|
| `title` | yes | Heading shown above the row. |
| `tiles` | yes | List of tiles (may be empty). |

## Tile fields

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Unique across the whole file. Lowercase letters, digits and dashes only. Used to open the tile. |
| `title` | yes | 1 to 40 characters. Drawn as the tile's wordmark when there is no icon. |
| `type` | yes | `web`, `exe`, `uri` or `folder`. See below. |
| `url` | web, uri | The address to open. |
| `path` | exe, folder | File or folder path. `%NAME%` environment variables are expanded, for example `%USERPROFILE%\\Videos`. |
| `args` | no | Command-line arguments for `exe` tiles, as a list of strings. |
| `icon` | no | A file name inside `config/icons/` (png, jpg, webp, svg). Shown instead of the wordmark. |
| `accent` | no | A CSS colour such as `#e5384a`, `rgb(...)` or `hsl(...)`. Tints the tile gradient and the screen glow when the tile is focused. Without it, a colour is derived from the `id`. |
| `backKey` | no | `esc` (default) or `browserBack` (Alt+Left). Which key the remote's Back button sends while this app is in front. Use `browserBack` for websites where Esc does the wrong thing (it leaves fullscreen video, for example). |
| `userAgent` | no | Web tiles only. `tv` makes Edge identify as a smart-TV browser, so sites with a TV interface serve it (YouTube: use `https://www.youtube.com/tv` with `backKey: "esc"`). Any other value is used as the full user-agent string. Each user agent gets its own Edge profile, so you sign in to it separately. |
| `match` | no | How to recognise the app's window: `{ "process": "steamwebhelper.exe", "titleRegex": "Big Picture" }`. Both parts are optional, case-insensitive, and must both hold when both are given. See "How windows are tracked". |

### Tile types

- `web`: a website, opened in its own fullscreen Edge window (with its own saved logins). Example: `{ "type": "web", "url": "https://www.youtube.com" }`.
- `exe`: a program. Example: `{ "type": "exe", "path": "C:\\Program Files\\VideoLAN\\VLC\\vlc.exe", "args": ["--fullscreen"] }`. Remember to double every backslash in JSON.
- `uri`: anything Windows can open by address, such as `steam://open/bigpicture`.
- `folder`: opens a folder in Explorer. Example: `{ "type": "folder", "path": "%USERPROFILE%\\Videos" }`.

### How windows are tracked

Opening a tile brings its window to the front if TVDeck already knows it. Otherwise, if the tile has a `match` and a visible window matches, that window is adopted. Failing that, TVDeck launches the app and adopts the first new window that appears (preferring one that matches `match`). Folder tiles adopt the new Explorer window. Close the window yourself and the next OK starts the app again.

Tips:

- **Steam Big Picture** (`steam://open/bigpicture`): the window belongs to `steamwebhelper.exe` and has "Big Picture" in its title. Steam must be signed in; if it is not, the sign-in window is adopted instead. Allow up to 15 s on a cold start.
- **VLC**: `type: "exe"` with `"args": ["--fullscreen"]` and `"match": { "process": "vlc.exe" }`. VLC reuses a running instance, so the match lets Home and OK find it again. Adjust `path` if VLC is installed elsewhere.
- Not sure what to put in `match`? Open the app, then look at its window title and process name in Task Manager (Details tab).

## Icons

TVDeck ships no logos. To use your own, put an image in `config/icons/` and reference it by file name:

```json
{ "id": "plex", "title": "Plex", "type": "web", "url": "https://app.plex.tv", "icon": "plex.png", "accent": "#e5a00d" }
```

Wide or square images with a transparent background look best. They are shown at about 60 percent of the tile, centred, and the file name's folder is served at `/icons/`.

## TV interfaces

`"userAgent": "tv"` only helps on sites that still serve a TV interface to browsers. As of October 2026 that is YouTube (`https://www.youtube.com/tv`): sign in on the TV screen with the code it shows, at youtube.com/activate on your phone. Edge's own user-agent switch is not enough (it still reports Edge through client hints, and YouTube redirects to the desktop site), so TVDeck opens these windows on a placeholder page with a loopback-only DevTools port, applies the user agent over DevTools and then loads the URL. Keep TVDeck running while you use them: the override is re-applied if TVDeck restarts, but a reload while it is stopped falls back to the desktop site. `npm run spike:tv` checks the whole path in a throwaway profile. Netflix, Disney+, Prime Video, HBO Max and Stremio only ship their TV interfaces inside native smart-TV apps, so their tiles open the regular website in **D-pad mode**: Edge's spatial navigation lets the arrow keys move focus between links and buttons, and OK (Enter) activates them. Pages that handle the arrow keys themselves (video players, YouTube's TV interface) keep their own behaviour. It applies to every web tile without a `userAgent`; set `TVDECK_SPATIAL_NAV=0` to turn it off. Edge reads the setting when the apps browser starts, so close all open web-app windows after changing it. `npm run spike:spatial` checks it on this PC.

## Xiaomi remote

An optional top-level `remote` block (next to `rows`) changes what the paired Xiaomi Bluetooth remote's extra buttons do. It is hot reloaded like the rest of the file. Everything is optional; the values below are the defaults.

```json
"remote": {
  "buttons": {
    "netflix": { "open": "netflix" },
    "prime": { "open": "prime" },
    "apps": "home",
    "assistant": "none"
  },
  "hid": { "vendorId": 10007, "productId": 12985 }
}
```

An action is `"home"` (bring the launcher), `"back"` (the per-tile Back), `"none"`, or `{ "open": "<tile id>" }`. A button that opens a tile id that does not exist logs a warning and does nothing. `hid` only needs setting for a different remote model (decimal numbers; the defaults are 0x2717 / 0x32b9). See [SETUP.md](SETUP.md#xiaomi-bluetooth-remote) for pairing and the other buttons.
