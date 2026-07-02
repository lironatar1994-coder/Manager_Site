const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const express = require("express");
const multer = require("multer");

const PORT = Number(process.env.PORT || 3027);
const BASE_PATH = normalizeBasePath(process.env.BASE_PATH || "");
const SESSION_COOKIE = "manager_site_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
const UPLOAD_ROOT = process.env.UPLOAD_ROOT || path.join(DATA_DIR, "uploads");
const INITIAL_ADMIN_PATH = path.join(DATA_DIR, "initial-admin.txt");
const CLIENTS_DATA_DIR = process.env.CLIENTS_DIR || path.join(DATA_DIR, "clients");
const CLIENTS_REPO_DIR = path.join(__dirname, "clients");
const IMAGE_SLOTS = [
  { id: "hero", label: "Hero image", ratio: "16:9", required: true },
  { id: "logo", label: "Logo", ratio: "1:1", required: true },
  { id: "about", label: "About section", ratio: "4:3", required: false },
  { id: "service", label: "Service image", ratio: "4:3", required: false },
  { id: "gallery", label: "Gallery", ratio: "free", required: false },
];
const SITE_STATUSES = ["draft", "waiting_review", "published", "needs_attention"];

const app = express();
const sessions = new Map();

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(securityHeaders);

const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, callback) {
      const siteId = safeSegment(req.params.siteId || "site");
      const target = path.join(UPLOAD_ROOT, siteId);
      fs.mkdirSync(target, { recursive: true });
      callback(null, target);
    },
    filename(req, file, callback) {
      const ext = path.extname(file.originalname || "").toLowerCase();
      callback(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    if (!["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"].includes(file.mimetype)) {
      callback(new Error("Only image files are allowed"));
      return;
    }
    callback(null, true);
  },
});

const router = express.Router();
router.use("/uploads", requireAuth, express.static(UPLOAD_ROOT, { fallthrough: false }));
router.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

router.get("/api/auth/me", requireAuth, async (req, res) => {
  res.json({ user: publicUser(req.user), site: await siteForUser(req.user) });
});

router.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  const store = await readStore();
  const user = store.users.find((item) => item.username.toLowerCase() === String(username).toLowerCase());
  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  user.lastLoginAt = new Date().toISOString();
  await writeStore(store);
  createSession(res, user.id);
  res.json({ user: publicUser(user), redirectTo: user.role === "admin" ? "/admin" : `/client/${user.username}` });
});

router.post("/api/auth/logout", requireAuth, (req, res) => {
  sessions.delete(req.sessionId);
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/api/admin/users", requireAdmin, async (req, res) => {
  const store = await readStore();
  res.json({
    users: store.users.map((user) => ({
      ...publicUser(user),
      site: store.sites.find((site) => site.id === user.siteId) || null,
    })),
  });
});

router.post("/api/admin/users", requireAdmin, async (req, res) => {
  const body = req.body || {};
  const username = normalizeUsername(body.username);
  if (!username || !body.password || !body.displayName || !body.siteName || !body.websiteUrl) {
    res.status(400).json({ error: "Username, display name, password, site name, and website URL are required" });
    return;
  }

  const store = await readStore();
  if (store.users.some((user) => user.username === username)) {
    res.status(409).json({ error: "Username already exists" });
    return;
  }

  const site = {
    id: crypto.randomUUID(),
    ownerUsername: username,
    name: String(body.siteName).trim(),
    websiteUrl: String(body.websiteUrl).trim(),
    status: "draft",
    slots: IMAGE_SLOTS,
    images: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const user = {
    id: crypto.randomUUID(),
    username,
    displayName: String(body.displayName).trim(),
    role: "client",
    active: true,
    siteId: site.id,
    permissions: normalizePermissions(body.permissions),
    passwordHash: await hashPassword(String(body.password)),
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  };

  store.sites.push(site);
  store.users.push(user);
  store.audit.push(audit(req.user, "user.created", { username, siteId: site.id }));
  await writeStore(store);
  await ensureClientWorkspace(user, site);
  res.status(201).json({ user: publicUser(user), site });
});

router.patch("/api/admin/users/:userId", requireAdmin, async (req, res) => {
  const store = await readStore();
  const user = store.users.find((item) => item.id === req.params.userId);
  if (!user || user.role === "admin") {
    res.status(404).json({ error: "Client user not found" });
    return;
  }

  if (typeof req.body.active === "boolean") user.active = req.body.active;
  if (req.body.displayName) user.displayName = String(req.body.displayName).trim();
  if (req.body.permissions) user.permissions = normalizePermissions(req.body.permissions);
  if (req.body.password) user.passwordHash = await hashPassword(String(req.body.password));

  const site = store.sites.find((item) => item.id === user.siteId);
  if (site) {
    if (req.body.siteName) site.name = String(req.body.siteName).trim();
    if (req.body.websiteUrl) site.websiteUrl = String(req.body.websiteUrl).trim();
    site.updatedAt = new Date().toISOString();
  }

  store.audit.push(audit(req.user, "user.updated", { username: user.username }));
  await writeStore(store);
  res.json({ user: publicUser(user), site });
});

router.get("/api/sites", requireAuth, async (req, res) => {
  const store = await readStore();
  const sites = req.user.role === "admin" ? store.sites : store.sites.filter((site) => site.id === req.user.siteId);
  res.json({ sites });
});

router.get("/api/sites/:siteId", requireSiteAccess, async (req, res) => {
  res.json({ site: req.site });
});

router.get("/api/sites/:siteId/assets", requireSiteAccess, async (req, res) => {
  const config = await loadClientConfig(req.site.ownerUsername);
  if (!config) {
    res.json({ configured: false, assets: [], message: "No client config found" });
    return;
  }
  res.json({
    configured: true,
    client: publicClientConfig(config),
    assets: await scanClientAssets(req.site, config),
  });
});

router.get("/api/sites/:siteId/assets/:slotId/content", requireSiteAccess, async (req, res) => {
  const config = await loadClientConfig(req.site.ownerUsername);
  const slot = config ? findConfigSlot(config, req.params.slotId) : null;
  if (!config || !slot?.absolutePath) {
    res.status(404).json({ error: "Asset slot not configured" });
    return;
  }
  try {
    await assertFileReadable(slot.absolutePath);
    res.sendFile(slot.absolutePath);
  } catch (error) {
    res.status(404).json({ error: "Asset file not found" });
  }
});

router.delete("/api/sites/:siteId/assets/:slotId", requireSiteAccess, requirePermission("canDelete"), async (req, res) => {
  const config = await loadClientConfig(req.site.ownerUsername);
  const slot = config ? findConfigSlot(config, req.params.slotId) : null;
  if (!config || !slot?.absolutePath) {
    res.status(404).json({ error: "Asset slot not configured" });
    return;
  }
  const backupPath = await removeConfiguredAsset(slot);
  const store = await readStore();
  const site = store.sites.find((item) => item.id === req.params.siteId);
  if (site) {
    site.images = (site.images || []).filter((image) => !(image.slotId === slot.id && image.source === "production"));
    site.status = "waiting_review";
    site.updatedAt = new Date().toISOString();
    store.audit.push(audit(req.user, "asset.deleted", { siteId: site.id, slotId: slot.id, productionPath: slot.absolutePath, backupPath }));
    await writeStore(store);
  }
  res.json({ site, assets: await scanClientAssets(site || req.site, config) });
});

router.patch("/api/sites/:siteId", requireSiteAccess, requirePermission("canEditLinks"), async (req, res) => {
  const store = await readStore();
  const site = store.sites.find((item) => item.id === req.params.siteId);
  if (req.body.websiteUrl) site.websiteUrl = String(req.body.websiteUrl).trim();
  if (req.body.name && req.user.role === "admin") site.name = String(req.body.name).trim();
  site.updatedAt = new Date().toISOString();
  store.audit.push(audit(req.user, "site.updated", { siteId: site.id }));
  await writeStore(store);
  res.json({ site });
});

router.post("/api/sites/:siteId/status", requireSiteAccess, async (req, res) => {
  const nextStatus = String(req.body?.status || "").trim();
  if (!SITE_STATUSES.includes(nextStatus)) {
    res.status(400).json({ error: "Invalid site status" });
    return;
  }
  if (req.user.role !== "admin" && nextStatus !== "waiting_review" && !req.user.permissions?.canPublish) {
    res.status(403).json({ error: "Permission denied" });
    return;
  }

  const store = await readStore();
  const site = store.sites.find((item) => item.id === req.params.siteId);
  site.status = nextStatus;
  site.updatedAt = new Date().toISOString();
  store.audit.push(audit(req.user, "site.status", { siteId: site.id, status: nextStatus }));
  await writeStore(store);
  res.json({ site });
});

router.post(
  "/api/sites/:siteId/images",
  requireSiteAccess,
  requirePermission("canUpload"),
  upload.single("image"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "Image file is required" });
      return;
    }

    const store = await readStore();
    const site = store.sites.find((item) => item.id === req.params.siteId);
    const slotId = normalizeSlotId(req.body.slotId);
    const clientConfig = await loadClientConfig(site.ownerUsername);
    const configSlot = clientConfig ? findConfigSlot(clientConfig, slotId) : null;
    if (slotId !== "gallery") {
      const replaced = site.images.filter((image) => image.slotId === slotId && image.fileName);
      for (const image of replaced) {
        await fsp.rm(path.join(UPLOAD_ROOT, safeSegment(site.id), path.basename(image.fileName)), { force: true });
      }
      site.images = site.images.filter((image) => image.slotId !== slotId);
    }
    let productionAsset = null;
    if (configSlot?.absolutePath && (await directoryExists(clientConfig.siteRoot))) {
      productionAsset = await replaceConfiguredAsset(site, configSlot, req.file.path);
    }
    const image = {
      id: crypto.randomUUID(),
      name: req.body.name || req.file.originalname,
      slotId,
      url: productionAsset?.url || `${BASE_PATH}/uploads/${site.id}/${req.file.filename}`,
      fileName: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
      status: "waiting_review",
      changedAt: new Date().toISOString(),
      changedBy: req.user.username,
      source: productionAsset ? "production" : "manager",
      productionPath: productionAsset?.path || null,
      backupPath: productionAsset?.backupPath || null,
    };
    site.images.unshift(image);
    site.status = "waiting_review";
    site.updatedAt = new Date().toISOString();
    store.audit.push(audit(req.user, "image.uploaded", { siteId: site.id, imageId: image.id, slotId }));
    await writeStore(store);
    res.status(201).json({ image, site });
  }
);

router.delete(
  "/api/sites/:siteId/images/:imageId",
  requireSiteAccess,
  requirePermission("canDelete"),
  async (req, res) => {
    const store = await readStore();
    const site = store.sites.find((item) => item.id === req.params.siteId);
    const image = site.images.find((item) => item.id === req.params.imageId);
    const before = site.images.length;
    site.images = site.images.filter((image) => image.id !== req.params.imageId);
    if (site.images.length === before) {
      res.status(404).json({ error: "Image not found" });
      return;
    }
    if (image?.fileName) {
      const imagePath = path.join(UPLOAD_ROOT, safeSegment(site.id), path.basename(image.fileName));
      await fsp.rm(imagePath, { force: true });
    }
    site.status = "waiting_review";
    site.updatedAt = new Date().toISOString();
    store.audit.push(audit(req.user, "image.deleted", { siteId: site.id, imageId: req.params.imageId, slotId: image?.slotId }));
    await writeStore(store);
    res.json({ site });
  }
);

router.get("/api/admin/audit", requireAdmin, async (req, res) => {
  const store = await readStore();
  res.json({ audit: store.audit.slice(-80).reverse() });
});

router.get(["/", "/login", "/admin", "/client/:username"], (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use(BASE_PATH || "/", router);
if (BASE_PATH) {
  app.get("/", (req, res) => res.redirect(`${BASE_PATH}/login`));
}

app.use((err, req, res, next) => {
  if (err) {
    res.status(400).json({ error: err.message || "Request failed" });
    return;
  }
  next();
});

async function startServer() {
  await initStore();
  return app.listen(PORT, "127.0.0.1", () => {
    console.log(`Manager Site listening on http://127.0.0.1:${PORT}${BASE_PATH || ""}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { app, initStore, startServer };

function normalizeBasePath(value) {
  if (!value || value === "/") return "";
  return `/${String(value).replace(/^\/+|\/+$/g, "")}`;
}

async function ensureClientWorkspace(user, site) {
  const clientDir = path.join(CLIENTS_DATA_DIR, safeSegment(user.username));
  await fsp.mkdir(clientDir, { recursive: true });
  const agentsPath = path.join(clientDir, "AGENTS.md");
  const configPath = path.join(clientDir, "client.config.json");
  if (!fs.existsSync(agentsPath)) {
    await fsp.writeFile(
      agentsPath,
      [
        `# ${user.displayName} Client Agent File`,
        "",
        "This file is for future agents working on this client's website.",
        "",
        "## Client",
        "",
        `- Username: \`${user.username}\``,
        `- Display name: ${user.displayName}`,
        `- Website name: ${site.name}`,
        `- Manager route: \`/client/${user.username}\``,
        `- Public URL: ${site.websiteUrl}`,
        "",
        "## Production Asset Notes",
        "",
        "Update `client.config.json` with the real production `siteRoot` and allowed image slot paths before enabling direct production replacement.",
        "",
        "Only paths listed in `client.config.json` are allowed to be viewed or replaced by Manager Site.",
        "",
      ].join("\n")
    );
  }
  if (!fs.existsSync(configPath)) {
    await fsp.writeFile(
      configPath,
      `${JSON.stringify(defaultClientConfig(user, site), null, 2)}\n`
    );
  }
}

function defaultClientConfig(user, site) {
  const siteRoot = `/root/client-sites/${safeSegment(user.username)}`;
  return {
    username: user.username,
    displayName: user.displayName,
    websiteName: site.name,
    productionServer: "vee-app.co.il",
    siteRoot,
    publicUrl: site.websiteUrl,
    notes: "Replace the example paths below with the real production website image paths.",
    imageSlots: IMAGE_SLOTS.map((slot) => ({
      id: slot.id,
      labelHe: hebrewSlotLabel(slot.id),
      required: slot.required,
      currentPath: `${siteRoot}/public/images/${slot.id}.${slot.id === "logo" ? "png" : "jpg"}`,
      publicPath: `/images/${slot.id}.${slot.id === "logo" ? "png" : "jpg"}`,
    })),
  };
}

async function loadClientConfig(username) {
  const safeUsername = safeSegment(username);
  const candidates = [
    path.join(CLIENTS_DATA_DIR, safeUsername, "client.config.json"),
    path.join(CLIENTS_REPO_DIR, safeUsername, "client.config.json"),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const raw = await fsp.readFile(candidate, "utf8");
    return normalizeClientConfig(JSON.parse(raw), candidate);
  }
  return null;
}

function normalizeClientConfig(config, configPath) {
  const username = normalizeUsername(config.username);
  const siteRoot = path.resolve(String(config.siteRoot || ""));
  const imageSlots = Array.isArray(config.imageSlots) ? config.imageSlots : [];
  return {
    username,
    displayName: String(config.displayName || username),
    websiteName: String(config.websiteName || ""),
    productionServer: String(config.productionServer || ""),
    siteRoot,
    publicUrl: String(config.publicUrl || ""),
    configPath,
    imageSlots: imageSlots
      .map((slot) => normalizeConfigSlot(siteRoot, slot))
      .filter(Boolean),
  };
}

function normalizeConfigSlot(siteRoot, slot) {
  const id = normalizeSlotId(slot.id);
  const absolutePath = slot.currentPath ? path.resolve(String(slot.currentPath)) : "";
  if (!absolutePath || !isPathInside(siteRoot, absolutePath)) return null;
  return {
    id,
    labelHe: String(slot.labelHe || hebrewSlotLabel(id)),
    required: slot.required === true,
    absolutePath,
    publicPath: String(slot.publicPath || ""),
  };
}

function publicClientConfig(config) {
  return {
    username: config.username,
    displayName: config.displayName,
    websiteName: config.websiteName,
    productionServer: config.productionServer,
    publicUrl: config.publicUrl,
    siteRoot: config.siteRoot,
    configPath: config.configPath,
  };
}

async function scanClientAssets(site, config) {
  const assets = [];
  for (const slot of config.imageSlots) {
    let stats = null;
    try {
      stats = await fsp.stat(slot.absolutePath);
    } catch (error) {
      stats = null;
    }
    assets.push({
      id: `asset-${slot.id}`,
      slotId: slot.id,
      name: path.basename(slot.absolutePath),
      label: slot.labelHe,
      source: "production",
      exists: Boolean(stats?.isFile()),
      url: stats?.isFile() ? `${BASE_PATH}/api/sites/${site.id}/assets/${slot.id}/content?v=${stats.mtimeMs}` : "",
      publicPath: slot.publicPath,
      productionPath: slot.absolutePath,
      size: stats?.isFile() ? stats.size : 0,
      mtime: stats?.isFile() ? stats.mtime.toISOString() : null,
      required: slot.required,
    });
  }
  return assets;
}

function findConfigSlot(config, slotId) {
  const normalized = normalizeSlotId(slotId);
  return config.imageSlots.find((slot) => slot.id === normalized) || null;
}

async function replaceConfiguredAsset(site, slot, uploadedPath) {
  await fsp.mkdir(path.dirname(slot.absolutePath), { recursive: true });
  let backupPath = null;
  try {
    await assertFileReadable(slot.absolutePath);
    const backupDir = path.join(path.dirname(slot.absolutePath), ".manager-site-backups");
    await fsp.mkdir(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    backupPath = path.join(backupDir, `${path.basename(slot.absolutePath)}.${stamp}.bak`);
    await fsp.copyFile(slot.absolutePath, backupPath);
  } catch (error) {
    backupPath = null;
  }
  await fsp.copyFile(uploadedPath, slot.absolutePath);
  return {
    path: slot.absolutePath,
    backupPath,
    url: `${BASE_PATH}/api/sites/${site.id}/assets/${slot.id}/content?v=${Date.now()}`,
  };
}

async function removeConfiguredAsset(slot) {
  await assertFileReadable(slot.absolutePath);
  const backupDir = path.join(path.dirname(slot.absolutePath), ".manager-site-backups");
  await fsp.mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `${path.basename(slot.absolutePath)}.${stamp}.removed`);
  await fsp.copyFile(slot.absolutePath, backupPath);
  await fsp.rm(slot.absolutePath, { force: true });
  return backupPath;
}

async function assertFileReadable(filePath) {
  const stats = await fsp.stat(filePath);
  if (!stats.isFile()) throw new Error("Not a file");
  await fsp.access(filePath, fs.constants.R_OK);
  return stats;
}

async function directoryExists(dirPath) {
  try {
    const stats = await fsp.stat(dirPath);
    return stats.isDirectory();
  } catch (error) {
    return false;
  }
}

function isPathInside(root, target) {
  const relative = path.relative(root, target);
  return Boolean(root) && relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function hebrewSlotLabel(slotId) {
  return {
    hero: "תמונת פתיחה",
    logo: "לוגו",
    about: "אזור אודות",
    service: "תמונת שירות",
    gallery: "גלריה",
  }[slotId] || "תמונה";
}

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function safeSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function normalizePermissions(input = {}) {
  return {
    canUpload: input.canUpload !== false,
    canDelete: input.canDelete !== false,
    canEditLinks: input.canEditLinks !== false,
    canPublish: input.canPublish === true,
  };
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    active: user.active,
    siteId: user.siteId || null,
    permissions: user.permissions || {},
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

async function siteForUser(user) {
  if (user.role === "admin") return null;
  const store = await readStore();
  return store.sites.find((site) => site.id === user.siteId) || null;
}

function audit(user, action, details) {
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    actor: user.username,
    action,
    details,
  };
}

async function initStore() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.mkdir(UPLOAD_ROOT, { recursive: true });
  if (fs.existsSync(STORE_PATH)) return;

  const username = normalizeUsername(process.env.ADMIN_USERNAME || "admin");
  let initialPassword = process.env.ADMIN_PASSWORD || "";
  let passwordHash = process.env.ADMIN_PASSWORD_HASH || "";

  if (!passwordHash) {
    if (!initialPassword) {
      initialPassword = crypto.randomBytes(14).toString("base64url");
      await fsp.writeFile(
        INITIAL_ADMIN_PATH,
        `Initial admin login\nusername: ${username}\npassword: ${initialPassword}\ncreated: ${new Date().toISOString()}\n`,
        { mode: 0o600 }
      );
      console.log(`[SECURITY] Initial admin password saved once to ${INITIAL_ADMIN_PATH}`);
    }
    passwordHash = await hashPassword(initialPassword);
  }

  const now = new Date().toISOString();
  const store = {
    users: [
      {
        id: crypto.randomUUID(),
        username,
        displayName: "Administrator",
        role: "admin",
        active: true,
        siteId: null,
        permissions: {
          canUpload: true,
          canDelete: true,
          canEditLinks: true,
          canPublish: true,
        },
        passwordHash,
        createdAt: now,
        lastLoginAt: null,
      },
    ],
    sites: [],
    audit: [],
  };

  if (process.env.NODE_ENV !== "production") {
    const demoSiteId = crypto.randomUUID();
    store.users.push({
      id: crypto.randomUUID(),
      username: "miryam_zelig",
      displayName: "Miryam Zelig",
      role: "client",
      active: true,
      siteId: demoSiteId,
      permissions: normalizePermissions({ canPublish: false }),
      passwordHash: await hashPassword("ChangeMe!2026"),
      createdAt: now,
      lastLoginAt: null,
    });
    store.sites.push({
      id: demoSiteId,
      ownerUsername: "miryam_zelig",
      name: "Miryam Zelig Website",
      websiteUrl: "https://example.com/miryam",
      status: "draft",
      slots: IMAGE_SLOTS,
      images: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  await writeStore(store);
}

async function readStore() {
  const raw = await fsp.readFile(STORE_PATH, "utf8");
  const store = JSON.parse(raw);
  store.users = Array.isArray(store.users) ? store.users : [];
  store.sites = Array.isArray(store.sites) ? store.sites.map(normalizeSite) : [];
  store.audit = Array.isArray(store.audit) ? store.audit : [];
  return store;
}

async function writeStore(store) {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.writeFile(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`);
}

function normalizeSite(site) {
  site.images = Array.isArray(site.images) ? site.images : [];
  site.slots = Array.isArray(site.slots) && site.slots.length ? site.slots : IMAGE_SLOTS;
  site.status = SITE_STATUSES.includes(site.status) ? site.status : "draft";
  site.images = site.images.map((image) => ({
    slotId: "gallery",
    status: "waiting_review",
    ...image,
  }));
  return site;
}

function normalizeSlotId(slotId) {
  const value = String(slotId || "gallery").trim();
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value) ? value : "gallery";
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const key = await scrypt(password, salt);
  return `scrypt$${salt}$${key}`;
}

async function verifyPassword(password, hash) {
  const [scheme, salt, expected] = String(hash || "").split("$");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  const actual = await scrypt(password, salt);
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey.toString("base64url"));
    });
  });
}

function createSession(res, userId) {
  const sessionId = crypto.randomBytes(32).toString("base64url");
  sessions.set(sessionId, {
    userId,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS,
    path: BASE_PATH || "/",
  });
}

function clearSessionCookie(res) {
  res.cookie(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: BASE_PATH || "/",
  });
}

async function requireAuth(req, res, next) {
  const sessionId = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
  const session = sessionId ? sessions.get(sessionId) : null;
  if (!session || session.expiresAt < Date.now()) {
    if (sessionId) sessions.delete(sessionId);
    res.status(401).json({ error: "Login required" });
    return;
  }

  const store = await readStore();
  const user = store.users.find((item) => item.id === session.userId);
  if (!user || !user.active) {
    sessions.delete(sessionId);
    res.status(401).json({ error: "Login required" });
    return;
  }

  session.expiresAt = Date.now() + SESSION_TTL_MS;
  req.sessionId = sessionId;
  req.user = user;
  next();
}

async function requireAdmin(req, res, next) {
  await requireAuth(req, res, () => {
    if (req.user.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  });
}

async function requireSiteAccess(req, res, next) {
  await requireAuth(req, res, async () => {
    const store = await readStore();
    const site = store.sites.find((item) => item.id === req.params.siteId);
    if (!site) {
      res.status(404).json({ error: "Site not found" });
      return;
    }
    if (req.user.role !== "admin" && req.user.siteId !== site.id) {
      res.status(403).json({ error: "Site access denied" });
      return;
    }
    req.site = site;
    next();
  });
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (req.user.role === "admin" || req.user.permissions?.[permission]) {
      next();
      return;
    }
    res.status(403).json({ error: "Permission denied" });
  };
}

function parseCookies(cookieHeader) {
  return cookieHeader.split(";").reduce((cookies, part) => {
    const [key, ...value] = part.trim().split("=");
    if (key) cookies[key] = decodeURIComponent(value.join("="));
    return cookies;
  }, {});
}

function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' https://unpkg.com",
      "style-src 'self' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join("; ")
  );
  next();
}
