import { MOVES } from '../data/moves.js';
import { CONSUMABLES } from '../data/items.js';

export function createCombatant(template, overrides = {}) {
  return {
    name: template.name,
    maxHp: template.maxHp,
    hp: template.maxHp,
    str: template.str,
    def: template.def,
    spd: template.spd,
    moves: template.moves.slice(),
    accBonus: 0,
    effects: [],
    guarding: false,
    ...overrides,
  };
}

// Los enemigos usan su ítem igual que el jugador: sus mods y efectos se aplican en combate.
export function createEnemyCombatant(template) {
  const c = createCombatant(template);
  const it = template.loot;
  if (it && it.kind === 'equip') {
    const m = it.mods;
    c.str += m.atk || 0;
    c.def += m.def || 0;
    c.spd += m.spd || 0;
    c.maxHp += m.hp || 0;
    c.hp = c.maxHp;
    c.accBonus += m.acc || 0;
    if (it.effect) c.effects.push(it.effect);
  }
  return c;
}

export function computeDamage(attacker, defender, move, rng, powerScale = 1) {
  const ratio = attacker.str / (attacker.str + defender.def);
  let dmg = move.power * powerScale * ratio * 2 * (0.85 + rng.next() * 0.15);
  const crit = rng.chance(1 / 16);
  if (crit) dmg *= 1.5;
  if (defender.guarding) dmg *= 0.5;
  return { amount: Math.max(1, Math.floor(dmg)), crit };
}

export function fleeChance(player, enemy) {
  return Math.min(0.95, Math.max(0.2, 0.5 + (player.spd - enemy.spd) * 0.05));
}

// IA por reglas (base de respaldo; la fase de IA la reemplaza con Laya).
export function chooseEnemyAction(enemy, player, rng) {
  if (enemy.hp / enemy.maxHp < 0.25 && rng.chance(0.25)) return { type: 'flee' };
  if (enemy.moves.includes('succion') && rng.chance(0.25)) return { type: 'move', move: 'succion' };
  const attacks = enemy.moves.filter((m) => MOVES[m].kind === 'attack');
  if (player.hp / player.maxHp < 0.35) {
    const strongest = attacks.reduce((a, b) => (MOVES[b].power > MOVES[a].power ? b : a));
    return { type: 'move', move: strongest };
  }
  return { type: 'move', move: rng.pick(attacks) };
}

const other = (side) => (side === 'player' ? 'enemy' : 'player');

function strike(events, actor, target, actorSide, move, rng, powerScale = 1) {
  const { amount, crit } = computeDamage(actor, target, move, rng, powerScale);
  target.hp = Math.max(0, target.hp - amount);
  events.push({ type: 'damage', side: other(actorSide), amount, crit, hp: target.hp });
  if (crit) events.push({ type: 'text', text: '¡Golpe crítico!' });
  if (target.guarding) events.push({ type: 'text', text: 'La guardia amortiguó el golpe.' });
  if (actor.effects.includes('lifesteal') && actor.hp > 0) {
    const heal = Math.min(actor.maxHp - actor.hp, Math.max(1, Math.floor(amount * 0.25)));
    if (heal > 0) {
      actor.hp += heal;
      events.push({ type: 'heal', side: actorSide, amount: heal, hp: actor.hp });
      events.push({ type: 'text', text: `${actor.name} bebe ${heal} PS de la herida.` });
    }
  }
  if (target.effects.includes('reflect') && target.hp > 0) {
    const back = Math.max(1, Math.floor(amount * 0.3));
    actor.hp = Math.max(0, actor.hp - back);
    events.push({ type: 'damage', side: actorSide, amount: back, crit: false, hp: actor.hp });
    events.push({ type: 'text', text: `El reflejo devuelve ${back} de daño.` });
  }
}

function performMove(events, actor, target, actorSide, moveId, rng) {
  const move = MOVES[moveId];
  events.push({ type: 'text', text: `¡${actor.name} usa ${move.name}!` });
  if (move.kind === 'guard') {
    actor.guarding = true;
    events.push({ type: 'guard', side: actorSide });
    events.push({ type: 'text', text: `${actor.name} se cubre.` });
    return;
  }
  if (move.kind === 'drain') {
    events.push({ type: 'drain', side: other(actorSide), amount: move.drain });
    return;
  }
  if (!rng.chance(Math.min(1, move.acc + (actor.accBonus || 0)))) {
    events.push({ type: 'miss', side: actorSide });
    events.push({ type: 'text', text: '¡Falló!' });
    return;
  }
  strike(events, actor, target, actorSide, move, rng);
  if (actor.effects.includes('doubleStrike') && target.hp > 0 && actor.hp > 0) {
    events.push({ type: 'text', text: '¡Un segundo tajo desde el eclipse!' });
    strike(events, actor, target, actorSide, move, rng, 0.6);
  }
}

// Resuelve un turno completo. Muta player/enemy/consumibles y devuelve eventos + resultado.
// `precomputed` permite inyectar la acción del enemigo decidida por Laya (asíncrona).
export function resolveTurn({ player, enemy, consumables }, action, rng, precomputed = null) {
  const events = [];
  player.guarding = false;
  enemy.guarding = false;

  if (action.type === 'flee') {
    if (rng.chance(fleeChance(player, enemy))) {
      events.push({ type: 'text', text: 'Escapas entre las sombras...' });
      return { events, outcome: 'fled' };
    }
    events.push({ type: 'text', text: '¡No logras escapar!' });
  }

  if (action.type === 'item') {
    const item = CONSUMABLES[action.item];
    consumables[action.item] -= 1;
    events.push({ type: 'text', text: `Usas ${item.name}.` });
    if (item.heal) {
      const before = player.hp;
      player.hp = Math.min(player.maxHp, player.hp + item.heal);
      events.push({ type: 'heal', side: 'player', amount: player.hp - before, hp: player.hp });
      events.push({ type: 'text', text: `Recuperas ${player.hp - before} PS.` });
    }
    if (item.restoreMana) events.push({ type: 'restoreMana' });
  }

  const enemyAction = precomputed ?? chooseEnemyAction(enemy, player, rng);
  let order = ['enemy'];
  if (action.type === 'move') {
    const guard = MOVES[action.move].kind === 'guard';
    const pFirst = player.effects.includes('alwaysFirst');
    const eFirst = enemy.effects.includes('alwaysFirst') && !pFirst;
    const faster = player.spd > enemy.spd || (player.spd === enemy.spd && rng.chance(0.5));
    order = !eFirst && (guard || pFirst || faster) ? ['player', 'enemy'] : ['enemy', 'player'];
  }

  for (const side of order) {
    if (player.hp <= 0 || enemy.hp <= 0) break;
    if (side === 'player') {
      performMove(events, player, enemy, 'player', action.move, rng);
    } else if (enemyAction.type === 'flee') {
      events.push({ type: 'text', text: `${enemy.name} huye despavorido.` });
      events.push({ type: 'enemyFled' });
      return { events, outcome: 'enemyFled' };
    } else {
      performMove(events, enemy, player, 'enemy', enemyAction.move, rng);
    }
  }

  if (enemy.hp <= 0) {
    events.push({ type: 'faint', side: 'enemy' });
    events.push({ type: 'text', text: `${enemy.name} se desploma.` });
    return { events, outcome: 'win' };
  }
  if (player.hp <= 0) {
    events.push({ type: 'faint', side: 'player' });
    events.push({ type: 'text', text: 'Tu visión se nubla...' });
    return { events, outcome: 'lose' };
  }
  return { events, outcome: 'continue' };
}
