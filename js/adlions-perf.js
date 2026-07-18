(function () {
  function pauseMarqueesWhenHidden() {
    var tracks = Array.from(document.querySelectorAll(".adlions-creative-track"));
    if (!tracks.length) return;

    function setPaused(paused) {
      tracks.forEach(function (track) {
        track.classList.toggle("is-paused", paused);
      });
    }

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) setPaused(true);
      else refreshViewportPause();
    });

    if (!("IntersectionObserver" in window)) return;

    var visible = new Set();
    function refreshViewportPause() {
      if (document.hidden) {
        setPaused(true);
        return;
      }
      setPaused(visible.size === 0);
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) visible.add(entry.target);
          else visible.delete(entry.target);
        });
        refreshViewportPause();
      },
      { root: null, rootMargin: "80px 0px", threshold: 0.01 }
    );

    document.querySelectorAll(".adlions-creative-marquee").forEach(function (el) {
      io.observe(el);
    });
  }

  function softenHeroImagePriority() {
    var heroImgs = Array.from(
      document.querySelectorAll(".cf-hero-creatives-side img.waves-image-hero-1")
    );
    heroImgs.forEach(function (img, index) {
      img.decoding = "async";
      if (index === 0) {
        img.loading = "eager";
        img.setAttribute("fetchpriority", "high");
        return;
      }
      img.loading = "lazy";
      img.setAttribute("fetchpriority", "low");
    });
  }

  function enhanceMarqueeClone() {
    document.querySelectorAll(".adlions-creative-track").forEach(function (track) {
      var clones = track.querySelectorAll('.waves-inside-hero-1[aria-hidden="true"] img');
      clones.forEach(function (img) {
        img.loading = "lazy";
        img.decoding = "async";
        img.setAttribute("fetchpriority", "low");
      });
    });
  }

  function run() {
    softenHeroImagePriority();
    enhanceMarqueeClone();
    pauseMarqueesWhenHidden();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }

  window.addEventListener("load", function () {
    enhanceMarqueeClone();
  });
})();
