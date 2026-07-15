// SpawnManager: 通常敵の生成・難易度倍率・フェーズ制御・ボス生成・ボス弾/雑魚召喚を担う。
// BattleScene から責務分離（M3）。挙動は M2 と同一（数値・確率・出現位置を変更しない）。

import { DataManager } from './DataManager.js';

export class SpawnManager {
  constructor(scene) {
    this.scene = scene;
    this._spawnAccum = 0;
  }

  get difficulty() { return this.scene.difficulty; }
  get rng() { return this.scene.rng; }

  // 難易度倍率（敵HP/速度/攻撃力）
  enemyMult() {
    const d = this.difficulty;
    return { hp: d.enemyHp, speed: d.enemySpeed, damage: d.enemyDamage };
  }

  currentPhase() {
    const phases = DataManager.balance.run.phases;
    for (const ph of phases) if (this.scene.timeSec >= ph.fromSec && this.scene.timeSec < ph.toSec) return ph;
    return phases[phases.length - 1];
  }

  // 毎フレーム呼ばれる通常湧き処理。
  update(dt) {
    if (this.scene.boss && this.scene.boss.alive) return; // ボス戦中は通常湧きを止める
    const phase = this.currentPhase();
    const pool = this.scene.enemyPool;
    if (pool.activeCount >= Math.min(phase.maxAlive, pool.maxSize)) return;
    this._spawnAccum += dt;
    const interval = phase.spawnIntervalMs / (this.difficulty.spawnRate || 1);
    while (this._spawnAccum >= interval) { this._spawnAccum -= interval; this.spawnEnemy(); }
  }

  _rngPick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }

  pickEnemyType() {
    const t = this.scene.timeSec;
    const pool = DataManager.enemies.filter((e) => t >= (e.spawnFromSec || 0) && !e.elite);
    if (pool.length === 0) return DataManager.getEnemy('slime');
    if (this.rng() < (this.difficulty.eliteRate || 0)) {
      const elites = DataManager.enemies.filter((e) => e.elite && t >= (e.spawnFromSec || 0));
      if (elites.length) return this._rngPick(elites);
    }
    return this._rngPick(pool);
  }

  spawnEnemy() {
    const def = this.pickEnemyType();
    if (!def) return;
    const cam = this.scene.cameras.main;
    const p = this.scene.player;
    const W = this.scene.worldW, H = this.scene.worldH;
    const ang = this.rng() * Math.PI * 2;
    const r = Math.max(cam.width, cam.height) * 0.62;
    const x = Phaser.Math.Clamp(p.x + Math.cos(ang) * r, 20, W - 20);
    const y = Phaser.Math.Clamp(p.y + Math.sin(ang) * r, 20, H - 20);
    this.scene.enemyPool.spawn(def, x, y, this.enemyMult());
  }

  spawnZakoNear(bx, by) {
    const def = this._rngPick(DataManager.enemies.filter((e) => !e.elite)) || DataManager.getEnemy('slime');
    const W = this.scene.worldW, H = this.scene.worldH;
    const ang = this.rng() * Math.PI * 2;
    const x = Phaser.Math.Clamp(bx + Math.cos(ang) * 60, 20, W - 20);
    const y = Phaser.Math.Clamp(by + Math.sin(ang) * 60, 20, H - 20);
    this.scene.enemyPool.spawn(def, x, y, this.enemyMult());
  }

  spawnBossBullet(x, y, angle, speed) {
    this.scene.bossBulletPool.spawn(x, y, angle, speed, {
      damage: (this.scene.boss?.damage || 20) * 0.6, hostile: true, tint: 0xff5252, scale: 0.9, lifeMs: 5000,
    });
  }
}
