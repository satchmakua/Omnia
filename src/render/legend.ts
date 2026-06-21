// The on-screen legend key (M6.5): a small minimizable panel that names every map
// symbol, so the category-first icons are self-explanatory. Built once from the
// shared icons module; minimized via its header caret, or hidden with the 'L' key.
import { CATEGORY_COLOR, iconSvgInner, LEGEND_ENTRIES } from './icons.ts';
import { makePanel } from './panelUtil.ts';

// A legend swatch; `scale` < 1 shows a thing at reduced size (e.g. a child).
function swatch(inner: string, scale = 1): string {
  const g = scale === 1 ? inner : `<g transform="scale(${scale})">${inner}</g>`;
  return `<span style="display:inline-flex;width:24px;height:24px;border-radius:5px;background:#12131c;
    align-items:center;justify-content:center;flex:0 0 auto">
    <svg width="22" height="22" viewBox="-12 -12 24 24">${g}</svg></span>`;
}

export class Legend {
  private readonly panel: HTMLDivElement;
  private visible = true;

  constructor() {
    const { panel, body } = makePanel({
      title: 'Legend',
      style: { position: 'fixed', left: '12px', top: '40px', width: '186px' },
    });
    this.panel = panel;

    const rows = LEGEND_ENTRIES.map(({ key, label, desc }) => {
      const color = CATEGORY_COLOR[key as keyof typeof CATEGORY_COLOR];
      return `<div style="display:flex;align-items:center;gap:8px;margin:4px 0">
        ${swatch(iconSvgInner(key, color))}
        <span style="line-height:1.25"><b style="color:#dde">${label}</b>` +
        `<br><span style="color:#889;font-size:10px">${desc}</span></span></div>`;
    }).join('');

    const hostile = `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;opacity:0.65">
      <span style="display:inline-flex;width:24px;height:24px;border-radius:5px;background:#12131c;
        align-items:center;justify-content:center;border:1px dashed ${CATEGORY_COLOR.hostile};flex:0 0 auto">
        <svg width="22" height="22" viewBox="-12 -12 24 24">${iconSvgInner('hostile', CATEGORY_COLOR.hostile)}</svg></span>
      <span style="line-height:1.25"><b style="color:#dde">Hostile</b><br><span style="color:#778;font-size:10px">a threat · coming soon</span></span></div>`;

    // A child folk shown at the same reduced scale the map draws them.
    const child = `<div style="display:flex;align-items:center;gap:8px;margin:4px 0">
      ${swatch(iconSvgInner('folk', CATEGORY_COLOR.folk), 0.6)}
      <span style="line-height:1.25"><b style="color:#dde">Child</b><br><span style="color:#889;font-size:10px">a smaller folk icon</span></span></div>`;

    const badges =
      `<div style="margin-top:8px;border-top:1px solid rgba(255,255,255,0.08);padding-top:6px;color:#9ab">Folk badges</div>` +
      `<div style="margin:3px 0"><span style="color:#c79bf0">✦</span> has magic &nbsp; <span style="color:#e06666">✚</span> ill</div>` +
      `<div style="margin:3px 0;color:#cdd"><span style="color:#ffd24a;letter-spacing:1px">|||</span> seeking food &nbsp; <span style="color:#ffd24a">⊥</span> working</div>` +
      `<div style="margin:3px 0;color:#cdd">☾ sleeping &nbsp; ·· chatting</div>`;

    const phase = `<div style="margin:5px 0 0;color:#889"><span style="color:#ffe08a">☀</span> day &nbsp; <span style="color:#9ab">☾</span> night</div>`;

    body.innerHTML = rows + hostile + child + badges + phase +
      `<div style="margin-top:7px;color:#667">L hide · H happenings · Esc menu</div>`;

    document.body.appendChild(this.panel);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.panel.style.display = this.visible ? 'block' : 'none';
  }
}
