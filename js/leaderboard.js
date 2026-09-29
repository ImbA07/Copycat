// Gemeinsame Bestenliste (Supabase). Namen gehören dem Gerät, das sie zuerst benutzt; optional mit PIN.
import { SUPABASE, profile } from './config.js';

async function rpc(fn, body) {
  const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE.key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!r.ok) throw new Error('Bestenliste nicht erreichbar (' + r.status + ')');
  return r.json();
}

export const leaderboard = {
  top10: () => rpc('copycat_top10'),
  checkName: name => rpc('copycat_check_name', { p_name: name, p_secret: profile.secret }),
  submit: (name, s) => rpc('copycat_submit', {
    p_name: name, p_secret: profile.secret, p_score: s.score, p_rounds: s.rounds,
    p_headshots: s.headshots, p_accuracy: +s.accuracy.toFixed(4), p_hs_rate: +s.hsRate.toFixed(4),
  }),
  setPin: (name, pin) => rpc('copycat_set_pin', { p_name: name, p_secret: profile.secret, p_pin: pin }),
  claim: (name, pin) => rpc('copycat_claim', { p_name: name, p_pin: pin, p_new_secret: profile.secret }),
};
