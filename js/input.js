// Tastatur + Maus. Aktionen statt Tasten, damit die Belegung frei änderbar ist.
import { settings } from './config.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.codes = new Set();
    this.pressedCodes = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false };
    this.locked = false;
    this.enabled = false;
    this.onUnlock = null;
    this.listenCb = null; // für Tastenbelegung

    addEventListener('keydown', e => {
      if (this.listenCb) { e.preventDefault(); const cb = this.listenCb; this.listenCb = null; cb(e.code); return; }
      if (this.enabled && e.code !== 'Escape' && e.code !== 'F11' && e.code !== 'F12') e.preventDefault();
      if (!this.codes.has(e.code)) this.pressedCodes.add(e.code);
      this.codes.add(e.code);
    });
    addEventListener('keyup', e => { this.codes.delete(e.code); });
    addEventListener('blur', () => { this.codes.clear(); this.mouse.left = this.mouse.right = false; });
    addEventListener('mousedown', e => {
      if (this.listenCb && e.button > 0) { e.preventDefault(); const cb = this.listenCb; this.listenCb = null; cb('Mouse' + e.button); return; }
      if (!this.locked) return;
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      else if (e.button === 2) this.mouse.right = true;
      else { const c = 'Mouse' + e.button; if (!this.codes.has(c)) this.pressedCodes.add(c); this.codes.add(c); }
    });
    addEventListener('mouseup', e => {
      if (e.button === 0) this.mouse.left = false;
      else if (e.button === 2) this.mouse.right = false;
      else this.codes.delete('Mouse' + e.button);
    });
    addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mousemove', e => {
      if (!this.locked) return;
      // Ausreißer mancher Browser beim Sperren der Maus ignorieren
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mouse.dx += e.movementX; this.mouse.dy += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      if (was && !this.locked) { this.codes.clear(); this.mouse.left = this.mouse.right = false; this.onUnlock?.(); }
    });
  }

  lock() {
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => this.canvas.requestPointerLock());
    } catch { this.canvas.requestPointerLock(); }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(action) { return this.codes.has(settings.keys[action]); }
  pressed(action) { return this.pressedCodes.has(settings.keys[action]); }
  consumeMouse() { const d = [this.mouse.dx, this.mouse.dy]; this.mouse.dx = this.mouse.dy = 0; return d; }
  endFrame() { this.pressedCodes.clear(); this.mouse.leftPressed = false; }
}
