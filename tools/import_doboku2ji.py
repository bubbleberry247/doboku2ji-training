"""
import_doboku2ji.py — doboku2jiのQuestionBankに問題データを投入する

使い方:
  python tools/import_doboku2ji.py --url <exec_url> [--dry-run]

  --dry-run: GASにPOSTせずデータ変換結果のみ表示
"""
import argparse
import csv
import json
import sys
import time
import urllib.request
import urllib.error

DATA_FILE = "data/doboku2ji_questions.csv"
BATCH_SIZE = 20


def load_questions(path: str) -> list[list]:
    rows = []
    with open(path, encoding="utf-8-sig") as f:  # utf-8-sig でBOM除去
        reader = csv.DictReader(f)
        for row in reader:
            q_id = row.get("qId", "").strip()
            year = row.get("year", "").strip()
            number = row.get("number", "").strip()
            q_type = row.get("questionType", "essay").strip()
            stem = row.get("stem", "").strip()
            model_answer = row.get("modelAnswer", "").strip()
            tags = row.get("tags", "").strip()

            # qIdが空の場合は生成
            if not q_id:
                num_padded = str(number).zfill(2)
                q_id = f"Q_{year}_{num_padded}"

            rows.append([q_id, year, number, q_type, stem, model_answer, tags])

    return rows


def get_token(exec_url: str) -> str:
    url = f"{exec_url}?action=initImportToken"
    print(f"[*] トークン取得: {url}")
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    token = body.get("token", "")
    if not token:
        raise RuntimeError(f"トークン取得失敗: {body}")
    print(f"[+] トークン取得成功")
    return token


def post_batch(exec_url: str, token: str, batch: list[list]) -> dict:
    payload = json.dumps({
        "token": token,
        "action": "importQuestions",
        "rows": batch,
    }, ensure_ascii=False).encode("utf-8")

    req = urllib.request.Request(
        exec_url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    parser = argparse.ArgumentParser(description="doboku2ji 問題データ投入")
    parser.add_argument("--url", required=True, help="GAS exec URL")
    parser.add_argument("--dry-run", action="store_true", help="データ変換のみ（POSTしない）")
    args = parser.parse_args()

    # データ読み込み
    import os
    data_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), DATA_FILE)
    print(f"[*] データ読み込み: {data_path}")
    rows = load_questions(data_path)
    print(f"[+] {len(rows)}行 読み込み完了")

    years = sorted(set(r[1] for r in rows))
    print(f"    年度: {years}")

    if args.dry_run:
        print("\n[DRY RUN] 最初の3行のサンプル:")
        headers = ["qId", "year", "number", "questionType", "stem", "modelAnswer", "tags"]
        for row in rows[:3]:
            sample = dict(zip(headers, row))
            print(json.dumps(sample, ensure_ascii=False, indent=2))
        print(f"\n合計 {len(rows)} 行をインポート予定（--dry-run のため実行せず）")
        return

    # トークン取得
    token = get_token(args.url)

    # バッチ送信
    total_imported = 0
    total_skipped = 0
    batches = [rows[i:i+BATCH_SIZE] for i in range(0, len(rows), BATCH_SIZE)]
    print(f"[*] {len(batches)}バッチ（{BATCH_SIZE}行/バッチ）で送信開始")

    for i, batch in enumerate(batches, 1):
        print(f"[*] バッチ {i}/{len(batches)} ({len(batch)}行) 送信中...")
        try:
            result = post_batch(args.url, token, batch)
            if result.get("_error"):
                print(f"[!] エラー: {result.get('message')}", file=sys.stderr)
                sys.exit(1)
            imported = result.get("imported", 0)
            skipped = result.get("skipped", 0)
            total_imported += imported
            total_skipped += skipped
            print(f"[+] バッチ {i} 完了: {imported}行インポート, {skipped}行スキップ")
        except urllib.error.HTTPError as e:
            print(f"[!] HTTP {e.code}: {e.read().decode()}", file=sys.stderr)
            sys.exit(1)

        if i < len(batches):
            time.sleep(2)  # GAS rate limit対策

    print(f"\n✅ 完了: 合計 {total_imported} 行インポート, {total_skipped} 行スキップ")


if __name__ == "__main__":
    main()
