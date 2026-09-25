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

export type TitleItem = Span & { text: string; position: "top" | "center" };
export type CardItem = Span & { title: string; question: string; options: string[]; answer?: number; answerOutMs?: number };

export type HookWord = { text: string; size: "s" | "m" | "l" | "xl"; accent?: boolean; br?: boolean };
export type Hook = { words: HookWord[]; durationMs: number };

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
  bottomGradient: null | { heightPct: number; opacity: number };
  progressBar: null | { position: "top" | "bottom" };
  subtitles: SubtitleStyle;
};
