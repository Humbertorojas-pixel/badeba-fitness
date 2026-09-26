import Phaser from 'phaser';
import { GAME_W, GAME_H, DEPTH } from '../constants.js';
import { PAL, hexToInt, hexToRgb } from '../palette.js';
import { BAYER4 } from './pixelBuffer.js';
import { createRng } from '../core/rng.js';
import { audio } from '../audio/audio.js';
import { WEATHERS } from '../world/weather.js';

// Cómo se ve cada clima: tinte de pantalla, partículas, bancos de niebla y relámpagos.
const LOOK = {
  despejado: {},
  lluvia: { tint: [PAL.steel0, 0.2], drops: { n: 80, kind: 'rain', colors: [PAL.steel3, PAL.steel2], speed: 240, slant: 0.28 } },
  tormenta: { tint: [PAL.ink, 0.34], drops: { n: 150, kind: 'rain', colors: [PAL.steel3, PAL.bone1], speed: 330, slant: 0.45 }, lightning: true },
  niebla: { tint: [PAL.stone1, 0.12], fog: [{ color: PAL.stone3, alpha: 0.5, speed: 4, parallax: 0.6 }, { color: PAL.bone0, alpha: 0.35, speed: 9, parallax: 1.1 }] },
  ceniza: { tint: [PAL.stone0, 0.18], drops: { n: 70, kind: 'flake', colors: [PAL.bone0, PAL.stone3, PAL.stone2], speed: 20, slant: 0.5 }, fog: [{ color: PAL.stone2, alpha: 0.22, speed: 6, parallax: 0.8 }] },
  brasas: { tint: [PAL.blood0, 0.2], drops: { n: 60, kind: 'ember', colors: [PAL.ember2, PAL.ember1, PAL.blood3], speed: -34, slant: 1.4 } },
  esporas: { tint: [PAL.moss0, 0.14], drops: { n: 80, kind: 'spore', colors: [PAL.ember2, PAL.moss2, PAL.bone1], speed: -7, slant: 0.3 } },
  polvo: { tint: [PAL.rust0, 0.24], drops: { n: 70, kind: 'dust', colors: [PAL.rust2, PAL.bone0], speed: 170, slant: 0 }, fog: [{ color: PAL.rust2, alpha: 0.32, speed: 55, parallax: 1 }] },
};

// Banco de niebla repetible en horizontal: manchas suaves con tramado ordenado (sin degradados).
function ensureFogTexture(scene, color) {
  const key = `fog_${color.slice(1)}`;
  if (scene.textures.exists(key)) return key;
  const w = 256;
  const h = GAME_H;
  const rng = createRng(hexToInt(color));
  const density = new Float32Array(w * h);
  for (let i = 0; i < 22; i++) {
    const cx = rng.next() * w;
    const cy = rng.next() * h;
    const rx = 30 + rng.next() * 50;
    const ry = 10 + rng.next() * 18;
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
      if (y < 0 || y >= h) continue;
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d < 1) density[y * w + (((x % w) + w) % w)] += (1 - d) * 0.8;
      }
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const [r, g, b] = hexToRgb(color);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.min(1, density[y * w + x]);
      const level = Math.floor(v * 3 + BAYER4[y % 4][x % 4]) / 3;
      const i = (y * w + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = Math.round(Math.min(1, level) * 200);
    }
  }
  ctx.putImageData(img, 0, 0);
  scene.textures.addCanvas(key, canvas);
  return key;
}

export class WeatherView {
  // `world`: las partículas se desplazan con la cámara (mapa); en combate quedan fijas.
  constructor(scene, { world = true, onLightning = null, depth = DEPTH.overlay - 3 } = {}) {
    this.scene = scene;
    this.world = world;
    this.onLightning = onLightning;
    this.kind = null;
    this.level = 0;
    this.drops = [];
    this.splashes = [];
    this.nextBolt = 0;
    this.tint = scene.add.rectangle(0, 0, GAME_W, GAME_H, 0, 0).setOrigin(0, 0).setScrollFactor(0).setDepth(depth);
    this.fogs = [0, 1].map(() => scene.add.tileSprite(0, 0, GAME_W, GAME_H, '__WHITE').setOrigin(0, 0).setScrollFactor(0).setDepth(depth + 1).setVisible(false));
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(depth + 2);
    this.flash = scene.add.rectangle(0, 0, GAME_W, GAME_H, hexToInt(PAL.bone2), 0).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.overlay + 1);
    const cam = scene.cameras.main;
    this.last = { x: cam.scrollX, y: cam.scrollY };
  }

  set(kind, instant = false) {
    if (kind === this.kind) return;
    const apply = () => {
      this.kind = kind;
      this.cfg = LOOK[kind] || {};
      const d = this.cfg.drops;
      this.drops = d ? Array.from({ length: d.n }, () => this.spawn(true)) : [];
      this.splashes = [];
      (this.cfg.fog || []).forEach((f, i) => this.fogs[i].setTexture(ensureFogTexture(this.scene, f.color)));
      this.fogs.forEach((s, i) => s.setVisible(!!this.cfg.fog?.[i]));
      this.nextBolt = this.scene.time.now + 2500;
    };
    this.scene.tweens.killTweensOf(this);
    if (instant || !this.kind) {
      apply();
      this.level = 1;
    } else {
      this.scene.tweens.add({
        targets: this, level: 0, duration: 1200,
        onComplete: () => { apply(); this.scene.tweens.add({ targets: this, level: 1, duration: 2200 }); },
      });
    }
    audio.setAmbience(WEATHERS[kind]?.sound || null);
  }

  spawn(anywhere) {
    const d = this.cfg.drops;
    const z = Math.random();
    const p = { x: Phaser.Math.Between(-30, GAME_W + 30), y: 0, z, phase: Math.random() * 6, color: Phaser.Utils.Array.GetRandom(d.colors) };
    if (anywhere) p.y = Phaser.Math.Between(-10, GAME_H);
    else if (d.speed > 0 && d.kind !== 'dust') p.y = -Phaser.Math.Between(4, 40);
    else if (d.kind === 'dust') { p.x = -Phaser.Math.Between(4, 60); p.y = Phaser.Math.Between(0, GAME_H); }
    else p.y = GAME_H + Phaser.Math.Between(2, 30);
    p.stop = d.kind === 'rain' ? Phaser.Math.Between(40, GAME_H + 10) : null;
    return p;
  }

  update(time, delta) {
    const dt = delta / 1000;
    const cam = this.scene.cameras.main;
    const dx = this.world ? cam.scrollX - this.last.x : 0;
    const dy = this.world ? cam.scrollY - this.last.y : 0;
    this.last = { x: cam.scrollX, y: cam.scrollY };
    const cfg = this.cfg || {};
    const lv = this.level;
    if (cfg.tint) this.tint.setFillStyle(hexToInt(cfg.tint[0]), cfg.tint[1] * lv);
    else this.tint.setFillStyle(0, 0);
    (cfg.fog || []).forEach((f, i) => {
      const s = this.fogs[i];
      s.tilePositionX += f.speed * dt + dx * f.parallax;
      s.tilePositionY = (this.world ? cam.scrollY * f.parallax * 0.5 : 0) % GAME_H;
      s.setAlpha(f.alpha * lv);
    });
    this.g.clear();
    const d = cfg.drops;
    if (d) {
      const visible = Math.round(this.drops.length * lv);
      for (let i = 0; i < this.drops.length; i++) {
        const p = this.drops[i];
        p.x -= dx * (0.8 + p.z * 0.4);
        p.y -= dy * (0.8 + p.z * 0.4);
        this.move(p, d, dt, time);
        if (p.x < -40) p.x += GAME_W + 80;
        if (p.x > GAME_W + 40) p.x -= GAME_W + 80;
        if (i < visible) this.draw(p, d, time);
      }
    }
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const s = this.splashes[i];
      s.t += delta;
      s.x -= dx;
      s.y -= dy;
      if (s.t > 180) { this.splashes.splice(i, 1); continue; }
      this.g.fillStyle(hexToInt(PAL.steel3), 0.7 * lv);
      if (s.t < 70) this.g.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
      else this.g.fillRect(Math.round(s.x) - 1, Math.round(s.y) - 1, 1, 1).fillRect(Math.round(s.x) + 1, Math.round(s.y) - 1, 1, 1);
    }
    if (cfg.lightning && lv > 0.8 && time > this.nextBolt) {
      this.nextBolt = time + Phaser.Math.Between(4500, 11000);
      this.bolt();
    }
  }

  move(p, d, dt, time) {
    const k = d.kind;
    if (k === 'rain') {
      const v = d.speed * (0.8 + p.z * 0.5);
      p.y += v * dt;
      p.x -= v * d.slant * dt;
      if (p.y >= p.stop) {
        if (p.z > 0.4 && this.splashes.length < 40) this.splashes.push({ x: p.x, y: p.y, t: 0 });
        Object.assign(p, this.spawn(false));
      }
    } else if (k === 'flake') {
      p.y += d.speed * (0.6 + p.z) * dt;
      p.x += (Math.sin(time / 700 + p.phase) * 10 + d.speed * d.slant) * dt;
      if (p.y > GAME_H + 4) Object.assign(p, this.spawn(false));
    } else if (k === 'ember' || k === 'spore') {
      p.y += d.speed * (0.6 + p.z) * dt;
      p.x += (Math.sin(time / 500 + p.phase) * 6 + Math.abs(d.speed) * d.slant * (0.5 + p.z)) * dt;
      if (p.y < -6) Object.assign(p, this.spawn(false));
    } else if (k === 'dust') {
      p.x += d.speed * (0.6 + p.z) * dt;
      p.y += Math.sin(time / 300 + p.phase) * 8 * dt;
      if (p.x > GAME_W + 30) Object.assign(p, this.spawn(false));
    }
  }

  draw(p, d, time) {
    const g = this.g;
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    const c = hexToInt(p.color);
    const lv = this.level;
    if (d.kind === 'rain') {
      const len = 3 + Math.round(p.z * 4);
      g.fillStyle(c, (0.35 + p.z * 0.45) * lv);
      for (let i = 0; i < len; i++) g.fillRect(Math.round(p.x + i * d.slant), y - i, 1, 1);
    } else if (d.kind === 'flake') {
      g.fillStyle(c, 0.8 * lv).fillRect(x, y, p.z > 0.6 ? 2 : 1, 1);
    } else if (d.kind === 'ember') {
      g.fillStyle(c, (0.5 + 0.5 * Math.abs(Math.sin(time / 120 + p.phase))) * lv).fillRect(x, y, 1, 1);
      if (p.z > 0.8) g.fillStyle(hexToInt(PAL.blood2), 0.5 * lv).fillRect(x, y + 1, 1, 1);
    } else if (d.kind === 'spore') {
      const a = (0.3 + 0.7 * Math.abs(Math.sin(time / 600 + p.phase))) * lv;
      g.fillStyle(c, a).fillRect(x, y, 1, 1);
      if (p.z > 0.75) g.fillStyle(c, a * 0.4).fillRect(x - 1, y, 3, 1).fillRect(x, y - 1, 1, 3);
    } else if (d.kind === 'dust') {
      g.fillStyle(c, (0.25 + p.z * 0.4) * lv).fillRect(x, y, 3 + Math.round(p.z * 6), 1);
    }
  }

  // Relámpago: doble destello, trueno con retraso según la distancia.
  bolt() {
    const s = this.scene;
    this.flash.setAlpha(0.65);
    s.tweens.add({ targets: this.flash, alpha: 0, duration: 120, onComplete: () => {
      this.flash.setAlpha(0.45);
      s.tweens.add({ targets: this.flash, alpha: 0, duration: 380 });
    } });
    s.time.delayedCall(Phaser.Math.Between(250, 900), () => audio.sfx('thunder'));
    this.onLightning?.();
  }

  destroy() {
    this.tint.destroy();
    this.fogs.forEach((f) => f.destroy());
    this.g.destroy();
    this.flash.destroy();
  }
}
