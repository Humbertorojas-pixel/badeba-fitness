import { MOVES } from '../data/moves.js';

export const ITEMS = {
  tonico: { name: 'Tónico', heal: 20 },
};

export function createCombatant(template, overrides = {}) {
  return {
    name: template.name,
    maxHp: template.maxHp,
    hp: template.maxHp,
    str: template.str,
    def: template.def,
    spd: template.spd,
    moves: template.moves.slice(),
    guarding: false,
    ...overrides,
  };
}

export function computeDamage(attacker, defender, move, rng) {
  const ratio = attacker.str / (attacker.str + defender.def);
  let dmg = move.power * ratio * 2 * (0.85 + rng.next() * 0.15);
  const crit = rng.chance(1 / 16);
  if (crit) dmg *= 1.5;
  if (defender.guarding) dmg *= 0.5;
  return { amount: Math.max(1, Math.floor(dmg)), crit };
}

export function fleeChance(player, enemy) {
  return Math.min(0.95, Math.max(0.2, 0.5 + (player.spd - enemy.spd) * 0.05));
}

// IA por reglas (será reemplazada/asistida por Laya en la fase de IA).
export function chooseEnemyAction(enemy, player, rng) {
  if (enemy.hp / enemy.maxHp < 0.25 && rng.chance(0.25)) return { type: 'flee' };
  const attacks = enemy.moves.filter((m) => MOVES[m].kind === 'attack');
  if (player.hp / player.maxHp < 0.35) {
    const strongest = attacks.reduce((a, b) => (MOVES[b].power > MOVES[a].power ? b : a));
    return { type: 'move', move: strongest };
  }
  return { type: 'move', move: rng.pick(attacks) };
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
  if (!rng.chance(move.acc)) {
    events.push({ type: 'miss', side: actorSide });
    events.push({ type: 'text', text: '¡Falló!' });
    return;
  }
  const { amount, crit } = computeDamage(actor, target, move, rng);
  target.hp = Math.max(0, target.hp - amount);
  const targetSide = actorSide === 'player' ? 'enemy' : 'player';
  events.push({ type: 'damage', side: targetSide, amount, crit, hp: target.hp });
  if (crit) events.push({ type: 'text', text: '¡Golpe crítico!' });
  if (target.guarding) events.push({ type: 'text', text: 'La guardia amortiguó el golpe.' });
}

// Resuelve un turno completo. Muta player/enemy y devuelve eventos + resultado.
export function resolveTurn({ player, enemy, inventory }, action, rng) {
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
    const item = ITEMS[action.item];
    inventory[action.item] -= 1;
    const before = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + item.heal);
    events.push({ type: 'text', text: `Usas ${item.name}.` });
    events.push({ type: 'heal', side: 'player', amount: player.hp - before, hp: player.hp });
    events.push({ type: 'text', text: `Recuperas ${player.hp - before} PS.` });
  }

  const enemyAction = chooseEnemyAction(enemy, player, rng);
  let order = ['enemy'];
  if (action.type === 'move') {
    const guard = MOVES[action.move].kind === 'guard';
    const faster = player.spd > enemy.spd || (player.spd === enemy.spd && rng.chance(0.5));
    order = guard || faster ? ['player', 'enemy'] : ['enemy', 'player'];
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
