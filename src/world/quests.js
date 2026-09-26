import { hashSeed, createRng } from '../core/rng.js';

// Misiones del piso: quien te pide ayuda se une a tu equipo cuando la cumples.
const OBJECTS = ['relicario', 'anillo de bodas', 'libro de rezos', 'medallón de la guardia', 'cuchillo de mi padre', 'muñeca de trapo'];

function compass(dx, dy) {
  const ns = Math.abs(dy) > Math.abs(dx) * 0.4 ? (dy < 0 ? 'norte' : 'sur') : '';
  const ew = Math.abs(dx) > Math.abs(dy) * 0.4 ? (dx < 0 ? 'oeste' : 'este') : '';
  const combo = { norteeste: 'noreste', norteoeste: 'noroeste', sureste: 'sureste', suroeste: 'suroeste' };
  return ns && ew ? combo[ns + ew] : ns || ew || 'cerca';
}

const FEMININE = ['Cueva', 'Gruta', 'Madriguera', 'Sima', 'Cripta', 'Catacumba', 'Tumba'];
// "a la Gárgola", "al Mastín", "a Vargoth"; "la Cripta", "el Osario".
const aPrey = (t) => (t.article === 'Una' ? `a la ${t.name}` : t.article === 'Un' ? `al ${t.name}` : `a ${t.name}`);
const pronoun = (t) => (t.article === 'Una' || t.gender === 'f' ? 'ella' : 'él');
const place = (name) => (name.startsWith('El ') ? `el ${name.slice(3)}` : FEMININE.includes(name.split(' ')[0]) ? `la ${name}` : `el ${name}`);
const ofPlace = (name) => { const p = place(name); return p.startsWith('el ') ? `del ${p.slice(3)}` : `de ${p}`; };

// Asigna una misión a cada NPC que la ofrece (determinista por semilla del piso).
export function assignQuests(f, seed, depth) {
  const rng = createRng(hashSeed(seed, 'quests'));
  const givers = [];
  const hermit = f.npcs.find((n) => n.id === 'npc_h');
  if (hermit) givers.push(hermit);
  const byVillage = new Map();
  for (const n of f.npcs) {
    const v = n.id.match(/^npc_v(\d+)_/);
    if (v && !byVillage.has(v[1])) byVillage.set(v[1], n);
  }
  givers.push(...byVillage.values());
  const usedTargets = new Set();
  const landmark = f.inspect.find((i) => i.landmark);
  const landmarkName = f.zones.find((z) => z.kind === 'monumento')?.name;
  for (const npc of givers) {
    const options = [];
    const prey = f.enemies.filter((e) => !e.template.friend && !e.passive && !usedTargets.has(e.id) && Math.hypot(e.x - npc.x, e.y - npc.y) > 14);
    if (prey.length) options.push('cazar');
    const dungeons = (f.dungeons || []).filter((d) => !usedTargets.has(d.id));
    if (dungeons.length) options.push('jefe', 'recuperar');
    if (landmark && landmarkName && !usedTargets.has('landmark')) options.push('peregrinar');
    if (!options.length) continue;
    const type = rng.pick(options);
    const q = { id: `q_${npc.id}`, npcId: npc.id, giver: npc.sheet.name, type, floor: depth };
    if (type === 'cazar') {
      const e = rng.pick(prey);
      usedTargets.add(e.id);
      e.questTarget = q.id;
      const dir = compass(e.x - npc.x, e.y - npc.y);
      Object.assign(q, {
        target: e.id,
        summary: `Caza ${aPrey(e.template)} que ronda al ${dir}.`,
        offer: `${e.template.article ? `${e.template.article} ${e.template.name}` : e.template.name} ronda al ${dir} de aquí. Se llevó a alguien que yo quería. Si acabas con ${pronoun(e.template)}, iré contigo hasta el fondo del pozo.`,
      });
    } else if (type === 'jefe' || type === 'recuperar') {
      const d = rng.pick(dungeons);
      usedTargets.add(d.id);
      const obj = rng.pick(OBJECTS);
      Object.assign(q, {
        target: d.id,
        object: type === 'recuperar' ? obj : null,
        summary: type === 'jefe' ? `Derrota a lo que guarda lo más hondo ${ofPlace(d.name)}.` : `Recupera el ${obj} del cofre del guardián ${ofPlace(d.name)}.`,
        offer: type === 'jefe'
          ? `Algo vive en lo más hondo ${ofPlace(d.name)}. Mientras respire, nadie aquí duerme. Mátalo y te seguiré.`
          : `Mi ${obj} quedó en ${place(d.name)}, junto a lo que guarda el fondo. Tráemelo y no te dejaré solo.`,
      });
    } else {
      usedTargets.add('landmark');
      Object.assign(q, {
        target: 'landmark',
        summary: `Reza ante ${place(landmarkName)} por los que se perdieron.`,
        offer: `Nunca me atreví a llegar hasta ${place(landmarkName)}. Ve, reza allí por los que perdimos. Después, te acompañaré.`,
      });
    }
    npc.quest = q;
    npc.sheet.canTurnHostile = false;
  }
}

// Revisa si alguna misión activa quedó cumplida. Devuelve las que cambiaron.
export function checkQuests(run, floorNum, { defeated = [], openedBoss = null, prayed = false } = {}) {
  const done = [];
  for (const q of run.quests || []) {
    if (q.status !== 'activa' || q.floor !== floorNum) continue;
    let ok = false;
    if (q.type === 'cazar') ok = defeated.includes(q.target);
    if (q.type === 'jefe') ok = defeated.includes(`${floorNum}_${q.target}_boss`);
    if (q.type === 'recuperar') ok = openedBoss === q.target;
    if (q.type === 'peregrinar') ok = prayed;
    if (ok) {
      q.status = 'cumplida';
      done.push(q);
    }
  }
  return done;
}
