"""저장된 센터링 비율로 예상 등급만 다시 계산한다.

    py tools/regrade.py

card-centering 스킬의 grading_standards.json(회사별 기준표)이 바뀌었을 때 쓴다.
사진을 다시 재지 않고 cards/<세트>/<번호>-centering.json의 grades만 고친 뒤 cards.js를 다시 만든다.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILL = Path("C:/blog_writing/.claude/skills/card-centering/scripts")
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(SKILL))


def regrade(cards_dir: Path) -> int:
    from grading import load_standards, max_grades

    standards = load_standards()
    n = 0
    for path in sorted(Path(cards_dir).rglob("*-centering.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        faces = {s: {"lr": data[s]["ratio_lr"], "tb": data[s]["ratio_tb"]}
                 for s in ("front", "back") if s in data and data[s].get("ratio_lr") is not None}
        data["grades"] = max_grades(faces.get("front"), faces.get("back"), standards) if faces else None
        path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        n += 1
    return n


def main():
    import build

    n = regrade(ROOT / "cards")
    print(f"센터링 결과 {n}개의 예상 등급을 다시 계산했어요")
    build.main()


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
