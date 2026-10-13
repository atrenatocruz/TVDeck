import { z } from "zod";

/** Key sent for the remote's Back button while this tile is in front. */
export const BackKey = z.enum(["esc", "browserBack"]);

export const Tile = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, "use lowercase letters, digits and dashes"),
    title: z.string().min(1).max(40),
    type: z.enum(["web", "exe", "uri", "folder"]),
    url: z.string().optional(),
    path: z.string().optional(),
    args: z.array(z.string()).optional(),
    icon: z.string().optional(),
    accent: z.string().optional(),
    backKey: BackKey.optional(),
    /** Browser identity for web tiles: "tv" (a smart-TV browser, for TV interfaces such as youtube.com/tv) or a full user-agent string. */
    userAgent: z.string().min(1).max(400).optional(),
    match: z
      .object({ titleRegex: z.string().optional(), process: z.string().optional() })
      .optional(),
  })
  .superRefine((t, ctx) => {
    const needsUrl = t.type === "web" || t.type === "uri";
    if (needsUrl && !t.url) ctx.addIssue({ code: "custom", message: `"${t.type}" tiles need a url` });
    if (!needsUrl && !t.path) ctx.addIssue({ code: "custom", message: `"${t.type}" tiles need a path` });
  });

export const Row = z.object({
  title: z.string().min(1),
  tiles: z.array(Tile),
});

/** What a physical remote button does: bring the launcher, send Back, nothing, or open a tile. */
export const RemoteAction = z.union([
  z.enum(["home", "back", "none"]),
  z.object({ open: z.string().min(1) }).strict(),
]);

/** Optional settings for the paired Xiaomi Bluetooth remote (see docs/CONFIG.md). */
export const RemoteConfig = z
  .object({
    buttons: z
      .object({
        netflix: RemoteAction.optional(),
        prime: RemoteAction.optional(),
        apps: RemoteAction.optional(),
        assistant: RemoteAction.optional(),
      })
      .strict()
      .optional(),
    hid: z
      .object({
        vendorId: z.number().int().min(0).max(0xffff).optional(),
        productId: z.number().int().min(0).max(0xffff).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/** Home screen extras: a welcome line and the weather for a place (Open-Meteo, no account needed). */
export const HomeConfig = z.object({
  welcome: z.string().max(80).optional(),
  weather: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      unit: z.enum(["celsius", "fahrenheit"]).optional(),
    })
    .optional(),
});

export const TilesConfig = z
  .object({ rows: z.array(Row), remote: RemoteConfig.optional(), home: HomeConfig.optional() })
  .superRefine((cfg, ctx) => {
    const seen = new Set<string>();
    for (const row of cfg.rows)
      for (const tile of row.tiles) {
        if (seen.has(tile.id)) ctx.addIssue({ code: "custom", message: `duplicate tile id "${tile.id}"` });
        seen.add(tile.id);
      }
  });

export type Tile = z.infer<typeof Tile>;
export type Row = z.infer<typeof Row>;
export type TilesConfig = z.infer<typeof TilesConfig>;
export type RemoteAction = z.infer<typeof RemoteAction>;
export type RemoteConfig = z.infer<typeof RemoteConfig>;
export type HomeConfig = z.infer<typeof HomeConfig>;
