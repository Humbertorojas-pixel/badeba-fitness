import { describe, it, expect } from 'vitest';
import { createRng } from '../src/core/rng.js';
import { createCombatant, createEnemyCombatant, resolveTurn } from '../src/core/battle.js';
import { companionFromCreature, companionFromNpc, companionCombatant, gainCompanionXp, healParty, npcKit, PARTY_MAX } from '../src/core/party.js';
import { CUTE, cuteForBiome } from '../src/data/cute.js';
import { MOVES } from '../src/data/moves.js';
import { generateCuteTemplate, generateEnemyTemplate } from '../src/world/enemyGen.js';
import { generateMonster } from '../src/gfx/monsterGen.js';
import { generateFloor } from '../src/world/generate.js';
import { checkQuests } from '../src/world/quests.js';
import { reachable } from '../src/world/floor.js';
import { BIOMES } from '../src/world/biomes.js';
import { drawProp } from '../src/gfx/propArt.js';
import { PROPS, BUILDINGS } from '../src/world/props.js';
import { fallbackGreeting } from '../src/ai/npcFallback.js';
import { VILLAGER_ROLES } from '../src/world/npcGen.js';

const hero = () => createCombatant({ name: 'Errante', maxHp: 40, str: 10, def: 6, spd: 8, moves: ['tajo'] });

describe('criaturas adorables', () => {
  it('cada especie tiene rol, movimientos válidos y un sprite propio en mapa y combate', () => {
    for (const [form, sp] of Object.entries(CUTE)) {
      expect(['ataque', 'cura', 'guardia']).toContain(sp.role);
      for (const m of sp.moves) expect(MOVES[m], `${form}:${m}`).toBeDefined();
      const t = generateCuteTemplate({ seed: 9, depth: 2, form });
      expect(t.friend).toBe(true);
      expect(t.archetype).toBe('cute');
      for (const size of [24, 64]) {
        const { buffer } = generateMonster({ seed: t.seed, size, archetype: t.archetype, ramp: t.ramp, form: t.form });
        expect(buffer.count(), `${form}@${size}`).toBeGreaterThan(size * size * 0.12);
      }
    }
  });

  it('cada región tiene al menos una criatura adorable pasiva y hay especies para cada bioma', () => {
    for (const biome of ['bosque', 'pantano', 'ceniza', 'necropolis', 'ciudad']) expect(cuteForBiome(biome).length).toBeGreaterThan(0);
    for (const seed of [3, 17]) {
      const f = generateFloor({ runSeed: seed, depth: 1 });
      const cute = f.enemies.filter((e) => e.template.friend);
      expect(cute.length).toBeGreaterThan(0);
      for (const e of cute) expect(e.passive).toBe(true);
    }
  });

  it('vencida, se rinde (no se desploma) y se convierte en compañera', () => {
    const t = generateCuteTemplate({ seed: 5, depth: 1, form: 'lumo' });
    const enemy = createEnemyCombatant(t);
    enemy.hp = 1;
    const player = hero();
    player.spd = 99;
    const { events, outcome } = resolveTurn({ player, enemy, consumables: {} }, { type: 'move', move: 'tajo' }, createRng(1));
    expect(outcome).toBe('win');
    expect(events.some((e) => e.type === 'text' && e.text.includes('se rinde'))).toBe(true);
    const c = companionFromCreature(t, 1);
    expect(c).toMatchObject({ kind: 'criatura', name: 'Lumo', role: 'cura', level: 1 });
    expect(c.hp).toBe(c.maxHp);
  });
});

describe('equipo en combate', () => {
  it('los aliados actúan por rol: la cura te sana, la guardia te protege', () => {
    const lumo = companionFromCreature(generateCuteTemplate({ seed: 1, depth: 1, form: 'lumo' }), 1);
    const enemy = createEnemyCombatant(generateEnemyTemplate({ seed: 2, depth: 1, biome: BIOMES.bosque }));
    enemy.hp = enemy.maxHp = 999;
    const player = hero();
    player.hp = 10;
    const allies = [companionCombatant(lumo)];
    const { events } = resolveTurn({ player, enemy, consumables: {}, allies }, { type: 'move', move: 'tajo' }, createRng(4));
    expect(events.some((e) => e.type === 'text' && e.text.includes('te cura'))).toBe(true);

    const musgo = companionFromCreature(generateCuteTemplate({ seed: 1, depth: 1, form: 'musguito' }), 1);
    const p2 = hero();
    p2.hp = 8;
    const r2 = resolveTurn({ player: p2, enemy, consumables: {}, allies: [companionCombatant(musgo)] }, { type: 'move', move: 'tajo' }, createRng(4));
    expect(r2.events.some((e) => e.type === 'text' && e.text.includes('se interpone'))).toBe(true);
  });

  it('el enemigo a veces golpea a un aliado y un aliado caído se retira', () => {
    const enemy = createEnemyCombatant(generateEnemyTemplate({ seed: 7, depth: 3, biome: BIOMES.bosque }));
    enemy.hp = enemy.maxHp = 999;
    let hitAlly = false;
    let retired = false;
    for (let s = 0; s < 60 && !(hitAlly && retired); s++) {
      const ally = companionCombatant(companionFromNpc({ id: 'x', sheet: { name: 'Hugo', roleKey: 'vigia', palette: 'mercenario', role: 'vigía' } }, 1));
      ally.hp = 1;
      const { events } = resolveTurn({ player: hero(), enemy, consumables: {}, allies: [ally] }, { type: 'move', move: 'tajo' }, createRng(s));
      if (events.some((e) => e.type === 'damage' && e.side === 'ally0')) hitAlly = true;
      if (events.some((e) => e.type === 'faint' && e.side === 'ally0')) retired = true;
    }
    expect(hitAlly).toBe(true);
    expect(retired).toBe(true);
  });

  it('los compañeros suben de nivel, se curan y los aldeanos tienen kit por oficio', () => {
    const c = companionFromCreature(generateCuteTemplate({ seed: 3, depth: 1, form: 'chispa' }), 1);
    const before = c.maxHp;
    expect(gainCompanionXp(c, 500)).toBeGreaterThan(0);
    expect(c.maxHp).toBeGreaterThan(before);
    c.hp = 1;
    healParty([c], 0.25);
    expect(c.hp).toBeGreaterThan(1);
    expect(PARTY_MAX).toBe(2);
    for (const roleKey of Object.keys(VILLAGER_ROLES)) {
      const kit = npcKit({ roleKey, palette: VILLAGER_ROLES[roleKey].palette });
      for (const m of kit.moves) expect(MOVES[m], `${roleKey}:${m}`).toBeDefined();
      // Hablar sin IA nunca falla, sea cual sea el oficio.
      expect(typeof fallbackGreeting({ roleKey }, createRng(1))).toBe('string');
    }
  });
});

describe('misiones', () => {
  it('quien ofrece misión no se vuelve hostil y su objetivo existe en el piso', () => {
    for (const seed of [11, 29, 47]) {
      const f = generateFloor({ runSeed: seed, depth: 2 });
      const givers = f.npcs.filter((n) => n.quest);
      expect(givers.length).toBeGreaterThan(0);
      for (const n of givers) {
        const q = n.quest;
        expect(n.sheet.canTurnHostile).toBe(false);
        expect(q.summary.length).toBeGreaterThan(10);
        if (q.type === 'cazar') expect(f.enemies.find((e) => e.id === q.target)?.questTarget).toBe(q.id);
        if (q.type === 'jefe' || q.type === 'recuperar') expect(f.dungeons.some((d) => d.id === q.target)).toBe(true);
        if (q.type === 'peregrinar') expect(f.inspect.some((i) => i.landmark)).toBe(true);
      }
    }
  });

  it('checkQuests marca como cumplidas solo las misiones del piso cuyo objetivo se logró', () => {
    const run = { quests: [
      { id: 'a', type: 'cazar', target: 'e3', status: 'activa', floor: 2 },
      { id: 'b', type: 'jefe', target: 'm0', status: 'activa', floor: 2 },
      { id: 'c', type: 'recuperar', target: 'm1', status: 'activa', floor: 2 },
      { id: 'd', type: 'peregrinar', target: 'landmark', status: 'activa', floor: 2 },
      { id: 'e', type: 'cazar', target: 'e3', status: 'activa', floor: 1 },
    ] };
    expect(checkQuests(run, 2, { defeated: ['e3'] }).map((q) => q.id)).toEqual(['a']);
    expect(checkQuests(run, 2, { defeated: ['2_m0_boss'] }).map((q) => q.id)).toEqual(['b']);
    expect(checkQuests(run, 2, { openedBoss: 'm1' }).map((q) => q.id)).toEqual(['c']);
    expect(checkQuests(run, 2, { prayed: true }).map((q) => q.id)).toEqual(['d']);
    expect(run.quests[4].status).toBe('activa');
  });

  it('el aldeano que se une conserva su oficio en la descripción', () => {
    const c = companionFromNpc({ id: 'npc_v0_0', sheet: { name: 'Greta', roleKey: 'herrera', palette: 'mercenario', role: 'herrera de la aldea', home: 'Hondonada' } }, 2);
    expect(c).toMatchObject({ kind: 'npc', role: 'guardia', palette: 'mercenario' });
    expect(c.title).toContain('Fue herrera en Hondonada');
  });
});

describe('construcciones', () => {
  it('cada construcción nueva se dibuja en todos los estilos de bioma y cabe en su tamaño', () => {
    const kinds = ['posada', 'puesto', 'torre', 'molino', 'capilla', 'tienda', 'fogata', 'barril', 'cajas', 'lena', 'carreta'];
    for (const biome of ['bosque', 'pantano', 'ceniza', 'necropolis', 'ciudad']) {
      for (const k of kinds) {
        for (const v of [0, 1]) {
          const b = drawProp(k, BIOMES[biome], v);
          expect(b.w, k).toBe(PROPS[k].w * 16);
          expect(b.h, k).toBe(PROPS[k].h * 16);
          expect(b.count(), `${biome}:${k}`).toBeGreaterThan(b.w * b.h * 0.15);
        }
      }
    }
    // El molino gira: sus frames son distintos.
    const [f0, f1] = [0, 1].map((fr) => drawProp('molino', BIOMES.bosque, fr).px.join());
    expect(f0).not.toBe(f1);
    for (const k of ['posada', 'torre', 'molino', 'capilla']) expect(BUILDINGS.has(k)).toBe(true);
  });

  it('las aldeas tienen posada y las regiones capillas, campamentos y carretas alcanzables', () => {
    const count = {};
    let floors = 0;
    for (const seed of [2, 5, 8, 13, 21, 34]) {
      const f = generateFloor({ runSeed: seed, depth: 1 + (seed % 5) });
      floors++;
      for (const p of f.props) count[p.k] = (count[p.k] || 0) + 1;
      const seen = reachable(f, f.start);
      const talkable = (s) => [[0, 1], [1, 0], [-1, 0], [0, -1]].some(([dx, dy]) => seen[(s.y + dy) * f.w + s.x + dx] === 1);
      for (const s of f.inspect.filter((i) => ['posada', 'capilla', 'cofre'].includes(i.action))) expect(talkable(s), `${s.action} en ${s.x},${s.y}`).toBe(true);
      expect(f.props.filter((p) => p.k === 'posada').length).toBeLessThanOrEqual(f.villages);
    }
    expect(count.posada).toBeGreaterThanOrEqual(floors);
    expect(count.puesto).toBeGreaterThan(0);
    expect(count.torre).toBeGreaterThan(0);
    expect(count.tienda).toBeGreaterThan(0);
    expect(count.carreta).toBeGreaterThan(0);
    expect(count.capilla).toBeGreaterThan(0);
  });
});
