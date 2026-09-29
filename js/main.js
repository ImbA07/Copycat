// COPYCAT – Hauptprogramm: Spielablauf, Kamera, Treffer, Runden, Killcam, Tutorial, Menü.
import * as THREE from 'three';
import { settings, profile, saveProfile, T, SCORE, FOV_HORIZONTAL } from './config.js';
import { Input } from './input.js';
import { ComicRenderer, LAYER_FX, shadows } from './toon.js';
import { buildArena, buildArenaAsync, THEMES, THEME_NAMES } from './arena.js';
import { buildMango, buildCopycat, buildViewmodel } from './characters.js';
import { loadAssets } from './assets.js';
import { Actor, RECOIL } from './actor.js';
import { CopycatBrain } from './bot.js';
import { Effects } from './effects.js';
import { audio } from './audio.js';
import { Dialog } from './dialog.js';
import { UI } from './ui.js';
import { leaderboard } from './leaderboard.js';
import { raySphere, rayCylinder } from './world.js';

const DEG = Math.PI / 180;
const vfov = (h, aspect) => 2 * Math.atan(Math.tan(h * DEG / 2) / aspect) / DEG;
const POW_WORDS = ['POW!', 'BÄM!', 'ZACK!', 'KLONK!', 'WUMMS!', 'PENG!'];

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new ComicRenderer(this.canvas);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 600);
    this.scene.add(this.camera);
    const hemi = new THREE.HemisphereLight('#cfe8ff', '#b59f7a', 0.85); this.scene.add(hemi);
    const sun = this.sun = new THREE.DirectionalLight('#fff0d6', 2.3); sun.position.set(28, 42, 18);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
    Object.assign(sun.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 5, far: 140 });
    this.scene.add(sun, sun.target);
    this.scene.fog = new THREE.Fog('#bfe0f7', 90, 380);
    this.input = new Input(this.canvas);
    this.ui = new UI(this.input);
    this.effects = new Effects(this.scene, this.camera, this.ui.el.float);
    this.dialog = new Dialog(this.ui.el.subs, this.ui.el.float);

    this.mango = buildMango(); this.copycat = buildCopycat();
    for (const rig of [this.mango, this.copycat]) rig.onMagDrop = obj => this.effects.dropMag(obj);
    this.scene.add(this.mango.root, this.copycat.root);
    shadows(this.mango.root, true, false); shadows(this.copycat.root, true, false);
    this.player = new Actor(this.mango, 'mango');
    this.bot = new Actor(this.copycat, 'copycat');
    this.viewmodel = buildViewmodel(); this.viewmodel.visible = false; this.camera.add(this.viewmodel);

    this.mode = 'menu'; this.state = 'menu';
    this.round = 0; this.score = 0; this.roundTime = 0; this.timeScale = 1;
    this.flag = { active: false, progress: { player: 0, bot: 0 }, owner: null, spawnT: 0, rise: 0 };
    this.adsT = 0; this.recoilAcc = { p: 0, y: 0 }; this.camShakeT = 0;
    this.lastTheme = null; this.arena = null;
    this.killcam = { buf: [], tracers: [], playing: false };
    this.stats = this.freshStats();
    this.targets = []; this.tutFlags = {}; this.lossReason = null;

    this.ui.onAction((a, el) => this.action(a, el));
    this.input.onUnlock = () => { if (this.wantLock && (this.state === 'playing' || this.state === 'countdown')) this.pause(); };
    addEventListener('keydown', e => this.globalKey(e));
    addEventListener('beforeunload', e => { if (this.state === 'playing' || this.state === 'countdown') { e.preventDefault(); e.returnValue = ''; } });
    addEventListener('blur', () => { if (this.state === 'playing') this.pause(); });
    addEventListener('mousemove', e => { this.mouseNX = e.clientX / innerWidth * 2 - 1; this.mouseNY = e.clientY / innerHeight * 2 - 1; });
    this.mouseNX = 0; this.mouseNY = 0;

    this.enterMenu();
    document.getElementById('loading').classList.add('hidden');
    this.last = performance.now();
    requestAnimationFrame(t => this.loop(t));
  }

  freshStats() { return { shots: 0, hits: 0, headshots: 0, kills: 0, hsKills: 0, flagWins: 0, dmgDealt: 0, dmgTaken: 0, time: 0 }; }

  // ======================= Menü =======================
  enterMenu() {
    this.state = 'menu'; this.mode = 'menu';
    this.ui.hud(false); this.ui.show('screen-start');
    this.wantLock = false; this.input.enabled = false; this.input.unlock();
    if (!this.menuArena) { this.menuArena = buildArena('vorstadt', 4242); this.menuArena.keep = true; }
    this.setArena(this.menuArena);
    this.prepareArena();
    this.player.reset(); this.bot.reset();
    this.player.pos = { x: 0.2, y: 0, z: -3 }; this.player.yaw = -0.15;
    this.bot.pos = { x: 2.0, y: 0, z: -3 }; this.bot.yaw = -0.45;
    this.mango.root.visible = true; this.copycat.root.visible = true; this.viewmodel.visible = false;
    this.effects.clear(); this.dialog.reset();
    audio.setMode('menu');
    this.refreshStartBest();
  }
  async refreshStartBest() { try { this.ui.startBest(await leaderboard.top10()); } catch { this.ui.startBest(null); } }
  updateMenu(dt) {
    const t = performance.now() / 1000;
    this.camera.position.set(-0.4, 1.75, 2.2);
    this.camera.lookAt(-0.2, 1.95, -3); this.setFov(80);
    this.player.syncRig(dt, { speed: 0, fwd: 0, side: 0, grounded: true, crouch: 0, slide: false, pitch: 0.05 + Math.sin(t) * 0.03, reload: -1, syringe: -1, taunt: null, dead: 0 });
    this.mango.bones.Neck.rotateY(Math.sin(t * 0.7) * 0.25);
    // Copycat äfft die Maus nach
    this.bot.syncRig(dt, { speed: 0, fwd: 0, side: 0, grounded: true, crouch: 0, slide: false, pitch: -this.mouseNY * 0.5, reload: -1, syringe: -1, taunt: null, dead: 0 });
    const cc = this.copycat;
    cc.bones.Neck.rotateY(-this.mouseNX * 0.7); cc.bones.Neck.rotateX(this.mouseNY * 0.4);
    cc.body.rotation.z = -this.mouseNX * 0.12;
    cc.root.rotation.y = -0.45 - this.mouseNX * 0.35;
  }

  // ======================= Arena =======================
  loadArena(theme, seed) { this.setArena(buildArena(theme, seed)); }
  setArena(a) {
    if (this.arena === a) return;
    if (this.arena) { this.scene.remove(this.arena.group); if (!this.arena.keep) this.arena.dispose(); }
    this.arena = a;
    shadows(this.arena.group);
    this.scene.add(this.arena.group);
    this.effects?.clearDecals();
  }

  // ======================= Lauf / Runden =======================
  startRun(tutorial = false) {
    audio.init(); this.dialog.preload();
    if (!tutorial && !profile.tutorialDone) { this.startTutorial(true); return; }
    this.mode = tutorial ? 'tutorial' : 'run';
    this.round = 0; this.score = 0; this.stats = this.freshStats();
    this.player.syringes = T.syringeStart; this.bot.syringes = T.syringeStart;
    this.noDmgStreak = 0; this.winStreak = 0; this.lossReason = null; this.tutFlags = {};
    this.brain = new CopycatBrain(this);
    this.nextRound();
  }
  // Nächste Karte schon im Hintergrund bauen (z. B. während der Zwischenbildschirm läuft)
  prepareArena() {
    if (this.arenaJob) return;
    let theme; do { theme = THEMES[(Math.random() * THEMES.length) | 0]; } while (theme === this.lastTheme);
    this.lastTheme = theme;
    const job = this.arenaJob = { theme, ready: null };
    const seed = (Math.random() * 1e9) | 0;
    job.promise = buildArenaAsync(theme, seed).then(a => (job.ready = a), e => { console.error(e); return (job.ready = buildArena(theme, seed)); });
  }
  nextRound() {
    this.prepareArena();
    const job = this.arenaJob;
    if (!job.ready) {
      if (this.state !== 'loading') { this.loadingFrom = this.state; this.state = 'loading'; this.ui.hideScreens(); this.ui.center('KARTE WIRD GEBAUT…', '', 30); }
      job.promise.then(() => { if (this.state === 'loading') this.nextRound(); });
      return;
    }
    this.arenaJob = null;
    this.round++;
    const theme = job.theme;
    this.setArena(job.ready);
    this.effects.clear(); this.dialog.reset();
    const P = this.player, B = this.bot, sp = this.arena.spawns;
    const keepP = P.syringes, keepB = B.syringes;
    P.reset(); B.reset(); P.syringes = keepP; B.syringes = keepB;
    P.pos = { x: sp.player.x, y: 0, z: sp.player.z }; P.yaw = sp.player.yaw; P.pitch = 0;
    B.pos = { x: sp.bot.x, y: 0, z: sp.bot.z }; B.yaw = sp.bot.yaw; B.pitch = 0;
    this.mango.root.visible = true; this.copycat.root.visible = true;
    this.brain.model.setRound(this.round); this.brain.resetRound();
    this.flag = { active: false, progress: { player: 0, bot: 0 }, owner: null, spawnT: 0, rise: 0, warned: false };
    this.arena.flag.group.visible = false;
    this.roundTime = 0; this.countdown = 3; this.state = 'countdown';
    this.recoilAcc = { p: 0, y: 0 }; this.timeScale = 1; this.sprintOn = false;
    this.killcam = { buf: [], tracers: [], playing: false }; this.kcAcc = 0;
    this.ui.hideScreens(); this.ui.hud(true); this.ui.hideTutorial();
    this.ui.center(`RUNDE ${this.round}`, THEME_NAMES[theme], 1.6);
    audio.setMode('game'); audio.tension = 0.15;
    this.lockGame();
    this.lastBeep = 4;
    setTimeout(() => { if (this.state === 'countdown' || this.state === 'playing') this.dialog.say('round_start', { chance: this.round === 1 ? 1 : 0.35 }); }, 1800);
  }
  lockGame() {
    this.wantLock = true; this.input.enabled = true;
    this.input.lock();
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(() => navigator.keyboard?.lock?.()).catch(() => {});
      } else navigator.keyboard?.lock?.();
    } catch { /* egal */ }
    setTimeout(() => { if (this.wantLock && !this.input.locked && (this.state === 'playing' || this.state === 'countdown')) this.pause(); }, 700);
  }
  pause() {
    if (this.state !== 'playing' && this.state !== 'countdown') return;
    this.pausedFrom = this.state; this.state = 'paused';
    this.input.unlock(); this.ui.show('screen-pause');
  }
  resume() {
    this.ui.hideScreens(); this.state = this.pausedFrom || 'playing'; this.lockGame();
  }

  mood() {
    const p = this.player;
    if (p.hp < 35 || p.damageTaken - p.damageDealt > 40) return 'desp';
    if ((p.hp > 60 && p.damageDealt >= p.damageTaken) || (this.winStreak >= 3 && p.hp > 40)) return 'conf';
    return 'neutral';
  }

  // ======================= Spieler-Steuerung =======================
  playerCmd(dt, frozen) {
    const inp = this.input, P = this.player;
    const [dx, dy] = inp.consumeMouse();
    const ads = inp.mouse.right && P.alive;
    const s = 0.0022 * settings.sens * (ads ? settings.adsSens * 0.75 : 1);
    P.yaw -= dx * s; P.pitch = Math.max(-1.45, Math.min(1.45, P.pitch - dy * s));
    this.tutLook = (this.tutLook || 0) + Math.abs(dx) + Math.abs(dy);
    // Rückstoß erholt sich, wenn man nicht schießt
    if (P.sinceShot > 0.12) {
      const rp = Math.min(this.recoilAcc.p, dt * 6 * DEG * 10), ry = Math.sign(this.recoilAcc.y) * Math.min(Math.abs(this.recoilAcc.y), dt * 4 * DEG * 10);
      P.pitch -= rp; this.recoilAcc.p -= rp; P.yaw -= ry; this.recoilAcc.y -= ry;
    }
    if (frozen) return { ads };
    // Sprint = Schalter: an/aus per Taste, aus bei Stehenbleiben, Schießen, Zielen, Ducken, Spritze
    if (inp.pressed('sprint')) { this.sprintOn = !this.sprintOn; this.noFwdT = 0; }
    this.noFwdT = inp.down('forward') ? 0 : (this.noFwdT || 0) + dt;
    if (this.noFwdT > 0.6 || inp.mouse.left || ads || P.healing) this.sprintOn = false;
    return {
      fwd: (inp.down('forward') ? 1 : 0) - (inp.down('back') ? 1 : 0),
      side: (inp.down('right') ? 1 : 0) - (inp.down('left') ? 1 : 0),
      sprint: this.sprintOn, jump: inp.pressed('jump'),
      crouch: inp.down('crouch'), crouchPressed: inp.pressed('crouch'), dash: inp.pressed('dash'),
      fire: inp.mouse.left, firePressed: inp.mouse.leftPressed, reload: inp.pressed('reload'), heal: inp.pressed('heal'), ads,
    };
  }

  // ======================= Schüsse =======================
  shoot(ev) {
    const A = ev.actor, isP = A === this.player, other = isP ? this.bot : this.player;
    const world = this.arena.world;
    let origin, dir;
    const spread = ev.spread * DEG * (isP ? 1 : 1.7 + ev.index * 0.06);
    const jitter = (fwd) => {
      if (spread <= 0) return fwd;
      const up = Math.abs(fwd.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const r = new THREE.Vector3().crossVectors(fwd, up).normalize(), u = new THREE.Vector3().crossVectors(r, fwd).normalize();
      const a = Math.random() * Math.PI * 2, m = Math.sqrt(Math.random()) * Math.tan(spread);
      return fwd.clone().addScaledVector(r, Math.cos(a) * m).addScaledVector(u, Math.sin(a) * m).normalize();
    };
    if (isP) {
      const camFwd = new THREE.Vector3(); this.camera.getWorldDirection(camFwd);
      const camPos = this.camera.position.clone();
      const d = jitter(camFwd);
      if (this.adsT > 0.5) { origin = camPos; dir = d; }
      else {
        // Ziel: was das Fadenkreuz trifft (hinter dem Spieler beginnen)
        const skip = camPos.distanceTo(new THREE.Vector3(A.pos.x, A.eyeY, A.pos.z)) + 0.3;
        const o2 = camPos.clone().addScaledVector(d, skip);
        const h = this.traceShot(o2, d, other, 200);
        const aimPt = h ? h.point : o2.clone().addScaledVector(d, 200);
        origin = new THREE.Vector3(A.pos.x, A.eyeY - 0.05, A.pos.z);
        dir = new THREE.Vector3(aimPt.x - origin.x, aimPt.y - origin.y, aimPt.z - origin.z).normalize();
      }
      // Rückstoßmuster
      const [rp, ry] = RECOIL[ev.index];
      const k = this.adsT > 0.5 ? 0.85 : 1;
      A.pitch += rp * DEG * k; A.yaw -= ry * DEG * k; this.recoilAcc.p += rp * DEG * k; this.recoilAcc.y -= ry * DEG * k;
      this.camKick = 1;
      audio.play('shot', null, 0.7);
      this.stats.shots++;
      this.brain?.hear(A.pos, 60);
    } else {
      origin = new THREE.Vector3(A.pos.x, A.eyeY - 0.05, A.pos.z);
      const f = A.forward(); dir = jitter(new THREE.Vector3(f.x, f.y, f.z));
      audio.play('shot', { x: A.pos.x, y: A.eyeY, z: A.pos.z }, 0.9);
    }
    const hit = this.traceShot(origin, dir, other, 200);
    const end = hit ? hit.point : origin.clone().addScaledVector(dir, 120);
    const muzzle = new THREE.Vector3();
    if (isP && this.adsT > 0.5) muzzle.copy(this.camera.position).addScaledVector(dir, 0.8).add(new THREE.Vector3(0, -0.05, 0));
    else A.rig.rifle.muzzle.getWorldPosition(muzzle);
    this.effects.tracer(muzzle, end, isP ? 'player' : 'bot');
    if (!(isP && this.adsT > 0.5)) this.effects.muzzle(muzzle, dir, 1);
    else this.effects.flashLight(muzzle, '#ffc070', 3, 0.05);
    { const rt = new THREE.Vector3(-Math.cos(A.yaw), 0, Math.sin(A.yaw)); const sp = new THREE.Vector3(A.pos.x, A.eyeY - 0.35, A.pos.z).addScaledVector(rt, 0.15); if (!(isP && this.adsT > 0.5)) this.effects.shell(sp, rt); }
    this.killcam.tracers.push({ t: this.roundTime, from: muzzle.clone(), to: new THREE.Vector3(end.x, end.y, end.z), who: isP ? 'player' : 'bot' });
    const dist = Math.hypot(other.pos.x - A.pos.x, other.pos.z - A.pos.z);
    if (hit && hit.actor) {
      const head = hit.part === 'head';
      const dmg = this.hitActor(hit.actor, head ? T.dmgHead : T.dmgBody, head, A, hit.point);
      if (isP) { this.stats.hits++; if (head) this.stats.headshots++; this.brain?.model.onShot(dist, true, head); }
    } else {
      if (isP) this.brain?.model.onShot(dist, false, false);
      if (hit) {
        this.effects.impact(hit.point, hit.normal, hit.collider ? '#d8d0c0' : '#bdb59f');
        audio.play('impact', hit.point, 0.5);
        if (hit.collider?.destructible) this.damageCollider(hit.collider, isP ? T.dmgBody : T.dmgBody * 0.7, isP ? 'player' : 'bot');
      }
    }
  }
  traceShot(o, d, target, maxT) {
    const w = this.arena.world.raycast(o, d, maxT);
    let best = w ? { t: w.t, point: new THREE.Vector3(w.point.x, w.point.y, w.point.z), normal: w.normal, collider: w.collider } : null;
    if (target && target.alive) {
      const hb = target.rig.hitboxes(target.pos, target.crouch);
      const th = raySphere(o, d, hb.head, hb.head.r);
      const tb = rayCylinder(o, d, hb.body.x, hb.body.z, hb.body.r, hb.body.y0, hb.body.y1);
      let t = -1, part = null;
      if (th >= 0 && (tb < 0 || th <= tb + 0.15)) { t = th; part = 'head'; } else if (tb >= 0) { t = tb; part = 'body'; }
      if (t >= 0 && (!best || t < best.t)) best = { t, point: new THREE.Vector3(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t), actor: target, part };
    }
    return best;
  }
  hitActor(target, dmg, head, from, point) {
    const ev = [];
    const done = target.damage(dmg, { head, from }, ev);
    from.damageDealt += done;
    target.rig.flash();
    if (target === this.bot) {
      this.stats.dmgDealt += done;
      const kill = !target.alive;
      this.ui.hitmarker(kill ? 'kill' : head ? 'head' : 'body');
      audio.play(head ? 'headshot' : 'hit', null, 0.9);
      this.effects.damageNumber(point, done, head); this.effects.hitSplat(point, head);
      if (head) { this.effects.pow(point, POW_WORDS[(Math.random() * POW_WORDS.length) | 0]); }
      if (!kill) {
        this.dialog.say('hurt', { chance: 0.15, cooldown: 20 });
      }
      this.brain && (this.brain.lastSeen = { ...from.pos }, this.brain.lastSeenTime = this.roundTime);
    } else {
      this.stats.dmgTaken += done;
      this.ui.hurt(done); audio.play('hurt', null, 0.8); this.effects.hitSplat(point, head, ['#ff8a1f', '#ffd83a', '#ff4f4f']);
      this.effects.shake = Math.max(this.effects.shake, 0.25);
      if (target.alive) {
        this.dialog.say('hit_player', { chance: 0.12, cooldown: 22 });
      }
    }
    this.handleEvents(ev);
    return done;
  }
  damageCollider(c, dmg, src = null) {
    if (!c.alive) return;
    c.hp -= dmg;
    if (c.hp > 0) return;
    this.arena.world.remove(c);
    if (c.mesh) c.mesh.parent?.remove(c.mesh);
    const center = { x: (c.min.x + c.max.x) / 2, y: 0, z: (c.min.z + c.max.z) / 2 };
    if (c.explosive) {
      audio.play('explosion', center, 1.2); this.effects.explosion(center); this.effects.pow({ ...center, y: 1.5 }, 'BUMM!');
      const ev = [];
      for (const A of [this.player, this.bot]) {
        if (!A.alive) continue;
        const d = Math.hypot(A.pos.x - center.x, A.pos.z - center.z, (A.pos.y + 1) - 0.6);
        if (d < 5.5 && this.arena.world.lineOfSight({ x: center.x, y: 0.8, z: center.z }, { x: A.pos.x, y: A.pos.y + 1, z: A.pos.z })) {
          const amount = Math.round(80 * (1 - d / 5.5));
          if (amount > 0) {
            const before = A.hp; A.damage(amount, { explosion: true }, ev);
            if (A === this.player) { this.ui.hurt(amount); this.stats.dmgTaken += before - A.hp; this.bot.damageDealt += before - A.hp; }
            else { this.stats.dmgDealt += before - A.hp; this.player.damageDealt += before - A.hp; this.effects.damageNumber({ x: A.pos.x, y: A.pos.y + 2, z: A.pos.z }, before - A.hp, false); if (src === 'player' && this.brain) this.brain.model.barrelTrick++; }
            A.vel.x += (A.pos.x - center.x) / Math.max(d, 0.5) * 6; A.vel.z += (A.pos.z - center.z) / Math.max(d, 0.5) * 6; A.vel.y = 5; A.onGround = false;
          }
        }
      }
      for (const o of this.arena.world.colliders) {
        if (o.alive && o.destructible && o !== c) {
          const d = Math.hypot((o.min.x + o.max.x) / 2 - center.x, (o.min.z + o.max.z) / 2 - center.z);
          if (d < 5) setTimeout(() => this.arena && this.damageCollider(o, o.explosive ? 99 : 80 * (1 - d / 5), src), 150);
        }
      }
      this.handleEvents(ev);
    } else {
      audio.play('crack', center, 0.9);
      this.effects.breakApart(c, c.kind === 'crate' ? '#d69a57' : '#ffffff');
    }
  }

  // ======================= Ereignisse =======================
  handleEvents(evs) {
    for (const ev of evs) {
      const A = ev.actor, isP = A === this.player;
      const pos = { x: A.pos.x, y: A.pos.y + 0.2, z: A.pos.z };
      switch (ev.type) {
        case 'fire': this.shoot(ev); break;
        case 'empty': if (isP) audio.play('empty'); break;
        case 'reload': audio.play('reload', isP ? null : pos, 0.8); if (isP) { this.brain?.model.onReload(ev.ammoLeft); this.brain?.hear(A.pos, 16); this.botNotices(A) && this.brain.noticeWindow('reload', T.reloadTime); this.tutFlags.reload = true; } break;
        case 'heal': audio.play('syringe', isP ? null : pos); if (isP) { this.brain?.model.onHeal(ev.hp); this.brain?.hear(A.pos, 16); this.botNotices(A) && this.brain.noticeWindow('heal', T.syringeAnim + 0.6); this.tutFlags.heal = true; } break;
        case 'stab': audio.play('click', isP ? null : pos, 0.6); break;
        case 'healtick': if (isP) audio.play('heal', null, 0.5); this.effects.healSparkles(A.pos); break;
        case 'jump': audio.play('jump', isP ? null : pos, 0.6); if (isP) { this.brain?.model.onTrick('jump'); this.tutFlags.jump = true; } break;
        case 'slide': audio.play('slide', isP ? null : pos); this.effects.dust(A.pos, 6, 0.35); if (isP) { this.brain?.model.onTrick('slide'); this.tutFlags.slide = true; } break;
        case 'dash': audio.play('dash', isP ? null : pos); this.effects.dashTrail(A.pos, A.dashDir, isP ? '#ffb040' : '#ff7ad0'); if (isP) { this.brain?.model.onTrick('dash'); this.tutFlags.dash = true; } break;
        case 'land': audio.play('land', isP ? null : pos, Math.min(1, ev.fall / 10)); A.rig.land(Math.min(1, ev.fall / 12)); if (ev.fall > 6) this.effects.dust(A.pos, 4, 0.3); break;
        case 'step':
          if (isP) { if (ev.loud) this.brain?.hear(A.pos, 14); audio.play('step', null, 0.25); }
          else audio.play('step', pos, ev.loud ? 1.1 : 0.7);
          break;
        case 'death': this.onDeath(A, ev.info); break;
      }
    }
  }

  onDeath(A, info) {
    if (this.state !== 'playing' || this.mode === 'tutorial') return;
    const isP = A === this.player;
    this.state = 'roundEnd'; this.roundEndT = 0; this.timeScale = 0.35;
    if (!isP) {
      this.stats.kills++; if (info?.head) this.stats.hsKills++;
      this.finishRound('kill', !!info?.head);
    } else {
      audio.play('lose');
      setTimeout(() => this.dialog.say('win', { force: true }), 700);
      if (this.bot.alive) this.bot.taunt = { type: 'dance', t: 0, dur: 99 };
      this.lossReason = 'kill';
    }
  }

  // Bekommt Copycat mit, was Mango gerade macht? (sieht ihn oder hört es in der Nähe)
  botNotices(A) {
    if (!this.brain || this.mode !== 'run') return false;
    const B = this.bot, d = Math.hypot(A.pos.x - B.pos.x, A.pos.z - B.pos.z);
    return this.brain.seenT > 0 || d < 16;
  }
  onBotTaunt(type) {
    const b = this.bot.pos;
    audio.play('kazoo', { x: b.x, y: b.y + 2, z: b.z }, 1.2);
    this.dialog.say('taunt', { chance: 0.5, cooldown: 18 });
  }

  finishRound(how, head) {
    const P = this.player, t = this.roundTime;
    const pts = [['Runde gewonnen', SCORE.win]];
    if (how === 'kill' && head) pts.push(['Kopfschuss-Finish', SCORE.headshotKill]);
    if (t < 30) pts.push(['Blitzsieg (< 30 s)', SCORE.fast30]); else if (t < 60) pts.push(['Schnell (< 60 s)', SCORE.fast60]);
    if (P.damageTaken === 0) pts.push(['Ohne Schaden', SCORE.noDamage]);
    if (how === 'flag') { pts.push(['Flagge erobert', SCORE.flag]); this.stats.flagWins++; }
    const sum = pts.reduce((a, b) => a + b[1], 0);
    this.score += sum; this.winStreak++;
    this.noDmgStreak = P.damageTaken === 0 ? this.noDmgStreak + 1 : 0;
    let bonusSyr = false;
    if (this.noDmgStreak >= 3) { this.noDmgStreak = 0; if (P.syringes < T.syringeMax) { P.syringes++; bonusSyr = true; } }
    if (this.round % 3 === 0 && this.bot.syringes < T.syringeMax) this.bot.syringes++;
    this.pendingIntermission = { pts, sum, bonusSyr, how };
    this.brain.model.onRoundEnd(this.flag.active);
    audio.play('win');
    this.ui.center(how === 'flag' ? 'FLAGGE!' : 'GEWONNEN!', `+${sum.toLocaleString('de-DE')}`, 2);
    setTimeout(() => this.dialog.say('lose', { chance: 0.45 }), 500);
  }

  showIntermission() {
    const d = this.pendingIntermission;
    this.state = 'intermission'; this.wantLock = false; this.input.unlock();
    const ins = this.brain.model.insights();
    const lines = [];
    const txt = key => this.dialog.text(key);
    // Gesprochen wird die Erkenntnis, die am längsten nicht dran war (sonst ein allgemeiner Spruch)
    this.spokenIns = this.spokenIns || {};
    let speak = 'learn_nothing';
    if (ins.length) {
      for (const i of ins.slice(0, 3)) lines.push(txt(i.key));
      const cand = ins.slice(0, 4).sort((a, b) => (this.spokenIns[a.key] || 0) - (this.spokenIns[b.key] || 0))[0];
      speak = (this.spokenIns[cand.key] || 0) > this.round - 3 && Math.random() < 0.6 ? 'inter_generic' : cand.key;
      if (speak !== 'inter_generic') this.spokenIns[cand.key] = this.round;
    } else lines.push(txt('learn_nothing'));
    if (Math.random() < 0.8 || this.round <= 2) this.dialog.say(speak, { force: true });
    const pts = d.pts.map(([l, v]) => [l, v.toLocaleString('de-DE')]);
    if (d.bonusSyr) pts.push(['💉 3× ohne Schaden: Extra-Spritze!', '']);
    this.ui.intermission({ title: d.how === 'flag' ? `RUNDE ${this.round}: FLAGGE EROBERT!` : `RUNDE ${this.round} GEWONNEN!`, points: pts, total: this.score, lines, dossier: this.brain.model.dossier() });
    audio.setMode('calm');
    this.prepareArena();
  }

  gameOver() {
    this.prepareArena();
    this.state = 'over'; this.wantLock = false; this.input.enabled = false; this.input.unlock();
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch { /* egal */ }
    audio.setMode('calm');
    const s = this.stats, acc = s.shots ? s.hits / s.shots : 0, hs = s.hits ? s.headshots / s.hits : 0;
    this.final = { score: this.score, rounds: this.round - 1, headshots: s.headshots, accuracy: acc, hsRate: hs };
    this.ui.gameOver({
      score: this.score, name: profile.name,
      stats: [['Runden gewonnen', this.round - 1], ['Trefferquote', Math.round(acc * 100) + ' %'], ['Kopfschuss-Quote', Math.round(hs * 100) + ' %'],
        ['Kopfschüsse', s.headshots], ['Flaggen erobert', s.flagWins], ['Schaden verteilt', Math.round(s.dmgDealt)], ['Schaden kassiert', Math.round(s.dmgTaken)],
        ['Verloren durch', this.lossReason === 'flag' ? 'Copycat hat die Flagge' : 'Copycat'], ['Beste Stelle', `Runde ${this.round}`]],
      dossier: this.brain.model.dossier(),
    });
  }

  // ======================= Killcam =======================
  recordKillcam(dt) {
    this.kcAcc += dt;
    if (this.kcAcc < 1 / 30) return; this.kcAcc = 0;
    const snap = A => ({ pos: { ...A.pos }, yaw: A.yaw, st: A.animState() });
    this.killcam.buf.push({ t: this.roundTime, p: snap(this.player), b: snap(this.bot) });
    while (this.killcam.buf.length && this.killcam.buf[0].t < this.roundTime - 5) this.killcam.buf.shift();
    while (this.killcam.tracers.length && this.killcam.tracers[0].t < this.roundTime - 5) this.killcam.tracers.shift();
  }
  startKillcam() {
    const kc = this.killcam;
    if (kc.buf.length < 10) { this.gameOver(); return; }
    kc.playing = true; kc.t = Math.max(kc.buf[0].t, kc.buf[kc.buf.length - 1].t - 3.5); kc.end = kc.buf[kc.buf.length - 1].t + 0.6; kc.ti = 0;
    kc.firedTracers = new Set();
    this.state = 'killcam'; this.timeScale = 1;
    this.ui.el.killcam.classList.remove('hidden'); this.ui.el.hud.classList.add('kc');
    this.effects.clear();
    this.mango.root.visible = true; this.viewmodel.visible = false;
  }
  updateKillcam(dt) {
    const kc = this.killcam; kc.t += dt * 0.55;
    const buf = kc.buf;
    let i = 0; while (i < buf.length - 1 && buf[i + 1].t < kc.t) i++;
    const s = buf[Math.min(i, buf.length - 1)];
    const apply = (rig, sn) => { rig.root.position.set(sn.pos.x, sn.pos.y, sn.pos.z); rig.root.rotation.y = sn.yaw; rig.animate(sn.st, dt * 0.55); };
    apply(this.mango, s.p); apply(this.copycat, s.b);
    for (const tr of kc.tracers) if (tr.t <= kc.t && !kc.firedTracers.has(tr)) { kc.firedTracers.add(tr); this.effects.tracer(tr.from, tr.to, tr.who); if (tr.who === 'bot') audio.play('shot', null, 0.5); }
    // Kamera: über Copycats Schulter auf Mango
    const b = s.b.pos, p = s.p.pos;
    const dx = p.x - b.x, dz = p.z - b.z, l = Math.hypot(dx, dz) || 1;
    const cam = new THREE.Vector3(b.x - dx / l * 3.4 - dz / l * 1.6, b.y + 3.1, b.z - dz / l * 3.4 + dx / l * 1.6);
    this.camera.position.lerp(cam, 0.2);
    this.camera.lookAt(p.x, p.y + 1.3, p.z);
    this.setFov(FOV_HORIZONTAL * 0.8);
    if (kc.t >= kc.end) this.endKillcam();
  }
  endKillcam() { if (!this.killcam.playing) return; this.killcam.playing = false; this.ui.el.killcam.classList.add('hidden'); this.ui.el.hud.classList.remove('kc'); this.gameOver(); }

  // ======================= Tutorial =======================
  startTutorial(thenPlay = false) {
    audio.init(); this.dialog.preload();
    this.mode = 'tutorial'; this.tutThenPlay = thenPlay;
    this.loadArena('vorstadt', 777);
    this.effects.clear(); this.dialog.reset();
    const P = this.player; P.reset(); P.syringes = 9; P.pos = { x: 0, y: 0, z: -17 }; P.yaw = 0; P.pitch = 0;
    this.bot.reset(); this.bot.alive = false; this.copycat.root.visible = false; this.bot.pos = { x: 0, y: -50, z: 0 };
    this.brain = null; this.round = 0; this.score = 0;
    this.flag = { active: false, progress: { player: 0, bot: 0 }, owner: null };
    // Pappfiguren
    for (const t of this.targets) this.scene.remove(t.rig.root);
    this.targets = [];
    for (const [x, z] of [[-4, -6], [3, -2], [0, 6]]) {
      const rig = buildCopycat(); rig.root.position.set(x, 0, z); rig.root.rotation.y = Math.PI;
      rig.animate({ speed: 0, fwd: 0, side: 0, grounded: true, crouch: 0, slide: false, pitch: 0, reload: -1, syringe: -1, taunt: null, dead: 0 }, 0.016);
      this.scene.add(rig.root); this.targets.push({ rig, pos: { x, y: 0, z }, down: 0, alive: true, crouch: 0 });
    }
    this.tutFlags = {}; this.tutLook = 0; this.tutWalk = 0; this.tutSprint = 0; this.tutAds = 0; this.tutStep = 0; this.tutDoneT = 0;
    const kl = a => `[${({ ShiftLeft: 'Shift', ControlLeft: 'Strg', Space: 'Leertaste' })[settings.keys[a]] || settings.keys[a].replace('Key', '')}]`;
    this.tutSteps = [
      { text: () => 'Schau dich mit der Maus um', ok: () => this.tutLook > 900 },
      { text: () => `Laufe mit ${kl('forward')}${kl('left')}${kl('back')}${kl('right')}`, ok: () => this.tutWalk > 6 },
      { text: () => `Sprinte ${kl('sprint')} und springe ${kl('jump')}`, ok: () => this.tutSprint > 1 && this.tutFlags.jump },
      { text: () => `Rutschen: beim Sprinten ${kl('crouch')} drücken`, ok: () => this.tutFlags.slide },
      { text: () => `Dash ${kl('dash')} (2 Ladungen, je 5 s)`, ok: () => this.tutFlags.dash },
      { text: () => 'Rechtsklick halten: Kimme & Korn', ok: () => this.tutAds > 0.6 },
      { text: () => `Schieß die 3 Pappfiguren um (${this.targets.filter(t => !t.alive).length}/3)`, ok: () => this.targets.every(t => !t.alive) },
      { text: () => `Nachladen ${kl('reload')}`, ok: () => this.tutFlags.reload },
      { text: () => `Spritze ${kl('heal')} – heilt schrittweise`, ok: () => this.tutFlags.heal },
    ];
    this.tutFlags = {};
    this.state = 'countdown'; this.countdown = 0.01; this.roundTime = 0;
    this.ui.hideScreens(); this.ui.hud(true);
    this.ui.center('MINI-TUTORIAL', 'In 1 Minute bereit für Copycat', 2);
    audio.setMode('calm');
    this.lockGame();
  }
  updateTutorial(dt) {
    const P = this.player;
    this.tutWalk += P.speed * dt * (P.onGround ? 1 : 0);
    if (P.sprinting) this.tutSprint += dt;
    if (P.ads) this.tutAds += dt;
    if (this.tutStep === 8 && P.hp >= 100 && !P.healing) P.hp = 60;
    while (this.tutStep < this.tutSteps.length && this.tutSteps[this.tutStep].ok()) { this.tutStep++; audio.play('tick'); if (this.tutStep === 8) P.hp = 60; }
    this.ui.tutorial(this.tutSteps, this.tutStep);
    for (const t of this.targets) if (!t.alive && t.down < 1) { t.down = Math.min(1, t.down + dt * 3); t.rig.root.rotation.x = -t.down * 1.5; }
    if (this.tutStep >= this.tutSteps.length) {
      this.tutDoneT += dt;
      if (this.tutDoneT === dt) { this.ui.center('BEREIT!', this.tutThenPlay ? 'Jetzt gegen Copycat …' : 'Du kannst es.', 2.5); audio.play('win'); this.dialog.say('tutorial', { force: true }); profile.tutorialDone = true; saveProfile(); }
      if (this.tutDoneT > 3) this.endTutorial();
    }
  }
  endTutorial() {
    for (const t of this.targets) this.scene.remove(t.rig.root);
    this.targets = []; this.ui.hideTutorial(); this.copycat.root.visible = true;
    if (this.tutThenPlay && profile.tutorialDone) this.startRun();
    else this.enterMenu();
  }
  // Treffer auf Pappfiguren im Tutorial
  tutorialShot(ev) {
    const cam = new THREE.Vector3(); this.camera.getWorldDirection(cam);
    const o = this.camera.position;
    for (const t of this.targets) {
      if (!t.alive) continue;
      const hb = t.rig.hitboxes(t.pos, 0);
      const th = raySphere(o, cam, hb.head, hb.head.r * 1.3), tb = rayCylinder(o, cam, hb.body.x, hb.body.z, hb.body.r * 1.3, hb.body.y0, hb.body.y1);
      if (th >= 0 || tb >= 0) {
        const w = this.arena.world.raycast(o, cam, Math.max(th, tb));
        if (w) continue;
        t.alive = false; this.ui.hitmarker('kill'); audio.play(th >= 0 ? 'headshot' : 'hit');
        this.effects.pow({ x: t.pos.x, y: 2.2, z: t.pos.z }, POW_WORDS[(Math.random() * POW_WORDS.length) | 0]);
      }
    }
  }

  // ======================= Kamera =======================
  setFov(h) {
    const a = this.renderer.aspect;
    const v = vfov(h, a);
    if (Math.abs(this.camera.fov - v) > 0.01 || this.camera.aspect !== a) { this.camera.fov = v; this.camera.aspect = a; this.camera.updateProjectionMatrix(); }
  }
  updateCamera(dt) {
    const P = this.player;
    const ads = P.ads && P.alive;
    this.adsT += ((ads ? 1 : 0) - this.adsT) * Math.min(1, dt * 16);
    const eye = new THREE.Vector3(P.pos.x, P.eyeY, P.pos.z);
    const yaw = P.yaw, pitch = P.pitch;
    const fwd = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const right = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
    // Schulterkamera
    const pivot = eye.clone().add(new THREE.Vector3(0, 0.25, 0));
    const want = pivot.clone().addScaledVector(right, 1.15).addScaledVector(fwd, -3.1).add(new THREE.Vector3(0, 0.2, 0));
    const dir = want.clone().sub(pivot); const len = dir.length(); dir.normalize();
    const h = this.arena.world.raycast(pivot, dir, len + 0.25);
    const tp = h ? pivot.clone().addScaledVector(dir, Math.max(0.3, h.t - 0.25)) : want;
    tp.y = Math.max(0.3, tp.y);
    const pos = tp.lerp(eye, this.adsT);
    // Wackeln
    const sh = this.effects.shake;
    if (sh > 0) pos.add(new THREE.Vector3((Math.random() - 0.5) * sh * 0.25, (Math.random() - 0.5) * sh * 0.25, (Math.random() - 0.5) * sh * 0.25));
    this.camera.position.copy(pos);
    this.camera.lookAt(pos.clone().add(fwd));
    this.setFov(FOV_HORIZONTAL - (FOV_HORIZONTAL - 78) * this.adsT);
    // Figur ausblenden in Ich-Ansicht
    const fp = this.adsT > 0.55 && P.alive;
    this.mango.root.visible = !fp;
    this.viewmodel.visible = fp;
    this.camKick = Math.max(0, (this.camKick || 0) - dt * 12);
    this.viewmodel.position.set(0, -this.camKick * 0.004, this.camKick * 0.03);
    audio.setListener(pos, fwd);
    // Fadenkreuz-Streuung
    const spreadDeg = P.spread(P.shotIndex);
    const px = Math.tan(spreadDeg * DEG) / Math.tan(this.camera.fov * DEG / 2) * innerHeight / 2;
    this.ui.setSpread(Math.min(40, px), fp);
  }

  // ======================= Flagge =======================
  updateFlag(dt) {
    const f = this.flag, t = this.roundTime;
    if (!f.warned && t >= T.flagWarn) {
      f.warned = true; audio.play('siren'); this.ui.center('FLAGGE IN 10 S!', 'Mitte der Arena', 2);
      this.dialog.say('flag_warn', { force: true });
    }
    if (!f.active && t >= T.flagTime) {
      f.active = true; f.spawnT = t; f.rise = 0; this.arena.flag.group.visible = true;
      this.ui.center('🚩 FLAGGE!', '5 Sekunden allein in der Zone = Sieg', 2.2);
      audio.play('capture');
      this.dialog.say('flag_spawn', { chance: 0.5 });
    }
    if (!f.active) return;
    f.rise = Math.min(1, f.rise + dt);
    const inZ = A => A.alive && Math.hypot(A.pos.x, A.pos.z) < T.flagRadius;
    const pi = inZ(this.player), bi = inZ(this.bot);
    f.owner = pi && bi ? 'both' : pi ? 'player' : bi ? 'bot' : null;
    if (f.owner === 'player') f.progress.player += dt;
    if (f.owner === 'bot') f.progress.bot += dt;
    if (f.owner === 'player' || f.owner === 'bot') { this.flagTick = (this.flagTick || 0) + dt; if (this.flagTick > 0.5) { this.flagTick = 0; audio.play('tick'); } }
    this.arena.flag.update(t, f.rise, f.owner);
    if (this.state !== 'playing') return;
    if (f.progress.player >= T.flagCapture) { this.state = 'roundEnd'; this.roundEndT = 0; this.timeScale = 0.5; this.bot.alive = false; this.bot.deadT = 0; this.finishRound('flag', false); }
    else if (f.progress.bot >= T.flagCapture) {
      this.state = 'roundEnd'; this.roundEndT = 0; this.timeScale = 0.5; this.lossReason = 'flag';
      audio.play('lose'); this.ui.center('COPYCAT HAT DIE FLAGGE!', '', 2.5);
      this.dialog.say('win', { force: true }); this.bot.taunt = { type: 'dance', t: 0, dur: 99 };
    }
  }

  // ======================= Hauptschleife =======================
  loop(now) {
    requestAnimationFrame(t => this.loop(t));
    const rawDt = Math.max(0, Math.min(0.05, (now - this.last) / 1000)); this.last = now;
    this.autoQuality(rawDt);
    const dt = rawDt * this.timeScale;
    try { this.tick(dt, rawDt); } catch (e) { console.error(e); }
    this.input.endFrame();
    this.renderer.render(this.scene, this.camera);
  }
  tick(dt, rawDt) {
    const st = this.state;
    if (st === 'menu') { this.updateMenu(rawDt); this.effects.update(rawDt); return; }
    if (st === 'paused' || st === 'over' || st === 'intermission' || st === 'loading') {
      if (st !== 'paused') this.orbitCamera(rawDt);
      this.dialog.update(p => this.effects.project(p), this.headPos(this.copycat), this.copycat.root.visible);
      if (st === 'intermission' || st === 'over') { this.bot.syncRig(rawDt); this.player.syncRig(rawDt); }
      return;
    }
    if (st === 'killcam') { this.updateKillcam(rawDt); this.effects.update(rawDt); return; }

    const P = this.player, B = this.bot, world = this.arena.world;
    const evs = [];
    const frozen = st === 'countdown' && this.mode !== 'tutorial';
    if (st === 'countdown') {
      this.countdown -= rawDt;
      const n = Math.ceil(this.countdown);
      if (n !== this.lastBeep && n > 0 && n <= 3 && this.mode !== 'tutorial') { this.lastBeep = n; audio.play('beep'); this.ui.center(String(n), '', 0.9); }
      if (this.countdown <= 0) { this.state = 'playing'; if (this.mode !== 'tutorial') { audio.play('go'); this.ui.center('LOS!', '', 0.7); } }
    }
    // Spieler
    const cmd = this.playerCmd(dt, frozen || !P.alive || st === 'roundEnd');
    P.update(dt, cmd, world, evs);
    if (this.mode === 'tutorial') {
      for (const e of evs) if (e.type === 'fire') { this.stats.shots++; }
      const fireEvs = evs.filter(e => e.type === 'fire');
      this.handleEvents(evs.filter(e => e.type !== 'fire'));
      for (const e of fireEvs) {
        const [rp, ry] = RECOIL[e.index]; const k = this.adsT > 0.5 ? 0.85 : 1;
        P.pitch += rp * DEG * k; P.yaw -= ry * DEG * k; this.recoilAcc.p += rp * DEG * k; this.recoilAcc.y -= ry * DEG * k;
        this.camKick = 1; audio.play('shot', null, 0.7);
        const cam = new THREE.Vector3(); this.camera.getWorldDirection(cam);
        const h = world.raycast(this.camera.position, cam, 150);
        const muzzle = new THREE.Vector3(); P.rig.rifle.muzzle.getWorldPosition(muzzle);
        const end = h ? h.point : this.camera.position.clone().addScaledVector(cam, 100);
        this.effects.tracer(muzzle, end, 'player'); if (h) this.effects.impact(h.point, h.normal);
        this.tutorialShot(e);
      }
      P.syncRig(dt);
      this.updateCamera(rawDt);
      this.updateTutorial(rawDt);
      this.effects.update(dt);
      this.ui.update(rawDt, this);
      return;
    }
    // Copycat
    const bcmd = (frozen || st === 'roundEnd' || !B.alive) ? { fwd: 0, side: 0 } : this.brain.update(dt);
    if (st === 'roundEnd' && B.alive && B.taunt) { /* tanzt */ }
    B.update(dt, bcmd, world, evs);
    this.handleEvents(evs);
    if (st === 'playing' || st === 'roundEnd') this.roundTime += dt;
    this.stats.time += st === 'playing' ? dt : 0;
    if (st !== 'countdown') this.updateFlag(dt);
    this.recordKillcam(dt);
    P.syncRig(dt); B.syncRig(dt);
    // Treffer-Wackeln bei Copycat
    this.updateCamera(rawDt);
    this.effects.update(dt);
    this.dialog.update(p => this.effects.project(p), this.headPos(this.copycat), B.alive || st === 'roundEnd');
    this.ui.update(rawDt, this);
    // Musik-Spannung
    const seen = this.brain.seenT > 0, lowHp = P.hp < 40;
    const target = Math.min(1, 0.2 + (seen ? 0.35 : 0) + (lowHp ? 0.2 : 0) + (this.flag.active ? 0.35 : this.roundTime > T.flagWarn ? 0.2 : 0) + (1 - B.hp / 100) * 0.1);
    audio.tension += (target - audio.tension) * Math.min(1, rawDt * 0.8);
    // Rundenende
    if (st === 'roundEnd') {
      this.roundEndT += rawDt;
      if (this.roundEndT > 0.9) this.timeScale = Math.min(1, this.timeScale + rawDt);
      const playerLost = !P.alive || this.lossReason === 'flag';
      if (!playerLost && this.roundEndT > 2.6) this.showIntermission();
      if (playerLost && this.roundEndT > 2.8) { if (this.lossReason === 'kill' && this.killcam.buf.length) this.startKillcam(); else this.gameOver(); }
    }
  }
  // Ruckelt es länger, wird die Grafik automatisch etwas leichter
  autoQuality(dt) {
    if (!(this.state === 'playing' || this.state === 'countdown') || dt <= 0) return;
    this.fpsAcc = (this.fpsAcc || 0) + dt; this.fpsN = (this.fpsN || 0) + 1;
    if (this.fpsAcc < 4) return;
    const avg = this.fpsAcc / this.fpsN; this.fpsAcc = 0; this.fpsN = 0;
    const r = this.renderer.renderer; this.qLevel = this.qLevel || 0;
    if (avg > 1 / 45 && this.qLevel < 3) {
      this.qLevel++;
      if (this.qLevel === 1) { r.setPixelRatio(Math.min(devicePixelRatio, 1)); this.renderer.resize(); }
      if (this.qLevel === 2) { this.sun.shadow.mapSize.set(1024, 1024); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
      if (this.qLevel === 3) { r.setPixelRatio(0.75); this.renderer.resize(); }
    }
  }
  headPos(rig) { const v = new THREE.Vector3(); rig.head.getWorldPosition(v); v.y += 0.55; return v; }
  orbitCamera(dt) {
    this.orbitA = (this.orbitA || 0) + dt * 0.12;
    const r = 26; this.camera.position.set(Math.sin(this.orbitA) * r, 13, Math.cos(this.orbitA) * r);
    this.camera.lookAt(0, 1, 0); this.setFov(FOV_HORIZONTAL * 0.75);
  }

  // ======================= Buttons & Tasten =======================
  globalKey(e) {
    if (this.input.listenCb) return;
    if (e.code === 'Escape' && (this.state === 'playing' || this.state === 'countdown')) { e.preventDefault(); this.pause(); return; }
    if (this.state === 'killcam' && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape')) { this.endKillcam(); return; }
    if (this.state === 'intermission' && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); this.action('nextRound'); }
  }
  async action(a) {
    audio.init();
    const $ = id => document.getElementById(id);
    switch (a) {
      case 'play': this.startRun(); break;
      case 'tutorial': this.startTutorial(false); break;
      case 'resume': this.resume(); break;
      case 'quit':
        this.ui.hideScreens();
        if (this.mode === 'tutorial') { profile.tutorialDone = true; saveProfile(); this.tutThenPlay = false; this.endTutorial(); break; }
        this.lossReason = 'quit'; this.gameOver(); break;
      case 'settings': this.settingsFrom = this.state === 'paused' ? 'screen-pause' : 'screen-start'; this.ui.show('screen-settings'); break;
      case 'closeSettings': this.ui.show(this.settingsFrom || 'screen-start'); break;
      case 'resetKeys': this.ui.resetKeys(); break;
      case 'leaderboard': {
        this.lbFrom = this.state === 'over' ? 'screen-over' : 'screen-start';
        this.ui.show('screen-leaderboard'); this.ui.renderLeaderboard([], null);
        $('lb-list').innerHTML = '<li class="muted">Lade …</li>';
        try { this.ui.renderLeaderboard(await leaderboard.top10(), profile.name); } catch { this.ui.renderLeaderboard(null); }
        break;
      }
      case 'closeLeaderboard': this.ui.show(this.lbFrom || 'screen-start'); if (this.lbFrom !== 'screen-over') this.refreshStartBest(); break;
      case 'nextRound': if (this.state === 'intermission') { audio.setMode('game'); this.nextRound(); } break;
      case 'again': this.startRun(); break;
      case 'menu': this.enterMenu(); break;
      case 'submitScore': await this.submitScore(); break;
      case 'claimName': {
        const name = $('go-name').value.trim(), pin = $('go-pin').value.trim();
        try {
          const r = await leaderboard.claim(name, pin);
          if (r === 'ok') { this.ui.msg('PIN stimmt – Name gehört jetzt auch diesem Gerät.'); $('go-pin-row').classList.add('hidden'); await this.submitScore(); }
          else this.ui.msg(r === 'locked' ? 'Zu viele Versuche. Bitte in 30 Minuten nochmal.' : 'PIN falsch.');
        } catch (e) { this.ui.msg(e.message); }
        break;
      }
      case 'setPin': {
        const pin = $('go-newpin').value.trim();
        if (!/^\d{4}$/.test(pin)) { this.ui.msg('Die PIN muss aus 4 Ziffern bestehen.'); break; }
        try { const ok = await leaderboard.setPin(profile.name, pin); this.ui.msg(ok ? 'PIN gespeichert. Merk sie dir gut!' : 'PIN konnte nicht gesetzt werden.'); if (ok) $('go-setpin').classList.add('hidden'); } catch (e) { this.ui.msg(e.message); }
        break;
      }
      case 'share': {
        const text = `Ich habe in COPYCAT ${this.score.toLocaleString('de-DE')} Punkte (${Math.max(0, this.round - 1)} Runden) geschafft. Der Pantomime hat mich trotzdem durchschaut. Schaffst du mehr?`;
        const url = location.href.split('#')[0];
        try { if (navigator.share) await navigator.share({ title: 'COPYCAT', text, url }); else { await navigator.clipboard.writeText(text + ' ' + url); this.ui.msg('In die Zwischenablage kopiert!'); } } catch { /* abgebrochen */ }
        break;
      }
    }
  }
  async submitScore() {
    const $ = id => document.getElementById(id);
    const name = $('go-name').value.trim();
    if (!/^[A-Za-z0-9ÄÖÜäöüß _.-]{2,16}$/.test(name)) { this.ui.msg('Name: 2–16 Zeichen (Buchstaben, Zahlen, Leerzeichen, _ . -)'); return; }
    this.ui.msg('Trage ein …');
    try {
      const r = await leaderboard.submit(name, this.final);
      if (r.status === 'taken' || r.status === 'taken_pin') {
        this.ui.msg(r.status === 'taken_pin' ? 'Der Name gehört schon jemandem. Deiner? Dann gib die PIN ein.' : 'Der Name ist schon vergeben. Bitte nimm einen anderen.');
        $('go-pin-row').classList.toggle('hidden', r.status !== 'taken_pin');
        return;
      }
      if (r.status === 'invalid') { this.ui.msg('Das Ergebnis konnte nicht eingetragen werden.'); return; }
      profile.name = name; saveProfile();
      this.ui.msg(r.status === 'kept' ? `Dein Rekord bleibt ${r.best.toLocaleString('de-DE')} Punkte (Platz ${r.rank}).` : `Eingetragen! Platz ${r.rank} mit ${r.best.toLocaleString('de-DE')} Punkten.`);
      $('go-setpin').classList.remove('hidden');
    } catch (e) { this.ui.msg(e.message); }
  }
}

const loadEl = document.querySelector('#loading .loader');
loadAssets(f => { loadEl.textContent = `LADE … ${Math.round(f * 100)} %`; })
  .then(() => { window.game = new Game(); })
  .catch(e => { loadEl.textContent = 'Fehler beim Laden 😢'; console.error(e); });
