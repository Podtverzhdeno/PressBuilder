# P08 / P09 — архив сцен и audio/motion timeline

## P08: Version archive

Все данные хранятся на постоянном Railway volume в каталоге /data/decks/<project>/.scene-versions/<scene>/.

**Последовательность MCP:**

1. render_scene → get_scene_render_status: получить конкретную сцену с QA PASS.
2. save_scene_version: архивировать только готовый результат, если source fingerprint при постановке рендера совпадает с текущими входными данными.
3. list_scene_versions: получить version_id, SHA-256 файла, список версий, approval revision и current_fingerprint.
4. approve_scene_version: явно принять версию с expected_revision. Принятие не удаляет предыдущие MP4.
5. restore_scene_version: восстановить slide, scene3d и cue markers с обязательным expected_fingerprint; без перерендера остаётся доступен архивный MP4.
6. compare_scene_versions: получить изменения cue IDs, 3D, markers, FPS, длительности и SHA файлов.

**REST:** GET/POST /api/decks/:id/versions/:scene; GET /api/decks/:id/versions/:scene/:version; POST /api/decks/:id/versions/:scene/:version/approve и /restore; GET /api/decks/:id/versions/:scene/:version/video; GET /api/decks/:id/version-compare/:scene/:old/:new.

**Fingerprint:** SHA-256 по слайду (реплики, 2D), JSON 3D, cue markers, global render style/format, точным началу/длительности сцены, хэшу voice файла и commit metadata (при наличии). Immutable MP4 сохраняется под именем v-<24hex>.mp4, manifest — рядом. Новый рендер не перезаписывает принятый MP4.

**Что не гарантировано:** полная воспроизводимость произвольных TypeScript сцен без надёжно зафиксированного build artifact; конкурентная запись из разных Railway replicas; отдельные identity для reviewer; storage GC; PNG сравнение ключевых кадров. Существующая авторизация — общая для MCP, не настоящий per-agent ACL. Не считать approval юридически значимым электронным подписанием.

## P09: единая шкала времени

Единственный источник расписания — buildSchedule(deck) из src/engine/schedule.ts. У каждой сцены отдельный файл .scene-sync/<scene>.json. Метки не влияют на соседние сцены и обновляются с optimistic revision.

get_scene_sync возвращает каждому агенту narration cues со start, duration, global_start, start_frame, duration_frames, а также events с локальным и глобальным временем, номером кадра и признаком out_of_range.

Пример записи set_scene_sync с expected_revision=0:

- id=hit-01, kind=beat, anchor={type:cue_start,cue_id:payment,offset:0.25}, emphasis=0.85
- id=camera-01, kind=camera, anchor={type:scene,offset:1.5}, duration=0.5

Типы событий: beat, sfx, music, camera, animation, transition. Anchor: scene (ручная фиксированная секунда), cue_start и cue_end (перемещается вместе с репликой). Для unknown cue возвращается ошибка, а не фиктивная синхронизация. По фактическому глобальному времени каждый кадр вычисляется независимо: round(globalTime*fps), чтобы не накапливать округление.

**REST:** GET/PUT /api/decks/:id/sync/:scene.

**Реальная привязка 3D-анимации:** в set_scene_3d для объекта допускается дополнительное поле start_marker, например start_marker=hit-01. При загрузке проекта browser renderer получает resolved events из /sync/:scene и устанавливает начало появления 3D-объекта строго по локальному времени указанного маркера. При изменении длительности реплики движение автоматически перепривязывается. Если marker удалён или вышел за границы сцены, сервер отказывает в новом render_scene, а редактор не подменяет время молча. Камерные траектории, SFX и музыка пока остаются декларативными событиями.

**Ограничение:** для SFX/music пока только синхронизационный контракт и маркеры. Реальное микширование PCM, загрузка licensed music, loudness/ducking, автоматические стыки по речевым паузам и сквозной монтаж P05 пока НЕ реализованы. MP4 рендер продолжает брать голос из существующего voice track.

## Тесты и критерии

npm run build; npm run test:cloud. В tests/cloud-scene-versions-sync.test.mjs проверяются: stale render, потеря старого MP4 при повторном рендере, независимые сцены, восстановление cues и 3D, конфликт revisions, изменение длительности реплики и FPS, недопустимые маркеры, целостность SHA-256.

Для production ещё требуются: cross-process locks, quotas/GC, зафиксированный source bundle, PNG visual diff, reviewer identity, реальное сведение аудио и интеграционный Docker MP4 smoke с шести сценами. Стадии P08/P09 остаются IN PROGRESS до этих проверок.
