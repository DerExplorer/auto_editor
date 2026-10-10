import React from "react";
import { Html5Audio, Sequence, staticFile, useVideoConfig } from "remotion";
import type { EditProps } from "./types";

// Музыка — ровный фон одного уровня (трек заранее выровнен в scripts/audio.mjs). Трек идёт целиком с начала,
// без нарезки и повторов; громкость меняется только плавно: края ролика и отмеченные моменты (moments).
export const Music: React.FC<{ music: NonNullable<EditProps["music"]>; durationMs: number }> = ({ music, durationMs }) => {
  const { fps } = useVideoConfig();
  const end = music.endMs ?? durationMs;
  // косинусная кривая — без заметной «ступеньки» в начале и конце перехода
  const smooth = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, x)));
  return (
    <Html5Audio
      src={staticFile(music.src)}
      volume={(frame) => {
        const ms = (frame / fps) * 1000;
        let v = smooth(ms / music.fadeInMs) * smooth((end - ms) / music.fadeOutMs);
        for (const m of music.moments ?? []) {
          const into = smooth((ms - m.outFromMs) / m.rampMs) * smooth((m.outToMs - ms) / m.rampMs);
          v *= 1 + (m.gain - 1) * into;
        }
        return v * music.volume;
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
