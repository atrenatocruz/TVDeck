import { describe, expect, it } from "vitest";
import { detectTailscaleBase, parseSelfDnsName, parseServeBase } from "./tailscale.ts";

const status = JSON.stringify({
  Version: "1.80.0",
  BackendState: "Running",
  Self: { HostName: "livingroom", DNSName: "livingroom.tail1234.ts.net.", Online: true },
  CurrentTailnet: { Name: "me@example.com", MagicDNSSuffix: "tail1234.ts.net" },
});
const serve = (port: number, listen = "443") =>
  JSON.stringify({
    TCP: { [listen]: { HTTPS: true } },
    Web: { [`livingroom.tail1234.ts.net:${listen}`]: { Handlers: { "/": { Proxy: `http://127.0.0.1:${port}` } } } },
  });

describe("parseSelfDnsName", () => {
  it("strips the trailing dot", () => expect(parseSelfDnsName(status)).toBe("livingroom.tail1234.ts.net"));
  it("returns null when stopped, empty or not JSON", () => {
    expect(parseSelfDnsName(JSON.stringify({ BackendState: "Stopped", Self: { DNSName: "a.b.ts.net." } }))).toBeNull();
    expect(parseSelfDnsName(JSON.stringify({ Self: {} }))).toBeNull();
    expect(parseSelfDnsName("")).toBeNull();
    expect(parseSelfDnsName("tailscale: not logged in")).toBeNull();
  });
});

describe("parseServeBase", () => {
  it("returns the https URL when serve proxies to our port", () => {
    expect(parseServeBase(status, serve(7420), 7420)).toBe("https://livingroom.tail1234.ts.net");
  });
  it("includes a non-443 port", () => {
    expect(parseServeBase(status, serve(7420, "8443"), 7420)).toBe("https://livingroom.tail1234.ts.net:8443");
  });
  it("accepts localhost and bare host:port proxies", () => {
    for (const proxy of ["http://localhost:7420", "127.0.0.1:7420", "http://127.0.0.1:7420/", "http://[::1]:7420"]) {
      const j = JSON.stringify({ TCP: { "443": { HTTPS: true } }, Web: { "livingroom.tail1234.ts.net:443": { Handlers: { "/": { Proxy: proxy } } } } });
      expect(parseServeBase(status, j, 7420)).toBe("https://livingroom.tail1234.ts.net");
    }
  });
  it("ignores serves for another port, non-https listeners and other targets", () => {
    expect(parseServeBase(status, serve(3000), 7420)).toBeNull();
    const http = JSON.stringify({ TCP: { "80": { HTTP: true } }, Web: { "livingroom.tail1234.ts.net:80": { Handlers: { "/": { Proxy: "http://127.0.0.1:7420" } } } } });
    expect(parseServeBase(status, http, 7420)).toBeNull();
    const remote = JSON.stringify({ TCP: { "443": { HTTPS: true } }, Web: { "x:443": { Handlers: { "/": { Proxy: "http://10.0.0.5:7420" } } } } });
    expect(parseServeBase(status, remote, 7420)).toBeNull();
  });
  it("handles an empty or invalid serve config", () => {
    expect(parseServeBase(status, "{}", 7420)).toBeNull();
    expect(parseServeBase(status, "No serve config", 7420)).toBeNull();
    expect(parseServeBase("garbage", serve(7420), 7420)).toBeNull();
  });
});

describe("detectTailscaleBase", () => {
  it("degrades to null when the CLI is missing", async () => {
    expect(await detectTailscaleBase(7420, async () => null, ["tailscale"])).toBeNull();
  });
  it("uses status then serve status", async () => {
    const calls: string[] = [];
    const run = async (_c: string, args: string[]) => (calls.push(args.join(" ")), args[0] === "status" ? status : serve(7420));
    expect(await detectTailscaleBase(7420, run, ["tailscale"])).toBe("https://livingroom.tail1234.ts.net");
    expect(calls).toEqual(["status --json", "serve status --json"]);
  });
  it("falls back to the next candidate binary", async () => {
    const run = async (c: string, args: string[]) => (c === "second" ? (args[0] === "status" ? status : serve(7420)) : null);
    expect(await detectTailscaleBase(7420, run, ["first", "second"])).toBe("https://livingroom.tail1234.ts.net");
  });
});
