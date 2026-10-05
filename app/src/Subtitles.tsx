import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT_HEAD } from "./theme";

// Блоки готовит scripts/subs.mjs.
export type SubWord = { text: string; startMs: number; endMs: number } | { br: true };
export type SubBlock = { kind: "text" | "number"; number?: string; words: SubWord[]; fromMs: number; toMs: number };
// zones — участки с другой высотой субтитров (например, под рамкой)
export type SubtitleStyle = { bottomPct: number; maxWidthPct: number; blocks: SubBlock[]; zones?: { outFromMs: number; outToMs: number; bottomPct: number }[] };

// Короткий предлог или союз не остаётся в конце строки: склеиваем его со следующим словом.
const SHORT = new Set("в во и а на о об с со к ко у по за из от до не ни но же ли бы для что как при без".split(" "));
const glue = (words: SubWord[]): SubWord[][] => {
  const out: SubWord[][] = [];
  let cur: SubWord[] = [];
  words.forEach((w, i) => {
    if ("br" in w) {
      if (cur.length) out.push(cur);
      out.push([w]);
      cur = [];
      return;
    }
    cur.push(w);
    const next = words[i + 1];
    const short = SHORT.has(w.text.toLowerCase().replace(/[^\p{L}]/gu, ""));
    if (!(short && next && !("br" in next))) {
      out.push(cur);
      cur = [];
    }
  });
  if (cur.length) out.push(cur);
  return out;
};

export const SOFT_TEXT_SHADOW = "0 4px 28px rgba(0,0,0,0.55), 0 1px 4px rgba(0,0,0,0.35)";

// До 2 строк, текущее слово янтарное; нумерация — большая цифра.
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
        {glue(block.words).map((group, gi) =>
          group[0] && "br" in group[0] ? (
            <br key={gi} />
          ) : (
            // обычный пробел снаружи группы, чтобы строка переносилась
            <React.Fragment key={gi}>
              <span style={{ whiteSpace: "nowrap" }}>
              {(group as Exclude<SubWord, { br: true }>[]).map((w, i) => (
                <span key={i} style={{ color: w === active ? C.amber : "white" }}>
                  {w.text}
                  {i < group.length - 1 ? " " : ""}
                </span>
              ))}
              </span>{" "}
            </React.Fragment>
          ),
        )}
      </div>
    </AbsoluteFill>
  );
};
