import {
  CROPS,
  formatDuration,
  formatNumber,
  growMs,
  isRipe,
  level,
  unlockedCrops,
  xpForLevel,
  type CropId,
  type FailReason,
  type ItemId,
  type Me,
  type SimEvent,
} from '@pixel-farm/shared';
import type { Command, Store } from '../game/store.js';
import { locale, t } from '../i18n/index.js';
import type { FarmScene } from '../scenes/FarmScene.js';
import { clear, h, sprite } from './dom.js';
import { floater, toast } from './effects.js';
import { buzz } from './prefs.js';
import { renderSettings } from './settings.js';
import { ITEM_SPRITE, buildSheet, type Sheet, type SheetKind } from './sheets.js';
import { Tutorial } from './tutorial.js';

const FAIL_TOAST: Partial<Record<FailReason, string>> = { coins: 'toast.coins', locked: 'toast.locked', items: 'toast.items' };
const SEED_KEY = 'pf:seed';

/** Owns the DOM around the canvas: HUD, bottom bar, sheets, toasts, tutorial. */
export class Ui {
  scene: FarmScene | null = null;
  private me: Me | null = null;
  private sheetKind: SheetKind | null = null;
  private sheet: Sheet | null = null;
  private autoField: number | null = null;
  private seed: CropId = 'wheat';
  private tutorial: Tutorial;
  private dirty = false;

  private hud = {
    coins: h('span', { class: 'value', 'data-testid': 'coins' }),
    level: h('span', { class: 'label' }),
    xp: h('div', { class: 'xp-fill' }),
    combo: h('div', { class: 'combo', hidden: true }),
    seedIcon: sprite('wheat', 2),
    seedLabel: h('span'),
  };
  private sheetEl = h('div', { class: 'sheet', hidden: true, role: 'dialog', 'aria-modal': 'true' });
  private bar = h('nav', { class: 'bar' });

  constructor(private store: Store) {
    try {
      const s = localStorage.getItem(SEED_KEY) as CropId | null;
      if (s && s in CROPS) this.seed = s;
    } catch {
      // ignore
    }
    this.mount();
    this.tutorial = new Tutorial(store, () => this.scene, () => this.sheetKind);
    this.tutorial.render();
    store.subscribe((events) => this.onEvents(events));
    const loop = () => {
      if (this.dirty) {
        this.dirty = false;
        this.updateHud();
        this.sheet?.update();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    this.updateHud();
  }

  // ---------------------------------------------------------------- layout

  private mount(): void {
    const hud = h(
      'header',
      { class: 'hud' },
      h('div', { class: 'pill coins' }, sprite('coin', 2), this.hud.coins),
      h('div', { class: 'pill level' }, sprite('star', 2), h('div', { class: 'level-text' }, this.hud.level, h('div', { class: 'xp' }, this.hud.xp))),
      h('button', { class: 'pill seed', 'data-open': 'seeds', on: { click: () => this.open('seeds') } }, this.hud.seedIcon, this.hud.seedLabel),
    );
    this.fillBar();
    document.getElementById('hud-slot')!.replaceWith(hud);
    document.body.append(this.hud.combo, this.sheetEl, this.bar);
    this.sheetEl.addEventListener('click', (e) => {
      if (e.target === this.sheetEl) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
  }

  private fillBar(): void {
    clear(this.bar);
    const btn = (kind: SheetKind, icon: string) =>
      h('button', { 'data-open': kind, on: { click: () => (this.sheetKind === kind ? this.close() : this.open(kind)) } }, sprite(icon, 2), h('span', null, t(`bar.${kind}`)));
    this.bar.append(btn('shop', 'coin'), btn('barn', 'barn-icon'), btn('orders', 'sign'), btn('settings', 'gear'));
  }

  /** Language changed: rebuild every label. */
  relabel(): void {
    this.fillBar();
    this.tutorial.relabel();
    if (this.sheetKind) this.open(this.sheetKind);
    this.updateHud();
  }

  // ---------------------------------------------------------------- sheets

  open(kind: SheetKind, opts: { autoField?: number } = {}): void {
    this.sheetKind = kind;
    this.autoField = opts.autoField ?? null;
    this.render();
  }

  close(): void {
    this.sheetKind = null;
    this.sheet = null;
    this.sheetEl.hidden = true;
    clear(this.sheetEl);
    this.bar.querySelectorAll('[data-open]').forEach((b) => b.classList.remove('active'));
  }

  private render(): void {
    const kind = this.sheetKind;
    if (!kind) return;
    const sheet = buildSheet(kind, {
      store: this.store,
      act: (cmd, at) => this.act(cmd, at),
      close: () => this.close(),
      rerender: () => this.render(),
      seed: { get: () => this.seed, set: (c) => this.setSeed(c) },
      autoField: this.autoField,
      settings: (body) =>
        renderSettings(body, {
          onLocaleChange: () => this.relabel(),
          restartTutorial: () => {
            this.close();
            this.tutorial.restart();
          },
          me: () => this.me,
          refreshMe: () => this.refreshMe(),
        }),
    });
    this.sheet = sheet;
    const panel = h(
      'div',
      { class: 'panel', data: { sheet: kind } },
      h('div', { class: 'panel-head' }, sprite(sheet.icon, 2), h('h2', null, sheet.title), h('button', { class: 'close', 'aria-label': t('common.close'), on: { click: () => this.close() } }, '✕')),
      h('div', { class: 'panel-body' }, sheet.body),
    );
    clear(this.sheetEl);
    this.sheetEl.append(panel);
    this.sheetEl.hidden = false;
    this.bar.querySelectorAll<HTMLElement>('[data-open]').forEach((b) => b.classList.toggle('active', b.dataset.open === kind));
    sheet.update();
  }

  // ---------------------------------------------------------------- actions

  act(cmd: Command, at?: { x: number; y: number }): boolean {
    const r = this.store.dispatch(cmd);
    if (!r.ok) {
      const fail = r.events.find((e) => e.type === 'fail');
      const key = fail?.type === 'fail' ? FAIL_TOAST[fail.reason] : undefined;
      if (key) toast(t(key), fail?.type === 'fail' && fail.reason === 'coins' ? 'coin' : 'lock');
      return false;
    }
    for (const e of r.events) {
      if (e.type === 'coins' && at && e.source !== 'mill') floater(at, `+${formatNumber(e.amount, locale())}`, 'coin');
      if (e.type === 'bought') {
        buzz(15);
        this.tutorial.done('buy');
      }
      if (e.type === 'orderDone') this.tutorial.done('order');
    }
    if (cmd.type === 'sell') this.tutorial.done('sell');
    if (cmd.type === 'plant') this.tutorial.done('plant');
    return true;
  }

  windmill(at: { x: number; y: number }): void {
    if (this.act({ type: 'tap' }, at)) {
      this.scene?.spin();
      buzz(8);
      this.tutorial.done('tap');
    }
  }

  field(i: number, at: { x: number; y: number }): void {
    const s = this.store.state;
    const f = s.fields[i];
    if (!f) return;
    if (f.crop && isRipe(s, f, Date.now())) {
      const r = this.store.dispatch({ type: 'harvest', field: i });
      for (const e of r.events) {
        if (e.type === 'harvest') {
          floater(at, `+${e.qty}`, ITEM_SPRITE[e.crop]);
          this.scene?.pop(i);
          if (e.combo > 1) this.showCombo(e.combo);
        }
      }
      if (r.ok) {
        buzz(12);
        this.tutorial.done('harvest');
      }
      return;
    }
    if (f.auto) return this.open('seeds', { autoField: i });
    if (f.crop) {
      const left = (f.plantedAt + growMs(s, f.crop) - Date.now()) / 1000;
      floater(at, `⏳ ${formatDuration(left)}`);
      return;
    }
    const seed = unlockedCrops(s).includes(this.seed) ? this.seed : 'wheat';
    this.act({ type: 'plant', field: i, crop: seed }, at);
  }

  setSeed(c: CropId): void {
    this.seed = c;
    try {
      localStorage.setItem(SEED_KEY, c);
    } catch {
      // ignore
    }
    this.updateHud();
  }

  private showCombo(mult: number): void {
    const el = this.hud.combo;
    el.textContent = t('hud.combo', { mult: mult.toFixed(1) });
    el.hidden = false;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
    clearTimeout((el as HTMLElement & { timer?: number }).timer);
    (el as HTMLElement & { timer?: number }).timer = window.setTimeout(() => (el.hidden = true), 1600);
  }

  // ---------------------------------------------------------------- store events

  private onEvents(events: SimEvent[]): void {
    this.dirty = true;
    for (const e of events) {
      if (e.type === 'levelUp') {
        const names = e.unlocks.map(unlockName).filter(Boolean).join(', ');
        toast(t('toast.levelUp', { level: e.level }) + (names ? ` ${t('toast.unlocked', { list: names })}` : ''), 'star', 4000);
        buzz(30);
      }
    }
  }

  private updateHud(): void {
    const s = this.store.state;
    const lvl = level(s);
    this.hud.coins.textContent = formatNumber(s.coins, locale());
    this.hud.level.textContent = t('hud.level', { level: lvl });
    const from = xpForLevel(lvl);
    const to = xpForLevel(lvl + 1);
    this.hud.xp.style.width = `${Math.round(((s.xp - from) / (to - from)) * 100)}%`;
    this.hud.seedIcon.src = `/sprites/${this.seed}.png`;
    this.hud.seedLabel.textContent = t(`items.${this.seed}.name`);
  }

  // ---------------------------------------------------------------- account & welcome

  async refreshMe(): Promise<void> {
    try {
      const res = await fetch('/api/me', { cache: 'no-store' });
      this.me = res.ok ? ((await res.json()) as Me) : null;
    } catch {
      // offline: keep what we had
    }
  }

  welcome(awayMs: number, events: SimEvent[]): void {
    if (awayMs < 120_000) return;
    let coins = 0;
    const items = new Map<ItemId, number>();
    for (const e of events) {
      if (e.type === 'coins') coins += e.amount;
      if (e.type === 'harvest') items.set(e.crop, (items.get(e.crop) ?? 0) + e.qty);
      if (e.type === 'produce') items.set(e.good, (items.get(e.good) ?? 0) + e.qty);
    }
    if (!coins && !items.size) return;
    const modal = h(
      'div',
      { class: 'sheet modal', role: 'dialog', 'aria-modal': 'true' },
      h(
        'div',
        { class: 'panel welcome' },
        h('div', { class: 'panel-head' }, sprite('barn-icon', 2), h('h2', null, t('welcome.title'))),
        h(
          'div',
          { class: 'panel-body' },
          h('p', null, t('welcome.away', { time: formatDuration(Math.min(awayMs, 24 * 3600_000) / 1000) })),
          h(
            'ul',
            { class: 'gains' },
            coins ? h('li', null, sprite('coin', 2), t('welcome.coins', { amount: formatNumber(coins, locale()) })) : null,
            ...[...items].map(([item, n]) => h('li', null, sprite(ITEM_SPRITE[item], 2), t(`items.${item}.count`, { count: n }))),
          ),
          h('button', { class: 'primary', on: { click: () => modal.remove() } }, t('welcome.ok')),
        ),
      ),
    );
    document.body.append(modal);
  }
}

function unlockName(u: string): string {
  const [kind, id] = u.split(':');
  if (kind === 'crop') return t(`items.${id}.name`);
  if (kind === 'animal') return t(`animals.${id}.name`);
  if (kind === 'helper') return t(`helpers.${id}.name`);
  if (kind === 'land') return t('toast.land');
  return '';
}
