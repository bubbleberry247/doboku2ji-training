"""Verify that the bundled GAS seed exactly matches the canonical CSV."""

from __future__ import annotations

import csv
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from generate_seed_questions import (  # noqa: E402
    FIELDNAMES,
    SEED_PATH,
    canonical_version,
    load_canonical_rows,
)


def load_seed_rows() -> list[list[str]]:
    script = (
        "const fs=require('fs'),vm=require('vm');"
        "const context={};vm.createContext(context);"
        "vm.runInContext(fs.readFileSync('src/seedQuestions.gs','utf8'),context);"
        "process.stdout.write(JSON.stringify(context.DOBOKU2JI_QUESTION_SEED_ROWS_));"
    )
    result = subprocess.run(
        ["node", "-e", script],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return json.loads(result.stdout)


def main() -> None:
    canonical = load_canonical_rows()
    seed = load_seed_rows()
    assert len(seed) == len(canonical) == 110, (len(seed), len(canonical))
    assert all(len(row) == len(FIELDNAMES) for row in seed)
    assert seed == canonical, "seedQuestions.gs rows differ from the canonical CSV"

    version_line = next(
        line
        for line in SEED_PATH.read_text(encoding="utf-8").splitlines()
        if line.startswith("var DOBOKU2JI_QUESTION_SEED_VERSION_")
    )
    expected_version = canonical_version(canonical)
    assert f'"{expected_version}"' in version_line, version_line

    check = subprocess.run(
        [sys.executable, "tools/generate_seed_questions.py", "--check"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert check.returncode == 0, check.stdout + check.stderr
    print(
        f"[OK] {len(seed)} seed rows exactly match canonical CSV "
        f"({expected_version}); generator --check passed"
    )


if __name__ == "__main__":
    main()
