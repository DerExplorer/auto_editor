import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, OffthreadVideo, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { SOFT_TEXT_SHADOW } from "./Subtitles";
import { C, FONT_HEAD, FONT_TEXT } from "./theme";
import type { BRollContent, BRollItem, CardItem, Hook, TitleItem } from "./types";

// Безопасные зоны Reels (app/docs/reels-safe-zones.webp), доли кадра 1080×1920:
// сверху/снизу по 250 px, по бокам 70 px, справа в нижней половине — колонка кнопок 170 px,
// над нижней зоной — полоса подписи. Лицо ≈ 0.25–0.62 по высоте не перекрываем.
export const SAFE = { top: 250 / 1920, side: 70 / 1080, bottom: 250 / 1920 };
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

// ---------- Заголовок-хук: слова разного размера въезжают сверху по одному ----------

const HOOK_SIZE = { s: 0.05, m: 0.072, l: 0.092, xl: 0.13 };

export const HookTitle: React.FC<{ hook: Hook }> = ({ hook }) => {
  const base = useBase();
  const { height } = useVideoConfig();
  const { frame, fps, exit } = useInOut(hook.durationMs, 8);
  const lines: { w: Hook["words"][number]; i: number }[][] = [[]];
  hook.words.forEach((w, i) => {
    if (w.br && lines[lines.length - 1].length) lines.push([]);
    lines[lines.length - 1].push({ w, i });
  });
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: "36%", background: `linear-gradient(180deg, ${C.shade(0.55)}, ${C.shade(0)})`, opacity: exit }} />
      <div
        style={{
          position: "absolute",
          top: height * SAFE.top,
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
              // Первое слово видно уже на первом кадре, остальные въезжают сверху с шагом ~130 мс.
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
                      ? { color: C.ink, background: C.amber, borderRadius: pill, padding: `${fontSize * 0.06}px ${fontSize * 0.26}px ${fontSize * 0.1}px`, boxShadow: SOFT_SHADOW }
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

// ---------- Нижний градиент под субтитры (не доходит до лица) ----------

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

// ---------- Плашка-акцент (янтарная, наклон −3°) ----------

export const TitlePlate: React.FC<{ item: TitleItem }> = ({ item }) => {
  const base = useBase();
  const { height } = useVideoConfig();
  const { enter, exit } = useInOut(item.outToMs - item.outFromMs);
  const top = item.position === "top" ? height * (SAFE.top + 0.01) : height * 0.5;
  return (
    <div style={{ position: "absolute", left: SIDE, right: SIDE, top, display: "flex", justifyContent: "center" }}>
      <div
        style={{
          fontFamily: FONT_HEAD,
          fontWeight: 800,
          fontSize: base * 0.054,
          lineHeight: 1.1,
          color: C.ink,
          background: C.amber,
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

// ---------- Карточка вопроса: компактная, в верхней безопасной зоне, варианты в одну строку ----------

export const QuizCard: React.FC<{ card: CardItem }> = ({ card }) => {
  const base = useBase();
  const { height } = useVideoConfig();
  const { frame, fps, enter, exit } = useInOut(card.outToMs - card.outFromMs);
  const ansFrame = card.answerOutMs != null ? Math.round(((card.answerOutMs - card.outFromMs) / 1000) * fps) : Infinity;
  const ansP = frame >= ansFrame ? spring({ frame: frame - ansFrame, fps, config: { damping: 13 } }) : 0;

  return (
    <div style={{ position: "absolute", top: height * SAFE.top, left: SIDE, right: SIDE }}>
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
            background: C.amber,
            color: C.ink,
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
                  background: lit > 0.5 ? C.amber : "rgba(255,255,255,0.12)",
                  color: lit > 0.5 ? C.ink : C.paper,
                  fontSize: base * 0.032,
                  fontWeight: 600,
                  boxShadow: lit > 0.5 ? "0 8px 26px rgba(0,0,0,0.35)" : "none",
                  opacity: appear * (correct ? 1 : 1 - 0.55 * ansP),
                  transform: `translateY(${(1 - appear) * -base * 0.02}px) scale(${1 + 0.06 * lit})`,
                }}
              >
                <b style={{ fontWeight: 800, color: lit > 0.5 ? C.ink : C.amber }}>{"АБВГД"[i]}</b>
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
              <div style={{ width: "100%", height: `${(b.value / max) * 58 * g}%`, background: last ? C.amber : C.grey, borderRadius: 6 * u }} />
              <div style={{ fontSize: 8.5 * u, fontWeight: 600, color: C.text, marginTop: 2 * u, whiteSpace: "nowrap" }}>{b.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Кольцо-процент на панели W×H (панель — скруглённая карточка в безопасной зоне над субтитрами).
const Ring: React.FC<{ c: Extract<BRollContent, { kind: "ring" }>; W: number; H: number }> = ({ c, W, H }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const g = spring({ frame: frame - 4, fps, config: { damping: 20, mass: 1.2 } });
  const r = Math.min(W * 0.28, H * 0.24);
  const sw = r * 0.26;
  const circ = 2 * Math.PI * r;
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: FONT_TEXT, overflow: "hidden", justifyContent: "center", alignItems: "center", gap: H * 0.035 }}>
      <div style={{ position: "absolute", right: -W * 0.4, bottom: -W * 0.45, width: W * 1.1, height: W * 1.1, borderRadius: "50%", background: C.blob }} />
      {c.chip && (
        <div style={{ position: "relative", background: C.amber, color: C.ink, fontWeight: 800, fontSize: W * 0.04, letterSpacing: "0.08em", padding: `${W * 0.01}px ${W * 0.035}px ${W * 0.013}px`, borderRadius: pill }}>
          {c.chip.toUpperCase()}
        </div>
      )}
      <div style={{ position: "relative", width: 2 * r + sw, height: 2 * r + sw, filter: "drop-shadow(0 10px 24px rgba(0,0,0,0.12))" }}>
        <svg width={2 * r + sw} height={2 * r + sw} style={{ position: "absolute", inset: 0 }}>
          <circle cx={r + sw / 2} cy={r + sw / 2} r={r} fill="none" stroke={C.grey} strokeWidth={sw} />
          <circle
            cx={r + sw / 2}
            cy={r + sw / 2}
            r={r}
            fill="none"
            stroke={C.amber}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={`${(circ * c.value * g) / 100} ${circ}`}
            transform={`rotate(-90 ${r + sw / 2} ${r + sw / 2})`}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_HEAD, fontWeight: 900, fontSize: r * 0.72, letterSpacing: "-0.05em", color: C.ink }}>
          {Math.round(c.value * g)}%
        </div>
      </div>
      <div style={{ position: "relative", width: "82%", textAlign: "center", fontFamily: FONT_HEAD, fontWeight: 500, fontSize: W * 0.07, lineHeight: 1.05, letterSpacing: "-0.02em", color: C.ink, textWrap: "balance" }}>
        {c.caption}
      </div>
    </AbsoluteFill>
  );
};

export const BRoll: React.FC<{ item: BRollItem }> = ({ item }) => {
  const { width, height } = useVideoConfig();
  const base = useBase();
  const { enter, exit } = useInOut(item.outToMs - item.outFromMs, 5);
  const c = item.content;

  if (item.mode === "full") {
    // Скруглённая панель в безопасной зоне: сверху 250 px, по бокам 70 px, снизу — до субтитров.
    const W = width * (1 - 2 * SAFE.side);
    const H = height * (0.66 - SAFE.top);
    const e = interpolate(enter, [0, 1], [0, 1], { easing: Easing.out(Easing.cubic) });
    const media =
      c.kind === "video" ? (
        <OffthreadVideo src={staticFile(c.src)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : c.kind === "image" ? (
        <Img src={staticFile(c.src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : c.kind === "ring" ? (
        <Ring c={c} W={W} H={H} />
      ) : (
        <Bars c={c} size={W} />
      );
    return (
      <AbsoluteFill style={{ opacity: Math.min(e, exit) }}>
        <AbsoluteFill style={{ background: C.shade(0.55) }} />
        <div
          style={{
            position: "absolute",
            left: SIDE,
            top: height * SAFE.top,
            width: W,
            height: H,
            borderRadius: base * 0.06,
            overflow: "hidden",
            boxShadow: SOFT_SHADOW,
            transform: `translateY(${(1 - e) * base * 0.05}px) scale(${0.96 + 0.04 * e})`,
          }}
        >
          {media}
        </div>
      </AbsoluteFill>
    );
  }

  // pip — слева от лица, между карточками сверху и субтитрами снизу.
  const size = base * 0.25;
  const media =
    c.kind === "video" ? (
      <OffthreadVideo src={staticFile(c.src)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    ) : c.kind === "image" ? (
      <Img src={staticFile(c.src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    ) : c.kind === "bars" ? (
      <Bars c={c} size={size} />
    ) : (
      <Ring c={c} W={size} H={size * 1.15} />
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

// ---------- Прогресс-бар ----------

export const ProgressBar: React.FC<{ position: "top" | "bottom" }> = ({ position }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const base = useBase();
  const h = Math.max(4, Math.round(base * 0.007));
  return (
    <div style={{ position: "absolute", left: 0, right: 0, [position]: 0, height: h, background: "rgba(255,255,255,0.18)" }}>
      <div style={{ width: `${(frame / Math.max(1, durationInFrames - 1)) * 100}%`, height: "100%", background: C.amber }} />
    </div>
  );
};
