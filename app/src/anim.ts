// Общие помощники анимаций (Phone.tsx, GdpDemo.tsx): прогресс по времени, плавная кривая камеры, цвета.
import { Easing, interpolate } from "remotion";

export const EASE = Easing.bezier(0.25, 0.1, 0.25, 1);
export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// 0 → 1 за dur мс начиная со start
export const prog = (t: number, start: number, dur: number, e = EASE) => interpolate(t, [start, start + dur], [0, 1], { ...clamp, easing: e });
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

// Цвет #rrggbb, умноженный на k (k < 1 — темнее, k > 1 — светлее)
export const shade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.round(Math.min(255, Math.max(0, ((n >> s) & 255) * k)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};

// Плавная кривая через ключи (xs по возрастанию) — монотонный кубический сплайн (Фриич — Батленд).
// Скорость не обрывается на ключах, значения не выходят за соседние ключи; на краях — плавный старт и остановка.
export const smoothAt = (xs: number[], ys: number[], x: number) => {
  const n = xs.length;
  if (n === 1 || x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  const d = xs.slice(1).map((_, k) => (ys[k + 1] - ys[k]) / (xs[k + 1] - xs[k]));
  const m = xs.map((_, k) => {
    if (k === 0 || k === n - 1) return 0;
    const d0 = d[k - 1];
    const d1 = d[k];
    if (d0 * d1 <= 0) return 0;
    const h0 = xs[k] - xs[k - 1];
    const h1 = xs[k + 1] - xs[k];
    return (3 * (h0 + h1)) / ((2 * h1 + h0) / d0 + (h1 + 2 * h0) / d1);
  });
  let k = 0;
  while (xs[k + 1] < x) k++;
  const h = xs[k + 1] - xs[k];
  const u = (x - xs[k]) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * ys[k] + (u3 - 2 * u2 + u) * h * m[k] + (-2 * u3 + 3 * u2) * ys[k + 1] + (u3 - u2) * h * m[k + 1];
};
