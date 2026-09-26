import Phaser from 'phaser';
import { GAME_W, GAME_H } from './constants.js';
import { PAL } from './palette.js';
import { Boot } from './scenes/Boot.js';
import { Title } from './scenes/Title.js';
import { Overworld } from './scenes/Overworld.js';
import { Battle } from './scenes/Battle.js';
import { Bag } from './scenes/Bag.js';
import { Status } from './scenes/Status.js';
import { MapView } from './scenes/MapView.js';

// Escalado entero únicamente: el pixel art nunca se deforma ni se difumina.
function integerZoom() {
  return Math.max(1, Math.floor(Math.min(window.innerWidth / GAME_W, window.innerHeight / GAME_H)));
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: PAL.ink,
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.NONE, width: GAME_W, height: GAME_H, zoom: integerZoom(), autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [Boot, Title, Overworld, Battle, Bag, Status, MapView],
});

window.addEventListener('resize', () => game.scale.setZoom(integerZoom()));
window.__game = game;
