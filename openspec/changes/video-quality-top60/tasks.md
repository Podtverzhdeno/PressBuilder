# SDD tasks — M01–M60, quality × throughput

> Создано 2026-11-02. **Все пункты TODO**: в данном PR не пишется продакшен-код функций, нет подтверждённых артефактов и нет human acceptance. Порядок ниже — строгий глобальный рейтинг; реальные агенты должны планировать работу в W0→W4 с учётом зависимостей и ресурса.

## Общий Definition of Done

Для каждой фичи C01–C08 реализовать последовательно, с исключениями только по рецензированной архитектурной зависимости. Пока C01–C08 не имеют реального evidence, релизный флаг оставлять OFF. Проверить не только локальные Node тесты, но и настоящие собственные/лицензированные MP4, реальную сборку Docker/Chromium/FFmpeg, негативные race и отдельный художественный A/B.

- Вход: immutable source SHA/rights + principal/role/project/scene scope + P06 fence + `expected_revision` + exact toolchain. Любой клиентский `verified:true` игнорируется.
- Выход: proposal или immutable version; доказательства: exact commit SHA, fixture SHA, output artifact SHA, CI run URL, exit code, p50/p95 & RAM/CPU, человеческое решение с идентификатором и датой.
- Отмена и ошибка не меняют P08 approved MP4 и P05 release pointer. Любые новые storage/index sidecars мигрируются отдельно и имеют rollback.
- Значение KPI из карточки — целевой критерий для эксперимента; невыполненный benchmark = REVIEW/REWORK, не PASS. Независимый reviewer не должен быть исполнителем того же изменения.

## Реестр задач по единому рейтингу

### M40 — Director briefs как исполняемые типизированные контракты (rank #1, 9.70/10, W0)

**Прогресс реализации (без закрытия чекпоинтов):** M40-R01 — source-pinned read-only server projection, REST/MCP with worker assignment scope, Studio, unit and live integration tests в PR #41. Flag OFF by default. Для полноценных C01–C08 нужны отдельное архитектурное/правовое ревью, signed scene updates с P06 lease, real six-scene brief→render E2E, измерения качества/скорости и canary. Не засчитывать обычный Docker render smoke как доказательство этого нового end-to-end.


**Тип:** Системная. **Зависимости:** P06, P10, P16, P23. **Базовая оценка усилий:** small, ~2–5 dev-days. **Спецификация:** [Контент и ассеты](./specs/content/spec.md).

**Почему:** Отдельные агенты получают длинный расплывчатый промпт, делают разные стили и повторяют чужую работу.

**Как:** Перевести задачу сцены в immutable typed brief: scene_id, goal, essential_claims, visual references, source hashes, style rules, permitted tools, timebox, acceptance tests, forbidden edits. Reviewer выдаёт новые ревизии спецификации, worker читает перед каждой попыткой.

**Предлагаемый контракт:** SceneBrief_v2: actor/lease, expected_revision, input rights, output asset manifest, evidence CI, checkpoints; P06 role separation obligatory.

**Главный сценарий приёмки:** Шесть независимых агентов на сгенерированных briefs не выходят из своих сцен, читают свежие ревизии, гарантируют отсутствие неподтверждённых статусов и CAS конфликтов.

**Отрицательные тесты и эксплуатационный риск:** Качество агента не гарантируется структурой задачи; нужна независимая проверка артефакта, а не только отчёт LLM.

- [ ] **M40-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M40-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M40-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M40-C04 — Negative regression & isolation.** Создать `tests/cloud-m40-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Качество агента не гарантируется структурой задачи; нужна независимая проверка артефакта, а не только отчёт LLM.
- [ ] **M40-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M40-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M40-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M40-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m40/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M50 — Журнал задач с восстановлением, отменой и транзакционным release (rank #2, 9.70/10, W0)

**Тип:** Системная. **Зависимости:** P02, P05, P08, P13. **Базовая оценка усилий:** small, ~2–5 dev-days. **Спецификация:** [Рендер и эксплуатация](./specs/pipeline/spec.md).

**Почему:** Краш при сохранении/мультиплексировании или повторный запуск агента оставляет полузаписанный MP4 либо два выпуска одновременно.

**Как:** Делать resumable state machine с durable journal, temporary object, per-job lease heartbeat, idempotent finalization и checksum; старый approval/release pointer меняется только atomic CAS после QA и независимого решения.

**Предлагаемый контракт:** JobLedger_v1: source SHA, stage, actor, retries/lease, partial artifact TTL, tested digest, approval reference, rollback token.

**Главный сценарий приёмки:** SIGKILL между mux и commit 100 раз оставляет прежний релиз доступным; повторный complete не создаёт второй side effect, чужой fencing token недействителен.

**Отрицательные тесты и эксплуатационный риск:** Надо учитывать существующий P02/P05 recovery и не переписывать работающее — фича закрывает только непроверенные отказы/мультиинстанс.

- [ ] **M50-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M50-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M50-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M50-C04 — Negative regression & isolation.** Создать `tests/cloud-m50-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Надо учитывать существующий P02/P05 recovery и не переписывать работающее — фича закрывает только непроверенные отказы/мультиинстанс.
- [ ] **M50-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M50-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M50-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M50-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m50/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M51 — Единый QC-кокпит с покадровыми исправлениями (rank #3, 9.70/10, W1)

**Тип:** Системная. **Зависимости:** P03, P07, P11, P23. **Базовая оценка усилий:** small, ~2–5 dev-days. **Спецификация:** [QC и доступность](./specs/quality/spec.md).

**Почему:** Видео проверяют в разных местах: чёрный кадр, текст, звук и монтажный стык не сводятся к конкретной точке исправления.

**Как:** Создать timecoded QC event map поверх master MP4: technical issue, severity, evidence frame/sound SHA, suggested owner scene, source version and regression links. Timeline кликом открывает точный кадр и предыдущую версия A/B.

**Предлагаемый контракт:** QcEvent_v1: media artifact_sha, stream PTS, issue code, detector version, repro instruction, reviewed_by, disposition, suppression reason.

**Главный сценарий приёмки:** В одной шестисценной сборке 20 умышленно внесённых ошибок попадают в корректные PTS/scene; скрытые вручную false positives не всплывают после rollback без нового source SHA.

**Отрицательные тесты и эксплуатационный риск:** Не превращать множество эвристик в единый художественный score; технический FAIL и субъективное REVIEW хранятся раздельно.

- [ ] **M51-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M51-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M51-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M51-C04 — Negative regression & isolation.** Создать `tests/cloud-m51-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Не превращать множество эвристик в единый художественный score; технический FAIL и субъективное REVIEW хранятся раздельно.
- [ ] **M51-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M51-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M51-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M51-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m51/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M58 — SLO качества + производительности на одном релизном шлюзе (rank #4, 9.70/10, W0)

**Тип:** Системная. **Зависимости:** P02, P03, P05, P13, P23. **Базовая оценка усилий:** small, ~2–5 dev-days. **Спецификация:** [QC и доступность](./specs/quality/spec.md).

**Почему:** В проекте отдельно зелёные CI тесты, но никто не видит общую цену, скорость, качество и устойчивость выпуска.

**Как:** ReleaseGate собирает technical QA, media SHA/license proofs, successful worker logs, A/V sync, font and flash checks, p95 render time, cost and independent reviewer. Любая обязательная категория UNVERIFIED → нельзя повышать флаг до production.

**Предлагаемый контракт:** ReleaseEvidence_v1: exact commit/image, source/license proofs, test exit/status, performance envelope, mandatory gates, signoff actor.

**Главный сценарий приёмки:** Fault injection: прошедший тест с пропущенным реальным media E2E не считается accepted; ухудшение p95/RAM сверх согласованного бюджета останавливает canary; rollback восстанавливает прежний SHA.

**Отрицательные тесты и эксплуатационный риск:** SLO пороги сначала baseline-derived; нельзя называть гипотетический p95 гарантией, пока нет живых наблюдений.

- [ ] **M58-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M58-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M58-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M58-C04 — Negative regression & isolation.** Создать `tests/cloud-m58-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: SLO пороги сначала baseline-derived; нельзя называть гипотетический p95 гарантией, пока нет живых наблюдений.
- [ ] **M58-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M58-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M58-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M58-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m58/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M26 — Типографический QA с кириллицей и fallback-шрифтами (rank #5, 9.65/10, W1)

**Тип:** Атомарная. **Зависимости:** P03, P04, P20. **Базовая оценка усилий:** small, ~2–5 dev-days. **Спецификация:** [Визуал, цвет и анимация](./specs/visual/spec.md).

**Почему:** Обрезанные русские слова, внезапная подмена гарнитуры или разный кернинг разрушают дорогую графику.

**Как:** Для каждого разрешённого font SHA и языка измерять shaped glyph cluster metrics, переносы, bbox, контраст и фрейм-позицию в Chromium. Шрифт не найден — явная ошибка или approved fallback с фиксацией новой метрики.

**Предлагаемый контракт:** TypographyProof_v1: font SHA/license, Unicode coverage, measured glyph boxes, safe rectangle, renderer hash, screenshot SHA.

**Главный сценарий приёмки:** 100 русско-английских длинных строк, дефисов и чисел должны отображаться без missing glyph, clipping и reflow drift на Docker/Chromium; шрифты в runtime pinned.

**Отрицательные тесты и эксплуатационный риск:** Не использовать OCR для доказательства художественного качества; шрифты требуют лицензии, нельзя неявно скачивать их в build.

- [ ] **M26-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M26-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M26-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M26-C04 — Negative regression & isolation.** Создать `tests/cloud-m26-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Не использовать OCR для доказательства художественного качества; шрифты требуют лицензии, нельзя неявно скачивать их в build.
- [ ] **M26-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M26-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M26-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M26-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m26/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M42 — Моментальный preview с proxy → master согласованностью (rank #6, 9.60/10, W1)

**Тип:** Системная. **Зависимости:** P02, P11, P12. **Базовая оценка усилий:** small, ~2–5 dev-days. **Спецификация:** [Рендер и эксплуатация](./specs/pipeline/spec.md).

**Почему:** Полный 1080p H.264 render слишком медленный для принятия композиционных решений на каждом клике.

**Как:** Два render-профиля из одного typed scene graph: fast proxy (resolution/fps/bitrate ограничены, sampling по назначению) и master 1080p. Interactive preview рендерит соседний shot range/кадры с низкой задержкой, затем по запросу master.

**Предлагаемый контракт:** PreviewManifest_v1: source graph SHA, proxy settings, color transform, frame/time mapping, warning on non-equivalence.

**Главный сценарий приёмки:** На заранее зафиксированных шести сценах проверить p50/p95 preview latency и пик RAM против baseline, proxy и master имеют одинаковые cue boundaries; финальная приёмка всегда по master.

**Отрицательные тесты и эксплуатационный риск:** Proxy может скрывать рендер-артефакты; нельзя переносить его QA verdict на master, отключить дорогие фильтры лишь с явным предупреждением.

- [ ] **M42-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M42-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M42-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M42-C04 — Negative regression & isolation.** Создать `tests/cloud-m42-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Proxy может скрывать рендер-артефакты; нельзя переносить его QA verdict на master, отключить дорогие фильтры лишь с явным предупреждением.
- [ ] **M42-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M42-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M42-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M42-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m42/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M41 — Инкрементальный рендер через контент-адресный DAG (rank #7, 9.50/10, W2)

**Тип:** Системная. **Зависимости:** P02, P05, P08, P13. **Базовая оценка усилий:** medium, ~1–2 dev-weeks. **Спецификация:** [Рендер и эксплуатация](./specs/pipeline/spec.md).

**Почему:** Переписанная одна реплика вызывает повторную сборку всех сцен и лишние минуты Chromium/FFmpeg.

**Как:** Каждый immutable узел render DAG хэширует source asset, timing, renderer/fonts, filters, mode и требуемые outputs. Изменение одного cue инвалидирует только зависимые keyframe/frame-span nodes; unchanged scene MP4 переиспользуются после integrity check.

**Предлагаемый контракт:** RenderDAG_v1: node type, source/output SHA, dependent IDs, toolchain digest, feature flags, invalidation reasons, no stale shared cache.

**Главный сценарий приёмки:** На 6 сценах изменение одного cue вызывает 0 новых рендеров остальных пяти, cold/warm benchmark показывает выигрыш времени и ресурсов; повреждённый cache не считается hit.

**Отрицательные тесты и эксплуатационный риск:** Сложность invalidation и гонки в shared FS; SHA должен включать даже скрытые шрифты и музыки, otherwise silent stale artifact.

- [ ] **M41-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M41-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M41-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M41-C04 — Negative regression & isolation.** Создать `tests/cloud-m41-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Сложность invalidation и гонки в shared FS; SHA должен включать даже скрытые шрифты и музыки, otherwise silent stale artifact.
- [ ] **M41-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M41-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M41-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M41-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m41/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M13 — Финальное микширование с EBU-профилями и автодакингом (rank #8, 9.45/10, W1)

**Тип:** Системная. **Зависимости:** P09, P19, P23. **Базовая оценка усилий:** small, ~2–5 dev-days. **Спецификация:** [Речь и звук](./specs/audio/spec.md).

**Почему:** Непостоянная громкость речи/музыки и перегрузка master делают ролик непрофессиональным на телефоне и в наушниках.

**Как:** Вести раздельные voice/music/sfx stems; от VAD строить bounded sidechain ducking с attack/release и защищёнными паузами. Выполнить двухпроходное loudnorm и true-peak limiter с explicit preset (broadcast, web, custom), без одного «магического» LUFS для всех платформ.

**Предлагаемый контракт:** MixPlan_v1: approved PCM SHA каждого стема, gain automation, per-role target, output channel layout, measured I/LRA/TP, exact FFmpeg settings.

**Главный сценарий приёмки:** На 12 сценариях перехода голос/музыка voice не теряется, master достигает выбранного preset в ±0.5 LU как проектная цель; пик не выше указанного ceiling; независимое прослушивание A/B обязательно.

**Отрицательные тесты и эксплуатационный риск:** Два прохода затратны; -23 LUFS относится к EBU R128 broadcast, а online preset задаётся отдельно, не выдавать платформенный target за универсальный.

- [ ] **M13-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M13-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M13-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M13-C04 — Negative regression & isolation.** Создать `tests/cloud-m13-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Два прохода затратны; -23 LUFS относится к EBU R128 broadcast, а online preset задаётся отдельно, не выдавать платформенный target за универсальный.
- [ ] **M13-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M13-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M13-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M13-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m13/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M32 — Контент-адресный реестр медиа, прав и происхождения (rank #9, 9.45/10, W0)

**Прогресс (чекпоинты остаются [ ]):** M32-R01 — API/аудит и CAS-каталог P08-approved MP4 с повторной SHA-проверкой, отдельной директорской аттестацией и REVOKE. Ограничен только proposal-only; нет лицензированных загрузок, независимого legal/signoff, реального six-scene B-roll-to-render E2E, canary, perf/ROI. Код и тесты: docs/M32_MEDIA_CATALOG.md, PR #42.


**Тип:** Системная. **Зависимости:** P01, P08, P22, P24. **Базовая оценка усилий:** small, ~2–5 dev-days. **Спецификация:** [Контент и ассеты](./specs/content/spec.md).

**Почему:** Быстрая сборка из чужих картинок и SFX несёт риски авторских прав, устаревших лицензий и случайной замены файла.

**Как:** Каждый импорт превращать в immutable MediaAsset (SHA-256 bytes, owner, grant scope, attribution, license, expiry, codec, duration, color-space, signed approval). Контент хранить без доверия к filename/URL; policy engine запрещает несоответствующее использование.

**Предлагаемый контракт:** AssetRegistry_v1: content_hash, consent/license proof, provenance chain, project scope, expiry, technical scan, immutable audit record.

**Главный сценарий приёмки:** 100 разных imports и 10 конфликтующих файлов: два одинаковых SHA дедуплицируются, чужой/истёкший asset не доходит до рендера; выпуск требует полную цепочку прав.

**Отрицательные тесты и эксплуатационный риск:** Лицензии нельзя оценивать только по строке SPDX; нужен утверждённый legal policy, удаление/отзыв rights приводит к fail closed.

- [ ] **M32-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M32-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M32-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M32-C04 — Negative regression & isolation.** Создать `tests/cloud-m32-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Лицензии нельзя оценивать только по строке SPDX; нужен утверждённый legal policy, удаление/отзыв rights приводит к fail closed.
- [ ] **M32-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M32-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M32-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M32-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m32/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M54 — Детектор фоточувствительных вспышек и безопасный motion-mode (rank #10, 9.45/10, W1)

**Тип:** Системная. **Зависимости:** P18, P20, P23. **Базовая оценка усилий:** small, ~2–5 dev-days. **Спецификация:** [QC и доступность](./specs/quality/spec.md).

**Почему:** Быстрый монтаж, белые вспышки и насыщенный красный могут создавать риск для людей с фоточувствительностью.

**Как:** Декодировать master и считать rapid luminance/red opposing transitions по WCAG 2.2 SC 2.3.1; анализировать sliding 1 second, площадь вспышек, worst-case full-screen; при опасности blocking finding и safe motion fallback с ручным подтверждением.

**Предлагаемый контракт:** FlashRisk_v1: exact frame/PTS windows, measurement color space, red-flash estimate, area threshold, reviewer override policy, output SHA.

**Главный сценарий приёмки:** Тесты 2, 3, 4 flashes/second, мелкий яркий объект, fullscreen red flashes, GIF/loop boundary и SDR/HDR; опасные тестовые ролики не отдаются на просмотр людям без предупреждения.

**Отрицательные тесты и эксплуатационный риск:** Порог «3 в секунду» не единственное условие WCAG; учитывать яркость, площадь и red threshold, а false negative недопустим.

- [ ] **M54-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M54-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M54-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M54-C04 — Negative regression & isolation.** Создать `tests/cloud-m54-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Порог «3 в секунду» не единственное условие WCAG; учитывать яркость, площадь и red threshold, а false negative недопустим.
- [ ] **M54-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M54-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M54-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M54-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m54/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M05 — Транзакционный ripple edit и групповой undo (rank #11, 9.40/10, W1)

**Тип:** Атомарная. **Зависимости:** P06, P08, P24. **Базовая оценка усилий:** small, ~2–5 dev-days. **Спецификация:** [Режиссура и таймлайн](./specs/editorial/spec.md).

**Почему:** Сдвиг одного клипа вручную может увести озвучку, титры и эффекты, а несколько агентов способны перезаписать соседние дорожки.

**Как:** EditTransaction объединяет редактирование сегмента, связанных титров и звука; preflight рассчитывает все downstream смещения в кадрах и явные locked anchors. Atomic compare-and-swap + reversible journal commit/rollback. Проектные, дорожечные и сценные роли применяются до commit.

**Предлагаемый контракт:** POST edit/preview returns delta graph, affected_ids, conflict set; POST edit/commit requires actor, exact revision, lease, idempotency.

**Главный сценарий приёмки:** При инъекции ошибки в 1 из 7 затронутых объектов не меняется ничего; 50 циклов edit/undo дают SHA-равенство исходника; конкурентное редактирование выдаёт конфликт, не last-write-wins.

**Отрицательные тесты и эксплуатационный риск:** Сложное пересечение P06-scene leases; не пытаться атомарно перезаписывать обычный deck.json без миграции.

- [ ] **M05-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M05-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M05-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M05-C04 — Negative regression & isolation.** Создать `tests/cloud-m05-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Сложное пересечение P06-scene leases; не пытаться атомарно перезаписывать обычный deck.json без миграции.
- [ ] **M05-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M05-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M05-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M05-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m05/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M56 — Golden-frame и PCM регрессии без шумных diff (rank #12, 9.40/10, W1)

**Тип:** Системная. **Зависимости:** P03, P08, P11, P13. **Базовая оценка усилий:** small, ~2–5 dev-days. **Спецификация:** [QC и доступность](./specs/quality/spec.md).

**Почему:** После небольших исправлений неизвестно, не сломались ли соседние сцены и не изменился ли звук за пределами правки.

**Как:** Для каждого проверенного релиза сохранять golden frames at semantic/boundary PTS + isolated PCM windows; сравнивать pixel metrics с mask для легитимно динамических областей. Deterministic HTML A/B diff и invariant proofs по нетронутым кадрам.

**Предлагаемый контракт:** GoldenFixture_v1: exact source/build/font hashes, frame PTS, masks, expected SHA, tolerance per pixel region, baseline reason.

**Главный сценарий приёмки:** На PR с одним изменённым титром QC должен сигнализировать только соответствующий кадр, чистая пересборка даёт те же эталоны; не скрывать CPU/codec regressions.

**Отрицательные тесты и эксплуатационный риск:** Изменение шрифтов/рендерера обновляет golden только после независимого review; размытые tolerance masks могут скрывать дефекты.

- [ ] **M56-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M56-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M56-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M56-C04 — Negative regression & isolation.** Создать `tests/cloud-m56-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Изменение шрифтов/рендерера обновляет golden только после независимого review; размытые tolerance masks могут скрывать дефекты.
- [ ] **M56-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M56-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M56-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M56-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m56/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M11 — Достоверная покомпонентная синхронизация слов (rank #13, 9.30/10, W1)

**Тип:** Атомарная. **Зависимости:** P09, P15, P19. **Базовая оценка усилий:** medium, ~1–2 dev-weeks. **Спецификация:** [Речь и звук](./specs/audio/spec.md).

**Почему:** Ритм и титры нельзя выстраивать по approximate секундным cue — граница слова, вдох и согласные оказываются вне кадра.

**Как:** Собрать опциональный локальный ASR + VAD + forced-alignment, с сохранением user-approved текста как истины. Каждый word получает начало/конец PCM sample и уверенность; номера, аббревиатуры и кириллица требуют лексикон исключений. Редактор показывает нераспознанные фразы как REVIEW.

**Предлагаемый контракт:** WordMap v1: speech_sha, language, provider/model SHA, word text/source cue, sample_start/end, confidence_band, manual_override_revision; вся обработка приватная, no raw transcript logs.

**Главный сценарий приёмки:** 20 русско-английских речевых fixtures с ручной разметкой: медиана абсолютного отклонения границы слова ≤40 мс как целевой порог после калибровки; неизвестное слово никогда не получает фиктивный timestamp.

**Отрицательные тесты и эксплуатационный риск:** WhisperX/модели могут неточно выравнивать числа и перекрывающиеся голоса; GPU по желанию, fallback manual, модель/лицензию фиксировать.

- [ ] **M11-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M11-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M11-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M11-C04 — Negative regression & isolation.** Создать `tests/cloud-m11-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: WhisperX/модели могут неточно выравнивать числа и перекрывающиеся голоса; GPU по желанию, fallback manual, модель/лицензию фиксировать.
- [ ] **M11-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M11-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M11-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M11-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m11/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M52 — Мультиметр звука и разборчивости речи (rank #14, 9.30/10, W1)

**Тип:** Атомарная. **Зависимости:** P03, P19, P23. **Базовая оценка усилий:** small, ~2–5 dev-days. **Спецификация:** [QC и доступность](./specs/quality/spec.md).

**Почему:** Даже при нормальном среднем LUFS речь неразборчива из-за пиков, резонансов, фона и конкуренции с музыкой.

**Как:** Из PCM считать per-window speech/music RMS, noise floor, clipped samples, true peak, crest factor, sibilance proxy и spectral masking. UI связывает риски с sample PTS, а исправление выполняется отдельной mix transaction.

**Предлагаемый контракт:** AudioQc_v1: source and master hashes, measured metrics, windows, rule profile, thresholds and uncertainty.

**Главный сценарий приёмки:** В контрольных 15 noisy/clean stems находить клиппинг, неприемлемый пик и перекрытие голоса с музыкой; метрики повторяемы на 44.1/48 кГц; human intelligibility rating — отдельный показатель.

**Отрицательные тесты и эксплуатационный риск:** Оценка разборчивости speech без реального слушателя не гарантируется; не делать автоматический mastering по одному числу.

- [ ] **M52-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M52-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M52-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M52-C04 — Negative regression & isolation.** Создать `tests/cloud-m52-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Оценка разборчивости speech без реального слушателя не гарантируется; не делать автоматический mastering по одному числу.
- [ ] **M52-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M52-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M52-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M52-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m52/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M01 — Единый рациональный монтажный граф (rank #15, 9.20/10, W0)

**Тип:** Системная. **Зависимости:** P05, P08, P09, P17, P24. **Базовая оценка усилий:** large, ~2–4 dev-weeks. **Спецификация:** [Режиссура и таймлайн](./specs/editorial/spec.md).

**Почему:** Клипы, звук, титры и переходы сегодня рискуют считать длительности разными часами; отсюда рассинхрон, дрейф и недетерминированный повторный рендер.

**Как:** Ввести typed EditGraph v1: проект, треки, клипы, trims, transition handles, rational PTS и provenance SHA. Узлы имеют стабильные IDs; solver переводит P09 слова, P17 стыки и P18 ключи в один timebase. Хранить неизменяемые ревизии графа отдельно от deck.json; публикация только через P05.

**Предлагаемый контракт:** GET graph, POST proposal(expected_revision,source_fingerprints), diff; команды trim/split/move/crossfade типизированы, AST-валидация запрещает отрицательную длину и пустые source intervals.

**Главный сценарий приёмки:** Шесть сцен со смешанными 24 и 30000/1001 fps должны собираться без накопленного временного дрейфа; 1000 операций undo/redo восстанавливают побайтово идентичный граф; stale CAS и чужие сцены отклоняются.

**Отрицательные тесты и эксплуатационный риск:** Миграция старой структуры, сохранение кросс-кадровых аудиосэмплов, тесты на переполнение BigInt и сохранение принятого P08/P05.

- [ ] **M01-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M01-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M01-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M01-C04 — Negative regression & isolation.** Создать `tests/cloud-m01-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Миграция старой структуры, сохранение кросс-кадровых аудиосэмплов, тесты на переполнение BigInt и сохранение принятого P08/P05.
- [ ] **M01-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M01-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M01-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M01-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m01/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M17 — Умная работа с паузами и вдохами (rank #16, 9.20/10, W1)

**Тип:** Атомарная. **Зависимости:** P09, P15, P19. **Базовая оценка усилий:** small, ~2–5 dev-days. **Спецификация:** [Речь и звук](./specs/audio/spec.md).

**Почему:** Механическое вырезание тишины превращает речь в нервную скороговорку и удаляет выразительные вдохи.

**Как:** На VAD + energy envelope различать длинную пустую тишину, дыхание, речевой зазор и музыкальную паузу. Предлагать trim с min/max breath preservation и оригинальным PCM provenance; интерактивно слушать три варианта.

**Предлагаемый контракт:** SilenceEdit_v1: segments, category, confidence, protected_spans, offsets, per-speaker policy и reason.

**Главный сценарий приёмки:** На размеченных 30 паузах 0 защитных вдохов/смысловых пауз удалены в automatic-safe профиле; обратимый edit не трогает произношение и исходную версию.

**Отрицательные тесты и эксплуатационный риск:** VAD не понимает драматургию сам; classifier результат REVIEW, не уничтожает дыхание ради субъективного темпа.

- [ ] **M17-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M17-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M17-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M17-C04 — Negative regression & isolation.** Создать `tests/cloud-m17-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: VAD не понимает драматургию сам; classifier результат REVIEW, не уничтожает дыхание ради субъективного темпа.
- [ ] **M17-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M17-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M17-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M17-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m17/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M24 — Интеллектуальный мультиформатный reframe (rank #17, 9.15/10, W2)

**Тип:** Системная. **Зависимости:** P03, P20, P22, P24. **Базовая оценка усилий:** medium, ~1–2 dev-weeks. **Спецификация:** [Визуал, цвет и анимация](./specs/visual/spec.md).

**Почему:** Горизонтальный ролик теряет героя, титры и CTA после простого central crop для Shorts/Reels.

**Как:** Создать saliency + face-free object track и stable focus anchor; сформировать отдельно versioned crop tracks для 16:9, 9:16 и 1:1. При конфликте в вертикали титры переносятся, а значимые объекты получают reveal/split-screen.

**Предлагаемый контракт:** ReframePlan_v1: target aspect, per-shot salient_bbox, crop bezier, safe_rect, content SHA, manual lock.

**Главный сценарий приёмки:** На 30 размеченных кадрах ключевой объект и текст полностью в safe zone для всех трёх выходов; нет frame-to-frame crop jitter и искажения aspect ratio.

**Отрицательные тесты и эксплуатационный риск:** Object detection дорог и может промахнуться; ручной anchor обязателен, платформенные UI-safe zones версионируются.

- [ ] **M24-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M24-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M24-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M24-C04 — Negative regression & isolation.** Создать `tests/cloud-m24-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Object detection дорог и может промахнуться; ручной anchor обязателен, платформенные UI-safe zones версионируются.
- [ ] **M24-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M24-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M24-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M24-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m24/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M18 — Контроль дрейфа аудио/видео вплоть до sample (rank #18, 9.15/10, W1)

**Тип:** Системная. **Зависимости:** P05, P09, P17, P19. **Базовая оценка усилий:** medium, ~1–2 dev-weeks. **Спецификация:** [Речь и звук](./specs/audio/spec.md).

**Почему:** В длинных сборках float FPS и resampling дают накопленный lip-sync и титровый drift.

**Как:** Ввести rational mapping PTS_video↔PTS_audio; resample только по необходимому timestamp и журналировать измеренные sample drops/dupes. Проверять asset/container timebase ffprobe до замены версии; тестировать mixed 44.1k/48k и 30000/1001.

**Предлагаемый контракт:** SyncReport_v1: source/audio stream timebase, frame-to-sample mapping, phase, measured max_absolute_drift, violation_ranges, hash.

**Главный сценарий приёмки:** После последовательной сборки 10 клипов длительностью 5 минут на тестовом наборе max sync drift ≤1 output frame, отсутствие внезапных недокументированных сдвигов и выпадений речи.

**Отрицательные тесты и эксплуатационный риск:** Ограничения исходного VFR и произвольного time stretch; политика отказа/нормализации зафиксирована и проверяется отдельно.

- [ ] **M18-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M18-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M18-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M18-C04 — Negative regression & isolation.** Создать `tests/cloud-m18-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Ограничения исходного VFR и произвольного time stretch; политика отказа/нормализации зафиксирована и проверяется отдельно.
- [ ] **M18-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M18-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M18-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M18-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m18/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M44 — Настоящая параллельная шести-сценная оркестрация (rank #19, 9.10/10, W2)

**Тип:** Системная. **Зависимости:** P02, P06, P08, P10. **Базовая оценка усилий:** large, ~2–4 dev-weeks. **Спецификация:** [Рендер и эксплуатация](./specs/pipeline/spec.md).

**Почему:** Шесть агентов работают отдельно, но один глобальный рендер-очередной слот сводит ускорение к минимуму.

**Как:** Декомпозировать render jobs по проектам/сценам/сегментам с owner lease, idempotency, worker capabilities и resource-aware scheduler. Оптимизировать max concurrency по фактическому RAM/CPU, fallback single writer на общем FS.

**Предлагаемый контракт:** RenderJob_v2: project/scene source SHAs, lease token, job budget, queue state, heartbeat, artifact manifest, complete CAS.

**Главный сценарий приёмки:** Шесть независимых сцен проходят без чужих edits; при падении одного worker повторяется только его сегмент, output SHA проверен, approved versions не перезаписываются.

**Отрицательные тесты и эксплуатационный риск:** На существующем Railway volume single-writer lock; многорепличность допускается только после перехода на транзакционный store и независимую object storage.

- [ ] **M44-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M44-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M44-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M44-C04 — Negative regression & isolation.** Создать `tests/cloud-m44-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: На существующем Railway volume single-writer lock; многорепличность допускается только после перехода на транзакционный store и независимую object storage.
- [ ] **M44-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M44-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M44-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M44-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m44/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M59 — Доступные субтитры и проверка точности смысла (rank #20, 9.10/10, W1)

**Тип:** Системная. **Зависимости:** P09, P20, P23, P24. **Базовая оценка усилий:** small, ~2–5 dev-days. **Спецификация:** [QC и доступность](./specs/quality/spec.md).

**Почему:** Профессиональный ролик без корректных субтитров, speaker labels и безопасного контраста недоступен многим зрителям.

**Как:** Для approved transcript строить timed subtitles/closed captions с сегментацией фраз, human review wording, языковыми пакетами RU/EN, contrast and dwell constraints; альтернативные SRT/VTT отдаются как отдельные версии.

**Предлагаемый контракт:** CaptionAccessibility_v1: word SHA, cues, language, optional speaker ID only as supplied/consented, line breaks, safe bounds, verified export checksum.

**Главный сценарий приёмки:** 100 строк mixed RU/EN, числа и переносы без выхода за границы; SRT/VTT roundtrip сохраняет смысл, начало/конец и не изобретает новые speaker names.

**Отрицательные тесты и эксплуатационный риск:** Diarization несовершенен, sensitive speech требует согласия; speaker labels не извлекаются как реальные личности из голоса.

- [ ] **M59-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M59-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M59-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M59-C04 — Negative regression & isolation.** Создать `tests/cloud-m59-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Diarization несовершенен, sensitive speech требует согласия; speaker labels не извлекаются как реальные личности из голоса.
- [ ] **M59-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M59-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M59-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M59-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m59/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M39 — Изготовление коротких версий без искажения смысла (rank #21, 9.05/10, W2)

**Тип:** Системная. **Зависимости:** P15, P16, P24. **Базовая оценка усилий:** medium, ~1–2 dev-weeks. **Спецификация:** [Контент и ассеты](./specs/content/spec.md).

**Почему:** Публикация 15/30/60 сек требует трёх ручных сборок и рискованного удаления важных оговорок.

**Как:** Из main EditGraph + approved claim ledger строить derivative timelines с приоритетами must_keep/nice_to_have и длительностью; оптимизатор ищет минимальное разрушение смысловых связок, а не просто ускоряет все клипы.

**Предлагаемый контракт:** ShortFormVariant_v1: target duration/fps, mandatory claims, edit operations, source SHA, omissions report и human decision.

**Главный сценарий приёмки:** Создать 15/30/60 сек версии 6-сценного ролика без missing mandatory fact, без обрезанных слов и без неразрешённого speed-up; в невозможном случае — честный UNSAT.

**Отрицательные тесты и эксплуатационный риск:** Некоторые сценарии несжимаемы; алгоритм должен уметь сказать «невозможно», а не выкидывать disclaimers.

- [ ] **M39-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M39-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M39-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M39-C04 — Negative regression & isolation.** Создать `tests/cloud-m39-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Некоторые сценарии несжимаемы; алгоритм должен уметь сказать «невозможно», а не выкидывать disclaimers.
- [ ] **M39-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M39-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M39-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M39-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m39/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M03 — Монтаж по утверждённым фразам (rank #22, 9.00/10, W2)

**Тип:** Системная. **Зависимости:** P09, P10, P15, P16, P24. **Базовая оценка усилий:** medium, ~1–2 dev-weeks. **Спецификация:** [Режиссура и таймлайн](./specs/editorial/spec.md).

**Почему:** Подрезка вручную по смыслу медленна, а произвольный LLM-рефакторинг может поменять факты и смысл речи.

**Как:** Создать paper edit: каждое утверждение сценария связывается с word alignment, cue_id, source_mp4 интервалом и лицензией. Редактор выделяет точные фразы; solver собирает кандидатную историю с hard constraints на смысл, паузы и обязательные факты. Отсутствующие слова не сочиняет.

**Предлагаемый контракт:** SelectedSpans_v1 содержит word IDs, rational PTS, claim_id, source SHA, mandatory_keep и rejected_reason; output graph не меняет первоначальный исходник.

**Главный сценарий приёмки:** Три версии 30/45/60 секунд сохраняют 100% mandatory claims, 0 склеек посреди защищённого слова; revert возвращает исходный script/MP4.

**Отрицательные тесты и эксплуатационный риск:** ASR может ошибаться; выделения непроверенных слов блокируют публикацию; человеческое утверждение смысла обязательно.

- [ ] **M03-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M03-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M03-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M03-C04 — Negative regression & isolation.** Создать `tests/cloud-m03-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: ASR может ошибаться; выделения непроверенных слов блокируют публикацию; человеческое утверждение смысла обязательно.
- [ ] **M03-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M03-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M03-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M03-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m03/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M21 — Субтитры с динамической безопасной раскладкой (rank #23, 9.00/10, W2)

**Тип:** Атомарная. **Зависимости:** P09, P20, P23. **Базовая оценка усилий:** medium, ~1–2 dev-weeks. **Спецификация:** [Визуал, цвет и анимация](./specs/visual/spec.md).

**Почему:** Автоматические титры перекрывают смысловой объект, попадают под кнопки приложения и визуально дрожат на движущемся фоне.

**Как:** Из word-map формировать captions units, для каждого кадра измерять text bbox, object masks и platform-safe area. Размещать в одной из нескольких стабильных зон со штрафом за перескоки; реагировать на смену сцены, а не на каждый пиксель движения.

**Предлагаемый контракт:** CaptionLayout_v1: cue IDs, font/license, glyph metrics, safe_rect, occlusion evidence, area penalties, pinned rasterizer version.

**Главный сценарий приёмки:** В 16:9/9:16/1:1 для 6 сцен 0 закрытых лиц/CTA по эталонной разметке, недопустимых обрезок и jitter > согласованного порога; OCR/снимок mobile обязателен.

**Отрицательные тесты и эксплуатационный риск:** Полностью автоматическое определение смысловых объектов ненадёжно; разрешённый ручной pin сильнее автолэйаута.

- [ ] **M21-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M21-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M21-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M21-C04 — Negative regression & isolation.** Создать `tests/cloud-m21-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Полностью автоматическое определение смысловых объектов ненадёжно; разрешённый ручной pin сильнее автолэйаута.
- [ ] **M21-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M21-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M21-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M21-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m21/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M55 — Мобильный тест читабельности и безопасных зон (rank #24, 9.00/10, W2)

**Тип:** Атомарная. **Зависимости:** P03, P20, P21, P23. **Базовая оценка усилий:** medium, ~1–2 dev-weeks. **Спецификация:** [QC и доступность](./specs/quality/spec.md).

**Почему:** Текст, который отлично смотрится на 27-дюймовом мониторе, не читается в вертикальном коротком ролике.

**Как:** Для 360px mobile preview измерять размер glyph bbox в физических пикселях, contrast, dwell time, occlusion и simulated app chrome safe areas. Сгенерировать сравнение 16:9/9:16/1:1 и стоп-кадры проблемных слов.

**Предлагаемый контракт:** ReadabilityQc_v1: output preset, font/license hash, measured px heights, bbox, exact decoded frame time, reviewer comments.

**Главный сценарий приёмки:** Для 100 строк включая русский и кириллицу 0 cropped glyph, min readable dwell profile соответствует выбранному требованию, перекрытие UI-safe regions блокирует выпуск.

**Отрицательные тесты и эксплуатационный риск:** Платформенные зоны UI меняются; профили должны иметь дату и источник, автоматический OCR не доказывает удобство чтения.

- [ ] **M55-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M55-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M55-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M55-C04 — Negative regression & isolation.** Создать `tests/cloud-m55-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Платформенные зоны UI меняются; профили должны иметь дату и источник, автоматический OCR не доказывает удобство чтения.
- [ ] **M55-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M55-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M55-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M55-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m55/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M15 — Непрерывный разговор через реальные аудиохэндлы J/L (rank #25, 8.95/10, W2)

**Тип:** Атомарная. **Зависимости:** P08, P17, P19. **Базовая оценка усилий:** medium, ~1–2 dev-weeks. **Спецификация:** [Речь и звук](./specs/audio/spec.md).

**Почему:** Даже визуально идеальный hard cut звучит рвано, если реплика начинается ровно на новом кадре.

**Как:** Сервер вычисляет фактические pre/post handle sample ranges из двух immutable P08 artifacts, затем строит отдельно video cut и audio in/out PTS. Визуальный A/B спектр, линейная или equal-power кросс-огибающая с заданными границами; никогда не дополнять недостающий handle тишиной.

**Предлагаемый контракт:** AudioBoundary_v1: left/right version SHA, stream timebase, decoded sample positions, crossfade curve, expected approval revision.

**Главный сценарий приёмки:** Аудио до/после стыка не теряет первых согласных, ни один sample не читается за исходным потоком; при invalid handle и stale revision fail closed, output approval остается прежним.

**Отрицательные тесты и эксплуатационный риск:** Для некоторых клипов хвосты не содержатся в P08 MP4; тогда требуется исходный PCM stem либо функция недоступна.

- [ ] **M15-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M15-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M15-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M15-C04 — Negative regression & isolation.** Создать `tests/cloud-m15-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Для некоторых клипов хвосты не содержатся в P08 MP4; тогда требуется исходный PCM stem либо функция недоступна.
- [ ] **M15-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M15-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M15-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M15-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m15/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M08 — Параллельные монтажные версии и A/B-матрица (rank #26, 8.90/10, W2)

**Тип:** Системная. **Зависимости:** P07, P08, P16, P23. **Базовая оценка усилий:** small, ~2–5 dev-days. **Спецификация:** [Режиссура и таймлайн](./specs/editorial/spec.md).

**Почему:** Последовательное редактирование замещает варианты, и невозможно показать проверенное улучшение относительно baseline.

**Как:** Хранить N=2..5 неизменяемых кандидатов на одном source manifest; строить таймкодный diff: удалённые/изменённые кадры, duration, звук, captions, codec. Blinded review и отдельный merge approved edits обратно в граф.

**Предлагаемый контракт:** Experiment_v1: arm, baseline/candidate hashes, edit_ops, evaluated_by, blinded_vote, metrics, rollback pointer.

**Главный сценарий приёмки:** Контрольный A/B должен показывать только реально изменённые сегменты; при конфликте версии ни одна не публикуется; reviewer может открыть оригинальные MP4.

**Отрицательные тесты и эксплуатационный риск:** Ценность субъективных оценок ограничена малой выборкой; нельзя оптимизировать по автоматическому score без человеческой проверки.

- [ ] **M08-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M08-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M08-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M08-C04 — Negative regression & isolation.** Создать `tests/cloud-m08-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Ценность субъективных оценок ограничена малой выборкой; нельзя оптимизировать по автоматическому score без человеческой проверки.
- [ ] **M08-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M08-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M08-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M08-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m08/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M45 — Компилятор безопасного графа FFmpeg-фильтров (rank #27, 8.90/10, W2)

**Тип:** Атомарная. **Зависимости:** P05, P19, P21. **Базовая оценка усилий:** medium, ~1–2 dev-weeks. **Спецификация:** [Рендер и эксплуатация](./specs/pipeline/spec.md).

**Почему:** Каждый эффект собирается ad hoc строкой ffmpeg; дублируется decode/encode, растёт вероятность path injection и дорогих фильтров.

**Как:** Описывать DSP/visual operators typed DAG с whitelist: crop, scale, overlay, concat, loudnorm, volume, afade, xfade. Компилятор сливает совместимые операции и не позволяет пользовательские shell/filter-expression fragments.

**Предлагаемый контракт:** FilterIR_v1: validated nodes/edges, codec constraints, explicit argv, estimated peak memory, max graph depth and size.

**Главный сценарий приёмки:** На 50 проверенных форматов output PTS/codec совпадает с baseline, inject-пейлоады отвергаются; CPU time compare against current command assembly.

**Отрицательные тесты и эксплуатационный риск:** Некоторые FFmpeg filters требуют сложных quoting; никогда не собирать argv из сырого текстового поля.

- [ ] **M45-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M45-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M45-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M45-C04 — Negative regression & isolation.** Создать `tests/cloud-m45-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Некоторые FFmpeg filters требуют сложных quoting; никогда не собирать argv из сырого текстового поля.
- [ ] **M45-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M45-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M45-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M45-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m45/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M47 — Побайтово воспроизводимая инструментальная цепочка (rank #28, 8.85/10, W0)

**Тип:** Системная. **Зависимости:** P02, P03, P08, P13. **Базовая оценка усилий:** medium, ~1–2 dev-weeks. **Спецификация:** [Рендер и эксплуатация](./specs/pipeline/spec.md).

**Почему:** Два одинаковых сценария дают разный результат после обновления Chromium, шрифтов, ffmpeg или окружения.

**Как:** Версионировать OCI image digest, Chromium/FFmpeg build, набор font SHA, color profiles, OS libraries, JavaScript renderer commit и seed. Чётко разделить deterministic graph equivalence и byte-identical container output при меняющихся metadata.

**Предлагаемый контракт:** BuildAttestation_v1: source tree SHA, image digest, tool versions, fonts/licenses, input asset hashes, build/test job URL.

**Главный сценарий приёмки:** Запустить одинаковый проект дважды в pinned Docker: graph, все PNG/PCM и normalized visual frame hash равны; причины MP4 byte difference документируются отдельно.

**Отрицательные тесты и эксплуатационный риск:** Аудио/видео контейнер может содержать timestamps и codec nondeterminism; не называть raw MP4 SHA стабильным без канонизации.

- [ ] **M47-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M47-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M47-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M47-C04 — Negative regression & isolation.** Создать `tests/cloud-m47-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Аудио/видео контейнер может содержать timestamps и codec nondeterminism; не называть raw MP4 SHA стабильным без канонизации.
- [ ] **M47-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M47-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M47-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M47-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m47/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M07 — Покадровый редактор стыков и J/L со слышимым предпросмотром (rank #29, 8.80/10, W3)

**Тип:** Атомарная. **Зависимости:** P08, P09, P17, P19. **Базовая оценка усилий:** large, ~2–4 dev-weeks. **Спецификация:** [Режиссура и таймлайн](./specs/editorial/spec.md).

**Почему:** Переход часто оценивают по двум JPEG, не слыша реального захода реплики и задержки звука.

**Как:** Воспроизводить ±2 сек вокруг стыка из approved P08 MP4; использовать не нарисованные, а подтверждённые PCM pre/post-handles. Перемещать видео и две независимые аудиограницы на rational grid с локальным спектрографическим preview.

**Предлагаемый контракт:** TransitionDraft_v2: left/right P08 hash, video_cut_pts, audio_in_pts, audio_out_pts, gain envelope, expected_revision, no_publish.

**Главный сценарий приёмки:** Измерить A/V drift ≤1 выходной видеокадр, не рвать согласные в 10 speech fixtures; при нехватке handles — отказ, не тишина, не подмена аудио.

**Отрицательные тесты и эксплуатационный риск:** Работа с аудио вне декодированного диапазона требует честного отказа и отдельного стема; доступ только owner-директор.

- [ ] **M07-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M07-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M07-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M07-C04 — Negative regression & isolation.** Создать `tests/cloud-m07-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Работа с аудио вне декодированного диапазона требует честного отказа и отдельного стема; доступ только owner-директор.
- [ ] **M07-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M07-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M07-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M07-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m07/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M48 — Слияние параллельных редакторских намерений без потери данных (rank #30, 8.80/10, W3)

**Тип:** Системная. **Зависимости:** P06, P08, P10, P24. **Базовая оценка усилий:** large, ~2–4 dev-weeks. **Спецификация:** [Рендер и эксплуатация](./specs/pipeline/spec.md).

**Почему:** Два агента или редактора правят разные дорожки одного проекта; примитивный CAS отвергает всё или молча затирает исправления.

**Как:** Изменения хранить семантическими операций с touched_set и base_revision. Если диапазоны/объекты не пересекаются — безопасный rebase, иначе явный human conflict resolution, трёхсторонний diff и журнал причин.

**Предлагаемый контракт:** EditOp_v1: actor, idempotency key, node_id, base graph SHA, before/after PTS, ownership/fence and conflict set.

**Главный сценарий приёмки:** Два worker одновременно меняют разные клипы — оба изменения видны, конфликт на одном титре остаётся unresolved, 100% операций обратимы; external data not overwritten.

**Отрицательные тесты и эксплуатационный риск:** CRDT здесь не решает причинные зависимости аудио и титров без solver; предпочесть transaction log с явными conflict semantics.

- [ ] **M48-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M48-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M48-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M48-C04 — Negative regression & isolation.** Создать `tests/cloud-m48-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: CRDT здесь не решает причинные зависимости аудио и титров без solver; предпочесть transaction log с явными conflict semantics.
- [ ] **M48-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M48-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M48-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M48-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m48/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M22 — Кривые движения с ограничением jerk (rank #31, 8.80/10, W3)

**Тип:** Атомарная. **Зависимости:** P18, P23. **Базовая оценка усилий:** medium, ~1–2 dev-weeks. **Спецификация:** [Визуал, цвет и анимация](./specs/visual/spec.md).

**Почему:** Линейная анимация и резкие переломы ускорения производят ощущение шаблона, даже когда keyframes технически корректны.

**Как:** Расширить P18 easing до cubic Bezier с валидатором монотонности и ограничениями третьей производной jerk, плавности квазинеподвижных фрагментов и скорости камеры на рациональной frame grid.

**Предлагаемый контракт:** MotionCurve_v2: normalized controls, keyframe PTS, velocity/accel/jerk caps, reduced_motion fallback, source scene revision.

**Главный сценарий приёмки:** На 0/25/50/75/100% и на каждом кадре тестировать непрерывность скорости/ускорения; 0 overshoot за spatial bounds; сцену можно пересчитать детерминированно.

**Отрицательные тесты и эксплуатационный риск:** Для динамичных экшен-сцен ограничения должны быть профилями, а не универсальным запретом резкой пластики.

- [ ] **M22-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M22-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M22-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M22-C04 — Negative regression & isolation.** Создать `tests/cloud-m22-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Для динамичных экшен-сцен ограничения должны быть профилями, а не универсальным запретом резкой пластики.
- [ ] **M22-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M22-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M22-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M22-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m22/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M27 — Адаптивная дизайн-система для титров и графики (rank #32, 8.80/10, W3)

**Тип:** Системная. **Зависимости:** P04, P20, P21. **Базовая оценка усилий:** medium, ~1–2 dev-weeks. **Спецификация:** [Визуал, цвет и анимация](./specs/visual/spec.md).

**Почему:** Ручная правка каждого кадра разных размеров дорогая; одни и те же отступы на мобильном экране работают плохо.

**Как:** Расширить style contract constraint layout: grid zones, typography scale, min contrast, whitespace, icon strokes, responsive breakpoints по аспектам. Минимизировать изменение визуальной идентичности между версиями.

**Предлагаемый контракт:** LayoutTokens_v1: color/font/spacing SHA, scale rules, scene overrides, responsive safe_rect, precedence and reasons.

**Главный сценарий приёмки:** Шесть сцен для 3 форматов используют те же бренд-токены, исключают 0 перекрытий по geometry checks и разные размеры шрифтов без осознанного override.

**Отрицательные тесты и эксплуатационный риск:** Сильные ограничения могут лишить режиссёра композиционной свободы; арт-директор допускает мотивированное исключение.

- [ ] **M27-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M27-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M27-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M27-C04 — Negative regression & isolation.** Создать `tests/cloud-m27-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Сильные ограничения могут лишить режиссёра композиционной свободы; арт-директор допускает мотивированное исключение.
- [ ] **M27-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M27-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M27-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M27-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m27/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M12 — Деликатная очистка голоса и двойной A/B-спектр (rank #33, 8.75/10, W3)

**Тип:** Атомарная. **Зависимости:** P09, P19, P23. **Базовая оценка усилий:** medium, ~1–2 dev-weeks. **Спецификация:** [Речь и звук](./specs/audio/spec.md).

**Почему:** Шипение, комнатный гул и резкие согласные отвлекают; агрессивный denoise превращает речь в роботизированную.

**Как:** Двухступенчатая обработка: детектор шумового профиля с sample-locked regions, затем configurable low/high-pass, de-esser, spectral gating без замещения фонем. Непереписываемый исходный голос, нормированный по loudness A/B после каждой операции.

**Предлагаемый контракт:** AudioRepair_v1: source PCM sha, window profile, denoise strength bound, applied filters enum, acoustic risk flags; рендер через whitelisted FFmpeg argv.

**Главный сценарий приёмки:** Сравнить 10 clean/noisy клипов до и после, снижения фонового шума добиться без увеличения частоты ошибок распознавания по human transcript; clipping 0, p95 задержки в пределах бюджета.

**Отрицательные тесты и эксплуатационный риск:** Переочистка уничтожает тембр, особенно мягкие звуки; при низком SNR нужен явный manual-only, не «улучшить любой ценой».

- [ ] **M12-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M12-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M12-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M12-C04 — Negative regression & isolation.** Создать `tests/cloud-m12-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Переочистка уничтожает тембр, особенно мягкие звуки; при низком SNR нужен явный manual-only, не «улучшить любой ценой».
- [ ] **M12-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M12-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M12-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M12-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m12/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M29 — Палитра переходов по форме и смысловому действию (rank #34, 8.75/10, W3)

**Тип:** Атомарная. **Зависимости:** P05, P17, P21. **Базовая оценка усилий:** medium, ~1–2 dev-weeks. **Спецификация:** [Визуал, цвет и анимация](./specs/visual/spec.md).

**Почему:** Случайные zoom/glitch переходы выглядят эффектно одиночно, но мешают истории и режут читабельность.

**Как:** Составить каталог 8 ограниченных transitions: hard cut, dissolve, match shape, light reveal, masked wipe и другие с формальными требованиями к контексту. Рекомендатель выбирает простейший подходящий, а не самый заметный.

**Предлагаемый контракт:** TransitionGrammar_v1: source boundary hashes, shot intent, duration frames, allowed class, accessibility limit, reviewer note.

**Главный сценарий приёмки:** На 25 стыках отсутствующие shape/lighting prerequisites запрещают match effect; ни один protected subtitle не перекрывается, нет опасных вспышек.

**Отрицательные тесты и эксплуатационный риск:** Не использовать «украшения ради украшений»: user override требует ручного A/B, базовый hard-cut всегда безопасный fallback.

- [ ] **M29-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M29-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M29-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M29-C04 — Negative regression & isolation.** Создать `tests/cloud-m29-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Не использовать «украшения ради украшений»: user override требует ручного A/B, базовый hard-cut всегда безопасный fallback.
- [ ] **M29-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M29-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M29-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M29-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m29/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M46 — Адаптивное качество рендера под ресурсный бюджет (rank #35, 8.75/10, W3)

**Тип:** Атомарная. **Зависимости:** P02, P12, P18. **Базовая оценка усилий:** medium, ~1–2 dev-weeks. **Спецификация:** [Рендер и эксплуатация](./specs/pipeline/spec.md).

**Почему:** Одна тяжёлая сцена может истощить RAM/CPU и заблокировать весь пайплайн.

**Как:** Scheduler выбирает тип задачи: quality tier, tile size, number of concurrent frames, proxy or master, oversample factor по measured resource profile. При low-memory fallback не ухудшает обязательные quality gates без явной смены конфигурации.

**Предлагаемый контракт:** ResourceBudget_v1: max_cpu_seconds, mem_bytes, wall_deadline, permitted knobs, active limit, on_failure policy.

**Главный сценарий приёмки:** На synthetic worst-case 3D fixture нет OOM и потерянного accepted MP4; сравнить peak RSS/render seconds при quality-preserving настройках, unbounded filter reject.

**Отрицательные тесты и эксплуатационный риск:** Адаптация не должна незаметно менять пиксели финального master: только заранее разрешённые эквивалентные настройки или новой версии.

- [ ] **M46-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M46-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M46-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M46-C04 — Negative regression & isolation.** Создать `tests/cloud-m46-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Адаптация не должна незаметно менять пиксели финального master: только заранее разрешённые эквивалентные настройки или новой версии.
- [ ] **M46-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M46-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M46-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M46-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m46/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M31 — Доказательные текстовые утверждения и fact overlays (rank #36, 8.70/10, W3)

**Тип:** Системная. **Зависимости:** P07, P10, P16, P22, P23. **Базовая оценка усилий:** large, ~2–4 dev-weeks. **Спецификация:** [Контент и ассеты](./specs/content/spec.md).

**Почему:** Научный/финансовый ролик может выглядеть безупречно, но показывать неподтверждённые цифры, вырванные цитаты и вымышленные подписи.

**Как:** Завести Claim Ledger: claim_id, текст, owner-approved evidence URI/документ, точный source span, редакторская версия, timecode в титре. Перед render требовать evidence для чисел и внешних фактов, а не слепое принятие LLM-придуманных ссылок.

**Предлагаемый контракт:** Claims_v1: immutable evidence SHA, excerpt range, license/privacy class, rendered overlay id, reviewer outcome; внешние URL не скачиваются по генеративной подсказке.

**Главный сценарий приёмки:** На 20 фактических карточках 100% numeric overlays имеют доказательство и исходный контекст; замена документа-инвалидация, тест без источника помечает BLOCKED, не создаёт факт.

**Отрицательные тесты и эксплуатационный риск:** Источник может устареть, не все кадры содержат проверяемые факты; нужна ручная юридическая/редакторская оценка, не автоматическая «истина».

- [ ] **M31-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M31-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M31-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M31-C04 — Negative regression & isolation.** Создать `tests/cloud-m31-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Источник может устареть, не все кадры содержат проверяемые факты; нужна ручная юридическая/редакторская оценка, не автоматическая «истина».
- [ ] **M31-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M31-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M31-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M31-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m31/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M04 — Карта внимания, ритма и смысловых кульминаций (rank #37, 8.70/10, W3)

**Тип:** Системная. **Зависимости:** P15, P16, P23. **Базовая оценка усилий:** medium, ~1–2 dev-weeks. **Спецификация:** [Режиссура и таймлайн](./specs/editorial/spec.md).

**Почему:** Ролик выглядит механической нарезкой с одинаковыми интервалами, хотя смысловая напряжённость меняется.

**Как:** Строить по временным фрагментам signal map: речь/паузы/акценты/длительность кадра/новизна сцены; по одобренной режиссёрской арке предлагать интервалы напряжения, ускорения и передышки. Optimizer ограничивает частоту склеек и ценность кадра, а не гонится за retention любой ценой.

**Предлагаемый контракт:** NarrativeEnergy_v1: approved_story_revision, 0..1 intensity, min/max shot frames, highlighted cue, proposal_only; без прямой записи timeline.

**Главный сценарий приёмки:** На 6-сценном ролике кандидат обязан содержать минимум одну мотивированную смену темпа, не обрезая речь; измерить субъективную слепую оценку и долю ручных исправлений.

**Отрицательные тесты и эксплуатационный риск:** Метрика удержания без реальных просмотров — гипотеза; не подменять художественное решение псевдонаучным score.

- [ ] **M04-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M04-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M04-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M04-C04 — Negative regression & isolation.** Создать `tests/cloud-m04-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Метрика удержания без реальных просмотров — гипотеза; не подменять художественное решение псевдонаучным score.
- [ ] **M04-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M04-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M04-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M04-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m04/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M09 — Типизированная библиотека режиссёрских паттернов (rank #38, 8.65/10, W3)

**Тип:** Атомарная. **Зависимости:** P04, P10, P16. **Базовая оценка усилий:** small, ~2–5 dev-days. **Спецификация:** [Режиссура и таймлайн](./specs/editorial/spec.md).

**Почему:** Каждый ролик создаётся с нуля: команды заново изобретают вступление, доказательство, развязку и цитатные вставки.

**Как:** Предложить 12–20 атомарных narrative templates (contrast, problem–solution, before–after, proof–payoff, countdown). Шаблон содержит cue slots, максимальную длительность, разрешённые shot types и стиль; генерация только если все обязательные утверждения подтверждены.

**Предлагаемый контракт:** NarrativePattern_v1: pattern_id, slot_bindings, approved_source_ids, timing_bounds, revision, preview_only.

**Главный сценарий приёмки:** На трёх разных исходных сценариях собрать три явно разные структуры без несуществующих утверждений; 0 slots остаются без source links, если вариант помечен READY.

**Отрицательные тесты и эксплуатационный риск:** Риск штампованных видео; шаблоны должны допускать отступления и выключаться в сложных авторских проектах.

- [ ] **M09-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M09-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M09-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M09-C04 — Negative regression & isolation.** Создать `tests/cloud-m09-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Риск штампованных видео; шаблоны должны допускать отступления и выключаться в сложных авторских проектах.
- [ ] **M09-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M09-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M09-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M09-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m09/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M43 — Предсказание цены и длительности до запуска рендера (rank #39, 8.65/10, W3)

**Тип:** Атомарная. **Зависимости:** P02, P12, P13. **Базовая оценка усилий:** small, ~2–5 dev-days. **Спецификация:** [Рендер и эксплуатация](./specs/pipeline/spec.md).

**Почему:** Планировщик не понимает, какая сцена перегрузит Railway, и допускает очереди с непредсказуемой стоимостью.

**Как:** Собирать verified metrics по CPU/peak RAM/scene elements/effects/frames; robust regression или quantile model прогнозирует p50/p95 wall time и money budget. Выдавать explainable risk band до enqueue, далее обучаться только по реальные запускам.

**Предлагаемый контракт:** RenderEstimate_v1: renderer version, source complexity digest, model version, p50/p95 and confidence, policy budget.

**Главный сценарий приёмки:** Backtest на временно отложенных задачах без leakage; empirical p95 coverage не ниже согласованного порога, estimator не изменяет приоритет по неопределённой метрике.

**Отрицательные тесты и эксплуатационный риск:** Данных по редким эффектам мало; честный fallback на pessimistic budget, нельзя обещать постоянную точность 90%.

- [ ] **M43-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M43-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M43-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M43-C04 — Negative regression & isolation.** Создать `tests/cloud-m43-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Данных по редким эффектам мало; честный fallback на pessimistic budget, нельзя обещать постоянную точность 90%.
- [ ] **M43-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M43-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M43-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M43-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m43/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M49 — Умный smart-render без повторного кодирования неизменённых фрагментов (rank #40, 8.50/10, W3)

**Тип:** Атомарная. **Зависимости:** P05, P08, P13. **Базовая оценка усилий:** large, ~2–4 dev-weeks. **Спецификация:** [Рендер и эксплуатация](./specs/pipeline/spec.md).

**Почему:** Сборка всех кадров через re-encode тратит CPU и может снижать качество даже при trim нескольких секунд.

**Как:** При совпадении codec/profile/SPS/PPS/pixel format/fps/timebase использовать stream-copy для безопасных GOP-aligned spans; вокруг не-GOP edit создавать малые re-encode windows и тестировать continuity sample точно.

**Предлагаемый контракт:** SmartRenderPlan_v1: GOP metadata, copied/reencoded ranges, compatible codec fingerprints, fallback full encode, expected output PTS.

**Главный сценарий приёмки:** Golden sequences с B-frames и AAC priming сохраняют точные PTS, no audio pop, контроль quality/size и decode errors; повреждённый join fallback full encode.

**Отрицательные тесты и эксплуатационный риск:** Сложная H.264 bitstream совместимость; запрещено притворяться что frame-accurate cut работает через `-c copy` в любом месте.

- [ ] **M49-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M49-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M49-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M49-C04 — Negative regression & isolation.** Создать `tests/cloud-m49-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Сложная H.264 bitstream совместимость; запрещено притворяться что frame-accurate cut работает через `-c copy` в любом месте.
- [ ] **M49-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M49-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M49-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M49-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m49/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M14 — Просодический ритм вместо резки по BPM (rank #41, 8.45/10, W3)

**Тип:** Атомарная. **Зависимости:** P09, P15. **Базовая оценка усилий:** large, ~2–4 dev-weeks. **Спецификация:** [Речь и звук](./specs/audio/spec.md).

**Почему:** Точная нарезка по музыкальному пульсу режет речь, драматические паузы и интонационные акценты.

**Как:** Из PCM получать фразы, локальные паузы, изменение интенсивности и pitch contours; менять веса cut candidates для повествования по ударению и смене мысли. Выводить три объяснимых альтернативы, не автоматический монтаж.

**Предлагаемый контракт:** ProsodyMarkers_v1: speaker-free feature frames, cue anchors, word mask, phrase stress, provenance and confidence; ни сырое аудио, ни inferred эмоции не отправлять в external service.

**Главный сценарий приёмки:** На наборе интонационных фраз ни один cut не пересекает protected words; экспертная оценка выбранного местоположения превосходит baseline BPM-cut на слепом тесте либо не выводится улучшение.

**Отрицательные тесты и эксплуатационный риск:** Нельзя утверждать распознавание эмоций или намерений; интонационные оценки чувствительны к голосу/языку.

- [ ] **M14-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M14-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M14-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M14-C04 — Negative regression & isolation.** Создать `tests/cloud-m14-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Нельзя утверждать распознавание эмоций или намерений; интонационные оценки чувствительны к голосу/языку.
- [ ] **M14-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M14-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M14-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M14-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m14/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M34 — Лицензированный B-roll recommender по смысловому слоту (rank #42, 8.40/10, W3)

**Тип:** Системная. **Зависимости:** P16, P22, P24. **Базовая оценка усилий:** large, ~2–4 dev-weeks. **Спецификация:** [Контент и ассеты](./specs/content/spec.md).

**Почему:** Вставленные кадры часто иллюстрируют случайное слово вместо конкретной мысли и вводят ложный контекст.

**Как:** Из approved script выделить смысловые цели; искать кандидаты только среди P32-реестра. Для каждой пары speech span ↔ B-roll вычислять relevance, novelty и risk-of-contradiction; выбирать тонкие 1–3 сек слоты с ручным утверждением.

**Предлагаемый контракт:** BrollProposal_v1: cue_id, asset_id/SHA/license, start/end PTS, justification, claim_link, candidate rank, must_review=true.

**Главный сценарий приёмки:** На 20 зафиксированных пар «фраза—кадр» 0 ассетов без прав, а намеренно нерелевантные footage не становятся READY; оценить полезность blind с редактором.

**Отрицательные тесты и эксплуатационный риск:** Embedding relevance не доказывает фактическую связь; модели могут предлагать ложный контекст, политика безопасности прежде score.

- [ ] **M34-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M34-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M34-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M34-C04 — Negative regression & isolation.** Создать `tests/cloud-m34-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Embedding relevance не доказывает фактическую связь; модели могут предлагать ложный контекст, политика безопасности прежде score.
- [ ] **M34-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M34-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M34-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M34-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m34/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M20 — Произношение имён и терминов в озвучке (rank #43, 8.35/10, W1)

**Тип:** Атомарная. **Зависимости:** P09, P10, P23. **Базовая оценка усилий:** medium, ~1–2 dev-weeks. **Спецификация:** [Речь и звук](./specs/audio/spec.md).

**Почему:** Технический ролик проигрывает по качеству из-за неверных ударений, чисел, аббревиатур и английских названий.

**Как:** Лексикон approved spellings + фонетических форм для TTS/ASR; сверять распознанные слова, script tokens и manual notes. Помечать только вероятные ошибки с timestamp, при наличии иных языков проверять токен по альтернативному lexicon.

**Предлагаемый контракт:** PronunciationQA v1: glossary revision, token IDs, expected_text, recognized_text, audio span, confidence, reviewer decision.

**Главный сценарий приёмки:** На 20 специальных терминах фиксировать ошибки без замены оригинальной записи; 0 автоматических замен терминов, false-positive отдельно измерить.

**Отрицательные тесты и эксплуатационный риск:** Нужны языковые модели для RU/EN, ударения неоднозначны; автоматическая фонетика — подсказка, не доказательство ошибки.

- [ ] **M20-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M20-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M20-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M20-C04 — Negative regression & isolation.** Создать `tests/cloud-m20-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Нужны языковые модели для RU/EN, ударения неоднозначны; автоматическая фонетика — подсказка, не доказательство ошибки.
- [ ] **M20-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M20-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M20-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M20-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m20/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M02 — Независимый режиссёрский совет A/B (rank #44, 8.30/10, W3)

**Тип:** Системная. **Зависимости:** P07, P10, P16, P23. **Базовая оценка усилий:** large, ~2–4 dev-weeks. **Спецификация:** [Режиссура и таймлайн](./specs/editorial/spec.md).

**Почему:** Один генератор видеоряда часто закрепляет собственные ошибки; одно и то же качество оценивается им же без слепого сравнения.

**Как:** Для каждого черновика два независимых critic-профиля предлагают timecoded замечания по смыслу, ритму, типографике и звуку. Агрегатор убирает дубли, фиксирует разногласия и показывает автору A/B рядом с исходными MP4; решение человека отделено от самооценки модели.

**Предлагаемый контракт:** critique_v1: baseline_sha, candidate_sha, model_version, time_range, finding_type, severity, evidence_frame_sha; reviewer_id и решение хранятся отдельно.

**Главный сценарий приёмки:** На 20 размеченных дефектах измерить recall/false-positive и время исправления; blind A/B не должен раскрывать вариант агенту-судье; false verdict запрещён без кадра/времени.

**Отрицательные тесты и эксплуатационный риск:** Высокая модельная стоимость и bias критиков; запрещено самоподписание, raw транскрипт без consent не отправлять наружу.

- [ ] **M02-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M02-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M02-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M02-C04 — Negative regression & isolation.** Создать `tests/cloud-m02-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Высокая модельная стоимость и bias критиков; запрещено самоподписание, raw транскрипт без consent не отправлять наружу.
- [ ] **M02-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M02-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M02-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M02-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m02/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M33 — Видеопоиск по смыслу и временному отрезку (rank #45, 8.30/10, W3)

**Тип:** Системная. **Зависимости:** P22, P23. **Базовая оценка усилий:** large, ~2–4 dev-weeks. **Спецификация:** [Контент и ассеты](./specs/content/spec.md).

**Почему:** Монтажёр тратит время на ручной просмотр длинных ассетов, хотя нужен один двухсекундный момент.

**Как:** По локально разрешённым MP4 строить segmented index: scene boundaries, OCR text, speech words, object descriptors, embeddings по выбранным кадрам. По запросу возвращать точные start/end PTS и real preview strip, не просто имя файла.

**Предлагаемый контракт:** SemanticIndex_v1: asset SHA, codec metadata, chunk PTS, model/hash, text/visual features, ACL and license scope; нет чужого cross-project retrieval.

**Главный сценарий приёмки:** На 50 вручную размеченных поисковых запросах замерить top5 recall и затраты поиска, false suggestion must not become insert automatically; missing asset hash invalidates index.

**Отрицательные тесты и эксплуатационный риск:** GPU/embeddings могут обойтись дороже ручного поиска на маленьких проектах; начинать с ffprobe+transcript и add-on индекса.

- [ ] **M33-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M33-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M33-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M33-C04 — Negative regression & isolation.** Создать `tests/cloud-m33-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: GPU/embeddings могут обойтись дороже ручного поиска на маленьких проектах; начинать с ffprobe+transcript и add-on индекса.
- [ ] **M33-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M33-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M33-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M33-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m33/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M38 — Мультикритериальный best-take selector (rank #46, 8.25/10, W3)

**Тип:** Системная. **Зависимости:** P03, P07, P22. **Базовая оценка усилий:** large, ~2–4 dev-weeks. **Спецификация:** [Контент и ассеты](./specs/content/spec.md).

**Почему:** Из нескольких дублей выбирают первый попавшийся, хотя качественный вариант теряет смысл из-за дефекта фокуса или дикции.

**Как:** Сравнивать approved takes по frame sharpness, audio clipping, stable motion, script coverage и editorial annotations. Weight constraints конфигурируемы: technical FAIL исключает дубль, остальные признаки только рекомендуют.

**Предлагаемый контракт:** TakeScore_v1: approved asset hashes, check vectors, user priority, confidence intervals, missing metrics, manual overrides.

**Главный сценарий приёмки:** Намеренно размытой сцене не приписывать FAIL из-за одной резкости; на 15 annotated takes измерить долю выбранных качественных кандидатов и время A/B.

**Отрицательные тесты и эксплуатационный риск:** Лучшая техническая картинка может быть худшей по эмоции; итоговый выбор человека обязателен.

- [ ] **M38-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M38-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M38-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M38-C04 — Negative regression & isolation.** Создать `tests/cloud-m38-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Лучшая техническая картинка может быть худшей по эмоции; итоговый выбор человека обязателен.
- [ ] **M38-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M38-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M38-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M38-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m38/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M06 — Ограничительный solver связности шести сцен (rank #47, 8.20/10, W3)

**Тип:** Системная. **Зависимости:** P04, P10, P17, P21. **Базовая оценка усилий:** large, ~2–4 dev-weeks. **Спецификация:** [Режиссура и таймлайн](./specs/editorial/spec.md).

**Почему:** Соседние сцены могут менять направление действия, язык цветокоррекции, время суток и позицию центрального объекта.

**Как:** Из approved сцен извлекать формальные boundary states: shot_axis, visual_subject, luminance, palette, spatial anchor, narration cue. Создать constraint graph и предлагать минимальный набор исправлений, ранжируя стоимость и художественную пользу без прямого рендера.

**Предлагаемый контракт:** ContinuityConstraints_v1 с evidence references на реальные кадры, revision и hard/soft правила; score не заменяет manual decision.

**Главный сценарий приёмки:** На golden six-scene fixture находить известную инверсию оси, затемнение/пересвет и два несовпадения мотивов; число ложных обязательных блокировок должно быть 0 на контрольном наборе.

**Отрицательные тесты и эксплуатационный риск:** 180° правило неприменимо во всех стилях; нужна возможность режиссёрского override с объяснением.

- [ ] **M06-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M06-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M06-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M06-C04 — Negative regression & isolation.** Создать `tests/cloud-m06-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: 180° правило неприменимо во всех стилях; нужна возможность режиссёрского override с объяснением.
- [ ] **M06-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M06-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M06-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M06-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m06/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M23 — Перцептуальное выравнивание цвета между сценами (rank #48, 8.15/10, W4)

**Тип:** Атомарная. **Зависимости:** P03, P17, P21. **Базовая оценка усилий:** large, ~2–4 dev-weeks. **Спецификация:** [Визуал, цвет и анимация](./specs/visual/spec.md).

**Почему:** Экспозиция и цветовая температура соседних сцен скачут, единый LUT разрушает оттенки кожи и фирменные цвета.

**Как:** В нормализованном scene-linear working space оценивать нейтраль, luminance histograms, hue distribution и color gamut; строить ограниченные предложения экспозиции/WB/контраста между соседними verified кадрами, preserve brand swatches.

**Предлагаемый контракт:** ColorMatch_v1: primaries/transfer flags, source SHA, target grade SHA, exposure/WB ranges, skin/brand protected masks.

**Главный сценарий приёмки:** На размеченном A/B наборе 0 клиппинга в highlights, стабильность фирменного цвета в заданном ΔE-бюджете; если HDR/SDR неизвестен — fail closed.

**Отрицательные тесты и эксплуатационный риск:** Histogram match не понимает художественный свет; неоднозначные кадры должны остаться ручной цветокоррекцией.

- [ ] **M23-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M23-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M23-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M23-C04 — Negative regression & isolation.** Создать `tests/cloud-m23-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Histogram match не понимает художественный свет; неоднозначные кадры должны остаться ручной цветокоррекцией.
- [ ] **M23-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M23-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M23-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M23-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m23/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M53 — Перцептуальное качество после экспорта и обнаружение banding (rank #49, 8.15/10, W4)

**Тип:** Атомарная. **Зависимости:** P03, P11, P23. **Базовая оценка усилий:** large, ~2–4 dev-weeks. **Спецификация:** [QC и доступность](./specs/quality/spec.md).

**Почему:** MP4 может быть технически валиден, но потерять детали и получить цветовые полосы при сжатии.

**Как:** Для сопоставимых эталона/кодека считать VMAF (опциональная libvmaf сборка), SSIM, MS-SSIM и CAMBI; валидировать одинаковые PTS, colorspace, crop, frame dimensions до сравнения. QA — по областям, а не только глобальный mean.

**Предлагаемый контракт:** QualityMetrics_v1: baseline/output SHA, tool/model version, temporal aligned frame pairs, score distributions, exclusions, confidence.

**Главный сценарий приёмки:** Создать low/high bitrate пары и synthetic gradient: высоко потерянная деталь выявляется, gamut mismatch недопустим; в UI доступны худшие 10 временных участков.

**Отрицательные тесты и эксплуатационный риск:** VMAF не оценивает эстетику, титры или правдивость, не годится без reference, и модель может ошибаться при enhancement; baseline и target должны быть сравнимы.

- [ ] **M53-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M53-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M53-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M53-C04 — Negative regression & isolation.** Создать `tests/cloud-m53-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: VMAF не оценивает эстетику, титры или правдивость, не годится без reference, и модель может ошибаться при enhancement; baseline и target должны быть сравнимы.
- [ ] **M53-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M53-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M53-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M53-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m53/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M57 — Арт-оценка качества с калибровкой человеческих судей (rank #50, 8.15/10, W4)

**Тип:** Системная. **Зависимости:** P07, P11, P23. **Базовая оценка усилий:** large, ~2–4 dev-weeks. **Спецификация:** [QC и доступность](./specs/quality/spec.md).

**Почему:** Разработчики могут улучшать метрики тестов, но не реальную выразительность ролика.

**Как:** Создать небольшую медиатеку собственных approved clips, анонимные A/B пары и профессиональные рубрики: темп, ясность, эмоциональный акцент, типографика, звук, правдивость. Вычислять inter-rater agreement и confidence bands.

**Предлагаемый контракт:** CreativeEval_v1: baseline/candidate SHA, random order, criteria, reviewer ids anonymized, justifications and versioned score model.

**Главный сценарий приёмки:** На 30 парах показать интервал уверенности, долю согласия и причины «ничьей»; не объявлять улучшение при недостаточной выборке или расхождении судей.

**Отрицательные тесты и эксплуатационный риск:** Человеческие предпочтения контекстные, маленькая выборка не предсказывает retention; нет автоопубликации по рейтингу.

- [ ] **M57-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M57-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M57-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M57-C04 — Negative regression & isolation.** Создать `tests/cloud-m57-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Человеческие предпочтения контекстные, маленькая выборка не предсказывает retention; нет автоопубликации по рейтингу.
- [ ] **M57-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M57-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M57-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M57-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m57/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M60 — Профессиональный round-trip монтажного проекта (OTIO) (rank #51, 8.10/10, W4)

**Тип:** Системная. **Зависимости:** P05, P08, P24. **Базовая оценка усилий:** large, ~2–4 dev-weeks. **Спецификация:** [QC и доступность](./specs/quality/spec.md).

**Почему:** Готовый MP4 нельзя редактировать в привычных NLE без ручной реконструкции таймлайна; эксперты не могут отдать правки обратно агентам.

**Как:** Экспортировать source-pinned canonical EditGraph в OpenTimelineIO: tracks, clips, rational time, markers, transitions, metadata и media references (не вложенные файлы). Импорт OTIO проходит schema gate и отображает mismatch до merge.

**Предлагаемый контракт:** TimelineExchange_v1: OTIO schema_version, internal IDs, source URI normalized to approved local assets, fps mapping, revision and render ref.

**Главный сценарий приёмки:** Экспорт/импорт 6 сцен с J/L anchors, titles и markers сохраняет PTS в пределах ±1 output frame; неизвестные эффекты остаются loss-report, а не silently dropped.

**Отрицательные тесты и эксплуатационный риск:** OTIO адаптеры имеют неодинаковую поддержку эффектов; не обещать 100% roundtrip с Premiere/Resolve без тестирования конкретных версий.

- [ ] **M60-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M60-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M60-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M60-C04 — Negative regression & isolation.** Создать `tests/cloud-m60-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: OTIO адаптеры имеют неодинаковую поддержку эффектов; не обещать 100% roundtrip с Premiere/Resolve без тестирования конкретных версий.
- [ ] **M60-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M60-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M60-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M60-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m60/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M16 — Семантические звуковые акценты по лицензированным ассетам (rank #52, 8.05/10, W4)

**Тип:** Атомарная. **Зависимости:** P19, P22. **Базовая оценка усилий:** medium, ~1–2 dev-weeks. **Спецификация:** [Речь и звук](./specs/audio/spec.md).

**Почему:** UI-анимация выглядит дешёво без точных звуковых подтверждений, но случайные whoosh перегружают ролик.

**Как:** Каталог отдельно утверждённых SFX (тонкие whoosh, click, reveal, low-impact) со спектральными envelope и лицензией. Триггер связан с точным событием 3D keyframe/clip, динамический limiter и budget максимального числа SFX на 10 сек.

**Предлагаемый контракт:** SfxCue v1: asset_id, license_ref, event_id, samples_offset, gain_db, max_events, source_sha, dry-run preview.

**Главный сценарий приёмки:** На 6 сценах три разных типа движения получают правдоподобный звук без рассинхрона (>1 frame), а «тихие» сцены сохраняют пустоту; отсутствующая лицензия блокирует микс.

**Отрицательные тесты и эксплуатационный риск:** Риск звукового клише и усталости; не генерировать SFX автоматически без авторского согласования.

- [ ] **M16-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M16-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M16-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M16-C04 — Negative regression & isolation.** Создать `tests/cloud-m16-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Риск звукового клише и усталости; не генерировать SFX автоматически без авторского согласования.
- [ ] **M16-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M16-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M16-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M16-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m16/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M19 — Шины и stems как настоящий монтажный микшер (rank #53, 8.00/10, W4)

**Тип:** Системная. **Зависимости:** P19, P24. **Базовая оценка усилий:** medium, ~1–2 dev-weeks. **Спецификация:** [Речь и звук](./specs/audio/spec.md).

**Почему:** Сведение аудио в один поток не позволяет отдельно корректировать голос, музыку, окружение и использовать микс повторно.

**Как:** Сделать 4 шины voice/music/sfx/ambience с собственными meters, mute/solo, send/sidechain и автоматизацией gain в sample domain. Микс компилируется в whitelisted фильтры и immutable stems, Studio отображает peak/LUFS каждого.

**Предлагаемый контракт:** MixBuses_v1: track types, approved asset hashes, gain knots, routing graph без циклов, output master and isolated stems.

**Главный сценарий приёмки:** Изолированная перестройка music не меняет voice stem SHA; 0 циклов аудиографа; snapshots и loudness preflight тестируются на PCM.

**Отрицательные тесты и эксплуатационный риск:** Поддержка каналов >stereo отложена; DSP может стать CPU bottleneck, нужен лимит числа stems/эффектов.

- [ ] **M19-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M19-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M19-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M19-C04 — Negative regression & isolation.** Создать `tests/cloud-m19-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Поддержка каналов >stereo отложена; DSP может стать CPU bottleneck, нужен лимит числа stems/эффектов.
- [ ] **M19-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M19-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M19-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M19-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m19/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M35 — Поиск визуальных повторов и смыслового разнообразия (rank #54, 8.00/10, W4)

**Тип:** Атомарная. **Зависимости:** P03, P16, P22. **Базовая оценка усилий:** medium, ~1–2 dev-weeks. **Спецификация:** [Контент и ассеты](./specs/content/spec.md).

**Почему:** Видеоряд выглядит как один шаблон: близкие кадры, одни и те же движения и карточки повторяются.

**Как:** Перцептуальные pHash/embedding векторы для approved кадров + shot composition tags; clustering ищет дубликаты и серии почти одинаковых сцен. В качестве замены предлагает более редкий тип композиции из разрешённой библиотеки.

**Предлагаемый контракт:** ShotDiversity_v1: hashed shot IDs, cluster ID, known visual motifs, sample timing и reason.

**Главный сценарий приёмки:** На 30 кадровых парах near-duplicates найдено подавляющее большинство после калибровки threshold; deliberate refrain не удаляется без ручной пометки.

**Отрицательные тесты и эксплуатационный риск:** Похожесть изображений не равна стилистической ошибке; повтор может быть осознанным мотивом.

- [ ] **M35-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M35-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M35-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M35-C04 — Negative regression & isolation.** Создать `tests/cloud-m35-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Похожесть изображений не равна стилистической ошибке; повтор может быть осознанным мотивом.
- [ ] **M35-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M35-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M35-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M35-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m35/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M37 — Семантическая проверка предмета и действия без идентификации личности (rank #55, 8.00/10, W4)

**Тип:** Атомарная. **Зависимости:** P03, P22, P23. **Базовая оценка усилий:** medium, ~1–2 dev-weeks. **Спецификация:** [Контент и ассеты](./specs/content/spec.md).

**Почему:** Ролик показывает неправильный тип объекта (например, продукт вместо архитектуры), и это не поймать по метрике цвета.

**Как:** Точный список допустимых object classes и action labels из approved brief; на sample frames выполнять bounded classification без биометрической идентификации; привязывать вывод к SHA кадра и model fingerprint.

**Предлагаемый контракт:** SceneEntityProof_v1: expected tags, observed tags, evidence frames, confidence, allowed uncertainty; invalid/perceptual-sensitive tags reject.

**Главный сценарий приёмки:** На 25 контрольных сценах «нет предмета» сигнализирует REVIEW, запрет на лицо→имя, неизученный контент не выдаётся за matching proof.

**Отрицательные тесты и эксплуатационный риск:** Model bias и неполная онтология; не принимать художественный кадр только на основании class labels.

- [ ] **M37-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M37-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M37-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M37-C04 — Negative regression & isolation.** Создать `tests/cloud-m37-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Model bias и неполная онтология; не принимать художественный кадр только на основании class labels.
- [ ] **M37-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M37-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M37-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M37-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m37/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M10 — Аудит пространственной грамматики и направления взгляда (rank #56, 7.90/10, W4)

**Тип:** Атомарная. **Зависимости:** P03, P17, P23. **Базовая оценка усилий:** large, ~2–4 dev-weeks. **Спецификация:** [Режиссура и таймлайн](./specs/editorial/spec.md).

**Почему:** Скачки направления движения и взгляда вызывают ощущение некачественной нарезки даже при хорошем цвете.

**Как:** На реальных boundary JPEG/optical-flow оценивать вектора ведущих объектов, camera yaw, знак движения по экрану; отчёт фиксирует «возможный jump» с тремя соседними кадрами и объяснением.

**Предлагаемый контракт:** ScreenDirection_v1 с evidence SHA, calibrated confidence band и reason codes; порог review, а не автоматический cut ban.

**Главный сценарий приёмки:** Разметить 30 границ: статичные кадры не выдавать за разворот на 180°, намеренные jump cuts отмечать как предупреждения; замерить precision отдельно от recall.

**Отрицательные тесты и эксплуатационный риск:** Оптический поток ошибается на occlusion/монтаже; обязательное ручное подтверждение неоднозначного решения.

- [ ] **M10-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M10-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M10-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M10-C04 — Negative regression & isolation.** Создать `tests/cloud-m10-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Оптический поток ошибается на occlusion/монтаже; обязательное ручное подтверждение неоднозначного решения.
- [ ] **M10-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M10-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M10-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M10-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m10/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M30 — Размытие по реальной скорости без мерцания (rank #57, 7.90/10, W4)

**Тип:** Атомарная. **Зависимости:** P18, P23. **Базовая оценка усилий:** large, ~2–4 dev-weeks. **Спецификация:** [Визуал, цвет и анимация](./specs/visual/spec.md).

**Почему:** Motion blur с постоянным радиусом замыливает текст и стационарные объекты.

**Как:** Считать motion vector по keyframe curve и bounded shutter angle, использовать temporal accumulation только на движущихся слоях. Текст/UI/лица и reduced-motion — protected masks; adaptive subframe sampling с CPU budget.

**Предлагаемый контракт:** BlurPolicy_v1: frame PTS, velocity, max_kernel, shutter angle, protected layer IDs, fallback=none.

**Главный сценарий приёмки:** Рендерить кадры в 0/25/50/75/100% при двух скоростях и reduced mode: неподвижный текст не теряет MTF, output детерминирован; no CPU budget overshoot.

**Отрицательные тесты и эксплуатационный риск:** Потребуются дополнительные рендер-проходы; oversampling может быть дороже выигрыша, нужна профилировка на Railway CPU.

- [ ] **M30-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M30-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M30-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M30-C04 — Negative regression & isolation.** Создать `tests/cloud-m30-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Потребуются дополнительные рендер-проходы; oversampling может быть дороже выигрыша, нужна профилировка на Railway CPU.
- [ ] **M30-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M30-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M30-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M30-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m30/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M25 — Кинематографический конструктор движения 3D-камеры (rank #58, 7.80/10, W4)

**Тип:** Системная. **Зависимости:** P01, P04, P18. **Базовая оценка усилий:** R&D, ≥1–2 dev-months. **Спецификация:** [Визуал, цвет и анимация](./specs/visual/spec.md).

**Почему:** В сценах с 3D-объектами камера случайно крутится, не раскрывая главный объект или задачу.

**Как:** Ввести shot DSL (dolly, arc, orbit, crane, rack focus) с focal subject, depth range, easing и collision/frustum limits. Сначала строить preview camera path, затем sample и scene depth/occlusion check, только потом рендер.

**Предлагаемый контракт:** CameraShot_v1: target_mesh_id, camera path knots, lens budget, keep-in-frame constraint, desired emotion as nonbinding tag.

**Главный сценарий приёмки:** Рендер двух предметов с пятью camera moves: 100% focal target внутри frustum, safe motion, детерминированный PTS; reduced-motion оставляет статичную композицию.

**Отрицательные тесты и эксплуатационный риск:** Добавление depth/focus зависит от реального renderer P01; визуально красивое движение нельзя сертифицировать только математикой.

- [ ] **M25-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M25-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M25-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M25-C04 — Negative regression & isolation.** Создать `tests/cloud-m25-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Добавление depth/focus зависит от реального renderer P01; визуально красивое движение нельзя сертифицировать только математикой.
- [ ] **M25-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M25-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M25-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M25-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m25/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M28 — Предметные маски и параллакс с глубинной проверкой (rank #59, 7.25/10, W4)

**Тип:** Атомарная. **Зависимости:** P01, P18, P22. **Базовая оценка усилий:** R&D, ≥1–2 dev-months. **Спецификация:** [Визуал, цвет и анимация](./specs/visual/spec.md).

**Почему:** 2D-вставка выглядит наклейкой без настоящего взаимодействия с передним/задним планом.

**Как:** Использовать разрешённую модель segmentation/depth для owned shot или 3D depth buffer; layered parallax только на утверждённых assets, soft-edge masks и per-frame temporal smoothing. Не считать segmentation доказательством идентичности лица.

**Предлагаемый контракт:** LayerMask_v1: mask SHA, origin frame, depth rank, transform track, re-evaluate on shot change, approval pointer.

**Главный сценарий приёмки:** Параллакс двух объектов за 4 секунды без заметной рваной каймы на 0/25/50/75/100% golden кадров; невидимые области не дорисовывать без разрешения.

**Отрицательные тесты и эксплуатационный риск:** Дорогая GPU-модель, ошибки масок и privacy, поэтому не входит в быстрый MVP; отключается per clip.

- [ ] **M28-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M28-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M28-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M28-C04 — Negative regression & isolation.** Создать `tests/cloud-m28-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Дорогая GPU-модель, ошибки масок и privacy, поэтому не входит в быстрый MVP; отключается per clip.
- [ ] **M28-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M28-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M28-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M28-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m28/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---

### M36 — Контролируемое генеративное расширение клипа с provenance (rank #60, 6.65/10, W4)

**Тип:** Атомарная. **Зависимости:** P08, P22, P23. **Базовая оценка усилий:** R&D, ≥1–2 dev-months. **Спецификация:** [Контент и ассеты](./specs/content/spec.md).

**Почему:** Иногда не хватает 0.5–1 секунды до удобного стыка, но произвольная генерация может изменить факты и лицо персонажа.

**Как:** Только для разрешённых исходников пробовать opt-in video extend, ограниченный длиной и разрешением, маркировать полностью синтетические кадры и сохранять модель/prompt/seed/provider. Обязательное ручное frame-level visual consistency review перед включением.

**Предлагаемый контракт:** GeneratedExtension_v1: source SHA, authorization/licensing, extension frames, synthetic_ranges, provider/model_version, actor and human acceptance.

**Главный сценарий приёмки:** На 10 сложных границах synthetic frame не засчитывается как подлинное событие; temporal jitter, текст и артефакты измеряются в A/B; fallback — trim без генерации.

**Отрицательные тесты и эксплуатационный риск:** Высокая цена/время, vendor lock-in и риск фактических подмен; не запускать как дефолт и не имитировать документальную съёмку.

- [ ] **M36-C01 — Contract & threat model.** Утвердить contract v1 и лимиты полей, inputs/outputs, source P08 SHA, authorisations/consent/license, allowed PTS, timebase, mode rollback. Создать положительный и 3 отрицательных fixture. Ветку/PR не считать реализацией.
- [ ] **M36-C02 — Pure engine.** Разработать детерминированный isolated algorithm согласно «Как»; отдельные multi-FPS/speech/graph fixtures. Исключения и rejected reasons типизированы. Ни один предварительный расчёт не меняет user `deck.json` или approved renders.
- [ ] **M36-C03 — Authenticated API and Studio.** Versioned REST+MCP с `P06` role/project/scene ACL, `fence_token`, `expected_revision` и idempotency; browser read-only preview, side-by-side baseline/candidate; ручной reset/override через отдельный signed action.
- [ ] **M36-C04 — Negative regression & isolation.** Создать `tests/cloud-m36-montage.test.mjs`. Проверить forged SHA/license, чужой worker, expired lease, stale revision, Unicode/NaN/path traversal, malformed media, excessive inputs, concurrent edit/cancel. Реализовать отдельный тест на особый риск: Высокая цена/время, vendor lock-in и риск фактических подмен; не запускать как дефолт и не имитировать документальную съёмку.
- [ ] **M36-C05 — Real six-scene vertical slice.** Использовать утверждённые или synthetic owned assets, реальный ffprobe/FFmpeg/Chromium/PCM и SHA каждого input/output. Проверить основной DoD на соответствующих кадрах/аудиофрагментах, сравнить PTS/master и убедиться, что принятому P08/P05 ничего не угрожает.
- [ ] **M36-C06 — Effect/efficiency benchmark.** Выполнить повторные cold/warm и blind A/B против одного и того же шестисценного baseline; записать измеренное качество, `editor_minutes`, CPU seconds, p95 latency, peak RSS, стоимость, неопределённость и отрицательные/нулевые результаты. Не обещать улучшения без доказательства.
- [ ] **M36-C07 — Independent security/art review.** Отдельный reviewer проверяет алгоритм, media/license/actor scope, регрессии, экономию и реальный output SHA. Для художественных показателей human blind A/B; reviewer identity/time/commit; обнаруженные дефекты → REWORK.
- [ ] **M36-C08 — Canary/release/rollback.** Staging на точном протестированном commit и Docker digest; флаг по умолчанию OFF; снять 5xx/queue/p95/CPU/RAM/quality gates, протестировать cancellation/rollback. Production допускается только по signed decision с сохранением предыдущего release pointer.

**Единый DoD артефакт:** `docs/evidence/m36/acceptance.json` (предлагаемый, отсутствует), `status=ACCEPTED` только с реальным CI, media hashes и reviewer. **Rollback:** отключение флага и откат только sidecar/нового кандидата; принятый master не изменяется.

---
