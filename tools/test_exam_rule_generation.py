import csv
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from parse_doboku2ji import IMAGE_URLS_BY_QID, classify_tags  # noqa: E402
from import_question_images import (  # noqa: E402
    IMAGE_SPECS,
    R7_Q10_REFERENCE_URL,
    apply_local_image_updates,
    build_upload_items,
)


def main() -> None:
    assert classify_tags("H28", 1) == "必須問題"
    assert classify_tags("H28", 2) == "選択問題(1)"
    assert classify_tags("R2", 6) == "選択問題(1)"
    assert classify_tags("R2", 7) == "選択問題(2)"
    assert classify_tags("R3", 3) == "必須問題"
    assert classify_tags("R3", 4) == "選択問題(1)"
    assert classify_tags("R7", 8) == "選択問題(2)"

    with (ROOT / "data" / "doboku2ji_questions.csv").open(
        encoding="utf-8-sig", newline=""
    ) as handle:
        rows = list(csv.DictReader(handle))

    assert len(rows) == 110
    by_qid = {row["qId"]: row for row in rows}
    for row in rows:
        expected = classify_tags(row["year"], int(row["number"]))
        assert expected in row["tags"], (row["qId"], row["tags"], expected)

    assert "設置届に関する" in by_qid["Q_R7_02"]["stem"]
    assert "設置、届に関する" not in by_qid["Q_R7_02"]["stem"]

    r7_q10 = next(spec for spec in IMAGE_SPECS if spec["qId"] == "Q_R7_10")
    assert r7_q10["pages"] == [10]
    assert r7_q10["imageRequired"] is False
    assert r7_q10["pdfUrl"].startswith("https://www.jctc.jp/")
    assert r7_q10["repoOutputPath"] == "images/doboku2ji/Q_R7_10_reference.png"
    assert r7_q10["publicUrl"] == R7_Q10_REFERENCE_URL
    assert IMAGE_URLS_BY_QID["Q_R7_10"] == [R7_Q10_REFERENCE_URL]
    assert by_qid["Q_R7_10"]["imageRequired"] == ""
    assert by_qid["Q_R7_10"]["imageUrls"] == json.dumps([R7_Q10_REFERENCE_URL])
    assert (ROOT / r7_q10["repoOutputPath"]).is_file()

    with tempfile.TemporaryDirectory() as tmp:
        sample_image = Path(tmp) / "Q_R7_10.png"
        sample_image.write_bytes(b"png-test")
        items = build_upload_items("Q_R7_10", [sample_image], image_required=False)
    assert items[0]["imageRequired"] is False
    assert items[0]["qId"] == "Q_R7_10"

    updated = apply_local_image_updates(
        [{"qId": "Q_R7_10", "imageRequired": "true", "imageUrls": ""}],
        {"Q_R7_10": ["https://example.invalid/reference.png"]},
        {"Q_R7_10": False},
    )
    assert updated[0]["imageRequired"] == ""
    assert "reference.png" in updated[0]["imageUrls"]
    print("doboku exam rule generation and image import checks passed")


if __name__ == "__main__":
    main()
