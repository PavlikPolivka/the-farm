import Phaser from 'phaser';
import {
  ANIMALS,
  ANIMAL_IDS,
  ECONOMY,
  formatNumber,
  growth,
  isRipe,
  landCost,
  landLevel,
  type AnimalId,
  type FarmState,
} from '@pixel-farm/shared';
import type { Store } from '../game/store.js';
import { locale } from '../i18n/index.js';
import { prefersReducedMotion } from '../ui/prefs.js';

/** Logical layout in 16 px tiles; everything is drawn at an integer scale S. */
const W = 112;
const FIELD_X0 = 6;
const FIELD_PITCH_X = 28;
const FIELDS_Y0 = 84;
const FIELD_PITCH_Y = 24;
const FIELD_HIT_PAD = 5;
const WINDMILL = { x: 48, y: 30, hubX: 56, hubY: 36, hit: { x: 38, y: 18, w: 36, h: 40 } };
const BARN = { x: 6, y: 18, hit: { x: 4, y: 14, w: 36, h: 38 } };
const PEN = { x: 76, y: 16, hit: { x: 74, y: 12, w: 36, h: 48 } };
const DRAG_THRESHOLD = 10;

export const SPRITES = [
  'soil', 'grass', 'grass-tuft', 'grass-flower', 'tree-orange', 'bush', 'fence-l', 'fence-m', 'fence-r',
  'hay', 'trough', 'sign', 'lock', 'farmhand', 'sparkle', 'windmill', 'windmill-sails', 'barn-icon', 'chicken', 'sheep',
  'cow', 'beehive', 'coin',
  ...['wheat', 'carrot', 'corn', 'tomato', 'cabbage'].flatMap((c) => [`${c}-1`, `${c}-2`, `${c}-3`]),
];

export type Target = 'windmill' | 'barn' | 'pen' | 'land' | `field:${number}`;

export interface SceneCallbacks {
  onField(index: number, screen: { x: number; y: number }): void;
  onWindmill(screen: { x: number; y: number }): void;
  onBarn(): void;
  onPen(): void;
  onLand(): void;
  onReady(scene: FarmScene): void;
}

interface FieldView {
  soil: Phaser.GameObjects.Image;
  crop: Phaser.GameObjects.Image;
  sparkle: Phaser.GameObjects.Image;
  hand: Phaser.GameObjects.Image;
  bar: Phaser.GameObjects.Rectangle;
  barBg: Phaser.GameObjects.Rectangle;
  stage: string;
}

const ANIMAL_SPRITE: Record<AnimalId, string> = { chicken: 'chicken', sheep: 'sheep', cow: 'cow', bees: 'beehive' };

export class FarmScene extends Phaser.Scene {
  private store!: Store;
  private cb!: SceneCallbacks;
  private S = 3;
  private ox = 0;
  private fields: FieldView[] = [];
  private sails!: Phaser.GameObjects.Image;
  private sailSpeed = 0;
  private world!: Phaser.GameObjects.Container;
  private animalViews = new Map<AnimalId, { img: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text }>();
  private landRow: { sign: Phaser.GameObjects.Image; lock: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text } | null = null;
  private drag: { y: number; scroll: number; moved: boolean } | null = null;
  private layoutKey = '';
  /** True once create() has run and taps are handled. */
  ready = false;

  constructor() {
    super('farm');
  }

  init(data: { store: Store; callbacks: SceneCallbacks }): void {
    this.store = data.store;
    this.cb = data.callbacks;
  }

  preload(): void {
    for (const name of SPRITES) this.load.image(name, `/sprites/${name}.png`);
  }

  create(): void {
    this.scale.on('resize', () => this.rebuild());
    // Native pointer events: handled immediately, unlike Phaser's per-frame input queue,
    // so fast windmill mashing never drops a tap.
    const canvas = this.game.canvas;
    canvas.style.touchAction = 'none';
    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      this.drag = { y: local(e).y, scroll: this.cameras.main.scrollY, moved: false };
    };
    const move = (e: PointerEvent) => {
      if (!this.drag || !e.isPrimary) return;
      const dy = local(e).y - this.drag.y;
      if (Math.abs(dy) > DRAG_THRESHOLD) this.drag.moved = true;
      if (this.drag.moved) this.setScroll(this.drag.scroll - dy);
    };
    const up = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      const tap = this.drag && !this.drag.moved;
      this.drag = null;
      if (tap) {
        const p = local(e);
        this.handleTap(p.x, p.y);
      }
    };
    const cancel = () => (this.drag = null);
    canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    this.events.once('destroy', () => {
      canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    });
    this.rebuild();
    this.ready = true;
    this.cb.onReady(this);
  }

  update(_time: number, delta: number): void {
    const s = this.store.state;
    // Field count, land or animal herd changed: rebuild the static layout.
    const key = `${s.fields.length}:${s.land}:${ANIMAL_IDS.map((a) => (s.animals[a].count ? 1 : 0)).join('')}`;
    if (key !== this.layoutKey) this.rebuild();
    this.updateFields(s);
    this.updateAnimals(s);
    if (!prefersReducedMotion()) {
      this.sailSpeed = Math.max(0.02, this.sailSpeed * Math.pow(0.97, delta / 16));
      this.sails.rotation += this.sailSpeed * (delta / 16) * 0.05;
    }
  }

  /** Screen position (CSS px, page coordinates) of a target, for the tutorial pointer. */
  screenPos(target: Target): { x: number; y: number } | null {
    if (!this.ready) return null;
    const rect = this.game.canvas.getBoundingClientRect();
    const at = (lx: number, ly: number) => ({
      x: rect.left + this.ox + lx * this.S,
      y: rect.top + ly * this.S - this.cameras.main.scrollY,
    });
    if (target === 'windmill') return at(WINDMILL.hubX, WINDMILL.y + 8);
    if (target === 'barn') return at(BARN.x + 16, BARN.y + 16);
    if (target === 'pen') return at(PEN.x + 16, PEN.y + 20);
    if (target === 'land') return at(W / 2, this.landRowY() + 8);
    const i = Number(target.split(':')[1]);
    if (!(i < this.store.state.fields.length)) return null;
    const { x, y } = fieldPos(i);
    return at(x + 8, y + 8);
  }

  /** Visual feedback for a windmill tap. */
  spin(): void {
    this.sailSpeed = Math.min(1.2, this.sailSpeed + 0.35);
  }

  /** Visual feedback for a harvest. */
  pop(index: number): void {
    const v = this.fields[index];
    if (!v || prefersReducedMotion()) return;
    this.tweens.add({ targets: v.soil, scale: { from: this.S * 1.15, to: this.S }, duration: 160, ease: 'Back.out' });
  }

  private setScroll(y: number): void {
    const max = Math.max(0, this.worldHeight() * this.S - this.scale.height);
    this.cameras.main.scrollY = Phaser.Math.Clamp(y, 0, max);
  }

  private worldHeight(): number {
    return this.landRowY() + (landLevel(this.store.state) === null ? 0 : 24) + 8;
  }

  private landRowY(): number {
    return FIELDS_Y0 + this.store.state.land * FIELD_PITCH_Y;
  }

  private handleTap(px: number, py: number): void {
    const lx = (px - this.ox) / this.S;
    const ly = (py + this.cameras.main.scrollY) / this.S;
    const inside = (r: { x: number; y: number; w: number; h: number }) => lx >= r.x && lx < r.x + r.w && ly >= r.y && ly < r.y + r.h;
    const s = this.store.state;
    for (let i = 0; i < s.fields.length; i++) {
      const { x, y } = fieldPos(i);
      if (inside({ x: x - FIELD_HIT_PAD, y: y - FIELD_HIT_PAD, w: 16 + 2 * FIELD_HIT_PAD, h: 16 + 2 * FIELD_HIT_PAD })) {
        return this.cb.onField(i, this.toPage(px, py));
      }
    }
    if (inside(WINDMILL.hit)) return this.cb.onWindmill(this.toPage(px, py));
    if (inside(BARN.hit)) return this.cb.onBarn();
    if (inside(PEN.hit)) return this.cb.onPen();
    if (landLevel(s) !== null && ly >= this.landRowY() - 4 && ly < this.landRowY() + 20) return this.cb.onLand();
  }

  /** Canvas-local point to page coordinates. */
  private toPage(px: number, py: number) {
    const rect = this.game.canvas.getBoundingClientRect();
    return { x: rect.left + px, y: rect.top + py };
  }

  private rebuild(): void {
    const s = this.store.state;
    const { width, height } = this.scale.gameSize;
    this.S = Math.max(2, Math.min(6, Math.floor(width / W)));
    this.ox = Math.floor((width - W * this.S) / 2);
    this.world?.destroy();
    this.fields = [];
    this.animalViews.clear();
    this.landRow = null;
    this.world = this.add.container(this.ox, 0);
    const S = this.S;
    const img = (key: string, x: number, y: number, origin = 0) => {
      const o = this.add.image(x * S, y * S, key).setScale(S).setOrigin(origin);
      this.world.add(o);
      return o;
    };

    // Ground: grass everywhere, with a deterministic sprinkle of tufts and flowers.
    const rows = Math.ceil(Math.max(this.worldHeight(), height / S) / 16) + 1;
    const extra = Math.ceil(this.ox / S / 16);
    for (let ty = 0; ty < rows; ty++)
      for (let tx = -extra; tx < W / 16 + extra; tx++) {
        const h = (tx * 7 + ty * 13) % 11;
        img(h === 0 ? 'grass-flower' : h < 3 ? 'grass-tuft' : 'grass', tx * 16, ty * 16);
      }

    // Village: trees, barn, windmill, animal pen, fence.
    img('bush', 0, 0);
    img('tree-orange', 96, 0);
    img('tree-orange', 24, 0);
    img('barn-icon', BARN.x, BARN.y).setScale(S * 2);
    img('windmill', WINDMILL.x, WINDMILL.y);
    this.sails = img('windmill-sails', WINDMILL.hubX, WINDMILL.hubY, 0.5);
    img('hay', PEN.x, PEN.y + 32);
    img('trough', PEN.x + 16, PEN.y + 32);
    const owned = ANIMAL_IDS.filter((a) => s.animals[a].count > 0);
    owned.forEach((a, n) => {
      const x = PEN.x + (n % 2) * 16;
      const y = PEN.y + Math.floor(n / 2) * 16;
      const animal = img(ANIMAL_SPRITE[a], x, y);
      const label = this.add
        .text((x + 15) * S, (y + 15) * S, '', { fontFamily: 'system-ui, sans-serif', fontSize: `${4 * S}px`, fontStyle: 'bold', color: '#ffffff', stroke: '#3f2631', strokeThickness: S })
        .setOrigin(1, 1)
        .setResolution(window.devicePixelRatio || 1);
      this.world.add(label);
      this.animalViews.set(a, { img: animal, label });
      if (!prefersReducedMotion())
        this.tweens.add({ targets: animal, y: (y - 1) * S, yoyo: true, repeat: -1, duration: 300 + n * 70, delay: n * 120, repeatDelay: 900 + n * 300 });
    });
    img('fence-l', 0, 64);
    for (let x = 16; x < W - 16; x += 16) img('fence-m', x, 64);
    img('fence-r', W - 16, 64);

    // Fields.
    s.fields.forEach((_, i) => {
      const { x, y } = fieldPos(i);
      const soil = img('soil', x + 8, y + 8, 0.5);
      const crop = img('wheat-1', x, y).setVisible(false);
      const sparkle = img('sparkle', x, y - 6).setVisible(false);
      const hand = img('farmhand', x + 9, y + 4).setVisible(false).setScale(S * 0.75);
      const barBg = this.add.rectangle(x * S, (y + 17) * S, 16 * S, S, 0x3f2631).setOrigin(0).setVisible(false);
      const bar = this.add.rectangle(x * S, (y + 17) * S, 0, S, 0x84c669).setOrigin(0).setVisible(false);
      this.world.add([barBg, bar]);
      if (!prefersReducedMotion()) this.tweens.add({ targets: sparkle, alpha: 0.25, yoyo: true, repeat: -1, duration: 500 });
      this.fields.push({ soil, crop, sparkle, hand, bar, barBg, stage: '' });
    });

    // The next land tile, for sale.
    const need = landLevel(s);
    if (need !== null) {
      const y = this.landRowY();
      const sign = img('sign', W / 2 - 24, y);
      const lock = img('lock', W / 2 - 8, y);
      const label = this.add
        .text((W / 2 + 10) * S, (y + 8) * S, '', { fontFamily: 'system-ui, sans-serif', fontSize: `${5 * S}px`, fontStyle: 'bold', color: '#ffffff', stroke: '#3f2631', strokeThickness: S })
        .setOrigin(0, 0.5)
        .setResolution(window.devicePixelRatio || 1);
      this.world.add(label);
      this.landRow = { sign, lock, label };
    }

    this.layoutKey = `${s.fields.length}:${s.land}:${ANIMAL_IDS.map((a) => (s.animals[a].count ? 1 : 0)).join('')}`;
    this.setScroll(this.cameras.main.scrollY);
  }

  private updateFields(s: FarmState): void {
    s.fields.forEach((f, i) => {
      const v = this.fields[i];
      if (!v) return;
      const ripe = isRipe(s, f, Date.now());
      const g = growth(s, f, Date.now());
      const stage = !f.crop ? '' : ripe ? `${f.crop}-3` : g < 0.4 ? `${f.crop}-1` : `${f.crop}-2`;
      if (stage !== v.stage) {
        v.stage = stage;
        v.crop.setVisible(!!stage);
        if (stage) v.crop.setTexture(stage);
      }
      v.sparkle.setVisible(ripe);
      v.hand.setVisible(f.auto);
      const growing = !!f.crop && !ripe;
      v.bar.setVisible(growing);
      v.barBg.setVisible(growing);
      if (growing) v.bar.width = Math.max(1, Math.round(16 * g)) * this.S;
    });
    if (this.landRow) {
      const need = landLevel(s);
      this.landRow.label.setText(need !== null ? formatNumber(landCost(s), locale()) : '');
    }
  }

  private updateAnimals(s: FarmState): void {
    for (const [a, v] of this.animalViews) {
      const n = s.animals[a].count;
      v.label.setText(n > 1 ? `×${n}` : '');
      // A hungry animal (no feed in the barn) is shown faded.
      const feed = ANIMALS[a].feed;
      v.img.setAlpha(feed && s.inv[feed] < ANIMALS[a].feedPer ? 0.5 : 1);
    }
  }
}

export function fieldPos(i: number): { x: number; y: number } {
  const perRow = ECONOMY.fieldsPerLand;
  return { x: FIELD_X0 + (i % perRow) * FIELD_PITCH_X, y: FIELDS_Y0 + Math.floor(i / perRow) * FIELD_PITCH_Y };
}
