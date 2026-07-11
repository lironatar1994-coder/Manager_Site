const DEFAULT_SLOTS = [
  { id: "hero", label: "תמונת פתיחה", ratio: "16:9", required: true },
  { id: "logo", label: "לוגו", ratio: "1:1", required: true },
  { id: "about", label: "אזור אודות", ratio: "4:3", required: false },
  { id: "service", label: "תמונת שירות", ratio: "4:3", required: false },
  { id: "gallery", label: "גלריה", ratio: "חופשי", required: false },
];

const STATUS_META = {
  draft: { label: "טיוטה", icon: "pencil-line" },
  published: { label: "פורסם", icon: "badge-check" },
  needs_attention: { label: "דורש תיקון", icon: "triangle-alert" },
};

const HEBREW_STATUS_META = {
  draft: { label: "טיוטה", icon: "pencil-line" },
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

const UPLOAD_FILE_LIMIT_BYTES = 16 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]);
const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"];

const state = {
  me: null,
  users: [],
  sites: [],
  audit: [],
  clientSite: null,
  clientAssets: null,
  clientText: null,
  clientUsername: "",
  previewMode: "desktop",
  adminReviewFilter: "all",
  adminAuditFilter: "all",
  lastProof: null,
  sectionNotice: null,
  livePreviewVersion: Date.now(),
};

const app = document.querySelector("#app");
const basePath = getBasePath();

renderBootLoading();
init().catch((error) => {
  console.error("App failed to start", error);
  state.me = null;
  renderLogin("לא ניתן להפעיל את המערכת. נא לנסות שוב.");
});
watchIcons();

async function init() {
  const me = await api("/api/auth/me", { allow401: true });
  if (me?.user) {
    state.me = me.user;
    state.clientSite = me.site;
  }
  await route();
  markBootReady();
  window.addEventListener("popstate", route);
}

async function route() {
  const path = stripBase(location.pathname);
  const isLoginRoute = path === "/login" || path === "/admin-login";
  if (!state.me && path === "/admin") {
    navigate("/admin-login", true);
    renderAdminLogin();
    return;
  }
  if (!state.me && path === "/admin-login") {
    renderAdminLogin();
    return;
  }
  if (!state.me && path !== "/login") {
    navigate("/login", true);
    renderLogin();
    return;
  }
  if (state.me && isLoginRoute) {
    navigate(state.me.role === "admin" ? "/admin" : `/client/${state.me.username}`, true);
    await route();
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
      await route();
      return;
    }
    await loadClient(username);
    renderClient();
    return;
  }
  renderLogin();
}

function renderBootLoading() {
  setDocumentLocale("he", "rtl");
  app.className = "boot-screen boot-loading";
  app.innerHTML = `
    <main class="boot-card" dir="rtl" lang="he" aria-live="polite">
      <div class="mark">MS</div>
      <div>
        <strong>טוענים את מערכת ניהול האתר</strong>
        <span>בודקים חיבור והרשאות...</span>
      </div>
    </main>
  `;
}

function renderAdminLogin(error = "") {
  setDocumentLocale("he", "rtl");
  app.className = "login-view admin-login-view admin-rtl";
  app.innerHTML = `
    <main class="login-shell admin-login-shell" dir="rtl" lang="he">
      <section class="login-panel admin-login-panel">
        <div class="brand-row">
          <span class="mark">MS</span>
          <span>
            <strong>ניהול אתרים</strong>
            <small>כניסת מנהל פרטית</small>
          </span>
        </div>
        <div class="login-copy">
          <p class="eyebrow">כניסת מנהל</p>
          <h1>אזור ניהול נפרד, נקי ומאובטח.</h1>
          <p>הכניסה הזו מיועדת לחשבון המנהל בלבד. לקוחות ממשיכים להיכנס דרך מסך הכניסה הרגיל בעברית.</p>
        </div>
        <form class="login-form" id="loginForm" data-admin-login="true">
          <label>שם משתמש מנהל<input name="username" autocomplete="username" placeholder="admin" dir="ltr" required /></label>
          <label>סיסמה<input name="password" type="password" autocomplete="current-password" dir="ltr" required /></label>
          ${error ? `<div class="form-error">${escapeHtml(error)}</div>` : ""}
          <button class="primary-button" type="submit"><i data-lucide="shield-check"></i>כניסה ללוח הניהול</button>
        </form>
      </section>
      <aside class="login-art admin-login-art" aria-label="סקירת גישת מנהל">
        <div class="art-window admin-window">
          <div class="window-bar"><span></span><span></span><span></span></div>
          <div class="admin-lockup">
            <i data-lucide="lock-keyhole"></i>
            <strong>מנהל בלבד</strong>
            <p>משתמשים, נתיבים, הרשאות, איפוס סיסמאות ובדיקת אתרים נשארים מאחורי הכניסה הזו.</p>
          </div>
          <div class="admin-signal-grid" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
          <div class="admin-chip">בדיקות הרשאה בשרת מגנות על כל פעולת ניהול.</div>
        </div>
      </aside>
    </main>
  `;
  document.querySelector("#loginForm").addEventListener("submit", onLogin);
  icons();
  markBootReady();
}

function renderLogin(error = "") {
  setDocumentLocale("he", "rtl");
  const loginPrefill = readLoginPrefill();
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
          <label>שם משתמש<input name="username" autocomplete="username" placeholder="miryam_zelig" value="${escapeAttr(loginPrefill.username)}" dir="ltr" required /></label>
          <label>סיסמה<input name="password" type="password" autocomplete="current-password" value="${escapeAttr(loginPrefill.password)}" dir="ltr" required /></label>
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
            <p>אזורי תמונה מסודרים, תצוגת אתר ופעולות פשוטות במקום אחד.</p>
          </div>
          <div class="image-rack"><span></span><span></span><span></span></div>
          <div class="admin-chip">המנהל שולט במשתמשים, הרשאות וגישה</div>
        </div>
      </aside>
    </main>
  `;
  document.querySelector("#loginForm").addEventListener("submit", onLogin);
  clearLoginPrefillFromUrl(loginPrefill);
  icons();
  markBootReady();
}

function renderAdmin() {
  setDocumentLocale("he", "rtl");
  app.className = "app-view admin-mode admin-rtl";
  const clientUsers = state.users.filter((user) => user.role === "client");
  const activeUsers = clientUsers.filter((user) => user.active).length;
  const attentionSites = state.sites.filter((site) => site.status === "needs_attention").length;
  const publishedSites = state.sites.filter((site) => site.status === "published").length;
  const totalImages = state.sites.reduce((sum, site) => sum + site.images.length, 0);
  const auditFilter = state.adminAuditFilter || "all";
  const filteredAuditRows = auditFilter === "all" ? state.audit : state.audit.filter((row) => auditCategory(row.action) === auditFilter);
  const auditFilterCounts = auditCountsByCategory(state.audit);
  const recentAuditRows = filteredAuditRows.slice(0, 10);
  app.innerHTML = `
    ${shell("admin")}
    <main class="workspace admin-workspace" dir="rtl" lang="he">
      <header class="admin-command">
        <div class="admin-command-copy">
          <p class="eyebrow">לוח ניהול</p>
          <h1>ניהול לקוחות ואתרים</h1>
          <p>מקום אחד לפתיחת לקוח, שליחת גישה, צפייה באתר ופעולות תחזוקה. מסודר, שקט ומהיר.</p>
        </div>
        <div class="admin-command-actions">
          <button class="primary-button" id="createUserTop" type="button"><i data-lucide="user-plus"></i>לקוח חדש</button>
        </div>
      </header>

      <section class="admin-summary-grid">
        ${metric("לקוחות פעילים", activeUsers, "גישה פתוחה")}
        ${metric("אתרים מנוהלים", state.sites.length, `${publishedSites} פורסמו`)}
        ${metric("דורשים טיפול", attentionSites, "מסומנים ידנית")}
        ${metric("תמונות", totalImages, "נכסים מנוהלים")}
      </section>

      <section class="admin-grid upgraded premium-admin-grid">
        <article class="admin-panel create-panel admin-create-panel">
          <details id="createClientDetails" class="admin-create-details">
            <summary>
              <span>
                <strong>יצירת לקוח</strong>
                <small>משתמש, הרשאות ואתר משויך</small>
              </span>
              <i data-lucide="chevron-down"></i>
            </summary>
            ${createUserForm()}
          </details>
        </article>

        <article class="admin-panel users-panel admin-clients-panel">
          <div class="panel-title">
            <h2>לקוחות</h2>
            <span class="quiet">${clientUsers.length} נתיבים</span>
          </div>
          <div class="user-list route-list">${clientUsers.map(userCard).join("") || `<p class="empty">עדיין אין לקוחות.</p>`}</div>
        </article>

        <article class="admin-panel audit-panel admin-activity-panel">
          <div class="panel-title">
            <h2>פעילות אחרונה</h2>
            <span class="quiet">${recentAuditRows.length} מתוך ${state.audit.length}</span>
          </div>
          <div class="audit-filter-bar" role="tablist" aria-label="סינון פעילות אחרונה">
            ${auditFilterButton("all", "הכל", auditFilterCounts.all, auditFilter)}
            ${auditFilterButton("user", "משתמשים", auditFilterCounts.user, auditFilter)}
            ${auditFilterButton("site", "אתרים", auditFilterCounts.site, auditFilter)}
            ${auditFilterButton("image", "תמונות", auditFilterCounts.image, auditFilter)}
            ${auditFilterButton("asset", "קבצי אתר", auditFilterCounts.asset, auditFilter)}
            ${auditFilterButton("text", "טקסטים", auditFilterCounts.text, auditFilter)}
          </div>
          <div class="audit-list">${recentAuditRows.map(auditRow).join("") || `<p class="empty">אין פעילות בסינון הזה.</p>`}</div>
        </article>
      </section>
    </main>
  `;
  bindShell();
  document.querySelector("#createUserForm").addEventListener("submit", onCreateUser);
  document.querySelector("#createUserTop").addEventListener("click", () => {
    const panel = document.querySelector("#createClientDetails");
    if (panel) panel.open = true;
    panel?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => document.querySelector("#newUsername")?.focus(), 220);
  });
  document.querySelectorAll("[data-toggle-user]").forEach((button) => {
    button.addEventListener("click", () => toggleUser(button.dataset.toggleUser, button.dataset.active !== "true"));
  });
  document.querySelectorAll("[data-reset-password]").forEach((button) => {
    button.addEventListener("click", () => resetUserPassword(button.dataset.resetPassword));
  });
  document.querySelectorAll("[data-edit-user]").forEach((button) => {
    button.addEventListener("click", () => showEditUserModal(button.dataset.editUser));
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
  document.querySelectorAll("[data-review-note-image]").forEach((button) => {
    button.addEventListener("click", () => showReviewNoteModal(button.dataset.reviewNoteSite, button.dataset.reviewNoteImage));
  });
  document.querySelectorAll("[data-audit-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.adminAuditFilter = button.dataset.auditFilter;
      renderAdmin();
    });
  });
  interceptInternalLinks();
  icons();
  markBootReady();
}

function renderClient() {
  setDocumentLocale("he", "rtl");
  const site = state.clientSite;
  if (!site) return renderForbidden();
  const slots = displaySlots(site);
  const completedSlots = slots.filter((slot) => imagesForSlot(site, slot.id).length).length;
  const totalSlots = slots.length;
  const sections = clientEditorSections(site);
  const isAdminPreview = state.me.role === "admin";
  const clientName = isAdminPreview ? state.clientUsername : state.me.displayName;
  const visibleWebsiteUrl = state.clientAssets?.client?.publicUrl || site.websiteUrl;
  app.className = `app-view client-mode client-rtl ${state.me.role === "admin" ? "admin-preview" : ""}`;
  app.innerHTML = `
    ${shell("client")}
    <main class="workspace client-workspace" dir="rtl" lang="he">
      ${
        isAdminPreview
          ? `<section class="preview-banner"><i data-lucide="eye"></i><span>תצוגת מנהל עבור ${escapeHtml(state.clientUsername)}</span><a href="${href("/admin")}">חזרה לניהול</a></section>`
          : ""
      }

      <section class="client-hero-page">
        <div class="client-hero-copy">
          <p class="eyebrow">${escapeHtml(clientName)}</p>
          <h1>ניהול תמונות האתר</h1>
          <p class="client-hero-subtitle">כל התמונות והטקסטים שאפשר לעדכן באתר, במקום אחד נקי.</p>
          <div class="hero-actions">
            <a class="primary-button" href="${escapeAttr(visibleWebsiteUrl)}" target="_blank" rel="noreferrer"><i data-lucide="external-link"></i>פתיחה</a>
            <button class="ghost-button" type="button" data-share-website="${escapeAttr(visibleWebsiteUrl)}"><i data-lucide="share-2"></i>שיתוף</button>
            <button class="ghost-button icon-only" type="button" data-refresh-preview aria-label="רענון תצוגה" title="רענון תצוגה"><i data-lucide="refresh-cw"></i></button>
          </div>
          <details class="hero-link-details">
            <summary><i data-lucide="link"></i><span>קישור האתר</span><bdi>${escapeHtml(shortUrlLabel(visibleWebsiteUrl))}</bdi></summary>
            <form id="siteLinkForm" class="site-link-form hero-link-form">
              <label>כתובת האתר<input name="websiteUrl" value="${escapeAttr(visibleWebsiteUrl)}" ${can("canEditLinks") ? "" : "disabled"} /></label>
              <button class="ghost-button" type="submit" ${can("canEditLinks") ? "" : "disabled"}><i data-lucide="${can("canEditLinks") ? "save" : "lock"}"></i>${can("canEditLinks") ? "שמירה" : "נעול"}</button>
            </form>
          </details>
        </div>

        <article class="website-preview managed-preview hero-live-preview" data-preview-mode="${state.previewMode}">
          <div class="preview-toolbar">
            <div>
              <h2>האתר עכשיו</h2>
            </div>
            <div class="preview-toggle" role="tablist" aria-label="בחירת תצוגה">
              <button class="${state.previewMode === "desktop" ? "active" : ""}" type="button" data-preview-mode="desktop"><i data-lucide="monitor"></i>מחשב</button>
              <button class="${state.previewMode === "mobile" ? "active" : ""}" type="button" data-preview-mode="mobile"><i data-lucide="smartphone"></i>נייד</button>
            </div>
          </div>
          <div class="preview-device">
            <div class="browser-bar"><span></span><span></span><span></span><p>${escapeHtml(visibleWebsiteUrl)}</p></div>
            <div class="preview-canvas live-iframe-preview">
              <iframe src="${escapeAttr(clientLivePreviewUrl(visibleWebsiteUrl))}" title="תצוגת האתר החי" loading="lazy" data-live-preview></iframe>
              <div class="preview-fallback" data-live-preview-fallback hidden>
                <i data-lucide="panel-top-open"></i>
                <strong>התצוגה החיה לא זמינה כרגע</strong>
                <span>אפשר לפתוח את האתר בחלון חדש ולהמשיך לנהל את התמונות כאן.</span>
                <div>
                  <a class="primary-button" href="${escapeAttr(visibleWebsiteUrl)}" target="_blank" rel="noreferrer"><i data-lucide="external-link"></i>פתיחת האתר</a>
                  <button class="ghost-button" type="button" data-refresh-preview-inline><i data-lucide="refresh-cw"></i>ניסיון נוסף</button>
                </div>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section class="client-overview client-task-overview">
        <article class="progress-panel client-control-panel">
          <div class="panel-title">
            <span>
              <p class="eyebrow">עריכת האתר</p>
              <h2>בחרו אזור</h2>
            </span>
            <span class="quiet">כל שינוי נפתח בחלון נקי עם תצוגה לפני אישור.</span>
          </div>
          <div class="section-editor-grid">${sections.map(sectionCard).join("")}</div>
          ${
            isAdminPreview
              ? `<div class="panel-title compact-title">
                  <h2>סטטוס מנהל</h2>
                  <span class="quiet">${completedSlots}/${totalSlots} אזורים מרכזיים מוכנים</span>
                </div>
                ${statusTimeline(site.status)}
                <div class="admin-status-actions">
                  <button class="ghost-button small" type="button" data-admin-status="draft" data-site-id="${site.id}">טיוטה</button>
                  <button class="ghost-button small" type="button" data-admin-status="published" data-site-id="${site.id}">פורסם</button>
                  <button class="ghost-button small" type="button" data-admin-status="needs_attention" data-site-id="${site.id}">דורש טיפול</button>
                </div>`
              : ""
          }
        </article>
      </section>
    </main>
  `;
  bindShell();
  document.querySelector("#siteLinkForm")?.addEventListener("submit", onUpdateSite);
  document.querySelectorAll("button[data-preview-mode]").forEach((button) => {
    button.addEventListener("click", () => setPreviewMode(button.dataset.previewMode));
  });
  document.querySelector("[data-refresh-preview]")?.addEventListener("click", refreshSitePreview);
  document.querySelector("[data-refresh-preview-inline]")?.addEventListener("click", refreshSitePreview);
  document.querySelector("[data-share-website]")?.addEventListener("click", (event) => {
    shareClientWebsite(event.currentTarget.dataset.shareWebsite, site.name || clientName);
  });
  bindLivePreview();
  document.querySelectorAll("[data-edit-section]").forEach((button) => {
    button.addEventListener("click", () => showSectionEditor(button.dataset.editSection));
  });
  // The previous slot grid and standalone upload form are intentionally not rendered.
  // Image actions now live inside the section editor to keep one clear workflow.
  document.querySelectorAll("[data-image-action-slot]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.justDragged === "true") return;
      showImageActionModal(button.dataset.imageActionSlot);
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
  document.querySelectorAll("[data-edit-text-slot]").forEach((button) => {
    button.addEventListener("click", () => showTextEditModal(button.dataset.editTextSlot));
  });
  bindImageDragAndDrop();
  document.querySelectorAll("[data-admin-status]").forEach((button) => {
    button.addEventListener("click", () => updateSiteStatus(button.dataset.siteId, button.dataset.adminStatus));
  });
  interceptInternalLinks();
  icons();
  markBootReady();
}

function shell(active) {
  return `
    <aside class="side-rail">
      <div class="mark">MS</div>
      <nav>
        ${
          state.me?.role === "admin"
            ? `<a class="${active === "admin" ? "active" : ""}" href="${href("/admin")}"><i data-lucide="shield"></i><span>ניהול</span></a>`
            : `<a class="${active === "client" ? "active" : ""}" href="${href(`/client/${state.me.username}`)}"><i data-lucide="images"></i><span>האתר שלי</span></a>`
        }
      </nav>
      <button class="logout-button" id="logoutButton" type="button"><i data-lucide="log-out"></i><span>יציאה</span></button>
    </aside>
  `;
}

function createUserForm() {
  return `
    <form id="createUserForm" class="create-form">
      <div class="two-col">
        <label>שם תצוגה<input name="displayName" placeholder="Miryam Zelig" required /></label>
        <label>שם משתמש<input id="newUsername" name="username" placeholder="miryam_zelig" dir="ltr" required /></label>
      </div>
      <label>סיסמה זמנית<input name="password" type="password" minlength="10" placeholder="סיסמה זמנית" dir="ltr" required /></label>
      <div class="two-col">
        <label>שם האתר<input name="siteName" placeholder="Miryam Zelig Website" required /></label>
        <label>קישור לאתר<input name="websiteUrl" placeholder="https://example.com" dir="ltr" required /></label>
      </div>
      <div class="route-preview"><i data-lucide="route"></i><span>נתיב הלקוח יהיה <strong dir="ltr">/client/<em id="routePreview">username</em></strong></span></div>
      <div class="permission-row">
        ${permissionBox("canUpload", "העלאה", true)}
        ${permissionBox("canDelete", "מחיקה", true)}
        ${permissionBox("canEditLinks", "עריכת קישור", true)}
        ${permissionBox("canEditText", "עריכת טקסט", true)}
        ${permissionBox("canPublish", "פרסום", false)}
      </div>
      <button class="primary-button" type="submit"><i data-lucide="user-plus"></i>יצירת נתיב</button>
    </form>
  `;
}

function permissionBox(name, label, checked) {
  return `<label class="perm"><input type="checkbox" name="${name}" ${checked ? "checked" : ""} />${label}</label>`;
}

function userCard(user) {
  const site = state.sites.find((item) => item.id === user.siteId) || {};
  const imageCount = (site.images || []).length;
  const updatedLabel = site.updatedAt ? formatHebrewDateTime(site.updatedAt) : "עוד לא עודכן";
  return `
    <article class="user-card route-card premium-user-card">
      <div class="client-card-main">
        <span class="avatar">${escapeHtml(user.displayName.slice(0, 2).toUpperCase())}</span>
        <div class="client-card-copy">
          <div class="client-card-title">
            <h3>${escapeHtml(user.displayName)}</h3>
            <span class="status ${user.active ? "live" : "paused"}">${user.active ? "פעיל" : "מושהה"}</span>
          </div>
          <p>${escapeHtml(site.name || "לא הוגדר אתר")}</p>
          <a class="client-route-link" href="${href(`/client/${user.username}`)}"><i data-lucide="route"></i><bdi>${escapeHtml(`/client/${user.username}`)}</bdi></a>
          <div class="client-card-facts">
            <span><i data-lucide="image"></i>${imageCount} תמונות</span>
            <span><i data-lucide="clock-3"></i>${escapeHtml(updatedLabel)}</span>
            ${site.websiteUrl ? `<span><i data-lucide="globe"></i><bdi>${escapeHtml(shortUrlLabel(site.websiteUrl))}</bdi></span>` : ""}
          </div>
        </div>
      </div>

      <div class="user-actions premium-user-actions">
        ${statusPill(site.status || "draft", "he")}
        ${shareCluster(user)}
        <a class="ghost-button small" href="${href(`/client/${user.username}`)}"><i data-lucide="eye"></i>פתיחה</a>
        <button class="ghost-button small" type="button" data-edit-user="${user.id}" title="עריכה"><i data-lucide="settings-2"></i>עריכה</button>
        <button class="ghost-button small" type="button" data-toggle-user="${user.id}" data-active="${user.active}"><i data-lucide="${user.active ? "pause" : "play"}"></i>${user.active ? "השהיה" : "הפעלה"}</button>
      </div>

      <details class="credential-details">
        <summary><i data-lucide="key-round"></i><span>פרטי גישה והרשאות</span><i data-lucide="chevron-down"></i></summary>
        <div class="credential-grid">
          ${credentialLine("שם משתמש", user.username)}
          ${credentialLine("מזהה משתמש", user.id)}
          ${credentialLine("מזהה אתר", user.siteId || "")}
          <div class="credential-line locked">
            <span>סיסמה</span>
            <strong>שמורה כהצפנה מאובטחת</strong>
            <button class="ghost-button small" type="button" data-reset-password="${user.id}"><i data-lucide="key-round"></i>איפוס</button>
          </div>
        </div>
        <div class="permission-chips">${permissionChips(user.permissions)}</div>
      </details>
    </article>
  `;
}

function shareCluster(user) {
  return `
    <div class="share-cluster" data-share-menu="${user.id}">
      <div class="share-actions" aria-label="שיתוף פרטי התחברות">
        <button class="share-channel whatsapp" type="button" data-share-user="${user.id}" data-share-channel="whatsapp" aria-label="שיתוף ב-WhatsApp" title="WhatsApp">
          <i data-lucide="message-circle"></i>
        </button>
        <button class="share-channel gmail" type="button" data-share-user="${user.id}" data-share-channel="gmail" aria-label="שיתוף ב-Gmail" title="Gmail">
          <i data-lucide="mail"></i>
        </button>
      </div>
      <button class="share-trigger" type="button" data-share-toggle="${user.id}" aria-label="פתיחת פעולות שיתוף" title="שיתוף פרטי התחברות">
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
          ? `<button class="icon-action copy-action" type="button" data-copy-value="${escapeAttr(value)}" data-copy-label="${escapeAttr(label)}" aria-label="העתקת ${escapeAttr(label)}"><i data-lucide="copy"></i></button>`
          : ""
      }
    </div>
  `;
}

function reviewCountsByStatus(sites = []) {
  return sites.reduce(
    (counts, site) => {
      const status = site.status || "draft";
      counts.all += 1;
      counts[status] = (counts[status] || 0) + 1;
      return counts;
    },
    { all: 0, draft: 0, published: 0, needs_attention: 0 }
  );
}

function reviewFilterButton(id, label, count, active) {
  return `
    <button class="review-filter ${active === id ? "active" : ""}" type="button" data-review-filter="${id}" role="tab" aria-selected="${active === id}">
      <span>${escapeHtml(label)}</span>
      <strong>${count || 0}</strong>
    </button>
  `;
}

function reviewRow(site) {
  const images = site.images || [];
  const previewImages = images.slice(0, 4);
  const extraImages = Math.max(0, images.length - previewImages.length);
  const owner = state.users.find((user) => user.username === site.ownerUsername);
  const primaryImage = previewImages[0];
  const primarySlot = primaryImage ? displaySlots(site).find((slot) => slot.id === (primaryImage.slotId || "gallery")) || { id: primaryImage.slotId || "gallery", ratio: "free" } : null;
  return `
    <div class="review-row">
      <div class="review-thumbs" aria-label="תמונות אחרונות">
        ${
          previewImages.length
            ? previewImages
                .map(
                  (image, index) => `
                    <button class="review-thumb ${index === 0 ? "primary" : ""} ${image.reviewNote ? "has-note" : ""}" type="button" data-review-note-site="${site.id}" data-review-note-image="${image.id}" aria-label="הערת מנהל עבור ${escapeAttr(image.name)}">
                      <img src="${escapeAttr(image.url)}" alt="${escapeAttr(image.name)}" />
                      ${image.reviewNote ? `<i data-lucide="message-square-text"></i>` : ""}
                    </button>`
                )
                .join("")
            : `<span class="review-thumb empty"><i data-lucide="image"></i></span>`
        }
        ${extraImages ? `<span class="review-thumb more">+${extraImages}</span>` : ""}
      </div>
      <div class="review-copy">
        <strong>${escapeHtml(site.name)}</strong>
        <span><bdi>${escapeHtml(site.ownerUsername)}</bdi> · ${images.length} תמונות</span>
        <small>${escapeHtml(owner?.displayName || "לקוח")} · ${escapeHtml(site.websiteUrl || "לא הוגדר קישור")}</small>
        ${primaryImage ? imageQualityChips(primaryImage, primarySlot) : ""}
      </div>
      <div class="review-state">
        ${statusPill(site.status, "he")}
      </div>
      <div class="review-actions">
        <a class="ghost-button small" href="${href(`/client/${site.ownerUsername}`)}"><i data-lucide="eye"></i>תצוגה</a>
        <button class="ghost-button small" type="button" data-admin-status="published" data-site-id="${site.id}">פרסום</button>
        <button class="ghost-button small" type="button" data-admin-status="needs_attention" data-site-id="${site.id}">דורש תיקון</button>
      </div>
    </div>
  `;
}

function assetRailItem(site, slot) {
  const images = imagesForSlot(site, slot.id);
  const primary = images[0];
  const stateLabel = primary ? "תמונה קיימת" : slot.required ? "נדרשת תמונה" : "אפשר להוסיף";
  const actionLabel = primary ? "ניהול" : "הוספה";
  return `
    <button class="asset-queue-item ${primary ? "filled" : "missing"}" type="button" data-image-action-slot="${slot.id}" data-drop-slot="${slot.id}" ${
      primary ? draggableAttrs(primary) : ""
    } ${can("canUpload") ? "" : "disabled"}>
      <span class="asset-queue-thumb">
        ${primary ? `<img src="${escapeAttr(primary.url)}" alt="${escapeAttr(primary.name)}" />` : `<i data-lucide="image-plus"></i>`}
        <em>${escapeHtml(stateLabel)}</em>
      </span>
      <span class="asset-queue-copy">
        <strong>${escapeHtml(slotDisplayLabel(slot))}</strong>
        <small>${primary ? "אפשר להחליף או לסדר" : "אפשר להוסיף תמונה"}</small>
        <span class="asset-queue-hint">${primary ? "לחצו לפתיחה, החלפה, חיתוך או מחיקה" : "לחצו כדי לבחור תמונה מתאימה"}</span>
      </span>
      <span class="asset-queue-action">
        <i data-lucide="${primary ? "settings-2" : "plus"}"></i>
        ${escapeHtml(actionLabel)}
      </span>
    </button>
  `;
}

function renderTextManager() {
  const slots = state.clientText?.textSlots || [];
  if (!slots.length) return "";
  const aboutSlots = slots.filter((slot) => (slot.group || "").toLowerCase() === "about");
  const faqSlots = slots.filter((slot) => (slot.group || "").toLowerCase() === "faq");
  const otherSlots = slots.filter((slot) => !["about", "faq"].includes((slot.group || "").toLowerCase()));
  return `
    <section class="text-manager" aria-label="טקסטים באתר">
      <div class="panel-title compact-title">
        <span>
          <h2>טקסטים באתר</h2>
        </span>
      </div>
      ${textGroup("אודות", aboutSlots)}
      ${textGroup("שאלות נפוצות", faqSlots)}
      ${otherSlots.length ? textGroup("טקסטים נוספים", otherSlots) : ""}
    </section>
  `;
}

function textGroup(title, slots) {
  if (!slots.length) return "";
  return `
    <div class="text-group">
      <h3>${escapeHtml(title)}</h3>
      <div class="text-row-list">
        ${slots.map(textSlotRow).join("")}
      </div>
    </div>
  `;
}

function textSlotRow(slot) {
  const disabled = !slot.editable || !can("canEditText");
  const preview = slot.value || slot.error || "לא נמצא טקסט לעריכה";
  return `
    <button class="text-slot-row ${slot.editable ? "ready" : "blocked"}" type="button" data-edit-text-slot="${escapeAttr(slot.id)}" ${disabled ? "disabled" : ""}>
      <span>
        <strong>${escapeHtml(slot.label || slot.id)}</strong>
        <small>${escapeHtml(preview)}</small>
      </span>
      <i data-lucide="${slot.editable ? "pen-line" : "lock"}"></i>
    </button>
  `;
}

function clientEditorSections(site) {
  const sections = [
    {
      id: "hero",
      title: "פתיחה",
      icon: "sparkles",
      description: "התמונה הראשונה שמקבלת את פני המבקרים.",
      imageSlots: [],
      textSlots: [],
    },
    {
      id: "gallery",
      title: "גלריה",
      icon: "images",
      description: "התמונות שמציגות את העבודה והאווירה באתר.",
      imageSlots: [],
      textSlots: [],
    },
    {
      id: "before_after",
      title: "לפני ואחרי",
      icon: "columns-2",
      description: "תמונות ההשוואה שמופיעות באזור לפני ואחרי.",
      imageSlots: [],
      textSlots: [],
    },
    {
      id: "about",
      title: "אודות",
      icon: "user-round",
      description: "הטקסט והתמונה שמספרים מי עומדת מאחורי האתר.",
      imageSlots: [],
      textSlots: [],
    },
    {
      id: "faq",
      title: "שאלות נפוצות",
      icon: "message-circle-question",
      description: "שאלות ותשובות שמאפשרות ללקוחות להבין מהר.",
      imageSlots: [],
      textSlots: [],
    },
  ];
  const byId = new Map(sections.map((section) => [section.id, section]));

  displaySlots(site).forEach((slot) => {
    const section = byId.get(sectionIdForImageSlot(slot.id));
    if (section) section.imageSlots.push(slot);
  });

  (state.clientText?.textSlots || []).forEach((slot) => {
    const section = byId.get(sectionIdForTextSlot(slot));
    if (section) section.textSlots.push(slot);
  });

  return sections
    .map((section) => enrichClientSection(site, section))
    .filter((section) => section.imageSlots.length || section.textSlots.length);
}

function enrichClientSection(site, section) {
  const imageSlots = section.imageSlots.map((slot) => ({
    ...slot,
    images: imagesForSlot(site, slot.id),
  }));
  const primaryImage = imageSlots.find((slot) => slot.images.length)?.images[0] || null;
  const firstText = section.textSlots.find((slot) => String(slot.value || "").trim());
  return {
    ...section,
    imageSlots,
    primaryImage,
    previewText: firstText ? trimText(firstText.value, 92) : section.description,
    ready: Boolean(primaryImage || firstText),
  };
}

function sectionIdForImageSlot(slotId = "") {
  if (slotId === "hero") return "hero";
  if (slotId === "about") return "about";
  if (slotId.startsWith("before_after")) return "before_after";
  if (slotId.startsWith("gallery")) return "gallery";
  return "gallery";
}

function sectionIdForTextSlot(slot) {
  const group = String(slot.group || "").toLowerCase();
  const id = String(slot.id || "").toLowerCase();
  if (group === "about" || id.startsWith("about.")) return "about";
  if (group === "faq" || id.startsWith("faq.")) return "faq";
  return "about";
}

function sectionCard(section) {
  return `
    <button class="section-editor-card ${section.ready ? "ready" : "empty"}" type="button" data-edit-section="${escapeAttr(section.id)}">
      ${sectionCardMedia(section)}
      <span class="section-card-copy">
        <strong>${escapeHtml(section.title)}</strong>
        <small>${escapeHtml(section.previewText)}</small>
      </span>
      <span class="section-card-action"><i data-lucide="pen-line"></i>עריכה</span>
    </button>
  `;
}

function sectionCardMedia(section) {
  const images = section.imageSlots.flatMap((slot) => slot.images.slice(0, 1));
  if (section.id === "gallery" && images.length) {
    return `
      <span class="section-card-media section-card-collage gallery-collage">
        ${collageCells(images, 4, section.icon)}
      </span>
    `;
  }
  if (section.id === "before_after" && images.length) {
    return `
      <span class="section-card-media section-card-collage before-after-collage">
        ${collageCells(images, 2, section.icon)}
      </span>
    `;
  }
  return `
    <span class="section-card-media">
      ${
        section.primaryImage
          ? `<img src="${escapeAttr(section.primaryImage.url)}" alt="${escapeAttr(section.primaryImage.name)}" />`
          : `<i data-lucide="${escapeAttr(section.icon)}"></i>`
      }
    </span>
  `;
}

function collageCells(images, count, fallbackIcon) {
  return Array.from({ length: count }, (_, index) => {
    const image = images[index];
    return `
      <span class="section-card-tile ${image ? "filled" : "empty"}">
        ${image ? `<img src="${escapeAttr(image.url)}" alt="${escapeAttr(image.name)}" />` : `<i data-lucide="${escapeAttr(fallbackIcon)}"></i>`}
      </span>
    `;
  }).join("");
}

function showSectionEditor(sectionId) {
  const site = state.clientSite;
  const section = clientEditorSections(site).find((item) => item.id === sectionId);
  if (!section) return;
  const hasImages = section.imageSlots.length > 0;
  const hasText = section.textSlots.length > 0;
  const defaultPane = hasImages ? "images" : "text";
  const modal = document.createElement("div");
  modal.className = "section-editor-backdrop";
  modal.innerHTML = `
    <div class="section-editor-modal" role="dialog" aria-modal="true" aria-label="${escapeAttr(section.title)}" dir="rtl" lang="he">
      <header class="section-editor-header">
        <span class="section-editor-kicker"><i data-lucide="${escapeAttr(section.icon)}"></i>${escapeHtml(section.title)}</span>
        <button class="icon-action modal-close" type="button" aria-label="סגירה"><i data-lucide="x"></i></button>
      </header>
      <div class="section-editor-layout">
        <button class="section-editor-preview ${section.primaryImage ? "filled" : "empty"}" type="button" data-section-preview ${section.primaryImage ? "" : "disabled"}>
          ${
            section.primaryImage
              ? `<img src="${escapeAttr(section.primaryImage.url)}" alt="${escapeAttr(section.primaryImage.name)}" />`
              : `<i data-lucide="${escapeAttr(section.icon)}"></i>`
          }
        </button>
        <div class="section-editor-content">
          <h2>${escapeHtml(section.title)}</h2>
          <p>${escapeHtml(section.description)}</p>
          ${
            hasImages && hasText
              ? `<div class="section-editor-tabs" role="tablist">
                  <button class="active" type="button" data-section-tab="images">תמונות</button>
                  <button type="button" data-section-tab="text">טקסט</button>
                </div>`
              : ""
          }
          ${hasImages ? sectionImagePane(section, defaultPane === "images") : ""}
          ${hasText ? sectionTextPane(section, defaultPane === "text") : ""}
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  icons();

  const close = () => modal.remove();
  modal.querySelector(".modal-close").addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });
  modal.querySelector("[data-section-preview]")?.addEventListener("click", () => {
    if (section.primaryImage) showFullImagePreview(section.primaryImage.url, section.primaryImage.name || section.title);
  });
  modal.querySelectorAll("[data-section-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      modal.querySelectorAll("[data-section-tab]").forEach((item) => item.classList.toggle("active", item === button));
      modal.querySelectorAll("[data-section-pane]").forEach((pane) => {
        pane.hidden = pane.dataset.sectionPane !== button.dataset.sectionTab;
      });
    });
  });
  modal.querySelectorAll("[data-image-action-slot]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.justDragged === "true") return;
      close();
      showImageActionModal(button.dataset.imageActionSlot);
    });
  });
  modal.querySelectorAll("[data-edit-text-slot]").forEach((button) => {
    button.addEventListener("click", () => {
      close();
      showTextEditModal(button.dataset.editTextSlot);
    });
  });
  const addGalleryButton = modal.querySelector("[data-add-gallery-image]");
  const addGalleryInput = modal.querySelector("[data-add-gallery-file]");
  if (addGalleryButton && addGalleryInput) {
    const addGalleryFeedback = modal.querySelector("[data-gallery-add-feedback]");
    addGalleryButton.addEventListener("click", () => addGalleryInput.click());
    addGalleryInput.addEventListener("change", async () => {
      const file = addGalleryInput.files?.[0];
      if (!file) return;
      if (addGalleryFeedback) {
        addGalleryFeedback.hidden = true;
        addGalleryFeedback.textContent = "";
      }
      addGalleryButton.disabled = true;
      addGalleryButton.innerHTML = `<i data-lucide="loader-circle"></i>מוסיפים לגלריה`;
      icons();
      const saved = await addGalleryImage(file, { reopenGallery: true });
      if (saved) close();
      else {
        addGalleryButton.disabled = false;
        addGalleryButton.innerHTML = `<i data-lucide="image-plus"></i>הוספת תמונה לגלריה`;
        if (addGalleryFeedback) {
          addGalleryFeedback.textContent = state.galleryAddError || "לא הצלחנו להוסיף את התמונה. נסו קובץ JPG, PNG או WebP עד 16MB.";
          addGalleryFeedback.hidden = false;
        }
        addGalleryInput.value = "";
        icons();
      }
    });
  }
  bindImageDragAndDrop();
}

function sectionImagePane(section, active) {
  return `
    <div class="section-editor-pane" data-section-pane="images" ${active ? "" : "hidden"}>
      ${sectionNotice(section.id)}
      ${section.id === "gallery" && can("canUpload") ? galleryAddButton() : ""}
      <div class="section-item-list">
        ${section.imageSlots.map(sectionImageRow).join("")}
      </div>
    </div>
  `;
}

function sectionNotice(sectionId) {
  const notice = state.sectionNotice;
  if (!notice || notice.sectionId !== sectionId) return "";
  return `
    <div class="section-notice ${escapeAttr(notice.type || "success")}">
      <i data-lucide="${notice.type === "error" ? "triangle-alert" : "check-circle-2"}"></i>
      <span>${escapeHtml(notice.message)}</span>
    </div>
  `;
}

function galleryAddButton() {
  return `
    <div class="gallery-add-panel">
      <button class="primary-button gallery-add-button" type="button" data-add-gallery-image><i data-lucide="image-plus"></i>הוספת תמונה לגלריה</button>
      <small class="gallery-add-hint">JPG, PNG או WebP · עד 16MB</small>
      <div class="gallery-add-feedback" data-gallery-add-feedback role="alert" hidden></div>
      <input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" data-add-gallery-file hidden />
    </div>
  `;
}

function sectionImageRow(slot) {
  const image = slot.images[0];
  return `
    <button class="section-edit-row image-row ${image ? "filled" : "empty"}" type="button" data-image-action-slot="${escapeAttr(slot.id)}" data-drop-slot="${escapeAttr(slot.id)}" ${
      image ? draggableAttrs(image) : ""
    } ${can("canUpload") ? "" : "disabled"}>
      <span class="section-row-thumb">
        ${image ? `<img src="${escapeAttr(image.url)}" alt="${escapeAttr(image.name)}" />` : `<i data-lucide="image-plus"></i>`}
      </span>
      <span>
        <strong>${escapeHtml(slotDisplayLabel(slot))}</strong>
        <small>${image ? "לחצו לעריכה, החלפה או חיתוך" : "לחצו כדי להוסיף תמונה"}</small>
      </span>
      <i data-lucide="${image ? "settings-2" : "plus"}"></i>
    </button>
  `;
}

function sectionTextPane(section, active) {
  return `
    <div class="section-editor-pane" data-section-pane="text" ${active ? "" : "hidden"}>
      <div class="section-item-list">
        ${section.textSlots.map(sectionTextRow).join("")}
      </div>
    </div>
  `;
}

function sectionTextRow(slot) {
  const disabled = !slot.editable || !can("canEditText");
  const preview = slot.value || "לחצו כדי לערוך";
  return `
    <button class="section-edit-row text-row ${slot.editable ? "ready" : "blocked"}" type="button" data-edit-text-slot="${escapeAttr(slot.id)}" ${disabled ? "disabled" : ""}>
      <span class="section-row-thumb text-thumb"><i data-lucide="type"></i></span>
      <span>
        <strong>${escapeHtml(slot.label || slot.id)}</strong>
        <small>${escapeHtml(trimText(preview, 84))}</small>
      </span>
      <i data-lucide="${slot.editable ? "pen-line" : "lock"}"></i>
    </button>
  `;
}

function trimText(value, length = 90) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= length) return text;
  return `${text.slice(0, length - 1).trim()}…`;
}

function draggableAttrs(image) {
  if (!image || !can("canUpload")) return "";
  return [
    'draggable="true"',
    'data-draggable-image="true"',
    `data-drag-image="${escapeAttr(image.id)}"`,
    `data-drag-slot="${escapeAttr(image.slotId || "gallery")}"`,
    `data-drag-source="${escapeAttr(image.source || "manager")}"`,
  ].join(" ");
}

function slotCard(site, slot) {
  const images = imagesForSlot(site, slot.id);
  const primary = images[0];
  const gallery = slot.id === "gallery";
  return `
    <article class="slot-card ${primary ? "filled" : "empty"}" data-drop-slot="${slot.id}">
      <div class="slot-top">
        <span>
          <strong>${escapeHtml(slotDisplayLabel(slot))}</strong>
          <small>${slot.required ? "חובה" : "לא חובה"} · ${escapeHtml(slotRatioLabel(slot.ratio))}</small>
          ${imageQualityChips(primary, slot)}
          <em class="slot-state">${primary ? "תמונה קיימת - אפשר להחליף או להסיר" : "אין תמונה - אפשר להוסיף"}</em>
        </span>
        <button class="ghost-button small" type="button" data-image-action-slot="${slot.id}" ${can("canUpload") ? "" : "disabled"}>
          <i data-lucide="${primary ? "replace" : "plus"}"></i>${primary && !gallery ? "החלפה" : "העלאה"}
        </button>
      </div>
      ${
        primary
          ? `<div class="slot-image ${gallery ? "gallery-strip" : ""}">
              ${images
                .map(
                  (image) => `
                    <figure ${draggableAttrs(image)} data-drop-image="${escapeAttr(image.id)}" data-drop-image-source="${escapeAttr(image.source || "manager")}">
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
  const order = ["draft", "published"];
  const activeIndex = Math.max(0, order.indexOf(status));
  return `
    <div class="status-timeline">
      ${order
        .map((item, index) => `<span class="${index <= activeIndex ? "active" : ""}"><i data-lucide="${HEBREW_STATUS_META[item].icon}"></i>${HEBREW_STATUS_META[item].label}</span>`)
        .join("")}
      ${status === "needs_attention" ? `<span class="active attention"><i data-lucide="triangle-alert"></i>דורש טיפול</span>` : ""}
    </div>
  `;
}

function statusPill(status = "draft", locale = "en") {
  const source = locale === "he" ? HEBREW_STATUS_META : STATUS_META;
  const normalizedStatus = source[status] ? status : "draft";
  const meta = source[normalizedStatus] || source.draft;
  return `<span class="site-status ${normalizedStatus}"><i data-lucide="${meta.icon}"></i>${meta.label}</span>`;
}

function permissionChips(permissions = {}) {
  return [
    ["canUpload", "העלאה"],
    ["canDelete", "מחיקה"],
    ["canEditLinks", "עריכת קישור"],
    ["canEditText", "עריכת טקסט"],
    ["canPublish", "פרסום"],
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
      <button class="slot-marker" type="button" data-image-action-slot="${slotId}" ${can("canUpload") ? "" : "disabled"}>
        <i data-lucide="${image ? "replace" : "plus"}"></i>
        <span>${escapeHtml(label)}</span>
      </button>
    </div>
  `;
}

function renderUpdateProof(websiteUrl) {
  if (!state.lastProof) return "";
  const proof = state.lastProof;
  return `
    <div class="update-proof ${proof.previewOk ? "ok" : "warn"}">
      <div class="proof-title">
        <i data-lucide="${proof.previewOk ? "badge-check" : "badge-alert"}"></i>
        <strong>${escapeHtml(proof.title || "העדכון בוצע")}</strong>
      </div>
      <div class="proof-list">
        <span><i data-lucide="check"></i>${escapeHtml(proof.imageText || "התמונה עודכנה")}</span>
        <span><i data-lucide="${proof.liveFileOk ? "check" : "info"}"></i>${escapeHtml(proof.liveFileOk ? "קובץ האתר החי עודכן" : "נשמר במערכת הניהול")}</span>
        <span><i data-lucide="${proof.previewOk ? "check" : "triangle-alert"}"></i>${escapeHtml(proof.previewText || "התצוגה עודכנה")}</span>
      </div>
      <a href="${escapeAttr(websiteUrl)}" target="_blank" rel="noreferrer"><i data-lucide="external-link"></i>פתיחת האתר</a>
    </div>
  `;
}

function shortUrlLabel(websiteUrl) {
  try {
    const url = new URL(websiteUrl);
    return `${url.host}${url.pathname}`.replace(/\/$/, "");
  } catch (error) {
    return websiteUrl || "לא הוגדר קישור";
  }
}

async function shareClientWebsite(websiteUrl, siteName = "האתר") {
  if (!websiteUrl) return toast("לא נמצא קישור לשיתוף", "error");
  const shareData = {
    title: siteName,
    text: "קישור לאתר",
    url: websiteUrl,
  };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }
    await copyText(websiteUrl, "קישור האתר");
  } catch (error) {
    if (error?.name === "AbortError") return;
    await copyText(websiteUrl, "קישור האתר");
  }
}

function clientLivePreviewUrl(websiteUrl) {
  try {
    const url = new URL(websiteUrl);
    url.searchParams.set("manager_preview", String(state.livePreviewVersion || Date.now()));
    return url.toString();
  } catch (error) {
    return websiteUrl;
  }
}

function refreshSitePreview() {
  state.livePreviewVersion = Date.now();
  state.lastProof = {
    title: "התצוגה רועננה",
    imageText: "האתר נטען מחדש בתצוגה",
    liveFileOk: true,
    previewOk: true,
    previewText: "התצוגה החיה רועננה בדפדפן",
  };
  toast("התצוגה רועננה", "success");
  renderClient();
}

function bindLivePreview() {
  const preview = document.querySelector("[data-live-preview]");
  const frame = preview?.closest(".live-iframe-preview");
  const fallback = frame?.querySelector("[data-live-preview-fallback]");
  const refreshButtons = document.querySelectorAll("[data-refresh-preview], [data-refresh-preview-inline]");
  if (!preview || !frame) return;
  let settled = false;
  const setButtonsLoading = (loading) => {
    refreshButtons.forEach((button) => button.classList.toggle("is-loading", loading));
  };
  const markLoaded = () => {
    settled = true;
    frame.classList.remove("is-loading");
    frame.classList.remove("is-blocked");
    if (fallback) fallback.hidden = true;
    setButtonsLoading(false);
  };
  const markUnavailable = () => {
    if (settled) return;
    settled = true;
    frame.classList.remove("is-loading");
    frame.classList.add("is-blocked");
    if (fallback) fallback.hidden = false;
    setButtonsLoading(false);
    icons();
  };
  const fallbackTimer = window.setTimeout(markUnavailable, 9000);
  preview.addEventListener("load", () => {
    window.clearTimeout(fallbackTimer);
    markLoaded();
  }, { once: true });
  preview.addEventListener("error", markUnavailable, { once: true });
  frame.classList.remove("is-blocked");
  if (fallback) fallback.hidden = true;
  frame.classList.add("is-loading");
  setButtonsLoading(true);
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

function displaySlots(site) {
  const fallbackSlots = site.slots?.length ? site.slots : DEFAULT_SLOTS;
  const merged = new Map();
  fallbackSlots.forEach((slot) => merged.set(slot.id, slot));
  (state.clientAssets?.assets || []).forEach((asset) => {
    merged.set(asset.slotId, {
      id: asset.slotId,
      label: asset.label,
      ratio: asset.slotId.startsWith("gallery") ? "free" : "",
      required: asset.required,
    });
  });
  return Array.from(merged.values());
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
      backupCount: asset.backupCount || 0,
      latestBackupAt: asset.latestBackupAt || null,
    }));
}

function bindImageDragAndDrop() {
  if (!can("canUpload")) return;
  document.querySelectorAll("[data-draggable-image]").forEach((node) => {
    node.addEventListener("dragstart", (event) => {
      const payload = {
        imageId: node.dataset.dragImage,
        slotId: node.dataset.dragSlot,
        source: node.dataset.dragSource || "manager",
      };
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/json", JSON.stringify(payload));
      node.classList.add("is-dragging");
    });
    node.addEventListener("dragend", () => {
      node.classList.remove("is-dragging");
      node.dataset.justDragged = "true";
      window.setTimeout(() => {
        delete node.dataset.justDragged;
      }, 180);
      document.querySelectorAll(".drop-ready").forEach((target) => target.classList.remove("drop-ready"));
    });
  });

  document.querySelectorAll("[data-drop-slot]").forEach((target) => {
    target.addEventListener("dragover", (event) => {
      if (!event.dataTransfer.types.includes("application/json")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      target.classList.add("drop-ready");
    });
    target.addEventListener("dragleave", (event) => {
      if (!target.contains(event.relatedTarget)) target.classList.remove("drop-ready");
    });
    target.addEventListener("drop", async (event) => {
      event.preventDefault();
      target.classList.remove("drop-ready");
      const payload = readDragPayload(event);
      if (!payload?.imageId) return;
      const imageTarget = event.target.closest("[data-drop-image]");
      await reorderDraggedImage({
        ...payload,
        targetSlotId: target.dataset.dropSlot,
        targetImageId: imageTarget?.dataset.dropImage || "",
        targetSource: imageTarget?.dataset.dropImageSource || "",
      });
    });
  });
}

function readDragPayload(event) {
  try {
    return JSON.parse(event.dataTransfer.getData("application/json") || "{}");
  } catch (error) {
    return null;
  }
}

async function reorderDraggedImage({ imageId, slotId, source, targetSlotId, targetImageId, targetSource }) {
  if (!targetSlotId || (slotId === targetSlotId && (!targetImageId || targetImageId === imageId))) return;
  const targetHasProductionAsset = (state.clientAssets?.assets || []).some((asset) => asset.slotId === targetSlotId && asset.exists);
  if (targetHasProductionAsset && source !== "production" && !imageId.startsWith("asset-")) {
    toast("גרירה לאזור חי זמינה בין תמונות האתר הקיימות. להחלפה עם קובץ חדש השתמשו בהעלאה.");
    return;
  }
  const productionMove = source === "production" || targetSource === "production" || imageId.startsWith("asset-") || targetImageId.startsWith("asset-");
  const response = productionMove
    ? await api(`/api/sites/${state.clientSite.id}/assets/reorder`, { method: "POST", body: { sourceSlotId: slotId, targetSlotId } })
    : await api(`/api/sites/${state.clientSite.id}/images/${imageId}/placement`, { method: "PATCH", body: { targetSlotId, targetImageId } });
  if (response?.error) return toast(formatApiError(response.error), "error");
  state.clientSite = response.site || state.clientSite;
  if (response.assets) state.clientAssets = { ...(state.clientAssets || {}), assets: response.assets };
  else await loadClientAssets();
  state.livePreviewVersion = Date.now();
  state.lastProof = {
    title: "סדר התמונות עודכן",
    imageText: "המיקום החדש נשמר",
    liveFileOk: true,
    previewOk: true,
    previewText: "התצוגה החיה רועננה בדפדפן",
  };
  toast("סדר התמונות עודכן", "success");
  renderClient();
}

function metric(label, value, note) {
  return `<article><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`;
}

function auditRow(row) {
  const category = auditCategory(row.action);
  return `
    <div class="audit-row ${category}">
      <span class="audit-kind">${escapeHtml(auditCategoryLabel(category))}</span>
      <div class="audit-copy">
        <strong>${escapeHtml(formatAuditAction(row.action))}</strong>
        ${formatAuditDetail(row) ? `<span>${escapeHtml(formatAuditDetail(row))}</span>` : ""}
      </div>
      <bdi>${escapeHtml(row.actor)}</bdi>
      <small>${new Date(row.at).toLocaleString("he-IL")}</small>
    </div>
  `;
}

function auditCategory(action = "") {
  const prefix = String(action).split(".")[0];
  return ["user", "site", "image", "asset", "text"].includes(prefix) ? prefix : "other";
}

function auditCategoryLabel(category) {
  const labels = {
    user: "משתמש",
    site: "אתר",
    image: "תמונה",
    asset: "קובץ אתר",
    text: "טקסט",
    other: "מערכת",
  };
  return labels[category] || labels.other;
}

function auditCountsByCategory(rows = []) {
  return rows.reduce(
    (counts, row) => {
      const category = auditCategory(row.action);
      counts.all += 1;
      counts[category] = (counts[category] || 0) + 1;
      return counts;
    },
    { all: 0, user: 0, site: 0, image: 0, asset: 0, text: 0, other: 0 }
  );
}

function auditFilterButton(id, label, count, active) {
  return `
    <button class="audit-filter ${active === id ? "active" : ""}" type="button" data-audit-filter="${id}" role="tab" aria-selected="${active === id}">
      <span>${escapeHtml(label)}</span>
      <strong>${count || 0}</strong>
    </button>
  `;
}

function formatAuditDetail(row) {
  const details = row.details || {};
  const parts = [];
  if (details.username) parts.push(`לקוח: ${details.username}`);
  if (details.slotId && String(row.action || "").startsWith("text.")) parts.push(`שדה: ${textSlotAuditLabel(details.slotId)}`);
  else if (details.slotId) parts.push(`אזור: ${slotDisplayLabel({ id: details.slotId })}`);
  if (details.sourceSlotId && details.targetSlotId) parts.push(`${slotDisplayLabel({ id: details.sourceSlotId })} → ${slotDisplayLabel({ id: details.targetSlotId })}`);
  if (details.status) parts.push(`סטטוס: ${HEBREW_STATUS_META[details.status]?.label || details.status}`);
  if (details.imageId && !details.slotId) parts.push(`תמונה: ${details.imageId}`);
  if (details.siteId && !details.username) parts.push(`אתר: ${details.siteId}`);
  return parts.join(" · ");
}

function formatAuditAction(action) {
  const labels = {
    "user.created": "משתמש נוצר",
    "user.updated": "משתמש עודכן",
    "user.password_reset": "סיסמה אופסה",
    "site.updated": "קישור אתר עודכן",
    "site.status": "סטטוס אתר עודכן",
    "image.uploaded": "תמונה הועלתה",
    "image.deleted": "תמונה נמחקה",
    "image.reordered": "סדר תמונות עודכן",
    "image.review_note": "הערת מנהל עודכנה",
    "asset.deleted": "תמונת אתר נמחקה",
    "asset.restored": "תמונת אתר שוחזרה",
    "asset.reordered": "תמונות אתר הוחלפו",
    "text.updated": "טקסט באתר עודכן",
  };
  return labels[action] || action;
}

function formatApiError(error) {
  const labels = {
    "Username and password are required": "חובה להזין שם משתמש וסיסמה",
    "Invalid credentials": "שם המשתמש או הסיסמה אינם נכונים",
    "Username, display name, password, site name, and website URL are required": "חובה למלא שם תצוגה, שם משתמש, סיסמה, שם אתר וקישור לאתר",
    "Username already exists": "שם המשתמש כבר קיים",
    "Client user not found": "הלקוח לא נמצא",
    "Permission denied": "אין הרשאה לבצע את הפעולה",
    "Login required": "נדרשת התחברות",
    "Admin access required": "נדרשת הרשאת מנהל",
    "Site not found": "האתר לא נמצא",
    "Site access denied": "אין גישה לאתר הזה",
    "Image file is required": "חובה לבחור קובץ תמונה",
    "Only JPG, PNG, WebP, GIF, or SVG images are allowed": "אפשר להעלות רק תמונת JPG, PNG, WebP, GIF או SVG",
    "Uploaded image is too large": "התמונה גדולה מדי. אפשר להעלות עד 16MB",
    "Image not found": "התמונה לא נמצאה",
    "Asset slot not configured": "אזור התמונה לא מוגדר",
    "Asset file not found": "קובץ התמונה לא נמצא",
    "Invalid site status": "סטטוס האתר אינו תקין",
    "Source and target image slots are required": "חובה לבחור תמונת מקור ותמונת יעד",
    "Configured image slot not found": "אזור התמונה לא נמצא בהגדרות",
    "Production images must be reordered by slot": "תמונות אתר חי אפשר לסדר רק לפי אזורי תמונה",
    "Client gallery is not configured": "הגלריה לא מוגדרת להוספת תמונות.",
    "Live website folder is not available": "תיקיית האתר החי לא זמינה כרגע.",
    "No existing gallery slot to extend": "אין גלריה קיימת שאפשר להרחיב.",
    "Could not find a safe next gallery filename": "לא נמצא שם קובץ בטוח לתמונה החדשה.",
    "Could not find the live gallery markup to update": "לא נמצא מקום בטוח להוספת התמונה באתר החי.",
    "Could not add gallery image": "לא ניתן להוסיף תמונה לגלריה כרגע.",
    "Could not remove image from live gallery": "לא ניתן להסיר את התמונה מהגלריה באתר החי.",
    "Could not restore image backup": "לא ניתן לשחזר את גיבוי התמונה",
    "Request failed": "הבקשה נכשלה",
    "Network request failed": "לא ניתן להתחבר לשרת. בדקו חיבור ונסו שוב.",
    "Server unavailable": "השרת לא זמין כרגע. נסו שוב בעוד דקה.",
    "Unexpected server response": "השרת החזיר תשובה לא צפויה. נסו לרענן.",
    "Too many requests": "יש יותר מדי פעולות ברצף. חכו רגע ונסו שוב.",
    "Request timed out": "הבקשה לקחה יותר מדי זמן. נסו שוב.",
    "Upload file is missing": "בחרו תמונה לפני ההעלאה.",
    "Upload type not allowed": "אפשר להעלות רק JPG, PNG, WebP, GIF או SVG.",
    "HEIC images are not supported": "תמונות HEIC אינן נתמכות. בחרו בתמונה כ-JPG, PNG או WebP.",
    "Text slot not configured": "אזור הטקסט לא מוגדר לעריכה.",
    "Text marker not found": "סימון הטקסט לא נמצא באתר. צריך לעדכן את קובץ האתר.",
    "Text marker must be unique": "סימון הטקסט מופיע יותר מפעם אחת באתר.",
    "Text value is required": "חובה להזין טקסט לפני השמירה.",
    "Text value is too long": "הטקסט ארוך מדי לשדה הזה.",
    "Text update verification failed": "הטקסט נשמר אך האימות נכשל. צריך לבדוק את האתר.",
    "Could not update text slot": "לא ניתן לעדכן את הטקסט כרגע.",
  };
  return labels[error] || error || "הפעולה נכשלה";
}

function validateImageFile(file) {
  if (!file || typeof file.size !== "number" || file.size === 0) return "Upload file is missing";
  if (file.size > UPLOAD_FILE_LIMIT_BYTES) return "Uploaded image is too large";
  const fileName = (file.name || "").toLowerCase();
  if (["image/heic", "image/heif"].includes(file.type) || /\.(heic|heif)$/.test(fileName)) return "HEIC images are not supported";
  const hasAllowedMime = file.type ? ALLOWED_IMAGE_MIME_TYPES.has(file.type) : false;
  const hasAllowedExtension = ALLOWED_IMAGE_EXTENSIONS.some((extension) => fileName.endsWith(extension));
  if (!hasAllowedMime && !hasAllowedExtension) return "Upload type not allowed";
  return "";
}

async function onLogin(event) {
  event.preventDefault();
  const isAdminLogin = event.currentTarget.dataset.adminLogin === "true";
  const form = new FormData(event.currentTarget);
  const response = await api("/api/auth/login", {
    method: "POST",
    body: { username: form.get("username"), password: form.get("password") },
    allow401: true,
  });
  if (response?.error) return isAdminLogin ? renderAdminLogin(formatApiError(response.error)) : renderLogin(formatApiError(response.error));
  if (isAdminLogin && response.user?.role !== "admin") {
    await api("/api/auth/logout", { method: "POST", allow401: true });
    state.me = null;
    return renderAdminLogin("נדרשת התחברות של מנהל.");
  }
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
      canEditText: form.has("canEditText"),
      canPublish: form.has("canPublish"),
    },
  };
  const response = await api("/api/admin/users", { method: "POST", body });
  if (response?.error) return toast(formatApiError(response.error), "error");
  toast(`נוצר נתיב /client/${response.user.username}`, "success");
  await loadAdmin();
  renderAdmin();
}

async function toggleUser(userId, active) {
  const response = await api(`/api/admin/users/${userId}`, { method: "PATCH", body: { active } });
  if (response?.error) return toast(formatApiError(response.error), "error");
  await loadAdmin();
  renderAdmin();
}

function showReviewNoteModal(siteId, imageId) {
  const site = state.sites.find((item) => item.id === siteId);
  const image = site?.images?.find((item) => item.id === imageId);
  if (!site || !image) return;
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="confirm-modal review-note-modal" role="dialog" aria-modal="true" aria-label="הערת מנהל" dir="rtl" lang="he">
      <button class="icon-action modal-close" type="button" aria-label="סגירה"><i data-lucide="x"></i></button>
      <div class="review-note-layout">
        <figure>
          <img src="${escapeAttr(image.url)}" alt="${escapeAttr(image.name)}" />
        </figure>
        <form id="reviewNoteForm" class="review-note-form">
          <p class="eyebrow">הערת מנהל</p>
          <h2>${escapeHtml(slotDisplayLabel({ id: image.slotId || "gallery" }))}</h2>
          <p>${escapeHtml(site.name)} · <bdi>${escapeHtml(site.ownerUsername)}</bdi></p>
          <label>הערה פנימית לתמונה
            <textarea name="note" maxlength="500" placeholder="לדוגמה: להחליף לתמונה חדה יותר, לבדוק חיתוך במובייל...">${escapeHtml(image.reviewNote || "")}</textarea>
          </label>
          <small>${image.reviewNoteUpdatedAt ? `עודכן על ידי ${escapeHtml(image.reviewNoteBy || "מנהל")} · ${new Date(image.reviewNoteUpdatedAt).toLocaleString("he-IL")}` : "ההערה נשמרת למנהל ולא מוצגת ללקוח."}</small>
          <div class="modal-actions">
            <button class="ghost-button" type="button" data-clear-note ${image.reviewNote ? "" : "disabled"}>ניקוי הערה</button>
            <button class="primary-button" type="submit"><i data-lucide="save"></i>שמירת הערה</button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  icons();
  const close = () => modal.remove();
  modal.querySelector(".modal-close").addEventListener("click", close);
  modal.querySelector("[data-clear-note]").addEventListener("click", async () => {
    const saved = await saveReviewNote(siteId, imageId, "");
    if (saved) close();
  });
  modal.querySelector("#reviewNoteForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const note = new FormData(event.currentTarget).get("note");
    const saved = await saveReviewNote(siteId, imageId, note);
    if (saved) close();
  });
  modal.querySelector("textarea").focus();
}

async function saveReviewNote(siteId, imageId, note) {
  const response = await api(`/api/admin/sites/${siteId}/images/${imageId}/review-note`, { method: "PATCH", body: { note } });
  if (response?.error) {
    toast(formatApiError(response.error), "error");
    return false;
  }
      toast(note ? "הערת המנהל נשמרה" : "הערת המנהל נמחקה", "success");
  await loadAdmin();
  renderAdmin();
  return true;
}

function showEditUserModal(userId) {
  const user = state.users.find((item) => item.id === userId);
  if (!user) return;
  const site = state.sites.find((item) => item.id === user.siteId) || {};
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="confirm-modal admin-edit-modal" role="dialog" aria-modal="true" aria-label="עריכת לקוח" dir="rtl" lang="he">
      <button class="icon-action modal-close" type="button" aria-label="סגירה"><i data-lucide="x"></i></button>
      <div class="panel-title">
        <span>
          <p class="eyebrow">עריכת לקוח</p>
          <h2>${escapeHtml(user.displayName)}</h2>
        </span>
        <strong dir="ltr">/client/${escapeHtml(user.username)}</strong>
      </div>
      <form id="editUserForm" class="admin-edit-form">
        <div class="two-col">
          <label>שם תצוגה<input name="displayName" value="${escapeAttr(user.displayName)}" required /></label>
          <label>שם האתר<input name="siteName" value="${escapeAttr(site.name || "")}" required /></label>
        </div>
        <label>קישור לאתר<input name="websiteUrl" value="${escapeAttr(site.websiteUrl || "")}" dir="ltr" required /></label>
        <div class="edit-permission-band">
          ${permissionBox("canUpload", "העלאה", Boolean(user.permissions?.canUpload))}
          ${permissionBox("canDelete", "מחיקה", Boolean(user.permissions?.canDelete))}
          ${permissionBox("canEditLinks", "עריכת קישור", Boolean(user.permissions?.canEditLinks))}
          ${permissionBox("canEditText", "עריכת טקסט", Boolean(user.permissions?.canEditText))}
          ${permissionBox("canPublish", "פרסום", Boolean(user.permissions?.canPublish))}
        </div>
        <p class="edit-note">שינויים כאן משפיעים על הפרטים שהלקוח רואה ועל ההרשאות שלו במערכת.</p>
        <div class="modal-actions">
          <button class="ghost-button" type="button" data-cancel>ביטול</button>
          <button class="primary-button" type="submit"><i data-lucide="save"></i>שמירת שינויים</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
  icons();
  const close = () => modal.remove();
  modal.querySelector(".modal-close").addEventListener("click", close);
  modal.querySelector("[data-cancel]").addEventListener("click", close);
  modal.querySelector("#editUserForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const saved = await saveUserProfile(userId, new FormData(event.currentTarget));
    if (saved) close();
  });
  modal.querySelector("input[name='displayName']").focus();
}

async function saveUserProfile(userId, form) {
  const body = {
    displayName: form.get("displayName"),
    siteName: form.get("siteName"),
    websiteUrl: form.get("websiteUrl"),
    permissions: {
      canUpload: form.has("canUpload"),
      canDelete: form.has("canDelete"),
      canEditLinks: form.has("canEditLinks"),
      canEditText: form.has("canEditText"),
      canPublish: form.has("canPublish"),
    },
  };
  const response = await api(`/api/admin/users/${userId}`, { method: "PATCH", body });
  if (response?.error) {
    toast(formatApiError(response.error), "error");
    return false;
  }
  toast("פרטי הלקוח נשמרו", "success");
  await loadAdmin();
  renderAdmin();
  return true;
}

async function resetUserPassword(userId) {
  const user = state.users.find((item) => item.id === userId);
  if (!user) return;
  confirmAction({
    title: "לאפס את סיסמת הלקוח?",
    body: `הפעולה תחליף את הסיסמה הנוכחית של ${user.username}. הסיסמה הזמנית החדשה תוצג פעם אחת בלבד.`,
    confirmText: "איפוס סיסמה",
    onConfirm: async () => {
      const response = await api(`/api/admin/users/${userId}/reset-password`, { method: "POST" });
      if (response?.error) return toast(formatApiError(response.error), "error");
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
  if (response?.error) return toast(formatApiError(response.error), "error");
  state.clientSite = response.site;
  toast("קישור האתר נשמר", "success");
  renderClient();
}

async function onUploadImage(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const selectedSlot = form.get("slotId") || "gallery";
  const selectedFile = form.get("image");
  const validationError = validateImageFile(selectedFile);
  if (validationError) return toast(formatApiError(validationError), "error");
  await appendImageMetadata(form, selectedFile);
  const response = await api(`/api/sites/${state.clientSite.id}/images`, { method: "POST", form });
  if (response?.error) return toast(formatApiError(response.error), "error");
  state.clientSite = response.site;
  await loadClientAssets();
  state.livePreviewVersion = Date.now();
  state.lastProof = {
    title: "התמונה עודכנה",
    imageText: `${slotLabel(state.clientSite, selectedSlot)} עודכן`,
    liveFileOk: response.image?.source === "production",
    previewOk: true,
    previewText: "התצוגה החיה רועננה בדפדפן",
  };
  toast("התמונה עודכנה והתצוגה רועננה", "success");
  renderClient();
}

async function uploadImageToSlot(slotId, file, name = "") {
  const validationError = validateImageFile(file);
  if (validationError) {
    toast(formatApiError(validationError), "error");
    return false;
  }
  const form = new FormData();
  form.set("slotId", slotId);
  form.set("image", file, name || file.name || `${slotId}.jpg`);
  if (name) form.set("name", name);
  await appendImageMetadata(form, file);
  const response = await api(`/api/sites/${state.clientSite.id}/images`, { method: "POST", form });
  if (response?.error) {
    toast(formatApiError(response.error), "error");
    return false;
  }
  state.clientSite = response.site;
  await loadClientAssets();
  state.livePreviewVersion = Date.now();
  state.lastProof = {
    title: "התמונה עודכנה",
    imageText: `${slotLabel(state.clientSite, slotId)} עודכן`,
    liveFileOk: response.image?.source === "production",
    previewOk: true,
    previewText: "התצוגה החיה רועננה בדפדפן",
  };
  toast("התמונה עודכנה והתצוגה רועננה", "success");
  renderClient();
  return true;
}

async function addGalleryImage(file, options = {}) {
  state.galleryAddError = "";
  const validationError = validateImageFile(file);
  if (validationError) {
    state.galleryAddError = formatApiError(validationError);
    toast(state.galleryAddError, "error");
    return false;
  }
  const form = new FormData();
  form.set("image", file, file.name || "gallery-image.jpg");
  form.set("name", file.name || "gallery-image.jpg");
  await appendImageMetadata(form, file);
  const response = await api(`/api/sites/${state.clientSite.id}/assets/gallery`, { method: "POST", form });
  if (response?.error) {
    state.galleryAddError = formatApiError(response.error);
    toast(state.galleryAddError, "error");
    return false;
  }
  state.clientSite = response.site || state.clientSite;
  state.clientAssets = { ...(state.clientAssets || {}), assets: response.assets || [] };
  state.livePreviewVersion = Date.now();
  state.sectionNotice = {
    sectionId: "gallery",
    type: "success",
    message: "התמונה נוספה לגלריה ומופיעה באתר",
  };
  state.lastProof = {
    title: "התמונה נוספה לגלריה",
    imageText: response.slot?.labelHe || "גלריה",
    liveFileOk: true,
    previewOk: true,
    previewText: "התצוגה החיה רועננה בדפדפן",
  };
  toast("התמונה נוספה לגלריה ומופיעה באתר", "success");
  renderClient();
  if (options.reopenGallery) {
    window.setTimeout(() => showSectionEditor("gallery"), 0);
  }
  return true;
}

async function deleteImage(imageId) {
  const response = await api(`/api/sites/${state.clientSite.id}/images/${imageId}`, { method: "DELETE" });
  if (response?.error) return toast(formatApiError(response.error), "error");
  state.clientSite = response.site;
  toast("התמונה הוסרה", "success");
  renderClient();
}

async function deleteAsset(slotId) {
  const isGalleryAsset = sectionIdForImageSlot(slotId) === "gallery";
  const response = await api(`/api/sites/${state.clientSite.id}/assets/${slotId}`, { method: "DELETE" });
  if (response?.error) return toast(formatApiError(response.error), "error");
  state.clientSite = response.site || state.clientSite;
  state.clientAssets = { ...(state.clientAssets || {}), assets: response.assets || [] };
  state.livePreviewVersion = Date.now();
  state.sectionNotice = isGalleryAsset
    ? {
        sectionId: "gallery",
        type: "success",
        message: "התמונה הוסרה מהגלריה באתר",
      }
    : null;
  state.lastProof = {
    title: "התמונה הוסרה",
    imageText: "התמונה הוסרה מהאתר",
    liveFileOk: true,
    previewOk: true,
    previewText: "התצוגה החיה רועננה בדפדפן",
  };
  toast("התמונה הוסרה מקובץ האתר", "success");
  renderClient();
  if (isGalleryAsset) {
    window.setTimeout(() => showSectionEditor("gallery"), 0);
  }
}

async function restoreAsset(slotId) {
  const response = await api(`/api/sites/${state.clientSite.id}/assets/${slotId}/restore`, { method: "POST" });
  if (response?.error) return toast(formatApiError(response.error), "error");
  state.clientSite = response.site || state.clientSite;
  state.clientAssets = { ...(state.clientAssets || {}), assets: response.assets || [] };
  state.livePreviewVersion = Date.now();
  state.lastProof = {
    title: "התמונה שוחזרה",
    imageText: "הגרסה הקודמת חזרה לאתר",
    liveFileOk: true,
    previewOk: true,
    previewText: "התצוגה החיה רועננה בדפדפן",
  };
  toast("התמונה שוחזרה מהגיבוי האחרון", "success");
  renderClient();
}

function showTextEditModal(slotId) {
  const slot = (state.clientText?.textSlots || []).find((item) => item.id === slotId);
  if (!slot || !slot.editable || !can("canEditText")) return;
  const multiline = slot.inputType === "long";
  const field = multiline
    ? `<textarea name="value" maxlength="${slot.maxLength}" rows="7" required>${escapeHtml(slot.value || "")}</textarea>`
    : `<input name="value" maxlength="${slot.maxLength}" value="${escapeAttr(slot.value || "")}" required />`;
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="confirm-modal text-edit-modal" role="dialog" aria-modal="true" aria-label="${escapeAttr(slot.label || "עריכת טקסט")}" dir="rtl" lang="he">
      <button class="icon-action modal-close" type="button" aria-label="סגירה"><i data-lucide="x"></i></button>
      <p class="eyebrow">טקסט באתר</p>
      <h2>${escapeHtml(slot.label || slot.id)}</h2>
      <form id="textEditForm" class="text-edit-form">
        <label>
          <span>טקסט שיופיע באתר</span>
          ${field}
        </label>
        <div class="text-edit-footer">
          <small><bdi data-text-count>${String(slot.value || "").length}</bdi>/${slot.maxLength}</small>
          <span>${slot.fileName ? escapeHtml(slot.fileName) : "קובץ האתר"}</span>
        </div>
        <div class="modal-actions">
          <button class="ghost-button" type="button" data-cancel>ביטול</button>
          <button class="primary-button" type="submit"><i data-lucide="save"></i>שמירת טקסט</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
  icons();
  const close = () => modal.remove();
  const input = modal.querySelector("[name='value']");
  const counter = modal.querySelector("[data-text-count]");
  const updateCounter = () => {
    counter.textContent = String(input.value.length);
    counter.classList.toggle("limit", input.value.length > slot.maxLength * 0.9);
  };
  modal.querySelector(".modal-close").addEventListener("click", close);
  modal.querySelector("[data-cancel]").addEventListener("click", close);
  input.addEventListener("input", updateCounter);
  modal.querySelector("#textEditForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const saved = await saveTextSlot(slot.id, input.value);
    if (saved) close();
  });
  input.focus();
}

async function saveTextSlot(slotId, value) {
  const response = await api(`/api/sites/${state.clientSite.id}/text/${encodeURIComponent(slotId)}`, { method: "PATCH", body: { value } });
  if (response?.error) {
    toast(formatApiError(response.error), "error");
    return false;
  }
  state.clientSite = response.site || state.clientSite;
  state.clientText = { ...(state.clientText || {}), textSlots: response.textSlots || [] };
  state.livePreviewVersion = Date.now();
  state.lastProof = {
    title: "הטקסט עודכן",
    imageText: textSlotLabel(slotId),
    liveFileOk: true,
    previewOk: true,
    previewText: "התצוגה החיה רועננה בדפדפן",
  };
  toast("הטקסט נשמר באתר", "success");
  renderClient();
  return true;
}

function showFullImagePreview(src, alt = "") {
  if (!src) return;
  const viewer = document.createElement("div");
  viewer.className = "image-preview-viewer";
  viewer.innerHTML = `
    <button class="image-preview-close" type="button" aria-label="סגירה"><i data-lucide="x"></i></button>
    <figure>
      <img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" />
    </figure>
  `;
  document.body.appendChild(viewer);
  icons();
  const close = () => {
    document.removeEventListener("keydown", onKeydown);
    viewer.remove();
  };
  const onKeydown = (event) => {
    if (event.key === "Escape") close();
  };
  viewer.querySelector(".image-preview-close").addEventListener("click", close);
  viewer.addEventListener("click", (event) => {
    if (event.target === viewer) close();
  });
  document.addEventListener("keydown", onKeydown);
}

function showImageActionModal(slotId) {
  const slot = displaySlots(state.clientSite).find((item) => item.id === slotId) || { id: slotId };
  const image = imagesForSlot(state.clientSite, slotId)[0];
  const canRestore = image?.source === "production" && Number(image.backupCount || 0) > 0 && can("canUpload");
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="image-action-modal" role="dialog" aria-modal="true" aria-label="${escapeAttr(slotDisplayLabel(slot))}">
      <button class="icon-action modal-close" type="button" aria-label="סגירה"><i data-lucide="x"></i></button>
      <button class="action-preview ${image ? "filled" : "empty"}" type="button" data-preview-zoom ${image ? "" : "disabled"}>
        ${image ? `<img src="${escapeAttr(image.url)}" alt="${escapeAttr(image.name)}" data-action-preview-media />` : `<i data-lucide="image-plus"></i>`}
      </button>
      <div class="action-copy">
        <p class="eyebrow">אזור תמונה</p>
        <h2>${escapeHtml(slotDisplayLabel(slot))}</h2>
        <p data-action-message>${image ? "בחרו תמונה חדשה או חתכו את התמונה הקיימת." : "בחרו תמונה שתופיע באזור הזה באתר."}</p>
      </div>
      <details class="modal-details">
        <summary><i data-lucide="info"></i>פרטים</summary>
        <div class="modal-details-body">
          ${image ? imageQualityChips(image, slot) : `<span class="image-meta-chips"><small><i data-lucide="scan"></i>מומלץ ${escapeHtml(recommendedSizeText(slot))}</small></span>`}
          ${renderBackupStatus(image)}
          <div class="quality-panel" data-quality-panel hidden></div>
        </div>
      </details>
      <input class="modal-file-input" type="file" accept="image/*" data-modal-file ${can("canUpload") ? "" : "disabled"} />
      <div class="image-action-buttons">
        <button class="primary-button" type="button" data-replace-slot="${escapeAttr(slotId)}"><i data-lucide="${image ? "replace" : "image-plus"}"></i>${image ? "בחירת תמונה" : "הוספת תמונה"}</button>
        <button class="ghost-button" type="button" data-crop-slot="${escapeAttr(slotId)}" ${image ? "" : "disabled"}><i data-lucide="crop"></i>חיתוך</button>
        <button class="ghost-button" type="button" data-restore-current="${escapeAttr(slotId)}" ${canRestore ? "" : "disabled"}><i data-lucide="rotate-ccw"></i>שחזור</button>
        <button class="danger-button" type="button" data-delete-current="${escapeAttr(slotId)}" ${image && can("canDelete") ? "" : "disabled"}><i data-lucide="trash-2"></i>מחיקה</button>
      </div>
      <div class="pending-replace-actions" hidden>
        <button class="ghost-button" type="button" data-clear-selection>ביטול בחירה</button>
        <button class="primary-button" type="button" data-confirm-replace><i data-lucide="check"></i>אישור החלפה</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  icons();
  let selectedFile = null;
  let selectedUrl = "";
  const dialog = modal.querySelector(".image-action-modal");
  const preview = modal.querySelector("[data-preview-zoom]");
  const fileInput = modal.querySelector("[data-modal-file]");
  const message = modal.querySelector("[data-action-message]");
  const qualityPanel = modal.querySelector("[data-quality-panel]");
  const pendingActions = modal.querySelector(".pending-replace-actions");
  const replaceButton = modal.querySelector("[data-replace-slot]");
  const cropButton = modal.querySelector("[data-crop-slot]");
  const confirmReplaceButton = modal.querySelector("[data-confirm-replace]");
  const cleanup = () => {
    if (selectedUrl) URL.revokeObjectURL(selectedUrl);
    modal.remove();
  };
  modal.querySelector(".modal-close").addEventListener("click", cleanup);
  preview.addEventListener("click", () => {
    const previewImage = preview.querySelector("img");
    if (!previewImage) return;
    showFullImagePreview(previewImage.src, previewImage.alt || slotDisplayLabel(slot));
  });
  modal.querySelector("[data-replace-slot]").addEventListener("click", () => {
    fileInput.click();
  });
  const setPendingFile = async (file) => {
    if (!file) return;
    if (selectedUrl) URL.revokeObjectURL(selectedUrl);
    selectedFile = file;
    selectedUrl = URL.createObjectURL(file);
    preview.disabled = false;
    preview.classList.remove("empty");
    preview.classList.add("filled", "pending");
    preview.innerHTML = `<img src="${escapeAttr(selectedUrl)}" alt="${escapeAttr(file.name)}" data-action-preview-media />`;
    message.textContent = "תמונה חדשה נבחרה. אפשר לאשר את ההחלפה עכשיו.";
    dialog.classList.add("has-pending-replace");
    pendingActions.hidden = false;
    cropButton.disabled = false;
    replaceButton.innerHTML = `<i data-lucide="replace"></i>בחירה אחרת`;
    try {
      const metadata = await readImageMetadata(selectedUrl);
      qualityPanel.hidden = false;
      qualityPanel.innerHTML = renderQualityReport(slot, file, metadata);
    } catch (error) {
      qualityPanel.hidden = false;
      qualityPanel.innerHTML = `<div class="quality-status warn"><i data-lucide="triangle-alert"></i><span>לא ניתן לקרוא את גודל התמונה לפני ההעלאה</span></div>`;
    }
    icons();
  };
  fileInput.addEventListener("change", () => {
    setPendingFile(fileInput.files?.[0]);
  });
  modal.querySelector("[data-clear-selection]").addEventListener("click", () => {
    if (selectedUrl) URL.revokeObjectURL(selectedUrl);
    selectedFile = null;
    selectedUrl = "";
    fileInput.value = "";
    preview.className = `action-preview ${image ? "filled" : "empty"}`;
    preview.disabled = !image;
    preview.innerHTML = image ? `<img src="${escapeAttr(image.url)}" alt="${escapeAttr(image.name)}" data-action-preview-media />` : `<i data-lucide="image-plus"></i>`;
    message.textContent = image ? "בחרו תמונה חדשה או חתכו את התמונה הקיימת." : "בחרו תמונה שתופיע באזור הזה באתר.";
    dialog.classList.remove("has-pending-replace");
    qualityPanel.hidden = true;
    qualityPanel.innerHTML = "";
    pendingActions.hidden = true;
    cropButton.disabled = !image;
    replaceButton.innerHTML = `<i data-lucide="${image ? "replace" : "image-plus"}"></i>${image ? "בחירת תמונה" : "הוספת תמונה"}`;
    icons();
  });
  confirmReplaceButton.addEventListener("click", async () => {
    if (!selectedFile) return;
    confirmReplaceButton.disabled = true;
    confirmReplaceButton.innerHTML = `<i data-lucide="loader-circle"></i>מחליפים תמונה`;
    icons();
    const uploaded = await uploadImageToSlot(slotId, selectedFile, selectedFile.name);
    if (uploaded) cleanup();
    else {
      confirmReplaceButton.disabled = false;
      confirmReplaceButton.innerHTML = `<i data-lucide="check"></i>אישור החלפה`;
      icons();
    }
  });
  modal.querySelector("[data-crop-slot]").addEventListener("click", () => {
    const cropSource = selectedFile ? { url: selectedUrl, name: selectedFile.name || `${slot.id}.jpg` } : image;
    if (!cropSource?.url) return;
    showCropToolModal(slot, cropSource, {
      saveLabel: selectedFile ? "אישור חיתוך" : "שמירה והחלפה",
      onSave: async (blob) => {
        const cropped = namedImageBlob(blob, cropFileName(selectedFile?.name, slot.id));
        if (selectedFile) {
          await setPendingFile(cropped);
          return true;
        }
        const uploaded = await uploadImageToSlot(slot.id, cropped, cropped.name || `${slot.id}-crop.jpg`);
        if (uploaded) cleanup();
        return uploaded;
      },
    });
  });
  modal.querySelector("[data-delete-current]").addEventListener("click", () => {
    if (!image) return;
    cleanup();
    confirmAction({
      title: "להסיר את התמונה?",
      body: `${slotDisplayLabel(slot)} תוסר מהאזור הזה לאחר גיבוי אם זו תמונת אתר חיה.`,
      confirmText: "הסרה",
      onConfirm: () => (image.source === "production" ? deleteAsset(image.slotId) : deleteImage(image.id)),
    });
  });
  modal.querySelector("[data-restore-current]").addEventListener("click", () => {
    if (!canRestore) return;
    cleanup();
    confirmAction({
      title: "לשחזר את התמונה הקודמת?",
      body: `${slotDisplayLabel(slot)} יוחזר מהגיבוי האחרון. התמונה הנוכחית תגובה לפני השחזור.`,
      confirmText: "שחזור",
      onConfirm: () => restoreAsset(slotId),
    });
  });
}

function renderBackupStatus(image) {
  if (!image || image.source !== "production") return "";
  const backupCount = Number(image.backupCount || 0);
  if (backupCount > 0) {
    const latest = formatHebrewDateTime(image.latestBackupAt);
    return `
      <div class="backup-status ready">
        <i data-lucide="rotate-ccw"></i>
        <span>${latest ? `גיבוי אחרון: ${escapeHtml(latest)}` : "יש גיבוי זמין לשחזור"}</span>
        <strong>${backupCount} ${backupCount === 1 ? "גיבוי" : "גיבויים"}</strong>
      </div>
    `;
  }
  return `
    <div class="backup-status muted">
      <i data-lucide="shield-check"></i>
      <span>שחזור יהיה זמין אחרי ההחלפה הראשונה של התמונה.</span>
    </div>
  `;
}

function showCropToolModal(slot, image, options = {}) {
  const modal = document.createElement("div");
  const aspect = ratioToAspect(slot.ratio);
  const saveLabel = options.saveLabel || "שמירה והחלפה";
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="crop-modal" role="dialog" aria-modal="true" aria-label="כלי חיתוך">
      <button class="icon-action modal-close" type="button" aria-label="סגירה"><i data-lucide="x"></i></button>
      <div class="panel-title">
        <h2>חיתוך תמונה</h2>
        <span class="quiet">${escapeHtml(slotDisplayLabel(slot))}</span>
      </div>
      <div class="crop-stage" style="--crop-ratio:${aspect};">
        <img src="${escapeAttr(image.url)}" alt="${escapeAttr(image.name)}" data-crop-image />
        <span class="crop-frame"></span>
      </div>
      <div class="crop-controls">
        <label>זום<input type="range" min="1" max="3" step="0.05" value="1" data-crop-zoom /></label>
        <label>ימין / שמאל<input type="range" min="-50" max="50" step="1" value="0" data-crop-x /></label>
        <label>למעלה / למטה<input type="range" min="-50" max="50" step="1" value="0" data-crop-y /></label>
      </div>
      <div class="modal-actions">
        <button class="ghost-button" type="button" data-cancel>ביטול</button>
        <button class="primary-button" type="button" data-save-crop><i data-lucide="crop"></i>${escapeHtml(saveLabel)}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  icons();
  const imageNode = modal.querySelector("[data-crop-image]");
  const updateCropPreview = () => {
    const zoom = Number(modal.querySelector("[data-crop-zoom]").value);
    const x = Number(modal.querySelector("[data-crop-x]").value);
    const y = Number(modal.querySelector("[data-crop-y]").value);
    imageNode.style.transform = `translate(${x * 0.45}%, ${y * 0.45}%) scale(${zoom})`;
  };
  modal.querySelectorAll("[data-crop-zoom], [data-crop-x], [data-crop-y]").forEach((input) => input.addEventListener("input", updateCropPreview));
  modal.querySelector(".modal-close").addEventListener("click", () => modal.remove());
  modal.querySelector("[data-cancel]").addEventListener("click", () => modal.remove());
  modal.querySelector("[data-save-crop]").addEventListener("click", async () => {
    try {
      await waitForImageLoad(imageNode);
      const blob = await cropImageToBlob(imageNode, {
        aspect,
        zoom: Number(modal.querySelector("[data-crop-zoom]").value),
        x: Number(modal.querySelector("[data-crop-x]").value),
        y: Number(modal.querySelector("[data-crop-y]").value),
      });
      const saved = options.onSave ? await options.onSave(blob) : await uploadImageToSlot(slot.id, blob, `${slot.id}-crop.jpg`);
      if (saved !== false) modal.remove();
    } catch (error) {
      toast("לא ניתן לחתוך את התמונה הזו כרגע", "error");
    }
  });
}

function waitForImageLoad(imageNode) {
  if (imageNode.complete && imageNode.naturalWidth) return Promise.resolve();
  return new Promise((resolve, reject) => {
    imageNode.addEventListener("load", resolve, { once: true });
    imageNode.addEventListener("error", () => reject(new Error("Image failed to load")), { once: true });
  });
}

function ratioToAspect(ratio) {
  const match = String(ratio || "").match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!match) return 1;
  return Number(match[1]) / Number(match[2]);
}

function readImageMetadata(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Image metadata failed"));
    img.src = src;
  });
}

async function appendImageMetadata(form, file) {
  if (!(file instanceof Blob) || form.has("width") || form.has("height")) return;
  const src = URL.createObjectURL(file);
  try {
    const metadata = await readImageMetadata(src);
    form.set("width", String(metadata.width));
    form.set("height", String(metadata.height));
  } catch (error) {
    // Metadata is helpful but should not block an upload.
  } finally {
    URL.revokeObjectURL(src);
  }
}

function recommendedImageSize(slot) {
  const aspect = ratioToAspect(slot.ratio);
  if (slot.ratio === "free") return { width: 1200, height: 800, free: true };
  if (Math.abs(aspect - 1) < 0.05) return { width: 900, height: 900 };
  const width = aspect > 1 ? 1400 : 900;
  return { width, height: Math.round(width / aspect) };
}

function recommendedSizeText(slot) {
  const recommended = recommendedImageSize(slot || {});
  return recommended.free ? `${recommended.width}+` : `${recommended.width}×${recommended.height}+`;
}

function imageDimensionText(image) {
  const width = Number(image?.width || 0);
  const height = Number(image?.height || 0);
  return width > 0 && height > 0 ? `${width}×${height}` : "";
}

function imageQualityChips(image, slot) {
  const dimension = imageDimensionText(image);
  return `
    <span class="image-meta-chips">
      ${dimension ? `<small><i data-lucide="ruler"></i>${escapeHtml(dimension)}</small>` : ""}
      <small><i data-lucide="scan"></i>מומלץ ${escapeHtml(recommendedSizeText(slot))}</small>
    </span>
  `;
}

function renderQualityReport(slot, file, metadata) {
  const recommended = recommendedImageSize(slot);
  const tooSmall = metadata.width < recommended.width || metadata.height < recommended.height;
  const tooHeavy = file.size > 5 * 1024 * 1024;
  const status = tooSmall || tooHeavy ? "warn" : "ok";
  const statusText = tooSmall
    ? "התמונה קטנה מהמומלץ, אפשר להמשיך אבל ייתכן שתיראה פחות חדה באתר."
    : tooHeavy
      ? "הקובץ כבד. אפשר להמשיך, אבל העלאה ותצוגה באתר עלולות להיות איטיות יותר."
      : "התמונה נראית מתאימה להעלאה.";
  return `
    <div class="quality-status ${status}">
      <i data-lucide="${status === "ok" ? "badge-check" : "triangle-alert"}"></i>
      <span>${escapeHtml(statusText)}</span>
    </div>
    <div class="quality-grid">
      <span><strong>${metadata.width}×${metadata.height}</strong><small>גודל תמונה</small></span>
      <span><strong>${formatFileSize(file.size)}</strong><small>משקל קובץ</small></span>
      <span><strong>${recommended.free ? `מומלץ ${recommended.width}+` : `${recommended.width}×${recommended.height}+`}</strong><small>${escapeHtml(slotRatioLabel(slot.ratio) || "יחס חופשי")}</small></span>
    </div>
  `;
}

function formatFileSize(bytes = 0) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)}MB`;
}

function formatHebrewDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function cropFileName(originalName, slotId) {
  const base = String(originalName || slotId || "image").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${base || slotId || "image"}-crop.jpg`;
}

function namedImageBlob(blob, name) {
  try {
    return new File([blob], name, { type: blob.type || "image/jpeg" });
  } catch (error) {
    blob.name = name;
    return blob;
  }
}

function cropImageToBlob(imageNode, options) {
  return new Promise((resolve, reject) => {
    const naturalWidth = imageNode.naturalWidth;
    const naturalHeight = imageNode.naturalHeight;
    if (!naturalWidth || !naturalHeight) {
      reject(new Error("Image is not ready"));
      return;
    }
    const aspect = options.aspect || 1;
    let cropWidth = naturalWidth;
    let cropHeight = cropWidth / aspect;
    if (cropHeight > naturalHeight) {
      cropHeight = naturalHeight;
      cropWidth = cropHeight * aspect;
    }
    cropWidth /= options.zoom || 1;
    cropHeight /= options.zoom || 1;
    const maxX = Math.max(0, naturalWidth - cropWidth);
    const maxY = Math.max(0, naturalHeight - cropHeight);
    const sourceX = Math.min(maxX, Math.max(0, maxX / 2 + (options.x / 100) * (maxX / 2)));
    const sourceY = Math.min(maxY, Math.max(0, maxY / 2 + (options.y / 100) * (maxY / 2)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(cropWidth);
    canvas.height = Math.round(cropHeight);
    const context = canvas.getContext("2d");
    context.drawImage(imageNode, sourceX, sourceY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Crop failed"))), "image/jpeg", 0.92);
  });
}

async function updateSiteStatus(siteId, status) {
  const response = await api(`/api/sites/${siteId}/status`, { method: "POST", body: { status } });
  if (response?.error) return toast(formatApiError(response.error), "error");
  if (state.clientSite?.id === siteId) state.clientSite = response.site;
  toast(HEBREW_STATUS_META[status]?.label || "הסטטוס עודכן", "success");
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
  await Promise.all([loadClientAssets(), loadClientText()]);
}

async function loadClientAssets() {
  state.clientAssets = null;
  if (!state.clientSite?.id) return;
  const response = await api(`/api/sites/${state.clientSite.id}/assets`);
  if (!response?.error) {
    state.clientAssets = response;
  }
}

async function loadClientText() {
  state.clientText = null;
  if (!state.clientSite?.id) return;
  const response = await api(`/api/sites/${state.clientSite.id}/text`);
  if (!response?.error) {
    state.clientText = response;
  }
}

async function api(path, options = {}) {
  const request = { method: options.method || "GET", credentials: "same-origin", headers: {} };
  if (options.form) request.body = options.form;
  else if (options.body) {
    request.headers["Content-Type"] = "application/json";
    request.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(`${basePath}${path}`, request);
    if (response.status === 401 && !options.allow401) {
      state.me = null;
      const nextLogin = isAdminAreaRoute() ? "/admin-login" : "/login";
      navigate(nextLogin, true);
      if (nextLogin === "/admin-login") renderAdminLogin("נא להתחבר מחדש.");
      else renderLogin("נא להתחבר מחדש.");
      return {};
    }

    const contentType = response.headers.get("content-type") || "";
    let payload = {};
    if (contentType.includes("application/json")) {
      try {
        payload = await response.json();
      } catch (error) {
        return { error: "Unexpected server response" };
      }
    }

    if (response.status === 413) return { error: "Uploaded image is too large" };
    if (response.status === 415) return { error: payload.error || "Upload type not allowed" };
    if (response.status === 408 || response.status === 504) return { error: "Request timed out" };
    if (response.status === 429) return { error: "Too many requests" };
    if (response.status >= 500) return { error: "Server unavailable" };
    if (!response.ok && !options.allow401) return { error: payload.error || "Request failed" };
    return payload;
  } catch (error) {
    console.error("API request failed", path, error);
    return { error: "Network request failed" };
  }
}

function bindShell() {
  document.querySelector("#logoutButton").addEventListener("click", async () => {
    const logoutRoute = state.me?.role === "admin" ? "/admin-login" : "/login";
    await api("/api/auth/logout", { method: "POST" });
    state.me = null;
    navigate(logoutRoute, true);
    if (logoutRoute === "/admin-login") renderAdminLogin();
    else renderLogin();
  });
}

function confirmAction({ title, body, confirmText, onConfirm }) {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="confirm-modal" role="dialog" aria-modal="true" aria-label="${escapeAttr(title)}">
      <button class="icon-action modal-close" type="button" aria-label="סגירה"><i data-lucide="x"></i></button>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(body)}</p>
      <div class="modal-actions">
        <button class="ghost-button" type="button" data-cancel>ביטול</button>
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
    <div class="confirm-modal credential-modal" role="dialog" aria-modal="true" aria-label="סיסמה זמנית" dir="rtl" lang="he">
      <button class="icon-action modal-close" type="button" aria-label="סגירה"><i data-lucide="x"></i></button>
      <h2>סיסמה זמנית</h2>
      <p><bdi>${escapeHtml(user.username)}</bdi> יכול להתחבר עכשיו עם הסיסמה הזו. היא לא תוצג שוב.</p>
      <div class="secret-box">
        <input value="${escapeAttr(temporaryPassword)}" readonly dir="ltr" />
        <button class="ghost-button" type="button" data-copy-temp><i data-lucide="copy"></i>העתקה</button>
      </div>
      <div class="modal-actions">
        <button class="primary-button" type="button" data-done>סיום</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  icons();
  const close = () => modal.remove();
  modal.querySelector(".modal-close").addEventListener("click", close);
  modal.querySelector("[data-done]").addEventListener("click", close);
  modal.querySelector("[data-copy-temp]").addEventListener("click", () => copyText(temporaryPassword, "סיסמה זמנית"));
  modal.querySelector("input").select();
}

function showCredentialShareModal(user, channel) {
  const channelLabel = channel === "whatsapp" ? "WhatsApp" : "Gmail";
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="confirm-modal credential-modal share-password-modal" role="dialog" aria-modal="true" aria-label="שיתוף פרטי התחברות" dir="rtl" lang="he">
      <button class="icon-action modal-close" type="button" aria-label="סגירה"><i data-lucide="x"></i></button>
      <h2>שיתוף פרטי התחברות</h2>
      <p>הכניסו את סיסמת הלקוח כדי לצרף אותה להודעת ${escapeHtml(channelLabel)}. לפני הפתיחה תידרש עוד בדיקת אישור.</p>
      <label>סיסמה לשיתוף
        <input name="sharePassword" type="password" autocomplete="off" minlength="1" dir="ltr" required />
      </label>
      <div class="credential-preview">
        <span>שם משתמש</span>
        <strong dir="ltr">${escapeHtml(user.username)}</strong>
        <span>נתיב</span>
        <strong dir="ltr">${escapeHtml(href(`/client/${user.username}`))}</strong>
      </div>
      <div class="modal-actions">
        <button class="ghost-button" type="button" data-cancel>ביטול</button>
        <button class="primary-button" type="button" data-confirm-share><i data-lucide="${channel === "whatsapp" ? "message-circle" : "mail"}"></i>פתיחת ${escapeHtml(channelLabel)}</button>
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
      toast("חובה להזין סיסמה", "error");
      return;
    }
    const confirmed = window.confirm(`לפתוח את ${channelLabel} עם פרטי ההתחברות של ${user.username}?`);
    if (!confirmed) return;
    openCredentialShareTarget(user, channel, password);
    close();
  });
  modal.querySelector("input[name='sharePassword']").focus();
}

function openCredentialShareTarget(user, channel, password) {
  const site = state.sites.find((item) => item.id === user.siteId) || {};
  const loginUrl = buildPrefilledLoginUrl(user.username, password);
  const greeting = user.username === "miryam_zelig" ? "שלום מרים," : "שלום,";
  const message = [
    greeting,
    "",
    "פרטי הכניסה שלך למערכת ניהול האתר:",
    `קישור כניסה: ${loginUrl}`,
    "",
    `שם משתמש: ${user.username}`,
    `סיסמה: ${password}`,
    "",
    ...(site.websiteUrl ? [`האתר שלך: ${site.websiteUrl}`] : []),
    "",
    "נא לשמור את הפרטים האלה באופן פרטי ולא להעביר אותם הלאה.",
  ]
    .join("\n");
  const encodedMessage = encodeURIComponent(message);
  const url =
    channel === "whatsapp"
      ? `https://wa.me/?text=${encodedMessage}`
      : `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent("פרטי כניסה למערכת ניהול האתר")}&body=${encodedMessage}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function buildPrefilledLoginUrl(username, password) {
  const payload = encodeBase64Url(JSON.stringify({ username, password }));
  return `${location.origin}${basePath}/login#credentials=${encodeURIComponent(payload)}`;
}

function readLoginPrefill() {
  const fallback = { username: "", password: "", fromUrl: false };
  const hash = location.hash || "";
  if (!hash.startsWith("#credentials=")) return fallback;
  try {
    const encoded = hash.slice("#credentials=".length);
    const parsed = JSON.parse(decodeBase64Url(decodeURIComponent(encoded)));
    return {
      username: String(parsed.username || ""),
      password: String(parsed.password || ""),
      fromUrl: true,
    };
  } catch (error) {
    return fallback;
  }
}

function encodeBase64Url(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function clearLoginPrefillFromUrl(prefill) {
  if (!prefill?.fromUrl) return;
  history.replaceState(null, "", `${location.origin}${basePath}/login`);
}

async function copyText(value, label = "Value") {
  try {
    await navigator.clipboard.writeText(value);
    toast(`${label} הועתק`, "success");
  } catch (error) {
    toast("ההעתקה נכשלה", "error");
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
  return slotDisplayLabel(displaySlots(site).find((slot) => slot.id === slotId) || { id: slotId });
}

function textSlotLabel(slotId) {
  const slot = (state.clientText?.textSlots || []).find((item) => item.id === slotId);
  return slot?.label || slotId;
}

function textSlotAuditLabel(slotId) {
  const labels = {
    "about.title": "כותרת אודות",
    "about.body": "טקסט אודות",
    "faq.1.question": "שאלה 1",
    "faq.1.answer": "תשובה 1",
    "faq.2.question": "שאלה 2",
    "faq.2.answer": "תשובה 2",
    "faq.3.question": "שאלה 3",
    "faq.3.answer": "תשובה 3",
    "faq.4.question": "שאלה 4",
    "faq.4.answer": "תשובה 4",
    "faq.5.question": "שאלה 5",
    "faq.5.answer": "תשובה 5",
  };
  return labels[slotId] || slotId;
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

function isAdminAreaRoute() {
  const path = stripBase(location.pathname);
  return path === "/admin" || path === "/admin-login";
}

function renderForbidden() {
  setDocumentLocale("he", "rtl");
  app.className = "login-view login-rtl";
  app.innerHTML = `<main class="forbidden" dir="rtl" lang="he"><h1>אין גישה</h1><p>הנתיב הזה לא משויך לחשבון שלך.</p></main>`;
  markBootReady();
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
  const configuredBase = document.querySelector("meta[name='manager-site-base']")?.getAttribute("content");
  if (configuredBase) return configuredBase.replace(/\/+$/, "");
  const scriptPath = document.currentScript?.src ? new URL(document.currentScript.src).pathname : "";
  return scriptPath.replace(/\/app\.js$/, "");
}

function markBootReady() {
  if (window.ManagerSiteBoot?.markReady) window.ManagerSiteBoot.markReady();
}

function toast(message, type = "info") {
  let node = document.querySelector(".toast");
  if (!node) {
    node = document.createElement("div");
    node.className = "toast";
    node.innerHTML = `
      <span class="toast-icon" aria-hidden="true"></span>
      <span class="toast-copy">
        <span class="toast-title"></span>
        <span class="toast-message"></span>
      </span>
    `;
    document.body.appendChild(node);
  }
  const normalizedType = ["success", "error", "info"].includes(type) ? type : "info";
  const icon = normalizedType === "success" ? "check" : normalizedType === "error" ? "triangle-alert" : "info";
  const title = normalizedType === "success" ? "בוצע" : normalizedType === "error" ? "צריך בדיקה" : "שימו לב";
  node.dataset.type = normalizedType;
  node.setAttribute("role", normalizedType === "error" ? "alert" : "status");
  node.setAttribute("aria-live", normalizedType === "error" ? "assertive" : "polite");
  node.querySelector(".toast-icon").innerHTML = `<i data-lucide="${icon}"></i>`;
  node.querySelector(".toast-title").textContent = title;
  node.querySelector(".toast-message").textContent = message;
  node.classList.add("show");
  icons();
  clearTimeout(toast.timeout);
  toast.timeout = setTimeout(() => node.classList.remove("show"), normalizedType === "error" ? 5600 : 3600);
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
