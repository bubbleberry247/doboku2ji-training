"""
import_doboku2ji.py — doboku2jiのQuestionBankに問題データを投入する

使い方:
  python tools/import_doboku2ji.py --url <exec_url> [--maintenance-token <token>] [--dry-run]

  --dry-run: GASにPOSTせずデータ変換結果のみ表示
"""
import argparse
import csv
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import urllib.error

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

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
            status = row.get("status", "published").strip() or "published"
            image_required = row.get("imageRequired", "").strip()
            image_urls = row.get("imageUrls", "").strip()

            # qIdが空の場合は生成
            if not q_id:
                num_padded = str(number).zfill(2)
                q_id = f"Q_{year}_{num_padded}"

            rows.append([q_id, year, number, q_type, stem, model_answer, tags, status, image_required, image_urls])

    return rows


def get_token(exec_url: str, maintenance_token: str = "") -> str:
    query = {"action": "initImportToken"}
    if maintenance_token:
        query["maintenanceToken"] = maintenance_token
    url = f"{exec_url}?{urllib.parse.urlencode(query)}"
    safe_query = dict(query)
    if "maintenanceToken" in safe_query:
        safe_query["maintenanceToken"] = "****"
    print(f"[*] トークン取得: {exec_url}?{urllib.parse.urlencode(safe_query)}")
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
    parser.add_argument("--maintenance-token", default="", help="未指定時は環境変数 MAINTENANCE_TOKEN")
    args = parser.parse_args()
    maintenance_token = args.maintenance_token or os.environ.get("MAINTENANCE_TOKEN", "")

    # データ読み込み
    data_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), DATA_FILE)
    print(f"[*] データ読み込み: {data_path}")
    rows = load_questions(data_path)
    print(f"[+] {len(rows)}行 読み込み完了")

    years = sorted(set(r[1] for r in rows))
    statuses = sorted(set(r[7] for r in rows))
    print(f"    年度: {years}")
    print(f"    status: {statuses}")

    if args.dry_run:
        print("\n[DRY RUN] 最初の3行のサンプル:")
        headers = ["qId", "year", "number", "questionType", "stem", "modelAnswer", "tags", "status", "imageRequired", "imageUrls"]
        for row in rows[:3]:
            sample = dict(zip(headers, row))
            print(json.dumps(sample, ensure_ascii=False, indent=2))
        print(f"\n合計 {len(rows)} 行をインポート予定（--dry-run のため実行せず）")
        return

    if not maintenance_token:
        print("[ERROR] MAINTENANCE_TOKEN is missing", file=sys.stderr)
        sys.exit(1)

    # トークン取得
    token = get_token(args.url, maintenance_token)

    # バッチ送信
    total_imported = 0
    total_updated = 0
    total_unchanged = 0
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
            updated = result.get("updated", 0)
            unchanged = result.get("unchanged", 0)
            skipped = result.get("skipped", 0)
            total_imported += imported
            total_updated += updated
            total_unchanged += unchanged
            total_skipped += skipped
            print(f"[+] バッチ {i} 完了: imported={imported}, updated={updated}, unchanged={unchanged}, skipped={skipped}")
        except urllib.error.HTTPError as e:
            print(f"[!] HTTP {e.code}: {e.read().decode()}", file=sys.stderr)
            sys.exit(1)

        if i < len(batches):
            time.sleep(2)  # GAS rate limit対策

    print(f"\n[OK] 完了: imported={total_imported}, updated={total_updated}, unchanged={total_unchanged}, skipped={total_skipped}")


if __name__ == "__main__":
    main()
