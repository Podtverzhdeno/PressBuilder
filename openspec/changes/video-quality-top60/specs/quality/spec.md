# OpenSpec Top-60 / F. Качество, регрессии, доступность, совместимость

> PROPOSED. Раздельные выводы: **technical fail**, **artistic review**, **accepted by human**. Нельзя выдавать VMAF или OCR за художественную оценку.

### Requirement M51 — Единый QC-кокпит с покадровыми исправлениями

- **Тип:** Системная; **оценки Q/E/F/C/S/L:** 10/10/9/9/10/10; **зависимости:** P03,P07,P11,P23; **статус:** PROPOSED.
- **Боль и эффект:** Видео проверяют в разных местах: чёрный кадр, текст, звук и монтажный стык не сводятся к конкретной точке исправления.
- **Алгоритм / дизайн:** Создать timecoded QC event map поверх master MP4: technical issue, severity, evidence frame/sound SHA, suggested owner scene, source version and regression links. Timeline кликом открывает точный кадр и предыдущую версия A/B.
- **Версионированный интерфейс и безопасность:** QcEvent_v1: media artifact_sha, stream PTS, issue code, detector version, repro instruction, reviewed_by, disposition, suppression reason.
- **Acceptance и воспроизводимость:** В одной шестисценной сборке 20 умышленно внесённых ошибок попадают в корректные PTS/scene; скрытые вручную false positives не всплывают после rollback без нового source SHA.
- **Ограничения и отрицательные кейсы:** Не превращать множество эвристик в единый художественный score; технический FAIL и субъективное REVIEW хранятся раздельно.
- **Последовательность SDD:** reference dataset & signed inputs → detector/exporter contract и детерминированный тест → timecoded review UI → real MP4/PCM adversarial Docker QA → независимая приёмка и отдельно подтверждённая baseline/p95 экономия → canary + rollback. Автоматические оценки качества никогда не заменяют авторское художественное решение.

### Requirement M52 — Мультиметр звука и разборчивости речи

- **Тип:** Атомарная; **оценки Q/E/F/C/S/L:** 10/9/9/8/10/9; **зависимости:** P03,P19,P23; **статус:** PROPOSED.
- **Боль и эффект:** Даже при нормальном среднем LUFS речь неразборчива из-за пиков, резонансов, фона и конкуренции с музыкой.
- **Алгоритм / дизайн:** Из PCM считать per-window speech/music RMS, noise floor, clipped samples, true peak, crest factor, sibilance proxy и spectral masking. UI связывает риски с sample PTS, а исправление выполняется отдельной mix transaction.
- **Версионированный интерфейс и безопасность:** AudioQc_v1: source and master hashes, measured metrics, windows, rule profile, thresholds and uncertainty.
- **Acceptance и воспроизводимость:** В контрольных 15 noisy/clean stems находить клиппинг, неприемлемый пик и перекрытие голоса с музыкой; метрики повторяемы на 44.1/48 кГц; human intelligibility rating — отдельный показатель.
- **Ограничения и отрицательные кейсы:** Оценка разборчивости speech без реального слушателя не гарантируется; не делать автоматический mastering по одному числу.
- **Последовательность SDD:** reference dataset & signed inputs → detector/exporter contract и детерминированный тест → timecoded review UI → real MP4/PCM adversarial Docker QA → независимая приёмка и отдельно подтверждённая baseline/p95 экономия → canary + rollback. Автоматические оценки качества никогда не заменяют авторское художественное решение.

### Requirement M53 — Перцептуальное качество после экспорта и обнаружение banding

- **Тип:** Атомарная; **оценки Q/E/F/C/S/L:** 9/8/7/7/9/9; **зависимости:** P03,P11,P23; **статус:** PROPOSED.
- **Боль и эффект:** MP4 может быть технически валиден, но потерять детали и получить цветовые полосы при сжатии.
- **Алгоритм / дизайн:** Для сопоставимых эталона/кодека считать VMAF (опциональная libvmaf сборка), SSIM, MS-SSIM и CAMBI; валидировать одинаковые PTS, colorspace, crop, frame dimensions до сравнения. QA — по областям, а не только глобальный mean.
- **Версионированный интерфейс и безопасность:** QualityMetrics_v1: baseline/output SHA, tool/model version, temporal aligned frame pairs, score distributions, exclusions, confidence.
- **Acceptance и воспроизводимость:** Создать low/high bitrate пары и synthetic gradient: высоко потерянная деталь выявляется, gamut mismatch недопустим; в UI доступны худшие 10 временных участков.
- **Ограничения и отрицательные кейсы:** VMAF не оценивает эстетику, титры или правдивость, не годится без reference, и модель может ошибаться при enhancement; baseline и target должны быть сравнимы.
- **Последовательность SDD:** reference dataset & signed inputs → detector/exporter contract и детерминированный тест → timecoded review UI → real MP4/PCM adversarial Docker QA → независимая приёмка и отдельно подтверждённая baseline/p95 экономия → canary + rollback. Автоматические оценки качества никогда не заменяют авторское художественное решение.

### Requirement M54 — Детектор фоточувствительных вспышек и безопасный motion-mode

- **Тип:** Системная; **оценки Q/E/F/C/S/L:** 10/9/9/9/10/10; **зависимости:** P18,P20,P23; **статус:** PROPOSED.
- **Боль и эффект:** Быстрый монтаж, белые вспышки и насыщенный красный могут создавать риск для людей с фоточувствительностью.
- **Алгоритм / дизайн:** Декодировать master и считать rapid luminance/red opposing transitions по WCAG 2.2 SC 2.3.1; анализировать sliding 1 second, площадь вспышек, worst-case full-screen; при опасности blocking finding и safe motion fallback с ручным подтверждением.
- **Версионированный интерфейс и безопасность:** FlashRisk_v1: exact frame/PTS windows, measurement color space, red-flash estimate, area threshold, reviewer override policy, output SHA.
- **Acceptance и воспроизводимость:** Тесты 2, 3, 4 flashes/second, мелкий яркий объект, fullscreen red flashes, GIF/loop boundary и SDR/HDR; опасные тестовые ролики не отдаются на просмотр людям без предупреждения.
- **Ограничения и отрицательные кейсы:** Порог «3 в секунду» не единственное условие WCAG; учитывать яркость, площадь и red threshold, а false negative недопустим.
- **Последовательность SDD:** reference dataset & signed inputs → detector/exporter contract и детерминированный тест → timecoded review UI → real MP4/PCM adversarial Docker QA → независимая приёмка и отдельно подтверждённая baseline/p95 экономия → canary + rollback. Автоматические оценки качества никогда не заменяют авторское художественное решение.

### Requirement M55 — Мобильный тест читабельности и безопасных зон

- **Тип:** Атомарная; **оценки Q/E/F/C/S/L:** 10/9/8/8/9/9; **зависимости:** P03,P20,P21,P23; **статус:** PROPOSED.
- **Боль и эффект:** Текст, который отлично смотрится на 27-дюймовом мониторе, не читается в вертикальном коротком ролике.
- **Алгоритм / дизайн:** Для 360px mobile preview измерять размер glyph bbox в физических пикселях, contrast, dwell time, occlusion и simulated app chrome safe areas. Сгенерировать сравнение 16:9/9:16/1:1 и стоп-кадры проблемных слов.
- **Версионированный интерфейс и безопасность:** ReadabilityQc_v1: output preset, font/license hash, measured px heights, bbox, exact decoded frame time, reviewer comments.
- **Acceptance и воспроизводимость:** Для 100 строк включая русский и кириллицу 0 cropped glyph, min readable dwell profile соответствует выбранному требованию, перекрытие UI-safe regions блокирует выпуск.
- **Ограничения и отрицательные кейсы:** Платформенные зоны UI меняются; профили должны иметь дату и источник, автоматический OCR не доказывает удобство чтения.
- **Последовательность SDD:** reference dataset & signed inputs → detector/exporter contract и детерминированный тест → timecoded review UI → real MP4/PCM adversarial Docker QA → независимая приёмка и отдельно подтверждённая baseline/p95 экономия → canary + rollback. Автоматические оценки качества никогда не заменяют авторское художественное решение.

### Requirement M56 — Golden-frame и PCM регрессии без шумных diff

- **Тип:** Системная; **оценки Q/E/F/C/S/L:** 9/10/9/9/10/10; **зависимости:** P03,P08,P11,P13; **статус:** PROPOSED.
- **Боль и эффект:** После небольших исправлений неизвестно, не сломались ли соседние сцены и не изменился ли звук за пределами правки.
- **Алгоритм / дизайн:** Для каждого проверенного релиза сохранять golden frames at semantic/boundary PTS + isolated PCM windows; сравнивать pixel metrics с mask для легитимно динамических областей. Deterministic HTML A/B diff и invariant proofs по нетронутым кадрам.
- **Версионированный интерфейс и безопасность:** GoldenFixture_v1: exact source/build/font hashes, frame PTS, masks, expected SHA, tolerance per pixel region, baseline reason.
- **Acceptance и воспроизводимость:** На PR с одним изменённым титром QC должен сигнализировать только соответствующий кадр, чистая пересборка даёт те же эталоны; не скрывать CPU/codec regressions.
- **Ограничения и отрицательные кейсы:** Изменение шрифтов/рендерера обновляет golden только после независимого review; размытые tolerance masks могут скрывать дефекты.
- **Последовательность SDD:** reference dataset & signed inputs → detector/exporter contract и детерминированный тест → timecoded review UI → real MP4/PCM adversarial Docker QA → независимая приёмка и отдельно подтверждённая baseline/p95 экономия → canary + rollback. Автоматические оценки качества никогда не заменяют авторское художественное решение.

### Requirement M57 — Арт-оценка качества с калибровкой человеческих судей

- **Тип:** Системная; **оценки Q/E/F/C/S/L:** 9/8/7/7/9/9; **зависимости:** P07,P11,P23; **статус:** PROPOSED.
- **Боль и эффект:** Разработчики могут улучшать метрики тестов, но не реальную выразительность ролика.
- **Алгоритм / дизайн:** Создать небольшую медиатеку собственных approved clips, анонимные A/B пары и профессиональные рубрики: темп, ясность, эмоциональный акцент, типографика, звук, правдивость. Вычислять inter-rater agreement и confidence bands.
- **Версионированный интерфейс и безопасность:** CreativeEval_v1: baseline/candidate SHA, random order, criteria, reviewer ids anonymized, justifications and versioned score model.
- **Acceptance и воспроизводимость:** На 30 парах показать интервал уверенности, долю согласия и причины «ничьей»; не объявлять улучшение при недостаточной выборке или расхождении судей.
- **Ограничения и отрицательные кейсы:** Человеческие предпочтения контекстные, маленькая выборка не предсказывает retention; нет автоопубликации по рейтингу.
- **Последовательность SDD:** reference dataset & signed inputs → detector/exporter contract и детерминированный тест → timecoded review UI → real MP4/PCM adversarial Docker QA → независимая приёмка и отдельно подтверждённая baseline/p95 экономия → canary + rollback. Автоматические оценки качества никогда не заменяют авторское художественное решение.

### Requirement M58 — SLO качества + производительности на одном релизном шлюзе

- **Тип:** Системная; **оценки Q/E/F/C/S/L:** 10/10/9/9/10/10; **зависимости:** P02,P03,P05,P13,P23; **статус:** PROPOSED.
- **Боль и эффект:** В проекте отдельно зелёные CI тесты, но никто не видит общую цену, скорость, качество и устойчивость выпуска.
- **Алгоритм / дизайн:** ReleaseGate собирает technical QA, media SHA/license proofs, successful worker logs, A/V sync, font and flash checks, p95 render time, cost and independent reviewer. Любая обязательная категория UNVERIFIED → нельзя повышать флаг до production.
- **Версионированный интерфейс и безопасность:** ReleaseEvidence_v1: exact commit/image, source/license proofs, test exit/status, performance envelope, mandatory gates, signoff actor.
- **Acceptance и воспроизводимость:** Fault injection: прошедший тест с пропущенным реальным media E2E не считается accepted; ухудшение p95/RAM сверх согласованного бюджета останавливает canary; rollback восстанавливает прежний SHA.
- **Ограничения и отрицательные кейсы:** SLO пороги сначала baseline-derived; нельзя называть гипотетический p95 гарантией, пока нет живых наблюдений.
- **Последовательность SDD:** reference dataset & signed inputs → detector/exporter contract и детерминированный тест → timecoded review UI → real MP4/PCM adversarial Docker QA → независимая приёмка и отдельно подтверждённая baseline/p95 экономия → canary + rollback. Автоматические оценки качества никогда не заменяют авторское художественное решение.

### Requirement M59 — Доступные субтитры и проверка точности смысла

- **Тип:** Системная; **оценки Q/E/F/C/S/L:** 9/9/9/9/10/9; **зависимости:** P09,P20,P23,P24; **статус:** PROPOSED.
- **Боль и эффект:** Профессиональный ролик без корректных субтитров, speaker labels и безопасного контраста недоступен многим зрителям.
- **Алгоритм / дизайн:** Для approved transcript строить timed subtitles/closed captions с сегментацией фраз, human review wording, языковыми пакетами RU/EN, contrast and dwell constraints; альтернативные SRT/VTT отдаются как отдельные версии.
- **Версионированный интерфейс и безопасность:** CaptionAccessibility_v1: word SHA, cues, language, optional speaker ID only as supplied/consented, line breaks, safe bounds, verified export checksum.
- **Acceptance и воспроизводимость:** 100 строк mixed RU/EN, числа и переносы без выхода за границы; SRT/VTT roundtrip сохраняет смысл, начало/конец и не изобретает новые speaker names.
- **Ограничения и отрицательные кейсы:** Diarization несовершенен, sensitive speech требует согласия; speaker labels не извлекаются как реальные личности из голоса.
- **Последовательность SDD:** reference dataset & signed inputs → detector/exporter contract и детерминированный тест → timecoded review UI → real MP4/PCM adversarial Docker QA → независимая приёмка и отдельно подтверждённая baseline/p95 экономия → canary + rollback. Автоматические оценки качества никогда не заменяют авторское художественное решение.

### Requirement M60 — Профессиональный round-trip монтажного проекта (OTIO)

- **Тип:** Системная; **оценки Q/E/F/C/S/L:** 8/9/7/7/9/9; **зависимости:** P05,P08,P24; **статус:** PROPOSED.
- **Боль и эффект:** Готовый MP4 нельзя редактировать в привычных NLE без ручной реконструкции таймлайна; эксперты не могут отдать правки обратно агентам.
- **Алгоритм / дизайн:** Экспортировать source-pinned canonical EditGraph в OpenTimelineIO: tracks, clips, rational time, markers, transitions, metadata и media references (не вложенные файлы). Импорт OTIO проходит schema gate и отображает mismatch до merge.
- **Версионированный интерфейс и безопасность:** TimelineExchange_v1: OTIO schema_version, internal IDs, source URI normalized to approved local assets, fps mapping, revision and render ref.
- **Acceptance и воспроизводимость:** Экспорт/импорт 6 сцен с J/L anchors, titles и markers сохраняет PTS в пределах ±1 output frame; неизвестные эффекты остаются loss-report, а не silently dropped.
- **Ограничения и отрицательные кейсы:** OTIO адаптеры имеют неодинаковую поддержку эффектов; не обещать 100% roundtrip с Premiere/Resolve без тестирования конкретных версий.
- **Последовательность SDD:** reference dataset & signed inputs → detector/exporter contract и детерминированный тест → timecoded review UI → real MP4/PCM adversarial Docker QA → независимая приёмка и отдельно подтверждённая baseline/p95 экономия → canary + rollback. Автоматические оценки качества никогда не заменяют авторское художественное решение.

