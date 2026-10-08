import {
  ANIMALS,
  ANIMAL_IDS,
  CROPS,
  CROP_IDS,
  GOOD_IDS,
  HELPERS,
  HELPER_IDS,
  animalCost,
  fieldCost,
  formatDuration,
  formatNumber,
  growMs,
  helperCost,
  helperLevel,
  helperMax,
  landCost,
  landLevel,
  level,
  maxFields,
  sellPrice,
  tapCost,
  tapPower,
  type AnimalId,
  type CropId,
  type HelperId,
  type ItemId,
  type Me,
} from '@pixel-farm/shared';
import type { Command, Store } from '../game/store.js';
import { locale, t } from '../i18n/index.js';
import { clear, h, sprite } from './dom.js';
import { bookSheet, itemName } from './book.js';
import { gamesSheet, type GamesCtx } from './games.js';
import { boardsSheet } from './social.js';

export type SheetKind = 'shop' | 'barn' | 'orders' | 'games' | 'book' | 'boards' | 'inbox' | 'settings' | 'seeds';

export interface SheetCtx {
  store: Store;
  /** Dispatch with UI feedback (toasts on failure). Returns success. */
  act(cmd: Command, at?: { x: number; y: number }): boolean;
  close(): void;
  rerender(): void;
  seed: { get(): CropId; set(c: CropId): void };
  /** Field whose farmhand crop is being chosen, if the seed sheet was opened for one. */
  autoField: number | null;
  settings(body: HTMLElement): () => void;
  me(): Me | null;
  login(): void;
  games: GamesCtx;
  inbox(): Sheet;
}

export interface Sheet {
  title: string;
  icon: string;
  body: HTMLElement;
  update(): void;
}

const fmt = (n: number) => formatNumber(n, locale());
export const ITEM_SPRITE: Record<ItemId, string> = {
  wheat: 'wheat', carrot: 'carrot', corn: 'corn', tomato: 'tomato', cabbage: 'cabbage',
  egg: 'egg', wool: 'wool', milk: 'milk', honey: 'honey',
};
const ANIMAL_SPRITE: Record<AnimalId, string> = { chicken: 'chicken', sheep: 'sheep', cow: 'cow', bees: 'beehive' };
const HELPER_SPRITE: Record<HelperId, string> = { farmhand: 'farmhand', sprinkler: 'sprinkler', scarecrow: 'scarecrow', mill: 'windmill' };

let shopTab: 'farm' | 'animals' | 'helpers' = 'farm';

/** A shop card: icon, name, description, owned/level, and a price button that knows its state. */
function card(
  ctx: SheetCtx,
  opts: {
    id: string;
    icon: string;
    name: string;
    desc: () => string;
    meta: () => string;
    cost: () => number;
    locked: () => number | null;
    max: () => boolean;
    cmd: Command;
  },
) {
  const desc = h('p', { class: 'desc' });
  const meta = h('p', { class: 'meta' });
  const price = h('span');
  const btn = h('button', { class: 'buy', data: { buy: opts.id }, on: { click: (e) => ctx.act(opts.cmd, { x: e.clientX, y: e.clientY }) } }, sprite('coin', 1), price);
  const el = h('div', { class: 'card' }, sprite(opts.icon, 3), h('div', { class: 'card-text' }, h('h3', null, opts.name), desc, meta), btn);
  const update = () => {
    desc.textContent = opts.desc();
    meta.textContent = opts.meta();
    const lockedAt = opts.locked();
    btn.replaceChildren();
    if (lockedAt !== null) {
      btn.append(sprite('lock', 1), h('span', null, t('common.locked', { level: lockedAt })));
      btn.disabled = true;
      el.classList.add('locked');
    } else if (opts.max()) {
      btn.append(h('span', null, t('common.max')));
      btn.disabled = true;
      el.classList.remove('locked');
    } else {
      const c = opts.cost();
      price.textContent = fmt(c);
      btn.append(sprite('coin', 1), price);
      btn.disabled = ctx.store.state.coins < c;
      el.classList.remove('locked');
    }
  };
  return { el, update };
}

function shop(ctx: SheetCtx): Sheet {
  const s = () => ctx.store.state;
  const body = h('div', { class: 'shop' });
  const tabs = h(
    'div',
    { class: 'tabs', role: 'tablist' },
    ...(['farm', 'animals', 'helpers'] as const).map((tab) =>
      h(
        'button',
        { class: tab === shopTab ? 'tab active' : 'tab', role: 'tab', 'aria-selected': String(tab === shopTab), data: { tab }, on: { click: () => ((shopTab = tab), ctx.rerender()) } },
        sprite(tab === 'farm' ? 'soil' : tab === 'animals' ? 'chicken' : 'farmhand', 1),
        t(`shop.tabs.${tab}`),
      ),
    ),
  );
  const cards: ReturnType<typeof card>[] = [];
  if (shopTab === 'farm') {
    cards.push(
      card(ctx, {
        id: 'field', icon: 'soil', name: t('shop.field.name'),
        desc: () => (s().fields.length >= maxFields(s()) ? t('shop.fieldsFull') : t('shop.field.desc')),
        meta: () => t('common.owned', { count: s().fields.length }),
        cost: () => fieldCost(s()), locked: () => null, max: () => s().fields.length >= maxFields(s()), cmd: { type: 'buyField' },
      }),
      card(ctx, {
        id: 'land', icon: 'sign', name: t('shop.land.name'), desc: () => t('shop.land.desc'),
        meta: () => t('common.owned', { count: s().land }),
        cost: () => landCost(s()),
        locked: () => { const need = landLevel(s()); return need !== null && level(s()) < need ? need : null; },
        max: () => landLevel(s()) === null, cmd: { type: 'buyLand' },
      }),
      card(ctx, {
        id: 'tap', icon: 'windmill', name: t('shop.tap.name'),
        desc: () => t('shop.tap.desc', { power: fmt(tapPower(s())), next: fmt(tapPower({ ...s(), tapLevel: s().tapLevel + 1 })) }),
        meta: () => t('common.levelOf', { level: s().tapLevel + 1 }),
        cost: () => tapCost(s()), locked: () => null, max: () => false, cmd: { type: 'buyTap' },
      }),
    );
  } else if (shopTab === 'animals') {
    for (const a of ANIMAL_IDS)
      cards.push(
        card(ctx, {
          id: `animal:${a}`, icon: ANIMAL_SPRITE[a], name: t(`animals.${a}.name`), desc: () => t(`animals.${a}.desc`),
          meta: () => t('common.owned', { count: s().animals[a].count }),
          cost: () => animalCost(s(), a),
          locked: () => (level(s()) < ANIMALS[a].unlockLevel ? ANIMALS[a].unlockLevel : null),
          max: () => false, cmd: { type: 'buyAnimal', animal: a },
        }),
      );
  } else {
    for (const hId of HELPER_IDS)
      cards.push(
        card(ctx, {
          id: `helper:${hId}`, icon: HELPER_SPRITE[hId], name: t(`helpers.${hId}.name`), desc: () => t(`helpers.${hId}.desc`),
          meta: () => (hId === 'farmhand' ? t('common.owned', { count: helperLevel(s(), hId) }) : t('common.levelOf', { level: helperLevel(s(), hId) })),
          cost: () => helperCost(s(), hId),
          locked: () => (level(s()) < HELPERS[hId].unlockLevel ? HELPERS[hId].unlockLevel : null),
          max: () => helperLevel(s(), hId) >= helperMax(s(), hId), cmd: { type: 'buyHelper', helper: hId },
        }),
      );
  }
  body.append(tabs, h('div', { class: 'cards' }, ...cards.map((c) => c.el)));
  return { title: t('shop.title'), icon: 'coin', body, update: () => cards.forEach((c) => c.update()) };
}

function barn(ctx: SheetCtx): Sheet {
  const s = () => ctx.store.state;
  const body = h('div', { class: 'barn' });
  const list = h('div', { class: 'cards' });
  const empty = h('p', { class: 'empty' }, t('barn.empty'));
  body.append(empty, list);
  const rows = new Map<ItemId, { el: HTMLElement; update(): void }>();
  for (const item of [...CROP_IDS, ...GOOD_IDS] as ItemId[]) {
    const count = h('p', { class: 'meta' });
    const each = h('p', { class: 'desc' });
    const one = h('button', { class: 'sell', data: { sell: `${item}:1` }, on: { click: (e) => ctx.act({ type: 'sell', item, qty: 1 }, { x: e.clientX, y: e.clientY }) } }, t('barn.sellOne'));
    const all = h('button', { class: 'sell primary', data: { sell: `${item}:all` }, on: { click: (e) => ctx.act({ type: 'sell', item, qty: s().inv[item] }, { x: e.clientX, y: e.clientY }) } }, t('barn.sellAll'));
    const el = h('div', { class: 'card' }, sprite(ITEM_SPRITE[item], 3), h('div', { class: 'card-text' }, h('h3', null, t(`items.${item}.name`)), count, each), h('div', { class: 'sell-buttons' }, one, all));
    rows.set(item, {
      el,
      update: () => {
        const n = s().inv[item];
        el.hidden = n <= 0;
        count.textContent = t(`items.${item}.count`, { count: n });
        each.textContent = t('barn.each', { price: fmt(sellPrice(s(), item)) });
      },
    });
    list.append(el);
  }
  return {
    title: t('barn.title'), icon: 'barn-icon', body,
    update: () => {
      rows.forEach((r) => r.update());
      empty.hidden = [...rows.keys()].some((i) => s().inv[i] > 0);
    },
  };
}

function orders(ctx: SheetCtx): Sheet {
  const s = () => ctx.store.state;
  const body = h('div', { class: 'orders' }, h('p', { class: 'intro' }, t('orders.intro')));
  const list = h('div', { class: 'cards' });
  body.append(list);
  let shown = '';
  const update = () => {
    const ids = s().orders.map((o) => o.id).join(',');
    if (ids !== shown) {
      shown = ids;
      clear(list);
      for (const o of s().orders) {
        const lines = o.lines.map((l) => {
          const have = h('span', { class: 'have' });
          return { l, have, el: h('li', null, sprite(ITEM_SPRITE[l.item], 2), h('span', null, t(`items.${l.item}.count`, { count: l.qty })), have) };
        });
        const btn = h('button', { class: 'deliver primary', data: { deliver: String(o.id) }, on: { click: (e) => ctx.act({ type: 'deliver', order: o.id }, { x: e.clientX, y: e.clientY }) } }, t('orders.deliver'));
        const el = h(
          'div',
          { class: 'order card', data: { order: String(o.id) } },
          h('ul', null, ...lines.map((x) => x.el)),
          h(
            'div',
            { class: 'reward' },
            h('span', null, t('orders.reward')),
            sprite('coin', 1),
            fmt(o.coins),
            sprite('star', 1),
            String(o.xp),
            o.drop ? h('span', { class: 'drop', data: { drop: o.drop } }, '+', sprite(o.drop, 1, itemName(o.drop))) : null,
          ),
          btn,
        );
        (el as HTMLElement & { refresh?: () => void }).refresh = () => {
          let ok = true;
          for (const x of lines) {
            const n = s().inv[x.l.item];
            x.have.textContent = `${Math.min(n, x.l.qty)}/${x.l.qty}`;
            x.have.classList.toggle('done', n >= x.l.qty);
            if (n < x.l.qty) ok = false;
          }
          btn.disabled = !ok;
        };
        list.append(el);
      }
    }
    for (const el of list.children) (el as HTMLElement & { refresh?: () => void }).refresh?.();
  };
  return { title: t('orders.title'), icon: 'sign', body, update };
}

function seeds(ctx: SheetCtx): Sheet {
  const s = () => ctx.store.state;
  const auto = ctx.autoField;
  const body = h('div', { class: 'seeds' }, auto !== null ? h('p', { class: 'intro' }, sprite('farmhand', 1), t('seeds.auto')) : null);
  const list = h('div', { class: 'cards' });
  body.append(list);
  const items = CROP_IDS.map((c) => {
    const btn = h(
      'button',
      {
        class: 'seed',
        data: { seed: c },
        on: {
          click: () => {
            if (level(s()) < CROPS[c].unlockLevel) return;
            if (auto !== null) ctx.act({ type: 'setAutoCrop', field: auto, crop: c });
            else ctx.seed.set(c);
            ctx.close();
          },
        },
      },
      sprite(`${c}-3`, 3),
      h('span', { class: 'name' }, t(`items.${c}.name`)),
      h('span', { class: 'grow' }),
      h('span', { class: 'cost' }),
    );
    return { c, btn };
  });
  list.append(...items.map((i) => i.btn));
  return {
    title: t('seeds.title'), icon: 'wheat', body,
    update: () => {
      for (const { c, btn } of items) {
        const locked = level(s()) < CROPS[c].unlockLevel;
        btn.disabled = locked;
        const current = auto !== null ? s().fields[auto]?.autoCrop === c : ctx.seed.get() === c;
        btn.classList.toggle('active', current);
        btn.querySelector('.grow')!.textContent = locked ? t('common.locked', { level: CROPS[c].unlockLevel }) : t('seeds.grows', { time: formatDuration(growMs(s(), c) / 1000) });
        const cost = btn.querySelector('.cost')!;
        cost.replaceChildren(...(CROPS[c].seedCost > 0 && !locked ? [sprite('coin', 1), fmt(CROPS[c].seedCost)] : []));
      }
    },
  };
}

export function buildSheet(kind: SheetKind, ctx: SheetCtx): Sheet {
  switch (kind) {
    case 'shop':
      return shop(ctx);
    case 'barn':
      return barn(ctx);
    case 'orders':
      return orders(ctx);
    case 'seeds':
      return seeds(ctx);
    case 'boards':
      return boardsSheet(ctx);
    case 'games':
      return gamesSheet(ctx.games);
    case 'book':
      return bookSheet(ctx);
    case 'inbox':
      return ctx.inbox();
    case 'settings': {
      const body = h('div', { class: 'settings' });
      const update = ctx.settings(body);
      return { title: t('settings.title'), icon: 'gear', body, update };
    }
  }
}
