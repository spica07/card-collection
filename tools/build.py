"""cards/ 폴더를 훑어 덱 데이터(cards.js)를 만든다.

폴더 구조:
    cards/<NN-세트 이름>/<번호>-<카드 이름>-front.jpg
    cards/<NN-세트 이름>/<번호>-<카드 이름>-back.jpg

- 세트 폴더 앞의 "NN-"은 보여 주는 순서이고 화면에서는 뗀다 (없으면 이름순으로 뒤에).
- 같은 번호의 front/back(또는 앞/뒤)이 카드 한 장이 된다. 번호 순서대로 보여 준다.
- 구분 기호는 - _ 공백 아무거나. 확장자는 jpg jpeg png webp gif.

실행: py tools/build.py   (index.html은 file://로 열어도 되게 JSON 대신 JS로 쓴다)
"""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
SET_RE = re.compile(r"^(\d+)[-_ ]+(.+)$")
CARD_RE = re.compile(
    r"^(?P<no>\d+)(?:[-_ ]+(?P<name>.*?))?[-_ ]+(?P<side>front|back|앞|뒤)$",
    re.IGNORECASE,
)
SIDE = {"front": "front", "앞": "front", "back": "back", "뒤": "back"}
SIDE_KO = {"front": "앞면", "back": "뒷면"}


def _set_key(folder: Path):
    m = SET_RE.match(folder.name)
    if m:
        return (0, int(m.group(1)), m.group(2))
    return (1, 0, folder.name)


def scan(cards_dir: Path):
    """세트 목록과 경고 문구 목록을 돌려준다."""
    cards_dir = Path(cards_dir)
    sets, warnings = [], []
    folders = sorted((p for p in cards_dir.iterdir() if p.is_dir()), key=_set_key) if cards_dir.exists() else []
    for folder in folders:
        m = SET_RE.match(folder.name)
        set_name = m.group(2) if m else folder.name
        by_no: dict[int, dict] = {}
        for f in sorted(folder.iterdir()):
            if not f.is_file() or f.suffix.lower() not in IMAGE_EXT:
                continue
            cm = CARD_RE.match(f.stem)
            if not cm:
                warnings.append(f"[{set_name}] {f.name}: 이름 형식이 달라 뺐어요 (예: 001-카드이름-front.jpg)")
                continue
            no = int(cm.group("no"))
            side = SIDE[cm.group("side").lower()]
            card = by_no.setdefault(no, {"no": no, "name": "", "front": None, "back": None})
            if card[side]:
                warnings.append(f"[{set_name}] {no}번 {SIDE_KO[side]} 사진이 중복이라 {f.name}은 뺐어요")
                continue
            card[side] = f"cards/{folder.name}/{f.name}"
            name = (cm.group("name") or "").strip()
            if name and (side == "front" or not card["name"]):
                card["name"] = name
        if not by_no:
            continue
        cards = [by_no[k] for k in sorted(by_no)]
        for c in cards:
            for side in ("front", "back"):
                if not c[side]:
                    warnings.append(f"[{set_name}] {c['no']}번 {c['name']}: {SIDE_KO[side]} 사진이 없어요")
        sets.append({"name": set_name, "cards": cards})
    data = {"generated": datetime.now().strftime("%Y-%m-%d %H:%M"), "sets": sets}
    return data, warnings


def write_js(data, out: Path):
    text = "window.CARD_DATA = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n"
    Path(out).write_text(text, encoding="utf-8")


def main():
    data, warnings = scan(ROOT / "cards")
    write_js(data, ROOT / "cards.js")
    total = sum(len(s["cards"]) for s in data["sets"])
    print(f"세트 {len(data['sets'])}개, 카드 {total}장을 덱에 넣었어요 → cards.js")
    for s in data["sets"]:
        print(f"  - {s['name']}: {len(s['cards'])}장")
    if warnings:
        print("\n확인할 것:")
        for w in warnings:
            print("  * " + w)


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
