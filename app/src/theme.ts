// Токены из «Дизайн-система каруселей v2», адаптированные под рилсы:
// почти монохром + один янтарный акцент; чёрный текст на янтаре, никогда белый.
import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

export const C = {
  ink: "#111317",
  text: "#2B2D33",
  muted: "#6B6E76",
  bg: "#FAFAFA",
  grey: "#DCDCDC",
  blob: "#E3E3E3",
  amber: "#FFC163",
  amberDeep: "#F5A742",
  paper: "#FAFAFA",
  shade: (a: number) => `rgba(10,11,13,${a})`,
};

export const FONT_HEAD = '"Inter Tight", Arial, sans-serif';
export const FONT_TEXT = '"Inter", Arial, sans-serif';

const CYR = "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116";
const LAT =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";

// Вариативные woff2 (один файл на все начертания), извлечены из файла дизайн-системы.
for (const [family, file] of [
  ["Inter Tight", "InterTight"],
  ["Inter", "Inter"],
] as const) {
  loadFont({ family, url: staticFile(`fonts/${file}-cyrillic.woff2`), weight: "100 900", unicodeRange: CYR });
  loadFont({ family, url: staticFile(`fonts/${file}-latin.woff2`), weight: "100 900", unicodeRange: LAT });
}
