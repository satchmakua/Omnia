// The shared map vocabulary (M6.5): one accent colour per category, the resource
// icon mapping, and the SVG markup the on-screen legend draws. The canvas renderer
// draws the same shapes with the 2D context; this module is the single source of
// truth for which symbol means what, so the legend and the map never disagree.

export const CATEGORY_COLOR = {
  folk:     '#e6d29a',
  animal:   '#dd8f54',
  fish:     '#7fb8cf',
  plant:    '#7faa5e',
  ore:      '#8a93a0',
  timber:   '#a9794e',
  crystal:  '#6fc3c9',
  building: '#6f8fb0',
  dock:     '#5a93a8',
  home:     '#caa46a',
  civic:    '#b58fd0',
  grave:    '#9a9a9a',
  ruin:     '#8c8270',
  wonder:   '#e8c674',
  hostile:  '#d06b6b',
  // Special agents (M21) — monsters & uncanny visitors. Each icon carries its own palette;
  // the colour here is just the legend/category accent.
  dragon:   '#c87a52',
  vampire:  '#b03a4a',
  undead:   '#d6d8e0',
  monster:  '#d06b6b',
  ghost:    '#aec4ea',
  alien:    '#5cc95c',
  // Functional civic buildings (M21) — each icon carries its own palette.
  infirmary: '#d98b8b',
  tavern:    '#c89a5a',
  watch:     '#8696b3',
  market:    '#cf8a4a',
  workshop:  '#8a8f99',
} as const;

export type Category = keyof typeof CATEGORY_COLOR;

// Resource nodes share the "category = shape" idea but their three kinds are
// functionally distinct (different gather targets), so each gets its own icon.
export function resourceIcon(typeId: string): 'ore' | 'timber' | 'crystal' {
  const t = typeId.toLowerCase();
  if (t.includes('timber') || t.includes('wood') || t.includes('log')) return 'timber';
  if (t.includes('crystal') || t.includes('gem') || t.includes('quartz')) return 'crystal';
  return 'ore';
}

// Inner SVG (design space ≈ ±11, centred at 0,0) for one legend swatch.
export function iconSvgInner(key: Category | 'ore' | 'timber' | 'crystal', color: string): string {
  switch (key) {
    case 'folk':
    case 'hostile':
      return `<circle cx="0" cy="-6" r="4" fill="${color}"/>` +
        `<path d="M-6 9 Q -6 -1 0 -1 Q 6 -1 6 9 Z" fill="${color}"/>`;
    case 'animal':
      return `<ellipse cx="-1" cy="0" rx="7.5" ry="4.2" fill="${color}"/>` +
        `<circle cx="6.5" cy="-2" r="3.2" fill="${color}"/>` +
        `<path d="M4.7 -4.5 L4.2 -7.2 L6.1 -5.3 Z M8.3 -4.5 L9.3 -7 L7 -5.3 Z" fill="${color}"/>` +
        `<path d="M-6 3.5 V8 M-2 4 V8.2 M2 4 V8.2 M5 3.5 V7.8 M-8 -0.5 Q -11.5 -1.5 -10.8 -5.5" stroke="${color}" stroke-width="1.7" fill="none" stroke-linecap="round"/>` +
        `<circle cx="7.4" cy="-2.4" r="0.9" fill="#0c0c14"/>`;
    case 'fish':   // a small side-on fish — body, tail fin, dorsal fin, eye
      return `<ellipse cx="0.5" cy="0" rx="6" ry="3" fill="${color}"/>` +
        `<path d="M-5.5 0 L-9 -3 L-9 3 Z" fill="${color}"/>` +
        `<path d="M0 -3 L2 -5 L3.5 -3 Z" fill="${color}"/>` +
        `<circle cx="4" cy="-0.6" r="0.9" fill="#0c1a22"/>`;
    case 'plant':
      return `<path d="M0 9 V-3" stroke="${color}" stroke-width="1.8" fill="none" stroke-linecap="round"/>` +
        `<ellipse cx="-4" cy="0" rx="3.6" ry="2" fill="${color}" transform="rotate(-30 -4 0)"/>` +
        `<ellipse cx="4" cy="-3" rx="3.6" ry="2" fill="${color}" transform="rotate(30 4 -3)"/>`;
    case 'ore':
      return `<path d="M-7 4 L-4 -5 L4 -6 L8 1 L4 7 L-5 7 Z" fill="${color}" stroke="rgba(255,255,255,0.25)" stroke-width="0.8"/>` +
        `<path d="M-4 -5 L0 2 L8 1 M0 2 L-5 7" stroke="rgba(0,0,0,0.4)" stroke-width="0.8" fill="none"/>`;
    case 'timber':
      // A small stack of cut log-ends (each with a growth ring), not a single pill.
      return [['-4', '2.5'], ['4', '2.5'], ['0', '-3.5']].map(([cx, cy]) =>
        `<circle cx="${cx}" cy="${cy}" r="3.6" fill="${color}" stroke="rgba(0,0,0,0.4)" stroke-width="0.8"/>` +
        `<circle cx="${cx}" cy="${cy}" r="1.5" fill="none" stroke="rgba(0,0,0,0.4)" stroke-width="0.8"/>`).join('');
    case 'crystal':
      return `<path d="M0 -8 L5 -1 L2 8 L-2 8 L-5 -1 Z" fill="${color}" stroke="rgba(255,255,255,0.3)" stroke-width="0.8"/>` +
        `<path d="M0 -8 L0 8 M-5 -1 L5 -1" stroke="rgba(0,0,0,0.35)" stroke-width="0.7" fill="none"/>`;
    case 'building':
    case 'home':
      return `<path d="M-9 -1 L0 -9 L9 -1 Z" fill="${color}"/><rect x="-7" y="-1" width="14" height="10" fill="${color}"/>` +
        `<rect x="-2" y="3" width="4" height="6" fill="rgba(0,0,0,0.45)"/>`;
    case 'dock':   // a fishery: a wooden pier on pilings over water, with a mooring post
      return `<path d="M-10 7 q2.5 -2 5 0 t5 0 t5 0 t5 0" stroke="#5a93a8" stroke-width="1.3" fill="none"/>` +
        `<rect x="-8" y="-2" width="16" height="2.6" fill="#9a6c43"/>` +
        `<rect x="-6" y="0.6" width="1.6" height="6" fill="#7a5436"/><rect x="4.4" y="0.6" width="1.6" height="6" fill="#7a5436"/>` +
        `<rect x="-1" y="-7" width="2" height="5" fill="#7a5436"/>`;
    case 'civic':   // a hall with a small banner — a shared landmark
      return `<path d="M-9 -1 L0 -9 L9 -1 Z" fill="${color}"/><rect x="-7" y="-1" width="14" height="10" fill="${color}"/>` +
        `<rect x="-2" y="3" width="4" height="6" fill="rgba(0,0,0,0.45)"/>` +
        `<path d="M0 -9 L0 -13 L4 -12 L0 -11 Z" fill="${color}"/>`;
    case 'ruin':    // broken stubs of fallen columns (M20)
      return `<rect x="-9" y="-2" width="3" height="9" fill="${color}"/><rect x="-2.5" y="-8" width="3.5" height="15" fill="${color}"/>` +
        `<rect x="5" y="0" width="3" height="7" fill="${color}"/><rect x="-11" y="7" width="22" height="2.6" fill="${color}"/>`;
    case 'wonder':  // a gleaming spire with a beacon (M20)
      return `<path d="M-6 9 L0 -13 L6 9 Z" fill="${color}"/><circle cx="0" cy="-13" r="2.4" fill="#fff7d8"/>`;
    case 'grave':   // a rounded headstone with a cross
      return `<path d="M-6 8 V-3 Q-6 -9 0 -9 Q6 -9 6 -3 V8 Z" fill="${color}"/>` +
        `<rect x="-1.2" y="-5" width="2.4" height="8" fill="rgba(0,0,0,0.4)"/><rect x="-3.5" y="-3" width="7" height="2.2" fill="rgba(0,0,0,0.4)"/>`;
    case 'dragon':  // a heraldic wyvern: spread membranous wings, horned head, red eyes, a curling tail
      return `<path d="M-1 -2 L-11 -7 L-8 -2 L-11 2 L-8 3 L-1 4 Z" fill="#8f4f33"/>` +
        `<path d="M1 -2 L11 -7 L8 -2 L11 2 L8 3 L1 4 Z" fill="#8f4f33"/>` +
        `<path d="M0 -7 Q3 -1 1.6 7 L-1.6 7 Q-3 -1 0 -7 Z" fill="${color}"/>` +
        `<path d="M-1.4 7 Q-3 10 -0.5 11.5" stroke="${color}" stroke-width="1.5" fill="none" stroke-linecap="round"/>` +
        `<circle cx="0" cy="-8" r="2.7" fill="${color}"/>` +
        `<path d="M-2.4 -9.5 L-3.6 -12 M2.4 -9.5 L3.6 -12" stroke="#e7c39c" stroke-width="1.2" fill="none" stroke-linecap="round"/>` +
        `<circle cx="-1" cy="-8" r="0.8" fill="#ffd24a"/><circle cx="1" cy="-8" r="0.8" fill="#ffd24a"/>`;
    case 'vampire': { // a classic count: high-collared cape, pale face, widow's-peak hair, red eyes, white fangs
      const cape = '#3a1830', face = '#ede2d0', hair = '#131019';
      return `<path d="M-9 9 L-6 -1 Q0 -4 6 -1 L9 9 Z" fill="${cape}"/>` +
        `<path d="M-6 -1 L-2.5 3 L-1 -2 Z M6 -1 L2.5 3 L1 -2 Z" fill="${cape}"/>` +
        `<circle cx="0" cy="-4" r="3.9" fill="${face}"/>` +
        `<path d="M-3.9 -4.6 Q-4.4 -8.4 0 -8.4 Q4.4 -8.4 3.9 -4.6 Q2 -6.3 0 -4 Q-2 -6.3 -3.9 -4.6 Z" fill="${hair}"/>` +
        `<circle cx="-1.6" cy="-4" r="0.85" fill="#d12a2a"/><circle cx="1.6" cy="-4" r="0.85" fill="#d12a2a"/>` +
        `<path d="M-1.3 -1 L-0.5 0.7 L0.1 -1 Z M0.3 -1 L1.1 0.7 L1.7 -1 Z" fill="#ffffff"/>`;
    }
    case 'undead': { // a bare skull: black sockets, nasal void, a row of teeth
      const bone = '#d6d8e0';
      return `<path d="M-6 -2 Q-6 -9 0 -9 Q6 -9 6 -2 Q6 2 4 3.2 L4 6 L-4 6 L-4 3.2 Q-6 2 -6 -2 Z" fill="${bone}"/>` +
        `<circle cx="-2.7" cy="-3" r="1.9" fill="#101018"/><circle cx="2.7" cy="-3" r="1.9" fill="#101018"/>` +
        `<path d="M0 -1.5 L-1.1 1.4 L1.1 1.4 Z" fill="#101018"/>` +
        `<path d="M-3 4 H3 M-1.6 4 V6.4 M0 4 V6.4 M1.6 4 V6.4" stroke="#101018" stroke-width="0.8" fill="none"/>`;
    }
    case 'monster': { // a snarling horned beast: glowing eyes, jagged fangs
      const hide = '#d06b6b';
      return `<path d="M-5 -4 L-8.5 -11 L-2.5 -5.5 Z M5 -4 L8.5 -11 L2.5 -5.5 Z" fill="#a84a4a"/>` +
        `<path d="M-7 -1 Q-7 -7 0 -7 Q7 -7 7 -1 Q7 6 0 8 Q-7 6 -7 -1 Z" fill="${hide}"/>` +
        `<path d="M-4.2 -1.8 L-1.4 -0.6 L-4 0.6 Z M4.2 -1.8 L1.4 -0.6 L4 0.6 Z" fill="#ffe08a"/>` +
        `<path d="M-3.4 3 L-2.4 5.6 L-1.4 3 L-0.4 5.6 L0.6 3 L1.6 5.6 L2.6 3 Z" fill="#ffffff"/>`;
    }
    case 'ghost': { // a hovering wraith: rounded cowl, wavy hem, dark hollows
      const pale = '#aec4ea';
      return `<path d="M-6 7 L-6 -2 Q-6 -9 0 -9 Q6 -9 6 -2 L6 7 L4 5.2 L2 7 L0 5.2 L-2 7 L-4 5.2 Z" fill="${pale}" opacity="0.9"/>` +
        `<ellipse cx="-2.3" cy="-3" rx="1.3" ry="1.8" fill="#2a3550"/><ellipse cx="2.3" cy="-3" rx="1.3" ry="1.8" fill="#2a3550"/>` +
        `<ellipse cx="0" cy="1" rx="1.1" ry="1.6" fill="#2a3550"/>`;
    }
    case 'infirmary':   // a healer's house — the civic silhouette marked with a red cross
      return `<path d="M-9 -1 L0 -9 L9 -1 Z" fill="#d4dbe0"/><rect x="-7" y="-1" width="14" height="10" fill="#d4dbe0"/>` +
        `<rect x="-1.3" y="0.5" width="2.6" height="8" fill="#d23b3b"/><rect x="-4" y="3.2" width="8" height="2.6" fill="#d23b3b"/>`;
    case 'tavern':      // an alehouse — the civic silhouette with a foaming mug
      return `<path d="M-9 -1 L0 -9 L9 -1 Z" fill="#c89a5a"/><rect x="-7" y="-1" width="14" height="10" fill="#c89a5a"/>` +
        `<rect x="-3.2" y="1.8" width="5" height="6.2" rx="1" fill="#ecdcb8"/>` +
        `<path d="M1.8 2.6 Q4.6 3 1.8 6.6" stroke="#ecdcb8" stroke-width="1.3" fill="none"/>` +
        `<ellipse cx="-0.7" cy="1.8" rx="3" ry="1.3" fill="#ffffff"/>`;
    case 'market':      // a trader's stall — a striped awning over a wooden counter
      return `<rect x="-7" y="0" width="1.4" height="8" fill="#9a6c43"/><rect x="5.6" y="0" width="1.4" height="8" fill="#9a6c43"/>` +
        `<path d="M-9 -3 L9 -3 L7 1 L-7 1 Z" fill="#c0613f"/>` +
        `<path d="M-4 -3 L-2.5 1 M0 -3 L0 1 M4 -3 L2.5 1" stroke="#ecd6b0" stroke-width="0.9" fill="none"/>` +
        `<rect x="-8" y="4" width="16" height="2.6" fill="#a9794e"/>` +
        `<circle cx="-3.5" cy="2.6" r="1.1" fill="#cf8a4a"/><circle cx="0.5" cy="2.6" r="1.1" fill="#8fae6a"/>`;
    case 'workshop':    // a blacksmith's anvil (with a hammer-head resting on it)
      return `<path d="M-7 -3 L6 -3 L9 -1.4 L6 0 L-7 0 Z" fill="#8a8f99"/>` +
        `<rect x="-2" y="0" width="4" height="4" fill="#8a8f99"/><rect x="-6" y="4" width="12" height="3" fill="#8a8f99"/>` +
        `<rect x="-5.5" y="-5.5" width="3.5" height="2.4" fill="#5d6470"/><rect x="-4.2" y="-3.2" width="1" height="0.9" fill="#5d6470"/>`;
    case 'watch':       // a watch-tower — crenellated, bearing a shield
      return `<rect x="-5" y="-6" width="10" height="15" fill="#8696b3"/>` +
        `<rect x="-5" y="-8.5" width="2.6" height="2.6" fill="#8696b3"/><rect x="-1.3" y="-8.5" width="2.6" height="2.6" fill="#8696b3"/><rect x="2.4" y="-8.5" width="2.6" height="2.6" fill="#8696b3"/>` +
        `<path d="M0 -3 L3 -2 V1.5 Q3 4 0 5 Q-3 4 -3 1.5 V-2 Z" fill="#cdd6e2"/>` +
        `<path d="M0 -1 V3 M-2 0.5 H2" stroke="#5b6b86" stroke-width="0.9" fill="none"/>`;
    case 'alien': { // a grey in green: bulbous head, big slanted black eyes, slender body
      const skin = '#5cc95c';
      return `<path d="M-2 11 L-1.4 1 L1.4 1 L2 11 Z" fill="${skin}"/>` +
        `<path d="M-4 9 L-1.6 5 M4 9 L1.6 5" stroke="${skin}" stroke-width="1.3" fill="none" stroke-linecap="round"/>` +
        `<path d="M0 -10 Q7 -8.5 5.2 -1.5 Q3.2 2.5 0 2.5 Q-3.2 2.5 -5.2 -1.5 Q-7 -8.5 0 -10 Z" fill="${skin}"/>` +
        `<ellipse cx="-2.5" cy="-3.4" rx="1.5" ry="2.7" fill="#0a0a10" transform="rotate(28 -2.5 -3.4)"/>` +
        `<ellipse cx="2.5" cy="-3.4" rx="1.5" ry="2.7" fill="#0a0a10" transform="rotate(-28 2.5 -3.4)"/>`;
    }
    default:
      return '';
  }
}

// The categories the legend lists, in reading order, each with a label and a short
// description so every map symbol is self-explanatory.
export const LEGEND_ENTRIES: { key: Category | 'ore' | 'timber' | 'crystal'; label: string; desc: string }[] = [
  { key: 'folk', label: 'Folk', desc: 'a sapient person (any race)' },
  { key: 'animal', label: 'Animal', desc: 'instinct-driven fauna' },
  { key: 'fish', label: 'Fish', desc: 'aquatic life — swims the water, caught for food' },
  { key: 'plant', label: 'Plant', desc: 'flora — food when ripe' },
  { key: 'ore', label: 'Ore', desc: 'minable rock node' },
  { key: 'timber', label: 'Timber', desc: 'harvestable wood' },
  { key: 'crystal', label: 'Crystal', desc: 'rare gem node' },
  { key: 'building', label: 'Workplace', desc: 'a business that employs folk' },
  { key: 'dock', label: 'Fishery', desc: 'a coastal fishing house — nets fish for the table' },
  { key: 'home', label: 'Home', desc: 'a dwelling folk build and own' },
  { key: 'civic', label: 'Civic', desc: 'a shared place — hall, well, or shrine' },
  { key: 'infirmary', label: 'Infirmary', desc: 'a healer’s house — the sick nearby mend faster' },
  { key: 'tavern', label: 'Tavern', desc: 'ale & company — lifts the spirits of folk nearby' },
  { key: 'watch', label: 'Watch-house', desc: 'the constabulary — crime is rarer under its eye' },
  { key: 'market', label: 'Market', desc: 'a trading square — cheaper living for folk nearby' },
  { key: 'workshop', label: 'Workshop', desc: 'an artisans’ guild — crafters nearby gain skill faster' },
  { key: 'ruin', label: 'Ruin', desc: 'remains of a fallen clan / lost relic — folk discover them' },
  { key: 'wonder', label: 'Wonder', desc: 'a town-scale mega-project (the space elevator)' },
  { key: 'dragon', label: 'Dragon', desc: 'a rare terror of the wilds — to slay one is legend' },
  { key: 'vampire', label: 'Vampire', desc: 'a cunning predator that stalks the folk' },
  { key: 'undead', label: 'Undead', desc: 'the restless dead, risen to walk again' },
  { key: 'monster', label: 'Monster', desc: 'a dire beast that hunts the unwary' },
  { key: 'ghost', label: 'Ghost', desc: 'a haunt — it draws no blood, but chills the soul' },
  { key: 'alien', label: 'Visitor', desc: 'an uncanny wanderer — unsettling, but no killer' },
];
