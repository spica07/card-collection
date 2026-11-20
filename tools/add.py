"""카드 앞면·뒷면 사진을 덱에 넣는다.

    py tools/add.py "30주년 확장팩" "뮤츠ex SAR" --front 앞.jpg --back 뒤.jpg

- 사진에서 카드만 찾아 반듯하게 펴서(배경 천 제거) cards/<세트>/에 저장한다.
  카드 찾기는 워크스페이스 공용 card-centering 스킬의 검출 코드를 쓴다.
- 세트 폴더가 없으면 다음 순번(NN-)을 붙여 새로 만든다.
- 번호는 그 세트의 마지막 번호 + 1 (넣은 순서). --no로 직접 줄 수 있다.
- 배경과 테두리 색이 비슷해 엉뚱하게 잘리면 --front-corners "x,y;x,y;x,y;x,y"
  (원본 사진 픽셀의 대략 꼭짓점, 왼쪽 위부터 시계 방향)로 다시 넣는다. --no로 같은 번호를 주면 덮어쓴다.
- 앞뒷면마다 센터링도 잰다(card-centering 스킬과 같은 측정). 결과는 cards/<세트>/<번호>-centering.json,
  확인 이미지는 centering/<세트>/<번호>-front|back.jpg. 안쪽 경계가 틀리면 --front-inner/--back-inner.
- 카드를 못 찾으면 멈춘다. --raw를 주면 자르지 않고 원본 그대로 넣는다.
- 끝나면 cards.js를 다시 만든다.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from datetime import date
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


def parse_inner(s):
    """"L,T,R,B" (펴진 1260x1760 이미지 좌표, -는 자동)."""
    if not s:
        return None
    from centering import parse_inner as _pi
    return _pi(s)


def measure_side(src: Path, corners=None, inner=None):
    """카드 검출 + 센터링 측정. (펴진 이미지, 측정 결과). 안쪽 경계를 못 찾으면 비율이 None."""
    from card_geom import load_image, measure

    res = measure(load_image(src), inner, corners)
    return res.pop("_warped"), res


def save_jpg(img, dst: Path):
    import cv2

    small = cv2.resize(img, (OUT_W, OUT_H), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not ok:
        raise SystemExit(f"저장 실패: {dst}")
    dst.write_bytes(buf.tobytes())


def save_overlay(warped, res, side, dst: Path):
    """확인 이미지(검출선)를 JPEG로 저장한다. PNG는 장당 4~5MB라 웹에 올리기 무겁다."""
    import cv2
    from centering import draw_overlay

    dst.parent.mkdir(parents=True, exist_ok=True)
    ok, buf = cv2.imencode(".jpg", draw_overlay(warped, res, side.upper()), [cv2.IMWRITE_JPEG_QUALITY, 85])
    if not ok:
        raise SystemExit(f"저장 실패: {dst}")
    dst.write_bytes(buf.tobytes())
    dst.with_suffix(".png").unlink(missing_ok=True)  # 예전 PNG 확인 이미지


KEEP = ("lr_text", "tb_text", "ratio_lr", "ratio_tb", "border_mm", "confidence", "source",
        "outline", "warning", "message")


def write_centering(folder: Path, no: int, measured: dict, root: Path):
    """세트 폴더의 <번호>-centering.json에 면별 결과를 합치고 등급 상한을 다시 계산한다."""
    from grading import load_standards, max_grades

    path = folder / f"{no:03d}-centering.json"
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    for side, (res, overlay) in measured.items():
        face = {k: res[k] for k in KEEP if k in res}
        face["overlay"] = overlay.relative_to(root).as_posix()
        face["measured"] = date.today().isoformat()
        data[side] = face
    faces = {s: {"lr": data[s]["ratio_lr"], "tb": data[s]["ratio_tb"]}
             for s in ("front", "back") if s in data and data[s].get("ratio_lr") is not None}
    data["grades"] = max_grades(faces.get("front"), faces.get("back"), load_standards()) if faces else None
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    return path, data


def add_card(cards_dir: Path, set_name: str, card_name: str, front=None, back=None, no=None, raw=False,
             corners=None, inner=None, centering=True):
    """사진을 잘라 넣고 센터링을 잰다. 반환: 저장한 카드 이미지 경로 목록."""
    if not front and not back:
        raise SystemExit("--front나 --back 중 하나는 있어야 해요")
    cards_dir = Path(cards_dir)
    card_name = safe_name(card_name)
    folder = set_folder(cards_dir, set_name)
    no = no or next_number(folder)
    written, measured = [], {}
    for side, src in (("front", front), ("back", back)):
        if not src:
            continue
        src = Path(src)
        for old in folder.glob(f"{no:03d}-*-{side}.*"):  # 같은 번호를 다시 넣으면 이름이 바뀌어도 덮어쓴다
            old.unlink()
        if raw:
            dst = folder / f"{no:03d}-{card_name}-{side}{src.suffix.lower()}"
            shutil.copyfile(src, dst)
            written.append(dst)
            continue
        dst = folder / f"{no:03d}-{card_name}-{side}.jpg"
        try:
            warped, res = measure_side(src, (corners or {}).get(side), (inner or {}).get(side))
        except Exception as e:  # CardNotFound 등
            for w in written:
                w.unlink(missing_ok=True)
            raise SystemExit(f"{src.name}에서 카드를 못 찾았어요: {e}\n자르지 않고 넣으려면 --raw를 붙여 주세요.")
        save_jpg(warped, dst)
        written.append(dst)
        if centering:
            overlay = cards_dir.parent / "centering" / folder.name / f"{no:03d}-{side}.jpg"
            save_overlay(warped, res, side, overlay)
            measured[side] = (res, overlay)
    if measured:
        write_centering(folder, no, measured, cards_dir.parent)
    return written


def report(written):
    """측정 결과를 터미널에 짧게 보여 준다."""
    if not written:
        return
    path = written[0].parent / f"{written[0].name[:3]}-centering.json"
    if not path.exists():
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    for side, ko in (("front", "앞면"), ("back", "뒷면")):
        f = data.get(side)
        if not f:
            continue
        if f.get("ratio_lr") is None:
            print(f"  {ko}: 안쪽 테두리를 못 찾았어요. --{side}-inner로 지정 ({f['overlay']})")
            continue
        flag = "" if f["confidence"] == "high" else f"  [신뢰도 {f['confidence']}: 확인 이미지 꼭 보기]"
        print(f"  {ko}  좌우 {f['lr_text']} / 상하 {f['tb_text']}  ({f['source']}){flag}")
        print(f"        확인 이미지: {f['overlay']}")
    for g in (data.get("grades") or {}).values():
        near = " (경계)" if g["near_boundary"] else ""
        print(f"  {g['name']}: {g['grade'] or '-'}{near}")


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
    ap.add_argument("--front-inner", help="앞면 안쪽 경계 L,T,R,B (펴진 이미지 좌표, -는 자동). 예: --front-inner=-,-,-,1700")
    ap.add_argument("--back-inner", help="뒷면 안쪽 경계")
    ap.add_argument("--no-centering", action="store_true", help="센터링을 재지 않는다")
    ap.add_argument("--raw", action="store_true", help="카드를 자르지 않고 원본 그대로 (센터링도 안 잼)")
    a = ap.parse_args(argv)
    written = add_card(ROOT / "cards", a.set, a.name, a.front, a.back, a.no, a.raw,
                       {"front": parse_corners(a.front_corners), "back": parse_corners(a.back_corners)},
                       {"front": parse_inner(a.front_inner), "back": parse_inner(a.back_inner)},
                       centering=not a.no_centering)
    for p in written:
        print(f"넣었어요: {p.relative_to(ROOT)}")
    report(written)
    build.main()


if __name__ == "__main__":
    main()
