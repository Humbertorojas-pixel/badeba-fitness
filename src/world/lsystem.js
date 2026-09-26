// L-Systems (sistemas de Lindenmayer) para distribuir decoración de forma orgánica.
// F = avanzar y pintar · f = avanzar sin pintar · + / - = girar 90° · [ ] = apilar/desapilar.
export const LSYSTEMS = {
  raices: { axiom: 'F', rules: { F: 'F[+F]F[-F]' }, iterations: 2, skip: 0.2 },
  sangre: { axiom: 'FX', rules: { X: '[+F-FX][-F+F]', F: 'F' }, iterations: 3, skip: 0.45 },
  escombros: { axiom: 'F', rules: { F: 'F[+F]f[-F]' }, iterations: 2, skip: 0.3 },
  huesos: { axiom: 'F', rules: { F: 'F f[+F]f[-F]' }, iterations: 2, skip: 0.4 },
  grietas: { axiom: 'F', rules: { F: 'F[-F]F' }, iterations: 3, skip: 0.25 },
};

export function expand(axiom, rules, iterations) {
  let s = axiom;
  for (let i = 0; i < iterations; i++) {
    let next = '';
    for (const ch of s) next += rules[ch] ?? ch;
    s = next;
  }
  return s.replace(/\s+/g, '');
}

const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

// Interpreta la cadena como tortuga en la rejilla; `paint` decide si la celda es válida.
export function turtle(str, start, rng, paint, { skip = 0.15 } = {}) {
  let x = start.x;
  let y = start.y;
  let dir = start.dir ?? rng.int(0, 3);
  const stack = [];
  const painted = [];
  for (const ch of str) {
    if (ch === 'F' || ch === 'f') {
      x += DX[dir];
      y += DY[dir];
      if (ch === 'F' && !rng.chance(skip) && paint(x, y)) painted.push([x, y]);
    } else if (ch === '+') dir = (dir + 1) % 4;
    else if (ch === '-') dir = (dir + 3) % 4;
    else if (ch === '[') stack.push([x, y, dir]);
    else if (ch === ']') [x, y, dir] = stack.pop();
  }
  return painted;
}
