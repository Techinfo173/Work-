/**
 * Thin HUD wrapper. All DOM updates go through here, all values are diffed
 * to avoid layout thrash.
 */
export class HUD {
  constructor() {
    this.el = {
      ammo: document.getElementById('ammo-current'),
      max: document.getElementById('ammo-max'),
      kills: document.getElementById('kill-count'),
      status: document.getElementById('status-indicator'),
      crosshair: document.getElementById('crosshair'),
      hitMarker: document.getElementById('hit-marker'),
      flash: document.getElementById('flash-overlay'),
      vignette: document.getElementById('vignette'),
      bearing: document.getElementById('bearing-strip'),
      btnAds: document.getElementById('btn-ads'),
    };
    this._lastAmmo = -1;
    this._lastReserve = -1;
    this._lastKills = -1;
    this._lastAds = null;
    this._buildBearingStrip();
  }

  _buildBearingStrip() {
    const labels = ['N', '.', '.', 'NE', '.', '.', 'E', '.', '.', 'SE', '.', '.', 'S', '.', '.', 'SW', '.', '.', 'W', '.', '.', 'NW', '.', '.', 'N'];
    this.el.bearing.innerHTML = labels.map((l) =>
      l === '.' ? '<span class="deg">.</span>' : `<span>${l}</span>`
    ).join('');
  }

  setAmmo(current, reserve) {
    if (current !== this._lastAmmo) {
      this.el.ammo.innerText = current;
      this._lastAmmo = current;
    }
    if (reserve !== this._lastReserve) {
      this.el.max.innerText = `/ ${reserve}`;
      this._lastReserve = reserve;
    }
  }

  setKills(n) {
    if (n !== this._lastKills) {
      this.el.kills.innerText = n;
      this._lastKills = n;
    }
  }

  setStatus(text, durationMs = 0) {
    this.el.status.innerText = text;
    this.el.status.style.opacity = '1';
    if (durationMs > 0) {
      const target = text;
      setTimeout(() => {
        if (this.el.status.innerText === target) this.el.status.style.opacity = '0';
      }, durationMs);
    }
  }

  hideStatus() {
    this.el.status.style.opacity = '0';
  }

  setAds(isAds) {
    if (this._lastAds === isAds) return;
    this._lastAds = isAds;
    this.el.btnAds.style.background = isAds ? 'rgba(0,200,255,0.4)' : '';
    this.el.crosshair.style.opacity = isAds ? '0' : '1';
    this.el.vignette.style.opacity = isAds ? '0.9' : '0.55';
  }

  pulseCrosshair(scale) {
    this.el.crosshair.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }

  showHitMarker() {
    const hm = this.el.hitMarker;
    hm.style.transition = 'none';
    hm.style.transform = `translate(-50%, -50%) rotate(${Math.random() * 20 - 10}deg) scale(1.8)`;
    hm.style.opacity = '1';
    requestAnimationFrame(() => {
      hm.style.transition = 'all 0.15s ease-out';
      hm.style.transform = 'translate(-50%, -50%) scale(0.8)';
      hm.style.opacity = '0';
    });
  }

  setFlash(opacity) {
    this.el.flash.style.opacity = opacity;
  }

  setBearing(yaw) {
    this.el.bearing.style.transform = `translateX(-50%) translateX(${yaw * 300}px)`;
  }
}
