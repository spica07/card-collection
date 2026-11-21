import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import build  # noqa: E402

D = "01-내 덱"


def touch(p: Path):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(b"x")


def test_sets_ordered_by_prefix_and_cards_by_number(tmp_path):
    c = tmp_path / "cards" / D
    touch(c / "02-블랙볼트" / "001-몰드류ex SR-front.jpg")
    touch(c / "01-30주년 확장팩" / "010-리자몽-front.jpg")
    touch(c / "01-30주년 확장팩" / "002-뮤츠ex SAR-front.jpg")
    touch(c / "01-30주년 확장팩" / "002-뮤츠ex SAR-back.jpg")
    data, warnings = build.scan(tmp_path / "cards")
    assert [s["name"] for s in data["decks"][0]["sets"]] == ["30주년 확장팩", "블랙볼트"]
    cards = data["decks"][0]["sets"][0]["cards"]
    assert [(x["no"], x["name"]) for x in cards] == [(2, "뮤츠ex SAR"), (10, "리자몽")]
    assert cards[0]["front"] == "cards/01-내 덱/01-30주년 확장팩/002-뮤츠ex SAR-front.jpg"
    assert cards[0]["back"] == "cards/01-내 덱/01-30주년 확장팩/002-뮤츠ex SAR-back.jpg"
    assert cards[1]["back"] is None
    assert any("리자몽" in w and "뒷면" in w for w in warnings)


def test_korean_side_words_png_and_unprefixed_set(tmp_path):
    c = tmp_path / "cards" / D
    touch(c / "프로모" / "1_피카츄_앞.PNG")
    touch(c / "프로모" / "1_피카츄_뒤.webp")
    touch(c / "01-먼저" / "1-a-front.jpg")
    data, warnings = build.scan(tmp_path / "cards")
    assert [s["name"] for s in data["decks"][0]["sets"]] == ["먼저", "프로모"]
    card = data["decks"][0]["sets"][1]["cards"][0]
    assert card["name"] == "피카츄" and card["front"] and card["back"]
    assert warnings == [] or all("먼저" in w for w in warnings)


def test_bad_names_and_duplicates_warn(tmp_path):
    c = tmp_path / "cards" / D
    touch(c / "세트" / "사진.jpg")
    touch(c / "세트" / "003-front.jpg")
    touch(c / "세트" / "3-다른이름-front.jpg")
    touch(c / "세트" / "notes.txt")
    data, warnings = build.scan(tmp_path / "cards")
    cards = data["decks"][0]["sets"][0]["cards"]
    assert len(cards) == 1 and cards[0]["no"] == 3
    joined = "\n".join(warnings)
    assert "사진.jpg" in joined
    assert "중복" in joined
    assert "notes.txt" not in joined


def test_back_only_card_and_empty_set_skipped(tmp_path):
    c = tmp_path / "cards" / D
    touch(c / "세트" / "005-팬텀-back.jpg")
    (c / "빈세트").mkdir(parents=True)
    data, warnings = build.scan(tmp_path / "cards")
    assert [s["name"] for s in data["decks"][0]["sets"]] == ["세트"]
    assert data["decks"][0]["sets"][0]["cards"][0]["front"] is None
    assert any("앞면" in w for w in warnings)


def test_write_js(tmp_path):
    c = tmp_path / "cards" / D
    touch(c / "세트" / "1-a-front.jpg")
    out = tmp_path / "cards.js"
    data, _ = build.scan(tmp_path / "cards")
    build.write_js(data, out)
    text = out.read_text(encoding="utf-8")
    assert text.startswith("window.CARD_DATA = ")
    payload = json.loads(text[len("window.CARD_DATA = "):].rstrip().rstrip(";"))
    assert payload["decks"][0]["sets"][0]["cards"][0]["name"] == "a"


def test_centering_attached(tmp_path):
    c = tmp_path / "cards" / D
    touch(c / "세트" / "001-a-front.jpg")
    (c / "세트" / "001-centering.json").write_text('{"front": {"ratio_lr": 52.0}}', encoding="utf-8")
    touch(c / "세트" / "002-b-front.jpg")
    data, _ = build.scan(tmp_path / "cards")
    cards = data["decks"][0]["sets"][0]["cards"]
    assert cards[0]["centering"]["front"]["ratio_lr"] == 52.0
    assert cards[1]["centering"] is None


def test_make_thumbs_writes_small_jpgs_and_removes_stale(tmp_path):
    import cv2
    import numpy as np
    c = tmp_path / "cards" / D / "01-세트"
    c.mkdir(parents=True)
    ok, buf = cv2.imencode(".jpg", np.full((1056, 756, 3), 200, np.uint8))
    (c / "001-카드-front.jpg").write_bytes(buf.tobytes())
    stale = tmp_path / "thumbs" / D / "01-세트" / "009-옛카드-front.jpg"
    touch(stale)
    data, _ = build.scan(tmp_path / "cards")
    build.make_thumbs(data, tmp_path)
    card = data["decks"][0]["sets"][0]["cards"][0]
    assert card["thumb"] == {"front": "thumbs/01-내 덱/01-세트/001-카드-front.jpg"}
    t = cv2.imdecode(np.fromfile(str(tmp_path / card["thumb"]["front"]), np.uint8), cv2.IMREAD_COLOR)
    assert t.shape[1] == build.THUMB_W
    assert not stale.exists()


def test_decks_ordered_and_empty_deck_kept(tmp_path):
    c = tmp_path / "cards"
    touch(c / "02-친구 덱" / "01-세트" / "001-a-front.jpg")
    touch(c / D / "01-세트" / "001-b-front.jpg")
    (c / "03-빈 덱").mkdir(parents=True)
    data, warnings = build.scan(c)
    assert [d["name"] for d in data["decks"]] == ["내 덱", "친구 덱", "빈 덱"]
    assert data["decks"][1]["sets"][0]["cards"][0]["front"] == "cards/02-친구 덱/01-세트/001-a-front.jpg"
    assert data["decks"][2]["sets"] == []
    assert all(w.startswith("[") for w in warnings)


def test_rarity_from_name():
    assert build.rarity_of("뮤츠ex SAR 128") == "SAR"
    assert build.rarity_of("서퍼 SR 085") == "SR"
    assert build.rarity_of("피카츄 AR") == "AR"
    assert build.rarity_of("복각 리자몽 137") is None
    assert build.rarity_of("SARS") is None


def test_kind_and_reprint(tmp_path):
    c = tmp_path / "cards" / D / "01-세트"
    touch(c / "001-뮤츠ex SAR 128-front.jpg")
    touch(c / "002-복각 리자몽 137-front.jpg")
    touch(c / "003-복각 N 153-front.jpg")
    (c / "003-info.json").write_text('{"kind": "trainer"}', encoding="utf-8")
    data, _ = build.scan(tmp_path / "cards")
    cards = data["decks"][0]["sets"][0]["cards"]
    assert [x["kind"] for x in cards] == ["ex", "pokemon", "trainer"]
    assert [x["reprint"] for x in cards] == [False, True, True]
