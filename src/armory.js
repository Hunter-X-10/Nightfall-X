// Armería: pantalla del menú para elegir el llavero de cada arma. El arma elegida se expone en la
// escena, a la derecha del panel (ver Weapon.showcase), y la elección se guarda en el navegador.
import { CHARMS, loadCharms, saveCharms } from './charms.js';
import { WEAPONS, ARMS } from './weapon.js';

const $ = (id) => document.getElementById(id);

export class Armory {
  // onBack(): volver al menú principal.
  constructor(weapon, { onBack }) {
    this.weapon = weapon;
    this.open = false;
    this.slot = 0; // arma que se está viendo (índice de WEAPONS)
    this.picks = loadCharms();

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

  render() {
    this.tabs.forEach((b, i) => b.classList.toggle('on', i === this.slot));
    this.tiles.forEach((b, i) => b.classList.toggle('on', CHARMS[i].id === this.picks[this.slot]));
  }
}
