// Treatment & recovery (M30 slice 2). The infirmary is a healer's house: folk who linger there are
// not only mended in body (CivicSystem heals Health) but *tended* for their treatable afflictions.
// A chronic illness, drawn out over days with the right herbal remedy, can be cured outright;
// permanent disabilities — a lost eye, a maimed limb, the frailty of age — are carried for life.
//
// Remedies are content (D9): each names the herb it's brewed from and the affliction it eases, and
// it works only where that herb grows — so healing is tied to the world's ecology (a town with no
// damp groves and no bruisewort cannot brew the poultice). Recovery is a deterministic per-day roll
// (hash, no sim RNG) so the world still replays identically and the predator-prey balance is safe.
import type { World } from '../ecs.ts';
import { C_CIVIC, C_AGENT, C_POSITION, C_AFFLICTIONS, C_CLOCK, C_FLORA, C_JOB, C_BUSINESS } from '../components.ts';
import type { Civic, Agent, Position, Afflictions, Clock, Flora, AfflictionKind, Job, Business } from '../components.ts';
import type { SimConfig } from '../config.ts';
import type { Content } from '../../content/loader.ts';
import { isTreatableKind, cureAffliction, recoversUnderCare, labelOf } from '../afflictions.ts';
import { getOrgStore } from '../../org/orgStore.ts';
import { emitEvent } from '../../history/eventlog.ts';

export function runTreatmentSystem(world: World, cfg: SimConfig, content: Content): void {
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const clock = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!;
  if (clock.tick === 0 || clock.tick % cfg.ticksPerDay !== 0) return;   // once a day
  const day = Math.floor(clock.tick / cfg.ticksPerDay);

  // The infirmaries (heal buildings) are the loci of care. The building's passive aura mends those
  // who rest in it (CivicSystem, a tight radius); its healers, by contrast, make *rounds* across the
  // settlement to tend the afflicted where they live — a broader catchment (so a chronic ailment is
  // actually treated, not just for the rare soul standing in the doorway on the right day).
  const care = cfg.infirmaryCareRadius;
  const infirmaries: Position[] = [];
  for (const e of world.query(C_CIVIC, C_POSITION)) {
    if (world.getComponent<Civic>(e, C_CIVIC)!.effect === 'heal') infirmaries.push(world.getComponent<Position>(e, C_POSITION)!);
  }
  if (!infirmaries.length) return;

  // Which medicinal herbs grow in the world right now (a healer forages them) → the best-potency
  // remedy available for each treatable affliction. No herb growing ⇒ no remedy ⇒ no cure.
  const herbsPresent = new Set<string>();
  for (const fe of world.query(C_FLORA)) herbsPresent.add(world.getComponent<Flora>(fe, C_FLORA)!.speciesId);
  const bestPotency = new Map<AfflictionKind, number>();
  for (const r of content.remedies.all()) {
    if (!herbsPresent.has(r.herb)) continue;
    const kind = r.treats as AfflictionKind;
    bestPotency.set(kind, Math.max(bestPotency.get(kind) ?? 0, r.potency));
  }
  if (bestPotency.size === 0) return;   // the town has no growing remedy — chronic ills must run their course

  const orgStore = getOrgStore(world);   // a tribe's medicine knowledge makes its healers surer (M30 s3)

  // Working healers (M30 backlog): folk who hold the care trade — employed at a healer's house. The more
  // of them tending, the surer & faster the infirmary's cures (a town that pays for healers heals better).
  // Capped so a glut of healers can't make care near-instant (which would unbalance the death on-ramps).
  let healers = 0;
  for (const e of world.query(C_AGENT, C_JOB)) {
    const biz = world.getComponent<Business>(world.getComponent<Job>(e, C_JOB)!.employer, C_BUSINESS);
    if (biz?.tends) healers++;
  }
  const healerBoost = 1 + Math.min(0.6, cfg.healerCarePerWorker * healers);

  for (const e of world.query(C_AGENT, C_AFFLICTIONS, C_POSITION)) {
    const fp = world.getComponent<Position>(e, C_POSITION)!;
    const tended = infirmaries.some(inf => Math.max(Math.abs(fp.x - inf.x), Math.abs(fp.y - inf.y)) <= care);
    if (!tended) continue;
    const agent = world.getComponent<Agent>(e, C_AGENT)!;
    const af = world.getComponent<Afflictions>(e, C_AFFLICTIONS)!;
    // Healer's teeth (M30 s3): a tribe that has studied medicine cures surer & faster (+25%/level),
    // the same knowledge that speeds its members' recovery in the HealthSystem.
    const medicine = orgStore && agent.orgId ? (orgStore.byId[agent.orgId]?.effects?.medicine ?? 0) : 0;
    const skill = (1 + medicine * 0.25) * healerBoost;   // tribe medicine knowledge × the town's working healers
    // Snapshot the treatable kinds first — cureAffliction mutates (and may shed) the list.
    const treatable = af.list.map(a => a.kind).filter(isTreatableKind);
    for (const kind of treatable) {
      const potency = bestPotency.get(kind);
      if (potency === undefined) continue;   // no remedy for this one is growing
      if (recoversUnderCare(e, kind, day, Math.min(1, potency * skill)) && cureAffliction(world, e, kind)) {
        emitEvent(world, 'illness', `${agent.name} was nursed back from ${labelOf(kind)} at the infirmary.`, fp);
      }
    }
  }
}
