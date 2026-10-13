// Headless auth check against a running server: node scripts/ws-check.mjs
// Uses the real pairing flow (launcher key -> pairingStart -> pair), so it needs no shared token.
// Never sends nav/button/text, so it cannot press keys on the PC. Point it at a test server with
//   TVDECK_PORT=7421 TVDECK_DATA_DIR=<the server's data dir> node scripts/ws-check.mjs
// It creates (and leaves) a "ws-check" device in that data dir, so prefer a throwaway one.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";

const port = process.env.TVDECK_PORT ?? 7420;
const host = `localhost:${port}`;
const dataDir = process.env.TVDECK_DATA_DIR ?? path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), ".local", "share"), "TVDeck");
const { launcherKey } = JSON.parse(fs.readFileSync(path.join(dataDir, "secret.json"), "utf8"));
let failed = 0;
const report = (ok, name, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};

function open(headers = { Origin: `http://${host}` }) {
  const ws = new WebSocket(`ws://${host}/ws`, { headers });
  const inbox = [];
  ws.on("message", (d) => inbox.push(JSON.parse(d.toString())));
  const closed = new Promise((res) => ws.on("close", (code) => res(code)));
  const opened = new Promise((res, rej) => {
    ws.on("open", () => res(true));
    ws.on("error", (e) => rej(e));
    ws.on("unexpected-response", (_r, resp) => rej(new Error(`HTTP ${resp.statusCode}`)));
  });
  return { ws, inbox, closed, opened };
}
const hello = (auth, role = "remote") => JSON.stringify({ type: "hello", v: 1, role, auth });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 2000) => {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await wait(25)) {
    const v = fn();
    if (v) return v;
  }
  return undefined;
};

// A launcher connection that can ask for pairing codes.
const launcher = open();
await launcher.opened;
launcher.ws.send(hello({ kind: "launcher", key: launcherKey }, "launcher"));
report(!!(await until(() => launcher.inbox.find((m) => m.type === "welcome"))), "launcher key -> welcome");
async function newCode() {
  const before = launcher.inbox.filter((m) => m.type === "pairingCode").length;
  launcher.ws.send(JSON.stringify({ type: "pairingStart" }));
  const m = await until(() => launcher.inbox.filter((x) => x.type === "pairingCode")[before]);
  return m ? new URL(m.url).hash.match(/pair=([^&]+)/)?.[1] : undefined;
}

// 1. bad / missing Origin refused
for (const [label, headers] of [["evil origin", { Origin: "http://evil.example" }], ["no origin", {}]]) {
  const c = open(headers);
  const err = await c.opened.then(() => null, (e) => e.message);
  report(err !== null, `refused: ${label}`, err ?? "connected!");
}

// 2. no hello -> 4002
{
  const t0 = Date.now();
  const c = open();
  await c.opened;
  const code = await c.closed;
  report(code === 4002, "no hello within 3 s closes with 4002", `code=${code} after ${Date.now() - t0}ms`);
}

// 3. wrong credentials -> error + 4001
for (const [label, auth] of [
  ["wrong device token", { kind: "device", token: "definitely-wrong" }],
  ["wrong pairing code", { kind: "pair", code: "definitely-wrong", deviceName: "ws-check" }],
  ["shared token (off by default)", { kind: "shared", token: "definitely-wrong" }],
]) {
  const c = open();
  await c.opened;
  c.ws.send(hello(auth));
  const code = await c.closed;
  report(code === 4001 && c.inbox.some((m) => m.type === "error" && m.code === "unauthorized"), `${label}: error + 4001`, `code=${code}`);
}

// 4. non-hello first message closes
{
  const c = open();
  await c.opened;
  c.ws.send(JSON.stringify({ type: "ping", t: 1 }));
  const code = await c.closed;
  report(code === 4001, "message before hello closes socket", `code=${code}`);
}

// 5. remote cannot use the launcher key
{
  const c = open();
  await c.opened;
  c.ws.send(hello({ kind: "launcher", key: launcherKey }, "remote"));
  report((await c.closed) === 4001, "launcher key as a remote is refused");
}

// 6. pairing: code -> paired + welcome, single use
let deviceToken;
{
  const code = await newCode();
  report(!!code, "launcher pairingStart -> pairingCode with #pair= link");
  const c = open();
  await c.opened;
  c.ws.send(hello({ kind: "pair", code, deviceName: "ws-check" }));
  const paired = await until(() => c.inbox.find((m) => m.type === "paired"));
  report(!!paired?.deviceToken && !!(await until(() => c.inbox.find((m) => m.type === "welcome"))), "valid pairing code -> paired + welcome");
  deviceToken = paired?.deviceToken;

  // ping/pong, bad_message, forbidden
  c.ws.send(JSON.stringify({ type: "ping", t: 42 }));
  c.ws.send(JSON.stringify({ type: "nav", dir: "sideways" }));
  c.ws.send("not json");
  c.ws.send(JSON.stringify({ type: "pairingStart" }));
  c.ws.send(JSON.stringify({ type: "pairingCancel" }));
  await wait(300);
  report(c.inbox.some((m) => m.type === "pong" && m.t === 42), "ping -> pong");
  report(c.inbox.filter((m) => m.type === "error" && m.code === "bad_message").length === 2, "invalid messages -> bad_message x2 (server alive)");
  report(c.inbox.filter((m) => m.type === "error" && m.code === "forbidden").length === 2, "launcher-only messages from a remote -> forbidden x2");
  c.ws.send(JSON.stringify({ type: "ping", t: 43 }));
  await wait(150);
  report(c.inbox.some((m) => m.type === "pong" && m.t === 43), "socket still usable after bad input");
  c.ws.close();

  const again = open();
  await again.opened;
  again.ws.send(hello({ kind: "pair", code, deviceName: "replay" }));
  report((await again.closed) === 4001, "pairing code cannot be used twice");
}

// 7. device token works for reconnects
{
  const c = open();
  await c.opened;
  c.ws.send(hello({ kind: "device", token: deviceToken }));
  report(!!(await until(() => c.inbox.find((m) => m.type === "welcome"))), "device token -> welcome");
  c.ws.close();
}

// 8. pairingCancel invalidates an unused code at once
{
  const code = await newCode();
  launcher.ws.send(JSON.stringify({ type: "pairingCancel" }));
  await wait(200);
  const c = open();
  await c.opened;
  c.ws.send(hello({ kind: "pair", code, deviceName: "late" }));
  report((await c.closed) === 4001, "pairingCancel invalidates the outstanding code");
}

// 9. oversize payload
{
  const c = open();
  await c.opened;
  c.ws.send(hello({ kind: "device", token: deviceToken }));
  await wait(150);
  c.ws.send("x".repeat(20_000));
  const code = await c.closed;
  report(code === 1009, "payload > 16 KB closes with 1009", `code=${code}`);
}

launcher.ws.close();
console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
