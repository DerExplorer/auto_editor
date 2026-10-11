// Лицо в кадре (детектор YuNet, scripts/faces.py):
// 1) кадрирование по умолчанию — средне-общий план: кадр увеличен так, чтобы человек занимал ≈35–40% кадра
//    (лицо ≈10% высоты), и сдвинут, чтобы лицо было ближе к центру (правило пользователя 11.10);
// 2) проверка готового монтажа: не закрывает ли текст лицо (faceCheck — рендер без текста и маска текста).
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pythonCmd } from "./tools.mjs";

export const FRAMING_DEFAULTS = {
  faceHeightPct: 0.1, // высота лица в кадре: ≈10% — человек сидя занимает ≈35–40% кадра (средне-общий план)
  faceXPct: 0.5, // куда ставить центр лица по ширине (насколько позволяет кадр)
  faceYPct: 0.36, // и по высоте — глаза около линии y≈640 из 1920
  maxScale: 1.6, // сильнее не увеличиваем — теряется качество
};

const run = (args) => {
  const py = pythonCmd();
  return execFileSync(py.cmd, [...py.pre, path.join("scripts", "faces.py"), ...args], { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" }, stdio: ["ignore", "pipe", "ignore"] });
};

// Где лицо в исходнике (копия в public/), раз в секунду; кэш в build/cache.
export function faceTrack(publicSrc) {
  const file = path.join("public", publicSrc);
  const st = fs.statSync(file);
  const cache = path.join("build", "cache", `${path.basename(file)}-${st.size}.faces.json`);
  if (!fs.existsSync(cache)) {
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    process.stdout.write(run(["track", file, cache, "--fps", "1"]));
  }
  return JSON.parse(fs.readFileSync(cache, "utf-8"));
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

// Постоянное кадрирование по лицу за весь ролик (медиана по кускам монтажа).
// Возвращает { framing: {scale, x, y}, focus: {x, y} } или null (лица нет, не вертикаль, человек уже крупный).
export function planFraming(segs, cfg, frame) {
  if (cfg === false) return null;
  const c = { ...FRAMING_DEFAULTS, ...cfg };
  const faces = [];
  for (const src of new Set(segs.map((s) => s.src))) {
    const tr = faceTrack(src);
    if (Math.abs(tr.w / tr.h - frame.width / frame.height) > 0.02) return { info: "кадрирование по лицу пропущено: исходник не 9:16" };
    const mine = segs.filter((s) => s.src === src);
    for (const f of tr.frames) if (mine.some((s) => f.ms >= s.srcFromMs && f.ms < s.srcToMs)) faces.push(f.face);
  }
  const found = faces.filter(Boolean);
  if (found.length < Math.max(3, faces.length * 0.5)) return { info: `кадрирование по лицу пропущено: лицо найдено в ${found.length}/${faces.length} кадров` };
  const fx = median(found.map((f) => f[0] + f[2] / 2));
  const fy = median(found.map((f) => f[1] + f[3] / 2));
  const fh = median(found.map((f) => f[3]));
  const scale = Math.min(c.maxScale, Math.max(1, c.faceHeightPct / fh));
  const clamp = (v) => Math.min(0, Math.max(1 - scale, v));
  const x = clamp(c.faceXPct - scale * fx);
  const y = clamp(c.faceYPct - scale * fy);
  const r = (v) => Math.round(v * 1000) / 1000;
  return {
    framing: { scale: r(scale), x: r(x), y: r(y) },
    focus: { x: r(fx), y: r(fy) },
    info: `кадр: ×${scale.toFixed(2)}, лицо ${(fh * 100).toFixed(1)}% → ${(fh * scale * 100).toFixed(1)}% высоты, центр лица x ${fx.toFixed(2)} → ${(x + scale * fx).toFixed(2)}`,
  };
}

// Проверка наложения текста на лицо: два быстрых рендера в 1/4 размера (без текста и маска текста) → faces.py check.
export function faceCheck(propsPath, dir) {
  const props = JSON.parse(fs.readFileSync(propsPath, "utf-8"));
  const paths = {};
  for (const mode of ["clean", "mask"]) {
    const p = path.join(dir, `${mode}.props.json`);
    fs.writeFileSync(p, JSON.stringify({ ...props, debug: mode }), "utf-8");
    paths[mode] = path.join(dir, `${mode}.mp4`);
    execSync(`npx --no-install remotion render src/index.ts Edit "${paths[mode]}" --props="${p}" --scale=0.25 --muted --log=error`, { stdio: "inherit" });
  }
  const out = path.join(dir, "facecheck.json");
  const shots = path.join(dir, "facecheck");
  fs.rmSync(shots, { recursive: true, force: true });
  process.stdout.write(run(["check", paths.clean, paths.mask, out, "--fps", "5", "--shots", shots]));
  return JSON.parse(fs.readFileSync(out, "utf-8"));
}
