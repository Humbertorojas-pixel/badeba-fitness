// Criaturas adorables: rarezas luminosas en un mundo oscuro. No atacan por su cuenta; si las
// vences, se rinden y pueden unirse a tu equipo.
export const CUTE = {
  lumo: { name: 'Lumo', gender: 'm', biomes: ['bosque'], role: 'cura', moves: ['polen', 'placaje'], ramp: 'lumo', desc: 'Una polilla con cara de gatito. Brilla cuando está contenta.' },
  musguito: { name: 'Musguito', gender: 'm', biomes: ['bosque', 'pantano'], role: 'guardia', moves: ['placaje', 'polen'], ramp: 'musgo', desc: 'Un conejo de musgo con orejas de hoja. Se planta delante de ti sin dudar.' },
  chispa: { name: 'Chispa', gender: 'f', biomes: ['ceniza'], role: 'ataque', moves: ['chispazo', 'placaje'], ramp: 'chispa', desc: 'Una salamandra diminuta que ronronea brasas.' },
  gotin: { name: 'Gotín', gender: 'm', biomes: ['pantano'], role: 'cura', moves: ['burbuja', 'placaje'], ramp: 'gota', desc: 'Una gota con patitas. Todo lo que toca queda un poco más limpio.' },
  campanita: { name: 'Campanita', gender: 'f', biomes: ['necropolis'], role: 'guardia', moves: ['campanada', 'placaje'], ramp: 'campana', desc: 'Un fantasmita con una campana. Asusta a los que asustan.' },
  tuerquito: { name: 'Tuerquito', gender: 'm', biomes: ['ciudad'], role: 'ataque', moves: ['chispazo', 'placaje'], ramp: 'tuerca', desc: 'Un búho de relojería que alguien olvidó dar cuerda. Ya no.' },
  hongolin: { name: 'Hongolín', gender: 'm', biomes: ['bosque', 'necropolis', 'pantano', 'ciudad'], role: 'cura', moves: ['polen', 'placaje'], ramp: 'hongo', desc: 'Un hongo con piernas que suelta esporas que curan.' },
};

export const ROLE_LABEL = { ataque: 'Ataque', cura: 'Cura', guardia: 'Guardia' };

export function cuteForBiome(biome) {
  return Object.entries(CUTE).filter(([, c]) => c.biomes.includes(biome)).map(([k]) => k);
}
