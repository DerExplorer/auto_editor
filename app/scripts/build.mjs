// Сборка ролика по edit-файлу: транскрибация → нарезка → таймлайн → props для Remotion → рендер.
// Времена в edit-файле задаются в исходном времени клипа (мс или фраза речи) и пересчитываются после вырезов.
// Запуск из app/: node scripts/build.mjs edits/<имя>.json [--render]
import { execFileSync, execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listAudio, normalizeFinal, processVoice, scanLibrary, speechIntervals } from "./audio.mjs";
import { loudness, makeIntensity, planCamera } from "./camera.mjs";
import { isVideo, makeProxy } from "./media.mjs";
import { resolveMood } from "./mood.mjs";
import { buildBlocks, draftSubs } from "./subs.mjs";
import { pythonCmd, requireTools } from "./tools.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(APP, "..");

// Рабочие папки лежат в корне проекта; другое место — через app/local.json или переменные окружения.
const localCfg = (() => {
  const p = path.join(APP, "local.json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : {};
})();
const dirFrom = (env, cfg, def) => (process.env[env] ? path.resolve(process.env[env]) : cfg ? path.resolve(APP, cfg) : def);
const INPUT = dirFrom("AUTO_EDITOR_IN", localCfg.inputDir, path.join(ROOT, "input"));
const OUT = dirFrom("AUTO_EDITOR_OUT", localCfg.outputDir, path.join(ROOT, "output"));
const SFX_DIR = dirFrom("AUTO_EDITOR_SFX", localCfg.sfxDir, path.join(ROOT, "sfx"));
const MUSIC_DIR = dirFrom("AUTO_EDITOR_MUSIC", localCfg.musicDir, path.join(ROOT, "music"));
const CLIENTS_DIR = dirFrom("AUTO_EDITOR_CLIENTS", localCfg.clientsDir, path.join(ROOT, "clients"));

const CWD = process.cwd();
process.chdir(APP);
requireTools();

const argv = process.argv.slice(2);
const editPath = argv.find((a) => !a.startsWith("--"));
if (!editPath) {
  console.error("Usage: node scripts/build.mjs <edit.json> [--render]");
  process.exit(1);
}
const doRender = argv.includes("--render");
const edit = JSON.parse(fs.readFileSync([path.resolve(CWD, editPath), path.resolve(APP, editPath)].find((x) => fs.existsSync(x)) ?? editPath, "utf-8"));
const name = edit.name ?? path.basename(editPath, ".json");

// Паспорт стиля клиента: "client": "anna" → clients/anna/brand.json (палитра и т.п.).
const brand = (() => {
  if (!edit.client) return null;
  const p = path.join(CLIENTS_DIR, edit.client, "brand.json");
  if (!fs.existsSync(p)) throw new Error(`Нет паспорта клиента ${p} (создать: npm run palette -- "#цвет" --client ${edit.client})`);
  const b = JSON.parse(fs.readFileSync(p, "utf-8"));
  console.log(`  клиент: ${b.name || edit.client}${b.palette ? `, акцент ${b.palette.accent}` : ""}`);
  // Настройки клиента по умолчанию; то, что задано в edit-файле, важнее.
  for (const k of ["mood", "music"]) if (edit[k] === undefined && b.defaults?.[k] != null) edit[k] = b.defaults[k];
  return b;
})();
const palette = brand?.palette ? Object.fromEntries(["accent", "accentDeep", "onAccent", "highlight", "ink", "text", "muted", "bg", "grey", "blob"].map((k) => [k, brand.palette[k]]).filter(([, v]) => v)) : null;

// ---------- исходники ----------

const probe = (file) => {
  const j = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", file]));
  return { width: j.streams[0].width, height: j.streams[0].height, durationMs: Math.round(parseFloat(j.format.duration) * 1000) };
};

// Кэш распознавания — по содержимому файла, чтобы переносился между компьютерами.
const transcribe = (file) => {
  const st = fs.statSync(file);
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

fs.mkdirSync(path.join("build", "cache"), { recursive: true });

const LIBRARY = path.join(ROOT, "library");
const findMedia = (p) => {
  const hit = [path.join(INPUT, p), path.join(ROOT, p), path.join(LIBRARY, p), path.resolve(p)].find((x) => fs.existsSync(x));
  if (!hit) throw new Error(`Нет файла: ${p} (искал в ${INPUT} и ${ROOT})`);
  return hit;
};
// "backgrounds/money" — папка темы: берём файлы по кругу, чтобы два b-roll подряд не были одинаковыми.
const libTurn = {};
const pickLibraryFile = (p) => {
  const hit = findMedia(p);
  if (!fs.statSync(hit).isDirectory()) return hit;
  const files = fs.readdirSync(hit).filter((f) => /\.(mp4|mov|webm|jpe?g|png)$/i.test(f)).sort();
  if (!files.length) throw new Error(`Пустая папка: ${p}`);
  libTurn[hit] = (libTurn[hit] ?? -1) + 1;
  return path.join(hit, files[libTurn[hit] % files.length]);
};
const backgroundOf = (p) => {
  const file = pickLibraryFile(p);
  return isVideo(file) ? { src: publish(file, "media"), kind: "video", durationMs: probe(file).durationMs } : { src: publish(file, "media"), kind: "image" };
};
// Remotion берёт файлы только из public/. Видео кладём туда сжатой копией (30 к/с, ≤1080p), остальное — как есть.
const publish = (file, dir) => {
  const base = path.basename(file).toLowerCase();
  const src = `${dir}/${isVideo(file) ? base.replace(/\.[^.]+$/, ".mp4") : base}`;
  const dst = path.join("public", src);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (isVideo(file)) makeProxy(file, dst);
  else if (!fs.existsSync(dst) || fs.statSync(dst).size !== fs.statSync(file).size) fs.copyFileSync(file, dst);
  return src;
};

const clips = edit.inputs.map((input) => {
  const file = findMedia(input);
  const src = publish(file, "clips");
  let voiceSrc = null;
  if (edit.audio?.voice !== false) {
    voiceSrc = `${src}.voice.wav`;
    processVoice(file, path.join("public", voiceSrc), typeof edit.audio?.voice === "object" ? edit.audio.voice : {});
  }
  return { file, src, voiceSrc, ...probe(path.join("public", src)), words: transcribe(file), rms: loudness(file) };
});

// ---------- привязки к фразам ----------

const norm = (t) => t.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, "");
const mid = (w) => (w.startMs + w.endMs) / 2;

const findPhrase = (clip, phrase, nth, afterMs) => {
  const target = phrase.split(/\s+/).map(norm).filter(Boolean);
  const toks = clip.words.map((w, i) => ({ t: norm(w.text), i })).filter((x) => x.t);
  let count = 0;
  for (let k = 0; k + target.length <= toks.length; k++) {
    if (clip.words[toks[k].i].startMs < afterMs) continue;
    if (target.every((t, j) => toks[k + j].t === t) && ++count === nth) {
      return { first: clip.words[toks[k].i], last: clip.words[toks[k + target.length - 1].i] };
    }
  }
  throw new Error(`Фраза не найдена в ${clip.file}: "${phrase}" (nth=${nth})`);
};

// Привязка: мс | "фраза" | {phrase, nth, after, edge: "start"|"end", offsetMs, clip} | {ms, clip}
const resolveAnchor = (a, defClip = 0) => {
  if (typeof a === "number") return { clip: defClip, ms: a };
  if (typeof a === "string") a = { phrase: a };
  let clip = a.clip ?? defClip;
  if (a.ms != null) return { clip, ms: a.ms + (a.offsetMs ?? 0) };
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

// ---------- поиск дублей ----------

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

// Фраза — неудачный дубль, если следующая почти дословно её повторяет и начинается так же. Оставляем последнюю.
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

// Кадр 9:16 по исходнику (если исходник шире — обрезка по бокам).
const frameSize = ({ width, height }) => {
  const even = (n) => Math.round(n / 2) * 2;
  return width / height > 9 / 16 ? { width: even((height * 9) / 16), height } : { width, height: even((width * 16) / 9) };
};

// ---------- сборка ----------

const build = () => {
  const mood = resolveMood(edit.mood);
  if (mood) console.log(`  настроение: ${mood.label}, сила ${mood.strength}/5`);
  const cut = { removePauses: true, removeRetakes: true, maxPauseMs: 450, padBeforeMs: 120, padAfterMs: 200, ...edit.cut };

  const dropped = clips.map((c) => (cut.removeRetakes ? detectRetakes(c.words) : new Set()));
  const removeRanges = clips.map(() => []);
  for (const r of cut.remove ?? []) {
    const a = resolveAnchor(r.from, r.clip ?? 0);
    const b = resolveAnchor(r.to, a.clip);
    removeRanges[a.clip].push([a.ms, b.ms]);
    clips[a.clip].words.forEach((w, i) => mid(w) >= a.ms && mid(w) < b.ms && dropped[a.clip].add(i));
  }
  clips.forEach((c, ci) => {
    const groups = [];
    [...dropped[ci]].sort((x, y) => x - y).forEach((i) => {
      const g = groups[groups.length - 1];
      if (g && g.last === i - 1) (g.text += " " + c.words[i].text), (g.last = i);
      else groups.push({ at: c.words[i].startMs, text: c.words[i].text, last: i });
    });
    groups.forEach((g) => console.log(`  вырезано [${ci}] ${(g.at / 1000).toFixed(1)}s: ${g.text}`));
  });

  // Секции задают порядок и границы кусков в ролике; по умолчанию каждый клип целиком.
  const secAnchor = (a, clip) =>
    typeof a === "number" ? a : resolveAnchor(typeof a === "string" ? { phrase: a, offsetMs: -cut.padBeforeMs } : { offsetMs: -cut.padBeforeMs, ...a }, clip).ms;
  const sections = (edit.sections ?? clips.map((_, i) => ({ clip: i }))).map((s) => {
    const ci = s.clip ?? 0;
    const clip = clips[ci];
    const S = Math.max(0, s.from != null ? secAnchor(s.from, ci) : 0);
    const E = Math.min(clip.durationMs, s.to != null ? secAnchor(s.to, ci) : clip.durationMs);
    const cuts = [...removeRanges[ci]];
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
    return { clip: ci, ranges: ranges.filter(([a, b]) => b - a >= 150) };
  });

  const punch = edit.punchIn ?? 1;
  const segs = [];
  let t = 0;
  sections.forEach((sec, si) =>
    sec.ranges.forEach(([a, b], k) => {
      const c = clips[sec.clip];
      segs.push({ clip: sec.clip, section: si, src: c.src, voiceSrc: c.voiceSrc, srcFromMs: a, srcToMs: b, outFromMs: t, outToMs: t + (b - a), punch: k % 2 ? punch : 1 });
      t += b - a;
    }),
  );
  const durationMs = t;

  const toOut = (clip, ms, dir) => {
    const inside = segs.find((s) => s.clip === clip && ms >= s.srcFromMs && ms < s.srcToMs);
    if (inside) return inside.outFromMs + (ms - inside.srcFromMs);
    const same = segs.filter((s) => s.clip === clip);
    const s =
      dir === "forward"
        ? same.filter((x) => x.srcFromMs >= ms).sort((x, y) => x.srcFromMs - y.srcFromMs)[0]
        : same.filter((x) => x.srcToMs <= ms).sort((x, y) => y.srcToMs - x.srcToMs)[0];
    return s ? (dir === "forward" ? s.outFromMs : s.outToMs) : dir === "forward" ? durationMs : 0;
  };
  const outAt = (a) => {
    const r = resolveAnchor(a);
    return toOut(r.clip, r.ms, "forward");
  };
  const sectionEndAt = (outMs) => {
    const s = segs.find((x) => outMs >= x.outFromMs && outMs < x.outToMs);
    return s ? Math.max(...segs.filter((x) => x.section === s.section).map((x) => x.outToMs)) : durationMs;
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

  // Слова на выходном таймлайне.
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
  // Whisper иногда отдаёт «%» отдельным словом.
  for (let i = words.length - 1; i > 0; i--) {
    if (!norm(words[i].text) && words[i].startMs - words[i - 1].endMs < 300) {
      words[i - 1].text += words[i].text;
      words[i - 1].endMs = words[i].endMs;
      words.splice(i, 1);
    }
  }

  const subsPath = path.join("edits", `${name}.subs.txt`);
  if (!fs.existsSync(subsPath)) {
    fs.writeFileSync(subsPath, draftSubs(words, { maxChars: edit.subtitles?.maxChars ?? 30 }), "utf-8");
    console.log(`  создан черновик субтитров: ${subsPath}`);
  }
  const subs = buildBlocks(fs.readFileSync(subsPath, "utf-8"), words);
  console.log(`  субтитры: ${subs.blocks.length} блоков, ${subs.unmatched}/${subs.total} слов без точного совпадения с речью`);
  for (const w of subs.warnings) console.log(`  ⚠ не влезет в 2 строки: ${w}`);

  const cards = (edit.cards ?? [])
    .map((c) => ({
      ...span(c),
      title: c.title,
      question: c.question,
      options: c.options,
      answer: c.answer,
      answerOutMs: c.answerAt != null ? outAt(c.answerAt) : undefined,
    }))
    .filter(valid);
  const titles = (edit.titles ?? []).map((x) => ({ ...span(x), text: x.text, position: x.position ?? "top", topPct: x.topPct })).filter(valid);
  const broll = (edit.broll ?? [])
    .map((b) => ({
      ...span(b),
      mode: b.mode ?? "full",
      content: b.src ? { kind: /\.(mp4|mov|webm|mkv)$/i.test(b.src) ? "video" : "image", src: publish(findMedia(b.src), "media") } : { kind: b.type, ...b.data },
      // фон: путь к файлу или "backgrounds/<тема>" — первый файл темы
      bg: b.bg ? backgroundOf(b.bg) : undefined,
      fit: b.fit,
    }))
    .filter(valid);
  // Оверлеи: огонь, искры, стекло поверх кадра (режим screen). Путь или "overlays/<тема>".
  const overlays = (edit.overlays ?? [])
    .map((o) => {
      const file = pickLibraryFile(o.src);
      // без end и durationMs — на всю длину файла
      const s = span(o.end == null && o.durationMs == null ? { ...o, durationMs: probe(file).durationMs } : o);
      return { ...s, src: publish(file, "media"), opacity: o.opacity ?? 0.8, sound: o.sound };
    })
    .filter(valid);

  // Видео в рамке: куски вставки встают на фразы рассказчика и идут подряд до следующего куска.
  let inset = null;
  if (edit.inset) {
    const ins = edit.inset;
    const src = publish(findMedia(ins.src), "media");
    const starts = ins.pieces.map((pc) => outAt(pc.at));
    const endMs = ins.end != null ? outAt(ins.end) : durationMs;
    const pieces = ins.pieces.map((pc, i) => ({ src, outFromMs: starts[i], outToMs: starts[i + 1] ?? endMs, srcFromMs: pc.from * 1000 }));
    const { width, height } = probe(path.join("public", src));
    inset = {
      outFromMs: starts[0],
      outToMs: endMs,
      topPct: ins.topPct ?? 0.55,
      widthPct: ins.widthPct ?? 0.78,
      volume: ins.volume ?? 0.05,
      aspect: width / height,
      borderColor: ins.borderColor ?? palette?.accentDeep ?? "#111317",
      pieces,
    };
    pieces.forEach((pc) => console.log(`  рамка: ${(pc.outFromMs / 1000).toFixed(1)}–${(pc.outToMs / 1000).toFixed(1)}s ← ${ins.src} с ${(pc.srcFromMs / 1000).toFixed(1)}s`));
  }

  // Камера: наезды по напряжённости речи; под карточками, плашками и рамкой зум ограничен.
  const rmsAt = (outMs) => {
    const s = segs.find((x) => outMs >= x.outFromMs && outMs < x.outToMs);
    if (!s) return 0;
    const r = clips[s.clip].rms;
    return r[Math.min(r.length - 1, Math.max(0, Math.floor((s.srcFromMs + outMs - s.outFromMs) / 100)))] ?? 0;
  };
  const cam = { enabled: true, maxWithOverlay: 1.1, maxWithInset: 1.04, ...mood?.camera, ...edit.camera };
  const camera = cam.enabled
    ? {
        keys: planCamera(durationMs, makeIntensity(durationMs, rmsAt, words), subs.blocks.map((b) => b.fromMs), cam),
        caps: [...cards, ...titles, ...(inset ? [inset] : [])].map((x) => ({ outFromMs: x.outFromMs, outToMs: x.outToMs, max: x === inset ? cam.maxWithInset : cam.maxWithOverlay })),
      }
    : { keys: [], caps: [] };

  // Музыка: "auto" — первый трек из music/<папка настроения>.
  let music = null;
  if (edit.music) {
    const m = edit.music === "auto" ? { ...mood?.music, dir: path.join(MUSIC_DIR, mood?.music.dir ?? "") } : typeof edit.music === "string" ? { src: edit.music } : edit.music;
    const mdir = m.dir ? path.resolve(ROOT, m.dir) : MUSIC_DIR;
    const file = m.src ? [path.join(mdir, m.src), path.resolve(ROOT, m.src)].find((x) => fs.existsSync(x)) : listAudio(mdir)[0];
    if (!file) console.log(`  ⚠ музыка не найдена (${m.src ?? "папка пуста"}, ${mdir})`);
    else
      music = {
        src: publish(file, "music"),
        volume: m.volume ?? 0.16,
        duckTo: m.duckTo ?? 0.06,
        fadeInMs: m.fadeInMs ?? 800,
        fadeOutMs: m.fadeOutMs ?? 1500,
        speech: speechIntervals(words),
      };
  }

  // Звуковые эффекты: авто на события монтажа + ручные на фразы. Варианты из папки чередуются по кругу.
  const sfxCfg = { auto: true, volume: 0.5, minGapMs: 500, ...mood?.sfx, ...edit.sfx };
  const lib = scanLibrary(sfxCfg.dir ? path.resolve(ROOT, sfxCfg.dir) : SFX_DIR);
  const ALIAS = {
    whoosh: ["whoosh", "swoosh", "transition"],
    pop: ["pop", "click", "bubble"],
    ding: ["ding", "correct", "success", "notification"],
    impact: ["impact", "boom", "hit", "whoosh"],
    hit: ["hit", "pop"],
    number: ["number", "pop"],
    click: ["click", "pop"],
  };
  // Мелкие частые элементы — тише, чтобы не утомляли.
  const CAT_VOLUME = { pop: 0.6, number: 0.7, click: 0.6, hit: 0.7, ding: 0.8 };
  const turn = {};
  const pick = (cat) => {
    for (const c of ALIAS[cat] ?? [cat]) {
      const files = lib[c];
      if (files?.length) {
        turn[c] = (turn[c] ?? -1) + 1;
        return { file: files[turn[c] % files.length], cat: c };
      }
    }
    return null;
  };
  const events = [];
  if (sfxCfg.auto) {
    if (edit.hook) {
      events.push({ at: 0, cat: "impact", vol: 0.8 });
      const ai = edit.hook.words.findIndex((w) => w.accent);
      if (ai > 0) events.push({ at: ai * 133 + 80, cat: "hit" });
    }
    titles.forEach((x) => events.push({ at: x.outFromMs, cat: "pop" }));
    cards.forEach((c) => {
      events.push({ at: c.outFromMs, cat: "whoosh" });
      if (c.answerOutMs != null) events.push({ at: c.answerOutMs, cat: "ding" });
    });
    if (inset) {
      events.push({ at: inset.outFromMs, cat: "whoosh" });
      events.push({ at: Math.max(inset.outFromMs, inset.outToMs - 200), cat: "whoosh", vol: 0.6 });
    }
    broll.forEach((b) => events.push({ at: b.outFromMs, cat: b.mode === "full" ? "whoosh" : "click" }));
    // оверлей: звук по теме (огонь/искры — impact, стекло — glass), можно задать "sound" или false
    overlays.forEach((o) => {
      if (o.sound === false) return;
      const cat = o.sound ?? (/glass/i.test(o.src) ? "glass" : /fire-sides|embers-rising/i.test(o.src) ? "fire" : "impact");
      events.push({ at: o.outFromMs, cat, vol: 0.6 });
    });
    subs.blocks.filter((b) => b.kind === "number").forEach((b) => events.push({ at: b.fromMs, cat: "number" }));
  }
  for (const it of sfxCfg.items ?? []) events.push({ at: outAt(it.at) + (it.offsetMs ?? 0), cat: it.sound, vol: it.volume, manual: true });
  events.sort((a, b) => a.at - b.at);
  const sfx = [];
  const missing = new Set();
  let lastAt = -Infinity;
  for (const e of events) {
    if (!e.manual && e.at - lastAt < sfxCfg.minGapMs) continue;
    const hit = pick(e.cat);
    if (!hit) {
      missing.add(e.cat);
      continue;
    }
    sfx.push({ src: publish(hit.file, `sfx/${hit.cat}`), atMs: Math.max(0, e.at), volume: (e.vol ?? 1) * sfxCfg.volume * (sfxCfg.categoryVolume?.[e.cat] ?? (e.manual ? 1 : (CAT_VOLUME[e.cat] ?? 1))) });
    lastAt = e.at;
  }
  console.log(
    `  звук: ${clips.some((c) => c.voiceSrc) ? "срез низов голоса" : "голос как есть"}, эффектов ${sfx.length}` +
      `${missing.size ? ` (нет в библиотеке: ${[...missing].join(", ")})` : ""}, музыка: ${music ? path.basename(music.src) : "нет"}`,
  );

  return {
    ...frameSize(clips[0]),
    durationMs,
    focus: { x: 0.5, y: 0.5, ...edit.focus },
    segments: segs,
    broll,
    overlays: overlays.map(({ sound, ...o }) => o),
    music,
    sfx,
    titles,
    cards,
    camera,
    inset,
    hook: edit.hook ? { durationMs: 3000, ...edit.hook } : null,
    grade: mood?.grade ?? null,
    layout: { topPct: edit.layout?.topPct ?? 0.09 }, // как DEFAULT_TOP в Graphics.tsx
    bottomGradient: edit.bottomGradient === false ? null : { heightPct: 0.34, opacity: 0.78, ...edit.bottomGradient },
    palette,
    subtitles: {
      bottomPct: edit.subtitles?.bottomPct ?? 0.24,
      maxWidthPct: edit.subtitles?.maxWidthPct ?? 0.69,
      blocks: subs.blocks,
      // пока на экране рамка, субтитры стоят под ней
      zones: inset && edit.subtitles?.underInsetBottomPct != null ? [{ outFromMs: 0, outToMs: inset.outToMs, bottomPct: edit.subtitles.underInsetBottomPct }] : [],
    },
  };
};

// ---------- запуск ----------

fs.mkdirSync(path.join("build", name), { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const props = build();
const propsPath = path.join("build", name, "9x16.props.json");
fs.writeFileSync(propsPath, JSON.stringify(props, null, 1), "utf-8");
const srcMs = clips.reduce((s, c) => s + c.durationMs, 0);
console.log(
  `[9x16] ${props.width}x${props.height}, ${(srcMs / 1000).toFixed(1)}s → ${(props.durationMs / 1000).toFixed(1)}s, ` +
    `${props.segments.length} кусков, ${props.cards.length} карточек, ${props.camera.keys.length - 1} движений камеры, ${props.broll.length} b-roll → ${propsPath}`,
);

if (doRender) {
  const out = path.join(OUT, `${edit.output ?? name}.mp4`);
  execSync(`npx --no-install remotion render src/index.ts Edit "${out}" --props="${propsPath}" --log=error`, { stdio: "inherit" });
  if (!fs.existsSync(out)) throw new Error(`Рендер не создал файл: ${out}`);
  if (edit.audio?.normalize !== false) {
    const n = normalizeFinal(out, { lufs: edit.audio?.lufs ?? -14 });
    console.log(`  громкость: ${n.before.toFixed(1)} → ${n.after.toFixed(1)} LUFS`);
  }
  console.log(`  → ${out}`);
}
