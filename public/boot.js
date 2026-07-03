(function () {
  const app = document.querySelector("#app");
  const baseMeta = document.querySelector("meta[name='manager-site-base']");
  const basePath = (baseMeta?.getAttribute("content") || "/Manager_Site").replace(/\/+$/, "");

  function showRecovery() {
    if (!app || !app.classList.contains("boot-screen")) return;
    document.documentElement.lang = "he";
    document.documentElement.dir = "rtl";
    app.className = "boot-screen boot-recovery";
    app.innerHTML = [
      '<main class="boot-card boot-recovery-card" dir="rtl" lang="he">',
      '<div class="mark">MS</div>',
      "<div>",
      "<strong>הטעינה נמשכת יותר מדי זמן</strong>",
      "<span>אפשר לרענן את המערכת או לחזור למסך הכניסה.</span>",
      "</div>",
      '<div class="boot-actions">',
      '<button class="primary-button" type="button" data-boot-reload>רענון</button>',
      '<a class="ghost-button" href="' + basePath + '/login">כניסה מחדש</a>',
      "</div>",
      "</main>",
    ].join("");
    app.querySelector("[data-boot-reload]")?.addEventListener("click", function () {
      window.location.reload();
    });
  }

  window.ManagerSiteBoot = {
    basePath,
    markReady() {
      clearTimeout(this.timeout);
    },
    showRecovery,
    timeout: setTimeout(showRecovery, 8000),
  };

  window.addEventListener("error", function () {
    showRecovery();
  });
  window.addEventListener("unhandledrejection", function () {
    showRecovery();
  });
})();
