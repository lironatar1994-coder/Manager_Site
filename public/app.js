const DEFAULT_SLOTS = [
  { id: "hero", label: "Hero image", ratio: "16:9", required: true },
  { id: "logo", label: "Logo", ratio: "1:1", required: true },
  { id: "about", label: "About section", ratio: "4:3", required: false },
  { id: "service", label: "Service image", ratio: "4:3", required: false },
  { id: "gallery", label: "Gallery", ratio: "free", required: false },
];

const STATUS_META = {
  draft: { label: "Draft", icon: "pencil-line" },
  waiting_review: { label: "Waiting review", icon: "clock-3" },
  published: { label: "Published", icon: "badge-check" },
  needs_attention: { label: "Needs attention", icon: "triangle-alert" },
};

const state = {
  me: null,
  users: [],
  sites: [],
  audit: [],
  clientSite: null,
  clientUsername: "",
};

const app = document.querySelector("#app");
const basePath = getBasePath();

init();

async function init() {
  const me = await api("/api/auth/me", { allow401: true });
  if (me?.user) {
    state.me = me.user;
    state.clientSite = me.site;
  }
  await route();
  window.addEventListener("popstate", route);
}

async function route() {
  const path = stripBase(location.pathname);
  if (!state.me && path !== "/login") {
    navigate("/login", true);
    return;
  }
  if (state.me && path === "/login") {
    navigate(state.me.role === "admin" ? "/admin" : `/client/${state.me.username}`, true);
    return;
  }
  if (path === "/admin") {
    if (state.me?.role !== "admin") return renderForbidden();
    await loadAdmin();
    renderAdmin();
    return;
  }
  if (path.startsWith("/client/")) {
    const username = decodeURIComponent(path.split("/")[2] || "");
    if (state.me?.role !== "admin" && username !== state.me?.username) {
      navigate(`/client/${state.me.username}`, true);
      return;
    }
    await loadClient(username);
    renderClient();
    return;
  }
  renderLogin();
}

function renderLogin(error = "") {
  app.className = "login-view";
  app.innerHTML = `
    <main class="login-shell">
      <section class="login-panel">
        <div class="brand-row">
          <span class="mark">MS</span>
          <span>
            <strong>Manager Site</strong>
            <small>Private website workspace</small>
          </span>
        </div>
        <div class="login-copy">
          <p class="eyebrow">Secured access</p>
          <h1>One polished route for every client website.</h1>
          <p>Admin-created users enter a focused workspace for their own website images, review status, and live link.</p>
        </div>
        <form class="login-form" id="loginForm">
          <label>Username<input name="username" autocomplete="username" placeholder="miryam_zelig" required /></label>
          <label>Password<input name="password" type="password" autocomplete="current-password" required /></label>
          ${error ? `<div class="form-error">${escapeHtml(error)}</div>` : ""}
          <button class="primary-button" type="submit"><i data-lucide="log-in"></i>Sign in</button>
        </form>
      </section>
      <aside class="login-art" aria-label="Route preview">
        <div class="art-window">
          <div class="window-bar"><span></span><span></span><span></span></div>
          <div class="client-card lifted">
            <small>Client route</small>
            <strong>/client/miryam_zelig</strong>
            <p>Structured image slots, website preview, and review status.</p>
          </div>
          <div class="image-rack"><span></span><span></span><span></span></div>
          <div class="admin-chip">Admin controls users, routes, and permissions</div>
        </div>
      </aside>
    </main>
  `;
  document.querySelector("#loginForm").addEventListener("submit", onLogin);
  icons();
}

function renderAdmin() {
  app.className = "app-view admin-mode";
  const clientUsers = state.users.filter((user) => user.role === "client");
  const activeUsers = clientUsers.filter((user) => user.active).length;
  const reviewSites = state.sites.filter((site) => site.status === "waiting_review").length;
  const totalImages = state.sites.reduce((sum, site) => sum + site.images.length, 0);
  app.innerHTML = `
    ${shell("admin")}
    <main class="workspace admin-workspace">
      <header class="page-head admin-head">
        <div>
          <p class="eyebrow">Admin control room</p>
          <h1>Routes, permissions, review queue.</h1>
        </div>
        <button class="primary-button" id="createUserTop" type="button"><i data-lucide="user-plus"></i>Create user</button>
      </header>

      <section class="metric-strip">
        ${metric("Active clients", activeUsers, "can sign in")}
        ${metric("In review", reviewSites, "need admin decision")}
        ${metric("Managed sites", state.sites.length, "assigned routes")}
        ${metric("Images", totalImages, "client assets")}
      </section>

      <section class="admin-grid upgraded">
        <article class="admin-panel create-panel">
          <div class="panel-title">
            <h2>Create client</h2>
            <span class="quiet">No public register</span>
          </div>
          ${createUserForm()}
        </article>

        <article class="admin-panel users-panel">
          <div class="panel-title">
            <h2>Client routes</h2>
            <span class="quiet">Preview what each client sees</span>
          </div>
          <div class="user-list route-list">${clientUsers.map(userCard).join("") || `<p class="empty">No clients yet.</p>`}</div>
        </article>

        <article class="admin-panel review-panel">
          <div class="panel-title">
            <h2>Review queue</h2>
            <span class="quiet">${reviewSites} waiting</span>
          </div>
          <div class="review-list">
            ${state.sites.map(reviewRow).join("") || `<p class="empty">No sites yet.</p>`}
          </div>
        </article>

        <article class="admin-panel audit-panel">
          <div class="panel-title">
            <h2>Activity</h2>
            <span class="quiet">Latest server events</span>
          </div>
          <div class="audit-list">${state.audit.map(auditRow).join("") || `<p class="empty">No activity yet.</p>`}</div>
        </article>
      </section>
    </main>
  `;
  bindShell();
  document.querySelector("#createUserForm").addEventListener("submit", onCreateUser);
  document.querySelector("#createUserTop").addEventListener("click", () => document.querySelector("#newUsername").focus());
  document.querySelectorAll("[data-toggle-user]").forEach((button) => {
    button.addEventListener("click", () => toggleUser(button.dataset.toggleUser, button.dataset.active !== "true"));
  });
  document.querySelectorAll("[data-admin-status]").forEach((button) => {
    button.addEventListener("click", () => updateSiteStatus(button.dataset.siteId, button.dataset.adminStatus));
  });
  interceptInternalLinks();
  icons();
}

function renderClient() {
  const site = state.clientSite;
  if (!site) return renderForbidden();
  const slots = site.slots?.length ? site.slots : DEFAULT_SLOTS;
  const completedSlots = slots.filter((slot) => slot.id !== "gallery" && imagesForSlot(site, slot.id).length).length;
  const totalSlots = slots.filter((slot) => slot.id !== "gallery").length;
  const latestImage = site.images[0];
  app.className = `app-view client-mode ${state.me.role === "admin" ? "admin-preview" : ""}`;
  app.innerHTML = `
    ${shell("client")}
    <main class="workspace client-workspace">
      ${
        state.me.role === "admin"
          ? `<section class="preview-banner"><i data-lucide="eye"></i><span>Admin previewing ${escapeHtml(state.clientUsername)}</span><a href="${href("/admin")}">Back to admin</a></section>`
          : ""
      }

      <header class="client-hero premium">
        <div>
          <p class="eyebrow">${escapeHtml(state.me.role === "admin" ? state.clientUsername : state.me.displayName)}</p>
          <h1>${escapeHtml(site.name)}</h1>
          <div class="hero-meta">
            ${statusPill(site.status)}
            <a href="${escapeAttr(site.websiteUrl)}" target="_blank" rel="noreferrer"><i data-lucide="external-link"></i>${escapeHtml(site.websiteUrl)}</a>
          </div>
        </div>
        <form id="siteLinkForm" class="site-link-form">
          <label>Website link<input name="websiteUrl" value="${escapeAttr(site.websiteUrl)}" ${can("canEditLinks") ? "" : "disabled"} /></label>
          <button class="ghost-button" type="submit" ${can("canEditLinks") ? "" : "disabled"}><i data-lucide="save"></i>Save</button>
        </form>
      </header>

      <section class="client-overview">
        <article class="website-preview">
          <div class="browser-bar"><span></span><span></span><span></span><p>${escapeHtml(site.websiteUrl)}</p></div>
          <div class="preview-canvas">
            <div class="preview-hero">${slotPreview(site, "hero")}</div>
            <div class="preview-copy"><strong>${escapeHtml(site.name)}</strong><span></span><span></span><span class="short"></span></div>
            <div class="preview-tiles">${slotPreview(site, "about")}${slotPreview(site, "service")}${slotPreview(site, "logo")}</div>
          </div>
        </article>
        <article class="progress-panel">
          <div class="panel-title">
            <h2>Website readiness</h2>
            <span class="quiet">${completedSlots}/${totalSlots} key slots</span>
          </div>
          ${statusTimeline(site.status)}
          <div class="confidence-note">
            <i data-lucide="${latestImage ? "history" : "sparkles"}"></i>
            <span>${latestImage ? `${latestImage.name} updated by ${latestImage.changedBy}` : "Upload the first image to start the review flow."}</span>
          </div>
          <button class="primary-button" id="reviewButton" type="button"><i data-lucide="send"></i>Send for review</button>
          ${
            state.me.role === "admin"
              ? `<div class="admin-status-actions">
                  <button class="ghost-button small" type="button" data-admin-status="published" data-site-id="${site.id}">Mark published</button>
                  <button class="ghost-button small" type="button" data-admin-status="needs_attention" data-site-id="${site.id}">Needs attention</button>
                </div>`
              : ""
          }
        </article>
      </section>

      <section class="slot-workspace">
        <article class="upload-panel refined">
          <div class="panel-title">
            <h2>Edit image area</h2>
            <span class="quiet">Replace known positions</span>
          </div>
          <form id="uploadForm" class="upload-drop">
            <label>Website area
              <select name="slotId" id="slotSelect">${slots.map((slot) => `<option value="${slot.id}">${escapeHtml(slot.label)}</option>`).join("")}</select>
            </label>
            <input id="imageFile" name="image" type="file" accept="image/*" ${can("canUpload") ? "" : "disabled"} required />
            <label for="imageFile" class="drop-target">
              <i data-lucide="image-up"></i>
              <strong>Choose image</strong>
              <span>PNG, JPG, WEBP, GIF, SVG up to 8MB</span>
            </label>
            <input name="name" placeholder="Optional label" />
            <button class="primary-button" type="submit" ${can("canUpload") ? "" : "disabled"}><i data-lucide="upload-cloud"></i>Upload to slot</button>
          </form>
        </article>

        <article class="image-panel slots-panel">
          <div class="slot-grid">${slots.map((slot) => slotCard(site, slot)).join("")}</div>
        </article>
      </section>
    </main>
  `;
  bindShell();
  document.querySelector("#siteLinkForm").addEventListener("submit", onUpdateSite);
  document.querySelector("#uploadForm").addEventListener("submit", onUploadImage);
  document.querySelector("#reviewButton").addEventListener("click", () => updateSiteStatus(site.id, "waiting_review"));
  document.querySelectorAll("[data-upload-slot]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector("#slotSelect").value = button.dataset.uploadSlot;
      document.querySelector("#imageFile").click();
    });
  });
  document.querySelectorAll("[data-delete-image]").forEach((button) => {
    button.addEventListener("click", () => {
      const image = site.images.find((item) => item.id === button.dataset.deleteImage);
      confirmAction({
        title: "Remove image?",
        body: image ? `${image.name} will be removed from this website workspace.` : "This image will be removed.",
        confirmText: "Remove",
        onConfirm: () => deleteImage(button.dataset.deleteImage),
      });
    });
  });
  document.querySelectorAll("[data-admin-status]").forEach((button) => {
    button.addEventListener("click", () => updateSiteStatus(button.dataset.siteId, button.dataset.adminStatus));
  });
  interceptInternalLinks();
  icons();
}

function shell(active) {
  return `
    <aside class="side-rail">
      <div class="mark">MS</div>
      <nav>
        ${
          state.me?.role === "admin"
            ? `<a class="${active === "admin" ? "active" : ""}" href="${href("/admin")}"><i data-lucide="shield"></i><span>Admin</span></a>`
            : `<a class="${active === "client" ? "active" : ""}" href="${href(`/client/${state.me.username}`)}"><i data-lucide="images"></i><span>Website</span></a>`
        }
      </nav>
      <button class="logout-button" id="logoutButton" type="button"><i data-lucide="log-out"></i><span>Logout</span></button>
    </aside>
  `;
}

function createUserForm() {
  return `
    <form id="createUserForm" class="create-form">
      <div class="two-col">
        <label>Display name<input name="displayName" placeholder="Miryam Zelig" required /></label>
        <label>Username<input id="newUsername" name="username" placeholder="miryam_zelig" required /></label>
      </div>
      <label>Password<input name="password" type="password" minlength="10" placeholder="Temporary password" required /></label>
      <div class="two-col">
        <label>Site name<input name="siteName" placeholder="Miryam Zelig Website" required /></label>
        <label>Website link<input name="websiteUrl" placeholder="https://example.com" required /></label>
      </div>
      <div class="route-preview"><i data-lucide="route"></i><span>Route becomes <strong>/client/<em id="routePreview">username</em></strong></span></div>
      <div class="permission-row">
        ${permissionBox("canUpload", "Upload", true)}
        ${permissionBox("canDelete", "Remove", true)}
        ${permissionBox("canEditLinks", "Edit link", true)}
        ${permissionBox("canPublish", "Publish", false)}
      </div>
      <button class="primary-button" type="submit"><i data-lucide="user-plus"></i>Create route</button>
    </form>
  `;
}

function permissionBox(name, label, checked) {
  return `<label class="perm"><input type="checkbox" name="${name}" ${checked ? "checked" : ""} />${label}</label>`;
}

function userCard(user) {
  const site = state.sites.find((item) => item.id === user.siteId) || {};
  return `
    <div class="user-card route-card">
      <span class="avatar">${escapeHtml(user.displayName.slice(0, 2).toUpperCase())}</span>
      <div>
        <h3>${escapeHtml(user.displayName)}</h3>
        <p>${escapeHtml(site.name || "No site")} -> ${escapeHtml(`/client/${user.username}`)}</p>
        <a href="${href(`/client/${user.username}`)}"><i data-lucide="eye"></i>Preview client workspace</a>
        <div class="permission-chips">${permissionChips(user.permissions)}</div>
      </div>
      <div class="user-actions">
        ${statusPill(site.status || "draft")}
        <span class="status ${user.active ? "live" : "paused"}">${user.active ? "Active" : "Paused"}</span>
        <button class="ghost-button small" type="button" data-toggle-user="${user.id}" data-active="${user.active}">${user.active ? "Pause" : "Activate"}</button>
      </div>
    </div>
  `;
}

function reviewRow(site) {
  return `
    <div class="review-row">
      <div>
        <strong>${escapeHtml(site.name)}</strong>
        <span>${escapeHtml(site.ownerUsername)} · ${site.images.length} images</span>
      </div>
      ${statusPill(site.status)}
      <div class="review-actions">
        <button class="ghost-button small" type="button" data-admin-status="published" data-site-id="${site.id}">Publish</button>
        <button class="ghost-button small" type="button" data-admin-status="needs_attention" data-site-id="${site.id}">Flag</button>
      </div>
    </div>
  `;
}

function slotCard(site, slot) {
  const images = imagesForSlot(site, slot.id);
  const primary = images[0];
  const gallery = slot.id === "gallery";
  return `
    <article class="slot-card ${primary ? "filled" : "empty"}">
      <div class="slot-top">
        <span>
          <strong>${escapeHtml(slot.label)}</strong>
          <small>${slot.required ? "Required" : "Optional"} · ${escapeHtml(slot.ratio)}</small>
        </span>
        <button class="ghost-button small" type="button" data-upload-slot="${slot.id}" ${can("canUpload") ? "" : "disabled"}>
          <i data-lucide="${primary ? "replace" : "plus"}"></i>${primary && !gallery ? "Replace" : "Upload"}
        </button>
      </div>
      ${
        primary
          ? `<div class="slot-image ${gallery ? "gallery-strip" : ""}">
              ${images
                .map(
                  (image) => `
                    <figure>
                      <img src="${escapeAttr(image.url)}" alt="${escapeAttr(image.name)}" />
                      <figcaption>
                        <span>${escapeHtml(image.name)}</span>
                        <button class="icon-action" type="button" data-delete-image="${image.id}" ${can("canDelete") ? "" : "disabled"} aria-label="Delete ${escapeAttr(image.name)}"><i data-lucide="trash-2"></i></button>
                      </figcaption>
                    </figure>`
                )
                .join("")}
            </div>`
          : `<div class="slot-empty"><i data-lucide="image"></i><span>No image assigned</span></div>`
      }
    </article>
  `;
}

function statusTimeline(status) {
  const order = ["draft", "waiting_review", "published"];
  const activeIndex = Math.max(0, order.indexOf(status));
  return `
    <div class="status-timeline">
      ${order
        .map((item, index) => `<span class="${index <= activeIndex ? "active" : ""}"><i data-lucide="${STATUS_META[item].icon}"></i>${STATUS_META[item].label}</span>`)
        .join("")}
      ${status === "needs_attention" ? `<span class="active attention"><i data-lucide="triangle-alert"></i>Needs attention</span>` : ""}
    </div>
  `;
}

function statusPill(status = "draft") {
  const meta = STATUS_META[status] || STATUS_META.draft;
  return `<span class="site-status ${status}"><i data-lucide="${meta.icon}"></i>${meta.label}</span>`;
}

function permissionChips(permissions = {}) {
  return [
    ["canUpload", "Upload"],
    ["canDelete", "Remove"],
    ["canEditLinks", "Edit link"],
    ["canPublish", "Publish"],
  ]
    .filter(([key]) => permissions[key])
    .map(([, label]) => `<span>${label}</span>`)
    .join("");
}

function slotPreview(site, slotId) {
  const image = imagesForSlot(site, slotId)[0];
  if (image) return `<img src="${escapeAttr(image.url)}" alt="${escapeAttr(image.name)}" />`;
  return `<span class="preview-placeholder">${escapeHtml((site.slots || DEFAULT_SLOTS).find((slot) => slot.id === slotId)?.label || "Image")}</span>`;
}

function imagesForSlot(site, slotId) {
  return (site.images || []).filter((image) => (image.slotId || "gallery") === slotId);
}

function metric(label, value, note) {
  return `<article><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`;
}

function auditRow(row) {
  return `
    <div class="audit-row">
      <span>${escapeHtml(row.action)}</span>
      <strong>${escapeHtml(row.actor)}</strong>
      <small>${new Date(row.at).toLocaleString()}</small>
    </div>
  `;
}

async function onLogin(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const response = await api("/api/auth/login", {
    method: "POST",
    body: { username: form.get("username"), password: form.get("password") },
    allow401: true,
  });
  if (response?.error) return renderLogin(response.error);
  state.me = response.user;
  navigate(response.redirectTo, true);
  await route();
}

async function onCreateUser(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const body = {
    displayName: form.get("displayName"),
    username: form.get("username"),
    password: form.get("password"),
    siteName: form.get("siteName"),
    websiteUrl: form.get("websiteUrl"),
    permissions: {
      canUpload: form.has("canUpload"),
      canDelete: form.has("canDelete"),
      canEditLinks: form.has("canEditLinks"),
      canPublish: form.has("canPublish"),
    },
  };
  const response = await api("/api/admin/users", { method: "POST", body });
  if (response?.error) return toast(response.error);
  toast(`Created /client/${response.user.username}`);
  await loadAdmin();
  renderAdmin();
}

async function toggleUser(userId, active) {
  const response = await api(`/api/admin/users/${userId}`, { method: "PATCH", body: { active } });
  if (response?.error) return toast(response.error);
  await loadAdmin();
  renderAdmin();
}

async function onUpdateSite(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const response = await api(`/api/sites/${state.clientSite.id}`, { method: "PATCH", body: { websiteUrl: form.get("websiteUrl") } });
  if (response?.error) return toast(response.error);
  state.clientSite = response.site;
  toast("Website link saved");
  renderClient();
}

async function onUploadImage(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const selectedSlot = form.get("slotId") || "gallery";
  const response = await api(`/api/sites/${state.clientSite.id}/images`, { method: "POST", form });
  if (response?.error) return toast(response.error);
  state.clientSite = response.site;
  toast(`${slotLabel(state.clientSite, selectedSlot)} updated`);
  renderClient();
}

async function deleteImage(imageId) {
  const response = await api(`/api/sites/${state.clientSite.id}/images/${imageId}`, { method: "DELETE" });
  if (response?.error) return toast(response.error);
  state.clientSite = response.site;
  toast("Image removed");
  renderClient();
}

async function updateSiteStatus(siteId, status) {
  const response = await api(`/api/sites/${siteId}/status`, { method: "POST", body: { status } });
  if (response?.error) return toast(response.error);
  if (state.clientSite?.id === siteId) state.clientSite = response.site;
  toast(STATUS_META[status]?.label || "Status updated");
  if (stripBase(location.pathname) === "/admin") {
    await loadAdmin();
    renderAdmin();
  } else {
    renderClient();
  }
}

async function loadAdmin() {
  const [usersResponse, sitesResponse, auditResponse] = await Promise.all([api("/api/admin/users"), api("/api/sites"), api("/api/admin/audit")]);
  state.users = usersResponse.users || [];
  state.sites = sitesResponse.sites || [];
  state.audit = auditResponse.audit || [];
}

async function loadClient(username) {
  state.clientUsername = username || state.me.username;
  const sitesResponse = await api("/api/sites");
  const sites = sitesResponse.sites || [];
  if (state.me.role === "admin") {
    if (!state.users.length) {
      const usersResponse = await api("/api/admin/users");
      state.users = usersResponse.users || [];
    }
    const user = state.users.find((item) => item.username === state.clientUsername);
    state.clientSite = sites.find((site) => site.id === user?.siteId) || sites.find((site) => site.ownerUsername === state.clientUsername) || null;
  } else {
    state.clientSite = sites[0] || state.clientSite;
  }
}

async function api(path, options = {}) {
  const request = { method: options.method || "GET", credentials: "same-origin", headers: {} };
  if (options.form) request.body = options.form;
  else if (options.body) {
    request.headers["Content-Type"] = "application/json";
    request.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${basePath}${path}`, request);
  if (response.status === 401 && !options.allow401) {
    state.me = null;
    navigate("/login", true);
    renderLogin("Please sign in again.");
    return {};
  }
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : {};
  if (!response.ok && !options.allow401) return { error: payload.error || "Request failed" };
  return payload;
}

function bindShell() {
  document.querySelector("#logoutButton").addEventListener("click", async () => {
    await api("/api/auth/logout", { method: "POST" });
    state.me = null;
    navigate("/login", true);
    renderLogin();
  });
}

function confirmAction({ title, body, confirmText, onConfirm }) {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="confirm-modal" role="dialog" aria-modal="true" aria-label="${escapeAttr(title)}">
      <button class="icon-action modal-close" type="button" aria-label="Close"><i data-lucide="x"></i></button>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(body)}</p>
      <div class="modal-actions">
        <button class="ghost-button" type="button" data-cancel>Cancel</button>
        <button class="danger-button" type="button" data-confirm>${escapeHtml(confirmText)}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  icons();
  modal.querySelector("[data-cancel]").addEventListener("click", () => modal.remove());
  modal.querySelector(".modal-close").addEventListener("click", () => modal.remove());
  modal.querySelector("[data-confirm]").addEventListener("click", async () => {
    await onConfirm();
    modal.remove();
  });
}

function interceptInternalLinks() {
  document.querySelectorAll("a[href]").forEach((link) => {
    const hrefValue = link.getAttribute("href");
    if (!hrefValue || !hrefValue.startsWith(basePath || "/")) return;
    link.addEventListener("click", async (event) => {
      event.preventDefault();
      navigate(stripBase(new URL(link.href).pathname));
      await route();
    });
  });
  const username = document.querySelector("#newUsername");
  const preview = document.querySelector("#routePreview");
  if (username && preview) {
    username.addEventListener("input", () => {
      preview.textContent = normalizeUsername(username.value) || "username";
    });
  }
}

function can(permission) {
  return state.me?.role === "admin" || state.me?.permissions?.[permission];
}

function slotLabel(site, slotId) {
  return (site.slots || DEFAULT_SLOTS).find((slot) => slot.id === slotId)?.label || "Image";
}

function renderForbidden() {
  app.className = "login-view";
  app.innerHTML = `<main class="forbidden"><h1>Access denied</h1><p>This route is not assigned to your account.</p></main>`;
}

function navigate(path, replace = false) {
  const target = href(path);
  if (replace) history.replaceState(null, "", target);
  else history.pushState(null, "", target);
}

function href(path) {
  return `${basePath}${path}`;
}

function stripBase(path) {
  if (basePath && path.startsWith(basePath)) return path.slice(basePath.length) || "/";
  return path;
}

function getBasePath() {
  const scriptPath = document.currentScript?.src ? new URL(document.currentScript.src).pathname : "";
  return scriptPath.replace(/\/app\.js$/, "");
}

function toast(message) {
  let node = document.querySelector(".toast");
  if (!node) {
    node = document.createElement("div");
    node.className = "toast";
    document.body.appendChild(node);
  }
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toast.timeout);
  toast.timeout = setTimeout(() => node.classList.remove("show"), 2200);
}

function icons() {
  if (window.lucide) window.lucide.createIcons();
}

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
