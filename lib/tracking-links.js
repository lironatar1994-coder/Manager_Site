const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const readline = require("node:readline");
const net = require("node:net");

const DAY = 86400000;
const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" });
const dayKey = (date) => dayFormatter.format(date);
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });

function validateDestination(value, websiteUrl, basePath) {
  let target, website;
  try { target = new URL(value); website = new URL(websiteUrl); } catch { throw fail(400, "יש להזין כתובת אתר מלאה ותקינה."); }
  const root = website.pathname.replace(/\/+$/, "");
  if (!["https:", "http:"].includes(target.protocol) || target.username || target.password ||
      target.origin !== website.origin || (root && target.pathname !== root && !target.pathname.startsWith(`${root}/`)) ||
      /%(?:2f|5c|2e|25)/i.test(target.pathname) || target.pathname.startsWith(`${basePath}/r/`)) {
    throw fail(400, "כתובת היעד חייבת להיות עמוד בתוך האתר המשויך לך.");
  }
  if (target.href.length > 2048) throw fail(400, "כתובת היעד ארוכה מדי.");
  return target.href;
}

function dateRange(query) {
  const to = query.to || dayKey(new Date());
  const from = query.from || dayKey(new Date(Date.now() - 29 * DAY));
  const valid = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
  if (!valid(from) || !valid(to) || from > to || (Date.parse(to) - Date.parse(from)) / DAY > 365) {
    throw fail(400, "יש לבחור טווח תאריכים תקין של עד 366 ימים.");
  }
  const days = [];
  for (let time = Date.parse(from); time <= Date.parse(to); time += DAY) days.push(new Date(time).toISOString().slice(0, 10));
  return { from, to, days, timeZone: "Asia/Jerusalem" };
}

function classifyRequest(req) {
  const ua = String(req.get("user-agent") || "").slice(0, 1000);
  const purpose = `${req.get("purpose") || ""} ${req.get("sec-purpose") || ""}`;
  const bot = !ua || /bot|crawl|spider|slurp|preview|facebookexternalhit|facebot|whatsapp|telegram|headless|phantom|selenium|playwright|puppeteer|curl|wget|python|httpclient|go-http-client|scrapy|lighthouse/i.test(ua);
  const automated = bot || /prefetch|prerender/i.test(purpose);
  const device = /ipad|tablet|android(?!.*mobile)/i.test(ua) ? "tablet" : /mobi|iphone|ipod/i.test(ua) ? "mobile" : /mozilla/i.test(ua) ? "desktop" : "unknown";
  let referrer = "";
  try { const url = new URL(req.get("referer")); if (["http:", "https:"].includes(url.protocol)) referrer = url.hostname; } catch { /* referrer is optional */ }
  return { automated, device, referrer, reason: automated ? (/prefetch|prerender/i.test(purpose) ? "prefetch" : "bot") : "" };
}

// The app listens on loopback; production Nginx overwrites X-Real-IP.
// Never accept the client-controlled first entry of X-Forwarded-For.
function requestIp(req) {
  const remote = req.socket.remoteAddress || "";
  const forwarded = req.get("x-real-ip");
  const ip = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote) && net.isIP(forwarded || "") ? forwarded : remote;
  return ip.replace(/^::ffff:/, "");
}

function createTrackingLinks({ dataDir, basePath, readStore, requireSiteAccess, requirePermission }) {
  const root = path.join(dataDir, "tracking-links");
  const metadataPath = path.join(root, "links.json");
  let metadata;
  let queue = Promise.resolve();
  const serial = (work) => { const result = queue.then(work); queue = result.catch(() => {}); return result; };
  const ready = (async () => {
    await fsp.mkdir(root, { recursive: true, mode: 0o700 });
    try { metadata = JSON.parse(await fsp.readFile(metadataPath, "utf8")); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      metadata = { version: 1, secret: crypto.randomBytes(32).toString("hex"), links: [] };
      await fsp.writeFile(metadataPath, JSON.stringify(metadata), { mode: 0o600, flag: "wx" });
    }
    if (metadata.version !== 1 || !metadata.secret || !Array.isArray(metadata.links)) throw new Error("Invalid tracking links store");
  })();
  // The startup caller awaits ready. Attach immediately to avoid an unhandled rejection.
  ready.catch(() => {});
  async function save(next) {
    const temp = `${metadataPath}.tmp`;
    await fsp.writeFile(temp, JSON.stringify(next), { mode: 0o600 });
    await fsp.rename(temp, metadataPath);
    metadata = next;
  }
  const publicLink = (link) => ({ ...link, path: `${basePath}/r/${link.code}` });
  const wrap = (work) => async (req, res, next) => {
    try { await ready; await work(req, res); }
    catch (error) {
      if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
      console.error("Tracking links request failed", error.code || error.name);
      res.status(503).json({ error: "לא ניתן לגשת ללינקים כרגע. נסו שוב בעוד רגע." });
    }
  };
  const requireSameOrigin = (req, res, next) => {
    let foreign = req.get("sec-fetch-site") === "cross-site";
    if (req.get("origin")) {
      try { foreign ||= new URL(req.get("origin")).host !== req.get("host"); } catch { foreign = true; }
    }
    if (foreign) return res.status(403).json({ error: "הבקשה אינה מורשית." });
    next();
  };
  function linkForSite(req) {
    const link = metadata.links.find((item) => item.id === req.params.linkId && item.siteId === req.site.id);
    if (!link) throw fail(404, "הלינק לא נמצא.");
    return link;
  }
  async function statistics(siteId, links, range) {
    await queue;
    const stats = new Map(links.map((link) => [link.id, {
      clicks: 0, bots: 0, lastAt: null, unique: new Set(), devices: Object.create(null), referrers: Object.create(null),
      series: new Map(range.days.map((day) => [day, { day, clicks: 0, bots: 0 }]))
    }]));
    const siteKey = crypto.createHash("sha256").update(siteId).digest("hex");
    for (const day of range.days) {
      const file = path.join(root, siteKey, `${day}.ndjson`);
      // Snapshot only complete appends. Streaming then happens outside the write queue.
      const size = await serial(async () => {
        try { return (await fsp.stat(file)).size; } catch (error) { if (error.code === "ENOENT") return 0; throw error; }
      });
      if (!size) continue;
      const stream = fs.createReadStream(file, { encoding: "utf8", end: size - 1 });
      const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
      try {
        for await (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          const item = stats.get(event.linkId);
          if (!item) continue;
          const bucket = item.series.get(day);
          if (event.automated) { item.bots++; bucket.bots++; continue; }
          item.clicks++; bucket.clicks++;
          item.unique.add(event.visitor);
          if (!item.lastAt || event.at > item.lastAt) item.lastAt = event.at;
          item.devices[event.device] = (item.devices[event.device] || 0) + 1;
          item.referrers[event.referrer || "direct"] = (item.referrers[event.referrer || "direct"] || 0) + 1;
        }
      } finally { lines.close(); stream.destroy(); }
    }
    const unique = new Set();
    const rank = (values) => Object.entries(values).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
    const results = links.map((link) => {
      const item = stats.get(link.id);
      for (const visitor of item.unique) unique.add(visitor);
      return { ...publicLink(link), stats: { clicks: item.clicks, bots: item.bots, unique: item.unique.size, lastAt: item.lastAt,
        devices: rank(item.devices), referrers: rank(item.referrers), series: [...item.series.values()] } };
    });
    return { links: results, range: { from: range.from, to: range.to, timeZone: range.timeZone }, summary: {
      clicks: results.reduce((sum, item) => sum + item.stats.clicks, 0), bots: results.reduce((sum, item) => sum + item.stats.bots, 0), unique: unique.size
    } };
  }
  function mount(router) {
    router.get("/r/:code", wrap(async (req, res) => {
      res.set({ "Cache-Control": "no-store, private, max-age=0", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" });
      const link = metadata.links.find((item) => item.code === req.params.code);
      const store = await readStore();
      const site = link && store.sites.find((item) => item.id === link.siteId);
      const owner = site && store.users.find((item) => item.siteId === site.id && item.role === "client" && item.active);
      if (!link || link.status !== "active" || !site || !owner) {
        res.status(link ? 410 : 404).type("html").send('<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>הלינק אינו זמין</title><h1>הלינק אינו זמין</h1><p>אפשר לפנות למי ששיתף את הלינק לקבלת כתובת מעודכנת.</p></html>');
        return;
      }
      try { validateDestination(link.targetUrl, site.websiteUrl, basePath); }
      catch { res.status(410).type("text").send("הלינק אינו זמין כעת."); return; }
      const destination = req.get("sec-fetch-dest");
      if (req.method === "GET" && (!destination || destination === "document" || destination === "iframe")) {
        const at = new Date();
        const event = { linkId: link.id, at: at.toISOString(), ...classifyRequest(req),
          visitor: crypto.createHmac("sha256", metadata.secret).update(`${site.id}:${requestIp(req)}`).digest("hex") };
        const siteKey = crypto.createHash("sha256").update(site.id).digest("hex");
        await serial(async () => {
          const folder = path.join(root, siteKey);
          await fsp.mkdir(folder, { recursive: true, mode: 0o700 });
          await fsp.appendFile(path.join(folder, `${dayKey(at)}.ndjson`), `${JSON.stringify(event)}\n`, { mode: 0o600 });
        });
      }
      res.redirect(302, link.targetUrl);
    }));
    router.use("/api/sites/:siteId/links", (req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
    router.get("/api/sites/:siteId/links", requireSiteAccess, wrap(async (req, res) => {
      const links = metadata.links.filter((item) => item.siteId === req.site.id);
      res.json(await statistics(req.site.id, links, dateRange(req.query)));
    }));
    router.get("/api/sites/:siteId/links/:linkId", requireSiteAccess, wrap(async (req, res) => {
      const result = await statistics(req.site.id, [linkForSite(req)], dateRange(req.query));
      res.json({ link: result.links[0], range: result.range });
    }));
    router.post("/api/sites/:siteId/links", requireSiteAccess, requirePermission("canManageTrackingLinks"), requireSameOrigin, wrap(async (req, res) => {
      const body = req.body || {};
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const description = typeof body.description === "string" ? body.description.trim() : "";
      if (!name || name.length > 100 || description.length > 500) throw fail(400, "יש להזין שם עד 100 תווים ותיאור עד 500 תווים.");
      const targetUrl = validateDestination(body.targetUrl, req.site.websiteUrl, basePath);
      const link = await serial(async () => {
        if (metadata.links.filter((item) => item.siteId === req.site.id).length >= 1000) throw fail(400, "הגעת למגבלת 1,000 לינקים לאתר.");
        let code;
        do { code = crypto.randomBytes(9).toString("base64url"); } while (metadata.links.some((item) => item.code === code));
        const now = new Date().toISOString();
        const item = { id: crypto.randomUUID(), siteId: req.site.id, code, name, description, targetUrl, status: "active", createdAt: now, updatedAt: now,
          history: [{ at: now, actor: req.user.username, action: "created", name, description, targetUrl, status: "active" }] };
        await save({ ...metadata, links: [...metadata.links, item] });
        return item;
      });
      res.status(201).json({ link: publicLink(link) });
    }));
    router.patch("/api/sites/:siteId/links/:linkId", requireSiteAccess, requirePermission("canManageTrackingLinks"), requireSameOrigin, wrap(async (req, res) => {
      const link = await serial(async () => {
        const current = linkForSite(req);
        const body = req.body || {};
        const next = { ...current };
        if (body.name !== undefined) {
          if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 100) throw fail(400, "יש להזין שם עד 100 תווים.");
          next.name = body.name.trim();
        }
        if (body.description !== undefined) {
          if (typeof body.description !== "string" || body.description.trim().length > 500) throw fail(400, "התיאור מוגבל ל־500 תווים.");
          next.description = body.description.trim();
        }
        if (body.targetUrl !== undefined) next.targetUrl = validateDestination(body.targetUrl, req.site.websiteUrl, basePath);
        if (body.status !== undefined) {
          if (!["active", "disabled", "archived"].includes(body.status)) throw fail(400, "מצב הלינק אינו תקין.");
          next.status = body.status;
        }
        if (next.status === "active") validateDestination(next.targetUrl, req.site.websiteUrl, basePath);
        const fields = ["name", "description", "targetUrl", "status"];
        if (!fields.some((key) => current[key] !== next[key])) return current;
        next.updatedAt = new Date().toISOString();
        next.history = [...current.history, { at: next.updatedAt, actor: req.user.username, action: "updated",
          changes: Object.fromEntries(fields.filter((key) => current[key] !== next[key]).map((key) => [key, { from: current[key], to: next[key] }])) }];
        await save({ ...metadata, links: metadata.links.map((item) => item.id === next.id ? next : item) });
        return next;
      });
      res.json({ link: publicLink(link) });
    }));
  }
  return { mount, ready };
}

module.exports = { createTrackingLinks, validateDestination, dateRange, classifyRequest };
