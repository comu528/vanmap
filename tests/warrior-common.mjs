// M8-B（戦士 基盤実装）の共通ヘルパ。Node.js 標準機能のみ・外部ライブラリなし。
// tests/flame-audit-common.mjs / frost-audit-common.mjs と同じ設計で、
// 「実データ読み込み・カタログ構築・production 抽選コンテキスト・Phaser モック」を 17 本のテストで共有する。
//
// 差分は次の 3 点だけで、抽選・監査の「正」は火/氷と同じ production モジュールを使う。
//   - 対象ジョブが warrior（element=physical）であること
//   - combat API に meleeStrike / warrior（WarriorCombatSystem）を備えること
//   - 敵が体勢（_poise / _staggerUntil）を持つこと

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
export const loadData = (n) => JSON.parse(readFileSync(join(REPO, 'data', n), 'utf8'));
export const readSrc = (rel) => readFileSync(join(REPO, rel), 'utf8');
export const srcExists = (rel) => existsSync(join(REPO, rel));

export const DATA = {
  skills: loadData('skills.json').skills,
  passives: loadData('passives.json').passives,
  evolutions: loadData('skill-evolutions.json').evolutions,
  jobs: loadData('jobs.json').jobs,
  balance: loadData('balance.json'),
  skillConfig: loadData('skill-config.json'),
  statusEffects: loadData('status-effects.json'),
  jobProgression: loadData('job-progression.json'),
  skillMastery: loadData('skill-mastery.json'),
};

export const WARRIOR = DATA.jobs.find((j) => j.id === 'warrior');
export const FLAME = DATA.jobs.find((j) => j.id === 'flame_witch');
export const FROST = DATA.jobs.find((j) => j.id === 'frost_mage');

// M8-B の期待規模（active5 / passive4 / evolution3）。M8-B 以降で増える場合はここを更新する。
export const EXPECTED = {
  // M8-C（Wave1）で active5 → 15 / evolution3 → 8、M8-D（Wave2）で active15 → 25 / evolution8 → 13。
  // passive は 4 のまま。
  // M8-E（最終Wave）で active25 → 30 / evolution13 → 18。火 / 氷と同規模へ到達。
  activeCount: 30, passiveCount: 4, evolutionCount: 18,
  // M8-B の基礎 5 種（既存テストが参照する）。
  baseActives: ['great_cleave', 'shield_bash', 'whirlwind_slash', 'charge_slash', 'ground_slam'],
  baseEvolutions: ['thousand_blade_dance', 'bloodstorm_whirlwind', 'unyielding_fortress'],
  // M8-C で追加した 10 active / 5 evolution。
  wave1Actives: ['armor_breaker', 'twin_fang_slash', 'execution_strike', 'leap_smash', 'sweeping_advance',
    'counter_stance', 'war_cry', 'chain_hook', 'shockwave_stomp', 'relentless_combo'],
  wave1Evolutions: ['skull_splitter', 'crimson_execution', 'war_god_roar', 'adamant_counter', 'heaven_crushing_descent'],
  // M8-D で追加した 10 active / 5 evolution。
  wave2Actives: ['rising_slash', 'shield_charge', 'backstep_riposte', 'battlefield_throw', 'triple_crush',
    'blade_guard', 'berserker_rush', 'war_axe_throw', 'breaker_knee', 'rallying_banner'],
  wave2Evolutions: ['heaven_rending_ascent', 'fortress_rampage', 'shadow_swallow_riposte',
    'mountain_hurl', 'blood_oath_standard'],
  // M8-E で追加した 5 active / 5 evolution。
  finalActives: ['piercing_lunge', 'duel_challenge', 'battle_trance', 'earthshaker_march', 'weapon_deflection'],
  finalEvolutions: ['godspeed_impaler', 'king_slayer_duel', 'blood_asura_trance',
    'continental_quake_march', 'heaven_mirror_reversal'],
  actives: ['great_cleave', 'shield_bash', 'whirlwind_slash', 'charge_slash', 'ground_slam',
    'armor_breaker', 'twin_fang_slash', 'execution_strike', 'leap_smash', 'sweeping_advance',
    'counter_stance', 'war_cry', 'chain_hook', 'shockwave_stomp', 'relentless_combo',
    'rising_slash', 'shield_charge', 'backstep_riposte', 'battlefield_throw', 'triple_crush',
    'blade_guard', 'berserker_rush', 'war_axe_throw', 'breaker_knee', 'rallying_banner',
    'piercing_lunge', 'duel_challenge', 'battle_trance', 'earthshaker_march', 'weapon_deflection'],
  passives: ['brute_force', 'heavy_armor', 'combat_instinct', 'bloodlust'],
  evolutions: ['thousand_blade_dance', 'bloodstorm_whirlwind', 'unyielding_fortress',
    'skull_splitter', 'crimson_execution', 'war_god_roar', 'adamant_counter', 'heaven_crushing_descent',
    'heaven_rending_ascent', 'fortress_rampage', 'shadow_swallow_riposte', 'mountain_hurl',
    'blood_oath_standard',
    'godspeed_impaler', 'king_slayer_duel', 'blood_asura_trance', 'continental_quake_march',
    'heaven_mirror_reversal'],
  lv80Targets: ['great_cleave', 'shield_bash', 'ground_slam', 'armor_breaker', 'twin_fang_slash', 'relentless_combo'],
};

export function registryMap() {
  const src = readSrc('src/systems/SkillManager.js');
  const map = {};
  for (const m of src.matchAll(/([a-z0-9_]+):\s*([A-Za-z0-9_]+Skill),/g)) map[m[1]] = m[2];
  return map;
}
export function registeredIds() { return Object.keys(registryMap()); }

export function skillSource(id, map = registryMap()) {
  const cls = map[id];
  if (!cls) return null;
  const rel = 'src/skills/' + cls + '.js';
  return srcExists(rel) ? readSrc(rel) : null;
}

// M8-C: 進化が基礎 active のクラスを継承する場合があるため、`extends` を辿って祖先のソースも連結する。
// 「継承で満たしている実装」を未実装と誤検出しないための共通ヘルパ。
export function skillSourceDeep(id, map = registryMap()) {
  const cls = map[id];
  if (!cls) return null;
  const collect = (name, depth = 0) => {
    const rel = 'src/skills/' + name + '.js';
    if (!srcExists(rel) || depth > 4) return '';
    const body = readSrc(rel);
    const m = body.match(/export class \w+ extends (\w+)/);
    return m ? body + '\n' + collect(m[1], depth + 1) : body;
  };
  return collect(cls);
}

// DataManager.draftCatalog() 相当（production の SkillDraftManager がそのまま食える形）。
export function draftCatalog() {
  const pick = (s, category) => ({
    id: s.id, category: category || s.category, rarity: s.rarity, weight: s.weight, maxLevel: s.maxLevel,
    enabled: s.enabled, jobs: s.jobs, isCommon: s.isCommon, prerequisites: s.prerequisites,
    conflicts: s.conflicts, unlockCondition: s.unlockCondition,
  });
  return [...DATA.skills.map((s) => pick(s)), ...DATA.passives.map((p) => pick(p, 'passive'))];
}

export function jobPools(jobId) {
  const j = DATA.jobs.find((x) => x.id === jobId);
  return { activeSkillPool: j.activeSkillPool, passiveSkillPool: j.passiveSkillPool || [] };
}

export function seedRange(n, from = 1) { const a = []; for (let i = from; i < from + n; i++) a.push(i); return a; }

// ---- 小さなテストランナー（既存テストと同じ体裁）----
export function runner(title) {
  let pass = 0, fail = 0;
  return {
    ok(cond, msg) { if (cond) pass++; else { fail++; console.error('  ✗ ' + msg); } },
    section(t) { console.log(t); },
    info(t) { console.log('  ' + t); },
    finish() {
      console.log('');
      if (fail) { console.error(`✗ ${title} 失敗: ${fail} 件（成功 ${pass}）`); process.exit(1); }
      console.log(`✓ ${title} 成功: ${pass} 件すべて通過`);
      process.exit(0);
    },
  };
}

export function stubObj() {
  const t = { x: 0, y: 0, width: 0, height: 0, radius: 0, alpha: 1, active: true, visible: true, body: { velocity: { x: 0, y: 0 } } };
  const p = new Proxy(t, {
    get(o, k) { if (k in o) return o[k]; if (k === 'then') return undefined; return () => p; },
    set(o, k, v) { o[k] = v; return true; },
  });
  return p;
}

export function capFor(name, quality, fallback) {
  const c = DATA.balance.skillCaps && DATA.balance.skillCaps[name];
  if (!c) return fallback == null ? Infinity : fallback;
  const v = c[quality];
  return typeof v === 'number' ? v : (fallback == null ? Infinity : fallback);
}

// ヘッドレス敵（Enemy 相当の最小インターフェース＋体勢フィールド）。
export function makeEnemies(n = 12, o = {}) {
  return Array.from({ length: n }, (_, i) => ({
    x: (o.x != null ? o.x : 300) + (i % 4) * 6,
    y: (o.y != null ? o.y : 290) + i * (o.dy != null ? o.dy : 6),
    alive: true, isBoss: false, isElite: !!o.elite, hp: o.hp || 600, maxHp: o.hp || 600, _seq: i,
    _poise: 0, _poiseImmuneUntil: 0, _staggerUntil: 0, _staggerSlow: 0,
    // M8-D: 打ち上げ / 掴みの残留（Enemy.reset と同じ初期値）。
    _airborneUntil: 0, _launchImmuneUntil: 0, _launchHeight: 0, _grabbed: false,
    // M8-E: 決闘の表示マーカー（Enemy.reset / onEnemyRemoved が落とす）。
    _duelMark: false,
    knockbackResist: 0.2, _kb: 0,
    applyKnockback(x, y, f) { this._kb += f; },
    applySlow() {},
    takeDamage(amt) { this.hp -= amt; if (this.hp <= 0) { this.alive = false; return true; } return false; },
  }));
}

export function makeBoss(o = {}) {
  return {
    x: o.x != null ? o.x : 330, y: o.y != null ? o.y : 300, alive: true, isBoss: true, isElite: false,
    hp: o.hp || 20000, maxHp: o.hp || 20000, state: o.state || 'chase', _stateTimer: 0, _seq: 9999,
    _airborneUntil: 0, _launchImmuneUntil: 0, _launchHeight: 0, _grabbed: false, _duelMark: false,
    _poiseStaggerUntil: 0, _staggerCalls: 0,
    applyPoiseStagger(ms) { this._poiseStaggerUntil = ms; this._staggerCalls += 1; if (this.state !== 'chase') { this.state = 'chase'; this._stateTimer = 0; } return true; },
    applyKnockback() { this._kb = (this._kb || 0) + 1; },
    takeDamage(amt) { this.hp -= amt; if (this.hp <= 0) { this.alive = false; return true; } return false; },
  };
}

// combat API・skills API をひととおり備えたヘッドレス scene（戦士版）。
// BattleScene.meleeStrike と同じ arc 判定・cap・ノックバック/体勢/闘気の流れを再現する。
// opts: { enemies, boss, quality, now, warrior, mods }
export function makeScene(opts = {}) {
  const calls = [];
  let nowMs = opts.now || 1000;
  const enemies = opts.enemies || [];
  const timers = [];
  const quality = opts.quality || 'high';
  const scene = {
    calls,
    time: {
      get now() { return nowMs; },
      delayedCall: (d, fn) => { timers.push({ left: d, fn }); return stubObj(); },
    },
    advance(ms) {
      nowMs += ms;
      for (let i = timers.length - 1; i >= 0; i--) {
        timers[i].left -= ms;
        if (timers[i].left <= 0) { const t = timers.splice(i, 1)[0]; try { t.fn(); } catch (e) { void e; } }
      }
      // M8-F: production の BattleScene.update と同じく、決闘が終わったら古いマーカーを掃除する。
      if (scene._duelMarkSeq != null && scene.warrior && !scene.warrior.duelActive) scene.clearDuelMark();
    },
    pendingTimers() { return timers.length; },
    _m: { suppressed: 0 }, worldW: 1600, worldH: 1200, _defaultElement: 'physical',
    isWarrior: true, gameOver: false, _warriorVisuals: {}, _warriorHitGroup: 0,
    add: new Proxy({}, { get: () => () => stubObj() }),
    cameras: { main: { worldView: { x: 0, y: 0, width: 640, height: 360, centerX: 320, centerY: 180 }, shake: () => {}, flash: () => {} } },
    effects: new Proxy({}, { get: () => () => {} }),
    tweens: { add: (cfg) => { if (cfg && cfg.onComplete) cfg.onComplete(); return stubObj(); }, killTweensOf: () => {} },
    player: {
      x: 300, y: 300, alive: true, hp: 100, maxHp: 100, flipX: false,
      body: { velocity: { x: 0, y: 0 } }, cfg: { attackRange: 260 },
      heal(a) { this.hp = Math.min(this.maxHp, this.hp + a); },
    },
    boss: opts.boss || null,
    enemyPool: { forEachActive: (fn) => { for (const e of enemies) fn(e); } },
    // M8-E: 敵弾（弾き返しの対象）と反射弾。既定は空＝従来のテストへ影響しない。
    enemyBullets: opts.enemyBullets || [],
    reflected: [],
    _deflectSeq: 0,
    _duelMarkSeq: null,
    _deflectOpts: null,
    passives: { getAreaMultiplier: () => 1, getDurationMultiplier: () => 1, getDamageMultiplier: () => 1, getProjectileCountBonus: () => 0, getMult: () => 1, _cooldownMin: 0.5, version: 0 },
    jobMods: {
      cooldownMult: () => 1, projectileCountBonus: () => 0, damageMultiplier: () => 1,
      fireAreaMult: () => 1, explosionAreaMult: () => 1, statusPowerMult: () => 1,
      burningDamageMult: () => 1, burningDurationMult: () => 1,
      poiseDamageMult: () => 1, toughnessMult: () => 1, maxHpMult: () => 1, furyGainMult: () => 1,
      damageReductionBonus: () => 0, comboThresholdBonusMult: () => 1,
      furyReleaseBonus: () => null, warriorApex: () => null,
      resolved: { evolvedDamageMult: 1 },
    },
    telemetry: null,
    _warriorSkillStats: Object.create(null),
    showBanner() {},
  };

  // 戦士システム（production を実データで駆動する）。
  scene.warrior = opts.warrior || null;

  const targetsInRadius = (x, y, r) => {
    const out = enemies.filter((e) => e.alive && (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y) <= r * r);
    if (scene.boss && scene.boss.alive) {
      const b = scene.boss;
      if ((b.x - x) * (b.x - x) + (b.y - y) * (b.y - y) <= r * r) out.push(b);
    }
    return out;
  };

  const warriorSkillStat = (id) => {
    const key = String(id || '');
    let st = scene._warriorSkillStats[key];
    if (!st) {
      st = {
        meleeHits: 0, physicalDamage: 0, knockbacks: 0, poiseDamage: 0, eliteStaggers: 0, bossStanceBreaks: 0,
        comboGain: 0, furyGain: 0,
        executions: 0, counters: 0, pullDistance: 0, retargets: 0, movementDistance: 0,
        // M8-D（Wave2）。
        launches: 0, frontGuardMs: 0, grabs: 0, throws: 0, stages: 0, guardTicks: 0,
        axeHits: 0, stepIns: 0, rallyMs: 0,
        // M8-E（最終Wave）。
        thrusts: 0, penetrations: 0, duels: 0, duelMs: 0, tranceMs: 0,
        stomps: 0, deflects: 0, reflected: 0,
      };
      scene._warriorSkillStats[key] = st;
    }
    return st;
  };

  // BattleScene.meleeStrike と同じ手順（arc 判定 → cap → ダメージ → ノックバック/体勢 → 闘気/コンボ）。
  scene.meleeStrike = (o) => {
    if (!o || scene.gameOver) return { hits: 0 };
    const radius = Math.max(1, o.radius || 0);
    const cap = Math.min(o.maxTargets != null ? o.maxTargets : Infinity, capFor('maxMeleeTargetsPerHit', quality, 24));
    const half = (o.arc != null ? o.arc : Math.PI * 2) / 2;
    const full = half >= Math.PI - 1e-6;
    const w = scene.warrior;
    // M8-C: 1 発動あたりの処刑数の上限（production と同じ）。
    let executes = 0;
    const execCap = o.execute
      ? Math.min(o.maxExecutes != null ? o.maxExecutes : Infinity, capFor('maxExecutesPerCast', quality, 3))
      : 0;
    let hits = 0;
    // M8-E: 狭い直線（貫穿突き / 神速貫陣）。円 → arc ではなく「前方の帯」で絞り、手前から順に並べる。
    let candidates = targetsInRadius(o.x, o.y, radius);
    if (o.line && w) {
      const L = Math.max(0, o.line.length || 0), HW = Math.max(0, o.line.width || 0) / 2;
      const ca = Math.cos(o.line.facing || 0), sa = Math.sin(o.line.facing || 0);
      const inLine = [];
      for (const e of candidates) {
        if (!e || !e.alive) continue;
        const dx = e.x - o.x, dy = e.y - o.y;
        const along = dx * ca + dy * sa;
        if (along < 0 || along > L) continue;
        if (Math.abs(-dx * sa + dy * ca) > HW) continue;
        e._lineAlong = along;
        inLine.push(e);
      }
      inLine.sort((a, b) => (a._lineAlong - b._lineAlong) || ((a._seq || 0) - (b._seq || 0)));
      candidates = w.resolveLineMeleeTargets(inLine, { maxTargets: o.line.maxTargets || cap });
    }
    for (const e of candidates) {
      if (hits >= cap) { scene._m.suppressed++; break; }
      if (!e || !e.alive) continue;
      if (o.hitSet && o.hitSet.has(e)) continue;
      if (!full) {
        let d = Math.atan2(e.y - o.y, e.x - o.x) - (o.facing || 0);
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        if (Math.abs(d) > half) continue;
      }
      // M8-D: 同一敵への命中回数の上限（戦斧の往復）。安定 runtime id で数える。
      if (o.seqHitCounts && (o.seqHitCounts.get(e._seq) || 0) >= (o.seqHitCap || 1)) continue;
      if (o.seqHitCounts) o.seqHitCounts.set(e._seq, (o.seqHitCounts.get(e._seq) || 0) + 1);
      if (o.hitSet) o.hitSet.add(e);
      hits += 1;
      // M8-D: 投擲は近接ではないので近接ダメージ倍率を掛けない。
      let dmg = (o.damage || 0) * ((w && !o.isThrown) ? w.meleeDamageMultiplier(e) : 1);
      // M8-C: 硬い相手への追加倍率。
      if (o.toughBonus && (e.isElite || e.isBoss)) dmg *= (1 + o.toughBonus);
      // M8-C: 処刑（通常敵のみ即死しうる。エリート/ボスは追加ダメージ倍率だけ）。
      if (o.execute && w) {
        const pol = w.executePolicy(e, o.execute);
        if (pol.canExecute && executes < execCap) {
          executes += 1;
          scene.executeTarget(e, o.skillId, { from: { x: o.x, y: o.y } });
          continue;
        }
        if (!pol.canExecute && pol.reason !== 'invalid') w.noteExecute(false, 0);
        dmg *= pol.damageMult;
      }
      calls.push(['melee', o.skillId, e, dmg, o.castKey]);
      if (scene.skills) { scene.skills.recordDamage(o.skillId, dmg); scene.skills.recordHit(o.skillId); }
      const died = e.takeDamage(dmg);
      if (died) { if (w) { w.noteKill(e); w.onEnemyRemoved(e); } if (scene.skills) scene.skills.dispatchKill(e, o.skillId); continue; }
      if (w) {
        const ws = warriorSkillStat(o.skillId);
        ws.meleeHits += 1; ws.physicalDamage += dmg;
        const kb = w.resolveKnockback(e, o.knockback);
        if (kb.knockback > 0 && e.applyKnockback) { e.applyKnockback(o.x, o.y, kb.knockback); ws.knockbacks += 1; }
        // M8-D: 打ち上げ（通常敵のみ。エリート / ボスは体勢削りへ変換される）。
        let launchPoise = 0;
        if (o.launch) {
          const counts = o.launch.counts;
          const perTarget = Math.max(0, o.launch.maxPerTarget || 1);
          const done = counts ? (counts.get(e._seq) || 0) : 0;
          if (!counts || done < perTarget) {
            if (counts) counts.set(e._seq, done + 1);
            const lr = scene.launchTarget(e, {
              durationMs: o.launch.durationMs, height: o.launch.height,
              immuneMs: o.launch.immuneMs, poiseDamage: o.poiseDamage, skillId: o.skillId,
            });
            launchPoise = lr.poiseBonus || 0;
          }
        }
        if (!o.poiseOnceSet || !o.poiseOnceSet.has(e)) {
          if (o.poiseOnceSet) o.poiseOnceSet.add(e);
          // M8-D: 硬い相手への体勢特化ボーナス（破城膝撃）。
          const toughPoise = (o.toughPoiseBonus && (e.isElite || e.isBoss)) ? o.toughPoiseBonus : 0;
          const poise = ((o.poiseDamage || 0) * (1 + toughPoise)) + kb.poiseBonus + launchPoise;
          if (poise > 0) {
            ws.poiseDamage += poise;
            const pr = w.applyPoiseDamage(e, poise);
            if (pr && pr.type === 'eliteStagger') ws.eliteStaggers += 1;
            else if (pr && pr.type === 'bossStanceBreak') ws.bossStanceBreaks += 1;
          }
        }
        const g = w.noteMeleeHit({
          castKey: o.castKey, target: e, damage: dmg,
          comboGain: o.comboGain != null ? o.comboGain : 1,
          furyGain: o.furyGain != null ? o.furyGain : undefined,
        });
        ws.comboGain += g.combo; ws.furyGain += g.fury;
      }
    }
    return { hits };
  };

  // M8-C: 処刑の共通経路（残り HP ぶんのダメージ＝死亡イベントを二重に出さない）。
  scene.executeTarget = (e, skillId) => {
    if (!e || !e.alive || e.isBoss || e.isElite) return false;
    const remain = Math.max(0, e.hp || 0);
    const died = e.takeDamage(remain);
    if (scene.skills) { scene.skills.recordDamage(skillId, remain); scene.skills.recordHit(skillId); }
    if (scene.warrior) scene.warrior.noteExecute(died, 0);
    if (died) {
      const ws = warriorSkillStat(skillId);
      ws.executions = (ws.executions || 0) + 1;
      if (scene.warrior) { scene.warrior.noteKill(e); scene.warrior.onEnemyRemoved(e); }
      if (scene.skills) scene.skills.dispatchKill(e, skillId);
    }
    return died;
  };

  // M8-C: 反撃の調停（production の BattleScene.onWarriorHit と同じ流れ）。
  scene.onWarriorHit = (raw, applied) => {
    const w = scene.warrior;
    if (!w || !w.enabled || scene._inWarriorCounter) return null;
    const pick = w.consumeCounterEvent();
    if (!pick) return null;
    let done = null;
    scene._inWarriorCounter = true;
    try {
      for (const sk of scene.skills.skills.values()) {
        if (sk.counterSource !== pick.source) continue;
        if (typeof sk.performCounter !== 'function') continue;
        done = sk.performCounter(raw, applied) ? pick.source : null;
        break;
      }
    } finally { scene._inWarriorCounter = false; }
    if (done) { const ws = warriorSkillStat(done); ws.counters = (ws.counters || 0) + 1; }
    return done;
  };

  // ---- M8-D（Wave2）の共通経路（production の BattleScene と同じ手順）----
  scene.launchTarget = (e, opts = {}) => {
    const w = scene.warrior;
    if (!w || !e || !e.alive) return { launched: false, poiseBonus: 0 };
    const pol = w.launchPolicy(e, { poiseDamage: opts.poiseDamage });
    if (!pol.launched) return { launched: false, poiseBonus: pol.poiseBonus, reason: pol.reason };
    const ms = w.launchDurationMs(opts.durationMs);
    if (ms <= 0) return { launched: false, poiseBonus: 0, reason: 'zero' };
    const now = scene.time.now;
    e._airborneUntil = Math.max(e._airborneUntil || 0, now + ms);
    e._launchImmuneUntil = now + w.launchImmuneMs(opts.immuneMs);
    e._launchHeight = Math.max(0, opts.height || 0);
    e._kb = 0;
    if (opts.skillId) warriorSkillStat(opts.skillId).launches += 1;
    return { launched: true, poiseBonus: 0, durationMs: ms };
  };
  scene.grabTarget = (e, opts = {}) => {
    const w = scene.warrior;
    if (!w || !e || !e.alive) return { mode: 'none' };
    const pol = w.grabPolicy(e);
    if (!pol.canGrab) return { mode: pol.mode, reason: pol.reason, poiseMultiplier: pol.poiseMultiplier };
    if (!w.beginGrab(opts.source || opts.skillId, e._seq)) return { mode: 'none', reason: 'busy' };
    e._grabbed = true;
    e._kb = 0;
    if (opts.skillId) warriorSkillStat(opts.skillId).grabs += 1;
    return { mode: 'throw', seq: e._seq };
  };
  scene.grabbedTarget = () => {
    const w = scene.warrior;
    if (!w || !w.grabbing) return null;
    const want = w._grab ? w._grab.seq : null;
    let found = null;
    for (const e of enemies) if (!found && e.alive && e._seq === want) found = e;
    if (!found && scene.boss && scene.boss.alive && scene.boss._seq === want) found = scene.boss;
    return found;
  };
  scene.releaseGrab = (cancelled) => {
    const w = scene.warrior;
    if (!w) return false;
    const t = scene.grabbedTarget();
    if (t) t._grabbed = false;
    return w.endGrab(null, !!cancelled);
  };
  scene.throwGrabbed = (opts = {}) => {
    const w = scene.warrior;
    if (!w || !w.grabbing) return 0;
    const e = scene.grabbedTarget();
    if (!e || !e.alive) { scene.releaseGrab(true); return 0; }
    const margin = (DATA.balance.warrior && DATA.balance.warrior.grab && DATA.balance.warrior.grab.worldMargin) ?? 24;
    const step = Math.max(0, opts.distance || 0);
    const dx = (opts.x != null ? opts.x : e.x) - e.x;
    const dy = (opts.y != null ? opts.y : e.y) - e.y;
    const d = Math.hypot(dx, dy);
    if (!(d > 1e-3) || step <= 0) return 0;
    const move = Math.min(step, d);
    const nx = e.x + (dx / d) * move, ny = e.y + (dy / d) * move;
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return 0;
    e.x = Math.max(margin, Math.min(scene.worldW - margin, nx));
    e.y = Math.max(margin, Math.min(scene.worldH - margin, ny));
    return move;
  };

  // ---- M8-E（最終Wave）の共通経路（production の BattleScene と同じ手順）----
  scene.pickDuelTarget = (x, y, range, o = {}) => {
    const w = scene.warrior;
    if (!w || !w.enabled) return null;
    const cand = targetsInRadius(x, y, Math.max(1, range || 0));
    let best = null, bestScore = -Infinity;
    const hpWeight = Math.max(0, o.normalTargetHpPriority || 0);
    for (const e of cand) {
      if (!e || !e.alive) continue;
      const pri = w.duelPriority(e);
      if (pri < 0) continue;
      const hpRatio = e.maxHp > 0 ? (e.hp / e.maxHp) : 0;
      const score = pri * 1e6 + hpRatio * hpWeight * 1e3 - Math.hypot(e.x - x, e.y - y) * 1e-3;
      if (score > bestScore) { bestScore = score; best = e; }
    }
    return best;
  };
  scene.beginDuel = (source, x, y, o = {}) => {
    const w = scene.warrior;
    if (!w || !w.enabled) return null;
    const target = scene.pickDuelTarget(x, y, o.range, o);
    if (!target) return null;
    const r = w.beginDuelChallenge(source, target, o);
    if (!r) return null;
    scene.setDuelMark(target);
    if (o.skillId) warriorSkillStat(o.skillId).duels += 1;
    return { ...r, target };
  };
  // M8-F: production の BattleScene._setDuelMark / _clearDuelMark と同じ寿命。
  scene.setDuelMark = (target) => {
    if (scene._duelMarkSeq != null && (!target || target._seq !== scene._duelMarkSeq)) scene.clearDuelMark();
    if (target) { target._duelMark = true; scene._duelMarkSeq = target._seq; }
  };
  // Scene 終了相当の後始末（production の BattleScene.cleanup と同じ）。
  scene.cleanupWarrior = () => { scene.clearDuelMark(); };
  scene.clearDuelMark = () => {
    const seq = scene._duelMarkSeq;
    scene._duelMarkSeq = null;
    if (seq == null) return;
    if (scene.boss && scene.boss._seq === seq) scene.boss._duelMark = false;
    for (const e of enemies) if (e._seq === seq) e._duelMark = false;
  };
  scene.duelTarget = () => {
    const w = scene.warrior;
    if (!w || !w.duelActive) return null;
    const seq = w.duelSeq;
    if (scene.boss && scene.boss.alive && scene.boss._seq === seq) return scene.boss;
    let found = null;
    for (const e of enemies) if (!found && e.alive && e._seq === seq) found = e;
    return found;
  };
  scene.refreshDuel = (o = {}) => {
    const w = scene.warrior;
    if (!w || !w.duelActive) return false;
    const t = scene.duelTarget();
    if (t && t.alive) return true;
    if (!(o.retargetRange > 0)) { w.clearDuelTarget(null, 'targetLost'); scene.clearDuelMark(); return false; }
    const next = scene.pickDuelTarget(scene.player.x, scene.player.y, o.retargetRange, o);
    if (!next || w.duelPriority(next) < 2) { w.clearDuelTarget(null, 'noWorthyTarget'); scene.clearDuelMark(); return false; }
    if (!w.retargetDuel(next)) { scene.clearDuelMark(); return false; }
    scene.setDuelMark(next);
    return true;
  };
  scene.deflectableProjectiles = (x, y, r) => {
    const r2 = Math.max(0, r) * Math.max(0, r);
    const out = [];
    for (const b of (scene.enemyBullets || [])) {
      if (!b.alive || b.alreadyDeflected) continue;
      if ((b.x - x) * (b.x - x) + (b.y - y) * (b.y - y) <= r2) out.push(b);
    }
    out.sort((a, c) => (a._deflectId || 0) - (c._deflectId || 0) || (a.x - c.x) || (a.y - c.y));
    return out;
  };
  scene.createReflectedPhysicalProjectile = (x, y, ang, r, o = {}) => {
    const w = scene.warrior;
    if (!w) return null;
    const cap = capFor('maxReflectedProjectiles', quality, 8);
    if ((scene.reflected || []).length >= cap) return null;
    if (1 > w.maxReflectGeneration()) return null;      // 反射弾から再反射しない
    const p = {
      x, y, angle: ang + Math.PI, alive: true, hostile: false, ownerType: 'player',
      damage: Math.max(0, r.damage || 0), speed: Math.max(1, r.speed || 0), lifeMs: Math.max(60, r.lifeMs || 0),
      tag: 'reflected', skillId: o.skillId || null,
      alreadyDeflected: true, deflectGeneration: 1, suppressSpecialEffects: true,
      chillAmount: 0, baseFreezeChance: 0, explosionRadius: 0,
    };
    (scene.reflected = scene.reflected || []).push(p);
    calls.push(['reflected', p.skillId, p.damage]);
    w.noteReflectedSpawn();
    if (o.skillId) warriorSkillStat(o.skillId).reflected += 1;
    return p;
  };
  scene.tryDeflectProjectile = (b, o = {}) => {
    const w = scene.warrior;
    if (!w || !w.enabled) return { deflected: false, reason: 'disabled' };
    const pick = w.arbitrateDeflectionAndCounter('projectile');
    if (!pick) return { deflected: false, reason: 'noReaction' };
    if (b._deflectId == null) b._deflectId = ++scene._deflectSeq;
    const r = w.tryDeflectProjectile(b);
    if (!r.deflected) return r;
    b.alreadyDeflected = true;
    b.alive = false;
    if (r.reflect) scene.createReflectedPhysicalProjectile(b.x, b.y, b.angle || 0, r, o);
    if (o.skillId) warriorSkillStat(o.skillId).deflects += 1;
    return r;
  };

  scene.combat = {
    meleeStrike: (o) => scene.meleeStrike(o),
    // M8-E: 最終Wave の共通経路。
    lineStrike: (o) => scene.meleeStrike(o),
    beginDuel: (source, x, y, o) => scene.beginDuel(source, x, y, o),
    duelTarget: () => scene.duelTarget(),
    refreshDuel: (o) => scene.refreshDuel(o),
    pickDuelTarget: (x, y, range, o) => scene.pickDuelTarget(x, y, range, o),
    deflectableProjectiles: (x, y, r) => scene.deflectableProjectiles(x, y, r),
    tryDeflectProjectile: (b, o) => scene.tryDeflectProjectile(b, o),
    setDeflectOptions: (o) => { scene._deflectOpts = o || null; },
    warrior: () => scene.warrior,
    // M8-D: Wave2 の共通経路。
    launchTarget: (e, opts) => scene.launchTarget(e, opts),
    grabTarget: (e, opts) => scene.grabTarget(e, opts),
    throwGrabbed: (opts) => scene.throwGrabbed(opts),
    releaseGrab: (cancelled) => scene.releaseGrab(cancelled),
    grabbedTarget: () => scene.grabbedTarget(),
    thrownStrike: (o) => scene.meleeStrike({ ...o, isThrown: true }),
    warriorWave2Config: (key) => ((DATA.balance.warrior && DATA.balance.warrior[key]) || {}),
    // M8-C: Wave1 の共通経路。
    preferredMeleeTarget: (x, y, range, mode) => {
      const cand = targetsInRadius(x, y, Math.max(1, range || 0));
      if (mode !== 'tough' && mode !== 'lowHp') return scene.combat.nearestEnemy(x, y, range);
      let best = null, bestScore = -Infinity;
      for (const e of cand) {
        if (!e || !e.alive) continue;
        const dd = Math.hypot(e.x - x, e.y - y);
        const score = mode === 'tough'
          ? ((e.isBoss ? 2000000 : (e.isElite ? 1000000 : 0)) - dd)
          : ((1 - (e.maxHp > 0 ? e.hp / e.maxHp : 1)) * 1000000 - dd);
        if (score > bestScore) { bestScore = score; best = e; }
      }
      return best || scene.combat.nearestEnemy(x, y, range);
    },
    executeTarget: (e, skillId, opts) => scene.executeTarget(e, skillId, opts),
    pullTarget: (e, opts = {}) => {
      if (!e || !e.alive || e.isBoss) return 0;
      const p = scene.player;
      const dx = p.x - e.x, dy = p.y - e.y;
      const dd = Math.hypot(dx, dy);
      if (!(dd > 1e-3)) return 0;
      const want = Math.max(0, Math.min(opts.distance || 0, dd - (opts.stopAt || 0)));
      if (want <= 0) return 0;
      const nx = e.x + (dx / dd) * want, ny = e.y + (dy / dd) * want;
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) return 0;
      e.x = Math.max(24, Math.min(scene.worldW - 24, nx));
      e.y = Math.max(24, Math.min(scene.worldH - 24, ny));
      e._kb = 0;
      if (scene.warrior) scene.warrior.noteMovement('chainPull', want);
      return want;
    },
    movePlayerTowards: (x, y, distance) => {
      const p = scene.player;
      const dx = x - p.x, dy = y - p.y;
      const dd = Math.hypot(dx, dy);
      if (!(dd > 1e-3)) return 0;
      const step = Math.max(0, Math.min(distance || 0, dd));
      const nx = p.x + (dx / dd) * step, ny = p.y + (dy / dd) * step;
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) return 0;
      p.x = Math.max(24, Math.min(scene.worldW - 24, nx));
      p.y = Math.max(24, Math.min(scene.worldH - 24, ny));
      return step;
    },
    bossTelegraphing: () => !!(scene.boss && scene.boss.alive && (scene.boss.state === 'telegraph' || scene.boss.state === 'charge')),
    // production の BattleScene.nearestTarget と同じく、ボスも候補に含める。
    nearestEnemy: (x, y, r) => {
      let best = null, bd = Infinity;
      for (const e of enemies) {
        if (!e.alive) continue;
        const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
        if (d <= (r || 0) * (r || 0) && d < bd) { bd = d; best = e; }
      }
      if (scene.boss && scene.boss.alive) {
        const b = scene.boss;
        const d = (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y);
        if (d <= (r || 0) * (r || 0) && d < bd) { bd = d; best = b; }
      }
      return best;
    },
    enemiesInRadius: (x, y, r) => targetsInRadius(x, y, r),
    forEachEnemyInRadius: (x, y, r, fn) => { for (const e of targetsInRadius(x, y, r)) fn(e); },
    // production の SpatialGrid 版と同じ意味（半径内に最も敵が集まっている位置）。
    densestPoint: (radius, minCount) => {
      const alive = enemies.filter((e) => e.alive);
      if (!alive.length) return null;
      const r = Math.max(1, radius || 120);
      let best = null, bestN = -1;
      for (const e of alive) {
        let n = 0;
        for (const o of alive) if ((o.x - e.x) * (o.x - e.x) + (o.y - e.y) * (o.y - e.y) <= r * r) n++;
        if (n > bestN) { bestN = n; best = e; }
      }
      if (bestN < (minCount || 0)) return null;
      return best ? { x: best.x, y: best.y } : null;
    },
    dealDamage: (t, amt, id) => { if (t) return t.takeDamage(amt); return false; },
    damageArea: () => {},
    skillCap: (n, f) => capFor(n, quality, f),
    frameBudget: () => true,
    worldBounds: () => ({ w: 1600, h: 1200 }),
    nextHitGroupId: () => ++scene._warriorHitGroup,
    jobElement: () => 'physical',
    isFrozen: () => false, isChilled: () => false, chillOf: () => 0, chillRatio: () => 0,
    shatterEnemy: () => false, freezeEnemy: () => false, applyChill: () => 0,
    addBossGauge: () => null, addBossGaugeTo: () => {}, entitiesWithStatus: () => [], countStatus: () => 0,
    ignite: () => false, registerBurning: () => {}, burningCount: () => 0, burningEnemies: () => [],
    markEnemy: () => {}, markedCount: () => 0, performClone: () => {},
    spawnPlayerProjectile: (x, y, a, sp, o) => { calls.push(['proj', x, y, a, sp, o]); return stubObj(); },
  };
  return scene;
}

// DataManager を実データで初期化し、SkillManager / WarriorCombatSystem を import できる状態にする。
export async function bootRuntime() {
  globalThis.Phaser = globalThis.Phaser || { BlendModes: { ADD: 1, NORMAL: 0 }, Math: { Between: (a) => a } };
  globalThis.window = globalThis.window || {};
  const { DataManager } = await import('../src/systems/DataManager.js');
  for (const [k, v] of Object.entries({
    skills: { skills: DATA.skills }, skillEvolutions: { evolutions: DATA.evolutions }, balance: DATA.balance,
    skillMastery: DATA.skillMastery, passives: { passives: DATA.passives }, jobs: { jobs: DATA.jobs },
    skillConfig: DATA.skillConfig, jobProgression: DATA.jobProgression, statusEffects: DATA.statusEffects,
  })) DataManager.data[k] = v;
  for (const s of DATA.skills) DataManager._skillMap.set(s.id, s);
  DataManager.loaded = true;
  const sm = await import('../src/systems/SkillManager.js');
  const wc = await import('../src/systems/WarriorCombatSystem.js');
  return { DataManager, SkillManager: sm.SkillManager, WarriorCombatSystem: wc.WarriorCombatSystem, WARRIOR_DEFAULTS: wc.WARRIOR_DEFAULTS, FURY_SOURCES: wc.FURY_SOURCES };
}

// 戦士システムを実データで作る（now は scene.time.now に同期する）。
export function makeWarrior(WarriorCombatSystem, scene, opts = {}) {
  const w = new WarriorCombatSystem({
    config: DATA.balance.warrior,
    enabled: opts.enabled !== false,
    now: () => scene.time.now,
    heal: (a) => { const before = scene.player.hp; scene.player.heal(a); return scene.player.hp - before; },
    emit: (t, p) => scene.calls.push(['warriorEvent', t, p]),
  });
  if (opts.mods) w.setMods(opts.mods);
  scene.warrior = w;
  return w;
}

export function allSrc() {
  let out = '';
  const walk = (dir) => {
    for (const f of readdirSync(join(REPO, dir), { withFileTypes: true })) {
      if (f.isDirectory()) walk(join(dir, f.name));
      else if (f.name.endsWith('.js')) out += readFileSync(join(REPO, dir, f.name), 'utf8');
    }
  };
  walk('src');
  return out;
}

export function evolutionBaseMap() {
  const m = {};
  for (const e of DATA.evolutions) if (WARRIOR.evolutionPool.includes(e.id)) m[e.id] = e.baseSkillId;
  return m;
}
