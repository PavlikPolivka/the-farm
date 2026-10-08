import type { Inbox, InboxGift } from '@pixel-farm/shared';
import type { Store } from '../game/store.js';
import type { Sync } from '../game/sync.js';
import { locale, t } from '../i18n/index.js';
import { clear, h, sprite } from './dom.js';
import { toast } from './effects.js';
import { ITEM_SPRITE, type Sheet } from './sheets.js';
import { avatar } from './social.js';
import { STICKER_SPRITE } from './visit.js';

export async function fetchInbox(): Promise<Inbox | null> {
  try {
    const res = await fetch('/api/inbox', { cache: 'no-store' });
    return res.ok ? ((await res.json()) as Inbox) : null;
  } catch {
    return null;
  }
}

/** Unclaimed gifts and new visits: the number on the mailbox. */
export const inboxCount = (inbox: Inbox) => inbox.gifts.length + inbox.visits.filter((v) => !v.seen).length;

const giftLabel = (g: InboxGift) => (g.gift.kind === 'flower' ? t('visit.flower') : t(`items.${g.gift.item}.count`, { count: g.gift.qty }));
const giftIcon = (g: InboxGift) => (g.gift.kind === 'flower' ? 'sticker-flower' : ITEM_SPRITE[g.gift.item]);
/** "5 minutes ago" / "před 5 minutami", in the game's language. */
function ago(ms: number): string {
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  const min = Math.round((Date.now() - ms) / 60_000);
  if (min < 60) return rtf.format(-Math.max(0, min), 'minute');
  if (min < 24 * 60) return rtf.format(-Math.round(min / 60), 'hour');
  return rtf.format(-Math.round(min / 1440), 'day');
}

/** The mailbox: claim gifts with one tap; see who visited and what sticker they left. */
export function inboxSheet(ctx: { store: Store; sync: Sync; onChange(): void }): Sheet {
  const body = h('div', { class: 'inbox' });
  const claim = async (g: InboxGift): Promise<boolean> => {
    const res = await fetch(`/api/gifts/${g.id}/claim`, { method: 'POST' }).catch(() => null);
    if (!res?.ok) return false;
    ctx.store.dispatch({ type: 'giftClaim', gift: g.gift });
    return true;
  };

  const render = (inbox: Inbox | null) => {
    clear(body);
    if (!inbox) {
      body.append(h('p', { class: 'empty' }, t(ctx.sync.me ? 'boards.offline' : 'boards.loginFirst')));
      return;
    }
    body.append(h('h3', { class: 'inbox-head' }, sprite('gift', 1), t('inbox.gifts')));
    if (!inbox.gifts.length) body.append(h('p', { class: 'empty' }, t('inbox.noGifts')));
    else {
      const all = h('button', { class: 'primary', data: { claim: 'all' } }, t('inbox.claimAll'));
      all.addEventListener('click', async () => {
        all.disabled = true;
        let n = 0;
        for (const g of inbox.gifts) if (await claim(g)) n++;
        if (n) {
          toast(t('inbox.claimed', { count: n }), 'gift');
          ctx.sync.upload();
        }
        await reload();
      });
      const list = h('div', { class: 'cards' });
      for (const g of inbox.gifts) {
        const btn = h('button', { class: 'primary buy', data: { claim: String(g.id) } }, t('inbox.claim'));
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          if (await claim(g)) {
            toast(t('inbox.claimed', { count: 1 }), 'gift');
            ctx.sync.upload();
          }
          await reload();
        });
        list.append(
          h(
            'div',
            { class: 'card' },
            sprite(giftIcon(g), 3),
            h('div', { class: 'card-text' }, h('h3', null, giftLabel(g)), h('p', { class: 'meta' }, t('inbox.from', { name: g.from.name }), ' · ', ago(g.createdAt))),
            btn,
          ),
        );
      }
      body.append(list);
      if (inbox.gifts.length > 1) body.append(all);
    }

    body.append(h('h3', { class: 'inbox-head' }, sprite('farmhand', 1), t('inbox.visits')));
    if (!inbox.visits.length) body.append(h('p', { class: 'empty' }, t('inbox.noVisits')));
    else
      body.append(
        h(
          'ol',
          { class: 'board' },
          ...inbox.visits.map((v) =>
            h(
              'li',
              { class: v.seen ? 'row' : 'row me' },
              avatar(v.visitor, 'md'),
              h('span', { class: 'row-name' }, t('inbox.visited', { name: v.visitor.name })),
              v.sticker ? sprite(STICKER_SPRITE[v.sticker], 2) : null,
              h('span', { class: 'meta' }, ago(v.createdAt)),
            ),
          ),
        ),
      );
  };

  const reload = async () => {
    const inbox = await fetchInbox();
    render(inbox);
    ctx.onChange();
  };
  render(null);
  if (ctx.sync.me)
    void fetchInbox().then(async (inbox) => {
      render(inbox);
      if (inbox?.visits.some((v) => !v.seen)) await fetch('/api/inbox/seen', { method: 'POST' }).catch(() => null);
      ctx.onChange();
    });
  return { title: t('inbox.title'), icon: 'mail', body, update: () => {} };
}
