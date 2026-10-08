import { PEXESO, type PexesoMove, type PexesoState } from '@pixel-farm/shared';
import { h, sprite } from '../ui/dom.js';
import type { Renderer } from './types.js';

/** A wrong pair stays readable this long, then shows its backs (the engine flips it on the next tap). */
const SHOW_MS = 1000;

export const pexesoBoard: Renderer<PexesoState, PexesoMove> = (send, fx) => {
  const el = h('div', { class: 'mg-grid pexeso', style: 'grid-template-columns: repeat(4, 1fr)' });
  let flippedAt = 0;
  let now = 0;
  const cards = Array.from({ length: PEXESO.cards }, (_, i) => {
    const img = sprite('card-back', 3);
    const btn = h('button', { class: 'mg-cell card', data: { cell: String(i) }, 'aria-label': `${i + 1}` }, img);
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (send({ flip: i })) {
        flippedAt = now;
        fx.buzz(8);
      }
    });
    return { btn, img, face: '' };
  });
  el.append(...cards.map((c) => c.btn));
  return {
    el,
    draw(s, t) {
      now = t;
      const hideWrong = s.up.length === 2 && t - flippedAt > SHOW_MS;
      cards.forEach((c, i) => {
        const shown = s.matched[i] || (s.up.includes(i) && !hideWrong);
        const face = shown ? PEXESO.faces[s.cards[i]!]! : 'card-back';
        if (face !== c.face) {
          c.face = face;
          c.img.src = `/sprites/${face}.png`;
        }
        c.btn.classList.toggle('up', !!shown);
        c.btn.classList.toggle('matched', s.matched[i]!);
      });
    },
  };
};
