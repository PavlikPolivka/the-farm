import {
  CROP_IDS,
  GOOD_IDS,
  SOCIAL,
  advance,
  formatNumber,
  giftCap,
  maxGiftQty,
  medalCounts,
  migrate,
  type FamilyMember,
  type Gift,
  type ItemId,
  type Sticker,
  type Village,
} from '@pixel-farm/shared';
import type { Store } from '../game/store.js';
import type { Sync } from '../game/sync.js';
import { locale, t } from '../i18n/index.js';
import type { FarmScene } from '../scenes/FarmScene.js';
import { h, sprite } from './dom.js';
import { toast } from './effects.js';
import { ITEM_SPRITE } from './sheets.js';
import { avatar } from './social.js';

export const STICKER_SPRITE: Record<Sticker, string> = {
  heart: 'sticker-heart',
  flower: 'sticker-flower',
  sun: 'sticker-sun',
  smile: 'sticker-smile',
  star: 'star',
  cow: 'cow',
};

const fmt = (n: number) => formatNumber(n, locale());

/** The profile badge: moves to new land and medals by colour. */
function badge(s: ReturnType<typeof migrate>): (Node | string)[] {
  const m = medalCounts(s);
  const out: (Node | string)[] = [];
  if (s.prestige.level) out.push(sprite('golden-seed', 1), String(s.prestige.level));
  for (const [tier, n] of [['gold', m.gold], ['silver', m.silver - m.gold], ['bronze', m.bronze - m.silver]] as const)
    if (n > 0) out.push(sprite(`medal-${tier}`, 1), String(n));
  return out;
}

/**
 * Visiting someone's village: their farm, read-only, in the same scene; a banner with who it
 * is, one sticker to leave, and a gift to send. "Home" goes back.
 */
export class Visit {
  member: FamilyMember | null = null;
  private el: HTMLElement | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private store: Store,
    private sync: Sync,
    private scene: () => FarmScene | null,
    private onChange: (visiting: boolean) => void,
  ) {}

  async open(member: FamilyMember): Promise<void> {
    this.close();
    let village: Village;
    try {
      const res = await fetch(`/api/village/${member.id}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      village = (await res.json()) as Village;
    } catch {
      toast(t('boards.offline'), 'lock');
      return;
    }
    this.member = member;
    const state = migrate(village.state);
    advance(state, Date.now());
    this.scene()?.view(state);
    // Their farmhands keep working while we watch.
    this.timer = setInterval(() => advance(state, Date.now()), 1000);
    document.body.classList.add('visiting');
    this.onChange(true);

    let visitId: number | null = null;
    void fetch('/api/visits', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ownerId: member.id }) })
      .then((r) => (r.ok ? (r.json() as Promise<{ id: number }>) : null))
      .then((r) => (visitId = r?.id ?? null))
      .catch(() => {});

    const stickers = h('div', { class: 'stickers' });
    const sent = h('p', { class: 'desc sticker-sent', hidden: true });
    for (const st of SOCIAL.stickers) {
      stickers.append(
        h('button', { class: 'sticker', data: { sticker: st }, 'aria-label': t(`stickers.${st}`), on: { click: () => void leave(st) } }, sprite(STICKER_SPRITE[st], 2)),
      );
    }
    const leave = async (st: Sticker) => {
      if (visitId === null) return;
      stickers.querySelectorAll('button').forEach((b) => (b.disabled = true));
      const res = await fetch(`/api/visits/${visitId}/sticker`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sticker: st }) }).catch(() => null);
      if (res?.ok) {
        stickers.hidden = true;
        sent.hidden = false;
        sent.replaceChildren(sprite(STICKER_SPRITE[st], 2), t('visit.stickerSent', { name: member.name }));
      } else stickers.querySelectorAll('button').forEach((b) => (b.disabled = false));
    };

    let giftsLeft = village.giftsLeft;
    const giftBtn = h('button', { class: 'primary', data: { visit: 'gift' }, on: { click: () => this.giftPicker(member, () => giftsLeft, (n) => { giftsLeft = n; updateGift(); }) } });
    const updateGift = () => {
      giftBtn.replaceChildren(sprite('gift', 2), giftsLeft > 0 ? t('visit.gift') : t('visit.noGifts'));
      giftBtn.disabled = giftsLeft <= 0;
    };
    updateGift();

    this.el = h(
      'div',
      { class: 'visit', 'data-testid': 'visit' },
      h(
        'div',
        { class: 'visit-banner' },
        h('span', { class: 'avatar-wrap' }, avatar(member, 'md'), village.crown ? sprite('crown', 1) : null),
        h(
          'div',
          { class: 'visit-title' },
          h('h2', null, t('visit.title', { name: member.name })),
          h('p', { class: 'desc badge-line', 'data-testid': 'visit-badge' }, sprite('star', 1), t('hud.level', { level: village.level }), ...badge(state)),
        ),
        h('button', { class: 'primary home', data: { visit: 'home' }, on: { click: () => this.close() } }, sprite('barn-icon', 2), t('visit.home')),
      ),
      h('div', { class: 'visit-panel' }, h('p', { class: 'desc' }, t('visit.leaveSticker')), stickers, sent, giftBtn),
    );
    document.body.append(this.el);
  }

  close(): void {
    if (!this.member) return;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.el?.remove();
    this.el = null;
    this.member = null;
    this.scene()?.view(null);
    document.body.classList.remove('visiting');
    this.onChange(false);
  }

  /** Pick something from our barn (within the cap) or a flower, and send it. */
  private giftPicker(member: FamilyMember, left: () => number, setLeft: (n: number) => void): void {
    const s = this.store.state;
    const items = ([...CROP_IDS, ...GOOD_IDS] as ItemId[]).filter((i) => maxGiftQty(s, i) > 0);
    let choice: Gift = { kind: 'flower' };
    const qtyLabel = h('span', { class: 'qty' });
    const minus = h('button', { class: 'step', 'aria-label': '-', on: { click: () => step(-1) } }, '−');
    const plus = h('button', { class: 'step', 'aria-label': '+', on: { click: () => step(1) } }, '+');
    const stepper = h('div', { class: 'stepper' }, minus, qtyLabel, plus);
    const send = h('button', { class: 'primary', data: { gift: 'send' } }, sprite('gift', 2), t('visit.send'));
    const options = h('div', { class: 'gift-options' });
    const select = (g: Gift, btn: HTMLElement) => {
      choice = g;
      options.querySelectorAll('.choice').forEach((b) => b.classList.toggle('active', b === btn));
      refresh();
    };
    const step = (d: number) => {
      if (choice.kind !== 'item') return;
      choice = { ...choice, qty: Math.max(1, Math.min(maxGiftQty(s, choice.item), choice.qty + d)) };
      refresh();
    };
    const refresh = () => {
      stepper.hidden = choice.kind !== 'item';
      if (choice.kind === 'item') {
        qtyLabel.textContent = t(`items.${choice.item}.count`, { count: choice.qty });
        minus.disabled = choice.qty <= 1;
        plus.disabled = choice.qty >= maxGiftQty(s, choice.item);
      }
    };
    const flowerBtn = h('button', { class: 'choice active', data: { giftItem: 'flower' } }, sprite('sticker-flower', 2), t('visit.flower'));
    flowerBtn.addEventListener('click', () => select({ kind: 'flower' }, flowerBtn));
    options.append(flowerBtn);
    for (const item of items) {
      const b = h('button', { class: 'choice', data: { giftItem: item } }, sprite(ITEM_SPRITE[item], 2), t(`items.${item}.name`));
      b.addEventListener('click', () => select({ kind: 'item', item, qty: Math.min(5, maxGiftQty(s, item)) }, b));
      options.append(b);
    }

    const modal = h(
      'div',
      { class: 'sheet modal', role: 'dialog', 'aria-modal': 'true', 'data-testid': 'gift-picker' },
      h(
        'div',
        { class: 'panel' },
        h('div', { class: 'panel-head' }, sprite('gift', 2), h('h2', null, t('visit.giftFor', { name: member.name })), h('button', { class: 'close', 'aria-label': t('common.close'), on: { click: () => modal.remove() } }, '✕')),
        h(
          'div',
          { class: 'panel-body' },
          h('p', { class: 'intro' }, t('visit.giftRules', { left: left(), cap: fmt(giftCap(s)) })),
          options,
          stepper,
          send,
        ),
      ),
    );
    send.addEventListener('click', async () => {
      send.disabled = true;
      // The server checks our barn against our last upload, so upload first.
      this.sync.upload();
      await this.sync.idle();
      const res = await fetch('/api/gifts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: member.id, gift: choice }) }).catch(() => null);
      if (res?.ok) {
        const body = (await res.json()) as { giftsLeft: number };
        this.store.dispatch({ type: 'giftSend', gift: choice });
        this.sync.upload();
        setLeft(body.giftsLeft);
        modal.remove();
        toast(t('visit.giftSent', { name: member.name }), 'gift');
      } else {
        send.disabled = false;
        toast(t(res?.status === 429 ? 'visit.noGifts' : 'visit.giftFailed'), 'lock');
      }
    });
    refresh();
    document.body.append(modal);
  }
}
