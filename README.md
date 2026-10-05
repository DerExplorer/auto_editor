# auto_editor — монтажёр рилсов

Прототип генератора вертикальных роликов на [Remotion](https://www.remotion.dev/): подаёшь видео с речью — получаешь готовый mp4 с субтитрами, заголовком-хуком, «камерой», карточками, инфографикой и вставками видео в рамке. Речь распознаётся локально через [faster-whisper](https://github.com/SYSTRAN/faster-whisper), без внешних API и ключей.

Работает на **Windows 10/11** и **macOS 13+** (Apple Silicon и Intel).

Переезд на Mac с помощью Claude: вставьте в чат Claude на Mac текст из [docs/MAC_SETUP_PROMPT.md](docs/MAC_SETUP_PROMPT.md) — он сам всё установит, проверит и будет монтировать по правилам проекта.

## Папки

```
input/      ← сюда кладутся исходники (видео рассказчика, реклама, стоки)
output/     ← сюда падают готовые ролики
sfx/        ← звуковые эффекты по категориям (whoosh, pop, ding, impact…)
music/      ← фоновая музыка
reference/  ← эталонные ролики блогеров для обучения стилю
app/        ← всё техническое
  edits/      описание монтажа каждого ролика: <имя>.json + текстовый слой субтитров <имя>.subs.txt
  scripts/    build.mjs (сборка), audio.mjs (звук), transcribe.py, subs.mjs, camera.mjs, setup/doctor/smoke-test
  src/        Remotion-компоненты (видео, субтитры, графика, звук)
  public/     шрифты (Inter / Inter Tight из дизайн-системы)
  samples/    тестовые клипы и звуки для смоук-теста
  docs/       безопасные зоны Reels
```

Папки `input`, `output`, `sfx`, `music`, `reference` личные и в git не попадают: видео и звуки слишком тяжёлые.

## Установка

Нужны: **Node.js 20+**, **ffmpeg** (с ffprobe) и **Python 3.10+**.

### Windows

```powershell
winget install OpenJS.NodeJS.LTS Gyan.FFmpeg Python.Python.3.12
# перезапустить терминал, затем:
cd app
npm ci
python -m pip install -r requirements.txt
npm run setup
npm run doctor
```

### macOS

```bash
brew install node ffmpeg python@3.12
cd app
npm ci
python3 -m venv .venv && source .venv/bin/activate   # Homebrew-Python не даёт ставить пакеты глобально
pip install -r requirements.txt
npm run setup
npm run doctor
```

На macOS перед работой активируйте окружение: `source app/.venv/bin/activate`. Сборщик сам найдёт Python из активного окружения. Можно указать Python и явно: `PYTHON=/path/to/python npm run render -- edits/x.json`.

`npm run setup` создаёт в корне проекта папки `input`, `output`, `sfx` (с категориями), `music` и `reference`. Чтобы держать их в другом месте: `npm run setup -- "/путь"` — пути запишутся в `app/local.json` (локальный файл, в git не попадает).

`npm run doctor` проверяет всё окружение и подсказывает, что доустановить. Проверка всего пайплайна на тестовых клипах: `npm test`, займёт около 20 секунд. При первом запуске скачаются модель Whisper (около 500 МБ) и headless Chrome для Remotion. Это нормально.

## Как сделать ролик

1. Положить видео в `input` (можно в подпапку на каждый ролик).
2. Создать `app/edits/<имя>.json`. Образцы: `sample.json` (простой), `testreels1.json` (квиз с карточками и инфографикой), `reel2.json`, `apple.json`, `doritos2.json` (реклама в рамке под пересказ).
3. Запустить из `app/`:
   ```bash
   npm run build -- edits/<имя>.json     # только собрать и проверить (быстро)
   npm run render -- edits/<имя>.json    # собрать и отрендерить в output/<имя>.mp4
   ```
4. При первой сборке создаётся черновик субтитров `edits/<имя>.subs.txt`. Правьте его как обычный текст:
   - одна строка — один блок на экране, до 2 строк;
   - `/` — перенос строки;
   - CAPS — сильный акцент;
   - `[4] номер 4` — вместо текста показать большую цифру 4.

   Тайминг подтянется из речи сам. Если блок не влезает в 2 строки, сборка предупредит.

Все времена в edit-файле задаются привязкой к фразе из речи, а не секундами: `"start": "Вопрос второй"` или `{"phrase": "ответ В", "after": "Вопрос третий", "edge": "end", "offsetMs": 300}`. Поэтому элементы не съезжают при правках.

Правила стиля и порядок работы для Claude — в [CLAUDE.md](CLAUDE.md).

Предпросмотр в браузере после сборки: `npx remotion studio src/index.ts --props=build/<имя>/9x16.props.json`.
