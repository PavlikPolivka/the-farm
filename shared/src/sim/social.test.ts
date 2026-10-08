import { describe, expect, it } from 'vitest';
import { apply, startGame } from './engine.js';
import { SOCIAL, giftCap, giftValue, maxGiftQty, parseGift } from './social.js';
import { checkSave } from './validate.js';
import { clone } from './state.js';

const T0 = Date.UTC(2026, 9, 8, 10);

describe('gifts', () => {
  it('caps one gift at 10 % of hourly income, with a floor for new farms', () => {
    const s = startGame(T0, 1);
    expect(giftCap(s)).toBe(Math.max(SOCIAL.giftMinValue, Math.floor((2 * 2) / 6 * 3600 * 0.1)));
    s.inv.wheat = 1000;
    expect(maxGiftQty(s, 'wheat')).toBe(Math.floor(giftCap(s) / 2));
    s.inv.wheat = 3;
    expect(maxGiftQty(s, 'wheat')).toBe(3);
    expect(maxGiftQty(s, 'honey')).toBe(0);
  });

  it('parses only well-formed gifts', () => {
    expect(parseGift({ kind: 'flower', extra: 1 })).toEqual({ kind: 'flower' });
    expect(parseGift({ kind: 'item', item: 'carrot', qty: 3 })).toEqual({ kind: 'item', item: 'carrot', qty: 3 });
    expect(parseGift({ kind: 'item', item: 'gold', qty: 3 })).toBeNull();
    expect(parseGift({ kind: 'item', item: 'carrot', qty: 0 })).toBeNull();
    expect(parseGift({ kind: 'item', item: 'carrot', qty: 1.5 })).toBeNull();
  });

  it('moves items out of one barn and into another, and the ledger lets the claim through', () => {
    const from = startGame(T0, 1);
    const to = startGame(T0, 2);
    from.inv.carrot = 10;
    const gift = { kind: 'item' as const, item: 'carrot' as const, qty: 4 };
    expect(apply(from, { type: 'giftSend', at: T0, gift }).ok).toBe(true);
    expect(from.inv.carrot).toBe(6);
    expect(apply(from, { type: 'giftSend', at: T0, gift: { ...gift, qty: 99 } }).ok).toBe(false);

    const before = clone(to);
    apply(to, { type: 'giftClaim', at: T0, gift });
    apply(to, { type: 'giftClaim', at: T0, gift: { kind: 'flower' } });
    expect(to.inv.carrot).toBe(4);
    expect(to.stats).toMatchObject({ giftValueIn: giftValue(gift), flowers: 1 });
    expect(checkSave(before, to, T0, { coins: 0, xp: 0, giftValue: giftValue(gift) })).toMatchObject({ ok: true, clamped: [] });
    // Claiming gifts the server never handed out is clamped.
    to.inv.carrot += 500;
    to.stats.giftValueIn += 5000;
    expect(checkSave(before, to, T0, { coins: 0, xp: 0, giftValue: giftValue(gift) })).toMatchObject({ ok: true, clamped: ['gifts', 'coins'] });
  });
});
