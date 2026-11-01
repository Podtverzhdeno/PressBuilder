# PressBuilder — оценка эффективности и технический backlog

Дата оценки: 2026-11-01. Исходное состояние: main `483a66ebe799` (до PR #19).
Основание: код `server/render.mjs`, `server/render-queue.mjs`, `server/assemble-scenes.mjs`, `server/source-provenance.mjs`, существующий GitHub Actions Docker smoke. Это code audit + CI benchmark, **не profiling реального Railway production**.

## Наблюдения и границы

1. **Кодирование:** для каждого кадра браузер генерирует PNG, отдаёт base64 через Chrome DevTools Protocol, а сервер декодирует и передаёт его в stdin FFmpeg. Стоимость зависит от разрешения, FPS, длительности и сложности слайдов; CPU/heap/CDP latency по отдельности пока не замерялись. При 6 сценах по 5 сек при 24 FPS это 720 кадров; это арифметика workload, а не результат профилирования.
2. **Монтаж:** текущий P05 нормализует все клипы и кодирует их в H.264/AAC даже при полностью одинаковых входах. Crossfade требует декодирования; ускорение hard-cut через copy допустимо только при совместимых codec/timebase/audio, поэтому без реальных compatibility gates небезопасно.
3. **Хранилище:** для текущего релиза каждый `current()` проверяет MP4 SHA-256, а перед монтажом каждый исходник проходит `ffprobe` и SHA-256. Эти проверки создают I/O, но защищают от использования повреждённых файлов.
4. **Планировщик:** P02 Chromium render и P05 montage ограничены *независимыми* локальными слотами, поэтому два тяжёлых процесса могут одновременно потреблять CPU/RAM одного сервера.
5. **Доступность:** один writer через `flock` защищает единый том. Реплики с раздельными томами не разделяют данные; горизонтальное масштабирование не достигнуто.

## Модель измерений

- Baseline cold: `timings_ms.prepare`, `snapshot`, `encode`, `qa`, `total` для неизменного двухклипового монтажа, повторить ≥10 раз; фиксировать CPU, размер MP4, FFmpeg version, высоту/FPS, присутствие аудио, warm-up и p50/p95.
- Cached: те же проверенные MP4, переходы и contract; проверить равенство `release_id` и SHA-256, ноль запусков FFmpeg и отсутствие нового каталога release.
- Miss: изменение исходного MP4, одобренной версии/ревизии, transition plan, style contract, порядка сцен, fps/height или encoder profile должно вызвать новый рендер, не silent cache hit.
- Security: P07 review reopening и повреждение release должны запрещать reuse; при отказе старый immutable MP4 не стирать.
- CI smoke — контроль корректности. Production benchmarking нужен отдельно после включения метрик; без доступа к сервису реальные Railway процентили неизвестны.

## Приоритетные продуктовые фичи

| Приоритет | Возможность | Что даёт | Сложность / риски | Проверяемый критерий |
|---|---|---|---|---|
| **1, реализуется в PR #19** | Проверенный cache-hit сборки | Повторный экспорт без FFmpeg; тот же MP4 | Низкая / устаревший источник | Cold-vs-warm, SHA, P07/P08/P10, no FFmpeg |
| **2, реализуется в PR #19** | Stage timing + cache telemetry | Находит фактические узкие места | Низкая / искажения под нагрузкой | stage ms в API/journal, p50/p95 в будущей телеметрии |
| **3, реализовано в PR #20** | Единый CPU/RAM resource governor для Chromium и FFmpeg | Предотвращает конкурирующие тяжёлые запуски и OOM | Средняя / очереди и отмена | параллельный render+montage не превышает выделенный budget |
| 4 | Инкрементальный кэш crossfade-runs | При изменении одной сцены пересобирает только затронутый сегмент | Высокая / A/V синхронность, границы | same audio/video durations, no discontinuity, меньше перекодированных кадров |
| **5, реализовано в PR #20** | Source-aware reuse рендера отдельной сцены | Пропускает CDP/Chromium при точном совпадении source fingerprint | Средняя / QA, P08 approval | unchanged source reuses verified version; policy drift causes miss |
| 6 | Протокол слоёв QA с golden frames + diff viewer (P11: API диффа готов, UI редактора ещё нет) | Удобнее находить отличия версий и ошибки текста/3D | Средняя / ложные срабатывания | 3+ реальные кадра и сопоставимый визуальный diff |
| 7 | Browser→encoder profiling и альтернативная raw-frame pipe | Снижает CPU/latency на большом FPS/4K | Высокая / memory, transport, цвет | benchmark CPU/heap/time с равным качеством; выбор только после PoC |
| 8 | Preflight ETA/ресурсный план | Директор знает ожидаемый размер и длительность рендера до запуска | Средняя / прогнозы | калиброванная ошибка прогноза и верхняя граница затрат |
| 9 | Preview render 360p/720p + final 1080p | Быстрая итерация художественных сцен | Средняя / несовпадение QA | отдельные профили, запрет approval draft за final |
| 10 | Postgres + object storage + lease/fencing | Реальная очередь для нескольких workers и горизонтальный scale | Очень высокая / migration и race | E2E kill/network-partition, единственный publish, ACID CAS |

**Реализовано после PR #19:** resource governor (#3) и scene-level render reuse (#5) в PR #20. Проверки используют FIFO очередь, сброс отменённых запросов, полный отпечаток P02/P08 и версионный QA. Это не distributed semaphore и не доказательство снижения CPU в production. Следующие кандидаты: golden frame visual diff (#6) и preview профили (#9); raw-frame transport (#7) только после профилирования.

Не включено в план без отдельного PoC: lossless concat copy как универсальное решение (недопустимы разные codecs, timebase или audio), неподтверждённое ускорение в процентах, увеличение реплик с локальным `flock`.
