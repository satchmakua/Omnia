// The shared map vocabulary (M6.5): one accent colour per category, the resource
// icon mapping, and the SVG markup the on-screen legend draws. The canvas renderer
// draws the same shapes with the 2D context; this module is the single source of
// truth for which symbol means what, so the legend and the map never disagree.

export const CATEGORY_COLOR = {
  folk:     '#e6d29a',
  animal:   '#dd8f54',
  plant:    '#7faa5e',
  ore:      '#8a93a0',
  timber:   '#a9794e',
  crystal:  '#6fc3c9',
  building: '#6f8fb0',
  home:     '#caa46a',
  grave:    '#9a9a9a',
  hostile:  '#d06b6b',
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
    default:
      return '';
  }
}

// The categories the legend lists, in reading order, each with a label and a short
// description so every map symbol is self-explanatory.
export const LEGEND_ENTRIES: { key: Category | 'ore' | 'timber' | 'crystal'; label: string; desc: string }[] = [
  { key: 'folk', label: 'Folk', desc: 'a sapient person (any race)' },
  { key: 'animal', label: 'Animal', desc: 'instinct-driven fauna' },
  { key: 'plant', label: 'Plant', desc: 'flora — food when ripe' },
  { key: 'ore', label: 'Ore', desc: 'minable rock node' },
  { key: 'timber', label: 'Timber', desc: 'harvestable wood' },
  { key: 'crystal', label: 'Crystal', desc: 'rare gem node' },
  { key: 'building', label: 'Workplace', desc: 'a business that employs folk' },
  { key: 'home', label: 'Home', desc: 'a dwelling folk build and own' },
];
