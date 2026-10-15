// Botín de las partidas en línea: cofres, vendas, botiquines y chalecos. Lo comparten la sala
// (src/roomCore.js, que decide qué sale y quién se lo lleva) y el navegador (src/lootWorld.js, que lo
// dibuja). No usa three.js para que el servidor lo pueda importar.

export const ITEM = { BANDAGE: 0, MEDKIT: 1, VEST: 2 };
export const ITEM_NAMES = ['VENDAS', 'BOTIQUÍN', 'CHALECO'];
export const ITEM_MAX = 2; // vendas y botiquines que se pueden llevar de cada
export const ARMOR_MAX = 50; // aguante de un chaleco entero (la vida es 100)
// Probabilidad de cada objeto al abrir un cofre (vendas, botiquín, chaleco): el chaleco es el más raro.
const LOOT_WEIGHTS = [45, 35, 20];
export const CHEST_REFILL_MS = 60000; // un cofre abierto se cierra y vuelve a tener botín al minuto
export const ITEM_LIFE_MS = 120000; // lo que nadie recoge desaparece a los dos minutos
export const PICK_R = 0.9; // se recoge al pasar a esta distancia (o con F mirándolo, más lejos)

// Sitios donde puede aparecer un cofre en cada mapa (índice de MAPS): [x, z, giro]. El frente del cofre mira
// hacia (sin giro, cos giro) y la espalda queda contra una pared, con sitio delante para que caiga el botín.
// En cada partida se usan unos cuantos al azar (ver chestCount).
export const CHEST_SPOTS = [
  [ // Sector 7
    [0.44, 1.04, -2.36], [-29.44, -56.84, -2.36], [27, -52.1, -3.14], [-43.79, 12.09, -0.39], [41.76, 9.18, 2.75], [-6.54, -33.62, 1.18],
    [-37.56, -18.95, -2.36], [30.71, -22.1, 0.39], [2, -57.35, 0], [-19.84, 12.21, -0.39], [20.27, 11.95, -0.39], [9.71, -20.11, 0.39],
    [-24.65, -38.4, -1.57], [-13, -13.44, 0], [12.8, -39.89, 0.39], [-28.82, -3.4, 1.57],
  ],
  [ // La Solana
    [-2.2, -0.5, -1.57], [42.72, -34.5, 1.57], [-42.72, -34.5, -1.57], [35.99, 35.29, 1.18], [-35.5, 35.6, 0], [6.16, -34.68, 2.75],
    [0.68, 36.07, -0.39], [-42.4, 1.5, 1.57], [42.4, 0.5, -1.57], [-18.5, -25.28, 0], [17.38, 16.55, 1.96], [-18.45, 18.52, -1.96],
    [22.72, -16.5, 1.57], [-22.38, -4.5, -1.57], [24.61, -34.5, 1.57], [5.5, -16.82, 0],
  ],
  [ // Muelle Norte
    [-0.22, 2.18, -2.75], [45.15, 28.86, -0.79], [-45.15, 28.86, 0.79], [30.5, -36.5, 1.57], [-30.5, -36.5, -1.57], [10.19, 32.74, 0.39],
    [-42.45, -4.5, 1.57], [42.45, -4.5, -1.57], [-0.5, -33.9, 0], [-16.5, 25.68, -3.14], [18.5, -14.25, -3.14], [23.5, 11.72, 0],
    [-19.5, -14.25, -3.14], [-25.5, 8.28, -3.14], [28.51, 31.5, -1.57], [2.5, -18.28, 0],
  ],
];

// Cofres de una partida: uno por jugador, pero al menos CHEST_MIN aunque sean pocos (con 2 en todo el mapa no
// se encontraban), sin pasar de los sitios que tiene el mapa (16).
export const CHEST_MIN = 6;
export const chestCount = (players) => Math.max(CHEST_MIN, players);

// Lo que sale de un cofre: de uno a tres objetos al azar.
export function rollLoot(rng = Math.random) {
  const n = 1 + Math.floor(rng() * 3);
  const total = LOOT_WEIGHTS.reduce((a, b) => a + b, 0);
  const out = [];
  for (let i = 0; i < n; i++) {
    let r = rng() * total; let t = 0;
    while (r >= LOOT_WEIGHTS[t]) r -= LOOT_WEIGHTS[t++];
    out.push(t);
  }
  return out;
}

// Dónde caen `n` objetos que salen del cofre `spot`: en abanico por delante, a 0,9-1,4 m.
export function lootSpots(spot, n, rng = Math.random) {
  const [x, z, yaw] = spot;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = yaw + (n > 1 ? (i / (n - 1) - 0.5) * 1.3 : 0) + (rng() - 0.5) * 0.25;
    const d = 0.95 + rng() * 0.45;
    out.push([x + Math.sin(a) * d, z + Math.cos(a) * d]);
  }
  return out;
}
