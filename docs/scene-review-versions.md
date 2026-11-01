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
- Отдельный список версий не поддерживает retention policy, GC/квоты и автоматическое удаление. Для production надо контролировать объём `/data`.
- Rollback **восстанавливает принятый видеоартефакт**, не откатывает оригинальный `scene3d.json`, `deck.json` или TypeScript. Это отдельная задача P08.
- Восстановление `queued/running` после рестарта повторяет рендер с новым attempt-id, защищая старые immutable версии от перезаписи, но распределённая exactly-once очередь не реализована.
- Привязка замечания к времени/прямоугольнику реализована; выгрузки архивных PNG-кадров, стрелок, визуального diff двух MP4 и художественного AI-QA пока нет.
- Аутентификация и TTL leases рассчитаны на одну Node-реплику. Общий director token нельзя выдавать независимым агентам.

## Проверка

`npm run build && npm run test:cloud`. Новые тесты: `tests/cloud-reviews-versions.test.mjs` (оптимистичная ревизия, параллельные версии, сверка SHA, rollback после нового рендера, привязка к кадру, статусная машина, роли и протухшая аренда). `tests/render-smoke.mjs` на Docker проверяет настоящий MP4, MCP ревью, блокировку утверждения до `VERIFIED`, утверждение через MCP и чтение указателя через REST.
