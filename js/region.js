/**
 * Bootstraps a regional page. One template (regions/<slug>/index.html, all
 * byte-identical copies of region.html -- see scripts/generate_region_pages.py)
 * serves every discovered region; this file figures out which region it's
 * looking at from the URL path, filters the same statewide listings.json
 * down to that region, and reuses map.js/charts.js exactly as the statewide
 * page does (initMap/initFindings take a listings array + don't care where
 * it came from) -- no per-region code, only per-region data.
 */
function currentRegionSlug() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("regions");
  if (idx !== -1 && parts[idx + 1]) return parts[idx + 1];
  return new URLSearchParams(window.location.search).get("r");
}

function boundsFor(listings, padDeg) {
  const lats = listings.map((l) => l.lat);
  const lngs = listings.map((l) => l.lng);
  return {
    south: Math.min(...lats) - padDeg,
    north: Math.max(...lats) + padDeg,
    west: Math.min(...lngs) - padDeg,
    east: Math.max(...lngs) + padDeg,
  };
}

function tierBadgeClass(tier) {
  const t = (tier || "").toLowerCase();
  if (t.indexOf("permissive") !== -1) return "reg-tier--permissive";
  if (t.indexOf("restrictive") !== -1) return "reg-tier--restrictive";
  if (t.indexOf("moderate") !== -1) return "reg-tier--moderate";
  return "reg-tier--uncertain";
}

function renderRegulatory(reg) {
  const host = document.getElementById("regulatory-body");
  if (!host) return;
  if (!reg) {
    host.innerHTML = '<p class="reg-empty">Regulatory research for this region has not been published yet.</p>';
    return;
  }
  let html = "";
  html += '<div class="reg-summary-row">';
  html += '<span class="reg-tier ' + tierBadgeClass(reg.tier) + '">' + escapeHtml(reg.tier || "Uncertain") + "</span>";
  html += '<span class="reg-verified">Verified ' + escapeHtml(reg.verifiedDate || "") + "</span>";
  html += "</div>";
  if (reg.tierNote) html += '<p class="reg-tier-note">' + reg.tierNote + "</p>";

  if (reg.jurisdictions && reg.jurisdictions.length) {
    html += '<div class="reg-jurisdictions">';
    reg.jurisdictions.forEach((j) => {
      html += '<div class="reg-jurisdiction">';
      html += "<h4>" + escapeHtml(j.name) + "</h4>";
      html += "<p>" + j.summary + "</p>";
      html += "</div>";
    });
    html += "</div>";
  }

  if (reg.taxes) {
    html += '<div class="reg-block"><h4>Taxes</h4><p>' + reg.taxes + "</p></div>";
  }
  if (reg.stateLawNote) {
    html += '<div class="reg-block reg-block--state"><h4>Idaho state law context</h4><p>' + reg.stateLawNote + "</p></div>";
  }
  if (reg.hoaNote) {
    html += '<div class="reg-block"><h4>HOA &amp; other notes</h4><p>' + reg.hoaNote + "</p></div>";
  }

  if (reg.uncertainty && reg.uncertainty.length) {
    html += '<div class="reg-uncertainty"><h4>Uncertainty &amp; verify-before-relying-on flags</h4><ul>';
    reg.uncertainty.forEach((u) => { html += "<li>" + u + "</li>"; });
    html += "</ul></div>";
  }

  if (reg.sources && reg.sources.length) {
    html += '<details class="reg-sources"><summary>Sources (' + reg.sources.length + ")</summary><ul>";
    reg.sources.forEach((s) => {
      html += '<li><a href="' + escapeHtml(s.url) + '" target="_blank" rel="noopener">' + escapeHtml(s.title) + "</a></li>";
    });
    html += "</ul></details>";
  }

  host.innerHTML = html;
}

function renderRegionSwitcher(regions, currentSlug) {
  const host = document.getElementById("region-switcher");
  if (!host) return;
  const select = document.createElement("select");
  select.id = "region-switcher-select";
  regions.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.name;
    if (r.id === currentSlug) opt.selected = true;
    select.appendChild(opt);
  });
  select.addEventListener("change", () => { window.location.href = "../" + select.value + "/"; });
  host.innerHTML = "";
  host.appendChild(select);
}

(function () {
  const slug = currentRegionSlug();
  const mapEl = document.getElementById("idaho-map");
  if (mapEl) mapEl.innerHTML = '<div class="map-loading">Loading region…</div>';

  Promise.all([
    fetch("../../data/listings.json").then((r) => r.json()),
    fetch("../../data/regions.json").then((r) => r.json()),
    fetch("../../data/regulations.json").then((r) => r.json()).catch(() => ({})),
  ])
    .then(([listingsPayload, regionsPayload, regulations]) => {
      const regions = regionsPayload.regions || [];
      const region = regions.find((r) => r.id === slug);
      if (!region) {
        document.body.innerHTML = '<div style="padding:60px;text-align:center;font-family:sans-serif;"><h1>Region not found</h1><p><a href="../../index.html">Back to the statewide map</a></p></div>';
        return;
      }
      const regionListings = listingsPayload.listings.filter((l) => l.region === slug);
      const statewideN = listingsPayload.n;
      const T = CONFIG.defaultThreshold;
      const above = regionListings.filter((l) => l.revA >= T);

      document.title = region.name + " — Idaho STR Revenue Discovery";
      const kicker = document.getElementById("region-kicker");
      if (kicker) kicker.textContent = "Regional deep dive · discovered, not assumed";
      const h1 = document.getElementById("region-title");
      if (h1) h1.textContent = region.name;
      const sub = document.getElementById("region-sub");
      if (sub) {
        sub.innerHTML =
          "A data-driven revenue region within Idaho's statewide discovery map &mdash; " + fmtNumber(regionListings.length) +
          " listings in this footprint, " + fmtNumber(above.length) + " (" + fmtPct(regionListings.length ? above.length / regionListings.length : 0, 1) +
          ") at or above " + fmtCurrency(T) + " actual LTM revenue, out of " + fmtNumber(statewideN) + " statewide. Not a buy box or market recommendation — an exploration of what's driving this pocket.";
      }

      if (mapEl) mapEl.innerHTML = "";
      initMap(regionListings, boundsFor(regionListings, 0.05));
      initFindings(regionListings);
      renderRegulatory((regulations || {})[slug]);
      renderRegionSwitcher(regions, slug);
    })
    .catch((err) => {
      console.error(err);
      if (mapEl) mapEl.innerHTML = '<p class="map-error">Could not load region data.</p>';
    });
})();
