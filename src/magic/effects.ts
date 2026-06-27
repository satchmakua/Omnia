// The CODE side of the data/behaviour boundary for MAGIC (CONTENT_AND_DATA Rule 2, D9),
// mirroring src/capability/effects.ts (capabilities) and src/event/effects.ts (world events).
// Content (content/magic/*.yaml) declares which spell-effect *tag* a school's signature and each
// of its spells produces; the MagicSystem implements what each tag actually does when cast on a
// neighbour. Declaring a tag in YAML with no implementation here is a load-time error (loader.ts).
//
// M26 slice 1 ships the four effects the MagicSystem already implements; slice 2 (wards/curses/
// weather/summons) adds a tag here + a MagicSystem branch + the content that uses it.

export const SPELL_EFFECTS = [
  'bolt',     // strike a marauding beast beside the mage (a battle-mage earns the slaying)
  'heal',     // mend the most-wounded neighbour
  'inspire',  // hearten a downcast neighbour
  'sustain',  // conjure a meal for a hungry neighbour
] as const;

export type SpellEffect = (typeof SPELL_EFFECTS)[number];

const KNOWN = new Set<string>(SPELL_EFFECTS);

export function isKnownSpellEffect(tag: string): boolean {
  return KNOWN.has(tag);
}
