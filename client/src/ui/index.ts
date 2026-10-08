import {
  ACHIEVEMENT_IDS,
  CROPS,
  achievementTier,
  canPrestige,
  offlineCapMs,
  formatDuration,
  formatNumber,
  growMs,
  isRipe,
  level,
  unlockedCrops,
  xpForLevel,
  type CropId,
  type FailReason,
  type GameId,
  type ItemId,
  type PlayResult,
  type SimEvent,
} from '@pixel-farm/shared';
import type { Command, Store } from '../game/store.js';
import type { Sync, SyncNotice } from '../game/sync.js';
import { locale, t } from '../i18n/index.js';
import { playGame, type PlayOutcome } from '../minigames/frame.js';
import type { FarmScene } from '../scenes/FarmScene.js';
import { clear, h, sprite } from './dom.js';
import { floater, toast } from './effects.js';
import { buzz } from './prefs.js';
import { renderSettings } from './settings.js';
import { ITEM_SPRITE, buildSheet, type Sheet, type SheetKind } from './sheets.js';
import { FamilyBar } from './social.js';
import { inboxSheet } from './inbox.js';
import { itemName } from './book.js';
import { sfx, type Sfx } from '../audio.js';
import { Visit } from './visit.js';
import { Tutorial } from './tutorial.js';

const FAIL_TOAST: Partial<Record<FailReason, string>> = { coins: 'toast.coins', seeds: 'toast.seeds', locked: 'toast.locked', items: 'toast.items' };
const SEED_KEY = 'pf:seed';

/** Owns the DOM around the canvas: HUD, bottom bar, sheets, toasts, tutorial. */
export class Ui {
  scene: FarmScene | null = null;
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
  private family: FamilyBar;
  private visit: Visit;
  /** Lit while the farm can move to new land. */
  private bookDot: HTMLElement | null = null;
  /** Medal count after the last event, to spot new achievements. */
  private medalTiers = '';

  constructor(
    private store: Store,
    private sync: Sync,
  ) {
    try {
      const s = localStorage.getItem(SEED_KEY) as CropId | null;
      if (s && s in CROPS) this.seed = s;
    } catch {
      // ignore
    }
    this.family = new FamilyBar(
      () => sync.me,
      () => this.open('boards'),
      () => this.open('settings'),
      () => (this.sheetKind === 'settings' ? this.close() : this.open('settings')),
      (m) => {
        this.close();
        void this.visit.open(m);
      },
      () => (this.sheetKind === 'inbox' ? this.close() : this.open('inbox')),
    );
    this.visit = new Visit(store, sync, () => this.scene, (on) => {
      this.family.visiting = on ? (this.visit.member?.id ?? null) : null;
      this.family.render();
      this.tutorial.pause(on);
    });
    this.mount();
    this.tutorial = new Tutorial(store, () => this.scene, () => this.sheetKind);
    this.tutorial.render();
    this.medalTiers = ACHIEVEMENT_IDS.map((id) => achievementTier(store.state, id)).join('');
    store.subscribe((events) => this.onEvents(events));
    sync.subscribe((notice) => this.onSync(notice));
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
    hud.after(this.family.el);
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
    this.bar.append(btn('shop', 'coin'), btn('barn', 'barn-icon'), btn('orders', 'sign'), btn('games', 'card-back'), btn('book', 'book'), btn('boards', 'trophy'));
    this.bookDot = h('span', { class: 'dot', hidden: true, 'data-testid': 'book-dot' });
    this.bar.querySelector('[data-open="book"]')!.append(this.bookDot);
  }

  /** Language changed: rebuild every label. */
  relabel(): void {
    this.fillBar();
    this.family.render();
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
          me: () => this.sync.me,
          refreshMe: () => this.sync.refreshMe(),
          sync: () => this.sync,
        }),
      me: () => this.sync.me,
      login: () => location.assign('/auth/login'),
      inbox: () => inboxSheet({ store: this.store, sync: this.sync, onChange: () => void this.family.refresh(true) }),
      games: {
        me: () => this.sync.me,
        login: () => location.assign('/auth/login'),
        toast: (text) => toast(text, 'lock'),
        playFree: (game) => this.play(game, (Math.random() * 2 ** 32) >>> 0, null),
        playDaily: (d) => this.play(d.game, d.seed, d.day),
      },
    });
    this.sheet = sheet;
    // Switching tabs re-renders the open sheet: only slide in when it first opens.
    const again = !this.sheetEl.hidden;
    const panel = h(
      'div',
      { class: again ? 'panel still' : 'panel', data: { sheet: kind } },
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
      const reason = fail?.type === 'fail' ? fail.reason : null;
      if (key) toast(t(key), reason === 'coins' ? 'coin' : reason === 'seeds' ? 'golden-seed' : 'lock');
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
      const sound = soundFor(e);
      if (sound) sfx(sound);
      if (e.type === 'levelUp') {
        const names = e.unlocks.map(unlockName).filter(Boolean).join(', ');
        toast(t('toast.levelUp', { level: e.level }) + (names ? ` ${t('toast.unlocked', { list: names })}` : ''), 'star', 4000);
        buzz(30);
      }
      if (e.type === 'found') {
        toast(t('toast.found', { name: itemName(e.id) }), e.id, 4000);
        buzz(30);
      }
      if (e.type === 'prestige') this.celebrate(e.seeds);
    }
    this.checkMedals();
  }

  /** Toasts every achievement tier reached since the last check. */
  private checkMedals(): void {
    const s = this.store.state;
    const tiers = ACHIEVEMENT_IDS.map((id) => achievementTier(s, id));
    const key = tiers.join('');
    if (key === this.medalTiers) return;
    const before = this.medalTiers;
    this.medalTiers = key;
    // Many at once means the farm was swapped (loaded from the server), not earned just now.
    if (!before || tiers.filter((n, i) => n > Number(before[i])).length > 3) return;
    ACHIEVEMENT_IDS.forEach((id, i) => {
      const was = Number(before[i]);
      if (tiers[i]! > was) sfx('medal');
      if (tiers[i]! > was) toast(t('toast.medal', { name: t(`book.ach.${id}.name`), medal: t(`book.tiers.${tiers[i]}`) }), `medal-${['', 'bronze', 'silver', 'gold'][tiers[i]!]}`, 4000);
    });
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
    if (this.bookDot) this.bookDot.hidden = !canPrestige(s);
  }

  // ---------------------------------------------------------------- sync & welcome

  // ---------------------------------------------------------------- minigames

  /** Runs a minigame over everything; free play offers another round with a new seed. */
  play(game: GameId, seed: number, daily: string | null): void {
    this.close();
    this.tutorial.pause(true);
    playGame({
      game,
      seed,
      daily,
      submit: (log) => this.submitPlay(game, seed, daily, log),
      again: daily ? undefined : () => this.play(game, (Math.random() * 2 ** 32) >>> 0, null),
      onClose: () => {
        this.tutorial.pause(false);
        this.open('games');
      },
    });
  }

  /** Sends the input log; the server replays it and grants the reward, applied to the farm here. */
  private async submitPlay(game: GameId, seed: number, daily: string | null, log: unknown[]): Promise<PlayOutcome> {
    if (!this.sync.me) return { kind: 'practice', reason: 'login' };
    let res: Response;
    try {
      res = await fetch(daily ? '/api/daily/result' : '/api/minigame/result', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(daily ? { day: daily, log } : { game, seed, log }),
      });
    } catch {
      return { kind: 'practice', reason: 'offline' };
    }
    if (!res.ok) return { kind: 'practice', reason: 'error' };
    const result = (await res.json()) as PlayResult;
    if (result.reward) {
      this.store.dispatch({ type: 'reward', ...result.reward });
      this.sync.upload();
    }
    return { kind: 'result', result };
  }

  private onSync(notice?: SyncNotice): void {
    this.dirty = true;
    void this.family.refresh(notice !== undefined);
    if (notice === 'loaded') toast(t('sync.loaded'), 'barn-icon', 4000);
    if (notice === 'clamped' || notice === 'rejected') toast(t('sync.adjusted'), 'lock', 5000);
  }

  /** Moved to new land: a moment worth more than a toast. */
  private celebrate(seeds: number): void {
    this.close();
    const modal = h(
      'div',
      { class: 'sheet modal', role: 'dialog', 'aria-modal': 'true', 'data-testid': 'new-land' },
      h(
        'div',
        { class: 'panel welcome' },
        h('div', { class: 'panel-head' }, sprite('golden-seed', 2), h('h2', null, t('newLand.title'))),
        h(
          'div',
          { class: 'panel-body' },
          h('p', null, t('newLand.seeds', { seeds })),
          h('p', null, t('newLand.next')),
          h('button', { class: 'primary', on: { click: () => modal.remove() } }, t('welcome.ok')),
        ),
      ),
    );
    document.body.append(modal);
    buzz(60);
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
          h('p', null, t('welcome.away', { time: formatDuration(Math.min(awayMs, offlineCapMs(this.store.state)) / 1000) })),
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

/** Sounds for what the player did; idle production (farmhands, animals, the mill) stays quiet. */
function soundFor(e: SimEvent): Sfx | null {
  switch (e.type) {
    case 'coins':
      return e.source === 'tap' ? 'tap' : e.source === 'sell' || e.source === 'order' ? 'coin' : null;
    case 'harvest':
      return e.auto ? null : 'harvest';
    case 'bought':
      return 'buy';
    case 'levelUp':
      return 'level';
    case 'found':
      return 'found';
    case 'prestige':
      return 'prestige';
    case 'fail':
      return 'error';
    default:
      return null;
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
