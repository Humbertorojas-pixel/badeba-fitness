import { describe, it, expect } from 'vitest';
import { createRng } from '../src/core/rng.js';
import { initialWeather, stepWeather, weatherOf, WEATHERS, BIOME_WEATHER } from '../src/world/weather.js';
import { generateEnemyTemplate, rollEnemyRank, RANKS, natureOf } from '../src/world/enemyGen.js';
import { MOVES } from '../src/data/moves.js';
import { drawEquipIcon, drawItemIcon } from '../src/gfx/itemArt.js';
import { itemMaterial } from '../src/data/items.js';
import { BIOMES } from '../src/world/biomes.js';
import { rollEnemyLoot, newPity, generateItem } from '../src/core/loot.js';
import { itemLook, BASES } from '../src/data/items.js';
import { newPlayer, xpReward } from '../src/core/character.js';
import { buildHeroOverworld, buildHeroBack, lookFromEquipment, lookSignature, HERO_W, HERO_H } from '../src/gfx/heroArt.js';
import { generateMonster } from '../src/gfx/monsterGen.js';
import { generateFloor } from '../src/world/generate.js';
import { fleeChance } from '../src/core/battle.js';
import { generateDungeon } from '../src/world/dungeon.js';
import { reachable } from '../src/world/floor.js';

describe('clima', () => {
  it('el primer piso empieza en calma y cada bioma usa sus propios climas', () => {
    const rng = createRng(1);
    expect(initialWeather(rng, 'bosque', 1).kind).toBe('despejado');
    for (const biome of Object.keys(BIOME_WEATHER)) {
      const state = initialWeather(rng, biome, 3);
      const seen = new Set([state.kind]);
      for (let i = 0; i < 3000; i++) {
        const before = state.kind;
        const changed = stepWeather(state, rng, biome);
        if (changed) {
          expect(changed).not.toBe(before);
          seen.add(changed);
        }
      }
      for (const k of seen) expect(Object.keys(BIOME_WEATHER[biome])).toContain(k);
      expect(seen.size).toBeGreaterThan(2);
    }
  });

  it('cada clima define efectos de juego legibles', () => {
    for (const w of Object.values(WEATHERS)) {
      expect(w.name).toBeTruthy();
      expect(w.sight).toBeGreaterThanOrEqual(1);
      expect(w.reveal).toBeGreaterThanOrEqual(4);
      if (w.acc || w.flee) expect(w.battle).toBeTruthy();
    }
    expect(weatherOf(null)).toBe(WEATHERS.despejado);
    expect(fleeChance({ spd: 8, fleeBonus: 0.2 }, { spd: 8 })).toBeCloseTo(0.7);
  });
});

describe('rango de enemigos', () => {
  it('la rareza de enemigos sigue la escala: común ≫ raro ≫ legendario ≫ único', () => {
    const rng = createRng(5);
    const n = { comun: 0, raro: 0, legendario: 0, unico: 0 };
    for (let i = 0; i < 50000; i++) n[rollEnemyRank(rng, 4)]++;
    expect(n.comun).toBeGreaterThan(n.raro * 3);
    expect(n.raro).toBeGreaterThan(n.legendario * 3);
    expect(n.legendario).toBeGreaterThan(n.unico * 3);
    expect(n.unico).toBeGreaterThan(0);
    const early = createRng(6);
    for (let i = 0; i < 20000; i++) expect(rollEnemyRank(early, 1)).not.toBe('unico');
  });

  it('el rango escala stats, da movimiento de firma y más experiencia', () => {
    const base = { seed: 77, depth: 3, biome: BIOMES.necropolis };
    const common = generateEnemyTemplate({ ...base, rank: 'comun' });
    const legend = generateEnemyTemplate({ ...base, rank: 'legendario' });
    expect(legend.maxHp).toBeGreaterThan(common.maxHp * (RANKS.legendario.hp - 0.2));
    expect(legend.moves.length).toBe(common.moves.length + 1);
    expect(legend.article).toBe('');
    expect(legend.title).toBeTruthy();
    expect(xpReward(legend)).toBeGreaterThan(xpReward(common) * 3);
    const unique = generateEnemyTemplate({ ...base, rank: 'unico' });
    expect(unique.name).toMatch(/^(El|La) /);
  });

  it('cada región tiene un guardián legendario pasivo junto al monumento', () => {
    for (let s = 1; s <= 5; s++) {
      const f = generateFloor({ runSeed: s, depth: 2 });
      const g = f.enemies.find((e) => e.id === 'guardian');
      if (!f.landmark) continue;
      expect(g).toBeTruthy();
      expect(g.passive).toBe(true);
      expect(g.template.rank).toBe('legendario');
    }
  });

  it('el botín mejora con el rango sin regalar legendarios', () => {
    const rng = createRng(9);
    for (let i = 0; i < 200; i++) {
      const loot = rollEnemyLoot(rng, newPity(), 3, 5, 'legendario');
      expect(loot.kind).toBe('equip');
      expect(['raro', 'legendario', 'unico']).toContain(loot.rarity);
    }
    const u = rollEnemyLoot(rng, newPity(), 3, 5, 'unico');
    expect(['legendario', 'unico']).toContain(u.rarity);
    const pity = newPity();
    rollEnemyLoot(rng, pity, 3, 5, 'legendario');
    expect(pity.legendario).toBeGreaterThanOrEqual(20);
  });
});

describe('equipo visible', () => {
  it('cada arma y armadura tiene aspecto, también en guardados antiguos sin `look`', () => {
    const rng = createRng(3);
    for (const slot of ['arma', 'armadura']) {
      for (let i = 0; i < 40; i++) expect(itemLook(generateItem(rng, 'raro', 5, slot))).toBeTruthy();
      for (const b of BASES[slot]) expect(itemLook({ slot, name: `${b.name} férreo` })).toBe(b.look);
    }
    expect(itemLook({ slot: 'armadura', name: 'Cota férrea' })).toBe('cota');
    expect(itemLook({ slot: 'reliquia', name: 'Amuleto' })).toBe(null);
  });

  it('el Errante empieza con espada mellada y harapos (solo aspecto)', () => {
    const p = newPlayer();
    expect(p.equipment.arma.look).toBe('espada');
    expect(Object.keys(p.equipment.arma.mods)).toHaveLength(0);
    expect(lookSignature(lookFromEquipment(p.equipment))).toBe('harapos-comun-espada-comun');
  });

  it('el sprite cambia con la armadura, el arma y su rareza', () => {
    const a = buildHeroOverworld({ armor: 'harapos', armorRarity: 'comun', weapon: 'espada', weaponRarity: 'comun' });
    const b = buildHeroOverworld({ armor: 'placas', armorRarity: 'comun', weapon: 'espada', weaponRarity: 'comun' });
    const c = buildHeroOverworld({ armor: 'placas', armorRarity: 'legendario', weapon: 'mandoble', weaponRarity: 'legendario' });
    expect(a).toHaveLength(12);
    expect(a[0].w).toBe(HERO_W);
    expect(a[0].h).toBe(HERO_H);
    expect(a[0].px).not.toEqual(b[0].px);
    expect(b[0].px).not.toEqual(c[0].px);
    const back1 = buildHeroBack({ armor: 'coraza', armorRarity: 'raro', weapon: 'hacha', weaponRarity: 'raro' });
    const back2 = buildHeroBack({ armor: 'coraza', armorRarity: 'raro', weapon: 'lanza', weaponRarity: 'raro' });
    expect(back1.count()).toBeGreaterThan(1500);
    expect(back1.px).not.toEqual(back2.px);
  });
});

describe('criaturas por anatomía', () => {
  const forms = {
    beast: ['carronero', 'mastin', 'devorador', 'bestia', 'hiena'],
    humanoid: ['penitente', 'verdugo', 'ahorcado', 'flagelante', 'monja'],
    wraith: ['sombra', 'lamento', 'espectro', 'planidera', 'eco'],
    crawler: ['reptante', 'tejedor', 'roedor', 'larva', 'arana'],
    eldritch: ['engendro', 'profundo', 'ojo', 'heraldo', 'fungoide'],
    ito: ['caracol', 'cabeza_colgante', 'cabellera', 'sonriente', 'alargado', 'pez_andante'],
    undead: ['esqueleto', 'necrofago', 'vampiro', 'momia', 'liche'],
  };
  forms.beast.push('licantropo', 'gargola');
  it('cada forma produce una silueta sustancial en combate y en el mapa', () => {
    for (const [archetype, list] of Object.entries(forms)) {
      for (const form of list) {
        const big = generateMonster({ seed: 11, size: 64, archetype, ramp: 'flesh', form });
        const small = generateMonster({ seed: 11, size: 24, archetype, ramp: 'flesh', form });
        expect(big.buffer.count()).toBeGreaterThan(500);
        expect(small.buffer.count()).toBeGreaterThan(60);
      }
    }
  });

  it('el botín se ve en la criatura: arma, armadura o reliquia', () => {
    for (const archetype of ['beast', 'humanoid', 'wraith', 'eldritch', 'ito', 'undead']) {
      const base = generateMonster({ seed: 5, size: 64, archetype, ramp: 'rot' }).buffer;
      for (const loot of [{ slot: 'arma', look: 'espada', mat: 'legendario' }, { slot: 'armadura', look: 'placas', mat: 'divino' }, { slot: 'reliquia', look: 'amuleto', mat: 'infernal' }]) {
        expect(generateMonster({ seed: 5, size: 64, archetype, ramp: 'rot', loot }).buffer.px).not.toEqual(base.px);
        expect(generateMonster({ seed: 5, size: 24, archetype, ramp: 'rot', loot }).buffer.count()).toBeGreaterThan(40);
      }
    }
  });

  it('los nuevos horrores solo aparecen desde el piso 2 y tienen nombre y naturaleza', () => {
    for (let s = 0; s < 300; s++) {
      const t1 = generateEnemyTemplate({ seed: s, depth: 1, biome: BIOMES.pantano });
      expect(['eldritch', 'ito']).not.toContain(t1.archetype);
    }
    const seen = new Set();
    for (let s = 0; s < 400; s++) {
      const t = generateEnemyTemplate({ seed: s, depth: 5, biome: BIOMES[['pantano', 'ciudad', 'necropolis'][s % 3]] });
      seen.add(t.archetype);
      expect(natureOf(t)).toBeTruthy();
      expect(t.moves.every((m) => MOVES[m])).toBe(true);
    }
    for (const a of ['eldritch', 'ito', 'undead']) expect(seen.has(a)).toBe(true);
  });

  it('el rango se nota en el sprite (cuernos, ojos o aura)', () => {
    const opts = { seed: 21, size: 64, archetype: 'beast', ramp: 'rot', form: 'mastin' };
    const common = generateMonster({ ...opts, rank: 'comun' }).buffer;
    for (const rank of ['legendario', 'unico']) expect(generateMonster({ ...opts, rank }).buffer.px).not.toEqual(common.px);
  });
});

describe('iconos de objetos', () => {
  it('la complejidad crece con la rareza y los únicos son divinos o infernales', () => {
    for (const [slot, looks] of [['arma', ['daga', 'espada', 'maza', 'lanza', 'hacha', 'guadana', 'mandoble']], ['armadura', ['harapos', 'cuero', 'habito', 'cota', 'coraza', 'placas']], ['reliquia', ['amuleto', 'anillo', 'rosario', 'colgante', 'reloj', 'corazon']]]) {
      for (const look of looks) {
        const common = drawEquipIcon(slot, look, 'comun');
        const divine = drawEquipIcon(slot, look, 'divino');
        const infernal = drawEquipIcon(slot, look, 'infernal');
        expect(common.count()).toBeGreaterThan(20);
        expect(divine.count()).toBeGreaterThan(common.count());
        expect(infernal.count()).toBeGreaterThan(common.count());
        expect(divine.px).not.toEqual(infernal.px);
      }
    }
    for (const key of ['tonico', 'pocion', 'incienso']) expect(drawItemIcon({ kind: 'consumable', key }).count()).toBeGreaterThan(20);
    expect(itemMaterial({ rarity: 'unico', name: 'Lanza del Alba' })).toBe('divino');
    expect(itemMaterial({ rarity: 'unico', name: 'Hoja del Eclipse' })).toBe('infernal');
    expect(itemMaterial({ rarity: 'legendario' })).toBe('legendario');
  });
});

describe('mazmorras', () => {
  it('cada región tiene entradas a mazmorras accesibles', () => {
    for (let s = 1; s <= 8; s++) {
      const f = generateFloor({ runSeed: s, depth: 1 + (s % 5) });
      expect(f.dungeons.length).toBeGreaterThan(0);
      const seen = reachable(f, f.start);
      for (const d of f.dungeons) {
        expect(seen[d.front.y * f.w + d.front.x]).toBe(1);
        expect(f.inspect.some((i) => i.action === 'mazmorra' && i.id === d.id)).toBe(true);
      }
    }
  });

  it('cuevas y criptas: deterministas, con salida, jefe, cofres y más criaturas', () => {
    for (const theme of ['cueva_bosque', 'cueva_pantano', 'cueva_ceniza', 'cripta']) {
      for (let s = 0; s < 6; s++) {
        const opts = { seed: 100 + s, depth: 1 + s, theme, id: 'm0', name: 'X' };
        const a = generateDungeon(opts);
        const b = generateDungeon(opts);
        expect(a.walls).toEqual(b.walls);
        expect(a.dark).toBe(true);
        const seen = reachable(a, a.start);
        expect(seen[a.stairs.y * a.w + a.stairs.x]).toBe(1);
        const boss = a.enemies.find((e) => e.boss);
        expect(['raro', 'legendario']).toContain(boss.template.rank);
        expect(a.inspect.filter((i) => i.action === 'cofre').length).toBeGreaterThanOrEqual(2);
        expect(a.enemies.length).toBeGreaterThanOrEqual(8);
        expect(new Set(a.enemies.map((e) => e.id)).size).toBe(a.enemies.length);
      }
    }
  });
});
