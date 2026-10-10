// Тестер роликов: синхронный просмотр версий, звук по клику, сведения о сборке, план работ.
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const SHOW_LAST = 6;
const FRAME = 1 / 30;
const SYNC_TOLERANCE = 0.15;

// Скрытые/показанные версии — только для этого браузера; без хранилища страница тоже работает.
const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* приватный режим */ }
  },
};

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const fmtSec = (ms) => (ms == null ? "—" : ms < 60000 ? `${(ms / 1000).toFixed(1)} с` : `${Math.floor(ms / 60000)} мин ${Math.round((ms % 60000) / 1000)} с`);
const fmtMb = (b) => (b == null ? "—" : `${(b / 2 ** 20).toFixed(1)} МБ`);
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---------- вкладки ----------

$$("[data-tab]").forEach((b) =>
  b.addEventListener("click", () => {
    $$("[data-tab]").forEach((x) => x.classList.toggle("on", x === b));
    $$(".tab").forEach((t) => t.classList.toggle("active", t.id === `tab-${b.dataset.tab}`));
    if (b.dataset.tab !== "tests") player.pauseAll();
  }),
);

// ---------- сведения о сборке ----------

const STAGES = [
  ["prepareMs", "подготовка (сжатие, речь)", "#7aa7ff"],
  ["buildMs", "план монтажа", "#9be29b"],
  ["renderMs", "рендер", "#FFC163"],
  ["normalizeMs", "громкость", "#c99bff"],
];

const statsHtml = (t) => {
  const s = t.stats;
  const f = t.file ?? {};
  const rows = (pairs) => `<dl>${pairs.filter(([, v]) => v != null && v !== "").map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;
  const video = s?.video ?? {};
  const durMs = video.durationMs ?? f.durationMs;
  let html = "";
  if (s?.timing) {
    const tm = s.timing;
    const parts = STAGES.filter(([k]) => tm[k] > 0);
    const sum = parts.reduce((a, [k]) => a + tm[k], 0) || 1;
    html += `<h4>Время сборки — ${fmtSec(tm.totalMs)}</h4>`;
    html += `<div class="bar">${parts.map(([k, , c]) => `<span style="width:${(tm[k] / sum) * 100}%;background:${c}" title="${fmtSec(tm[k])}"></span>`).join("")}</div>`;
    html += `<div class="legend">${parts.map(([k, label, c]) => `<span><i style="background:${c}"></i>${label} ${fmtSec(tm[k])}</span>`).join("")}</div>`;
    html += rows([
      ["рендер на 1 с ролика", durMs && tm.renderMs ? `${(tm.renderMs / durMs).toFixed(2)} с` : null],
      ["собран", fmtDate(s.renderedAt)],
      ["процессоров", s.host?.cpus],
    ]);
  } else {
    html += `<p class="note">Нет данных о сборке — ролик собран до того, как монтажёр начал их записывать.</p>`;
  }
  html += `<h4>Файл</h4>`;
  html += rows([
    ["длительность", durMs ? fmtTime(durMs / 1000) : null],
    ["размер кадра", video.width ? `${video.width}×${video.height}` : f.width ? `${f.width}×${f.height}` : null],
    ["кадров в секунду", f.fps],
    ["вес", fmtMb(video.sizeBytes ?? f.sizeBytes)],
    ["битрейт", f.bitrate ? `${(f.bitrate / 1e6).toFixed(1)} Мбит/с` : null],
    ["изменён", s ? null : fmtDate(f.modifiedAt)],
  ]);
  if (s?.audio) {
    const a = s.audio;
    html += `<h4>Звук</h4>`;
    html += rows([
      ["громкость", a.loudness ? `${a.loudness.before.toFixed(1)} → ${a.loudness.after.toFixed(1)} LUFS` : null],
      ["музыка", a.music ? `${a.music.track} (${a.music.relDb} дБ от голоса)` : "нет"],
      ["эффектов", a.sfx],
    ]);
  }
  if (s?.elements) {
    const e = s.elements;
    html += `<h4>В монтаже</h4>`;
    html += rows([
      ["настроение", s.mood],
      ["блоков субтитров", e.subtitleBlocks],
      ["карточек / плашек", `${e.cards} / ${e.titles}`],
      ["b-roll", e.broll],
      ["оверлеев / стикеров", `${e.overlays} / ${e.stickers}`],
      ["наездов камеры", e.cameraMoves],
      ["кусков видео", e.segments],
      ["edit-файл", s.edit],
    ]);
  }
  return html;
};

// ---------- плеер ----------

const player = {
  cells: [],
  soundIdx: -1,
  visible() { return this.cells.filter((c) => !c.el.hidden && c.ok); },
  master() { return this.cells[this.soundIdx]?.video ?? this.visible()[0]?.video ?? null; },
  setSound(i) {
    this.soundIdx = i;
    this.cells.forEach((c, k) => {
      c.video.muted = k !== i;
      c.el.classList.toggle("sound", k === i);
      $(".badge", c.el).textContent = k === i ? "🔊 звук" : "";
    });
  },
  pauseAll() { this.cells.forEach((c) => c.video.pause()); this.updatePlay(); },
  toggle() {
    const m = this.master();
    if (!m) return;
    const play = m.paused;
    this.visible().forEach((c) => (play ? c.video.play().catch(() => {}) : c.video.pause()));
    this.updatePlay(play);
  },
  updatePlay(playing = false) { $("#play").textContent = playing ? "❚❚ Пауза" : "▶ Играть все"; },
  seek(t) { this.cells.forEach((c) => { if (c.ok) c.video.currentTime = Math.max(0, Math.min(t, c.video.duration || t)); }); },
  step(frames) {
    this.pauseAll();
    const m = this.master();
    if (m) this.seek(m.currentTime + frames * FRAME);
  },
  setSpeed(r) { this.cells.forEach((c) => (c.video.playbackRate = r)); },
  // все ролики в такт ведущему (тому, что со звуком)
  tick() {
    const m = this.master();
    if (!m) return;
    const seek = $("#seek");
    seek.max = m.duration || 80;
    if (document.activeElement !== seek) seek.value = m.currentTime;
    $("#time").textContent = `${fmtTime(m.currentTime)} / ${fmtTime(m.duration || 0)}`;
    this.visible().forEach((c) => {
      const v = c.video;
      if (v === m) return;
      if (Math.abs(v.currentTime - m.currentTime) > SYNC_TOLERANCE) v.currentTime = m.currentTime;
      if (m.paused !== v.paused) m.paused ? v.pause() : v.play().catch(() => {});
    });
  },
};

const renderTests = (tests) => {
  const grid = $("#grid");
  const filters = $("#filters");
  const tpl = $("#cell-tpl");
  const saved = store.get("tester.shown", null);
  $("#empty").hidden = tests.length > 0;

  tests.forEach((t, i) => {
    const el = tpl.content.firstElementChild.cloneNode(true);
    const video = $("video", el);
    $(".title", el).textContent = t.name;
    $(".desc", el).textContent = t.what ?? "";
    $(".check", el).textContent = t.check ? `смотреть: ${t.check}` : "";
    const cell = { el, video, ok: t.exists, name: t.name };
    const missing = $(".missing", el);
    if (t.exists) video.src = `/video/${encodeURIComponent(t.name)}.mp4`;
    else {
      missing.textContent = `нет файла ${t.name}.mp4 в output`;
      missing.hidden = false;
    }
    // ролик есть, но не открылся (сервер выключен, файл перезаписывается) — сказать, а не молчать
    video.addEventListener("error", () => {
      cell.ok = false;
      missing.textContent = "ролик не загрузился — обновите страницу (F5)";
      missing.hidden = false;
    });

    const more = $(".more", el);
    const panel = $(".stats", el);
    more.setAttribute("aria-expanded", "false");
    more.addEventListener("click", () => {
      const open = panel.hidden;
      if (open && !panel.innerHTML) panel.innerHTML = statsHtml(t);
      panel.hidden = !open;
      more.setAttribute("aria-expanded", String(open));
      more.textContent = open ? "Скрыть ▴" : "Подробнее ▾";
    });

    $(".media", el).addEventListener("click", () => t.exists && player.setSound(i));

    const chip = document.createElement("button");
    chip.textContent = t.name;
    const show = (on) => {
      el.hidden = !on;
      chip.classList.toggle("on", on);
      if (on && t.exists) video.preload = "auto";
      else video.pause();
    };
    show(saved ? saved.includes(t.name) : i >= tests.length - SHOW_LAST);
    chip.addEventListener("click", () => {
      show(el.hidden);
      store.set("tester.shown", player.cells.filter((c) => !c.el.hidden).map((c) => c.name));
      if (el.hidden && player.soundIdx === i) player.setSound(player.cells.findIndex((c) => !c.el.hidden && c.ok));
    });

    grid.appendChild(el);
    filters.appendChild(chip);
    player.cells.push(cell);
  });
  player.setSound(player.cells.findIndex((c) => !c.el.hidden && c.ok));
};

$("#play").addEventListener("click", () => player.toggle());
$$("[data-jump]").forEach((b) => b.addEventListener("click", () => player.seek((player.master()?.currentTime ?? 0) + Number(b.dataset.jump))));
$$("[data-frame]").forEach((b) => b.addEventListener("click", () => player.step(Number(b.dataset.frame))));
$("#speed").addEventListener("change", (e) => player.setSpeed(Number(e.target.value)));
$("#seek").addEventListener("input", (e) => player.seek(Number(e.target.value)));
document.addEventListener("keydown", (e) => {
  if (!$("#tab-tests").classList.contains("active") || e.target.matches("input, select")) return;
  const m = player.master();
  if (e.code === "Space") { e.preventDefault(); player.toggle(); }
  else if (e.code === "ArrowRight" && m) player.seek(m.currentTime + 5);
  else if (e.code === "ArrowLeft" && m) player.seek(m.currentTime - 5);
  else if (e.key === ".") player.step(1);
  else if (e.key === ",") player.step(-1);
});
setInterval(() => player.tick(), 250);

// ---------- план ----------

const renderPlan = (plan) => {
  const row = (x, mark) => `<div class="item"><span class="mark">${mark}</span><span class="area">${esc(x.area)}${x.date ? `<i>${esc(x.date)}</i>` : ""}</span><span class="text">${esc(x.text)}</span></div>`;
  $("#todo").innerHTML = (plan.todo ?? []).map((x) => row(x, "⬜")).join("");
  $("#done").innerHTML = [...(plan.done ?? [])].reverse().map((x) => row(x, "✅")).join("");
  $("#todo-n").textContent = `· ${(plan.todo ?? []).length}`;
  $("#done-n").textContent = `· ${(plan.done ?? []).length}`;
};

const load = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
};
load("/api/tests").then(renderTests).catch((e) => { $("#empty").hidden = false; $("#empty").textContent = `Не удалось загрузить тесты: ${e.message}`; });
load("/api/roadmap").then(renderPlan).catch(() => {});
