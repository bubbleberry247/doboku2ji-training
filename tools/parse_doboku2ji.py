"""
doboku2ji の年度別 JSON（ページ単位テキスト）を
問題単位 CSV に変換するスクリプト。

出力: data/doboku2ji_questions.csv
フォーマット: qId, year, number, questionType, stem, modelAnswer, tags

使い方:
    python tools/parse_doboku2ji.py

フォーマット (JSON入力):
    { "name": "...", "page_count": N, "pages": ["ページテキスト", ...] }
"""
import json
import csv
import re
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
DATA_DIR = REPO_ROOT / "data"

# 問題番号マッチパターン（土木2次の表記ゆれに対応）
QUESTION_PATTERNS = [
    re.compile(r'【問題\s*(\d+)】'),              # 【問題1】
    re.compile(r'問題\s*(\d+)(?![）\)])'),        # 問題1 (括弧外)
]

# 年度ファイル名から era を抽出: doboku2ji_R7_text.json → R7
ERA_RE = re.compile(r'doboku2ji_([HhRr]\d+)_text\.json', re.IGNORECASE)


def extract_year(filename: str) -> str:
    m = ERA_RE.search(filename)
    if not m:
        return "Unknown"
    raw = m.group(1)
    # Normalize: first char uppercase, rest as-is
    return raw[0].upper() + raw[1:]


def find_question_spans(full_text: str) -> list[tuple[str, int, int]]:
    """
    Return list of (number_str, start_pos, end_pos) for each question found.
    end_pos is start of the next question (or end of text).
    """
    hits: list[tuple[str, int]] = []
    for pat in QUESTION_PATTERNS:
        for m in pat.finditer(full_text):
            hits.append((m.group(1), m.start()))

    if not hits:
        return []

    # Deduplicate: keep earliest occurrence of each number
    seen: dict[str, int] = {}
    for num, pos in hits:
        if num not in seen or pos < seen[num]:
            seen[num] = pos

    # Sort by position
    sorted_hits = sorted(seen.items(), key=lambda x: x[1])

    spans: list[tuple[str, int, int]] = []
    for i, (num, start) in enumerate(sorted_hits):
        end = sorted_hits[i + 1][1] if i + 1 < len(sorted_hits) else len(full_text)
        spans.append((num, start, end))

    return spans


def classify_tags(num: int) -> str:
    """Classify question by number into standard tag."""
    if num <= 3:
        return "必須問題"
    elif num <= 7:
        return "選択問題(1)"
    else:
        return "選択問題(2)"


def clean_text(text: str, max_chars: int = 2000) -> str:
    """Clean up OCR artifacts and truncate."""
    # Remove page numbers like -1-, -10-
    text = re.sub(r'\n-\s*\d+\s*-', '', text)
    # Remove markdown-style heading markers
    text = re.sub(r'^#+ ', '', text, flags=re.MULTILINE)
    # Collapse 3+ blank lines into 2
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()[:max_chars]


def parse_questions_from_pages(pages: list[str], year: str) -> list[dict]:
    full_text = '\n'.join(pages)
    spans = find_question_spans(full_text)

    if not spans:
        # Fallback: treat entire text as one item per year
        return [{
            'qId': f'Q_{year}_00',
            'year': year,
            'number': '0',
            'questionType': 'essay',
            'stem': clean_text(full_text, 1000),
            'modelAnswer': '',
            'tags': '記述式'
        }]

    questions = []
    for (num_str, start, end) in spans:
        raw_stem = full_text[start:end]
        stem = clean_text(raw_stem)
        num_int = int(num_str) if num_str.isdigit() else 0
        q_id = f'Q_{year}_{num_str.zfill(2)}'
        tag = classify_tags(num_int)
        questions.append({
            'qId': q_id,
            'year': year,
            'number': num_str,
            'questionType': 'essay',
            'stem': stem,
            'modelAnswer': '',
            'tags': f'記述式,{tag}'
        })

    return questions


def main() -> None:
    json_files = sorted(DATA_DIR.glob('doboku2ji_*_text.json'))
    if not json_files:
        print(f"No JSON files found in {DATA_DIR}")
        return

    all_questions: list[dict] = []
    for f in json_files:
        year = extract_year(f.name)
        with open(f, encoding='utf-8') as fp:
            data = json.load(fp)
        pages: list[str] = data.get('pages', [])
        qs = parse_questions_from_pages(pages, year)
        all_questions.extend(qs)
        print(f'{year}: {len(qs)} questions extracted from {f.name}')

    out = DATA_DIR / 'doboku2ji_questions.csv'
    fieldnames = ['qId', 'year', 'number', 'questionType', 'stem', 'modelAnswer', 'tags']
    with open(out, 'w', newline='', encoding='utf-8-sig') as fp:
        writer = csv.DictWriter(fp, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_questions)

    print(f'\nTotal: {len(all_questions)} questions → {out}')


if __name__ == '__main__':
    main()
