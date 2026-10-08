import { GAME_IDS, formatNumber, type DailyStart, type GameId, type GamesInfo, type Me } from '@pixel-farm/shared';
import { locale, t } from '../i18n/index.js';
import { GAME_ICON } from '../minigames/index.js';
import { clear, h, sprite } from './dom.js';
import type { Sheet } from './sheets.js';

export interface GamesCtx {
  me(): Me | null;
  playFree(game: GameId): void;
  playDaily(start: DailyStart): void;
  toast(text: string): void;
  login(): void;
}

const fmt = (n: number) => formatNumber(n, locale());

/** The Games sheet: today's ranked challenge on top, then free play for all five games. */
export function gamesSheet(ctx: GamesCtx): Sheet {
  const body = h('div', { class: 'games' });
  const daily = h('div', { class: 'card daily', 'data-testid': 'daily' });
  const list = h('div', { class: 'cards' });
  body.append(daily, list);

  const render = (info: GamesInfo | null) => {
    clear(daily);
    clear(list);
    const me = ctx.me();
    if (!me || !info) {
      daily.append(
        sprite('trophy', 3),
        h('div', { class: 'card-text' }, h('h3', null, t('gamesSheet.daily')), h('p', { class: 'desc' }, me ? t('boards.offline') : t('gamesSheet.loginFirst'))),
      );
      if (!me) daily.append(h('button', { class: 'primary', on: { click: () => ctx.login() } }, t('settings.login')));
    } else {
      const d = info.daily;
      const action =
        d.status === 'open'
          ? h('button', { class: 'primary', data: { daily: 'play' }, on: { click: () => void startDaily() } }, t('gamesSheet.play'))
          : null;
      const status =
        d.status === 'done' ? t('gamesSheet.dailyDone', { score: fmt(d.score ?? 0), rank: d.rank ?? '-', players: d.players })
        : d.status === 'started' ? t('gamesSheet.dailyStarted')
        : t('gamesSheet.dailyOpen');
      daily.append(
        sprite(GAME_ICON[d.game], 3),
        h(
          'div',
          { class: 'card-text' },
          h('h3', null, t('gamesSheet.daily'), ': ', t(`games.${d.game}.name`)),
          h('p', { class: 'desc' }, status),
          d.crown ? h('p', { class: 'meta crown-line' }, sprite('crown', 1), t('gamesSheet.crown', { name: d.crown.name })) : null,
        ),
      );
      if (action) daily.append(action);
    }
    for (const id of GAME_IDS) {
      const g = info?.games.find((x) => x.id === id);
      const meta = !me ? t('gamesSheet.practice') : g ? (g.rewardsLeft ? t('gamesSheet.rewardsLeft', { count: g.rewardsLeft }) : t('gamesSheet.practice')) : '';
      list.append(
        h(
          'div',
          { class: 'card', data: { gameCard: id } },
          sprite(GAME_ICON[id], 3),
          h(
            'div',
            { class: 'card-text' },
            h('h3', null, t(`games.${id}.name`)),
            h('p', { class: 'desc' }, meta),
            g?.best != null ? h('p', { class: 'meta' }, t('play.best', { best: fmt(g.best) })) : null,
          ),
          h('button', { class: 'primary buy', data: { play: id }, on: { click: () => ctx.playFree(id) } }, t('gamesSheet.play')),
        ),
      );
    }
  };

  async function startDaily() {
    try {
      const res = await fetch('/api/daily/start', { method: 'POST' });
      if (res.status === 409) {
        ctx.toast(t('gamesSheet.dailyStarted'));
        return void load();
      }
      if (!res.ok) throw new Error(String(res.status));
      ctx.playDaily((await res.json()) as DailyStart);
    } catch {
      ctx.toast(t('boards.offline'));
    }
  }

  async function load() {
    render(null);
    if (!ctx.me()) return;
    try {
      const res = await fetch('/api/games', { cache: 'no-store' });
      render(res.ok ? ((await res.json()) as GamesInfo) : null);
    } catch {
      render(null);
    }
  }
  void load();
  return { title: t('gamesSheet.title'), icon: 'card-back', body, update: () => {} };
}
