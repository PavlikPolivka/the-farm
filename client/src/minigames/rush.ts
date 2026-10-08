import { RUSH, popupAt, type RushMove, type RushState } from '@pixel-farm/shared';
import { h, sprite } from '../ui/dom.js';
import type { Renderer } from './types.js';

export const rushBoard: Renderer<RushState, RushMove> = (send, fx) => {
  const el = h('div', { class: 'mg-grid rush', style: `grid-template-columns: repeat(${RUSH.cols}, 1fr)` });
  let state: RushState | null = null;
  const cells = Array.from({ length: RUSH.cols * RUSH.rows }, (_, i) => {
    const img = sprite('wheat-3', 3);
    img.hidden = true;
    const btn = h('button', { class: 'mg-cell plot', data: { cell: String(i) } }, img);
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!state) return;
      const before = state.points;
      if (send({ tap: i })) {
        const diff = state.points - before;
        fx.pop(btn, diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : '0', diff > 0);
        fx.buzz(diff > 0 ? 8 : 30);
      }
    });
    el.append(btn);
    return { btn, img, src: '' };
  });
  return {
    el,
    draw(s, t) {
      state = s;
      cells.forEach((c, i) => {
        const p = popupAt(s, i, t);
        const show = p >= 0 && !s.tapped[p];
        const pop = s.popups[p];
        const src = show && pop ? `/sprites/${pop.kind === 'weed' ? 'weed' : `${RUSH.crops[pop.crop]}-${pop.kind === 'ripe' ? 3 : 1}`}.png` : '';
        if (src !== c.src) {
          c.src = src;
          c.img.hidden = !src;
          if (src) c.img.src = src;
        }
        c.btn.classList.toggle('ripe', show && pop?.kind === 'ripe');
      });
    },
  };
};
