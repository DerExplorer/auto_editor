// Сборка монтажа по edit-файлу:
//   транскрибация (с кэшем) → авто-нарезка (паузы, дубли/оговорки) + ручные вырезы и секции →
//   раскладка на выходной таймлайн → props для каждой версии → (опц.) рендер.
// Все таймкоды в edit-файле — в исходном времени клипа (мс или привязка к фразе),
// скрипт сам пересчитывает их в выходное время после вырезов.
// Папки: MVPMON/rare — исходники, MVPMON/out — готовые ролики, MVPMON/app — всё техническое.
// Использование (из app/): node scripts/build.mjs edits/<name>.json [--render] [--only=<version>]
import { execFileSync, execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loudness, makeIntensity, planCamera } from "./camera.mjs";
import { buildBlocks, draftSubs } from "./subs.mjs";
import { pythonCmd, requireTools } from "./tools.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(APP, "..");
const RARE = path.join(ROOT, "rare");
const OUT = process.env.AUTO_EDITOR_OUT ? path.resolve(process.env.AUTO_EDITOR_OUT) : path.join(ROOT, "out");
const CWD = process.cwd();
process.chdir(APP);
requireTools();

const FPS = 30;
const argv = process.argv.slice(2);
const editPath = argv.find((a) => !a.startsWith("--"));
if (!editPath) {
  console.error("Usage: node scripts/build.mjs <edit.json> [--render] [--only=<version>]");
  process.exit(1);
}
const doRender = argv.includes("--render");
const only = argv.find((a) => a.startsWith("--only="))?.slice(7);

const baseEdit = JSON.parse(fs.readFileSync([path.resolve(CWD, editPath), path.resolve(APP, editPath)].find((x) => fs.existsSync(x)) ?? editPath, "utf-8"));
const name = baseEdit.name ?? path.basename(editPath, ".json");

// ---------- анализ исходников ----------

const probe = (file) => {
  const j = JSON.parse(
    execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", file]),
  );
  return { width: j.streams[0].width, height: j.streams[0].height, durationMs: Math.round(parseFloat(j.format.duration) * 1000) };
};

const transcribe = (file) => {
  const st = fs.statSync(file);
  // Ключ кэша — по содержимому (размер + хэш первых 4 МБ), а не по дате: переносится между машинами.
  const fd = fs.openSync(file, "r");
  const head = Buffer.alloc(Math.min(st.size, 4 << 20));
  fs.readSync(fd, head, 0, head.length, 0);
  fs.closeSync(fd);
  const hash = crypto.createHash("sha1").update(head).digest("hex").slice(0, 10);
  const cache = path.join("build", "cache", `${path.basename(file)}-${st.size}-${hash}.json`);
  if (!fs.existsSync(cache)) {
    console.log(`  транскрибация ${file}...`);
    const py = pythonCmd();
    execFileSync(py.cmd, [...py.pre, path.join("scripts", "transcribe.py"), file, cache], { stdio: "inherit" });
  }
  return JSON.parse(fs.readFileSync(cache, "utf-8"));
};

fs.mkdirSync("build/cache", { recursive: true });
fs.mkdirSync("public/clips", { recursive: true });

// Медиа кладём в public/ (Remotion берёт файлы только оттуда). Путь ищем в rare/, затем от корня MVPMON.
const findMedia = (p) => [path.join(RARE, p), path.join(ROOT, p), path.resolve(p)].find((x) => fs.existsSync(x)) ?? (() => { throw new Error(`Нет файла: ${p} (искал в rare/ и ${ROOT})`); })();
const publish = (file, dir) => {
  const src = `${dir}/${path.basename(file).toLowerCase()}`;
  const dst = path.join("public", src);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (!fs.existsSync(dst) || fs.statSync(dst).size !== fs.statSync(file).size) fs.copyFileSync(file, dst);
  return src;
};

const clips = baseEdit.inputs.map((input) => {
  const file = findMedia(input);
  return { file, src: publish(file, "clips"), ...probe(file), words: transcribe(file), rms: loudness(file) };
});

// ---------- поиск фраз и привязки ----------

const norm = (t) => t.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, "");
const mid = (w) => (w.startMs + w.endMs) / 2;

const findPhrase = (clip, phrase, nth, afterMs) => {
  const target = phrase.split(/\s+/).map(norm).filter(Boolean);
  const toks = clip.words.map((w, i) => ({ t: norm(w.text), i })).filter((x) => x.t);
  let count = 0;
  for (let k = 0; k + target.length <= toks.length; k++) {
    if (clip.words[toks[k].i].startMs < afterMs) continue;
    if (target.every((t, j) => toks[k + j].t === t) && ++count === nth) {
      const idx = toks.slice(k, k + target.length).map((x) => x.i);
      return { first: clip.words[idx[0]], last: clip.words[idx[idx.length - 1]], idx };
    }
  }
  throw new Error(`Фраза не найдена в ${clip.file}: "${phrase}" (nth=${nth})`);
};

// Привязка: число (мс) | "фраза" | {phrase, nth, after, edge: "start"|"end", offsetMs, clip} | {ms, clip}
const resolveAnchor = (a, defClip = 0) => {
  if (typeof a === "number") return { clip: defClip, ms: a };
  if (typeof a === "string") a = { phrase: a };
  let clip = a.clip ?? defClip;
  if (a.ms != null) return { clip, ms: a.ms + (a.offsetMs ?? 0) };
  // Клип не указан явно и фразы в нём нет — ищем в остальных клипах по порядку.
  if (a.clip == null && clips.length > 1) {
    const found = [clip, ...clips.keys()].find((ci) => {
      try {
        return findPhrase(clips[ci], a.phrase, 1, -Infinity), true;
      } catch {
        return false;
      }
    });
    if (found != null) clip = found;
  }
  const after = a.after != null ? resolveAnchor(a.after, clip).ms : -Infinity;
  const m = findPhrase(clips[clip], a.phrase, a.nth ?? 1, after);
  return { clip, ms: (a.edge === "end" ? m.last.endMs : m.first.startMs) + (a.offsetMs ?? 0) };
};

// Точечные исправления распознавания: {phrase, nth, after, clip, text} — слова фразы
// заменяются словами text один к одному (Whisper, например, путает «Б» и «в»).
for (const fx of baseEdit.subtitles?.fixes ?? []) {
  const clip = clips[fx.clip ?? 0];
  const after = fx.after != null ? resolveAnchor(fx.after, fx.clip ?? 0).ms : -Infinity;
  const { idx } = findPhrase(clip, fx.phrase, fx.nth ?? 1, after);
  const repl = fx.text.split(/\s+/);
  idx.forEach((wi, j) => repl[j] != null && (clip.words[wi] = { ...clip.words[wi], text: repl[j] }));
}

// ---------- авто-поиск дублей (оговорка → перезапись той же фразы) ----------

const lcs = (a, b) => {
  const dp = Array(b.length + 1).fill(0);
  for (const x of a) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = x === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
};

const sentences = (words) => {
  const out = [];
  let s = 0;
  words.forEach((w, i) => {
    const gap = i + 1 < words.length ? words[i + 1].startMs - w.endMs : Infinity;
    if (/[.?!…]$/.test(w.text) || gap > 700) {
      out.push([s, i + 1]);
      s = i + 1;
    }
  });
  if (s < words.length) out.push([s, words.length]);
  return out;
};

// Кусок речи [p, q) считается неудачным дублем, если начало следующей за ним фразы q
// почти дословно его повторяет (LCS ≥ threshold). Удаляем ранний дубль, оставляем последний.
const detectRetakes = (words, { window = 4, threshold = 0.75, maxSpanMs = 15000, minWords = 3 } = {}) => {
  const sents = sentences(words);
  const toks = (from, to) => words.slice(from, to).map((w) => norm(w.text)).filter(Boolean);
  const dropped = new Set();
  let p = 0;
  while (p < sents.length) {
    let hit = -1;
    for (let q = p + 1; q < sents.length && q <= p + window; q++) {
      const a0 = sents[p][0];
      const b0 = sents[q][0];
      if (words[b0].startMs - words[a0].startMs > maxSpanMs) break;
      const A = toks(a0, b0);
      if (A.length < minWords) continue;
      const B = toks(b0, words.length).slice(0, A.length + 1);
      // Дубль должен начинаться так же, как перезапись, иначе захватим чужую фразу перед ним.
      if (B.slice(0, 2).includes(A[0]) && lcs(A, B) / A.length >= threshold) {
        hit = q;
        break;
      }
    }
    if (hit >= 0) {
      for (let i = sents[p][0]; i < sents[hit][0]; i++) dropped.add(i);
      p = hit;
    } else p++;
  }
  return dropped;
};

const subtract = ([S, E], cuts) => {
  const out = [];
  let cur = S;
  for (const [a, b] of [...cuts].sort((x, y) => x[0] - y[0])) {
    if (b <= cur || a >= E) continue;
    if (a > cur) out.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (cur < E) out.push([cur, E]);
  return out;
};

// ---------- сборка одной версии ----------

const frameSize = (src, format, fit) => {
  const even = (n) => Math.round(n / 2) * 2;
  if (!format || format === "source") return { width: src.width, height: src.height };
  const [rw, rh] = format.split(":").map(Number);
  let w, h;
  if (fit === "blur") {
    const long = Math.max(src.width, src.height);
    [w, h] = rw >= rh ? [long, (long * rh) / rw] : [(long * rw) / rh, long];
  } else if (src.width / src.height > rw / rh) {
    [w, h] = [(src.height * rw) / rh, src.height];
  } else {
    [w, h] = [src.width, (src.width * rh) / rw];
  }
  return { width: even(w), height: even(h) };
};

const buildVersion = (edit, log) => {
  const cut = { removePauses: true, removeRetakes: true, maxPauseMs: 450, padBeforeMs: 120, padAfterMs: 200, ...edit.cut };

  // Выкинутые слова по клипам: авто-дубли + ручные вырезы.
  const dropped = clips.map((c) => (cut.removeRetakes ? detectRetakes(c.words) : new Set()));
  const removeRanges = clips.map(() => []);
  for (const r of cut.remove ?? []) {
    const a = resolveAnchor(r.from, r.clip ?? 0);
    const b = resolveAnchor(r.to, a.clip);
    removeRanges[a.clip].push([a.ms, b.ms]);
    clips[a.clip].words.forEach((w, i) => mid(w) >= a.ms && mid(w) < b.ms && dropped[a.clip].add(i));
  }
  if (log) {
    clips.forEach((c, ci) => {
      const groups = [];
      [...dropped[ci]].sort((x, y) => x - y).forEach((i) => {
        const g = groups[groups.length - 1];
        if (g && g.last === i - 1) (g.text += " " + c.words[i].text), (g.last = i);
        else groups.push({ at: c.words[i].startMs, text: c.words[i].text, last: i });
      });
      groups.forEach((g) => console.log(`  вырезано [${ci}] ${(g.at / 1000).toFixed(1)}s: ${g.text}`));
    });
  }

  // Секции (порядок = порядок в выходном видео). По умолчанию — каждый клип целиком.
  const secAnchor = (a, clip) =>
    typeof a === "number" ? a : resolveAnchor(typeof a === "string" ? { phrase: a, offsetMs: -cut.padBeforeMs } : { offsetMs: -cut.padBeforeMs, ...a }, clip).ms;
  const sectionsDef = edit.sections ?? clips.map((_, i) => ({ clip: i }));
  const sections = sectionsDef.map((s) => {
    const ci = s.clip ?? 0;
    const clip = clips[ci];
    const S = Math.max(0, s.from != null ? secAnchor(s.from, ci) : 0);
    const E = Math.min(clip.durationMs, s.to != null ? secAnchor(s.to, ci) : clip.durationMs);
    let cuts = [...removeRanges[ci]];
    let ranges;
    if (clip.words.length === 0) ranges = subtract([S, E], cuts);
    else {
      const inSec = clip.words.map((w, i) => ({ w, i })).filter(({ w }) => mid(w) >= S && mid(w) < E);
      const kept = inSec.filter(({ i }) => !dropped[ci].has(i)).map(({ w }) => w);
      const droppedIn = inSec.filter(({ i }) => dropped[ci].has(i)).map(({ w }) => w);
      const consider = (gapFrom, gapTo, cutFrom, cutTo) => {
        const hasDropped = droppedIn.some((w) => mid(w) > gapFrom && mid(w) < gapTo);
        if ((hasDropped || (cut.removePauses && gapTo - gapFrom > cut.maxPauseMs)) && cutTo > cutFrom) cuts.push([cutFrom, cutTo]);
      };
      let prevEnd = null;
      for (const w of kept) {
        if (prevEnd === null) consider(S, w.startMs, S, w.startMs - cut.padBeforeMs);
        else consider(prevEnd, w.startMs, prevEnd + cut.padAfterMs, w.startMs - cut.padBeforeMs);
        prevEnd = w.endMs;
      }
      ranges = kept.length ? (consider(prevEnd, E, prevEnd + cut.padAfterMs, E), subtract([S, E], cuts)) : [];
    }
    return { clip: ci, transition: s.transition, ranges: ranges.filter(([a, b]) => b - a >= 150) };
  });

  // Выходной таймлайн.
  const introMs = 0;
  const punch = edit.punchIn ?? 1;
  const segs = [];
  let t = introMs;
  sections.forEach((sec, si) => {
    const tr = si > 0 ? (sec.transition ?? edit.transition ?? null) : null;
    sec.ranges.forEach(([a, b], k) => {
      const prev = segs[segs.length - 1];
      const transitionIn =
        k === 0 && tr && tr.type !== "cut" && prev
          ? { type: tr.type, durationMs: tr.durationMs ?? 400, prevSrc: prev.src, prevSrcToMs: prev.srcToMs, prevPunch: prev.punch }
          : null;
      segs.push({ clip: sec.clip, section: si, src: clips[sec.clip].src, srcFromMs: a, srcToMs: b, outFromMs: t, outToMs: t + (b - a), punch: k % 2 ? punch : 1, transitionIn });
      t += b - a;
    });
  });
  const bodyEnd = t;
  const outroMs = 0;

  const toOut = (clip, ms, dir) => {
    const inside = segs.find((s) => s.clip === clip && ms >= s.srcFromMs && ms < s.srcToMs);
    if (inside) return inside.outFromMs + (ms - inside.srcFromMs);
    const same = segs.filter((s) => s.clip === clip);
    const s =
      dir === "forward"
        ? same.filter((x) => x.srcFromMs >= ms).sort((x, y) => x.srcFromMs - y.srcFromMs)[0]
        : same.filter((x) => x.srcToMs <= ms).sort((x, y) => y.srcToMs - x.srcToMs)[0];
    return s ? (dir === "forward" ? s.outFromMs : s.outToMs) : dir === "forward" ? bodyEnd : introMs;
  };
  const sectionEndAt = (outMs) => {
    const s = segs.find((x) => outMs >= x.outFromMs && outMs < x.outToMs);
    return s ? Math.max(...segs.filter((x) => x.section === s.section).map((x) => x.outToMs)) : bodyEnd;
  };
  const span = (item) => {
    const s = resolveAnchor(item.start);
    const outFromMs = toOut(s.clip, s.ms, "forward");
    let outToMs;
    if (item.durationMs != null) outToMs = outFromMs + item.durationMs;
    else if (item.end != null) {
      const e = resolveAnchor(item.end, s.clip);
      outToMs = toOut(e.clip, e.ms, "back");
    } else outToMs = sectionEndAt(outFromMs);
    return { outFromMs, outToMs };
  };
  const valid = (x) => x.outToMs - x.outFromMs >= 100;

  const words = [];
  clips.forEach((c, ci) =>
    c.words.forEach((w, i) => {
      if (dropped[ci].has(i)) return;
      const s = segs.find((x) => x.clip === ci && mid(w) >= x.srcFromMs && mid(w) < x.srcToMs);
      if (!s) return;
      const from = Math.max(w.startMs, s.srcFromMs);
      const to = Math.min(w.endMs, s.srcToMs);
      words.push({ text: w.text, startMs: s.outFromMs + from - s.srcFromMs, endMs: s.outFromMs + to - s.srcFromMs });
    }),
  );
  words.sort((a, b) => a.startMs - b.startMs);
  // Whisper иногда отдаёт «%» и т.п. отдельным словом — приклеиваем к предыдущему.
  for (let i = words.length - 1; i > 0; i--) {
    if (!norm(words[i].text) && words[i].startMs - words[i - 1].endMs < 300) {
      words[i - 1].text += words[i].text;
      words[i - 1].endMs = words[i].endMs;
      words.splice(i, 1);
    }
  }

  const fit = edit.fit ?? "crop";
  const brollContent = (b) =>
    b.src ? { kind: /\.(mp4|mov|webm|mkv)$/i.test(b.src) ? "video" : "image", src: b.src.startsWith("assets/") ? b.src : publish(findMedia(b.src), "media") } : { kind: b.type, ...b.data };

  // Текстовый слой субтитров: edits/<name>.subs.txt (если нет — черновик из речи, дальше правится руками).
  const subsPath = path.join("edits", `${name}.subs.txt`);
  if (!fs.existsSync(subsPath)) {
    fs.writeFileSync(subsPath, draftSubs(words, { maxChars: edit.subtitles?.maxChars ?? 30 }), "utf-8");
    console.log(`  создан черновик субтитров: ${subsPath}`);
  }
  const subs = buildBlocks(fs.readFileSync(subsPath, "utf-8"), words);
  if (log) console.log(`  субтитры: ${subs.blocks.length} блоков, ${subs.unmatched}/${subs.total} слов без точного совпадения с речью`);
  for (const w of subs.warnings) console.log(`  ⚠ не влезет в 2 строки: ${w}`);

  const durationMs = bodyEnd + outroMs;
  const cards = (edit.cards ?? [])
    .map((c) => {
      const sp = span(c);
      const ans = c.answerAt != null ? resolveAnchor(c.answerAt) : null;
      return { ...sp, title: c.title, question: c.question, options: c.options, answer: c.answer, answerOutMs: ans ? toOut(ans.clip, ans.ms, "forward") : undefined };
    })
    .filter(valid);
  const titles = (edit.titles ?? []).map((x) => ({ ...span(x), text: x.text, position: x.position ?? "top", topPct: x.topPct })).filter(valid);

  // Видео в рамке: куски исходника встают на фразы рассказчика (at) и идут подряд до следующего куска / end.
  let inset = null;
  if (edit.inset) {
    const ins = edit.inset;
    const src = publish(findMedia(ins.src), "media");
    const outAt = (a) => {
      const r = resolveAnchor(a);
      return toOut(r.clip, r.ms, "forward");
    };
    const starts = ins.pieces.map((pc) => outAt(pc.at));
    const endMs = ins.end != null ? outAt(ins.end) : durationMs;
    const pieces = ins.pieces.map((pc, i) => ({ src, outFromMs: starts[i], outToMs: starts[i + 1] ?? endMs, srcFromMs: pc.from * 1000 }));
    inset = { outFromMs: starts[0], outToMs: endMs, topPct: ins.topPct ?? 0.55, widthPct: ins.widthPct ?? 0.78, volume: ins.volume ?? 0.05, pieces };
    if (log) pieces.forEach((pc) => console.log(`  рамка: ${(pc.outFromMs / 1000).toFixed(1)}–${(pc.outToMs / 1000).toFixed(1)}s ← ${ins.src} с ${(pc.srcFromMs / 1000).toFixed(1)}s`));
  }

  // Камера: авто-ключи по напряжённости речи + ручные пики; под карточками/плашками зум ограничен.
  const rmsAt = (outMs) => {
    const s = segs.find((x) => outMs >= x.outFromMs && outMs < x.outToMs);
    if (!s) return 0;
    const r = clips[s.clip].rms;
    return r[Math.min(r.length - 1, Math.max(0, Math.floor((s.srcFromMs + outMs - s.outFromMs) / 100)))] ?? 0;
  };
  const cam = { enabled: true, maxWithOverlay: 1.1, ...edit.camera };
  const intensity = makeIntensity(durationMs, rmsAt, words);
  const camera = cam.enabled
    ? {
        keys: planCamera(durationMs, intensity, subs.blocks.map((b) => b.fromMs), cam),
        peaks: (cam.peaks ?? []).map((pk) => {
          const a = resolveAnchor(pk.at);
          const at = toOut(a.clip, a.ms, "forward");
          return { outFromMs: at, outToMs: at + (pk.holdMs ?? 1200), scale: pk.scale ?? 1.3, rampMs: pk.rampMs ?? 250 };
        }),
        caps: [...cards, ...titles, ...(inset ? [inset] : [])].map((x) => ({ outFromMs: x.outFromMs, outToMs: x.outToMs, max: x === inset ? (cam.maxWithInset ?? 1.04) : cam.maxWithOverlay })),
      }
    : { keys: [], peaks: [], caps: [] };
  return {
    ...frameSize(clips[0], edit.format, fit),
    durationMs,
    fit,
    focus: { x: 0.5, y: 0.5, ...edit.focus },
    segments: segs,
    zooms: (edit.zooms ?? []).map((z) => ({ ...span(z), scale: z.scale ?? 1.12 })).filter(valid),
    broll: (edit.broll ?? []).map((b) => ({ ...span(b), mode: b.mode ?? "full", content: brollContent(b) })).filter(valid),
    titles,
    cards,
    camera,
    inset,
    hook: edit.hook ? { durationMs: 3000, ...edit.hook } : null,
    bottomGradient: edit.bottomGradient === false ? null : { heightPct: 0.34, opacity: 0.78, ...edit.bottomGradient },
    progressBar: edit.progressBar ? { position: "top", ...edit.progressBar } : null,
    subtitles: {
      bottomPct: edit.subtitles?.bottomPct ?? 0.24,
      maxWidthPct: edit.subtitles?.maxWidthPct ?? 0.69,
      blocks: subs.blocks,
      // Пока на экране рамка — субтитры под ней (subtitles.underInsetBottomPct).
      zones: inset && edit.subtitles?.underInsetBottomPct != null ? [{ outFromMs: 0, outToMs: inset.outToMs, bottomPct: edit.subtitles.underInsetBottomPct }] : [],
    },
  };
};

// ---------- версии и рендер ----------

const versions = (baseEdit.versions ?? [{ name: "main" }]).filter((v) => !only || v.name === only);
fs.mkdirSync(path.join("build", name), { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

versions.forEach((v, vi) => {
  const edit = { ...baseEdit, ...v };
  const props = buildVersion(edit, vi === 0);
  const propsPath = path.join("build", name, `${v.name}.props.json`);
  fs.writeFileSync(propsPath, JSON.stringify(props, null, 1), "utf-8");
  const srcMs = clips.reduce((s, c) => s + c.durationMs, 0);
  console.log(
    `[${v.name}] ${props.width}x${props.height}, ${(srcMs / 1000).toFixed(1)}s → ${(props.durationMs / 1000).toFixed(1)}s, ` +
      `${props.segments.length} кусков, ${props.cards.length} карточек, ${props.camera.keys.length - 1} движений камеры, ${props.broll.length} b-roll → ${propsPath}`,
  );
  if (doRender) {
    const out = path.join(OUT, versions.length > 1 ? `${name}_${v.name}.mp4` : `${name}.mp4`);
    execSync(`npx --no-install remotion render src/index.ts Edit "${out}" --props="${propsPath}" --log=error`, { stdio: "inherit" });
    if (!fs.existsSync(out)) throw new Error(`Рендер не создал файл: ${out}`);
    console.log(`  → ${out}`);
  }
});
