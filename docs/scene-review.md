# P06/P07 — владение сценами и покадровое ревью

Состояние: P06 защищён отдельными ключами/областями доступа и сценовыми арендами в `server/scene-leases.mjs`. P07 реализован поверх **того же** механизма, без второго реестра или дублирования полномочий.

## Агенты и доступ

Для реальной изоляции **не выдавайте** агентам общий `MCP_API_KEY` или OAuth токен владельца: оба дают роль director. В `PB_AGENT_KEYS_JSON` (секрет Railway, не в git) зарегистрируйте массив **уникальных** ключей; scope обязателен для каждого агентского ключа:

```json
[
  {"id":"agent01","role":"worker","token":"<independent 32+ character random secret>",
   "projects":["my-project"],"scenes":["s01"]},
  {"id":"review01","role":"reviewer","token":"<another 32+ character secret>",
   "projects":["my-project"],"scenes":["s01"]}
]
```

Для занятой сцены `assignee` в её задании должен **точно совпадать** с `id` рабочего агента (или оставаться пустым до назначения директором); иначе сервер отклонит захват и любые записи. Дополнительно токен агента должен включать проект и сцену в `projects/scenes`.

Worker читает `get_project_context`, `get_scene_task`, `get_scene_lease`, вызывает `claim_scene({id,slide_id,ttl:300})`, сохраняет возвращённый `fence`, после чего в каждый MCP-вызов **записи** передаёт `fence_token:fence`. `renew_scene_lease` продлевает живую аренду, `release_scene` инвалидирует старые fencing token. Worker не может менять `assignee`, утверждать собственный статус `done`, менять narration `say`/тайминг cue или slide. Перепроверять по последней `revision` перед записью.

P06 сохраняет владение в `/data/decks/<id>/.scene-leases`; многорепличное развёртывание требует транзакционной БД: файловые аренды над одним process + volume не обеспечивают атомарность на нескольких Railway контейнерах. При использовании роли director scope не ограничен — защищайте и ротируйте такой токен.

## P07: цикл замечания по кадру

1. Агент запускает `render_scene(id,slide_id)`, ждёт `get_scene_render_status.status=completed` и получает настоящий `job_id`.
2. Ревьюер открывает редактор → **Ревью кадра**, останавливает видео на нужном времени (например 3.400 с), при необходимости выделяет прямоугольник и пишет предметное замечание.
3. `create_scene_review_item` принимает **реальный завершённый** `render_revision=job_id`, время `t` от начала **этой сцены** (сек), `fps`, номер кадра `frame=round(t*fps)`, `severity`, `text`, `region` с нормированными координатами 0..1, опциональную JPEG/PNG миниатюру.
4. Worker через `list_scene_review_items` / `get_scene_review_item` читает зафиксированный дефект, исправляет сцену и после фактического результата вызывает `update_scene_review_item({status:"FIXED",note,expected_revision,fence_token})`.
5. Reviewer/director проверяет исправленную сцену и переводит замечание в `VERIFIED` либо `REOPENED` с причиной. История и архивный скриншот остаются; запись с устаревшей ревизией получает 409.

Схема: `scene_id,render_revision,t,fps,frame,region,severity,text,author,status,revision,frame_evidence,history`. По одному независимому файлу `/data/decks/<id>/.scene-reviews/<slide_id>.json`. Максимум 80 remarks на сцену, 130 KB JPEG/PNG evidence на каждый; оригинальная миниатюра хранится вместе с записью и не исчезает при повторном рендере.

**Техническое ограничение:** новая версия MP4 может перезаписать предыдущую. Замечание остаётся привязано к job_id, а сохранённый кадр остаётся доступен, но архивирование полного MP4 требует P08. Художественная приёмка не заменяется автоматическими статусами.

## Приёмка

```bash
npm ci
npm run build
npm run test:cloud
```

Проверены тестами: разделение сцен, права reviewer/worker/director, запрет редактирования чужого, отсутствие или истечение аренды, fencing, stale revision, точность `t/frame/fps`, JPEG evidence, история OPEN→FIXED→VERIFIED→REOPENED. Финальный браузерный E2E с **реальным** MP4 и ручной приёмкой ещё обязателен для production release.

Связанные документы: `docs/production-p04-p06.md`, `docs/scene-agents.md`.
