// Wealth-distribution metric (M3). A fixed-size summary of the town's net worth,
// the seed of the statistical strata that will feed world-health charts (M6).
import type { World } from './ecs.ts';
import { C_AGENT, C_WALLET } from './components.ts';
import type { Wallet } from './components.ts';
import { netWorth } from './economy.ts';

export interface WealthStats {
  count: number;
  min: number;
  median: number;
  mean: number;
  max: number;
  gini: number;     // 0 = perfectly equal, →1 = maximally unequal (over non-negative gold)
  inDebt: number;   // how many agents currently owe more than they hold
}

// Gini coefficient over non-negative values (gold holdings). Returns 0 for an
// empty or all-zero set.
export function gini(values: number[]): number {
  const v = values.filter(x => x >= 0);
  const n = v.length;
  if (n === 0) return 0;
  const total = v.reduce((s, x) => s + x, 0);
  if (total === 0) return 0;
  const sorted = [...v].sort((a, b) => a - b);
  let cum = 0;
  for (let i = 0; i < n; i++) cum += (i + 1) * sorted[i];
  // Standard Gini from sorted values.
  return (2 * cum) / (n * total) - (n + 1) / n;
}

export function wealthStats(world: World): WealthStats {
  const wallets: Wallet[] = [];
  for (const e of world.query(C_AGENT, C_WALLET)) {
    wallets.push(world.getComponent<Wallet>(e, C_WALLET)!);
  }
  const n = wallets.length;
  if (n === 0) return { count: 0, min: 0, median: 0, mean: 0, max: 0, gini: 0, inDebt: 0 };

  const nets = wallets.map(netWorth).sort((a, b) => a - b);
  const sum = nets.reduce((s, x) => s + x, 0);
  const median = n % 2
    ? nets[(n - 1) / 2]
    : (nets[n / 2 - 1] + nets[n / 2]) / 2;

  return {
    count: n,
    min: nets[0],
    median,
    mean: sum / n,
    max: nets[n - 1],
    gini: gini(wallets.map(w => w.gold)),
    inDebt: wallets.filter(w => w.debt > 0).length,
  };
}
