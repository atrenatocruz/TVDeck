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
| `backKey` | no | `esc` (default) or `browserBack` (Alt+Left). Which key the remote's Back button sends while this app is in front. Used from Milestone 3. |
| `match` | no | How to recognise the app's window once it is open: `{ "process": "steamwebhelper.exe", "titleRegex": "Steam Big Picture Mode" }`. Both parts are optional. Used from Milestone 3. |

### Tile types

- `web`: a website, opened in its own fullscreen Edge window (with its own saved logins). Example: `{ "type": "web", "url": "https://www.youtube.com" }`.
- `exe`: a program. Example: `{ "type": "exe", "path": "C:\\Program Files\\VideoLAN\\VLC\\vlc.exe", "args": ["--fullscreen"] }`. Remember to double every backslash in JSON.
- `uri`: anything Windows can open by address, such as `steam://open/bigpicture`.
- `folder`: opens a folder in Explorer. Example: `{ "type": "folder", "path": "%USERPROFILE%\\Videos" }`.

Opening apps arrives in Milestone 3. Until then, pressing OK on a tile shows a message saying so.

## Icons

TVDeck ships no logos. To use your own, put an image in `config/icons/` and reference it by file name:

```json
{ "id": "plex", "title": "Plex", "type": "web", "url": "https://app.plex.tv", "icon": "plex.png", "accent": "#e5a00d" }
```

Wide or square images with a transparent background look best. They are shown at about 60 percent of the tile, centred, and the file name's folder is served at `/icons/`.
