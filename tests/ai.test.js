import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRng } from '../src/core/rng.js';
import { createCombatant } from '../src/core/battle.js';
import { persuasionChance, decideEnemyAction, greedLevel } from '../src/ai/enemyBrain.js';
import { refreshAiStatus } from '../src/ai/client.js';
import { fallbackReply, fallbackGreeting } from '../src/ai/npcFallback.js';
import { generateNpc } from '../src/world/npcGen.js';
import { newRun } from '../src/core/state.js';

afterEach(() => vi.unstubAllGlobals());

describe('IA de combate y negociación', () => {
  it('la Inteligencia ayuda y la codicia por legendarios hunde la persuasión', () => {
    const low = persuasionChance({ layaProb: 0.8, intelligence: 3, greed: 'baja' });
    const high = persuasionChance({ layaProb: 0.8, intelligence: 12, greed: 'baja' });
    const greedy = persuasionChance({ layaProb: 0.8, intelligence: 12, greed: 'altísima' });
    expect(high).toBeGreaterThan(low);
    expect(greedy).toBeLessThan(high * 0.2);
  });

  it('la codicia refleja el objeto más valioso que llevas', () => {
    const run = newRun(1);
    expect(greedLevel(run)).toBe('baja');
    run.bag.gear.push({ rarity: 'legendario' });
    expect(greedLevel(run)).toBe('altísima');
  });

  it('usa las probabilidades de Laya cuando el servidor responde', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => ({
      ok: true,
      json: async () => (url.includes('health') ? { laya: 'ready', claude: 'no_key' } : { answers: { accion: { probabilities: { garra: 0, mordida: 1, huir: 0 } } } }),
    })));
    await refreshAiStatus();
    const enemy = createCombatant({ name: 'E', maxHp: 20, str: 5, def: 5, spd: 5, moves: ['garra', 'mordida'] });
    const player = createCombatant({ name: 'P', maxHp: 20, str: 5, def: 5, spd: 5, moves: ['tajo'] });
    const action = await decideEnemyAction({ enemy, player, template: { archetype: 'beast' }, run: newRun(1) }, createRng(1));
    expect(action).toEqual({ type: 'move', move: 'mordida' });
  });

  it('cae a reglas si el servidor no está', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('sin servidor'); }));
    await refreshAiStatus();
    const enemy = createCombatant({ name: 'E', maxHp: 20, str: 5, def: 5, spd: 5, moves: ['garra'] });
    const player = createCombatant({ name: 'P', maxHp: 20, str: 5, def: 5, spd: 5, moves: ['tajo'] });
    const action = await decideEnemyAction({ enemy, player, template: { archetype: 'beast' }, run: newRun(1) }, createRng(1));
    expect(action.type).toBe('move');
  });
});

describe('diálogo local de respaldo', () => {
  it('responde por tema con datos del piso y con la voz del rol', () => {
    const npc = generateNpc(5, 1);
    const ctx = { escalera: 'hacia el noreste', bioma: 'Catacumbas', piso: 1, criaturas: 3, fragmento: false };
    expect(fallbackReply(npc, '¿Dónde está la escalera?', ctx, createRng(1))).toMatch(/noreste/);
    expect(fallbackReply(npc, '¿Hay peligro aquí?', ctx, createRng(1))).toMatch(/3 criaturas/);
    expect(fallbackGreeting(npc, createRng(2)).length).toBeGreaterThan(5);
  });
});
