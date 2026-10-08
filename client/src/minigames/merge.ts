import { MERGE, type MergeDir, type MergeMove, type MergeState } from '@pixel-farm/shared';
import { h, sprite } from '../ui/dom.js';
import type { Renderer } from './types.js';

const SWIPE_PX = 24;
const KEYS: Record<string, MergeDir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

export const mergeBoard: Renderer<MergeState, MergeMove> = (send, fx) => {
  const grid = h('div', { class: 'mg-grid merge', style: `grid-template-columns: repeat(${MERGE.size}, 1fr)` });
  const cells = Array.from({ length: MERGE.size ** 2 }, () => {
    const img = sprite('seed', 3);
    img.hidden = true;
    const cell = h('div', { class: 'mg-cell merge-cell', data: { level: '0' } }, img);
    grid.append(cell);
    return { cell, img, level: 0 };
  });
  const go = (dir: MergeDir) => {
    if (send({ dir })) fx.buzz(6);
    else grid.animate([{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], 160);
  };

  let start: { x: number; y: number } | null = null;
  grid.addEventListener('pointerdown', (e) => {
    start = { x: e.clientX, y: e.clientY };
    grid.setPointerCapture(e.pointerId);
  });
  grid.addEventListener('pointerup', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
    go(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  });
  grid.style.touchAction = 'none';
  const onKey = (e: KeyboardEvent) => {
    const dir = KEYS[e.key];
    if (dir && grid.isConnected) {
      e.preventDefault();
      go(dir);
    }
  };
  document.addEventListener('keydown', onKey);

  const arrows = h(
    'div',
    { class: 'merge-arrows' },
    ...(['left', 'up', 'down', 'right'] as const).map((d) =>
      h('button', { class: 'arrow', data: { dir: d }, 'aria-label': d, on: { click: () => go(d) } }, { left: '◀', up: '▲', down: '▼', right: '▶' }[d]),
    ),
  );
  const el = h('div', { class: 'merge-wrap' }, grid, arrows);

  return {
    el,
    draw(s) {
      if (!el.isConnected) document.removeEventListener('keydown', onKey);
      cells.forEach((c, i) => {
        const level = s.grid[i]!;
        if (level === c.level) return;
        const grew = level > c.level && c.level > 0;
        c.level = level;
        c.img.hidden = !level;
        if (level) c.img.src = `/sprites/${MERGE.tiles[level - 1]}.png`;
        c.cell.dataset.level = String(level);
        if (grew) c.cell.animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], 180);
      });
    },
  };
};
