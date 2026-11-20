import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import build  # noqa: E402


def touch(p: Path):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(b"x")


def test_sets_ordered_by_prefix_and_cards_by_number(tmp_path):
    c = tmp_path / "cards"
    touch(c / "02-블랙볼트" / "001-몰드류ex SR-front.jpg")
    touch(c / "01-30주년 확장팩" / "010-리자몽-front.jpg")
    touch(c / "01-30주년 확장팩" / "002-뮤츠ex SAR-front.jpg")
    touch(c / "01-30주년 확장팩" / "002-뮤츠ex SAR-back.jpg")
    data, warnings = build.scan(c)
    assert [s["name"] for s in data["sets"]] == ["30주년 확장팩", "블랙볼트"]
    cards = data["sets"][0]["cards"]
    assert [(x["no"], x["name"]) for x in cards] == [(2, "뮤츠ex SAR"), (10, "리자몽")]
    assert cards[0]["front"] == "cards/01-30주년 확장팩/002-뮤츠ex SAR-front.jpg"
    assert cards[0]["back"] == "cards/01-30주년 확장팩/002-뮤츠ex SAR-back.jpg"
    assert cards[1]["back"] is None
    assert any("리자몽" in w and "뒷면" in w for w in warnings)


def test_korean_side_words_png_and_unprefixed_set(tmp_path):
    c = tmp_path / "cards"
    touch(c / "프로모" / "1_피카츄_앞.PNG")
    touch(c / "프로모" / "1_피카츄_뒤.webp")
    touch(c / "01-먼저" / "1-a-front.jpg")
    data, warnings = build.scan(c)
    assert [s["name"] for s in data["sets"]] == ["먼저", "프로모"]
    card = data["sets"][1]["cards"][0]
    assert card["name"] == "피카츄" and card["front"] and card["back"]
    assert warnings == [] or all("먼저" in w for w in warnings)


def test_bad_names_and_duplicates_warn(tmp_path):
    c = tmp_path / "cards"
    touch(c / "세트" / "사진.jpg")
    touch(c / "세트" / "003-front.jpg")
    touch(c / "세트" / "3-다른이름-front.jpg")
    touch(c / "세트" / "notes.txt")
    data, warnings = build.scan(c)
    cards = data["sets"][0]["cards"]
    assert len(cards) == 1 and cards[0]["no"] == 3
    joined = "\n".join(warnings)
    assert "사진.jpg" in joined
    assert "중복" in joined
    assert "notes.txt" not in joined


def test_back_only_card_and_empty_set_skipped(tmp_path):
    c = tmp_path / "cards"
    touch(c / "세트" / "005-팬텀-back.jpg")
    (c / "빈세트").mkdir(parents=True)
    data, warnings = build.scan(c)
    assert [s["name"] for s in data["sets"]] == ["세트"]
    assert data["sets"][0]["cards"][0]["front"] is None
    assert any("앞면" in w for w in warnings)


def test_write_js(tmp_path):
    c = tmp_path / "cards"
    touch(c / "세트" / "1-a-front.jpg")
    out = tmp_path / "cards.js"
    data, _ = build.scan(c)
    build.write_js(data, out)
    text = out.read_text(encoding="utf-8")
    assert text.startswith("window.CARD_DATA = ")
    payload = json.loads(text[len("window.CARD_DATA = "):].rstrip().rstrip(";"))
    assert payload["sets"][0]["cards"][0]["name"] == "a"
