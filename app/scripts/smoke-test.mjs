// Смоук-тест: полная сборка и рендер на клипах из app/samples, проверка результата. Запуск: npm test
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { integratedLufs } from "./audio.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(APP, "build", "smoke");
const out = path.join(outDir, "sample.mp4");
fs.rmSync(outDir, { recursive: true, force: true });

const t0 = Date.now();
execFileSync(process.execPath, [path.join(APP, "scripts", "build.mjs"), path.join(APP, "edits", "sample.json"), "--render"], {
  stdio: "inherit",
  cwd: APP,
  env: { ...process.env, AUTO_EDITOR_OUT: outDir },
});

const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", out], { encoding: "utf-8" }));
const video = probe.streams.find((s) => s.codec_type === "video");
const audio = probe.streams.find((s) => s.codec_type === "audio");
const duration = parseFloat(probe.format.duration);
const props = JSON.parse(fs.readFileSync(path.join(APP, "build", "sample", "9x16.props.json"), "utf-8"));

let lufs;
const checks = [
  ["mp4 создан", fs.existsSync(out)],
  ["есть видео 9:16", video && Math.abs(video.width / video.height - 9 / 16) < 0.01],
  ["есть звук", !!audio],
  ["длительность 5–15 с", duration > 5 && duration < 15],
  ["речь распознана (есть субтитры)", props.subtitles.blocks.length > 3],
  ["хук, плашка и инфографика на месте", !!props.hook && props.titles.length === 1 && props.broll.length === 1],
  ["голос: только срез низов (по умолчанию)", props.segments.every((s) => s.voiceSrc && fs.existsSync(path.join(APP, "public", s.voiceSrc)))],
  ["звуковые эффекты расставлены", props.sfx.length >= 3],
  ["фоновая музыка ровным фоном (выровнена, без приглушения)", !!props.music && props.music.src.endsWith(".bg.m4a")],
  [`громкость ≈ −14 LUFS (${(lufs = integratedLufs(out)).toFixed(1)})`, Math.abs(lufs + 14) <= 1],
];
let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? "✓" : "✗"} ${name}`);
  ok &&= !!pass;
}
console.log(`\n${ok ? "Смоук-тест пройден" : "Смоук-тест НЕ пройден"} за ${((Date.now() - t0) / 1000).toFixed(0)} с → ${out}`);
process.exit(ok ? 0 : 1);
