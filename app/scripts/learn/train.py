"""Модель нарезки: какие слова сырого остаются в монтаже. Учится на восстановленных монтажах (_cache/*.cuts.json).

python scripts/learn/train.py <папка партии>
Проверка честная: учимся на всех роликах, кроме одного, проверяем на нём (по очереди на каждом).
Сравнение — с текущим правилом монтажёра (вырезать ранние дубли и паузы).
Модель — логистическая регрессия (numpy), веса → <папка партии>/_cache/model.json.
"""
import glob
import json
import os
import re
import sys

import numpy as np

FILLERS = {"ну", "эээ", "ээ", "э", "мм", "м", "типа", "короче", "собственно", "значит", "вот"}


def norm(t):
    return re.sub(r"[^\w%]+", "", t.lower().replace("ё", "е"))


def lcs(a, b):
    if not a or not b:
        return 0
    prev = [0] * (len(b) + 1)
    for x in a:
        cur = [0]
        for k, y in enumerate(b):
            cur.append(prev[k] + 1 if x == y else max(prev[k + 1], cur[-1]))
        prev = cur
    return prev[-1]


def sentences(W):
    """Фразы: граница — знак конца предложения или пауза > 600 мс."""
    sid, s, out = [], 0, []
    for k, w in enumerate(W):
        sid.append(s)
        nxt = W[k + 1] if k + 1 < len(W) else None
        if nxt is None or re.search(r"[.?!…]$", w["text"]) or nxt["startMs"] - w["endMs"] > 600 or nxt["file"] != w["file"]:
            s += 1
    groups = {}
    for k, g in enumerate(sid):
        groups.setdefault(g, []).append(k)
    return sid, [groups[g] for g in sorted(groups)]


FEATURES = [
    "bias", "prob", "gap_before", "gap_after", "dur", "filler", "short_word",
    "tri_later", "tri_earlier", "sent_rep_later", "sent_rep_earlier", "sent_len", "sent_short",
    "pos", "pos_start", "pos_end", "sent_gap_before", "sent_gap_after", "later_takes",
]


def features(W):
    T = [norm(w["text"]) for w in W]
    sid, sents = sentences(W)
    n = len(W)
    total = max(1, W[-1]["endMs"]) if W else 1
    tri = {}
    for k in range(n - 2):
        tri.setdefault((T[k], T[k + 1], T[k + 2]), []).append(k)
    # повтор фразы: похожа ли на одну из следующих/предыдущих 4 фраз в пределах 40 с
    srep_l, srep_e, later_takes = {}, {}, {}
    for si, s in enumerate(sents):
        a = [T[k] for k in s if T[k]]
        best_l = best_e = 0.0
        cnt = 0
        for sj in range(si + 1, min(len(sents), si + 6)):
            if W[sents[sj][0]]["startMs"] - W[s[-1]]["endMs"] > 40000:
                break
            b = [T[k] for k in sents[sj] if T[k]][: len(a) + 2]
            r = lcs(a, b) / max(1, len(a))
            best_l = max(best_l, r)
            cnt += r > 0.6
        for sj in range(max(0, si - 5), si):
            if W[s[0]]["startMs"] - W[sents[sj][-1]]["endMs"] > 40000:
                continue
            b = [T[k] for k in sents[sj] if T[k]]
            best_e = max(best_e, lcs(a, b[: len(a) + 2]) / max(1, len(a)))
        srep_l[si], srep_e[si], later_takes[si] = best_l, best_e, cnt
    X = []
    for k, w in enumerate(W):
        s = sents[sid[k]]
        gb = (w["startMs"] - W[k - 1]["endMs"]) if k > 0 and W[k - 1]["file"] == w["file"] else 3000
        ga = (W[k + 1]["startMs"] - w["endMs"]) if k + 1 < n and W[k + 1]["file"] == w["file"] else 3000
        t3 = [(T[i], T[i + 1], T[i + 2]) for i in range(max(0, k - 2), min(n - 2, k + 1))]
        later = any(any(o > k + 2 and W[o]["startMs"] - w["startMs"] < 45000 for o in tri.get(t, [])) for t in t3)
        earlier = any(any(o < k - 2 and w["startMs"] - W[o]["startMs"] < 45000 for o in tri.get(t, [])) for t in t3)
        sg_b = (W[s[0]]["startMs"] - W[s[0] - 1]["endMs"]) if s[0] > 0 and W[s[0] - 1]["file"] == w["file"] else 3000
        sg_a = (W[s[-1] + 1]["startMs"] - W[s[-1]]["endMs"]) if s[-1] + 1 < n and W[s[-1] + 1]["file"] == w["file"] else 3000
        pos = w["startMs"] / total
        X.append([
            1.0, w.get("p") or 0.8, min(gb, 3000) / 1000, min(ga, 3000) / 1000, np.log1p(max(1, w["endMs"] - w["startMs"])) / 7,
            float(T[k] in FILLERS), float(len(T[k]) <= 2), float(later), float(earlier), srep_l[sid[k]], srep_e[sid[k]],
            min(len(s), 30) / 30, float(len(s) <= 3), pos, float(pos < 0.08), float(pos > 0.92),
            min(sg_b, 3000) / 1000, min(sg_a, 3000) / 1000, min(later_takes[sid[k]], 4) / 4,
        ])
    return np.array(X, dtype=np.float64), sid


def fit(X, y, l2=1.0, iters=400, lr=0.5):
    mu, sd = X.mean(0), X.std(0) + 1e-6
    mu[0], sd[0] = 0, 1
    Z = (X - mu) / sd
    w = np.zeros(X.shape[1])
    pos = y.mean()
    cw = np.where(y == 1, 0.5 / pos, 0.5 / (1 - pos))  # классы уравновешены: вырезанного больше
    for _ in range(iters):
        p = 1 / (1 + np.exp(-Z @ w))
        g = Z.T @ ((p - y) * cw) / len(y) + l2 * w / len(y)
        w -= lr * g
    return {"w": w.tolist(), "mu": mu.tolist(), "sd": sd.tolist()}


def predict(m, X, sid):
    Z = (X - np.array(m["mu"])) / np.array(m["sd"])
    p = 1 / (1 + np.exp(-Z @ np.array(m["w"])))
    # решение по фразе целиком: монтажёр режет фразами, а не отдельными словами
    out = p.copy()
    for s in set(sid):
        idx = [k for k, g in enumerate(sid) if g == s]
        out[idx] = 0.5 * p[idx] + 0.5 * p[idx].mean()
    return out


def rule_baseline(W, X):
    """Текущее правило монтажёра: ранний дубль (фраза повторяется позже) и паузы — вырезать, остальное оставить."""
    rep_later = X[:, FEATURES.index("sent_rep_later")]
    return (rep_later < 0.75).astype(float)


def metrics(y, pred):
    acc = float((pred == y).mean())
    tp = float(((pred == 1) & (y == 1)).sum())
    prec = tp / max(1, (pred == 1).sum())
    rec = tp / max(1, (y == 1).sum())
    # склейки: переходы взято/вырезано; совпало, если у нас переход в пределах ±1 слова
    def edges(v):
        return {k for k in range(1, len(v)) if v[k] != v[k - 1]}
    ey, ep = edges(y), edges(pred)
    hit = sum(1 for e in ey if any(abs(e - q) <= 1 for q in ep))
    return {"acc": acc, "keepPrec": prec, "keepRec": rec, "cutsFound": hit / max(1, len(ey)), "cutsExtra": max(0, len(ep) - hit) / max(1, len(ey))}


def main(batch):
    data = []
    for p in sorted(glob.glob(os.path.join(batch, "_cache", "*.cuts.json"))):
        j = json.load(open(p, encoding="utf-8"))
        W = j["rawWords"]
        X, sid = features(W)
        y = np.array([1.0 if w["kept"] else 0.0 for w in W])
        data.append((j["folder"], X, y, sid, W))
    print(f"роликов: {len(data)}, слов сырого: {sum(len(d[2]) for d in data)}, из них взято: {int(sum(d[2].sum() for d in data))}\n")
    print(f"{'ролик (не видела при обучении)':34} {'модель: слов верно':>18} {'склеек найдено':>15} {'лишних':>7} | {'правило: слов':>13} {'склеек':>7}")
    M, B = [], []
    for k, (name, X, y, sid, W) in enumerate(data):
        Xtr = np.vstack([d[1] for i, d in enumerate(data) if i != k])
        ytr = np.concatenate([d[2] for i, d in enumerate(data) if i != k])
        m = fit(Xtr, ytr)
        pred = (predict(m, X, sid) > 0.5).astype(float)
        mm, bb = metrics(y, pred), metrics(y, rule_baseline(W, X))
        M.append(mm)
        B.append(bb)
        print(f"{name[:34]:34} {mm['acc']:18.0%} {mm['cutsFound']:15.0%} {mm['cutsExtra']:7.0%} | {bb['acc']:13.0%} {bb['cutsFound']:7.0%}")
    avg = lambda L, key: float(np.mean([x[key] for x in L]))
    print(f"\n{'СРЕДНЕЕ':34} {avg(M, 'acc'):18.0%} {avg(M, 'cutsFound'):15.0%} {avg(M, 'cutsExtra'):7.0%} | {avg(B, 'acc'):13.0%} {avg(B, 'cutsFound'):7.0%}")
    final = fit(np.vstack([d[1] for d in data]), np.concatenate([d[2] for d in data]))
    final["features"] = FEATURES
    final["cv"] = {"model": {k: avg(M, k) for k in M[0]}, "rule": {k: avg(B, k) for k in B[0]}, "videos": len(data)}
    json.dump(final, open(os.path.join(batch, "_cache", "model.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("\nвес признаков (чем больше по модулю, тем важнее; + оставить, − вырезать):")
    for f, w in sorted(zip(FEATURES, final["w"]), key=lambda t: -abs(t[1]))[:10]:
        print(f"  {f:18} {w:+.2f}")


if __name__ == "__main__" and (len(sys.argv) < 3 or sys.argv[2] != "v2"):
    sys.stdout.reconfigure(encoding="utf-8")
    main(sys.argv[1])


# ---------- v2: по фразам, как режет монтажёр ----------

SENT_FEATURES = ["bias", "len", "short", "prob", "gap_before", "gap_after", "pos", "pos_start", "pos_end", "is_later_take", "rep_later_weak", "filler_share", "words_per_sec"]


def take_groups(W, T, sents, theta=0.6, window_ms=45000):
    """Ранние дубли: фраза, похожая (≥ theta) на одну из следующих в пределах окна, или оборванный заход — вырезать."""
    earlier = set()
    for si, s in enumerate(sents):
        a = [T[k] for k in s if T[k]]
        if not a:
            continue
        for sj in range(si + 1, min(len(sents), si + 8)):
            if W[sents[sj][0]]["startMs"] - W[s[-1]]["endMs"] > window_ms:
                break
            b = [T[k] for k in sents[sj] if T[k]]
            # дубль: совпадает большая часть фразы; оборванный заход: короткая фраза — начало следующей
            if lcs(a, b[: len(a) + 3]) / len(a) >= theta or (len(a) <= 4 and b[: min(2, len(a))] == a[: min(2, len(a))]):
                earlier.add(si)
                break
    return earlier


def sent_features(W, T, sents, earlier):
    total = max(1, W[-1]["endMs"])
    X = []
    for si, s in enumerate(sents):
        a = [T[k] for k in s if T[k]]
        gb = (W[s[0]]["startMs"] - W[s[0] - 1]["endMs"]) if s[0] > 0 and W[s[0] - 1]["file"] == W[s[0]]["file"] else 3000
        ga = (W[s[-1] + 1]["startMs"] - W[s[-1]]["endMs"]) if s[-1] + 1 < len(W) and W[s[-1] + 1]["file"] == W[s[-1]]["file"] else 3000
        later_take = any(si - d >= 0 and (si - d) in earlier for d in (1, 2, 3))
        rep_weak = 0.0
        for sj in range(si + 1, min(len(sents), si + 6)):
            b = [T[k] for k in sents[sj] if T[k]]
            rep_weak = max(rep_weak, lcs(a, b[: len(a) + 3]) / max(1, len(a)))
        dur = max(1, W[s[-1]]["endMs"] - W[s[0]]["startMs"])
        pos = W[s[0]]["startMs"] / total
        X.append([1.0, min(len(s), 30) / 30, float(len(s) <= 3), float(np.mean([W[k].get("p") or 0.8 for k in s])), min(gb, 3000) / 1000,
                  min(ga, 3000) / 1000, pos, float(pos < 0.08), float(pos > 0.92), float(later_take), rep_weak,
                  float(np.mean([t in FILLERS for t in a])) if a else 1.0, len(s) / (dur / 1000)])
    return np.array(X)


def v2_prepare(W):
    T = [norm(w["text"]) for w in W]
    sid, sents = sentences(W)
    earlier = take_groups(W, T, sents)
    return T, sid, sents, earlier, sent_features(W, T, sents, earlier)


def v2_words(W, sents, earlier, p_sent, thr=0.5):
    pred = np.zeros(len(W))
    for si, s in enumerate(sents):
        if si not in earlier and p_sent[si] > thr:
            pred[s] = 1
    return pred


def main_v2(batch):
    data = []
    for p in sorted(glob.glob(os.path.join(batch, "_cache", "*.cuts.json"))):
        j = json.load(open(p, encoding="utf-8"))
        W = j["rawWords"]
        T, sid, sents, earlier, XS = v2_prepare(W)
        y = np.array([1.0 if w["kept"] else 0.0 for w in W])
        ys = np.array([float(np.mean(y[s]) > 0.5) for s in sents])  # фраза взята, если взята большая часть слов
        data.append((j["folder"], W, sents, earlier, XS, ys, y))
    print(f"\nv2 (по фразам): {'ролик':30} {'слов верно':>10} {'склеек найдено':>15} {'лишних':>7} {'дубли верно':>12}")
    M = []
    for k, (name, W, sents, earlier, XS, ys, y) in enumerate(data):
        mask = lambda d: np.array([si not in d[3] for si in range(len(d[2]))])  # учимся только на фразах, не попавших в дубли
        Xtr = np.vstack([d[4][mask(d)] for i, d in enumerate(data) if i != k])
        ytr = np.concatenate([d[5][mask(d)] for i, d in enumerate(data) if i != k])
        m = fit(Xtr, ytr, iters=600)
        Z = (XS - np.array(m["mu"])) / np.array(m["sd"])
        ps = 1 / (1 + np.exp(-Z @ np.array(m["w"])))
        pred = v2_words(W, sents, earlier, ps)
        mm = metrics(y, pred)
        er = [si for si in earlier]
        mm["takes"] = float(np.mean([ys[si] == 0 for si in er])) if er else 1.0
        M.append(mm)
        print(f"{'':16}{name[:30]:30} {mm['acc']:10.0%} {mm['cutsFound']:15.0%} {mm['cutsExtra']:7.0%} {mm['takes']:12.0%}")
    avg = lambda key: float(np.mean([x[key] for x in M]))
    print(f"{'':16}{'СРЕДНЕЕ':30} {avg('acc'):10.0%} {avg('cutsFound'):15.0%} {avg('cutsExtra'):7.0%} {avg('takes'):12.0%}")
    allX = np.vstack([d[4][np.array([si not in d[3] for si in range(len(d[2]))])] for d in data])
    ally = np.concatenate([d[5][np.array([si not in d[3] for si in range(len(d[2]))])] for d in data])
    final = fit(allX, ally, iters=600)
    final["features"] = SENT_FEATURES
    final["cv"] = {k: avg(k) for k in M[0]}
    json.dump(final, open(os.path.join(batch, "_cache", "model_v2.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("веса v2:", ", ".join(f"{f} {w:+.2f}" for f, w in sorted(zip(SENT_FEATURES, final["w"]), key=lambda t: -abs(t[1]))[:6]))


if __name__ == "__main__" and len(sys.argv) > 2 and sys.argv[2] == "v2":
    main_v2(sys.argv[1])
