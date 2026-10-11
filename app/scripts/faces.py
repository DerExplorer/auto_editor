"""Лицо в кадре: детектор YuNet (OpenCV, модель tools/faces/face_detection_yunet_2023mar.onnx).

track <видео> <out.json> [--fps 2]
    где лицо по времени: {"w","h","frames": [{"ms", "face": [x, y, w, h, score] | null}]}, координаты — доли кадра.
check <clean.mp4> <mask.mp4> <out.json> [--fps 5] [--shots <папка>]
    clean — ролик без текста (только видео), mask — только текст и плашки белым на чёрном (рендер с debug).
    Для каждого кадра: лицо в clean, какая доля лица закрыта белым в mask. Наложения сводятся в отрезки.
"""
import json
import os
import sys

import cv2
import numpy as np

MODEL = os.path.join(os.path.dirname(__file__), "..", "..", "tools", "faces", "face_detection_yunet_2023mar.onnx")


def detector(w, h):
    d = cv2.FaceDetectorYN.create(MODEL, "", (w, h), score_threshold=0.6, nms_threshold=0.3, top_k=20)
    return d


def frames(path, fps):
    cap = cv2.VideoCapture(path)
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30
    step = max(1, round(src_fps / fps))
    i = 0
    while True:
        ok = cap.grab()
        if not ok:
            break
        if i % step == 0:
            ok, img = cap.retrieve()
            if ok:
                yield i, round(i / src_fps * 1000), img
        i += 1
    cap.release()


def biggest(det, img):
    h, w = img.shape[:2]
    # мелкий кадр детектор видит хуже — увеличиваем до ~640 по высоте
    k = max(1.0, 640 / h)
    if k > 1:
        img = cv2.resize(img, (round(w * k), round(h * k)))
    det.setInputSize((img.shape[1], img.shape[0]))
    _, faces = det.detect(img)
    if faces is None or not len(faces):
        return None
    f = max(faces, key=lambda r: r[2] * r[3])
    W, H = img.shape[1], img.shape[0]
    return [float(f[0] / W), float(f[1] / H), float(f[2] / W), float(f[3] / H), float(f[14])]


def track(path, out, fps=2.0):
    cap = cv2.VideoCapture(path)
    w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    det = detector(w, h)
    res = [{"ms": ms, "face": biggest(det, img)} for _, ms, img in frames(path, fps)]
    json.dump({"w": w, "h": h, "fps": fps, "frames": res}, open(out, "w"), indent=0)
    found = sum(1 for r in res if r["face"])
    print(f"  лицо: найдено в {found}/{len(res)} кадров")


def check(clean, mask, out, fps=5.0, shots=None):
    cm = cv2.VideoCapture(mask)
    m_fps = cm.get(cv2.CAP_PROP_FPS) or 30
    det = None
    hits = []
    checked = 0
    mi = -1
    mimg = None
    for i, ms, img in frames(clean, fps):
        # кадр маски с тем же номером
        while mi < i:
            ok, mimg = cm.read()
            if not ok:
                mimg = None
                break
            mi += 1
        if mimg is None:
            break
        if det is None:
            det = detector(img.shape[1], img.shape[0])
        f = biggest(det, img)
        if not f:
            continue
        checked += 1
        H, W = mimg.shape[:2]
        x, y, w, h = f[:4]
        # лицо: от бровей до подбородка, чуть шире по бокам; волосы сверху закрывать можно
        x0, x1 = int((x - 0.08 * w) * W), int((x + 1.08 * w) * W)
        y0, y1 = int((y + 0.05 * h) * H), int((y + 1.05 * h) * H)
        x0, y0 = max(0, x0), max(0, y0)
        roi = mimg[y0:y1, x0:x1]
        if roi.size == 0:
            continue
        covered = float((roi.max(axis=2) > 150).mean())
        if covered > 0.03:
            hits.append({"ms": ms, "frame": i, "covered": round(covered, 3), "face": [round(v, 4) for v in f[:4]]})
            if shots:
                os.makedirs(shots, exist_ok=True)
                vis = img.copy()
                vis[mimg.max(axis=2) > 150] = (0, 200, 255)
                cv2.rectangle(vis, (x0, y0), (x1, y1), (0, 0, 255), 2)
                cv2.imwrite(os.path.join(shots, f"{ms:07d}.jpg"), vis)
    cm.release()
    # соседние кадры с наложением — один отрезок
    spans = []
    gap = 1000 / fps * 1.6
    for hgt in hits:
        if spans and hgt["ms"] - spans[-1]["toMs"] <= gap:
            s = spans[-1]
            s["toMs"] = hgt["ms"]
            if hgt["covered"] > s["covered"]:
                s["covered"], s["worstMs"] = hgt["covered"], hgt["ms"]
        else:
            spans.append({"fromMs": hgt["ms"], "toMs": hgt["ms"], "covered": hgt["covered"], "worstMs": hgt["ms"]})
    json.dump({"checked": checked, "spans": spans, "hits": hits}, open(out, "w"), indent=1)
    return checked, spans


if __name__ == "__main__":
    a = sys.argv[1:]
    opt = lambda k, d: type(d)(a[a.index(k) + 1]) if k in a else d
    if a[0] == "track":
        track(a[1], a[2], opt("--fps", 2.0))
    elif a[0] == "check":
        checked, spans = check(a[1], a[2], a[3], opt("--fps", 5.0), opt("--shots", ""))
        print(f"  проверено кадров с лицом: {checked}, наложений на лицо: {len(spans)}")
        for s in spans:
            print(f"  ⚠ текст на лице {s['fromMs'] / 1000:.1f}–{s['toMs'] / 1000:.1f} с, закрыто до {s['covered'] * 100:.0f}% лица")
