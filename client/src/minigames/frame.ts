import { GAMES, GameSession, formatNumber, type GameId, type PlayResult } from '@pixel-farm/shared';
import { locale, t } from '../i18n/index.js';
import { h, sprite } from '../ui/dom.js';
import { buzz } from '../ui/prefs.js';
import { BOARDS, GAME_ICON } from './index.js';
import type { Effects } from './types.js';

export type PlayOutcome =
  | { kind: 'result'; result: PlayResult }
  | { kind: 'practice'; reason: 'login' | 'offline' | 'error' };

export interface PlayOptions {
  game: GameId;
  seed: number;
  /** Day key when this is the ranked daily attempt. */
  daily: string | null;
  submit(log: unknown[]): Promise<PlayOutcome>;
  /** Free play only: start another round with a new seed. */
  again?: () => void;
  onClose(): void;
}

/** The game running now, for e2e tests and debugging. */
export let current: { session: GameSession<unknown, unknown>; finish(): void; at(): number } | null = null;

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Full-screen minigame: how-to and Start, the board with a clock and score, then the result. */
export function playGame(opts: PlayOptions): void {
  const game = GAMES[opts.game];
  const countdown = game.limitMs <= 180_000;
  const fmt = (n: number) => formatNumber(n, locale());

  const timer = h('span', { class: 'mg-timer' }, countdown ? clock(game.limitMs) : '0:00');
  const score = h('span', { class: 'mg-score', 'data-testid': 'mg-score' }, '0');
  const quit = h('button', { class: 'close mg-quit', 'aria-label': t('play.quit') }, '✕');
  const body = h('div', { class: 'mg-body' });
  const root = h(
    'div',
    { class: 'mg', role: 'dialog', 'aria-modal': 'true', data: { game: opts.game } },
    h('header', { class: 'mg-head' }, quit, sprite(GAME_ICON[opts.game], 2), h('h2', null, t(`games.${opts.game}.name`)), timer, h('span', { class: 'pill mg-pill' }, sprite('star', 1), score)),
    body,
  );
  document.body.append(root);

  const close = () => {
    current = null;
    running = false;
    root.remove();
    opts.onClose();
  };

  // ---- intro
  const startBtn = h('button', { class: 'primary big', data: { mg: 'start' } }, t('play.start'));
  body.append(
    h(
      'div',
      { class: 'mg-intro' },
      sprite(GAME_ICON[opts.game], 4),
      h('p', null, t(`games.${opts.game}.how`)),
      opts.daily ? h('p', { class: 'mg-ranked' }, sprite('trophy', 1), t('play.ranked')) : null,
      startBtn,
    ),
  );

  let running = false;
  let finished = false;
  let quitArmed = 0;
  quit.addEventListener('click', () => {
    if (!running) return close();
    // Two taps, so an accidental one doesn't end the game.
    if (Date.now() - quitArmed > 2500) {
      quitArmed = Date.now();
      quit.classList.add('armed');
      quit.textContent = t('play.quitConfirm');
      setTimeout(() => {
        quit.classList.remove('armed');
        quit.textContent = '✕';
      }, 2500);
      return;
    }
    // A ranked attempt counts even when it's ended early; free play just stops.
    if (opts.daily) finish();
    else close();
  });

  const effects: Effects = {
    pop(el, text, good = true) {
      const r = el.getBoundingClientRect();
      const f = h('div', { class: `floater ${good ? '' : 'bad'}`, 'aria-hidden': 'true' }, text);
      f.style.left = `${r.left + r.width / 2}px`;
      f.style.top = `${r.top + r.height / 3}px`;
      document.body.append(f);
      f.addEventListener('animationend', () => f.remove());
      setTimeout(() => f.remove(), 1500);
    },
    buzz,
  };

  let session: GameSession<unknown, unknown>;
  let t0 = 0;
  const now = () => Math.round(performance.now() - t0);

  startBtn.addEventListener('click', () => {
    session = new GameSession(game, opts.seed);
    const board = BOARDS[opts.game]((m) => {
      const ok = session.move(m, now());
      board.draw(session.state, now());
      return ok;
    }, effects);
    body.replaceChildren(board.el);
    t0 = performance.now();
    running = true;
    current = { session, finish, at: now };
    const frame = () => {
      if (!running) return;
      const at = now();
      board.draw(session.state, at);
      timer.textContent = clock(countdown ? game.limitMs - at : at);
      score.textContent = fmt(game.score(session.state));
      if (session.over || at >= game.limitMs) {
        // Let the last move show for a moment.
        setTimeout(finish, session.over ? 600 : 0);
        running = false;
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });

  async function finish() {
    if (finished) return;
    finished = true;
    running = false;
    current = null;
    const result = session.result();
    score.textContent = fmt(result.score);
    const lines = h('div', { class: 'mg-lines' }, h('p', null, t('play.saving')));
    const buttons = h('div', { class: 'choices mg-buttons' });
    body.replaceChildren(
      h(
        'div',
        { class: 'mg-end', 'data-testid': 'mg-end' },
        sprite(result.done ? 'trophy' : 'star', 4),
        h('h3', null, t(result.done ? 'play.done' : 'play.timeUp')),
        h('p', { class: 'mg-final' }, t('play.score', { score: fmt(result.score) })),
        lines,
        buttons,
      ),
    );
    const outcome = await opts.submit(session.log);
    const out: Node[] = [];
    if (outcome.kind === 'result') {
      const r = outcome.result;
      if (r.score >= r.best && r.score > 0) out.push(h('p', { class: 'mg-best' }, sprite('star', 1), t('play.newBest')));
      else out.push(h('p', null, t('play.best', { best: fmt(r.best) })));
      if (r.reward)
        out.push(h('p', { class: 'mg-reward', 'data-testid': 'mg-reward' }, sprite('coin', 2), `+${fmt(r.reward.coins)}`, sprite('star', 2), `+${fmt(r.reward.xp)}`));
      else out.push(h('p', { class: 'desc' }, t('play.noRewards')));
      if (r.rank) out.push(h('p', null, sprite('trophy', 1), t('play.rank', { rank: r.rank })));
    } else {
      out.push(h('p', { class: 'desc' }, t(`play.practice.${outcome.reason}`)));
    }
    lines.replaceChildren(...out);
    if (opts.again) buttons.append(h('button', { data: { mg: 'again' }, on: { click: () => { close(); opts.again!(); } } }, t('play.again')));
    buttons.append(h('button', { class: 'primary', data: { mg: 'close' }, on: { click: close } }, t('play.close')));
  }
}
