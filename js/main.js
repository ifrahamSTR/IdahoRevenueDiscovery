/**
 * Bootstraps the page: fetch listings.json once, hand the listings array to
 * map.js and charts.js, then wire up nav scrollspy.
 */
(function () {
  const mapEl = document.getElementById("idaho-map");
  if (mapEl) mapEl.innerHTML = '<div class="map-loading">Loading Idaho listings…</div>';

  fetch(CONFIG.dataUrl)
    .then((r) => r.json())
    .then((payload) => {
      const n = document.getElementById("dataset-n");
      if (n) n.textContent = fmtNumber(payload.n);
      if (mapEl) mapEl.innerHTML = "";
      initMap(payload.listings, payload.bounds);
      initFindings(payload.listings);
    })
    .catch((err) => {
      console.error(err);
      if (mapEl) mapEl.innerHTML = '<p class="map-error">Could not load data/listings.json. Run <code>python3 scripts/generate_map_data.py</code>, then reload.</p>';
    });

  // Scrollspy
  const navLinks = Array.from(document.querySelectorAll(".site-nav a"));
  const sections = navLinks.map((a) => document.querySelector(a.getAttribute("href"))).filter(Boolean);
  const setActive = () => {
    let current = sections[0];
    const y = window.scrollY + 120;
    sections.forEach((s) => { if (s.offsetTop <= y) current = s; });
    navLinks.forEach((a) => a.classList.toggle("site-nav__link--active", a.getAttribute("href") === "#" + current.id));
  };
  window.addEventListener("scroll", debounce(setActive, 60));
  setActive();
})();
