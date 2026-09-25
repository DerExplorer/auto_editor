import React from "react";
import { AbsoluteFill, Easing, Freeze, interpolate, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Camera, EditProps, Segment, TransitionType, Zoom } from "./types";

const ease = Easing.inOut(Easing.cubic);

// Плавные зумы-акценты: разгон 300 мс, удержание, возврат 300 мс. Несколько зумов перемножаются.
const zoomAt = (zooms: Zoom[], ms: number) =>
  zooms.reduce((acc, z) => {
    if (ms < z.outFromMs || ms > z.outToMs) return acc;
    const ramp = Math.min(300, (z.outToMs - z.outFromMs) / 2);
    const env = Math.max(0, Math.min(1, (ms - z.outFromMs) / ramp, (z.outToMs - ms) / ramp));
    return acc * (1 + (z.scale - 1) * ease(env));
  }, 1);

// Камера: плавный переход между ключами (длительность перехода = rampMs), в удержании после
// приближения — лёгкий дрейф вперёд; пики — короткие сильные наезды; caps — потолок под графикой.
const cameraAt = (cam: Camera, ms: number) => {
  let scale = 1;
  for (let i = 0; i < cam.keys.length; i++) {
    const k = cam.keys[i];
    if (ms < k.atMs) break;
    const prev = i > 0 ? cam.keys[i - 1].scale : k.scale;
    const p = k.rampMs > 0 ? Math.min(1, (ms - k.atMs) / k.rampMs) : 1;
    const holdEnd = cam.keys[i + 1]?.atMs ?? ms;
    const drift = k.scale > 1.02 && holdEnd > k.atMs + k.rampMs ? 0.015 * Math.max(0, Math.min(1, (ms - k.atMs - k.rampMs) / (holdEnd - k.atMs - k.rampMs))) : 0;
    scale = prev + (k.scale - prev) * ease(p) + drift;
  }
  for (const pk of cam.peaks) {
    if (ms < pk.outFromMs || ms > pk.outToMs + 500) continue;
    const up = ease(Math.min(1, (ms - pk.outFromMs) / pk.rampMs));
    const down = ms > pk.outToMs ? ease(1 - (ms - pk.outToMs) / 500) : 1;
    scale = Math.max(scale, 1 + (pk.scale - 1) * up * down);
  }
  for (const c of cam.caps) if (ms >= c.outFromMs - 300 && ms <= c.outToMs + 300) scale = Math.min(scale, c.max);
  return scale;
};

// Кадр видео под нужный формат: crop — заполнить кадр с обрезкой по точке фокуса,
// blur — вписать целиком поверх размытой копии.
const VideoLayer: React.FC<{ src: string; trimBefore: number; muted: boolean; scale: number; fit: EditProps["fit"]; focus: EditProps["focus"] }> = ({
  src,
  trimBefore,
  muted,
  scale,
  fit,
  focus,
}) => {
  const origin = `${focus.x * 100}% ${focus.y * 100}%`;
  const full = { width: "100%", height: "100%" } as const;
  if (fit === "blur") {
    return (
      <>
        <AbsoluteFill>
          <OffthreadVideo src={staticFile(src)} trimBefore={trimBefore} muted style={{ ...full, objectFit: "cover", filter: "blur(28px) brightness(0.55)", transform: "scale(1.15)" }} />
        </AbsoluteFill>
        <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: origin }}>
          <OffthreadVideo src={staticFile(src)} trimBefore={trimBefore} muted={muted} style={{ ...full, objectFit: "contain" }} />
        </AbsoluteFill>
      </>
    );
  }
  return (
    <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: origin }}>
      <OffthreadVideo src={staticFile(src)} trimBefore={trimBefore} muted={muted} style={{ ...full, objectFit: "cover", objectPosition: origin }} />
    </AbsoluteFill>
  );
};

const transitionStyle = (type: TransitionType, p: number): React.CSSProperties => {
  switch (type) {
    case "fade":
      return { opacity: p };
    case "slide":
      return { transform: `translateX(${(1 - p) * 100}%)` };
    case "wipe":
      return { clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` };
    case "zoom":
      return { opacity: p, transform: `scale(${1.25 - 0.25 * p})` };
  }
};

export const SegmentView: React.FC<{ seg: Segment; fit: EditProps["fit"]; focus: EditProps["focus"]; zooms: Zoom[]; camera: Camera }> = ({ seg, fit, focus, zooms, camera }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = (ms: number) => Math.round((ms / 1000) * fps);
  const ms = seg.outFromMs + (frame / fps) * 1000;
  const scale = cameraAt(camera, ms) * zoomAt(zooms, ms) * seg.punch;
  const layer = <VideoLayer src={seg.src} trimBefore={f(seg.srcFromMs)} muted={false} scale={scale} fit={fit} focus={focus} />;

  const tr = seg.transitionIn;
  if (!tr) return layer;
  // Переход: под входящим куском держим стоп-кадр последнего кадра предыдущего (без звука).
  const p = interpolate(frame, [0, f(tr.durationMs)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  return (
    <>
      {p < 1 && (
        <Freeze frame={Math.max(0, f(tr.prevSrcToMs) - 1)}>
          <VideoLayer src={tr.prevSrc} trimBefore={0} muted scale={tr.prevPunch} fit={fit} focus={focus} />
        </Freeze>
      )}
      <AbsoluteFill style={transitionStyle(tr.type, p)}>{layer}</AbsoluteFill>
    </>
  );
};
