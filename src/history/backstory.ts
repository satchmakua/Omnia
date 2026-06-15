// Invents the post-apocalyptic backstory at world creation and writes it as the
// first Chronicle entries (WORLD_AND_ENVIRONMENT: "invent the backstory as the
// first Chronicle entries"). Deterministic: all choices flow through the seeded
// RNG, so a given seed always tells the same origin story.
import { rngInt, rngChoice } from '../sim/rng.ts';
import type { RNG } from '../sim/rng.ts';
import type { ChronicleEntry } from './chronicle.ts';
import { biomeIndexAt } from '../world/tilemap.ts';
import type { TileMapData } from '../world/tilemap.ts';

const CATACLYSMS = ['the Sundering', 'the Long Static', 'the Ashfall', 'the Glass Rain', 'the Hush'];
const LOST_ARTS  = ['the singing engines', 'the sky-roads', 'the deep forges', 'the memory-wells', 'the tide-lamps'];
const OMENS       = ['a sky the colour of bruised fruit', 'a wind that tasted of metal', 'stars that fell upward', 'a silence that lasted a year'];

// Which biome covers the most tiles — the world's defining landscape.
function dominantBiomeName(map: TileMapData): string {
  const counts = new Array(map.biomeNames.length).fill(0);
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++)
      counts[biomeIndexAt(map, x, y)]++;
  let best = 0;
  for (let i = 1; i < counts.length; i++) if (counts[i] > counts[best]) best = i;
  return map.biomeNames[best];
}

export function generateBackstory(rng: RNG, map: TileMapData): ChronicleEntry[] {
  const cataclysm = rngChoice(rng, CATACLYSMS);
  const lostArt   = rngChoice(rng, LOST_ARTS);
  const omen      = rngChoice(rng, OMENS);
  const yearsAgo  = rngInt(rng, 120, 600);
  const landscape = dominantBiomeName(map);

  // importance 1.0 — these are the oldest legends, never forgotten (they survive
  // Chronicle compression by name because they outrank the legend threshold).
  return [
    { tick: 0, importance: 1.0, kind: 'founding', text: `Long ago — some ${yearsAgo} years past — came ${cataclysm}, and the old world ended.` },
    { tick: 0, importance: 1.0, kind: 'founding', text: `It began with ${omen}. When it passed, ${lostArt} were gone, and have not been known since.` },
    { tick: 0, importance: 0.9, kind: 'founding', text: `What remains is a land of ${landscape.toLowerCase()} and ruins, where a new town now gathers.` },
  ];
}
