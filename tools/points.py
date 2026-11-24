"""저장된 카드 사진으로 세 군데 센터링(points)만 다시 잰다.

    py tools/points.py

비스듬한 카드 확인용. 센터링 결과(<번호>-centering.json)의 면마다, 좌우 비율은 위·가운데·아래,
상하 비율은 왼쪽·가운데·오른쪽에서 따로 잰 값을 points에 넣고 cards.js를 다시 만든다.
원본 사진 없이 덱에 저장된 잘린 사진(756x1056)을 측정 크기(1260x1760)로 키워서 잰다.
원본 사진이 있으면 add.py로 다시 넣는 쪽이 더 정확하고 확인 이미지에도 지점이 그려진다.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILL = Path("C:/blog_writing/.claude/skills/card-centering/scripts")
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(SKILL))


def remeasure(cards_dir: Path, only_missing: bool = False) -> int:
    import cv2
    from card_geom import CARD_H, CARD_W, PX_PER_MM, load_image, three_point

    n = 0
    for path in sorted(Path(cards_dir).rglob("*-centering.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        no = path.name[:3]
        changed = False
        for side in ("front", "back"):
            face = data.get(side)
            if not face or face.get("ratio_lr") is None or (only_missing and face.get("points")):
                continue
            imgs = list(path.parent.glob(f"{no}-*-{side}.jpg"))
            if not imgs:
                continue
            img = cv2.resize(load_image(imgs[0]), (CARD_W, CARD_H), interpolation=cv2.INTER_CUBIC)
            widths = {k: v * PX_PER_MM for k, v in face["border_mm"].items()}
            face["points"] = three_point(img, widths)
            changed = True
        if changed:
            path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
            n += 1
    return n


def main():
    import build

    n = remeasure(ROOT / "cards", only_missing="--missing" in sys.argv)
    print(f"센터링 결과 {n}개에 세 군데 측정값을 넣었어요")
    build.main()


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
