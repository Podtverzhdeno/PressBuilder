# P07–P08 — покадровое ревью и неизменяемые версии MP4

Статус: **проверяемый MVP**, а не полный production DoD. Реализация в Draft PR #1, данные на томе `PB_DATA_DIR`.

## Как работает

1. Агент создаёт или меняет сцену и вызывает `render_scene`.
2. Рендерится отдельный MP4 `out/<project>_<scene>_v<version>.mp4`. `version_id` — 16 символов SHA-256 от render-attempt ID, уникальный для перезапущенных попыток. Результат проходит технический ffprobe QA. Метаданные / SHA-256 сохраняются в `.scene-versions/<scene>/<version>.json`.
3. Если сцену изменили в ходе рендера, её результат отклоняется по fingerprint текущего deck/scene3d/style-contract. Fingerprint **не включает произвольные исходники TypeScript и байты аудиофайла**: полноценный provenance пока требует отдельной работы.
4. Директор / reviewer оставляет замечание по конкретной версии и времени кадра: `add_scene_review_item`. Запись хранит `version_id`, секунду `t`, индекс `frame`, severity и необязательный прямоугольник в нормализованных координатах `[0..1]`.
5. Worker с живой fenced lease отмечает `FIXED`. Reviewer или director подтверждает `VERIFIED` или возвращает `REOPENED`. Все переходы добавляются в `history` и не перезаписывают предыдущие события. Обновления защищены `expected_revision`.
6. Директор переводит сценовое задание в `done`, убеждается, что все замечания к выбранной версии `VERIFIED`, затем вызывает `approve_scene_version`. Это меняет `approved.json` и стабильный `out/<project>_<scene>.mp4`. Пока идёт новый черновой рендер, **ранее утверждённый MP4 сохраняется**.
7. Директор может вызвать `restore_scene_version` только для версии, которая уже встречалась в журнале утверждений. Откат не вызывает рендер повторно, проверяет SHA-256 и требует актуальную `approved.revision`.
8. `assemble_video` использует только утверждённые immutable MP4 и ещё раз проверяет выбранные версии/хэши при завершении сборки. Неутверждённые черновики в финальную сборку не попадают.

## MCP

- `list_scene_versions({id,slide_id})` — версии и утверждённая ревизия
- `get_scene_version({id,slide_id,version_id})` — SHA, QA, тайминг, ссылка на MP4 (скачивание требует веб-авторизации)
- `list_scene_review_items({id,slide_id})` — все замечания и история
- `add_scene_review_item({id,slide_id,version_id,t,text,severity,rect?,expected_revision})` — добавить замечание
- `transition_scene_review_item({id,slide_id,item_id,status,note,expected_revision,fence_token?})` — `FIXED` от worker с lease или director; `VERIFIED` / `REOPENED` от reviewer/director
- `approve_scene_version({id,slide_id,version_id,expected_revision})` — только director
- `restore_scene_version({id,slide_id,version_id,expected_revision})` — только director, прежнее утверждение обязательно

Пользователь облачного редактора (Basic auth, доверенный director) может открыть кнопку **«Ревью MP4»**, выбрать версию, посмотреть именно её `<video>`, остановить на кадре, указать область щелчком и оставить комментарий. Интерфейс показывает замечания и команды переходов, утверждения и отката. Локальный Vite dev-сервер не поддерживает облачную историю рендеров: используйте Cloud.

## REST (Basic auth)

- `GET /api/decks/:id/versions/:scene` — метаданные версий и approved-pointer
- `POST /api/decks/:id/versions/:scene/approve` — `{version_id,expected_revision}`
- `POST /api/decks/:id/versions/:scene/restore` — `{version_id,expected_revision}`
- `GET /api/decks/:id/reviews/:scene` — список замечаний
- `POST /api/decks/:id/reviews/:scene` — `{expected_revision,item:{version_id,t,text,severity,rect?}}`
- `PATCH /api/decks/:id/reviews/:scene/:item_id` — `{expected_revision,status,note}`

## Надёжность и ограничения

- Утверждённый `approved.json` и копия MP4 пока не являются единой транзакцией. На сбое между двумя атомарными заменами возможен кратковременный рассинхрон: `approved()` опирается на pointer и проверяет immutable файл, но legacy alias может отличаться.
- Число версий ограничено 50 на сцену (при превышении новый рендер отклоняется), но автоматического retention/GC, лимита суммарных байтов и архивирования ещё нет. Для production требуется контролировать объём `/data`.
- Rollback **восстанавливает принятый видеоартефакт**, не откатывает оригинальный `scene3d.json`, `deck.json` или TypeScript. Это отдельная задача P08.
- Восстановление `queued/running` после рестарта повторяет рендер с новым attempt-id, защищая старые immutable версии от перезаписи, но распределённая exactly-once очередь не реализована.
- Привязка замечания к времени/прямоугольнику реализована; выгрузки архивных PNG-кадров, стрелок, визуального diff двух MP4 и художественного AI-QA пока нет.
- Аутентификация и TTL leases рассчитаны на одну Node-реплику. Общий director token нельзя выдавать независимым агентам.

## Проверка

`npm run build && npm run test:cloud`. Новые тесты: `tests/cloud-reviews-versions.test.mjs` (оптимистичная ревизия, параллельные версии, сверка SHA, rollback после нового рендера, привязка к кадру, статусная машина, роли и протухшая аренда). `tests/render-smoke.mjs` на Docker проверяет настоящий MP4, MCP ревью, блокировку утверждения до `VERIFIED`, утверждение через MCP и чтение указателя через REST.

## P03 — архивные контрольные кадры

Начиная с новых рендеров Cloud, каждая версия MP4 получает **3 автоматически извлечённых реальных JPEG** в 10%, 50% и 90% доступной длины кадрированного ролика. Для каждого кадра фиксируются `t`, `frame`, SHA-256, размер и диагностические показатели `mean_luma`/`luma_stddev`. Дополнительные предупреждения: `DARK_FRAME`, `LOW_DETAIL`, `SIMILAR_TO_PREVIOUS_SAMPLE`.

Файлы лежат в `/data/out/<project>_<scene>_v<version>_f0.jpg` (аналогично f1/f2), загружаются из защищённого `GET /out/...`, отображаются во вкладке «Ревью MP4». При утверждении версия проверяет неизменность **MP4 и всех имеющихся JPEG**. Существующие legacy-версии без превью продолжают читаться.

**Это эвристики для ревьюера, не автоматическая оценка художественного качества.** Однотонный или чёрный кадр может быть намеренным. Контроль 25%/75%, появления cue, text bounding-box и golden-frame diff — ещё backlog.

## P08 — immutable source snapshot и ограниченный откат исходных данных

Для новых версий `server/source-provenance.mjs` учитывает:

- полный JSON **одного слайда** (cues, visuals, object overrides), его 3D-overlay, стиль-контракт, проектные style/format/audio;
- зависимость старта слайда от порядка сцен, предшествующих реплик/пауз и target;
- SHA-256 файла озвучки (если привязан) и всех HTML/CSS/JS артефактов опубликованного `build`; внешние ассеты и исходные TS-файлы **не архивируются**.

Снимок находится в `/data/decks/<project>/.scene-versions/<scene>/<version>.source.json`. Его хэш сверяется с `manifest.source.fingerprint`. В публичной информации о версии передаётся только сводка с хэшами и ревизиями.

Новые инструменты MCP (только **director**):
- `get_scene_source_state({id,slide_id})` → текущий `fingerprint` и `scene3d_revision`, без данных слайда;
- `get_scene_source_snapshot({id,slide_id,version_id})` → архивная декларативная сцена, source hashes и зависимости;
- `restore_scene_source({id,slide_id,version_id,expected_fingerprint,expected_scene3d_revision})` → восстанавливает только JSON слайда и декларативный overlay 3D, не трогая соседние сцены и принятый MP4. При изменении общих настроек/аудио/браузерного bundle или таймлайна операция отказывает 409.

REST (Basic/director): `GET /api/decks/:id/versions/:scene/source-state`, `GET /api/decks/:id/versions/:scene/:version/source`, `POST` по последнему URL с `{expected_fingerprint, expected_scene3d_revision}`.

**Важно:** `restore_scene_version` восстанавливает принятый MP4; `restore_scene_source` восстанавливает *только данные сцены*. Эти операции независимы. Нельзя говорить о полном source-code rollback: TypeScript, внешние файлы и сборка `build` не восстанавливаются. Две файловые записи `deck.json`/scene3d корректируются с компенсацией при обычном отказе, но на внезапном завершении процесса не являются одной ACID-транзакцией.

Проверки: `tests/cloud-frame-qa.test.mjs`, `tests/cloud-source-provenance.test.mjs`, `tests/render-smoke.mjs`.

## Дополнительные гарантии P06/P07 (2026-11-01)

- В `list_scene_tasks`, `get_deck.scene_tasks` и `get_project_context.scene_tasks` агент видит подробные задания **только своих** сцен по `PB_AGENT_KEYS_JSON.scenes`. Для роли `worker` изменение задания через `set_scene_task` ограничено **статусом**: исполнитель не может менять название, ТЗ, критерии приёмки и состав чекпоинтов. Отметка `set_scene_checkpoint(done:true)` требует содержательную заметку с доказательством выполнения. Если агент пытается запросить `get_project_context({slide_id})` для чужой сцены, он получает отказ (403). Директор видит все задания; общий сценарий ролика и глобальные правила по-прежнему доступны в рамках своего проекта.
- Открытие нового замечания к **уже утверждённой** MP4-версии или перевод `VERIFIED → REOPENED` помечает существующую финальную сборку как требующую перепроверки: `get_assembly_status.review_valid=false`, `unresolved_scenes=[...]`. Сам ранее опубликованный MP4 автоматически не удаляется.
- `assemble_video` отказывает, если для выбранной утверждённой версии есть нерешённые замечания. После FFmpeg **перед публикацией** выполняется повторная проверка — если замечание появилось во время сборки, новый MP4 не заменяет предыдущий принятый результат.
- Эти проверки защищают именно **версию MP4**, выбранную для монтажа, а не любые замечания ко всем черновым версиям. Новые версии требуют отдельной проверки и утверждения.

Ограничение: файл-ориентированная запись ревью, аренда и публикация остаются MVP для одной серверной реплики. При нескольких репликах требуется транзакционный реестр/координация. Полностью автоматическая отмена ранее опубликованного файла при обнаружении нового дефекта не реализована.

## P11 — визуальное сравнение двух версий

MCP `compare_scene_versions({id,slide_id,before_version,after_version})` и защищённый Basic HTTP `GET /api/decks/:id/versions/:scene/compare/:before/:after` возвращают три пары реальных P03 JPEG, три изображения разности пикселей и метрики `mean_absolute_difference` (0…255) и `changed_fraction` (0…1). Изображения различий доступны по `GET /api/decks/:id/versions/:scene/compare/:before/:after/:index.jpg` (index 0–2) после обязательной проверки архивных MP4 и JPEG. Все URL требуют Basic авторизации облачного сервера. MCP возвращает URL, а не публично доступные кадры.

Сравнение проводится в относительных точках 10/50/90% версии. При разной длительности роликов сравниваются **разные моменты**: это подсказка ревьюеру, а не алгоритм качества/соответствия. Чувствительность к компрессии JPEG сохраняется, а размер статистической выборки — 64×36 RGB. Разности визуализируются как обычные JPEG 640×360. Все вызовы FFmpeg ограничены размером вывода и timeout, защищены общим P02/P05 resource governor. Результат закэширован по SHA-256 исходных артефактов и версии алгоритма; повреждённый кэш пересоздаётся. Утверждения P08, P07 замечания и исходные файлы не меняются. Старые версии без P03 кадров возвращают 409, а не выдуманные картинки.
