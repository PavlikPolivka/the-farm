import {
  ACHIEVEMENTS,
  ACHIEVEMENT_IDS,
  BREEDS,
  COLLECTION_BONUS,
  DECOR,
  PERKS,
  PERK_EFFECT,
  PERK_IDS,
  PRESTIGE,
  SKINS,
  SKIN_SLOTS,
  achievementTier,
  achievementValue,
  canPrestige,
  collectionPct,
  formatNumber,
  perkCost,
  prestigeNeed,
  prodMult,
  seedsFor,
  skinUnlocked,
  type AchievementId,
  type DecorPool,
  type FarmState,
  type PerkId,
  type SkinSlot,
} from '@pixel-farm/shared';
import { locale, t } from '../i18n/index.js';
import { clear, h, sprite } from './dom.js';
import type { Sheet, SheetCtx } from './sheets.js';

export const BOOK_TABS = ['animals', 'decor', 'skins', 'medals', 'land'] as const;
export type BookTab = (typeof BOOK_TABS)[number];
let bookTab: BookTab = 'animals';

const fmt = (n: number) => formatNumber(n, locale());
const pct = (x: number) => `${Math.round(x * 100)} %`;

const TAB_ICON: Record<BookTab, string> = { animals: 'hen-white', decor: 'pot-red', skins: 'barn-icon', medals: 'medal-gold', land: 'golden-seed' };

export const ACHIEVEMENT_ICON: Record<AchievementId, string> = {
  harvest: 'wheat', taps: 'windmill', orders: 'sign', eggs: 'egg', wool: 'wool', milk: 'milk', honey: 'honey',
  level: 'star', coins: 'coin', fields: 'soil', farmhands: 'farmhand', games: 'card-back', crowns: 'crown',
  trophies: 'trophy', gifts: 'gift', flowers: 'sticker-flower', prestige: 'golden-seed', seeds: 'golden-seed',
  decor: 'pot-red', breeds: 'hen-white',
};
const TIER_SPRITE = ['', 'medal-bronze', 'medal-silver', 'medal-gold'] as const;

/** The name of anything in the book: a breed, decoration or skin id. */
export const itemName = (id: string) => t(`book.items.${id}`, { defaultValue: id });

/** Original look per building slot, for the skins tab. */
const ORIGINAL: Record<SkinSlot, string> = { barn: 'barn-icon', windmill: 'windmill', fence: 'fence-m' };
const skinIcon = (id: string, slot: SkinSlot) => (slot === 'fence' ? `${id}-m` : id);

/** A grid cell: the item if found, its silhouette if not. */
function cell(icon: string, found: boolean, name: string, hint: string): HTMLElement {
  return h(
    'div',
    { class: found ? 'book-cell found' : 'book-cell', data: { found: String(found) }, title: hint },
    sprite(icon, 2, found ? name : ''),
    h('span', { class: 'book-name' }, found ? name : '???'),
    h('span', { class: 'book-hint' }, hint),
  );
}

function animals(s: FarmState): HTMLElement {
  const grid = h('div', { class: 'book-grid' });
  for (const b of BREEDS) {
    const hint = b.count === null ? t('book.rareHint') : t('book.breedHint', { count: b.count, animal: t(`animals.${b.animal}.name`) });
    grid.append(cell(b.id, s.found.animals.includes(b.id), itemName(b.id), hint));
  }
  return h('div', null, h('p', { class: 'intro' }, t('book.animalsIntro', { bonus: pct(COLLECTION_BONUS.breed) })), grid);
}

function decor(s: FarmState): HTMLElement {
  const body = h('div', null, h('p', { class: 'intro' }, t('book.decorIntro', { bonus: pct(COLLECTION_BONUS.decor) })));
  for (const pool of ['garden', 'village', 'fair', 'cup'] as DecorPool[]) {
    const grid = h('div', { class: 'book-grid' });
    for (const d of DECOR.filter((x) => x.pool === pool))
      grid.append(cell(d.id, s.found.decor.includes(d.id), itemName(d.id), pool === 'cup' ? t('book.cupHint', { count: d.trophies ?? 0 }) : t(`book.pools.${pool}`)));
    body.append(h('h3', { class: 'book-head' }, t(`book.poolTitles.${pool}`)), grid);
  }
  const weeks = [...s.trophies].sort().reverse();
  body.append(
    h('h3', { class: 'book-head' }, sprite('trophy', 1), t('book.cabinet', { count: weeks.length })),
    weeks.length
      ? h('ul', { class: 'cabinet' }, ...weeks.map((w) => h('li', null, sprite('trophy', 1), t('book.weekOf', { date: new Date(`${w}T12:00:00Z`).toLocaleDateString(locale()) }))))
      : h('p', { class: 'empty' }, t('book.noTrophies')),
  );
  return body;
}

function skins(ctx: SheetCtx, s: FarmState): HTMLElement {
  const body = h('div', null, h('p', { class: 'intro' }, t('book.skinsIntro')));
  for (const slot of SKIN_SLOTS) {
    const grid = h('div', { class: 'book-grid' });
    const choose = (skin: string | null) => {
      ctx.act({ type: 'setSkin', slot, skin });
      ctx.rerender();
    };
    const current = s.skins[slot];
    const original = h(
      'button',
      { class: current === null ? 'book-cell found active' : 'book-cell found', data: { skin: `${slot}:original` }, on: { click: () => choose(null) } },
      sprite(ORIGINAL[slot], 2),
      h('span', { class: 'book-name' }, t('book.original')),
    );
    grid.append(original);
    for (const skin of SKINS.filter((k) => k.slot === slot)) {
      const open = skinUnlocked(s, skin.id);
      const u = skin.unlock;
      const hint =
        'achievement' in u
          ? t('book.skinHint', { medal: t(`book.tiers.${u.tier}`), name: t(`book.ach.${u.achievement}.name`) })
          : t('book.playsHint', { count: u.plays, game: t(`games.${u.game}.name`) });
      grid.append(
        h(
          'button',
          {
            class: `book-cell${open ? ' found' : ''}${current === skin.id ? ' active' : ''}`,
            data: { skin: skin.id },
            disabled: !open,
            title: hint,
            on: { click: () => open && choose(skin.id) },
          },
          sprite(skinIcon(skin.id, slot), 2),
          h('span', { class: 'book-name' }, open ? itemName(skin.id) : '???'),
          h('span', { class: 'book-hint' }, hint),
        ),
      );
    }
    body.append(h('h3', { class: 'book-head' }, t(`book.slots.${slot}`)), grid);
  }
  return body;
}

function medals(s: FarmState): HTMLElement {
  const list = h('div', { class: 'cards' });
  for (const id of ACHIEVEMENT_IDS) {
    const tier = achievementTier(s, id);
    const value = achievementValue(s, id);
    const next = (ACHIEVEMENTS[id] as readonly number[])[tier];
    list.append(
      h(
        'div',
        { class: 'card medal-row', data: { achievement: id, tier: String(tier) } },
        sprite(ACHIEVEMENT_ICON[id], 2),
        h(
          'div',
          { class: 'card-text' },
          h('h3', null, t(`book.ach.${id}.name`)),
          h(
            'p',
            { class: 'meta' },
            next === undefined
              ? t('book.allMedals')
              : `${t(`book.ach.${id}.goal`, { count: fmt(next) })} · ${t('book.progress', { value: fmt(Math.floor(value)), count: fmt(next) })}`,
          ),
        ),
        h('div', { class: 'medals' }, ...[1, 2, 3].map((n) => h('span', { class: n <= tier ? 'medal on' : 'medal' }, sprite(TIER_SPRITE[n]!, 1)))),
      ),
    );
  }
  return h('div', null, h('p', { class: 'intro' }, t('book.medalsIntro')), list);
}

function perkLine(p: PerkId, level: number): string {
  switch (p) {
    case 'soil':
      return t('book.perks.soil.desc', { now: pct(PERK_EFFECT.soil * level), next: pct(PERK_EFFECT.soil * (level + 1)) });
    case 'arms':
      return t('book.perks.arms.desc', { now: pct(PERK_EFFECT.arms * level), next: pct(PERK_EFFECT.arms * (level + 1)) });
    case 'clover':
      return t('book.perks.clover.desc', { now: pct(PERK_EFFECT.clover * level), next: pct(PERK_EFFECT.clover * (level + 1)) });
    case 'night':
      return t('book.perks.night.desc', { hours: PERK_EFFECT.nightHours });
    default:
      return t(`book.perks.${p}.desc`);
  }
}

/** Golden Seeds: moving to new land, and the perk tree. */
function land(ctx: SheetCtx): { el: HTMLElement; update(): void } {
  const s = () => ctx.store.state;
  const status = h('p', { class: 'intro' });
  const bar = h('div', { class: 'progress' }, h('div', { class: 'progress-fill' }));
  const barText = h('p', { class: 'meta' });
  let armed = false;
  const move = h('button', { class: 'primary big', data: { prestige: 'move' } });
  const warn = h('p', { class: 'desc warn', hidden: true }, t('book.moveWarn'));
  move.addEventListener('click', () => {
    if (!canPrestige(s())) return;
    if (!armed) {
      armed = true;
      warn.hidden = false;
      update();
      return;
    }
    armed = false;
    warn.hidden = true;
    if (ctx.act({ type: 'prestige' })) ctx.rerender();
  });

  const perks = PERK_IDS.map((p) => {
    const desc = h('p', { class: 'desc' });
    const meta = h('p', { class: 'meta' });
    const price = h('span');
    const btn = h('button', { class: 'buy', data: { perk: p }, on: { click: () => ctx.act({ type: 'buyPerk', perk: p }) } }, sprite('golden-seed', 1), price);
    const el = h('div', { class: 'card', data: { perkCard: p } }, sprite(PERK_ICON[p], 2), h('div', { class: 'card-text' }, h('h3', null, t(`book.perks.${p}.name`)), desc, meta), btn);
    return {
      el,
      update: () => {
        const level = s().perks[p];
        const cost = perkCost(s(), p);
        desc.textContent = perkLine(p, level);
        meta.textContent = t('common.levelOf', { level }) + ` / ${PERKS[p].costs.length}`;
        btn.replaceChildren();
        if (cost === null) {
          btn.append(t('common.max'));
          btn.disabled = true;
        } else {
          price.textContent = String(cost);
          btn.append(sprite('golden-seed', 1), price);
          btn.disabled = s().seeds < cost;
        }
      },
    };
  });

  const update = () => {
    const st = s();
    const run = seedsFor(st.runCoins);
    const need = prestigeNeed(st);
    status.replaceChildren(
      sprite('golden-seed', 2),
      t('book.seedsStatus', { seeds: st.seeds, earned: st.prestige.seedsEarned, bonus: pct(prodMult(st) - 1) }),
    );
    (bar.firstChild as HTMLElement).style.width = `${Math.min(100, Math.round((run / need) * 100))}%`;
    barText.textContent = t('book.runSeeds', { seeds: run, need, coins: fmt(st.runCoins) });
    move.disabled = !canPrestige(st);
    move.replaceChildren(sprite('sign', 2), armed ? t('book.moveConfirm', { seeds: run }) : t('book.move', { seeds: run }));
    for (const p of perks) p.update();
  };

  const el = h(
    'div',
    { class: 'land' },
    status,
    h('p', { class: 'desc' }, t('book.landIntro', { bonus: pct(PRESTIGE.seedBonus) })),
    bar,
    barText,
    move,
    warn,
    h('h3', { class: 'book-head' }, t('book.perksTitle')),
    h('div', { class: 'cards' }, ...perks.map((p) => p.el)),
  );
  return { el, update };
}

const PERK_ICON: Record<PerkId, string> = { soil: 'soil', arms: 'windmill', night: 'star', friend: 'farmhand', market: 'sign', clover: 'sparkle' };

export function bookSheet(ctx: SheetCtx): Sheet {
  const s = ctx.store.state;
  const body = h('div', { class: 'book' });
  const tabs = h(
    'div',
    { class: 'tabs book-tabs', role: 'tablist' },
    ...BOOK_TABS.map((tab) =>
      h(
        'button',
        { class: tab === bookTab ? 'tab active' : 'tab', role: 'tab', 'aria-selected': String(tab === bookTab), data: { bookTab: tab }, on: { click: () => ((bookTab = tab), ctx.rerender()) } },
        sprite(TAB_ICON[tab], 1),
        h('span', null, t(`book.tabs.${tab}`)),
      ),
    ),
  );
  const head = h('p', { class: 'book-pct' }, sprite('book', 1), t('book.filled', { pct: collectionPct(s) }));
  const page = h('div', { class: 'book-page' });
  body.append(head, tabs, page);
  let update = () => {};
  clear(page);
  if (bookTab === 'animals') page.append(animals(s));
  else if (bookTab === 'decor') page.append(decor(s));
  else if (bookTab === 'skins') page.append(skins(ctx, s));
  else if (bookTab === 'medals') page.append(medals(s));
  else {
    const l = land(ctx);
    page.append(l.el);
    update = l.update;
  }
  return { title: t('book.title'), icon: 'book', body, update };
}

/** Opens the book on a given tab next time. */
export const setBookTab = (tab: BookTab) => (bookTab = tab);
