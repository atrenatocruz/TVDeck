// Headless auth check against a running server: node scripts/ws-check.mjs
// Never sends nav/button/text, so it cannot press keys on the PC.
import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const port = process.env.TVDECK_PORT ?? 7420;
const host = `localhost:${port}`;
const secret = JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA, "TVDeck", "secret.json"), "utf8"));
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
const hello = (token) => JSON.stringify({ type: "hello", v: 1, role: "remote", auth: { kind: "shared", token } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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

// 3. wrong token -> error + 4001
{
  const c = open();
  await c.opened;
  c.ws.send(hello("definitely-wrong"));
  const code = await c.closed;
  report(code === 4001 && c.inbox.some((m) => m.type === "error" && m.code === "unauthorized"), "wrong token: error + 4001", `code=${code}`);
}

// 4. non-hello first message closes
{
  const c = open();
  await c.opened;
  c.ws.send(JSON.stringify({ type: "ping", t: 1 }));
  const code = await c.closed;
  report(code === 4001, "message before hello closes socket", `code=${code}`);
}

// 5. correct token -> welcome, ping/pong, bad_message, forbidden
{
  const c = open();
  await c.opened;
  c.ws.send(hello(secret.token));
  await wait(200);
  report(c.inbox[0]?.type === "welcome", "correct token -> welcome", JSON.stringify(c.inbox[0]));
  c.ws.send(JSON.stringify({ type: "ping", t: 42 }));
  c.ws.send(JSON.stringify({ type: "nav", dir: "sideways" }));
  c.ws.send("not json");
  c.ws.send(JSON.stringify({ type: "pairingStart" }));
  await wait(300);
  report(c.inbox.some((m) => m.type === "pong" && m.t === 42), "ping -> pong");
  report(c.inbox.filter((m) => m.type === "error" && m.code === "bad_message").length === 2, "invalid messages -> bad_message x2 (server alive)");
  report(c.inbox.some((m) => m.type === "error" && m.code === "forbidden"), "launcher-only message from remote -> forbidden");
  c.ws.send(JSON.stringify({ type: "ping", t: 43 }));
  await wait(150);
  report(c.inbox.some((m) => m.type === "pong" && m.t === 43), "socket still usable after bad input");
  c.ws.close();
}

// 6. oversize payload
{
  const c = open();
  await c.opened;
  c.ws.send(hello(secret.token));
  await wait(150);
  c.ws.send("x".repeat(20_000));
  const code = await c.closed;
  report(code === 1009, "payload > 16 KB closes with 1009", `code=${code}`);
}

console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
