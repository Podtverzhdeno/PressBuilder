# P04–P06 — визуальные контракты, сборка, права агентов

Статус: **MVP в Draft PR #1**, не полный production DoD. Подробный трекер — [tasks.md](../tasks.md).

## P04 — визуальный контракт

REST Basic: GET/PUT `/api/decks/:id/style-contract`. MCP: `get_style_contract`, `set_style_contract` (изменение разрешено только директору).
Хранение: `/data/decks/<id>/style-contract.json`; ревизии с обязательным `expected_revision`, атомарная замена.
Объект `contract`: `schemaVersion:1`, `enforce:boolean`, `palette: HEX[]`, `typography:{fonts,minFontSize,maxTextLength}`, `safeArea:{left,right,top,bottom}`, `camera:{maxYawSpeed,maxPitchSpeed}`, `motion:{maxSpin}`, `transitions:{allowed:["hard-cut"],maxDuration:0}`.
По умолчанию `enforce:false` ради обратной совместимости. При `true` новые 3D-публикации проверяются на палитру и скорости; новые 2D-тексты через MCP — на шрифт, длину, размер и положение **точки привязки** в safe area.
Не проверяются: фактический bbox глифов, наследование scene override, написанные вручную TypeScript-сцены, полная графическая идентичность, глобальная тема и редактирование контракта из UI. REST-полная запись deck.json остаётся директорским обходом.

## P05 — hard-cut сборка сцен

MCP директора: `assemble_video({id,scene_ids:["s01","s02"]})`, затем `get_assembly_status({id})`. REST: POST и GET `/api/decks/:id/assemble`.
Принимаются 2–12 сцен одного проекта **в порядке проекта**, каждая с `scene_task.status=done`, завершённым `render_scene`, техническим `qa_report.verdict=PASS` и реально существующим MP4. Проверка файлов через ffprobe повторяется перед монтажом.
FFmpeg сводит видео к одному H.264/yuv420p, FPS/разрешению проекта, AAC 48kHz; для ролика без аудио вставляет тишину. Только hard-cut. Итоговый файл `out/<id>_final.mp4`, SHA-256 каждого входа и итоговый `out/<id>_final.manifest.json`. Готовый MP4 заменяется атомарно после QA, предыдущий файл переживает ошибку до публикации.
Не готовы: entry/exit состояния, crossfade/match-cut, immutable release и версия каждого исходного артефакта, транзакционная атомарность пары MP4+manifest, durable assembly jobs и защита от нескольких replica.

## P06 — сцены с идентичностями и fenced leases

Важно: `assignee` — метка, а не ACL. Каждый worker должен использовать **свой** bearer token из Railway Secret Variable `PB_AGENT_KEYS_JSON`, а не директорский `MCP_API_KEY`.

Пример настройки в секретном окружении (значения ниже — НЕ реальные секреты):

```json
[
  {"id":"agent-01","token":"CHANGE_TO_RANDOM_SECRET_AT_LEAST_24_CHARS","role":"worker","projects":["my-video"],"scenes":["s01"]},
  {"id":"agent-02","token":"CHANGE_TO_ANOTHER_RANDOM_32_CHAR_SECRET","role":"worker","projects":["my-video"],"scenes":["s02"]}
]
```

Доступны роли worker, reviewer, viewer для ограниченных ключей. Только worker может записывать свои сцены; reviewer и viewer читают. Директор (общий MCP_API_KEY, доверенный OAuth MCP и веб-редактор через Basic) имеет широкие полномочия и может принудительно переназначать сцену.

1. Прочитайте проект через `get_project_context`, конкретное ТЗ через `get_scene_task` и стиль через `get_style_contract`.
2. `claim_scene({id,slide_id,ttl:300})` возвращает `fence`.
3. Передайте `fence_token:fence` в `set_scene_3d`, `set_slide_visuals`, `set_scene_task`, `set_scene_checkpoint`, `update_cue`, `update_slide` или `update_object`.
4. `renew_scene_lease` продлевает действующую аренду; `release_scene` освобождает и делает прошлые fencing tokens недействительными. `get_scene_lease` показывает владельца.
5. Аудит в `/data/decks/<id>/.scene-leases/audit.jsonl` содержит время, trace_id, actor, действие и ревизию; API-ключи в него не пишутся.

Ограничение: реализация рассчитана на один Node process и локальное последовательное хранение. Несколько реплик с общим томом и полное отзыв/ротация токенов пока не поддержаны; для production нужен транзакционный PostgreSQL.

## Проверки

`npm run build && npm run test:cloud` (в том числе `tests/cloud-production-p04-p06.test.mjs`). Тесты включают права отдельного agent bearer token, запрет чужой сцены, устаревший lease, ревизии style contract, offline FFmpeg hard-cut с источником без аудио и технический QA финального файла.

См. ограничения в [tasks.md](../tasks.md) перед приёмкой.
