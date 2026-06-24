"""
doboku2ji の年度別 JSON（ページ単位テキスト）を
問題単位 CSV に変換するスクリプト。

出力: data/doboku2ji_questions.csv
フォーマット: qId, year, number, questionType, stem, modelAnswer, tags, status, imageRequired, imageUrls

使い方:
    python tools/parse_doboku2ji.py
    python tools/parse_doboku2ji.py --output C:/tmp/doboku2ji_questions_candidate.csv

フォーマット (JSON入力):
    { "name": "...", "page_count": N, "pages": ["ページテキスト", ...] }
"""
import argparse
import json
import csv
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
DATA_DIR = REPO_ROOT / "data"

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# 年度ファイル名から era を抽出: doboku2ji_R7_text.json → R7
ERA_RE = re.compile(r'doboku2ji_([HhRr]\d+)_text\.json', re.IGNORECASE)
QUESTION_MARKER_RE = re.compile(r'【問題[\s\S]{0,20}?】')
PAGE_NUMBER_RE = r'(?:―|\\-|-)\s*\d+\s*(?:―|\\-|-)'
INTERSTITIAL_TAIL_RE = re.compile(
    rf'(?:\n|\s)?{PAGE_NUMBER_RE}\s*[\s\S]*(?:選択問題|解答用紙の選択欄)[\s\S]*$'
)
OCR_LITERAL_FIXES = {
    'コンクリー卜': 'コンクリート',
}
IMAGE_REQUIRED_QIDS = {
    'Q_H28_10',
    'Q_H30_11',
    'Q_R1_10',
    'Q_R3_10',
    'Q_R3_11',
    'Q_R4_05',
    'Q_R4_08',
    'Q_R4_09',
    'Q_R5_11',
    'Q_R6_05',
    'Q_R6_08',
    'Q_R7_11',
}


def extract_year(filename: str) -> str:
    m = ERA_RE.search(filename)
    if not m:
        return "Unknown"
    raw = m.group(1)
    # Normalize: first char uppercase, rest as-is
    return raw[0].upper() + raw[1:]


def find_question_spans(full_text: str) -> list[tuple[int, int, int]]:
    """
    Return list of (question_number, start_pos, end_pos) for each question found.
    end_pos is start of the next question (or end of text).

    The source PDFs use custom glyphs. Text extraction may turn problem numbers
    into control characters, so the only stable delimiter is the 【問題...】
    marker itself. Question numbers are assigned by marker order.

    Keep the match to the marker token only. Some source lines contain the
    beginning of the question body immediately after the marker, and replacing
    the full line would delete valid text.
    """
    hits = [match.start() for match in QUESTION_MARKER_RE.finditer(full_text)]

    if not hits:
        return []

    spans: list[tuple[int, int, int]] = []
    for index, start in enumerate(hits):
        end = hits[index + 1] if index + 1 < len(hits) else len(full_text)
        spans.append((index + 1, start, end))

    return spans


def classify_tags(num: int) -> str:
    """Classify question by number into standard tag."""
    if num <= 3:
        return "必須問題"
    elif num <= 7:
        return "選択問題(1)"
    else:
        return "選択問題(2)"


def build_legacy_experience_stem(theme: str, has_traffic_exclusion: bool) -> str:
    exclusion = '\nただし、交通誘導員の配置のみに関する記述は除く。' if has_traffic_exclusion else ''
    return (
        f"【問題1】あなたが経験した土木工事の現場において、その現場状況から特に留意した{theme}に関して、次の〔設問1〕、〔設問2〕に答えなさい。\n"
        "〔注意〕あなたが経験した工事でないことが判明した場合は失格となります。\n\n"
        "〔設問1〕あなたが経験した土木工事に関し、次の事項について解答欄に明確に記述しなさい。\n"
        "〔注意〕「経験した土木工事」は、あなたが工事請負者の技術者の場合は、あなたの所属会社が受注した工事内容について記述してください。したがって、あなたの所属会社が二次下請業者の場合は、発注者名は一次下請業者名となります。\n"
        "なお、あなたの所属が発注機関の場合の発注者名は、所属機関名となります。\n"
        "(1) 工事名\n"
        "(2) 工事の内容\n"
        "  1 発注者名\n"
        "  2 工事場所\n"
        "  3 工期\n"
        "  4 主な工種\n"
        "  5 施工量\n"
        "(3) 工事現場における施工管理上のあなたの立場\n\n"
        f"〔設問2〕上記工事の現場状況から特に留意した{theme}に関し、次の事項について解答欄に具体的に記述しなさい。{exclusion}\n"
        "(1) 具体的な現場状況と特に留意した技術的課題\n"
        "(2) 技術的課題を解決するために検討した項目と検討理由及び検討内容\n"
        "(3) 上記検討の結果、現場で実施した対応処置とその評価"
    )


def build_modern_experience_stem(theme1: str, theme2: str, theme2_lead: str, has_traffic_exclusion: bool, env_examples: bool) -> str:
    exclusion = '\nただし、交通誘導員の配置のみに関する記述は除く。' if has_traffic_exclusion else ''
    examples = (
        "\n\n〈環境対策の例〉\n"
        "周辺環境対策: 周辺地域の生活環境への対策(騒音や振動、水質汚濁、土壌汚染等)\n"
        "自然環境対策: 周辺地域の動植物等の生態系の保全対策\n"
        "建設副産物等対策: 建設副産物の発生抑制や分別解体、再使用、再資源化、適正な処理、再利用、CO2排出量削減等の対策"
        if env_examples else ''
    )
    second_1 = (
        '施工計画立案に先立ち行った現場の事前調査で判明した施工上の課題'
        if theme2 == '施工計画'
        else f'施工に際し判明した、{theme2}上の技術的課題と、その課題を解決するために検討した項目'
    )
    second_2 = '施工計画の作成にあたり反映した対応処置' if theme2 == '施工計画' else '検討項目の対応処置'
    return (
        "【問題1】あなたが経験した土木工事を1つ選び、工事概要を具体的に記述したうえで、次の〔設問1〕、〔設問2〕に答えなさい。\n"
        "なお、あなたが経験した工事でないことが判明した場合は、失格となります。\n\n"
        "〔工事概要〕\n"
        "あなたが経験した土木工事に関し、次の事項について解答欄に明確に記述しなさい。\n"
        "〔注意〕「経験した土木工事」は、あなたが工事請負者の技術者の場合は、あなたの所属会社が受注した工事内容について記述してください。例えば、あなたの所属会社が二次下請業者の場合は、発注者名は一次下請業者名となります。\n"
        "なお、あなたの所属が発注機関の場合の発注者名は、所属機関名となります。\n"
        "(1) 工事名\n"
        "(2) 工事現場における施工管理上のあなたの立場\n"
        "(3) 工事の内容\n"
        "  1 発注者名\n"
        "  2 工事場所\n"
        "  3 工期\n"
        "  4 主な工種\n"
        "  5 施工量\n\n"
        f"〔設問1〕工事概要に記述した工事の「{theme1}」に関し、次の事項について解答欄に具体的に記述しなさい。{exclusion}\n"
        f"(1) 具体的な現場状況と特に留意した{theme1}上の技術的課題と、その課題を解決するために検討した項目\n"
        "(2) (1)で記述した検討項目の対応処置とその評価\n\n"
        f"〔設問2〕工事概要に記述した工事の「{theme2}」{theme2_lead}に関し、次の事項について解答欄に具体的に記述しなさい。\n"
        f"ただし、設問1と同一内容の解答は不可とする。{examples}\n"
        f"(1) {second_1}\n"
        f"(2) (1)で記述した課題について{second_2}とその評価"
    )


def normalize_question1_stem(year: str, stem: str) -> str:
    if year in {'H28', 'H29', 'R3', 'R4'}:
        return build_legacy_experience_stem('安全管理', True)
    if year in {'H30', 'R1', 'R2', 'R5'}:
        return build_legacy_experience_stem('品質管理', False)
    if year == 'R6':
        return build_modern_experience_stem('安全管理', '施工計画', 'の作成', True, False)
    if year == 'R7':
        return build_modern_experience_stem('品質管理', '環境対策', '', False, True)
    return stem


def clean_text(text: str, question_number: int) -> str:
    """Clean up OCR artifacts and truncate."""
    text = QUESTION_MARKER_RE.sub(f'【問題{question_number}】', text, count=1)
    # Remove interstitial selection instructions captured before the next marker.
    text = INTERSTITIAL_TAIL_RE.sub('', text)
    # Remove page numbers like -1-, -10-
    text = re.sub(rf'\n?{PAGE_NUMBER_RE}\s*$', '', text)
    # Remove markdown-style heading markers
    text = re.sub(r'^#+ ', '', text, flags=re.MULTILINE)
    # Remove section labels that appear between problems
    text = re.sub(r'(?m)^\s*(必須問題|選択問題（.*?）|選択問題\\\(.*?\\\))\s*$', '', text)
    text = re.sub(r'問題1\s+1', '問題11', text)
    for before, after in OCR_LITERAL_FIXES.items():
        text = text.replace(before, after)
    # Collapse 3+ blank lines into 2
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def build_model_answer(year: str, question_number: int, stem: str) -> str:
    if 'あなたが経験した土木工事' in stem:
        body = (
            "この問題は経験記述を含む問題である。実際に担当した土木工事に置き換えて、次の骨子で答案を作る。\n\n"
            "1. 工事概要\n"
            "工事名、発注者名、工事場所、工期、主な工種、施工量、自分の立場を具体的に書く。\n\n"
            "2. 技術的課題\n"
            "現場条件から、安全管理、品質管理、工程管理、施工計画、土工・地盤上の課題を1つに絞る。\n\n"
            "3. 検討項目\n"
            "施工方法、使用機械、材料、手順、計測・確認方法、協力会社との調整を具体化する。\n\n"
            "4. 対応処置と評価\n"
            "実施内容、確認記録、是正措置、結果を事実ベースでまとめる。"
        )
    else:
        body = (
            f"{year} 問題{question_number} の記述答案は、設問で求められた個数を守り、次の形でまとめる。\n\n"
            "採点観点:\n"
            "- テーマ: 施工管理\n"
            "- 施工条件、発生し得る不具合・災害、管理方法、確認記録、是正措置を具体的に書く。\n"
            "- 理由又は効果を添え、単なる用語列挙にしない。\n"
            "- 問題文で除外された事項や、同一内容の重複記述は避ける。"
        )

    return (
        "【解答例（参考）】\n"
        "※この解答例は学習用の参考答案・採点観点です。公式解答ではありません。"
        "実際の受験指導や社内基準に合わせて調整してください。\n\n"
        f"{body}"
    )


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
            'stem': clean_text(full_text, 0),
            'modelAnswer': '',
            'tags': '記述式'
        }]

    questions = []
    for (num_int, start, end) in spans:
        raw_stem = full_text[start:end]
        stem = clean_text(raw_stem, num_int)
        num_str = str(num_int)
        q_id = f'Q_{year}_{num_int:02d}'
        if num_int == 1:
            stem = normalize_question1_stem(year, stem)
        tag = classify_tags(num_int)
        tags = f'記述式,{tag}'
        if num_int != 1:
            tags += ',教師データ未整備'
        if q_id in IMAGE_REQUIRED_QIDS:
            tags += ',図表必要'
        questions.append({
            'qId': q_id,
            'year': year,
            'number': num_str,
            'questionType': 'essay',
            'stem': stem,
            'modelAnswer': build_model_answer(year, num_int, stem),
            'tags': tags,
            'status': 'published' if num_int == 1 else 'needs_model_answer',
            'imageRequired': 'true' if q_id in IMAGE_REQUIRED_QIDS else '',
            'imageUrls': ''
        })

    return questions


def main() -> None:
    parser = argparse.ArgumentParser(description='Parse doboku2ji page JSON files into question CSV.')
    parser.add_argument('--output', type=Path, default=DATA_DIR / 'doboku2ji_questions.csv')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

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

    out = args.output
    fieldnames = ['qId', 'year', 'number', 'questionType', 'stem', 'modelAnswer', 'tags', 'status', 'imageRequired', 'imageUrls']
    if args.dry_run:
        print(f'\nTotal: {len(all_questions)} questions (dry-run)')
        return

    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, 'w', newline='', encoding='utf-8-sig') as fp:
        writer = csv.DictWriter(fp, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_questions)

    print(f'\nTotal: {len(all_questions)} questions → {out}')


if __name__ == '__main__':
    main()
