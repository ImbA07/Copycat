// Zentrale Werte und gespeicherte Einstellungen.

export const SUPABASE = {
  url: 'https://kqftsixylfxahwvdmsra.supabase.co',
  // Öffentlicher Schlüssel: darf im Browser stehen. Die Datenbank erlaubt damit nur die Bestenlisten-Funktionen.
  key: 'sb_publishable_PvDvOtVJpZiJzPaesXQOsg_N4rb2EC1',
};

export const FOV_HORIZONTAL = 105;

export const T = {
  hp: 100,
  walk: 5.2, sprint: 8.2, crouch: 2.6, adsWalk: 3.4,
  accelGround: 70, accelAir: 14, friction: 12,
  gravity: 21, jumpV: 7.6,
  slideV: 11.5, slideTime: 0.85, slideCooldown: 0.5,
  dashV: 17, dashTime: 0.16, dashCharges: 2, dashRecharge: 5,
  stepHeight: 0.5,
  // Sturmgewehr
  magSize: 20, fireInterval: 0.1, reloadTime: 1.9,
  dmgBody: 17, dmgHead: 42,
  // Spritze
  syringeAnim: 0.9, syringeDelay: 0.35, syringeHeal: 50, syringeHealTime: 2.0, syringeStart: 2, syringeMax: 3,
  syringeMoveMul: 0.5,
  flagTime: 90, flagWarn: 80, flagCapture: 5, flagRadius: 3.2,
};

// Punkte
export const SCORE = { win: 1000, headshotKill: 300, fast30: 500, fast60: 200, noDamage: 400, flag: 100 };

export const ACTIONS = [
  ['forward', 'Vorwärts'], ['back', 'Rückwärts'], ['left', 'Links'], ['right', 'Rechts'],
  ['sprint', 'Sprinten'], ['jump', 'Springen'], ['crouch', 'Ducken / Rutschen'], ['dash', 'Dash'],
  ['reload', 'Nachladen'], ['heal', 'Spritze'],
];
export const DEFAULT_KEYS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  sprint: 'ShiftLeft', jump: 'Space', crouch: 'ControlLeft', dash: 'KeyQ',
  reload: 'KeyR', heal: 'KeyE',
};

const DEFAULT_SETTINGS = {
  sens: 1.0, adsSens: 0.75, master: 0.8, music: 0.55, sfx: 0.85, voice: 1.0,
  chStyle: 'crossdot', chColor: '#ffffff', keys: { ...DEFAULT_KEYS },
};

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
export function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* privater Modus */ }
}

export const settings = { ...DEFAULT_SETTINGS, ...load('copycat.settings', {}) };
settings.keys = { ...DEFAULT_KEYS, ...(settings.keys || {}) };
export function saveSettings() { store('copycat.settings', settings); }
export function resetKeys() { settings.keys = { ...DEFAULT_KEYS }; saveSettings(); }

export const profile = load('copycat.profile', {});
export function saveProfile() { store('copycat.profile', profile); }
if (!profile.secret) {
  const a = new Uint8Array(24); crypto.getRandomValues(a);
  profile.secret = [...a].map(b => b.toString(16).padStart(2, '0')).join('');
  saveProfile();
}

export function keyLabel(code) {
  if (!code) return '—';
  const map = { Space: 'Leertaste', ShiftLeft: 'Shift', ShiftRight: 'Shift R', ControlLeft: 'Strg', ControlRight: 'Strg R',
    AltLeft: 'Alt', Mouse3: 'Maus 4', Mouse4: 'Maus 5', Mouse1: 'Mausrad', Tab: 'Tab', CapsLock: 'Feststell' };
  if (map[code]) return map[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}
