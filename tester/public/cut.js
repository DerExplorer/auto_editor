// Вкладка «Нарезка»: правки к авто-нарезке — вырезать отрезок, убрать кусок, вернуть вырезанную фразу, заметка.
// Правки сохраняются на сервер (output/cutfix/<проект>.json); Claude применяет их и учит на них модель нарезки.
const $ = (s) => document.querySelector(s);
const FRAME = 1 / 30;
const video = $("#cut-video");
let P = null; // проект: { id, name, durationMs, pieces, words, removed, fix }
let mark = { in: null, out: null };

const fmt = (sec) => `${Math.floor(sec / 60)}:${(sec % 60).toFixed(1).padStart(4, "0")}`;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const now = () => video.currentTime * 1000;
const pieceAt = (ms) => P.pieces.findIndex((p) => ms >= p.outFrom && ms < p.outTo);

// ---------- сохранение ----------

let saveTimer = null;
const save = () => {
  clearTimeout(saveTimer);
  $("#cut-status").textContent = "· сохраняю…";
  saveTimer = setTimeout(async () => {
    try {
      const r = await fetch(`/api/cut/${P.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(P.fix) });
      $("#cut-status").textContent = r.ok ? "· сохранено" : "· не сохранилось";
    } catch {
      $("#cut-status").textContent = "· сервер недоступен";
    }
  }, 300);
};

// ---------- отрисовка ----------

const renderTimeline = () => {
  const tl = $("#cut-timeline");
  const D = P.durationMs;
  tl.querySelectorAll(".cut-piece, .cut-mark, .cut-note-dot").forEach((e) => e.remove());
  P.pieces.forEach((p, i) => {
    const el = document.createElement("div");
    el.className = "cut-piece" + (P.fix.dropPieces.includes(i) ? " dropped" : "");
    el.style.left = `${(p.outFrom / D) * 100}%`;
    el.style.width = `${((p.outTo - p.outFrom) / D) * 100}%`;
    el.title = `кусок ${i + 1}: сырое ${fmt(p.srcFrom / 1000)}–${fmt(p.srcTo / 1000)}`;
    tl.appendChild(el);
  });
  const addMark = (a, b, cls) => {
    const el = document.createElement("div");
    el.className = `cut-mark ${cls}`;
    el.style.left = `${(Math.min(a, b) / D) * 100}%`;
    el.style.width = `${(Math.abs(b - a) / D) * 100}%`;
    tl.appendChild(el);
  };
  P.fix.cut.forEach((c) => addMark(c.from, c.to, ""));
  if (mark.in != null) addMark(mark.in, mark.out ?? now(), "pending");
  P.fix.notes.forEach((n) => {
    const el = document.createElement("div");
    el.className = "cut-note-dot";
    el.style.left = `${(n.t / D) * 100}%`;
    tl.appendChild(el);
  });
};

const renderFixes = () => {
  const items = [
    ...P.fix.cut.map((c, k) => ({ t: c.from, html: `✂ ${fmt(c.from / 1000)}–${fmt(c.to / 1000)} ${esc(c.comment)}`, del: () => P.fix.cut.splice(k, 1) })),
    ...P.fix.dropPieces.map((i, k) => ({ t: P.pieces[i].outFrom, html: `⊘ кусок ${i + 1} целиком`, del: () => P.fix.dropPieces.splice(k, 1) })),
    ...P.fix.restore.map((id, k) => {
      const r = P.removed.find((x) => x.id === id);
      return { t: 0, html: `↺ вернуть: «${esc(r?.text?.slice(0, 60))}»`, del: () => P.fix.restore.splice(k, 1) };
    }),
    ...P.fix.notes.map((n, k) => ({ t: n.t, html: `📝 ${esc(n.text)}`, del: () => P.fix.notes.splice(k, 1) })),
  ].sort((a, b) => a.t - b.t);
  const box = $("#cut-fixes");
  box.innerHTML = items.length ? "" : `<div class="muted">Пока правок нет — отметьте лишнее на видео.</div>`;
  items.forEach((it) => {
    const row = document.createElement("div");
    row.className = "fix";
    row.innerHTML = `<span class="t">${fmt(it.t / 1000)}</span><span>${it.html}</span><button>удалить</button>`;
    row.querySelector(".t").onclick = () => (video.currentTime = it.t / 1000);
    row.querySelector("button").onclick = () => {
      it.del();
      refresh();
      save();
    };
    box.appendChild(row);
  });
};

const renderRemoved = () => {
  const box = $("#cut-removed");
  box.innerHTML = P.removed.length ? "" : `<div class="muted">Нет данных о вырезанном (у проекта нет плана autocut).</div>`;
  P.removed.forEach((r) => {
    const on = P.fix.restore.includes(r.id);
    const row = document.createElement("div");
    row.className = "rem" + (on ? " restored" : "");
    row.innerHTML = `<span class="t">${fmt(r.from / 1000)}</span><span>${esc(r.text)}${r.note ? ` <span class="muted">— ${esc(r.note)}</span>` : ""}</span><button>${on ? "не возвращать" : "вернуть"}</button>`;
    row.querySelector("button").onclick = () => {
      if (on) P.fix.restore = P.fix.restore.filter((x) => x !== r.id);
      else P.fix.restore.push(r.id);
      refresh();
      save();
    };
    box.appendChild(row);
  });
};

const refresh = () => {
  renderTimeline();
  renderFixes();
  renderRemoved();
  $("#cut-range").textContent = mark.in == null ? "—" : `${fmt(mark.in / 1000)} – ${mark.out != null ? fmt(mark.out / 1000) : "…"}`;
};

// текущие слова под видео и бегунок
const tick = () => {
  if (!P) return;
  const t = now();
  $("#cut-playhead").style.left = `${(t / P.durationMs) * 100}%`;
  $("#cut-time").textContent = fmt(video.currentTime);
  const i = P.words.findIndex((w) => w.t > t);
  const k = i < 0 ? P.words.length - 1 : Math.max(0, i - 1);
  const around = P.words.slice(Math.max(0, k - 6), k + 7);
  $("#cut-words").innerHTML = around.map((w) => (w === P.words[k] ? `<b>${esc(w.text)}</b>` : esc(w.text))).join(" ");
  const pi = pieceAt(t);
  document.querySelectorAll(".cut-piece").forEach((e, n) => e.classList.toggle("active", n === pi));
  if (mark.in != null && mark.out == null) renderTimeline();
  $("#cut-play").textContent = video.paused ? "▶" : "❚❚";
};
setInterval(tick, 100);

// ---------- действия ----------

const setIn = () => {
  mark = { in: now(), out: null };
  refresh();
};
const setOut = () => {
  if (mark.in == null) return;
  mark.out = now();
  refresh();
};
const addCut = () => {
  if (mark.in == null) return;
  const to = mark.out ?? now();
  const [a, b] = [Math.min(mark.in, to), Math.max(mark.in, to)];
  if (b - a < 40) return;
  P.fix.cut.push({ from: Math.round(a), to: Math.round(b), comment: $("#cut-comment").value.trim() });
  $("#cut-comment").value = "";
  mark = { in: null, out: null };
  refresh();
  save();
};
const dropPiece = () => {
  const i = pieceAt(now());
  if (i < 0 || P.fix.dropPieces.includes(i)) return;
  P.fix.dropPieces.push(i);
  refresh();
  save();
};
const addNote = () => {
  const text = prompt("Заметка в этот момент:", $("#cut-comment").value.trim());
  if (!text) return;
  P.fix.notes.push({ t: Math.round(now()), text });
  refresh();
  save();
};

$("#cut-play").onclick = () => (video.paused ? video.play() : video.pause());
document.querySelectorAll("[data-cj]").forEach((b) => (b.onclick = () => (video.currentTime += Number(b.dataset.cj))));
document.querySelectorAll("[data-cf]").forEach((b) => (b.onclick = () => (video.pause(), (video.currentTime += Number(b.dataset.cf) * FRAME))));
$("#cut-in").onclick = setIn;
$("#cut-out").onclick = setOut;
$("#cut-add").onclick = addCut;
$("#cut-drop").onclick = dropPiece;
$("#cut-note").onclick = addNote;
$("#cut-timeline").onclick = (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  video.currentTime = ((e.clientX - r.left) / r.width) * (P.durationMs / 1000);
};
document.addEventListener("keydown", (e) => {
  if (!$("#tab-cut").classList.contains("active") || e.target.matches("input, select, textarea")) return;
  const k = e.key.toLowerCase();
  if (e.code === "Space") (e.preventDefault(), video.paused ? video.play() : video.pause());
  else if (e.code === "ArrowRight") video.currentTime += 1;
  else if (e.code === "ArrowLeft") video.currentTime -= 1;
  else if (k === ".") (video.pause(), (video.currentTime += FRAME));
  else if (k === ",") (video.pause(), (video.currentTime -= FRAME));
  else if (k === "i" || k === "ш") setIn();
  else if (k === "o" || k === "щ") setOut();
  else if (k === "x" || k === "ч") addCut();
  else if (k === "d" || k === "в") dropPiece();
  else if (k === "n" || k === "т") addNote();
});

// ---------- загрузка ----------

const open = async (id) => {
  const r = await fetch(`/api/cut/${id}`);
  if (!r.ok) return;
  P = await r.json();
  P.fix = { cut: [], dropPieces: [], restore: [], notes: [], ...P.fix };
  mark = { in: null, out: null };
  video.src = `/video/${encodeURIComponent(P.name)}.mp4`;
  refresh();
};

fetch("/api/cuts")
  .then((r) => r.json())
  .then((list) => {
    const sel = $("#cut-project");
    sel.innerHTML = list.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("") || `<option>нет проектов с авто-нарезкой</option>`;
    sel.onchange = () => open(sel.value);
    if (list.length) open(list[list.length - 1].id).then(() => (sel.value = list[list.length - 1].id));
  });
