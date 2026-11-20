import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import add  # noqa: E402


def photo(path: Path, color=(240, 200, 60)):
    img = np.full((1600, 1200, 3), 30, np.uint8)
    cv2.rectangle(img, (250, 300), (250 + 630, 300 + 880), color, -1)
    ok, buf = cv2.imencode(".jpg", img)
    path.write_bytes(buf.tobytes())
    return path


def test_set_folder_reuses_existing_and_numbers_new(tmp_path):
    (tmp_path / "01-30주년 확장팩").mkdir()
    assert add.set_folder(tmp_path, "30주년 확장팩").name == "01-30주년 확장팩"
    new = add.set_folder(tmp_path, "블랙볼트")
    assert new.name == "02-블랙볼트" and new.is_dir()


def test_next_number(tmp_path):
    assert add.next_number(tmp_path) == 1
    (tmp_path / "001-a-front.jpg").write_bytes(b"x")
    (tmp_path / "007-b-back.jpg").write_bytes(b"x")
    assert add.next_number(tmp_path) == 8


def test_bad_card_name_rejected():
    with pytest.raises(SystemExit):
        add.safe_name("뮤츠/ex")


def test_add_crops_card_and_rebuilds(tmp_path):
    cards = tmp_path / "cards"
    f = photo(tmp_path / "f.jpg")
    b = photo(tmp_path / "b.jpg", (200, 80, 30))
    out = add.add_card(cards, "30주년 확장팩", "뮤츠ex SAR", f, b)
    assert [p.name for p in out] == ["001-뮤츠ex SAR-front.jpg", "001-뮤츠ex SAR-back.jpg"]
    img = cv2.imdecode(np.fromfile(str(out[0]), np.uint8), cv2.IMREAD_COLOR)
    assert img.shape[:2] == (add.OUT_H, add.OUT_W)
    # 배경(어두운 색)이 잘려 나가고 카드 색만 남아야 한다
    assert img[add.OUT_H // 2, 20].mean() > 100


def test_corner_hints_and_overwrite_same_number(tmp_path):
    cards = tmp_path / "cards"
    f = photo(tmp_path / "f.jpg")
    add.add_card(cards, "세트", "a", front=f)
    out = add.add_card(cards, "세트", "a", front=f, no=1,
                       corners={"front": add.parse_corners("255,305;875,305;875,1175;255,1175")})
    assert out[0].name == "001-a-front.jpg"
    assert len(list((cards / "01-세트").glob("*.jpg"))) == 1


def bordered_photo(path: Path, left=30, right=30, top=30, bottom=30):
    """노란 테두리 + 안쪽 그림이 있는 합성 카드 (630x880, 1px = 0.1mm)."""
    img = np.full((1600, 1200, 3), 30, np.uint8)
    x0, y0 = 250, 300
    cv2.rectangle(img, (x0, y0), (x0 + 630, y0 + 880), (40, 210, 240), -1)
    cv2.rectangle(img, (x0 + left, y0 + top), (x0 + 630 - right, y0 + 880 - bottom), (120, 40, 90), -1)
    ok, buf = cv2.imencode(".png", img)
    path.write_bytes(buf.tobytes())
    return path


def test_add_writes_centering_json_and_overlay(tmp_path):
    import json
    cards = tmp_path / "cards"
    f = bordered_photo(tmp_path / "f.png", left=40, right=20)
    add.add_card(cards, "세트", "a", front=f)
    data = json.loads((cards / "01-세트" / "001-centering.json").read_text(encoding="utf-8"))
    assert abs(data["front"]["ratio_lr"] - 66.7) < 2
    assert data["front"]["overlay"] == "centering/01-세트/001-front.png"
    assert (tmp_path / "centering" / "01-세트" / "001-front.png").exists()
    assert data["grades"]["psa"]["grade"] is not None
    # 뒷면만 다시 넣어도 앞면 결과는 남고 등급은 두 면으로 다시 계산
    b = bordered_photo(tmp_path / "b.png")
    add.add_card(cards, "세트", "a", back=b, no=1)
    data = json.loads((cards / "01-세트" / "001-centering.json").read_text(encoding="utf-8"))
    assert "front" in data and "back" in data
