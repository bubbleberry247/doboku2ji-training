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
    render_seed,
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


def normalize_newlines(value: str) -> str:
    """Normalize line endings without changing any other character."""
    return value.replace("\r\n", "\n").replace("\r", "\n")


def normalize_rows(rows: list[list[str]]) -> list[list[str]]:
    return [[normalize_newlines(value) for value in row] for row in rows]


def rows_with_newline(rows: list[list[str]], newline: str) -> list[list[str]]:
    return [
        [normalize_newlines(value).replace("\n", newline) for value in row]
        for row in rows
    ]


def assert_seed_matches_canonical(
    seed: list[list[str]], canonical: list[list[str]]
) -> None:
    """Compare every seed field strictly after normalizing line endings."""
    assert len(seed) == len(canonical), (len(seed), len(canonical))
    for row_index, (seed_row, canonical_row) in enumerate(
        zip(normalize_rows(seed), normalize_rows(canonical))
    ):
        assert len(seed_row) == len(FIELDNAMES), (
            row_index,
            len(seed_row),
        )
        assert len(canonical_row) == len(FIELDNAMES), (
            row_index,
            len(canonical_row),
        )
        for field_index, (seed_value, canonical_value) in enumerate(
            zip(seed_row, canonical_row)
        ):
            if seed_value != canonical_value:
                qid = canonical_row[0] if canonical_row else ""
                raise AssertionError(
                    "seedQuestions.gs differs from canonical CSV: "
                    f"row={row_index}, qId={qid!r}, "
                    f"field={FIELDNAMES[field_index]!r}"
                )


def run_comparison_contract_tests() -> None:
    """Prove CRLF/LF-only differences pass and one-character differences fail."""
    fixture = [
        [
            "Q-test",
            "R7",
            "1",
            "essay",
            "本文1\n本文2",
            "解答",
            "タグ",
            "published",
            "true",
            "https://example.test/image.png",
        ]
    ]
    crlf_fixture = rows_with_newline(fixture, "\r\n")
    assert_seed_matches_canonical(crlf_fixture, fixture)

    for field_index in range(len(FIELDNAMES)):
        mutated = [row[:] for row in fixture]
        mutated[0][field_index] += "X"
        try:
            assert_seed_matches_canonical(mutated, fixture)
        except AssertionError as error:
            assert f"field={FIELDNAMES[field_index]!r}" in str(error), error
        else:
            raise AssertionError(
                f"one-character difference was not detected for {FIELDNAMES[field_index]}"
            )


def assert_generator_matches_seed(canonical: list[list[str]], version_line: str) -> str:
    """Check generator output using the seed's LF/CRLF representation."""
    existing = SEED_PATH.read_text(encoding="utf-8")
    versions = {
        canonical_version(rows_with_newline(canonical, "\n")): rows_with_newline(
            canonical, "\n"
        ),
        canonical_version(rows_with_newline(canonical, "\r\n")): rows_with_newline(
            canonical, "\r\n"
        ),
    }
    version = next(
        (candidate for candidate in versions if f'"{candidate}"' in version_line),
        None,
    )
    assert version is not None, version_line
    assert render_seed(versions[version], version, existing) == existing
    return version


def main() -> None:
    canonical = load_canonical_rows()
    seed = load_seed_rows()
    assert len(seed) == len(canonical) == 110, (len(seed), len(canonical))
    assert all(len(row) == len(FIELDNAMES) for row in seed)
    run_comparison_contract_tests()
    assert_seed_matches_canonical(seed, canonical)

    version_line = next(
        line
        for line in SEED_PATH.read_text(encoding="utf-8").splitlines()
        if line.startswith("var DOBOKU2JI_QUESTION_SEED_VERSION_")
    )
    expected_version = assert_generator_matches_seed(canonical, version_line)
    print(
        f"[OK] {len(seed)} seed rows exactly match canonical CSV "
        f"({expected_version}); generator reproduction check passed"
    )


if __name__ == "__main__":
    main()
