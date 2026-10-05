import React from "react";
import { Composition } from "remotion";
import { Edit } from "./Edit";
import type { EditProps } from "./types";

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
  layout: { topPct: 0.05 },
  music: null,
  sfx: [],
  inset: null,
  bottomGradient: null,
  subtitles: { bottomPct: 0.24, maxWidthPct: 0.69, blocks: [] },
};

export const Root: React.FC = () => (
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
);
