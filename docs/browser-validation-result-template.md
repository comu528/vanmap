# 実ブラウザ検証 結果テンプレート（Milestone 9-A.1）

`./browser-validation-gate.md` §2 の手順を実施したら、このテンプレートを埋めて
（コピーして日付つきで残すか、gate 文書の §3 を更新して）記録する。

---

## 実施情報

| 項目 | 記入 |
|------|------|
| 実施日 | YYYY-MM-DD |
| 実施者 | |
| コミット（commit ID） | |
| 実施環境（OS / ブラウザ / バージョン） | |
| 配信方法（http-server / python3 / GitHub Pages 本番） | |
| Phaser の取得元（CDN 直 / 同一版差し替え） | |
| 実施方法（手動 / 自動化ツール名） | |

## 結果（各項目 PASS / FAIL / 未実施）

| # | 項目 | 結果 | 実測 / メモ |
|---|------|------|------------|
| 1 | 起動 → Title 到達・console エラー 0 | | |
| 2 | flame_witch 実プレイ 60s（湧き / 弾 / XP / 被弾） | | kills / Lv / HP / エラー数 |
| 3 | frost_mage 実プレイ 60s | | |
| 4 | warrior 実プレイ 60s | | |
| 5 | 4 品質で gameplay 上限が同値（敵 200 / 弾 400 / hitStop 有） | | low / medium / high / ultra の実値 |
| 6 | 品質差が演出のみ（damageNumbers / particleBudget） | | |
| 7 | 周回途中の品質切替（low→ultra→medium）で周回継続 | | |
| 8 | F8 Balance Playtest / 分析パネル開閉・横断バランス節表示 | | |
| 9 | F10 状態異常デバッグ | | |
| 10 | セーブ往復（save_version 6・jobId 保持） | | |
| 11 | 相対パス（失敗リクエスト 0・外部ホスト 0） | | リソース数 |
| 12 | FPS ≥ 30 継続（60s） | | avgFps / fpsMin |
| 13 | メモリが単調増加しない | | heap 実測 |
| 14 | 長時間（10 分 / 2 倍速）の FPS / メモリ傾向 | | |
| 15 | 高負荷（敵 100 / 弾多数 / boss+elite）の実 FPS | | |
| 16 | 手入力の操作感（ダッシュ / 移動） | | |

## エラーログ（console error / pageerror / requestfailed）

```
（0 件なら「0 件」と記入。1 件でもあれば全文を貼る）
```

## 未確認として残す項目

- （実施しなかった項目を列挙し、gate 文書 §4 と一致させる）

## 判定

- [ ] 合格（§2 の合否基準をすべて満たす）
- [ ] 不合格（失敗項目と再現手順を上に記録した）
