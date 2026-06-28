import type { World } from './ecs.ts';
import type { EntityId } from './ecs.ts';
import type { RNG } from './rng.ts';
import type { SimConfig } from './config.ts';
import type { Content } from '../content/loader.ts';
import { runClockSystem }    from './systems/ClockSystem.ts';
import { runInterventionSystem } from './systems/InterventionSystem.ts';
import { runFloraSystem }    from './systems/FloraSystem.ts';
import { runResourceSystem } from './systems/ResourceSystem.ts';
import { runHungerSystem }   from './systems/HungerSystem.ts';
import { runCapabilitySystem } from './systems/CapabilitySystem.ts';
import { runActionSystem }   from './systems/ActionSystem.ts';
import { runMovementSystem } from './systems/MovementSystem.ts';
import { runGatherSystem }   from './systems/GatherSystem.ts';
import { runCraftSystem }    from './systems/CraftSystem.ts';
import { runEquipSystem }    from './systems/EquipSystem.ts';
import { runTradeSystem }    from './systems/TradeSystem.ts';
import { runVoyageSystem }   from './systems/VoyageSystem.ts';
import { runFishingSystem }  from './systems/FishingSystem.ts';
import { runMarketSystem }   from './systems/MarketSystem.ts';
import { runEconomySystem }  from './systems/EconomySystem.ts';
import { runBusinessSystem } from './systems/BusinessSystem.ts';
import { runBuildSystem }    from './systems/BuildSystem.ts';
import { runRentSystem }     from './systems/RentSystem.ts';
import { runSocialSystem }   from './systems/SocialSystem.ts';
import { runReproductionSystem } from './systems/ReproductionSystem.ts';
import { runHealthSystem }   from './systems/HealthSystem.ts';
import { runMoodSystem }     from './systems/MoodSystem.ts';
import { runStatusSystem }   from './systems/StatusSystem.ts';
import { runCivicSystem }    from './systems/CivicSystem.ts';
import { runCivicBuildSystem } from './systems/CivicBuildSystem.ts';
import { runOrgSystem }      from './systems/OrgSystem.ts';
import { runResearchSystem } from './systems/ResearchSystem.ts';
import { runAchievementSystem } from './systems/AchievementSystem.ts';
import { runLegendSystem }    from './systems/LegendSystem.ts';
import { runArtifactSystem }  from './systems/ArtifactSystem.ts';
import { runArchaeologySystem } from './systems/ArchaeologySystem.ts';
import { runQuestSystem }     from './systems/QuestSystem.ts';
import { runWonderSystem }    from './systems/WonderSystem.ts';
import { runSpecialAgentSystem } from './systems/SpecialAgentSystem.ts';
import { runAISystem }       from './systems/AISystem.ts';
import { runMemorySystem }   from './systems/MemorySystem.ts';
import { runHistorySystem }  from './systems/HistorySystem.ts';
import { runEventSystem }    from './systems/EventSystem.ts';
import { runEvolutionSystem } from './systems/EvolutionSystem.ts';
import { runReligionSystem } from './systems/ReligionSystem.ts';
import { runFaunaSystem }    from './systems/FaunaSystem.ts';
import { runFishSystem }     from './systems/FishSystem.ts';
import { runCombatSystem }   from './systems/CombatSystem.ts';
import { runCrimeSystem }    from './systems/CrimeSystem.ts';
import { runMagicSystem }    from './systems/MagicSystem.ts';
import type { AIProvider } from '../ai/provider.ts';
import { stubProvider } from '../ai/stubProvider.ts';

// System execution order is fixed and deterministic. The world (flora/resources)
// updates first, then sapient agents act, then fauna act on the resulting world.
// `provider` defaults to the deterministic stub, so headless runs stay reproducible.
export function tick(
  world: World, rng: RNG, cfg: SimConfig, clockEntity: EntityId, content: Content,
  provider: AIProvider = stubProvider,
): void {
  runClockSystem(world, cfg, clockEntity);
  runInterventionSystem(world, cfg, rng, content); // god mode: apply the player's recorded acts first (M27) — no-op if none
  runFloraSystem(world, cfg, rng);       // flora grow/spread (no brain)
  runResourceSystem(world);              // resources regrow (no brain)
  runHungerSystem(world, cfg);           // sapient needs decay / starvation
  runCapabilitySystem(world, cfg, content); // magic: mana regen + casting (rare)
  runActionSystem(world, cfg);           // sapient utility action choice
  runMovementSystem(world, cfg, rng, content); // sapient movement / forage / commute / socialise / gather
  runGatherSystem(world, cfg);           // deplete resource nodes being worked → materials into the bag
  runCraftSystem(world, cfg, content);   // crafters turn carried materials into goods, skill-gated (M23)
  runEquipSystem(world, cfg, content);   // denormalise best carried weapon/armour for combat (M23 s3)
  runTradeSystem(world, cfg, content);   // sell crafted goods for gold — crafting feeds wealth (M25 s2)
  runFishingSystem(world, cfg);          // coastal fisheries net fish → food (fish-limited) (M24)
  runMarketSystem(world, cfg);           // staple market: price floats with supply/demand (sets the cost of living)
  runEconomySystem(world, cfg);          // hiring, wages, cost of living (at the market price)
  runBusinessSystem(world, cfg, rng, content); // farms fold when unprofitable; new ones open when food is dear (M15)
  runBuildSystem(world, cfg);            // settled adults build & own homes (the town grows)
  runRentSystem(world, cfg);             // homeless adults rent a landlord's spare home (income + shelter)
  runSocialSystem(world, cfg, rng);      // relationships, social need, courtship → marriage
  runReproductionSystem(world, cfg, rng, content); // births → children + lineage
  runHealthSystem(world, cfg, rng);      // illness, ageing, death → tombstones
  runMoodSystem(world, cfg);             // daily well-being: home / family / solvency / health → mood
  runStatusSystem(world, cfg);           // daily social standing/reputation from deeds & means (M14)
  runCivicSystem(world, cfg);            // functional buildings: infirmary heals, tavern cheers (M21)
  runCivicBuildSystem(world, cfg, content); // the town raises new civic buildings as it grows (M21)
  runOrgSystem(world, cfg, rng);         // tribes: leadership succession, extinction, schism (M14)
  runResearchSystem(world, cfg, content); // tribes accumulate research & climb the tech ladder (M17)
  runAchievementSystem(world, cfg);      // civ + agent milestones fire once (M17)
  runLegendSystem(world, cfg);           // enshrine notable folk as historical figures (M20)
  runArtifactSystem(world, cfg);         // master-crafted masterworks become named artifacts (M20 s2)
  runArchaeologySystem(world, cfg);      // ruins of fallen clans / lost relics, discoverable (M20 s2b)
  runQuestSystem(world, cfg);            // folk take up & fulfil procedural goals (hunt/avenge/explore) (M20 s3)
  runWonderSystem(world, cfg, content);  // the town raises tech-gated mega-projects (M20 s3b)
  runVoyageSystem(world, cfg, rng);      // sea trade: a merchant sails to the island → first contact + trade (M25 s3)
  runAISystem(world, cfg, provider);     // the "soul": reflection / dialogue / dreams / decisions (rare)
  runMemorySystem(world, cfg);           // multi-resolution rollup: old memories → episodic summaries
  runHistorySystem(world, cfg);          // world history: sample strata + compress the Chronicle
  runEventSystem(world, cfg, rng, content); // world events: harvests/festivals/discoveries → effects + feed/Chronicle (M19)
  runEvolutionSystem(world, cfg, rng);   // culture & language drift (generational, off the hot path)
  runReligionSystem(world, cfg, rng);    // faiths: extinction + schism into sects over the eras (M18)
  runFaunaSystem(world, cfg, rng);       // fauna instinct (graze / breed / die)
  runFishSystem(world, cfg, rng);        // aquatic life: fish swim & breed in the water (M24)
  runCombatSystem(world, cfg, rng);      // predators threaten folk; folk fight back (M16)
  runCrimeSystem(world, cfg, rng);       // crime & vice: theft / assault / murder + rough justice (M16)
  runMagicSystem(world, cfg, rng);       // mages cast their school's spells on neighbours (M17)
  runSpecialAgentSystem(world, cfg, rng, content); // monsters roam, menace, & are slain (M21)
}

export function runTicks(
  world: World, rng: RNG, cfg: SimConfig, clockEntity: EntityId, content: Content, n: number,
  provider: AIProvider = stubProvider,
): void {
  for (let i = 0; i < n; i++) tick(world, rng, cfg, clockEntity, content, provider);
}
