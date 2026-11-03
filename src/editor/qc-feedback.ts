/** M51-R02: review-only UI presentation; no mutation or acceptance authority. */
import type { QcCockpitView } from './api.ts';
export type QcEvent = QcCockpitView['events'][number];
export type QcFilter = 'attention' | 'all' | 'unlocated' | 'verified';

const CODE_LABELS: Record<string,string> = {
  HUMAN_REVIEW: 'Замечание к сцене',
  VIDEO_CODEC: 'Проверить формат видео',
  AUDIO_CODEC: 'Проверить формат аудио',
  AUDIO_MISSING: 'Отсутствует аудиодорожка',
  VIDEO_MISSING: 'Отсутствует видеодорожка',
};
const STATUS_LABELS: Record<string,string> = {
  OPEN: 'Требует проверки',
  REOPENED: 'Открыто повторно',
  FIXED: 'Исправлено, ожидает подтверждения',
  VERIFIED: 'Подтверждено ревьюером',
  UNLOCATED: 'Требует поиска в видео',
};
const SEVERITY_LABELS: Record<string,string> = {
  blocking: 'Блокирующее',
  high: 'Высокая',
  medium: 'Средняя',
  low: 'Низкая',
  technical: 'Техническая',
};
export function qcEventTitle(event: QcEvent): string {
  if (event.source === 'P07_REVIEW') return CODE_LABELS.HUMAN_REVIEW;
  return CODE_LABELS[event.issue_code] ?? 'Техническое замечание';
}
export function qcDispositionLabel(disposition: string): string {
  return STATUS_LABELS[disposition] ?? 'Статус не определён';
}
export function qcSeverityLabel(severity: string): string {
  return SEVERITY_LABELS[severity] ?? 'Неизвестная важность';
}
export function qcNeedsAttention(event: QcEvent): boolean {
  // P05 untimed issues are always actionable even without any decoded PTS.
  return event.requires_human_review || event.global_seconds === null;
}
export function qcFilterEvents(events: readonly QcEvent[], filter: QcFilter,
  sceneId: string | null = null): QcEvent[] {
  return events.filter(event =>
    (sceneId === null || event.scene_id === sceneId) &&
    (filter === 'all' ||
      (filter === 'attention' && qcNeedsAttention(event)) ||
      (filter === 'unlocated' && event.global_seconds === null) ||
      (filter === 'verified' && !qcNeedsAttention(event))));
}
export function qcTriageCounts(events: readonly QcEvent[]) {
  return {
    all: events.length,
    attention: events.filter(qcNeedsAttention).length,
    unlocated: events.filter(e => e.global_seconds === null).length,
    verified: events.filter(e => !qcNeedsAttention(e)).length,
  };
}
