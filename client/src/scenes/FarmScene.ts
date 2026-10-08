import Phaser from 'phaser';

const TILE = 16;

/** M0 placeholder: a grass field with the barn. Proves pixel-art rendering and asset loading. */
export class FarmScene extends Phaser.Scene {
  constructor() {
    super('farm');
  }

  preload(): void {
    this.load.image('grass', '/sprites/grass.png');
    this.load.image('barn', '/sprites/barn.png');
  }

  create(): void {
    this.scale.on('resize', () => this.layout());
    this.layout();
  }

  private layout(): void {
    this.children.removeAll(true);
    const { width, height } = this.scale.gameSize;
    const scale = Math.max(2, Math.floor(Math.min(width, height) / (TILE * 6)));
    const step = TILE * scale;
    for (let y = 0; y < height; y += step)
      for (let x = 0; x < width; x += step) this.add.image(x, y, 'grass').setOrigin(0).setScale(scale);
    const barn = this.add.image(width / 2, height / 2, 'barn').setScale(scale * 2);
    this.tweens.add({ targets: barn, y: barn.y - scale, yoyo: true, repeat: -1, duration: 600, ease: 'Sine.inOut' });
  }
}
