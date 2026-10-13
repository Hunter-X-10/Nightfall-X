// Catálogo de mapas. El índice es el valor del ajuste "mapa" de la sala (el servidor conoce cuántos hay:
// ver MAP_COUNT en src/roomCore.js). Cada `build(scene, M, reflection)` devuelve el mundo ya construido:
//   group (todo lo visible, luces incluidas) · col (colisiones) · ground · lamps, barrels, emitters
//   bounds (límites para el jugador) · spawns[equipo] (zonas de aparición) · env (ambiente: cielo,
//   niebla, luz, lluvia…) · envPos (punto de captura del mapa de entorno)
import { buildWorld as buildSector7 } from './world/index.js';
import { buildSolana } from './world/solana.js';
import { buildMuelle } from './world/muelle.js';

export const MAPS = [
  { name: 'SECTOR 7', desc: 'base militar, noche de tormenta', build: buildSector7 },
  { name: 'LA SOLANA', desc: 'depósito en el desierto, atardecer', build: buildSolana },
  { name: 'MUELLE NORTE', desc: 'puerto bajo la nevada, niebla cerrada', build: buildMuelle },
];
