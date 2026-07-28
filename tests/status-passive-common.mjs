// M8-B.1「passive 再計算バグ修正」の共通ヘルパ。Node.js 標準機能のみ・外部ライブラリなし。
//
// 重要: 本ハーネスは **production の BattleScene.prototype のメソッドをそのまま呼ぶ**。
// `_refreshStatusPassives()` / `_refreshStatusPassivesIfNeeded()` のロジックをテスト側で複製しない
// （複製すると「テストは通るが実装は直っていない」状態を作れてしまうため）。
//
// BattleScene は Phaser のクラスを継承するモジュールを import するため、最小の Phaser スタブを先に置く。
// スタブは import を通すためだけのもので、判定・数値には一切関与しない。

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
export const loadData = (n) => JSON.parse(readFileSync(join(REPO, 'data', n), 'utf8'));
export const readSrc = (rel) => readFileSync(join(REPO, rel), 'utf8');

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

// 氷術師の status passive（StatusEffectManager へ乗率として押し込むもの）。
// 実データ由来で解決する（ID をテスト側にハードコードしない）。
export const FROST_PASSIVES = DATA.jobs.find((j) => j.id === 'frost_mage').passiveSkillPool.slice();
export const STATUS_MODIFIER_KEYS = ['chillDecay', 'iceStatusDuration'];
export function statusPassiveIds() {
  return DATA.passives
    .filter((p) => (p.modifiers || []).some((m) => STATUS_MODIFIER_KEYS.includes(m.key)))
    .map((p) => p.id);
}

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

// ---- Phaser の最小スタブ（import を通すためだけ・数値に関与しない）----
function installPhaserStub() {
  if (globalThis.Phaser && globalThis.Phaser.__statusPassiveStub) return;
  class Sprite { constructor() { this.body = { velocity: { x: 0, y: 0 } }; } }
  globalThis.Phaser = {
    __statusPassiveStub: true,
    Scene: class { constructor() {} },
    Physics: { Arcade: { Sprite, Image: Sprite } },
    GameObjects: { Container: class {}, Graphics: class {}, Sprite, Image: Sprite, Text: class {} },
    Math: {
      Clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
      Between: (a) => a, FloatBetween: (a) => a,
      Vector2: class { constructor(x = 0, y = 0) { this.x = x; this.y = y; } set(x, y) { this.x = x; this.y = y; return this; } normalize() { return this; } scale() { return this; } },
    },
    BlendModes: { ADD: 1, NORMAL: 0 },
    Input: { Keyboard: { JustDown: () => false } },
    Utils: { Array: { GetRandom: (a) => a[0] } },
  };
  globalThis.window = globalThis.window || {};
  globalThis.document = globalThis.document || { addEventListener() {}, removeEventListener() {} };
}

// production モジュールを読み込む（DataManager は実データで初期化する）。
export async function bootRuntime() {
  installPhaserStub();
  const { DataManager } = await import('../src/systems/DataManager.js');
  for (const [k, v] of Object.entries({
    skills: { skills: DATA.skills }, skillEvolutions: { evolutions: DATA.evolutions }, balance: DATA.balance,
    skillMastery: DATA.skillMastery, passives: { passives: DATA.passives }, jobs: { jobs: DATA.jobs },
    skillConfig: DATA.skillConfig, jobProgression: DATA.jobProgression, statusEffects: DATA.statusEffects,
  })) DataManager.data[k] = v;
  for (const s of DATA.skills) DataManager._skillMap.set(s.id, s);
  DataManager.loaded = true;
  const bs = await import('../src/scenes/BattleScene.js');
  const pm = await import('../src/systems/PassiveManager.js');
  const sem = await import('../src/systems/StatusEffectManager.js');
  const ser = await import('../src/systems/StatusEffectRegistry.js');
  const fs = await import('../src/systems/FreezeSystem.js');
  const sm = await import('../src/systems/SkillManager.js');
  return {
    DataManager,
    BattleScene: bs.BattleScene,
    PassiveManager: pm.PassiveManager,
    StatusEffectManager: sem.StatusEffectManager,
    StatusEffectRegistry: ser.StatusEffectRegistry,
    FreezeSystem: fs.FreezeSystem,
    SkillManager: sm.SkillManager,
  };
}

// production の StatusEffectManager を実データで組み立てる（乗率の受け皿）。
export function makeStatusFx(mods, opts = {}) {
  const registry = new mods.StatusEffectRegistry(DATA.statusEffects);
  const freezeSys = new mods.FreezeSystem(registry, null);
  let now = opts.now || 1000;
  const fx = new mods.StatusEffectManager({
    registry, freezeSystem: freezeSys,
    now: () => now,
    seed: opts.seed || 12345,
    cap: () => 400,
  });
  fx.__setNow = (v) => { now = v; };
  fx.__advance = (ms) => { now += ms; };
  return fx;
}

// BattleScene の**本物のメソッド**だけを載せた最小の器を作る。
// Phaser の Scene ライフサイクルを起動せず、対象メソッドが読むフィールドだけを用意する。
export function makeSceneStub(mods, opts = {}) {
  const passives = new mods.PassiveManager(null);
  passives.setDefs(DATA.passives, DATA.skillConfig);
  const statusFx = makeStatusFx(mods, opts);
  const proto = mods.BattleScene.prototype;
  const stub = {
    jobId: opts.jobId || 'frost_mage',
    passives,
    statusFx,
    // 戦士側の非回帰確認用（warrior が無ければ _refreshWarriorMods は即 return する）。
    warrior: opts.warrior || null,
    jobMods: opts.jobMods || null,
    player: opts.player || null,
    isWarrior: (opts.jobId || 'frost_mage') === 'warrior',
    // 呼び出し回数の計測（テストからのみ参照する）。
    __rebuilds: 0,
    // production のメソッドをそのまま束縛する。
    _refreshStatusPassives() { stub.__rebuilds += 1; return proto._refreshStatusPassives.call(stub); },
    _refreshStatusPassivesIfNeeded(force) { return proto._refreshStatusPassivesIfNeeded.call(stub, force); },
    _refreshWarriorMods(force) { return proto._refreshWarriorMods.call(stub, force); },
    _applyWarriorMaxHp() { return proto._applyWarriorMaxHp.call(stub); },
  };
  return stub;
}

// 現在 StatusEffectManager に入っている乗率（private フィールドを読むのはテストのみ）。
export function statusMods(fx) {
  return { chillDecayMult: fx._chillDecayMult, iceStatusDurationMult: fx._iceStatusDurationMult };
}

// data から「passive を level まで取ったときの期待乗率」を計算する（実装とは独立に求める）。
export function expectedStatusMods(levels) {
  let addDecay = 0, subDecay = 0, addDur = 0, subDur = 0;
  for (const [id, lv] of Object.entries(levels || {})) {
    if (!(lv > 0)) continue;
    const def = DATA.passives.find((p) => p.id === id);
    if (!def) continue;
    for (const m of def.modifiers || []) {
      const amt = (m.perLevel || 0) * lv;
      if (m.key === 'chillDecay') { if (m.op === 'subMult') subDecay += amt; else addDecay += amt; }
      if (m.key === 'iceStatusDuration') { if (m.op === 'subMult') subDur += amt; else addDur += amt; }
    }
  }
  return {
    chillDecayMult: Math.max(0.5, 1 + addDecay - subDecay), // PassiveManager の下限クランプと一致させる
    iceStatusDurationMult: 1 + addDur - subDur,
  };
}
