// Рабочие папки пользователя на рабочем столе (Windows и macOS):
//   ~/Desktop/Apps/auto_editor/input   ← сюда кладутся исходные видео
//   ~/Desktop/Apps/auto_editor/output  ← сюда падают готовые ролики
// и app/local.json с путями к ним (файл локальный, в git не попадает).
// Запуск: npm run setup            (другая папка: npm run setup -- "/путь/к/папке"; перезаписать настройки: --force)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const force = args.includes("--force");
const custom = args.find((a) => !a.startsWith("--"));

// На Windows рабочий стол иногда перенесён в OneDrive.
const desktop = [path.join(os.homedir(), "Desktop"), path.join(os.homedir(), "OneDrive", "Desktop")].find((d) => fs.existsSync(d)) ?? path.join(os.homedir(), "Desktop");
const base = path.resolve(custom ?? path.join(desktop, "Apps", "auto_editor"));
const input = path.join(base, "input");
const output = path.join(base, "output");

fs.mkdirSync(input, { recursive: true });
fs.mkdirSync(output, { recursive: true });
const howto = path.join(base, "КАК ПОЛЬЗОВАТЬСЯ.txt");
if (!fs.existsSync(howto)) {
  fs.writeFileSync(
    howto,
    [
      "auto_editor — монтажёр рилсов",
      "",
      "1. Положите видео в папку input (можно в подпапку на каждый ролик).",
      "2. Напишите в чате Claude, какие файлы загрузили и что с ними сделать.",
      "3. Готовый ролик появится в папке output.",
      "",
      `Код приложения: ${path.resolve(APP, "..")}  (GitHub: DerExplorer/auto_editor)`,
      "",
    ].join(os.EOL),
    "utf-8",
  );
}

const cfgPath = path.join(APP, "local.json");
const toPosix = (p) => p.split(path.sep).join("/");
if (fs.existsSync(cfgPath) && !force) {
  console.log(`app/local.json уже есть — не трогаю (перезаписать: npm run setup -- --force):\n${fs.readFileSync(cfgPath, "utf-8")}`);
} else {
  fs.writeFileSync(cfgPath, JSON.stringify({ inputDir: toPosix(input), outputDir: toPosix(output) }, null, 2) + "\n", "utf-8");
  console.log(`app/local.json записан.`);
}
console.log(`Папки готовы:\n  исходники → ${input}\n  результат → ${output}`);
