"""
Generate the bundled GAS QuestionBank seed from the canonical CSV.

The CSV is the source of truth for the ten seed columns.  The GAS file also
contains the runtime seed-sync helpers, so this generator replaces only the
version declaration and the generated row array and preserves the helpers.

Usage:
    python tools/generate_seed_questions.py
    python tools/generate_seed_questions.py --check
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = REPO_ROOT / "data" / "doboku2ji_questions.csv"
SEED_PATH = REPO_ROOT / "src" / "seedQuestions.gs"
FIELDNAMES = [
    "qId",
    "year",
    "number",
    "questionType",
    "stem",
    "modelAnswer",
    "tags",
    "status",
    "imageRequired",
    "imageUrls",
]
SEED_VERSION_RE = re.compile(
    r'var DOBOKU2JI_QUESTION_SEED_VERSION_ = "[^"]*";'
)
SEED_ARRAY_RE = re.compile(
    r"var DOBOKU2JI_QUESTION_SEED_ROWS_ = \[.*?^\];(?=\s*\nvar DOBOKU2JI_IMAGE_REQUIRED_QIDS_)",
    re.MULTILINE | re.DOTALL,
)


def load_canonical_rows(path: Path = CSV_PATH) -> list[list[str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != FIELDNAMES:
            raise ValueError(
                f"Unexpected CSV header: {reader.fieldnames!r}; expected {FIELDNAMES!r}"
            )
        # Do not trim canonical values: whitespace inside a stem, answer, or
        # tag is data and must be reproduced byte-for-byte in the generated
        # seed.  Validation below checks identifiers independently.
        rows = [[row.get(field) or "" for field in FIELDNAMES] for row in reader]

    if not rows:
        raise ValueError("Canonical CSV is empty")

    qids = [row[0].strip() for row in rows]
    if any(not qid for qid in qids):
        raise ValueError("Canonical CSV contains an empty qId")
    if len(qids) != len(set(qids)):
        raise ValueError("Canonical CSV contains duplicate qIds")
    if any(not row[1].strip() or not row[2].strip() for row in rows):
        raise ValueError("Canonical CSV contains a row without year or number")

    valid_bool = {"", "true", "false"}
    invalid_bools = sorted(
        {row[8] for row in rows if row[8].lower() not in valid_bool}
    )
    if invalid_bools:
        raise ValueError(f"Unsupported imageRequired values: {invalid_bools!r}")

    return rows


def canonical_version(rows: list[list[str]]) -> str:
    payload = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:12]
    return f"canonical-csv-{digest}"


def render_seed(rows: list[list[str]], version: str, existing: str) -> str:
    version_line = f'var DOBOKU2JI_QUESTION_SEED_VERSION_ = "{version}";'
    if not SEED_VERSION_RE.search(existing):
        raise ValueError("Could not find QuestionBank seed version declaration")
    if not SEED_ARRAY_RE.search(existing):
        raise ValueError("Could not find generated QuestionBank seed array")

    generated_rows = "\n".join(
        "  " + json.dumps(row, ensure_ascii=True, separators=(", ", ":")) + ","
        for row in rows
    )
    generated_array = (
        "var DOBOKU2JI_QUESTION_SEED_ROWS_ = [\n"
        + generated_rows.rstrip(",")
        + "\n];"
    )
    updated = SEED_VERSION_RE.sub(version_line, existing, count=1)
    return SEED_ARRAY_RE.sub(lambda _match: generated_array, updated, count=1)


def generate(*, check: bool = False) -> bool:
    rows = load_canonical_rows()
    existing = SEED_PATH.read_text(encoding="utf-8")
    rendered = render_seed(rows, canonical_version(rows), existing)
    if check:
        if rendered != existing:
            raise SystemExit(
                "seedQuestions.gs is out of date; run "
                "python tools/generate_seed_questions.py"
            )
        return False

    if rendered == existing:
        return False
    SEED_PATH.write_text(rendered, encoding="utf-8", newline="\n")
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="verify that src/seedQuestions.gs is reproducible without writing it",
    )
    args = parser.parse_args()
    changed = generate(check=args.check)
    if args.check:
        print(f"[OK] canonical rows and {SEED_PATH.relative_to(REPO_ROOT)} are in sync")
    elif changed:
        rows = load_canonical_rows()
        print(
            f"[OK] generated {SEED_PATH.relative_to(REPO_ROOT)} "
            f"from {len(rows)} canonical rows (version {canonical_version(rows)})"
        )
    else:
        print("[OK] seedQuestions.gs already matches the canonical CSV")


if __name__ == "__main__":
    main()
