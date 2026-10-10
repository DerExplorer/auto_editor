// Анимация с айфоном из деталей: рамка, домашний экран, приложения, палец, жесты.
// Сценарий — шаги (tap / toggle / home / swipe) со временем нажатия от начала сцены; собирает их scripts/build.mjs
// из "phone" в edit-файле. Интерфейс рисуется в точках iPhone (393×852). Детально — только Настройки и Spotify,
// остальные приложения — простые экраны-заглушки (правило минимализма в CLAUDE.md).
import React from "react";
import { loadFont } from "@remotion/fonts";
import {
  AbsoluteFill,
  Easing,
  Img,
  Loop,
  OffthreadVideo,
  interpolate,
  interpolateColors,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// ---------- типы ----------
export type PhoneStep =
  | { kind: "tap"; atMs: number; app: string }
  | { kind: "toggle"; atMs: number; row: string; zoom?: boolean }
  | { kind: "home"; atMs: number }
  | { kind: "swipe"; atMs: number; dir: "left" | "right" };

export type SettingsRow = { label: string; icon?: keyof typeof P; color?: string; value?: string; toggle?: boolean };

export type PhoneScene = {
  durationMs: number;
  steps: PhoneStep[];
  pages?: string[][]; // имена приложений по экранам, по 4 в ряд
  dock?: string[];
  labels?: Record<string, string>; // подписи под иконками, если не подходит стандартная
  logos?: Record<string, string>; // имя → картинка в public (логотипы из library/icons/social)
  settings?: SettingsRow[][]; // группы строк экрана «Настройки»
  frameSrc?: string;
  font?: boolean; // SF Pro из public/phone (иначе Inter)
  heightPct?: number; // высота телефона, доля кадра
  topPct?: number;
  bg?: { src: string; kind: "video" | "image"; durationMs?: number } | null;
  enter?: boolean; // телефон въезжает снизу и уезжает в конце
  minimal?: boolean; // детально только то, что нажимают; остальное — заглушки
  medium?: boolean; // середина: готовые иконки в верхних рядах, доке и на экране логотипов, остальное — заглушки
  dynamic?: boolean; // «живость»: телефон дышит, пружинное открытие, поп самолётика, свечение тумблера, размытие свайпа
  camera?: CamKey[]; // ключи камеры; без них — камера стоит (кроме zoom на тумблере)
};

// Ключ камеры: в момент atMs точка (x, y) экрана телефона (в точках iPhone) — в центре телефона на кадре,
// zoom — приближение, rx / ry — наклон телефона в градусах. Пропущенные поля берутся из предыдущего ключа.
export type CamKey = { atMs: number; zoom?: number; x?: number; y?: number; rx?: number; ry?: number };

// ---------- геометрия ----------
const SW = 393;
const SH = 852;
const FRAME_W = 874; // рамка iPhone 14 Pro: экран — прозрачное окно
const FRAME_H = 1780;
const SCREEN = { x: 45, y: 39, k: 2 };
const ICON = 62;
const colX = (c: number) => 27 + c * (ICON + 30.33);
const rowY = (r: number) => 72 + r * 104;
const DOCK_Y = 762;
const TOGGLE_X = SW - 16 - 16 - 25.5;

// ---------- шрифт ----------
let fontsLoaded = false;
const ensureFonts = () => {
  if (fontsLoaded) return;
  fontsLoaded = true;
  for (const [weight, file] of [["400", "sf-regular"], ["600", "sf-semibold"], ["700", "sf-bold"]] as const) {
    loadFont({ family: "SF Pro Text", url: staticFile(`phone/${file}.ttf`), weight });
  }
};
const SF = '"SF Pro Text", "Inter", Arial, sans-serif';

// ---------- помощники ----------
const EASE = Easing.bezier(0.25, 0.1, 0.25, 1);
const APP = Easing.bezier(0.2, 0.85, 0.25, 1);
const DRAG = Easing.bezier(0.45, 0, 0.25, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const prog = (t: number, start: number, dur: number, e = EASE) => interpolate(t, [start, start + dur], [0, 1], { ...clamp, easing: e });
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const abs: React.CSSProperties = { position: "absolute" };
const centerFlex: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center" };

// Material-иконки (viewBox 24)
export const P = {
  plane: "M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z",
  wifi: "M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z",
  bt: "M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z",
  cell: "M17 4h3v16h-3zM5 14h3v6H5zm6-5h3v11h-3z",
  link: "M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z",
  bell: "M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z",
  sound: "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z",
  moon: "M12.34 2.02C6.59 1.82 2 6.42 2 12c0 5.52 4.48 10 10 10 3.71 0 6.93-2.02 8.66-5.02-7.51-.25-12.09-8.43-8.32-14.96z",
  hourglass: "M6 2v6h.01L6 8.01 10 12l-4 4 .01.01H6V22h12v-5.99h-.01L18 16l-4-4 4-3.99-.01-.01H18V2H6zm10 14.5V20H8v-3.5l4-4 4 4zm-4-5l-4-4V4h8v3.5l-4 4z",
  gear: "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
  person: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
  search: "M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
  call: "M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z",
  note: "M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z",
  camera: "M9 2 7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z",
  cloud: "M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z",
  heart: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
  mail: "M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z",
  folder: "M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z",
  home: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
  library: "M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 5h-3v5.5c0 1.38-1.12 2.5-2.5 2.5S10 13.88 10 12.5s1.12-2.5 2.5-2.5c.57 0 1.08.19 1.5.51V5h4v2z",
  play: "M8 5v14l11-7z",
  tune: "M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z",
};

const Glyph: React.FC<{ d: string; size: number; color: string; style?: React.CSSProperties }> = ({ d, size, color, style }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} style={style}>
    <path d={d} fill={color} />
  </svg>
);

// ---------- иконки ----------
const Squircle: React.FC<{ size: number; bg: string; children?: React.ReactNode }> = ({ size, bg, children }) => (
  <div style={{ ...centerFlex, width: size, height: size, borderRadius: size * 0.225, background: bg, overflow: "hidden", position: "relative", flexShrink: 0 }}>
    {children}
  </div>
);

const LABELS: Record<string, string> = {
  phone: "Телефон", safari: "Safari", messages: "Сообщения", music: "Музыка", calendar: "Календарь", photos: "Фото",
  camera: "Камера", clock: "Часы", weather: "Погода", maps: "Карты", notes: "Заметки", reminders: "Напоминания",
  appstore: "App Store", health: "Здоровье", wallet: "Wallet", mail: "Почта", calc: "Калькулятор", files: "Файлы",
  settings: "Настройки", youtube: "YouTube", tiktok: "TikTok", vk: "VK",
};
const labelOf = (name: string, labels?: Record<string, string>) => labels?.[name] ?? LABELS[name] ?? name.charAt(0).toUpperCase() + name.slice(1);

// Заглушка для приложения без иконки: спокойный цвет по имени + первая буква.
const STUB = ["#8E8E93", "#5E8BFF", "#34C759", "#FF9F0A", "#AF52DE", "#FF6482", "#30B0C7"];
const stubColor = (name: string) => STUB[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % STUB.length];

// Системные иконки iOS — упрощённо, кодом (в library их нет).
const SystemIcon = (name: string, size: number): React.ReactNode | null => {
  const g = size * 0.6;
  const svg = (children: React.ReactNode) => (
    <svg viewBox="0 0 62 62" width={size} height={size} style={{ position: "absolute", inset: 0 }}>
      {children}
    </svg>
  );
  switch (name) {
    case "phone":
      return <Squircle size={size} bg="linear-gradient(#6CF27F,#2ABF45)"><Glyph d={P.call} size={g} color="#fff" /></Squircle>;
    case "messages":
      return (
        <Squircle size={size} bg="linear-gradient(#6CF27F,#2ABF45)">
          {svg(<><ellipse cx="31" cy="29" rx="19" ry="15.5" fill="#fff" /><path d="M17 37 L13 46 L25 41Z" fill="#fff" /></>)}
        </Squircle>
      );
    case "safari":
      return (
        <Squircle size={size} bg="#fff">
          {svg(
            <>
              <defs>
                <linearGradient id="saf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2FD0FF" /><stop offset="1" stopColor="#1A6DF0" /></linearGradient>
              </defs>
              <circle cx="31" cy="31" r="25" fill="url(#saf)" />
              <path d="M31 31 L44 18 L35 35Z" fill="#FF3B30" />
              <path d="M31 31 L18 44 L27 27Z" fill="#fff" />
            </>,
          )}
        </Squircle>
      );
    case "music":
      return <Squircle size={size} bg="linear-gradient(#FF6A84,#FA233B)"><Glyph d={P.note} size={g} color="#fff" /></Squircle>;
    case "calendar":
      return (
        <Squircle size={size} bg="#fff">
          <div style={{ ...abs, top: size * 0.08, width: "100%", textAlign: "center", fontFamily: SF, fontWeight: 600, fontSize: size * 0.17, color: "#FF3B30" }}>СБ</div>
          <div style={{ ...abs, top: size * 0.25, width: "100%", textAlign: "center", fontFamily: SF, fontSize: size * 0.56, color: "#111", lineHeight: 1 }}>10</div>
        </Squircle>
      );
    case "photos":
      return (
        <Squircle size={size} bg="#fff">
          {svg(
            ["#F9A825", "#FB8C00", "#E53935", "#D81B60", "#8E24AA", "#3949AB", "#039BE5", "#43A047"].map((c, i) => (
              <ellipse key={i} cx="31" cy="20" rx="6.5" ry="11" fill={c} opacity="0.85" transform={`rotate(${i * 45} 31 31)`} />
            )),
          )}
        </Squircle>
      );
    case "camera":
      return <Squircle size={size} bg="linear-gradient(#E6E6E8,#A2A2A6)"><Glyph d={P.camera} size={g} color="#2C2C2E" /></Squircle>;
    case "clock":
      return (
        <Squircle size={size} bg="#000">
          {svg(
            <>
              <circle cx="31" cy="31" r="26" fill="#fff" />
              <path d="M31 31 L31 13" stroke="#000" strokeWidth="2.6" strokeLinecap="round" />
              <path d="M31 31 L43 37" stroke="#000" strokeWidth="2.6" strokeLinecap="round" />
              <path d="M31 31 L20 46" stroke="#FF9500" strokeWidth="1.2" strokeLinecap="round" />
              <circle cx="31" cy="31" r="2.2" fill="#FF9500" />
            </>,
          )}
        </Squircle>
      );
    case "weather":
      return (
        <Squircle size={size} bg="linear-gradient(#4EA8F8,#1C6CD6)">
          {svg(<circle cx="24" cy="24" r="10" fill="#FFD60A" />)}
          <Glyph d={P.cloud} size={g} color="#fff" style={{ ...abs, left: size * 0.26, top: size * 0.3 }} />
        </Squircle>
      );
    case "maps":
      return (
        <Squircle size={size} bg="#E4F2DC">
          {svg(
            <>
              <path d="M-5 50 L70 20" stroke="#fff" strokeWidth="10" />
              <path d="M-5 50 L70 20" stroke="#4A9EFF" strokeWidth="4" />
              <path d="M20 -5 L40 70" stroke="#FFD15C" strokeWidth="6" />
              <circle cx="40" cy="24" r="7" fill="#FF3B30" />
              <circle cx="40" cy="24" r="2.6" fill="#fff" />
            </>,
          )}
        </Squircle>
      );
    case "notes":
      return (
        <Squircle size={size} bg="#fff">
          {svg(
            <>
              <rect x="0" y="0" width="62" height="17" fill="#FFCC33" />
              {[28, 38, 48].map((y) => <rect key={y} x="9" y={y} width="44" height="1.6" fill="#D0D0D4" />)}
            </>,
          )}
        </Squircle>
      );
    case "reminders":
      return (
        <Squircle size={size} bg="#fff">
          {svg(
            ([["#007AFF", 18], ["#FF3B30", 31], ["#FF9500", 44]] as const).map(([c, y]) => (
              <g key={y}>
                <circle cx="17" cy={y} r="4.5" fill="none" stroke={c} strokeWidth="2.2" />
                <rect x="27" y={y - 0.8} width="24" height="1.8" fill="#D0D0D4" />
              </g>
            )),
          )}
        </Squircle>
      );
    case "appstore":
      return (
        <Squircle size={size} bg="linear-gradient(#22C3FF,#0A6CFF)">
          {svg(<path d="M23 44 L34 22 M39 44 L28 22 M19 37 H43" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" fill="none" />)}
        </Squircle>
      );
    case "health":
      return <Squircle size={size} bg="#fff"><Glyph d={P.heart} size={g} color="#FF2D55" /></Squircle>;
    case "wallet":
      return (
        <Squircle size={size} bg="#000">
          {svg(
            <>
              <rect x="10" y="14" width="42" height="34" rx="5" fill="#3A3A3C" />
              {([["#34AADC", 18], ["#FFCC00", 24], ["#4CD964", 30], ["#FF6B4A", 36]] as const).map(([c, y]) => (
                <rect key={y} x="12" y={y} width="38" height="8" rx="3" fill={c} />
              ))}
              <rect x="10" y="38" width="42" height="12" rx="4" fill="#1C1C1E" />
            </>,
          )}
        </Squircle>
      );
    case "mail":
      return <Squircle size={size} bg="linear-gradient(#36BDFF,#1470EF)"><Glyph d={P.mail} size={g} color="#fff" /></Squircle>;
    case "calc":
      return (
        <Squircle size={size} bg="#1C1C1E">
          {svg(
            ([[21, 21, "#A5A5A5"], [41, 21, "#FF9F0A"], [21, 41, "#505050"], [41, 41, "#FF9F0A"]] as const).map(([x, y, c]) => (
              <circle key={`${x}${y}`} cx={x} cy={y} r="8" fill={c} />
            )),
          )}
        </Squircle>
      );
    case "files":
      return <Squircle size={size} bg="#fff"><Glyph d={P.folder} size={g} color="#1E8BFF" /></Squircle>;
    case "settings":
      return <Squircle size={size} bg="linear-gradient(#DADADF,#9C9CA1)"><Glyph d={P.gear} size={size * 0.86} color="#4F4F54" /></Squircle>;
  }
  return null;
};

export const AppIcon: React.FC<{ name: string; logos?: Record<string, string>; size?: number }> = ({ name, logos, size = ICON }) => {
  const sys = SystemIcon(name, size);
  if (sys) return <>{sys}</>;
  const logo = logos?.[name];
  if (logo) {
    // логотипы из library/icons/social круглые: увеличиваем, чтобы круг закрыл углы иконки
    const spotify = name === "spotify";
    return (
      <Squircle size={size} bg="#000">
        <Img src={staticFile(logo)} style={{ width: size * (spotify ? 0.8 : 1.3), height: size * (spotify ? 0.8 : 1.3), flexShrink: 0 }} />
      </Squircle>
    );
  }
  return (
    <Squircle size={size} bg={stubColor(name)}>
      <span style={{ fontFamily: SF, fontWeight: 600, fontSize: size * 0.42, color: "#fff" }}>{name.charAt(0).toUpperCase()}</span>
    </Squircle>
  );
};

// ---------- домашний экран ----------
export const DEFAULT_PAGES = [
  ["calendar", "photos", "camera", "clock", "weather", "maps", "notes", "reminders", "appstore", "health", "wallet", "mail", "calc", "files", "music", "settings"],
  ["telegram", "instagram", "youtube", "tiktok", "vk", "spotify", "pinterest", "discord", "twitch", "snapchat"],
];
export const DEFAULT_DOCK = ["phone", "safari", "messages", "mail"];

const WALLPAPER =
  "radial-gradient(circle at 18% 14%, #FF9A5C 0, rgba(255,154,92,0) 42%)," +
  "radial-gradient(circle at 88% 42%, #7B5CFF 0, rgba(123,92,255,0) 50%)," +
  "radial-gradient(circle at 25% 82%, #FF4F9A 0, rgba(255,79,154,0) 48%)," +
  "linear-gradient(165deg, #2C1B5E, #120E2E)";

const WALLPAPER_MIN = "linear-gradient(165deg, #4A2F8A, #171230)";

type Press = { name: string; v: number };

const HomeScreen: React.FC<{ s: PhoneScene; pages: string[][]; dock: string[]; page: number; appP: number; press: Press | null; focus: Set<string>; blur: number }> = ({ s, pages, dock, page, appP, press, focus, blur }) => {
  const pressed = (n: string) => (press?.name === n ? press.v : 0);
  // medium: настоящие иконки — док, первые 2 ряда 1-го экрана, экраны логотипов и то, что нажимают
  const stub = (n: string, pi = -1, i = 0) =>
    focus.has(n) ? false : s.minimal ? true : s.medium ? pi === 0 && i >= 8 : false;
  const icon = (n: string, pi = -1, i = 0) => {
    const v = pressed(n);
    if (stub(n, pi, i)) return <div style={{ width: ICON, height: ICON, borderRadius: ICON * 0.225, background: "rgba(255,255,255,0.22)" }} />;
    return (
      <div style={{ transform: `scale(${1 - 0.08 * v})`, filter: v > 0 ? `brightness(${1 - 0.25 * v})` : undefined }}>
        <AppIcon name={n} logos={s.logos} />
      </div>
    );
  };
  return (
    <AbsoluteFill style={{ background: s.minimal ? WALLPAPER_MIN : WALLPAPER }}>
      <AbsoluteFill style={{ transform: `scale(${1 + 0.1 * appP})`, opacity: 1 - 0.7 * appP }}>
        <div style={{ ...abs, left: 0, top: 0, width: SW * pages.length, height: SH, transform: `translateX(${-SW * page}px)`, filter: blur > 0.3 ? `blur(${blur}px)` : undefined }}>
          {pages.map((apps, pi) =>
            apps.map((n, i) => (
              <div key={`${pi}-${i}`} style={{ ...abs, left: pi * SW + colX(i % 4), top: rowY(Math.floor(i / 4)), width: ICON }}>
                {icon(n, pi, i)}
                <div style={{ ...abs, top: ICON + 5, left: -14, width: ICON + 28, textAlign: "center", fontFamily: SF, fontSize: 11.5, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.35)", whiteSpace: "nowrap", overflow: "hidden" }}>
                  {stub(n, pi, i) ? null : labelOf(n, s.labels)}
                </div>
              </div>
            )),
          )}
        </div>
        {pages.length > 1 && (
          <div style={{ ...abs, top: 722, left: 0, width: SW, ...centerFlex, gap: 9 }}>
            {pages.map((_, i) => (
              <div key={i} style={{ width: 7, height: 7, borderRadius: 4, background: `rgba(255,255,255,${lerp(0.4, 1, Math.max(0, 1 - Math.abs(page - i)))})` }} />
            ))}
          </div>
        )}
        <div style={{ ...abs, left: 12, right: 12, top: 746, height: 94, borderRadius: 34, background: "rgba(255,255,255,0.24)" }} />
        {dock.map((n, i) => (
          <div key={n} style={{ ...abs, left: colX(i), top: DOCK_Y }}>
            {icon(n)}
          </div>
        ))}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- статус-бар ----------
const StatusBar: React.FC<{ dark: boolean; airplane: number; pop?: number }> = ({ dark, airplane, pop }) => {
  const c = dark ? "#000" : "#fff";
  return (
    <div style={{ ...abs, top: 0, left: 0, width: SW, height: 54, fontFamily: SF }}>
      <div style={{ ...abs, left: 0, width: 132, top: 16, textAlign: "center", fontWeight: 600, fontSize: 17, color: c }}>9:41</div>
      <div style={{ ...abs, right: 26, top: 20, display: "flex", alignItems: "center", gap: 6, height: 14 }}>
        <div style={{ position: "relative", width: 40, height: 14 }}>
          <div style={{ ...abs, inset: 0, display: "flex", alignItems: "center", gap: 5, opacity: 1 - airplane, transform: `scale(${1 - 0.3 * airplane})` }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 1.6, height: 12 }}>
              {[4, 6.3, 8.6, 11].map((h) => <div key={h} style={{ width: 3, height: h, borderRadius: 1, background: c }} />)}
            </div>
            <Glyph d={P.wifi} size={17} color={c} />
          </div>
          <div style={{ ...abs, right: 0, top: -2, opacity: airplane, transform: `scale(${pop ?? 0.6 + 0.4 * airplane})` }}>
            <Glyph d={P.plane} size={17} color={c} style={{ transform: "rotate(90deg)" }} />
          </div>
        </div>
        <div style={{ position: "relative", width: 27, height: 13 }}>
          <div style={{ ...abs, inset: 0, borderRadius: 4, border: `1.2px solid ${c}`, opacity: 0.4 }} />
          <div style={{ ...abs, left: 2, top: 2, width: 20, height: 9, borderRadius: 2, background: c }} />
          <div style={{ ...abs, right: -3, top: 4.5, width: 1.6, height: 4, borderRadius: 1, background: c, opacity: 0.4 }} />
        </div>
      </div>
    </div>
  );
};

// ---------- Настройки ----------
export const DEFAULT_SETTINGS: SettingsRow[][] = [
  [
    { icon: "plane", color: "#FF9500", label: "Авиарежим", toggle: false },
    { icon: "wifi", color: "#007AFF", label: "Wi‑Fi", value: "Home" },
    { icon: "bt", color: "#007AFF", label: "Bluetooth", value: "Вкл." },
    { icon: "cell", color: "#34C759", label: "Сотовая связь" },
    { icon: "link", color: "#34C759", label: "Режим модема", value: "Выкл." },
  ],
  [
    { icon: "bell", color: "#FF3B30", label: "Уведомления" },
    { icon: "sound", color: "#FF2D55", label: "Звуки, тактильные сигналы" },
    { icon: "moon", color: "#5856D6", label: "Фокусирование" },
    { icon: "hourglass", color: "#5856D6", label: "Экранное время" },
  ],
  [
    { icon: "gear", color: "#8E8E93", label: "Основные" },
    { icon: "tune", color: "#8E8E93", label: "Пункт управления" },
  ],
];
const AIRPLANE = "Авиарежим";
const sameLabel = (a: string, b: string) => a.toLowerCase().replace(/[\s‑-]/g, "") === b.toLowerCase().replace(/[\s‑-]/g, "");

// Верх каждой группы: под шапкой и карточкой Apple ID, между группами 36 pt.
const groupTops = (groups: SettingsRow[][]) => {
  let y = 292;
  return groups.map((g) => {
    const top = y;
    y += g.length * 44 + 36;
    return top;
  });
};
const rowCenterY = (groups: SettingsRow[][], label: string) => {
  const tops = groupTops(groups);
  for (let gi = 0; gi < groups.length; gi++) {
    const ri = groups[gi].findIndex((r) => sameLabel(r.label, label));
    if (ri >= 0) return tops[gi] + ri * 44 + 22;
  }
  return 314;
};

const Toggle: React.FC<{ t: number; glow?: number }> = ({ t, glow = 0 }) => (
  <div style={{ position: "relative", width: 51, height: 31, borderRadius: 16, background: interpolateColors(t, [0, 1], ["#E9E9EA", "#34C759"]), boxShadow: glow > 0 && glow < 1 ? `0 0 0 ${glow * 14}px rgba(52,199,89,${0.45 * (1 - glow)})` : undefined }}>
    <div style={{ ...abs, top: 2, left: lerp(2, 22, t), width: 27, height: 27, borderRadius: 14, background: "#fff", boxShadow: "0 3px 8px rgba(0,0,0,0.15), 0 1px 1px rgba(0,0,0,0.16)" }} />
  </div>
);

const Chevron = () => (
  <svg width="8" height="13" viewBox="0 0 8 13"><path d="M1.5 1.5 L6.5 6.5 L1.5 11.5" stroke="#C4C4C7" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

const SettingsApp: React.FC<{ groups: SettingsRow[][]; toggleAt: (label: string, init: boolean) => number; minimal?: boolean; medium?: boolean; keep: string[]; glowAt?: (label: string) => number }> = ({ groups, toggleAt, minimal, medium, keep, glowAt }) => {
  const air = toggleAt(AIRPLANE, false) > 0.5;
  const tops = groupTops(groups);
  return (
    <AbsoluteFill style={{ background: "#F2F2F7", fontFamily: SF }}>
      <div style={{ ...abs, left: 16, top: 92, fontSize: 34, fontWeight: 700, color: "#000" }}>Настройки</div>
      <div style={{ ...abs, left: 16, right: 16, top: 146, height: 36, borderRadius: 10, background: "#E3E3E8", display: "flex", alignItems: "center", gap: 6, paddingLeft: 8 }}>
        <Glyph d={P.search} size={19} color="#8E8E93" />
        <span style={{ fontSize: 17, color: "#8E8E93" }}>Поиск</span>
      </div>
      <div style={{ ...abs, left: 16, right: 16, top: 198, height: 76, borderRadius: 10, background: "#fff", display: "flex", alignItems: "center" }}>
        <div style={{ ...centerFlex, marginLeft: 16, width: 58, height: 58, borderRadius: 29, background: "linear-gradient(#B4B4BA,#88888E)" }}>
          <Glyph d={P.person} size={40} color="#fff" />
        </div>
        {minimal ? (
          <div style={{ marginLeft: 14, flex: 1 }}>
            <div style={{ width: 110, height: 12, borderRadius: 6, background: "#E5E5EA" }} />
            <div style={{ width: 180, height: 9, borderRadius: 5, background: "#EFEFF4", marginTop: 8 }} />
          </div>
        ) : (
          <div style={{ marginLeft: 14, flex: 1 }}>
            <div style={{ fontSize: 20, color: "#000" }}>Apple ID</div>
            <div style={{ fontSize: 13, color: "#000", marginTop: 2 }}>iCloud, медиаматериалы и покупки</div>
          </div>
        )}
        <div style={{ marginRight: 16 }}><Chevron /></div>
      </div>
      {groups.map((rows, gi) => (
        <div key={gi} style={{ ...abs, left: 16, right: 16, top: tops[gi], borderRadius: 10, background: "#fff", overflow: "hidden" }}>
          {rows.map((r, i) => {
            // авиарежим гасит Wi‑Fi и сотовую связь
            const value = air && sameLabel(r.label, "Wi‑Fi") ? "Выкл." : air && sameLabel(r.label, "Сотовая связь") ? "Авиарежим" : r.value;
            const kept = keep.some((k) => sameLabel(k, r.label));
            const groupKept = rows.some((x) => keep.some((k) => sameLabel(k, x.label)));
            if ((minimal && !kept) || (medium && !groupKept))
              return (
                <div key={r.label} style={{ position: "relative", height: 44, display: "flex", alignItems: "center" }}>
                  <div style={{ marginLeft: 16, width: 29, height: 29, borderRadius: 7, background: "#E5E5EA" }} />
                  <div style={{ marginLeft: 15, width: 90 + ((i * 37) % 70), height: 10, borderRadius: 5, background: "#E5E5EA" }} />
                  {i < rows.length - 1 && <div style={{ ...abs, left: 60, right: 0, bottom: 0, height: 0.5, background: "#E5E5EA" }} />}
                </div>
              );
            return (
              <div key={r.label} style={{ position: "relative", height: 44, display: "flex", alignItems: "center" }}>
                <div style={{ ...centerFlex, marginLeft: 16, width: 29, height: 29, borderRadius: 7, background: r.color ?? "#8E8E93" }}>
                  {r.icon && <Glyph d={P[r.icon]} size={20} color="#fff" />}
                </div>
                <div style={{ marginLeft: 15, flex: 1, fontSize: 17, color: "#000", whiteSpace: "nowrap" }}>{r.label}</div>
                {r.toggle !== undefined ? (
                  <div style={{ marginRight: 16 }}><Toggle t={toggleAt(r.label, r.toggle)} glow={glowAt?.(r.label) ?? 0} /></div>
                ) : (
                  <div style={{ marginRight: 16, display: "flex", alignItems: "center", gap: 10, fontSize: 17, color: "#8E8E93" }}>
                    {value}
                    <Chevron />
                  </div>
                )}
                {i < rows.length - 1 && <div style={{ ...abs, left: 60, right: 0, bottom: 0, height: 0.5, background: "#C6C6C8" }} />}
              </div>
            );
          })}
        </div>
      ))}
    </AbsoluteFill>
  );
};

// ---------- Spotify (детальный экран) ----------
const TILES: [string, string][] = [
  ["Любимые треки", "linear-gradient(135deg,#450AF5,#C4EFD9)"],
  ["Daily Mix 1", "linear-gradient(135deg,#E8115B,#8C1932)"],
  ["Release Radar", "linear-gradient(135deg,#1E3264,#56A3F5)"],
  ["Chill Mix", "linear-gradient(135deg,#477D95,#B5E3D8)"],
  ["Lo-fi beats", "linear-gradient(135deg,#8D67AB,#F59B23)"],
  ["Тренировка", "linear-gradient(135deg,#E91429,#FF8A3D)"],
  ["Discover Weekly", "linear-gradient(135deg,#056952,#1ED760)"],
  ["Рок-хиты", "linear-gradient(135deg,#333,#888)"],
];
const MIXES: [string, string][] = [
  ["Daily Mix 2", "linear-gradient(160deg,#F59B23,#B4492C)"],
  ["Daily Mix 3", "linear-gradient(160deg,#1ED760,#0B6E3A)"],
  ["Daily Mix 4", "linear-gradient(160deg,#509BF5,#27358A)"],
];

// since — мс с момента открытия приложения
const SpotifyApp: React.FC<{ since: number; logo?: string }> = ({ since, logo }) => {
  const UI = 900;
  const ui = prog(since, UI, 270);
  const item = (i: number): React.CSSProperties => {
    const t = prog(since, UI + 50 * i, 300, APP);
    return { opacity: t, transform: `translateY(${(1 - t) * 14}px)` };
  };
  return (
    <AbsoluteFill style={{ background: "#000", fontFamily: SF }}>
      <AbsoluteFill style={{ ...centerFlex, opacity: 1 - ui }}>
        {logo && <Img src={staticFile(logo)} style={{ width: 96, height: 96, transform: `scale(${1 + 0.06 * prog(since, 0, 900)})` }} />}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "linear-gradient(#1F1F1F 0, #121212 220px)", opacity: ui }}>
        <div style={{ ...abs, top: 60, left: 16, display: "flex", alignItems: "center", gap: 8, ...item(0) }}>
          <div style={{ ...centerFlex, width: 32, height: 32, borderRadius: 16, background: "#F59B23", color: "#000", fontWeight: 700, fontSize: 15 }}>Я</div>
          {["Все", "Музыка", "Подкасты"].map((c, i) => (
            <div key={c} style={{ height: 32, padding: "0 14px", borderRadius: 16, ...centerFlex, fontSize: 13, background: i === 0 ? "#1ED760" : "#2A2A2A", color: i === 0 ? "#000" : "#fff" }}>
              {c}
            </div>
          ))}
        </div>
        <div style={{ ...abs, top: 106, left: 16, right: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {TILES.map(([t, bg], i) => (
            <div key={t} style={{ height: 56, borderRadius: 4, background: "#2A2A2A", display: "flex", alignItems: "center", overflow: "hidden", ...item(1 + Math.floor(i / 2)) }}>
              <div style={{ ...centerFlex, width: 56, height: 56, background: bg, flexShrink: 0 }}>{i === 0 && <Glyph d={P.heart} size={22} color="#fff" />}</div>
              <div style={{ marginLeft: 8, fontSize: 13, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>{t}</div>
            </div>
          ))}
        </div>
        <div style={{ ...abs, top: 378, left: 16, fontSize: 22, fontWeight: 700, color: "#fff", ...item(5) }}>Сделано для вас</div>
        <div style={{ ...abs, top: 416, left: 16, display: "flex", gap: 12, ...item(6) }}>
          {MIXES.map(([t, bg]) => (
            <div key={t} style={{ width: 150 }}>
              <div style={{ position: "relative", width: 150, height: 150, borderRadius: 4, background: bg, overflow: "hidden" }}>
                <div style={{ ...abs, left: 10, top: 10, fontSize: 18, fontWeight: 700, color: "#fff" }}>{t}</div>
              </div>
              <div style={{ marginTop: 8, fontSize: 12.5, color: "#B3B3B3", lineHeight: 1.3 }}>Ваш микс на каждый день</div>
            </div>
          ))}
        </div>
        <div style={{ ...abs, top: 630, left: 16, fontSize: 22, fontWeight: 700, color: "#fff", ...item(7) }}>Недавно прослушано</div>
        <div style={{ ...abs, top: 668, left: 16, display: "flex", gap: 14, ...item(8) }}>
          {["#B4492C", "#509BF5", "#8D67AB", "#1ED760"].map((c) => (
            <div key={c} style={{ width: 100, height: 100, borderRadius: 50, background: `linear-gradient(135deg, ${c}, #222)` }} />
          ))}
        </div>
        <div style={{ ...abs, left: 8, right: 8, top: 710, height: 56, borderRadius: 8, background: "#5B2E3A", display: "flex", alignItems: "center", overflow: "hidden", ...item(4) }}>
          <div style={{ marginLeft: 8, width: 40, height: 40, borderRadius: 4, background: "linear-gradient(135deg,#8D67AB,#F59B23)" }} />
          <div style={{ marginLeft: 10, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>Ночной город</div>
            <div style={{ fontSize: 12, color: "#D9C9CD", marginTop: 2 }}>Lo-fi beats</div>
          </div>
          <Glyph d={P.play} size={30} color="#fff" style={{ marginRight: 12 }} />
          <div style={{ ...abs, left: 8, right: 8, bottom: 0, height: 2, background: "rgba(255,255,255,0.25)" }}>
            <div style={{ width: "35%", height: 2, background: "#fff" }} />
          </div>
        </div>
        <div style={{ ...abs, left: 0, right: 0, top: 772, bottom: 0, background: "linear-gradient(rgba(0,0,0,0.75), #000 45%)", display: "flex", justifyContent: "space-around", paddingTop: 10 }}>
          {[[P.home, "Главная"], [P.search, "Поиск"], [P.library, "Медиатека"]].map(([d, l], i) => (
            <div key={l} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, opacity: i === 0 ? 1 : 0.65 }}>
              <Glyph d={d} size={26} color="#fff" />
              <div style={{ fontSize: 10, color: "#fff" }}>{l}</div>
            </div>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- тёмное приложение-заглушка: заставка с логотипом, потом серые блоки ----------
const DarkAppStub: React.FC<{ since: number; logo?: string; accent: string }> = ({ since, logo, accent }) => {
  const ui = prog(since, 900, 270);
  const block = (left: number, top: number, w: number, h: number, bg = "#2A2A2A", r = 6) => (
    <div style={{ ...abs, left, top, width: w, height: h, borderRadius: r, background: bg }} />
  );
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <AbsoluteFill style={{ ...centerFlex, opacity: 1 - ui }}>
        {logo && <Img src={staticFile(logo)} style={{ width: 96, height: 96, transform: `scale(${1 + 0.06 * prog(since, 0, 900)})` }} />}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "#121212", opacity: ui }}>
        {logo && <Img src={staticFile(logo)} style={{ ...abs, left: 16, top: 60, width: 32, height: 32 }} />}
        {block(58, 62, 56, 28, accent, 14)}
        {block(122, 62, 72, 28, "#2A2A2A", 14)}
        {block(202, 62, 82, 28, "#2A2A2A", 14)}
        {[0, 1, 2, 3].map((r) => [0, 1].map((c) => <React.Fragment key={`${r}${c}`}>{block(16 + c * 184.5, 106 + r * 64, 176.5, 56)}</React.Fragment>))}
        {block(16, 380, 170, 18, "#2A2A2A", 9)}
        {[0, 1, 2].map((i) => <React.Fragment key={i}>{block(16 + i * 162, 416, 150, 150, "#242424")}</React.Fragment>)}
        {block(8, 710, 377, 56, "#2A2A2A", 8)}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- любое другое приложение: заглушка (название + серые строки) ----------
const GenericApp: React.FC<{ title: string; color: string }> = ({ title, color }) => (
  <AbsoluteFill style={{ background: "#fff", fontFamily: SF }}>
    <div style={{ ...abs, left: 16, top: 92, fontSize: 34, fontWeight: 700, color: "#000" }}>{title}</div>
    <div style={{ ...abs, left: 16, right: 16, top: 150, height: 150, borderRadius: 14, background: color, opacity: 0.85 }} />
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <div key={i} style={{ ...abs, left: 16, right: 16, top: 326 + i * 64, height: 48, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 22, background: "#E5E5EA" }} />
        <div style={{ flex: 1 }}>
          <div style={{ width: `${70 - (i % 3) * 12}%`, height: 12, borderRadius: 6, background: "#D1D1D6" }} />
          <div style={{ width: `${45 + (i % 2) * 15}%`, height: 10, borderRadius: 5, background: "#E5E5EA", marginTop: 8 }} />
        </div>
      </div>
    ))}
  </AbsoluteFill>
);

// ---------- окно приложения: вырастает из иконки и сворачивается в неё ----------
const AppWindow: React.FC<{ p: number; icon: { x: number; y: number }; iconEl: React.ReactNode; children: React.ReactNode }> = ({ p, icon, iconEl, children }) => {
  if (p <= 0.001) return null;
  const w = lerp(ICON, SW, p);
  const h = lerp(ICON, SH, p);
  const sc = w / SW;
  const iconOp = interpolate(p, [0, 0.4], [1, 0], clamp);
  return (
    <div style={{ ...abs, left: lerp(icon.x, 0, p), top: lerp(icon.y, 0, p), width: w, height: h, borderRadius: lerp(14, 55, p), overflow: "hidden", boxShadow: p < 1 ? "0 10px 30px rgba(0,0,0,0.3)" : undefined }}>
      <div style={{ ...abs, left: 0, top: (h - SH * sc) / 2, width: SW, height: SH, transform: `scale(${sc})`, transformOrigin: "0 0" }}>{children}</div>
      {iconOp > 0 && (
        <div style={{ ...abs, inset: 0, ...centerFlex, opacity: iconOp }}>
          <div style={{ transform: `scale(${w / ICON})`, flexShrink: 0 }}>{iconEl}</div>
        </div>
      )}
    </div>
  );
};

// ---------- палец ----------
type Touch = { show: number; press: number; release: number; hide: number; at: [number, number]; to?: [number, number] };

const Finger: React.FC<{ t: number; touches: Touch[] }> = ({ t, touches }) => (
  <>
    {touches.map((g, i) => {
      if (t < g.show || t > g.hide + 250) return null;
      const appear = prog(t, g.show, 250, APP);
      const fade = 1 - prog(t, g.hide, 250);
      const move = g.to ? prog(t, g.press + 60, g.release - g.press - 60, DRAG) : 0;
      const to = g.to ?? g.at;
      const x = lerp(g.at[0], to[0], move) + (1 - appear) * 30;
      const y = lerp(g.at[1], to[1], move) + (1 - appear) * 50;
      const down = interpolate(t, [g.press, g.press + 100, g.release, g.release + 130], [0, 1, 1, 0], clamp);
      const ripple = prog(t, g.press, 330);
      const D = 46;
      return (
        <React.Fragment key={i}>
          {t >= g.press && ripple < 1 && !g.to && (
            <div style={{ ...abs, left: x - D * (0.5 + 0.5 * ripple), top: y - D * (0.5 + 0.5 * ripple), width: D * (1 + ripple), height: D * (1 + ripple), borderRadius: "50%", border: "2px solid rgba(255,255,255,0.9)", opacity: 0.7 * (1 - ripple) }} />
          )}
          <div
            style={{
              ...abs, left: x - D / 2, top: y - D / 2, width: D, height: D, borderRadius: "50%",
              background: "rgba(120,120,130,0.45)", border: "2.5px solid rgba(255,255,255,0.95)",
              boxShadow: "0 6px 16px rgba(0,0,0,0.35)", opacity: appear * fade, transform: `scale(${1 - 0.18 * down})`,
            }}
          />
        </React.Fragment>
      );
    })}
  </>
);

// ---------- сцена ----------
const OPEN_DELAY = 100;
const OPEN_MS = 430;
const CLOSE_MS = 400;
const SWIPE_MS = 450;

export const PhoneSceneView: React.FC<PhoneScene> = (s) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  if (s.font !== false) ensureFonts();
  const t = (frame / fps) * 1000;
  const pages = s.pages ?? DEFAULT_PAGES;
  const dock = s.dock ?? DEFAULT_DOCK;
  const groups = s.settings ?? DEFAULT_SETTINGS;
  const steps = [...s.steps].sort((a, b) => a.atMs - b.atMs);

  // где иконка приложения: экран и позиция (док — на всех экранах)
  const locate = (name: string) => {
    for (let p = 0; p < pages.length; p++) {
      const i = pages[p].indexOf(name);
      if (i >= 0) return { page: p, x: colX(i % 4), y: rowY(Math.floor(i / 4)) };
    }
    const d = dock.indexOf(name);
    return d >= 0 ? { page: -1, x: colX(d), y: DOCK_Y } : { page: -1, x: (SW - ICON) / 2, y: (SH - ICON) / 2 };
  };

  // экран домашнего экрана
  const page = Math.max(0, Math.min(pages.length - 1, steps.reduce((acc, st) => (st.kind === "swipe" ? acc + (st.dir === "left" ? 1 : -1) * prog(t, st.atMs, SWIPE_MS, DRAG) : acc), 0)));

  // окна приложений: открываются тапом, закрываются следующим «домой»
  const windows = steps.flatMap((st, i) => {
    if (st.kind !== "tap") return [];
    const close = steps.slice(i + 1).find((x) => x.kind === "home");
    // dynamic: открытие пружиной с лёгким перелётом, как в iOS
    const opened = s.dynamic
      ? spring({ frame: Math.max(0, ((t - st.atMs - OPEN_DELAY) / 1000) * fps), fps, config: { damping: 16, stiffness: 190, mass: 0.8 } })
      : prog(t, st.atMs + OPEN_DELAY, OPEN_MS, APP);
    const p = opened - (close ? prog(t, close.atMs + 150, CLOSE_MS, APP) : 0);
    return [{ app: st.app, open: st.atMs + OPEN_DELAY, p, icon: locate(st.app) }];
  });
  const appP = Math.max(0, ...windows.map((w) => w.p));
  const top = [...windows].reverse().find((w) => w.p > 0.5);

  // тумблеры: каждый toggle переключает строку
  const toggleAt = (label: string, init: boolean) => {
    let base = init ? 1 : 0;
    let v = base;
    for (const st of steps) {
      if (st.kind !== "toggle" || !sameLabel(st.row, label)) continue;
      if (t < st.atMs + 30) break;
      v = base + (1 - 2 * base) * prog(t, st.atMs + 30, 200);
      base = 1 - base;
    }
    return v;
  };
  // что зритель нажимает — рисуется детально (minimal)
  const focus = new Set(steps.flatMap((st) => (st.kind === "tap" ? [st.app] : [])));
  const keepRows = steps.flatMap((st) => (st.kind === "toggle" ? [st.row] : []));
  // dynamic: самолётик в статус-баре «выпрыгивает», тумблер вспыхивает кольцом
  const airStep = steps.find((st) => st.kind === "toggle" && sameLabel(st.row, AIRPLANE));
  const pop = s.dynamic && airStep ? interpolate(t, [airStep.atMs + 30, airStep.atMs + 170, airStep.atMs + 420], [0.4, 1.5, 1], clamp) : undefined;
  const glowAt = (label: string) => {
    const st = steps.find((x) => x.kind === "toggle" && sameLabel(x.row, label) && t >= x.atMs);
    return s.dynamic && st ? prog(t, st.atMs + 30, 500) : 0;
  };
  // dynamic: размытие страниц при быстром свайпе
  const pageAt = (tt: number) => steps.reduce((acc, st) => (st.kind === "swipe" ? acc + (st.dir === "left" ? 1 : -1) * prog(tt, st.atMs, SWIPE_MS, DRAG) : acc), 0);
  const blur = s.dynamic ? Math.min(4, Math.abs(pageAt(t + 17) - pageAt(t - 17)) * 30) : 0;
  const airInit = groups.flat().find((r) => sameLabel(r.label, AIRPLANE))?.toggle ?? false;
  const air = toggleAt(AIRPLANE, airInit);

  // нажатая иконка
  const tap = steps.find((st) => st.kind === "tap" && t >= st.atMs - 50 && t < st.atMs + 400);
  const press = tap && tap.kind === "tap" ? { name: tap.app, v: interpolate(t, [tap.atMs, tap.atMs + 100, tap.atMs + 200, tap.atMs + 330], [0, 1, 1, 0], clamp) } : null;

  // касания пальца
  const touches: Touch[] = steps.map((st) => {
    const p = st.atMs;
    switch (st.kind) {
      case "tap": {
        const ic = locate(st.app);
        return { show: p - 400, press: p, release: p + 150, hide: p + 180, at: [ic.x + ICON / 2, ic.y + ICON / 2] };
      }
      case "toggle":
        return { show: p - 450, press: p, release: p + 150, hide: p + 350, at: [TOGGLE_X, rowCenterY(groups, st.row)] };
      case "home":
        return { show: p - 300, press: p, release: p + 350, hide: p + 450, at: [SW / 2, 838], to: [SW / 2, 600] };
      case "swipe":
        return st.dir === "left"
          ? { show: p - 350, press: p - 50, release: p + SWIPE_MS, hide: p + SWIPE_MS + 100, at: [320, 330], to: [70, 330] }
          : { show: p - 350, press: p - 50, release: p + SWIPE_MS, hide: p + SWIPE_MS + 100, at: [70, 330], to: [320, 330] };
    }
  });

  // приближение на тумблере (zoom: true)
  let zoom = 1;
  let zoomY = SH / 2;
  for (const st of steps) {
    if (st.kind !== "toggle" || !st.zoom) continue;
    const z = prog(t, st.atMs - 700, 450) - prog(t, st.atMs + 700, 450);
    if (z > 0) {
      zoom = 1 + 0.1 * z;
      zoomY = rowCenterY(groups, st.row);
    }
  }

  // размер и место телефона
  const H = height * (s.heightPct ?? 0.58);
  const S = H / FRAME_H;
  const PW = FRAME_W * S;
  const PX = (width - PW) / 2;
  const PY = height * (s.topPct ?? 0.07);
  const enter = s.enter === false ? 1 : spring({ frame, fps, config: { damping: 18, stiffness: 110, mass: 0.9 } });
  const exit = s.enter === false ? 0 : prog(t, s.durationMs - 450, 450, Easing.in(Easing.cubic));
  const bgOp = s.enter === false ? 1 : Math.min(prog(t, 0, 250), 1 - prog(t, s.durationMs - 300, 300));
  const darkBar = top ? top.app !== "spotify" : false;

  // камера по ключам: точка (x, y) экрана переезжает в центр телефона, приближение и наклон — плавно между ключами
  type Cam = { atMs: number; zoom: number; x: number; y: number; rx: number; ry: number };
  let cam: Cam = { atMs: 0, zoom, x: SW / 2, y: zoomY, rx: 0, ry: 0 };
  if (s.camera?.length) {
    const keys: Cam[] = [];
    let prev = { ...cam, zoom: 1, y: SH / 2 };
    for (const k of [...s.camera].sort((a, b) => a.atMs - b.atMs)) keys.push((prev = { ...prev, ...k }));
    const i = keys.findIndex((k) => k.atMs > t);
    if (i === 0) cam = keys[0];
    else if (i < 0) cam = keys[keys.length - 1];
    else {
      const a = keys[i - 1];
      const b = keys[i];
      const e = Easing.inOut(Easing.cubic)((t - a.atMs) / (b.atMs - a.atMs));
      cam = { atMs: t, zoom: a.zoom * Math.pow(b.zoom / a.zoom, e), x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e), rx: lerp(a.rx, b.rx, e), ry: lerp(a.ry, b.ry, e) };
    }
  }
  // dynamic: телефон слегка «дышит» — покачивание и наклон
  const sway = s.dynamic ? { rx: 1.5 * Math.sin(t / 1700 + 1), ry: 2.5 * Math.sin(t / 1300), y: 6 * Math.sin(t / 1100) } : { rx: 0, ry: 0, y: 0 };
  const C = { x: width / 2, y: PY + H / 2 };
  const F = { x: PX + (SCREEN.x + SCREEN.k * cam.x) * S, y: PY + (SCREEN.y + SCREEN.k * cam.y) * S };
  const shift = s.camera?.length ? { x: C.x - F.x, y: C.y - F.y } : { x: 0, y: 0 };

  const appScreen = (w: (typeof windows)[number]) =>
    w.app === "settings" ? (
      <SettingsApp groups={groups} toggleAt={toggleAt} minimal={s.minimal} medium={s.medium} keep={keepRows} glowAt={glowAt} />
    ) : w.app === "spotify" && s.minimal ? (
      <DarkAppStub since={t - w.open} logo={s.logos?.spotify} accent="#1ED760" />
    ) : w.app === "spotify" ? (
      <SpotifyApp since={t - w.open} logo={s.logos?.spotify} />
    ) : (
      <GenericApp title={labelOf(w.app, s.labels)} color={stubColor(w.app)} />
    );

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: bgOp }}>
        {s.bg ? (
          s.bg.kind === "video" ? (
            <Loop durationInFrames={Math.max(1, Math.round(((s.bg.durationMs ?? 60000) / 1000) * fps))}>
              <OffthreadVideo src={staticFile(s.bg.src)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </Loop>
          ) : (
            <Img src={staticFile(s.bg.src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          )
        ) : (
          <AbsoluteFill style={{ background: "#FAFAFA" }}>
            <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 42%, rgba(255,193,99,0.30), rgba(255,193,99,0) 55%)" }} />
          </AbsoluteFill>
        )}
      </AbsoluteFill>
      <AbsoluteFill style={{ perspective: 2600, perspectiveOrigin: `${C.x}px ${C.y}px` }}>
      <AbsoluteFill
        style={{
          transformOrigin: `${F.x}px ${F.y}px`,
          transform: `translate(${shift.x}px, ${shift.y + sway.y}px) scale(${cam.zoom}) rotateX(${cam.rx + sway.rx}deg) rotateY(${cam.ry + sway.ry}deg)`,
        }}
      >
      <div
        style={{
          ...abs, left: PX, top: PY, width: PW, height: H,
          transform: `translateY(${(1 - enter + exit) * height * 0.8}px) rotate(${(1 - enter) * 14}deg)`,
        }}
      >
        <div style={{ ...abs, left: 0, top: 0, width: FRAME_W, height: FRAME_H, transform: `scale(${S})`, transformOrigin: "0 0" }}>
          <div style={{ ...abs, left: 10, top: 4, width: FRAME_W - 20, height: FRAME_H - 8, borderRadius: 140, boxShadow: "0 50px 90px rgba(17,19,23,0.30), 0 12px 24px rgba(17,19,23,0.18)" }} />
          <div style={{ ...abs, left: SCREEN.x, top: SCREEN.y, width: SW, height: SH, transform: `scale(${SCREEN.k})`, transformOrigin: "0 0", borderRadius: 55, overflow: "hidden", background: "#000", fontFamily: SF }}>
            <HomeScreen s={s} pages={pages} dock={dock} page={page} appP={appP} press={press} focus={focus} blur={blur} />
            {windows.map((w, i) => (
              <AppWindow key={i} p={w.p} icon={w.icon} iconEl={<AppIcon name={w.app} logos={s.logos} />}>
                {appScreen(w)}
              </AppWindow>
            ))}
            <StatusBar dark={darkBar} airplane={air} pop={pop} />
            <div style={{ ...abs, left: (SW - 134) / 2, bottom: 8, width: 134, height: 5, borderRadius: 3, background: darkBar ? "#000" : "#fff" }} />
          </div>
          <Img src={staticFile(s.frameSrc ?? "phone/frame.png")} style={{ ...abs, left: 0, top: 0, width: FRAME_W, height: FRAME_H }} />
          <div style={{ ...abs, left: SCREEN.x, top: SCREEN.y, width: SW, height: SH, transform: `scale(${SCREEN.k})`, transformOrigin: "0 0" }}>
            <Finger t={t} touches={touches} />
          </div>
        </div>
      </div>
      </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
