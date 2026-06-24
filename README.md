# doboku2ji-training

土木施工管理技士 二次試験 学習支援アプリ（H28-R7、10年分）

## 概要
- 試験形式: 記述式（経験記述・選択記述）
- データ: H28〜R7 テキスト抽出済み JSON + QuestionBank投入用CSV（110問）
- ステータス: **公開済み**（GAS Webアプリ実装済み）
- 公開URL: https://script.google.com/macros/s/AKfycbzJtYZ7FU986L1TXhqxiIY0ekaNtUBiW6L3XIkP-HDM0241bn9LesUkueiuuAAnr8w9oQ/exec

## データ
- `data/doboku2ji_XX_text.json`: 年度別テキスト抽出済み問題
- `data/doboku2ji_questions.csv`: QuestionBank投入用CSV

## 実装状況
- 年度別一覧、問題一覧、問題詳細、模範解答表示、メモ、自己採点を実装済み
- AI採点の標準設定: `OPENAI_MODEL=gpt-5.4-mini`, `OPENAI_REASONING_EFFORT=low`, `OPENAI_MAX_OUTPUT_TOKENS=1800`
- 2026-06-17: 既存公開IDを @12 に更新し、DB投入済み55問を確認
- 2026-06-17: UserAccess（既存 建築/土木 一次系と同じ26名）と管理画面を追加し、公開IDを @13 に更新
- 2026-06-18: 55問すべてに学習用の参考答案・採点観点を投入し、公開IDを @14 に更新
- 2026-06-21: 週次ミニテスト用にH28〜R7のCSVを110問へ再生成
- 公開診断: 55問 / UserAccess 26名 / admin 8名（公開DBは再投入後に更新確認）
- 注意: `modelAnswer` は公式解答ではなく、学習用の参考答案・採点観点として投入している

## 学習方針（調査済み）
- 記述式は手書き練習が必須（試験本番が手書き）
- アプリの役割: 穴埋め・択一の反復 + 模範解答の研究
- 経験記述: 逆算テンプレート法（評価→対応→課題）
