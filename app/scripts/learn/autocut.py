"""Авто-нарезка сырого ролика по выученным правилам монтажёра (reference/alex/НАРЕЗКА.md).

1) python scripts/learn/autocut.py plan <видео> [--model <model_v2.json>]
   → <видео>.plan.json: фразы, ранние дубли, вероятность «оставить» от модели, решение по умолчанию.
   Claude читает фразы и правит "keep" по смыслу (реплики вне сценария, отступления, лишние детали).
2) python scripts/learn/autocut.py cut <видео>.plan.json [--style <styles/x.mjs параметры через --pad-in/--pad-out>]
   → куски сырого (мс) с границами по голосу и без длинных пауз внутри; печатает JSON для edit-файла.
"""
import json
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import train as T  # noqa: E402

HOP_MS = 10


def transcribe(path):
    cache = path + ".words.json"
    if os.path.exists(cache):
        return json.load(open(cache, encoding="utf-8"))
    from faster_whisper import WhisperModel

    model = WhisperModel("small", device="cpu", compute_type="int8")
    segments, info = model.transcribe(path, language="ru", word_timestamps=True)
    words = [
        {"text": w.word.strip(), "startMs": round(w.start * 1000), "endMs": round(w.end * 1000), "p": round(w.probability, 3), "file": 0}
        for seg in segments for w in seg.words or [] if w.word.strip()
    ]
    data = {"durationMs": round(info.duration * 1000), "words": words}
    json.dump(data, open(cache, "w", encoding="utf-8"), ensure_ascii=False)
    return data


def voice_mask(path):
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], capture_output=True, check=True)
    x = np.frombuffer(r.stdout, dtype=np.float32)
    n = len(x) // 160
    e = 20 * np.log10(np.sqrt((x[: n * 160].reshape(n, 160) ** 2).mean(1) + 1e-10))
    lo, hi = np.percentile(e, 15), np.percentile(e, 95)
    v = e > lo + 0.3 * (hi - lo)
    # дребезг: голосом считаем участки от 30 мс, тишиной — от 60 мс
    return v


HALLUCINATIONS = ("редактор субтитров", "субтитры сделал", "продолжение следует", "спасибо за просмотр")


def plan(video, model_path):
    d = transcribe(video)
    W = d["words"]
    Tt, sid, sents, earlier, XS = T.v2_prepare(W)
    m = json.load(open(model_path, encoding="utf-8"))
    Z = (XS - np.array(m["mu"])) / np.array(m["sd"])
    ps = 1 / (1 + np.exp(-np.clip(Z @ np.array(m["w"]), -30, 30)))
    out = []
    for si, s in enumerate(sents):
        text = " ".join(W[k]["text"] for k in s)
        hall = any(h in text.lower() for h in HALLUCINATIONS)
        keep = bool(si not in earlier and ps[si] > 0.5 and not hall)
        out.append({
            "id": si, "from": W[s[0]]["startMs"], "to": W[s[-1]]["endMs"], "text": text,
            "take": "ранний дубль" if si in earlier else "", "p": round(float(ps[si]), 2), "keep": keep,
        })
    res = {"video": os.path.abspath(video), "durationMs": d["durationMs"], "sentences": out}
    p = video + ".plan.json"
    json.dump(res, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for o in out:
        print(f"{o['id']:3} {'✓' if o['keep'] else '·'} {o['p']:.2f} {o['take'][:5]:5} {o['from'] / 1000:6.1f}  {o['text'][:110]}")
    print(f"\nоставлено {sum(o['keep'] for o in out)} из {len(out)} фраз → {p}")


def cut(plan_path, pad_in=110, pad_out=180, max_pause=180):
    P = json.load(open(plan_path, encoding="utf-8"))
    v = voice_mask(P["video"])
    nF = len(v)
    W = transcribe(P["video"])["words"]
    ranges = []
    for s in P["sentences"]:
        if not s["keep"]:
            continue
        f0, f1 = s.get("range", [s["from"], s["to"]])  # range — часть фразы (когда Whisper склеил несколько дублей в одну)
        a, b = f0 // HOP_MS, min(nF - 1, f1 // HOP_MS)
        # граница по голосу: начало — первый голос не раньше 250 мс до слова; конец — последний голос не позже 300 мс после
        lo, hi = max(0, a - 25), min(nF, b + 30)
        on = np.flatnonzero(v[lo:hi])
        if len(on) == 0:
            continue
        va, vb = lo + on[0], lo + on[-1] + 1
        # паузы внутри фразы длиннее max_pause — вырезать, оставив хвост и заход как на склейке
        k, start = va, va
        while k < vb:
            if not v[k]:
                j = k
                while j < vb and not v[j]:
                    j += 1
                if (j - k) * HOP_MS > max_pause:
                    ranges.append([start * HOP_MS - pad_in, k * HOP_MS + pad_out])
                    start = j
                k = j
            else:
                k += 1
        ranges.append([start * HOP_MS - pad_in, vb * HOP_MS + pad_out])
        ranges[-len(ranges):] = ranges[-len(ranges):]
    # первый заход не раньше начала, соседние куски, налезающие друг на друга, — сливаем
    ranges = [[max(0, a), min(P["durationMs"], b)] for a, b in ranges]
    ranges.sort()
    merged = []
    for a, b in ranges:
        if merged and a <= merged[-1][1] + 40:
            merged[-1][1] = max(merged[-1][1], b)
        else:
            merged.append([a, b])
    # куски без слов (дыхание, шорох в паузе) — не речь
    starts = [w["startMs"] for w in W]
    merged = [r for r in merged if any(r[0] - 300 <= t <= r[1] for t in starts) or r[1] - r[0] >= 800]
    # одинокое слово, оторванное паузой от своей фразы («громкий … голос у бассейна»), — вырезать (правка пользователя 11.10).
    # Отдельная короткая фраза с точкой («Третье.») — оставить.
    lone = []
    for k, (a, b) in enumerate(merged):
        inside = [w for w in W if a - 300 <= w["startMs"] <= b]
        nxt = merged[k + 1][0] if k + 1 < len(merged) else None
        if len(inside) == 1 and b - a < 900 and not inside[0]["text"].rstrip().endswith((".", "!", "?", "…")) and nxt is not None and nxt - b > 500:
            lone.append(k)
    merged = [r for k, r in enumerate(merged) if k not in lone]
    total = sum(b - a for a, b in merged)
    print(json.dumps({"keep": [[int(a), int(b)] for a, b in merged]}))
    print(f"кусков {len(merged)}, сырое {P['durationMs'] / 1000:.0f} с → {total / 1000:.1f} с (при ×1,1 ≈ {total / 1100:.1f} с)", file=sys.stderr)
    return merged


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    cmd, path = sys.argv[1], sys.argv[2]
    here = os.path.dirname(os.path.abspath(__file__))
    default_model = os.path.join(here, "..", "..", "..", "training", "alex", "Партия1", "_cache", "model_v2.json")
    if cmd == "plan":
        plan(path, sys.argv[sys.argv.index("--model") + 1] if "--model" in sys.argv else default_model)
    else:
        cut(path)
