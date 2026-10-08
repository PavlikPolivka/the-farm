/**
 * Chiptune sound effects and music, synthesised with WebAudio: no audio files to download or
 * license (they are our own work, CC0 like the generated sprites). Browsers only allow sound
 * after a tap, so the context starts on the first pointer or key press.
 *
 * Settings (per phone): sounds on/off, music on/off. Music pauses while the app is hidden.
 */

export type Sfx = 'tap' | 'harvest' | 'coin' | 'buy' | 'level' | 'found' | 'medal' | 'error' | 'gift' | 'prestige' | 'pop' | 'win';

const SOUND_KEY = 'pf:sound';
const MUSIC_KEY = 'pf:music';

const read = (key: string, fallback: boolean) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
};
const write = (key: string, on: boolean) => {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    // not persisted
  }
};

/** MIDI note to Hz. */
const hz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

type Wave = OscillatorType;
/** One note: [midi, start (s), length (s), wave, volume]. */
type Note = [number, number, number, Wave?, number?];

const SFX: Record<Sfx, Note[]> = {
  tap: [[84, 0, 0.05, 'square', 0.12]],
  pop: [[79, 0, 0.05, 'square', 0.1]],
  harvest: [[72, 0, 0.06, 'square'], [79, 0.05, 0.08, 'square']],
  coin: [[83, 0, 0.06, 'square'], [88, 0.06, 0.12, 'square']],
  buy: [[72, 0, 0.07], [76, 0.07, 0.07], [79, 0.14, 0.12]],
  error: [[45, 0, 0.12, 'sawtooth', 0.12], [44, 0.1, 0.16, 'sawtooth', 0.12]],
  gift: [[84, 0, 0.15, 'triangle', 0.3], [88, 0.12, 0.15, 'triangle', 0.3], [91, 0.24, 0.3, 'triangle', 0.3]],
  found: [[79, 0, 0.08, 'triangle', 0.3], [84, 0.08, 0.08, 'triangle', 0.3], [88, 0.16, 0.08, 'triangle', 0.3], [96, 0.24, 0.3, 'triangle', 0.3]],
  level: [[72, 0, 0.1], [76, 0.1, 0.1], [79, 0.2, 0.1], [84, 0.3, 0.35]],
  medal: [[76, 0, 0.1], [79, 0.1, 0.1], [84, 0.2, 0.1], [88, 0.3, 0.4, 'triangle', 0.3]],
  win: [[72, 0, 0.12], [79, 0.12, 0.12], [84, 0.24, 0.12], [88, 0.36, 0.12], [91, 0.48, 0.5, 'triangle', 0.3]],
  prestige: [
    [60, 0, 0.2], [64, 0.2, 0.2], [67, 0.4, 0.2], [72, 0.6, 0.3],
    [67, 0.9, 0.15], [72, 1.05, 0.15], [76, 1.2, 0.15], [84, 1.35, 0.8, 'triangle', 0.3],
  ],
};

// ---------------------------------------------------------------- music

/** C – Am – F – G, two bars each; a calm 96 bpm. */
const CHORDS = [
  [48, 52, 55],
  [45, 48, 52],
  [41, 45, 48],
  [43, 47, 50],
];
const PENTATONIC = [0, 2, 4, 7, 9];
const BPM = 96;
const BEAT = 60 / BPM;

/** A melody note per eighth (or a rest), picked from the chord's scale with a fixed seed: the same tune every time. */
function melody(): (number | null)[] {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const notes: (number | null)[] = [];
  let step = 2;
  for (let bar = 0; bar < 8; bar++)
    for (let e = 0; e < 8; e++) {
      if (rnd() < 0.3) {
        notes.push(null);
        continue;
      }
      step = Math.max(0, Math.min(9, step + Math.floor(rnd() * 5) - 2));
      notes.push(72 + Math.floor(step / 5) * 12 + PENTATONIC[step % 5]!);
    }
  return notes;
}

class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  sound = read(SOUND_KEY, false);
  music = read(MUSIC_KEY, false);
  private lastTap = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextAt = 0;
  private eighth = 0;
  private tune = melody();

  constructor() {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      this.start();
      if (this.ctx) {
        window.removeEventListener('pointerdown', unlock, true);
        window.removeEventListener('keydown', unlock, true);
      }
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    document.addEventListener('visibilitychange', () => (document.hidden ? void this.ctx?.suspend() : void this.ctx?.resume()));
  }

  private start(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      try {
        this.ctx = new Ctx();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.35;
      this.musicGain.connect(this.master);
    }
    void this.ctx.resume();
    this.syncMusic();
  }

  setSound(on: boolean): void {
    this.sound = on;
    write(SOUND_KEY, on);
  }

  setMusic(on: boolean): void {
    this.music = on;
    write(MUSIC_KEY, on);
    this.syncMusic();
  }

  play(name: Sfx): void {
    if (!this.sound || !this.ctx || !this.master || this.ctx.state !== 'running') return;
    // Mashing the windmill: at most one click sound every 60 ms.
    if (name === 'tap') {
      const now = performance.now();
      if (now - this.lastTap < 60) return;
      this.lastTap = now;
    }
    const t0 = this.ctx.currentTime + 0.01;
    for (const [note, at, len, wave = 'square', vol = 0.15] of SFX[name]) this.tone(this.master, note, t0 + at, len, wave, vol);
  }

  private tone(out: AudioNode, note: number, at: number, len: number, wave: Wave, vol: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = wave;
    osc.frequency.value = hz(note);
    // Short attack and release, so notes don't click.
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(vol, at + 0.005);
    env.gain.setValueAtTime(vol, at + Math.max(0.005, len - 0.03));
    env.gain.linearRampToValueAtTime(0, at + len);
    osc.connect(env).connect(out);
    osc.start(at);
    osc.stop(at + len + 0.02);
  }

  /** Music on: a look-ahead scheduler queues the next notes every 100 ms. */
  private syncMusic(): void {
    const want = this.music && !!this.ctx;
    if (want && !this.timer) {
      this.nextAt = this.ctx!.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 100);
    } else if (!want && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain || ctx.state !== 'running') return;
    if (this.nextAt < ctx.currentTime) this.nextAt = ctx.currentTime + 0.05;
    const eighth = BEAT / 2;
    while (this.nextAt < ctx.currentTime + 0.3) {
      const i = this.eighth % this.tune.length;
      const bar = Math.floor(i / 8);
      const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length]!;
      // Bass on beats 1 and 3, a soft chord pulse on 2 and 4, the tune on top.
      if (i % 4 === 0) this.tone(this.musicGain, chord[0]! - 12, this.nextAt, eighth * 1.8, 'triangle', 0.35);
      if (i % 4 === 2) for (const n of chord) this.tone(this.musicGain, n + 12, this.nextAt, eighth * 0.8, 'square', 0.03);
      const m = this.tune[i];
      if (m !== null && m !== undefined) this.tone(this.musicGain, m, this.nextAt, eighth * 0.9, 'square', 0.06);
      this.nextAt += eighth;
      this.eighth++;
    }
  }
}

export const audio = new Audio();
export const sfx = (name: Sfx) => audio.play(name);
