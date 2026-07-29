// SkillManager: 所持スキルの取得・強化・更新・統計記録を統括する。
// 各スキルの与ダメージ/討伐数/発動回数/命中回数を記録し、リザルトと熟練度(将来)へ渡す。

import { DataManager } from './DataManager.js';
import { FireballSkill } from '../skills/FireballSkill.js';
import { FlamePillarSkill } from '../skills/FlamePillarSkill.js';
import { BurningTrailSkill } from '../skills/BurningTrailSkill.js';
import { OrbitingFlameSkill } from '../skills/OrbitingFlameSkill.js';
import { MeteorSkill } from '../skills/MeteorSkill.js';
import { InfernalBarrageSkill } from '../skills/InfernalBarrageSkill.js';
import { PurgatoryEruptionSkill } from '../skills/PurgatoryEruptionSkill.js';
import { EternalPyreSkill } from '../skills/EternalPyreSkill.js';
// M6-B: 新 active 10種
import { FlameLanceSkill } from '../skills/FlameLanceSkill.js';
import { ScatterFlameSkill } from '../skills/ScatterFlameSkill.js';
import { HomingWispSkill } from '../skills/HomingWispSkill.js';
import { ChainFlameSkill } from '../skills/ChainFlameSkill.js';
import { LavaBombSkill } from '../skills/LavaBombSkill.js';
import { FlameVortexSkill } from '../skills/FlameVortexSkill.js';
import { FireSpiritSkill } from '../skills/FireSpiritSkill.js';
import { PhoenixFeatherSkill } from '../skills/PhoenixFeatherSkill.js';
import { FlameBarrierSkill } from '../skills/FlameBarrierSkill.js';
import { DetonationMarkSkill } from '../skills/DetonationMarkSkill.js';
// M6-B: 新進化5種
import { ThousandFlameLancesSkill } from '../skills/ThousandFlameLancesSkill.js';
import { HundredWispParadeSkill } from '../skills/HundredWispParadeSkill.js';
import { SolarCoreCollapseSkill } from '../skills/SolarCoreCollapseSkill.js';
import { InfernalVortexWheelSkill } from '../skills/InfernalVortexWheelSkill.js';
import { ApocalypseChainSkill } from '../skills/ApocalypseChainSkill.js';
// M6-D: 新 active 10種
import { ScorchingRaySkill } from '../skills/ScorchingRaySkill.js';
import { EmberMinefieldSkill } from '../skills/EmberMinefieldSkill.js';
import { FlameCrescentSkill } from '../skills/FlameCrescentSkill.js';
import { RicochetEmberSkill } from '../skills/RicochetEmberSkill.js';
import { AshDoppelgangerSkill } from '../skills/AshDoppelgangerSkill.js';
import { BloodfirePactSkill } from '../skills/BloodfirePactSkill.js';
import { BulletFurnaceSkill } from '../skills/BulletFurnaceSkill.js';
import { FourSidedInfernoSkill } from '../skills/FourSidedInfernoSkill.js';
import { MoltenChainsSkill } from '../skills/MoltenChainsSkill.js';
import { BlazingStepSkill } from '../skills/BlazingStepSkill.js';
// M6-D: 新進化5種
import { SolarAnnihilationArraySkill } from '../skills/SolarAnnihilationArraySkill.js';
import { HellfireMineNetworkSkill } from '../skills/HellfireMineNetworkSkill.js';
import { InfernoBladeDomainSkill } from '../skills/InfernoBladeDomainSkill.js';
import { AshLegionSkill } from '../skills/AshLegionSkill.js';
import { StarDevouringFurnaceSkill } from '../skills/StarDevouringFurnaceSkill.js';
// M6-E: 新 active 5種
import { FuneralPyresSkill } from '../skills/FuneralPyresSkill.js';
import { MagmaVeinSkill } from '../skills/MagmaVeinSkill.js';
import { TriFlameArraySkill } from '../skills/TriFlameArraySkill.js';
import { ScorchingResonanceSkill } from '../skills/ScorchingResonanceSkill.js';
import { CoreOverdriveSkill } from '../skills/CoreOverdriveSkill.js';
// M6-E: 新進化5種
import { NecroflameMausoleumSkill } from '../skills/NecroflameMausoleumSkill.js';
import { WorldScorchingRiftSkill } from '../skills/WorldScorchingRiftSkill.js';
import { HexagramInfernoArraySkill } from '../skills/HexagramInfernoArraySkill.js';
import { UniversalFlameResonanceSkill } from '../skills/UniversalFlameResonanceSkill.js';
import { DoomsdayCoreSkill } from '../skills/DoomsdayCoreSkill.js';
// M7-A: 氷術師 active5種
import { FrostShardSkill } from '../skills/FrostShardSkill.js';
import { FrostNovaSkill } from '../skills/FrostNovaSkill.js';
import { GlacialLanceSkill } from '../skills/GlacialLanceSkill.js';
import { PermafrostFieldSkill } from '../skills/PermafrostFieldSkill.js';
import { IceWallSkill } from '../skills/IceWallSkill.js';
// M7-A: 氷術師 進化3種
import { DiamondBlizzardSkill } from '../skills/DiamondBlizzardSkill.js';
import { AbsoluteZeroDomainSkill } from '../skills/AbsoluteZeroDomainSkill.js';
import { HeavenPiercingGlacierSkill } from '../skills/HeavenPiercingGlacierSkill.js';
// M7-B: 氷術師 active10種
import { IcicleVolleySkill } from '../skills/IcicleVolleySkill.js';
import { FrostOrbitSkill } from '../skills/FrostOrbitSkill.js';
import { FreezingRaySkill } from '../skills/FreezingRaySkill.js';
import { HailstormSkill } from '../skills/HailstormSkill.js';
import { CryoMineSkill } from '../skills/CryoMineSkill.js';
import { FrostSpiritSkill } from '../skills/FrostSpiritSkill.js';
import { IcePrisonSkill } from '../skills/IcePrisonSkill.js';
import { AvalancheSkill } from '../skills/AvalancheSkill.js';
import { MirrorIceSkill } from '../skills/MirrorIceSkill.js';
import { GlacierDropSkill } from '../skills/GlacierDropSkill.js';
// M7-B: 氷術師 進化5種
import { CrystalTempestSkill } from '../skills/CrystalTempestSkill.js';
import { AbsoluteZeroRaySkill } from '../skills/AbsoluteZeroRaySkill.js';
import { WhiteoutCataclysmSkill } from '../skills/WhiteoutCataclysmSkill.js';
import { FrostQueenCourtSkill } from '../skills/FrostQueenCourtSkill.js';
import { WorldEndAvalancheSkill } from '../skills/WorldEndAvalancheSkill.js';
// M7-C: 氷術師 active10種
import { RimeBoomerangSkill } from '../skills/RimeBoomerangSkill.js';
import { FrostChainSkill } from '../skills/FrostChainSkill.js';
import { CrystalBloomSkill } from '../skills/CrystalBloomSkill.js';
import { SnowblindMistSkill } from '../skills/SnowblindMistSkill.js';
import { PolarStarSkill } from '../skills/PolarStarSkill.js';
import { IcebreakerWaveSkill } from '../skills/IcebreakerWaveSkill.js';
import { FrozenClockSkill } from '../skills/FrozenClockSkill.js';
import { CrystalRefractionSkill } from '../skills/CrystalRefractionSkill.js';
import { WinterHaloSkill } from '../skills/WinterHaloSkill.js';
import { CometSleetSkill } from '../skills/CometSleetSkill.js';
// M7-C: 氷術師 進化5種
import { RimeExecutionWheelSkill } from '../skills/RimeExecutionWheelSkill.js';
import { EternalFrostChainSkill } from '../skills/EternalFrostChainSkill.js';
import { CrystalWorldTreeSkill } from '../skills/CrystalWorldTreeSkill.js';
import { EverlastingWhiteMistSkill } from '../skills/EverlastingWhiteMistSkill.js';
import { ZeroHourWorldSkill } from '../skills/ZeroHourWorldSkill.js';
// M7-D: 氷術師 active5種
import { GlacialSpearRainSkill } from '../skills/GlacialSpearRainSkill.js';
import { SnowflakeSentrySkill } from '../skills/SnowflakeSentrySkill.js';
import { IcebergRamSkill } from '../skills/IcebergRamSkill.js';
import { AbsoluteIceSealSkill } from '../skills/AbsoluteIceSealSkill.js';
import { AuroraVeilSkill } from '../skills/AuroraVeilSkill.js';
// M7-D: 氷術師 進化5種
import { HeavenfallGlacierLancesSkill } from '../skills/HeavenfallGlacierLancesSkill.js';
import { CrystalSentinelLegionSkill } from '../skills/CrystalSentinelLegionSkill.js';
import { ContinentalGlacierRushSkill } from '../skills/ContinentalGlacierRushSkill.js';
import { EternalSealedCoffinSkill } from '../skills/EternalSealedCoffinSkill.js';
import { PolarNightAuroraSkill } from '../skills/PolarNightAuroraSkill.js';
// M8-B: 戦士 active5種
import { ArmorBreakerSkill } from '../skills/ArmorBreakerSkill.js';
import { TwinFangSlashSkill } from '../skills/TwinFangSlashSkill.js';
import { ExecutionStrikeSkill } from '../skills/ExecutionStrikeSkill.js';
import { LeapSmashSkill } from '../skills/LeapSmashSkill.js';
import { SweepingAdvanceSkill } from '../skills/SweepingAdvanceSkill.js';
import { CounterStanceSkill } from '../skills/CounterStanceSkill.js';
import { WarCrySkill } from '../skills/WarCrySkill.js';
import { ChainHookSkill } from '../skills/ChainHookSkill.js';
import { ShockwaveStompSkill } from '../skills/ShockwaveStompSkill.js';
import { RelentlessComboSkill } from '../skills/RelentlessComboSkill.js';
import { SkullSplitterSkill } from '../skills/SkullSplitterSkill.js';
import { CrimsonExecutionSkill } from '../skills/CrimsonExecutionSkill.js';
import { WarGodRoarSkill } from '../skills/WarGodRoarSkill.js';
import { AdamantCounterSkill } from '../skills/AdamantCounterSkill.js';
import { HeavenCrushingDescentSkill } from '../skills/HeavenCrushingDescentSkill.js';
// M8-D: 戦士 active10種 / 進化5種（Wave2）
import { RisingSlashSkill } from '../skills/RisingSlashSkill.js';
import { ShieldChargeSkill } from '../skills/ShieldChargeSkill.js';
import { BackstepRiposteSkill } from '../skills/BackstepRiposteSkill.js';
import { BattlefieldThrowSkill } from '../skills/BattlefieldThrowSkill.js';
import { TripleCrushSkill } from '../skills/TripleCrushSkill.js';
import { BladeGuardSkill } from '../skills/BladeGuardSkill.js';
import { BerserkerRushSkill } from '../skills/BerserkerRushSkill.js';
import { WarAxeThrowSkill } from '../skills/WarAxeThrowSkill.js';
import { BreakerKneeSkill } from '../skills/BreakerKneeSkill.js';
import { RallyingBannerSkill } from '../skills/RallyingBannerSkill.js';
import { HeavenRendingAscentSkill } from '../skills/HeavenRendingAscentSkill.js';
import { FortressRampageSkill } from '../skills/FortressRampageSkill.js';
import { ShadowSwallowRiposteSkill } from '../skills/ShadowSwallowRiposteSkill.js';
import { MountainHurlSkill } from '../skills/MountainHurlSkill.js';
import { BloodOathStandardSkill } from '../skills/BloodOathStandardSkill.js';
// M8-E: 戦士 active5種 / 進化5種（最終Wave）
import { PiercingLungeSkill } from '../skills/PiercingLungeSkill.js';
import { DuelChallengeSkill } from '../skills/DuelChallengeSkill.js';
import { BattleTranceSkill } from '../skills/BattleTranceSkill.js';
import { EarthshakerMarchSkill } from '../skills/EarthshakerMarchSkill.js';
import { WeaponDeflectionSkill } from '../skills/WeaponDeflectionSkill.js';
import { GodspeedImpalerSkill } from '../skills/GodspeedImpalerSkill.js';
import { KingSlayerDuelSkill } from '../skills/KingSlayerDuelSkill.js';
import { BloodAsuraTranceSkill } from '../skills/BloodAsuraTranceSkill.js';
import { ContinentalQuakeMarchSkill } from '../skills/ContinentalQuakeMarchSkill.js';
import { HeavenMirrorReversalSkill } from '../skills/HeavenMirrorReversalSkill.js';
import { GreatCleaveSkill } from '../skills/GreatCleaveSkill.js';
import { ShieldBashSkill } from '../skills/ShieldBashSkill.js';
import { WhirlwindSlashSkill } from '../skills/WhirlwindSlashSkill.js';
import { ChargeSlashSkill } from '../skills/ChargeSlashSkill.js';
import { GroundSlamSkill } from '../skills/GroundSlamSkill.js';
// M8-B: 戦士 進化3種
import { ThousandBladeDanceSkill } from '../skills/ThousandBladeDanceSkill.js';
import { BloodstormWhirlwindSkill } from '../skills/BloodstormWhirlwindSkill.js';
import { UnyieldingFortressSkill } from '../skills/UnyieldingFortressSkill.js';

const REGISTRY = {
  fireball: FireballSkill,
  flame_pillar: FlamePillarSkill,
  burning_trail: BurningTrailSkill,
  orbiting_flame: OrbitingFlameSkill,
  meteor: MeteorSkill,
  // 進化スキル
  infernal_barrage: InfernalBarrageSkill,
  purgatory_eruption: PurgatoryEruptionSkill,
  eternal_pyre: EternalPyreSkill,
  // M6-B: 新 active
  flame_lance: FlameLanceSkill,
  scatter_flame: ScatterFlameSkill,
  homing_wisp: HomingWispSkill,
  chain_flame: ChainFlameSkill,
  lava_bomb: LavaBombSkill,
  flame_vortex: FlameVortexSkill,
  fire_spirit: FireSpiritSkill,
  phoenix_feather: PhoenixFeatherSkill,
  flame_barrier: FlameBarrierSkill,
  detonation_mark: DetonationMarkSkill,
  // M6-B: 新進化
  thousand_flame_lances: ThousandFlameLancesSkill,
  hundred_wisp_parade: HundredWispParadeSkill,
  solar_core_collapse: SolarCoreCollapseSkill,
  infernal_vortex_wheel: InfernalVortexWheelSkill,
  apocalypse_chain: ApocalypseChainSkill,
  // M6-D: 新 active
  scorching_ray: ScorchingRaySkill,
  ember_minefield: EmberMinefieldSkill,
  flame_crescent: FlameCrescentSkill,
  ricochet_ember: RicochetEmberSkill,
  ash_doppelganger: AshDoppelgangerSkill,
  bloodfire_pact: BloodfirePactSkill,
  bullet_furnace: BulletFurnaceSkill,
  four_sided_inferno: FourSidedInfernoSkill,
  molten_chains: MoltenChainsSkill,
  blazing_step: BlazingStepSkill,
  // M6-D: 新進化
  solar_annihilation_array: SolarAnnihilationArraySkill,
  hellfire_mine_network: HellfireMineNetworkSkill,
  inferno_blade_domain: InfernoBladeDomainSkill,
  ash_legion: AshLegionSkill,
  star_devouring_furnace: StarDevouringFurnaceSkill,
  // M6-E: 新 active
  funeral_pyres: FuneralPyresSkill,
  magma_vein: MagmaVeinSkill,
  tri_flame_array: TriFlameArraySkill,
  scorching_resonance: ScorchingResonanceSkill,
  core_overdrive: CoreOverdriveSkill,
  // M6-E: 新進化
  necroflame_mausoleum: NecroflameMausoleumSkill,
  world_scorching_rift: WorldScorchingRiftSkill,
  hexagram_inferno_array: HexagramInfernoArraySkill,
  universal_flame_resonance: UniversalFlameResonanceSkill,
  doomsday_core: DoomsdayCoreSkill,
  // M7-A: 氷術師 active5種
  frost_shard: FrostShardSkill,
  frost_nova: FrostNovaSkill,
  glacial_lance: GlacialLanceSkill,
  permafrost_field: PermafrostFieldSkill,
  ice_wall: IceWallSkill,
  // M7-A: 氷術師 進化3種
  diamond_blizzard: DiamondBlizzardSkill,
  absolute_zero_domain: AbsoluteZeroDomainSkill,
  heaven_piercing_glacier: HeavenPiercingGlacierSkill,
  // M7-B: 氷術師 active10種
  icicle_volley: IcicleVolleySkill,
  frost_orbit: FrostOrbitSkill,
  freezing_ray: FreezingRaySkill,
  hailstorm: HailstormSkill,
  cryo_mine: CryoMineSkill,
  frost_spirit: FrostSpiritSkill,
  ice_prison: IcePrisonSkill,
  avalanche: AvalancheSkill,
  mirror_ice: MirrorIceSkill,
  glacier_drop: GlacierDropSkill,
  // M7-B: 氷術師 進化5種
  crystal_tempest: CrystalTempestSkill,
  absolute_zero_ray: AbsoluteZeroRaySkill,
  whiteout_cataclysm: WhiteoutCataclysmSkill,
  frost_queen_court: FrostQueenCourtSkill,
  world_end_avalanche: WorldEndAvalancheSkill,
  // M7-C: 氷術師 active10種
  rime_boomerang: RimeBoomerangSkill,
  frost_chain: FrostChainSkill,
  crystal_bloom: CrystalBloomSkill,
  snowblind_mist: SnowblindMistSkill,
  polar_star: PolarStarSkill,
  icebreaker_wave: IcebreakerWaveSkill,
  frozen_clock: FrozenClockSkill,
  crystal_refraction: CrystalRefractionSkill,
  winter_halo: WinterHaloSkill,
  comet_sleet: CometSleetSkill,
  // M7-C: 氷術師 進化5種
  rime_execution_wheel: RimeExecutionWheelSkill,
  eternal_frost_chain: EternalFrostChainSkill,
  crystal_world_tree: CrystalWorldTreeSkill,
  everlasting_white_mist: EverlastingWhiteMistSkill,
  zero_hour_world: ZeroHourWorldSkill,
  // M7-D: 氷術師 active5種
  glacial_spear_rain: GlacialSpearRainSkill,
  snowflake_sentry: SnowflakeSentrySkill,
  iceberg_ram: IcebergRamSkill,
  absolute_ice_seal: AbsoluteIceSealSkill,
  aurora_veil: AuroraVeilSkill,
  // M7-D: 氷術師 進化5種
  heavenfall_glacier_lances: HeavenfallGlacierLancesSkill,
  crystal_sentinel_legion: CrystalSentinelLegionSkill,
  continental_glacier_rush: ContinentalGlacierRushSkill,
  eternal_sealed_coffin: EternalSealedCoffinSkill,
  polar_night_aurora: PolarNightAuroraSkill,
  // M8-C: 戦士 active10種（Wave1）
  armor_breaker: ArmorBreakerSkill,
  twin_fang_slash: TwinFangSlashSkill,
  execution_strike: ExecutionStrikeSkill,
  leap_smash: LeapSmashSkill,
  sweeping_advance: SweepingAdvanceSkill,
  counter_stance: CounterStanceSkill,
  war_cry: WarCrySkill,
  chain_hook: ChainHookSkill,
  shockwave_stomp: ShockwaveStompSkill,
  relentless_combo: RelentlessComboSkill,
  // M8-C: 戦士 進化5種（Wave1）
  skull_splitter: SkullSplitterSkill,
  crimson_execution: CrimsonExecutionSkill,
  war_god_roar: WarGodRoarSkill,
  adamant_counter: AdamantCounterSkill,
  heaven_crushing_descent: HeavenCrushingDescentSkill,
  // M8-D: 戦士 active10種（Wave2）
  rising_slash: RisingSlashSkill,
  shield_charge: ShieldChargeSkill,
  backstep_riposte: BackstepRiposteSkill,
  battlefield_throw: BattlefieldThrowSkill,
  triple_crush: TripleCrushSkill,
  blade_guard: BladeGuardSkill,
  berserker_rush: BerserkerRushSkill,
  war_axe_throw: WarAxeThrowSkill,
  breaker_knee: BreakerKneeSkill,
  rallying_banner: RallyingBannerSkill,
  // M8-D: 戦士 進化5種（Wave2）
  heaven_rending_ascent: HeavenRendingAscentSkill,
  fortress_rampage: FortressRampageSkill,
  shadow_swallow_riposte: ShadowSwallowRiposteSkill,
  mountain_hurl: MountainHurlSkill,
  blood_oath_standard: BloodOathStandardSkill,
  // M8-E: 戦士 active5種（最終Wave）
  piercing_lunge: PiercingLungeSkill,
  duel_challenge: DuelChallengeSkill,
  battle_trance: BattleTranceSkill,
  earthshaker_march: EarthshakerMarchSkill,
  weapon_deflection: WeaponDeflectionSkill,
  // M8-E: 戦士 進化5種（最終Wave）
  godspeed_impaler: GodspeedImpalerSkill,
  king_slayer_duel: KingSlayerDuelSkill,
  blood_asura_trance: BloodAsuraTranceSkill,
  continental_quake_march: ContinentalQuakeMarchSkill,
  heaven_mirror_reversal: HeavenMirrorReversalSkill,
  // M8-B: 戦士 active5種
  great_cleave: GreatCleaveSkill,
  shield_bash: ShieldBashSkill,
  whirlwind_slash: WhirlwindSlashSkill,
  charge_slash: ChargeSlashSkill,
  ground_slam: GroundSlamSkill,
  // M8-B: 戦士 進化3種
  thousand_blade_dance: ThousandBladeDanceSkill,
  bloodstorm_whirlwind: BloodstormWhirlwindSkill,
  unyielding_fortress: UnyieldingFortressSkill,
};

// 実装クラスが登録されている全スキルID（active＋進化）。SkillCatalog / 監査テストが「実装の有無」を判定するのに使う。
// 単一の正（REGISTRY）から導出し、別途 id 一覧を二重管理しない。
export function registeredSkillIds() { return Object.keys(REGISTRY); }

// runtimeState（serializeState）を実装するスキルID。途中再開で保存されるスキルの監査に使う。
// SkillBase には serializeState が無いため、prototype に存在すれば固有 runtimeState を持つと判定できる。
export function skillsWithRuntimeState() {
  return Object.keys(REGISTRY).filter((id) => typeof REGISTRY[id].prototype.serializeState === 'function');
}

export class SkillManager {
  constructor(scene) {
    this.scene = scene;
    this.skills = new Map();   // id -> instance
    this.stats = new Map();    // id -> { casts, hits, kills, damage, maxLevel }
    this._masteryBonus = null; // ProgressionManager.masteryBonuses(profile)
    this._evolvedBase = new Set(); // 当該周回で進化済みの基礎スキルID
  }

  // ---- 進化 ----
  // 基礎スキルを進化スキルへ置換する（枠を消費しない）。当該周回で一度のみ。
  evolve(baseId) {
    const ev = DataManager.getEvolutionForBase(baseId);
    if (!ev) return null;
    if (this._evolvedBase.has(baseId)) return null;
    const evoId = ev.replacementSkillId;
    const Cls = REGISTRY[evoId];
    if (!Cls) return null;
    const old = this.skills.get(baseId);
    if (old && old.destroy) old.destroy();
    this.skills.delete(baseId);
    const sk = new Cls(this.scene, evoId, 1);
    this.skills.set(evoId, sk);
    this._evolvedBase.add(baseId);
    this._ensureStats(evoId);
    return evoId;
  }
  hasEvolved(baseId) { return this._evolvedBase.has(baseId); }
  get evolvedBaseIds() { return Array.from(this._evolvedBase); }
  restoreEvolved(list) { for (const b of list || []) this._evolvedBase.add(b); }

  // スキル熟練度ボーナス（戦闘開始時に一度セット）。
  setMasteryBonuses(bonusMap) { this._masteryBonus = bonusMap || null; }
  masteryBonusFor(id) { return this._masteryBonus ? this._masteryBonus[id] : null; }

  _ensureStats(id) {
    if (!this.stats.has(id)) this.stats.set(id, { casts: 0, hits: 0, kills: 0, damage: 0, maxLevel: 0 });
    return this.stats.get(id);
  }

  has(id) { return this.skills.has(id); }
  getLevel(id) { return this.skills.get(id)?.level || 0; }
  count() { return this.skills.size; }

  // アクティブ所持枠の使用数（進化は基礎スキルと同じ枠＝size は不変）。
  activeSlotCount() { return this.skills.size; }
  // ドラフト文脈用: 所持アクティブの id -> level（進化スキルも含む）。
  activeLevels() { const o = {}; for (const [id, sk] of this.skills) o[id] = sk.level; return o; }
  // 進化元となる基礎スキル id の集合（進化済みは基礎 id を返す）。
  baseActiveIds() {
    const ids = [];
    for (const id of this.skills.keys()) {
      const evo = DataManager.getEvolution(id);
      ids.push(evo ? evo.baseSkillId : id);
    }
    return ids;
  }

  // 取得（新規）または強化（+1）。最大レベルで頭打ち。
  // 新規取得時は熟練度の初期レベルボーナス（startLevel）を上乗せする。
  acquireOrLevel(id) {
    if (this.skills.has(id)) {
      const sk = this.skills.get(id);
      if (sk.level < sk.maxLevel) sk.setLevel(sk.level + 1);
      this._ensureStats(id).maxLevel = Math.max(this._ensureStats(id).maxLevel, sk.level);
      return sk.level;
    }
    const Cls = REGISTRY[id];
    if (!Cls) return 0;
    const startBonus = this.masteryBonusFor(id)?.startLevel || 0;
    const sk = new Cls(this.scene, id, 1);
    if (startBonus > 0) sk.setLevel(1 + startBonus);
    this.skills.set(id, sk);
    this._ensureStats(id).maxLevel = Math.max(this._ensureStats(id).maxLevel, sk.level);
    return sk.level;
  }

  setLevel(id, level) {
    if (!this.skills.has(id)) { this.acquireOrLevel(id); }
    const sk = this.skills.get(id);
    if (sk) { sk.setLevel(level); this._ensureStats(id).maxLevel = Math.max(this._ensureStats(id).maxLevel, sk.level); }
  }

  isMaxed(id) {
    const sk = this.skills.get(id);
    return sk ? sk.level >= sk.maxLevel : false;
  }

  ownedList() {
    return Array.from(this.skills.values()).map((s) => ({ id: s.id, name: s.name, level: s.level }));
  }

  update(dt, ctx) {
    this._ctx = ctx; // 残響詠唱の再発動に使う直近の発動コンテキスト（M6-C）
    for (const sk of this.skills.values()) sk.update(dt, ctx);
  }

  // 残響詠唱（M6-C）: スキル id の攻撃挙動を威力倍率つきで安全に再実行する。
  // カウンターは進めない・残響から残響を発生させない（scene 側の castContext ガードと併用）。
  requestEchoCast(id) {
    const sk = this.skills.get(id);
    if (sk && sk.echoCast) sk.echoCast(this._ctx || { hasEnemies: this.scene.hasTargets?.() });
  }

  // 灰燼分身の複製（M6-D）: スキル id の攻撃部分だけを複製再実行する（cloneCast 既定＝echoCast）。
  requestCloneCast(id) {
    const sk = this.skills.get(id);
    if (sk && sk.cloneCast) sk.cloneCast(this._ctx || { hasEnemies: this.scene.hasTargets?.() });
  }

  // ダッシュフック分配（M6-D 爆炎歩法）。phase: 'start'|'move'|'end'。
  dispatchDash(phase, player) {
    for (const sk of this.skills.values()) { if (sk.onDash) sk.onDash(phase, player); }
  }

  // 撃破フック（M6-B: 百鬼燎乱の分裂など）。スキルが onEnemyKilled を実装していれば呼ぶ。
  dispatchKill(enemy, skillId) {
    for (const sk of this.skills.values()) { if (sk.onEnemyKilled) sk.onEnemyKilled(enemy, skillId); }
  }

  // スキル固有 runtimeState の直列化/復元（M6-B: 不死鳥CD・障壁再使用 等）。
  serializeRuntime() {
    const out = {};
    for (const [id, sk] of this.skills) { if (sk.serializeState) { const s = sk.serializeState(); if (s) out[id] = s; } }
    return out;
  }
  restoreRuntime(obj) {
    if (!obj) return;
    for (const [id, state] of Object.entries(obj)) { const sk = this.skills.get(id); if (sk && sk.restoreState) sk.restoreState(state); }
  }

  // スキル固有統計（M6-B: 最高同時存在数・防御スキル統計 等）。
  recordExtra(id, key, value, mode = 'max') {
    const st = this._ensureStats(id);
    st.extra = st.extra || {};
    if (mode === 'max') st.extra[key] = Math.max(st.extra[key] || 0, value);
    else st.extra[key] = (st.extra[key] || 0) + value;
  }

  // ---- 統計 ----
  // 本発動（cooldown 由来の主発動）ごとに呼ばれる共通シグナル。残響詠唱（M6-C）の起点にもなる。
  recordCast(id) { this._ensureStats(id).casts++; if (this.scene._onSkillCast) this.scene._onSkillCast(id); }
  recordHit(id) { this._ensureStats(id).hits++; }
  recordDamage(id, amount) { this._ensureStats(id).damage += amount; }
  recordKill(id) { this._ensureStats(id).kills++; }

  // 統計は進化前後の両方を含める（進化で置換された基礎スキルの記録も残す）。
  statsList() {
    return Array.from(this.stats.entries())
      .filter(([, st]) => (st.casts || st.damage || st.kills))
      .map(([id, st]) => ({
        id,
        name: DataManager.getSkill(id)?.name || DataManager.getEvolution(id)?.displayName || id,
        level: this.getLevel(id), ...st,
      }));
  }

  // ---- セーブ/復元 ----
  serialize() {
    const obj = {};
    for (const [id, sk] of this.skills) obj[id] = sk.level;
    return obj;
  }

  loadFrom(obj) {
    if (!obj) return;
    for (const [id, level] of Object.entries(obj)) {
      if (!REGISTRY[id]) continue;
      this.acquireOrLevel(id);
      this.setLevel(id, level);
    }
  }

  destroy() {
    for (const sk of this.skills.values()) if (sk.destroy) sk.destroy();
    this.skills.clear();
  }
}
