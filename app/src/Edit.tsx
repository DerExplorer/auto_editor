import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { BottomGradient, BRoll, HookTitle, InsetVideo, QuizCard, setTopPct, TitlePlate } from "./Graphics";
import { Music, Sfx } from "./Sound";
import { Subtitles } from "./Subtitles";
import "./theme";
import type { EditProps, Span } from "./types";
import { SegmentView } from "./VideoTrack";

// Слои снизу вверх: видео → b-roll → градиент → рамка → карточки и плашки → хук → субтитры.
export const Edit: React.FC<EditProps> = (p) => {
  const { fps } = useVideoConfig();
  const f = (ms: number) => Math.round((ms / 1000) * fps);
  const at = (s: Span) => ({ from: f(s.outFromMs), durationInFrames: Math.max(1, f(s.outToMs) - f(s.outFromMs)) });

  setTopPct(p.layout?.topPct ?? 0.05);
  const g = p.grade;
  const filter = g ? `saturate(${g.saturate}) contrast(${g.contrast}) brightness(${g.brightness})` : undefined;
  // тон через soft-light: не искажает цвет кожи
  const tint = g && Math.abs(g.warmth) > 0.01 ? (g.warmth > 0 ? `rgba(255,160,70,${g.warmth * 0.35})` : `rgba(70,110,170,${-g.warmth * 0.35})`) : null;

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <AbsoluteFill style={{ filter }}>
        {p.segments.map((s, i) => (
          <Sequence key={`seg${i}`} {...at(s)}>
            <SegmentView seg={s} focus={p.focus} camera={p.camera} />
          </Sequence>
        ))}
        {tint && <AbsoluteFill style={{ background: tint, mixBlendMode: "soft-light" }} />}
      </AbsoluteFill>
      {p.broll.map((b, i) => (
        <Sequence key={`br${i}`} {...at(b)}>
          <BRoll item={b} />
        </Sequence>
      ))}
      {p.bottomGradient && <BottomGradient {...p.bottomGradient} />}
      {p.inset && (
        <Sequence {...at(p.inset)}>
          <InsetVideo inset={p.inset} />
        </Sequence>
      )}
      {p.cards.map((c, i) => (
        <Sequence key={`card${i}`} {...at(c)}>
          <QuizCard card={c} />
        </Sequence>
      ))}
      {p.titles.map((t, i) => (
        <Sequence key={`title${i}`} {...at(t)}>
          <TitlePlate item={t} />
        </Sequence>
      ))}
      {p.hook && (
        <Sequence {...at({ outFromMs: 0, outToMs: p.hook.durationMs })}>
          <HookTitle hook={p.hook} />
        </Sequence>
      )}
      <Subtitles style={p.subtitles} />
      {p.music && <Music music={p.music} durationMs={p.durationMs} />}
      <Sfx sfx={p.sfx} />
    </AbsoluteFill>
  );
};
