// Раскладка подписей в зоне субтитров (правило пользователя 11.10):
// зона — нижняя треть внутри безопасной области: слева 70 px, справа до колонки кнопок (1080 − 170 = 910 px), низ ≤ 1517 px;
// строки не по линейке по центру, а то правее, то левее; можно чуть выйти за поля (до 35 px), но не к самому краю кадра.
import { useEffect, useState } from "react";
import { continueRender, delayRender } from "remotion";
import { fontOf } from "./theme";
import type { TextStyle } from "./types";

export const ZONE = { left: 70, right: 910, overflow: 35, maxBottomPct: 0.79 }; // в пикселях кадра шириной 1080

let ctx: CanvasRenderingContext2D | null = null;
// ширина текста в px (шрифты клиента грузятся до рендера — loadFont)
export const measure = (text: string, t: TextStyle, base: number, upper: boolean) => {
  ctx ??= document.createElement("canvas").getContext("2d");
  const size = base * t.sizePct;
  if (!ctx) return text.length * size * 0.55;
  ctx.font = `${size}px ${fontOf(t.font)}`;
  return ctx.measureText(upper ? text.toUpperCase() : text).width + (t.stroke ?? 0) * size;
};

// Ширину можно мерить только загруженным шрифтом: иначе canvas берёт запасной, и на первом кадре вкладки рендера
// раскладка другая — текст «прыгает» (баг с цифрой 3 в хуке, 11.10). Хук ждёт шрифты (delayRender) и перерисовывает.
export const useFontsReady = (looks: TextStyle[], _base: number) => {
  // document.fonts.check() говорит «готово», пока шрифт ещё даже не добавлен, — ждём, пока наш FontFace будет загружен
  const families = [...new Set(looks.map((t) => /^"([^"]+)"/.exec(fontOf(t.font))?.[1]).filter((f): f is string => !!f))];
  const loaded = () =>
    typeof document === "undefined" || families.every((fam) => [...document.fonts].some((f) => f.family.replace(/["']/g, "") === fam && f.status === "loaded"));
  const [ready, setReady] = useState(loaded);
  useEffect(() => {
    if (ready) return;
    const h = delayRender("шрифты для раскладки субтитров");
    const t0 = Date.now();
    const tick = () => {
      if (loaded() || Date.now() - t0 > 8000) {
        setReady(true);
        continueRender(h);
      } else setTimeout(tick, 30);
    };
    tick();
  }, [ready]);
  return ready;
};

// детерминированное «случайное» 0..1 — чтобы при каждом кадре раскладка была та же
export const rand = (seed: number) => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// Горизонталь строки шириной w: левый край и масштаб (если строка шире зоны с запасом — уменьшаем).
// side — в какую сторону от центра (+1 вправо, −1 влево), amount 0..1 — насколько далеко.
export const placeX = (w: number, width: number, side: number, amount: number) => {
  const k = width / 1080;
  const L = ZONE.left * k;
  const R = ZONE.right * k;
  const O = ZONE.overflow * k;
  const free = R - L - w;
  if (free >= 0) return { x: L + free * (0.5 + (side * amount) / 2), scale: 1 };
  // не влезает в поля — чуть выходим за них (поровну), а если и так не влезает — уменьшаем
  const max = R - L + 2 * O;
  if (w <= max) return { x: L + free / 2, scale: 1 };
  return { x: L - O, scale: max / w };
};

// По центру кадра (слова субтитров по одному — всегда примерно в центре, правка 11.10); у краёв — сдвиг внутрь зоны.
export const centerX = (w: number, width: number) => {
  const k = width / 1080;
  const L = (ZONE.left - ZONE.overflow) * k;
  const R = (ZONE.right + ZONE.overflow) * k;
  if (w > R - L) return { x: L, scale: (R - L) / w };
  return { x: Math.min(R - w, Math.max(L, (width - w) / 2)), scale: 1 };
};
