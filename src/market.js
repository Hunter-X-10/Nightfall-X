// Mercado Negro: pantalla del menú para abrir alijos (cajas de skins) con una ruleta horizontal tipo CS2. Al
// pararse, la skin ganada se ve en el fusil (en la escena, a la derecha) y se puede poner en el fusil o la
// pistola. Las cuentas (probabilidades, monedas, repetidas) están en src/progress.js.
import { SKINS, RARITY } from './skins.js';
import { paintThumb } from './skinPaint.js';
import { profile, equip, equipped, SKIN_SLOTS } from './profile.js';
import { openCase, rollSkin, collection, nextCharm, charmName, CASE_PRICE, ODDS, COINS } from './progress.js';
import { ICONS } from './hud.js';
import { fmt } from './survival.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

// Miniaturas: la silueta del fusil de la barra de armas (64 × 24) pintada con la skin, a 3 aumentos.
const TW = 192; const TH = 72;
const RIFLE = new Path2D(`M${ICONS[0].match(/points="([^"]+)"/)[1].trim().split(/\s+/).join(' L')} Z`);
// Ruleta.
const TILES = 54; const WIN_AT = 46; // casillas y posición de la ganadora
const TILE_W = 176; // ancho de cada casilla con su separación (px, igual que en style.css)
const SPIN_TIME = 6.2; // s
const SLOT_NAMES = ['FUSIL', 'PISTOLA'];

// ---------- Miniaturas ----------
// Se pintan en un worker (el mismo que pinta las texturas del arma) y se guardan como imagen.
const thumbs = new Map(); // id -> Promise<dataURL>
let worker; const waiting = new Map(); // id -> resolve(píxeles)
function pixels(id) {
  if (worker === undefined) {
    try {
      worker = new Worker(new URL('./skinWorker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => { waiting.get(data.id)?.(data.px); waiting.delete(data.id); };
      worker.onerror = (e) => { // sin workers: lo que faltaba se pinta aquí
        e.preventDefault();
        worker = null;
        for (const [wid, resolve] of waiting) resolve(paintThumb(wid, TW, TH));
        waiting.clear();
      };
    } catch { worker = null; }
  }
  if (!worker) return Promise.resolve(paintThumb(id, TW, TH));
  return new Promise((resolve) => { waiting.set(id, resolve); worker.postMessage({ id, thumb: [TW, TH] }); });
}
function compose(px) {
  const pat = document.createElement('canvas');
  pat.width = TW; pat.height = TH;
  pat.getContext('2d').putImageData(new ImageData(px, TW, TH), 0, 0);
  const c = document.createElement('canvas');
  c.width = TW; c.height = TH;
  const g = c.getContext('2d');
  g.save();
  g.scale(TW / 64, TH / 24); g.clip(RIFLE); g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(pat, 0, 0);
  // Luz desde arriba y sombra abajo, para que tenga volumen.
  const shade = g.createLinearGradient(0, 0, 0, TH);
  shade.addColorStop(0, 'rgba(255,255,255,0.24)'); shade.addColorStop(0.4, 'rgba(255,255,255,0)'); shade.addColorStop(1, 'rgba(0,0,0,0.4)');
  g.fillStyle = shade; g.fillRect(0, 0, TW, TH);
  g.restore();
  g.save();
  g.scale(TW / 64, TH / 24); g.lineWidth = 0.3; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.stroke(RIFLE);
  g.restore();
  return c.toDataURL();
}
export function skinThumb(id) {
  if (!thumbs.has(id)) thumbs.set(id, pixels(id).then(compose));
  return thumbs.get(id);
}
const setThumb = (img, id) => skinThumb(id).then((url) => { img.src = url; });

export class Market {
  // onBack(): volver al menú principal.
  constructor(weapon, audio, { onBack }) {
    this.weapon = weapon;
    this.audio = audio;
    this.open = false;
    this.showSlot = -1; // arma que se expone en la escena (-1: ninguna)
    this.spin = null; // ruleta en marcha
    this.won = null; // último premio, mientras se enseña
    this.onBack = onBack;

    // Probabilidades y colección por rareza.
    this.odds = RARITY.map((r, i) => {
      const row = el('div', 'odd');
      row.style.setProperty('--rar', r.color);
      const got = el('span', 'got');
      row.append(el('b', '', r.name), el('span', '', `${ODDS[i]} %`), got);
      $('mk-odds').appendChild(row);
      return got;
    });
    $('btn-mk-open').addEventListener('click', () => this.openCase());
    $('btn-mk-back').addEventListener('click', () => { this.hide(); onBack(); });
    $('btn-mk-next').addEventListener('click', () => this.closeReveal());
    $('btn-mk-again').addEventListener('click', () => { this.closeReveal(); this.openCase(); });
    this.equipBtns = SLOT_NAMES.map((name, i) => {
      const b = el('button', 'btn ghost small', `PONER EN ${name}`);
      b.addEventListener('click', () => this.wear(i));
      $('mk-equip').appendChild(b);
      return b;
    });
    $('roulette').addEventListener('pointerdown', () => { if (this.spin) this.spin.skip = true; });
  }

  show() {
    this.audio.init(); // los sonidos de la ruleta necesitan el audio en marcha (esto es un clic)
    $('menu').classList.add('hidden');
    $('market').classList.remove('hidden');
    this.open = true;
    this.render();
    for (const s of SKINS) if (s.id !== 'none') skinThumb(s.id); // se van pintando para la ruleta
  }

  hide() {
    if (!this.open || this.spin) return;
    this.closeReveal();
    $('market').classList.add('hidden');
    this.open = false;
  }

  render() {
    const col = collection();
    $('mk-coins').textContent = fmt(profile.coins);
    $('mk-cases').textContent = profile.cases;
    const btn = $('btn-mk-open');
    const free = profile.cases > 0;
    const afford = profile.coins >= CASE_PRICE;
    btn.disabled = !free && !afford;
    btn.textContent = free ? `ABRIR ALIJO · TIENES ${profile.cases}` : afford ? `COMPRAR Y ABRIR · ${CASE_PRICE} ◈` : `FALTAN ${CASE_PRICE - profile.coins} ◈`;
    this.odds.forEach((got, i) => { got.textContent = `${col.got[i]} / ${col.total[i]}`; });
    $('mk-col').textContent = `${col.all} / ${col.of}`;
    const next = nextCharm();
    $('mk-tip').textContent = `Cada nivel te da un alijo y ${COINS.level} ◈, y cada baja ${COINS.kill} ◈. Si te sale una skin que ya tienes, se cambia por monedas.`
      + (next ? ` Próximo llavero: ${charmName(next.id)}, en el nivel ${next.level}.` : '');
  }

  // ---------- Ruleta ----------
  openCase() {
    if (this.spin) return;
    const res = openCase();
    if (!res) return;
    // Casillas de relleno con las mismas probabilidades y la ganadora en WIN_AT.
    const strip = $('rl-strip');
    strip.textContent = '';
    for (let i = 0; i < TILES; i++) {
      const s = i === WIN_AT ? res.skin : rollSkin();
      const tile = el('div', 'rl-tile');
      tile.style.setProperty('--rar', RARITY[s.rarity].color);
      const img = el('img');
      img.alt = '';
      setThumb(img, s.id);
      tile.append(img, el('b', '', s.name), el('span', '', RARITY[s.rarity].name));
      strip.appendChild(tile);
    }
    strip.style.transform = 'translateX(0)';
    $('market').classList.add('spinning');
    $('roulette').classList.remove('hidden');
    // Se para en la ganadora, en un punto al azar de la casilla (sin llegar a los bordes).
    const center = $('roulette').clientWidth / 2;
    const end = WIN_AT * TILE_W + TILE_W * (0.12 + Math.random() * 0.68) - center;
    this.spin = { t: 0, end, last: -1, tickT: 0, res, skip: false };
    this.render();
  }

  // Lo llama main.js en cada fotograma mientras la pantalla está abierta.
  update(dt) {
    const sp = this.spin;
    if (!sp) return;
    sp.t = sp.skip ? SPIN_TIME : Math.min(SPIN_TIME, sp.t + dt);
    const k = sp.t / SPIN_TIME;
    const x = sp.end * (1 - (1 - k) ** 4); // frena poco a poco, como en CS2
    $('rl-strip').style.transform = `translateX(${-x}px)`;
    const center = $('roulette').clientWidth / 2;
    const idx = Math.floor((x + center) / TILE_W);
    sp.tickT -= dt;
    if (idx !== sp.last && !sp.skip) {
      if (sp.tickT <= 0) { this.audio.caseTick(); sp.tickT = 0.03; }
      sp.last = idx;
    }
    if (k < 1) return;
    this.spin = null;
    const { res } = sp;
    $('rl-strip').children[WIN_AT].classList.add('win');
    this.audio.caseReveal(res.skin.rarity);
    setTimeout(() => this.reveal(res), sp.skip ? 250 : 900);
  }

  // Premio: nombre y rareza, si es nueva o repetida (y cuántas monedas da), y la skin puesta en el fusil para verla.
  reveal(res) {
    if (!this.open) return;
    this.won = res;
    const rar = RARITY[res.skin.rarity];
    $('roulette').classList.add('hidden');
    $('market').classList.remove('spinning');
    $('mk-main').classList.add('hidden');
    $('mk-reveal').classList.remove('hidden');
    $('mk-reveal').style.setProperty('--rar', rar.color);
    setThumb($('mk-won-img'), res.skin.id);
    $('mk-won-name').textContent = res.skin.name;
    $('mk-won-rar').textContent = rar.name;
    $('mk-won-state').textContent = res.dup ? `REPETIDA · +${res.refund} ◈` : '¡NUEVA!';
    $('mk-won-state').classList.toggle('dup', res.dup);
    if (res.dup) setTimeout(() => this.audio.coins(), 350);
    this.weapon.setSkin(0, res.skin.id); // vista previa (sólo se guarda si se pone)
    this.showSlot = 0;
    this.equipBtns.forEach((b, i) => { b.textContent = `PONER EN ${SLOT_NAMES[i]}`; b.classList.remove('on'); });
    const again = $('btn-mk-again');
    again.disabled = profile.cases <= 0 && profile.coins < CASE_PRICE;
    again.textContent = profile.cases > 0 ? `ABRIR OTRO · TIENES ${profile.cases}` : `ABRIR OTRO · ${CASE_PRICE} ◈`;
    this.render();
  }

  wear(slot) {
    const id = this.won?.skin.id;
    if (!id || !equip('skins', slot, id)) return;
    if (slot !== 0 && equipped('skins', 0) !== id) this.weapon.setSkin(0, equipped('skins', 0)); // fuera la vista previa
    this.weapon.setSkin(slot, id);
    this.showSlot = slot;
    this.equipBtns[slot].textContent = `PUESTA EN ${SLOT_NAMES[slot]}`;
    this.equipBtns[slot].classList.add('on');
    this.audio.uiClick();
  }

  // Vuelve a la pantalla del alijo; las armas recuperan lo que llevan puesto.
  closeReveal() {
    if (!this.won) return;
    this.won = null;
    const w = this.weapon;
    for (let i = 0; i < SKIN_SLOTS; i++) if (w.skinLoad[i] || (w.skins[i]?.def.id ?? 'none') !== equipped('skins', i)) w.setSkin(i, equipped('skins', i));
    this.showSlot = -1;
    this.weapon.endShowcase();
    $('mk-reveal').classList.add('hidden');
    $('mk-main').classList.remove('hidden');
    this.render();
  }
}
