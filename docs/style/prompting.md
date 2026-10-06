# Как писать промпты для генерации картинок

Справочник для аватарок, обложек, фонов и вставок. Промпты пишем **на английском** (модели понимают его лучше всего), пояснения — по-русски.

## Главная мысль

Модель рисует **то, что описано конкретно**, и додумывает всё остальное «средним по интернету». Средний интернет — это клише и пластик. Поэтому:

- описывать **сцену, как оператор**: кто, где, что делает, какой свет, какой объектив — а не набор прилагательных;
- **один главный объект** и 1–3 второстепенных; остальное — фон;
- **свет** — самое важное после объекта: он делает картинку «дорогой» или «дешёвой»;
- **цвета словами** + где они в кадре («dusty rose silk backdrop», а не просто «pink»);
- заранее **оставить место под текст**, если он будет, — и сам текст добавлять в монтаже, а не генерировать (особенно кириллицу).

## Формула промпта

Порядок важен: что раньше — то сильнее.

```
[1 тип кадра] + [2 главный объект и что он делает] + [3 окружение и предметы ниши]
+ [4 композиция и место под текст] + [5 свет] + [6 камера/объектив] + [7 стиль и обработка]
+ [8 палитра] + [9 настроение] + [10 технические параметры]
```

| # | Что | Пример |
|---|---|---|
| 1 | Тип кадра | `editorial portrait photo`, `close-up beauty shot`, `flat lay`, `3D clay icon`, `minimal vector illustration` |
| 2 | Объект и действие | `a confident woman in her 30s, brow artist, holding a small mirror, warm genuine smile` |
| 3 | Окружение и предметы | `in a bright minimalist studio, soft-focus vanity mirror, a few makeup brushes in a ceramic cup, peonies` |
| 4 | Композиция | `centered, head and shoulders, subject fills 60% of frame, clean empty space at the top for a headline` |
| 5 | Свет | `soft diffused window light from the left, gentle shadows, warm highlights` |
| 6 | Камера | `85mm lens, f/2, shallow depth of field, eye level` |
| 7 | Стиль | `high-end beauty editorial, natural skin texture, subtle film grain` |
| 8 | Палитра | `palette of dusty rose, warm beige and soft cream, one accent of deep plum` |
| 9 | Настроение | `calm, caring, premium` |
| 10 | Технические | Midjourney: `--ar 9:16 --style raw`; в остальных — формат словами или в настройках |

## Свет — словарь

| Хотим | Пишем |
|---|---|
| Дорого, мягко, красиво для лица | `soft diffused window light`, `large softbox`, `beauty dish lighting`, `gentle fill` |
| Уют, тепло, вечер | `warm golden hour light`, `warm tungsten practical lamps`, `candlelit glow` |
| Чисто, медицина, техника | `bright even studio lighting`, `clean white high-key` |
| Драма, сила, премиум-мужское | `low-key lighting`, `single hard key light`, `rim light`, `deep shadows` |
| Свежесть, утро, спорт на улице | `crisp morning sunlight`, `backlit with sun flare` |
| Интерьер недвижимости | `bright natural daylight flooding through large windows`, `balanced exposure`, `twilight exterior with warm interior lights` |

## Камера и обработка — словарь

- Портрет: `85mm`, `f/1.8–2.8`, `shallow depth of field`, `eye level`.
- Интерьер: `24mm wide angle`, `vertical lines straight`, `architectural photography`.
- Предмет/продукт: `100mm macro`, `top-down flat lay`, `seamless backdrop`.
- Живость: `candid moment`, `natural skin texture`, `slight film grain`, `documentary style`.
- Убрать «пластик»: `natural skin texture, visible pores, no airbrushing` (для бьюти — аккуратно: `soft natural retouch`).
- Иконки и объекты для инфографики: `3D clay render, soft matte finish, rounded shapes, soft studio light, plain [color] background`.

## Палитра в промпте

- Цвета брать из `clients/<имя>/brand.json` → `palette.words` (там названия на английском + hex).
- Привязывать цвет к предмету: `dusty rose silk backdrop`, `deep navy velvet armchair`, `gold accents on the frame`.
- Hex понимают не все модели. Midjourney — плохо, GPT Image / Gemini / Ideogram / Recraft — лучше. Писать и словом, и hex: `dusty rose (#E8B4B8)`.
- Нейтрали называть явно (`warm off-white walls`, `light oak`), иначе модель зальёт всё акцентом.
- Правило 60/30/10: 60% нейтраль, 30% второй цвет, 10% акцент. В промпте — `mostly warm neutrals with small accents of …`.

## Лицо клиента — сохранить узнаваемость

Самое частое требование: «клиентка в центре, но красиво». Портрет без фото-референса даст **другого человека**.

1. Давать модели **2–4 реальных фото клиента** (анфас, хороший свет, без сильных фильтров).
2. Писать явно: `use the person from the reference photo, keep facial features, face shape, skin tone, hair color and age unchanged`.
3. Менять **фон, свет, одежду, предметы** — не лицо. Улучшения лица — только мягко: `soft natural retouch`.
4. Лучшие для этого (на 2026): Gemini «Nano Banana» и GPT Image — редактирование по фото словами; Midjourney — `--oref` (omni reference) / `--cref`; Flux Kontext — точечные правки.
5. Если клиенту важно 100% сходство — генерировать **только фон и предметы**, а фото клиента вырезать и ставить поверх (в Figma/Canva/монтаже).

## Текст на картинке

- Кириллицу генераторы часто коверкают. **По умолчанию текст не генерировать**: оставить место (`clean negative space at the top third for text`), заголовок наложить потом нашими шрифтами Inter Tight / Inter.
- Если всё же нужно (быстрый черновик) — Ideogram, GPT Image, Gemini справляются лучше; текст в кавычках, коротко: `headline text "ЗАПИСЬ ОТКРЫТА" in bold sans-serif`. Всегда проверять каждую букву.

## Чего избегать

- Списки из 15 прилагательных (`beautiful, stunning, amazing, 8k, masterpiece`) — шум, не помогает.
- Противоречия (`minimalist` + 10 предметов; `dark moody` + `bright airy`).
- Абстракции без картинки: `success`, `luxury`, `trust`. Заменять видимым: success → `relaxed smile, keys in hand, sunlit empty new apartment`.
- Руки крупным планом с мелкими предметами — частый брак; проверять пальцы.
- Логотипы и бренды чужих компаний, узнаваемые знаменитости.
- Для медицины и финансов: никаких «до/после» с обещаниями, денег веером, шприцов в лицо — площадки режут охваты.

## Негатив (что исключить)

Midjourney: `--no text, watermark, logo, extra fingers`. Flux / GPT Image / Gemini — негатив не поддерживается как параметр; писать позитивно: вместо `no clutter` → `clean, uncluttered background`. Общий негатив клиента хранить в паспорте (раздел 5).

## По моделям — коротко

> Версии меняются быстро: перед серией проверить, что сейчас актуально, и записать удачные настройки в паспорт клиента.

| Модель | Сильна в | Как писать |
|---|---|---|
| **Midjourney** (v7) | атмосфера, эстетика, фоны, «журнальность» | короткие фразы через запятую; параметры в конце: `--ar 9:16`, `--style raw` (меньше «художества»), `--s 50–250` (стилизация), `--sref <url>` (стиль по примеру), `--oref <url>` (человек/объект по фото), `--no …` |
| **GPT Image** (ChatGPT) | понимает длинные описания, правки по фото, текст | обычным языком, как ТЗ дизайнеру; можно списком; формат словами («vertical 9:16») |
| **Gemini / Nano Banana** | правки по фото с сохранением лица, совмещение нескольких фото | «Возьми человека с фото 1, посади в интерьер с фото 2…» — пошагово; хорошо держит идентичность |
| **Flux** (1.1 Pro / Kontext) | фотореализм, послушность длинному промпту, правки | развёрнутое описание естественным языком, без весов и `--`; Kontext — «change the background to …, keep the person unchanged» |
| **Ideogram** (3) | текст на картинке, постеры, обложки | текст в кавычках, указывать шрифт и место |
| **Recraft** (v3) | векторные иконки, иллюстрации в одном стиле, бренд-цвета по hex | стиль из библиотеки + hex палитры |

Для 9:16 под рилсы: `--ar 9:16` / «vertical 9:16, 1080×1920». Для аватарки — `1:1`. Для сетки профиля — обложка 9:16, но смысл в центральных 3:4 (см. `covers.md`).

## Серия в одном стиле

1. Собрать **стиль-блок** клиента (1–2 строки: свет + палитра + фактуры + обработка) и вставлять его **в конец каждого** промпта без изменений.
2. Удачную картинку сохранить как эталон стиля: Midjourney `--sref`, в остальных — прикладывать как референс «in the same style as the reference».
3. Менять от картинки к картинке только **объект, действие и эмоцию**.

## Шаблоны

**Аватарка эксперта (фото клиента как референс)**
```
Editorial portrait of the person from the reference photo, keep facial features, age and hair unchanged.
{РОЛЬ}, {ЭМОЦИЯ: warm confident smile}, head and shoulders, centered, face fills the middle of a square frame.
Background: {ЛОКАЦИЯ НИШИ}, softly blurred, with {1–2 ПРЕДМЕТА} recognizable at the edges.
{СТИЛЬ-БЛОК КЛИЕНТА}. 85mm, f/2, shallow depth of field. Square 1:1.
```

**Обложка рилса**
```
Vertical 9:16 photo. {КЛИЕНТ / ОБЪЕКТ} {ДЕЙСТВИЕ}, expressive {ЭМОЦИЯ}, positioned in the lower-middle of the frame.
{ПРЕДМЕТ, РАСКРЫВАЮЩИЙ ТЕМУ} clearly visible next to the subject.
Clean uncluttered background, empty space in the upper third for a headline.
{СТИЛЬ-БЛОК КЛИЕНТА}.
```

**Фон для вставки / полноэкранной графики**
```
Vertical 9:16 abstract background, {ФАКТУРА: soft silk fabric folds / light oak and linen / blurred city lights},
{ПАЛИТРА}, soft gradient, very low detail in the center, no objects, no text.
```

**Иконка для инфографики**
```
3D clay icon of {ПРЕДМЕТ}, soft matte finish, rounded friendly shapes, {АКЦЕНТ КЛИЕНТА} with warm neutral details,
soft studio light, plain {bg-цвет клиента} background, centered, no text.
```
