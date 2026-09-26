import { MOVES } from '../data/moves.js';
import { chooseEnemyAction } from '../core/battle.js';
import { decide } from './client.js';

const MOVE_HINT = {
  attack: (m) => `ataque de potencia ${m.power} y precisión ${Math.round(m.acc * 100)}%`,
  drain: () => 'drena el maná del jugador y desincroniza su equipo',
  guard: () => 'se protege',
};

// Codicia: qué tan valioso es lo que el jugador lleva a la vista del enemigo.
export function greedLevel(run) {
  const items = [...Object.values(run.player.equipment).filter(Boolean), ...run.bag.gear];
  if (items.some((i) => i.rarity === 'unico')) return 'obsesiva';
  if (items.some((i) => i.rarity === 'legendario')) return 'altísima';
  if (items.some((i) => i.rarity === 'raro')) return 'moderada';
  return 'baja';
}

const pct = (c) => `${Math.round((c.hp / c.maxHp) * 100)}%`;

// Laya elige la acción del enemigo; se muestrea de sus probabilidades calibradas (conducta variada
// pero coherente). Si Laya no responde a tiempo, decide la IA por reglas.
export async function decideEnemyAction({ enemy, player, template, run }, rng) {
  const options = {};
  for (const id of enemy.moves) options[id] = MOVE_HINT[MOVES[id].kind](MOVES[id]);
  options.huir = 'escapar del combate para sobrevivir';
  const answers = await decide(
    {
      enemigo: { nombre: enemy.name, naturaleza: template.archetype, vida: pct(enemy), arma: template.loot?.name || 'ninguna' },
      jugador: { vida: pct(player), nivel: run.player.level, codicia_que_despierta: greedLevel(run) },
    },
    { accion: { type: 'choice', instructions: '¿Qué acción conviene al enemigo para sobrevivir y herir al jugador?', criteria: options } },
  );
  const probs = answers?.accion?.probabilities;
  if (!probs) return chooseEnemyAction(enemy, player, rng);
  // Huir con vida alta no tiene sentido en el juego: se atenúa esa opción.
  if (enemy.hp / enemy.maxHp > 0.3) probs.huir = (probs.huir || 0) * 0.1;
  const total = Object.values(probs).reduce((s, p) => s + p, 0);
  let r = rng.next() * total;
  for (const [id, p] of Object.entries(probs)) {
    r -= p;
    if (r <= 0) return id === 'huir' ? { type: 'flee' } : { type: 'move', move: id };
  }
  return chooseEnemyAction(enemy, player, rng);
}

// Probabilidad final de convencer a un enemigo: la señal de Laya (si existe) modulada por las
// reglas del juego: la Inteligencia ayuda y la codicia por objetos legendarios la hunde.
export function persuasionChance({ layaProb, intelligence, greed }) {
  const base = layaProb ?? 0.35;
  const intMod = 0.3 + intelligence * 0.05;
  const greedMod = { baja: 1, moderada: 0.6, altísima: 0.1, obsesiva: 0.03 }[greed] ?? 1;
  return Math.max(0.01, Math.min(0.85, base * intMod * greedMod));
}
