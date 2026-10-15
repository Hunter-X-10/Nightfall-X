// Perfil del jugador, guardado en este navegador (localStorage, clave `nightfall.profile`): nivel, XP,
// monedas, lo desbloqueado y lo que lleva puesto cada arma. Es la base del progreso: la armería y el arma
// leen de aquí, y los niveles y las cajas lo irán rellenando. Sólo vive en este dispositivo.
import { CHARMS } from './charms.js';
import { SKINS } from './skinPaint.js';

const KEY = 'nightfall.profile';
const VERSION = 1;
// Claves de antes del perfil: se pasan a él la primera vez y se borran.
const OLD_CHARMS = 'nightfall.charms';
const OLD_SKINS = 'nightfall.skins';

export const CHARM_SLOTS = 3; // fusil, pistola y cuchillo
export const SKIN_SLOTS = 2; // fusil y pistola (el cuchillo aún no tiene skins)

// Catálogo de cada tipo de objeto cosmético.
const CATALOG = { skins: SKINS, charms: CHARMS };
const SLOTS = { skins: SKIN_SLOTS, charms: CHARM_SLOTS };

// Mientras no haya forma de conseguirlos (niveles y cajas), todo está desbloqueado.
const LOCKS = false;

function fresh() {
  return {
    v: VERSION,
    level: 1,
    xp: 0,
    coins: 0,
    unlocked: { skins: [], charms: [] }, // identificadores conseguidos (además de los de serie)
    equip: { skins: Array(SKIN_SLOTS).fill('none'), charms: Array(CHARM_SLOTS).fill('none') },
  };
}

function read(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } // sin almacenamiento o dato roto
}

const known = (kind, id) => CATALOG[kind].some((c) => c.id === id);
const count = (v, min = 0) => (Number.isFinite(v) && v >= min ? Math.floor(v) : min);

// Deja el perfil sano aunque venga de otra versión, esté a medias o tenga objetos que ya no existen.
function sanitize(p) {
  const out = fresh();
  if (!p || typeof p !== 'object') return out;
  out.level = count(p.level, 1);
  out.xp = count(p.xp);
  out.coins = count(p.coins);
  for (const kind of Object.keys(CATALOG)) {
    const got = p.unlocked?.[kind];
    if (Array.isArray(got)) out.unlocked[kind] = [...new Set(got.filter((id) => known(kind, id)))];
    const eq = p.equip?.[kind];
    for (let i = 0; i < SLOTS[kind]; i++) if (Array.isArray(eq) && known(kind, eq[i])) out.equip[kind][i] = eq[i];
  }
  return out;
}

function load() {
  const saved = read(KEY);
  if (saved) return sanitize(saved);
  // Primera vez con perfil: se recogen los llaveros y las skins que ya hubiera elegidos.
  const p = sanitize({ equip: { charms: read(OLD_CHARMS), skins: read(OLD_SKINS) } });
  if (write(p)) {
    try { localStorage.removeItem(OLD_CHARMS); localStorage.removeItem(OLD_SKINS); } catch { /* sin almacenamiento */ }
  }
  return p;
}

function write(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); return true; } catch { return false; } // sin almacenamiento
}

export const profile = load();

export function saveProfile() { write(profile); }

// Lo que lleva puesto el arma `slot` ('skins' o 'charms').
export function equipped(kind, slot) { return profile.equip[kind][slot] ?? 'none'; }

export function equip(kind, slot, id) {
  if (slot >= SLOTS[kind] || !known(kind, id) || !isUnlocked(kind, id)) return false;
  profile.equip[kind][slot] = id;
  saveProfile();
  return true;
}

// `none` (de fábrica, sin llavero) siempre está disponible.
export function isUnlocked(kind, id) {
  return !LOCKS || id === 'none' || profile.unlocked[kind].includes(id);
}

export function unlock(kind, id) {
  if (!known(kind, id) || profile.unlocked[kind].includes(id)) return false;
  profile.unlocked[kind].push(id);
  saveProfile();
  return true;
}
