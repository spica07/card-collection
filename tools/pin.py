"""잠긴 덱(친구 덱)의 카드마다 따로 쓰는 번호를 만든다.

카드는 그 카드의 번호를 넣어야 화면에 보인다. locks.js에는 번호가 아니라
sha256("card-collection:" + 번호) → 카드 키("덱/세트/번호")만 둔다.

  py tools/pin.py                 번호가 없는 카드에만 새 번호를 만들어 보여 준다
  py tools/pin.py --reset "친구 덱/30주년 확장팩/3"   그 카드 번호를 새로 만든다
  py tools/pin.py --list          번호가 있는 카드 목록(번호는 다시 볼 수 없음)

번호는 화면에 한 번만 보여 준다. 잊으면 --reset으로 새로 만든다.
카드를 넣거나 지운 뒤(cards.js를 다시 만든 뒤)에 돌린다. 없어진 카드의 번호는 지운다.
"""
import argparse
import hashlib
import json
import re
import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCKED_DECKS = ["친구 덱"]
SALT = "card-collection:"
DIGITS = 6


def read_js(path, var):
    if not path.exists():
        return None
    text = path.read_text(encoding="utf-8")
    m = re.search(r"window\." + var + r"\s*=\s*(\{.*\})\s*;?\s*$", text, re.S)
    return json.loads(m.group(1)) if m else None


def card_keys(data, decks):
    keys = []
    for d in data.get("decks", []):
        if d["name"] not in decks:
            continue
        for s in d["sets"]:
            for c in s["cards"]:
                keys.append((f'{d["name"]}/{s["name"]}/{c["no"]}', c["name"]))
    return keys


def digest(pin):
    return hashlib.sha256((SALT + pin).encode("utf-8")).hexdigest()


def write_locks(path, decks, cards):
    body = json.dumps({"decks": decks, "cards": cards}, ensure_ascii=False, indent=1)
    path.write_text(
        "// tools/pin.py가 만든다. 번호가 아니라 sha256(\"card-collection:\" + 번호) → 카드 키만 둔다.\n"
        f"window.CARD_LOCKS = {body};\n", encoding="utf-8", newline="\n")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--reset", action="append", default=[], metavar="KEY", help='번호를 새로 만들 카드 키 (예: "친구 덱/30주년 확장팩/3")')
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--root", default=str(ROOT), help=argparse.SUPPRESS)
    a = ap.parse_args(argv)
    root = Path(a.root)

    data = read_js(root / "cards.js", "CARD_DATA")
    if data is None:
        sys.exit("cards.js를 읽지 못했어요. 먼저 py tools/build.py")
    locks = read_js(root / "locks.js", "CARD_LOCKS") or {"decks": LOCKED_DECKS, "cards": {}}
    decks = locks.get("decks") or LOCKED_DECKS
    by_key = {k: h for h, k in locks.get("cards", {}).items()}

    keys = card_keys(data, decks)
    names = dict(keys)
    for k in a.reset:
        if k not in names:
            sys.exit(f"그런 카드가 없어요: {k}\n있는 카드: " + ", ".join(names))
        by_key.pop(k, None)

    if a.list:
        for k, n in keys:
            print(f'{"번호 있음" if k in by_key else "번호 없음"}  {k}  {n}')
        return

    gone = [k for k in by_key if k not in names]
    for k in gone:
        del by_key[k]
    used = set(by_key.values())
    new = []
    for k, n in keys:
        if k in by_key:
            continue
        while True:
            pin = "".join(secrets.choice("0123456789") for _ in range(DIGITS))
            h = digest(pin)
            if h not in used:
                break
        used.add(h)
        by_key[k] = h
        new.append((k, n, pin))

    ordered = {by_key[k]: k for k, _ in keys}
    write_locks(root / "locks.js", decks, ordered)
    for k in gone:
        print(f"지움(카드 없음): {k}")
    if not new:
        print("새로 만든 번호가 없어요. 모든 카드에 번호가 있어요.")
    for k, n, pin in new:
        print(f"{pin}  {n}  ({k})")
    print("→ locks.js  (sw.js CACHE를 올리고 커밋·푸시해야 사이트에 반영돼요)")


if __name__ == "__main__":
    main()
