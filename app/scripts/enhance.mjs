// ИИ-улучшение слабого исходника перед монтажом (Real-ESRGAN, модель 4xLSDIRCompactC3 — сохраняет фактуру кожи).
// Только для видео низкого качества и только после согласия пользователя (правило в CLAUDE.md).
// Запуск из app/: npm run enhance -- "<путь к видео>" [--model 4xLSDIRCompactC3] [--seconds 10]
// Результат — копия рядом с оригиналом: <имя>.ai.mp4 (1080 по ширине, 30 к/с, звук оригинала). Оригинал не трогается.
// Кадры обрабатываются кусками по CHUNK штук: увеличенные PNG весят ~20 МБ, весь ролик целиком не поместился бы на диск.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(APP, "..");
const EXE = path.join(ROOT, "tools", "realesrgan", process.platform === "win32" ? "realesrgan-ncnn-vulkan.exe" : "realesrgan-ncnn-vulkan");
const CHUNK = 100;

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const input = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!input) {
  console.error('Usage: npm run enhance -- "<видео>" [--model 4xLSDIRCompactC3] [--seconds N]');
  process.exit(1);
}
const src = [path.resolve(process.cwd(), input), path.resolve(ROOT, "input", input), path.resolve(ROOT, input)].find((p) => fs.existsSync(p));
if (!src) throw new Error(`Нет файла: ${input}`);
if (!fs.existsSync(EXE)) throw new Error(`Нет Real-ESRGAN: ${EXE} (скачать ncnn-vulkan с github.com/xinntao/Real-ESRGAN/releases в tools/realesrgan)`);
const model = opt("model", "4xLSDIRCompactC3");
const seconds = opt("seconds", null);
const out = src.replace(/\.[^.]+$/, seconds ? `.ai-${seconds}s.mp4` : ".ai.mp4");

const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", src], { encoding: "utf8" }));
const { width, height } = probe.streams[0];
const durationS = seconds ? Number(seconds) : Number(probe.format.duration);
const total = Math.round(durationS * 30);
console.log(`  ${path.basename(src)}: ${width}×${height}, ${durationS.toFixed(1)} с, ${total} кадров → модель ${model}`);

const work = fs.mkdtempSync(path.join(os.tmpdir(), "enhance-"));
const parts = [];
const t0 = Date.now();
try {
  for (let start = 0, k = 0; start < total; start += CHUNK, k++) {
    const n = Math.min(CHUNK, total - start);
    const inDir = path.join(work, "in");
    const upDir = path.join(work, "up");
    for (const d of [inDir, upDir]) fs.rmSync(d, { recursive: true, force: true }), fs.mkdirSync(d);
    // кадры куска (30 к/с, как во всём монтаже)
    execFileSync("ffmpeg", ["-v", "error", "-ss", (start / 30).toFixed(3), "-i", src, "-vf", "fps=30", "-frames:v", String(n), path.join(inDir, "%05d.png")]);
    const r = spawnSync(EXE, ["-i", inDir, "-o", upDir, "-n", model, "-s", "4", "-f", "png"], { cwd: path.dirname(EXE), encoding: "utf8" });
    if (r.status !== 0) throw new Error(`Real-ESRGAN: ${r.stderr?.slice(-300)}`);
    // увеличенный кусок → 1080 по ширине (у горизонтальных — 1920), без звука
    const part = path.join(work, `part${String(k).padStart(4, "0")}.mp4`);
    const scale = width > height ? "scale=1920:-2:flags=lanczos" : "scale=1080:-2:flags=lanczos";
    execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", "30", "-i", path.join(upDir, "%05d.png"), "-vf", `${scale},format=yuv420p`, "-c:v", "libx264", "-preset", "slow", "-crf", "16", part]);
    parts.push(part);
    const done = Math.min(total, start + n);
    const spent = (Date.now() - t0) / 1000;
    console.log(`  ${done}/${total} кадров, ${spent.toFixed(0)} с, осталось ≈${((spent / done) * (total - done) / 60).toFixed(1)} мин`);
  }
  // склейка кусков + звук оригинала
  const list = path.join(work, "list.txt");
  fs.writeFileSync(list, parts.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"));
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-i", src, "-map", "0:v", "-map", "1:a?", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", durationS.toFixed(3), "-movflags", "+faststart", out]);
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
console.log(`  готово за ${((Date.now() - t0) / 60000).toFixed(1)} мин → ${out}`);
