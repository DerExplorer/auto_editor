// Библиотека кадров из фильмов: library/movies.
//   _source/            — исходники (сюда же кладутся новые нарезки)
//   _review/<файл>.jpg  — раскадровка по сценам с таймкодами, чтобы разметить новый исходник
//   clips.json          — разметка: {"<исходник>": [{"from", "to", "mood", "what"}]}
//   <настроение>/       — нарезанные моменты; INDEX.md — список для подбора
// npm run movies            — раскадровка для новых исходников (ещё не размеченных в clips.json)
// npm run movies -- cut     — нарезать всё из clips.json, что ещё не нарезано, и обновить INDEX.md
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LIB = process.env.AUTO_EDITOR_MOVIES ?? path.join(ROOT, "library", "movies");
const SRC = path.join(LIB, "_source");
const REVIEW = path.join(LIB, "_review");
const CLIPS = path.join(LIB, "clips.json");
const MAX_LEN = 12;

const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 28 });
const duration = (f) => Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]));
const slug = (s) => path.parse(s).name.toLowerCase().replace(/\(\d+\)|\(\d+p\)|\(video-converter\.com\)|amazing shots of /g, "").replace(/[^a-zа-я0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40);
const clips = fs.existsSync(CLIPS) ? JSON.parse(fs.readFileSync(CLIPS, "utf8")) : {};
const sources = fs.existsSync(SRC) ? fs.readdirSync(SRC).filter((f) => /\.(mp4|mov|mkv|webm)$/i.test(f)) : [];

// Склейки: ffmpeg scene > 0.3 по уменьшенной копии; кадр из середины каждой сцены — в лист 6×N.
const review = (file) => {
  const src = path.join(SRC, file);
  const log = spawnSync("ffmpeg", ["-hide_banner", "-i", src, "-vf", "scale=320:-2,select='gt(scene,0.3)',showinfo", "-an", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 28 }).stderr;
  const cuts = [...log.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
  const d = duration(src);
  const bounds = [0, ...cuts.filter((c) => c > 0.3), d];
  const scenes = bounds.slice(1).map((b, i) => [bounds[i], b]).filter(([a, b]) => b - a >= 0.4);
  const tmp = fs.mkdtempSync(path.join(REVIEW, ".tmp-"));
  scenes.forEach(([a, b], i) => {
    run("ffmpeg", ["-v", "error", "-y", "-ss", ((a + b) / 2).toFixed(2), "-i", src, "-frames:v", "1",
      "-vf", `scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2,drawtext=text='#${i} ${a.toFixed(1)}-${b.toFixed(1)}':x=6:y=h-24:fontsize=18:fontcolor=0xFFC163:box=1:boxcolor=black@0.6:fontfile='C\\:/Windows/Fonts/arial.ttf'`,
      path.join(tmp, `${String(i).padStart(4, "0")}.png`)]);
  });
  const out = path.join(REVIEW, `${path.parse(file).name}.jpg`);
  run("ffmpeg", ["-v", "error", "-y", "-framerate", "1", "-i", path.join(tmp, "%04d.png"), "-vf", `tile=6x${Math.ceil(scenes.length / 6)}`, "-frames:v", "1", "-q:v", "3", out]);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`  ${file}: ${scenes.length} сцен → ${path.relative(ROOT, out)}`);
};

const cut = () => {
  const index = [];
  for (const [file, list] of Object.entries(clips)) {
    const src = path.join(SRC, file);
    if (!fs.existsSync(src)) {
      console.log(`  ⚠ нет исходника ${file}`);
      continue;
    }
    list.forEach((c, i) => {
      const to = Math.min(c.to, c.from + MAX_LEN);
      const dir = path.join(LIB, c.mood);
      const name = `${slug(file)}-${String(i + 1).padStart(2, "0")}.mp4`;
      const out = path.join(dir, name);
      fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(out)) {
        run("ffmpeg", ["-v", "error", "-y", "-ss", c.from.toFixed(2), "-t", (to - c.from).toFixed(2), "-i", src,
          "-vf", "scale='min(1920,iw)':-2:flags=lanczos,fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "20", "-preset", "veryfast",
          "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out]);
      }
      index.push({ mood: c.mood, name, file, from: c.from, len: to - c.from, what: c.what });
    });
  }
  const moods = [...new Set(index.map((x) => x.mood))].sort();
  const md = ["# Кадры из фильмов — индекс", "", "Моменты до 12 с, горизонтальные (≤1920 px), 30 к/с, со звуком фильма (в ролике обычно приглушать). Путь: `library/movies/<настроение>/<файл>`.", ""];
  for (const m of moods) {
    md.push(`## ${m}`, "", "| файл | что в кадре | длит. | источник |", "|---|---|---|---|");
    for (const x of index.filter((y) => y.mood === m)) md.push(`| ${x.name} | ${x.what} | ${x.len.toFixed(1)} с | ${x.file} @ ${x.from.toFixed(1)} |`);
    md.push("");
  }
  fs.writeFileSync(path.join(LIB, "INDEX.md"), md.join("\n"));
  console.log(`  моментов: ${index.length} (${moods.map((m) => `${m} ${index.filter((x) => x.mood === m).length}`).join(", ")}) → library/movies/INDEX.md`);
};

if (process.argv[2] === "cut") cut();
else {
  fs.mkdirSync(REVIEW, { recursive: true });
  const fresh = sources.filter((f) => !clips[f]);
  if (!fresh.length) console.log("  новых исходников нет — всё размечено в clips.json");
  fresh.forEach(review);
}
