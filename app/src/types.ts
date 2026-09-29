import type { SubtitleStyle } from "./Subtitles";

export type Span = { outFromMs: number; outToMs: number };

export type TransitionType = "fade" | "slide" | "wipe" | "zoom";

export type Segment = Span & {
  src: string;
  srcFromMs: number;
  srcToMs: number;
  punch: number;
  transitionIn: null | { type: TransitionType; durationMs: number; prevSrc: string; prevSrcToMs: number; prevPunch: number };
};

export type Zoom = Span & { scale: number };

export type Camera = {
  keys: { atMs: number; scale: number; rampMs: number }[];
  peaks: (Span & { scale: number; rampMs: number })[];
  caps: (Span & { max: number })[];
};

// B-roll: файл (картинка/видео) или встроенная инфографика в стиле дизайн-системы.
export type BRollContent =
  | { kind: "image"; src: string }
  | { kind: "video"; src: string }
  | { kind: "bars"; title: string; subtitle?: string; bars: { label: string; value: number }[]; badge?: string }
  | { kind: "ring"; chip?: string; value: number; caption: string };
export type BRollItem = Span & { mode: "full" | "pip"; content: BRollContent };

export type TitleItem = Span & { text: string; position: "top" | "center"; topPct?: number };
export type CardItem = Span & { title: string; question: string; options: string[]; answer?: number; answerOutMs?: number };

export type HookWord = { text: string; size: "s" | "m" | "l" | "xl"; accent?: boolean; br?: boolean };
export type Hook = { words: HookWord[]; durationMs: number; topPct?: number };

// Видео в рамке поверх рассказчика (например, горизонтальная реклама по центру кадра).
// pieces — куски исходника, выложенные подряд на выходном таймлайне (хард-каты внутри рамки).
export type Inset = Span & {
  topPct: number;
  widthPct: number;
  volume: number;
  aspect: number; // ширина / высота исходника
  borderColor: string;
  pieces: { src: string; outFromMs: number; outToMs: number; srcFromMs: number }[];
};

export type EditProps = {
  width: number;
  height: number;
  durationMs: number;
  fit: "crop" | "blur";
  focus: { x: number; y: number };
  segments: Segment[];
  zooms: Zoom[];
  camera: Camera;
  broll: BRollItem[];
  titles: TitleItem[];
  cards: CardItem[];
  hook: Hook | null;
  inset: Inset | null;
  bottomGradient: null | { heightPct: number; opacity: number };
  progressBar: null | { position: "top" | "bottom" };
  subtitles: SubtitleStyle;
};
