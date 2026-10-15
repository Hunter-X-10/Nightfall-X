// Armería: pantalla del menú para elegir la skin y el llavero de cada arma. El arma elegida se expone en la
// escena, a la derecha del panel (ver Weapon.showcase), y la elección se guarda en el navegador.
import { CHARMS, loadCharms, saveCharms } from './charms.js';
import { SKINS, SKIN_SLOTS, RARITY, loadSkins, saveSkins, skinById } from './skins.js';
import { WEAPONS, ARMS } from './weapon.js';

const $ = (id) => document.getElementById(id);

const MODES = [
  { id: 'skins', name: 'SKINS', tip: 'Acabado del arma en primera persona. Se guarda en este navegador.' },
  { id: 'charms', name: 'LLAVEROS', tip: 'Cuelga de tu arma en primera persona y se guarda en este navegador.' },
];

export class Armory {
  // onBack(): volver al menú principal.
  constructor(weapon, { onBack }) {
    this.weapon = weapon;
    this.open = false;
    this.mode = 'skins';
    this.slot = 0; // arma que se está viendo (índice de WEAPONS)
    this.picks = loadCharms();
    this.skins = loadSkins();

    this.modeTabs = MODES.map((m) => {
      const b = document.createElement('button');
      b.className = 'btn ghost small';
      b.textContent = m.name;
      b.addEventListener('click', () => {
        this.mode = m.id;
        if (m.id === 'skins' && this.slot >= SKIN_SLOTS) this.slot = 0; // el cuchillo aún no tiene skins
        this.render();
      });
      $('armory-modes').appendChild(b);
      return b;
    });
    this.tabs = WEAPONS.slice(0, ARMS).map((w, i) => { // sin vendas ni botiquín
      const b = document.createElement('button');
      b.className = 'btn ghost small';
      b.textContent = w.label;
      b.addEventListener('click', () => { this.slot = i; this.render(); });
      $('armory-tabs').appendChild(b);
      return b;
    });
    this.tiles = CHARMS.map((c) => {
      const b = document.createElement('button');
      b.className = 'btn ghost small';
      b.textContent = c.name;
      b.addEventListener('click', () => this.pick(c.id));
      $('armory-grid').appendChild(b);
      return b;
    });
    // Cada skin, con el color de su rareza en el borde y debajo del nombre.
    this.skinTiles = SKINS.map((s) => {
      const b = document.createElement('button');
      b.className = 'skin-tile';
      b.style.setProperty('--rar', RARITY[s.rarity].color);
      b.innerHTML = `<b>${s.name}</b><span>${RARITY[s.rarity].name}</span>`;
      b.addEventListener('click', () => this.pickSkin(s.id));
      $('armory-skins').appendChild(b);
      return b;
    });
    $('btn-armory-back').addEventListener('click', () => { this.hide(); onBack(); });
  }

  show() {
    $('menu').classList.add('hidden');
    $('armory').classList.remove('hidden');
    this.open = true;
    this.render();
  }

  hide() {
    if (!this.open) return;
    $('armory').classList.add('hidden');
    this.open = false;
    this.weapon.endShowcase();
  }

  pick(id) {
    this.picks[this.slot] = id;
    saveCharms(this.picks);
    this.weapon.setCharm(this.slot, id);
    this.render();
  }

  pickSkin(id) {
    if (this.slot >= SKIN_SLOTS || this.skins[this.slot] === id) return;
    this.skins[this.slot] = id;
    saveSkins(this.skins);
    this.weapon.setSkin(this.slot, id);
    this.render();
  }

  render() {
    const skins = this.mode === 'skins';
    const mode = MODES.find((m) => m.id === this.mode);
    $('armory-title').textContent = mode.name;
    $('armory-skins').classList.toggle('hidden', !skins);
    $('armory-grid').classList.toggle('hidden', skins);
    this.modeTabs.forEach((b, i) => b.classList.toggle('on', MODES[i].id === this.mode));
    this.tabs.forEach((b, i) => { b.classList.toggle('on', i === this.slot); b.disabled = skins && i >= SKIN_SLOTS; });
    this.tiles.forEach((b, i) => b.classList.toggle('on', CHARMS[i].id === this.picks[this.slot]));
    this.skinTiles.forEach((b, i) => b.classList.toggle('on', SKINS[i].id === this.skins[this.slot]));
    if (skins) {
      const s = skinById(this.skins[this.slot]);
      $('armory-tip').innerHTML = `<span style="color:${RARITY[s.rarity].color}">${s.name} · ${RARITY[s.rarity].name}</span><br>${mode.tip}`;
    } else $('armory-tip').textContent = mode.tip;
  }
}
