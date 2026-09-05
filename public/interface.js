/* Shared application chrome and access screens. Uses existing auth and routing. */
function currentMark() {
  return '<span class="current-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
}

function applicationShell(active) {
  const admin = state.me?.role === "admin";
  const username = state.clientUsername || state.me?.username;
  const items = admin && active === "admin" ? [
    { label: "לקוחות", icon: "users-round", jump: "adminClients", active: true },
    { label: "פעילות", icon: "activity", jump: "adminActivity" },
    { label: "לקוח חדש", icon: "user-plus", create: true },
  ] : [
    { label: "האתר שלי", icon: "panels-top-left", path: `/client/${username}`, active: active === "client" },
    { label: "מבקרים", icon: "chart-no-axes-combined", path: `/client/${username}/visitors`, active: active === "visitors" },
    { label: "לינקים", icon: "link", path: `/client/${username}/links`, active: active === "links" },
  ];
  const navItem = (item) => item.path
    ? `<a class="app-nav-item ${item.active ? "active" : ""}" href="${href(item.path)}" ${item.active ? 'aria-current="page"' : ""}><i data-lucide="${item.icon}"></i><span>${item.label}</span></a>`
    : `<button class="app-nav-item ${item.active ? "active" : ""}" type="button" ${item.create ? "data-app-create" : `data-app-jump="${item.jump}"`}><i data-lucide="${item.icon}"></i><span>${item.label}</span></button>`;
  return `<a class="app-skip" href="#mainContent">דילוג לתוכן</a>
    <header class="mobile-app-bar"><div class="app-brand">${currentMark()}<span>האתר שלי<span class="app-brand-dot">.</span></span></div><button class="app-avatar" type="button" data-app-account aria-label="החשבון שלי">${escapeHtml((state.me?.displayName || username || "מ").slice(0, 1))}</button></header>
    <aside class="app-rail"><div class="app-brand">${currentMark()}<span>האתר שלי<span class="app-brand-dot">.</span></span></div><span class="app-rail-label">${admin ? "ניהול המערכת" : "סביבת העבודה"}</span><nav aria-label="ניווט ראשי">${items.map(navItem).join("")}${admin && active !== "admin" ? `<a class="app-nav-item" href="${href('/admin')}"><i data-lucide="arrow-right"></i><span>לניהול לקוחות</span></a>` : ""}</nav><div class="app-rail-foot"><div class="app-rail-note"><i data-lucide="shield-check"></i><span>המרחב הפרטי של האתר שלך</span></div>${themeToggle()}<button class="app-account-button" type="button" data-app-account><span class="app-avatar">${escapeHtml((state.me?.displayName || username || "מ").slice(0, 1))}</span><span><strong>${escapeHtml(state.me?.displayName || username)}</strong><small>${admin ? "מנהל מערכת" : "החשבון שלי"}</small></span><i data-lucide="chevron-left"></i></button></div></aside>
    <nav class="mobile-app-nav" aria-label="ניווט ראשי בנייד">${items.map(navItem).join("")}<button class="app-nav-item" type="button" data-app-account><i data-lucide="circle-user-round"></i><span>חשבון</span></button></nav>`;
}

function bindApplicationChrome() {
  const main = document.querySelector('main.workspace');
  if (main) { main.id = "mainContent"; main.tabIndex = -1; }
  document.querySelectorAll('[data-app-account]').forEach((button) => button.addEventListener('click', openAccountSheet));
  document.querySelectorAll('[data-app-jump]').forEach((button) => button.addEventListener('click', () => {
    setAdminNavigation(button.dataset.appJump);
    const target = document.getElementById(button.dataset.appJump);
    target?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    const heading = target?.querySelector('h2');
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  }));
  document.querySelectorAll('[data-app-create]').forEach((button) => button.addEventListener('click', () => document.getElementById('createUserTop')?.click()));
}

function setAdminNavigation(section) {
  document.querySelectorAll('[data-app-jump], [data-app-create]').forEach((item) => {
    const active = item.dataset.appJump === section || (section === 'create' && item.hasAttribute('data-app-create'));
    item.classList.toggle('active', active);
    if (active) item.setAttribute('aria-current', 'location'); else item.removeAttribute('aria-current');
  });
}

function openAccountSheet() {
  const modal = document.createElement('div');
  modal.className = 'account-backdrop';
  modal.innerHTML = `<section class="account-sheet" role="dialog" aria-modal="true" aria-labelledby="accountTitle" dir="rtl"><div class="sheet-handle" aria-hidden="true"></div><header><h2 id="accountTitle">החשבון שלי</h2><button class="icon-action" type="button" data-account-close aria-label="סגירה"><i data-lucide="x"></i></button></header><div class="account-identity"><span class="app-avatar">${escapeHtml((state.me.displayName || state.me.username).slice(0, 1))}</span><span><strong>${escapeHtml(state.me.displayName)}</strong><bdi>${escapeHtml(state.me.username)}</bdi></span></div><button class="account-setting" type="button" data-account-theme><i data-lucide="${storedTheme() === 'dark' ? 'sun' : 'moon'}"></i><span>${storedTheme() === 'dark' ? 'מעבר למצב בהיר' : 'מעבר למצב כהה'}</span><i data-lucide="chevron-left"></i></button>${state.me.role === 'admin' ? `<a class="account-setting" href="${href('/admin')}"><i data-lucide="users-round"></i><span>ניהול לקוחות</span><i data-lucide="chevron-left"></i></a>` : ''}<button class="account-setting account-logout" type="button" data-account-logout><i data-lucide="log-out"></i><span>יציאה מהחשבון</span></button></section>`;
  document.body.appendChild(modal);
  const close = createDialogController(modal);
  modal.querySelector('[data-account-close]').addEventListener('click', close);
  modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
  modal.querySelector('[data-account-theme]').addEventListener('click', () => {
    applyTheme(storedTheme() === 'dark' ? 'light' : 'dark');
    const toggle = document.getElementById('themeToggle');
    const dark = storedTheme() === 'dark';
    if (toggle) { toggle.setAttribute('aria-pressed', String(dark)); toggle.setAttribute('aria-label', dark ? 'מעבר למצב בהיר' : 'מעבר למצב כהה'); toggle.innerHTML = `<i data-lucide="${dark ? 'sun' : 'moon'}"></i><span>${dark ? 'מצב בהיר' : 'מצב כהה'}</span>`; }
    close(); icons();
  });
  modal.querySelector('[data-account-logout]').addEventListener('click', async () => {
    const admin = state.me.role === 'admin';
    const result = await api('/api/auth/logout', { method: 'POST' });
    if (result.error) { toast('לא ניתן לצאת כרגע. נסו שוב.', 'error'); return; }
    close(); state.me = null;
    navigate(admin ? '/admin-login' : '/login', true);
    if (admin) renderAdminLogin(); else renderLogin();
  });
  icons();
}

function renderAccessScreen(error = '', admin = false) {
  setDocumentLocale('he', 'rtl');
  const prefill = admin ? { username: '', password: '' } : readLoginPrefill();
  app.className = `access-view ${admin ? 'access-admin' : ''}`;
  app.innerHTML = `<main class="access-shell" dir="rtl" lang="he"><section class="access-panel"><header class="access-top">${themeToggle()}<div class="app-brand">${currentMark()}<span>האתר שלי<span class="app-brand-dot">.</span></span></div></header><div class="access-content"><span class="access-eyebrow"><i data-lucide="${admin ? 'shield-check' : 'sparkles'}"></i>${admin ? 'כניסה למנהלים' : 'המרחב של האתר שלך'}</span><h1>${admin ? 'הכול במקום אחד.' : 'האתר שלך.<br>בקצות האצבעות.'}</h1><p>${admin ? 'לקוחות, אתרים והרשאות. נכנסים ומתחילים.' : 'תמונות, תוכן ונתונים — כל מה שצריך כדי לשמור על אתר מעודכן.'}</p><form id="loginForm" class="access-form" ${admin ? 'data-admin-login="true"' : ''}><label for="accessUsername">שם משתמש${admin ? ' מנהל' : ''}</label><div class="access-input"><i data-lucide="user-round"></i><input id="accessUsername" name="username" value="${escapeAttr(prefill.username)}" autocomplete="username" placeholder="שם המשתמש שקיבלת" dir="ltr" required></div><label for="accessPassword">סיסמה</label><div class="access-input"><i data-lucide="lock-keyhole"></i><input id="accessPassword" name="password" type="password" value="${escapeAttr(prefill.password)}" autocomplete="current-password" dir="ltr" required><button type="button" data-show-password aria-label="הצגת הסיסמה" aria-pressed="false"><i data-lucide="eye"></i></button></div>${error ? `<p class="form-error" role="alert">${escapeHtml(error)}</p>` : ''}<button class="primary-button" type="submit"><span>${admin ? 'כניסה לניהול' : 'כניסה לאתר שלי'}</span><i data-lucide="arrow-left"></i></button></form><p class="access-help"><i data-lucide="shield-check"></i>הכניסה עם הפרטים שקיבלת ממנהל המערכת</p></div><footer>ניהול פשוט. אתר שמתעדכן איתך.</footer></section><aside class="access-visual" aria-label="כל הכלים לניהול האתר"><div class="access-orbit" aria-hidden="true"><span></span><span></span><span></span></div><div class="access-visual-copy"><span>האתר שלך, צעד קדימה</span><h2>פחות התעסקות.<br>יותר התקדמות.</h2></div><div class="access-demo" aria-hidden="true"><div class="demo-top">${currentMark()}<span>סביבת העבודה שלי</span><i data-lucide="ellipsis"></i></div><div class="demo-site"><span>YOUR SPACE</span><strong>מקום לרעיונות שלך.</strong><div><i></i><i></i><i></i></div></div><div class="demo-actions"><span><i data-lucide="image-plus"></i>עדכון תמונות</span><span><i data-lucide="chart-no-axes-combined"></i>מעקב מבקרים</span><span><i data-lucide="link"></i>שיתוף לינקים</span></div></div><p class="access-visual-footer"><i data-lucide="smartphone"></i>נבנה כדי לעבוד בנוחות, מכל מקום.</p></aside></main>`;
  bindShell();
  document.getElementById('loginForm').addEventListener('submit', onLogin);
  document.querySelector('[data-show-password]').addEventListener('click', (event) => {
    const input = document.getElementById('accessPassword'); const visible = input.type === 'password'; input.type = visible ? 'text' : 'password';
    const button = event.currentTarget; button.setAttribute('aria-label', visible ? 'הסתרת הסיסמה' : 'הצגת הסיסמה'); button.setAttribute('aria-pressed', String(visible)); button.innerHTML = `<i data-lucide="${visible ? 'eye-off' : 'eye'}"></i>`; icons();
  });
  if (!admin) clearLoginPrefillFromUrl(prefill);
  icons(); markBootReady();
}
