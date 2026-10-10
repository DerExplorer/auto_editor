import React from "react";
import { Composition } from "remotion";
import { Edit } from "./Edit";
import { DEFAULT_TOP } from "./Graphics";
import type { EditProps } from "./types";
import { GDP_DURATION, GDP_FPS, GdpDemo } from "./GdpDemo";
import { PHONE_DURATION, PHONE_DYN_DURATION, PHONE_FPS, PHONE_FX_DURATION, PhoneDemo, PhoneDemoDynamic, PhoneDemoFx } from "./PhoneDemo";

const FPS = 30;

const defaultProps: EditProps = {
  width: 1080,
  height: 1920,
  durationMs: 1000,
  focus: { x: 0.5, y: 0.5 },
  segments: [],
  camera: { keys: [], caps: [] },
  broll: [],
  titles: [],
  cards: [],
  hook: null,
  grade: null,
  layout: { topPct: DEFAULT_TOP },
  music: null,
  sfx: [],
  inset: null,
  bottomGradient: null,
  subtitles: { bottomPct: 0.24, maxWidthPct: 0.69, blocks: [] },
  palette: null,
};

export const Root: React.FC = () => (
  <>
  <Composition
    id="PhoneDemo"
    component={PhoneDemo}
    fps={PHONE_FPS}
    width={1080}
    height={1920}
    durationInFrames={Math.round(PHONE_DURATION * PHONE_FPS)}
  />
  <Composition
    id="PhoneDemoMin"
    component={PhoneDemo}
    fps={PHONE_FPS}
    width={1080}
    height={1920}
    durationInFrames={Math.round(PHONE_DURATION * PHONE_FPS)}
    defaultProps={{ minimal: true }}
  />
  <Composition
    id="PhoneDemoDynamic"
    component={PhoneDemoDynamic}
    fps={PHONE_FPS}
    width={1080}
    height={1920}
    durationInFrames={Math.round(PHONE_DYN_DURATION * PHONE_FPS)}
  />
  <Composition
    id="PhoneDemoFx"
    component={PhoneDemoFx}
    fps={PHONE_FPS}
    width={1080}
    height={1920}
    durationInFrames={Math.round(PHONE_FX_DURATION * PHONE_FPS)}
  />
  <Composition
    id="GdpDemo"
    component={GdpDemo}
    fps={GDP_FPS}
    width={1080}
    height={1920}
    durationInFrames={Math.round(GDP_DURATION * GDP_FPS)}
  />
  <Composition
    id="Edit"
    component={Edit}
    fps={FPS}
    width={1080}
    height={1920}
    durationInFrames={1}
    defaultProps={defaultProps}
    calculateMetadata={({ props }) => ({
      width: props.width,
      height: props.height,
      durationInFrames: Math.max(1, Math.round((props.durationMs / 1000) * FPS)),
    })}
  />
  </>
);
