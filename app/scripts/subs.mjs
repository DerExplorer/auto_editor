// Текстовый слой субтитров: между распознанной речью и тем, что видит зритель.
// Файл edits/<name>.subs.txt — одна строка = один блок на экране (до 2 строк):
//   раньше было лучше
//   вот 5 вещей / о которых 90% людей думают слишком пессимистично   ← "/" — принудительный перенос
//   [4] номер 4                                                     ← показать только большую «4»
//   это ВАЖНО                                                        ← CAPS — сильный акцент
// Текст пишется как угодно (маленькие буквы, цифры, исправления) — тайминг берётся
// из распознанной речи выравниванием слов (LCS), поэтому файл можно свободно править.

const NUM = {
  ноль: 0, один: 1, одна: 1, одно: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10,
  одиннадцать: 11, двенадцать: 12, тринадцать: 13, четырнадцать: 14, пятнадцать: 15, шестнадцать: 16, семнадцать: 17, восемнадцать: 18,
  девятнадцать: 19, двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50, шестьдесят: 60, семьдесят: 70, восемьдесят: 80, девяносто: 90, сто: 100,
};
const ORD = {
  первый: 1, первая: 1, первое: 1, второй: 2, вторая: 2, второе: 2, третий: 3, третья: 3, третье: 3, четвертый: 4, четвертая: 4, четвертое: 4,
  пятый: 5, пятая: 5, пятое: 5, шестой: 6, шестая: 6, седьмой: 7, седьмая: 7, восьмой: 8, восьмая: 8, девятый: 9, девятая: 9, десятый: 10, десятая: 10,
};
// Слова, на которых блок не должен заканчиваться (их переносим в следующий блок).
const WEAK_END = new Set("в во и а на о об с со к ко у по за из от до не ни что как но для это или же ли бы то при без над под через чем чтобы если".split(" "));
const ENUM = /^(номер|вопрос|пункт|шаг|правило|причина|совет|ошибка|факт|вариант)$/;

const bare = (t) => t.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}%]+/gu, "");
// Нормализация для сравнения: без регистра и знаков, числительные → цифры.
export const normTok = (t) => {
  const b = bare(t).replace(/%$/, "");
  if (b in NUM) return String(NUM[b]);
  if (b in ORD) return String(ORD[b]);
  return b;
};

// Черновик текстового слоя из распознанной речи: маленькие буквы, без точек, цифры цифрами,
// блоки по паузам/концам фраз, без «висящих» предлогов в конце, нумерация — отдельной большой цифрой.
export const draftSubs = (words, { maxChars = 30 } = {}) => {
  const toks = [];
  words.forEach((w) => {
    let t = bare(w.text);
    if (!t) return;
    const n = normTok(w.text);
    if (/^\d+$/.test(n) && !/^\d/.test(t)) t = n;
    const prev = toks[toks.length - 1];
    // «двадцать пять» → 25
    if (prev && /^\d0$/.test(prev.t) && /^[1-9]$/.test(t) && w.startMs - prev.endMs < 300) {
      prev.t = String(+prev.t + +t);
      prev.endMs = w.endMs;
      return;
    }
    toks.push({ t, startMs: w.startMs, endMs: w.endMs, end: /[.?!…]$/.test(w.text) });
  });

  const blocks = [];
  let cur = [];
  const flush = () => cur.length && (blocks.push(cur.map((x) => x.t).join(" ")), (cur = []));
  for (let i = 0; i < toks.length; i++) {
    const x = toks[i];
    const next = toks[i + 1];
    if (ENUM.test(x.t) && next && /^\d+$/.test(next.t)) {
      flush();
      blocks.push(`[${next.t}] ${x.t} ${next.t}`);
      i++;
      continue;
    }
    const len = cur.reduce((s, y) => s + y.t.length + 1, 0);
    const gap = cur.length ? x.startMs - cur[cur.length - 1].endMs : 0;
    if (cur.length && (len + x.t.length > maxChars || gap > 450)) {
      const carry = [];
      while (cur.length > 1 && WEAK_END.has(cur[cur.length - 1].t)) carry.unshift(cur.pop());
      flush();
      cur = carry;
    }
    cur.push(x);
    if (x.end) flush();
  }
  flush();
  return [
    "# Субтитры: одна строка = один блок на экране (до 2 строк). «/» — принудительный перенос строки.",
    "# CAPS — сильный акцент. «[4] номер 4» — показать только большую цифру 4 (текст после неё нужен для тайминга).",
    "# Файл можно свободно править: тайминг подтянется из речи сам.",
    ...blocks,
    "",
  ].join("\n");
};

// LCS-выравнивание токенов текстового слоя на слова речи; невыровненным — интерполяция.
const eq = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4));
const align = (A, B) => {
  const n = A.length;
  const m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i][j] = eq(A[i], B[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const map = new Array(n).fill(-1);
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (eq(A[i], B[j])) (map[i] = j), i++, j++;
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return map;
};

export const buildBlocks = (text, words, { holdMs = 700, lineChars = 21 } = {}) => {
  const blocks = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const m = l.match(/^\[(\d+)\]\s*(.*)$/);
      const body = m ? m[2] : l;
      const toks = body
        .split(/\s+/)
        .filter(Boolean)
        .map((t) => (t === "/" ? { br: true } : { text: t }));
      return { kind: m ? "number" : "text", number: m ? m[1] : undefined, toks };
    });

  const flat = blocks.flatMap((b) => b.toks.filter((t) => !t.br));
  const A = flat.map((t) => normTok(t.text));
  const wordsN = words.filter((w) => normTok(w.text));
  const map = align(A, wordsN.map((w) => normTok(w.text)));
  // Время каждого токена: из сопоставленного слова, иначе делим промежуток между соседями.
  flat.forEach((t, i) => {
    if (map[i] >= 0) (t.startMs = wordsN[map[i]].startMs), (t.endMs = wordsN[map[i]].endMs);
  });
  for (let i = 0; i < flat.length; ) {
    if (flat[i].startMs != null) {
      i++;
      continue;
    }
    let j = i;
    while (j < flat.length && flat[j].startMs == null) j++;
    const from = i > 0 ? flat[i - 1].endMs : (words[0]?.startMs ?? 0);
    const to = j < flat.length ? flat[j].startMs : Math.max(from + 300 * (j - i), words[words.length - 1]?.endMs ?? 0);
    const step = Math.max(0, to - from) / (j - i);
    for (let k = i; k < j; k++) (flat[k].startMs = from + step * (k - i)), (flat[k].endMs = from + step * (k - i + 1));
    i = j;
  }
  const unmatched = map.filter((x) => x < 0).length;

  const out = blocks
    .filter((b) => b.toks.some((t) => !t.br))
    .map((b) => {
      const ws = b.toks.filter((t) => !t.br);
      return {
        kind: b.kind,
        number: b.number,
        words: b.toks.map((t) => (t.br ? { br: true } : { text: t.text, startMs: t.startMs, endMs: t.endMs })),
        fromMs: ws[0].startMs,
        toMs: ws[ws.length - 1].endMs,
      };
    });
  out.forEach((b, i) => (b.toMs = Math.min(out[i + 1]?.fromMs ?? Infinity, b.toMs + holdMs)));
  // Грубая проверка «влезает ли в 2 строки»: ~lineChars символов на строку при текущем кегле.
  const warnings = [];
  blocks.forEach((b) => {
    if (b.kind !== "text") return;
    const parts = b.toks.reduce((acc, t) => (t.br ? acc.push("") : (acc[acc.length - 1] += (acc[acc.length - 1] ? " " : "") + t.text), acc), [""]);
    const lines = parts.reduce((n, p) => n + Math.max(1, Math.ceil(p.length / lineChars)), 0);
    if (lines > 2) warnings.push(parts.join(" / "));
  });
  return { blocks: out, unmatched, total: flat.length, warnings };
};
