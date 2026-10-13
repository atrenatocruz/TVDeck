import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HOME_REQUEST_FILE, watchHomeRequests } from "./homeRequest.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("watchHomeRequests", () => {
  it("fires when TVDeck.exe creates or rewrites the request file, not before", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tvdeck-home-"));
    let n = 0;
    const stop = watchHomeRequests(dir, () => n++, 50);
    try {
      await sleep(150);
      expect(n).toBe(0);
      fs.writeFileSync(path.join(dir, HOME_REQUEST_FILE), "1");
      await sleep(250);
      expect(n).toBe(1);
      await sleep(30); // a newer mtime
      fs.writeFileSync(path.join(dir, HOME_REQUEST_FILE), "2");
      await sleep(250);
      expect(n).toBe(2);
    } finally {
      stop();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
