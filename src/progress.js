// Progreso del jugador: XP, niveles, prestigio, monedas y alijos (cajas de skins que se abren con ruleta en el
// Mercado Negro, src/market.js). Todo se guarda en el perfil (src/profile.js), sólo en este dispositivo.
//
// Ritmo (lo pidió el usuario): el nivel máximo, 25, se alcanza en ~1 h 30 min de juego. Cada nivel da un alijo
// y monedas, y cada 4 niveles un llavero. En el máximo se puede pasar a prestigio (vuelta al nivel 1 con una
// insignia, I a X) y, mientras tanto, cada "nivel" de XP de más sigue dando alijo y monedas.
import { profile, saveProfile, isUnlocked, unlock, MAX_LEVEL, PRESTIGE_MAX } from './profile.js';
import { SKINS } from './skinPaint.js';
import { CHARMS } from './charms.js';

// XP por cada cosa. La de oleada se multiplica por su número.
export const XP = { kill: 100, head: 50, knife: 100, wave: 150, mission: 1000, win: 1000, draw: 600, loss: 400 };
export const COINS = { kill: 5, level: 100 };
export const CASE_PRICE = 250;
// Probabilidad de cada rareza en un alijo (%, en el orden de RARITY) y monedas que da una skin repetida.
export const ODDS = [50, 28, 14, 6, 2];
export const REFUND = [25, 60, 120, 250, 500];
// Llavero que regala cada nivel (la primera vez que se llega a él).
export const CHARM_LEVELS = { 4: 'bullet', 8: 'dice', 12: 'drum', 16: 'grenade', 20: 'duck', 24: 'skull' };
export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

// XP para pasar del nivel `level` al siguiente: 700 al principio y 1900 al final (~30 600 en total).
export const xpFor = (level) => 700 + 50 * (Math.min(level, MAX_LEVEL) - 1);
export const canPrestige = () => profile.level >= MAX_LEVEL && profile.prestige < PRESTIGE_MAX;
export const charmLevel = (id) => Number(Object.keys(CHARM_LEVELS).find((l) => CHARM_LEVELS[l] === id)) || 0;
export const charmName = (id) => CHARMS.find((c) => c.id === id)?.name ?? id;
// Nivel en texto, con el prestigio delante si lo hay: "★II · 14".
export const rankText = (prestige, level) => `${prestige ? `★${ROMAN[prestige]} · ` : ''}${level}`;

// Avisos para el HUD: gain(xp, motivo) y level(premio) (ver main.js).
export const events = { gain: null, level: null };

// Lo ganado en la partida en curso, para la pantalla final.
export const session = { xp: 0, coins: 0, cases: 0, charms: [], startLevel: 1, startXp: 0, ups: 0 };
export function startSession() {
  Object.assign(session, { xp: 0, coins: 0, cases: 0, charms: [], startLevel: profile.level, startXp: profile.xp, ups: 0 });
}

// Premio por llegar al nivel `level` (o por completar otro nivel de XP estando en el máximo: `extra`).
function levelUp(extra) {
  if (!extra) profile.level++;
  const r = { level: profile.level, extra, cases: 1, coins: COINS.level, charm: null };
  profile.cases += r.cases;
  profile.coins += r.coins;
  const charm = extra ? null : CHARM_LEVELS[profile.level];
  if (charm && unlock('charms', charm)) r.charm = charm;
  session.cases += r.cases; session.coins += r.coins; session.ups++;
  if (r.charm) session.charms.push(r.charm);
  return r;
}

// Suma XP (y monedas) por `label`. Sube los niveles que toque y avisa al HUD.
export function award(xp, label, coins = 0) {
  if (xp <= 0 && coins <= 0) return;
  profile.xp += xp; profile.coins += coins;
  session.xp += xp; session.coins += coins;
  const ups = [];
  while (profile.xp >= xpFor(profile.level)) {
    profile.xp -= xpFor(profile.level);
    ups.push(levelUp(profile.level >= MAX_LEVEL));
  }
  saveProfile();
  if (xp > 0) events.gain?.(xp, label);
  for (const r of ups) events.level?.(r);
}

// Baja: a la IA o a otro jugador.
export function awardKill(head, knife) {
  const xp = XP.kill + (head ? XP.head : 0) + (knife ? XP.knife : 0);
  award(xp, knife ? 'CUCHILLO' : head ? 'A LA CABEZA' : 'BAJA', COINS.kill);
}

// Vuelta al nivel 1 con un prestigio más. Se conserva todo lo conseguido.
export function prestige() {
  if (!canPrestige()) return false;
  profile.prestige++;
  profile.level = 1;
  profile.xp = 0;
  saveProfile();
  return true;
}

// ---------- Alijos ----------
const POOL = ODDS.map((_, r) => SKINS.filter((s) => s.id !== 'none' && s.rarity === r));

// Skin al azar con las probabilidades de ODDS.
export function rollSkin(rng = Math.random) {
  let r = rng() * 100; let rar = 0;
  while (rar < ODDS.length - 1 && (r -= ODDS[rar]) >= 0) rar++;
  const pool = POOL[rar];
  return pool[Math.floor(rng() * pool.length)];
}

// Abre un alijo: primero los ganados y, si no hay, se compra uno. Devuelve { skin, dup, refund } o null si no
// alcanza. Una skin repetida se cambia por monedas según su rareza.
export function openCase() {
  if (profile.cases > 0) profile.cases--;
  else if (profile.coins >= CASE_PRICE) profile.coins -= CASE_PRICE;
  else return null;
  const skin = rollSkin();
  const dup = isUnlocked('skins', skin.id);
  const refund = dup ? REFUND[skin.rarity] : 0;
  profile.coins += refund;
  if (!dup) unlock('skins', skin.id); // guarda el perfil
  else saveProfile();
  return { skin, dup, refund };
}

// Skins conseguidas de cada rareza y en total.
export function collection() {
  const got = POOL.map((pool) => pool.filter((s) => isUnlocked('skins', s.id)).length);
  return { got, total: POOL.map((p) => p.length), all: got.reduce((a, b) => a + b, 0), of: SKINS.length - 1 };
}

// Siguiente llavero que se gana subiendo de nivel (null si ya están todos).
export function nextCharm() {
  for (const l of Object.keys(CHARM_LEVELS).map(Number)) {
    const id = CHARM_LEVELS[l];
    if (!isUnlocked('charms', id)) return { id, level: l };
  }
  return null;
}
