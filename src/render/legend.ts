// The on-screen legend key (M6.5): a small minimizable panel that names every map
// symbol, so the category-first icons are self-explanatory. Built once from the
// shared icons module; minimized via its header caret, or hidden with the 'L' key.
import { CATEGORY_COLOR, iconSvgInner, LEGEND_ENTRIES } from './icons.ts';
import { makePanel } from './panelUtil.ts';

function swatch(inner: string): string {
  return `<span style="display:inline-flex;width:24px;height:24px;border-radius:5px;background:#12131c;
    align-items:center;justify-content:center">
    <svg width="22" height="22" viewBox="-12 -12 24 24">${inner}</svg></span>`;
}

export class Legend {
  private readonly panel: HTMLDivElement;
  private visible = true;

  constructor() {
    const { panel, body } = makePanel({
      title: 'Legend',
      style: { position: 'fixed', left: '12px', top: '40px', width: '150px' },
    });
    this.panel = panel;

    const rows = LEGEND_ENTRIES.map(({ key, label }) => {
      const color = CATEGORY_COLOR[key as keyof typeof CATEGORY_COLOR];
      return `<div style="display:flex;align-items:center;gap:8px;margin:3px 0">
        ${swatch(iconSvgInner(key, color))}<span>${label}</span></div>`;
    }).join('');

    const hostile = `<div style="display:flex;align-items:center;gap:8px;margin:3px 0;opacity:0.65">
      <span style="display:inline-flex;width:24px;height:24px;border-radius:5px;background:#12131c;
        align-items:center;justify-content:center;border:1px dashed ${CATEGORY_COLOR.hostile}">
        <svg width="22" height="22" viewBox="-12 -12 24 24">${iconSvgInner('hostile', CATEGORY_COLOR.hostile)}</svg></span>
      <span>Hostile<span style="color:#778"> · soon</span></span></div>`;

    body.innerHTML = `${rows}${hostile}` +
      `<div style="margin-top:8px;color:#889;border-top:1px solid rgba(255,255,255,0.08);padding-top:6px">` +
      `<span style="color:#c79bf0">✦</span> mage &nbsp; <span style="color:#e06666">✚</span> ill &nbsp; child = smaller</div>` +
      `<div style="margin-top:6px;color:#667">L to hide</div>`;

    document.body.appendChild(this.panel);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.panel.style.display = this.visible ? 'block' : 'none';
  }
}
