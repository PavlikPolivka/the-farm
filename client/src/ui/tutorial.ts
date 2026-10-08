import { TUTORIAL_DONE, TUTORIAL_STEPS, isRipe, type TutorialStep } from '@pixel-farm/shared';
import type { Store } from '../game/store.js';
import { t } from '../i18n/index.js';
import type { FarmScene } from '../scenes/FarmScene.js';
import { h, sprite } from './dom.js';
import type { SheetKind } from './sheets.js';

const TAPS_NEEDED = 3;

/** The 6-step guided first session: a pointing hand plus one short line, skippable. */
export class Tutorial {
  private bubble = h('div', { class: 'tutorial', role: 'dialog', 'aria-live': 'polite' });
  private text = h('p');
  private hand = h('div', { class: 'pointer', 'aria-hidden': 'true' }, sprite('hand', 3));
  private taps = 0;
  private paused = false;

  constructor(
    private store: Store,
    private scene: () => FarmScene | null,
    private openSheet: () => SheetKind | null,
  ) {
    this.bubble.append(
      sprite('hand', 2),
      this.text,
      h('button', { class: 'skip', on: { click: () => this.set(TUTORIAL_DONE) } }, t('tutorial.skip')),
    );
    document.body.append(this.bubble, this.hand);
    const loop = () => {
      this.place();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** Hidden while a minigame covers the farm. */
  pause(on: boolean): void {
    this.paused = on;
    this.render();
  }

  get step(): TutorialStep | null {
    return TUTORIAL_STEPS[this.store.state.tutorial] ?? null;
  }

  /** Called by the UI when the player does something the guide may be waiting for. */
  done(what: TutorialStep): void {
    if (this.step !== what) return;
    if (what === 'tap' && ++this.taps < TAPS_NEEDED) return;
    this.set(this.store.state.tutorial + 1);
  }

  restart(): void {
    this.taps = 0;
    this.set(0);
  }

  relabel(): void {
    const skip = this.bubble.querySelector('.skip');
    if (skip) skip.textContent = t('tutorial.skip');
    this.render();
  }

  private set(step: number): void {
    this.store.dispatch({ type: 'tutorial', step });
    this.render();
  }

  render(): void {
    const step = this.step;
    this.bubble.hidden = step === null || this.paused;
    this.hand.hidden = step === null || this.paused;
    if (step) this.text.textContent = t(`tutorial.${step}`);
  }

  private place(): void {
    const step = this.step;
    if (!step || this.paused) return;
    const sheet = this.openSheet();
    this.bubble.classList.toggle('top', sheet !== null);
    const target = this.target(step, sheet);
    this.hand.hidden = !target;
    if (target) {
      // The fingertip is at (7, 0) of the 16 px sprite, drawn at 3x.
      this.hand.style.transform = `translate(${Math.round(target.x - 21)}px, ${Math.round(target.y + 4)}px)`;
    }
  }

  private target(step: TutorialStep, sheet: SheetKind | null): { x: number; y: number } | null {
    const scene = this.scene();
    const s = this.store.state;
    const el = (selector: string) => {
      const node = document.querySelector<HTMLElement>(selector);
      if (!node || node.offsetParent === null) return null;
      const r = node.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    switch (step) {
      case 'tap':
        return sheet ? null : (scene?.screenPos('windmill') ?? null);
      case 'plant': {
        const i = s.fields.findIndex((f) => !f.crop && !f.auto);
        return sheet || i < 0 ? null : (scene?.screenPos(`field:${i}`) ?? null);
      }
      case 'harvest': {
        const now = Date.now();
        let i = s.fields.findIndex((f) => f.crop && isRipe(s, f, now));
        if (i < 0) i = s.fields.findIndex((f) => f.crop);
        return sheet || i < 0 ? null : (scene?.screenPos(`field:${i}`) ?? null);
      }
      case 'sell':
        return sheet === 'barn' ? el('[data-sell$=":all"]:not([disabled])') : el('[data-open="barn"]');
      case 'buy':
        return sheet === 'shop' ? el('[data-buy]:not([disabled])') : el('[data-open="shop"]');
      case 'order':
        return sheet === 'orders' ? (el('[data-deliver]:not([disabled])') ?? el('[data-order]')) : el('[data-open="orders"]');
    }
  }
}
