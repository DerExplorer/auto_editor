import type { SubtitleStyle } from "./Subtitles";

export type Span = { outFromMs: number; outToMs: number };

export type Segment = Span & {
  src: string;
  voiceSrc?: string | null;
  srcFromMs: number;
  srcToMs: number;
  punch: number;
};

export type Camera = {
  keys: { atMs: number; scale: number; rampMs: number }[];
  caps: (Span & { max: number })[];
};

// B-roll: файл (картинка/видео) или встроенная инфографика.
export type BRollContent =
  | { kind: "image"; src: string }
  | { kind: "video"; src: string }
  | { kind: "bars"; title: string; subtitle?: string; bars: { label: string; value: number }[]; badge?: string }
  | { kind: "ring"; chip?: string; value: number; caption: string };
// bg — фон под b-roll (видео или картинка из library/backgrounds); fit "contain" — картинка целиком поверх фона
export type BRollItem = Span & { mode: "full" | "pip"; content: BRollContent; bg?: { src: string; kind: "video" | "image"; durationMs?: number }; fit?: "cover" | "contain" };
// Оверлей поверх кадра, режим screen: чёрное прозрачно (огонь, искры, стекло)
export type OverlayItem = Span & { src: string; opacity: number };
// Стикер сбоку от лица: y — центр по высоте (доля кадра), size — ширина (доля кадра)
export type StickerItem = Span & { src: string; side: "left" | "right"; y: number; size: number };

export type TitleItem = Span & { text: string; position: "top" | "center"; topPct?: number };
export type CardItem = Span & { title: string; question: string; options: string[]; answer?: number; answerOutMs?: number };

export type HookWord = { text: string; size: "s" | "m" | "l" | "xl"; accent?: boolean; br?: boolean };
export type Hook = { words: HookWord[]; durationMs: number; topPct?: number };

// Видео в рамке поверх рассказчика; pieces — куски вставки подряд на таймлайне.
export type Inset = Span & {
  topPct: number;
  widthPct: number;
  volume: number;
  aspect: number;
  borderColor: string;
  pieces: { src: string; outFromMs: number; outToMs: number; srcFromMs: number }[];
};

// Цвета графики по ролям; собирается из любимых цветов клиента (scripts/palette.mjs).
export type Palette = {
  accent: string;
  accentDeep: string;
  onAccent: string;
  highlight: string;
  ink: string;
  text: string;
  muted: string;
  bg: string;
  grey: string;
  blob: string;
};

export type EditProps = {
  width: number;
  height: number;
  durationMs: number;
  focus: { x: number; y: number };
  segments: Segment[];
  camera: Camera;
  broll: BRollItem[];
  overlays?: OverlayItem[];
  stickers?: StickerItem[];
  titles: TitleItem[];
  cards: CardItem[];
  hook: Hook | null;
  // цветокоррекция настроения; warmth > 0 теплее, < 0 холоднее
  grade: null | { saturate: number; contrast: number; brightness: number; warmth: number };
  layout: { topPct: number };
  music: null | { src: string; volume: number; fadeInMs: number; fadeOutMs: number; endMs?: number; moments?: (Span & { gain: number; rampMs: number })[]; name?: string };
  sfx: { src: string; atMs: number; volume: number }[];
  inset: Inset | null;
  bottomGradient: null | { heightPct: number; opacity: number };
  subtitles: SubtitleStyle;
  palette: Palette | null;
};
