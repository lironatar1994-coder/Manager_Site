const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { hubTokenMatches, hubSummary } = require("../lib/hub-summary");

const token = "hub_" + "a".repeat(40);
const sha = crypto.createHash("sha256").update(token).digest("hex");

test("hub token must match the stored SHA-256", () => {
  assert.equal(hubTokenMatches(`Bearer ${token}`, sha), true);
  assert.equal(hubTokenMatches(`Bearer ${token}x`, sha), false);
  assert.equal(hubTokenMatches(token, sha), false);
  assert.equal(hubTokenMatches(`Bearer ${token}`, ""), false);
  assert.equal(hubTokenMatches(`Bearer ${token}`, "not-hex"), false);
  assert.equal(hubTokenMatches(undefined, sha), false);
});

test("summary never exposes password hashes or permissions", () => {
  const store = {
    users: [
      { id: "u1", username: "admin", displayName: "Admin", role: "admin", active: true, passwordHash: "scrypt$x$y", siteId: null },
      { id: "u2", username: "miryam_zelig", displayName: "Miryam", role: "client", active: true, passwordHash: "scrypt$a$b", siteId: "s1", lastLoginAt: "2026-10-01T10:00:00.000Z", permissions: { canPublish: false } },
    ],
    sites: [{ id: "s1", name: "Miryam", websiteUrl: "https://miryamzelig.co.il/", status: "published", images: [{ status: "active" }, { status: "active" }], updatedAt: "2026-10-02T00:00:00.000Z" }],
    audit: [{ id: "a1", at: "2026-10-03T00:00:00.000Z", actor: "admin", action: "site.update", details: { secret: "x" } }],
  };
  const out = hubSummary(store, new Date("2026-10-17T00:00:00.000Z"));
  const text = JSON.stringify(out);
  assert.ok(!text.includes("scrypt$"));
  assert.ok(!text.includes("permissions"));
  assert.ok(!text.includes("secret"));
  assert.equal(out.sites[0].ownerUsername, "miryam_zelig");
  assert.equal(out.sites[0].images, 2);
  assert.equal(out.recent[0].action, "site.update");
  assert.equal(out.schemaVersion, "1.0");
});
