// Recetas de sonidos sintetizados. Se instalan como métodos de AudioEngine.
import { clamp, rand } from './utils.js';

export function installSounds(proto) {
  const def = (name, fn) => {
    proto[name] = function (...a) { if (this.ready && this.ctx.state === 'running') fn.apply(this, a); };
  };

  // Disparo de fusil: chasquido agudo + cuerpo + golpe grave + mecanismo + cola en reverb.
  function shot(e, gain, pan, cutoff, verb, pitch) {
    const out = e._out(pan, verb, gain);
    const lp = e._filter('lowpass', cutoff, 0.5);
    lp.connect(out);
    e.noise(lp, { type: 'highpass', f0: 1100 * pitch, peak: 0.85, decay: 0.075 });
    e.noise(lp, { type: 'lowpass', f0: 2600 * pitch, f1: 320, peak: 0.9, decay: 0.17 });
    e.noise(lp, { type: 'bandpass', f0: 620 * pitch, q: 1.2, peak: 0.5, decay: 0.22, pink: true });
    e.tone(lp, { type: 'sine', f0: 170 * pitch, f1: 46, peak: 0.95, decay: 0.13 });
    e.tone(lp, { type: 'square', f0: 1900 * pitch, peak: 0.07, decay: 0.012, delay: 0.004 });
  }

  def('gunshot', function () { shot(this, 0.62, rand(-0.04, 0.04), 15000, 0.32, rand(0.95, 1.05)); });

  // Pistola de pequeño calibre: más seca y aguda, con menos cola.
  def('pistolShot', function () { shot(this, 0.42, rand(-0.04, 0.04), 15000, 0.2, rand(1.38, 1.5)); });

  // Disparo de otro tirador en el mundo. `pitch` > 1 para armas de menor calibre.
  def('enemyShot', function (x, y, z, pitch = 1) {
    const s = this.spatial(x, y, z, pitch > 1 ? 9 : 14);
    shot(this, 0.75 * s.gain + 0.03, s.pan, clamp(13000 - s.dist * 190, 900, 13000), 0.3 + Math.min(0.5, s.dist * 0.012), rand(0.82, 0.92) * pitch);
  });

  // Tajo de cuchillo: propio (sin posición) o de otro jugador cercano.
  def('knifeSwing', function (x, y, z) {
    let gain = 0.4; let pan = rand(-0.1, 0.1);
    if (x !== undefined) { const s = this.spatial(x, y, z, 2.5); if (s.gain < 0.08) return; gain = s.gain * 0.5; pan = s.pan; }
    const out = this._out(pan, 0.04, gain);
    this.noise(out, { type: 'bandpass', f0: 900, f1: 3200, q: 1.6, peak: 0.6, attack: 0.03, decay: 0.14 });
  });

  // Sacar el cuchillo de la funda: roce de la hoja y un pequeño clic metálico.
  def('knifeDraw', function () {
    const out = this._out(rand(0.05, 0.15), 0.03, 0.32);
    this.noise(out, { type: 'bandpass', f0: 2600, f1: 5200, q: 3, peak: 0.35, attack: 0.02, decay: 0.12 });
    this.tone(out, { type: 'sine', f0: rand(3900, 4300), peak: 0.05, decay: 0.12, delay: 0.1 });
  });

  // Cuchillada que entra: golpe sordo y corto, sin metal.
  def('stab', function () {
    const out = this._out(rand(-0.05, 0.05), 0.04, 0.5);
    this.noise(out, { type: 'lowpass', f0: 650, f1: 220, peak: 0.8, decay: 0.08, pink: true });
    this.tone(out, { f0: 120, f1: 70, peak: 0.35, decay: 0.07 });
  });

  def('weaponSwap', function () {
    const out = this._out(rand(-0.1, 0.1), 0.03, 0.4);
    this.noise(out, { type: 'bandpass', f0: 1500, q: 1.2, peak: 0.35, attack: 0.01, decay: 0.09, pink: true });
    this.noise(out, { type: 'bandpass', f0: 3100, q: 3, peak: 0.3, decay: 0.02, delay: 0.13 });
  });

  def('dryFire', function () {
    const out = this._out(0, 0.03, 0.5);
    this.noise(out, { type: 'bandpass', f0: 2800, q: 3, peak: 0.5, decay: 0.02 });
    this.tone(out, { type: 'square', f0: 1300, peak: 0.08, decay: 0.015 });
  });

  // Fases de la recarga: 0 soltar cargador, 1 insertar, 2 tirar del cerrojo, 3 soltar cerrojo.
  def('reload', function (stage) {
    const out = this._out(rand(-0.1, 0.1), 0.05, 0.55);
    if (stage === 0) {
      this.noise(out, { type: 'bandpass', f0: 2600, q: 2.5, peak: 0.55, decay: 0.022 });
      this.noise(out, { type: 'bandpass', f0: 950, q: 1, peak: 0.16, decay: 0.12, delay: 0.03 });
    } else if (stage === 1) {
      this.tone(out, { type: 'sine', f0: 210, f1: 95, peak: 0.5, decay: 0.07 });
      this.noise(out, { type: 'lowpass', f0: 1500, peak: 0.5, decay: 0.045 });
      this.noise(out, { type: 'bandpass', f0: 3300, q: 3, peak: 0.3, decay: 0.02, delay: 0.035 });
    } else if (stage === 2) {
      this.noise(out, { type: 'bandpass', f0: 3000, f1: 1800, q: 1.5, peak: 0.28, decay: 0.09 });
      this.noise(out, { type: 'bandpass', f0: 2100, q: 4, peak: 0.45, decay: 0.02, delay: 0.085 });
    } else {
      this.noise(out, { type: 'highpass', f0: 1800, peak: 0.6, decay: 0.03 });
      this.tone(out, { type: 'sine', f0: 2150, peak: 0.12, decay: 0.09 });
      this.tone(out, { type: 'sine', f0: 3420, peak: 0.07, decay: 0.07 });
      this.tone(out, { type: 'sine', f0: 240, f1: 120, peak: 0.3, decay: 0.05 });
    }
  });

  def('impact', function (surface, x, y, z) {
    const s = this.spatial(x, y, z, 5);
    if (s.gain < 0.03) return;
    const out = this._out(s.pan, 0.12, Math.min(0.9, s.gain * 1.3));
    switch (surface) {
      case 'metal': {
        const f = rand(1700, 4300);
        this.noise(out, { type: 'highpass', f0: 2500, peak: 0.5, decay: 0.03 });
        for (const [m, p] of [[1, 0.3], [1.53, 0.2], [2.31, 0.12]]) this.tone(out, { f0: f * m, peak: p, decay: rand(0.1, 0.26) });
        break;
      }
      case 'water':
        this.tone(out, { f0: 380, f1: 1300, peak: 0.3, decay: 0.07 });
        this.noise(out, { type: 'bandpass', f0: 2100, q: 0.8, peak: 0.4, decay: 0.2 });
        break;
      case 'wood':
        this.noise(out, { type: 'lowpass', f0: 1000, peak: 0.7, decay: 0.07 });
        this.tone(out, { f0: 330, f1: 180, peak: 0.35, decay: 0.07 });
        break;
      case 'glass':
        this.noise(out, { type: 'highpass', f0: 4200, peak: 0.6, decay: 0.12 });
        for (let i = 0; i < 5; i++) this.tone(out, { f0: rand(4500, 9000), peak: 0.1, decay: rand(0.05, 0.14), delay: i * rand(0.01, 0.04) });
        break;
      case 'flesh':
        this.noise(out, { type: 'lowpass', f0: 520, peak: 0.8, decay: 0.07 });
        this.noise(out, { type: 'bandpass', f0: 1300, q: 1, peak: 0.25, decay: 0.05 });
        break;
      default:
        this.noise(out, { type: 'lowpass', f0: 1900, f1: 500, peak: 0.75, decay: 0.1 });
        for (let i = 0; i < 4; i++) this.noise(out, { type: 'bandpass', f0: rand(1500, 4000), q: 2, peak: 0.12, decay: 0.03, delay: rand(0.04, 0.3) });
    }
  });

  def('casing', function (x, y, z, v, n) {
    const s = this.spatial(x, y, z, 2.5);
    const out = this._out(s.pan, 0.06, s.gain * v * 0.35);
    const f = rand(4100, 5600) + n * 450;
    this.tone(out, { f0: f, peak: 0.5, decay: 0.07 });
    this.tone(out, { f0: f * 1.41, peak: 0.3, decay: 0.05 });
  });

  def('step', function (surface, loud) {
    this.stepSide = -this.stepSide;
    const out = this._out(this.stepSide * 0.12, this.indoor * 0.12, 0.34 * loud + 0.03);
    const p = rand(0.85, 1.15);
    if (surface === 'water') {
      this.noise(out, { type: 'bandpass', f0: 1500 * p, q: 0.8, peak: 0.6, decay: 0.2 });
      this.noise(out, { type: 'highpass', f0: 5000, peak: 0.16, decay: 0.12, delay: 0.02 });
      this.tone(out, { f0: 300 * p, f1: 700, peak: 0.12, decay: 0.05 });
    } else if (surface === 'dirt') {
      this.noise(out, { type: 'bandpass', f0: 520 * p, q: 0.8, peak: 0.6, decay: 0.09, pink: true });
      this.noise(out, { type: 'bandpass', f0: 2200 * p, q: 1.2, peak: 0.12, decay: 0.05, delay: 0.03 });
    } else if (surface === 'metal') {
      this.noise(out, { type: 'lowpass', f0: 1300 * p, peak: 0.5, decay: 0.06 });
      this.tone(out, { f0: 190 * p, f1: 120, peak: 0.3, decay: 0.12 });
      this.tone(out, { f0: 830 * p, peak: 0.07, decay: 0.1 });
    } else {
      // Asfalto u hormigón; mojado en exterior.
      this.noise(out, { type: 'lowpass', f0: (surface === 'concrete' ? 800 : 1150) * p, peak: 0.6, decay: 0.065, pink: true });
      this.tone(out, { f0: 110 * p, f1: 60, peak: 0.25, decay: 0.05 });
      if (this.indoor < 0.5) this.noise(out, { type: 'bandpass', f0: 3400 * p, q: 0.9, peak: 0.1, decay: 0.07, delay: 0.018 });
    }
  });

  def('land', function (v) {
    const out = this._out(0, 0.06, clamp(v / 9, 0.2, 0.8));
    this.noise(out, { type: 'lowpass', f0: 700, peak: 0.8, decay: 0.12, pink: true });
    this.tone(out, { f0: 95, f1: 45, peak: 0.5, decay: 0.1 });
  });

  def('hitmarker', function (kind) {
    const out = this._out(0, 0, 0.3);
    if (kind === 'kill') {
      this.tone(out, { type: 'triangle', f0: 1500, peak: 0.5, decay: 0.035 });
      this.tone(out, { type: 'triangle', f0: 900, f1: 500, peak: 0.6, decay: 0.09, delay: 0.045 });
    } else if (kind === 'head') {
      this.tone(out, { type: 'triangle', f0: 2500, peak: 0.55, decay: 0.05 });
      this.tone(out, { type: 'sine', f0: 3700, peak: 0.2, decay: 0.08 });
    } else this.tone(out, { type: 'triangle', f0: 1750, peak: 0.45, decay: 0.03 });
  });

  def('hurt', function () {
    const out = this._out(rand(-0.3, 0.3), 0.05, 0.6);
    this.noise(out, { type: 'lowpass', f0: 420, peak: 0.9, decay: 0.12, pink: true });
    this.tone(out, { f0: 140, f1: 60, peak: 0.6, decay: 0.14 });
  });

  // Tos corta y suave al agotar la resistencia: un golpe de aire con algo de voz y otro más flojo detrás.
  def('cough', function () {
    const out = this._out(0, 0.04, 0.32);
    const p = rand(0.92, 1.08);
    for (const [d, k] of [[0, 1], [rand(0.2, 0.26), 0.55]]) {
      this.noise(out, { type: 'bandpass', f0: 750 * p, f1: 480 * p, q: 1.3, peak: 0.55 * k, attack: 0.008, decay: 0.11, delay: d, pink: true });
      this.noise(out, { type: 'bandpass', f0: 1900 * p, q: 2.2, peak: 0.16 * k, attack: 0.006, decay: 0.06, delay: d });
      this.tone(out, { type: 'triangle', f0: 150 * p, f1: 110 * p, peak: 0.08 * k, attack: 0.01, decay: 0.09, delay: d });
    }
  });

  // Deslizamiento propio: golpe sordo al tirarse y roce de la ropa contra el suelo que se va apagando.
  def('slide', function (surface) {
    const out = this._out(rand(-0.05, 0.05), this.indoor * 0.1, 0.38);
    const p = rand(0.9, 1.1);
    this.noise(out, { type: 'lowpass', f0: 600 * p, f1: 160, peak: 0.55, decay: 0.12, pink: true });
    if (surface === 'water') {
      this.noise(out, { type: 'bandpass', f0: 1300 * p, f1: 500, q: 0.7, peak: 0.45, attack: 0.03, decay: 0.55 });
      this.noise(out, { type: 'highpass', f0: 4500, peak: 0.12, attack: 0.02, decay: 0.35 });
    } else {
      const f = (surface === 'dirt' ? 900 : surface === 'metal' ? 2100 : 1500) * p;
      this.noise(out, { type: 'bandpass', f0: f, f1: f * 0.45, q: 0.9, peak: 0.32, attack: 0.04, decay: 0.6, pink: surface === 'dirt' });
      this.noise(out, { type: 'highpass', f0: 3800, peak: 0.06, attack: 0.03, decay: 0.4 });
    }
  });

  // Trepar: palmada de la mano sobre el obstáculo, roce de la ropa y el equipo al pasar por encima.
  def('vault', function (surface) {
    const out = this._out(rand(-0.08, 0.08), this.indoor * 0.1, 0.36);
    const p = rand(0.9, 1.1);
    if (surface === 'metal') {
      this.noise(out, { type: 'lowpass', f0: 1600 * p, peak: 0.45, decay: 0.05 });
      this.tone(out, { f0: 240 * p, f1: 170, peak: 0.22, decay: 0.16 });
      this.tone(out, { f0: 930 * p, peak: 0.05, decay: 0.14 });
    } else {
      this.noise(out, { type: 'bandpass', f0: (surface === 'wood' ? 900 : 1300) * p, q: 0.9, peak: 0.55, decay: 0.05, pink: true });
      this.tone(out, { f0: 140 * p, f1: 80, peak: 0.2, decay: 0.06 });
    }
    this.noise(out, { type: 'bandpass', f0: 1800 * p, f1: 900, q: 1.1, peak: 0.22, attack: 0.05, decay: 0.28, delay: 0.06, pink: true });
    this.noise(out, { type: 'bandpass', f0: 3400 * p, q: 3, peak: 0.07, decay: 0.03, delay: 0.17 });
  });

  def('whizz', function (side) {
    const out = this._out(side * 0.8, 0.1, 0.35);
    this.noise(out, { type: 'bandpass', f0: rand(2800, 4200), f1: 800, q: 5, peak: 0.6, attack: 0.02, decay: 0.13 });
  });

  def('explosion', function (x, y, z) {
    const s = this.spatial(x, y, z, 22);
    const g = Math.min(1, s.gain * 1.6);
    const out = this._out(s.pan * 0.6, 0.55, g);
    const lp = this._filter('lowpass', clamp(9000 - s.dist * 90, 700, 9000), 0.5);
    lp.connect(out);
    this.noise(lp, { type: 'highpass', f0: 1400, peak: 1.0, decay: 0.05 });
    this.noise(lp, { type: 'lowpass', f0: 3200, f1: 140, peak: 1.0, decay: 1.2, pink: true, rate: 0.7 });
    this.noise(lp, { type: 'lowpass', f0: 900, f1: 90, peak: 0.9, decay: 1.9, pink: true, rate: 0.5 });
    this.tone(lp, { f0: 95, f1: 26, peak: 1.0, decay: 0.75 });
    for (let i = 0; i < 12; i++) this.noise(lp, { type: 'bandpass', f0: rand(700, 3200), q: 2, peak: rand(0.05, 0.2), decay: rand(0.03, 0.1), delay: rand(0.25, 1.7) });
  });

  def('thunder', function (close) {
    const out = this._out(rand(-0.5, 0.5), 0.5, 0.5 + close * 0.45);
    if (close > 0.5) this.noise(out, { type: 'highpass', f0: 900, f1: 300, peak: 0.5, attack: 0.01, decay: 0.3 });
    for (let i = 0; i < 5; i++) {
      this.noise(out, { type: 'lowpass', f0: rand(120, 300), peak: rand(0.5, 1) * (1 - i * 0.14), attack: 0.08, decay: rand(1.2, 2.8), delay: i * rand(0.25, 0.6), pink: true, rate: 0.5 });
    }
  });

  // ---------- Botín y curación (partidas en línea) ----------
  // Vuelta de venda: roce de tela. La última, el tirón al cortarla.
  def('bandage', function (last) {
    const out = this._out(rand(-0.15, 0.05), 0.03, 0.3);
    const p = rand(0.9, 1.15);
    if (last) {
      this.noise(out, { type: 'bandpass', f0: 2600 * p, f1: 1200, q: 1.4, peak: 0.5, attack: 0.005, decay: 0.09 });
      this.noise(out, { type: 'highpass', f0: 5000, peak: 0.18, decay: 0.05, delay: 0.02 });
    } else this.noise(out, { type: 'bandpass', f0: 1500 * p, f1: 2400 * p, q: 1.1, peak: 0.32, attack: 0.08, decay: 0.2, pink: true });
  });

  // Botiquín por fases: 0 cierres y tapa, 1 coger el autoinyector, 2 pinchazo con siseo, 3 dejarlo, 4 cerrar.
  def('medkit', function (stage) {
    const out = this._out(rand(-0.08, 0.08), 0.04, 0.34);
    if (stage === 0 || stage === 4) {
      for (const d of [0, 0.07]) this.noise(out, { type: 'bandpass', f0: 3200, q: 4, peak: 0.35, decay: 0.025, delay: d });
      this.noise(out, { type: 'lowpass', f0: 900, peak: 0.3, decay: 0.08, delay: stage === 4 ? 0.12 : 0.16, pink: true });
    } else if (stage === 1 || stage === 3) {
      this.noise(out, { type: 'bandpass', f0: 1800, q: 2, peak: 0.25, attack: 0.01, decay: 0.07 });
      this.tone(out, { type: 'triangle', f0: 620, peak: 0.05, decay: 0.06, delay: 0.02 });
    } else {
      this.noise(out, { type: 'bandpass', f0: 4200, q: 6, peak: 0.4, decay: 0.03 }); // clic del muelle
      this.noise(out, { type: 'highpass', f0: 3000, f1: 6000, peak: 0.16, attack: 0.05, decay: 0.9, delay: 0.03 }); // siseo
    }
  });

  // Curación completada: dos notas suaves que suben.
  def('healed', function () {
    const out = this._out(0, 0.15, 0.22);
    this.tone(out, { type: 'sine', f0: 660, peak: 0.3, attack: 0.01, decay: 0.25 });
    this.tone(out, { type: 'sine', f0: 990, peak: 0.25, attack: 0.01, decay: 0.35, delay: 0.09 });
  });

  // Ponerse un chaleco: velcro y el golpe sordo de las placas.
  def('vestOn', function () {
    const out = this._out(0, 0.05, 0.4);
    this.noise(out, { type: 'bandpass', f0: 2200, f1: 3400, q: 1.5, peak: 0.4, attack: 0.02, decay: 0.22 });
    this.noise(out, { type: 'lowpass', f0: 500, peak: 0.45, decay: 0.09, delay: 0.24, pink: true });
    this.tone(out, { type: 'sine', f0: 520, peak: 0.12, attack: 0.01, decay: 0.3, delay: 0.3 });
    this.tone(out, { type: 'sine', f0: 780, peak: 0.1, attack: 0.01, decay: 0.35, delay: 0.38 });
  });

  // El chaleco se rompe: crujido de placa y un tono que cae.
  def('armorBreak', function () {
    const out = this._out(0, 0.08, 0.45);
    this.noise(out, { type: 'bandpass', f0: 2600, f1: 900, q: 1.2, peak: 0.6, decay: 0.16 });
    for (let i = 0; i < 4; i++) this.noise(out, { type: 'highpass', f0: 3500, peak: rand(0.1, 0.25), decay: 0.02, delay: rand(0.02, 0.12) });
    this.tone(out, { type: 'triangle', f0: 700, f1: 260, peak: 0.18, decay: 0.3 });
  });

  // Recoger vendas o un botiquín.
  def('pickup', function () {
    const out = this._out(0, 0.04, 0.3);
    this.noise(out, { type: 'bandpass', f0: 1600, q: 1.2, peak: 0.3, attack: 0.01, decay: 0.08, pink: true });
    this.tone(out, { type: 'triangle', f0: 1180, peak: 0.12, decay: 0.08, delay: 0.05 });
  });

  // Cofre que se abre (en el mundo): bisagra, golpe de la tapa y un acorde brillante.
  def('chestOpen', function (x, y, z) {
    const s = this.spatial(x, y, z, 5);
    if (s.gain < 0.05) return;
    const out = this._out(s.pan, 0.15, s.gain * 0.75);
    this.noise(out, { type: 'bandpass', f0: 700, f1: 1300, q: 5, peak: 0.25, attack: 0.04, decay: 0.2 }); // bisagra
    this.noise(out, { type: 'lowpass', f0: 600, peak: 0.6, decay: 0.12, delay: 0.22, pink: true });
    for (const [f, d] of [[784, 0.18], [988, 0.24], [1319, 0.3], [1568, 0.38]]) this.tone(out, { type: 'sine', f0: f, peak: 0.2, attack: 0.01, decay: 0.7, delay: d });
  });

  // Brillo de un cofre lleno cercano: unas notas agudas y suaves.
  def('chestHum', function (x, y, z) {
    const s = this.spatial(x, y, z, 3);
    if (s.gain < 0.12) return;
    const out = this._out(s.pan, 0.3, s.gain * 0.18);
    const base = [1568, 1760, 2093, 2349][Math.floor(rand(0, 4))];
    this.tone(out, { type: 'sine', f0: base, peak: 0.25, attack: 0.08, decay: 0.9 });
    this.tone(out, { type: 'sine', f0: base * 1.5, peak: 0.12, attack: 0.1, decay: 0.8, delay: 0.12 });
  });

  def('uiClick', function () {
    const out = this._out(0, 0.05, 0.25);
    this.tone(out, { type: 'triangle', f0: 880, f1: 440, peak: 0.4, decay: 0.07 });
  });

  def('objective', function () {
    const out = this._out(0, 0.25, 0.3);
    for (const [f, d] of [[392, 0], [587, 0.11], [784, 0.22]]) this.tone(out, { type: 'triangle', f0: f, peak: 0.35, attack: 0.01, decay: 0.5, delay: d });
  });

  // Zumbido y chasquido de una luminaria que parpadea.
  def('buzz', function (x, y, z) {
    const s = this.spatial(x, y, z, 4);
    if (s.gain < 0.08) return;
    const out = this._out(s.pan, 0, s.gain * 0.25);
    this.noise(out, { type: 'bandpass', f0: 5200, q: 6, peak: 0.5, decay: 0.05 });
    this.tone(out, { type: 'sawtooth', f0: 100, peak: 0.2, decay: 0.09 });
  });
}
