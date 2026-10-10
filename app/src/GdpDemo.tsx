// Анимация ВВП на душу населения стран G7 (данные МВФ, 1990–2023 + прогноз до 2029).
// 1) объёмные столбцы-платформы 2023 года поднимаются → 2) сжимаются в точки и прорастают в кривые 1990–2029 →
// 3) глобус: страны G7 «выдавливаются» из поверхности своими цветами, глобус крутится Америка → Европа → Япония.
// Флаги — library/stickers/flags (США, Британия, Франция, Германия, Италия); Канада и Япония нарисованы кодом.
import React from "react";
import { geoCentroid, geoDistance, geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { feature } from "topojson-client";
import world from "world-atlas/countries-110m.json";
import {
  AbsoluteFill,
  Easing,
  Html5Audio,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { clamp, lerp, prog, shade, smoothAt } from "./anim";
import { FONT_HEAD, FONT_TEXT } from "./theme";

export const GDP_FPS = 30;
export const GDP_DURATION = 15.5;

// ---------- данные (тыс. $ на человека, 1990–2029; с 2024 — прогноз МВФ) ----------
type Country = { id: string; name: string; color: string; flag: string; series: number[]; label: [number, number] };
const C7: Country[] = [
  { id: "840", name: "США", color: "#F7C948", flag: "usa", label: [40, 170],
    series: [23.9, 24.3, 25.4, 26.4, 27.7, 28.7, 30.0, 31.5, 32.9, 34.5, 36.3, 37.1, 37.9, 39.4, 41.7, 44.1, 46.3, 48.0, 48.5, 47.1, 48.5, 50.0, 51.6, 53.1, 55.0, 56.8, 58.0, 60.1, 63.0, 65.5, 64.3, 71.0, 77.2, 81.6, 85.4, 88.0, 90.9, 94.0, 97.2, 100.6] },
  { id: "124", name: "Канада", color: "#FF7EB6", flag: "canada", label: [-30, -160],
    series: [21.5, 21.8, 21.0, 20.2, 20.0, 20.6, 21.3, 21.9, 21.0, 22.2, 24.3, 23.8, 24.2, 28.2, 32.1, 36.2, 40.4, 44.6, 46.6, 40.9, 47.6, 52.2, 52.7, 52.6, 51.0, 43.6, 42.3, 45.1, 46.6, 46.4, 43.5, 52.5, 55.5, 53.4, 54.7, 56.8, 58.7, 60.5, 62.5, 64.6] },
  { id: "276", name: "Германия", color: "#B48CFF", flag: "germany", label: [150, -130],
    series: [20.4, 23.0, 26.5, 25.6, 27.2, 31.8, 30.6, 27.1, 27.4, 26.9, 23.6, 23.8, 25.3, 30.6, 34.5, 34.9, 36.6, 42.3, 46.4, 42.2, 42.3, 46.6, 43.9, 46.3, 48.0, 41.0, 42.1, 44.6, 47.9, 46.8, 46.7, 51.4, 48.7, 52.7, 54.3, 56.3, 58.2, 60.0, 61.8, 63.5] },
  { id: "826", name: "Британия", color: "#4FC3F7", flag: "uk", label: [-170, -110],
    series: [20.9, 21.8, 22.4, 19.9, 21.4, 23.1, 24.5, 26.9, 28.2, 28.7, 28.3, 27.9, 30.1, 34.4, 40.4, 42.1, 44.6, 50.4, 47.6, 38.8, 39.6, 42.1, 42.5, 43.4, 47.5, 45.1, 41.0, 40.6, 43.3, 42.7, 40.2, 46.6, 45.7, 49.1, 51.1, 53.6, 56.6, 59.8, 63.1, 66.9] },
  { id: "250", name: "Франция", color: "#4ADEAA", flag: "france", label: [-190, 60],
    series: [22.4, 22.3, 24.5, 23.0, 24.2, 27.7, 27.7, 25.0, 25.8, 25.5, 23.2, 23.2, 24.9, 30.6, 35.0, 36.0, 37.8, 43.0, 47.0, 43.0, 42.2, 45.4, 42.6, 44.1, 44.6, 37.9, 38.4, 40.1, 43.0, 42.0, 40.5, 45.0, 42.4, 46.0, 47.4, 48.6, 50.1, 51.5, 52.9, 54.3] },
  { id: "380", name: "Италия", color: "#C5F25C", flag: "italy", label: [170, 80],
    series: [20.8, 21.8, 22.9, 18.4, 19.0, 20.7, 23.0, 21.8, 22.3, 22.0, 20.1, 20.4, 22.3, 27.5, 31.3, 32.0, 33.4, 37.8, 40.9, 37.0, 35.8, 38.3, 34.8, 35.5, 35.6, 30.4, 31.1, 32.6, 34.9, 33.6, 31.8, 36.3, 34.9, 38.3, 39.6, 40.6, 41.6, 42.6, 43.8, 45.0] },
  { id: "392", name: "Япония", color: "#FF5A6E", flag: "japan", label: [-60, -150],
    series: [25.9, 29.4, 32.0, 36.2, 39.9, 44.2, 39.2, 35.6, 32.4, 36.6, 39.2, 34.4, 32.8, 35.4, 38.3, 37.8, 36.0, 35.8, 40.0, 41.3, 44.9, 48.8, 49.2, 40.9, 38.5, 35.0, 39.4, 38.9, 39.8, 40.5, 40.1, 40.1, 34.0, 33.8, 33.1, 34.9, 36.6, 38.1, 39.8, 41.0] },
];
const Y0 = 1990;
const Y_NOW = 2023;
const Y1 = 2029;
const at2023 = (c: Country) => c.series[Y_NOW - Y0];
const fmt = (v: number) => `$${v.toFixed(1).replace(".", ",")}K`;

// ---------- сценарий (мс) ----------
const T = {
  bars: 300, barStep: 130,
  collapse: 3300, slide: 3650, // столбцы → точки → на 2023 год
  linesL: 4150, linesR: 4400, linesEnd: 6600,
  endLabels: 6300,
  chartOut: 7700, globeIn: 7900,
  raise: { "840": 9150, "124": 9450, "826": 11150, "250": 11330, "276": 11510, "380": 11690, "392": 13150 } as Record<string, number>,
};
// поворот глобуса: долгота/широта в центре
const ROT: { atMs: number; lon: number; lat: number }[] = [
  { atMs: 7900, lon: -190, lat: 10 },
  { atMs: 8900, lon: -100, lat: 40 },
  { atMs: 10300, lon: -92, lat: 42 },
  { atMs: 11000, lon: 4, lat: 48 },
  { atMs: 12500, lon: 10, lat: 47 },
  { atMs: 13150, lon: 136, lat: 38 },
  { atMs: 15500, lon: 150, lat: 34 },
];

// ---------- геометрия ----------
const W = 1080;
const BASE = 1380; // ось X графика
const TOP = 500; // уровень 100 тыс. $
const yOf = (v: number) => BASE - (v / 100) * (BASE - TOP);
const X_L = 150;
const X_R = 800;
const xOf = (year: number) => X_L + ((year - Y0) / (Y1 - Y0)) * (X_R - X_L);
const BAR_L = 110;
const BAR_SLOT = (980 - BAR_L) / C7.length;
const BAR_W = 78;


// ---------- флаги ----------
const Flag: React.FC<{ c: Country; size: number }> = ({ c, size }) => {
  if (c.flag === "japan" || c.flag === "canada") {
    // нет в library/stickers/flags — плоский флаг с лёгкой волной
    const frame = useCurrentFrame();
    const wave = Math.sin(frame / 6) * 4;
    return (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg viewBox="0 0 60 40" width={size * 0.78} style={{ transform: `perspective(200px) rotateY(${wave}deg) skewY(${wave / 3}deg)`, filter: "drop-shadow(0 3px 4px rgba(0,0,0,0.35))", borderRadius: 3 }}>
          {c.flag === "japan" ? (
            <>
              <rect width="60" height="40" rx="3" fill="#fff" />
              <circle cx="30" cy="20" r="11" fill="#BC002D" />
            </>
          ) : (
            <>
              <rect width="60" height="40" rx="3" fill="#fff" />
              <rect width="15" height="40" fill="#D52B1E" />
              <rect x="45" width="15" height="40" fill="#D52B1E" />
              <path d="M30 8 L32 13 L35 11 L34 18 L38 16 L37 20 L40 21 L33 25 L34 28 L31 27 L31 32 L29 32 L29 27 L26 28 L27 25 L20 21 L23 20 L22 16 L26 18 L25 11 L28 13 Z" fill="#D52B1E" />
            </>
          )}
        </svg>
      </div>
    );
  }
  return <OffthreadVideo src={staticFile(`gdp/${c.flag}.webm`)} transparent muted style={{ width: size, height: size }} />;
};

// ---------- сцена 1–2: столбцы → кривые ----------
const pathOf = (c: Country, from: number, to: number) =>
  c.series
    .slice(from - Y0, to - Y0 + 1)
    .map((v, i) => `${i ? "L" : "M"}${xOf(from + i).toFixed(1)},${yOf(v).toFixed(1)}`)
    .join(" ");

const Chart: React.FC<{ t: number; frame: number; fps: number }> = ({ t, frame, fps }) => {
  const order = [...C7].sort((a, b) => at2023(b) - at2023(a));
  const collapse = prog(t, T.collapse, 450);
  const slide = prog(t, T.slide, 550, Easing.bezier(0.6, 0, 0.2, 1));
  const axis = prog(t, T.slide + 150, 500);
  const pL = prog(t, T.linesL, T.linesEnd - T.linesL, Easing.bezier(0.45, 0, 0.2, 1));
  const pR = prog(t, T.linesR, 1000);
  const clipL = lerp(xOf(Y_NOW), X_L, pL) - 12;
  const clipR = lerp(xOf(Y_NOW), X_R, pR) + 12;
  const headYear = lerp(Y_NOW, Y0, pL);
  const forecast = prog(t, T.linesR + 600, 600);

  // подписи справа: сдвигаем, чтобы не наезжали друг на друга
  const ends = [...C7].map((c) => ({ c, y: yOf(c.series[Y1 - Y0]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 50);

  return (
    <AbsoluteFill>
      <svg width={W} height={1920} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <clipPath id="grow">
            <rect x={clipL} y={0} width={Math.max(0, clipR - clipL)} height={1920} />
          </clipPath>
          {C7.map((c) => (
            <linearGradient key={c.id} id={`bar${c.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={c.color} />
              <stop offset="1" stopColor={shade(c.color, 0.55)} />
            </linearGradient>
          ))}
        </defs>
        {/* сетка и ось */}
        {[20, 40, 60, 80, 100].map((v) => (
          <g key={v} opacity={0.25 + 0.75 * axis}>
            <line x1={X_L - 40} x2={lerp(980, X_R + 20, axis)} y1={yOf(v)} y2={yOf(v)} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 8" />
            <text x={X_L - 50} y={yOf(v) + 8} fill="rgba(255,255,255,0.45)" fontSize={24} fontFamily={FONT_TEXT} textAnchor="end">{`${v}K`}</text>
          </g>
        ))}
        <line x1={BAR_L - 20} x2={lerp(990, X_R + 20, axis)} y1={BASE} y2={BASE} stroke="rgba(255,255,255,0.35)" strokeWidth={2} />
        {[1990, 2000, 2010, 2020, 2029].map((y) => (
          <text key={y} x={xOf(y)} y={BASE + 44} opacity={axis} fill="rgba(255,255,255,0.6)" fontSize={26} fontFamily={FONT_TEXT} textAnchor="middle">{y}</text>
        ))}
        {/* зона прогноза */}
        <rect x={xOf(2024)} y={TOP - 30} width={xOf(Y1) - xOf(2024)} height={BASE - TOP + 30} fill="rgba(255,255,255,0.06)" opacity={forecast} />
        <text x={(xOf(2024) + xOf(Y1)) / 2} y={TOP - 44} opacity={forecast} fill="rgba(255,255,255,0.55)" fontSize={22} fontFamily={FONT_TEXT} textAnchor="middle" letterSpacing={2}>ПРОГНОЗ МВФ</text>

        {/* кривые */}
        <g clipPath="url(#grow)" opacity={pL > 0 || pR > 0 ? 1 : 0}>
          {C7.map((c) => (
            <g key={c.id}>
              <path d={pathOf(c, Y0, Y_NOW)} fill="none" stroke={c.color} strokeWidth={c.id === "840" || c.id === "392" ? 7 : 4.5} strokeLinejoin="round" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 8px ${c.color}66)` }} />
              <path d={pathOf(c, Y_NOW, Y1)} fill="none" stroke={c.color} strokeWidth={4.5} strokeDasharray="10 10" strokeLinecap="round" />
            </g>
          ))}
        </g>
        {/* бегущие «головы» линий в прошлое */}
        {pL > 0 && pL < 1 &&
          C7.map((c) => {
            const k = Math.floor(headYear) - Y0;
            const v = lerp(c.series[k], c.series[Math.min(k + 1, c.series.length - 1)], headYear - Math.floor(headYear));
            return <circle key={c.id} cx={xOf(headYear)} cy={yOf(v)} r={9} fill={c.color} style={{ filter: `drop-shadow(0 0 10px ${c.color})` }} />;
          })}

        {/* столбцы-платформы: передняя грань, боковая и верхняя */}
        {order.map((c, i) => {
          const start = T.bars + i * T.barStep;
          const rise = spring({ frame: Math.max(0, frame - (start / 1000) * fps), fps, config: { damping: 13, stiffness: 120, mass: 0.9 } });
          if (t < start) return null;
          const cx0 = BAR_L + BAR_SLOT * (i + 0.5);
          const cx = lerp(cx0, xOf(Y_NOW), slide);
          const topY = lerp(BASE, yOf(at2023(c)), rise);
          const w = lerp(BAR_W, 22, collapse);
          const bottom = lerp(BASE, topY + w * 0.5, collapse);
          const dx = 16 * (1 - collapse);
          const dy = 11 * (1 - collapse);
          const body = Math.max(0, bottom - topY);
          return (
            <g key={c.id}>
              {collapse < 1 && (
                <>
                  <polygon points={`${cx + w / 2},${topY} ${cx + w / 2 + dx},${topY - dy} ${cx + w / 2 + dx},${bottom - dy} ${cx + w / 2},${bottom}`} fill={shade(c.color, 0.42)} />
                  <rect x={cx - w / 2} y={topY} width={w} height={body} fill={`url(#bar${c.id})`} rx={collapse * w * 0.5} />
                  <polygon points={`${cx - w / 2},${topY} ${cx - w / 2 + dx},${topY - dy} ${cx + w / 2 + dx},${topY - dy} ${cx + w / 2},${topY}`} fill={shade(c.color, 1.25)} />
                </>
              )}
              {collapse > 0 && <circle cx={cx} cy={topY} r={11} fill={c.color} opacity={collapse} style={{ filter: `drop-shadow(0 0 12px ${c.color})` }} />}
              <text x={cx + dx / 2} y={topY - dy - 18} opacity={1 - collapse} fill="#fff" fontSize={30} fontWeight={800} fontFamily={FONT_HEAD} textAnchor="middle">
                {fmt(at2023(c) * Math.min(1, rise))}
              </text>
              <text x={cx0} y={BASE + 128} opacity={1 - collapse} fill="rgba(255,255,255,0.85)" fontSize={25} fontFamily={FONT_TEXT} fontWeight={600} textAnchor="middle">{c.name}</text>
            </g>
          );
        })}
      </svg>
      {/* флаги под столбцами */}
      {order.map((c, i) => {
        const start = T.bars + i * T.barStep;
        const pop = spring({ frame: Math.max(0, frame - (start / 1000) * fps), fps, config: { damping: 11, stiffness: 160 } });
        const op = (t >= start ? 1 : 0) * (1 - prog(t, T.collapse, 300));
        if (op <= 0) return null;
        return (
          <div key={c.id} style={{ position: "absolute", left: BAR_L + BAR_SLOT * (i + 0.5) - 40, top: BASE + 8, width: 80, height: 80, opacity: op, transform: `scale(${pop})` }}>
            <Flag c={c} size={80} />
          </div>
        );
      })}
      {/* подписи на конце кривых */}
      {ends.map(({ c, y }, i) => {
        const s = spring({ frame: Math.max(0, frame - ((T.endLabels + i * 90) / 1000) * fps), fps, config: { damping: 12, stiffness: 170 } });
        if (t < T.endLabels + i * 90) return null;
        return (
          <div key={c.id} style={{ position: "absolute", left: X_R + 26, top: y - 21, height: 42, display: "flex", alignItems: "center", gap: 8, padding: "0 14px", borderRadius: 21, background: c.color, transform: `scale(${s})`, transformOrigin: "left center", boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}>
            <span style={{ fontFamily: FONT_HEAD, fontWeight: 800, fontSize: 22, color: "#111317", whiteSpace: "nowrap" }}>{c.name}</span>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ---------- сцена 3: глобус ----------
const land = (feature(world, world.objects.countries) as unknown as FeatureCollection<Geometry, { name: string }>).features.filter((f) => f.id !== "010");
const byId = Object.fromEntries(land.map((f) => [String(f.id), f])) as Record<string, Feature<Geometry, { name: string }>>;
const graticule = geoGraticule10();

const Globe: React.FC<{ t: number; frame: number; fps: number }> = ({ t, frame, fps }) => {
  const R = 430;
  const cx = W / 2;
  const cy = 960;
  const appear = spring({ frame: Math.max(0, frame - (T.globeIn / 1000) * fps), fps, config: { damping: 15, stiffness: 90, mass: 1.1 } });
  const xs = ROT.map((r) => r.atMs);
  const lon = smoothAt(xs, ROT.map((r) => r.lon), t);
  const lat = smoothAt(xs, ROT.map((r) => r.lat), t);
  const zoom = lerp(0.35, 1, appear) * (1 + 0.04 * prog(t, 13400, 2100));
  const proj = (scale: number) => geoOrthographic().scale(R * zoom * scale).translate([cx, cy]).rotate([-lon, -lat]).clipAngle(90).precision(0.6);
  const base = geoPath(proj(1));
  const center: [number, number] = [lon, lat];

  return (
    <AbsoluteFill style={{ opacity: Math.min(1, appear * 1.5) }}>
      <svg width={W} height={1920} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <radialGradient id="ocean" cx="40%" cy="35%" r="70%">
            <stop offset="0" stopColor="#15506A" />
            <stop offset="1" stopColor="#071C28" />
          </radialGradient>
          <radialGradient id="atmo" cx="50%" cy="50%" r="50%">
            <stop offset="0.86" stopColor="rgba(80,210,230,0)" />
            <stop offset="0.93" stopColor="rgba(80,210,230,0.22)" />
            <stop offset="1" stopColor="rgba(80,210,230,0)" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={R * zoom * 1.16} fill="url(#atmo)" />
        <circle cx={cx} cy={cy} r={R * zoom} fill="url(#ocean)" />
        <path d={base(graticule) ?? ""} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
        <path d={base({ type: "FeatureCollection", features: land }) ?? ""} fill="#1E5466" stroke="#0B2A38" strokeWidth={1} />
        {/* страны G7 выдавливаются из поверхности: слои стенки + яркая верхняя грань */}
        {C7.map((c) => {
          const f = byId[c.id];
          const start = T.raise[c.id];
          if (t < start - 50) return null;
          // у горизонта страна плавно «оседает» — стенки не торчат над краем глобуса
          const sink = interpolate(geoDistance(geoCentroid(f), center), [0.95, 1.4], [1, 0], clamp);
          const h = 0.05 * sink * spring({ frame: Math.max(0, frame - (start / 1000) * fps), fps, config: { damping: 10, stiffness: 140, mass: 0.8 } });
          const layers = 6;
          return (
            <g key={c.id}>
              {Array.from({ length: layers }, (_, k) => (
                <path key={k} d={geoPath(proj(1 + (h * k) / layers))(f) ?? ""} fill={shade(c.color, 0.35 + 0.25 * (k / layers))} />
              ))}
              <path d={geoPath(proj(1 + h))(f) ?? ""} fill={c.color} stroke={shade(c.color, 1.35)} strokeWidth={2} style={{ filter: `drop-shadow(0 0 14px ${c.color}88)` }} />
            </g>
          );
        })}
        {/* блик по сфере */}
        <circle cx={cx - R * zoom * 0.35} cy={cy - R * zoom * 0.4} r={R * zoom * 0.55} fill="rgba(255,255,255,0.05)" />
      </svg>
      {/* плашки стран: флаг, название, ВВП на душу 2023 */}
      {C7.map((c) => {
        const start = T.raise[c.id] + 150;
        if (t < start) return null;
        const f = byId[c.id];
        const cen = geoCentroid(f);
        const d = geoDistance(cen, center);
        const vis = interpolate(d, [0.85, 1.1], [1, 0], clamp);
        if (vis <= 0) return null;
        const p = proj(1.05)(cen);
        if (!p) return null;
        const s = spring({ frame: Math.max(0, frame - (start / 1000) * fps), fps, config: { damping: 12, stiffness: 170 } });
        const [dx, dy] = c.label;
        const lx = p[0] + dx;
        const ly = p[1] + dy;
        return (
          <React.Fragment key={c.id}>
            <svg width={W} height={1920} style={{ position: "absolute", inset: 0, opacity: vis * s }}>
              <line x1={p[0]} y1={p[1]} x2={lx} y2={ly} stroke={c.color} strokeWidth={3} />
              <circle cx={p[0]} cy={p[1]} r={7} fill="#fff" stroke={c.color} strokeWidth={3} />
            </svg>
            <div style={{ position: "absolute", left: lx, top: ly, transform: `translate(-50%, -50%) scale(${s})`, opacity: vis, display: "flex", alignItems: "center", gap: 6, padding: "6px 18px 6px 6px", borderRadius: 40, background: "rgba(8,28,40,0.88)", border: `3px solid ${c.color}`, boxShadow: "0 10px 30px rgba(0,0,0,0.45)" }}>
              <div style={{ width: 56, height: 56 }}><Flag c={c} size={56} /></div>
              <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.05 }}>
                <span style={{ fontFamily: FONT_TEXT, fontWeight: 600, fontSize: 22, color: "rgba(255,255,255,0.8)" }}>{c.name}</span>
                <span style={{ fontFamily: FONT_HEAD, fontWeight: 800, fontSize: 32, color: c.color }}>{fmt(at2023(c))}</span>
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};

// ---------- общая сцена ----------
const SFX: [number, string, number][] = [
  [0, "whoosh", 0.6],
  ...C7.map((_, i) => [T.bars + i * T.barStep, i % 2 ? "pop2" : "pop", 0.35] as [number, string, number]),
  [T.collapse, "whoosh", 0.5],
  [T.linesL, "swipe", 0.4],
  [T.chartOut, "whoosh", 0.7],
  ...Object.values(T.raise).map((ms, i) => [ms, i % 2 ? "pop2" : "pop", 0.45] as [number, string, number]),
];

export const GdpDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (frame / fps) * 1000;
  // камера: лёгкие наезды по ключам (общая кривая — без рывков)
  const zx = [0, 1200, 3000, 3700, 6600, 7700];
  const zoom = smoothAt(zx, [1.08, 1, 1.03, 1, 1.05, 1.05], Math.min(t, 7700));
  const chartOut = prog(t, T.chartOut, 550, Easing.in(Easing.cubic));
  const title = spring({ frame, fps, config: { damping: 14 } });
  const title2 = prog(t, T.chartOut + 300, 500);

  return (
    <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 40%, #0F3445 0%, #071A24 70%)", fontFamily: FONT_TEXT }}>
      {/* заголовок: график → глобус */}
      <div style={{ position: "absolute", top: 190, width: W, textAlign: "center", opacity: title * (1 - chartOut), transform: `translateY(${(1 - title) * -40}px)` }}>
        <div style={{ fontFamily: FONT_HEAD, fontWeight: 800, fontSize: 74, color: "#F3E9A6", letterSpacing: -1 }}>ВВП на душу населения</div>
        <div style={{ fontSize: 32, color: "rgba(255,255,255,0.7)", marginTop: 10 }}>страны G7, тыс. $ · МВФ</div>
      </div>
      <div style={{ position: "absolute", top: 190, width: W, textAlign: "center", opacity: title2, transform: `translateY(${(1 - title2) * 30}px)` }}>
        <div style={{ fontFamily: FONT_HEAD, fontWeight: 800, fontSize: 74, color: "#F3E9A6", letterSpacing: -1 }}>Где живут богаче</div>
        <div style={{ fontSize: 32, color: "rgba(255,255,255,0.7)", marginTop: 10 }}>ВВП на душу населения, 2023</div>
      </div>
      {chartOut < 1 && (
        <AbsoluteFill style={{ opacity: 1 - chartOut, transform: `scale(${zoom * (1 - 0.25 * chartOut)}) rotateZ(${-6 * chartOut}deg)` }}>
          <Chart t={t} frame={frame} fps={fps} />
        </AbsoluteFill>
      )}
      {t >= T.globeIn && <Globe t={t} frame={frame} fps={fps} />}
      <div style={{ position: "absolute", bottom: 300, width: W, textAlign: "center", fontSize: 24, color: "rgba(255,255,255,0.4)" }}>Источник: МВФ · с 2024 — прогноз</div>
      {SFX.map(([ms, src, vol], i) => (
        <Sequence key={i} from={Math.round((ms / 1000) * fps)} layout="none">
          <Html5Audio src={staticFile(`gdp/${src}.mp3`)} volume={vol} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
