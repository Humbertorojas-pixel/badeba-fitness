import { TRACKS } from './tracks.js';

const NOTE_INDEX = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };

export function noteFreq(name, transpose = 0) {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(name);
  if (!m) return null;
  const midi = (Number(m[2]) + 1) * 12 + NOTE_INDEX[m[1]] + transpose;
  return 440 * 2 ** ((midi - 69) / 12);
}

function pulseWave(ctx, duty) {
  const n = 64;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
  return ctx.createPeriodicWave(real, imag);
}

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.track = null;
    this.timer = null;
  }

  // Debe llamarse tras un gesto del usuario (política de autoplay del navegador).
  init() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.55;
    this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);
    this.waves = { pulse12: pulseWave(ctx, 0.125), pulse25: pulseWave(ctx, 0.25), pulse50: pulseWave(ctx, 0.5) };
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  get ready() {
    return !!this.ctx;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
    return this.muted;
  }

  tone({ wave = 'pulse25', freq, slideTo, t = 0, dur = 0.1, vol = 0.3, attack = 0.005, release = 0.04, bus }) {
    if (!this.ctx || !freq) return;
    const ctx = this.ctx;
    const start = Math.max(ctx.currentTime, t || ctx.currentTime);
    const osc = ctx.createOscillator();
    if (this.waves[wave]) osc.setPeriodicWave(this.waves[wave]);
    else osc.type = wave;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(vol, start + attack);
    g.gain.setValueAtTime(vol, start + Math.max(attack, dur - release));
    g.gain.linearRampToValueAtTime(0, start + dur);
    osc.connect(g).connect(bus || this.sfxBus);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  noise({ t = 0, dur = 0.1, vol = 0.3, filter = 'bandpass', freq = 1000, freqTo, q = 1, bus }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const start = Math.max(ctx.currentTime, t || ctx.currentTime);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, start);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, start + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    src.connect(f).connect(g).connect(bus || this.sfxBus);
    src.start(start, Math.random() * 0.5);
    src.stop(start + dur + 0.02);
  }

  sfx(name) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const seq = (notes, step, opts) => notes.forEach((n, i) => this.tone({ freq: noteFreq(n), t: now + i * step, dur: step, ...opts }));
    switch (name) {
      case 'cursor': this.tone({ wave: 'pulse50', freq: 1175, dur: 0.03, vol: 0.12 }); break;
      case 'confirm': seq(['A5', 'E6'], 0.045, { wave: 'pulse25', vol: 0.14 }); break;
      case 'cancel': this.tone({ wave: 'pulse25', freq: 660, slideTo: 330, dur: 0.08, vol: 0.14 }); break;
      case 'bump': this.tone({ wave: 'triangle', freq: 110, slideTo: 55, dur: 0.1, vol: 0.5 }); break;
      case 'step': this.noise({ dur: 0.03, vol: 0.05, filter: 'lowpass', freq: 500 }); break;
      case 'hit':
        this.noise({ dur: 0.16, vol: 0.5, filter: 'bandpass', freq: 1400, freqTo: 300, q: 0.8 });
        this.tone({ wave: 'pulse50', freq: 220, slideTo: 70, dur: 0.14, vol: 0.2 });
        break;
      case 'crit':
        this.noise({ dur: 0.28, vol: 0.6, filter: 'bandpass', freq: 3000, freqTo: 200, q: 0.6 });
        this.tone({ wave: 'pulse12', freq: 880, slideTo: 55, dur: 0.25, vol: 0.2 });
        break;
      case 'miss': this.noise({ dur: 0.2, vol: 0.25, filter: 'highpass', freq: 800, freqTo: 5000 }); break;
      case 'guard': this.tone({ wave: 'pulse50', freq: 1400, dur: 0.12, vol: 0.1 }); this.tone({ wave: 'pulse50', freq: 1465, dur: 0.12, vol: 0.08 }); break;
      case 'encounter': seq(['A4', 'C5', 'E5', 'A5', 'C6', 'E6', 'A6'], 0.04, { wave: 'pulse12', vol: 0.14 }); break;
      case 'heal': seq(['C5', 'E5', 'G5', 'C6'], 0.07, { wave: 'sine', vol: 0.2 }); break;
      case 'faint': this.tone({ wave: 'pulse25', freq: 440, slideTo: 60, dur: 0.6, vol: 0.18 }); break;
      case 'flee': this.noise({ dur: 0.35, vol: 0.3, filter: 'bandpass', freq: 400, freqTo: 4000, q: 2 }); break;
      case 'stairs': seq(['E5', 'C5', 'A4', 'E4', 'C4', 'A3'], 0.08, { wave: 'pulse25', vol: 0.14 }); break;
      case 'inspect': seq(['E5', 'B5'], 0.05, { wave: 'pulse12', vol: 0.12 }); break;
      default: break;
    }
  }

  playMusic(name) {
    if (!this.ctx) return;
    if (this.track?.name === name) return;
    this.stopMusic();
    const def = TRACKS[name];
    if (!def) return;
    const stepDur = 60 / def.bpm / 4;
    const channels = def.channels.map((ch) => ({ ...ch, tokens: ch.notes.trim().split(/\s+/), pos: 0 }));
    this.track = { name, def, stepDur, channels, nextTime: this.ctx.currentTime + 0.05, step: 0, done: false };
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  schedule() {
    const tr = this.track;
    if (!tr || !this.ctx) return;
    const loop = tr.def.loop !== false;
    const maxLen = Math.max(...tr.channels.map((c) => c.tokens.length));
    while (tr.nextTime < this.ctx.currentTime + 0.15) {
      if (!loop && tr.step >= maxLen) {
        this.stopMusic();
        return;
      }
      for (const ch of tr.channels) {
        const i = tr.step % ch.tokens.length;
        if (!loop && tr.step >= ch.tokens.length) continue;
        const tok = ch.tokens[i];
        if (tok === '.' || tok === '-') continue;
        let hold = 1;
        while (ch.tokens[(i + hold) % ch.tokens.length] === '-' && hold < ch.tokens.length) hold++;
        const dur = hold * tr.stepDur;
        if (ch.wave === 'noise') this.drum(tok, tr.nextTime, ch.vol);
        else {
          this.tone({ wave: ch.wave, freq: noteFreq(tok), t: tr.nextTime, dur: dur * 0.95, vol: ch.vol, attack: 0.01, release: Math.min(0.08, dur * 0.3), bus: this.musicBus });
          if (ch.echo) {
            this.tone({ wave: ch.wave, freq: noteFreq(tok, ch.echo.transpose || 0), t: tr.nextTime + ch.echo.delay * tr.stepDur, dur: dur * 0.9, vol: ch.vol * ch.echo.vol, attack: 0.01, release: 0.05, bus: this.musicBus });
          }
        }
      }
      tr.step++;
      tr.nextTime += tr.stepDur;
    }
  }

  drum(tok, t, vol) {
    const bus = this.musicBus;
    if (tok === 'k') {
      this.tone({ wave: 'triangle', freq: 150, slideTo: 40, t, dur: 0.12, vol: vol * 4, bus });
      this.noise({ t, dur: 0.05, vol: vol, filter: 'lowpass', freq: 300, bus });
    } else if (tok === 's') {
      this.noise({ t, dur: 0.12, vol: vol * 1.6, filter: 'bandpass', freq: 1800, q: 0.7, bus });
    } else if (tok === 'h') {
      this.noise({ t, dur: 0.035, vol: vol, filter: 'highpass', freq: 6500, bus });
    }
  }

  stopMusic() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.track = null;
  }
}

export const audio = new AudioEngine();
