import { EGGS, type EggsMove, type EggsState } from '@pixel-farm/shared';
import { h, sprite } from '../ui/dom.js';
import type { Renderer } from './types.js';

export const eggsBoard: Renderer<EggsState, EggsMove> = (send, fx) => {
  const el = h('div', { class: 'mg-grid eggs', style: 'grid-template-columns: repeat(3, 1fr)' });
  let selected: number | null = null;
  let state: EggsState | null = null;
  let drawn = '';
  const baskets = Array.from({ length: EGGS.baskets }, (_, i) => {
    const stack = h('div', { class: 'egg-stack' });
    const btn = h('button', { class: 'mg-cell basket', data: { basket: String(i) } }, stack);
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!state) return;
      if (selected === null) {
        if (state.baskets[i]!.length) selected = i;
      } else if (selected === i) {
        selected = null;
      } else {
        const ok = send({ from: selected, to: i });
        if (!ok) btn.animate([{ transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }], 180);
        fx.buzz(ok ? 8 : 30);
        selected = null;
      }
      drawn = '';
    });
    el.append(btn);
    return { btn, stack };
  });
  return {
    el,
    draw(s) {
      state = s;
      const key = JSON.stringify(s.baskets) + selected;
      if (key === drawn) return;
      drawn = key;
      baskets.forEach((b, i) => {
        const eggs = s.baskets[i]!;
        b.stack.replaceChildren(...eggs.map((kind, k) => {
          const img = sprite(`egg-${kind}`, 3);
          if (selected === i && k === eggs.length - 1) img.classList.add('lifted');
          return img;
        }));
        const full = eggs.length === EGGS.capacity && eggs.every((e) => e === eggs[0]);
        b.btn.classList.toggle('selected', selected === i);
        b.btn.classList.toggle('full', full);
      });
    },
  };
};
