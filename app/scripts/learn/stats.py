"""Закономерности нарезки по восстановленным монтажам (_cache/*.cuts.json).

python scripts/learn/stats.py <папка партии>  → печать + <папка партии>/_cache/stats.json
"""
import glob
import json
import os
import re
import sys

import numpy as np


def norm(t):
    return re.sub(r"[^\w%]+", "", t.lower().replace("ё", "е"))


FILLERS = {"ну", "эээ", "ээ", "э", "мм", "м", "как", "бы", "вот", "это", "так", "значит", "типа", "короче", "собственно", "в", "общем"}


def removed_kind(words, run, kept_text):
    """Что за вырезанный кусок сырого: дубль (текст потом есть в монтаже), оговорка, мусор/паузы, или выкинутый смысл."""
    toks = [norm(words[j]["text"]) for j in run]
    toks = [t for t in toks if t]
    if not toks:
        return "пауза"
    if all(t in FILLERS for t in toks) and len(toks) <= 3:
        return "слова-паразиты"
    hit = sum(1 for k in range(len(toks) - 1) if (toks[k], toks[k + 1]) in kept_text)
    if len(toks) >= 2 and hit / (len(toks) - 1) >= 0.5:
        return "дубль"
    if len(toks) <= 3:
        return "оговорка"
    return "выкинутый текст"


def analyze(path):
    j = json.load(open(path, encoding="utf-8"))
    W = j["rawWords"]
    segs = j["segments"]
    speed = j["globalSpeed"]
    kept_idx = [k for k, w in enumerate(W) if w["kept"]]
    kept_text = set()
    kt = [norm(W[k]["text"]) for k in kept_idx]
    for a, b in zip(kt, kt[1:]):
        kept_text.add((a, b))

    # паузы на склейках: сколько тишины оставлено в сыром до/после склейки (относительно слов)
    pads_out, pads_in, joined_gap = [], [], []
    for a, b in zip(segs, segs[1:]):
        wa = [w for w in W if w["file"] == a["file"] and a["cut_in_r"] - 20 <= (w["startMs"] + w["endMs"]) / 2 <= a["cut_out_r"] + 20]
        wb = [w for w in W if w["file"] == b["file"] and b["cut_in_r"] - 20 <= (w["startMs"] + w["endMs"]) / 2 <= b["cut_out_r"] + 20]
        if wa and wb:
            po = a["cut_out_r"] - wa[-1]["endMs"]
            pi = wb[0]["startMs"] - b["cut_in_r"]
            pads_out.append(po)
            pads_in.append(pi)
            joined_gap.append((po + pi) / speed)  # тишина между словами в готовом ролике
    # паузы внутри кусков (их не вырезали) и паузы, которые вырезаны вместе с соседями
    inner_pauses, cut_pauses = [], []
    for k in range(len(W) - 1):
        a, b = W[k], W[k + 1]
        if a["file"] != b["file"]:
            continue
        gap = b["startMs"] - a["endMs"]
        same = any(s["file"] == a["file"] and s["cut_in_r"] - 20 <= a["startMs"] and b["endMs"] <= s["cut_out_r"] + 20 for s in segs)
        if a["kept"] and b["kept"] and same:
            inner_pauses.append(gap)
        elif a["kept"] and not b["kept"] or not a["kept"] and b["kept"]:
            cut_pauses.append(gap)
    # вырезанные участки сырого и их типы
    kinds = {}
    run = []
    first_kept = kept_idx[0] if kept_idx else 0
    last_kept = kept_idx[-1] if kept_idx else 0
    for k, w in enumerate(W):
        if not w["kept"] and first_kept < k < last_kept:
            run.append(k)
        elif run:
            kd = removed_kind(W, run, kept_text)
            kinds[kd] = kinds.get(kd, 0) + 1
            run = []
    piece_len = [(s["cut_out_f"] - s["cut_in_f"]) / 1000 for s in segs]
    raw_dur = sum(r["durationMs"] for r in j["raws"]) / 1000
    order = [s["cut_in_r"] + j["raws"][s["file"]]["offsetMs"] for s in segs]
    back_jumps = sum(1 for a, b in zip(order, order[1:]) if b < a)
    return {
        "folder": j["folder"], "speed": speed, "rawSec": round(raw_dur), "finalSec": round(j["finalDurationMs"] / 1000, 1),
        "keepShare": round(sum(piece_len) * speed / raw_dur, 3), "pieces": len(segs), "piecesPerMin": round(len(segs) / (j["finalDurationMs"] / 60000), 1),
        "pieceSec": {"median": round(float(np.median(piece_len)), 2), "min": round(min(piece_len), 2), "max": round(max(piece_len), 2)},
        "padOutMs": round(float(np.median(pads_out))) if pads_out else None, "padInMs": round(float(np.median(pads_in))) if pads_in else None,
        "gapAtCutMs": round(float(np.median(joined_gap))) if joined_gap else None,
        "innerPauseMs": {"median": round(float(np.median(inner_pauses))) if inner_pauses else None, "p95": round(float(np.percentile(inner_pauses, 95))) if inner_pauses else None, "max": max(inner_pauses) if inner_pauses else None},
        "startSkipSec": round(W[first_kept]["startMs"] / 1000, 1) if kept_idx else None,
        "removed": kinds, "backJumps": back_jumps,
        "retakes": {"total": len(j["retakes"]), "last": sum(r["last"] for r in j["retakes"])},
        "_pads_out": pads_out, "_pads_in": pads_in, "_inner": inner_pauses, "_cutgap": joined_gap,
    }


def main(batch):
    rows = [analyze(p) for p in sorted(glob.glob(os.path.join(batch, "_cache", "*.cuts.json")))]
    print(f"{'ролик':34} {'сырое':>6} {'готов':>6} {'взято':>6} {'кусков':>6} {'/мин':>5} {'кусок,с':>8} {'хвост':>6} {'заход':>6} {'пауза внутри p95':>16} {'назад':>5}")
    for r in rows:
        print(f"{r['folder'][:34]:34} {r['rawSec']:6} {r['finalSec']:6} {r['keepShare']:6.0%} {r['pieces']:6} {r['piecesPerMin']:5} {r['pieceSec']['median']:8} {r['padOutMs']!s:>6} {r['padInMs']!s:>6} {r['innerPauseMs']['p95']!s:>16} {r['backJumps']:5}")
    allv = lambda k: [x for r in rows for x in r[k]]
    agg = {
        "videos": len(rows),
        "speed": sorted({r["speed"] for r in rows}),
        "keepShareMedian": round(float(np.median([r["keepShare"] for r in rows])), 3),
        "piecesPerMinMedian": round(float(np.median([r["piecesPerMin"] for r in rows])), 1),
        "padOutMs": {q: round(float(np.percentile(allv("_pads_out"), q))) for q in (10, 50, 90)},
        "padInMs": {q: round(float(np.percentile(allv("_pads_in"), q))) for q in (10, 50, 90)},
        "gapAtCutMs": {q: round(float(np.percentile(allv("_cutgap"), q))) for q in (10, 50, 90)},
        "innerPauseMs": {q: round(float(np.percentile(allv("_inner"), q))) for q in (50, 90, 95, 99)},
        "removed": {},
        "retakes": {"total": sum(r["retakes"]["total"] for r in rows), "last": sum(r["retakes"]["last"] for r in rows)},
        "backJumps": sum(r["backJumps"] for r in rows),
    }
    for r in rows:
        for k, v in r["removed"].items():
            agg["removed"][k] = agg["removed"].get(k, 0) + v
    print("\nИТОГО:", json.dumps(agg, ensure_ascii=False, indent=1))
    for r in rows:
        for k in [k for k in r if k.startswith("_")]:
            del r[k]
    json.dump({"videos": rows, "summary": agg}, open(os.path.join(batch, "_cache", "stats.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main(sys.argv[1])
