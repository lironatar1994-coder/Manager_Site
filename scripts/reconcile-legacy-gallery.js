#!/usr/bin/env node

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const username = readArgument("--username");
const apply = process.argv.includes("--apply");
const dataDir = process.env.DATA_DIR || path.join(__dirname, "..", "data");

if (!username) {
  console.error("Usage: node scripts/reconcile-legacy-gallery.js --username <client> [--apply]");
  process.exit(1);
}

main().catch((error) => {
  console.error(`Gallery reconciliation failed: ${error.message}`);
  process.exit(1);
});

async function main() {
  const storePath = path.join(dataDir, "store.json");
  const configPath = path.join(dataDir, "clients", username, "client.config.json");
  const store = JSON.parse(await fsp.readFile(storePath, "utf8"));
  const config = JSON.parse(await fsp.readFile(configPath, "utf8"));
  const site = store.sites.find((item) => item.ownerUsername === username);
  if (!site) throw new Error("Client site was not found");
  if (!config.siteRoot || !Array.isArray(config.imageSlots)) throw new Error("Client gallery config is incomplete");

  const configuredSlots = new Map(config.imageSlots.map((slot) => [slot.id, slot]));
  const legacyImages = (site.images || []).filter((image) => image.source === "manager" && gallerySlotNumber(image.slotId));
  const adoptable = [];
  const duplicateIds = [];

  for (const image of legacyImages) {
    if (configuredSlots.has(image.slotId)) {
      duplicateIds.push(image.id);
      continue;
    }
    const uploadPath = path.join(dataDir, "uploads", site.id, path.basename(image.fileName || ""));
    if (!(await fileExists(uploadPath))) throw new Error(`Stored upload is missing for ${image.slotId}`);
    const slot = nextSlotFromExisting(config, image.slotId);
    if (configuredSlots.has(slot.id)) throw new Error(`Gallery slot already exists: ${slot.id}`);
    if (await fileExists(slot.currentPath)) throw new Error(`Refusing to overwrite existing live file: ${slot.currentPath}`);
    adoptable.push({ image, uploadPath, slot });
    configuredSlots.set(slot.id, slot);
  }

  const htmlPath = path.join(config.siteRoot, "index.html");
  let html = await fsp.readFile(htmlPath, "utf8");
  const insertAt = galleryContainerEnd(html);
  if (insertAt < 0) throw new Error("Live gallery container was not found");

  console.log(`Client: ${username}`);
  console.log(`Publish: ${adoptable.map((item) => item.slot.id).join(", ") || "none"}`);
  console.log(`Remove duplicate records: ${duplicateIds.length}`);
  if (!apply) {
    console.log("Dry run only. Re-run with --apply to write changes.");
    return;
  }

  await backupFiles([storePath, configPath, htmlPath]);
  for (const item of adoptable) {
    await fsp.mkdir(path.dirname(item.slot.currentPath), { recursive: true });
    await fsp.copyFile(item.uploadPath, item.slot.currentPath);
  }

  const frames = adoptable
    .sort((a, b) => gallerySlotNumber(a.slot.id) - gallerySlotNumber(b.slot.id))
    .map((item) => `\n    <div class="frame reveal"><img src="${item.slot.publicPath}?v=${Date.now()}" alt="תמונת גלריה ${gallerySlotNumber(item.slot.id)}" loading="lazy"></div>`)
    .join("");
  if (frames) html = `${html.slice(0, insertAt)}${frames}${html.slice(insertAt)}`;
  config.imageSlots.push(...adoptable.map((item) => item.slot));
  site.images = (site.images || []).filter((image) => !legacyImages.some((legacy) => legacy.id === image.id));
  site.updatedAt = new Date().toISOString();
  store.audit.push({
    id: require("crypto").randomUUID(),
    at: new Date().toISOString(),
    actor: "system",
    action: "gallery.legacy_reconciled",
    details: { siteId: site.id, publishedSlots: adoptable.map((item) => item.slot.id), removedDuplicateRecords: duplicateIds.length },
  });

  await fsp.writeFile(htmlPath, html);
  await fsp.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  await fsp.writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`);
  console.log(`Published ${adoptable.length} gallery images and removed ${legacyImages.length} stale manager records.`);
}

function nextSlotFromExisting(config, slotId) {
  const targetNumber = gallerySlotNumber(slotId);
  const source = config.imageSlots
    .filter((slot) => gallerySlotNumber(slot.id) && /\d+\.[a-z0-9]+$/i.test(slot.currentPath || ""))
    .sort((a, b) => gallerySlotNumber(a.id) - gallerySlotNumber(b.id))[0];
  if (!source || !targetNumber) throw new Error(`Could not derive live path for ${slotId}`);
  const sourceNumber = gallerySlotNumber(source.id);
  const offset = targetNumber - sourceNumber;
  const currentPath = incrementTrailingPathNumber(source.currentPath, offset);
  const publicPath = incrementTrailingPathNumber(source.publicPath, offset).replace(/\\/g, "/");
  if (!currentPath || !publicPath) throw new Error(`Could not derive live path for ${slotId}`);
  return { id: slotId, labelHe: `גלריה ${targetNumber}`, required: false, currentPath, publicPath };
}

function galleryContainerEnd(html) {
  const open = /<div\s+class=["'][^"']*\bgallery\b[^"']*["'][^>]*>/i.exec(html);
  if (!open || open.index == null) return -1;
  const tag = /<\/?div\b[^>]*>/gi;
  tag.lastIndex = open.index + open[0].length;
  let depth = 1;
  let match;
  while ((match = tag.exec(html))) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return match.index;
  }
  return -1;
}

async function backupFiles(paths) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  for (const filePath of paths) {
    const backupDir = path.join(path.dirname(filePath), ".manager-site-backups");
    await fsp.mkdir(backupDir, { recursive: true });
    await fsp.copyFile(filePath, path.join(backupDir, `${path.basename(filePath)}.${stamp}.gallery-reconcile.bak`));
  }
}

function gallerySlotNumber(slotId) {
  if (slotId === "gallery") return 1;
  const match = String(slotId || "").match(/^gallery_(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function incrementTrailingPathNumber(filePath, offset) {
  const parsed = path.parse(filePath);
  const match = parsed.name.match(/^(.*?)(\d+)$/);
  return match ? path.join(parsed.dir, `${match[1]}${Number(match[2]) + offset}${parsed.ext}`) : "";
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : "";
}

async function fileExists(filePath) {
  try {
    return (await fsp.stat(filePath)).isFile();
  } catch (error) {
    return false;
  }
}
