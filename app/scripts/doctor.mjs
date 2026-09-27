// Проверка окружения: node, ffmpeg/ffprobe, Python 3 + faster-whisper, npm-зависимости, шрифты.
// Запуск: npm run doctor
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pythonCmd, toolVersion } from "./tools.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mac = process.platform === "darwin";
let failed = 0;

const check = (name, ok, detail, fix) => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) {
    failed++;
    if (fix) console.log(`    → ${fix}`);
  }
};

console.log(`Платформа: ${process.platform} ${process.arch}\n`);

const nodeMajor = +process.versions.node.split(".")[0];
check("Node.js ≥ 20", nodeMajor >= 20, process.versions.node, mac ? "brew install node" : "https://nodejs.org (LTS)");

for (const bin of ["ffmpeg", "ffprobe"]) {
  const v = toolVersion(bin);
  check(bin, !!v, v ?? "не найден в PATH", mac ? "brew install ffmpeg" : "winget install Gyan.FFmpeg (и перезапустить терминал)");
}

const py = pythonCmd();
check("Python 3", !!py, py ? [py.cmd, ...py.pre].join(" ") : "не найден", mac ? "brew install python@3.12" : "winget install Python.Python.3.12");
if (py) {
  const r = spawnSync(py.cmd, [...py.pre, "-c", "import faster_whisper; print(faster_whisper.__version__)"], { encoding: "utf-8" });
  const pip = `${[py.cmd, ...py.pre].join(" ")} -m pip install -r requirements.txt`;
  check("faster-whisper", r.status === 0, r.status === 0 ? r.stdout.trim() : "не установлен", mac ? `${pip}  (если pip ругается на «externally managed» — сделайте venv, см. README)` : pip);
}

check("npm-зависимости", fs.existsSync(path.join(APP, "node_modules", "remotion")), "", "npm ci");

const fonts = ["Inter-cyrillic", "Inter-latin", "InterTight-cyrillic", "InterTight-latin"];
check("шрифты", fonts.every((f) => fs.existsSync(path.join(APP, "public", "fonts", `${f}.woff2`))), "", "восстановите app/public/fonts из репозитория");

console.log(failed ? `\nПроблем: ${failed}. Исправьте и запустите снова.` : "\nВсё готово. Смоук-тест: npm test");
process.exit(failed ? 1 : 0);
