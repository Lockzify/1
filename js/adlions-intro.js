(function () {
  var root = document.getElementById("adlions-intro");
  if (!root) return;

  var html = document.documentElement;
  var reduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finished = false;

  function finish() {
    if (finished) return;
    finished = true;
    if (root.parentNode) root.remove();
    html.classList.remove("adlions-intro-active");
  }

  function leave() {
    root.classList.add("is-leaving");

    function onAnimEnd(e) {
      if (e.target !== root) return;
      root.removeEventListener("animationend", onAnimEnd);
      finish();
    }

    root.addEventListener("animationend", onAnimEnd);
    window.setTimeout(finish, reduced ? 350 : 750);
  }

  function start() {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        root.classList.add("is-ready");
        window.setTimeout(function () {
          if (!reduced) root.classList.add("is-shine");
        }, reduced ? 0 : 280);
        window.setTimeout(leave, reduced ? 450 : 1050);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
