export const C_POSITION = 'Position';
export const C_NEEDS    = 'Needs';
export const C_WALLET   = 'Wallet';
export const C_AGENT    = 'Agent';
export const C_FOOD     = 'Food';
export const C_CLOCK    = 'Clock';

export interface Position {
  x: number;
  y: number;
}

export interface Needs {
  hunger: number;  // 0..1; 1 = full, 0 = starving
  energy: number;  // 0..1; 1 = rested, 0 = exhausted
}

export interface Wallet {
  gold: number;
}

export type AgentAction = 'wander' | 'seek_food' | 'sleep';

export interface Agent {
  name: string;
  action: AgentAction;
  ticksAlive: number;
}

export interface Food {
  amount: number;       // 0..1
  regenPerTick: number;
}

export interface Clock {
  tick: number;
  day: number;
  hour: number;   // 0..23 within the current day
  isDay: boolean;
}
