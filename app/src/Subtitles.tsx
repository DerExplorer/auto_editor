import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT_HEAD } from "./theme";

// Блоки готовит текстовый слой (scripts/subs.mjs): текст уже нормализован, разбит по смыслу.
export type SubWord = { text: string; startMs: number; endMs: number } | { br: true };
export type SubBlock = { kind: "text" | "number"; number?: string; words: SubWord[]; fromMs: number; toMs: number };
// zones — участки, где субтитры стоят на другой высоте (например, под рамкой с видео).
export type SubtitleStyle = { bottomPct: number; maxWidthPct: number; blocks: SubBlock[]; zones?: { outFromMs: number; outToMs: number; bottomPct: number }[] };

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
  const zone = style.zones?.find((z) => block.fromMs >= z.outFromMs && block.fromMs < z.outToMs);
  const box: React.CSSProperties = { justifyContent: "flex-end", alignItems: "center", paddingBottom: height * (zone?.bottomPct ?? style.bottomPct) };

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

  // Текущее слово — янтарём, остальные белые; без приглушения и подпрыгиваний.
  const spoken = block.words.filter((w): w is Exclude<SubWord, { br: true }> => !("br" in w));
  const active = [...spoken].reverse().find((w) => nowMs >= w.startMs);
  return (
    <AbsoluteFill style={box}>
      <div
        style={{
          fontFamily: FONT_HEAD,
          fontWeight: 800,
          fontSize: base * 0.064,
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
            <span key={i} style={{ color: w === active ? C.amber : "white" }}>
              {w.text}{" "}
            </span>
          ),
        )}
      </div>
    </AbsoluteFill>
  );
};
