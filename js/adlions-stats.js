(function () {
  var BASE = 9320;
  var PER_DAY = 47;
  var START = { y: 2026, m: 7, d: 18 }; // ab diesem Tag 08:00 Berlin = BASE

  function berlinParts(date) {
    var parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    var map = {};
    parts.forEach(function (p) {
      if (p.type !== "literal") map[p.type] = p.value;
    });
    return {
      y: parseInt(map.year, 10),
      m: parseInt(map.month, 10),
      d: parseInt(map.day, 10),
      h: parseInt(map.hour, 10),
    };
  }

  function dayIndex(y, m, d) {
    return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  }

  function anfragenCount(now) {
    var b = berlinParts(now || new Date());
    var idx = dayIndex(b.y, b.m, b.d) - dayIndex(START.y, START.m, START.d);
    if (b.h < 8) idx -= 1;
    if (idx < 0) idx = 0;
    return BASE + idx * PER_DAY;
  }

  function formatDe(n) {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "+";
  }

  function render() {
    var el = document.getElementById("adlions-anfragen-count");
    if (!el) return;
    var value = anfragenCount(new Date());
    el.textContent = formatDe(value);
    el.setAttribute("data-count", String(value));
  }

  function msUntilNextTick() {
    var now = new Date();
    var b = berlinParts(now);
    // Nächster Tick: heute 08:00 oder morgen 08:00 (Berlin)
    var targetDay = dayIndex(b.y, b.m, b.d);
    if (b.h >= 8) targetDay += 1;
    // Approximation: next 08:00 Berlin ≈ now + hours
    // Recalculate every minute near the hour is enough; schedule precise-ish
    var hoursTo8 = b.h < 8 ? 8 - b.h : 24 - b.h + 8;
    return Math.max(30 * 1000, hoursTo8 * 60 * 60 * 1000 - 30 * 60 * 1000);
  }

  function schedule() {
    render();
    window.setTimeout(function () {
      render();
      // danach stündlich prüfen (Timezone/DST-sicher genug)
      window.setInterval(render, 60 * 60 * 1000);
    }, Math.min(msUntilNextTick(), 60 * 60 * 1000));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", schedule, { once: true });
  } else {
    schedule();
  }
})();
