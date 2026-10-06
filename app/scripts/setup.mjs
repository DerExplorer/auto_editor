// Рабочие папки в корне проекта (рядом с app/), одинаково на Windows и macOS:
//   input/      ← сюда кладутся исходные видео
//   output/     ← сюда падают готовые ролики
//   sfx/ music/ reference/ — звуковые эффекты, фоновая музыка, эталонные ролики
//   clients/    ← паспорта стиля клиентов (docs/style/README.md)
// Запуск: npm run setup
// Папки в другом месте: npm run setup -- "/путь/к/папке" — тогда пути запишутся в app/local.json (в git не попадает).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(APP, "..");
const args = process.argv.slice(2);
const force = args.includes("--force");
const custom = args.find((a) => !a.startsWith("--"));

const base = path.resolve(custom ?? ROOT);
const input = path.join(base, "input");
const output = path.join(base, "output");
const sfx = path.join(base, "sfx");
const music = path.join(base, "music");
const reference = path.join(base, "reference");
const clients = path.join(base, "clients");
// Категории звуковых эффектов: на какие события монтажа они ставятся автоматически.
const SFX_CATEGORIES = {
  whoosh: "вжух — появление рамки с видео, карточки, полноэкранной инфографики, уход рамки",
  pop: "щелчок/поп — плашка, большая цифра, окошко инфографики, главное слово хука",
  ding: "дзынь — правильный ответ в карточке квиза",
  impact: "удар/бум — самое начало ролика вместе с хуком",
};

for (const d of [input, output, music, reference, clients, ...Object.keys(SFX_CATEGORIES).map((c) => path.join(sfx, c))]) fs.mkdirSync(d, { recursive: true });
const sfxReadme = path.join(sfx, "ЧТО СЮДА КЛАСТЬ.txt");
if (!fs.existsSync(sfxReadme)) {
  fs.writeFileSync(
    sfxReadme,
    [
      "Звуковые эффекты — по папкам-категориям (wav или mp3, короткие 0.1–2 с, без тишины в начале).",
      "В каждой папке лучше 3–5 разных вариантов — они чередуются, чтобы звучало не одинаково.",
      "",
      ...Object.entries(SFX_CATEGORIES).map(([c, d]) => `${c}/  — ${d}`),
      "",
      "Можно добавлять свои папки (например typing, riser, cash) — их ставим вручную по фразе в edit-файле.",
      "",
    ].join(os.EOL),
    "utf-8",
  );
}
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
      "Звуки — в sfx (по категориям), фоновая музыка — в music, эталонные ролики блогеров — в reference.",
      "План развития — ПЛАН РАЗВИТИЯ.md, правила стиля — CLAUDE.md, код — папка app.",
      "",
    ].join(os.EOL),
    "utf-8",
  );
}

// local.json нужен только если папки не в корне проекта. Существующие пути не трогаем (только с --force).
const cfgPath = path.join(APP, "local.json");
const toPosix = (p) => p.split(path.sep).join("/");
if (base !== ROOT) {
  const want = { inputDir: input, outputDir: output, sfxDir: sfx, musicDir: music, referenceDir: reference, clientsDir: clients };
  const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, "utf-8")) : {};
  for (const [k, v] of Object.entries(want)) if (force || !cfg[k]) cfg[k] = toPosix(v);
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n", "utf-8");
  console.log(`app/local.json:\n${JSON.stringify(cfg, null, 2)}`);
} else if (fs.existsSync(cfgPath)) {
  console.log(`Внимание: есть app/local.json — пути из него важнее папок проекта:\n${fs.readFileSync(cfgPath, "utf-8")}`);
}
console.log(`Папки готовы:\n  исходники → ${input}\n  результат → ${output}\n  эффекты   → ${sfx}\n  музыка    → ${music}\n  обучение  → ${reference}`);
