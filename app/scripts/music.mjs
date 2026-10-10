// Индекс музыки для авто-подбора: разброс громкости (LRA, LU) и средняя громкость каждого трека.
// Чем меньше LRA, тем ровнее трек — такие берёт "music": "auto" (фон, который не отвлекает).
// Запуск из app/: npm run music-index  (новые треки досчитываются, старые берутся из music/tracks.json)
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const local = fs.existsSync(path.join(ROOT, "app", "local.json")) ? JSON.parse(fs.readFileSync(path.join(ROOT, "app", "local.json"), "utf8")) : {};
const MUSIC = process.env.AUTO_EDITOR_MUSIC ?? local.musicDir ?? path.join(ROOT, "music");
const OUT = path.join(MUSIC, "tracks.json");
const AUDIO = /\.(mp3|wav|m4a|aac|flac|ogg)$/i;

const ebur = (file) => {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-vn", "-af", "ebur128", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 28 });
  const tail = r.stderr.slice(r.stderr.lastIndexOf("Summary:"));
  const num = (re) => Number((tail.match(re) ?? [])[1]);
  const dur = Number((r.stderr.match(/Duration: (\d+):(\d+):([\d.]+)/) ?? []).slice(1).reduce((s, x, i) => s + Number(x) * [3600, 60, 1][i], 0));
  return { lufs: num(/I:\s+(-?[\d.]+) LUFS/), lra: num(/LRA:\s+([\d.]+) LU/), durationS: Math.round(dur) };
};

const old = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const res = {};
for (const mood of fs.readdirSync(MUSIC).filter((d) => fs.statSync(path.join(MUSIC, d)).isDirectory())) {
  for (const f of fs.readdirSync(path.join(MUSIC, mood)).filter((f) => AUDIO.test(f))) {
    const rel = `${mood}/${f}`;
    const st = fs.statSync(path.join(MUSIC, rel));
    res[rel] = old[rel]?.size === st.size ? old[rel] : { ...ebur(path.join(MUSIC, rel)), size: st.size };
  }
}
fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
const by = {};
for (const [rel, t] of Object.entries(res)) (by[rel.split("/")[0]] ??= []).push(t.lra);
for (const [m, l] of Object.entries(by)) console.log(`  ${m}: ${l.length} треков, ровных (LRA ≤ 6): ${l.filter((x) => x <= 6).length}`);
console.log(`  → ${path.relative(ROOT, OUT)}`);
