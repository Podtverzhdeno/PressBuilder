# PressBuilder — P08/P09 единая модель версий и синхронизации

## Совместимость с P07/P08

В общей ветке уже существует `server/scene-versions.mjs` с неизменяемыми MP4 по `job_id`, отдельным указателем утверждённой версии, аудитом, SHA-256, директорским approve/restore и интеграцией с P07 review. **Второй архив не создаём.** Вместо этого усилили P08 `source.fingerprint` и `source.snapshot`:

- исходные данные сцены (реплики, визуалы), формат, стиль, 3D-spec и style-contract;
- длина и начало сцены из `buildSchedule(deck)`, глобальный target/lead/tail;
- SHA-256 содержимого файла `voice.mp3/wav/...` (не только имя или offset);
- привязанные к сцене cue markers из P09;
- commit hash из `RAILWAY_GIT_COMMIT_SHA` или `GITHUB_SHA`, если присутствует.

Блокируем создание нового рендера, если объект `scene3d` ссылается на отсутствующий или вышедший за границы `start_marker`, либо если сохранённые cue markers содержат несуществующий cue. Это делает архив версий проверяемым при изменениях звука и движения.

**Релизная политика не меняется:** только QA PASS → done/review VERIFIED → директор утверждает версию; предыдущий одобренный MP4 не перезаписывается новым черновым рендером. `restore_scene_version` возвращает ранее одобренный **видеофайл**, а не полный исходный код сцены; восстановление исходников отдельно не реализовано.

## P09 — timebase и инструменты агентов

`GET/PUT /api/decks/:id/sync/:scene`, MCP `get_scene_sync`, `set_scene_sync`.

Отдельный объект `.scene-sync/sNN.json` хранит `revision`, `markers` и дату. Все разрешённые времена заново вычисляются одним движком `src/engine/schedule.ts`:

- narration cues: `id,say,start,duration,global_start,start_frame,duration_frames`;
- event markers: `id,kind,anchor,duration,emphasis,silence,note`;
- виды событий: `beat,sfx,music,camera,animation,transition`;
- anchors: `scene,cue_start,cue_end`, плюс `offset` в секундах.

Кадры считаются независимо `round(globalSeconds*fps)`, без накопления округлений предыдущих сцен. `cue_start/cue_end` переезжают при изменении текста или длительности реплики, `scene` с фиксированным offset обеспечивает ручной override. Если cue удалён, `get_scene_sync` возвращает `validation_error` и исходный лист маркеров для исправления; не подменяет потерянный cue другим.

**Полноценная связь с анимацией:** `set_scene_3d` принимает дополнительное свойство `start_marker` у объекта. При загрузке 3D-сцены редактор получает текущие resolved events и выставляет именно это время для начала 3D появления. При смене длительности реплики объект появляется в пересчитанную секунду.

Права агента:
- worker может прочитать только назначенную project/scene scope;
- запись `set_scene_sync` требует его действующей `claim_scene` lease и `fence_token`;
- директор имеет полномочия записи без аренды; другие роли не могут модифицировать;
- REST защищён существующей веб-авторизацией.

Пример `set_scene_sync` после `claim_scene`:

```json
{
  "id":"demo","slide_id":"s01","fence_token":1,"expected_revision":0,
  "markers":[
    {"id":"hit-01","kind":"beat","anchor":{"type":"cue_start","cue_id":"c01","offset":0.25},"emphasis":0.8},
    {"id":"camera-cut","kind":"camera","anchor":{"type":"scene","offset":1.5},"duration":0.4}
  ]
}
```

Затем `set_scene_3d` для нужного объекта: `{"id":"mesh-01","start_marker":"hit-01",...}`.

## Проверки и границы MVP

`npm run build`, `npm run test:cloud`; тесты `tests/cloud-scene-sync.test.mjs` проверяют тайминги при смене 24→60 FPS, изменение voice файла, изоляцию сцен, отсутствие marker ID и проверку per-agent lease через реальный MCP HTTP.

**Не реализовано:** генерация/загрузка лицензионной музыки, настоящий SFX/music mixer, loudness/ducking, автоматические переходы по паузам, визуальное сравнение PNG-кадров, атомарность multi-instance FS и архив исходных TS-сборок. Нельзя помечать P09 и P08 fully production-ready только на основании metadata+FFmpeg smoke.

## CI acceptance

Проверка `render-smoke` дополнена ожидаемым отрицательным сценарием: попытка принять сцену с OPEN review-item **должна** завершиться ошибкой `Unresolved review issues prevent approval`. После `FIXED` и `VERIFIED` директор повторно вызывает approve и проверяет, что архивный MP4 читается. Ошибка с ожидаемым статусом не должна аварийно обрывать скрипт smoke.
