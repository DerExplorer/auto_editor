// «Камера»: чередование приближения/отдаления каждые ~5–8 с. Интервал, сила и скорость
// зависят от напряжённости речи = громкость (RMS) + темп (слов в секунду) в окне.
import { execFileSync } from "node:child_process";

// Громкость исходника по окнам 100 мс (моно, 8 кГц).
export const loudness = (file) => {
  const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-ac", "1", "-ar", "8000", "-f", "s16le", "-"], { maxBuffer: 1 << 30 });
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  const win = 800;
  const out = [];
  for (let i = 0; i < samples.length; i += win) {
    let s = 0;
    const n = Math.min(win, samples.length - i);
    for (let k = 0; k < n; k++) s += samples[i + k] * samples[i + k];
    out.push(Math.sqrt(s / n));
  }
  return out; // индекс = мс / 100
};

const lerp = (a, b, t) => a + (b - a) * t;

// intensityAt(ms) ∈ [0,1]: перцентиль сглаженной смеси громкости и темпа.
export const makeIntensity = (durationMs, rmsAt, words) => {
  const step = 250;
  const raw = [];
  for (let t = 0; t < durationMs; t += step) {
    let rms = 0;
    let n = 0;
    for (let d = -750; d <= 750; d += 100) (rms += rmsAt(t + d)), n++;
    const rate = words.filter((w) => w.startMs > t - 1500 && w.startMs < t + 1500).length / 3;
    raw.push({ rms: rms / n, rate });
  }
  const rank = (arr) => {
    const sorted = [...arr].sort((a, b) => a - b);
    return arr.map((v) => sorted.findIndex((x) => x >= v) / Math.max(1, sorted.length - 1));
  };
  const r1 = rank(raw.map((x) => x.rms));
  const r2 = rank(raw.map((x) => x.rate));
  const mix = raw.map((_, i) => 0.6 * r1[i] + 0.4 * r2[i]);
  return (ms, spanMs = 0) => {
    const a = Math.max(0, Math.floor((ms - spanMs / 2) / step));
    const b = Math.min(mix.length - 1, Math.floor((ms + spanMs / 2) / step));
    let s = 0;
    for (let i = a; i <= b; i++) s += mix[i];
    return b >= a ? s / (b - a + 1) : 0.5;
  };
};

// Ключи камеры: {atMs, scale, rampMs}. Точки ставим на начала смысловых блоков субтитров,
// чтобы движение совпадало с фразами. Напряжённее → чаще, сильнее, быстрее.
export const planCamera = (durationMs, intensity, snapPoints, cfg = {}) => {
  const { minIntervalMs = 5000, maxIntervalMs = 8000, inMin = 1.07, inMax = 1.15, outScale = 1.0 } = cfg;
  const keys = [{ atMs: 0, scale: outScale, rampMs: 0 }];
  let t = 0;
  let zoomedIn = false;
  for (;;) {
    const I = intensity(t + 3000, 6000);
    const target = t + lerp(maxIntervalMs, minIntervalMs, I);
    if (target > durationMs - 2000) break;
    const near = snapPoints.filter((p) => Math.abs(p - target) < 1500 && p > t + 3000).sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
    const at = near ?? target;
    const Ik = intensity(at, 1500);
    zoomedIn = !zoomedIn;
    keys.push({ atMs: at, scale: zoomedIn ? lerp(inMin, inMax, Ik) : outScale, rampMs: Math.round(lerp(1800, 400, Ik)) });
    t = at;
  }
  return keys;
};
