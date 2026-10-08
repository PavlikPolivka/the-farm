/** Gift and sticker rules (docs/DESIGN.md, "Social"). Data, shared by client and server. */
import { CROP_IDS, GOOD_IDS, type ItemId } from '../config/economy.js';
import { incomeRate, isCrop } from './rules.js';
import { CROPS, GOODS } from '../config/economy.js';
import type { FarmState } from './state.js';

export type Gift = { kind: 'flower' } | { kind: 'item'; item: ItemId; qty: number };

export const SOCIAL = {
  /** Gifts one player may send to one other player per Prague day. */
  giftsPerDay: 3,
  /** One gift may be worth at most this share of the sender's hourly income. */
  giftIncomeShare: 0.1,
  /** Even a brand-new farm may gift this much. */
  giftMinValue: 20,
  stickers: ['heart', 'flower', 'sun', 'smile', 'star', 'cow'] as const,
} as const;

export type Sticker = (typeof SOCIAL.stickers)[number];

const ITEM_IDS: readonly ItemId[] = [...CROP_IDS, ...GOOD_IDS];

/** A gift's worth at base sell price; flowers are worth nothing. */
export const giftValue = (g: Gift) => (g.kind === 'flower' ? 0 : g.qty * (isCrop(g.item) ? CROPS[g.item].sellPrice : GOODS[g.item].sellPrice));

/** The most one gift from this farm may be worth. */
export const giftCap = (s: FarmState) => Math.max(SOCIAL.giftMinValue, Math.floor(incomeRate(s) * 3600 * SOCIAL.giftIncomeShare));

/** How many of `item` this farm may send in one gift. */
export function maxGiftQty(s: FarmState, item: ItemId): number {
  const each = giftValue({ kind: 'item', item, qty: 1 });
  return Math.max(0, Math.min(s.inv[item] ?? 0, Math.floor(giftCap(s) / each)));
}

/** Validates an untrusted gift payload. */
export function parseGift(raw: unknown): Gift | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const g = raw as Record<string, unknown>;
  if (g.kind === 'flower') return { kind: 'flower' };
  if (g.kind === 'item' && ITEM_IDS.includes(g.item as ItemId) && Number.isInteger(g.qty) && (g.qty as number) >= 1 && (g.qty as number) <= 9999)
    return { kind: 'item', item: g.item as ItemId, qty: g.qty as number };
  return null;
}
