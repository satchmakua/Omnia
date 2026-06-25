// Economy dashboard (M6.5 slice 3, hotkey E): the town's livelihood at a glance —
// wealth distribution, employment, and every business with its staff and balance.
import type { World } from '../sim/ecs.ts';
import { C_AGENT, C_JOB, C_BUSINESS, C_MAGIC } from '../sim/components.ts';
import type { Agent, Job, Business } from '../sim/components.ts';
import { wealthStats } from '../sim/wealth.ts';
import { adultWealthGini } from '../analysis/metrics.ts';
import { ageInYears, defaultConfig } from '../sim/config.ts';
import { ModalPanel, SECTION } from './modalPanel.ts';

function metric(label: string, value: string, color = '#e6e6f0'): string {
  return `<div style="background:rgba(255,255,255,0.05);border-radius:7px;padding:8px 10px;min-width:88px">
    <div style="color:#9ab;font-size:11px">${label}</div>
    <div style="font-size:18px;color:${color}">${value}</div></div>`;
}

export class EconomyDashboard extends ModalPanel {
  constructor() { super('Economy', '600px'); }

  toggle(world: World): void { if (this.visible) this.hide(); else { this.reveal(); this.render(world); } }
  refresh(world: World): void { if (this.visible) this.render(world); }
  /** Render into the (master-hosted) content element, regardless of standalone visibility. */
  update(world: World): void { this.render(world); }

  private render(world: World): void {
    const w = wealthStats(world);
    const giniAdults = adultWealthGini(world, defaultConfig);
    const folk = world.query(C_AGENT);
    let employed = 0, adults = 0;
    for (const e of folk) {
      if (world.hasComponent(e, C_JOB)) employed++;
      if (ageInYears(world.getComponent<Agent>(e, C_AGENT)!.ticksAlive, defaultConfig) >= defaultConfig.adultAgeYears) adults++;
    }

    const staffByBiz = new Map<number, number>();
    for (const e of world.query(C_AGENT, C_JOB)) {
      const j = world.getComponent<Job>(e, C_JOB)!;
      staffByBiz.set(j.employer, (staffByBiz.get(j.employer) ?? 0) + 1);
    }

    const rows = world.query(C_BUSINESS).map(e => {
      const b = world.getComponent<Business>(e, C_BUSINESS)!;
      const staff = staffByBiz.get(e) ?? 0;
      const full = staff >= b.maxEmployees;
      return `<tr style="border-top:1px solid rgba(255,255,255,0.06)">
        <td style="padding:4px 8px 4px 0"><span style="color:${b.color}">●</span> ${b.professionName}${b.requiresAptitude ? ' <span style="color:#d090f0">✦</span>' : ''}</td>
        <td style="padding:4px 8px;text-align:center;color:${full ? '#8fe88f' : '#ccd'}">${staff}/${b.maxEmployees}</td>
        <td style="padding:4px 8px;text-align:right">${b.balance.toFixed(0)}g</td>
        <td style="padding:4px 0;text-align:right;color:#9ab">${(b.wagePerTick * defaultConfig.ticksPerDay).toFixed(1)}/day</td>
      </tr>`;
    }).join('');

    this.body.innerHTML = `
      <div style="${SECTION}">Wealth</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${metric('Median', `${Math.round(w.median)}g`)}
        ${metric('Range', `${Math.round(w.min)}–${Math.round(w.max)}g`)}
        ${metric('Gini · all', w.gini.toFixed(2), w.gini > 0.6 ? '#ff9ad0' : '#8fe88f')}
        ${metric('Gini · adults', giniAdults.toFixed(2), giniAdults > 0.6 ? '#ff9ad0' : '#8fe88f')}
        ${metric('In debt', String(w.inDebt), w.inDebt > 0 ? '#ff9a6a' : '#8fe88f')}
      </div>
      <div style="color:#889;font-size:11px;margin-top:4px">
        Gini = wealth inequality (<b>0</b> all equal · <b>1</b> one holds everything). <b>All</b> counts every soul by gold —
        children are dependents (always 0g), so they pull it up; <b>adults</b> is the real working economy. Debt is bounded;
        the jobless scrape by on odd jobs.
      </div>
      <div style="${SECTION}">Employment</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${metric('Folk', String(folk.length))}
        ${metric('Adults', String(adults))}
        ${metric('Employed', String(employed))}
        ${metric('Jobless', String(Math.max(0, adults - employed)), (adults - employed) > 0 ? '#e8d28f' : '#8fe88f')}
        ${metric('Mages', String(world.query(C_AGENT, C_MAGIC).length), '#d090f0')}
      </div>
      <div style="${SECTION}">Businesses</div>
      <table style="width:100%;border-collapse:collapse">
        <tr style="color:#9ab"><td style="padding-bottom:3px">Trade</td><td style="text-align:center">Staff</td><td style="text-align:right">Balance</td><td style="text-align:right">Wage</td></tr>
        ${rows || '<tr><td style="color:#778">no businesses</td></tr>'}
      </table>`;
  }
}
