import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, colorOf, FONT_HEAD, fontOf } from "./theme";
import { centerX, measure, useFontsReady } from "./textLayout";
import type { ClientStyle, Span } from "./types";

// Блоки готовит scripts/subs.mjs.
export type SubWord = { text: string; startMs: number; endMs: number } | { br: true };
export type SubBlock = { kind: "text" | "number"; number?: string; words: SubWord[]; fromMs: number; toMs: number };
// zones — участки с другой высотой субтитров (например, под рамкой)
export type SubtitleStyle = { bottomPct: number; maxWidthPct: number; blocks: SubBlock[]; zones?: { outFromMs: number; outToMs: number; bottomPct: number }[] };

// Короткий предлог или союз не остаётся в конце строки: склеиваем его со следующим словом.
const SHORT = new Set("в во и а на о об с со к ко у по за из от до не ни но же ли бы для что как при без".split(" "));
const glue = (words: SubWord[]): SubWord[][] => {
  const out: SubWord[][] = [];
  let cur: SubWord[] = [];
  words.forEach((w, i) => {
    if ("br" in w) {
      if (cur.length) out.push(cur);
      out.push([w]);
      cur = [];
      return;
    }
    cur.push(w);
    const next = words[i + 1];
    const short = SHORT.has(w.text.toLowerCase().replace(/[^\p{L}]/gu, ""));
    if (!(short && next && !("br" in next))) {
      out.push(cur);
      cur = [];
    }
  });
  if (cur.length) out.push(cur);
  return out;
};

export const SOFT_TEXT_SHADOW = "0 4px 28px rgba(0,0,0,0.55), 0 1px 4px rgba(0,0,0,0.35)";

type Word = Exclude<SubWord, { br: true }>;
type WordMode = NonNullable<ClientStyle["subtitles"]>;

// Короткие фразы для субтитров «по слову» (правка 11.10): короткое незначимое слово не идёт отдельным кадром,
// а держится вместе с соседним — «бы он», «не заплатил», «вообще за». В текстовом слое фразы задаются «/»
// («сколько / бы он / не заплатил»); без «/» строка делится сама: до 2 слов и ~13 знаков, два значимых слова — раздельно.
// Число — всегда отдельно (своим шрифтом).
const isLight = (t: string) => SHORT.has(t.toLowerCase().replace(/[^\p{L}]/gu, "")) || t.replace(/[^\p{L}\p{N}]/gu, "").length <= 3;
const chunks = (ws: SubWord[]): (Word & { parts: Part[] })[] => {
  const groups: Word[][] = [[]];
  for (const w of ws) if ("br" in w) groups.push([]); else groups[groups.length - 1].push(w);
  const out: Word[][] = [];
  for (const g of groups.filter((x) => x.length)) {
    const len = (c: Word[]) => c.reduce((n, w) => n + w.text.length + 1, 0);
    // фраза из текстового слоя (через «/») короткая — оставляем как есть
    if (g.length <= 3 && len(g) <= 17 && !g.some((w) => /\d/.test(w.text))) {
      out.push(g);
      continue;
    }
    let cur: Word[] = [];
    for (const w of g) {
      const last = cur[cur.length - 1];
      const close = cur.length && (/\d/.test(w.text) || /\d/.test(last.text) || cur.length >= 2 || len(cur) + w.text.length > 13 || (!isLight(last.text) && !isLight(w.text)));
      if (close) (out.push(cur), (cur = []));
      cur.push(w);
    }
    if (cur.length) out.push(cur);
  }
  return out.map((c) => ({ text: c.map((w) => w.text).join(" "), startMs: c[0].startMs, endMs: c[c.length - 1].endMs, parts: c.map(partOf) }));
};

// Вид слова в субтитрах (разнообразие, правка 11.10): CAPS в текстовом слое — ключевое слово (жёлтым широким, как акцент
// заголовков), «~слово» — мягкое разговорное слово жёлтым скриптом, число — своим шрифтом, остальное — белые заглавные.
// atMs — когда слово сказано: внутри фразы слова появляются по мере речи, место под фразу занято сразу (правка 11.10)
type Part = { text: string; look: "base" | "accent" | "script" | "number"; atMs?: number };
const partOf = (w: Word): Part => ({ ...lookOf(w), atMs: w.startMs });
const lookOf = (w: Word): Part => {
  const raw = w.text.replace(/[.,!?;:«»"()…]+/g, "");
  if (raw.startsWith("~")) return { text: raw.slice(1), look: "script" };
  if (/\d/.test(raw)) return { text: raw, look: "number" };
  const letters = raw.replace(/[^\p{L}]/gu, "");
  if (letters.length >= 2 && letters === letters.toUpperCase()) return { text: raw, look: "accent" };
  return { text: raw, look: "base" };
};

// Стиль клиента "word": на экране одно текущее слово (или короткая фраза). Цифры и цены — своим шрифтом и цветом.
// Место — зона субтитров в нижней трети (textLayout.ts), по центру кадра; лесенкой — только копящиеся заголовки.
// Пока идёт заголовок (hide), слово не показываем — заголовок и есть подпись.
const WordSubtitles: React.FC<{ style: SubtitleStyle; mode: WordMode; hide: Span[] }> = ({ style, mode, hide }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const nowMs = (frame / fps) * 1000;
  useFontsReady([mode, mode.numbers, mode.listNumber, mode.accent, mode.script].filter((t): t is NonNullable<typeof t> => !!t), Math.min(width, height));
  if (mode.hideUnderTitles && hide.some((h) => nowMs >= h.outFromMs && nowMs < h.outToMs)) return null;

  // номер пункта списка ([3] третье) — отдельным словом-цифрой (listNumber), до заголовка своего пункта;
  // остальное — короткими цельными фразами (chunks): «бы он», «не заплатил», «свой номер»
  type Chunk = Word & { list?: boolean; block: number; parts: Part[] };
  const words: Chunk[] = style.blocks.flatMap((b, bi): Chunk[] =>
    b.kind === "number"
      ? [{ text: b.number ?? "", startMs: b.fromMs, endMs: b.toMs, list: true, block: bi, parts: [{ text: b.number ?? "", look: "number" as const }] }]
      : chunks(b.words).map((w) => ({ ...w, block: bi })),
  );
  let i = -1;
  for (let k = 0; k < words.length && words[k].startMs <= nowMs; k++) i = k;
  const w = words[i];
  // слово держится до следующего, но не висит в долгой паузе
  if (!w || nowMs >= Math.min(words[i + 1]?.startMs ?? Infinity, w.endMs + 500)) return null;

  const base = Math.min(width, height);
  const styleOf = (p: Part) =>
    w.list && mode.listNumber ? mode.listNumber : p.look === "number" && mode.numbers ? mode.numbers : p.look === "accent" && mode.accent ? mode.accent : p.look === "script" && mode.script ? mode.script : mode;
  const shown = (p: Part) => (p.look === "script" ? p.text.toLowerCase() : p.text.toUpperCase());
  const gap = base * 0.02;
  const total = w.parts.reduce((n, p, k) => n + measure(shown(p), styleOf(p), base, false) + (k ? gap : 0), 0);
  const pop = spring({ frame: frame - Math.round((w.startMs / 1000) * fps), fps, config: { damping: 18, mass: 0.4 } });
  // слова по одному и номер пункта — по центру кадра, не прыгают в стороны (правка 11.10)
  const pos = centerX(total, width);
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: pos.x,
          top: height * mode.centerPct,
          transform: `translateY(-50%) scale(${pos.scale * (0.94 + 0.06 * pop)})`,
          transformOrigin: pos.scale < 1 ? "0 50%" : "50% 50%",
          display: "flex",
          alignItems: "baseline",
          columnGap: gap,
          lineHeight: 1,
          textShadow: SOFT_TEXT_SHADOW,
          whiteSpace: "nowrap",
        }}
      >
        {w.parts.map((p, k) => {
          const look = styleOf(p);
          return (
            <span
              key={k}
              style={{
                visibility: nowMs >= (p.atMs ?? 0) ? "visible" : "hidden",
                fontFamily: fontOf(look.font),
                fontSize: base * look.sizePct,
                color: colorOf(look.color),
                ...(look.stroke ? { WebkitTextStroke: `${look.stroke}em ${colorOf(look.color)}`, paintOrder: "stroke fill" } : {}),
              }}
            >
              {shown(p)}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// До 2 строк, текущее слово янтарное; нумерация — большая цифра.
// hookUntilMs: пока идёт хук (слова копятся в центре), нижние субтитры не показываем — они начинаются после него.
export const Subtitles: React.FC<{ style: SubtitleStyle; client?: ClientStyle["subtitles"]; hide?: Span[]; hookUntilMs?: number }> = ({ style, client, hide = [], hookUntilMs = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if ((frame / fps) * 1000 < hookUntilMs) return null;
  if (client?.mode === "word") return <WordSubtitles style={style} mode={client} hide={hide} />;
  return <BlockSubtitles style={style} />;
};

const BlockSubtitles: React.FC<{ style: SubtitleStyle }> = ({ style }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const nowMs = (frame / fps) * 1000;
  const block = style.blocks.find((b) => nowMs >= b.fromMs && nowMs < b.toMs);
  if (!block) return null;

  const base = Math.min(width, height);
  const pop = spring({ frame: frame - Math.round((block.fromMs / 1000) * fps), fps, config: { damping: 14, mass: 0.5 } });
  const zone = style.zones?.find((z) => block.fromMs >= z.outFromMs && block.fromMs < z.outToMs);
  const box: React.CSSProperties = { justifyContent: "flex-end", alignItems: "center", paddingBottom: height * (zone?.bottomPct ?? style.bottomPct) };

  if (block.kind === "number") {
    return (
      <AbsoluteFill style={box}>
        <div
          style={{
            fontFamily: FONT_HEAD,
            fontWeight: 900,
            fontSize: base * 0.21,
            lineHeight: 0.85,
            letterSpacing: "-0.05em",
            color: C.highlight,
            textShadow: SOFT_TEXT_SHADOW,
            transform: `scale(${0.5 + 0.5 * pop}) rotate(${(1 - pop) * -8}deg)`,
            opacity: Math.min(1, pop * 2),
          }}
        >
          {block.number}
        </div>
      </AbsoluteFill>
    );
  }

  const spoken = block.words.filter((w): w is Exclude<SubWord, { br: true }> => !("br" in w));
  const active = [...spoken].reverse().find((w) => nowMs >= w.startMs);
  return (
    <AbsoluteFill style={box}>
      <div
        style={{
          fontFamily: FONT_HEAD,
          fontWeight: 800,
          fontSize: base * 0.064,
          lineHeight: 1.08,
          letterSpacing: "-0.01em",
          color: "white",
          textShadow: SOFT_TEXT_SHADOW,
          textAlign: "center",
          textWrap: "balance",
          maxWidth: width * style.maxWidthPct,
          transform: `scale(${0.92 + 0.08 * pop})`,
        }}
      >
        {glue(block.words).map((group, gi) =>
          group[0] && "br" in group[0] ? (
            <br key={gi} />
          ) : (
            // обычный пробел снаружи группы, чтобы строка переносилась
            <React.Fragment key={gi}>
              <span style={{ whiteSpace: "nowrap" }}>
              {(group as Exclude<SubWord, { br: true }>[]).map((w, i) => (
                <span key={i} style={{ color: w === active ? C.highlight : "white" }}>
                  {w.text}
                  {i < group.length - 1 ? " " : ""}
                </span>
              ))}
              </span>{" "}
            </React.Fragment>
          ),
        )}
      </div>
    </AbsoluteFill>
  );
};
