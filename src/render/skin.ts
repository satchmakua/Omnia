// Skins (M34): a swappable visual set, selectable from the start menu. v1 ships one alternate — an
// **emoji** skin that draws every entity as a system emoji (`ctx.fillText`, zero assets) instead of
// the lo-fi geometric icon. A skin is pure presentation: the renderer, legend and bestiary all read
// the current skin from here; the sim never knows about it (separation holds). The palette/themed
// skins from the design brainstorm are shelved to the backlog — emoji was the clear win.
import { iconSvgInner } from './icons.ts';
import type { Category } from './icons.ts';

export type Skin = 'lofi' | 'emoji';

let current: Skin = 'lofi';
export function getSkin(): Skin { return current; }
export function setSkin(s: Skin): void { current = s; }
export function isEmoji(): boolean { return current === 'emoji'; }

// One emoji per map category (and a few entity sub-states). System emoji — they render in the OS's
// own emoji font, so adding/swapping one is a single edit here.
export const EMOJI: Record<string, string> = {
  // folk + states
  folk: '🧑', child: '🧒', mage: '🧙', boat: '🛶',
  // fauna: a generic 'animal' for the legend's catch-all row; per-species glyphs are in FAUNA_EMOJI
  // below, with grazer/predator as the diet fallback for any unmapped beast. + fish.
  animal: '🐾', grazer: '🦌', predator: '🐺', fish: '🐟',
  // flora
  plant: '🌿', plantRipe: '🌳',
  // resources
  ore: '🪨', timber: '🪵', crystal: '💎',
  // buildings / places
  building: '🏭', home: '🏠', civic: '🏛️', infirmary: '🏥', tavern: '🍺', watch: '🛡️', market: '🏪', workshop: '🔨', dock: '🎣',
  ruin: '🏚️', wonder: '🗼', grave: '🪦',
  // monsters & visitors
  dragon: '🐉', vampire: '🧛', undead: '💀', monster: '👹', ghost: '👻', alien: '👽', kraken: '🦑', guardian: '✨',
};

// A distinct emoji per fauna SPECIES (keyed by the content species id), so the menagerie reads as
// itself — a rabbit isn't an elk isn't a wolf. The renderer/bestiary fall back to the diet glyph
// (grazer/predator) for any species without an entry, so a new YAML beast still draws something.
export const FAUNA_EMOJI: Record<string, string> = {
  rabbit: '🐇', deer: '🦌', wild_boar: '🐗', wild_horse: '🐎', wolf: '🐺', bear: '🐻',
  moth_grazer: '🦋', glow_moth: '🐛', dust_hopper: '🦗', dust_beetle: '🪲',
  crag_ram: '🐏', spire_elk: '🫎', thistle_doe: '🐐', ember_hound: '🐕', pallid_stalker: '🐆',
};

// The emoji for a beast: its species' own, else the diet fallback (grazer/predator).
export function faunaEmoji(speciesId: string | undefined, diet: 'grazer' | 'predator'): string {
  return (speciesId && FAUNA_EMOJI[speciesId]) || EMOJI[diet];
}

export function emojiFor(key: string): string | undefined {
  return FAUNA_EMOJI[key] ?? EMOJI[key];
}

// A small DOM icon for the legend / bestiary — an emoji glyph under the emoji skin, else the lo-fi
// SVG swatch. `scale` < 1 shrinks it (e.g. a child). `emojiKey` overrides only the emoji lookup
// (e.g. a fauna species id) while `key` stays the lo-fi category. Callers wrap it in a swatch box.
export function glyphHtml(key: string, color: string, size = 22, scale = 1, emojiKey?: string): string {
  const e = current === 'emoji' ? emojiFor(emojiKey ?? key) : undefined;
  if (e) return `<span style="font-size:${Math.round(size * 0.82 * scale)}px;line-height:1">${e}</span>`;
  const inner = iconSvgInner(key as Category, color);
  const g = scale === 1 ? inner : `<g transform="scale(${scale})">${inner}</g>`;
  return `<svg width="${size}" height="${size}" viewBox="-13 -13 26 26">${g}</svg>`;
}
