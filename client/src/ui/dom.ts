/** Tiny DOM builder: h('button', { class: 'big', on: { click } }, 'Label'). */
type Child = Node | string | number | null | undefined | false;
interface Props {
  class?: string;
  on?: Partial<{ [K in keyof HTMLElementEventMap]: (e: HTMLElementEventMap[K]) => void }>;
  data?: Record<string, string>;
  [attr: string]: unknown;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'on') for (const [ev, fn] of Object.entries(v as object)) el.addEventListener(ev, fn as EventListener);
      else if (k === 'data') for (const [dk, dv] of Object.entries(v as object)) el.dataset[dk] = String(dv);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(typeof c === 'object' ? c : String(c));
  return el;
}

/** A pixel sprite as an <img>, scaled by an integer factor (16 px * size). */
export function sprite(name: string, size = 2, alt = ''): HTMLImageElement {
  return h('img', { class: 'px', src: `/sprites/${name}.png`, width: 16 * size, height: 16 * size, alt, draggable: 'false' });
}

export function clear(el: Element): void {
  while (el.firstChild) el.firstChild.remove();
}
