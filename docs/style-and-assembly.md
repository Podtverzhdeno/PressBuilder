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
