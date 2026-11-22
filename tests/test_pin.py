import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import pin  # noqa: E402


def write_cards(root, friend_cards):
    data = {"decks": [
        {"name": "내 덱", "sets": [{"name": "A", "cards": [{"no": 1, "name": "x"}]}]},
        {"name": "친구 덱", "sets": [{"name": "B", "cards": friend_cards}]},
    ]}
    (root / "cards.js").write_text("window.CARD_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n", encoding="utf-8")


def pins_from(out):
    return {line.split("(")[-1].rstrip(")"): line.split()[0] for line in out.splitlines() if line[:1].isdigit()}


def test_new_pins_only_for_locked_deck_and_stable(tmp_path, capsys):
    write_cards(tmp_path, [{"no": 1, "name": "a"}, {"no": 2, "name": "b"}])
    pin.main(["--root", str(tmp_path)])
    got = pins_from(capsys.readouterr().out)
    assert set(got) == {"친구 덱/B/1", "친구 덱/B/2"}
    assert len(set(got.values())) == 2 and all(len(p) == 6 for p in got.values())
    locks = pin.read_js(tmp_path / "locks.js", "CARD_LOCKS")
    for k, p in got.items():
        assert locks["cards"][hashlib.sha256(("card-collection:" + p).encode()).hexdigest()] == k
    text = (tmp_path / "locks.js").read_text(encoding="utf-8")
    assert all(p not in text for p in got.values())
    # 다시 돌려도 기존 번호는 그대로
    pin.main(["--root", str(tmp_path)])
    assert pins_from(capsys.readouterr().out) == {}
    assert pin.read_js(tmp_path / "locks.js", "CARD_LOCKS") == locks


def test_reset_and_removed_card(tmp_path, capsys):
    write_cards(tmp_path, [{"no": 1, "name": "a"}, {"no": 2, "name": "b"}])
    pin.main(["--root", str(tmp_path)]); capsys.readouterr()
    pin.main(["--root", str(tmp_path), "--reset", "친구 덱/B/1"])
    assert set(pins_from(capsys.readouterr().out)) == {"친구 덱/B/1"}
    write_cards(tmp_path, [{"no": 1, "name": "a"}])
    pin.main(["--root", str(tmp_path)])
    assert "지움(카드 없음): 친구 덱/B/2" in capsys.readouterr().out
    assert list(pin.read_js(tmp_path / "locks.js", "CARD_LOCKS")["cards"].values()) == ["친구 덱/B/1"]
