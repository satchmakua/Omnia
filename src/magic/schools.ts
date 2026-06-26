// The magic tree (M17 slice 3): four schools a mage practices, each a ladder of named spells
// unlocked by growing mastery. Defined here as one table (data-shaped; could become content
// later) so the inspector can show the whole tree and the MagicSystem can pick what to cast.
// Effect tags: 'bolt' (war — strike a foe), 'heal' (mend a neighbour), 'inspire' (lift spirits),
// 'sustain' (the basic self-conjuring every mage knows — handled by the CapabilitySystem).

export interface MageSpell {
  name: string;
  mastery: number;   // mastery level at which this spell is learned
  effect: 'bolt' | 'heal' | 'inspire' | 'sustain';
}
export interface MagicSchool {
  id: string;
  name: string;
  blurb: string;
  signature: 'bolt' | 'heal' | 'inspire' | 'sustain';   // the school's active effect
  spells: MageSpell[];
}

export const SCHOOLS: MagicSchool[] = [
  {
    id: 'elementalism', name: 'Elementalism', blurb: 'fire, frost & storm — the magic of war and the hunt',
    signature: 'bolt',
    spells: [
      { name: 'Spark', mastery: 1, effect: 'bolt' },
      { name: 'Flame Lash', mastery: 3, effect: 'bolt' },
      { name: 'Storm Wrath', mastery: 5, effect: 'bolt' },
    ],
  },
  {
    id: 'restoration', name: 'Restoration', blurb: 'mending flesh and spirit',
    signature: 'heal',
    spells: [
      { name: 'Soothe', mastery: 1, effect: 'heal' },
      { name: 'Mend Wounds', mastery: 3, effect: 'heal' },
      { name: 'Renewal', mastery: 5, effect: 'heal' },
    ],
  },
  {
    id: 'divination', name: 'Divination', blurb: 'insight, luck and foresight',
    signature: 'inspire',
    spells: [
      { name: 'Insight', mastery: 1, effect: 'inspire' },
      { name: 'Foresight', mastery: 4, effect: 'inspire' },
    ],
  },
  {
    id: 'conjuration', name: 'Conjuration', blurb: 'summoning meal, vigour and matter from the aether',
    signature: 'sustain',
    spells: [
      { name: 'Conjure Meal', mastery: 1, effect: 'sustain' },
      { name: 'Mend Vigour', mastery: 1, effect: 'sustain' },
    ],
  },
];

export const SCHOOL_IDS = SCHOOLS.map(s => s.id);

export function schoolOf(id: string | undefined): MagicSchool | undefined {
  return SCHOOLS.find(s => s.id === id);
}

// The spells a mage of this school commands at the given mastery (lowest first).
export function knownSpells(schoolId: string | undefined, mastery: number): MageSpell[] {
  return schoolOf(schoolId)?.spells.filter(sp => sp.mastery <= mastery) ?? [];
}

// The strongest spell the mage can presently cast (or undefined if none unlocked yet).
export function topSpell(schoolId: string | undefined, mastery: number): MageSpell | undefined {
  const known = knownSpells(schoolId, mastery);
  return known.length ? known[known.length - 1] : undefined;
}
