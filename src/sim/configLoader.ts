// YAML config loader (M9): make `config/simulation.yaml` the authoritative runtime
// tunables. Edit the YAML to change the sim without recompiling. The loader merges
// the YAML over `defaultConfig` (so the YAML may be partial — omitted keys fall back
// to the typed defaults) and validates fail-loud: unknown keys and non-numbers abort
// with a clear message, the way content does (CONTENT_AND_DATA). Pure (takes the YAML
// text); the browser supplies it via a `?raw` import, the soak/tests via `fs`.
import { parse } from 'yaml';
import { defaultConfig } from './config.ts';
import type { SimConfig } from './config.ts';

export function loadSimConfig(yamlText: string): SimConfig {
  let parsed: unknown;
  try { parsed = parse(yamlText) ?? {}; }
  catch (e) { throw new Error(`simulation.yaml: invalid YAML (${(e as Error).message})`); }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('simulation.yaml: expected a mapping of tunables');
  }

  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!(key in defaultConfig)) throw new Error(`simulation.yaml: unknown tunable "${key}"`);
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`simulation.yaml: "${key}" must be a finite number (got ${JSON.stringify(value)})`);
    }
  }

  return { ...defaultConfig, ...(parsed as Partial<SimConfig>) };
}
