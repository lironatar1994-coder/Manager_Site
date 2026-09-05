const linkWorkspace = { siteId: null, data: null, loading: false, error: "", from: "", to: "", search: "", status: "current", sort: "clicks", page: 1, selected: null, request: 0 };
const LINK_STATUS = { active: "פעיל", disabled: "מושבת", archived: "בארכיון" };

function linkDay(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function linkShortDate(value) {
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year.slice(-2)}`;
}

async function openClientLinks() {
  if (!state.clientSite) return renderForbidden();
  if (linkWorkspace.siteId !== state.clientSite.id) {
    Object.assign(linkWorkspace, { siteId: state.clientSite.id, data: null, selected: null, search: "", status: "current", page: 1,
      from: linkDay(new Date(Date.now() - 29 * 86400000)), to: linkDay(new Date()) });
  }
  await refreshClientLinks();
}

function linksPageIsCurrent(siteId = linkWorkspace.siteId) {
  return state.me && state.clientSite?.id === siteId && stripBase(location.pathname) === `/client/${state.clientUsername}/links`;
}

async function refreshClientLinks() {
  const request = ++linkWorkspace.request;
  const siteId = linkWorkspace.siteId;
  linkWorkspace.loading = true;
  linkWorkspace.error = "";
  renderClientLinks();
  const query = new URLSearchParams({ from: linkWorkspace.from, to: linkWorkspace.to });
  const response = await api(`/api/sites/${siteId}/links?${query}`);
  if (request !== linkWorkspace.request || !linksPageIsCurrent(siteId)) return;
  linkWorkspace.loading = false;
  if (response.error || !response.links) linkWorkspace.error = linkError(response.error);
  else linkWorkspace.data = response;
  renderClientLinks();
}

function linkError(error) {
  return /[\u0590-\u05ff]/.test(error || "") ? error : "לא ניתן להשלים את הפעולה כרגע. נסו שוב.";
}

function linkFullUrl(link) { return new URL(link.path, location.origin).href; }
function linkBadge(link) { return `<span class="link-status link-status-${escapeAttr(link.status)}">${LINK_STATUS[link.status] || "לא ידוע"}</span>`; }
function linkMetric(label, value, note, kind = "") {
  return `<article class="link-metric ${kind}"><span>${label}</span><strong>${formatTrafficNumber(value)}</strong><small>${note}</small></article>`;
}

function renderClientLinks() {
  if (!linksPageIsCurrent()) return;
  setDocumentLocale("he", "rtl");
  const ws = linkWorkspace;
  const data = ws.data;
  const all = data?.links || [];
  const selected = all.find((item) => item.id === ws.selected);
  const filtered = all.filter((item) => (ws.status === "all" || (ws.status === "current" ? item.status !== "archived" : item.status === ws.status)) &&
    `${item.name} ${item.description} ${item.targetUrl}`.toLocaleLowerCase().includes(ws.search.toLocaleLowerCase()));
  filtered.sort((a, b) => ws.sort === "name" ? a.name.localeCompare(b.name, "he") : ws.sort === "newest" ? b.createdAt.localeCompare(a.createdAt) :
    ws.sort === "unique" ? b.stats.unique - a.stats.unique : b.stats.clicks - a.stats.clicks);
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  ws.page = Math.min(ws.page, pages);
  const shown = filtered.slice((ws.page - 1) * 10, ws.page * 10);
  app.className = `app-view client-mode client-rtl traffic-mode links-mode ${state.me.role === "admin" ? "admin-preview" : ""}`;
  app.innerHTML = `${shell("links")}
    <main class="workspace client-traffic-workspace links-workspace ${selected ? "has-link-detail" : ""}" dir="rtl" lang="he">
      ${state.me.role === "admin" ? `<section class="preview-banner traffic-preview-banner"><span>תצוגת מנהל עבור <bdi>${escapeHtml(state.clientUsername)}</bdi></span><a href="${href("/admin")}">חזרה לניהול</a></section>` : ""}
      <header class="traffic-page-head">
        <div class="traffic-title-block"><span class="traffic-kicker">כל שיתוף הוא הזדמנות</span><h1>הלינקים שלך.</h1><p>לכל פרסום כתובת משלו. כאן רואים מאיפה מגיעות הכניסות.</p></div>
        <nav class="client-area-switcher" aria-label="אזור הלקוח">
          <a href="${href(`/client/${state.clientUsername}`)}"><i data-lucide="images"></i><span>עריכת האתר</span></a>
          <a href="${href(`/client/${state.clientUsername}/visitors`)}"><i data-lucide="users-round"></i><span>מבקרים</span></a>
          <a class="active" href="${href(`/client/${state.clientUsername}/links`)}" aria-current="page"><i data-lucide="link"></i><span>לינקים</span></a>
        </nav>
      </header>
      <div class="links-mobile-tools"><button type="button" data-links-theme aria-label="${storedTheme() === "dark" ? "מעבר למצב בהיר" : "מעבר למצב כהה"}"><i data-lucide="${storedTheme() === "dark" ? "sun" : "moon"}"></i>${storedTheme() === "dark" ? "מצב בהיר" : "מצב כהה"}</button><button type="button" data-client-logout><i data-lucide="log-out"></i>יציאה</button></div>
      <section class="links-intro"><div><h2>מה משתפים היום?</h2></div>
        ${can("canManageTrackingLinks") ? '<button class="link-primary" type="button" data-link-create><i data-lucide="plus"></i>יצירת לינק</button>' : '<span class="links-readonly"><i data-lucide="lock"></i>הרשאת צפייה בנתונים</span>'}</section>
      <details class="report-controls"><summary><i data-lucide="calendar-days"></i><span>טווח הנתונים</span><bdi>${escapeHtml(linkShortDate(ws.from))}–${escapeHtml(linkShortDate(ws.to))}</bdi></summary><form class="links-dates" id="linksDates"><label>מתאריך<input type="date" name="from" value="${escapeAttr(ws.from)}" required></label><label>עד תאריך<input type="date" name="to" value="${escapeAttr(ws.to)}" required></label><button type="submit" ${ws.loading ? "disabled" : ""}>הצגת נתונים</button><button type="button" data-links-month ${ws.loading ? "disabled" : ""}>30 ימים אחרונים</button><small>תאריכים ושעות לפי שעון ישראל</small></form></details>
      ${ws.error ? `<div class="links-error" role="alert">${escapeHtml(ws.error)} ${data ? "הנתונים המוצגים הם מהטעינה הקודמת." : ""}<button type="button" data-links-retry>ניסיון נוסף</button></div>` : ""}
      ${ws.loading ? '<p class="links-loading" role="status">טוענים נתוני לינקים…</p>' : ""}
      ${data ? `<div class="links-summary" aria-label="סיכום כל הלינקים בטווח המוצג">
        ${linkMetric("פתיחות לינק", data.summary.clicks, "ללא בוטים מזוהים")}
        ${linkMetric("מבקרים משוערים", data.summary.unique, "אומדן לפי IP, ללא בוטים מזוהים")}
        ${linkMetric("פתיחות אוטומטיות", data.summary.bots, "בוטים ותצוגות מקדימות", "link-metric-bots")}
        ${linkMetric("לינקים פעילים", all.filter((item) => item.status === "active").length, `מתוך ${formatTrafficNumber(all.length)} לינקים בסך הכול`)}
      </div><p class="links-data-note">סיכום כל הלינקים, כולל הארכיון · <bdi>${escapeHtml(data.range.from)} — ${escapeHtml(data.range.to)}</bdi>. הסינון והחיפוש בהמשך חלים על הרשימה בלבד.</p>
      <section class="links-list-panel" aria-labelledby="linksListTitle"><header><div><h2 id="linksListTitle">כל הלינקים</h2></div><span>${formatTrafficNumber(filtered.length)}</span></header>
        <form id="linksFilters" class="links-filters"><label class="links-search">חיפוש<input type="search" name="search" placeholder="שם לינק או תיאור…" value="${escapeAttr(ws.search)}"></label><label>הצגה<select name="status">${[["current", "פעילים ומושבתים"], ["active", "פעילים"], ["disabled", "מושבתים"], ["archived", "ארכיון"], ["all", "כל הלינקים"]].map(([value, label]) => `<option value="${value}" ${ws.status === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><label>מיון<select name="sort">${[["clicks", "הכי הרבה פתיחות"], ["unique", "הכי הרבה מבקרים"], ["newest", "החדשים ביותר"], ["name", "לפי שם"]].map(([value, label]) => `<option value="${value}" ${ws.sort === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><button type="submit">סינון</button></form>
        ${shown.length ? `<div class="links-table-head" aria-hidden="true"><span>לינק / יעד</span><span>פתיחות</span><span>מבקרים משוערים</span><span>אוטומטיות</span><span>פעולות</span></div><div class="links-rows">${shown.map(renderLinkRow).join("")}</div>` : `<div class="links-empty"><i data-lucide="link"></i><h3>${all.length ? "אין לינקים שמתאימים לסינון" : "הלינק הראשון הוא התחלה טובה"}</h3><p>${all.length ? "אפשר לשנות את החיפוש או לבחור מצב אחר." : "תנו לו שם כמו ׳סטורי באינסטגרם׳ ובחרו לאיזה עמוד באתר הוא מוביל."}</p>${!all.length && can("canManageTrackingLinks") ? '<button class="link-primary" type="button" data-link-create>יצירת הלינק הראשון</button>' : ""}</div>`}
        ${pages > 1 ? `<nav class="links-pagination" aria-label="עמודי לינקים"><button type="button" data-links-page="${ws.page - 1}" ${ws.page === 1 ? "disabled" : ""}>הקודם</button><span>עמוד ${ws.page} מתוך ${pages}</span><button type="button" data-links-page="${ws.page + 1}" ${ws.page === pages ? "disabled" : ""}>הבא</button></nav>` : ""}
      </section>
      ${selected ? renderLinkDetail(selected) : all.length ? '<p class="links-detail-hint">בחרו ״נתונים״ לצד לינק כדי לראות את הגרף, המקורות והיסטוריית השינויים שלו.</p>' : ""}` : ""}
      <aside class="links-explainer"><i data-lucide="info"></i><p><strong>מה המספרים מספרים?</strong> פתיחת לינק נמדדת בעת ההפניה לאתר, ואינה אישור שהעמוד נטען. אומדן המבקרים מבוסס על כתובות IP ואינו מספר אנשים מאומתים. בוטים מזוהים ותצוגות מקדימות מופרדים, אך הזיהוי אינו מלא. מקור ההגעה מוצג רק כשהדפדפן מוסר אותו.</p></aside>
    </main>`;
  bindShell();
  app.querySelector('[data-links-back]')?.addEventListener('click', () => { ws.selected = null; renderClientLinks(); window.scrollTo({ top: 0 }); });
  app.querySelector("[data-links-theme]")?.addEventListener("click", () => { applyTheme(storedTheme() === "dark" ? "light" : "dark"); renderClientLinks(); });
  interceptInternalLinks();
  icons();
  markBootReady();
  app.querySelectorAll("[data-link-create]").forEach((button) => button.addEventListener("click", () => editTrackingLink()));
  app.querySelector("#linksDates")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const from = values.get("from"), to = values.get("to");
    if (from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 365) return toast("יש לבחור טווח תקין של עד 366 ימים.", "error");
    ws.from = from; ws.to = to;
    await refreshClientLinks();
  });
  app.querySelector("[data-links-month]")?.addEventListener("click", () => {
    ws.from = linkDay(new Date(Date.now() - 29 * 86400000)); ws.to = linkDay(new Date()); refreshClientLinks();
  });
  app.querySelector("[data-links-retry]")?.addEventListener("click", refreshClientLinks);
  app.querySelector("#linksFilters")?.addEventListener("submit", (event) => {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    ws.search = String(values.get("search") || "").trim(); ws.status = values.get("status"); ws.sort = values.get("sort"); ws.page = 1;
    renderClientLinks();
  });
  app.querySelectorAll("[data-links-page]").forEach((button) => button.addEventListener("click", () => { ws.page = Number(button.dataset.linksPage); renderClientLinks(); }));
  app.querySelectorAll("[data-link-details]").forEach((button) => button.addEventListener("click", () => {
    ws.selected = button.dataset.linkDetails; renderClientLinks();
    document.getElementById("linkDetailTitle")?.focus({ preventScroll: true });
    document.getElementById("linkDetail")?.scrollIntoView({ block: "start" });
  }));
  app.querySelectorAll("[data-link-copy]").forEach((button) => button.addEventListener("click", () => copyTrackingLink(all.find((link) => link.id === button.dataset.linkCopy))));
  app.querySelectorAll("[data-link-edit]").forEach((button) => button.addEventListener("click", () => editTrackingLink(all.find((link) => link.id === button.dataset.linkEdit))));
}

function renderLinkRow(link) {
  return `<article class="link-row ${linkWorkspace.selected === link.id ? "is-selected" : ""}" aria-label="${escapeAttr(link.name)}">
    <div class="link-row-identity"><div><h3>${escapeHtml(link.name)}</h3>${linkBadge(link)}</div><bdi class="link-url" title="${escapeAttr(linkFullUrl(link))}">${escapeHtml(linkFullUrl(link))}</bdi><small class="link-destination">יעד: <bdi title="${escapeAttr(link.targetUrl)}">${escapeHtml(link.targetUrl)}</bdi></small></div>
    <div class="link-row-number"><span>פתיחות</span><strong>${formatTrafficNumber(link.stats.clicks)}</strong></div>
    <div class="link-row-number"><span>מבקרים משוערים</span><strong>${formatTrafficNumber(link.stats.unique)}</strong></div>
    <div class="link-row-number link-bot-count"><span>אוטומטיות</span><strong>${formatTrafficNumber(link.stats.bots)}</strong></div>
    <div class="link-row-actions"><button type="button" data-link-details="${link.id}" aria-label="נתונים עבור ${escapeAttr(link.name)}"><i data-lucide="chart-no-axes-combined"></i>נתונים</button><button type="button" data-link-copy="${link.id}" aria-label="העתקת ${escapeAttr(link.name)}"><i data-lucide="copy"></i>העתקה</button>${can("canManageTrackingLinks") ? `<button type="button" data-link-edit="${link.id}" aria-label="עריכת ${escapeAttr(link.name)}"><i data-lucide="pencil"></i>עריכה</button>` : ""}</div>
  </article>`;
}

function renderLinkChart(series) {
  const max = Math.max(1, ...series.map((item) => item.clicks));
  const ticks = [...new Set([0, Math.ceil(max / 2), max])];
  const step = 880 / Math.max(1, series.length);
  return `<figure class="links-chart"><figcaption>פתיחות לאורך זמן <small>ללא בוטים מזוהים · לפי ימים</small></figcaption>
    <svg viewBox="0 0 960 250" role="img" aria-label="גרף פתיחות יומיות. פירוט נגיש בטבלה שמתחת לגרף.">
      ${ticks.map((value) => `<line x1="45" x2="940" y1="${205 - value / max * 175}" y2="${205 - value / max * 175}"/><text x="35" y="${210 - value / max * 175}" text-anchor="end">${value}</text>`).join("")}
      ${series.map((item, i) => `<rect x="${50 + i * step}" y="${205 - item.clicks / max * 175}" width="${Math.max(1, step * 0.65)}" height="${item.clicks / max * 175}" rx="2"><title>${item.day}: ${item.clicks} פתיחות</title></rect>`).join("")}
      <text x="50" y="237" text-anchor="start">${escapeHtml(series[0]?.day || "")}</text><text x="935" y="237" text-anchor="end">${escapeHtml(series.at(-1)?.day || "")}</text>
    </svg>
    <details class="links-chart-data"><summary>טבלת נתונים יומית</summary><div><table><caption>פתיחות לפי יום</caption><thead><tr><th scope="col">תאריך</th><th scope="col">פתיחות</th><th scope="col">אוטומטיות</th></tr></thead><tbody>${series.map((item) => `<tr><th scope="row"><bdi>${item.day}</bdi></th><td>${item.clicks}</td><td>${item.bots}</td></tr>`).join("")}</tbody></table></div></details>
  </figure>`;
}

function linkBreakdown(title, rows, devices = false) {
  return `<section class="links-breakdown"><h3>${title}</h3>${rows.length ? `<ol>${rows.map((item) => `<li><span>${escapeHtml(devices ? trafficDeviceLabel(item.label) : item.label === "direct" ? "ישיר / מקור לא זמין" : item.label)}</span><strong>${formatTrafficNumber(item.count)}</strong></li>`).join("")}</ol>` : '<p>אין פתיחות בטווח הזה.</p>'}</section>`;
}

function renderLinkDetail(link) {
  const fieldLabels = { name: "שם", description: "תיאור", targetUrl: "יעד", status: "מצב" };
  const historyValue = (field, value) => escapeHtml(field === "status" ? LINK_STATUS[value] || value : value || "ללא");
  return `<section class="links-detail" id="linkDetail" aria-labelledby="linkDetailTitle"><button class="links-back" type="button" data-links-back><i data-lucide="arrow-right"></i>כל הלינקים</button><header><div><span class="traffic-kicker">ביצועי הלינק</span><h2 id="linkDetailTitle" tabindex="-1">${escapeHtml(link.name)}</h2></div>${linkBadge(link)}</header>
    ${link.description ? `<p class="links-description">${escapeHtml(link.description)}</p>` : ""}
    <div class="links-detail-url"><label>הלינק לשיתוף<input readonly dir="ltr" value="${escapeAttr(linkFullUrl(link))}"></label><button type="button" data-link-copy="${link.id}">העתקת הלינק</button>${can("canManageTrackingLinks") ? `<button type="button" data-link-edit="${link.id}">עריכת הלינק</button>` : ""}</div>
    <p class="links-target">מוביל אל <bdi>${escapeHtml(link.targetUrl)}</bdi></p>
    <div class="links-summary links-detail-stats">${linkMetric("פתיחות", link.stats.clicks, "בטווח הנבחר")}${linkMetric("מבקרים משוערים", link.stats.unique, "לפי IP בטווח הנבחר")}${linkMetric("פתיחות אוטומטיות", link.stats.bots, "בוטים ותצוגות מקדימות", "link-metric-bots")}</div>
    <p class="links-last">פתיחה אחרונה ללא בוט מזוהה בטווח: <bdi>${formatTrafficDateTime(link.stats.lastAt)}</bdi></p>
    ${renderLinkChart(link.stats.series)}
    <div class="links-breakdowns">${linkBreakdown("מכשירים", link.stats.devices, true)}${linkBreakdown("מקורות הגעה", link.stats.referrers)}</div>
    <details class="links-history"><summary>היסטוריית שינויים · ${link.history.length}</summary><p>הנתונים נשמרים גם לאחר עריכה. שינוי יעד אינו מאפס את הספירה.</p><ol>${[...link.history].reverse().map((event) => `<li><div><strong>${event.action === "created" ? "הלינק נוצר" : "הלינק עודכן"}</strong><time>${formatTrafficDateTime(event.at)}</time><span>על ידי <bdi>${escapeHtml(event.actor)}</bdi></span></div>${event.action === "created" ? `<p>יעד מקורי: <bdi>${escapeHtml(event.targetUrl)}</bdi></p>` : Object.entries(event.changes).map(([field, change]) => `<p>${fieldLabels[field]}: <bdi>${historyValue(field, change.from)}</bdi> ← <bdi>${historyValue(field, change.to)}</bdi></p>`).join("")}</li>`).join("")}</ol></details>
  </section>`;
}

async function copyTrackingLink(link) {
  if (!link) return;
  const url = linkFullUrl(link);
  try { await navigator.clipboard.writeText(url); toast("הלינק הועתק. אפשר לשתף אותו.", "success"); }
  catch {
    const modal = document.createElement("div"); modal.className = "links-modal-backdrop";
    modal.innerHTML = `<section class="links-modal" role="dialog" aria-modal="true" aria-labelledby="copyLinkTitle" dir="rtl"><h2 id="copyLinkTitle">העתקת הלינק</h2><p>העתקה אוטומטית אינה זמינה בדפדפן הזה. אפשר להעתיק מהשדה:</p><label>הלינק לשיתוף<input dir="ltr" readonly value="${escapeAttr(url)}"></label><button type="button">סגירה</button></section>`;
    document.body.appendChild(modal); const close = createDialogController(modal);
    modal.querySelector("button").addEventListener("click", close);
    modal.querySelector("input").focus(); modal.querySelector("input").select();
  }
}

function editTrackingLink(link = null) {
  if (!can("canManageTrackingLinks")) return;
  const siteId = state.clientSite.id;
  const modal = document.createElement("div");
  modal.className = "links-modal-backdrop";
  modal.innerHTML = `<section class="links-modal" role="dialog" aria-modal="true" aria-labelledby="editLinkTitle" dir="rtl" lang="he">
    <header><div><span class="traffic-kicker">${link ? "עדכון פרטים" : "מקור תנועה חדש"}</span><h2 id="editLinkTitle">${link ? "עריכת לינק" : "יוצרים לינק למעקב"}</h2></div><button type="button" data-link-close aria-label="סגירה"><i data-lucide="x"></i></button></header>
    <form id="editLinkForm"><label>שם הלינק<input name="name" maxlength="100" value="${escapeAttr(link?.name || "")}" placeholder="למשל: סטורי באינסטגרם" required></label>
      <label>כתובת היעד באתר שלך<input name="targetUrl" type="url" dir="ltr" maxlength="2048" value="${escapeAttr(link?.targetUrl || state.clientSite.websiteUrl)}" required aria-describedby="linkTargetHint"></label><small id="linkTargetHint">אפשר להפנות לעמודים בתוך <bdi>${escapeHtml(state.clientSite.websiteUrl)}</bdi></small>
      <label>תיאור <span class="links-optional">(לא חובה)</span><textarea name="description" maxlength="500" rows="3" placeholder="מה פרסמתם ואיפה?">${escapeHtml(link?.description || "")}</textarea></label>
      ${link ? `<label>מצב הלינק<select name="status">${Object.entries(LINK_STATUS).map(([value, label]) => `<option value="${value}" ${link.status === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><p class="links-form-note">כתובת השיתוף והנתונים נשמרים לאחר עריכה. לינק מושבת או בארכיון לא יפנה לאתר; אפשר להפעיל אותו שוב כאן.</p>` : ""}
      <p class="links-form-error" role="alert" hidden></p><footer><button class="link-primary" type="submit">${link ? "שמירת שינויים" : "יצירת לינק"}</button><button type="button" data-link-close>ביטול</button></footer>
    </form></section>`;
  document.body.appendChild(modal);
  const close = createDialogController(modal);
  modal.querySelectorAll("[data-link-close]").forEach((button) => button.addEventListener("click", close));
  icons(); modal.querySelector('[name="name"]').focus();
  modal.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    if (submit.disabled) return;
    const body = Object.fromEntries(new FormData(form));
    submit.disabled = true; submit.textContent = "שומרים…";
    const result = await api(`/api/sites/${siteId}/links${link ? `/${link.id}` : ""}`, { method: link ? "PATCH" : "POST", body });
    if (!state.me) { close(); return; }
    if (!modal.isConnected) { if (linksPageIsCurrent(siteId)) await refreshClientLinks(); return; }
    if (result.error || !result.link) {
      const error = form.querySelector(".links-form-error"); error.hidden = false; error.textContent = linkError(result.error);
      submit.disabled = false; submit.textContent = link ? "שמירת שינויים" : "יצירת לינק";
      return;
    }
    close(); toast(link ? "השינויים נשמרו. כתובת השיתוף נשארה קבועה." : "הלינק נוצר ומוכן לשיתוף.", "success");
    if (linksPageIsCurrent(siteId)) {
      linkWorkspace.selected = result.link.id;
      await refreshClientLinks();
    }
  });
}
