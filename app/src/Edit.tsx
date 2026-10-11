import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { BottomGradient, BRoll, ClientTitle, HookTitle, InsetVideo, Overlay, QuizCard, Sticker, DEFAULT_TOP, setTopPct, TitlePlate } from "./Graphics";
import { Music, Sfx } from "./Sound";
import { Subtitles } from "./Subtitles";
import "./theme";
import type { EditProps, Span } from "./types";
import { SegmentView } from "./VideoTrack";

// Слои снизу вверх: видео → b-roll → оверлеи → градиент → рамка → карточки и плашки → стикеры → хук → субтитры.
// debug (проверка лица, scripts/facecheck.mjs): "clean" — только видео и то, что его заменяет (полноэкранный b-roll);
// "mask" — только то, что может закрыть лицо (текст, плашки, стикеры, рамка), белым на чёрном.
export const Edit: React.FC<EditProps> = (p) => {
  if (p.debug === "mask") {
    return (
      <AbsoluteFill style={{ backgroundColor: "black" }}>
        <AbsoluteFill style={{ filter: "brightness(0) invert(1)" }}>
          <Layers bg="transparent" p={{ ...p, segments: [], broll: p.broll.filter((b) => b.mode === "pip"), overlays: [], bottomGradient: null, music: null, sfx: [] }} />
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }
  if (p.debug === "clean") {
    return <Layers p={{ ...p, broll: p.broll.filter((b) => b.mode === "full"), bottomGradient: null, inset: null, cards: [], titles: [], stickers: [], hook: null, music: null, sfx: [], subtitles: { ...p.subtitles, blocks: [] } }} />;
  }
  return <Layers p={p} />;
};

const Layers: React.FC<{ p: EditProps; bg?: string }> = ({ p, bg = "black" }) => {
  const { fps } = useVideoConfig();
  const f = (ms: number) => Math.round((ms / 1000) * fps);
  const at = (s: Span) => ({ from: f(s.outFromMs), durationInFrames: Math.max(1, f(s.outToMs) - f(s.outFromMs)) });

  setTopPct(p.layout?.topPct ?? DEFAULT_TOP);
  const g = p.grade;
  const filter = g ? `saturate(${g.saturate}) contrast(${g.contrast}) brightness(${g.brightness})` : undefined;
  // тон через soft-light: не искажает цвет кожи
  const tint = g && Math.abs(g.warmth) > 0.01 ? (g.warmth > 0 ? `rgba(255,160,70,${g.warmth * 0.35})` : `rgba(70,110,170,${-g.warmth * 0.35})`) : null;

  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      <AbsoluteFill style={{ filter }}>
        {p.segments.map((s, i) => (
          <Sequence key={`seg${i}`} {...at(s)}>
            <SegmentView seg={s} focus={p.focus} camera={p.camera} framing={p.framing} />
          </Sequence>
        ))}
        {tint && <AbsoluteFill style={{ background: tint, mixBlendMode: "soft-light" }} />}
      </AbsoluteFill>
      {p.broll.map((b, i) => (
        <Sequence key={`br${i}`} {...at(b)}>
          <BRoll item={b} />
        </Sequence>
      ))}
      {(p.overlays ?? []).map((o, i) => (
        <Sequence key={`ov${i}`} {...at(o)}>
          <Overlay item={o} />
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
          {p.style?.titles && (t.script || t.caps) ? <ClientTitle item={t} look={p.style.titles} /> : <TitlePlate item={t} />}
        </Sequence>
      ))}
      {(p.stickers ?? []).map((st, i) => (
        <Sequence key={`st${i}`} {...at(st)}>
          <Sticker item={st} />
        </Sequence>
      ))}
      {p.hook && (
        <Sequence {...at({ outFromMs: 0, outToMs: p.hook.durationMs })}>
          <HookTitle hook={p.hook} />
        </Sequence>
      )}
      <Subtitles style={p.subtitles} client={p.style?.subtitles} hide={p.titles} hookUntilMs={p.hook?.durationMs ?? 0} />
      {p.music && <Music music={p.music} durationMs={p.durationMs} />}
      <Sfx sfx={p.sfx} />
    </AbsoluteFill>
  );
};
