// Лёгкая копия видео для монтажа: 30 к/с, не больше 1080×1920 (горизонтальное — не больше 1920×1080).
// Remotion читает каждый кадр исходника, и тяжёлые оригиналы с телефона заметно тормозят рендер.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const VIDEO = /\.(mp4|mov|m4v|webm|mkv)$/i;
export const isVideo = (file) => VIDEO.test(file);

export const makeProxy = (file, out) => {
  const stamp = `${out}.json`;
  const key = JSON.stringify({ size: fs.statSync(file).size, mtime: Math.round(fs.statSync(file).mtimeMs), v: 1 });
  if (fs.existsSync(out) && fs.existsSync(stamp) && fs.readFileSync(stamp, "utf-8") === key) return out;
  console.log(`  сжатие ${file} → 30 к/с, ≤1080p...`);
  const scale = "scale='if(gt(iw,ih),min(1920,iw),min(1080,iw))':-2:flags=lanczos";
  execFileSync("ffmpeg", [
    "-v", "error", "-y", "-i", file,
    "-vf", `${scale},fps=30`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
    out,
  ]);
  fs.writeFileSync(stamp, key);
  return out;
};
