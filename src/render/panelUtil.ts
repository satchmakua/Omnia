// A small shared chrome for the always-on overlay panels (M6.5): a header with a
// title and a caret that minimizes the panel to just its title bar. Keeps the
// legend, event feed, etc. consistent and lets the player tuck them away.

export interface Panel {
  panel: HTMLDivElement;
  body: HTMLDivElement;
}

export function makePanel(opts: {
  title: string;
  titleColor?: string;
  style: Partial<CSSStyleDeclaration>;
  collapsed?: boolean;
}): Panel {
  const panel = document.createElement('div');
  Object.assign(panel.style, {
    background: 'rgba(8,8,22,0.82)', color: '#dde', font: '11px/1.5 monospace',
    padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
    zIndex: '4', userSelect: 'none',
  } as Partial<CSSStyleDeclaration>, opts.style);

  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    cursor: 'pointer', gap: '10px',
  } as Partial<CSSStyleDeclaration>);

  const title = document.createElement('span');
  title.textContent = opts.title;
  title.style.color = opts.titleColor ?? '#ffd278';
  title.style.fontWeight = 'bold';

  const caret = document.createElement('span');
  caret.style.color = '#99a';

  const body = document.createElement('div');

  let collapsed = false;
  const apply = () => {
    body.style.display = collapsed ? 'none' : '';
    caret.textContent = collapsed ? '▸' : '▾';
    body.style.marginTop = collapsed ? '0' : '6px';
  };
  header.addEventListener('click', () => { collapsed = !collapsed; apply(); });

  header.append(title, caret);
  panel.append(header, body);
  collapsed = !!opts.collapsed;
  apply();
  return { panel, body };
}
