// Звук: срез низов голоса, финальная громкость, библиотеки эффектов и музыки.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const measure = (file, af) => {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", `${af ? af + "," : ""}loudnorm=print_format=json`, "-f", "null", "-"], {
    encoding: "utf-8",
    maxBuffer: 1 << 26,
  });
  return JSON.parse(r.stderr.slice(r.stderr.lastIndexOf("{"), r.stderr.lastIndexOf("}") + 1));
};

const loudnorm2 = (m, { I, TP, LRA }) =>
  `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;

export const integratedLufs = (file) => +measure(file).input_i;

// Голос: только срез низов (гул, «бубнение»). Шумоподавление не используем — оно делает голос искусственным.
export const processVoice = (file, outWav, { highpassHz = 80 } = {}) => {
  const stamp = `${outWav}.json`;
  const key = JSON.stringify({ src: path.basename(file), size: fs.statSync(file).size, highpassHz });
  if (fs.existsSync(outWav) && fs.existsSync(stamp) && fs.readFileSync(stamp, "utf-8") === key) return outWav;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", file, "-vn", "-af", `highpass=f=${highpassHz}`, "-ar", "48000", "-ac", "1", outWav]);
  fs.writeFileSync(stamp, key);
  return outWav;
};

// Громкость готового ролика до −14 LUFS (Reels/TikTok): подъём уровня, ограничитель на редкие пики,
// точная линейная подгонка. Видео не перекодируется.
export const normalizeFinal = (mp4, { lufs = -14, tp = -1 } = {}) => {
  const m = measure(mp4);
  const limit = Math.pow(10, (tp - 0.5) / 20).toFixed(3);
  const pre = `volume=${(lufs - +m.input_i).toFixed(2)}dB,alimiter=limit=${limit}:attack=5:release=60:level=false`;
  const m2 = measure(mp4, pre);
  const tmp = mp4.replace(/\.mp4$/i, ".norm.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", mp4, "-c:v", "copy", "-af", `${pre},${loudnorm2(m2, { I: lufs, TP: tp, LRA: 11 })}`, "-ar", "48000", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", tmp]);
  fs.renameSync(tmp, mp4);
  return { before: +m.input_i, after: integratedLufs(mp4) };
};

const AUDIO = /\.(wav|mp3|m4a|aac|aiff?|ogg|flac)$/i;

// Эффекты по папкам-категориям: { категория: [файлы] }.
export const scanLibrary = (dir) => {
  const lib = {};
  if (!dir || !fs.existsSync(dir)) return lib;
  for (const cat of fs.readdirSync(dir)) {
    const p = path.join(dir, cat);
    if (!fs.statSync(p).isDirectory()) continue;
    const files = fs.readdirSync(p).filter((f) => AUDIO.test(f)).sort().map((f) => path.join(p, f));
    if (files.length) lib[cat.toLowerCase()] = files;
  }
  return lib;
};
export const listAudio = (dir) => (dir && fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => AUDIO.test(f)).sort().map((f) => path.join(dir, f)) : []);

// Интервалы речи для приглушения музыки под голос.
export const speechIntervals = (words, gapMs = 450) => {
  const out = [];
  for (const w of [...words].sort((a, b) => a.startMs - b.startMs)) {
    const last = out[out.length - 1];
    if (last && w.startMs - last[1] < gapMs) last[1] = Math.max(last[1], w.endMs);
    else out.push([w.startMs, w.endMs]);
  }
  return out;
};
