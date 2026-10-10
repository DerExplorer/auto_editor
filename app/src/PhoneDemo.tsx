// Образец сцены из деталей Phone.tsx: Настройки → Авиарежим → домой → свайп → Spotify.
// В роликах то же самое задаётся в edit-файле ("phone": [...]), см. CLAUDE.md.
import React from "react";
import { AbsoluteFill, Html5Audio, Sequence, staticFile } from "remotion";
import { DEFAULT_PAGES, PhoneSceneView, type CamKey, type PhoneStep } from "./Phone";

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

// minimal — версия 2: детально только нажимаемое (иконки Настроек и Spotify, строка «Авиарежим»), остальное — заглушки
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

// Версия 3 — динамика: середина по детализации (готовые иконки, заглушки только у дальних рядов),
// камера с наездами и наклонами, пружинное открытие, поп самолётика, свечение тумблера, размытие свайпа.
export const PHONE_DYN_DURATION = 11;
const DYN_STEPS: PhoneStep[] = [
  { kind: "tap", atMs: 1500, app: "settings" },
  { kind: "toggle", atMs: 3100, row: "Авиарежим" },
  { kind: "home", atMs: 4700 },
  { kind: "swipe", atMs: 5800, dir: "left" },
  { kind: "tap", atMs: 7300, app: "spotify" },
];
const DYN_CAMERA: CamKey[] = [
  { atMs: 0, zoom: 0.95, rx: 20, ry: -22 }, // въезд с разворотом
  { atMs: 1000, zoom: 1, x: 196, y: 426, rx: 0, ry: 6 },
  { atMs: 1150, ry: 5 },
  { atMs: 1480, zoom: 1.4, x: 335, y: 415, ry: -6 }, // наезд на «Настройки» к нажатию
  { atMs: 2000, zoom: 1.15, x: 196, y: 380, ry: 3 }, // приложение открылось
  { atMs: 2650, zoom: 1.55, x: 250, y: 180, rx: 4, ry: -9 }, // тумблер и статус-бар в одном кадре
  { atMs: 3900, zoom: 1.6, x: 255, y: 175, rx: 4, ry: -7 },
  { atMs: 4450, zoom: 1, x: 196, y: 426, rx: 0, ry: 8 }, // отъезд перед «домой»
  { atMs: 5100, zoom: 1.02, ry: 0 },
  { atMs: 5650, zoom: 1.05, ry: 10 },
  { atMs: 6350, zoom: 1.05, ry: -8 }, // камера ведёт за свайпом
  { atMs: 7000, zoom: 1.45, x: 150, y: 207, ry: -4 }, // наезд на Spotify
  { atMs: 7300, zoom: 1.47 },
  { atMs: 7850, zoom: 1, x: 196, y: 426, ry: 0 },
  { atMs: 8700, zoom: 1 },
  { atMs: 11000, zoom: 1.15, y: 330, ry: 5 }, // медленный наезд в конце
];
const DYN_SFX: [number, string, number][] = [
  [50, "whoosh", 0.7],
  [1250, "whoosh", 0.25],
  [1500, "tap", 0.8],
  [3100, "switch", 1],
  [4750, "swipe", 0.45],
  [5800, "swipe", 0.45],
  [6800, "whoosh", 0.25],
  [7300, "tap", 0.8],
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
