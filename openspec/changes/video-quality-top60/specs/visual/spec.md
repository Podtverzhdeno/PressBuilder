# OpenSpec Top-60 / C. Типографика, камера, цвет и движение

> PROPOSED, не реализовано в рамках этой спецификации. P18 имеет data-only ядро; реальные анимации и blur — отдельная работа.

### Requirement M21 — Субтитры с динамической безопасной раскладкой

- **Тип:** Атомарная; **оценки Q/E/F/C/S/L:** 10/9/8/8/9/9; **зависимости:** P09,P20,P23; **статус:** PROPOSED.
- **Проблема и ценность:** Автоматические титры перекрывают смысловой объект, попадают под кнопки приложения и визуально дрожат на движущемся фоне.
- **Подробная реализация:** Из word-map формировать captions units, для каждого кадра измерять text bbox, object masks и platform-safe area. Размещать в одной из нескольких стабильных зон со штрафом за перескоки; реагировать на смену сцены, а не на каждый пиксель движения.
- **Контракт, безопасность и интеграция:** CaptionLayout_v1: cue IDs, font/license, glyph metrics, safe_rect, occlusion evidence, area penalties, pinned rasterizer version.
- **DoD и измерения:** В 16:9/9:16/1:1 для 6 сцен 0 закрытых лиц/CTA по эталонной разметке, недопустимых обрезок и jitter > согласованного порога; OCR/снимок mobile обязателен.
- **Негативные сценарии / риск:** Полностью автоматическое определение смысловых объектов ненадёжно; разрешённый ручной pin сильнее автолэйаута.
- **SDD-последовательность:** schema и physical limits → deterministic geometry/color/timebase planner → P06-scoped preview c source hashes → real Chromium/FFmpeg render A/B из лицензированных ресурсов → тест 16:9 и 9:16, human art review → opt-in flag, мониторинг и откат. Ни один алгоритм не объявляет «эстетически принято» по pixel-score.

### Requirement M22 — Кривые движения с ограничением jerk

- **Тип:** Атомарная; **оценки Q/E/F/C/S/L:** 9/9/8/9/9/9; **зависимости:** P18,P23; **статус:** PROPOSED.
- **Проблема и ценность:** Линейная анимация и резкие переломы ускорения производят ощущение шаблона, даже когда keyframes технически корректны.
- **Подробная реализация:** Расширить P18 easing до cubic Bezier с валидатором монотонности и ограничениями третьей производной jerk, плавности квазинеподвижных фрагментов и скорости камеры на рациональной frame grid.
- **Контракт, безопасность и интеграция:** MotionCurve_v2: normalized controls, keyframe PTS, velocity/accel/jerk caps, reduced_motion fallback, source scene revision.
- **DoD и измерения:** На 0/25/50/75/100% и на каждом кадре тестировать непрерывность скорости/ускорения; 0 overshoot за spatial bounds; сцену можно пересчитать детерминированно.
- **Негативные сценарии / риск:** Для динамичных экшен-сцен ограничения должны быть профилями, а не универсальным запретом резкой пластики.
- **SDD-последовательность:** schema и physical limits → deterministic geometry/color/timebase planner → P06-scoped preview c source hashes → real Chromium/FFmpeg render A/B из лицензированных ресурсов → тест 16:9 и 9:16, human art review → opt-in flag, мониторинг и откат. Ни один алгоритм не объявляет «эстетически принято» по pixel-score.

### Requirement M23 — Перцептуальное выравнивание цвета между сценами

- **Тип:** Атомарная; **оценки Q/E/F/C/S/L:** 9/8/7/7/9/9; **зависимости:** P03,P17,P21; **статус:** PROPOSED.
- **Проблема и ценность:** Экспозиция и цветовая температура соседних сцен скачут, единый LUT разрушает оттенки кожи и фирменные цвета.
- **Подробная реализация:** В нормализованном scene-linear working space оценивать нейтраль, luminance histograms, hue distribution и color gamut; строить ограниченные предложения экспозиции/WB/контраста между соседними verified кадрами, preserve brand swatches.
- **Контракт, безопасность и интеграция:** ColorMatch_v1: primaries/transfer flags, source SHA, target grade SHA, exposure/WB ranges, skin/brand protected masks.
- **DoD и измерения:** На размеченном A/B наборе 0 клиппинга в highlights, стабильность фирменного цвета в заданном ΔE-бюджете; если HDR/SDR неизвестен — fail closed.
- **Негативные сценарии / риск:** Histogram match не понимает художественный свет; неоднозначные кадры должны остаться ручной цветокоррекцией.
- **SDD-последовательность:** schema и physical limits → deterministic geometry/color/timebase planner → P06-scoped preview c source hashes → real Chromium/FFmpeg render A/B из лицензированных ресурсов → тест 16:9 и 9:16, human art review → opt-in flag, мониторинг и откат. Ни один алгоритм не объявляет «эстетически принято» по pixel-score.

### Requirement M24 — Интеллектуальный мультиформатный reframe

- **Тип:** Системная; **оценки Q/E/F/C/S/L:** 10/10/8/7/9/9; **зависимости:** P03,P20,P22,P24; **статус:** PROPOSED.
- **Проблема и ценность:** Горизонтальный ролик теряет героя, титры и CTA после простого central crop для Shorts/Reels.
- **Подробная реализация:** Создать saliency + face-free object track и stable focus anchor; сформировать отдельно versioned crop tracks для 16:9, 9:16 и 1:1. При конфликте в вертикали титры переносятся, а значимые объекты получают reveal/split-screen.
- **Контракт, безопасность и интеграция:** ReframePlan_v1: target aspect, per-shot salient_bbox, crop bezier, safe_rect, content SHA, manual lock.
- **DoD и измерения:** На 30 размеченных кадрах ключевой объект и текст полностью в safe zone для всех трёх выходов; нет frame-to-frame crop jitter и искажения aspect ratio.
- **Негативные сценарии / риск:** Object detection дорог и может промахнуться; ручной anchor обязателен, платформенные UI-safe zones версионируются.
- **SDD-последовательность:** schema и physical limits → deterministic geometry/color/timebase planner → P06-scoped preview c source hashes → real Chromium/FFmpeg render A/B из лицензированных ресурсов → тест 16:9 и 9:16, human art review → opt-in flag, мониторинг и откат. Ни один алгоритм не объявляет «эстетически принято» по pixel-score.

### Requirement M25 — Кинематографический конструктор движения 3D-камеры

- **Тип:** Системная; **оценки Q/E/F/C/S/L:** 9/8/6/7/8/8; **зависимости:** P01,P04,P18; **статус:** PROPOSED.
- **Проблема и ценность:** В сценах с 3D-объектами камера случайно крутится, не раскрывая главный объект или задачу.
- **Подробная реализация:** Ввести shot DSL (dolly, arc, orbit, crane, rack focus) с focal subject, depth range, easing и collision/frustum limits. Сначала строить preview camera path, затем sample и scene depth/occlusion check, только потом рендер.
- **Контракт, безопасность и интеграция:** CameraShot_v1: target_mesh_id, camera path knots, lens budget, keep-in-frame constraint, desired emotion as nonbinding tag.
- **DoD и измерения:** Рендер двух предметов с пятью camera moves: 100% focal target внутри frustum, safe motion, детерминированный PTS; reduced-motion оставляет статичную композицию.
- **Негативные сценарии / риск:** Добавление depth/focus зависит от реального renderer P01; визуально красивое движение нельзя сертифицировать только математикой.
- **SDD-последовательность:** schema и physical limits → deterministic geometry/color/timebase planner → P06-scoped preview c source hashes → real Chromium/FFmpeg render A/B из лицензированных ресурсов → тест 16:9 и 9:16, human art review → opt-in flag, мониторинг и откат. Ни один алгоритм не объявляет «эстетически принято» по pixel-score.

### Requirement M26 — Типографический QA с кириллицей и fallback-шрифтами

- **Тип:** Атомарная; **оценки Q/E/F/C/S/L:** 10/10/9/9/10/9; **зависимости:** P03,P04,P20; **статус:** PROPOSED.
- **Проблема и ценность:** Обрезанные русские слова, внезапная подмена гарнитуры или разный кернинг разрушают дорогую графику.
- **Подробная реализация:** Для каждого разрешённого font SHA и языка измерять shaped glyph cluster metrics, переносы, bbox, контраст и фрейм-позицию в Chromium. Шрифт не найден — явная ошибка или approved fallback с фиксацией новой метрики.
- **Контракт, безопасность и интеграция:** TypographyProof_v1: font SHA/license, Unicode coverage, measured glyph boxes, safe rectangle, renderer hash, screenshot SHA.
- **DoD и измерения:** 100 русско-английских длинных строк, дефисов и чисел должны отображаться без missing glyph, clipping и reflow drift на Docker/Chromium; шрифты в runtime pinned.
- **Негативные сценарии / риск:** Не использовать OCR для доказательства художественного качества; шрифты требуют лицензии, нельзя неявно скачивать их в build.
- **SDD-последовательность:** schema и physical limits → deterministic geometry/color/timebase planner → P06-scoped preview c source hashes → real Chromium/FFmpeg render A/B из лицензированных ресурсов → тест 16:9 и 9:16, human art review → opt-in flag, мониторинг и откат. Ни один алгоритм не объявляет «эстетически принято» по pixel-score.

### Requirement M27 — Адаптивная дизайн-система для титров и графики

- **Тип:** Системная; **оценки Q/E/F/C/S/L:** 9/9/8/9/9/9; **зависимости:** P04,P20,P21; **статус:** PROPOSED.
- **Проблема и ценность:** Ручная правка каждого кадра разных размеров дорогая; одни и те же отступы на мобильном экране работают плохо.
- **Подробная реализация:** Расширить style contract constraint layout: grid zones, typography scale, min contrast, whitespace, icon strokes, responsive breakpoints по аспектам. Минимизировать изменение визуальной идентичности между версиями.
- **Контракт, безопасность и интеграция:** LayoutTokens_v1: color/font/spacing SHA, scale rules, scene overrides, responsive safe_rect, precedence and reasons.
- **DoD и измерения:** Шесть сцен для 3 форматов используют те же бренд-токены, исключают 0 перекрытий по geometry checks и разные размеры шрифтов без осознанного override.
- **Негативные сценарии / риск:** Сильные ограничения могут лишить режиссёра композиционной свободы; арт-директор допускает мотивированное исключение.
- **SDD-последовательность:** schema и physical limits → deterministic geometry/color/timebase planner → P06-scoped preview c source hashes → real Chromium/FFmpeg render A/B из лицензированных ресурсов → тест 16:9 и 9:16, human art review → opt-in flag, мониторинг и откат. Ни один алгоритм не объявляет «эстетически принято» по pixel-score.

### Requirement M28 — Предметные маски и параллакс с глубинной проверкой

- **Тип:** Атомарная; **оценки Q/E/F/C/S/L:** 8/8/6/6/7/7; **зависимости:** P01,P18,P22; **статус:** PROPOSED.
- **Проблема и ценность:** 2D-вставка выглядит наклейкой без настоящего взаимодействия с передним/задним планом.
- **Подробная реализация:** Использовать разрешённую модель segmentation/depth для owned shot или 3D depth buffer; layered parallax только на утверждённых assets, soft-edge masks и per-frame temporal smoothing. Не считать segmentation доказательством идентичности лица.
- **Контракт, безопасность и интеграция:** LayerMask_v1: mask SHA, origin frame, depth rank, transform track, re-evaluate on shot change, approval pointer.
- **DoD и измерения:** Параллакс двух объектов за 4 секунды без заметной рваной каймы на 0/25/50/75/100% golden кадров; невидимые области не дорисовывать без разрешения.
- **Негативные сценарии / риск:** Дорогая GPU-модель, ошибки масок и privacy, поэтому не входит в быстрый MVP; отключается per clip.
- **SDD-последовательность:** schema и physical limits → deterministic geometry/color/timebase planner → P06-scoped preview c source hashes → real Chromium/FFmpeg render A/B из лицензированных ресурсов → тест 16:9 и 9:16, human art review → opt-in flag, мониторинг и откат. Ни один алгоритм не объявляет «эстетически принято» по pixel-score.

### Requirement M29 — Палитра переходов по форме и смысловому действию

- **Тип:** Атомарная; **оценки Q/E/F/C/S/L:** 9/9/8/9/9/8; **зависимости:** P05,P17,P21; **статус:** PROPOSED.
- **Проблема и ценность:** Случайные zoom/glitch переходы выглядят эффектно одиночно, но мешают истории и режут читабельность.
- **Подробная реализация:** Составить каталог 8 ограниченных transitions: hard cut, dissolve, match shape, light reveal, masked wipe и другие с формальными требованиями к контексту. Рекомендатель выбирает простейший подходящий, а не самый заметный.
- **Контракт, безопасность и интеграция:** TransitionGrammar_v1: source boundary hashes, shot intent, duration frames, allowed class, accessibility limit, reviewer note.
- **DoD и измерения:** На 25 стыках отсутствующие shape/lighting prerequisites запрещают match effect; ни один protected subtitle не перекрывается, нет опасных вспышек.
- **Негативные сценарии / риск:** Не использовать «украшения ради украшений»: user override требует ручного A/B, базовый hard-cut всегда безопасный fallback.
- **SDD-последовательность:** schema и physical limits → deterministic geometry/color/timebase planner → P06-scoped preview c source hashes → real Chromium/FFmpeg render A/B из лицензированных ресурсов → тест 16:9 и 9:16, human art review → opt-in flag, мониторинг и откат. Ни один алгоритм не объявляет «эстетически принято» по pixel-score.

### Requirement M30 — Размытие по реальной скорости без мерцания

- **Тип:** Атомарная; **оценки Q/E/F/C/S/L:** 8/8/7/8/9/8; **зависимости:** P18,P23; **статус:** PROPOSED.
- **Проблема и ценность:** Motion blur с постоянным радиусом замыливает текст и стационарные объекты.
- **Подробная реализация:** Считать motion vector по keyframe curve и bounded shutter angle, использовать temporal accumulation только на движущихся слоях. Текст/UI/лица и reduced-motion — protected masks; adaptive subframe sampling с CPU budget.
- **Контракт, безопасность и интеграция:** BlurPolicy_v1: frame PTS, velocity, max_kernel, shutter angle, protected layer IDs, fallback=none.
- **DoD и измерения:** Рендерить кадры в 0/25/50/75/100% при двух скоростях и reduced mode: неподвижный текст не теряет MTF, output детерминирован; no CPU budget overshoot.
- **Негативные сценарии / риск:** Потребуются дополнительные рендер-проходы; oversampling может быть дороже выигрыша, нужна профилировка на Railway CPU.
- **SDD-последовательность:** schema и physical limits → deterministic geometry/color/timebase planner → P06-scoped preview c source hashes → real Chromium/FFmpeg render A/B из лицензированных ресурсов → тест 16:9 и 9:16, human art review → opt-in flag, мониторинг и откат. Ни один алгоритм не объявляет «эстетически принято» по pixel-score.

