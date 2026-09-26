import { PAL } from '../palette.js';

// Cada bioma define su topología (macro), su paleta de tiles, su música y su fauna.
export const BIOMES = {
  catacumbas: {
    name: 'Catacumbas',
    macro: 'rooms',
    music: 'catacumbas',
    tiles: {
      floorStyle: 'slab', faceStyle: 'brick',
      floor: [PAL.stone0, PAL.stone1, PAL.stone2],
      wall: [PAL.night, PAL.shade, PAL.dusk, PAL.stone0],
      face: [PAL.shade, PAL.stone0, PAL.stone1, PAL.stone2],
    },
    archetypes: { humanoid: 3, beast: 2, crawler: 2, wraith: 1 },
    ramps: ['flesh', 'bone', 'rot'],
    decals: ['huesos', 'sangre', 'grietas'],
    torchRate: 0.9,
  },
  caverna: {
    name: 'Caverna',
    macro: 'cave',
    music: 'caverna',
    tiles: {
      floorStyle: 'earth', faceStyle: 'rock',
      floor: [PAL.moss0, PAL.moss1, PAL.stone0],
      wall: [PAL.ink, PAL.night, PAL.moss0, PAL.moss1],
      face: [PAL.night, PAL.moss0, PAL.moss1, PAL.moss2],
    },
    archetypes: { crawler: 3, beast: 3, wraith: 1, humanoid: 1 },
    ramps: ['rot', 'bone', 'void'],
    decals: ['raices', 'huesos', 'grietas'],
    torchRate: 0.35,
  },
  ruinas: {
    name: 'Fortaleza en ruinas',
    macro: 'ruins',
    music: 'ruinas',
    tiles: {
      floorStyle: 'slab', faceStyle: 'brick',
      floor: [PAL.steel0, PAL.steel1, PAL.stone1],
      wall: [PAL.ink, PAL.night, PAL.steel0, PAL.steel1],
      face: [PAL.night, PAL.steel0, PAL.steel1, PAL.steel2],
    },
    archetypes: { humanoid: 3, wraith: 2, beast: 1, crawler: 1 },
    ramps: ['steel', 'rust', 'flesh'],
    decals: ['escombros', 'sangre', 'grietas'],
    torchRate: 0.7,
  },
  // Solo aparece como fragmento multiversal inyectado en otros pisos.
  abismo: {
    name: 'Eco de otra realidad',
    macro: 'rooms',
    music: 'eco',
    tiles: {
      floorStyle: 'earth', faceStyle: 'rock',
      floor: [PAL.blood0, PAL.rust0, PAL.rust1],
      wall: [PAL.ink, PAL.blood0, PAL.rust0, PAL.blood1],
      face: [PAL.blood0, PAL.rust0, PAL.blood1, PAL.ember0],
    },
    archetypes: { wraith: 2, humanoid: 1, beast: 1 },
    ramps: ['rust', 'void'],
    decals: ['sangre'],
    torchRate: 0,
  },
};

export const LAYER_BIOMES = ['catacumbas', 'caverna', 'ruinas'];

export function pickBiome(rng, depth) {
  if (depth === 1) return 'catacumbas';
  return rng.pick(LAYER_BIOMES);
}
