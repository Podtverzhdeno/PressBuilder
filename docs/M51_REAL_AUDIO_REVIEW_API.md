# M51-R04 / M58-R22 — реальный звук MP4 в QC-кокпите (только чтение)

**Изолированный Draft PR, поверх M58-R21 (PR #55). Production OFF.**

## Изменения

- Отдельный `real_audio_review` в M51 QC-кокпите; синтетические
  `m58_audio_review` из PR #53 **не смешиваются** с проверкой реального
  файла и не влияют на P07 reviewer disposition.
- Данные берутся через `realMasterAudioQueue.read(id)`, которая проверяет
  актуальность P05 current release, SHA-256 master, job и checksum
  хранимого receipt. Противоречие или повреждение даёт `REJECTED`, а
  не пустой «пройдено». Техническая оценка **не** криптографически
  подписана и не подтверждена прослушиванием человеком.
- Отображаются таймкоды **начала и конца 300-ms PCM окон**, на которые
  можно приблизительно перейти в предпросмотр MP4. Это аудиочасы PCM,
  а не достоверные video-frame PTS. Замечания относятся ко **всему**
  master, а не выдуманным отдельным сценам.
- P06 scene-scoped readers даже **не вызывают** full-project
  `realAudioRead` и не получают ни receipt, ни сводку ошибок.
- GET не запускает FFmpeg и не создаёт журналы. Нулевое число
  найденных дефектов не превращается в право публикации.

## Защищённый REST API

**По умолчанию выключен:** `PB_REAL_AUDIO_AUDIT=1` явно включает
только новую функциональность. Для QC нужен также `PB_QC_COCKPIT=1`.

Через существующую **Basic Auth** и защиту изменяющих REST-запросов от
cross-site write:

```text
GET  /api/decks/:id/audio-audit
POST /api/decks/:id/audio-audit
GET  /api/decks/:id/qc-cockpit
```

GET /audio-audit возвращает `{job,receipt}` либо статус `not_started`.
POST — **отдельное явное действие владельца** с **точными** параметрами:

```json
{
  "release_id": "<current-p05-release-uuid>",
  "release_sha256": "<current-master-mp4-sha256>"
}
```

Любые дополнительные поля (пути к файлам, произвольные аргументы
FFmpeg, override публикации) отклоняются. Запрос со старым SHA/ID
возвращает 409, неподготовленный выпуск — 409, переполненная очередь —
429. Запуск асинхронный: возвращает 202 и обычный job. Повторные
запросы к тому же проверенному релизу дедуплицируются. GET-кокпит
**не** запускает POST и не выставляет одобрений автоматически.

Для production нужны HTTPS, уже существующая серверная авторизация,
единственная writer-реплика на том же volume и governor сериализации
ресурсов. Этот PR **не** включает флаг на Railway и не развёртывает API.

## Что ещё требует независимой проверки

В R20/R21 `report_sha256` и `receipt_sha256` — хэши целостности,
**не подписи** issuer и не защита от администратора с правом изменения
локальных файлов. Синхронизация PCM с A/V PTS, полное покрытие
звуковых дефектов, права, творческое качество и human listening
не проверяются. Все `publication_allowed:false`, `may_publish:false`,
`human_listening_verified:false` сохранены.

## Проверки

```bash
node --test tests/cloud-real-master-qc-projection.test.mjs \
  tests/cloud-real-master-audio-api-wire.test.mjs
npm run build
npm run test:cloud
```

В wire-тесте настоящий HTTP-сервер требует Basic Auth, отвергает
MCP Bearer на web REST, cross-site POST, неверный CAS и незнакомые
поля; отдельный E2E с FFmpeg создаёт **реальный H.264/AAC master**
в хранилище P05, вручную запускает очередь и читает заключение в
QC-кокпите. На runner без FFmpeg E2E ожидаемо SKIP, а в Docker с
FFmpeg должен исполниться. Без ручного запуска никакая работа не
стартует.

**Не использовать PR как production release gate** до независимого
security review, QA, сценария отмены/ограничения по CPU и
подтверждения полномочий владельца.
