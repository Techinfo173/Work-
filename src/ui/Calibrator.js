import { prefs } from '../utils/storage.js';
import * as THREE from 'three';

const SLIDERS = ['s', 'x', 'y', 'z', 'rx', 'ry', 'rz'];

/**
 * Wires the calibrator UI to a Weapon instance. Persists changes to localStorage.
 */
export class Calibrator {
  constructor(weapon) {
    this.weapon = weapon;
    this.el = {
      btn: document.getElementById('btn-calibrator'),
      ui: document.getElementById('calibrator-ui'),
      reset: document.getElementById('btn-reset-cal'),
      close: document.getElementById('btn-close-cal'),
      animList: document.getElementById('anim-list'),
      meshList: document.getElementById('mesh-list'),
      copyAnims: document.getElementById('btn-copy-anims'),
    };
    this._wireSliders();
    this._wireButtons();
  }

  showFor(meta) {
    if (!meta.isCustom) return;
    this.el.btn.hidden = false;
    this._populateInspectors(meta);
    this._syncSlidersFromWeapon();
  }

  hide() {
    this.el.btn.hidden = true;
    this.el.ui.hidden = true;
  }

  _wireSliders() {
    SLIDERS.forEach((id) => {
      const slider = document.getElementById(`cal-${id}`);
      const valEl = document.getElementById(`cal-${id}-val`);
      slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        const isRot = id.startsWith('r');
        valEl.innerText = isRot ? Math.round(v) : v.toFixed(2);
        this._apply();
      });
    });
  }

  _wireButtons() {
    const toggle = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.el.ui.hidden = !this.el.ui.hidden;
    };
    this.el.btn.addEventListener('click', toggle);
    this.el.btn.addEventListener('touchstart', toggle, { passive: false });
    this.el.close.addEventListener('click', toggle);
    this.el.close.addEventListener('touchstart', toggle, { passive: false });

    const reset = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      if (!this.weapon.defaultTransform) return;
      const p = this.weapon.defaultTransform;
      document.getElementById('cal-s').value = p.s;
      document.getElementById('cal-x').value = p.x;
      document.getElementById('cal-y').value = p.y;
      document.getElementById('cal-z').value = p.z;
      document.getElementById('cal-rx').value = p.rx;
      document.getElementById('cal-ry').value = p.ry;
      document.getElementById('cal-rz').value = p.rz;
      this._refreshLabels();
      this._apply();
    };
    this.el.reset.addEventListener('click', reset);
    this.el.reset.addEventListener('touchstart', reset, { passive: false });

    this.el.copyAnims.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = this.weapon.animationNames.join('\n');
      navigator.clipboard.writeText(text).then(() => {
        const orig = this.el.copyAnims.innerText;
        this.el.copyAnims.innerText = 'COPIED';
        setTimeout(() => { this.el.copyAnims.innerText = orig; }, 1500);
      });
    });
  }

  _syncSlidersFromWeapon() {
    const w = this.weapon.wrapper;
    const set = (id, v) => {
      const slider = document.getElementById(`cal-${id}`);
      slider.value = v;
    };
    set('s', w.scale.x);
    set('x', w.position.x);
    set('y', w.position.y);
    set('z', w.position.z);
    set('rx', THREE.MathUtils.radToDeg(w.rotation.x));
    set('ry', THREE.MathUtils.radToDeg(w.rotation.y));
    set('rz', THREE.MathUtils.radToDeg(w.rotation.z));
    this._refreshLabels();
  }

  _refreshLabels() {
    const setLabel = (id, val, isRot) => {
      document.getElementById(`cal-${id}-val`).innerText = isRot ? Math.round(val) : val.toFixed(2);
    };
    setLabel('s', parseFloat(document.getElementById('cal-s').value), false);
    ['x', 'y', 'z'].forEach((k) => setLabel(k, parseFloat(document.getElementById(`cal-${k}`).value), false));
    ['rx', 'ry', 'rz'].forEach((k) => setLabel(k, parseFloat(document.getElementById(`cal-${k}`).value), true));
  }

  _apply() {
    const c = {
      s: parseFloat(document.getElementById('cal-s').value),
      x: parseFloat(document.getElementById('cal-x').value),
      y: parseFloat(document.getElementById('cal-y').value),
      z: parseFloat(document.getElementById('cal-z').value),
      rx: parseFloat(document.getElementById('cal-rx').value),
      ry: parseFloat(document.getElementById('cal-ry').value),
      rz: parseFloat(document.getElementById('cal-rz').value),
    };
    this.weapon.applyCalibration(c);
    prefs.set('weaponCal', c);
  }

  _populateInspectors(meta) {
    // Animations
    if (meta.animationNames.length === 0) {
      this.el.animList.innerHTML = '<div style="color:#888;font-style:italic;text-align:center;">No animations</div>';
    } else {
      this.el.animList.innerHTML = '';
      for (const n of meta.animationNames) {
        const div = document.createElement('div');
        div.className = 'item';
        div.innerHTML = `<span class="name" title="${n}">${n}</span>`;
        this.el.animList.appendChild(div);
      }
    }

    // Meshes
    if (meta.meshes.length === 0) {
      this.el.meshList.innerHTML = '<div style="color:#888;font-style:italic;text-align:center;">No meshes</div>';
    } else {
      this.el.meshList.innerHTML = '';
      for (const m of meta.meshes) {
        const div = document.createElement('div');
        div.className = 'item';
        const toggle = document.createElement('span');
        toggle.style.fontSize = '9px';
        toggle.style.fontWeight = 'bold';
        const refresh = () => {
          toggle.innerText = m.visible ? 'SHOW' : 'HIDE';
          toggle.style.color = m.visible ? '#0f0' : '#f44';
        };
        refresh();
        div.innerHTML = `<span class="name" title="${m.name}">${m.name || 'unnamed'}</span>`;
        div.appendChild(toggle);
        div.addEventListener('click', () => { m.visible = !m.visible; refresh(); });
        this.el.meshList.appendChild(div);
      }
    }
  }
}
