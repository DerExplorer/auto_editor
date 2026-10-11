import type { SubtitleStyle } from "./Subtitles";

export type Span = { outFromMs: number; outToMs: number };

export type Segment = Span & {
  src: string;
  voiceSrc?: string | null;
  srcFromMs: number;
  speed?: number;
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

// lines — «разговорный» заголовок: слова, как звучат, по строкам; atMs — от начала заголовка
export type TitleWord = { text: string; atMs: number; look: "script" | "caps" | "accent" };
export type TitleItem = Span & { text: string; position: "top" | "center"; topPct?: number; script?: string; caps?: string; capsColor?: string; lines?: TitleWord[][] | null; hook?: boolean };

// Стиль клиента (app/styles/<имя>.mjs). Цвет "accent" — акцент палитры.
export type TextStyle = { font: string; sizePct: number; color: string; stroke?: number };
export type ClientStyle = {
  fonts: Record<string, { family: string; src: string }>;
  subtitles?: TextStyle & { mode: "word" | "blocks"; centerPct: number; numbers?: TextStyle; listNumber?: TextStyle; accent?: TextStyle; script?: TextStyle; hideUnderTitles?: boolean };
  titles?: { centerPct: number; maxBottomPct?: number; staggerMs?: number; staggerMaxMs?: number; holdMs?: number; script: TextStyle; hookScript?: TextStyle; caps: TextStyle; accent?: TextStyle; lineGapPct?: number; overlapPct?: number };
};
export type CardItem = Span & { title: string; question: string; options: string[]; answer?: number; answerOutMs?: number };

export type HookWord = { text: string; size: "s" | "m" | "l" | "xl"; accent?: boolean; br?: boolean; atMs?: number };
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
  style?: ClientStyle | null;
  // кадрирование по лицу (scripts/framing.mjs): кадр увеличен в scale раз и сдвинут на x, y (доли кадра)
  framing?: Framing | null;
  debug?: "clean" | "mask";
};

export type Framing = { scale: number; x: number; y: number };
