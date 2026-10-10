// Раскладывает ресурсы анимаций (PhoneDemo, GdpDemo) из library/ и sfx/ в public/phone и public/gdp.
// Копии в git не попадают (лицензии библиотеки, платный SF Pro) — на новой машине: npm run anim-assets.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve("..");
const LIB = path.join(ROOT, "library");
const SFX = path.join(ROOT, "sfx");

// куда (в public) ← откуда
const FILES = {
  "phone/sf-regular.ttf": `${LIB}/fonts/families/SF Pro Text/SFPROTEXT-REGULAR.TTF`,
  "phone/sf-semibold.ttf": `${LIB}/fonts/families/SF Pro Text/SFPROTEXT-SEMIBOLD.TTF`,
  "phone/sf-bold.ttf": `${LIB}/fonts/families/SF Pro Text/SFPROTEXT-BOLD.TTF`,
  "phone/tap.mp3": `${SFX}/click/sch-button-1.mp3`,
  "phone/switch.mp3": `${SFX}/click/switch.mp3`,
  "phone/whoosh.mp3": `${SFX}/whoosh/swish-3.mp3`,
  "phone/swipe.mp3": `${SFX}/whoosh/fast-classic-simple-whoosh.mp3`,
  "phone/leak-warm.mp4": `${LIB}/transitions/light-leak-warm.mp4`,
  "phone/leak-white.mp4": `${LIB}/transitions/light-leak-white.mp4`,
  "gdp/whoosh.mp3": `${SFX}/whoosh/swish-3.mp3`,
  "gdp/swipe.mp3": `${SFX}/whoosh/fast-classic-simple-whoosh.mp3`,
  "gdp/pop.mp3": `${SFX}/pop/pop-2.mp3`,
  "gdp/pop2.mp3": `${SFX}/pop/pop-18.mp3`,
};
// логотипы приложений: имя в сцене → файл в library/icons/social
const LOGOS = { telegram: "telegram", instagram: "instagram", youtube: "youtube2", tiktok: "tik-tok", vk: "vkontakte", spotify: "spotify", pinterest: "pinterest", discord: "discord (1)", twitch: "twitch", snapchat: "snapchat" };
for (const [name, file] of Object.entries(LOGOS)) FILES[`phone/${name}.png`] = `${LIB}/icons/social/${file}.png`;
for (const flag of ["usa", "uk", "france", "germany", "italy"]) FILES[`gdp/${flag}.webm`] = `${LIB}/stickers/flags/${flag}.webm`;

const missing = [];
for (const [dst, src] of Object.entries(FILES)) {
  const out = path.join("public", dst);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (!fs.existsSync(src)) missing.push(src);
  else if (!fs.existsSync(out)) fs.copyFileSync(src, out);
}
// рамка iPhone 14 Pro — уменьшенная вдвое копия
const frame = path.join("public", "phone", "frame.png");
const frameSrc = `${LIB}/iphone/devices/iPhone 14 Pro - Deep Purple - Portrait.png`;
if (!fs.existsSync(frame)) {
  if (fs.existsSync(frameSrc)) execFileSync("ffmpeg", ["-v", "error", "-y", "-i", frameSrc, "-vf", "scale=874:-1", frame]);
  else missing.push(frameSrc);
}
console.log(missing.length ? `Нет в библиотеке:\n  ${missing.join("\n  ")}` : "Ресурсы анимаций на месте: public/phone, public/gdp");
