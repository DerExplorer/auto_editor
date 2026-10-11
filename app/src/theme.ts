// Цвета и шрифты из дизайн-системы каруселей: монохром и один акцент (по умолчанию янтарь).
// Палитра клиента ("client" в edit-файле → props.palette, см. scripts/palette.mjs) заменяет эти цвета.
import { loadFont } from "@remotion/fonts";
import { getInputProps, staticFile } from "remotion";
import type { ClientStyle, Palette } from "./types";

const DEFAULT: Palette = {
  accent: "#FFC163",
  accentDeep: "#F5A742",
  onAccent: "#111317", // текст на акценте
  highlight: "#FFC163", // текущее слово субтитров на видео
  ink: "#111317",
  text: "#2B2D33",
  muted: "#6B6E76",
  bg: "#FAFAFA",
  grey: "#DCDCDC",
  blob: "#E3E3E3",
};

const input = getInputProps() as { palette?: Partial<Palette>; style?: ClientStyle | null };
const pal: Palette = { ...DEFAULT, ...input.palette };

export const C = {
  ...pal,
  paper: pal.bg,
  shade: (a: number) => `rgba(10,11,13,${a})`,
};

export const FONT_HEAD = '"Inter Tight", Arial, sans-serif';
export const FONT_TEXT = '"Inter", Arial, sans-serif';

const CYR = "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116";
const LAT =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";

// Вариативные шрифты: один файл на все начертания.
for (const [family, file] of [
  ["Inter Tight", "InterTight"],
  ["Inter", "Inter"],
] as const) {
  loadFont({ family, url: staticFile(`fonts/${file}-cyrillic.woff2`), weight: "100 900", unicodeRange: CYR });
  loadFont({ family, url: staticFile(`fonts/${file}-latin.woff2`), weight: "100 900", unicodeRange: LAT });
}

// Шрифты стиля клиента (styles/<имя>.mjs → props.style.fonts)
for (const { family, src } of Object.values(input.style?.fonts ?? {})) loadFont({ family, url: staticFile(src) });

// Цвет из стиля клиента: "accent" — акцент палитры, иначе как есть
export const colorOf = (c: string) => (c === "accent" ? pal.accent : c);
export const fontOf = (key: string) => `"${input.style?.fonts?.[key]?.family ?? key}", "Inter Tight", Arial, sans-serif`;
