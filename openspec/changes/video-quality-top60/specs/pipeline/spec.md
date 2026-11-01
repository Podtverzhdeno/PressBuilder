# OpenSpec Top-60 / E. Рендер, ресурсы, параллельность и отказоустойчивость

> PROPOSED. Важно: некоторые контуры P02/P05/P08/P13 уже реализованы. Эти 10 пунктов описывают конкретный следующий уровень, а не повторяют существующее MVP.

### Requirement M41 — Инкрементальный рендер через контент-адресный DAG

- **Тип:** Системная; **оценки Q/E/F/C/S/L:** 10/10/8/9/10/10; **зависимости:** P02,P05,P08,P13; **статус:** PROPOSED.
- **Проблема / ценность:** Переписанная одна реплика вызывает повторную сборку всех сцен и лишние минуты Chromium/FFmpeg.
- **Инженерная реализация:** Каждый immutable узел render DAG хэширует source asset, timing, renderer/fonts, filters, mode и требуемые outputs. Изменение одного cue инвалидирует только зависимые keyframe/frame-span nodes; unchanged scene MP4 переиспользуются после integrity check.
- **Контракт, ресурсные ограничения, безопасность:** RenderDAG_v1: node type, source/output SHA, dependent IDs, toolchain digest, feature flags, invalidation reasons, no stale shared cache.
- **DoD + нагрузочные тесты:** На 6 сценах изменение одного cue вызывает 0 новых рендеров остальных пяти, cold/warm benchmark показывает выигрыш времени и ресурсов; повреждённый cache не считается hit.
- **Негативные сценарии и операционный риск:** Сложность invalidation и гонки в shared FS; SHA должен включать даже скрытые шрифты и музыки, otherwise silent stale artifact.
- **Итерации:** baseline (реальные 6 сцен) → schema/schema-validation → изолированный worker/planner за флагом → fault injection/compatibility и SHA equivalence → нагрузочные сравнения p50/p95/CPU/RAM/cost → independent security/perf review → staging rollback. Смена pointer возможна только после каскада P03/P08/P05 gates.

### Requirement M42 — Моментальный preview с proxy → master согласованностью

- **Тип:** Системная; **оценки Q/E/F/C/S/L:** 10/10/9/9/9/10; **зависимости:** P02,P11,P12; **статус:** PROPOSED.
- **Проблема / ценность:** Полный 1080p H.264 render слишком медленный для принятия композиционных решений на каждом клике.
- **Инженерная реализация:** Два render-профиля из одного typed scene graph: fast proxy (resolution/fps/bitrate ограничены, sampling по назначению) и master 1080p. Interactive preview рендерит соседний shot range/кадры с низкой задержкой, затем по запросу master.
- **Контракт, ресурсные ограничения, безопасность:** PreviewManifest_v1: source graph SHA, proxy settings, color transform, frame/time mapping, warning on non-equivalence.
- **DoD + нагрузочные тесты:** На заранее зафиксированных шести сценах проверить p50/p95 preview latency и пик RAM против baseline, proxy и master имеют одинаковые cue boundaries; финальная приёмка всегда по master.
- **Негативные сценарии и операционный риск:** Proxy может скрывать рендер-артефакты; нельзя переносить его QA verdict на master, отключить дорогие фильтры лишь с явным предупреждением.
- **Итерации:** baseline (реальные 6 сцен) → schema/schema-validation → изолированный worker/planner за флагом → fault injection/compatibility и SHA equivalence → нагрузочные сравнения p50/p95/CPU/RAM/cost → independent security/perf review → staging rollback. Смена pointer возможна только после каскада P03/P08/P05 gates.

### Requirement M43 — Предсказание цены и длительности до запуска рендера

- **Тип:** Атомарная; **оценки Q/E/F/C/S/L:** 8/9/9/9/9/8; **зависимости:** P02,P12,P13; **статус:** PROPOSED.
- **Проблема / ценность:** Планировщик не понимает, какая сцена перегрузит Railway, и допускает очереди с непредсказуемой стоимостью.
- **Инженерная реализация:** Собирать verified metrics по CPU/peak RAM/scene elements/effects/frames; robust regression или quantile model прогнозирует p50/p95 wall time и money budget. Выдавать explainable risk band до enqueue, далее обучаться только по реальные запускам.
- **Контракт, ресурсные ограничения, безопасность:** RenderEstimate_v1: renderer version, source complexity digest, model version, p50/p95 and confidence, policy budget.
- **DoD + нагрузочные тесты:** Backtest на временно отложенных задачах без leakage; empirical p95 coverage не ниже согласованного порога, estimator не изменяет приоритет по неопределённой метрике.
- **Негативные сценарии и операционный риск:** Данных по редким эффектам мало; честный fallback на pessimistic budget, нельзя обещать постоянную точность 90%.
- **Итерации:** baseline (реальные 6 сцен) → schema/schema-validation → изолированный worker/planner за флагом → fault injection/compatibility и SHA equivalence → нагрузочные сравнения p50/p95/CPU/RAM/cost → independent security/perf review → staging rollback. Смена pointer возможна только после каскада P03/P08/P05 gates.

### Requirement M44 — Настоящая параллельная шести-сценная оркестрация

- **Тип:** Системная; **оценки Q/E/F/C/S/L:** 10/10/7/8/9/10; **зависимости:** P02,P06,P08,P10; **статус:** PROPOSED.
- **Проблема / ценность:** Шесть агентов работают отдельно, но один глобальный рендер-очередной слот сводит ускорение к минимуму.
- **Инженерная реализация:** Декомпозировать render jobs по проектам/сценам/сегментам с owner lease, idempotency, worker capabilities и resource-aware scheduler. Оптимизировать max concurrency по фактическому RAM/CPU, fallback single writer на общем FS.
- **Контракт, ресурсные ограничения, безопасность:** RenderJob_v2: project/scene source SHAs, lease token, job budget, queue state, heartbeat, artifact manifest, complete CAS.
- **DoD + нагрузочные тесты:** Шесть независимых сцен проходят без чужих edits; при падении одного worker повторяется только его сегмент, output SHA проверен, approved versions не перезаписываются.
- **Негативные сценарии и операционный риск:** На существующем Railway volume single-writer lock; многорепличность допускается только после перехода на транзакционный store и независимую object storage.
- **Итерации:** baseline (реальные 6 сцен) → schema/schema-validation → изолированный worker/planner за флагом → fault injection/compatibility и SHA equivalence → нагрузочные сравнения p50/p95/CPU/RAM/cost → independent security/perf review → staging rollback. Смена pointer возможна только после каскада P03/P08/P05 gates.

### Requirement M45 — Компилятор безопасного графа FFmpeg-фильтров

- **Тип:** Атомарная; **оценки Q/E/F/C/S/L:** 9/9/8/9/10/9; **зависимости:** P05,P19,P21; **статус:** PROPOSED.
- **Проблема / ценность:** Каждый эффект собирается ad hoc строкой ffmpeg; дублируется decode/encode, растёт вероятность path injection и дорогих фильтров.
- **Инженерная реализация:** Описывать DSP/visual operators typed DAG с whitelist: crop, scale, overlay, concat, loudnorm, volume, afade, xfade. Компилятор сливает совместимые операции и не позволяет пользовательские shell/filter-expression fragments.
- **Контракт, ресурсные ограничения, безопасность:** FilterIR_v1: validated nodes/edges, codec constraints, explicit argv, estimated peak memory, max graph depth and size.
- **DoD + нагрузочные тесты:** На 50 проверенных форматов output PTS/codec совпадает с baseline, inject-пейлоады отвергаются; CPU time compare against current command assembly.
- **Негативные сценарии и операционный риск:** Некоторые FFmpeg filters требуют сложных quoting; никогда не собирать argv из сырого текстового поля.
- **Итерации:** baseline (реальные 6 сцен) → schema/schema-validation → изолированный worker/planner за флагом → fault injection/compatibility и SHA equivalence → нагрузочные сравнения p50/p95/CPU/RAM/cost → independent security/perf review → staging rollback. Смена pointer возможна только после каскада P03/P08/P05 gates.

### Requirement M46 — Адаптивное качество рендера под ресурсный бюджет

- **Тип:** Атомарная; **оценки Q/E/F/C/S/L:** 9/9/8/9/9/8; **зависимости:** P02,P12,P18; **статус:** PROPOSED.
- **Проблема / ценность:** Одна тяжёлая сцена может истощить RAM/CPU и заблокировать весь пайплайн.
- **Инженерная реализация:** Scheduler выбирает тип задачи: quality tier, tile size, number of concurrent frames, proxy or master, oversample factor по measured resource profile. При low-memory fallback не ухудшает обязательные quality gates без явной смены конфигурации.
- **Контракт, ресурсные ограничения, безопасность:** ResourceBudget_v1: max_cpu_seconds, mem_bytes, wall_deadline, permitted knobs, active limit, on_failure policy.
- **DoD + нагрузочные тесты:** На synthetic worst-case 3D fixture нет OOM и потерянного accepted MP4; сравнить peak RSS/render seconds при quality-preserving настройках, unbounded filter reject.
- **Негативные сценарии и операционный риск:** Адаптация не должна незаметно менять пиксели финального master: только заранее разрешённые эквивалентные настройки или новой версии.
- **Итерации:** baseline (реальные 6 сцен) → schema/schema-validation → изолированный worker/planner за флагом → fault injection/compatibility и SHA equivalence → нагрузочные сравнения p50/p95/CPU/RAM/cost → independent security/perf review → staging rollback. Смена pointer возможна только после каскада P03/P08/P05 gates.

### Requirement M47 — Побайтово воспроизводимая инструментальная цепочка

- **Тип:** Системная; **оценки Q/E/F/C/S/L:** 9/9/8/8/10/10; **зависимости:** P02,P03,P08,P13; **статус:** PROPOSED.
- **Проблема / ценность:** Два одинаковых сценария дают разный результат после обновления Chromium, шрифтов, ffmpeg или окружения.
- **Инженерная реализация:** Версионировать OCI image digest, Chromium/FFmpeg build, набор font SHA, color profiles, OS libraries, JavaScript renderer commit и seed. Чётко разделить deterministic graph equivalence и byte-identical container output при меняющихся metadata.
- **Контракт, ресурсные ограничения, безопасность:** BuildAttestation_v1: source tree SHA, image digest, tool versions, fonts/licenses, input asset hashes, build/test job URL.
- **DoD + нагрузочные тесты:** Запустить одинаковый проект дважды в pinned Docker: graph, все PNG/PCM и normalized visual frame hash равны; причины MP4 byte difference документируются отдельно.
- **Негативные сценарии и операционный риск:** Аудио/видео контейнер может содержать timestamps и codec nondeterminism; не называть raw MP4 SHA стабильным без канонизации.
- **Итерации:** baseline (реальные 6 сцен) → schema/schema-validation → изолированный worker/planner за флагом → fault injection/compatibility и SHA equivalence → нагрузочные сравнения p50/p95/CPU/RAM/cost → independent security/perf review → staging rollback. Смена pointer возможна только после каскада P03/P08/P05 gates.

### Requirement M48 — Слияние параллельных редакторских намерений без потери данных

- **Тип:** Системная; **оценки Q/E/F/C/S/L:** 9/10/7/7/10/10; **зависимости:** P06,P08,P10,P24; **статус:** PROPOSED.
- **Проблема / ценность:** Два агента или редактора правят разные дорожки одного проекта; примитивный CAS отвергает всё или молча затирает исправления.
- **Инженерная реализация:** Изменения хранить семантическими операций с touched_set и base_revision. Если диапазоны/объекты не пересекаются — безопасный rebase, иначе явный human conflict resolution, трёхсторонний diff и журнал причин.
- **Контракт, ресурсные ограничения, безопасность:** EditOp_v1: actor, idempotency key, node_id, base graph SHA, before/after PTS, ownership/fence and conflict set.
- **DoD + нагрузочные тесты:** Два worker одновременно меняют разные клипы — оба изменения видны, конфликт на одном титре остаётся unresolved, 100% операций обратимы; external data not overwritten.
- **Негативные сценарии и операционный риск:** CRDT здесь не решает причинные зависимости аудио и титров без solver; предпочесть transaction log с явными conflict semantics.
- **Итерации:** baseline (реальные 6 сцен) → schema/schema-validation → изолированный worker/planner за флагом → fault injection/compatibility и SHA equivalence → нагрузочные сравнения p50/p95/CPU/RAM/cost → independent security/perf review → staging rollback. Смена pointer возможна только после каскада P03/P08/P05 gates.

### Requirement M49 — Умный smart-render без повторного кодирования неизменённых фрагментов

- **Тип:** Атомарная; **оценки Q/E/F/C/S/L:** 9/9/7/9/8/9; **зависимости:** P05,P08,P13; **статус:** PROPOSED.
- **Проблема / ценность:** Сборка всех кадров через re-encode тратит CPU и может снижать качество даже при trim нескольких секунд.
- **Инженерная реализация:** При совпадении codec/profile/SPS/PPS/pixel format/fps/timebase использовать stream-copy для безопасных GOP-aligned spans; вокруг не-GOP edit создавать малые re-encode windows и тестировать continuity sample точно.
- **Контракт, ресурсные ограничения, безопасность:** SmartRenderPlan_v1: GOP metadata, copied/reencoded ranges, compatible codec fingerprints, fallback full encode, expected output PTS.
- **DoD + нагрузочные тесты:** Golden sequences с B-frames и AAC priming сохраняют точные PTS, no audio pop, контроль quality/size и decode errors; повреждённый join fallback full encode.
- **Негативные сценарии и операционный риск:** Сложная H.264 bitstream совместимость; запрещено притворяться что frame-accurate cut работает через `-c copy` в любом месте.
- **Итерации:** baseline (реальные 6 сцен) → schema/schema-validation → изолированный worker/planner за флагом → fault injection/compatibility и SHA equivalence → нагрузочные сравнения p50/p95/CPU/RAM/cost → independent security/perf review → staging rollback. Смена pointer возможна только после каскада P03/P08/P05 gates.

### Requirement M50 — Журнал задач с восстановлением, отменой и транзакционным release

- **Тип:** Системная; **оценки Q/E/F/C/S/L:** 10/10/9/9/10/10; **зависимости:** P02,P05,P08,P13; **статус:** PROPOSED.
- **Проблема / ценность:** Краш при сохранении/мультиплексировании или повторный запуск агента оставляет полузаписанный MP4 либо два выпуска одновременно.
- **Инженерная реализация:** Делать resumable state machine с durable journal, temporary object, per-job lease heartbeat, idempotent finalization и checksum; старый approval/release pointer меняется только atomic CAS после QA и независимого решения.
- **Контракт, ресурсные ограничения, безопасность:** JobLedger_v1: source SHA, stage, actor, retries/lease, partial artifact TTL, tested digest, approval reference, rollback token.
- **DoD + нагрузочные тесты:** SIGKILL между mux и commit 100 раз оставляет прежний релиз доступным; повторный complete не создаёт второй side effect, чужой fencing token недействителен.
- **Негативные сценарии и операционный риск:** Надо учитывать существующий P02/P05 recovery и не переписывать работающее — фича закрывает только непроверенные отказы/мультиинстанс.
- **Итерации:** baseline (реальные 6 сцен) → schema/schema-validation → изолированный worker/planner за флагом → fault injection/compatibility и SHA equivalence → нагрузочные сравнения p50/p95/CPU/RAM/cost → independent security/perf review → staging rollback. Смена pointer возможна только после каскада P03/P08/P05 gates.

