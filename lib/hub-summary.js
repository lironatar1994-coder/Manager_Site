const crypto = require("node:crypto");

// Read-only summary for the unified CRM hub. Enabled only when HUB_READ_TOKEN_SHA256 is set;
// the hub sends the raw token as a Bearer header and only its SHA-256 is stored here.
function hubTokenMatches(header, expectedSha256) {
  if (!expectedSha256 || !/^[0-9a-f]{64}$/.test(expectedSha256)) return false;
  const match = /^Bearer ([A-Za-z0-9_-]{32,200})$/.exec(String(header || ""));
  if (!match) return false;
  const actual = crypto.createHash("sha256").update(match[1]).digest();
  return crypto.timingSafeEqual(actual, Buffer.from(expectedSha256, "hex"));
}

function hubSummary(store, now = new Date()) {
  const sites = store.sites.map((site) => {
    const owner = store.users.find((user) => user.siteId === site.id && user.role !== "admin");
    const activeImages = site.images.filter((image) => image.status === "active");
    return {
      id: site.id,
      name: site.name,
      websiteUrl: site.websiteUrl,
      status: site.status,
      ownerUsername: owner?.username || site.ownerUsername || null,
      ownerDisplayName: owner?.displayName || null,
      ownerActive: owner ? owner.active : null,
      ownerLastLoginAt: owner?.lastLoginAt || null,
      images: activeImages.length,
      updatedAt: site.updatedAt || null,
    };
  });
  const users = store.users.map((user) => ({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    active: user.active,
    siteId: user.siteId || null,
    lastLoginAt: user.lastLoginAt || null,
  }));
  const recent = store.audit.slice(-30).reverse().map((entry) => ({
    id: entry.id,
    at: entry.at,
    actor: entry.actor,
    action: entry.action,
  }));
  return { schemaVersion: "1.0", product: "manager-site", generatedAt: now.toISOString(), sites, users, recent };
}

module.exports = { hubTokenMatches, hubSummary };
