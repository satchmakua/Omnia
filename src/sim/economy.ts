// Pure money helpers shared by the EconomySystem and tests. The invariant they
// preserve: gold is never negative — shortfalls become tracked debt, and income
// pays down debt before adding to gold (ARCHITECTURE: "no negative wallet without
// a debt record").
import type { Wallet } from './components.ts';

export function netWorth(w: Wallet): number {
  return w.gold - w.debt;
}

// Add income, paying off debt first.
export function earn(w: Wallet, amount: number): void {
  if (amount <= 0) return;
  if (w.debt > 0) {
    const paid = Math.min(w.debt, amount);
    w.debt -= paid;
    amount -= paid;
  }
  w.gold += amount;
}

// Spend; any shortfall is added to debt rather than going negative.
export function spend(w: Wallet, amount: number): void {
  if (amount <= 0) return;
  if (w.gold >= amount) {
    w.gold -= amount;
  } else {
    w.debt += amount - w.gold;
    w.gold = 0;
  }
}
