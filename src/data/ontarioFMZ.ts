// Ontario Fisheries Management Zones (FMZs)
// Regulation data: 2024–2025 Ontario Fishing Regulations Summary
// Always verify at ontario.ca/fishing before your trip — rules change annually.

export interface FishingRule {
  species: string;
  season: string;
  limit: string;
  minSize?: string;
}

export interface FMZInfo {
  zone: number;
  name: string;
  rules: FishingRule[];
}

// ── Regulation data per zone ───────────────────────────────────────────────
// Focus: species commonly targeted by Georgian Bay salmon charters.
// Rules shown are for the main lake / open water unless noted.

const RULES: Record<number, FishingRule[]> = {
  13: [ // Georgian Bay / Bruce Peninsula
    { species: 'Chinook & Coho Salmon', season: 'Apr 1 – Dec 31',       limit: '5/day combined'    },
    { species: 'Rainbow Trout',         season: 'Year-round',            limit: '2/day', minSize: '35 cm' },
    { species: 'Brown Trout',           season: 'Year-round',            limit: '2/day', minSize: '35 cm' },
    { species: 'Lake Trout',            season: 'May 1 – Sep 30',        limit: '2/day', minSize: '36 cm' },
    { species: 'Walleye',               season: '3rd Sat May – Mar 31',  limit: '6/day', minSize: '36 cm' },
    { species: 'Smallmouth Bass',       season: '3rd Sat Jun – Nov 30',  limit: '6/day'               },
    { species: 'Northern Pike',         season: 'Year-round',            limit: '6/day', minSize: '55 cm' },
  ],
  11: [ // Muskoka / Parry Sound
    { species: 'Rainbow Trout',         season: 'Jan 1 – Sep 30',        limit: '2/day', minSize: '35 cm' },
    { species: 'Lake Trout',            season: 'Jan 1 – Sep 30',        limit: '2/day', minSize: '36 cm' },
    { species: 'Walleye',               season: '3rd Sat May – Mar 31',  limit: '4/day', minSize: '36 cm' },
    { species: 'Smallmouth Bass',       season: '3rd Sat Jun – Nov 30',  limit: '6/day'               },
    { species: 'Northern Pike',         season: 'Year-round',            limit: '6/day', minSize: '55 cm' },
    { species: 'Brook Trout',           season: 'Jan 1 – Sep 30',        limit: '5/day', minSize: '25 cm' },
  ],
  12: [ // Haliburton / Kawartha Lakes
    { species: 'Rainbow Trout',         season: 'Jan 1 – Sep 30',        limit: '2/day', minSize: '35 cm' },
    { species: 'Lake Trout',            season: 'Jan 1 – Sep 30',        limit: '2/day', minSize: '36 cm' },
    { species: 'Walleye',               season: '3rd Sat May – Mar 31',  limit: '4/day', minSize: '36 cm' },
    { species: 'Smallmouth Bass',       season: '3rd Sat Jun – Nov 30',  limit: '6/day'               },
    { species: 'Largemouth Bass',       season: '3rd Sat Jun – Nov 30',  limit: '6/day'               },
    { species: 'Northern Pike',         season: 'Year-round',            limit: '6/day', minSize: '55 cm' },
  ],
  14: [ // Eastern Ontario / Ottawa Valley
    { species: 'Rainbow Trout',         season: 'Jan 1 – Sep 30',        limit: '2/day', minSize: '35 cm' },
    { species: 'Walleye',               season: '3rd Sat May – Mar 31',  limit: '6/day', minSize: '36 cm' },
    { species: 'Smallmouth Bass',       season: '3rd Sat Jun – Nov 30',  limit: '6/day'               },
    { species: 'Largemouth Bass',       season: '3rd Sat Jun – Nov 30',  limit: '6/day'               },
    { species: 'Northern Pike',         season: 'Year-round',            limit: '6/day', minSize: '55 cm' },
    { species: 'Brook Trout',           season: 'Jan 1 – Sep 30',        limit: '5/day', minSize: '25 cm' },
  ],
  15: [ // Kingston / Belleville / Prince Edward County
    { species: 'Chinook & Coho Salmon', season: 'Apr 1 – Dec 31',       limit: '5/day combined'    },
    { species: 'Rainbow Trout',         season: 'Year-round',            limit: '2/day', minSize: '35 cm' },
    { species: 'Lake Trout',            season: 'May 1 – Sep 30',        limit: '2/day', minSize: '36 cm' },
    { species: 'Walleye',               season: '3rd Sat May – Mar 31',  limit: '6/day', minSize: '36 cm' },
    { species: 'Smallmouth Bass',       season: '3rd Sat Jun – Nov 30',  limit: '6/day'               },
    { species: 'Northern Pike',         season: 'Year-round',            limit: '6/day', minSize: '55 cm' },
  ],
  17: [ // Lake Erie
    { species: 'Walleye',               season: '3rd Sat May – Mar 31',  limit: '6/day', minSize: '36 cm' },
    { species: 'Yellow Perch',          season: 'Year-round',            limit: '50/day'              },
    { species: 'Smallmouth Bass',       season: '3rd Sat Jun – Nov 30',  limit: '6/day'               },
    { species: 'Largemouth Bass',       season: '3rd Sat Jun – Nov 30',  limit: '6/day'               },
    { species: 'Northern Pike',         season: 'Year-round',            limit: '6/day', minSize: '55 cm' },
  ],
  19: [ // Lake Ontario West (Hamilton to Toronto)
    { species: 'Chinook & Coho Salmon', season: 'Apr 1 – Dec 31',       limit: '5/day combined'    },
    { species: 'Rainbow Trout',         season: 'Year-round',            limit: '2/day', minSize: '35 cm' },
    { species: 'Brown Trout',           season: 'Year-round',            limit: '2/day', minSize: '35 cm' },
    { species: 'Lake Trout',            season: 'May 1 – Sep 30',        limit: '2/day', minSize: '36 cm' },
    { species: 'Walleye',               season: '3rd Sat May – Mar 31',  limit: '6/day', minSize: '36 cm' },
    { species: 'Smallmouth Bass',       season: '3rd Sat Jun – Nov 30',  limit: '6/day'               },
  ],
  20: [ // Lake Ontario East (Toronto to Kingston)
    { species: 'Chinook & Coho Salmon', season: 'Apr 1 – Dec 31',       limit: '5/day combined'    },
    { species: 'Rainbow Trout',         season: 'Year-round',            limit: '2/day', minSize: '35 cm' },
    { species: 'Brown Trout',           season: 'Year-round',            limit: '2/day', minSize: '35 cm' },
    { species: 'Lake Trout',            season: 'May 1 – Sep 30',        limit: '2/day', minSize: '36 cm' },
    { species: 'Walleye',               season: '3rd Sat May – Mar 31',  limit: '6/day', minSize: '36 cm' },
    { species: 'Smallmouth Bass',       season: '3rd Sat Jun – Nov 30',  limit: '6/day'               },
  ],
};

const ZONE_NAMES: Record<number, string> = {
  1:  'Far Northwestern Ontario',
  2:  'Northwestern Ontario',
  3:  'North-Central Ontario',
  4:  'Northeastern Ontario',
  5:  'James Bay Lowlands',
  6:  'Kenora / Rainy River',
  7:  'Lake of the Woods',
  8:  'Dryden / Sioux Lookout',
  9:  'Cochrane / Timmins',
  10: 'Algonquin / Sudbury',
  11: 'Muskoka / Parry Sound',
  12: 'Haliburton / Kawartha',
  13: 'Georgian Bay / Bruce Peninsula',
  14: 'Eastern Ontario / Ottawa Valley',
  15: 'Kingston / Belleville',
  16: 'London / Windsor',
  17: 'Lake Erie',
  18: 'Simcoe County',
  19: 'Lake Ontario West',
  20: 'Lake Ontario East',
};

// ── FMZ bounding boxes (priority order — more specific first) ──────────────
// Approximate at zone boundaries; accurate for open water and typical fishing areas.

const FMZ_BOXES: Array<{ zone: number; latMin: number; latMax: number; lngMin: number; lngMax: number }> = [
  // Southern Ontario — checked first (most likely locations for this app)
  { zone: 18, latMin: 43.8,  latMax: 44.7,  lngMin: -80.4, lngMax: -79.1 }, // Simcoe/Barrie (inside FMZ 13 bbox)
  { zone: 13, latMin: 44.0,  latMax: 46.2,  lngMin: -81.7, lngMax: -79.0 }, // Georgian Bay / Bruce Peninsula
  { zone: 11, latMin: 45.0,  latMax: 46.5,  lngMin: -80.2, lngMax: -78.7 }, // Muskoka / Parry Sound
  { zone: 12, latMin: 44.5,  latMax: 46.5,  lngMin: -79.2, lngMax: -77.0 }, // Haliburton / Kawartha
  { zone: 14, latMin: 44.5,  latMax: 47.5,  lngMin: -77.0, lngMax: -74.5 }, // Eastern Ontario
  { zone: 15, latMin: 43.5,  latMax: 44.8,  lngMin: -78.5, lngMax: -75.5 }, // Kingston / Belleville
  { zone: 16, latMin: 42.5,  latMax: 44.3,  lngMin: -83.5, lngMax: -80.5 }, // London / Windsor
  { zone: 17, latMin: 41.8,  latMax: 42.9,  lngMin: -83.5, lngMax: -78.8 }, // Lake Erie
  { zone: 19, latMin: 43.0,  latMax: 44.0,  lngMin: -80.5, lngMax: -78.5 }, // Lake Ontario West
  { zone: 20, latMin: 43.4,  latMax: 44.4,  lngMin: -78.5, lngMax: -75.5 }, // Lake Ontario East
  // Northern Ontario
  { zone: 10, latMin: 45.5,  latMax: 47.5,  lngMin: -84.5, lngMax: -79.5 }, // Algonquin / Sudbury
  { zone:  9, latMin: 47.0,  latMax: 51.5,  lngMin: -84.5, lngMax: -79.0 }, // Cochrane / Timmins
  { zone:  8, latMin: 47.0,  latMax: 51.0,  lngMin: -91.0, lngMax: -84.5 }, // Dryden / Sioux Lookout
  { zone:  7, latMin: 48.5,  latMax: 49.5,  lngMin: -95.5, lngMax: -93.0 }, // Lake of the Woods
  { zone:  6, latMin: 48.5,  latMax: 51.5,  lngMin: -95.5, lngMax: -91.0 }, // Kenora / Rainy River
  { zone:  5, latMin: 48.0,  latMax: 51.5,  lngMin: -84.5, lngMax: -80.0 }, // James Bay shore
  { zone:  4, latMin: 49.0,  latMax: 53.0,  lngMin: -89.0, lngMax: -84.5 }, // North Central
  { zone:  3, latMin: 49.0,  latMax: 53.0,  lngMin: -95.5, lngMax: -89.0 }, // Northwest
  { zone:  2, latMin: 53.0,  latMax: 56.5,  lngMin: -89.0, lngMax: -83.0 }, // Far North East
  { zone:  1, latMin: 53.0,  latMax: 56.5,  lngMin: -95.5, lngMax: -89.0 }, // Far North West
];

// ── Exports ────────────────────────────────────────────────────────────────

export function getFMZInfo(lat: number, lng: number): FMZInfo | null {
  const match = FMZ_BOXES.find(
    (b) => lat >= b.latMin && lat <= b.latMax && lng >= b.lngMin && lng <= b.lngMax,
  );
  if (!match) return null;

  const zone = match.zone;
  return {
    zone,
    name: ZONE_NAMES[zone] ?? `Zone ${zone}`,
    rules: RULES[zone] ?? [],
  };
}
