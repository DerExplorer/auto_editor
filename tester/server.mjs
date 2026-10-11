// Тестер роликов: локальная страница для сравнения тестовых версий.
// Запуск: node tester/server.mjs  (или npm start в tester/) → http://localhost:8765
// Данные — в папке output (та же, куда монтажёр кладёт ролики):
//   tests.json      — список тестов [{ name, date, what, check }]
//   roadmap.json    — { done: [{ date, area, text }], todo: [{ area, text }] }
//   <имя>.mp4       — ролик, <имя>.stats.json — время и замеры сборки (пишет app/scripts/build.mjs)
// Без зависимостей: только Node 18+ и ffprobe (для роликов без stats.json).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PUBLIC = path.join(HERE, "public");
const local = (() => {
  const p = path.join(ROOT, "app", "local.json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {};
})();
const OUTPUT = process.env.AUTO_EDITOR_OUT ? path.resolve(process.env.AUTO_EDITOR_OUT) : local.outputDir ? path.resolve(ROOT, "app", local.outputDir) : path.join(ROOT, "output");
const PORT = Number(process.env.PORT ?? 8765);

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".mp4": "video/mp4" };

const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
};

// Сведения о файле, если у ролика нет stats.json (старые тесты): размер, длительность, разрешение. Кэш по размеру и дате.
const probeCache = new Map();
const probe = (file) => {
  const st = fs.statSync(file);
  const key = `${file}:${st.size}:${st.mtimeMs}`;
  if (probeCache.has(key)) return probeCache.get(key);
  let info = { sizeBytes: st.size, modifiedAt: st.mtime.toISOString() };
  try {
    const j = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate:format=duration,bit_rate", "-of", "json", file], { encoding: "utf8" }));
    const [n, d] = (j.streams?.[0]?.r_frame_rate ?? "0/1").split("/").map(Number);
    info = { ...info, width: j.streams?.[0]?.width, height: j.streams?.[0]?.height, fps: d ? Math.round((n / d) * 100) / 100 : null, durationMs: Math.round(Number(j.format?.duration ?? 0) * 1000), bitrate: Number(j.format?.bit_rate ?? 0) };
  } catch {
    // нет ffprobe — показываем только размер
  }
  probeCache.set(key, info);
  return info;
};

// имена роликов — буквы любого алфавита, цифры, пробел, точка, дефис, тире, скобки, запятая, кавычки, ! ?; без выхода из папки
const safeName = (name) => /^[\p{L}\p{N}_.\- —(),«»!?+']+$/u.test(name) && !name.includes("..");

const listTests = () => {
  const tests = readJson(path.join(OUTPUT, "tests.json"), []);
  return tests.map((t) => {
    const mp4 = path.join(OUTPUT, `${t.name}.mp4`);
    const exists = safeName(t.name) && fs.existsSync(mp4);
    return { ...t, exists, file: exists ? probe(mp4) : null, stats: exists ? readJson(path.join(OUTPUT, `${t.name}.stats.json`), null) : null };
  });
};

// ---------- нарезка: проекты с авто-нарезкой (edit-файлы с sections[].keep) ----------

const APP = path.join(ROOT, "app");
const FIXES = path.join(OUTPUT, "cutfix");

const cutProjects = () =>
  fs
    .readdirSync(path.join(APP, "edits"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ file: f, edit: readJson(path.join(APP, "edits", f), null) }))
    .filter(({ edit }) => edit?.sections?.some((s) => s.keep))
    .map(({ file, edit }) => ({ id: path.basename(file, ".json"), name: edit.output ?? edit.name, input: edit.inputs?.[0] }));

// Куски ролика (время в готовом и в сыром), слова по времени готового, вырезанные фразы из плана autocut.
const cutProject = (id) => {
  const edit = readJson(path.join(APP, "edits", `${id}.json`), null);
  const props = readJson(path.join(APP, "build", edit?.name ?? id, "9x16.props.json"), null);
  if (!edit || !props) return null;
  const words = props.subtitles.blocks.flatMap((b) => (b.words ?? []).filter((w) => !w.br).map((w) => ({ t: w.startMs, text: w.text })));
  const rawName = path.basename(edit.inputs[0]);
  const planFile = [path.join(ROOT, "training", "alex_raw", `${rawName}.plan.json`), path.join(ROOT, "input", `${edit.inputs[0]}.plan.json`)].find((p) => fs.existsSync(p));
  const plan = planFile ? readJson(planFile, null) : null;
  return {
    id,
    name: edit.output ?? edit.name,
    durationMs: props.durationMs,
    pieces: props.segments.map((s) => ({ outFrom: s.outFromMs, outTo: s.outToMs, srcFrom: s.srcFromMs, srcTo: s.srcToMs })),
    words,
    removed: plan ? plan.sentences.filter((s) => !s.keep).map((s) => ({ id: s.id, from: s.from, to: s.to, text: s.text, note: s.note ?? s.take ?? "" })) : [],
    fix: readJson(path.join(FIXES, `${id}.json`), { cut: [], dropPieces: [], restore: [], notes: [] }),
  };
};

const readBody = (req) =>
  new Promise((ok, fail) => {
    let s = "";
    req.on("data", (d) => (s += d));
    req.on("end", () => ok(s));
    req.on("error", fail);
  });

const send = (res, code, body, type = "application/json; charset=utf-8") => {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

// Видео с поддержкой Range — без неё браузер не может перематывать.
const sendVideo = (req, res, file) => {
  const size = fs.statSync(file).size;
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
  if (!m) {
    res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": size, "Accept-Ranges": "bytes" });
    return fs.createReadStream(file).pipe(res);
  }
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (start >= size || start > end) {
    res.writeHead(416, { "Content-Range": `bytes */${size}` });
    return res.end();
  }
  res.writeHead(206, { "Content-Type": "video/mp4", "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes" });
  fs.createReadStream(file, { start, end }).pipe(res);
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = decodeURIComponent(url.pathname);
  try {
    // старый адрес страницы сравнения (output/compare.html) — на тестер
    if (p === "/compare.html") {
      res.writeHead(302, { Location: "/" });
      return res.end();
    }
    if (p === "/api/tests") return send(res, 200, listTests());
    if (p === "/api/roadmap") return send(res, 200, readJson(path.join(OUTPUT, "roadmap.json"), { done: [], todo: [] }));
    if (p === "/api/info") return send(res, 200, { output: OUTPUT });
    if (p === "/api/cuts") return send(res, 200, cutProjects());
    if (p.startsWith("/api/cut/")) {
      const id = p.slice("/api/cut/".length);
      if (!/^[\w\-]+$/.test(id)) return send(res, 400, { error: "имя" });
      if (req.method === "POST") {
        return readBody(req).then((body) => {
          const fix = JSON.parse(body);
          fs.mkdirSync(FIXES, { recursive: true });
          fs.writeFileSync(path.join(FIXES, `${id}.json`), JSON.stringify({ ...fix, savedAt: new Date().toISOString() }, null, 1));
          send(res, 200, { ok: true });
        });
      }
      const data = cutProject(id);
      return data ? send(res, 200, data) : send(res, 404, { error: "нет проекта или сборки" });
    }
    if (p.startsWith("/video/")) {
      const name = p.slice("/video/".length);
      const file = path.join(OUTPUT, name);
      if (!safeName(name) || !name.toLowerCase().endsWith(".mp4") || !fs.existsSync(file)) return send(res, 404, { error: "нет ролика" });
      return sendVideo(req, res, file);
    }
    const rel = p === "/" ? "index.html" : p.replace(/^\/+/, "");
    const file = path.join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, "not found", "text/plain; charset=utf-8");
    return send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] ?? "application/octet-stream");
  } catch (e) {
    return send(res, 500, { error: String(e.message ?? e) });
  }
});

server.listen(PORT, "127.0.0.1", () => console.log(`Тестер: http://localhost:${PORT}  (ролики из ${OUTPUT})`));
