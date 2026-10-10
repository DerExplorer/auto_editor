// Сценарии айфона из деталей Phone.tsx: Настройки → Авиарежим → домой → свайп → Spotify.
// PhoneDemo — v1 (подробно, камера стоит), PhoneDemoMin — v2 (заглушки), PhoneDemoDynamic — v4 (динамика),
// PhoneDemoFx — v5 (эталон: темп v4 × 1,25, плавная камера, эффекты). Правила — CLAUDE.md, «Анимации».
import React from "react";
import { AbsoluteFill, Html5Audio, Sequence, staticFile } from "remotion";
import { DEFAULT_PAGES, PhoneSceneView, type CamKey, type PhoneEffects, type PhoneStep } from "./Phone";

export const PHONE_FPS = 30;
export const PHONE_DURATION = 10.5;

const STEPS: PhoneStep[] = [
  { kind: "tap", atMs: 1400, app: "settings" },
  { kind: "toggle", atMs: 2850, row: "Авиарежим", zoom: true },
  { kind: "home", atMs: 4200 },
  { kind: "swipe", atMs: 5350, dir: "left" },
  { kind: "tap", atMs: 6750, app: "spotify" },
];
const SFX: [number, string, number][] = [
  [50, "whoosh", 0.7],
  [1400, "tap", 0.8],
  [2850, "switch", 1],
  [4250, "swipe", 0.45],
  [5350, "swipe", 0.45],
  [6750, "tap", 0.8],
];
const logos = Object.fromEntries(DEFAULT_PAGES[1].map((n) => [n, `phone/${n}.png`]));

export const PhoneDemo: React.FC<{ minimal?: boolean }> = ({ minimal }) => (
  <AbsoluteFill>
    <PhoneSceneView durationMs={PHONE_DURATION * 1000 + 1000} steps={STEPS} logos={logos} minimal={minimal} heightPct={1360 / 1920} topPct={160 / 1920} />
    {SFX.map(([ms, src, vol], i) => (
      <Sequence key={i} from={Math.round((ms / 1000) * PHONE_FPS)} layout="none">
        <Html5Audio src={staticFile(`phone/${src}.mp3`)} volume={vol} />
      </Sequence>
    ))}
  </AbsoluteFill>
);

// v4 — динамика: середина по детализации (готовые иконки, заглушки только у дальних рядов),
// камера с наездами и наклонами, пружинное открытие, поп самолётика, свечение тумблера, размытие свайпа.
export const PHONE_DYN_DURATION = 8.3;
const DYN_STEPS: PhoneStep[] = [
  { kind: "tap", atMs: 1100, app: "settings" },
  { kind: "toggle", atMs: 2350, row: "Авиарежим" },
  { kind: "home", atMs: 3500 },
  { kind: "swipe", atMs: 4300, dir: "left" },
  { kind: "tap", atMs: 5500, app: "spotify" },
];
// быстрые переезды (~250 мс) чередуются с медленным дрейфом
const DYN_CAMERA: CamKey[] = [
  { atMs: 0, zoom: 0.93, rx: 22, ry: -24 }, // въезд с разворотом
  { atMs: 750, zoom: 1, x: 196, y: 426, rx: 0, ry: 5 },
  { atMs: 850, zoom: 1.01, ry: 4 },
  { atMs: 1080, zoom: 1.42, x: 335, y: 415, ry: -6 }, // наезд на «Настройки»
  { atMs: 1300, zoom: 1.45, x: 330, y: 410, ry: -7 },
  { atMs: 1600, zoom: 1.15, x: 196, y: 380, ry: 3 }, // приложение открылось
  { atMs: 1950, zoom: 1.17, ry: 2 },
  { atMs: 2200, zoom: 1.6, x: 250, y: 180, rx: 4, ry: -9 }, // тумблер и статус-бар
  { atMs: 3000, zoom: 1.66, x: 256, y: 176, rx: 4, ry: -6 },
  { atMs: 3300, zoom: 1, x: 196, y: 426, rx: 0, ry: 8 }, // отъезд перед «домой»
  { atMs: 3750, zoom: 1.02, ry: 2 },
  { atMs: 4150, zoom: 1.05, ry: 10 },
  { atMs: 4600, zoom: 1.06, ry: -9 }, // камера ведёт за свайпом
  { atMs: 5100, zoom: 1.06, ry: -6 },
  { atMs: 5350, zoom: 1.48, x: 150, y: 207, ry: -4 }, // наезд на Spotify
  { atMs: 5550, zoom: 1.5 },
  { atMs: 5850, zoom: 1, x: 196, y: 426, ry: 0 },
  { atMs: 6400, zoom: 1 },
  { atMs: 8300, zoom: 1.14, y: 330, ry: 5 }, // медленный наезд в конце
];
const DYN_SFX: [number, string, number][] = [
  [50, "whoosh", 0.7],
  [900, "whoosh", 0.25],
  [1100, "tap", 0.8],
  [2350, "switch", 1],
  [3550, "swipe", 0.45],
  [4300, "swipe", 0.45],
  [5150, "whoosh", 0.25],
  [5500, "tap", 0.8],
];
export const PhoneDemoDynamic: React.FC = () => (
  <AbsoluteFill>
    <PhoneSceneView
      durationMs={PHONE_DYN_DURATION * 1000 + 1000}
      steps={DYN_STEPS}
      logos={logos}
      medium
      dynamic
      camera={DYN_CAMERA}
      heightPct={1360 / 1920}
      topPct={160 / 1920}
    />
    {DYN_SFX.map(([ms, src, vol], i) => (
      <Sequence key={i} from={Math.round((ms / 1000) * PHONE_FPS)} layout="none">
        <Html5Audio src={staticFile(`phone/${src}.mp3`)} volume={vol} />
      </Sequence>
    ))}
  </AbsoluteFill>
);

// v5 — эталон: темп v4 медленнее в 1,25 раза (≈10,4 с) + эффекты.
const SLOW = 1.25;
export const PHONE_FX_DURATION = PHONE_DYN_DURATION * SLOW;
const FX_STEPS = DYN_STEPS.map((st) => ({ ...st, atMs: st.atMs * SLOW }));
// переезды ≈0,4–0,45 с, между ними медленный дрейф
const FX_CAMERA: CamKey[] = [
  { atMs: 0, zoom: 0.93, x: 196, y: 426, rx: 22, ry: -24 }, // въезд с разворотом
  { atMs: 950, zoom: 1, rx: 0, ry: 5 },
  { atMs: 1350, zoom: 1.4, x: 335, y: 415, ry: -5 }, // наезд на «Настройки» (тап 1375)
  { atMs: 1700, zoom: 1.43, x: 334, y: 412, ry: -6 },
  { atMs: 2150, zoom: 1.15, x: 196, y: 380, ry: 2 }, // приложение открылось
  { atMs: 2400, zoom: 1.16, ry: 1 },
  { atMs: 2850, zoom: 1.6, x: 250, y: 180, rx: 4, ry: -8 }, // тумблер и статус-бар (тап 2938)
  { atMs: 3800, zoom: 1.66, x: 256, y: 176, rx: 4, ry: -6 },
  { atMs: 4250, zoom: 1, x: 196, y: 426, rx: 0, ry: 5 }, // отъезд перед «домой» (4375)
  { atMs: 4800, zoom: 1.02, ry: 3 },
  { atMs: 5250, zoom: 1.05, ry: 8 },
  { atMs: 5900, zoom: 1.06, ry: -7 }, // камера ведёт за свайпом (5375)
  { atMs: 6350, zoom: 1.06, ry: -5 },
  { atMs: 6800, zoom: 1.46, x: 150, y: 207, ry: -3 }, // наезд на Spotify (тап 6875)
  { atMs: 7050, zoom: 1.48, x: 151, y: 209 },
  { atMs: 7550, zoom: 1, x: 196, y: 426, ry: 0 },
  { atMs: 8100, zoom: 1.01 },
  { atMs: 10375, zoom: 1.14, y: 330, ry: 4 }, // медленный наезд в конце
];
const at = (i: number) => FX_STEPS[i].atMs;
const FX: PhoneEffects = {
  reflection: true,
  leaks: [
    { atMs: 450, src: "phone/leak-warm.mp4", durationMs: 1030, opacity: 0.4 }, // тёплая засветка на въезде
    { atMs: at(4) + 850, src: "phone/leak-warm.mp4", durationMs: 1030, opacity: 0.35 }, // засветка, когда появляется интерфейс Spotify
  ],
  glare: [700, at(1) + 60, at(4) + 450],
  glow: [
    { atMs: at(1), color: "rgba(255,149,0,0.32)" }, // авиарежим — оранжевый
    { atMs: at(2), color: "rgba(255,193,99,0.30)" },
    { atMs: at(4) + 200, color: "rgba(30,215,96,0.30)" }, // Spotify — зелёный
  ],
};
const FX_SFX: [number, string, number][] = DYN_SFX.map(([ms, src, vol]) => [ms * SLOW, src, vol]);

export const PhoneDemoFx: React.FC = () => (
  <AbsoluteFill>
    <PhoneSceneView
      durationMs={PHONE_FX_DURATION * 1000 + 1000}
      steps={FX_STEPS}
      logos={logos}
      medium
      dynamic
      camera={FX_CAMERA}
      effects={FX}
      heightPct={1360 / 1920}
      topPct={160 / 1920}
    />
    {FX_SFX.map(([ms, src, vol], i) => (
      <Sequence key={i} from={Math.round((ms / 1000) * PHONE_FPS)} layout="none">
        <Html5Audio src={staticFile(`phone/${src}.mp3`)} volume={vol} />
      </Sequence>
    ))}
  </AbsoluteFill>
);