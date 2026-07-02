const DEFAULT_SLOTS = [
  { id: "hero", label: "תמונת פתיחה", ratio: "16:9", required: true },
  { id: "logo", label: "לוגו", ratio: "1:1", required: true },
  { id: "about", label: "אזור אודות", ratio: "4:3", required: false },
  { id: "service", label: "תמונת שירות", ratio: "4:3", required: false },
  { id: "gallery", label: "גלריה", ratio: "חופשי", required: false },
];

const STATUS_META = {
  draft: { label: "Draft", icon: "pencil-line" },
  waiting_review: { label: "Waiting review", icon: "clock-3" },
  published: { label: "Published", icon: "badge-check" },
  needs_attention: { label: "Needs attention", icon: "triangle-alert" },
};

const HEBREW_STATUS_META = {
  draft: { label: "טיוטה", icon: "pencil-line" },
  waiting_review: { label: "ממתין לבדיקה", icon: "clock-3" },
  published: { label: "פורסם", icon: "badge-check" },
  needs_attention: { label: "דורש תיקון", icon: "triangle-alert" },
};

const HEBREW_SLOT_LABELS = {
  hero: "תמונת פתיחה",
  logo: "לוגו",
  about: "אזור אודות",
  service: "תמונת שירות",
  gallery: "גלריה",
};

const state = {
  me: null,
  users: [],
  sites: [],
  audit: [],
  clientSite: null,
  clientAssets: null,
  clientUsername: "",
  previewMode: "desktop",
};

const app = document.querySelector("#app");
const basePath = getBasePath();

init().catch((error) => {
  console.error("App failed to start", error);
  state.me = null;
  renderLogin("Unable to start the app. Please try again.");
});
watchIcons();

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
  setDocumentLocale("he", "rtl");
  app.className = "login-view login-rtl";
  app.innerHTML = `
    <main class="login-shell" dir="rtl" lang="he">
      <section class="login-panel">
        <div class="brand-row">
          <span class="mark">MS</span>
          <span>
            <strong>ניהול אתרים</strong>
            <small>מערכת ניהול אתרים פרטית</small>
          </span>
        </div>
        <div class="login-copy">
          <p class="eyebrow">כניסה מאובטחת</p>
          <h1>מרכז שקט לניהול תמונות האתר.</h1>
          <p>הלקוחות נכנסים לאזור האישי שהוגדר להם, מעדכנים תמונות, בודקים סטטוס ומנהלים את הקישור לאתר.</p>
        </div>
        <form class="login-form" id="loginForm">
          <label>שם משתמש<input name="username" autocomplete="username" placeholder="miryam_zelig" dir="ltr" required /></label>
          <label>סיסמה<input name="password" type="password" autocomplete="current-password" dir="ltr" required /></label>
          ${error ? `<div class="form-error">${escapeHtml(error)}</div>` : ""}
          <button class="primary-button" type="submit"><i data-lucide="log-in"></i>כניסה למערכת</button>
        </form>
      </section>
      <aside class="login-art" aria-label="תצוגת אזור לקוח">
        <div class="art-window">
          <div class="window-bar"><span></span><span></span><span></span></div>
          <div class="client-card lifted">
            <small>אזור לקוח</small>
            <strong dir="ltr">/client/miryam_zelig</strong>
            <p>אזורי תמונה מסודרים, תצוגת אתר וסטטוס בדיקה במקום אחד.</p>
          </div>
          <div class="image-rack"><span></span><span></span><span></span></div>
          <div class="admin-chip">המנהל שולט במשתמשים, הרשאות וגישה</div>
        </div>
      </aside>
    </main>
  `;
  document.querySelector("#loginForm").addEventListener("submit", onLogin);
  icons();
}

function renderAdmin() {
  setDocumentLocale("en", "ltr");
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
  document.querySelectorAll("[data-reset-password]").forEach((button) => {
    button.addEventListener("click", () => resetUserPassword(button.dataset.resetPassword));
  });
  document.querySelectorAll("[data-share-toggle]").forEach((button) => {
    button.addEventListener("click", () => toggleShareMenu(button.dataset.shareToggle));
  });
  document.querySelectorAll("[data-share-channel]").forEach((button) => {
    button.addEventListener("click", () => openCredentialShare(button.dataset.shareUser, button.dataset.shareChannel));
  });
  document.querySelectorAll("[data-copy-value]").forEach((button) => {
    button.addEventListener("click", () => copyText(button.dataset.copyValue, button.dataset.copyLabel || "Copied"));
  });
  document.querySelectorAll("[data-admin-status]").forEach((button) => {
    button.addEventListener("click", () => updateSiteStatus(button.dataset.siteId, button.dataset.adminStatus));
  });
  interceptInternalLinks();
  icons();
}

function renderClient() {
  setDocumentLocale("he", "rtl");
  const site = state.clientSite;
  if (!site) return renderForbidden();
  const slots = site.slots?.length ? site.slots : DEFAULT_SLOTS;
  const completedSlots = slots.filter((slot) => slot.id !== "gallery" && imagesForSlot(site, slot.id).length).length;
  const totalSlots = slots.filter((slot) => slot.id !== "gallery").length;
  const latestImage = site.images[0];
  const latestActivity = latestImage ? `${latestImage.name} עודכנה על ידי ${latestImage.changedBy}` : "בחרו אזור בתצוגה או ברשימה והעלו תמונה ראשונה.";
  app.className = `app-view client-mode client-rtl ${state.me.role === "admin" ? "admin-preview" : ""}`;
  app.innerHTML = `
    ${shell("client")}
    <main class="workspace client-workspace" dir="rtl" lang="he">
      ${
        state.me.role === "admin"
          ? `<section class="preview-banner"><i data-lucide="eye"></i><span>תצוגת מנהל עבור ${escapeHtml(state.clientUsername)}</span><a href="${href("/admin")}">חזרה לניהול</a></section>`
          : ""
      }

      <header class="client-hero premium client-command">
        <div>
          <p class="eyebrow">${escapeHtml(state.me.role === "admin" ? state.clientUsername : state.me.displayName)}</p>
          <h1>${escapeHtml(site.name)}</h1>
          <div class="hero-meta">
            ${statusPill(site.status, "he")}
            <span class="readiness-chip"><i data-lucide="list-checks"></i>${completedSlots}/${totalSlots} אזורים מוכנים</span>
            <a href="${escapeAttr(site.websiteUrl)}" target="_blank" rel="noreferrer"><i data-lucide="external-link"></i>${escapeHtml(site.websiteUrl)}</a>
          </div>
        </div>
        <form id="siteLinkForm" class="site-link-form">
          <label>קישור לאתר<input name="websiteUrl" value="${escapeAttr(site.websiteUrl)}" ${can("canEditLinks") ? "" : "disabled"} /></label>
          <button class="ghost-button" type="submit" ${can("canEditLinks") ? "" : "disabled"}><i data-lucide="save"></i>שמירה</button>
        </form>
      </header>

      <section class="client-overview">
        <article class="website-preview managed-preview" data-preview-mode="${state.previewMode}">
          <div class="preview-toolbar">
            <div>
              <p class="eyebrow">תצוגה חיה</p>
              <h2>כך האתר נראה עכשיו</h2>
            </div>
            <div class="preview-toggle" role="tablist" aria-label="בחירת תצוגה">
              <button class="${state.previewMode === "desktop" ? "active" : ""}" type="button" data-preview-mode="desktop"><i data-lucide="monitor"></i>מחשב</button>
              <button class="${state.previewMode === "mobile" ? "active" : ""}" type="button" data-preview-mode="mobile"><i data-lucide="smartphone"></i>נייד</button>
            </div>
          </div>
          <div class="preview-device">
            <div class="browser-bar"><span></span><span></span><span></span><p>${escapeHtml(site.websiteUrl)}</p></div>
            <div class="preview-canvas managed-site">
              <section class="managed-hero">
                ${previewEditableSlot(site, "hero", "hero")}
                <div class="managed-copy">
                  ${previewEditableSlot(site, "logo", "logo")}
                  <strong>${escapeHtml(site.name)}</strong>
                  <p>תצוגה מנוהלת של האתר עם התמונות שהועלו למערכת.</p>
                </div>
              </section>
              <section class="managed-sections">
                ${previewEditableSlot(site, "about", "section")}
                ${previewEditableSlot(site, "service", "section")}
              </section>
              <section class="managed-gallery">
                ${previewEditableSlot(site, "gallery", "gallery")}
              </section>
            </div>
          </div>
        </article>
        <article class="progress-panel client-control-panel">
          <div class="panel-title">
            <h2>תמונות להחלפה</h2>
            <span class="quiet">לחיצה על אזור פותחת העלאה ישירה</span>
          </div>
          <div class="asset-queue">${slots.map((slot) => assetRailItem(site, slot)).join("")}</div>
          <div class="panel-title compact-title">
            <h2>סטטוס</h2>
            <span class="quiet">${completedSlots}/${totalSlots} אזורים מרכזיים מוכנים</span>
          </div>
          ${statusTimeline(site.status)}
          <div class="confidence-note">
            <i data-lucide="${latestImage ? "history" : "sparkles"}"></i>
            <span>${escapeHtml(latestActivity)}</span>
          </div>
          <button class="primary-button" id="reviewButton" type="button"><i data-lucide="send"></i>שליחה לבדיקה</button>
          ${
            state.me.role === "admin"
              ? `<div class="admin-status-actions">
                  <button class="ghost-button small" type="button" data-admin-status="published" data-site-id="${site.id}">סימון כפורסם</button>
                  <button class="ghost-button small" type="button" data-admin-status="needs_attention" data-site-id="${site.id}">דורש תיקון</button>
                </div>`
              : ""
          }
        </article>
      </section>

      <section class="slot-workspace">
        <article class="image-panel slots-panel">
          <div class="panel-title">
            <h2>כל אזורי התמונה</h2>
            <span class="quiet">תמונה קיימת, החלפה או הסרה לפי אזור באתר</span>
          </div>
          <div class="slot-grid">${slots.map((slot) => slotCard(site, slot)).join("")}</div>
        </article>

        <article class="upload-panel refined">
          <div class="panel-title">
            <h2>עריכת אזור תמונה</h2>
            <span class="quiet">החלפה לפי אזורים מוגדרים באתר</span>
          </div>
          <form id="uploadForm" class="upload-drop">
            <label>אזור באתר
              <select name="slotId" id="slotSelect">${slots.map((slot) => `<option value="${slot.id}">${escapeHtml(slotDisplayLabel(slot))}</option>`).join("")}</select>
            </label>
            <input id="imageFile" name="image" type="file" accept="image/*" ${can("canUpload") ? "" : "disabled"} required />
            <label for="imageFile" class="drop-target">
              <i data-lucide="image-up"></i>
              <strong>בחירת תמונה</strong>
              <span>PNG, JPG, WEBP, GIF, SVG עד 8MB</span>
            </label>
            <input name="name" placeholder="שם לתמונה - לא חובה" />
            <button class="primary-button" type="submit" ${can("canUpload") ? "" : "disabled"}><i data-lucide="upload-cloud"></i>העלאה לאזור</button>
          </form>
        </article>
      </section>
    </main>
  `;
  bindShell();
  document.querySelector("#siteLinkForm").addEventListener("submit", onUpdateSite);
  document.querySelector("#uploadForm").addEventListener("submit", onUploadImage);
  document.querySelector("#reviewButton").addEventListener("click", () => updateSiteStatus(site.id, "waiting_review"));
  document.querySelectorAll("button[data-preview-mode]").forEach((button) => {
    button.addEventListener("click", () => setPreviewMode(button.dataset.previewMode));
  });
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
        title: "להסיר את התמונה?",
        body: image ? `${image.name} תוסר מאזור העריכה של האתר.` : "התמונה תוסר מאזור העריכה של האתר.",
        confirmText: "הסרה",
        onConfirm: () => deleteImage(button.dataset.deleteImage),
      });
    });
  });
  document.querySelectorAll("[data-delete-asset]").forEach((button) => {
    button.addEventListener("click", () => {
      const asset = (state.clientAssets?.assets || []).find((item) => item.slotId === button.dataset.deleteAsset);
      confirmAction({
        title: "להסיר את התמונה מהאתר?",
        body: asset ? `${asset.label || asset.name} תוסר מקובץ האתר לאחר גיבוי.` : "התמונה תוסר מקובץ האתר לאחר גיבוי.",
        confirmText: "הסרה",
        onConfirm: () => deleteAsset(button.dataset.deleteAsset),
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
            : `<a class="${active === "client" ? "active" : ""}" href="${href(`/client/${state.me.username}`)}"><i data-lucide="images"></i><span>האתר שלי</span></a>`
        }
      </nav>
      <button class="logout-button" id="logoutButton" type="button"><i data-lucide="log-out"></i><span>${state.me?.role === "admin" ? "Logout" : "יציאה"}</span></button>
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
        <div class="credential-grid">
          ${credentialLine("Username", user.username)}
          ${credentialLine("User ID", user.id)}
          ${credentialLine("Site ID", user.siteId || "")}
          <div class="credential-line locked">
            <span>Password</span>
            <strong>Stored as secure hash</strong>
            <button class="ghost-button small" type="button" data-reset-password="${user.id}"><i data-lucide="key-round"></i>Reset</button>
          </div>
        </div>
        <a href="${href(`/client/${user.username}`)}"><i data-lucide="eye"></i>Preview client workspace</a>
        <div class="permission-chips">${permissionChips(user.permissions)}</div>
      </div>
      <div class="user-actions">
        ${statusPill(site.status || "draft")}
        <span class="status ${user.active ? "live" : "paused"}">${user.active ? "Active" : "Paused"}</span>
        ${shareCluster(user)}
        <button class="ghost-button small" type="button" data-toggle-user="${user.id}" data-active="${user.active}">${user.active ? "Pause" : "Activate"}</button>
      </div>
    </div>
  `;
}

function shareCluster(user) {
  return `
    <div class="share-cluster" data-share-menu="${user.id}">
      <div class="share-actions" aria-label="Share credentials">
        <button class="share-channel whatsapp" type="button" data-share-user="${user.id}" data-share-channel="whatsapp" aria-label="Share by WhatsApp" title="WhatsApp">
          <i data-lucide="message-circle"></i>
        </button>
        <button class="share-channel gmail" type="button" data-share-user="${user.id}" data-share-channel="gmail" aria-label="Share by Gmail" title="Gmail">
          <i data-lucide="mail"></i>
        </button>
      </div>
      <button class="share-trigger" type="button" data-share-toggle="${user.id}" aria-label="Open share actions" title="Share credentials">
        <i data-lucide="share-2"></i>
      </button>
    </div>
  `;
}

function credentialLine(label, value) {
  return `
    <div class="credential-line">
      <span>${escapeHtml(label)}</span>
      <strong dir="ltr">${escapeHtml(value || "—")}</strong>
      ${
        value
          ? `<button class="icon-action copy-action" type="button" data-copy-value="${escapeAttr(value)}" data-copy-label="${escapeAttr(label)}" aria-label="Copy ${escapeAttr(label)}"><i data-lucide="copy"></i></button>`
          : ""
      }
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

function assetRailItem(site, slot) {
  const images = imagesForSlot(site, slot.id);
  const primary = images[0];
  const sourceLabel = primary?.source === "production" ? "מהאתר החי" : primary ? "עודכן במערכת" : "חסר";
  return `
    <button class="asset-queue-item ${primary ? "filled" : "missing"}" type="button" data-upload-slot="${slot.id}" ${can("canUpload") ? "" : "disabled"}>
      <span class="asset-queue-thumb">
        ${primary ? `<img src="${escapeAttr(primary.url)}" alt="${escapeAttr(primary.name)}" />` : `<i data-lucide="image-plus"></i>`}
      </span>
      <span class="asset-queue-copy">
        <strong>${escapeHtml(slotDisplayLabel(slot))}</strong>
        <small>${escapeHtml(sourceLabel)} · ${escapeHtml(slotRatioLabel(slot.ratio))}</small>
      </span>
      <i data-lucide="${primary ? "replace" : "plus"}"></i>
    </button>
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
          <strong>${escapeHtml(slotDisplayLabel(slot))}</strong>
          <small>${slot.required ? "חובה" : "לא חובה"} · ${escapeHtml(slotRatioLabel(slot.ratio))}</small>
          <em class="slot-state">${primary ? "תמונה קיימת - אפשר להחליף או להסיר" : "אין תמונה - אפשר להוסיף"}</em>
        </span>
        <button class="ghost-button small" type="button" data-upload-slot="${slot.id}" ${can("canUpload") ? "" : "disabled"}>
          <i data-lucide="${primary ? "replace" : "plus"}"></i>${primary && !gallery ? "החלפה" : "העלאה"}
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
                        <button class="icon-action" type="button" ${image.source === "production" ? `data-delete-asset="${image.slotId}"` : `data-delete-image="${image.id}"`} ${can("canDelete") ? "" : "disabled"} aria-label="הסרת ${escapeAttr(image.name)}"><i data-lucide="trash-2"></i></button>
                      </figcaption>
                    </figure>`
                )
                .join("")}
            </div>`
          : `<div class="slot-empty"><i data-lucide="image"></i><span>עדיין לא שובצה תמונה</span></div>`
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
        .map((item, index) => `<span class="${index <= activeIndex ? "active" : ""}"><i data-lucide="${HEBREW_STATUS_META[item].icon}"></i>${HEBREW_STATUS_META[item].label}</span>`)
        .join("")}
      ${status === "needs_attention" ? `<span class="active attention"><i data-lucide="triangle-alert"></i>דורש תיקון</span>` : ""}
    </div>
  `;
}

function statusPill(status = "draft", locale = "en") {
  const source = locale === "he" ? HEBREW_STATUS_META : STATUS_META;
  const meta = source[status] || source.draft;
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
  return `<span class="preview-placeholder">${escapeHtml(slotDisplayLabel((site.slots || DEFAULT_SLOTS).find((slot) => slot.id === slotId) || { id: slotId }))}</span>`;
}

function previewEditableSlot(site, slotId, variant = "section") {
  const image = imagesForSlot(site, slotId)[0];
  const label = slotDisplayLabel((site.slots || DEFAULT_SLOTS).find((slot) => slot.id === slotId) || { id: slotId });
  return `
    <div class="editable-preview-slot ${variant} ${image ? "has-image" : "missing"}">
      ${image ? `<img src="${escapeAttr(image.url)}" alt="${escapeAttr(image.name)}" />` : `<span>${escapeHtml(label)}</span>`}
      <button class="slot-marker" type="button" data-upload-slot="${slotId}" ${can("canUpload") ? "" : "disabled"}>
        <i data-lucide="${image ? "replace" : "plus"}"></i>
        <span>${escapeHtml(label)}</span>
      </button>
    </div>
  `;
}

function setPreviewMode(mode) {
  if (!["desktop", "mobile"].includes(mode)) return;
  state.previewMode = mode;
  const preview = document.querySelector(".managed-preview");
  if (preview) preview.dataset.previewMode = mode;
  document.querySelectorAll("button[data-preview-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.previewMode === mode);
  });
}

function imagesForSlot(site, slotId) {
  const managed = (site.images || []).filter((image) => (image.slotId || "gallery") === slotId);
  if (managed.length) return managed;
  return (state.clientAssets?.assets || [])
    .filter((asset) => asset.exists && asset.slotId === slotId)
    .map((asset) => ({
      id: asset.id,
      name: asset.name,
      slotId: asset.slotId,
      url: asset.url,
      size: asset.size,
      changedAt: asset.mtime,
      changedBy: "production",
      source: "production",
      productionPath: asset.productionPath,
    }));
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

async function resetUserPassword(userId) {
  const user = state.users.find((item) => item.id === userId);
  if (!user) return;
  confirmAction({
    title: "Reset client password?",
    body: `This will replace the current password for ${user.username}. The new temporary password will be shown once.`,
    confirmText: "Reset password",
    onConfirm: async () => {
      const response = await api(`/api/admin/users/${userId}/reset-password`, { method: "POST" });
      if (response?.error) return toast(response.error);
      showTemporaryPassword(user, response.temporaryPassword);
      await loadAdmin();
      renderAdmin();
    },
  });
}

function toggleShareMenu(userId) {
  document.querySelectorAll(".share-cluster.open").forEach((node) => {
    if (node.dataset.shareMenu !== userId) node.classList.remove("open");
  });
  document.querySelector(`[data-share-menu="${CSS.escape(userId)}"]`)?.classList.toggle("open");
}

function openCredentialShare(userId, channel) {
  const user = state.users.find((item) => item.id === userId);
  if (!user || !["whatsapp", "gmail"].includes(channel)) return;
  document.querySelector(`[data-share-menu="${CSS.escape(userId)}"]`)?.classList.remove("open");
  showCredentialShareModal(user, channel);
}

async function onUpdateSite(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const response = await api(`/api/sites/${state.clientSite.id}`, { method: "PATCH", body: { websiteUrl: form.get("websiteUrl") } });
  if (response?.error) return toast(response.error);
  state.clientSite = response.site;
  toast("קישור האתר נשמר");
  renderClient();
}

async function onUploadImage(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const selectedSlot = form.get("slotId") || "gallery";
  const response = await api(`/api/sites/${state.clientSite.id}/images`, { method: "POST", form });
  if (response?.error) return toast(response.error);
  state.clientSite = response.site;
  await loadClientAssets();
  toast(`${slotLabel(state.clientSite, selectedSlot)} עודכן`);
  renderClient();
}

async function deleteImage(imageId) {
  const response = await api(`/api/sites/${state.clientSite.id}/images/${imageId}`, { method: "DELETE" });
  if (response?.error) return toast(response.error);
  state.clientSite = response.site;
  toast("התמונה הוסרה");
  renderClient();
}

async function deleteAsset(slotId) {
  const response = await api(`/api/sites/${state.clientSite.id}/assets/${slotId}`, { method: "DELETE" });
  if (response?.error) return toast(response.error);
  state.clientSite = response.site || state.clientSite;
  state.clientAssets = { ...(state.clientAssets || {}), assets: response.assets || [] };
  toast("התמונה הוסרה מקובץ האתר");
  renderClient();
}

async function updateSiteStatus(siteId, status) {
  const response = await api(`/api/sites/${siteId}/status`, { method: "POST", body: { status } });
  if (response?.error) return toast(response.error);
  if (state.clientSite?.id === siteId) state.clientSite = response.site;
  toast(isClientRoute() ? HEBREW_STATUS_META[status]?.label || "הסטטוס עודכן" : STATUS_META[status]?.label || "Status updated");
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
  await loadClientAssets();
}

async function loadClientAssets() {
  state.clientAssets = null;
  if (!state.clientSite?.id) return;
  const response = await api(`/api/sites/${state.clientSite.id}/assets`);
  if (!response?.error) {
    state.clientAssets = response;
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

function showTemporaryPassword(user, temporaryPassword) {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="confirm-modal credential-modal" role="dialog" aria-modal="true" aria-label="Temporary password">
      <button class="icon-action modal-close" type="button" aria-label="Close"><i data-lucide="x"></i></button>
      <h2>Temporary password</h2>
      <p>${escapeHtml(user.username)} can sign in with this password now. It will not be shown again.</p>
      <div class="secret-box">
        <input value="${escapeAttr(temporaryPassword)}" readonly dir="ltr" />
        <button class="ghost-button" type="button" data-copy-temp><i data-lucide="copy"></i>Copy</button>
      </div>
      <div class="modal-actions">
        <button class="primary-button" type="button" data-done>Done</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  icons();
  const close = () => modal.remove();
  modal.querySelector(".modal-close").addEventListener("click", close);
  modal.querySelector("[data-done]").addEventListener("click", close);
  modal.querySelector("[data-copy-temp]").addEventListener("click", () => copyText(temporaryPassword, "Temporary password"));
  modal.querySelector("input").select();
}

function showCredentialShareModal(user, channel) {
  const channelLabel = channel === "whatsapp" ? "WhatsApp" : "Gmail";
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="confirm-modal credential-modal share-password-modal" role="dialog" aria-modal="true" aria-label="Share credentials">
      <button class="icon-action modal-close" type="button" aria-label="Close"><i data-lucide="x"></i></button>
      <h2>Share login details</h2>
      <p>Enter the client password to include it in a ${escapeHtml(channelLabel)} message. You will confirm once more before the message opens.</p>
      <label>Password to share
        <input name="sharePassword" type="password" autocomplete="off" minlength="1" dir="ltr" required />
      </label>
      <div class="credential-preview">
        <span>Username</span>
        <strong dir="ltr">${escapeHtml(user.username)}</strong>
        <span>Route</span>
        <strong dir="ltr">${escapeHtml(href(`/client/${user.username}`))}</strong>
      </div>
      <div class="modal-actions">
        <button class="ghost-button" type="button" data-cancel>Cancel</button>
        <button class="primary-button" type="button" data-confirm-share><i data-lucide="${channel === "whatsapp" ? "message-circle" : "mail"}"></i>Open ${escapeHtml(channelLabel)}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  icons();
  const close = () => modal.remove();
  modal.querySelector(".modal-close").addEventListener("click", close);
  modal.querySelector("[data-cancel]").addEventListener("click", close);
  modal.querySelector("[data-confirm-share]").addEventListener("click", () => {
    const password = modal.querySelector("input[name='sharePassword']").value.trim();
    if (!password) {
      toast("Password is required");
      return;
    }
    const confirmed = window.confirm(`Open ${channelLabel} with login details for ${user.username}?`);
    if (!confirmed) return;
    openCredentialShareTarget(user, channel, password);
    close();
  });
  modal.querySelector("input[name='sharePassword']").focus();
}

function openCredentialShareTarget(user, channel, password) {
  const site = state.sites.find((item) => item.id === user.siteId) || {};
  const loginUrl = `${location.origin}${basePath}/login`;
  const clientUrl = `${location.origin}${href(`/client/${user.username}`)}`;
  const message = [
    "שלום,",
    "",
    "פרטי הכניסה שלך למערכת ניהול האתר:",
    `קישור כניסה: ${loginUrl}`,
    `אזור הלקוח: ${clientUrl}`,
    `שם משתמש: ${user.username}`,
    `סיסמה: ${password}`,
    site.websiteUrl ? `האתר שלך: ${site.websiteUrl}` : "",
    "",
    "נא לשמור את הפרטים האלה באופן פרטי ולא להעביר אותם הלאה.",
  ]
    .filter(Boolean)
    .join("\n");
  const encodedMessage = encodeURIComponent(message);
  const url =
    channel === "whatsapp"
      ? `https://wa.me/?text=${encodedMessage}`
      : `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent("פרטי כניסה למערכת ניהול האתר")}&body=${encodedMessage}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

async function copyText(value, label = "Value") {
  try {
    await navigator.clipboard.writeText(value);
    toast(`${label} copied`);
  } catch (error) {
    toast("Copy failed");
  }
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

function setDocumentLocale(lang, dir) {
  document.documentElement.lang = lang;
  document.documentElement.dir = dir;
}

function slotLabel(site, slotId) {
  return slotDisplayLabel((site.slots || DEFAULT_SLOTS).find((slot) => slot.id === slotId) || { id: slotId });
}

function slotDisplayLabel(slot) {
  return HEBREW_SLOT_LABELS[slot?.id] || slot?.label || "תמונה";
}

function slotRatioLabel(ratio) {
  return ratio === "free" ? "חופשי" : ratio || "";
}

function isClientRoute() {
  return stripBase(location.pathname).startsWith("/client/");
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

function watchIcons() {
  window.addEventListener("load", icons);
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (window.lucide) {
      icons();
      window.clearInterval(timer);
    } else if (attempts >= 40) {
      window.clearInterval(timer);
    }
  }, 250);
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
