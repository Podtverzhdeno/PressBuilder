# P04/P05 — style contract и монтаж PressBuilder

## Контракт оформления

HTTP: GET/PUT /api/decks/:id/style-contract (PUT: contract + expected_revision). MCP: get_style_contract, set_style_contract. В get_project_context приложена версия договора.
Поле enforce=true активирует серверные проверки до записи 2D/3D через MCP, 3D REST, а также при полном сохранении deck.json через Cloud REST и локальный Vite API. Цветовые токены h1/accent/pos/text/panel/bg в 2D сначала переводятся в HEX из текущего пресета; палитра контракта должна содержать их фактические разрешённые значения. В редакторе есть кнопка «Контракт стиля» с JSON, палитрой и схемой safe area.
Параметры sceneOverrides могут только ужесточать глобальные правила: палитру, размер шрифта, safe area, максимальные угловые скорости, вращение и длительность перехода.
JSON Schema: docs/style-contract.schema.json. Runtime использует ручную строгую проверку структуры и семантических зависимостей; AJV не подключён.

Ограничение: измерение реальных bounding boxes текста, горизонтального растяжения и пересечений Canvas-глифов не завершено в P03. Origin-геометрия и размер текста — только консервативные проверки.

## Монтаж

HTTP: GET/PUT /api/decks/:id/assembly-plan, POST /api/decks/:id/assemble, GET /api/decks/:id/assemble, POST /api/decks/:id/assemble/cancel.
MCP: get_assembly_plan, set_assembly_plan, assemble_video, get_assembly_status, cancel_assembly.
Сцена в assembly-plan содержит scene_id, entry_state, exit_state, transition_after. У состояния: subject, background, camera=[0..1,0..1], motion. У перехода: type, duration.
Типы: hard-cut (0 сек), crossfade (FFmpeg xfade + acrossfade), match-cut (проверка совпадающего предмета, движения и кадрирования; физически жёсткий стык). Морфинг не реализован.

Сборка разрешена только по 2–12 соседним сценам в исходном порядке. Каждая должна иметь task.status=done и **явно утверждённую неизменяемую MP4-версию (P08) с PASS**. Новые черновые рендеры не должны подменять утверждённую версию. Для standalone unit-сценариев без P08 остаётся обратная совместимость с getRender.
Входные MP4 замораживаются в staging и сверяются по SHA-256; для P08 дополнительно фиксируются approved_version_id и revision и повторно проверяются перед публикацией. FPS и разрешение приводятся к проектным параметрам, звук AAC stereo/48k. Если речь заканчивается раньше видео, хвост дополняется тишиной. FFmpeg сообщает приблизительный прогресс через pipe:2; отдельный рабочий слот ограничивает нагрузку Railway. Исправлен порядок trim → setpts → fps для xfade на FFmpeg 7.
Финальный артефакт: /data/out/releases/:project/:releaseId/final.mp4 и manifest.json. Сначала атомарно переименовывается каталог, затем current.json. При сбое/отмене старый релиз остаётся активным.
Ссылка на скачивание: /api/decks/:id/assembly/releases/:releaseId/final.mp4 (под WEB auth). Получить текущий релиз можно из GET /api/decks/:id/assemble, поле current_release.

## Проверки и ограничения

- node --test tests/cloud-style-assembly-contract.test.mjs
- node --test tests/cloud-assembly-ffmpeg.test.mjs — 6 отдельных клипов, замена только s03, разные FPS/озвучка, реальные переходы
- node --test tests/cloud-reviews-versions.test.mjs — подтверждение P08 approved-версий и запрета подмены черновиком
- npm run build && npm run test:cloud
- Docker/Chromium render-smoke — в CI pull request

Недоказанная часть DoD: промышленная нагрузка Railway и художественная проверка 6 сложных сцен. Для полноценной P04/QA проверки текста требуется P03. Для P05 morph-like не стоит выдавать примитивный crossfade за морфинг.

## Crash recovery / writer exclusivity

Для Railway production запускайте контейнер только через `flock -F -n -E 75 /data/.pressbuilder-writer.lock node server/cloud.mjs` (команда в `Dockerfile` и `railway.json`). `flock` использует kernel advisory lock; `-F` передаёт владение блокировкой самому Node-процессу, так что SIGKILL/завершение процесса автоматически освобождает её. Второй процесс на **том же разделе /data** не стартует (код выхода 75). Файл блокировки удалять не требуется. Обход через `node server/cloud.mjs` или `npm run start:cloud` **не обеспечивает взаимного исключения** и допустим только для локальной разработки.

`/data/out/assembly-jobs/<project>.json` содержит состояние последней сборки (queued/running/completed/failed/cancelled), сохраняемое атомарным rename. После перезапуска queued/running помечаются `failed` с явной причиной, после чего оператор может запустить экспорт заново. Ранее опубликованный `current.json` и immutable MP4 остаются нетронутыми. Промежуточные `.partial-*` не очищаются автоматически, чтобы исключить небезопасное удаление при нестандартном запуске.

**Это не поддержка нескольких Railway-реплик.** Advisory `flock` защищает только процессы на общем томе с корректными POSIX locks; отдельные volumes не координируются. Для настоящих нескольких реплик необходимы общая БД для lease/fencing+CAS, общие object storage/bucket для MP4, очередь с дедупликацией, proxy/routing и E2E тесты kill/network partition. Пока держите одну реплику и один writer, а при несрабатывании flock — не запускайте сервер.

## P05 — Повторное использование готового монтажа и метрики

Если все утверждённые MP4, SHA-256, порядок сцен, ревизии approvals, план переходов, контракт стиля, FPS, разрешение и версия профиля энкодера совпадают, повторный запрос возвращает проверенный активный релиз (`cache_hit: true`), не запускает FFmpeg и не создаёт новый файл. `job_id` сохраняется из исходного immutable manifest для корректного P10 signoff, а `request_id` уникален для cache-hit вызова. Сначала всё равно проверяются P07 review, QA и контрольные суммы; повреждённые и старые релизы не переиспользуются.

В GET/POST `/api/decks/:id/assemble` добавлены `cache_hit` и `timings_ms`: `prepare`, `snapshot`, `encode`, `qa`, `total` (мс). Неисполненные стадии отсутствуют. Журнал сохраняет показатели после перезапуска. Бенчмарк в `tests/cloud-assembly-ffmpeg.test.mjs` печатает `ASSEMBLY_CACHE_BENCHMARK`; цифры CI не равны производительности Railway. При изменении профиля энкодера нужно увеличить `ENCODER_PROFILE`.

Для повторного кодирования даже при неизменных исходниках директор может указать `force: true` в REST POST `/api/decks/:id/assemble` или MCP `assemble_video`. По умолчанию `force: false`. Это позволяет проверить cancellation, re-opened review mid-encode и производительность cold path без временного изменения медиаданных.

## P13 — экспериментальный инкрементальный монтаж для hard-cut

Флаг сервера `PB_INCREMENTAL_HARDCUT=1` включает экспериментальный путь только для роликов из 2–12 последовательных **hard-cut / match-cut** сцен. По умолчанию **выключено**. Crossfade и `force:true` всегда используют прежний полный FFmpeg фильтр. Каждый исходный MP4 всё равно проходит P08 approval, SHA-256, ffprobe QA и review gate перед монтажом. Действия с утверждённым релизом не меняются.

Для каждой сцены создаётся нормализованный video-only H.264 фрагмент (fps, размер, кодек/GOP/timebase); ключ кэша включает SHA-256 источника, длительность, профиль энкодера и параметры видео. Каждый cache hit проверяет хеш и ffprobe совместимость. Готовые видеосегменты объединяются через FFmpeg concat demuxer со `-c:v copy`. Аудио **пересобирается из исходных источников** единым AAC-потоком; молчащие сцены дополняются искусственной тишиной. Финальный MP4 проходит обычные технические QA, дополнительные проверки видеокодека, таймингов и A/V drift. При несовместимости, аварии FFmpeg (без отмены) или нарушении QA сервер **автоматически отказывается от быстрого пути и пересобирает прежним алгоритмом**; незавершённый быстрый результат не публикуется.

`assembly.get` и immutable manifest содержат `encode_strategy` и, если путь P13 успешно выполнен, `segment_reuse.segments_reused/segments_encoded/normalize_ms/mux_ms/total_ms`. `incremental_fallback_reason` в текущем job отражает техническую причину отказа. Результат остаётся отдельным immutable release; уже опубликованный MP4 сохраняется при отмене/ошибке.

Кэш сегментов сохраняется на volume `/data/out/assembly-segments`. **Сейчас нет автоматического GC/квоты по диску**: перед включением P13 в долгоживущей production среде требуется лимит хранилища и мониторинг свободного места. Из-за сложности packet timestamps/GOP и аудио есть риск, не определяемый техническим ffprobe QA (например, слышимые стыки). Включать P13 следует только после просмотра реальных сцен и сравнения с legacy FFmpeg. Путь не охватывает crossfade; экономия CPU и времени на Railway не подтверждена. Проверки FFmpeg: `tests/cloud-incremental-hardcut.test.mjs`.
