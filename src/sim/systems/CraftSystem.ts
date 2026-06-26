// Crafting (M23 slice 2): once a day, an employed crafter turns the materials in their bag
// into a good. Recipes are content (a profession + inputs → output, gated by skill); this
// system implements *how* they're worked — pick the most advanced recipe the crafter has the
// skill AND the materials for, consume the inputs, produce the output (bounded by the carry
// cap), and grow their skill (learn-by-doing, so a veteran unlocks the finer recipes).
// Deterministic — no RNG; a pure transform of carried state. Resolves the long-deferred
// resource→craft→goods + skill-gating thread (M3/M15/M17).
import type { World, EntityId } from '../ecs.ts';
import { C_AGENT, C_JOB, C_CLOCK, C_INVENTORY, C_CRAFTING } from '../components.ts';
import type { Agent, Job, Clock, Crafting } from '../components.ts';
import type { SimConfig } from '../config.ts';
import type { Content } from '../../content/loader.ts';
import type { Recipe } from '../../content/schema.ts';
import { itemCount, takeItem, addItem } from '../inventory.ts';
import type { Inventory } from '../components.ts';

const SKILL_MAX = 10;   // craftsmanship tops out (keeps skill bounded)

function hasInputs(inv: Inventory, r: Recipe): boolean {
  for (const id in r.inputs) if (itemCount(inv, id) < r.inputs[id]) return false;
  return true;
}

export function runCraftSystem(world: World, cfg: SimConfig, content: Content): void {
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const clock = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!;
  if (clock.tick === 0 || clock.tick % cfg.ticksPerDay !== 0) return;   // once per day

  const recipes = content.recipes.all();
  if (recipes.length === 0) return;
  // Recipes grouped by the profession that crafts them (deterministic order).
  const byProfession = new Map<string, Recipe[]>();
  for (const r of recipes) {
    const list = byProfession.get(r.profession); if (list) list.push(r); else byProfession.set(r.profession, [r]);
  }

  for (const e of world.query(C_AGENT, C_JOB, C_INVENTORY)) {
    const job = world.getComponent<Job>(e, C_JOB)!;
    const profRecipes = byProfession.get(job.professionId);
    if (!profRecipes) continue;
    const inv = world.getComponent<Inventory>(e, C_INVENTORY)!;
    let craft = world.getComponent<Crafting>(e, C_CRAFTING);
    const skill = craft?.skill ?? 0;

    // The most advanced recipe they can both afford (skill) and supply (materials).
    let pick: Recipe | undefined;
    for (const r of profRecipes) {
      if (r.minSkill <= skill && hasInputs(inv, r) && (!pick || r.minSkill > pick.minSkill)) pick = r;
    }
    if (!pick) continue;

    for (const id in pick.inputs) takeItem(inv, id, pick.inputs[id]);
    addItem(inv, pick.output, pick.outputQty, cfg.inventoryMaxPerItem);
    if (!craft) { craft = { skill: 0 }; world.addComponent<Crafting>(e, C_CRAFTING, craft); }
    craft.skill = Math.min(SKILL_MAX, craft.skill + pick.skillGain);
  }
}
