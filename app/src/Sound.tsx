import React from "react";
import { Html5Audio, Sequence, staticFile, useVideoConfig } from "remotion";
import type { EditProps } from "./types";

// Музыка приглушается под голос и плавно появляется и уходит по краям ролика.
export const Music: React.FC<{ music: NonNullable<EditProps["music"]>; durationMs: number }> = ({ music, durationMs }) => {
  const { fps } = useVideoConfig();
  const RAMP = 250;
  const duckAt = (ms: number) => {
    let dist = Infinity;
    for (const [a, b] of music.speech) {
      if (ms >= a - 150 && ms <= b + 150) return 0;
      dist = Math.min(dist, Math.abs(ms - a), Math.abs(ms - b));
      if (a > ms + RAMP) break;
    }
    return Math.min(1, dist / RAMP);
  };
  return (
    <Html5Audio
      src={staticFile(music.src)}
      loop
      volume={(frame) => {
        const ms = (frame / fps) * 1000;
        const fade = Math.min(1, ms / music.fadeInMs, (durationMs - ms) / music.fadeOutMs);
        const open = duckAt(ms);
        return Math.max(0, fade) * (music.duckTo + (music.volume - music.duckTo) * open);
      }}
    />
  );
};

export const Sfx: React.FC<{ sfx: EditProps["sfx"] }> = ({ sfx }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {sfx.map((s, i) => (
        <Sequence key={i} from={Math.round((s.atMs / 1000) * fps)} layout="none">
          <Html5Audio src={staticFile(s.src)} volume={s.volume} />
        </Sequence>
      ))}
    </>
  );
};
