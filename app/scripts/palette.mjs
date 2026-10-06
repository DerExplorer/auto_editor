// Палитра клиента из его любимых цветов → роли цветов для графики ролика (theme.ts) и слова для промптов.
// Запуск из app/: npm run palette -- "#E8B4B8" "#6B4E71" [--client anna] [--accent 2]
//   --client  — записать палитру в clients/<имя>/brand.json и превью clients/<имя>/palette.html
//   --accent  — какой из цветов главный (1, 2…); по умолчанию первый, если он не почти серый
// Цвета считаются в OKLCH: светлота и насыщенность меняются, оттенок клиента сохраняется.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------- цветовая математика (sRGB ↔ OKLab ↔ OKLCH) ----------

const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export const hexToRgb = (hex) => {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = [...h].map((x) => x + x).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`Не цвет: "${hex}" (нужен вид #RRGGBB)`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};
const rgbToHex = (rgb) => "#" + rgb.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();

const rgbToOklch = (rgb) => {
  const [r, g, b] = rgb.map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
};
const oklchToRgbRaw = ({ l: L, c, h }) => {
  const A = c * Math.cos((h * Math.PI) / 180);
  const B = c * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(toGam);
};
const inGamut = (rgb) => rgb.every((x) => x >= -0.0005 && x <= 1.0005);
// Если цвет не помещается в sRGB — снижаем насыщенность, оттенок и светлота остаются.
const oklch = (l, c, h) => {
  let lo = 0, hi = c;
  if (inGamut(oklchToRgbRaw({ l, c, h }))) return rgbToHex(oklchToRgbRaw({ l, c, h }));
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    inGamut(oklchToRgbRaw({ l, c: mid, h })) ? (lo = mid) : (hi = mid);
  }
  return rgbToHex(oklchToRgbRaw({ l, c: lo, h }));
};
export const lch = (hex) => rgbToOklch(hexToRgb(hex));

const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map(toLin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// ---------- названия цветов для промптов (английские, генераторы понимают их лучше) ----------

const HUES = [
  [15, "red"], [45, "coral"], [70, "orange"], [95, "amber"], [112, "yellow"], [135, "lime"],
  [165, "green"], [195, "teal"], [230, "turquoise"], [255, "sky blue"], [275, "blue"],
  [300, "violet"], [325, "purple"], [350, "magenta"], [361, "pink"],
];
export const colorName = (hex) => {
  const { l, c, h } = lch(hex);
  if (c < 0.025) {
    const tone = c < 0.008 ? "" : h > 40 && h < 130 ? "warm " : h > 180 && h < 290 ? "cool " : "";
    if (l > 0.95) return `${tone}off-white`;
    if (l > 0.82) return `${tone}light grey`;
    if (l > 0.55) return `${tone}grey`;
    if (l > 0.3) return `${tone}charcoal`;
    return `${tone}near-black`;
  }
  let hue = HUES.find(([to]) => h < to)[1];
  // Тёмные оранжево-жёлтые — коричневые, светлые красные — розовые, светлые жёлтые — бежевые/кремовые.
  if (h >= 30 && h < 112 && l < 0.55) hue = c < 0.08 ? "taupe brown" : "brown";
  else if (h >= 40 && h < 112 && l > 0.85 && c < 0.07) hue = "beige";
  else if ((h < 30 || h >= 350) && l > 0.7) hue = "pink";
  else if (h >= 255 && h < 290 && l < 0.4) hue = "navy blue";
  else if (h >= 95 && h < 112 && c < 0.1 && l > 0.7) hue = "champagne";
  else if (h >= 60 && h < 112 && c < 0.12 && l >= 0.55) hue = "gold";
  const sat = c < 0.06 ? "dusty " : c > 0.17 ? "vivid " : "";
  const light = l > 0.88 ? "pale " : l > 0.76 ? "soft " : l < 0.38 ? "deep " : l < 0.5 ? "dark " : "";
  return `${light}${sat}${hue}`.replace("pale dusty", "pale muted").trim();
};

// ---------- палитра ----------

// Роли совпадают с ключами C в src/theme.ts.
export const makePalette = (colors, { accentIndex } = {}) => {
  if (!colors.length) throw new Error("Нужен хотя бы один цвет");
  const hexes = colors.map((x) => rgbToHex(hexToRgb(x)));
  const info = hexes.map((hex) => ({ hex, ...lch(hex) }));
  const notes = [];

  // Главный акцент: указанный, иначе первый, а если он почти серый — самый насыщенный.
  let ai = accentIndex != null ? accentIndex : 0;
  if (accentIndex == null && info[0].c < 0.04) {
    ai = info.reduce((best, x, i) => (x.c > info[best].c ? i : best), 0);
    if (ai !== 0) notes.push(`${hexes[0]} почти серый — акцентом не сработает, главным взят ${hexes[ai]}`);
  }
  const acc = info[ai];
  if (acc.c < 0.015) notes.push(`все цвета почти серые — акцент ${acc.hex} будет еле заметен; спросить клиента о ярком цвете`);
  const h = acc.h;
  const tint = Math.min(0.014, acc.c * 0.12); // нейтрали слегка в оттенок акцента: тёплый/холодный серый

  // Бледный цвет в видео теряется рядом с белыми субтитрами — усиливаем насыщенность, оттенок тот же.
  let accent = acc.hex;
  if (acc.c >= 0.015 && acc.c < 0.09 && acc.l > 0.72) {
    accent = oklch(Math.min(acc.l, 0.8), 0.1, h);
    notes.push(`акцент ${acc.hex} бледный — для видео усилен до ${accent}; на обложках и аватарке можно исходный`);
  }
  const A = lch(accent);
  const accentDeep = oklch(Math.max(0.3, A.l - 0.09), A.c * 1.08, h);
  const ink = oklch(0.2, tint, h);
  const onAccent = contrast(accent, ink) >= 4.5 ? ink : contrast(accent, "#FFFFFF") >= contrast(accent, ink) ? "#FFFFFF" : ink;
  if (contrast(accent, onAccent) < 4.5) notes.push(`текст на акценте читается слабо (контраст ${contrast(accent, onAccent).toFixed(1)}): на плашках делать текст крупнее и жирнее`);

  // Подсветка слова в субтитрах — на тёмном видео под градиентом; нужен светлый вариант акцента.
  let hl = accent;
  for (let L = A.l; contrast(hl, "#121212") < 7 && L < 0.97; L += 0.01) hl = oklch(L, Math.max(A.c, 0.08), h);
  if (hl !== accent) notes.push(`акцент тёмный для субтитров на видео — подсветка слова светлее: ${hl}`);

  const palette = {
    accent,
    accentDeep,
    onAccent,
    highlight: hl,
    ink,
    text: oklch(0.3, tint, h),
    muted: oklch(0.56, tint * 0.8, h),
    bg: oklch(0.985, Math.min(0.006, tint * 0.5), h),
    grey: oklch(0.885, tint * 0.6, h),
    blob: oklch(0.915, tint * 0.6, h),
  };

  // Остальные любимые цвета — для обложек, аватарок и промптов. В графике ролика акцент один.
  const support = info.filter((_, i) => i !== ai).map((x) => x.hex);
  for (const s of support) {
    const d = Math.abs(((lch(s).h - h + 540) % 360) - 180);
    if (lch(s).c > 0.04 && d < 12 && Math.abs(lch(s).l - acc.l) < 0.08) notes.push(`${s} почти совпадает с акцентом — как второй цвет не нужен`);
  }
  const warmth = acc.c < 0.04 ? "нейтральная" : h < 120 || h > 340 ? "тёплая" : h > 180 && h < 300 ? "холодная" : "смешанная";

  return {
    source: hexes,
    ...palette,
    support,
    words: [acc.hex, ...support].map((x) => `${colorName(x)} (${x})`),
    temperature: warmth,
    notes,
  };
};

// ---------- превью: так палитра выглядит в ролике ----------

export const previewHtml = (p, title = "Палитра") => {
  const sw = (name, hex, sub = "") =>
    `<div class="sw"><div class="chip" style="background:${hex}"></div><b>${name}</b><span>${hex}${sub ? " · " + sub : ""}</span></div>`;
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><title>${title}</title>
<style>
body{margin:0;padding:24px;background:#EDEDED;font-family:Inter,Arial,sans-serif;color:#222}
h1{font:800 22px "Inter Tight",Arial,sans-serif;margin:0 0 16px}
.row{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:24px}
.sw{width:128px;font-size:12px}.sw b{display:block;margin-top:6px}.sw span{color:#666}
.chip{height:64px;border-radius:14px;box-shadow:0 6px 18px rgba(0,0,0,.12)}
.frames{display:flex;flex-wrap:wrap;gap:20px}
.frame{width:270px;height:480px;border-radius:18px;position:relative;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.25);
 background:linear-gradient(160deg,#6d6f73,#3a3c40 55%,#1b1c1f)}
.face{position:absolute;left:85px;top:110px;width:100px;height:130px;border-radius:50%;background:#c9a28c;opacity:.85}
.hook{position:absolute;top:26px;left:0;right:0;text-align:center;font:900 26px/1.05 "Inter Tight",Arial,sans-serif;color:#fff;text-transform:uppercase}
.pill{display:inline-block;background:${p.accent};color:${p.onAccent};padding:2px 12px 4px;border-radius:999px;transform:rotate(-3deg);box-shadow:0 8px 20px rgba(0,0,0,.35)}
.grad{position:absolute;left:0;right:0;bottom:0;height:40%;background:linear-gradient(transparent,rgba(0,0,0,.78))}
.subs{position:absolute;left:30px;right:30px;bottom:110px;text-align:center;font:800 20px/1.15 "Inter Tight",Arial,sans-serif;color:#fff;text-shadow:0 2px 12px rgba(0,0,0,.6)}
.subs i{font-style:normal;color:${p.highlight}}
.card{position:absolute;left:22px;right:22px;top:40px;background:${p.bg};border-radius:22px;padding:18px;box-shadow:0 18px 50px rgba(0,0,0,.45)}
.card h3{margin:0 0 4px;font:800 18px "Inter Tight",Arial,sans-serif;color:${p.ink}}.card p{margin:0 0 12px;font-size:12px;color:${p.muted}}
.bars{display:flex;align-items:flex-end;gap:10px;height:120px}.bars div{flex:1;border-radius:6px;background:${p.grey}}.bars div:last-child{background:${p.accent}}
.opt{margin-top:8px;padding:6px 12px;border-radius:999px;font-size:13px;background:rgba(255,255,255,.12);color:#fff}
.opt.on{background:${p.accent};color:${p.onAccent};font-weight:700}.opt b{color:${p.highlight};margin-right:6px}.opt.on b{color:${p.onAccent}}
.inset{position:absolute;left:30px;right:30px;top:265px;height:120px;border-radius:14px;border:3px solid ${p.accentDeep};background:#555}
.notes{margin-top:24px;font-size:13px;max-width:880px}
</style>
<h1>${title}</h1>
<div class="row">${[
    sw("accent — акцент", p.accent, `текст на нём ${p.onAccent === "#FFFFFF" ? "белый" : "тёмный"}`),
    sw("accentDeep — обводка", p.accentDeep),
    sw("highlight — слово в субтитрах", p.highlight),
    sw("ink — чернила", p.ink),
    sw("text", p.text),
    sw("muted", p.muted),
    sw("bg — карточки", p.bg),
    sw("grey", p.grey),
  ].join("")}</div>
${p.support.length ? `<div class="row">${p.support.map((x) => sw("доп. (обложки)", x)).join("")}</div>` : ""}
<div class="frames">
 <div class="frame"><div class="face"></div><div class="hook">как вырасти<br><span class="pill">в 2 раза</span><br>за месяц</div><div class="grad"></div>
  <div class="subs">и вот здесь <i>главное</i> слово</div></div>
 <div class="frame"><div class="face" style="top:40px"></div><div class="inset"></div><div class="grad"></div><div class="subs" style="bottom:60px">видео в <i>рамке</i></div></div>
 <div class="frame" style="background:#2a2b2e"><div class="card"><h3>Рост заявок</h3><p>за 4 месяца</p><div class="bars"><div style="height:30%"></div><div style="height:45%"></div><div style="height:60%"></div><div style="height:100%"></div></div></div>
  <div style="position:absolute;left:22px;right:22px;top:280px"><div class="opt"><b>А</b>в 2 раза</div><div class="opt on"><b>Б</b>в 3 раза</div><div class="opt"><b>В</b>не изменилось</div></div></div>
</div>
<div class="notes"><b>Для промптов:</b> ${p.words.join(", ")} · гамма ${p.temperature}${p.notes.length ? `<br><b>Заметки:</b><br>${p.notes.map((n) => "• " + n).join("<br>")}` : ""}</div>
</html>`;
};

// ---------- запуск из командной строки ----------

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const argv = process.argv.slice(2);
  const opt = (k) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv.splice(i, 2)[1] : undefined;
  };
  const client = opt("--client");
  const accentArg = opt("--accent");
  const colors = argv.flatMap((a) => a.split(/[\s,;]+/)).filter(Boolean);
  if (!colors.length) {
    console.error('Usage: npm run palette -- "#E8B4B8" "#6B4E71" [--client имя] [--accent 2]');
    process.exit(1);
  }
  const p = makePalette(colors, { accentIndex: accentArg ? Number(accentArg) - 1 : undefined });

  const roles = ["accent", "accentDeep", "onAccent", "highlight", "ink", "text", "muted", "bg", "grey", "blob"];
  for (const r of roles) console.log(`  ${r.padEnd(11)} ${p[r]}`);
  if (p.support.length) console.log(`  доп. цвета  ${p.support.join(" ")}  (обложки и промпты)`);
  console.log(`  в промпт:   ${p.words.join(", ")}`);
  console.log(`  гамма:      ${p.temperature}`);
  p.notes.forEach((n) => console.log(`  ! ${n}`));

  let dir = path.join(APP, "build");
  if (client) {
    const localCfg = fs.existsSync(path.join(APP, "local.json")) ? JSON.parse(fs.readFileSync(path.join(APP, "local.json"), "utf-8")) : {};
    const clientsDir = process.env.AUTO_EDITOR_CLIENTS ? path.resolve(process.env.AUTO_EDITOR_CLIENTS) : localCfg.clientsDir ? path.resolve(APP, localCfg.clientsDir) : path.join(APP, "..", "clients");
    dir = path.join(clientsDir, client);
    fs.mkdirSync(dir, { recursive: true });
    const brandPath = path.join(dir, "brand.json");
    const brand = fs.existsSync(brandPath)
      ? JSON.parse(fs.readFileSync(brandPath, "utf-8"))
      : JSON.parse(fs.readFileSync(path.join(APP, "..", "docs", "style", "client-template", "brand.json"), "utf-8"));
    brand.favoriteColors = p.source;
    brand.palette = Object.fromEntries([...roles, "support", "words", "temperature"].map((k) => [k, p[k]]));
    fs.writeFileSync(brandPath, JSON.stringify(brand, null, 2) + "\n", "utf-8");
    const prof = path.join(dir, "profile.md");
    if (!fs.existsSync(prof)) fs.copyFileSync(path.join(APP, "..", "docs", "style", "client-template", "profile.md"), prof);
    console.log(`  → ${brandPath}`);
  }
  fs.mkdirSync(dir, { recursive: true });
  const html = path.join(dir, "palette.html");
  fs.writeFileSync(html, previewHtml(p, client ? `Палитра: ${client}` : "Палитра"), "utf-8");
  console.log(`  превью → ${html}`);
}
