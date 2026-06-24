"""
import_scoring_rubrics.py - doboku2jiの採点ルーブリックをGASへ投入する

Usage:
  python tools/import_scoring_rubrics.py --url <exec_url> [--maintenance-token <token>] [--dry-run]
"""
import argparse
import json
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = REPO_ROOT / "data" / "scoring_rubrics.json"
BATCH_SIZE = 20


def load_rubrics(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("scoring_rubrics.json must be a list")
    out = []
    for item in data:
        qid = str(item.get("qId", "")).strip()
        if not qid:
            raise ValueError("qId is required")
        rubric_json = item.get("rubricJson") or {}
        if not isinstance(rubric_json, dict):
            raise ValueError(f"{qid}: rubricJson must be an object")
        out.append({
            "qId": qid,
            "responseType": str(item.get("responseType", "")).strip(),
            "sourceQuality": str(item.get("sourceQuality", "")).strip(),
            "scoreMode": str(item.get("scoreMode", "")).strip(),
            "maxScore": item.get("maxScore", 10),
            "rubricJson": rubric_json,
            "reviewStatus": str(item.get("reviewStatus", "")).strip(),
        })
    return out


def get_token(exec_url: str, maintenance_token: str = "") -> str:
    query = {"action": "initImportToken"}
    if maintenance_token:
        query["maintenanceToken"] = maintenance_token
    sep = "&" if "?" in exec_url else "?"
    safe_query = dict(query)
    if "maintenanceToken" in safe_query:
        safe_query["maintenanceToken"] = "****"
    print(f"[*] トークン取得: {exec_url}{sep}{urllib.parse.urlencode(safe_query)}")
    url = f"{exec_url}{sep}{urllib.parse.urlencode(query)}"
    with urllib.request.urlopen(urllib.request.Request(url), timeout=30) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    token = body.get("token", "")
    if not token:
        raise RuntimeError(f"トークン取得失敗: {body}")
    print("[+] トークン取得成功")
    return token


def post_batch(exec_url: str, token: str, batch: list[dict]) -> dict:
    payload = json.dumps({
        "token": token,
        "action": "importRubrics",
        "rubrics": batch,
    }, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        exec_url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="doboku2ji 採点ルーブリック投入")
    parser.add_argument("--url", required=True, help="GAS exec URL")
    parser.add_argument("--dry-run", action="store_true", help="データ検証のみ")
    parser.add_argument("--data", default=str(DATA_FILE), help=f"ルーブリックJSON (default: {DATA_FILE})")
    parser.add_argument("--maintenance-token", default="", help="未指定時は環境変数 MAINTENANCE_TOKEN")
    args = parser.parse_args()
    maintenance_token = args.maintenance_token or os.environ.get("MAINTENANCE_TOKEN", "")

    rubrics = load_rubrics(Path(args.data))
    print(f"[+] {len(rubrics)}件 読み込み完了")
    print(f"    scoreMode: {sorted(set(r['scoreMode'] for r in rubrics))}")
    if args.dry_run:
        print(json.dumps(rubrics[:3], ensure_ascii=False, indent=2))
        return 0

    token = get_token(args.url, maintenance_token)
    totals = {"imported": 0, "updated": 0, "skipped": 0}
    batches = [rubrics[i:i + BATCH_SIZE] for i in range(0, len(rubrics), BATCH_SIZE)]
    for i, batch in enumerate(batches, 1):
        print(f"[*] バッチ {i}/{len(batches)} ({len(batch)}件) 送信中...")
        try:
            result = post_batch(args.url, token, batch)
        except urllib.error.HTTPError as e:
            print(f"[!] HTTP {e.code}: {e.read().decode()}", file=sys.stderr)
            return 1
        if result.get("_error"):
            print(f"[!] エラー: {result.get('message')}", file=sys.stderr)
            return 1
        for key in totals:
            totals[key] += int(result.get(key, 0))
        print(f"[+] バッチ {i} 完了: imported={result.get('imported', 0)}, updated={result.get('updated', 0)}, skipped={result.get('skipped', 0)}")
        if i < len(batches):
            time.sleep(2)
    print(f"[OK] 完了: imported={totals['imported']}, updated={totals['updated']}, skipped={totals['skipped']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
