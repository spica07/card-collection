"""cards/ 폴더를 훑어 덱 데이터(cards.js)를 만든다.

폴더 구조:
    cards/<NN-세트 이름>/<번호>-<카드 이름>-front.jpg
    cards/<NN-세트 이름>/<번호>-<카드 이름>-back.jpg

- 세트 폴더 앞의 "NN-"은 보여 주는 순서이고 화면에서는 뗀다 (없으면 이름순으로 뒤에).
- 같은 번호의 front/back(또는 앞/뒤)이 카드 한 장이 된다. 번호 순서대로 보여 준다.
- 같은 폴더의 <번호>-centering.json(tools/add.py가 만든 센터링 결과)이 있으면 카드에 붙인다.
- 구분 기호는 - _ 공백 아무거나. 확장자는 jpg jpeg png webp gif.

- 덱 썸네일(thumbs/<세트>/, 폭 THUMB_W)도 같이 만든다. 원본보다 새것이면 건너뛰고, 쓰지 않는 썸네일은 지운다.
  opencv가 없거나 못 읽는 그림(gif 등)은 썸네일 없이 원본을 쓴다.

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
THUMB_W = 360  # 덱 칸 폭(최대 약 180px)의 2배


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
            cj = folder / f"{c['no']:03d}-centering.json"
            c["centering"] = json.loads(cj.read_text(encoding="utf-8")) if cj.exists() else None
        for c in cards:
            for side in ("front", "back"):
                if not c[side]:
                    warnings.append(f"[{set_name}] {c['no']}번 {c['name']}: {SIDE_KO[side]} 사진이 없어요")
        sets.append({"name": set_name, "cards": cards})
    data = {"generated": datetime.now().strftime("%Y-%m-%d %H:%M"), "sets": sets}
    return data, warnings


def make_thumbs(data, root: Path):
    """덱에 쓸 작은 JPEG를 만들어 카드에 thumb {면: 경로}로 붙인다."""
    root = Path(root)
    try:
        import cv2
        import numpy as np
    except ImportError:
        return
    keep = set()
    for s in data["sets"]:
        for c in s["cards"]:
            for side in ("front", "back"):
                if not c[side]:
                    continue
                src = root / c[side]
                rel = "thumbs/" + str(Path(c[side]).relative_to("cards").with_suffix(".jpg").as_posix())
                dst = root / rel
                if not dst.exists() or dst.stat().st_mtime < src.stat().st_mtime:
                    img = cv2.imdecode(np.fromfile(str(src), np.uint8), cv2.IMREAD_COLOR)
                    if img is None:
                        continue
                    h, w = img.shape[:2]
                    if w > THUMB_W:
                        img = cv2.resize(img, (THUMB_W, round(h * THUMB_W / w)), interpolation=cv2.INTER_AREA)
                    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 82])
                    if not ok:
                        continue
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    dst.write_bytes(buf.tobytes())
                c.setdefault("thumb", {})[side] = rel
                keep.add(dst.resolve())
    tdir = root / "thumbs"
    if tdir.exists():
        for f in tdir.rglob("*"):
            if f.is_file() and f.resolve() not in keep:
                f.unlink()
        for d in sorted((d for d in tdir.rglob("*") if d.is_dir()), reverse=True):
            if not any(d.iterdir()):
                d.rmdir()


def write_js(data, out: Path):
    text = "window.CARD_DATA = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n"
    Path(out).write_text(text, encoding="utf-8")


def main():
    data, warnings = scan(ROOT / "cards")
    make_thumbs(data, ROOT)
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
