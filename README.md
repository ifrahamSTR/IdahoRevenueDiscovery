# Idaho STR Revenue Discovery

A statewide geographic discovery tool built from AirDNA/USPPD Idaho data
(pulled via Snowflake). It is **not** a buy-box or market-selection report —
see the Charlotte project (`../../7AugBuyBox/Charlotte/webpage`) for that kind
of deliverable. This site exists to make geographic concentrations of
strong-revenue Idaho listings visually discoverable, so an analyst can decide
where deeper market research is worth doing. The map does not pre-select
markets, pre-define clusters, or rank anything — every read is left to the
person looking at it.

## Running locally

Plain HTML/CSS/JS, no build step, no framework. From this directory:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000/index.html`. It will not work from `file://`
because of the `fetch()` call in `js/main.js`.

## Structure

- **`index.html`** — page shell: Overview (hero + KPI tiles) → Market Context
  (actual-vs-potential explainer + revenue histogram) → **The Map** (the
  centerpiece) → Findings (what's behind the green dots) → Methodology.
- **`js/config.js`** — the only place state-specific constants live: default
  $ threshold, inspect-radius defaults, map colors, property-type/location-type
  category orders, basemap tile sources. Swap this file (plus the data file)
  to retarget the whole site at another state.
- **`js/util.js`** — formatting (`fmtCurrency`, `fmtPct`, ...) and small stats
  helpers (`medianOf`, `quantileOf`, `pearsonCorr`, `distanceMiles`) shared by
  `map.js` and `charts.js`.
- **`js/map.js`** — the map. Plain Leaflet, canvas-rendered circle markers (no
  clustering library — at ~5.7k points canvas redraws fast enough that
  clustering would only cost the point-level detail the site exists to
  preserve). Owns: the revenue metric/threshold controls, the property/
  location/amenity filters, the points/heat-all/heat-qualifying view-mode
  switcher, the Light/Terrain basemap switcher, and the click-to-inspect
  radius tool.
- **`js/charts.js`** — the "Findings" section. Chart.js. Every statistic is
  derived client-side from the same listings array the map uses (one source
  of truth), evaluated at `CONFIG.defaultThreshold` as a fixed reference
  point independent of the map's live threshold slider.
- **`js/main.js`** — fetches `data/listings.json` once, hands it to
  `initMap()`/`initFindings()`, wires up nav scrollspy.
- **`scripts/generate_map_data.py`** — regenerates `data/listings.json` from
  the raw Snowflake CSV export. Deliberately state-agnostic: it cleans and
  exports one row per listing and does **not** compute tiers, thresholds, or
  medians (that stays in JS, so there's one source of truth for "what counts
  as $90k+", including the live slider). Point `INPUT_CSV` at another state's
  export (same AirDNA/USPPD schema) and re-run.
- **`data/listings.json`** — generated; don't hand-edit. Regenerate via
  `python3 scripts/generate_map_data.py` whenever the source CSV changes.

## Data notes

- Source: `Snowflake/Idaho/Iqbal_Idaho_2026-09-16-1857.csv` — Entire home/apt
  Idaho listings with 20+ reviews and 230+ active listing nights (LTM),
  already filtered upstream. 5,759 raw rows; 23 further excluded here per the
  CSV's own `EXCLUDE` QC flag (boutique hotels / large event-venue lodges
  mis-tagged as single-unit entire-home listings) — 5,736 in the working
  dataset.
- `REVENUE_LTM` (actual) and `REVENUE_POTENTIAL_LTM` (AirDNA's optimized-
  calendar modeled ceiling) are both carried through and are switchable live
  on the map — never silently conflated. Every listing at/above $90k on
  actual is also at/above $90k on potential; a further ~80 listings clear
  potential without yet clearing actual (surfaced via the map's "highlight
  potential-only upside" toggle, off by default).
- Basemaps are Esri's hosted ArcGIS Online tile services (Light Gray Canvas +
  World Topo Map), not CartoDB — CartoDB's anonymous/keyless basemap tiles
  now render an "API key required" watermark, so they're not usable without
  registering a key.
- The "Density: all listings" vs "Density: qualifying" heatmap toggle exists
  specifically to address urban-density bias: Boise dominates raw listing
  density but contributes only a modest share of $90k+ listings, and the two
  heat layers make that legible without needing a written explanation.

## Reusing this for another state

1. Pull that state's AirDNA/USPPD export into a sibling `Snowflake/<State>/`
   folder.
2. Point `scripts/generate_map_data.py`'s `INPUT_CSV` at it and re-run.
3. Update `js/config.js` (mainly cosmetic: colors/thresholds only if you want
   different defaults — the map view itself always `fitBounds()`s to
   whatever the data covers, no hardcoded center/zoom).
4. Update the state name, title, and narrative copy in `index.html` — those
   are hand-written prose, not generated, since the actual findings (what
   separates the top of that state's market) should be re-verified against
   that state's own data before being asserted, not copied from Idaho's.
