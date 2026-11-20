"""카드 앞면·뒷면 사진을 덱에 넣는다.

    py tools/add.py "30주년 확장팩" "뮤츠ex SAR" --front 앞.jpg --back 뒤.jpg

- 사진에서 카드만 찾아 반듯하게 펴서(배경 천 제거) cards/<세트>/에 저장한다.
  카드 찾기는 워크스페이스 공용 card-centering 스킬의 검출 코드를 쓴다.
- 세트 폴더가 없으면 다음 순번(NN-)을 붙여 새로 만든다.
- 번호는 그 세트의 마지막 번호 + 1 (넣은 순서). --no로 직접 줄 수 있다.
- 배경과 테두리 색이 비슷해 엉뚱하게 잘리면 --front-corners "x,y;x,y;x,y;x,y"
  (원본 사진 픽셀의 대략 꼭짓점, 왼쪽 위부터 시계 방향)로 다시 넣는다. --no로 같은 번호를 주면 덮어쓴다.
- 카드를 못 찾으면 멈춘다. --raw를 주면 자르지 않고 원본 그대로 넣는다.
- 끝나면 cards.js를 다시 만든다.
"""
from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILL = Path("C:/blog_writing/.claude/skills/card-centering/scripts")
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(SKILL))

import build  # noqa: E402

OUT_W, OUT_H = 756, 1056  # 63:88, 크게 보기 화면의 2배 정도
BAD_CHARS = re.compile(r'[\\/:*?"<>|]')


def safe_name(name: str) -> str:
    name = name.strip()
    if not name or BAD_CHARS.search(name):
        raise SystemExit(f'카드 이름에 쓸 수 없는 글자가 있어요: {name!r} (\\ / : * ? " < > | 빼고 써 주세요)')
    return name


def set_folder(cards_dir: Path, set_name: str) -> Path:
    cards_dir.mkdir(parents=True, exist_ok=True)
    nums = []
    for p in cards_dir.iterdir():
        if not p.is_dir():
            continue
        m = build.SET_RE.match(p.name)
        if (m.group(2) if m else p.name) == set_name:
            return p
        if m:
            nums.append(int(m.group(1)))
    new = cards_dir / f"{(max(nums) + 1) if nums else 1:02d}-{safe_name(set_name)}"
    new.mkdir()
    return new


def next_number(folder: Path) -> int:
    nos = [int(m.group("no")) for f in folder.iterdir() if (m := build.CARD_RE.match(f.stem))]
    return max(nos) + 1 if nos else 1


def parse_corners(s):
    if not s:
        return None
    pts = [tuple(float(v) for v in p.split(",")) for p in s.split(";")]
    if len(pts) != 4 or any(len(p) != 2 for p in pts):
        raise SystemExit(f"꼭짓점은 x,y 4개를 ;로 이어 주세요: {s}")
    return pts


def crop_card(src: Path, dst: Path, corners=None):
    import cv2
    from card_geom import find_card_quad, load_image, warp_card

    img = load_image(src)
    flat = warp_card(img, find_card_quad(img, corners))
    flat = cv2.resize(flat, (OUT_W, OUT_H), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", flat, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not ok:
        raise SystemExit(f"저장 실패: {dst}")
    dst.write_bytes(buf.tobytes())


def add_card(cards_dir: Path, set_name: str, card_name: str, front=None, back=None, no=None, raw=False, corners=None):
    if not front and not back:
        raise SystemExit("--front나 --back 중 하나는 있어야 해요")
    card_name = safe_name(card_name)
    folder = set_folder(Path(cards_dir), set_name)
    no = no or next_number(folder)
    written = []
    for side, src in (("front", front), ("back", back)):
        if not src:
            continue
        src = Path(src)
        if raw:
            dst = folder / f"{no:03d}-{card_name}-{side}{src.suffix.lower()}"
            shutil.copyfile(src, dst)
        else:
            dst = folder / f"{no:03d}-{card_name}-{side}.jpg"
            try:
                crop_card(src, dst, (corners or {}).get(side))
            except Exception as e:  # CardNotFound 등
                for w in written:
                    w.unlink(missing_ok=True)
                raise SystemExit(f"{src.name}에서 카드를 못 찾았어요: {e}\n자르지 않고 넣으려면 --raw를 붙여 주세요.")
        written.append(dst)
    return written


def main(argv=None):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="카드 앞뒷면 사진을 덱에 넣는다")
    ap.add_argument("set", help="세트 이름 (예: 30주년 확장팩, 블랙볼트)")
    ap.add_argument("name", help="카드 이름 (예: 뮤츠ex SAR)")
    ap.add_argument("--front")
    ap.add_argument("--back")
    ap.add_argument("--no", type=int, help="보여 줄 순서 번호 (기본: 마지막 + 1)")
    ap.add_argument("--front-corners", help="앞면 카드 꼭짓점 힌트 x,y;x,y;x,y;x,y")
    ap.add_argument("--back-corners", help="뒷면 카드 꼭짓점 힌트")
    ap.add_argument("--raw", action="store_true", help="카드를 자르지 않고 원본 그대로")
    a = ap.parse_args(argv)
    for p in add_card(ROOT / "cards", a.set, a.name, a.front, a.back, a.no, a.raw,
                         {"front": parse_corners(a.front_corners), "back": parse_corners(a.back_corners)}):
        print(f"넣었어요: {p.relative_to(ROOT)}")
    build.main()


if __name__ == "__main__":
    main()
