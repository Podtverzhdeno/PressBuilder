# PresBuilder

## 30-day engineering delivery queue (pilot)

For code work on PressBuilder itself (not editing a customer's video scene), read [docs/AGENT_DELIVERY_30D.md](docs/AGENT_DELIVERY_30D.md). The local SQLite queue in `tools/agent_work_queue.py` imports the current P01–P10 and OpenSpec M01–M60 tasks. Four developers use `acquire`, reserve source files, heartbeat and submit a real PR; an independent architect handles review. If no code is eligible, developers review other agents' changes. Always re-read the current specification and Git HEAD. This queue is **not** authenticated actor identity, owner acceptance or production authority; never commit the database or lease tokens.


## Professional Montage P15–P24 — OpenSpec + SDD (план, не реализованные функции)

Для новых задач по качественному монтажу сначала прочитай `openspec/changes/professional-montage-p15-p24/proposal.md`, `design.md`, точную capability-спецификацию и `specs/002-professional-montage/spec.md`, `plan.md`, `tasks.md`. Полный протокол независимых агентов и доказательств: [docs/PRO_MONTAGE_AGENTS.md](docs/PRO_MONTAGE_AGENTS.md). Машинный реестр: `docs/pro-montage-checkpoints.json`, **60 этапов начально TODO**. Эти документы не означают, что P15–P24 реализованы, и не дают права ставить `done` без реального тестирования и reviewer signoff. Проверь `node --test tests/pro-montage-spec.test.mjs` и OpenSpec strict после изменений. Не переписывай чужие сценовые задания, `deck.json` и принятые версии MP4.

Редактор анимированных роликов из текста озвучки: Canvas 2D + TypeScript + Vite, интерфейс на Preact.
Кадр 1920×1080, четыре стиля оформления (`style` в deck.json, пресеты — `src/engine/styles.ts`):
`terevo` (по умолчанию: тёмный графит, Sofia Sans Extra Condensed в small-caps), `midnight` (тёмно-синяя
стена, охра и ржавчина), `paper` (светлая бумага, антиква), `lines` (белая дымка, цветные полосы и
тонкие линии). На выходе — MP4 в `out/`.

**Любая работа с роликами** («делай тему X», «сделай ролик из текста», правка сцен, вывод MP4) —
по скиллу `presbuilder`: `.agents/skills/presbuilder/SKILL.md` (Codex) или
`.claude/skills/presbuilder/SKILL.md` (Claude Code). Прочитай его до первой сцены.

## Кто что делает

- **Человек в редакторе** (`npm run dev` → http://localhost:5180): создаёт тему (стиль, заголовок,
  текст, число слайдов), правит текст реплик, тайминги, положение/масштаб/текст объектов, выводит MP4.
- **Агент в чате**: по просьбе «делай тему X» пишет код сцен для слайдов этой темы.

## Ролик

```
src/decks/<id>/deck.json      данные (пишет редактор, автосохранение)
  title, text, target (хронометраж, сек | null), lead/tail, format {height,fps,bitrate}
  style?  ← пресет стиля: terevo | midnight | paper | lines (нет поля — terevo)
  slides[]: id ("s01"), label, lead?, tail?,
            cues[]: id, say (озвучка), show? (на экране), hold?, rate?, dur? (ручная длительность)
            objects?: { "<id объекта>": { x?, y?, scale?, text?, hidden? } }   ← правки из редактора
  audio?: { file, offset?, volume? }   ← озвучка: файл в папке ролика, с какой секунды звучит, громкость
src/decks/<id>/sNN_имя.ts     сцена слайда (SceneDef), index.ts — список сцен, common.ts — общие блоки
src/decks/<id>/voice.mp3      озвучка (кнопка «Добавить звук» на таймлайне); попадает в MP4
```

В deck.json не менять `say`, `target`, `format`, `style` (стиль выбирает человек), `objects`, `audio`. Чужие ролики не трогать.

## Вход нового агента: README конкретного видеопроекта

Не предполагай, что у тебя есть контекст из предыдущих чатов. Перед работой с новым проектом:

1. Если ID проекта неизвестен — **`list_decks`**.
2. Вызови **`get_project_context({"id":"...","slide_id":"s01"})`**: получи проектный `README.md`, общие правила и полный статус назначенной сцены. `slide_id` можно опустить для просмотра всего проекта.
3. Прочитай **`get_scene_task`** своей сцены, а также `get_deck` для точных реплик/хронометража, и только после этого приступай к работе.
4. README проекта можно прочитать отдельно (`get_project_readme`) и обновить с актуальной ревизией (`update_project_readme`).
5. README задаёт **общие ограничения**, отдельное ТЗ задаёт **конкретную реализацию сцены**, чекпоинты описывают **подтверждённый прогресс**. Не путай эти источники.
6. Если нет ТЗ или README неполный — не выдумывай, что это согласованное требование. Сначала уточни задачу у координатора.

Файл `src/decks/<id>/README.md` (локально) или `/data/decks/<id>/README.md` (Railway) независим от `deck.json` и от `.scene-tasks/...`. Созданный проект получает стартовый README автоматически; для существующих без файла через MCP доступен сгенерированный обзор, который можно дополнить и сохранить через редактор.

## Параллельные агенты: задания и чекпоинты

**Обязательно при открытии любого проекта**: сначала прочитай назначение своей сцены. В интерфейсе редактора это кнопка **«Задания агентам»**. Через MCP вызывай `get_deck` (краткий обзор), затем `list_scene_tasks` или `get_scene_task` для полного ТЗ, ограничений, критериев приёмки и статуса чекпоинтов.

- **Работай только с назначенной сценой**; чужие сцены, задания, исходные данные проекта и общие настройки без согласования не изменяй.
- Для обновления собственного подробного ТЗ: `set_scene_task` с текущим `expected_revision`. При конфликте прочитай задачу заново.
- После реальной проверки результата: `set_scene_checkpoint` с `done:true` и доказательством в `note` (пути к файлу, название теста, ссылка на рендер). Не отмечай невыполненные этапы.
- Все задания хранятся отдельно от `deck.json`, по одному файлу на сцену (`.scene-tasks/sNN.json` локально; постоянный том Railway для облачной версии). Это позволяет шести агентам независимо вести шесть сцен.
- Подробный протокол: [docs/scene-agents.md](docs/scene-agents.md). Назначение исполнителя не запускает агента автоматически — нужен внешний оркестратор.

## 3D-сцены через MCP (P01)

Для простой 3D-композиции не создавай TypeScript и не трогай чужие сцены: после чтения README и сценового ТЗ вызови `get_scene_3d({id,slide_id})` и `set_scene_3d({id,slide_id,expected_revision,spec})`. Команды сохраняют ограниченный JSON с вращающимися телами, цветом, камерой и появлением объектов; загрузчик рисует его через существующий перспективный `wire3d`. Для сложной авторской модели по-прежнему нужен проверяемый кодовый PR; MCP не исполняет произвольный JS.

API, лимиты и пример: [docs/scene3d-sdk.md](docs/scene3d-sdk.md). Не объявляй сцену выполненной без фактического предпросмотра и рендера MP4.

## P04–P06 — стиль, самостоятельный рендер и владение сценой (MVP)

`get_project_context` теперь возвращает также `style_contract`. Перед публикацией 3D/2D-графики проверь `style_contract.contract.enforce`, допустимую палитру, шрифты и safe area. Нельзя отключать enforce самому: `set_style_contract` разрешён только директору.

Агент-исполнитель должен подключаться **с отдельным scoped bearer token**, выданным координатором в `PB_AGENT_KEYS_JSON`. Не подключай шесть агентов одним `MCP_API_KEY` — это директорский секрет с расширенными правами. Сценовые инструменты сначала сверяют область доступа, затем аренду. Последовательность:

1. `get_project_context` → `get_scene_task` → `get_scene_3d`.
2. `claim_scene({id,slide_id,ttl:300})` → получи `fence`.
3. В каждую запись сцены (`set_scene_3d`, `set_slide_visuals`, `set_scene_task`, `set_scene_checkpoint`, `update_cue/slide/object`) передавай `fence_token:fence`. Следи за сроком аренды и `renew_scene_lease`.
4. После проверки и выпуска `release_scene`. Директор вправе принудительно переназначить сцену, что делает старый токен недействительным.

Когда все независимые рендеры завершены и статусы заданий `done`, только директор вызывает `assemble_video({id,scene_ids:[...]})`, затем `get_assembly_status`. Сейчас поддерживается **только hard-cut** без художественных переходов и immutable artifacts. Не считай технический PASS визуальной приёмкой.

Подробно: [docs/production-p04-p06.md](docs/production-p04-p06.md).

## P07–P08 — ревью и версии MP4 (облачный workflow)

После `render_scene` обязательно получи `list_scene_versions({id,slide_id})`. Сохраняй `version_id` и SHA-256; адрес `out/<project>_<scene>_v<version>.mp4` — отдельная неизменяемая версия. Не подменяй принятый файл на новый черновик.

Ревьюер или директор вызывает `add_scene_review_item` с `version_id`, временем `t`, `severity`, текстом и при необходимости `rect` в относительных координатах 0..1. Worker исправляет **только свою** сцену, при необходимости делает новый рендер и отмечает замечание через `transition_scene_review_item({status:"FIXED", fence_token})` со ссылкой на доказательство. Ревьюер подтверждает `VERIFIED` или возвращает `REOPENED`. Переходы требуют актуальную `expected_revision`.

Только директор может выполнить `approve_scene_version` (задача должна быть `done`, все замечания выбранной версии — `VERIFIED`). Сборка `assemble_video` теперь использует **именно утверждённые версии**, а не случайный последний черновик. `restore_scene_version` восстанавливает **видеоартефакт** из ранее утверждённых версий без перерендера; он **не** восстанавливает код сцены. Через веб-редактор это доступно в окне «Ревью MP4» (Cloud).

Документация и ограничения: [docs/scene-review-versions.md](docs/scene-review-versions.md).

## Команды

```
npm run dev                         редактор, http://localhost:5180 (сервер API и ffmpeg — плагин Vite)
node tools/new.mjs <id> <текст.txt> --title "…" [--style paper]   новая тема из текста
npx tsc --noEmit                    типы
node tools/check.mjs <id>           прогон всех сцен без браузера
node tools/timing.mjs <id>          раскладка реплик по времени
node tools/align.mjs <id> [--write] подогнать тайминги реплик под паузы озвучки
```

## Структура

```
server/plugin.ts      API редактора: /api/decks, /api/export, /api/config, /out
src/engine/           движок: стили (styles, theme, background), тайминги, расписание, разбивка текста, рендер и объекты (timeline),
                      экспорт (WebCodecs → H.264, озвучка — ffmpeg), заглушка, текст, графика, виджеты,
                      иконки, псевдо-3D, блоки сцен (kit), скелет (rig), картинки (assets)
src/editor/           интерфейс редактора
src/decks/<id>/       ролики; gameready-3d — пример
tools/                new.mjs, check.mjs, timing.mjs, align.mjs, frame.html (кадры сеткой для проверки)
```
