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
const SESSION_STORE_PATH = path.join(DATA_DIR, "sessions.json");
const UPLOAD_ROOT = process.env.UPLOAD_ROOT || path.join(DATA_DIR, "uploads");
const INITIAL_ADMIN_PATH = path.join(DATA_DIR, "initial-admin.txt");
const CLIENTS_DATA_DIR = process.env.CLIENTS_DIR || path.join(DATA_DIR, "clients");
const CLIENTS_REPO_DIR = path.join(__dirname, "clients");
const PUBLIC_DIR = path.join(__dirname, "public");
const UPLOAD_FILE_LIMIT_BYTES = 16 * 1024 * 1024;
const ERROR_ALERT_EMAIL = process.env.ERROR_ALERT_EMAIL || "lironatar94@gmail.com";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "Manager Site <onboarding@resend.dev>";
const IMAGE_SLOTS = [
  { id: "hero", label: "Hero image", ratio: "16:9", required: true },
  { id: "logo", label: "Logo", ratio: "1:1", required: true },
  { id: "about", label: "About section", ratio: "4:3", required: false },
  { id: "service", label: "Service image", ratio: "4:3", required: false },
  { id: "gallery", label: "Gallery", ratio: "free", required: false },
];
const SITE_STATUSES = ["draft", "published", "needs_attention"];

const app = express();
const sessions = new Map();
const galleryAlertCooldowns = new Map();

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
  limits: { fileSize: UPLOAD_FILE_LIMIT_BYTES },
  fileFilter(req, file, callback) {
    if (!["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"].includes(file.mimetype)) {
      const error = new Error("Only JPG, PNG, WebP, GIF, or SVG images are allowed");
      error.statusCode = 415;
      callback(error);
      return;
    }
    callback(null, true);
  },
});

const router = express.Router();
router.use("/uploads", requireAuth, express.static(UPLOAD_ROOT, { fallthrough: false, setHeaders: setManagedImageCacheHeaders }));
router.get(["/", "/index.html"], sendSpaShell);
router.get(["/login/app.js", "/admin-login/app.js", "/admin/app.js", "/client/app.js", "/client/:username/app.js"], sendPublicAsset("app.js"));
router.get(["/login/styles.css", "/admin-login/styles.css", "/admin/styles.css", "/client/styles.css", "/client/:username/styles.css"], sendPublicAsset("styles.css"));
router.use(express.static(PUBLIC_DIR, { extensions: ["html"] }));

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
  await createSession(res, user.id);
  res.json({ user: publicUser(user), redirectTo: user.role === "admin" ? "/admin" : `/client/${user.username}` });
});

router.post("/api/auth/logout", requireAuth, async (req, res) => {
  sessions.delete(req.sessionId);
  await writeSessions();
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
  if (site) await syncClientWorkspaceMetadata(user, site);
  res.json({ user: publicUser(user), site });
});

router.post("/api/admin/users/:userId/reset-password", requireAdmin, async (req, res) => {
  const store = await readStore();
  const user = store.users.find((item) => item.id === req.params.userId);
  if (!user || user.role === "admin") {
    res.status(404).json({ error: "Client user not found" });
    return;
  }

  const temporaryPassword = generateTemporaryPassword();
  user.passwordHash = await hashPassword(temporaryPassword);
  store.audit.push(audit(req.user, "user.password_reset", { username: user.username }));
  await writeStore(store);
  res.json({ user: publicUser(user), temporaryPassword });
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

router.get("/api/sites/:siteId/text", requireSiteAccess, async (req, res) => {
  const config = await loadClientConfig(req.site.ownerUsername);
  if (!config) {
    res.json({ configured: false, textSlots: [], message: "No client config found" });
    return;
  }
  res.json({
    configured: true,
    client: publicClientConfig(config),
    textSlots: await scanClientTextSlots(config),
  });
});

router.patch("/api/sites/:siteId/text/:slotId", requireSiteAccess, requirePermission("canEditText"), async (req, res) => {
  const config = await loadClientConfig(req.site.ownerUsername);
  const slot = config ? findTextSlot(config, req.params.slotId) : null;
  if (!config || !slot) {
    res.status(404).json({ error: "Text slot not configured" });
    return;
  }

  const value = normalizeTextValue(req.body?.value);
  if (slot.required && !value.trim()) {
    res.status(400).json({ error: "Text value is required" });
    return;
  }
  if (value.length > slot.maxLength) {
    res.status(400).json({ error: "Text value is too long" });
    return;
  }

  try {
    const result = await replaceConfiguredText(slot, value);
    const store = await readStore();
    const site = store.sites.find((item) => item.id === req.site.id);
    if (site) site.updatedAt = new Date().toISOString();
    store.audit.push(audit(req.user, "text.updated", { siteId: req.site.id, slotId: slot.id, backupPath: result.backupPath }));
    await writeStore(store);
    res.json({
      site: site || req.site,
      textSlot: result.textSlot,
      textSlots: await scanClientTextSlots(config),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Could not update text slot" });
  }
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
    setManagedImageCacheHeaders(res);
    res.sendFile(slot.absolutePath);
  } catch (error) {
    res.status(404).json({ error: "Asset file not found" });
  }
});

router.delete("/api/sites/:siteId/assets/:slotId", requireSiteAccess, requirePermission("canDelete"), async (req, res) => {
  const configDoc = await loadClientConfigDocument(req.site.ownerUsername);
  const config = configDoc ? normalizeClientConfig(configDoc.config, configDoc.savePath) : null;
  const slot = config ? findConfigSlot(config, req.params.slotId) : null;
  if (!config || !slot?.absolutePath) {
    res.status(404).json({ error: "Asset slot not configured" });
    return;
  }

  let backupPath = null;
  let removedFramePath = null;
  try {
    if (gallerySlotNumber(slot.id)) {
      removedFramePath = await removeGalleryFrame(config, slot);
    }
    if (await fileExists(slot.absolutePath)) {
      backupPath = await removeConfiguredAsset(slot);
    }
    if (gallerySlotNumber(slot.id) > 1 && !slot.required && configDoc) {
      const rawSlots = Array.isArray(configDoc.config.imageSlots) ? configDoc.config.imageSlots : [];
      configDoc.config.imageSlots = rawSlots.filter((item) => normalizeSlotId(item.id) !== slot.id);
      await saveClientConfigDocument(configDoc);
    }
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Could not remove image from live gallery" });
    return;
  }

  const store = await readStore();
  const site = store.sites.find((item) => item.id === req.params.siteId);
  if (site) {
    site.images = (site.images || []).filter((image) => !(image.slotId === slot.id && image.source === "production"));
    site.updatedAt = new Date().toISOString();
    store.audit.push(audit(req.user, "asset.deleted", { siteId: site.id, slotId: slot.id, productionPath: slot.absolutePath, backupPath, removedFramePath }));
    await writeStore(store);
  }
  const updatedConfig = await loadClientConfig(req.site.ownerUsername);
  res.json({ site, assets: updatedConfig ? await scanClientAssets(site || req.site, updatedConfig) : [] });
});

router.post("/api/sites/:siteId/assets/:slotId/restore", requireSiteAccess, requirePermission("canUpload"), async (req, res) => {
  const config = await loadClientConfig(req.site.ownerUsername);
  const slot = config ? findConfigSlot(config, req.params.slotId) : null;
  if (!config || !slot?.absolutePath) {
    res.status(404).json({ error: "Asset slot not configured" });
    return;
  }

  let result;
  try {
    result = await restoreConfiguredAsset(slot);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Could not restore image backup" });
    return;
  }
  const store = await readStore();
  const site = store.sites.find((item) => item.id === req.params.siteId);
  if (site) {
    site.updatedAt = new Date().toISOString();
    store.audit.push(audit(req.user, "asset.restored", { siteId: site.id, slotId: slot.id, productionPath: slot.absolutePath, ...result }));
    await writeStore(store);
  }
  res.json({ site, assets: await scanClientAssets(site || req.site, config), restore: result });
});

router.post("/api/sites/:siteId/assets/reorder", requireSiteAccess, requirePermission("canUpload"), async (req, res) => {
  const sourceSlotId = normalizeSlotId(req.body?.sourceSlotId);
  const targetSlotId = normalizeSlotId(req.body?.targetSlotId);
  if (!sourceSlotId || !targetSlotId || sourceSlotId === targetSlotId) {
    res.status(400).json({ error: "Source and target image slots are required" });
    return;
  }

  const config = await loadClientConfig(req.site.ownerUsername);
  const sourceSlot = config ? findConfigSlot(config, sourceSlotId) : null;
  const targetSlot = config ? findConfigSlot(config, targetSlotId) : null;
  if (!config || !sourceSlot?.absolutePath || !targetSlot?.absolutePath) {
    res.status(404).json({ error: "Configured image slot not found" });
    return;
  }

  const result = await reorderConfiguredAssets(sourceSlot, targetSlot);
  const store = await readStore();
  const site = store.sites.find((item) => item.id === req.params.siteId);
  if (site) {
    site.updatedAt = new Date().toISOString();
    store.audit.push(audit(req.user, "asset.reordered", { siteId: site.id, sourceSlotId, targetSlotId, ...result }));
    await writeStore(store);
  }
  res.json({ site, assets: await scanClientAssets(site || req.site, config) });
});

router.post(
  "/api/sites/:siteId/upload-failures",
  requireSiteAccess,
  requirePermission("canUpload"),
  async (req, res) => {
    const input = req.body || {};
    req.file = {
      originalname: String(input.fileName || "unavailable").slice(0, 180),
      mimetype: String(input.fileType || "unavailable").slice(0, 100),
      size: Number(input.fileSize),
    };
    const error = new Error(String(input.error || "Client-side upload validation failed").slice(0, 300));
    error.code = "CLIENT_VALIDATION";
    void sendGalleryFailureEmail(req, error);
    res.status(202).json({ reported: true });
  }
);

router.post(
  "/api/sites/:siteId/assets/gallery",
  requireSiteAccess,
  requirePermission("canUpload"),
  upload.single("image"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "Image file is required" });
      return;
    }

    const configDoc = await loadClientConfigDocument(req.site.ownerUsername);
    if (!configDoc) {
      res.status(404).json({ error: "Client gallery is not configured" });
      return;
    }

    let nextSlot;
    let result;
    try {
      const config = normalizeClientConfig(configDoc.config, configDoc.savePath);
      if (!(await directoryExists(config.siteRoot))) {
        const error = new Error("Live website folder is not available");
        error.statusCode = 404;
        throw error;
      }
      nextSlot = await nextGallerySlotConfig(config, configDoc.config);
      result = await appendConfiguredGalleryImage(config, nextSlot, req.file.path);

      const rawSlots = Array.isArray(configDoc.config.imageSlots) ? configDoc.config.imageSlots : [];
      configDoc.config.imageSlots = [...rawSlots, nextSlot];
      await saveClientConfigDocument(configDoc);

      const store = await readStore();
      const site = store.sites.find((item) => item.id === req.params.siteId);
      if (site) {
        site.updatedAt = new Date().toISOString();
        store.audit.push(audit(req.user, "asset.gallery_added", { siteId: site.id, slotId: nextSlot.id, productionPath: nextSlot.currentPath, htmlPath: result.htmlPath }));
        await writeStore(store);
      }

      const updatedConfig = await loadClientConfig(req.site.ownerUsername);
      res.status(201).json({
        site: site || req.site,
        slot: nextSlot,
        image: {
          id: `asset-${nextSlot.id}`,
          name: path.basename(nextSlot.currentPath),
          slotId: nextSlot.id,
          url: `${BASE_PATH}/api/sites/${req.site.id}/assets/${nextSlot.id}/content?v=${result.version}`,
          source: "production",
          productionPath: nextSlot.currentPath,
        },
        assets: await scanClientAssets(site || req.site, updatedConfig),
        publish: result,
      });
    } catch (error) {
      if (nextSlot?.currentPath) {
        await fsp.rm(nextSlot.currentPath, { force: true }).catch(() => {});
      }
      void sendGalleryFailureEmail(req, error);
      res.status(error.statusCode || 500).json({ error: error.message || "Could not add gallery image" });
    }
  }
);

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
  if (req.user.role !== "admin" && !req.user.permissions?.canPublish) {
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
      productionAsset = await replaceConfiguredAsset(site, configSlot, req.file.path, clientConfig);
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
      width: positiveInteger(req.body.width),
      height: positiveInteger(req.body.height),
      status: "active",
      changedAt: new Date().toISOString(),
      changedBy: req.user.username,
      source: productionAsset ? "production" : "manager",
      productionPath: productionAsset?.path || null,
      backupPath: productionAsset?.backupPath || null,
    };
    site.images.unshift(image);
    site.updatedAt = new Date().toISOString();
    store.audit.push(audit(req.user, "image.uploaded", { siteId: site.id, imageId: image.id, slotId }));
    await writeStore(store);
    res.status(201).json({ image, site });
  }
);

router.patch("/api/sites/:siteId/images/:imageId/placement", requireSiteAccess, requirePermission("canUpload"), async (req, res) => {
  const targetSlotId = normalizeSlotId(req.body?.targetSlotId);
  const targetImageId = String(req.body?.targetImageId || "");
  const store = await readStore();
  const site = store.sites.find((item) => item.id === req.params.siteId);
  const image = site.images.find((item) => item.id === req.params.imageId);
  if (!image) {
    res.status(404).json({ error: "Image not found" });
    return;
  }
  if (image.source === "production") {
    res.status(400).json({ error: "Production images must be reordered by slot" });
    return;
  }

  const sourceSlotId = image.slotId || "gallery";
  const targetImage = targetImageId ? site.images.find((item) => item.id === targetImageId) : null;
  if (targetImage?.source === "production") {
    res.status(400).json({ error: "Production images must be reordered by slot" });
    return;
  }

  if (targetImage && targetImage.id !== image.id && (targetImage.slotId || "gallery") !== sourceSlotId) {
    targetImage.slotId = sourceSlotId;
    image.slotId = targetSlotId;
    promoteImageInSlot(site.images, image.id, targetSlotId);
    promoteImageInSlot(site.images, targetImage.id, sourceSlotId);
  } else {
    image.slotId = targetSlotId;
    moveImageBefore(site.images, image.id, targetImage?.id || null, targetSlotId);
  }

  site.updatedAt = new Date().toISOString();
  store.audit.push(audit(req.user, "image.reordered", { siteId: site.id, imageId: image.id, sourceSlotId, targetSlotId, targetImageId: targetImage?.id || null }));
  await writeStore(store);
  res.json({ site });
});

router.patch("/api/admin/sites/:siteId/images/:imageId/review-note", requireAdmin, async (req, res) => {
  const store = await readStore();
  const site = store.sites.find((item) => item.id === req.params.siteId);
  if (!site) {
    res.status(404).json({ error: "Site not found" });
    return;
  }
  const image = site.images.find((item) => item.id === req.params.imageId);
  if (!image) {
    res.status(404).json({ error: "Image not found" });
    return;
  }

  const note = String(req.body?.note || "").trim().slice(0, 500);
  image.reviewNote = note;
  image.reviewNoteUpdatedAt = note ? new Date().toISOString() : null;
  image.reviewNoteBy = note ? req.user.username : null;
  site.updatedAt = new Date().toISOString();
  store.audit.push(audit(req.user, "image.review_note", { siteId: site.id, imageId: image.id, slotId: image.slotId, hasNote: Boolean(note) }));
  await writeStore(store);
  res.json({ site, image });
});

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

router.get(["/", "/login", "/admin-login", "/admin", "/client/:username"], sendSpaShell);

app.use(BASE_PATH || "/", router);
if (BASE_PATH) {
  app.get("/", (req, res) => res.redirect(`${BASE_PATH}/login`));
}

app.use((err, req, res, next) => {
  if (err) {
    if (isGalleryUploadRequest(req)) void sendGalleryFailureEmail(req, err);
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "Uploaded image is too large" });
      return;
    }
    res.status(err.statusCode || 400).json({ error: err.message || "Request failed" });
    return;
  }
  next();
});

function isGalleryUploadRequest(req) {
  return req.method === "POST" && /\/api\/sites\/[^/]+\/assets\/gallery\/?$/.test(req.originalUrl || req.url || "");
}

async function sendGalleryFailureEmail(req, error) {
  if (!RESEND_API_KEY || !ERROR_ALERT_EMAIL) {
    console.warn("Gallery upload alert skipped: email provider is not configured");
    return;
  }

  const alertKey = `${req.user?.username || req.site?.ownerUsername || "unknown"}:${error?.code || error?.message || "unknown"}`;
  const lastAlertAt = galleryAlertCooldowns.get(alertKey) || 0;
  if (Date.now() - lastAlertAt < 60_000) return;
  galleryAlertCooldowns.set(alertKey, Date.now());

  const file = req.file;
  const details = [
    "A client gallery upload failed.",
    "",
    `Client: ${req.user?.username || req.site?.ownerUsername || "unknown"}`,
    `Site: ${req.site?.name || req.params?.siteId || "unknown"}`,
    `Time: ${new Date().toISOString()}`,
    `Error: ${error?.message || "Unknown error"}`,
    `Error code: ${error?.code || "none"}`,
    `File name: ${file?.originalname || "unavailable"}`,
    `File type: ${file?.mimetype || "unavailable"}`,
    `File size: ${formatFileSize(file?.size)}`,
    `Route: ${req.originalUrl || req.url || "unknown"}`,
  ].join("\n");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [ERROR_ALERT_EMAIL],
        subject: `Manager Site: gallery upload failed for ${req.user?.username || "client"}`,
        text: details,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      console.error("Gallery upload alert failed", response.status, await response.text());
    }
  } catch (emailError) {
    console.error("Gallery upload alert failed", emailError.message);
  }
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) return "unavailable";
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function startServer() {
  await initStore();
  await loadSessions();
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

function sendSpaShell(req, res) {
  res.setHeader("Cache-Control", "no-store");
  fsp
    .readFile(path.join(PUBLIC_DIR, "index.html"), "utf8")
    .then((html) => {
      res.type("html").send(
        html
          .replace(/%BASE_PATH%/g, BASE_PATH)
          .replace(/%ASSET_VERSION%/g, publicAssetVersion())
      );
    })
    .catch((error) => {
      res.status(500).json({ error: error.message || "Unable to load app shell" });
    });
}

function sendPublicAsset(fileName) {
  return (req, res) => {
    res.setHeader("Cache-Control", "no-cache, must-revalidate");
    res.sendFile(path.join(PUBLIC_DIR, fileName));
  };
}

function publicAssetVersion() {
  const files = ["index.html", "boot.js", "app.js", "styles.css"];
  const latest = files.reduce((max, fileName) => {
    try {
      return Math.max(max, fs.statSync(path.join(PUBLIC_DIR, fileName)).mtimeMs);
    } catch (error) {
      return max;
    }
  }, 0);
  return String(Math.floor(latest || Date.now()));
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
  await syncClientWorkspaceMetadata(user, site);
}

async function syncClientWorkspaceMetadata(user, site) {
  const clientDir = path.join(CLIENTS_DATA_DIR, safeSegment(user.username));
  await fsp.mkdir(clientDir, { recursive: true });
  const summaryPath = path.join(clientDir, "CLIENT_SUMMARY.md");
  const configPath = path.join(clientDir, "client.config.json");
  await fsp.writeFile(
    summaryPath,
    [
      `# ${user.displayName} Current Client Summary`,
      "",
      "This file is updated by Manager Site when admin client details change.",
      "",
      `- Username: \`${user.username}\``,
      `- Display name: ${user.displayName}`,
      `- Website name: ${site.name}`,
      `- Manager route: \`/client/${user.username}\``,
      `- Public URL: ${site.websiteUrl}`,
      `- Updated: ${new Date().toISOString()}`,
      "",
    ].join("\n")
  );

  let config = defaultClientConfig(user, site);
  if (fs.existsSync(configPath)) {
    try {
      config = { ...config, ...JSON.parse(await fsp.readFile(configPath, "utf8")) };
    } catch {
      config = defaultClientConfig(user, site);
    }
  }
  config.username = user.username;
  config.displayName = user.displayName;
  config.websiteName = site.name;
  config.publicUrl = site.websiteUrl;
  await fsp.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
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
    textSlots: [],
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

async function loadClientConfigDocument(username) {
  const safeUsername = safeSegment(username);
  const runtimePath = path.join(CLIENTS_DATA_DIR, safeUsername, "client.config.json");
  const candidates = [
    runtimePath,
    path.join(CLIENTS_REPO_DIR, safeUsername, "client.config.json"),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const raw = await fsp.readFile(candidate, "utf8");
    return {
      config: JSON.parse(raw),
      sourcePath: candidate,
      savePath: runtimePath,
    };
  }
  return null;
}

async function saveClientConfigDocument(document) {
  await fsp.mkdir(path.dirname(document.savePath), { recursive: true });
  await fsp.writeFile(document.savePath, `${JSON.stringify(document.config, null, 2)}\n`);
  await fsp.chmod(document.savePath, 0o600).catch(() => {});
}

function normalizeClientConfig(config, configPath) {
  const username = normalizeUsername(config.username);
  const siteRoot = path.resolve(String(config.siteRoot || ""));
  const imageSlots = Array.isArray(config.imageSlots) ? config.imageSlots : [];
  const textSlots = Array.isArray(config.textSlots) ? config.textSlots : [];
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
    textSlots: textSlots
      .map((slot) => normalizeTextSlot(siteRoot, slot))
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

function normalizeTextSlot(siteRoot, slot) {
  const id = normalizeTextSlotId(slot.id);
  const filePath = slot.filePath ? path.resolve(String(slot.filePath)) : "";
  const marker = String(slot.marker || id).trim();
  if (!id || !filePath || !isPathInside(siteRoot, filePath) || !marker) return null;
  const inputType = slot.inputType === "long" ? "long" : "short";
  return {
    id,
    labelHe: String(slot.labelHe || id),
    group: String(slot.group || ""),
    required: slot.required !== false,
    inputType,
    maxLength: Math.min(Math.max(positiveInteger(slot.maxLength) || (inputType === "long" ? 900 : 180), 20), 2000),
    filePath,
    marker,
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
    imageSlotCount: config.imageSlots.length,
    textSlotCount: config.textSlots.length,
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
    const backups = await listConfiguredBackups(slot);
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
      backupCount: backups.length,
      latestBackupAt: backups[0]?.mtime?.toISOString() || null,
      required: slot.required,
    });
  }
  return assets;
}

function findConfigSlot(config, slotId) {
  const normalized = normalizeSlotId(slotId);
  return config.imageSlots.find((slot) => slot.id === normalized) || null;
}

function findTextSlot(config, slotId) {
  const normalized = normalizeTextSlotId(slotId);
  return config.textSlots.find((slot) => slot.id === normalized) || null;
}

async function nextGallerySlotConfig(config, rawConfig) {
  const gallerySlots = config.imageSlots
    .filter((slot) => gallerySlotNumber(slot.id))
    .sort((a, b) => gallerySlotNumber(a.id) - gallerySlotNumber(b.id));
  if (!gallerySlots.length) {
    const error = new Error("No existing gallery slot to extend");
    error.statusCode = 400;
    throw error;
  }

  const lastSlot = gallerySlots[gallerySlots.length - 1];
  const lastSlotNumber = gallerySlotNumber(lastSlot.id);
  const rawSlots = Array.isArray(rawConfig.imageSlots) ? rawConfig.imageSlots : [];
  const existingIds = new Set(rawSlots.map((slot) => normalizeSlotId(slot.id)));
  const existingPaths = new Set(config.imageSlots.map((slot) => slot.absolutePath));
  const existingPublicPaths = new Set(config.imageSlots.map((slot) => slot.publicPath));

  for (let offset = 1; offset <= 100; offset += 1) {
    const nextNumber = lastSlotNumber + offset;
    const id = `gallery_${nextNumber}`;
    const currentPath = incrementTrailingPathNumber(lastSlot.absolutePath, offset);
    const publicPath = incrementPublicPathNumber(lastSlot.publicPath, offset);
    if (!currentPath || !publicPath || existingIds.has(id) || existingPaths.has(currentPath) || existingPublicPaths.has(publicPath)) continue;
    if (await fileExists(currentPath)) continue;
    if (!isPathInside(config.siteRoot, currentPath)) continue;
    return {
      id,
      labelHe: `גלריה ${nextNumber}`,
      required: false,
      currentPath,
      publicPath,
    };
  }

  const error = new Error("Could not find a safe next gallery filename");
  error.statusCode = 409;
  throw error;
}

async function appendConfiguredGalleryImage(config, slot, uploadedPath) {
  await fsp.mkdir(path.dirname(slot.currentPath), { recursive: true });
  await fsp.copyFile(uploadedPath, slot.currentPath);
  const version = Date.now();
  const htmlPath = await insertGalleryFrame(config, slot, version);
  return {
    slotId: slot.id,
    path: slot.currentPath,
    publicPath: slot.publicPath,
    htmlPath,
    version,
  };
}

async function insertGalleryFrame(config, slot, version) {
  const gallerySlots = config.imageSlots
    .filter((item) => gallerySlotNumber(item.id))
    .sort((a, b) => gallerySlotNumber(a.id) - gallerySlotNumber(b.id));
  const referenceSlots = [...gallerySlots].reverse();
  const htmlFiles = await listHtmlFiles(config.siteRoot);
  const nextNumber = gallerySlotNumber(slot.id);
  const nextFrame = `\n    <div class="frame reveal"><img src="${escapeHtmlAttribute(slot.publicPath)}?v=${version}" alt="${escapeHtmlAttribute(galleryAltText(config, nextNumber))}" loading="lazy"></div>`;

  for (const htmlPath of htmlFiles) {
    const html = await fsp.readFile(htmlPath, "utf8");
    for (const referenceSlot of referenceSlots) {
      if (!referenceSlot.publicPath) continue;
      const escapedReference = escapeRegExp(referenceSlot.publicPath);
      const framePattern = new RegExp(`(<div\\s+class=["'][^"']*\\bframe\\b[^"']*["'][^>]*>\\s*<img\\s+[^>]*src=["']${escapedReference}(?:\\?v=\\d+)?["'][^>]*>\\s*<\\/div>)`, "g");
      const matches = [...html.matchAll(framePattern)];
      if (!matches.length) continue;
      const match = matches[matches.length - 1];
      const insertAt = match.index + match[0].length;
      await backupConfiguredFile(htmlPath, "gallery-html");
      await fsp.writeFile(htmlPath, `${html.slice(0, insertAt)}${nextFrame}${html.slice(insertAt)}`);
      return htmlPath;
    }
  }

  const error = new Error("Could not find the live gallery markup to update");
  error.statusCode = 422;
  throw error;
}

async function removeGalleryFrame(config, slot) {
  if (!slot.publicPath) return null;
  const htmlFiles = await listHtmlFiles(config.siteRoot);
  const escapedReference = escapeRegExp(slot.publicPath);
  const framePattern = new RegExp(`\\n?\\s*(<div\\s+class=["'][^"']*\\bframe\\b[^"']*["'][^>]*>\\s*<img\\s+[^>]*src=["']${escapedReference}(?:\\?v=\\d+)?["'][^>]*>\\s*<\\/div>)`, "g");

  for (const htmlPath of htmlFiles) {
    const html = await fsp.readFile(htmlPath, "utf8");
    const matches = [...html.matchAll(framePattern)];
    if (!matches.length) continue;
    await backupConfiguredFile(htmlPath, "gallery-remove-html");
    await fsp.writeFile(htmlPath, html.replace(framePattern, ""));
    return htmlPath;
  }

  return null;
}

function gallerySlotNumber(slotId) {
  const id = normalizeSlotId(slotId);
  if (id === "gallery") return 1;
  const match = id.match(/^gallery_(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function incrementTrailingPathNumber(filePath, offset) {
  const parsed = path.parse(filePath);
  const match = parsed.name.match(/^(.*?)(\d+)$/);
  if (!match) return "";
  return path.join(parsed.dir, `${match[1]}${Number(match[2]) + offset}${parsed.ext}`);
}

function incrementPublicPathNumber(publicPath, offset) {
  const value = String(publicPath || "");
  const slashIndex = value.lastIndexOf("/");
  const dir = slashIndex >= 0 ? value.slice(0, slashIndex + 1) : "";
  const fileName = slashIndex >= 0 ? value.slice(slashIndex + 1) : value;
  const dotIndex = fileName.lastIndexOf(".");
  const name = dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName;
  const ext = dotIndex >= 0 ? fileName.slice(dotIndex) : "";
  const match = name.match(/^(.*?)(\d+)$/);
  if (!match) return "";
  return `${dir}${match[1]}${Number(match[2]) + offset}${ext}`;
}

function galleryAltText(config, number) {
  const websiteName = String(config.websiteName || config.displayName || "").trim();
  return websiteName ? `${websiteName} - תמונת גלריה ${number}` : `תמונת גלריה ${number}`;
}

async function scanClientTextSlots(config) {
  const textSlots = [];
  for (const slot of config.textSlots) {
    let status = null;
    try {
      status = await readConfiguredText(slot);
    } catch (error) {
      status = {
        exists: false,
        editable: false,
        value: "",
        error: error.message || "Text slot unavailable",
      };
    }
    textSlots.push({
      id: slot.id,
      label: slot.labelHe,
      group: slot.group,
      inputType: slot.inputType,
      maxLength: slot.maxLength,
      required: slot.required,
      marker: slot.marker,
      fileName: path.basename(slot.filePath),
      ...status,
    });
  }
  return textSlots;
}

async function readConfiguredText(slot) {
  await assertFileReadable(slot.filePath);
  const html = await fsp.readFile(slot.filePath, "utf8");
  const matches = markerElementMatches(html, slot.marker);
  if (matches.length !== 1) {
    const error = new Error(matches.length ? "Text marker must be unique" : "Text marker not found");
    error.statusCode = 404;
    throw error;
  }
  return {
    exists: true,
    editable: true,
    value: htmlToPlainText(matches[0][3]),
    updatedAt: (await fsp.stat(slot.filePath)).mtime.toISOString(),
    error: "",
  };
}

async function replaceConfiguredText(slot, value) {
  await assertFileReadable(slot.filePath);
  const html = await fsp.readFile(slot.filePath, "utf8");
  const matches = markerElementMatches(html, slot.marker);
  if (matches.length !== 1) {
    const error = new Error(matches.length ? "Text marker must be unique" : "Text marker not found");
    error.statusCode = 404;
    throw error;
  }
  const backupPath = await backupConfiguredFile(slot.filePath, `text-${slot.id}`);
  const match = matches[0];
  const nextHtml = `${html.slice(0, match.index)}${match[1]}${escapeHtmlContent(value)}${match[4]}${html.slice(match.index + match[0].length)}`;
  await fsp.writeFile(slot.filePath, nextHtml);
  const textSlot = await readConfiguredText(slot);
  if (textSlot.value !== value) {
    const error = new Error("Text update verification failed");
    error.statusCode = 500;
    throw error;
  }
  return {
    backupPath,
    textSlot: {
      id: slot.id,
      label: slot.labelHe,
      group: slot.group,
      inputType: slot.inputType,
      maxLength: slot.maxLength,
      required: slot.required,
      marker: slot.marker,
      fileName: path.basename(slot.filePath),
      ...textSlot,
    },
  };
}

function markerElementMatches(html, marker) {
  const markerPattern = escapeRegExp(marker);
  const pattern = new RegExp(`(<([a-zA-Z][\\w:-]*)(?=[^>]*\\sdata-manager-text=["']${markerPattern}["'])[^>]*>)([\\s\\S]*?)(<\\/\\2>)`, "g");
  return [...html.matchAll(pattern)];
}

function normalizeTextValue(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim();
}

function htmlToPlainText(value) {
  return decodeHtmlEntities(
    String(value || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .trim()
  );
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function escapeHtmlContent(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(value) {
  return escapeHtmlContent(value).replace(/"/g, "&quot;");
}

async function replaceConfiguredAsset(site, slot, uploadedPath, config = null) {
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
  const version = Date.now();
  if (config?.siteRoot && slot.publicPath) {
    await refreshPublicAssetReferences(config.siteRoot, slot.publicPath, version);
  }
  return {
    path: slot.absolutePath,
    backupPath,
    url: `${BASE_PATH}/api/sites/${site.id}/assets/${slot.id}/content?v=${version}`,
  };
}

async function refreshPublicAssetReferences(siteRoot, publicPath, version) {
  const normalizedRoot = path.resolve(siteRoot);
  const htmlFiles = await listHtmlFiles(normalizedRoot);
  const publicReference = String(publicPath || "");
  if (!publicReference) return;

  const escapedReference = escapeRegExp(publicReference);
  const referencePattern = new RegExp(`${escapedReference}(?:\\?v=\\d+)?`, "g");
  const nextReference = `${publicReference}?v=${version}`;

  for (const htmlPath of htmlFiles) {
    if (!isPathInside(normalizedRoot, htmlPath)) continue;
    const html = await fsp.readFile(htmlPath, "utf8");
    if (!referencePattern.test(html)) continue;
    referencePattern.lastIndex = 0;
    await fsp.writeFile(htmlPath, html.replace(referencePattern, nextReference));
  }
}

async function listHtmlFiles(siteRoot) {
  let entries = [];
  try {
    entries = await fsp.readdir(siteRoot, { withFileTypes: true });
  } catch (error) {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && /\.html?$/i.test(entry.name))
    .map((entry) => path.join(siteRoot, entry.name));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

async function restoreConfiguredAsset(slot) {
  const backups = await listConfiguredBackups(slot);
  const latest = backups[0];
  if (!latest) {
    const error = new Error("No backup exists for this image slot");
    error.statusCode = 404;
    throw error;
  }

  await fsp.mkdir(path.dirname(slot.absolutePath), { recursive: true });
  let currentBackupPath = null;
  if (await fileExists(slot.absolutePath)) {
    currentBackupPath = await backupConfiguredFile(slot.absolutePath, "before-restore");
  }
  await fsp.copyFile(latest.path, slot.absolutePath);
  return {
    restoredBackupPath: latest.path,
    currentBackupPath,
    restoredBackupAt: latest.mtime.toISOString(),
  };
}

async function reorderConfiguredAssets(sourceSlot, targetSlot) {
  await assertFileReadable(sourceSlot.absolutePath);
  await fsp.mkdir(path.dirname(targetSlot.absolutePath), { recursive: true });
  const targetExists = await fileExists(targetSlot.absolutePath);
  const sourceBackupPath = await backupConfiguredFile(sourceSlot.absolutePath, "reorder-source");
  let targetBackupPath = null;

  if (targetExists) {
    targetBackupPath = await backupConfiguredFile(targetSlot.absolutePath, "reorder-target");
    const tempPath = path.join(path.dirname(sourceSlot.absolutePath), `.manager-site-swap-${crypto.randomUUID()}${path.extname(sourceSlot.absolutePath)}`);
    await fsp.copyFile(sourceSlot.absolutePath, tempPath);
    await fsp.copyFile(targetSlot.absolutePath, sourceSlot.absolutePath);
    await fsp.copyFile(tempPath, targetSlot.absolutePath);
    await fsp.rm(tempPath, { force: true });
  } else {
    await fsp.copyFile(sourceSlot.absolutePath, targetSlot.absolutePath);
  }

  return { sourcePath: sourceSlot.absolutePath, targetPath: targetSlot.absolutePath, sourceBackupPath, targetBackupPath, swapped: targetExists };
}

async function backupConfiguredFile(filePath, suffix) {
  await assertFileReadable(filePath);
  const backupDir = path.join(path.dirname(filePath), ".manager-site-backups");
  await fsp.mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `${path.basename(filePath)}.${stamp}.${suffix}.bak`);
  await fsp.copyFile(filePath, backupPath);
  return backupPath;
}

async function listConfiguredBackups(slot) {
  const backupDir = path.join(path.dirname(slot.absolutePath), ".manager-site-backups");
  const baseName = path.basename(slot.absolutePath);
  let entries = [];
  try {
    entries = await fsp.readdir(backupDir, { withFileTypes: true });
  } catch (error) {
    return [];
  }
  const backups = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith(`${baseName}.`)) continue;
    const backupPath = path.join(backupDir, entry.name);
    if (!isPathInside(backupDir, backupPath)) continue;
    try {
      const stats = await fsp.stat(backupPath);
      if (stats.isFile()) backups.push({ name: entry.name, path: backupPath, mtime: stats.mtime, size: stats.size });
    } catch (error) {
      // Ignore unreadable stale backup entries.
    }
  }
  return backups.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
}

async function assertFileReadable(filePath) {
  const stats = await fsp.stat(filePath);
  if (!stats.isFile()) throw new Error("Not a file");
  await fsp.access(filePath, fs.constants.R_OK);
  return stats;
}

async function fileExists(filePath) {
  try {
    const stats = await fsp.stat(filePath);
    return stats.isFile();
  } catch (error) {
    return false;
  }
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

function normalizeTextSlotId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_ .-]+|[_ .-]+$/g, "");
}

function safeSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function normalizePermissions(input = {}) {
  return {
    canUpload: input.canUpload !== false,
    canDelete: input.canDelete !== false,
    canEditLinks: input.canEditLinks !== false,
    canEditText: input.canEditText !== false,
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
    permissions: normalizePermissions(user.permissions || {}),
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
          canEditText: true,
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
  store.users = Array.isArray(store.users)
    ? store.users.map((user) => ({ ...user, permissions: normalizePermissions(user.permissions || {}) }))
    : [];
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
  site.images = site.images.map((image) => {
    const normalizedImage = {
      slotId: "gallery",
      status: "active",
      width: null,
      height: null,
      reviewNote: "",
      reviewNoteUpdatedAt: null,
      reviewNoteBy: null,
      ...image,
    };
    normalizedImage.width = positiveInteger(normalizedImage.width);
    normalizedImage.height = positiveInteger(normalizedImage.height);
    return normalizedImage;
  });
  return site;
}

function promoteImageInSlot(images, imageId, slotId) {
  moveImageBefore(images, imageId, images.find((item) => item.id !== imageId && (item.slotId || "gallery") === slotId)?.id || null, slotId);
}

function moveImageBefore(images, imageId, beforeImageId, slotId) {
  const currentIndex = images.findIndex((item) => item.id === imageId);
  if (currentIndex === -1) return;
  const [image] = images.splice(currentIndex, 1);
  image.slotId = slotId;
  const beforeIndex = beforeImageId ? images.findIndex((item) => item.id === beforeImageId && (item.slotId || "gallery") === slotId) : -1;
  if (beforeIndex >= 0) {
    images.splice(beforeIndex, 0, image);
    return;
  }
  const firstInSlot = images.findIndex((item) => (item.slotId || "gallery") === slotId);
  if (firstInSlot >= 0) images.splice(firstInSlot, 0, image);
  else images.unshift(image);
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
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

function generateTemporaryPassword() {
  return crypto.randomBytes(18).toString("base64url");
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

async function loadSessions() {
  sessions.clear();
  let saved = [];
  try {
    saved = JSON.parse(await fsp.readFile(SESSION_STORE_PATH, "utf8"));
  } catch (error) {
    saved = [];
  }
  const now = Date.now();
  for (const session of Array.isArray(saved) ? saved : []) {
    const id = String(session.id || "");
    const userId = String(session.userId || "");
    const expiresAt = Number(session.expiresAt || 0);
    if (id && userId && expiresAt > now) {
      sessions.set(id, { userId, expiresAt });
    }
  }
  if (saved.length !== sessions.size) await writeSessions();
}

async function writeSessions() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const now = Date.now();
  const data = Array.from(sessions.entries())
    .filter(([, session]) => session.expiresAt > now)
    .map(([id, session]) => ({
      id,
      userId: session.userId,
      expiresAt: session.expiresAt,
    }));
  await fsp.writeFile(SESSION_STORE_PATH, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
}

async function createSession(res, userId) {
  const sessionId = crypto.randomBytes(32).toString("base64url");
  sessions.set(sessionId, {
    userId,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  await writeSessions();
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

function setManagedImageCacheHeaders(res) {
  res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

async function requireAuth(req, res, next) {
  const sessionId = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
  const session = sessionId ? sessions.get(sessionId) : null;
  if (!session || session.expiresAt < Date.now()) {
    if (sessionId) {
      sessions.delete(sessionId);
      await writeSessions();
    }
    res.status(401).json({ error: "Login required" });
    return;
  }

  const store = await readStore();
  const user = store.users.find((item) => item.id === session.userId);
  if (!user || !user.active) {
    sessions.delete(sessionId);
    await writeSessions();
    res.status(401).json({ error: "Login required" });
    return;
  }

  session.expiresAt = Date.now() + SESSION_TTL_MS;
  await writeSessions();
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
      "frame-src https:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join("; ")
  );
  next();
}
