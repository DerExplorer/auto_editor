// Внешние инструменты, одинаково на Windows и macOS: Python (python3 / python / py -3) и ffmpeg/ffprobe.
import { spawnSync } from "node:child_process";
import path from "node:path";

const isWin = process.platform === "win32";

const works = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: "utf-8", shell: false });
  return r.status === 0 ? (r.stdout || r.stderr || "").trim() : null;
};

// Python 3: можно задать явно через PYTHON=/path/to/python. На Windows «python» бывает
// заглушкой Microsoft Store, поэтому проверяем, что это действительно Python 3.
let python;
export const pythonCmd = () => {
  if (python !== undefined) return python;
  const venv = process.env.VIRTUAL_ENV;
  const candidates = [
    ...(process.env.PYTHON ? [[process.env.PYTHON, []]] : []),
    ...(venv ? [[path.join(venv, isWin ? "Scripts" : "bin", isWin ? "python.exe" : "python"), []]] : []),
    ["python3", []],
    ["python", []],
    ...(isWin ? [["py", ["-3"]]] : []),
  ];
  python = null;
  for (const [cmd, pre] of candidates) {
    if (works(cmd, [...pre, "-c", "import sys; assert sys.version_info[0] == 3; print(sys.version.split()[0])"])) {
      python = { cmd, pre };
      break;
    }
  }
  return python;
};

export const toolVersion = (bin) => works(bin, ["-version"])?.split(/\r?\n/)[0] ?? null;

// Понятная ошибка вместо «spawn ENOENT», с подсказкой по установке под текущую ОС.
export const requireTools = () => {
  const missing = [];
  for (const bin of ["ffmpeg", "ffprobe"]) if (!toolVersion(bin)) missing.push(bin);
  if (!pythonCmd()) missing.push("python3");
  if (missing.length) {
    const hint = isWin
      ? "Windows: winget install Gyan.FFmpeg  и  winget install Python.Python.3.12  (или python.org), затем перезапустить терминал"
      : "macOS: brew install ffmpeg python@3.12";
    throw new Error(`Не найдено: ${missing.join(", ")}.\n${hint}\nПроверка окружения: npm run doctor`);
  }
};
