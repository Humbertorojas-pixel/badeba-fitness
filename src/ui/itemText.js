import { CONSUMABLES, RARITY_LABEL, EFFECT_DESC, MOD_LABEL } from '../data/items.js';
import { measure } from '../gfx/fontGlyphs.js';

export function modsText(mods) {
  return Object.entries(mods)
    .map(([k, v]) => (k === 'acc' ? `${MOD_LABEL[k]} ${v > 0 ? '+' : ''}${Math.round(v * 100)}%` : `${MOD_LABEL[k]} ${v > 0 ? '+' : ''}${v}`))
    .join('  ');
}

export function describeItem(item) {
  if (item.kind === 'consumable') return CONSUMABLES[item.key].desc;
  const parts = [`${RARITY_LABEL[item.rarity]} · ${modsText(item.mods)}`];
  if (item.effect) parts.push(item.desc || EFFECT_DESC[item.effect]);
  if (item.sync) parts.push(`Sincronización: ${item.sync} de maná.`);
  return parts.join('\n');
}

export function fit(text, maxWidth) {
  if (measure(text) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && measure(`${t}..`) > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}..`;
}
