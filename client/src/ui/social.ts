import { BOARD_IDS, formatNumber, type Board, type BoardId, type BoardRow, type FamilyMember, type Me } from '@pixel-farm/shared';
import { fetchInbox, inboxCount } from './inbox.js';
import { locale, t } from '../i18n/index.js';
import { clear, h, sprite } from './dom.js';
import type { Sheet } from './sheets.js';

/** Avatar colours from the master palette, picked by player id. */
const AVATAR_COLOURS = ['#c34b35', '#79a7e8', '#4e974c', '#e38628', '#5a6988', '#bd6c4a'];

export function avatar(p: { id: number; name: string }, size: 'sm' | 'md' = 'sm'): HTMLElement {
  const el = h('span', { class: `avatar ${size}`, 'aria-hidden': 'true' }, [...p.name.trim()][0]?.toUpperCase() ?? '?');
  el.style.background = AVATAR_COLOURS[p.id % AVATAR_COLOURS.length]!;
  return el;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const fmt = (n: number) => formatNumber(n, locale());

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** The strip under the HUD: one chip per player. Tapping it opens the boards. */
export class FamilyBar {
  readonly el = h('nav', { class: 'family', 'aria-label': t('family.title') });
  private members: FamilyMember[] = [];
  private lastFetch = 0;
  private unread = 0;
  /** Who is being visited, highlighted in the bar. */
  visiting: number | null = null;

  constructor(
    private me: () => Me | null,
    private open: () => void,
    private login: () => void,
    private settings: () => void,
    private visit: (m: FamilyMember) => void,
    private inbox: () => void,
  ) {
    this.render();
  }

  /** Re-fetches at most every 20 s unless forced. */
  async refresh(force = false): Promise<void> {
    if (!this.me()) {
      this.members = [];
      this.render();
      return;
    }
    if (!force && Date.now() - this.lastFetch < 20_000) return;
    this.lastFetch = Date.now();
    const [list, inbox] = await Promise.all([getJson<FamilyMember[]>('/api/family'), fetchInbox()]);
    if (list) this.members = list;
    if (inbox) this.unread = inboxCount(inbox);
    this.render();
  }

  render(): void {
    clear(this.el);
    const chips = h('div', { class: 'chips' });
    const gear = h('button', { class: 'chip gear', data: { open: 'settings' }, 'aria-label': t('settings.title'), on: { click: () => this.settings() } }, sprite('gear', 2));
    const me = this.me();
    const mail = h(
      'button',
      { class: 'chip gear mail', data: { open: 'inbox' }, 'aria-label': t('inbox.title'), on: { click: () => this.inbox() } },
      sprite('mail', 2),
      this.unread ? h('span', { class: 'badge', 'data-testid': 'inbox-badge' }, String(this.unread)) : null,
    );
    this.el.append(chips);
    if (me) this.el.append(mail);
    this.el.append(gear);
    if (!me) {
      chips.append(h('button', { class: 'chip login', data: { family: 'login' }, on: { click: () => this.login() } }, sprite('farmhand', 1), t('family.login')));
      return;
    }
    const members = this.members.length ? this.members : [{ id: me.id, name: me.displayName, level: 0, lifetimeCoins: 0, weekCoins: 0, lastSeen: null, crown: false }];
    for (const m of members) {
      chips.append(
        h(
          'button',
          {
            class: `chip${m.id === me.id ? ' me' : ''}${m.id === this.visiting ? ' visiting' : ''}`,
            data: { member: String(m.id) },
            // Our own chip opens the boards; anyone else's opens their village.
            on: { click: () => (m.id === me.id ? this.open() : this.visit(m)) },
          },
          h('span', { class: 'avatar-wrap' }, avatar(m), m.crown ? sprite('crown', 1, t('family.crown')) : null),
          h('span', { class: 'chip-name' }, firstName(m.name)),
          m.level ? h('span', { class: 'chip-level' }, sprite('star', 1), String(m.level)) : null,
        ),
      );
    }
  }
}

let boardTab: BoardId = 'allTime';

const BOARD_ICON: Record<BoardId, string> = {
  allTime: 'trophy',
  week: 'coin',
  daily: 'star',
  minigames: 'sparkle',
  collector: 'barn-icon',
  achievements: 'star',
};

/** Value cell per board. */
function value(board: BoardId, r: BoardRow): (Node | string)[] {
  switch (board) {
    case 'allTime':
      return r.value > 0 ? [sprite('star', 1), String(r.value), ' · ', sprite('coin', 1), fmt(r.detail ?? 0)] : [sprite('coin', 1), fmt(r.detail ?? 0)];
    case 'week':
      return [sprite('coin', 1), fmt(r.value)];
    case 'collector':
      return [`${Math.floor(r.value)} %`];
    case 'achievements':
      return [sprite('star', 1), String(r.value)];
    default:
      return [fmt(r.value)];
  }
}

/** Boards whose feature arrives in a later milestone: say so instead of ranking zeros. */
function comingSoon(board: Board): string | null {
  const rows = board.sections.flatMap((s) => s.rows);
  if (board.board === 'daily' || board.board === 'minigames') return rows.length ? null : t('boards.soonGames');
  if (board.board === 'collector' || board.board === 'achievements') return rows.some((r) => r.value > 0) ? null : t('boards.soonCollection');
  return null;
}

export function boardsSheet(ctx: { me(): Me | null; login(): void }): Sheet {
  const body = h('div', { class: 'boards' });
  const me = ctx.me();
  if (!me) {
    body.append(
      h('p', { class: 'intro' }, t('boards.loginFirst')),
      h('button', { class: 'primary', on: { click: () => ctx.login() } }, t('settings.login')),
    );
    return { title: t('boards.title'), icon: 'trophy', body, update: () => {} };
  }

  const tabs = h('div', { class: 'tabs board-tabs', role: 'tablist' });
  const note = h('p', { class: 'intro' });
  const list = h('div', { class: 'board-list' });
  body.append(tabs, note, list);

  const show = async (board: BoardId) => {
    boardTab = board;
    for (const b of tabs.children) (b as HTMLElement).classList.toggle('active', (b as HTMLElement).dataset.board === board);
    note.textContent = t(`boards.desc.${board}`);
    list.setAttribute('aria-busy', 'true');
    const data = await getJson<Board>(`/api/leaderboards/${board}`);
    if (boardTab !== board) return;
    list.removeAttribute('aria-busy');
    clear(list);
    if (!data) {
      list.append(h('p', { class: 'empty' }, t('boards.offline')));
      return;
    }
    const soon = comingSoon(data);
    if (soon) {
      list.append(h('p', { class: 'empty' }, sprite('lock', 1), soon));
      return;
    }
    for (const section of data.sections) {
      if (section.game) list.append(h('h3', { class: 'board-game' }, t(`games.${section.game}.name`, { defaultValue: section.game })));
      list.append(
        h(
          'ol',
          { class: 'board', data: { boardList: board } },
          ...section.rows.map((r) =>
            h(
              'li',
              { class: r.userId === me.id ? 'row me' : 'row', data: { user: String(r.userId), rank: String(r.rank) } },
              h('span', { class: `rank rank-${Math.min(r.rank, 4)}` }, String(r.rank)),
              avatar({ id: r.userId, name: r.name }, 'md'),
              h('span', { class: 'row-name' }, r.name),
              h('span', { class: 'row-value' }, ...value(board, r)),
            ),
          ),
        ),
      );
    }
  };

  for (const b of BOARD_IDS) {
    tabs.append(
      h('button', { class: 'tab', role: 'tab', data: { board: b }, on: { click: () => void show(b) } }, sprite(BOARD_ICON[b], 1), h('span', null, t(`boards.tabs.${b}`))),
    );
  }
  void show(boardTab);
  return { title: t('boards.title'), icon: 'trophy', body, update: () => {} };
}
