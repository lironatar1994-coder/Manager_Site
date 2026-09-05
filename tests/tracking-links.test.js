const { test } = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const express = require("express");
const { createTrackingLinks, validateDestination, dateRange } = require("../lib/tracking-links");

test("tracking links: ownership, permissions, redirects, analytics, persistence and concurrent writes", async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "manager-links-test-"));
  process.env.DATA_DIR = dataDir;
  process.env.PORT = "0";
  process.env.BASE_PATH = "/Manager_Site";
  process.env.NODE_ENV = "production";
  process.env.ADMIN_PASSWORD = "TestOnlyPassword!2026";
  const { startServer } = require("../server");
  const server = await startServer();
  if (!server.listening) await new Promise((resolve) => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const base = `${origin}/Manager_Site`;
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await fs.rm(dataDir, { recursive: true, force: true }); });
  async function request(route, { cookie, method = "GET", body, headers = {} } = {}) {
    const response = await fetch(`${base}${route}`, { method, redirect: "manual", headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const payload = response.headers.get("content-type")?.includes("application/json") ? await response.json() : await response.text();
    return { status: response.status, headers: response.headers, payload };
  }
  async function login(username) {
    const result = await request("/api/auth/login", { method: "POST", body: { username, password: "TestOnlyPassword!2026" } });
    assert.equal(result.status, 200); return result.headers.get("set-cookie").split(";")[0];
  }
  const admin = await login("admin");
  const accounts = [];
  for (const username of ["alpha", "beta"]) {
    const result = await request("/api/admin/users", { method: "POST", cookie: admin, body: { username, password: "TestOnlyPassword!2026", displayName: username, siteName: username, websiteUrl: `https://example.com/${username}` } });
    assert.equal(result.status, 201); accounts.push(result.payload);
  }
  const alpha = await login("alpha"), beta = await login("beta");
  const api = `/api/sites/${accounts[0].site.id}/links`;
  const apiBeta = `/api/sites/${accounts[1].site.id}/links`;
  let link;
  await t.test("unauthenticated and other clients cannot read or mutate links", async () => {
    assert.equal((await request(api)).status, 401);
    assert.equal((await request(api, { cookie: beta })).status, 403);
    assert.equal((await request(api, { cookie: beta, method: "POST", body: { name: "x", targetUrl: "https://example.com/alpha" } })).status, 403);
    assert.equal((await request(api, { cookie: alpha, method: "POST", headers: { origin: "https://evil.example" }, body: { name: "x", targetUrl: "https://example.com/alpha" } })).status, 403);
  });
  await t.test("targets are confined to the assigned site's origin and path", async () => {
    for (const targetUrl of ["https://evil.example/", "javascript:alert(1)", "https://example.com/beta", "https://example.com/alphabeta", "https://example.com/alpha/../beta", "https://example.com/alpha/%252e%252e/beta", "https://example.com/alpha/a%2fb", "https://user:pass@example.com/alpha"]) {
      assert.equal((await request(api, { cookie: alpha, method: "POST", body: { name: "invalid", targetUrl } })).status, 400, targetUrl);
    }
    const result = await request(api, { cookie: alpha, method: "POST", body: { name: "סטורי באינסטגרם", description: "מבצע ספטמבר", targetUrl: "https://example.com/alpha/offer?utm_source=instagram#contact" } });
    assert.equal(result.status, 201); link = result.payload.link;
    assert.match(link.path, /^\/Manager_Site\/r\/[\w-]{12}$/);
    assert.equal((await request(`${apiBeta}/${link.id}`, { cookie: beta })).status, 404);
    assert.equal((await request(`${apiBeta}/${link.id}`, { cookie: beta, method: "PATCH", body: { name: "hijacked" } })).status, 404);
  });
  const redirectPath = link.path.replace("/Manager_Site", "");
  const browser = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile Safari/604.1";
  await t.test("redirects are uncached and do not pass arbitrary destination query parameters", async () => {
    const result = await request(`${redirectPath}?url=https://evil.example`, { headers: { "user-agent": browser, "x-real-ip": "203.0.113.1", referer: "https://instagram.com/private?secret=hidden" } });
    assert.equal(result.status, 302); assert.equal(result.headers.get("location"), link.targetUrl);
    assert.match(result.headers.get("cache-control"), /no-store/);
    assert.equal(result.headers.get("referrer-policy"), "no-referrer");
    assert.equal((await request("/r/nonexistent")).status, 404);
  });
  await t.test("counts candidates once per IP, bots separately, skips HEAD and non-navigation", async () => {
    await request(redirectPath, { headers: { "user-agent": browser, "x-real-ip": "203.0.113.1" } });
    await request(redirectPath, { headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/130 Safari/537.36", "x-real-ip": "203.0.113.2" } });
    await request(redirectPath, { headers: { "user-agent": "WhatsApp/2.0", "x-real-ip": "203.0.113.3" } });
    await request(redirectPath, { headers: { "user-agent": browser, "sec-purpose": "prefetch" } });
    await request(redirectPath, { method: "HEAD", headers: { "user-agent": browser } });
    await request(redirectPath, { headers: { "user-agent": browser, "sec-fetch-dest": "image" } });
    const result = await request(api, { cookie: alpha });
    const stats = result.payload.links[0].stats;
    assert.equal(stats.clicks, 3); assert.equal(stats.unique, 2); assert.equal(stats.bots, 2);
    assert.equal(stats.devices.find((item) => item.label === "mobile").count, 2);
    assert.deepEqual(stats.referrers.find((item) => item.label === "instagram.com"), { label: "instagram.com", count: 1 });
    assert.equal(stats.series.reduce((sum, day) => sum + day.clicks, 0), 3);
    assert.equal(stats.series.length, 30); assert.ok(stats.lastAt);
    assert.equal(result.payload.range.timeZone, "Asia/Jerusalem");
    assert.equal((await request(`${api}?from=2026-02-30&to=2026-03-01`, { cookie: alpha })).status, 400);
    assert.equal((await request(`${api}?from=2020-01-01&to=2026-03-01`, { cookie: alpha })).status, 400);
    const past = await request(`${api}?from=2020-01-01&to=2020-01-03`, { cookie: alpha });
    assert.equal(past.payload.summary.clicks, 0); assert.equal(past.payload.links[0].stats.series.length, 3);
  });
  await t.test("editing preserves the public address, history and counts; archive and restore work", async () => {
    const updated = await request(`${api}/${link.id}`, { method: "PATCH", cookie: alpha, body: { name: "שם חדש", targetUrl: "https://example.com/alpha/new" } });
    assert.equal(updated.status, 200); assert.equal(updated.payload.link.code, link.code);
    assert.equal(updated.payload.link.history[1].changes.targetUrl.from, link.targetUrl);
    assert.equal((await request(redirectPath, { method: "HEAD" })).headers.get("location"), "https://example.com/alpha/new");
    for (const status of ["disabled", "archived"]) {
      assert.equal((await request(`${api}/${link.id}`, { method: "PATCH", cookie: alpha, body: { status } })).status, 200);
      assert.equal((await request(redirectPath)).status, 410);
    }
    await request(`${api}/${link.id}`, { method: "PATCH", cookie: alpha, body: { status: "active" } });
    assert.equal((await request(redirectPath, { method: "HEAD" })).status, 302);
    const detail = await request(`${api}/${link.id}`, { cookie: admin });
    assert.equal(detail.payload.link.stats.clicks, 3);
    assert.equal(detail.payload.link.history.length, 5);
  });
  await t.test("a read-only client can inspect reports, admin can edit, inactive clients' links stop", async () => {
    await request(`/api/admin/users/${accounts[0].user.id}`, { cookie: admin, method: "PATCH", body: { permissions: { canManageTrackingLinks: false } } });
    assert.equal((await request(api, { cookie: alpha })).status, 200);
    assert.equal((await request(api, { cookie: alpha, method: "POST", body: { name: "blocked", targetUrl: "https://example.com/alpha" } })).status, 403);
    assert.equal((await request(`${api}/${link.id}`, { cookie: alpha, method: "PATCH", body: { name: "blocked" } })).status, 403);
    assert.equal((await request(`${api}/${link.id}`, { cookie: admin, method: "PATCH", body: { description: "עדכון מנהל" } })).status, 200);
    await request(`/api/admin/users/${accounts[0].user.id}`, { cookie: admin, method: "PATCH", body: { active: false } });
    assert.equal((await request(redirectPath)).status, 410);
    await request(`/api/admin/users/${accounts[0].user.id}`, { cookie: admin, method: "PATCH", body: { active: true, permissions: { canManageTrackingLinks: true } } });
  });
  await t.test("simultaneous link creation and event writes do not lose updates", async () => {
    const created = await Promise.all(Array.from({ length: 12 }, (_, i) => request(api, { cookie: alpha, method: "POST", body: { name: `Parallel ${i}`, targetUrl: "https://example.com/alpha" } })));
    assert.ok(created.every((result) => result.status === 201));
    assert.equal(new Set(created.map((result) => result.payload.link.code)).size, 12);
    await Promise.all(Array.from({ length: 25 }, () => request(redirectPath, { headers: { "user-agent": browser, "x-real-ip": "203.0.113.1" } })));
    const result = await request(api, { cookie: alpha });
    assert.equal(result.payload.links.length, 13); assert.equal(result.payload.summary.clicks, 28);
    assert.equal(result.payload.summary.unique, 2);
  });
  await t.test("only hashed IPs and referrer hostnames persist; restart preserves secret and metrics", async () => {
    const folder = path.join(dataDir, "tracking-links");
    const metadata = JSON.parse(await fs.readFile(path.join(folder, "links.json"), "utf8"));
    const eventDir = path.join(folder, crypto.createHash("sha256").update(accounts[0].site.id).digest("hex"));
    const raw = await fs.readFile(path.join(eventDir, (await fs.readdir(eventDir))[0]), "utf8");
    assert.ok(!raw.includes("203.0.113.")); assert.ok(!raw.includes("secret=hidden"));
    const reloaded = createTrackingLinks({ dataDir, basePath: "/Manager_Site", readStore: async () => JSON.parse(await fs.readFile(path.join(dataDir, "store.json"), "utf8")),
      requireSiteAccess: (req, res, next) => { req.site = accounts[0].site; next(); }, requirePermission: () => (req, res, next) => next() });
    await reloaded.ready;
    const restartApp = express(); const router = express.Router(); reloaded.mount(router); restartApp.use("/Manager_Site", router);
    const restartServer = restartApp.listen(0, "127.0.0.1"); await new Promise((resolve) => restartServer.once("listening", resolve));
    try {
      const result = await fetch(`http://127.0.0.1:${restartServer.address().port}/Manager_Site${api}`);
      assert.equal((await result.json()).summary.clicks, 28);
      assert.equal(JSON.parse(await fs.readFile(path.join(folder, "links.json"), "utf8")).secret, metadata.secret);
    } finally { await new Promise((resolve) => restartServer.close(resolve)); }
  });
  await t.test("public shell and new assets load under the production base path", async () => {
    for (const route of ["/login", "/client/alpha/links", "/links.js", "/links.css"]) assert.equal((await request(route)).status, 200, route);
  });
  await t.test("hostnames matching object properties remain ordinary referrer counts", async () => {
    await request(redirectPath, { headers: { "user-agent": browser, "x-real-ip": "203.0.113.1", referer: "https://constructor/" } });
    const detail = await request(`${api}/${link.id}`, { cookie: alpha });
    assert.deepEqual(detail.payload.link.stats.referrers.find((item) => item.label === "constructor"), { label: "constructor", count: 1 });
  });
  await t.test("unique overview visitors are deduplicated across different links", async () => {
    const all = await request(api, { cookie: alpha });
    const other = all.payload.links.find((item) => item.id !== link.id);
    await request(other.path.replace("/Manager_Site", ""), { headers: { "user-agent": browser, "x-real-ip": "203.0.113.1" } });
    const result = await request(api, { cookie: alpha });
    assert.equal(result.payload.summary.unique, 2);
    assert.equal(result.payload.links.reduce((sum, item) => sum + item.stats.unique, 0), 3);
  });
});

test("URL normalization and exact day ranges", () => {
  assert.equal(validateDestination("https://example.com/site/?utm_source=test", "https://example.com/site/", "/Manager_Site"), "https://example.com/site/?utm_source=test");
  assert.throws(() => validateDestination("https://example.com/Manager_Site/r/abc", "https://example.com", "/Manager_Site"));
  assert.throws(() => dateRange({ from: ["2026-01-01"], to: "2026-01-01" }));
  assert.equal(dateRange({ from: "2026-01-01", to: "2026-01-01" }).days.length, 1);
});
