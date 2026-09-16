"""
Generate webpage/data/listings.json from a raw AirDNA/USPPD state export CSV.

Purpose-built for the Idaho STR Revenue Discovery site, but deliberately state-
agnostic: point INPUT_CSV at another state's export (same AirDNA/USPPD column
schema) and re-run to produce that state's listings.json. No other code in
this script is Idaho-specific -- state name, thresholds, and narrative copy
live in the webpage itself (js/config.js), not here.

This script does NOT compute tiers, thresholds, medians, or correlations --
that would duplicate logic between Python and JS. It only cleans and exports
one row per listing; every statistic shown on the page is derived client-side
in js/charts.js and js/map.js from this same listings array, so there is one
source of truth for "what counts as $90k+" etc. (the live threshold slider).

Run from the repo root:  python3 scripts/generate_map_data.py
Do not hand-edit data/listings.json -- regenerate it from here instead.
"""
import json
import math
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent
INPUT_CSV = REPO_ROOT.parent.parent / "Snowflake" / "Idaho" / "Iqbal_Idaho_2026-09-16-1857.csv"
OUT_PATH = REPO_ROOT / "data" / "listings.json"

PROPERTY_TYPE_DISPLAY = {
    "Condominium (condo)": "Condo",
}

LOCATION_TYPE_DISPLAY = {
    "Destination/Resort - Mountains/Lake": "Destination/Resort",
    "Mid-Size City": "Mid-Size City",
    "Small City/Rural": "Small City/Rural",
}


def clean_str(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    s = str(v).strip()
    return s if s else None


def clean_num(v, round_to=None):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    f = float(v)
    if round_to is not None:
        f = round(f, round_to)
        if round_to == 0:
            f = int(f)
    return f


def clean_bool(v):
    if pd.isna(v):
        return None
    return bool(v)


def best_url(row):
    for col, src in (
        ("AIRBNB_LISTING_URL", "airbnb"),
        ("VRBO_LISTING_URL", "vrbo"),
        ("BOOKING_LISTING_URL", "booking"),
    ):
        u = clean_str(row.get(col))
        if u:
            return u, src
    return None, None


def build_listing(row):
    url, url_src = best_url(row)
    ptype = clean_str(row.get("PROPERTY_TYPE")) or "Other"
    ptype = PROPERTY_TYPE_DISPLAY.get(ptype, ptype)
    loc = clean_str(row.get("LOCATION_TYPE")) or "Unclassified"
    loc = LOCATION_TYPE_DISPLAY.get(loc, loc)

    return {
        "id": clean_str(row.get("STATIC_COMBINED_PROPERTY_ID")),
        "t": clean_str(row.get("TITLE")) or "Untitled listing",
        "lat": clean_num(row.get("LATITUDE"), 5),
        "lng": clean_num(row.get("LONGITUDE"), 5),
        "city": clean_str(row.get("CITY_NAME")) or "Unknown",
        "mkt": clean_str(row.get("AIRDNA_MARKET")) or "Unclassified",
        "sub": clean_str(row.get("AIRDNA_SUBMARKET")) or "Unclassified",
        "loc": loc,
        "pt": ptype,
        "bd": clean_num(row.get("BEDROOMS"), 0),
        "ba": clean_num(row.get("BATHROOMS"), 1),
        "acc": clean_num(row.get("ACCOMMODATES"), 0),
        "adr": clean_num(row.get("AVERAGE_DAILY_RATE_LTM"), 0),
        "occ": clean_num(row.get("OCCUPANCY_RATE_LTM"), 3),
        "revA": clean_num(row.get("REVENUE_LTM"), 0),
        "revP": clean_num(row.get("REVENUE_POTENTIAL_LTM"), 0),
        "nights": clean_num(row.get("ACTIVE_LISTING_NIGHTS_LTM"), 0),
        "reviews": clean_num(row.get("REVIEWS_COUNT"), 0),
        "rating": clean_num(row.get("RATING_OVERALL"), 0),
        "sh": clean_bool(row.get("SUPERHOST")),
        "tub": clean_bool(row.get("HAS_HOTTUB")) or False,
        "pool": clean_bool(row.get("HAS_POOL")) or False,
        "park": clean_bool(row.get("HAS_PARKING")) or False,
        "air": clean_bool(row.get("HAS_AIRCON")) or False,
        "gym": clean_bool(row.get("HAS_GYM")) or False,
        "pets": clean_bool(row.get("HAS_PETS_ALLOWED")) or False,
        "kitchen": clean_bool(row.get("HAS_KITCHEN")) or False,
        "instant": clean_bool(row.get("INSTANT_BOOK")) or False,
        "url": url,
        "urlSrc": url_src,
        "img": clean_str(row.get("IMG_COVER")),
    }


def main():
    df = pd.read_csv(INPUT_CSV, low_memory=False)
    n_raw = len(df)

    # EXCLUDE flags a small number of listings (boutique hotels, event-venue
    # "sleeps 40" lodges, multi-suite properties mis-tagged as single entire-
    # home listings) that QC determined aren't genuine single-unit STR comps.
    # Respect that flag; it changes the $90k+ counts by only a couple listings.
    df = df[df["EXCLUDE"] != True].copy()  # noqa: E712

    df = df[df["LATITUDE"].notna() & df["LONGITUDE"].notna()].copy()

    listings = [build_listing(row) for _, row in df.iterrows()]
    listings = [l for l in listings if l["lat"] is not None and l["lng"] is not None]

    lats = [l["lat"] for l in listings]
    lngs = [l["lng"] for l in listings]

    payload = {
        "generatedFrom": INPUT_CSV.name,
        "state": "Idaho",
        "n": len(listings),
        "nRawRows": n_raw,
        "nExcludedByQcFlag": n_raw - len(df) if n_raw >= len(df) else 0,
        "bounds": {
            "south": round(min(lats), 4),
            "north": round(max(lats), 4),
            "west": round(min(lngs), 4),
            "east": round(max(lngs), 4),
        },
        "listings": listings,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, separators=(",", ":")))
    size_kb = OUT_PATH.stat().st_size / 1024
    print(f"Wrote {OUT_PATH} -- {len(listings)} listings ({size_kb:.0f} KB)")
    print(f"Bounds: {payload['bounds']}")


if __name__ == "__main__":
    main()
