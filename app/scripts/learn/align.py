"""Восстановление нарезки: готовый ролик ↔ сырое видео (без проекта монтажа, с ускорением).

python scripts/learn/align.py <папка партии> [номер папки]
Для каждой папки «NN Тема» с final.* и raw* пишет _cache/<папка>.cuts.json:
куски сырого (файл, начало, конец, скорость) в порядке готового ролика, и пометку каждого слова сырого — взято или вырезано.

Как: 1) слова готового и сырого сопоставляются по порядку (DP со штрафом за новый кусок);
2) у повторённых фраз (дубли) кусок сырого выбирается по сходству звука (DTW по мел-спектру);
3) скорость куска — по времени слов; 4) точка склейки уточняется по звуку.
"""
import json
import os
import re
import subprocess
import sys

import numpy as np

SR = 16000
HOP = 160  # 10 мс
N_MELS = 40


def norm(t):
    return re.sub(r"[^\w%]+", "", t.lower().replace("ё", "е"))


def load_words(batch, rel):
    p = os.path.join(batch, "_cache", rel.replace(os.sep, "__") + ".words.json")
    with open(p, encoding="utf-8") as f:
        return json.load(f)


# ---------- звук ----------

def audio(path):
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype=np.float32)


_MEL = {}


def mel_fb(n_fft=512):
    if n_fft in _MEL:
        return _MEL[n_fft]
    f = np.linspace(0, SR / 2, n_fft // 2 + 1)
    m = lambda hz: 2595 * np.log10(1 + hz / 700)
    pts = 700 * (10 ** (np.linspace(m(80), m(7600), N_MELS + 2) / 2595) - 1)
    fb = np.zeros((N_MELS, len(f)))
    for i in range(N_MELS):
        a, b, c = pts[i], pts[i + 1], pts[i + 2]
        fb[i] = np.clip(np.minimum((f - a) / (b - a), (c - f) / (c - b)), 0, None)
    _MEL[n_fft] = fb
    return fb


def energy(x):
    n = len(x) // HOP
    e = np.sqrt((x[: n * HOP].reshape(n, HOP) ** 2).mean(1) + 1e-10)
    return 20 * np.log10(e)


def mel(x, n_fft=512):
    if len(x) < n_fft:
        x = np.pad(x, (0, n_fft - len(x)))
    n = 1 + (len(x) - n_fft) // HOP
    idx = np.arange(n_fft)[None, :] + HOP * np.arange(n)[:, None]
    spec = np.abs(np.fft.rfft(x[idx] * np.hanning(n_fft), axis=1)) ** 2
    m = np.log(spec @ mel_fb(n_fft).T + 1e-8)
    m -= m.mean(1, keepdims=True)  # громкость не важна, важна форма спектра
    return m.astype(np.float32)


def frames(ms):
    return int(round(ms / 10))


def dtw_cost(a, b):
    """Средняя стоимость DTW между двумя мел-последовательностями (косинусное расстояние)."""
    if len(a) < 3 or len(b) < 3:
        return 1.0
    an = a / (np.linalg.norm(a, axis=1, keepdims=True) + 1e-8)
    bn = b / (np.linalg.norm(b, axis=1, keepdims=True) + 1e-8)
    d = 1 - an @ bn.T
    n, m = d.shape
    D = np.full((n + 1, m + 1), np.inf)
    D[0, 0] = 0
    # полоса Сакоэ — Тибы: скорость в разумных пределах
    for i in range(1, n + 1):
        j0 = max(1, int(i * m / n - 0.3 * m) )
        j1 = min(m, int(i * m / n + 0.3 * m) + 1)
        for j in range(j0, j1 + 1):
            D[i, j] = d[i - 1, j - 1] + min(D[i - 1, j], D[i, j - 1], D[i - 1, j - 1])
    return float(D[n, m] / (n + m))


# ---------- сопоставление слов ----------

def similar(a, b):
    if a == b:
        return 1.0
    if not a or not b:
        return 0.0
    if len(a) >= 4 and len(b) >= 4 and (a.startswith(b[:4]) or b.startswith(a[:4])):
        return 0.7
    return 0.0


def align_words(F, R, new_seg=2.5, gap_f=0.6):
    """Монотонное сопоставление: каждое слово готового — с одним словом сырого или пропуск.
    Новый кусок (прыжок в сыром) стоит new_seg, пропуск слова готового — gap_f."""
    nf, nr = len(F), len(R)
    S = np.zeros((nf, nr), dtype=np.float32)
    for i, a in enumerate(F):
        for j, b in enumerate(R):
            S[i, j] = similar(a, b)
    NEG = -1e9
    M = np.full((nf, nr), NEG, dtype=np.float64)  # слово i готового совпало со словом j сырого
    back = {}
    best_prev = np.full(nr + 1, NEG)  # лучший M[i-1][j'] для j' < j (префиксный максимум)
    best_prev_j = np.full(nr + 1, -1, dtype=np.int64)
    best_prev_i = np.full(nr + 1, -1, dtype=np.int64)
    carry = (0.0, -1, -1)  # лучший итог по всем строкам до i-1 (для пропусков слов готового)
    for i in range(nf):
        row = M[i]
        for j in range(nr):
            if S[i, j] <= 0:
                continue
            cands = [(S[i, j] - (new_seg if i > 0 else 0) - gap_f * i, None)]  # начать кусок здесь, всё до — пропуски
            if i > 0 and j > 0 and M[i - 1, j - 1] > NEG:
                cands.append((M[i - 1, j - 1] + S[i, j], (i - 1, j - 1)))  # продолжение куска
            if best_prev[j] > NEG:
                cands.append((best_prev[j] + S[i, j] - new_seg, (int(best_prev_i[j]), int(best_prev_j[j]))))
            if i > 1 and j > 1 and M[i - 2, j - 1] > NEG:
                cands.append((M[i - 2, j - 1] + S[i, j] - gap_f, (i - 2, j - 1)))  # слово готового не распознано
            if i > 0 and j > 1 and M[i - 1, j - 2] > NEG:
                cands.append((M[i - 1, j - 2] + S[i, j] - 0.3, (i - 1, j - 2)))  # лишнее слово в сыром внутри куска
            v, b = max(cands, key=lambda c: c[0])
            row[j] = v
            back[(i, j)] = b
        # префиксный максимум для следующей строки: лучшее среди всех строк ≤ i (пропуски учтены штрафом)
        nb = np.full(nr + 1, NEG)
        nbj = np.full(nr + 1, -1, dtype=np.int64)
        nbi = np.full(nr + 1, -1, dtype=np.int64)
        run, rj, ri = NEG, -1, -1
        for j in range(nr):
            cand = row[j]
            prev_carry = best_prev[j + 1] - gap_f if best_prev[j + 1] > NEG else NEG  # строка i пропущена
            if cand > run:
                run, rj, ri = cand, j, i
            if prev_carry > run and best_prev_i[j + 1] >= 0:
                run, rj, ri = prev_carry, int(best_prev_j[j + 1]), int(best_prev_i[j + 1])
            nb[j + 1], nbj[j + 1], nbi[j + 1] = run, rj, ri
        best_prev, best_prev_j, best_prev_i = nb, nbj, nbi
    # конец: лучшая клетка с учётом пропуска хвоста готового
    bi, bj, bv = -1, -1, NEG
    for i in range(nf):
        j = int(np.argmax(M[i]))
        v = M[i, j] - gap_f * (nf - 1 - i)
        if v > bv:
            bi, bj, bv = i, j, v
    pairs = []
    cur = (bi, bj)
    while cur is not None and cur[0] >= 0:
        pairs.append(cur)
        cur = back.get(cur)
    return pairs[::-1]


# ---------- основная работа над папкой ----------

def process(batch, folder):
    path = os.path.join(batch, folder)
    files = sorted(os.listdir(path))
    final = next(f for f in files if f.lower().startswith("final"))
    raws = [f for f in files if f.lower().startswith("raw")]
    raws.sort(key=lambda f: ("ранн" in f.lower(), f))  # основной дубль — первым, ранний — вторым
    fw = load_words(batch, os.path.join(folder, final))["words"]
    raw_words, raw_info, offset = [], [], 0
    GAP = 20000
    for k, rf in enumerate(raws):
        d = load_words(batch, os.path.join(folder, rf))
        for w in d["words"]:
            raw_words.append({**w, "file": k, "g0": w["startMs"] + offset, "g1": w["endMs"] + offset})
        raw_info.append({"file": rf, "offsetMs": offset, "durationMs": d["durationMs"]})
        offset += d["durationMs"] + GAP

    F = [norm(w["text"]) for w in fw]
    R = [norm(w["text"]) for w in raw_words]
    pairs = align_words(F, R)

    x_final = audio(os.path.join(path, final))
    A_final = mel(x_final)
    E_final = energy(x_final)[: len(A_final)]
    if len(E_final) < len(A_final):
        E_final = np.pad(E_final, (0, len(A_final) - len(E_final)), constant_values=-100)
    voiced = E_final > np.percentile(E_final, 30)  # тихие кадры (паузы) ничего не решают
    raw_x = [audio(os.path.join(path, rf)) for rf in raws]
    A_raw = np.concatenate([np.pad(mel(x), ((0, frames(GAP) if k < len(raws) - 1 else 0), (0, 0))) for k, x in enumerate(raw_x)])
    # голос в сыром по громкости: порог между шумом комнаты и речью (для точных пауз на склейках)
    raw_e = [energy(x) for x in raw_x]
    raw_voice = []
    for e in raw_e:
        lo, hi = np.percentile(e, 15), np.percentile(e, 95)
        raw_voice.append(e > lo + 0.3 * (hi - lo))
    An_f = A_final / (np.linalg.norm(A_final, axis=1, keepdims=True) + 1e-8)
    An_r = A_raw / (np.linalg.norm(A_raw, axis=1, keepdims=True) + 1e-8)
    nF = len(A_final)
    fts = np.arange(nF) * 10.0

    def sim_vec(offset, speed):
        """Сходство каждого кадра готового с сырым при отображении r = offset + f·speed."""
        ri = np.round((offset + fts * speed) / 10).astype(int)
        ok = (ri >= 0) & (ri < len(An_r))
        out = np.zeros(nF, dtype=np.float32)
        out[ok] = np.sum(An_f[ok] * An_r[ri[ok]], axis=1)
        return out

    # 1. скорость: по звуку на самых длинных участках подряд идущих слов
    runs, cur = [], [pairs[0]]
    for a, b in zip(pairs, pairs[1:]):
        if b[0] == a[0] + 1 and b[1] == a[1] + 1:
            cur.append(b)
        else:
            runs.append(cur)
            cur = [b]
    runs.append(cur)
    runs = sorted(runs, key=len, reverse=True)[:4]

    def run_score(run, speed):
        f0, f1 = fw[run[0][0]]["startMs"], fw[run[-1][0]]["endMs"]
        r0 = raw_words[run[0][1]]["g0"]
        fi0, fi1 = frames(f0), frames(f1)
        best = 0
        for off in range(-400, 401, 20):
            v = sim_vec(r0 + off - f0 * speed, speed)[fi0:fi1]
            best = max(best, float(v.mean()) if len(v) else 0)
        return best

    speeds = np.arange(0.95, 1.65, 0.01)
    score = [sum(run_score(r, sp) for r in runs) for sp in speeds]
    g_speed = float(speeds[int(np.argmax(score))])
    fine = np.arange(g_speed - 0.012, g_speed + 0.0121, 0.002)
    g_speed = float(fine[int(np.argmax([sum(run_score(r, sp) for r in runs) for sp in fine]))])

    # 2. куски по словам: у пар одного куска сдвиг r − f·скорость постоянен (с шумом Whisper ±0,2 с)
    groups = []
    for i, j in pairs:
        off = raw_words[j]["g0"] - fw[i]["startMs"] * g_speed
        if groups and abs(off - np.median(groups[-1]["offs"])) < 350 and raw_words[j]["file"] == groups[-1]["file"]:
            groups[-1]["pairs"].append((i, j))
            groups[-1]["offs"].append(off)
        else:
            groups.append({"pairs": [(i, j)], "offs": [off], "file": raw_words[j]["file"]})
    # одиночное слово, чей сдвиг вне соседей, — скорее ошибка распознавания: присоединяем к соседу, если звук совпадает
    def piece_sim(off, f0, f1):
        a, b = max(0, frames(f0)), min(nF, frames(f1))
        v = sim_vec(off, g_speed)[a:b][voiced[a:b]]
        return float(v.mean()) if len(v) else 0.0

    # 3. точный сдвиг каждого куска — по звуку (±300 мс, только кадры с голосом)
    pieces = []
    for g in groups:
        f0 = fw[g["pairs"][0][0]]["startMs"]
        f1 = fw[g["pairs"][-1][0]]["endMs"]
        base = float(np.median(g["offs"]))
        sc, off = max((piece_sim(base + o, f0, f1), base + o) for o in range(-300, 301, 10))
        pieces.append({"f0": f0, "f1": f1, "off": off, "sim": sc, "file": g["file"], "words": len(g["pairs"])})
    # сомнительные куски (мало слов или звук совпал плохо) — ищем место по звуку во всём сыром
    def global_search(f0, f1):
        a, b = max(0, frames(f0)), min(nF, frames(f1))
        tt = np.arange(a, b)[voiced[a:b]]
        if len(tt) < 5:
            return None
        rel = np.round(tt * g_speed).astype(int) - int(round(a * g_speed))
        Q = An_f[tt]
        best = (-1.0, 0)
        starts = np.arange(0, len(An_r) - rel[-1] - 1, 2)
        for c in range(0, len(starts), 2000):
            st = starts[c:c + 2000]
            G = An_r[st[:, None] + rel[None, :]]  # (кандидаты, кадры, 40)
            v = np.einsum("ktd,td->k", G, Q) / len(tt)
            k = int(np.argmax(v))
            if v[k] > best[0]:
                best = (float(v[k]), int(st[k]))
        r0 = best[1] * 10.0
        return best[0], r0 - a * 10.0 * g_speed

    for pc in pieces:
        if pc["sim"] < 0.9 or pc["words"] <= 2:
            g = global_search(pc["f0"] - 100, pc["f1"] + 100)
            if g and g[0] > pc["sim"] + 0.03:
                pc["sim"], pc["off"] = g
                pc["file"] = max(i for i, ri in enumerate(raw_info) if pc["off"] + pc["f0"] * g_speed >= ri["offsetMs"] - 50)

    # слить соседние куски с почти одинаковым сдвигом (это один кусок, просто слово распознано неточно)
    merged = []
    for pc in pieces:
        if merged and abs(pc["off"] - merged[-1]["off"]) < 60 and pc["file"] == merged[-1]["file"]:
            m = merged[-1]
            m["f1"], m["words"] = pc["f1"], m["words"] + pc["words"]
        else:
            merged.append(dict(pc))
    pieces = merged

    # 4. точка склейки между кусками: в промежутке между словами — где звук перестаёт совпадать с одним и начинает с другим
    for k in range(len(pieces) - 1):
        a, b = pieces[k], pieces[k + 1]
        lo, hi = a["f1"] - 200, b["f0"] + 200
        if hi <= lo:
            lo, hi = b["f0"] - 100, a["f1"] + 100
        ts = np.arange(lo, hi, 10)
        sa, sb = sim_vec(a["off"], g_speed), sim_vec(b["off"], g_speed)
        best_t, best_v = (a["f1"] + b["f0"]) / 2, -1e9
        for t in ts:
            i = frames(t)
            ia, ib = max(0, frames(lo)), min(nF, frames(hi))
            # голос решает, тишина (дыхание, шум комнаты) — с меньшим весом: так видно, чья это пауза
            wa = np.where(voiced[ia:i], 1.0, 0.35)
            wb = np.where(voiced[i:ib], 1.0, 0.35)
            v = float((sa[ia:i] * wa).sum() + (sb[i:ib] * wb).sum())
            if v > best_v + 1e-6:
                best_t, best_v = t, v
        a["cut_out_f"] = b["cut_in_f"] = float(best_t)
    if pieces:
        pieces[0]["cut_in_f"] = max(0.0, pieces[0]["f0"] - 200)
        pieces[-1]["cut_out_f"] = min(nF * 10.0, pieces[-1]["f1"] + 400)
    out = []
    for pc in pieces:
        out.append({"cut_in_f": pc["cut_in_f"], "cut_out_f": pc["cut_out_f"], "cut_in_r": pc["off"] + pc["cut_in_f"] * g_speed,
                    "cut_out_r": pc["off"] + pc["cut_out_f"] * g_speed, "file": pc["file"], "speed": g_speed,
                    "words": pc["words"], "sim": round(pc["sim"], 3),
                    "first_word_f": pc["f0"], "last_word_f": pc["f1"]})

    # дубли: фраза встречается в сыром несколько раз — какой дубль взят
    retakes = []
    for o in out:
        ks = [j for j, w in enumerate(raw_words) if w["g0"] >= o["cut_in_r"] - 50 and w["g1"] <= o["cut_out_r"] + 50]
        if len(ks) < 3:
            continue
        t3 = R[ks[0]:ks[0] + 3]
        occ = sorted({k for k in range(len(R) - 2) if R[k:k + 3] == t3} | {ks[0]})
        if len(occ) > 1:
            retakes.append({"text": " ".join(R[ks[0]:ks[0] + 6]), "takes": len(occ), "chosen": occ.index(ks[0]) + 1, "last": ks[0] == occ[-1]})
    for o in out:
        o["cut_in_r"] -= raw_info[o["file"]]["offsetMs"]
        o["cut_out_r"] -= raw_info[o["file"]]["offsetMs"]
        # тишина, оставленная на склейке: от точки входа до начала голоса и от конца голоса до точки выхода (по звуку сырого)
        v = raw_voice[o["file"]]
        a, b = max(0, frames(o["cut_in_r"])), min(len(v), frames(o["cut_out_r"]))
        on = np.flatnonzero(v[a:b])
        o["voice_in_ms"] = float(on[0] * 10) if len(on) else None
        o["voice_out_ms"] = float((b - a - 1 - on[-1]) * 10) if len(on) else None
    total_f = nF * 10

    kept = set()
    for o in out:
        for j, w in enumerate(raw_words):
            mid = (w["startMs"] + w["endMs"]) / 2
            if w["file"] == o["file"] and o["cut_in_r"] - 20 <= mid <= o["cut_out_r"] + 20:
                kept.add(j)
    labels = [{"text": w["text"], "file": w["file"], "startMs": w["startMs"], "endMs": w["endMs"], "p": w.get("p"), "kept": j in kept} for j, w in enumerate(raw_words)]
    covered = sum(o["cut_out_f"] - o["cut_in_f"] for o in out) / total_f
    res = {
        "folder": folder, "final": final, "raws": raw_info, "finalDurationMs": total_f, "globalSpeed": round(g_speed, 3),
        "coveredFinal": round(covered, 3), "segments": out, "retakes": retakes, "rawWords": labels,
    }
    with open(os.path.join(batch, "_cache", f"{folder}.cuts.json"), "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=0)
    keptn = sum(l["kept"] for l in labels)
    print(f"{folder}: кусков {len(out)}, скорость ×{g_speed:.3f}, готовое покрыто сырым {covered:.0%}, "
          f"взято слов сырого {keptn}/{len(labels)}, дублей {len(retakes)} (последний взят {sum(r['last'] for r in retakes)})", flush=True)


def refine_edge(A_final, A_raw, seg, lo, hi, side):
    """Граница куска в готовом ролике между lo и hi (мс): последний/первый кадр, где звук ещё совпадает с сырым."""
    if hi - lo < 30:
        return hi if side == "out" else lo
    sp = seg["speed"]
    best_t, best = (hi if side == "out" else lo), None
    cost = []
    ts = np.arange(lo, hi, 10)
    for t in ts:
        rt = seg["r1"] + (t - seg["f1"]) * sp if side == "out" else seg["r0"] - (seg["f0"] - t) * sp
        fi, ri = frames(t), frames(rt)
        if 0 <= fi < len(A_final) and 0 <= ri < len(A_raw):
            a, b = A_final[fi], A_raw[ri]
            cost.append(1 - float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-8)))
        else:
            cost.append(1.0)
    cost = np.array(cost)
    if len(cost) == 0:
        return best_t
    good = cost < 0.25
    if side == "out":
        # от начала промежутка — пока совпадает; конец совпадения = граница
        k = 0
        while k < len(good) and good[k]:
            k += 1
        return float(ts[k - 1] + 10) if k > 0 else float(lo)
    k = len(good) - 1
    while k >= 0 and good[k]:
        k -= 1
    return float(ts[k + 1]) if k + 1 < len(good) else float(hi)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    batch = sys.argv[1]
    only = sys.argv[2] if len(sys.argv) > 2 else None
    for folder in sorted(os.listdir(batch)):
        if re.match(r"^\d\d ", folder) and (not only or folder.startswith(only)):
            process(batch, folder)
