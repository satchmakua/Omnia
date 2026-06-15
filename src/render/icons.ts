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
      return `<ellipse cx="-1" cy="2" rx="8" ry="4" fill="${color}"/><circle cx="7" cy="-1" r="3" fill="${color}"/>` +
        `<path d="M-5 5 V9 M-1 6 V10 M3 6 V10 M6 5 V9 M-8 1 Q -11 -1 -10 -4" stroke="${color}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    case 'plant':
      return `<path d="M0 9 V-3" stroke="${color}" stroke-width="1.8" fill="none" stroke-linecap="round"/>` +
        `<ellipse cx="-4" cy="0" rx="3.6" ry="2" fill="${color}" transform="rotate(-30 -4 0)"/>` +
        `<ellipse cx="4" cy="-3" rx="3.6" ry="2" fill="${color}" transform="rotate(30 4 -3)"/>`;
    case 'ore':
      return `<path d="M-7 4 L-4 -5 L4 -6 L8 1 L4 7 L-5 7 Z" fill="${color}" stroke="rgba(255,255,255,0.25)" stroke-width="0.8"/>` +
        `<path d="M-4 -5 L0 2 L8 1 M0 2 L-5 7" stroke="rgba(0,0,0,0.4)" stroke-width="0.8" fill="none"/>`;
    case 'timber':
      return `<rect x="-9" y="-4" width="16" height="8" rx="4" fill="${color}"/>` +
        `<circle cx="6" cy="0" r="2.6" fill="none" stroke="rgba(0,0,0,0.45)" stroke-width="1"/>`;
    case 'crystal':
      return `<path d="M0 -8 L5 -1 L2 8 L-2 8 L-5 -1 Z" fill="${color}" stroke="rgba(255,255,255,0.3)" stroke-width="0.8"/>` +
        `<path d="M0 -8 L0 8 M-5 -1 L5 -1" stroke="rgba(0,0,0,0.35)" stroke-width="0.7" fill="none"/>`;
    case 'building':
      return `<path d="M-9 -1 L0 -9 L9 -1 Z" fill="${color}"/><rect x="-7" y="-1" width="14" height="10" fill="${color}"/>` +
        `<rect x="-2" y="3" width="4" height="6" fill="rgba(0,0,0,0.45)"/>`;
    default:
      return '';
  }
}

// The categories the legend lists, in reading order, with a one-word label.
export const LEGEND_ENTRIES: { key: Category | 'ore' | 'timber' | 'crystal'; label: string }[] = [
  { key: 'folk', label: 'Folk' },
  { key: 'animal', label: 'Animal' },
  { key: 'plant', label: 'Plant' },
  { key: 'ore', label: 'Ore' },
  { key: 'timber', label: 'Timber' },
  { key: 'crystal', label: 'Crystal' },
  { key: 'building', label: 'Building' },
];
