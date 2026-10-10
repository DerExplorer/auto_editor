import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, Loop, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { SOFT_TEXT_SHADOW } from "./Subtitles";
import { C, FONT_HEAD, FONT_TEXT } from "./theme";
import type { BRollContent, BRollItem, CardItem, Hook, Inset, OverlayItem, StickerItem, TitleItem } from "./types";

// Безопасные зоны (доли кадра), разметка — docs/safe-zones: по бокам 70 px, сверху и снизу по 250 px.
export const SAFE = { top: 250 / 1920, side: 70 / 1080, bottom: 250 / 1920 };
// 9% (173 px): ниже шапки Reels (117 px) и почти целиком ниже вкладок TikTok/Shorts (до 216 px)
export const DEFAULT_TOP = 0.09;
let TOP = DEFAULT_TOP;
// высота хука, карточек и плашек (layout.topPct)
export const setTopPct = (v: number) => {
  TOP = v;
};
const SIDE = `${SAFE.side * 100}%`;
const SOFT_SHADOW = "0 18px 60px rgba(0,0,0,0.45), 0 4px 16px rgba(0,0,0,0.2)";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const pill = 999;

const useBase = () => {
  const { width, height } = useVideoConfig();
  return Math.min(width, height);
};
const useInOut = (durationMs: number, outFrames = 6) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = Math.round((durationMs / 1000) * fps);
  const enter = spring({ frame, fps, config: { damping: 15, mass: 0.7 } });
  const exit = interpolate(frame, [dur - outFrames, dur], [1, 0], clamp);
  return { frame, fps, enter, exit };
};

// ---------- Хук ----------

const HOOK_SIZE = { s: 0.062, m: 0.085, l: 0.108, xl: 0.15 };

export const HookTitle: React.FC<{ hook: Hook }> = ({ hook }) => {
  const base = useBase();
  const { height } = useVideoConfig();
  const { frame, fps, exit } = useInOut(hook.durationMs, 8);
  const hookTop = hook.topPct ?? TOP;
  const lines: { w: Hook["words"][number]; i: number }[][] = [[]];
  hook.words.forEach((w, i) => {
    if (w.br && lines[lines.length - 1].length) lines.push([]);
    lines[lines.length - 1].push({ w, i });
  });
  return (
    <AbsoluteFill>
      {hookTop <= 0.1 ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: "36%", background: `linear-gradient(180deg, ${C.shade(0.55)}, ${C.shade(0)})`, opacity: exit }} />
      ) : (
        // хук в середине кадра: тёмная полоса для читаемости
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: height * (hookTop - 0.06),
            height: height * 0.36,
            background: `linear-gradient(180deg, ${C.shade(0)}, ${C.shade(0.55)} 25%, ${C.shade(0.55)} 75%, ${C.shade(0)})`,
            opacity: exit,
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          top: height * hookTop,
          left: SIDE,
          right: SIDE,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: base * 0.012,
          opacity: exit,
          transform: `translateY(${(1 - exit) * -base * 0.06}px)`,
        }}
      >
        {lines.map((line, li) => (
          <div key={li} style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: base * 0.02 }}>
            {line.map(({ w, i }) => {
              // первое слово видно сразу, остальные въезжают по очереди
              const p = i === 0 ? 1 : spring({ frame: frame - i * 4, fps, config: { damping: 13, mass: 0.6 } });
              const fontSize = base * HOOK_SIZE[w.size];
              return (
                <span
                  key={i}
                  style={{
                    fontFamily: FONT_HEAD,
                    fontWeight: 900,
                    fontSize,
                    lineHeight: 0.95,
                    letterSpacing: "-0.03em",
                    textTransform: "uppercase",
                    opacity: Math.min(1, p * 1.5),
                    transform: `translateY(${(1 - p) * -fontSize * 0.9}px) ${w.accent ? "rotate(-3deg)" : ""}`,
                    ...(w.accent
                      ? { color: C.onAccent, background: C.accent, borderRadius: pill, padding: `${fontSize * 0.06}px ${fontSize * 0.26}px ${fontSize * 0.1}px`, boxShadow: SOFT_SHADOW }
                      : { color: "white", textShadow: SOFT_TEXT_SHADOW }),
                  }}
                >
                  {w.text}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ---------- Нижний градиент ----------

export const BottomGradient: React.FC<{ heightPct: number; opacity: number }> = ({ heightPct, opacity }) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: `${heightPct * 100}%`,
      background: `linear-gradient(180deg, ${C.shade(0)} 0%, ${C.shade(opacity * 0.45)} 45%, ${C.shade(opacity)} 100%)`,
    }}
  />
);

// ---------- Плашка ----------

export const TitlePlate: React.FC<{ item: TitleItem }> = ({ item }) => {
  const base = useBase();
  const { height } = useVideoConfig();
  const { enter, exit } = useInOut(item.outToMs - item.outFromMs);
  const top = height * (item.topPct ?? (item.position === "top" ? TOP + 0.03 : 0.5));
  return (
    <div style={{ position: "absolute", left: SIDE, right: SIDE, top, display: "flex", justifyContent: "center" }}>
      <div
        style={{
          fontFamily: FONT_HEAD,
          fontWeight: 800,
          fontSize: base * 0.054,
          lineHeight: 1.1,
          color: C.onAccent,
          background: C.accent,
          padding: `${base * 0.012}px ${base * 0.036}px ${base * 0.018}px`,
          borderRadius: pill,
          textAlign: "center",
          textWrap: "balance",
          boxShadow: SOFT_SHADOW,
          opacity: exit,
          transform: `translateY(${(1 - enter) * -base * 0.05}px) scale(${0.8 + 0.2 * enter}) rotate(-3deg)`,
        }}
      >
        {item.text}
      </div>
    </div>
  );
};

// ---------- Карточка вопроса ----------

export const QuizCard: React.FC<{ card: CardItem }> = ({ card }) => {
  const base = useBase();
  const { height } = useVideoConfig();
  const { frame, fps, enter, exit } = useInOut(card.outToMs - card.outFromMs);
  const ansFrame = card.answerOutMs != null ? Math.round(((card.answerOutMs - card.outFromMs) / 1000) * fps) : Infinity;
  const ansP = frame >= ansFrame ? spring({ frame: frame - ansFrame, fps, config: { damping: 13 } }) : 0;

  return (
    <div style={{ position: "absolute", top: height * TOP, left: SIDE, right: SIDE }}>
      <div
        style={{
          boxSizing: "border-box",
          fontFamily: FONT_TEXT,
          background: C.shade(0.8),
          borderRadius: base * 0.05,
          padding: `${base * 0.024}px ${base * 0.028}px`,
          boxShadow: SOFT_SHADOW,
          opacity: Math.min(enter, exit),
          transform: `translateY(${(1 - enter) * -base * 0.06}px)`,
        }}
      >
        <div
          style={{
            display: "inline-block",
            background: C.accent,
            color: C.onAccent,
            fontWeight: 800,
            fontSize: base * 0.025,
            letterSpacing: "0.08em",
            padding: `${base * 0.005}px ${base * 0.02}px ${base * 0.007}px`,
            borderRadius: pill,
          }}
        >
          {card.title.toUpperCase()}
        </div>
        <div style={{ color: C.paper, fontWeight: 700, fontSize: base * 0.036, lineHeight: 1.18, margin: `${base * 0.011}px 0 ${base * 0.014}px`, textWrap: "balance" }}>
          {card.question}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: base * 0.012 }}>
          {card.options.map((o, i) => {
            const correct = i === card.answer;
            const appear = spring({ frame: frame - 4 - i * 3, fps, config: { damping: 15 } });
            const lit = correct ? ansP : 0;
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: base * 0.012,
                  padding: `${base * 0.008}px ${base * 0.022}px ${base * 0.01}px`,
                  borderRadius: pill,
                  background: lit > 0.5 ? C.accent : "rgba(255,255,255,0.12)",
                  color: lit > 0.5 ? C.onAccent : C.paper,
                  fontSize: base * 0.032,
                  fontWeight: 600,
                  boxShadow: lit > 0.5 ? "0 8px 26px rgba(0,0,0,0.35)" : "none",
                  opacity: appear * (correct ? 1 : 1 - 0.55 * ansP),
                  transform: `translateY(${(1 - appear) * -base * 0.02}px) scale(${1 + 0.06 * lit})`,
                }}
              >
                <b style={{ fontWeight: 800, color: lit > 0.5 ? C.onAccent : C.highlight }}>{"АБВГД"[i]}</b>
                {o}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ---------- Инфографика (B-roll) ----------

const Bars: React.FC<{ c: Extract<BRollContent, { kind: "bars" }>; size: number }> = ({ c, size }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const max = Math.max(...c.bars.map((b) => b.value));
  const u = size / 100;
  return (
    <div style={{ width: "100%", height: "100%", boxSizing: "border-box", background: C.bg, padding: 9 * u, display: "flex", flexDirection: "column", fontFamily: FONT_TEXT }}>
      <div style={{ fontFamily: FONT_HEAD, fontWeight: 800, fontSize: 12 * u, lineHeight: 1, color: C.ink, letterSpacing: "-0.02em" }}>{c.title}</div>
      {c.subtitle && <div style={{ fontSize: 7 * u, color: C.muted, marginTop: 1.5 * u }}>{c.subtitle}</div>}
      <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 7 * u, marginTop: 4 * u }}>
        {c.bars.map((b, i) => {
          const g = spring({ frame: frame - 3 - i * 5, fps, config: { damping: 16 } });
          const last = i === c.bars.length - 1;
          return (
            <div key={i} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
              {last && c.badge && (
                <div style={{ fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 16 * u, color: C.ink, marginBottom: 1.5 * u, letterSpacing: "-0.03em", opacity: g }}>{c.badge}</div>
              )}
              <div style={{ width: "100%", height: `${(b.value / max) * 58 * g}%`, background: last ? C.accent : C.grey, borderRadius: 6 * u }} />
              <div style={{ fontSize: 8.5 * u, fontWeight: 600, color: C.text, marginTop: 2 * u, whiteSpace: "nowrap" }}>{b.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Полноэкранная инфографика: смысл выше нижней трети, там субтитры.
const Ring: React.FC<{ c: Extract<BRollContent, { kind: "ring" }> }> = ({ c }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const base = Math.min(width, height);
  const g = spring({ frame: frame - 4, fps, config: { damping: 20, mass: 1.2 } });
  const r = base * 0.27;
  const sw = base * 0.07;
  const circ = 2 * Math.PI * r;
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: FONT_TEXT, overflow: "hidden" }}>
      <div style={{ position: "absolute", right: -base * 0.45, bottom: -base * 0.35, width: base * 1.2, height: base * 1.2, borderRadius: "50%", background: C.blob }} />
      <div style={{ position: "absolute", top: height * 0.08, left: SIDE, right: SIDE, display: "flex", flexDirection: "column", alignItems: "center" }}>
        {c.chip && (
          <div style={{ background: C.accent, color: C.onAccent, fontWeight: 800, fontSize: base * 0.034, letterSpacing: "0.08em", padding: `${base * 0.008}px ${base * 0.03}px ${base * 0.011}px`, borderRadius: pill, boxShadow: "0 8px 26px rgba(0,0,0,0.12)" }}>
            {c.chip.toUpperCase()}
          </div>
        )}
        <div style={{ position: "relative", width: 2 * r + sw, height: 2 * r + sw, marginTop: height * 0.04, filter: "drop-shadow(0 12px 28px rgba(0,0,0,0.12))" }}>
          <svg width={2 * r + sw} height={2 * r + sw} style={{ position: "absolute", inset: 0 }}>
            <circle cx={r + sw / 2} cy={r + sw / 2} r={r} fill="none" stroke={C.grey} strokeWidth={sw} />
            <circle
              cx={r + sw / 2}
              cy={r + sw / 2}
              r={r}
              fill="none"
              stroke={C.accent}
              strokeWidth={sw}
              strokeLinecap="round"
              strokeDasharray={`${(circ * c.value * g) / 100} ${circ}`}
              transform={`rotate(-90 ${r + sw / 2} ${r + sw / 2})`}
            />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_HEAD, fontWeight: 900, fontSize: base * 0.2, letterSpacing: "-0.05em", color: C.ink }}>
            {Math.round(c.value * g)}%
          </div>
        </div>
        <div style={{ marginTop: height * 0.035, width: "92%", textAlign: "center", fontFamily: FONT_HEAD, fontWeight: 500, fontSize: base * 0.064, lineHeight: 1.05, letterSpacing: "-0.02em", color: C.ink, textWrap: "balance" }}>
          {c.caption}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const BRoll: React.FC<{ item: BRollItem }> = ({ item }) => {
  const { width, height, fps } = useVideoConfig();
  const base = useBase();
  const { enter, exit } = useInOut(item.outToMs - item.outFromMs, 5);
  const c = item.content;

  if (item.mode === "full") {
    const e = interpolate(enter, [0, 1], [0, 1], { easing: Easing.out(Easing.cubic) });
    // с фоном файл встаёт целиком в центр (скруглённая карточка с тенью), без фона — на весь экран
    const contain = item.fit === "contain" || (item.bg && item.fit !== "cover");
    const fileStyle: React.CSSProperties = contain
      ? { width: "100%", height: "100%", objectFit: "contain" }
      : { width: "100%", height: "100%", objectFit: "cover" };
    const media =
      c.kind === "video" ? (
        <OffthreadVideo src={staticFile(c.src)} muted style={fileStyle} />
      ) : c.kind === "image" ? (
        <Img src={staticFile(c.src)} style={fileStyle} />
      ) : c.kind === "ring" ? (
        <Ring c={c} />
      ) : (
        <Bars c={c} size={item.bg ? width - 2 * SAFE.side * width : width} />
      );
    const bg = item.bg ? (
      <AbsoluteFill>
        {item.bg.kind === "video" ? (
          // короткие фоны (деньги ~3 с) зацикливаются
          <Loop durationInFrames={Math.max(1, Math.round(((item.bg.durationMs ?? 60000) / 1000) * fps))}>
            <OffthreadVideo src={staticFile(item.bg.src)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </Loop>
        ) : (
          <Img src={staticFile(item.bg.src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        )}
      </AbsoluteFill>
    ) : null;
    const isFile = c.kind === "video" || c.kind === "image";
    return (
      <AbsoluteFill style={{ opacity: Math.min(e, exit), transform: `scale(${1.03 - 0.03 * e})` }}>
        {bg}
        {bg && isFile ? (
          // смысл — выше нижней трети (там субтитры)
          <div style={{ position: "absolute", left: SIDE, right: SIDE, top: height * 0.14, height: height * 0.5, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: base * 0.04, overflow: "hidden", boxShadow: SOFT_SHADOW, display: "flex" }}>{media}</div>
          </div>
        ) : bg ? (
          // инфографика — светлой карточкой поверх фона
          <div style={{ position: "absolute", left: SIDE, right: SIDE, top: height * 0.12, height: height * 0.52, borderRadius: base * 0.05, overflow: "hidden", boxShadow: SOFT_SHADOW }}>{media}</div>
        ) : (
          media
        )}
      </AbsoluteFill>
    );
  }

  // pip — слева от лица
  const size = base * 0.25;
  const media =
    c.kind === "video" ? (
      <OffthreadVideo src={staticFile(c.src)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    ) : c.kind === "image" ? (
      <Img src={staticFile(c.src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    ) : c.kind === "bars" ? (
      <Bars c={c} size={size} />
    ) : (
      <Ring c={c} />
    );
  return (
    <div
      style={{
        position: "absolute",
        top: height * 0.32,
        left: SIDE,
        width: size,
        height: size * 1.15,
        borderRadius: base * 0.05,
        overflow: "hidden",
        boxShadow: SOFT_SHADOW,
        opacity: exit,
        transform: `scale(${enter}) rotate(${-3 - (1 - enter) * 6}deg)`,
        transformOrigin: "left center",
      }}
    >
      {media}
    </div>
  );
};

// ---------- Видео в рамке ----------

export const InsetVideo: React.FC<{ inset: Inset }> = ({ inset }) => {
  const { width, height, fps } = useVideoConfig();
  const base = useBase();
  const { enter, exit } = useInOut(inset.outToMs - inset.outFromMs, 8);
  const f = (ms: number) => Math.round((ms / 1000) * fps);
  const w = width * inset.widthPct;
  const border = base * 0.018;
  const h = (w - 2 * border) / inset.aspect + 2 * border;
  return (
    <div
      style={{
        position: "absolute",
        left: (width - w) / 2,
        top: height * inset.topPct,
        width: w,
        height: h,
        boxSizing: "border-box",
        border: `${border}px solid ${inset.borderColor}`,
        borderRadius: base * 0.05,
        overflow: "hidden",
        background: C.ink,
        boxShadow: SOFT_SHADOW,
        opacity: Math.min(1, enter * 1.5) * exit,
        transform: `scale(${(0.85 + 0.15 * enter) * (0.9 + 0.1 * exit)})`,
      }}
    >
      {inset.pieces.map((p, i) => (
        <Sequence key={i} from={f(p.outFromMs - inset.outFromMs)} durationInFrames={Math.max(1, f(p.outToMs) - f(p.outFromMs))}>
          <OffthreadVideo src={staticFile(p.src)} trimBefore={f(p.srcFromMs)} volume={inset.volume} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: base * 0.04 }} />
        </Sequence>
      ))}
    </div>
  );
};

// ---------- Оверлей ----------

// Огонь, искры, стекло на чёрном фоне: режим screen убирает чёрное. Плавное появление и уход.
export const Overlay: React.FC<{ item: OverlayItem }> = ({ item }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = Math.round(((item.outToMs - item.outFromMs) / 1000) * fps);
  const fade = Math.min(6, Math.floor(dur / 3));
  const o = interpolate(frame, [0, fade, dur - fade, dur], [0, 1, 1, 0], clamp) * item.opacity;
  return (
    <AbsoluteFill style={{ mixBlendMode: "screen", opacity: o, pointerEvents: "none" }}>
      <OffthreadVideo src={staticFile(item.src)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </AbsoluteFill>
  );
};

// ---------- Стикер ----------

// Анимированный стикер сбоку от лица: выпрыгивает с лёгким наклоном и плавно уходит.
export const Sticker: React.FC<{ item: StickerItem }> = ({ item }) => {
  const { width, height } = useVideoConfig();
  const { enter, exit } = useInOut(item.outToMs - item.outFromMs, 5);
  const size = width * item.size;
  const s = Math.min(enter, 1) * exit;
  return (
    <div
      style={{
        position: "absolute",
        top: height * item.y - size / 2,
        [item.side]: SIDE,
        width: size,
        height: size,
        transform: `scale(${0.4 + 0.6 * s}) rotate(${(item.side === "left" ? -1 : 1) * (8 - 8 * Math.min(enter, 1))}deg)`,
        opacity: Math.min(1, s * 1.5),
        filter: "drop-shadow(0 12px 28px rgba(0,0,0,0.35))",
      }}
    >
      <OffthreadVideo src={staticFile(item.src)} muted transparent style={{ width: "100%", height: "100%" }} />
    </div>
  );
};
