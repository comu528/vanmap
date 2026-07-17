// 弾（火球ほか）。オブジェクトプールで再利用する。
// M6-B: 追尾(homing)・分裂/連鎖の世代・ダメージタグ・所有者を追加。再利用時に全状態を初期化する。

import { TEX } from '../config/game-config.js';

export class Projectile extends Phaser.Physics.Arcade.Sprite {
  constructor(scene) {
    super(scene, 0, 0, TEX.FIREBALL);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setBlendMode(Phaser.BlendModes.ADD);
    this._hitSet = new Set();
    this._clearState();
  }

  _clearState() {
    this.alive = false;
    this.damage = 0;
    this.pierce = 0;
    this.pierceFalloff = 1;
    this.knockback = 0;
    this.explosionRadius = 0;
    this.hostile = false;       // true = 敵（ボス）弾。プレイヤーへ命中判定する
    this.skillId = null;        // 与ダメージ集計用（プレイヤー弾）
    this.behavior = null;       // 'chain' 等（checkCollisions で分岐）
    this.owner = null;
    this.element = 'fire';
    this.tag = null;            // ダメージタグ（sourceCategory/isExplosion 等）
    this.speed = 0;
    // M7-A: 氷属性の状態異常（命中時に冷気付与→凍結判定）。
    this.chillAmount = 0;
    this.baseFreezeChance = 0;
    this.procCoefficient = 1;
    this.hitGroupId = null;      // 同一発動の凍結判定回数上限に使う
    this.bonusPerChill = 0;      // 冷気1あたりの追加ダメージ倍率（氷槍）
    this.frozenBonus = 0;        // 凍結中の敵への追加ダメージ倍率（ダイヤモンドブリザード）
    this.shatterOnFrozen = false;// 凍結中の敵へ命中したら粉砕（氷槍・氷河槍）
    this.shatterMultiplier = 1;
    this.fragmentCount = 0;      // 粉砕地点から飛散する小型氷片の数（天穿氷河槍・氷片から再粉砕しない）
    this.fragmentDamageFactor = 0;
    // 追尾
    this.homingRate = 0;        // rad/ms
    this.homingSpeed = 0;
    this.homingTarget = null;
    this.wanderMs = 0;
    this.retargets = 0;
    // 世代・連鎖
    this.generation = 0;
    this.chainIndex = 0;
    this.chainRange = 0;
    this.chainCount = 0;
    this.chainFalloff = 0.85;
    this.chainVisited = null;   // 連鎖の共有 visited（Set 参照）
    this.ramp = 0;             // 連続命中ごとの威力上昇率（thousand lances）
    this._rampBase = 0;
    this.splitGen = 0;         // 分裂の残り世代
    this.splitCount = 0;
    this.splitFactor = 0.55;
    // 反射（M6-D 跳炎弾）
    this.bounceCount = 0;      // 残り反射回数
    this.bounceDamageFactor = 1; // 反射のたびの威力倍率
    this._retriggerMs = 0;     // 同一敵への再命中待機
    this._recentHits = null;   // Map<enemy, untilTime>（短時間の再命中待機）
    // 敵弾の吸収情報（M6-D 弾喰い炉）。既存敵弾は reset で後方互換の既定値を持つ。
    this.absorbable = false;
    this.absorbValue = 0;
    this.projectileKind = null;  // 'bossBullet' | 'beam' | 'ember' 等
    this.ownerType = null;       // 'player' | 'boss' | 'enemy'
    this.isBossProjectile = false;
    this.isTelegraph = false;
    this.isBeam = false;
    this.consumedByAbility = false; // 吸収/消費済み（多重吸収防止）
    this._lifeTimer = 0;
    this._hitSet.clear();
  }

  reset(x, y, angle, speed, opts = {}) {
    this._clearState();
    this.setPosition(x, y);
    this.hostile = !!opts.hostile;
    this.element = opts.element || 'fire';
    // ジョブレベル（M6-C）: プレイヤーの火属性弾のみ、投射速度(Lv10)＋残響の威力倍率を反映する。
    // 敵弾(hostile)・非火属性へは適用しない。連鎖/分裂の子弾は親 damage を引き継ぐため自然に伝播する。
    const jm = this.scene.jobMods;
    const isFirePlayer = !this.hostile && this.element === 'fire';
    const spdMul = (isFirePlayer && jm) ? jm.projectileSpeedMult() : 1;
    const echoMul = (isFirePlayer && this.scene._echoScale && this.scene._echoScale !== 1) ? this.scene._echoScale : 1;
    speed = speed * spdMul;
    this.damage = opts.damage * echoMul;
    this.pierce = opts.pierce || 0;
    this.pierceFalloff = opts.pierceFalloff || 1;
    this.knockback = opts.knockback || 0;
    this.explosionRadius = opts.explosionRadius || 0;
    this.skillId = opts.skillId || null;
    this.behavior = opts.behavior || null;
    this.owner = opts.owner || null;
    this.tag = opts.tag || null;
    this.speed = speed;
    // M7-A: 氷属性の状態異常フィールド（弾ごとに保持）。
    this.chillAmount = opts.chillAmount || 0;
    this.baseFreezeChance = opts.baseFreezeChance || 0;
    this.procCoefficient = opts.procCoefficient != null ? opts.procCoefficient : 1;
    this.hitGroupId = opts.hitGroupId != null ? opts.hitGroupId : null;
    this.bonusPerChill = opts.bonusPerChill || 0;
    this.frozenBonus = opts.frozenBonus || 0;
    this.shatterOnFrozen = !!opts.shatterOnFrozen;
    this.shatterMultiplier = opts.shatterMultiplier || 1;
    this.fragmentCount = opts.fragmentCount || 0;
    this.fragmentDamageFactor = opts.fragmentDamageFactor || 0;
    // 追尾
    this.homingRate = opts.homingRate || 0;
    this.homingSpeed = (opts.homingSpeed || speed) * spdMul;
    this.homingTarget = opts.homingTarget || null;
    this.wanderMs = opts.wanderMs || 0;
    this.retargets = opts.retargets || 0;
    // 世代・連鎖
    this.generation = opts.generation || 0;
    this.chainIndex = opts.chainIndex || 0;
    this.chainRange = opts.chainRange || 0;
    this.chainCount = opts.chainCount || 0;
    this.chainFalloff = opts.chainFalloff || 0.85;
    this.chainVisited = opts.chainVisited || null;
    this.ramp = opts.ramp || 0;
    this._rampBase = this.ramp > 0 ? this.damage : 0;
    this.splitGen = opts.splitGen || 0;
    this.splitCount = opts.splitCount || 0;
    this.splitFactor = opts.splitFactor || 0.55;
    // 反射（M6-D 跳炎弾）
    this.bounceCount = opts.bounceCount || 0;
    this.bounceDamageFactor = opts.bounceDamageFactor || 1;
    this._retriggerMs = opts.retriggerMs || 0;
    // 敵弾の吸収情報（M6-D）。プレイヤー弾は既定 absorbable=false。
    // 敵弾（hostile）は明示指定が無ければ「通常弾＝吸収可・低価値」を既定にする（後方互換）。
    if (opts.absorbable !== undefined) {
      this.absorbable = !!opts.absorbable; this.absorbValue = opts.absorbValue || 1;
    } else if (this.hostile && !opts.isTelegraph && !opts.isBeam && opts.absorbable !== false) {
      this.absorbable = true; this.absorbValue = opts.absorbValue || 1;
    }
    this.projectileKind = opts.projectileKind || (this.hostile ? 'bossBullet' : null);
    this.ownerType = opts.ownerType || (this.hostile ? 'boss' : 'player');
    this.isBossProjectile = opts.isBossProjectile !== undefined ? !!opts.isBossProjectile : this.hostile;
    this.isTelegraph = !!opts.isTelegraph;
    this.isBeam = !!opts.isBeam;
    this._lifeTimer = opts.lifeMs || 1600;
    this.alive = true;
    this.setActive(true).setVisible(true).setAlpha(1);
    this.setScale(opts.scale || 1);
    this.setTint(opts.tint || 0xffffff);
    this.setRotation(angle);
    this.body.enable = true;
    this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  update(dt) {
    if (!this.alive) return;
    this._lifeTimer -= dt;
    if (this._lifeTimer <= 0) { this.alive = false; return; }

    // 反射（M6-D 跳炎弾）: 画面端（ワールド境界）で反射。反射回数を消費し威力補正を掛ける。
    if (this.behavior === 'ricochet' && this.bounceCount > 0 && this.body) {
      const W = this.scene.worldW || 1600, H = this.scene.worldH || 1200;
      const v = this.body.velocity;
      let bounced = false;
      if ((this.x <= 4 && v.x < 0) || (this.x >= W - 4 && v.x > 0)) { this.setVelocity(-v.x, v.y); bounced = true; }
      if ((this.y <= 4 && v.y < 0) || (this.y >= H - 4 && v.y > 0)) { this.setVelocity(this.body.velocity.x, -v.y); bounced = true; }
      if (bounced) {
        this.bounceCount -= 1;
        this.damage *= (this.bounceDamageFactor || 1);
        this.setRotation(Math.atan2(this.body.velocity.y, this.body.velocity.x));
      }
    }

    // 追尾（wander 経過後に対象へ緩やかに旋回）。対象が死亡したら残り回数内で再捕捉。
    if (this.homingRate > 0) {
      if (this.wanderMs > 0) { this.wanderMs -= dt; }
      else {
        let t = this.homingTarget;
        if ((!t || !t.alive) && this.retargets > 0 && this.scene.nearestTarget) {
          t = this.scene.nearestTarget(this.x, this.y, 100000);
          if (t) { this.homingTarget = t; this.retargets -= 1; }
        }
        if (t && t.alive) {
          const cur = Math.atan2(this.body.velocity.y, this.body.velocity.x);
          const want = Math.atan2(t.y - this.y, t.x - this.x);
          let diff = Phaser.Math.Angle.Wrap(want - cur);
          const maxTurn = this.homingRate * dt;
          diff = Phaser.Math.Clamp(diff, -maxTurn, maxTurn);
          const na = cur + diff;
          this.setVelocity(Math.cos(na) * this.homingSpeed, Math.sin(na) * this.homingSpeed);
          this.setRotation(na);
        }
      }
    }
  }

  // 一つの敵に一度だけ命中させる。true = 命中を受け付けた。
  registerHit(enemy) {
    if (this._hitSet.has(enemy)) return false;
    this._hitSet.add(enemy);
    return true;
  }

  consumePierce() {
    if (this.pierce > 0) { this.pierce--; return true; }
    this.alive = false;
    return false;
  }
}
