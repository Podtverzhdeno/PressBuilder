# TOP-60 — качество и эффективность видеомонтажа в PressBuilder

> Дата: 2026-11-02. **Статус: только спецификация / proposed.** Оценки — ранжированные инженерные гипотезы, а не измеренный рост качества или производительности. Реализованные P01–P18 не переобъявляются готовыми заново: оцениваются именно следующие функциональные пробелы. Главный реестр `docs/top60-montage-registry.json`; подробное ТЗ для каждого ID — `openspec/changes/video-quality-top60/specs/*/spec.md`.

## Строгая модель ранжирования

Шесть оцениваемых измерений от **0 (невыгодно)** до **10 (отлично)**. **Q** — инкрементальный выигрыш качества относительно *текущего* PressBuilder; **E** — возможная экономия ручного времени на типовом 6-сценном ролике; **F** — реализуемость текущим стеком (выше = проще/меньше R&D); **C** — выгода по CPU/GPU/API/storage, владению и поддержке (выше = дешевле); **S** — надёжность, лицензии и обратимость (выше = безопаснее); **L** — повторное использование в остальных сценах/проектах (выше = системнее). Не путать Q с «крутизной» эффекта и C с количеством GPU.

**Итог = 0.30 Q + 0.25 E + 0.20 F + 0.10 C + 0.10 S + 0.05 L**, округление до 0.01. При равенстве — Q → E → F → ID. Никакой экспертный score не доказывает экономию, эффект или соответствие стандарту до baseline+A/B+CI. Любой риск лицензии, доступа, синтетического факта, опасной вспышки и недостоверного источника действует как hard gate, а не как компенсируемый маленький штраф.

**Tier S** ≥9.40, **A** 8.80–9.39, **B** 8.20–8.79, **C** <8.20. Tier не отменяет зависимости: W0/W1 архитектурно открывают часть высокорейтинговых задач W2+. `W0` основа; `W1` быстрый эффект на реальном видео; `W2` сложнее, но полезно; `W3` зрелый контур; `W4` экспериментально/дорого.

## Строгий единый рейтинг

| # | ID | Функция | Тип | Q/E/F/C/S/L | /10 | Tier | Волна | Срок-оценка |
|---:|---|---|---|---|---:|:---:|:---:|---|
| 1 | [M40](../openspec/changes/video-quality-top60/specs/content/spec.md) | Director briefs как исполняемые типизированные контракты | Системная | 10/10/9/9/10/10 | **9.70** | S | W0 | 2–5 дн |
| 2 | [M50](../openspec/changes/video-quality-top60/specs/pipeline/spec.md) | Журнал задач с восстановлением, отменой и транзакционным release | Системная | 10/10/9/9/10/10 | **9.70** | S | W0 | 2–5 дн |
| 3 | [M51](../openspec/changes/video-quality-top60/specs/quality/spec.md) | Единый QC-кокпит с покадровыми исправлениями | Системная | 10/10/9/9/10/10 | **9.70** | S | W1 | 2–5 дн |
| 4 | [M58](../openspec/changes/video-quality-top60/specs/quality/spec.md) | SLO качества + производительности на одном релизном шлюзе | Системная | 10/10/9/9/10/10 | **9.70** | S | W0 | 2–5 дн |
| 5 | [M26](../openspec/changes/video-quality-top60/specs/visual/spec.md) | Типографический QA с кириллицей и fallback-шрифтами | Атомарная | 10/10/9/9/10/9 | **9.65** | S | W1 | 2–5 дн |
| 6 | [M42](../openspec/changes/video-quality-top60/specs/pipeline/spec.md) | Моментальный preview с proxy → master согласованностью | Системная | 10/10/9/9/9/10 | **9.60** | S | W1 | 2–5 дн |
| 7 | [M41](../openspec/changes/video-quality-top60/specs/pipeline/spec.md) | Инкрементальный рендер через контент-адресный DAG | Системная | 10/10/8/9/10/10 | **9.50** | S | W2 | 1–2 нед |
| 8 | [M13](../openspec/changes/video-quality-top60/specs/audio/spec.md) | Финальное микширование с EBU-профилями и автодакингом | Системная | 10/10/9/8/9/9 | **9.45** | S | W1 | 2–5 дн |
| 9 | [M32](../openspec/changes/video-quality-top60/specs/content/spec.md) | Контент-адресный реестр медиа, прав и происхождения | Системная | 10/9/9/9/10/10 | **9.45** | S | W0 | 2–5 дн |
| 10 | [M54](../openspec/changes/video-quality-top60/specs/quality/spec.md) | Детектор фоточувствительных вспышек и безопасный motion-mode | Системная | 10/9/9/9/10/10 | **9.45** | S | W1 | 2–5 дн |
| 11 | [M05](../openspec/changes/video-quality-top60/specs/editorial/spec.md) | Транзакционный ripple edit и групповой undo | Атомарная | 9/10/9/9/10/10 | **9.40** | S | W1 | 2–5 дн |
| 12 | [M56](../openspec/changes/video-quality-top60/specs/quality/spec.md) | Golden-frame и PCM регрессии без шумных diff | Системная | 9/10/9/9/10/10 | **9.40** | S | W1 | 2–5 дн |
| 13 | [M11](../openspec/changes/video-quality-top60/specs/audio/spec.md) | Достоверная покомпонентная синхронизация слов | Атомарная | 10/10/8/8/9/10 | **9.30** | A | W1 | 1–2 нед |
| 14 | [M52](../openspec/changes/video-quality-top60/specs/quality/spec.md) | Мультиметр звука и разборчивости речи | Атомарная | 10/9/9/8/10/9 | **9.30** | A | W1 | 2–5 дн |
| 15 | [M01](../openspec/changes/video-quality-top60/specs/editorial/spec.md) | Единый рациональный монтажный граф | Системная | 10/10/7/8/10/10 | **9.20** | A | W0 | 2–4 нед |
| 16 | [M17](../openspec/changes/video-quality-top60/specs/audio/spec.md) | Умная работа с паузами и вдохами | Атомарная | 9/10/9/9/9/8 | **9.20** | A | W1 | 2–5 дн |
| 17 | [M24](../openspec/changes/video-quality-top60/specs/visual/spec.md) | Интеллектуальный мультиформатный reframe | Системная | 10/10/8/7/9/9 | **9.15** | A | W2 | 1–2 нед |
| 18 | [M18](../openspec/changes/video-quality-top60/specs/audio/spec.md) | Контроль дрейфа аудио/видео вплоть до sample | Системная | 10/9/8/8/10/10 | **9.15** | A | W1 | 1–2 нед |
| 19 | [M44](../openspec/changes/video-quality-top60/specs/pipeline/spec.md) | Настоящая параллельная шести-сценная оркестрация | Системная | 10/10/7/8/9/10 | **9.10** | A | W2 | 2–4 нед |
| 20 | [M59](../openspec/changes/video-quality-top60/specs/quality/spec.md) | Доступные субтитры и проверка точности смысла | Системная | 9/9/9/9/10/9 | **9.10** | A | W1 | 2–5 дн |
| 21 | [M39](../openspec/changes/video-quality-top60/specs/content/spec.md) | Изготовление коротких версий без искажения смысла | Системная | 9/10/8/9/9/9 | **9.05** | A | W2 | 1–2 нед |
| 22 | [M03](../openspec/changes/video-quality-top60/specs/editorial/spec.md) | Монтаж по утверждённым фразам | Системная | 10/9/8/8/9/9 | **9.00** | A | W2 | 1–2 нед |
| 23 | [M21](../openspec/changes/video-quality-top60/specs/visual/spec.md) | Субтитры с динамической безопасной раскладкой | Атомарная | 10/9/8/8/9/9 | **9.00** | A | W2 | 1–2 нед |
| 24 | [M55](../openspec/changes/video-quality-top60/specs/quality/spec.md) | Мобильный тест читабельности и безопасных зон | Атомарная | 10/9/8/8/9/9 | **9.00** | A | W2 | 1–2 нед |
| 25 | [M15](../openspec/changes/video-quality-top60/specs/audio/spec.md) | Непрерывный разговор через реальные аудиохэндлы J/L | Атомарная | 10/9/8/8/9/8 | **8.95** | A | W2 | 1–2 нед |
| 26 | [M08](../openspec/changes/video-quality-top60/specs/editorial/spec.md) | Параллельные монтажные версии и A/B-матрица | Системная | 9/9/9/8/9/9 | **8.90** | A | W2 | 2–5 дн |
| 27 | [M45](../openspec/changes/video-quality-top60/specs/pipeline/spec.md) | Компилятор безопасного графа FFmpeg-фильтров | Атомарная | 9/9/8/9/10/9 | **8.90** | A | W2 | 1–2 нед |
| 28 | [M47](../openspec/changes/video-quality-top60/specs/pipeline/spec.md) | Побайтово воспроизводимая инструментальная цепочка | Системная | 9/9/8/8/10/10 | **8.85** | A | W0 | 1–2 нед |
| 29 | [M07](../openspec/changes/video-quality-top60/specs/editorial/spec.md) | Покадровый редактор стыков и J/L со слышимым предпросмотром | Атомарная | 10/9/7/8/9/9 | **8.80** | A | W3 | 2–4 нед |
| 30 | [M48](../openspec/changes/video-quality-top60/specs/pipeline/spec.md) | Слияние параллельных редакторских намерений без потери данных | Системная | 9/10/7/7/10/10 | **8.80** | A | W3 | 2–4 нед |
| 31 | [M22](../openspec/changes/video-quality-top60/specs/visual/spec.md) | Кривые движения с ограничением jerk | Атомарная | 9/9/8/9/9/9 | **8.80** | A | W3 | 1–2 нед |
| 32 | [M27](../openspec/changes/video-quality-top60/specs/visual/spec.md) | Адаптивная дизайн-система для титров и графики | Системная | 9/9/8/9/9/9 | **8.80** | A | W3 | 1–2 нед |
| 33 | [M12](../openspec/changes/video-quality-top60/specs/audio/spec.md) | Деликатная очистка голоса и двойной A/B-спектр | Атомарная | 9/10/8/7/8/9 | **8.75** | B | W3 | 1–2 нед |
| 34 | [M29](../openspec/changes/video-quality-top60/specs/visual/spec.md) | Палитра переходов по форме и смысловому действию | Атомарная | 9/9/8/9/9/8 | **8.75** | B | W3 | 1–2 нед |
| 35 | [M46](../openspec/changes/video-quality-top60/specs/pipeline/spec.md) | Адаптивное качество рендера под ресурсный бюджет | Атомарная | 9/9/8/9/9/8 | **8.75** | B | W3 | 1–2 нед |
| 36 | [M31](../openspec/changes/video-quality-top60/specs/content/spec.md) | Доказательные текстовые утверждения и fact overlays | Системная | 10/8/7/8/10/10 | **8.70** | B | W3 | 2–4 нед |
| 37 | [M04](../openspec/changes/video-quality-top60/specs/editorial/spec.md) | Карта внимания, ритма и смысловых кульминаций | Системная | 9/9/8/9/8/9 | **8.70** | B | W3 | 1–2 нед |
| 38 | [M09](../openspec/changes/video-quality-top60/specs/editorial/spec.md) | Типизированная библиотека режиссёрских паттернов | Атомарная | 8/9/9/9/9/8 | **8.65** | B | W3 | 2–5 дн |
| 39 | [M43](../openspec/changes/video-quality-top60/specs/pipeline/spec.md) | Предсказание цены и длительности до запуска рендера | Атомарная | 8/9/9/9/9/8 | **8.65** | B | W3 | 2–5 дн |
| 40 | [M49](../openspec/changes/video-quality-top60/specs/pipeline/spec.md) | Умный smart-render без повторного кодирования неизменённых фрагментов | Атомарная | 9/9/7/9/8/9 | **8.50** | B | W3 | 2–4 нед |
| 41 | [M14](../openspec/changes/video-quality-top60/specs/audio/spec.md) | Просодический ритм вместо резки по BPM | Атомарная | 9/9/7/8/9/8 | **8.45** | B | W3 | 2–4 нед |
| 42 | [M34](../openspec/changes/video-quality-top60/specs/content/spec.md) | Лицензированный B-roll recommender по смысловому слоту | Системная | 9/9/7/7/9/9 | **8.40** | B | W3 | 2–4 нед |
| 43 | [M20](../openspec/changes/video-quality-top60/specs/audio/spec.md) | Произношение имён и терминов в озвучке | Атомарная | 8/9/8/8/9/8 | **8.35** | B | W1 | 1–2 нед |
| 44 | [M02](../openspec/changes/video-quality-top60/specs/editorial/spec.md) | Независимый режиссёрский совет A/B | Системная | 9/9/7/7/8/9 | **8.30** | B | W3 | 2–4 нед |
| 45 | [M33](../openspec/changes/video-quality-top60/specs/content/spec.md) | Видеопоиск по смыслу и временному отрезку | Системная | 9/9/7/7/8/9 | **8.30** | B | W3 | 2–4 нед |
| 46 | [M38](../openspec/changes/video-quality-top60/specs/content/spec.md) | Мультикритериальный best-take selector | Системная | 9/9/7/7/8/8 | **8.25** | B | W3 | 2–4 нед |
| 47 | [M06](../openspec/changes/video-quality-top60/specs/editorial/spec.md) | Ограничительный solver связности шести сцен | Системная | 9/8/7/8/9/8 | **8.20** | B | W3 | 2–4 нед |
| 48 | [M23](../openspec/changes/video-quality-top60/specs/visual/spec.md) | Перцептуальное выравнивание цвета между сценами | Атомарная | 9/8/7/7/9/9 | **8.15** | C | W4 | 2–4 нед |
| 49 | [M53](../openspec/changes/video-quality-top60/specs/quality/spec.md) | Перцептуальное качество после экспорта и обнаружение banding | Атомарная | 9/8/7/7/9/9 | **8.15** | C | W4 | 2–4 нед |
| 50 | [M57](../openspec/changes/video-quality-top60/specs/quality/spec.md) | Арт-оценка качества с калибровкой человеческих судей | Системная | 9/8/7/7/9/9 | **8.15** | C | W4 | 2–4 нед |
| 51 | [M60](../openspec/changes/video-quality-top60/specs/quality/spec.md) | Профессиональный round-trip монтажного проекта (OTIO) | Системная | 8/9/7/7/9/9 | **8.10** | C | W4 | 2–4 нед |
| 52 | [M16](../openspec/changes/video-quality-top60/specs/audio/spec.md) | Семантические звуковые акценты по лицензированным ассетам | Атомарная | 8/8/8/8/9/7 | **8.05** | C | W4 | 1–2 нед |
| 53 | [M19](../openspec/changes/video-quality-top60/specs/audio/spec.md) | Шины и stems как настоящий монтажный микшер | Системная | 8/8/8/8/8/8 | **8.00** | C | W4 | 1–2 нед |
| 54 | [M35](../openspec/changes/video-quality-top60/specs/content/spec.md) | Поиск визуальных повторов и смыслового разнообразия | Атомарная | 8/8/8/8/8/8 | **8.00** | C | W4 | 1–2 нед |
| 55 | [M37](../openspec/changes/video-quality-top60/specs/content/spec.md) | Семантическая проверка предмета и действия без идентификации личности | Атомарная | 8/8/8/7/9/8 | **8.00** | C | W4 | 1–2 нед |
| 56 | [M10](../openspec/changes/video-quality-top60/specs/editorial/spec.md) | Аудит пространственной грамматики и направления взгляда | Атомарная | 8/8/7/8/9/8 | **7.90** | C | W4 | 2–4 нед |
| 57 | [M30](../openspec/changes/video-quality-top60/specs/visual/spec.md) | Размытие по реальной скорости без мерцания | Атомарная | 8/8/7/8/9/8 | **7.90** | C | W4 | 2–4 нед |
| 58 | [M25](../openspec/changes/video-quality-top60/specs/visual/spec.md) | Кинематографический конструктор движения 3D-камеры | Системная | 9/8/6/7/8/8 | **7.80** | C | W4 | R&D ≥1–2 мес |
| 59 | [M28](../openspec/changes/video-quality-top60/specs/visual/spec.md) | Предметные маски и параллакс с глубинной проверкой | Атомарная | 8/8/6/6/7/7 | **7.25** | C | W4 | R&D ≥1–2 мес |
| 60 | [M36](../openspec/changes/video-quality-top60/specs/content/spec.md) | Контролируемое генеративное расширение клипа с provenance | Атомарная | 8/7/5/5/6/8 | **6.65** | C | W4 | R&D ≥1–2 мес |

Оценки трудозатрат — **очень грубые предположения в единицах одного подготовленного разработчика**, без включения стоимости лицензий/инфраструктуры/отдельного review. Это не обещание календарных сроков. Действительные сроки определяются PoC и resource plan.

## Разделение на волны и критические зависимости

| Волна | Цель | Ключевой порядок |
|---|---|---|
| **W0** | Чистая основа аудита и правильных данных | M32 registry → M01 canonical graph → M40 typed briefs; параллельно M47 deterministic builds, M50 durable ledger, M58 release gates |
| **W1** | Измеримый прирост качества за минимальную цену | M26 кириллица; M13 loudness/ducking; M51 timecoded QC; M54 flash safety; M42 proxy; M11 alignment; M52 speech QC; M17 паузы; M56 golden frames; M05 ripple |
| **W2** | Ценность монтажа и multi-platform | source-pinned semantic edits M03 → M21 subtitles/M24 reframe → M15 real J/L → M08 variants; M41 render DAG и M44 scheduler после M01/M50 |
| **W3** | Advanced production, средства для сильного редактора | smart render M49, B-roll M34, semantic search M33, color M23, export M60; отдельные PoC и profiling |
| **W4** | Дорогостоящие экспериментальные эффекты | segmentation M28, generate extend M36, глубокая камера M25; после метрик пользы и лицензий, без прод-флага по умолчанию |

**Волна — порядок технической готовности, не сортировка полезности.** Для каждого элемента статус PROPOSED. Один инженер не выполняет 60 задач «параллельно». Присваивать сценным агентам самостоятельные файлы/lease и не разрешать self-approval.

## Какие идеи сознательно не попали в TOP-60

| Кандидат | Почему не прошёл строгий отбор |
|---|---|
| Повсеместные glitch/zoom transitions | Мало пользы для смысла и читабельности; повышают риск мерцания |
| Безусловный face-swap | Правовые, приватностные и репутационные риски без повышения монтажа |
| Автовыпуск без human approval | Разрушает границу между черновиком и доказанным результатом |
| Автоскачивание картинок из поисковика | Неясные права, отсутствие происхождения и невозможность воспроизводимости |
| Генерация B-roll из свободного prompt как основа каждого кадра | Дорого и непредсказуемо; часто ухудшает фактическую достоверность |
| «Профессиональность 97%» по одному CLIP score | Не существует проверенной общей метрики качества режиссуры |
| Неограниченный neural upscaler каждого кадра | Увеличивает CPU/GPU и способен дорисовать фактически несуществующие детали |
| Генерация музыки в любой стилистике без rights review | Copyright и происхождение материала нельзя выводить из промпта |
| Массовая загрузка GPU-моделей на Railway без бюджетирования | Цена/время/VRAM не соответствуют коротким шестисценным роликам |
| Экспорт в десятки форматов до стабилизации canonical graph | Выше риск рассинхрона и поддержки, чем польза для первого production milestone |

## Научно-технические и продуктовые ориентиры (проверены по первоисточникам)

- **Premiere Pro (сентябрь 2026)**: Paper Edit собирает rough cut из выделенного текста транскрипта — аргумент за M03, не доказательство пользы нашего прототипа. https://helpx.adobe.com/premiere/desktop/edit-projects/edit-video-using-text-based-editing/create-a-sequence-with-paper-edit.html
- **Premiere Auto Reframe (апрель 2026)**: контроль рефрейминга разных aspect ratios — ориентир M24. https://helpx.adobe.com/premiere/desktop/add-video-effects/commonly-used-effects/auto-reframe-overview.html
- **DaVinci Resolve 21/21.1 (2026)**: content search, AI editing и motion keyframes показывают зрелость класса функций; наше MCP+source attestation — отдельный архитектурный выбор. https://www.blackmagicdesign.com/products/davinciresolve/whatsnew/
- **FFmpeg official filter docs**: ebur128/loudnorm, silencedetect, libvmaf и video analysis — проверяемые примитивы для M13/M17/M45/M53. Конкретный образ обязан содержать реально доступные фильтры. https://ffmpeg.org/ffmpeg-filters.html
- **EBU R128 v5 (2023)**: -23 LUFS относится к указанному broadcast-стандарту; online presets нельзя автоматически приравнивать к нему. https://tech.ebu.ch/publications/r128
- **OpenTimelineIO**: interchange формата editing cuts, а не контейнер самих аудио/видеофайлов; источник M60. https://opentimelineio.readthedocs.io/en/latest/
- **WhisperX**: word alignment/VAD/diarization с известными ограничениями на числа и overlap — кандидат R&D M11, требует PoC RU/EN. https://github.com/m-bain/whisperX
- **Netflix VMAF (обновление моделей v1 2026)**: full-reference video metric; не измеряет художественную ценность сюжета. https://github.com/Netflix/vmaf/blob/master/resource/doc/models_v1.md
- **W3C WCAG 2.2, SC 2.3.1**: учитывает частоту, площадь, красные вспышки и яркость; простое правило «до 3 Hz» недостаточно. https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html

## Границы подтверждения

Подтверждены: существование названных алгоритмов/форматов по открытым первоисточникам; текущие репозиторные статусы P15–P24; наличие ровно 60 предложенных спецификаций. **Не подтверждены**: коэффициенты повышения качества, сокращения расходов/времени, юридическое покрытие конкретного ассета и реальная инженерная стоимость. Для закрытия функции требуются замеры на одинаковых шести сценах, полный SHA-трейс, тесты обязательных негативных случаев и независимое творческое ревью. Не переносить в `main` фичи на основании этой таблицы.
