(function () {
  var header = document.querySelector(".topbar");
  if (!header) return;

  var btn = header.querySelector(".topbar-menu-btn");
  var nav = header.querySelector("#topbar-nav");
  if (!btn || !nav) return;

  function setOpen(open) {
    header.classList.toggle("is-open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.setAttribute("aria-label", open ? "Menü schließen" : "Menü öffnen");
    document.body.classList.toggle("topbar-nav-open", open);
  }

  btn.addEventListener("click", function () {
    setOpen(!header.classList.contains("is-open"));
  });

  nav.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", function () {
      setOpen(false);
    });
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") setOpen(false);
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth >= 992) setOpen(false);
  });
})();
