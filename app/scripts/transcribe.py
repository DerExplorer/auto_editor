"""Транскрибация видео/аудио в JSON со словами: [{"text", "startMs", "endMs"}, ...].

Использование: python scripts/transcribe.py <input> [output.json]
Без output.json — печатает JSON в stdout.
"""
import json
import sys

from faster_whisper import WhisperModel


def transcribe(path):
    model = WhisperModel("small", device="cpu", compute_type="int8")
    segments, _ = model.transcribe(path, language="ru", word_timestamps=True)
    words = []
    for seg in segments:
        for w in seg.words or []:
            text = w.word.strip()
            if text:
                words.append({"text": text, "startMs": round(w.start * 1000), "endMs": round(w.end * 1000)})
    return words


if __name__ == "__main__":
    words = transcribe(sys.argv[1])
    out = json.dumps(words, ensure_ascii=False, indent=1)
    if len(sys.argv) > 2:
        with open(sys.argv[2], "w", encoding="utf-8") as f:
            f.write(out)
    else:
        sys.stdout.reconfigure(encoding="utf-8")
        print(out)
