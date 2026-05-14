import { CFG } from '../config.js';

/**
 * Unified input source. Exposes:
 *   - moveX, moveY  (-1..1)   -- left analog (WASD or left thumb)
 *   - look(dx, dy)            -- callbacks via subscribe('look', fn)
 *   - actions: fire/ads/reload/jump/inspect (events via subscribe)
 *   - wantSprint (bool)
 */
export class InputManager {
  constructor() {
    this.moveX = 0;
    this.moveY = 0;
    this.wantSprint = false;
    this._listeners = { look: [], action: [] };

    this._touchMoveX = 0;
    this._touchMoveY = 0;
    this._touchSprint = false;
    this._keys = {};
    this._setupKeyboard();
    this._setupMouse();
    this._setupTouch();
  }

  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  }

  _emit(event, ...args) {
    const arr = this._listeners[event];
    if (arr) for (const fn of arr) fn(...args);
  }

  _setupKeyboard() {
    window.addEventListener('keydown', (e) => {
      this._keys[e.code] = true;
      if (e.code === 'KeyR') this._emit('action', 'reload');
      if (e.code === 'KeyF') this._emit('action', 'inspect');
      if (e.code === 'Space') this._emit('action', 'jump');
    });
    window.addEventListener('keyup', (e) => { this._keys[e.code] = false; });
  }

  _setupMouse() {
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement) {
        this._emit('look', e.movementX, e.movementY, false);
      }
    });
    document.addEventListener('mousedown', (e) => {
      if (!document.pointerLockElement) {
        // pointer lock requested at game-start level
        return;
      }
      if (e.button === 0) this._emit('action', 'fire-start');
      if (e.button === 2) this._emit('action', 'ads-toggle');
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this._emit('action', 'fire-end');
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _setupTouch() {
    const left = document.getElementById('touch-left');
    const right = document.getElementById('touch-right');
    const jBase = document.getElementById('joy-base');
    const jStick = document.getElementById('joy-stick');

    let moveId = null, startX = 0, startY = 0;
    let lookId = null, lastX = 0, lastY = 0;

    left.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      moveId = t.identifier;
      startX = t.clientX;
      startY = t.clientY;
      jBase.style.display = 'block';
      jBase.style.left = `${t.clientX}px`;
      jBase.style.top = `${t.clientY}px`;
      jStick.style.transform = 'translate(-50%,-50%)';
    }, { passive: false });

    left.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === moveId) {
          const dx = t.clientX - startX;
          const dy = t.clientY - startY;
          const dist = Math.min(Math.hypot(dx, dy), 50);
          const ang = Math.atan2(dy, dx);
          jStick.style.transform = `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist}px))`;
          this._touchMoveX = Math.cos(ang) * dist / 50;
          this._touchMoveY = Math.sin(ang) * dist / 50;
          this._touchSprint = this._touchMoveY < -0.65;
        }
      }
    }, { passive: false });

    const endMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === moveId) {
          moveId = null;
          this._touchMoveX = 0;
          this._touchMoveY = 0;
          this._touchSprint = false;
          jBase.style.display = 'none';
        }
      }
    };
    left.addEventListener('touchend', endMove);
    left.addEventListener('touchcancel', endMove);

    right.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      lookId = t.identifier;
      lastX = t.clientX;
      lastY = t.clientY;
    }, { passive: false });

    right.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === lookId) {
          const dx = t.clientX - lastX;
          const dy = t.clientY - lastY;
          this._emit('look', dx, dy, true);
          lastX = t.clientX;
          lastY = t.clientY;
        }
      }
    }, { passive: false });

    const endLook = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === lookId) lookId = null;
      }
    };
    right.addEventListener('touchend', endLook);
    right.addEventListener('touchcancel', endLook);

    // Action buttons
    const bind = (id, startEvt, endEvt) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('touchstart', (e) => { e.preventDefault(); this._emit('action', startEvt); }, { passive: false });
      if (endEvt) {
        el.addEventListener('touchend', (e) => { e.preventDefault(); this._emit('action', endEvt); });
        el.addEventListener('touchcancel', (e) => { e.preventDefault(); this._emit('action', endEvt); });
      }
    };
    bind('btn-fire', 'fire-start', 'fire-end');
    bind('btn-ads', 'ads-toggle');
    bind('btn-reload', 'reload');
    bind('btn-jump', 'jump');
    bind('btn-inspect', 'inspect');

    // Click fallback for desktop testing
    document.getElementById('btn-ads').addEventListener('click', (e) => {
      if (!('ontouchstart' in window)) this._emit('action', 'ads-toggle');
    });
    document.getElementById('btn-reload').addEventListener('click', (e) => {
      if (!('ontouchstart' in window)) this._emit('action', 'reload');
    });
    document.getElementById('btn-jump').addEventListener('click', (e) => {
      if (!('ontouchstart' in window)) this._emit('action', 'jump');
    });
    document.getElementById('btn-inspect').addEventListener('click', (e) => {
      if (!('ontouchstart' in window)) this._emit('action', 'inspect');
    });
  }

  /**
   * Roll keyboard + touch into the unified moveX/moveY each frame.
   * Keyboard takes priority if any WASD key is held.
   */
  pollKeyboard() {
    const k = this._keys;
    let mx = 0, my = 0;
    if (k['KeyW']) my -= 1;
    if (k['KeyS']) my += 1;
    if (k['KeyA']) mx -= 1;
    if (k['KeyD']) mx += 1;
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my) || 1;
      this.moveX = mx / len;
      this.moveY = my / len;
      this.wantSprint = !!k['ShiftLeft'];
    } else {
      this.moveX = this._touchMoveX;
      this.moveY = this._touchMoveY;
      this.wantSprint = this._touchSprint;
    }
  }
}
