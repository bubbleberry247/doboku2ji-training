"""
import_question_images.py - 土木2次の図表PDFページをPNG化してGAS/Driveへ登録する

Usage:
  python tools/import_question_images.py --url <exec_url> --maintenance-token <token>
  python tools/import_question_images.py --dry-run
"""
import argparse
import base64
import csv
import json
import os
from pathlib import Path
import sys
import time
import urllib.parse
import urllib.request

try:
    import fitz
except Exception as exc:
    raise SystemExit("PyMuPDF(fitz) が必要です: pip install pymupdf") from exc

try:
    from PIL import Image
except Exception as exc:
    raise SystemExit("Pillow が必要です: pip install pillow") from exc

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = REPO_ROOT / "data" / "doboku2ji_questions.csv"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "output" / "question-images"

IMAGE_SPECS = [
    {
        "qId": "Q_H28_10",
        "pdfUrl": "https://dobokujira.com/wp-content/uploads/2021/05/h28_1doboku_jitti_doboku.pdf",
        "pdfName": "H28_1doboku_02_mondai.pdf",
        "pages": [9],
        "crop": [0.03, 0.20, 0.99, 0.66],
    },
    {
        "qId": "Q_H30_11",
        "pdfUrl": "https://dobokujira.com/wp-content/uploads/2021/05/h30_1doboku_jitti_doboku.pdf",
        "pdfName": "H30_1doboku_02_mondai.pdf",
        "pages": [9],
        "crop": [0.12, 0.23, 0.90, 0.92],
    },
    {
        "qId": "Q_R1_10",
        "pdfUrl": "https://dobokujira.com/wp-content/uploads/2021/05/r1_1doboku_jitti_doboku.pdf",
        "pdfName": "R1_1doboku_02_mondai.pdf",
        "pages": [9],
        "crop": [0.04, 0.20, 0.87, 0.64],
    },
    {
        "qId": "Q_R3_10",
        "pdfUrl": "https://dobokujira.com/wp-content/uploads/2021/10/r3_1doboku_jitti_doboku.pdf",
        "pdfName": "R3_1doboku_02_mondai.pdf",
        "pages": [9],
        "crop": [0.04, 0.18, 0.98, 0.88],
    },
    {
        "qId": "Q_R3_11",
        "pdfUrl": "https://dobokujira.com/wp-content/uploads/2021/10/r3_1doboku_jitti_doboku.pdf",
        "pdfName": "R3_1doboku_02_mondai.pdf",
        "pages": [10],
        "crop": [0.08, 0.18, 0.94, 0.94],
    },
    {
        "qId": "Q_R4_05",
        "pdfUrl": "https://dobokujira.com/wp-content/uploads/2022/10/221003d_mondai.pdf",
        "pdfName": "R4_1doboku_02_mondai.pdf",
        "pages": [5],
        "crop": [0.48, 0.43, 0.92, 0.82],
    },
    {
        "qId": "Q_R4_08",
        "pdfUrl": "https://dobokujira.com/wp-content/uploads/2022/10/221003d_mondai.pdf",
        "pdfName": "R4_1doboku_02_mondai.pdf",
        "pages": [8],
        "crop": [0.42, 0.27, 0.75, 0.43],
    },
    {
        "qId": "Q_R4_09",
        "pdfUrl": "https://dobokujira.com/wp-content/uploads/2022/10/221003d_mondai.pdf",
        "pdfName": "R4_1doboku_02_mondai.pdf",
        "pages": [8],
        "crop": [0.08, 0.55, 0.85, 0.92],
    },
    {
        "qId": "Q_R5_11",
        "pdfUrl": "https://dobokujira.com/wp-content/uploads/2023/10/20231002d_mondai.pdf",
        "pdfName": "R5_1doboku_02_mondai.pdf",
        "pages": [9],
        "crop": [0.10, 0.18, 0.92, 0.94],
    },
    {
        "qId": "Q_R6_05",
        "pdfUrl": "https://dobokujira.com/wp-content/uploads/2024/10/R6_1doboku_02_mondai.pdf",
        "pdfName": "R6_1doboku_02_mondai.pdf",
        "pages": [6],
        "crop": [0.08, 0.54, 0.78, 0.94],
    },
    {
        "qId": "Q_R6_08",
        "pdfUrl": "https://dobokujira.com/wp-content/uploads/2024/10/R6_1doboku_02_mondai.pdf",
        "pdfName": "R6_1doboku_02_mondai.pdf",
        "pages": [9],
        "crop": [0.34, 0.27, 0.66, 0.43],
    },
    {
        "qId": "Q_R7_11",
        "pdfUrl": "https://www.jctc.jp/wjctcp/wp-content/uploads/2025/10/20251006d_mondai.pdf",
        "pdfName": "20251006d_mondai.pdf",
        "pages": [11],
        "crop": [0.10, 0.18, 0.92, 0.94],
    }
]


def request_json(url: str, *, data: dict | None = None, timeout: int = 120) -> dict:
    body = None
    headers = {}
    method = "GET"
    if data is not None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
        method = "POST"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def add_query(url: str, params: dict) -> str:
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}{urllib.parse.urlencode(params)}"


def get_import_token(exec_url: str, maintenance_token: str) -> str:
    data = request_json(add_query(exec_url, {
        "action": "initImportToken",
        "maintenanceToken": maintenance_token,
    }), timeout=30)
    if data.get("_error"):
        raise RuntimeError(f"initImportToken failed: {data}")
    token = str(data.get("token", ""))
    if not token:
        raise RuntimeError(f"initImportToken returned no token: {data}")
    return token


def resolve_pdf(spec: dict, pdf_dir: Path, cache_dir: Path, download: bool) -> Path:
    candidates = [
        pdf_dir / spec["pdfName"],
        pdf_dir / f"{spec['qId']}.pdf",
        cache_dir / spec["pdfName"],
    ]
    if spec["qId"] == "Q_R7_11":
        candidates.append(REPO_ROOT / "output" / "source-pdfs" / "r07_doboku2ji_mondai.pdf")
    for candidate in candidates:
        if candidate.exists():
            return candidate
    if not download:
        raise FileNotFoundError(f"{spec['qId']}: PDFが見つかりません")
    cache_dir.mkdir(parents=True, exist_ok=True)
    target = cache_dir / spec["pdfName"]
    print(f"[*] download {spec['qId']}: {spec['pdfUrl']}")
    req = urllib.request.Request(spec["pdfUrl"], headers={"User-Agent": "doboku2ji-image-importer/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = resp.read()
    if not body.startswith(b"%PDF"):
        raise RuntimeError(f"{spec['qId']}: PDFではない応答です")
    target.write_bytes(body)
    return target


def crop_rendered_image(path: Path, crop_rect: list[float] | None = None) -> tuple[int, int]:
    image = Image.open(path).convert("RGB")
    width, height = image.size
    if crop_rect:
        left = max(0, min(width, int(width * crop_rect[0])))
        top = max(0, min(height, int(height * crop_rect[1])))
        right = max(left + 1, min(width, int(width * crop_rect[2])))
        bottom = max(top + 1, min(height, int(height * crop_rect[3])))
        image = image.crop((left, top, right, bottom))
        width, height = image.size
    mask = image.convert("L").point(lambda p: 255 if p < 246 else 0)
    bbox = mask.getbbox()
    if not bbox:
        return image.size
    pad_x = int(width * 0.025)
    pad_y = int(height * 0.025)
    left = max(0, bbox[0] - pad_x)
    top = max(0, bbox[1] - pad_y)
    right = min(width, bbox[2] + pad_x)
    bottom = min(height, bbox[3] + pad_y)
    cropped = image.crop((left, top, right, bottom))
    cropped.save(path)
    return cropped.size


def render_pages(pdf_path: Path, spec: dict, pages: list[int], output_dir: Path, scale: float, crop: bool) -> list[Path]:
    qid_dir = output_dir / spec["qId"]
    qid_dir.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(pdf_path)
    try:
        paths: list[Path] = []
        for page_no in pages:
            if page_no < 1 or page_no > doc.page_count:
                raise ValueError(f"{spec['qId']}: page {page_no} はPDF範囲外です")
            page = doc.load_page(page_no - 1)
            pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
            suffix = "figure" if crop else "page"
            out = qid_dir / f"{spec['qId']}_{suffix}_p{page_no:02d}.png"
            if out.exists():
                out = qid_dir / f"{spec['qId']}_{suffix}_p{page_no:02d}_{int(time.time())}.png"
            pix.save(out)
            if crop:
                crop_rendered_image(out, spec.get("crop"))
            paths.append(out)
        return paths
    finally:
        doc.close()


def upload_images(exec_url: str, token: str, qid: str, paths: list[Path]) -> list[str]:
    items = []
    for path in paths:
        items.append({
            "qId": qid,
            "filename": path.name,
            "mimeType": "image/png",
            "base64Data": base64.b64encode(path.read_bytes()).decode("ascii"),
        })
    data = request_json(exec_url, data={
        "token": token,
        "action": "importQuestionImages",
        "replaceExisting": True,
        "images": items,
    }, timeout=180)
    if data.get("_error"):
        raise RuntimeError(f"{qid}: importQuestionImages failed: {data}")
    if data.get("errors"):
        raise RuntimeError(f"{qid}: image import errors: {data['errors']}")
    return [str(v) for v in (data.get("imageUrlsByQId", {}).get(qid) or [])]


def update_local_csv(urls_by_qid: dict[str, list[str]]) -> None:
    rows = []
    with DATA_FILE.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        for row in reader:
            qid = row.get("qId", "")
            if qid in urls_by_qid:
                row["imageRequired"] = "true"
                row["imageUrls"] = json.dumps(urls_by_qid[qid], ensure_ascii=False)
            rows.append(row)
    with DATA_FILE.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"[+] local data updated: {len(urls_by_qid)} questions")


def main() -> int:
    parser = argparse.ArgumentParser(description="土木2次 図表画像インポート")
    parser.add_argument("--url", default="", help="GAS exec URL")
    parser.add_argument("--maintenance-token", default="", help="未指定時は MAINTENANCE_TOKEN 環境変数")
    parser.add_argument("--pdf-dir", default=str(DEFAULT_OUTPUT_DIR / "pdfs"), help="手動配置PDFディレクトリ")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="生成PNG出力先")
    parser.add_argument("--only", default="", help="カンマ区切りqId。指定時は対象だけ生成する")
    parser.add_argument("--scale", type=float, default=2.0, help="PDFレンダリング倍率")
    parser.add_argument("--dry-run", action="store_true", help="PNG生成まで。GASにはPOSTしない")
    parser.add_argument("--no-download", action="store_true", help="PDFをダウンロードしない")
    parser.add_argument("--no-update-data", action="store_true", help="アップロード後にローカルCSVを更新しない")
    parser.add_argument("--full-page", action="store_true", help="白余白を切り抜かずページ全体を登録する")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    pdf_dir = Path(args.pdf_dir)
    only = {v.strip() for v in args.only.split(",") if v.strip()}
    specs = [spec for spec in IMAGE_SPECS if not only or spec["qId"] in only]
    if not specs:
        raise SystemExit("--only に一致するqIdがありません")

    rendered: dict[str, list[Path]] = {}
    for spec in specs:
        pdf_path = resolve_pdf(spec, pdf_dir, output_dir / "pdfs", download=not args.no_download)
        pngs = render_pages(pdf_path, spec, spec["pages"], output_dir, args.scale, crop=not args.full_page)
        rendered[spec["qId"]] = pngs
        print(f"[+] {spec['qId']}: {pdf_path.name} pages={spec['pages']} images={[str(p) for p in pngs]}")

    if args.dry_run:
        print("[DRY RUN] upload skipped")
        return 0
    maintenance_token = (args.maintenance_token or os.environ.get("MAINTENANCE_TOKEN", "")).strip()
    if not args.url:
        raise SystemExit("--url is required unless --dry-run")
    if not maintenance_token:
        raise SystemExit("MAINTENANCE_TOKEN is required unless --dry-run")

    token = get_import_token(args.url, maintenance_token)
    urls_by_qid: dict[str, list[str]] = {}
    for qid, paths in rendered.items():
        print(f"[*] upload {qid}: {len(paths)} image(s)")
        urls = upload_images(args.url, token, qid, paths)
        urls_by_qid[qid] = urls
        print(f"[+] {qid}: {len(urls)} url(s)")
    if not args.no_update_data:
        update_local_csv(urls_by_qid)
    print("[OK] question images imported")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
