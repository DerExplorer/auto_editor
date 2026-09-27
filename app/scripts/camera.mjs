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

// Ключи камеры: {atMs, scale, rampMs}. База — всегда 100%. Время от времени плавный наезд
// до ~107% (на начале смыслового блока), удержание хотя бы пару секунд, затем плавный возврат
// к 100% — без резких «полётов». Напряжённее речь → циклы чаще и наезд чуть сильнее.
export const planCamera = (durationMs, intensity, snapPoints, cfg = {}) => {
  const {
    minIntervalMs = 5000, // между началами наездов
    maxIntervalMs = 8000,
    inMin = 1.06,
    inMax = 1.08,
    rampInMs = 2200, // наезд — медленно и плавно
    rampOutMs = 1600,
    minHoldMs = 2500, // удержание после наезда перед отдалением
  } = cfg;
  const keys = [{ atMs: 0, scale: 1, rampMs: 0 }];
  let t = 1500;
  for (;;) {
    const I = intensity(t + 3000, 6000);
    const target = t + lerp(maxIntervalMs, minIntervalMs, I) * 0.5;
    const near = snapPoints.filter((p) => Math.abs(p - target) < 1500 && p > t).sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
    const at = near ?? target;
    const interval = lerp(maxIntervalMs, minIntervalMs, intensity(at, 3000));
    const hold = Math.max(minHoldMs, interval - rampInMs - rampOutMs - 1500);
    const outAt = at + rampInMs + hold;
    if (outAt + rampOutMs > durationMs - 500) break;
    keys.push({ atMs: at, scale: lerp(inMin, inMax, intensity(at, 1500)), rampMs: rampInMs });
    keys.push({ atMs: outAt, scale: 1, rampMs: rampOutMs });
    t = outAt + rampOutMs + 1500;
  }
  return keys;
};
