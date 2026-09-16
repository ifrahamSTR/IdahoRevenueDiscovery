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

- **`index.html`** — statewide page shell: Overview (hero + KPI tiles) →
  Market Context (actual-vs-potential explainer + revenue histogram) →
  **The Map** (the centerpiece, now with a region-boundary overlay) →
  Regions (a card grid linking to every discovered region) → Findings →
  Methodology.
- **`region.html`** — the regional-page template. One file, byte-identical
  once copied into every `regions/<slug>/index.html` — see "Regions" below.
- **`js/config.js`** — the only place state-specific constants live: default
  $ threshold, inspect-radius bounds (km), map colors (including the region-
  boundary color), property-type/location-type category orders, basemap tile
  sources. Swap this file (plus the data files) to retarget the whole site at
  another state.
- **`js/util.js`** — formatting (`fmtCurrency`, `fmtPct`, ...) and small stats
  helpers (`medianOf`, `quantileOf`, `pearsonCorr`, `distanceKm`) shared by
  `map.js`/`charts.js`/`region.js`.
- **`js/map.js`** — the map. Plain Leaflet, canvas-rendered circle markers (no
  clustering library — at ~5.7k points canvas redraws fast enough that
  clustering would only cost the point-level detail the site exists to
  preserve). Owns: the revenue metric/threshold controls, the property/
  location/amenity filters, the points/heat-all/heat-qualifying view-mode
  switcher, the Light/Terrain basemap switcher, the region-boundary overlay
  (statewide page only), the click-to-inspect radius tool (up to 20km, with a
  full local market summary — revenue/ADR/occupancy vs. the statewide
  baseline, property mix, amenities, nearby markets/cities, strongest
  listings), and the property detail modal (clicking a marker opens a card
  with the cover photo and AirDNA metrics; the Airbnb/Vrbo/Booking link is an
  explicit button inside it, never an automatic redirect). Every function
  here operates on whatever `listings` array `initMap()` is given, which is
  why the exact same file powers both the full statewide map and every
  region's own scoped map with zero region-specific code.
- **`js/charts.js`** — the "Findings" section. Chart.js. Every statistic is
  derived client-side from whatever listings array `initFindings()` is given
  (one source of truth, no Python-side duplicate), evaluated at
  `CONFIG.defaultThreshold` as a fixed reference point independent of the
  map's live threshold slider. Reused as-is on regional pages.
- **`js/main.js`** — statewide-page bootstrap: fetches `data/listings.json` +
  `data/regions.json`, hands listings to `initMap()`/`initFindings()`, renders
  the region-grid teaser cards, wires up nav scrollspy.
- **`js/region.js`** — regional-page bootstrap: reads the region slug from the
  URL path (`regions/<slug>/...`), fetches the same `data/listings.json` +
  `data/regions.json` + `data/regulations.json`, filters listings to that
  region, calls the same `initMap()`/`initFindings()`, and renders the
  regulatory-research section.
- **`scripts/generate_map_data.py`** — regenerates `data/listings.json` *and*
  `data/regions.json` from the raw Snowflake CSV export in one pass (see
  "Region discovery" below). Deliberately state-agnostic in method: it cleans
  and exports one row per listing and does **not** compute tiers, thresholds,
  or medians (that stays in JS). Point `INPUT_CSV` at another state's export
  (same AirDNA/USPPD schema) and re-run.
- **`scripts/generate_region_pages.py`** — copies `region.html` verbatim into
  `regions/<slug>/index.html` for every region in `data/regions.json`. Run
  this after `generate_map_data.py` any time the region list changes.
- **`data/listings.json`**, **`data/regions.json`** — generated; don't
  hand-edit, regenerate via the scripts above.
- **`data/regulations.json`** — hand-curated STR regulatory research, keyed by
  region slug (tier, per-jurisdiction rules, taxes, HOA notes, uncertainty
  flags, sources). Never touched by `generate_map_data.py`, so re-running
  region discovery (e.g. to tune clustering parameters) never clobbers
  researched regulatory content. Add an entry here (see the existing 10 for
  the expected shape) for any newly-discovered region before regenerating
  region pages.

## Region discovery

`scripts/generate_map_data.py` also discovers "natural" revenue regions —
geographic concentrations of strong performers, not administrative
boundaries:

1. **DBSCAN** (haversine distance) over listings ≥ `REGION_REVENUE_THRESHOLD`
   actual revenue (`eps=12km`, `min_samples=4`) — this finds concentrations of
   *strong* listings, not just dense listing counts, so it doesn't simply
   rediscover Boise.
2. Any two resulting clusters whose centroids sit within `MERGE_KM` (30km) are
   unioned — DBSCAN can split one obviously-contiguous area into adjacent
   sub-clusters purely from a gap in *qualifying* points.
3. Each region's boundary is the convex hull of its seed points, buffered
   `REGION_BUFFER_KM` (15km) outward — this is what makes region membership
   include the full surrounding market at every revenue level, not just the
   seed points that defined the region's existence.
4. Every listing in the full dataset is assigned to at most one region
   (whichever buffered hull contains it); most listings fall in no region at
   all and stay statewide-only.

For Idaho this produced **10 regions**, not a forced count — see
`REGION_LABELS` in the script for the resulting city→region-name mapping.
Re-tune `DBSCAN_EPS_KM`/`DBSCAN_MIN_SAMPLES`/`MERGE_KM`/`REGION_BUFFER_KM` per
state by inspecting cluster sizes/locations in the script's own printed
output; there's no formula that transfers state-to-state unchanged.

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
- STR regulatory research (`data/regulations.json`) was gathered per-region by
  independent research passes against primary government/statute sources
  where available, each dated at verification with uncertainty explicitly
  flagged where a primary source couldn't be confirmed. The single biggest
  finding: Idaho House Bill 583 (effective July 1, 2026) preempts most local
  STR-specific licensing/permitting/caps/owner-occupancy rules statewide —
  it affects all 10 regions, not just one, so most regions now read
  "Permissive" at the government layer even where a city's own code text may
  not yet reflect the change. This is research, not legal advice; every
  region's Regulations section says so and links its sources.

## Reusing this for another state

1. Pull that state's AirDNA/USPPD export into a sibling `Snowflake/<State>/`
   folder.
2. Point `scripts/generate_map_data.py`'s `INPUT_CSV` at it, re-tune the
   region-discovery constants and `REGION_LABELS`, and re-run — this writes
   `data/listings.json` and `data/regions.json`.
3. Run `scripts/generate_region_pages.py` to create the new `regions/<slug>/`
   pages.
4. Research and write `data/regulations.json` entries for the new regions
   (one object per slug — copy the shape of an existing Idaho entry). Check
   whether that state has an equivalent statewide STR-preemption law before
   assuming county/city rules are the whole picture, the way Idaho's HB 583
   turned out to be.
5. Update `js/config.js` (mainly cosmetic: colors/thresholds only if you want
   different defaults — the map view itself always `fitBounds()`s to
   whatever the data covers, no hardcoded center/zoom).
6. Update the state name, title, and narrative copy in `index.html` — those
   are hand-written prose, not generated, since the actual findings (what
   separates the top of that state's market) should be re-verified against
   that state's own data before being asserted, not copied from Idaho's.
