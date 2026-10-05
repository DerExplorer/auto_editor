// Настроение ролика: "mood": {"name", "strength"} подстраивает цвет, камеру, эффекты и музыку.
// Явные camera, sfx, music в edit-файле важнее.

export const MOODS = {
  sad: {
    label: "грусть",
    grade: { saturate: 0.7, contrast: 0.95, brightness: 0.96, warmth: -0.6 },
    camera: { inMin: 1.03, inMax: 1.05, rampInMs: 3200, rampOutMs: 2600, minIntervalMs: 8000, maxIntervalMs: 11000 },
    sfx: { volume: 0.25, minGapMs: 1500 },
    music: { dir: "грусть", volume: 0.14, duckTo: 0.05 },
  },
  energy: {
    label: "энергия",
    grade: { saturate: 1.2, contrast: 1.07, brightness: 1.03, warmth: 0.4 },
    camera: { inMin: 1.06, inMax: 1.1, rampInMs: 900, rampOutMs: 900, minIntervalMs: 3500, maxIntervalMs: 5500 },
    sfx: { volume: 0.6, minGapMs: 400 },
    music: { dir: "энергия", volume: 0.2, duckTo: 0.07 },
  },
  shock: {
    label: "шок / масштаб",
    grade: { saturate: 1.1, contrast: 1.16, brightness: 1.0, warmth: 0 },
    camera: { inMin: 1.08, inMax: 1.12, rampInMs: 500, rampOutMs: 1400, minIntervalMs: 4000, maxIntervalMs: 6000 },
    sfx: { volume: 0.65, minGapMs: 450 },
    music: { dir: "напряжение", volume: 0.18, duckTo: 0.06 },
  },
  calm: {
    label: "спокойно / экспертно",
    grade: { saturate: 1.0, contrast: 1.02, brightness: 1.0, warmth: 0.1 },
    camera: { inMin: 1.05, inMax: 1.07, rampInMs: 2200, rampOutMs: 1600, minIntervalMs: 5000, maxIntervalMs: 8000 },
    sfx: { volume: 0.45, minGapMs: 600 },
    music: { dir: "спокойно", volume: 0.14, duckTo: 0.05 },
  },
  inspire: {
    label: "вдохновение / позитив",
    grade: { saturate: 1.1, contrast: 1.03, brightness: 1.02, warmth: 0.45 },
    camera: { inMin: 1.05, inMax: 1.08, rampInMs: 2000, rampOutMs: 1600, minIntervalMs: 5000, maxIntervalMs: 7500 },
    sfx: { volume: 0.5, minGapMs: 550 },
    music: { dir: "вдохновение", volume: 0.16, duckTo: 0.06 },
  },
};

// Сила 1–5: 3 — как в таблице, 1 — едва заметно, 5 — сильнее.
export const resolveMood = (mood) => {
  if (!mood) return null;
  const m = typeof mood === "string" ? { name: mood } : mood;
  const p = MOODS[m.name];
  if (!p) throw new Error(`Неизвестное настроение "${m.name}". Есть: ${Object.keys(MOODS).join(", ")}`);
  const k = Math.max(1, Math.min(5, m.strength ?? 3)) / 3;
  const towards = (v, neutral) => neutral + (v - neutral) * k;
  return {
    name: m.name,
    label: p.label,
    strength: m.strength ?? 3,
    grade: {
      saturate: towards(p.grade.saturate, 1),
      contrast: towards(p.grade.contrast, 1),
      brightness: towards(p.grade.brightness, 1),
      warmth: towards(p.grade.warmth, 0), // >0 теплее, <0 холоднее
    },
    camera: p.camera,
    sfx: p.sfx,
    music: p.music,
  };
};
