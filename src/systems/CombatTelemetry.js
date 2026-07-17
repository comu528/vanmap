// CombatTelemetry: 1 周回ぶんの戦闘テレメトリを集計する純クラス（Phaser 非依存）。
// BattleScene が実時間で feed するが、テストではヘッドレスに駆動できる。
// 設計方針:
//   - すべてのメソッドは防御的（NaN/Infinity を無視、例外を投げない）。
//   - 集計は O(スキル数)。フレーム時間は 1ms 刻みのヒストグラム（0..200ms・201バケツ、
//     上限超過は末尾へ）で保持し、全フレームに対する近似 p95 を O(1)/フレームで得る（バウンド済み）。
//   - finalize() は plain object（JSON 化可能）を返す。欠損値は 0（数値をでっち上げない）。
//
// defensiveValue の式（比較用の単一スカラー）:
//   defensiveValue = blockedDamage
//                  + healed
//                  + absorbedBullets   * BULLET_DMG_EST   (弾1発 ≒ 25 被弾ダメージ換算)
//                  + lethalAvoided     * LETHAL_AVOID_EST  (致死回避1回 ≒ 実HP1000相当)
//   直感: 「肩代わり/回復した実効ダメージ量」に、回避が難しく価値の高い致死回避へ大きな定数を与えたもの。
//   火力スキルの estimatedDps とは別軸だが、防御スキル同士の相対比較に使える。

const BULLET_DMG_EST = 25;     // 吸収した弾1発あたりの被弾ダメージ換算
const LETHAL_AVOID_EST = 1000; // 致死回避1回あたりの実効HP換算（大きめの定数）
const FRAME_BUCKETS = 201;     // 0..200ms（末尾はオーバーフロー）

function isNum(x) { return typeof x === 'number' && Number.isFinite(x); }
function num(x, d = 0) { return isNum(x) ? x : d; }

export class CombatTelemetry {
  constructor(header = {}) {
    const h = header || {};
    this.run = {
      runId: h.runId != null ? String(h.runId) : '',
      seed: num(h.seed, 0),
      difficulty: h.difficulty != null ? h.difficulty : null,
      quality: h.quality != null ? String(h.quality) : '',
      speed: num(h.speed, 1),
      jobId: h.jobId != null ? String(h.jobId) : '',
      jobLevelAtStart: num(h.jobLevelAtStart, 0),
      debugRun: !!h.debugRun,
    };
    this.skills = new Map(); // skillId -> stat object
    this.caps = Object.create(null); // capName -> count（run 全体で到達したキャップ）
    this.result = null;      // noteRunResult で設定
    // フレーム集計
    this._frameCount = 0;
    this._frameSumMs = 0;
    this._frameMaxMs = 0;
    this._hist = new Array(FRAME_BUCKETS).fill(0);
  }

  _skill(id) {
    if (id == null) return null;
    const key = String(id);
    let s = this.skills.get(key);
    if (!s) {
      s = {
        acquiredAtLevel: 0, acquireOrder: 0, finalLevel: 0,
        evolved: false, evolutionId: '', baseId: '',
        casts: 0, hits: 0, kills: 0, damage: 0,
        dotDamage: 0, explosionDamage: 0, projectileDamage: 0, summonDamage: 0,
        echoCasts: 0, cloneCasts: 0,
        highestConcurrentObjects: 0, capReachedCount: 0,
        activeMs: 0,
        // 防御系
        blockedDamage: 0, lethalAvoided: 0, absorbedBullets: 0,
        healed: 0, dashBoosts: 0, hpSpent: 0,
      };
      this.skills.set(key, s);
    }
    return s;
  }

  noteSkillAcquired(skillId, battleLevel, order) {
    const s = this._skill(skillId); if (!s) return;
    if (isNum(battleLevel)) s.acquiredAtLevel = battleLevel;
    if (isNum(order)) s.acquireOrder = order;
    if (isNum(battleLevel)) s.finalLevel = Math.max(s.finalLevel, 1);
  }

  noteSkillEvolved(baseId, evolutionId) {
    if (baseId != null) { const b = this._skill(baseId); if (b) b.evolved = true; }
    if (evolutionId != null) {
      const e = this._skill(evolutionId);
      if (e) { e.evolved = true; e.baseId = baseId != null ? String(baseId) : ''; }
      const b = this._skill(baseId);
      if (b) b.evolutionId = String(evolutionId);
    }
  }

  addSkillStat(skillId, delta) {
    const s = this._skill(skillId); if (!s || !delta) return;
    // 加算系
    for (const k of ['casts', 'hits', 'kills', 'damage', 'dotDamage', 'explosionDamage',
      'projectileDamage', 'summonDamage', 'echoCasts', 'cloneCasts', 'capReachedCount']) {
      if (isNum(delta[k])) s[k] += delta[k];
    }
    // max 系
    if (isNum(delta.highestConcurrentObjects)) {
      s.highestConcurrentObjects = Math.max(s.highestConcurrentObjects, delta.highestConcurrentObjects);
    }
    if (isNum(delta.finalLevel)) s.finalLevel = Math.max(s.finalLevel, delta.finalLevel);
  }

  setSkillLevel(skillId, level, evolved) {
    const s = this._skill(skillId); if (!s) return;
    if (isNum(level)) s.finalLevel = Math.max(s.finalLevel, level);
    if (evolved != null) s.evolved = s.evolved || !!evolved;
  }

  addDefensiveStat(skillId, delta) {
    const s = this._skill(skillId); if (!s || !delta) return;
    for (const k of ['blockedDamage', 'lethalAvoided', 'absorbedBullets', 'healed', 'dashBoosts', 'hpSpent']) {
      if (isNum(delta[k])) s[k] += delta[k];
    }
  }

  addActiveTime(skillId, ms) {
    const s = this._skill(skillId); if (!s) return;
    if (isNum(ms) && ms > 0) s.activeMs += ms;
  }

  noteFrame(frameMs) {
    if (!isNum(frameMs) || frameMs <= 0) return;
    this._frameCount++;
    this._frameSumMs += frameMs;
    if (frameMs > this._frameMaxMs) this._frameMaxMs = frameMs;
    let b = Math.floor(frameMs);
    if (b < 0) b = 0; else if (b >= FRAME_BUCKETS) b = FRAME_BUCKETS - 1;
    this._hist[b]++;
  }

  noteCapReached(name) {
    if (name == null) return;
    const k = String(name);
    this.caps[k] = (this.caps[k] || 0) + 1;
  }

  noteRunResult(r) {
    if (!r) return;
    const src = r;
    this.result = {
      survivalSeconds: num(src.survivalSeconds),
      victory: !!src.victory,
      battleLevel: num(src.battleLevel),
      totalKills: num(src.totalKills),
      eliteKills: num(src.eliteKills),
      bossKills: num(src.bossKills),
      totalDamage: num(src.totalDamage),
      damageTaken: num(src.damageTaken),
      activeSlots: num(src.activeSlots),
      passiveSlots: num(src.passiveSlots),
      rerolls: num(src.rerolls),
      banishes: num(src.banishes),
      skips: num(src.skips),
      evolutions: num(src.evolutions),
    };
  }

  _frameP95Ms() {
    if (this._frameCount <= 0) return 0;
    const need = Math.ceil(this._frameCount * 0.95);
    let cum = 0;
    for (let i = 0; i < FRAME_BUCKETS; i++) {
      cum += this._hist[i];
      if (cum >= need) return i;
    }
    return FRAME_BUCKETS - 1;
  }

  finalize() {
    const totalDamage = this.result ? num(this.result.totalDamage) : 0;
    const skills = {};
    for (const [id, s] of this.skills) {
      const activeSeconds = s.activeMs / 1000;
      const estimatedDps = s.damage / Math.max(activeSeconds, 1);
      const damageShare = totalDamage > 0 ? s.damage / totalDamage : 0;
      const defensiveValue = s.blockedDamage + s.healed
        + s.absorbedBullets * BULLET_DMG_EST
        + s.lethalAvoided * LETHAL_AVOID_EST;
      skills[id] = {
        acquiredAtLevel: num(s.acquiredAtLevel), acquireOrder: num(s.acquireOrder),
        finalLevel: num(s.finalLevel), evolved: !!s.evolved,
        evolutionId: s.evolutionId || '', baseId: s.baseId || '',
        casts: num(s.casts), hits: num(s.hits), kills: num(s.kills), damage: num(s.damage),
        dotDamage: num(s.dotDamage), explosionDamage: num(s.explosionDamage),
        projectileDamage: num(s.projectileDamage), summonDamage: num(s.summonDamage),
        echoCasts: num(s.echoCasts), cloneCasts: num(s.cloneCasts),
        highestConcurrentObjects: num(s.highestConcurrentObjects),
        capReachedCount: num(s.capReachedCount),
        activeSeconds: num(activeSeconds),
        blockedDamage: num(s.blockedDamage), lethalAvoided: num(s.lethalAvoided),
        absorbedBullets: num(s.absorbedBullets), healed: num(s.healed),
        dashBoosts: num(s.dashBoosts), hpSpent: num(s.hpSpent),
        estimatedDps: num(estimatedDps), damageShare: num(damageShare),
        defensiveValue: num(defensiveValue),
      };
    }
    const avgFps = this._frameCount > 0 ? 1000 / (this._frameSumMs / this._frameCount) : 0;
    const minFps = this._frameMaxMs > 0 ? 1000 / this._frameMaxMs : 0;
    const run = {
      ...this.run,
      ...(this.result || {}),
      caps: { ...this.caps },
      avgFps: num(avgFps), minFps: num(minFps), frameP95Ms: num(this._frameP95Ms()),
      frameCount: this._frameCount,
    };
    return { run, skills };
  }
}

export const TELEMETRY_CONSTANTS = { BULLET_DMG_EST, LETHAL_AVOID_EST, FRAME_BUCKETS };
