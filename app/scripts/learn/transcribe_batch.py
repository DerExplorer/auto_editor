"""Распознавание всех роликов партии обучения: слова с временем начала и конца.

python scripts/learn/transcribe_batch.py <папка партии>
Кэш — <папка партии>/_cache/<файл>.words.json, повторно не считается.
"""
import json
import os
import sys
import time

from faster_whisper import WhisperModel

VIDEO = (".mp4", ".mov", ".m4v")


def main(batch):
    cache = os.path.join(batch, "_cache")
    os.makedirs(cache, exist_ok=True)
    files = sorted(
        os.path.join(dp, f) for dp, _, fs in os.walk(batch) if "_cache" not in dp for f in fs if f.lower().endswith(VIDEO)
    )
    model = WhisperModel("small", device="cpu", compute_type="int8")
    t0 = time.time()
    for i, path in enumerate(files, 1):
        rel = os.path.relpath(path, batch)
        out = os.path.join(cache, rel.replace(os.sep, "__") + ".words.json")
        if os.path.exists(out):
            continue
        t = time.time()
        segments, info = model.transcribe(path, language="ru", word_timestamps=True)
        words = [
            {"text": w.word.strip(), "startMs": round(w.start * 1000), "endMs": round(w.end * 1000), "p": round(w.probability, 3)}
            for seg in segments
            for w in seg.words or []
            if w.word.strip()
        ]
        with open(out, "w", encoding="utf-8") as f:
            json.dump({"file": rel, "durationMs": round(info.duration * 1000), "words": words}, f, ensure_ascii=False)
        print(f"[{i}/{len(files)}] {len(words)} слов за {time.time() - t:.0f} с — {rel}", flush=True)
    print(f"готово за {(time.time() - t0) / 60:.1f} мин", flush=True)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main(sys.argv[1])
