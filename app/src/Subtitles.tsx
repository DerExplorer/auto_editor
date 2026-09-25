import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT_HEAD } from "./theme";

// Блоки готовит текстовый слой (scripts/subs.mjs): текст уже нормализован, разбит по смыслу.
export type SubWord = { text: string; startMs: number; endMs: number } | { br: true };
export type SubBlock = { kind: "text" | "number"; number?: string; words: SubWord[]; fromMs: number; toMs: number };
export type SubtitleStyle = { bottomPct: number; maxWidthPct: number; blocks: SubBlock[] };

// Мягкая размытая тень — у субтитров и у всей графики.
export const SOFT_TEXT_SHADOW = "0 4px 28px rgba(0,0,0,0.55), 0 1px 4px rgba(0,0,0,0.35)";

// Субтитры до 2 строк, текущее слово — янтарём; «нумерация» — только большая цифра. Самый верхний слой.
export const Subtitles: React.FC<{ style: SubtitleStyle }> = ({ style }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const nowMs = (frame / fps) * 1000;
  const block = style.blocks.find((b) => nowMs >= b.fromMs && nowMs < b.toMs);
  if (!block) return null;

  const base = Math.min(width, height);
  const pop = spring({ frame: frame - Math.round((block.fromMs / 1000) * fps), fps, config: { damping: 14, mass: 0.5 } });
  const box: React.CSSProperties = { justifyContent: "flex-end", alignItems: "center", paddingBottom: height * style.bottomPct };

  if (block.kind === "number") {
    return (
      <AbsoluteFill style={box}>
        <div
          style={{
            fontFamily: FONT_HEAD,
            fontWeight: 900,
            fontSize: base * 0.21,
            lineHeight: 0.85,
            letterSpacing: "-0.05em",
            color: C.amber,
            textShadow: SOFT_TEXT_SHADOW,
            transform: `scale(${0.5 + 0.5 * pop}) rotate(${(1 - pop) * -8}deg)`,
            opacity: Math.min(1, pop * 2),
          }}
        >
          {block.number}
        </div>
      </AbsoluteFill>
    );
  }

  // Караоке: сказанные — белые, звучащее сейчас — янтарное, крупнее и со свечением, ещё не сказанные — приглушены.
  const spoken = block.words.filter((w): w is Exclude<SubWord, { br: true }> => !("br" in w));
  const active = [...spoken].reverse().find((w) => nowMs >= w.startMs);
  const wordStyle = (w: Exclude<SubWord, { br: true }>): React.CSSProperties => {
    if (w === active) {
      const hit = spring({ frame: frame - Math.round((w.startMs / 1000) * fps), fps, config: { damping: 11, mass: 0.4 } });
      return {
        color: C.amber,
        transform: `scale(${1 + 0.05 * hit}) translateY(${-base * 0.005 * hit}px)`,
        textShadow: `0 0 ${base * 0.035}px rgba(255,193,99,0.55), ${SOFT_TEXT_SHADOW}`,
      };
    }
    return { color: "white", opacity: nowMs < w.startMs ? 0.5 : 1 };
  };
  return (
    <AbsoluteFill style={box}>
      <div
        style={{
          fontFamily: FONT_HEAD,
          fontWeight: 800,
          fontSize: base * 0.06,
          lineHeight: 1.08,
          letterSpacing: "-0.01em",
          color: "white",
          textShadow: SOFT_TEXT_SHADOW,
          textAlign: "center",
          textWrap: "balance",
          maxWidth: width * style.maxWidthPct,
          transform: `scale(${0.92 + 0.08 * pop})`,
        }}
      >
        {block.words.map((w, i) =>
          "br" in w ? (
            <br key={i} />
          ) : (
            <span key={i} style={{ display: "inline-block", margin: "0 0.14em", ...wordStyle(w) }}>
              {w.text}
            </span>
          ),
        )}
      </div>
    </AbsoluteFill>
  );
};
