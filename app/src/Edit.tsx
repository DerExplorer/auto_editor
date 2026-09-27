import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { BottomGradient, BRoll, HookTitle, InsetVideo, ProgressBar, QuizCard, TitlePlate } from "./Graphics";
import { Subtitles } from "./Subtitles";
import "./theme";
import type { EditProps, Span } from "./types";
import { SegmentView } from "./VideoTrack";

// Все времена в props уже в выходном таймлайне — считает scripts/build.mjs.
// Порядок слоёв: видео → b-roll → градиент → видео в рамке → графика → хук → субтитры (всегда сверху).
export const Edit: React.FC<EditProps> = (p) => {
  const { fps } = useVideoConfig();
  const f = (ms: number) => Math.round((ms / 1000) * fps);
  const at = (s: Span) => ({ from: f(s.outFromMs), durationInFrames: Math.max(1, f(s.outToMs) - f(s.outFromMs)) });

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {p.segments.map((s, i) => (
        <Sequence key={`seg${i}`} {...at(s)}>
          <SegmentView seg={s} fit={p.fit} focus={p.focus} zooms={p.zooms} camera={p.camera} />
        </Sequence>
      ))}
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
      {p.progressBar && <ProgressBar position={p.progressBar.position} />}
      <Subtitles style={p.subtitles} />
    </AbsoluteFill>
  );
};
