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

export const TilesConfig = z
  .object({ rows: z.array(Row) })
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
