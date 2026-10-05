import React from "react";
import { AbsoluteFill, Easing, Html5Audio, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Camera, EditProps, Segment } from "./types";

const ease = Easing.inOut(Easing.cubic);

// Плавный переход между ключами камеры; под графикой зум ограничен (caps).
const cameraAt = (cam: Camera, ms: number) => {
  let scale = 1;
  for (let i = 0; i < cam.keys.length; i++) {
    const k = cam.keys[i];
    if (ms < k.atMs) break;
    const prev = i > 0 ? cam.keys[i - 1].scale : k.scale;
    const p = k.rampMs > 0 ? Math.min(1, (ms - k.atMs) / k.rampMs) : 1;
    scale = prev + (k.scale - prev) * ease(p);
  }
  for (const c of cam.caps) if (ms >= c.outFromMs - 300 && ms <= c.outToMs + 300) scale = Math.min(scale, c.max);
  return scale;
};

export const SegmentView: React.FC<{ seg: Segment; focus: EditProps["focus"]; camera: Camera }> = ({ seg, focus, camera }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const trimBefore = Math.round((seg.srcFromMs / 1000) * fps);
  const scale = cameraAt(camera, seg.outFromMs + (frame / fps) * 1000) * seg.punch;
  const origin = `${focus.x * 100}% ${focus.y * 100}%`;
  return (
    <>
      <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: origin }}>
        <OffthreadVideo
          src={staticFile(seg.src)}
          trimBefore={trimBefore}
          muted={!!seg.voiceSrc}
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: origin }}
        />
      </AbsoluteFill>
      {/* голос идёт отдельной дорожкой (срез низов), звук самого видео при этом выключен */}
      {seg.voiceSrc && <Html5Audio src={staticFile(seg.voiceSrc)} trimBefore={trimBefore} />}
    </>
  );
};
