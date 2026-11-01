# OpenSpec Top-60 / D. Доказательный контент и умная работа с ассетами

> PROPOSED. Строгая граница между подсказкой ИИ и доказанным правом/достоверностью. Полезность измерять на реальных редакторских задачах, не только точностью эмбеддингов.

### Requirement M31 — Доказательные текстовые утверждения и fact overlays

- **Тип:** Системная; **оценки Q/E/F/C/S/L:** 10/8/7/8/10/10; **зависимости:** P07,P10,P16,P22,P23; **статус:** PROPOSED.
- **Проблема и ценность:** Научный/финансовый ролик может выглядеть безупречно, но показывать неподтверждённые цифры, вырванные цитаты и вымышленные подписи.
- **Архитектура / реализация:** Завести Claim Ledger: claim_id, текст, owner-approved evidence URI/документ, точный source span, редакторская версия, timecode в титре. Перед render требовать evidence для чисел и внешних фактов, а не слепое принятие LLM-придуманных ссылок.
- **Контракт, provenance и область доступа:** Claims_v1: immutable evidence SHA, excerpt range, license/privacy class, rendered overlay id, reviewer outcome; внешние URL не скачиваются по генеративной подсказке.
- **Проверка эффекта и DoD:** На 20 фактических карточках 100% numeric overlays имеют доказательство и исходный контекст; замена документа-инвалидация, тест без источника помечает BLOCKED, не создаёт факт.
- **Негативный случай / trade-off:** Источник может устареть, не все кадры содержат проверяемые факты; нужна ручная юридическая/редакторская оценка, не автоматическая «истина».
- **SDD и интеграционные вехи:** approved source & rights inventory → versioned pure search/planner → typed MCP/REST with project-scoped ACL → human preview/revisioned approval → reproducible Docker six-scene test + timecoded audit → staged rollout. Embedding/model score и synthesized media не могут стать фактом, лицензией или самостоятельным разрешением публикации.

### Requirement M32 — Контент-адресный реестр медиа, прав и происхождения

> **Частичный код M32-R01:** только одобренные P08 MP4 → SHA/approval-pinned catalog, директорское заявление о правах, отзыв, expiry/scene/allowed-use gate, MCP/REST. Всё ещё отсутствуют юридически проверенные лицензии, реальные загрузки иных типов ассетов, физический enforcement в рендерере, independent reviewer и A/B/проверка всех шести сцен. Не считать M32 завершённой. [Документация](../../../../../docs/M32_MEDIA_CATALOG.md).


- **Тип:** Системная; **оценки Q/E/F/C/S/L:** 10/9/9/9/10/10; **зависимости:** P01,P08,P22,P24; **статус:** PROPOSED.
- **Проблема и ценность:** Быстрая сборка из чужих картинок и SFX несёт риски авторских прав, устаревших лицензий и случайной замены файла.
- **Архитектура / реализация:** Каждый импорт превращать в immutable MediaAsset (SHA-256 bytes, owner, grant scope, attribution, license, expiry, codec, duration, color-space, signed approval). Контент хранить без доверия к filename/URL; policy engine запрещает несоответствующее использование.
- **Контракт, provenance и область доступа:** AssetRegistry_v1: content_hash, consent/license proof, provenance chain, project scope, expiry, technical scan, immutable audit record.
- **Проверка эффекта и DoD:** 100 разных imports и 10 конфликтующих файлов: два одинаковых SHA дедуплицируются, чужой/истёкший asset не доходит до рендера; выпуск требует полную цепочку прав.
- **Негативный случай / trade-off:** Лицензии нельзя оценивать только по строке SPDX; нужен утверждённый legal policy, удаление/отзыв rights приводит к fail closed.
- **SDD и интеграционные вехи:** approved source & rights inventory → versioned pure search/planner → typed MCP/REST with project-scoped ACL → human preview/revisioned approval → reproducible Docker six-scene test + timecoded audit → staged rollout. Embedding/model score и synthesized media не могут стать фактом, лицензией или самостоятельным разрешением публикации.

### Requirement M33 — Видеопоиск по смыслу и временному отрезку

- **Тип:** Системная; **оценки Q/E/F/C/S/L:** 9/9/7/7/8/9; **зависимости:** P22,P23; **статус:** PROPOSED.
- **Проблема и ценность:** Монтажёр тратит время на ручной просмотр длинных ассетов, хотя нужен один двухсекундный момент.
- **Архитектура / реализация:** По локально разрешённым MP4 строить segmented index: scene boundaries, OCR text, speech words, object descriptors, embeddings по выбранным кадрам. По запросу возвращать точные start/end PTS и real preview strip, не просто имя файла.
- **Контракт, provenance и область доступа:** SemanticIndex_v1: asset SHA, codec metadata, chunk PTS, model/hash, text/visual features, ACL and license scope; нет чужого cross-project retrieval.
- **Проверка эффекта и DoD:** На 50 вручную размеченных поисковых запросах замерить top5 recall и затраты поиска, false suggestion must not become insert automatically; missing asset hash invalidates index.
- **Негативный случай / trade-off:** GPU/embeddings могут обойтись дороже ручного поиска на маленьких проектах; начинать с ffprobe+transcript и add-on индекса.
- **SDD и интеграционные вехи:** approved source & rights inventory → versioned pure search/planner → typed MCP/REST with project-scoped ACL → human preview/revisioned approval → reproducible Docker six-scene test + timecoded audit → staged rollout. Embedding/model score и synthesized media не могут стать фактом, лицензией или самостоятельным разрешением публикации.

### Requirement M34 — Лицензированный B-roll recommender по смысловому слоту

- **Тип:** Системная; **оценки Q/E/F/C/S/L:** 9/9/7/7/9/9; **зависимости:** P16,P22,P24; **статус:** PROPOSED.
- **Проблема и ценность:** Вставленные кадры часто иллюстрируют случайное слово вместо конкретной мысли и вводят ложный контекст.
- **Архитектура / реализация:** Из approved script выделить смысловые цели; искать кандидаты только среди P32-реестра. Для каждой пары speech span ↔ B-roll вычислять relevance, novelty и risk-of-contradiction; выбирать тонкие 1–3 сек слоты с ручным утверждением.
- **Контракт, provenance и область доступа:** BrollProposal_v1: cue_id, asset_id/SHA/license, start/end PTS, justification, claim_link, candidate rank, must_review=true.
- **Проверка эффекта и DoD:** На 20 зафиксированных пар «фраза—кадр» 0 ассетов без прав, а намеренно нерелевантные footage не становятся READY; оценить полезность blind с редактором.
- **Негативный случай / trade-off:** Embedding relevance не доказывает фактическую связь; модели могут предлагать ложный контекст, политика безопасности прежде score.
- **SDD и интеграционные вехи:** approved source & rights inventory → versioned pure search/planner → typed MCP/REST with project-scoped ACL → human preview/revisioned approval → reproducible Docker six-scene test + timecoded audit → staged rollout. Embedding/model score и synthesized media не могут стать фактом, лицензией или самостоятельным разрешением публикации.

### Requirement M35 — Поиск визуальных повторов и смыслового разнообразия

- **Тип:** Атомарная; **оценки Q/E/F/C/S/L:** 8/8/8/8/8/8; **зависимости:** P03,P16,P22; **статус:** PROPOSED.
- **Проблема и ценность:** Видеоряд выглядит как один шаблон: близкие кадры, одни и те же движения и карточки повторяются.
- **Архитектура / реализация:** Перцептуальные pHash/embedding векторы для approved кадров + shot composition tags; clustering ищет дубликаты и серии почти одинаковых сцен. В качестве замены предлагает более редкий тип композиции из разрешённой библиотеки.
- **Контракт, provenance и область доступа:** ShotDiversity_v1: hashed shot IDs, cluster ID, known visual motifs, sample timing и reason.
- **Проверка эффекта и DoD:** На 30 кадровых парах near-duplicates найдено подавляющее большинство после калибровки threshold; deliberate refrain не удаляется без ручной пометки.
- **Негативный случай / trade-off:** Похожесть изображений не равна стилистической ошибке; повтор может быть осознанным мотивом.
- **SDD и интеграционные вехи:** approved source & rights inventory → versioned pure search/planner → typed MCP/REST with project-scoped ACL → human preview/revisioned approval → reproducible Docker six-scene test + timecoded audit → staged rollout. Embedding/model score и synthesized media не могут стать фактом, лицензией или самостоятельным разрешением публикации.

### Requirement M36 — Контролируемое генеративное расширение клипа с provenance

- **Тип:** Атомарная; **оценки Q/E/F/C/S/L:** 8/7/5/5/6/8; **зависимости:** P08,P22,P23; **статус:** PROPOSED.
- **Проблема и ценность:** Иногда не хватает 0.5–1 секунды до удобного стыка, но произвольная генерация может изменить факты и лицо персонажа.
- **Архитектура / реализация:** Только для разрешённых исходников пробовать opt-in video extend, ограниченный длиной и разрешением, маркировать полностью синтетические кадры и сохранять модель/prompt/seed/provider. Обязательное ручное frame-level visual consistency review перед включением.
- **Контракт, provenance и область доступа:** GeneratedExtension_v1: source SHA, authorization/licensing, extension frames, synthetic_ranges, provider/model_version, actor and human acceptance.
- **Проверка эффекта и DoD:** На 10 сложных границах synthetic frame не засчитывается как подлинное событие; temporal jitter, текст и артефакты измеряются в A/B; fallback — trim без генерации.
- **Негативный случай / trade-off:** Высокая цена/время, vendor lock-in и риск фактических подмен; не запускать как дефолт и не имитировать документальную съёмку.
- **SDD и интеграционные вехи:** approved source & rights inventory → versioned pure search/planner → typed MCP/REST with project-scoped ACL → human preview/revisioned approval → reproducible Docker six-scene test + timecoded audit → staged rollout. Embedding/model score и synthesized media не могут стать фактом, лицензией или самостоятельным разрешением публикации.

### Requirement M37 — Семантическая проверка предмета и действия без идентификации личности

- **Тип:** Атомарная; **оценки Q/E/F/C/S/L:** 8/8/8/7/9/8; **зависимости:** P03,P22,P23; **статус:** PROPOSED.
- **Проблема и ценность:** Ролик показывает неправильный тип объекта (например, продукт вместо архитектуры), и это не поймать по метрике цвета.
- **Архитектура / реализация:** Точный список допустимых object classes и action labels из approved brief; на sample frames выполнять bounded classification без биометрической идентификации; привязывать вывод к SHA кадра и model fingerprint.
- **Контракт, provenance и область доступа:** SceneEntityProof_v1: expected tags, observed tags, evidence frames, confidence, allowed uncertainty; invalid/perceptual-sensitive tags reject.
- **Проверка эффекта и DoD:** На 25 контрольных сценах «нет предмета» сигнализирует REVIEW, запрет на лицо→имя, неизученный контент не выдаётся за matching proof.
- **Негативный случай / trade-off:** Model bias и неполная онтология; не принимать художественный кадр только на основании class labels.
- **SDD и интеграционные вехи:** approved source & rights inventory → versioned pure search/planner → typed MCP/REST with project-scoped ACL → human preview/revisioned approval → reproducible Docker six-scene test + timecoded audit → staged rollout. Embedding/model score и synthesized media не могут стать фактом, лицензией или самостоятельным разрешением публикации.

### Requirement M38 — Мультикритериальный best-take selector

- **Тип:** Системная; **оценки Q/E/F/C/S/L:** 9/9/7/7/8/8; **зависимости:** P03,P07,P22; **статус:** PROPOSED.
- **Проблема и ценность:** Из нескольких дублей выбирают первый попавшийся, хотя качественный вариант теряет смысл из-за дефекта фокуса или дикции.
- **Архитектура / реализация:** Сравнивать approved takes по frame sharpness, audio clipping, stable motion, script coverage и editorial annotations. Weight constraints конфигурируемы: technical FAIL исключает дубль, остальные признаки только рекомендуют.
- **Контракт, provenance и область доступа:** TakeScore_v1: approved asset hashes, check vectors, user priority, confidence intervals, missing metrics, manual overrides.
- **Проверка эффекта и DoD:** Намеренно размытой сцене не приписывать FAIL из-за одной резкости; на 15 annotated takes измерить долю выбранных качественных кандидатов и время A/B.
- **Негативный случай / trade-off:** Лучшая техническая картинка может быть худшей по эмоции; итоговый выбор человека обязателен.
- **SDD и интеграционные вехи:** approved source & rights inventory → versioned pure search/planner → typed MCP/REST with project-scoped ACL → human preview/revisioned approval → reproducible Docker six-scene test + timecoded audit → staged rollout. Embedding/model score и synthesized media не могут стать фактом, лицензией или самостоятельным разрешением публикации.

### Requirement M39 — Изготовление коротких версий без искажения смысла

- **Тип:** Системная; **оценки Q/E/F/C/S/L:** 9/10/8/9/9/9; **зависимости:** P15,P16,P24; **статус:** PROPOSED.
- **Проблема и ценность:** Публикация 15/30/60 сек требует трёх ручных сборок и рискованного удаления важных оговорок.
- **Архитектура / реализация:** Из main EditGraph + approved claim ledger строить derivative timelines с приоритетами must_keep/nice_to_have и длительностью; оптимизатор ищет минимальное разрушение смысловых связок, а не просто ускоряет все клипы.
- **Контракт, provenance и область доступа:** ShortFormVariant_v1: target duration/fps, mandatory claims, edit operations, source SHA, omissions report и human decision.
- **Проверка эффекта и DoD:** Создать 15/30/60 сек версии 6-сценного ролика без missing mandatory fact, без обрезанных слов и без неразрешённого speed-up; в невозможном случае — честный UNSAT.
- **Негативный случай / trade-off:** Некоторые сценарии несжимаемы; алгоритм должен уметь сказать «невозможно», а не выкидывать disclaimers.
- **SDD и интеграционные вехи:** approved source & rights inventory → versioned pure search/planner → typed MCP/REST with project-scoped ACL → human preview/revisioned approval → reproducible Docker six-scene test + timecoded audit → staged rollout. Embedding/model score и synthesized media не могут стать фактом, лицензией или самостоятельным разрешением публикации.

### Requirement M40 — Director briefs как исполняемые типизированные контракты

> **Реальный прогресс 2026-11-02:** срез M40-R01 (read-only P10→MCP/REST/Studio, SHA и ревизии, флаг по умолчанию OFF) внесён в PR #41. Это НЕ C03 write/C05 six-scene E2E/C06 измерение эффекта и НЕ полная приёмка. Детали: [docs/M40_TYPED_SCENE_BRIEF.md](../../../../../docs/M40_TYPED_SCENE_BRIEF.md). Указанные в карточке source rights, signed reviewer и timebox ещё не подтверждены.


- **Тип:** Системная; **оценки Q/E/F/C/S/L:** 10/10/9/9/10/10; **зависимости:** P06,P10,P16,P23; **статус:** PROPOSED.
- **Проблема и ценность:** Отдельные агенты получают длинный расплывчатый промпт, делают разные стили и повторяют чужую работу.
- **Архитектура / реализация:** Перевести задачу сцены в immutable typed brief: scene_id, goal, essential_claims, visual references, source hashes, style rules, permitted tools, timebox, acceptance tests, forbidden edits. Reviewer выдаёт новые ревизии спецификации, worker читает перед каждой попыткой.
- **Контракт, provenance и область доступа:** SceneBrief_v2: actor/lease, expected_revision, input rights, output asset manifest, evidence CI, checkpoints; P06 role separation obligatory.
- **Проверка эффекта и DoD:** Шесть независимых агентов на сгенерированных briefs не выходят из своих сцен, читают свежие ревизии, гарантируют отсутствие неподтверждённых статусов и CAS конфликтов.
- **Негативный случай / trade-off:** Качество агента не гарантируется структурой задачи; нужна независимая проверка артефакта, а не только отчёт LLM.
- **SDD и интеграционные вехи:** approved source & rights inventory → versioned pure search/planner → typed MCP/REST with project-scoped ACL → human preview/revisioned approval → reproducible Docker six-scene test + timecoded audit → staged rollout. Embedding/model score и synthesized media не могут стать фактом, лицензией или самостоятельным разрешением публикации.

