import { PIPES, flow, rotateMask, type PipesMove, type PipesState } from '@pixel-farm/shared';
import { h, sprite } from '../ui/dom.js';
import type { Renderer } from './types.js';

/** Must match scripts/assets/generated.ts PIPE_SHAPES. */
const SHAPES = { end: 1, straight: 5, corner: 3, tee: 7, cross: 15 } as const;

/** Sprite and base rotation that draw a tile's unrotated openings. */
function shapeOf(mask: number): { shape: string; rot: number } {
  for (const [shape, m] of Object.entries(SHAPES)) for (let r = 0; r < 4; r++) if (rotateMask(m, r) === mask) return { shape, rot: r };
  return { shape: 'cross', rot: 0 };
}

export const pipesBoard: Renderer<PipesState, PipesMove> = (send, fx) => {
  const { w, h: rows } = PIPES;
  const el = h('div', { class: 'mg-grid pipes', style: `grid-template-columns: 0.6fr repeat(${w}, 1fr) 0.6fr` });
  const tiles: { btn: HTMLButtonElement; img: HTMLImageElement; shape: string; base: number; src: string; turns: number }[] = [];
  let built = false;

  const build = (s: PipesState) => {
    for (let y = 0; y < rows; y++) {
      el.append(h('div', { class: 'pipe-side' }, y === s.wellRow ? sprite('well', 2) : null));
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const { shape, rot } = shapeOf(s.masks[i]!);
        const img = sprite(`pipe-${shape}`, 3);
        const btn = h('button', { class: 'mg-cell pipe', data: { cell: String(i) } }, img);
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          if (send({ rotate: i })) fx.buzz(6);
        });
        tiles.push({ btn, img, shape, base: rot, src: '', turns: -1 });
        el.append(btn);
      }
      el.append(h('div', { class: 'pipe-side' }, y === s.fieldRow ? sprite('wheat-3', 2) : null));
    }
    built = true;
  };

  return {
    el,
    draw(s) {
      if (!built) build(s);
      const { wet, solved } = flow(s);
      tiles.forEach((tile, i) => {
        const src = `/sprites/pipe-${tile.shape}${wet[i] ? '-wet' : ''}.png`;
        if (src !== tile.src) tile.img.src = tile.src = src;
        // Count turns up (never wrap back to 0) so the CSS transition always spins clockwise.
        const target = s.rots[i]!;
        if (tile.turns < 0) tile.turns = tile.base + target;
        else while ((tile.turns - tile.base) % 4 !== target) tile.turns++;
        tile.img.style.transform = `rotate(${tile.turns * 90}deg)`;
      });
      el.classList.toggle('solved', solved);
    },
  };
};
