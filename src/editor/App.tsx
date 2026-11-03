/** Каркас редактора: стартовый экран со списком тем или рабочее пространство ролика. */

import { useEffect, useState } from 'preact/hooks';
import { styleById } from '../engine/styles.ts';
import { patchObj } from './actions.ts';
import { api, type DeckMeta } from './api.ts';
import { DeckDialog } from './DeckDialog.tsx';
import { ExportDialog } from './ExportDialog.tsx';
import { Inspector } from './Inspector.tsx';
import { ScriptPanel } from './ScriptPanel.tsx';
import { SceneTasksPanel } from './SceneTasksPanel.tsx';
import { ProjectReadmePanel } from './ProjectReadmePanel.tsx';
import { Scene3DPanel } from './Scene3DPanel.tsx';
import { SceneReviewPanel } from './SceneReviewPanel.tsx';
import { RhythmPreviewPanel } from './RhythmPreviewPanel.tsx';
import { CreativeStoryPanel } from './CreativeStoryPanel.tsx';
import { ContinuityBoundaryPanel } from './ContinuityBoundaryPanel.tsx';
import { TypedSceneBriefPanel } from './TypedSceneBriefPanel.tsx';
import { EditGraphPanel } from './EditGraphPanel.tsx';
import { QcCockpitPanel } from './QcCockpitPanel.tsx';
import { StyleDialog } from './StyleDialog.tsx';
import { StyleContractPanel } from './StyleContractPanel.tsx';
import { Stage } from './Stage.tsx';
import {
  canRedo,
  canUndo,
  closeDeck,
  curSlide,
  deck,
  decks,
  exporting,
  fatal,
  flushSave,
  loading,
  objects,
  openDeck,
  player,
  redo,
  refreshDecks,
  saveState,
  say,
  schedule,
  seek,
  sel,
  selectedIds,
  time,
  toast,
  togglePlay,
  undo,
  update,
} from './store.ts';
import { TimelinePanel } from './TimelinePanel.tsx';
import { Icon, IconBtn, MenuBtn } from './ui.tsx';
import { clock, isTyping, nSlides } from './util.ts';

type Modal = null | 'new' | 'resplit' | 'style' | 'tasks' | 'readme' | 'scene3d' | 'style-contract' | 'export' | 'export-auto' | 'review' | 'rhythm' | 'creative' | 'continuity' | 'typed-brief' | 'edit-graph' | 'qc-cockpit';

const SAVE_TEXT = { saved: 'сохранено', dirty: 'изменено', saving: 'сохраняю…', error: 'не сохранилось' };

export function App() {
  const [modal, setModal] = useState<Modal>(null);
  const [exportSlides, setExportSlides] = useState<string[] | undefined>(undefined);
  const d = deck.value;

  // ?export=1 — автоматический рендер с настройками ролика (так ролик собирает ИИ-агент)
  useEffect(() => {
    if (d && new URLSearchParams(location.search).get('export') === '1') {
      const url = new URL(location.href);
      const sl = url.searchParams.get('slides');
      setExportSlides(sl ? sl.split(',').map((x) => x.trim()).filter(Boolean) : undefined);
      url.searchParams.delete('export');
      url.searchParams.delete('slides');
      history.replaceState(null, '', url);
      setModal('export-auto');
    }
  }, [d?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // QC is a read-only modal: Ctrl+Z/redo must not mutate the deck behind it.
      if (exporting.peek() || !deck.peek() || modal === 'qc-cockpit') return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && (key === 'z' || key === 'я')) {
        // в поле ввода Ctrl+Z тоже ведёт в общую историю: текст правится через неё
        e.preventDefault();
        return e.shiftKey ? redo() : undo();
      }
      if (mod && (key === 'y' || key === 'н')) return e.preventDefault(), redo();
      if (mod && (key === 's' || key === 'ы')) return e.preventDefault(), void flushSave();
      if (isTyping(e)) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }
      if (modal) return;
      const s = sel.peek();
      const picked = objects.peek().filter((o) => selectedIds(s).includes(o.id));
      const fps = deck.peek()?.format.fps ?? 60;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          return togglePlay();
        case 'Escape':
          return void (sel.value = { kind: 'none' });
        case 'Home':
          return seek(0);
        case 'End':
          return seek(schedule.peek()?.duration ?? 0);
        case 'PageUp':
        case 'PageDown': {
          e.preventDefault();
          const sch = schedule.peek();
          const i = curSlide.peek()?.index ?? 0;
          const next = sch?.slides[Math.max(0, Math.min(sch.slides.length - 1, i + (e.key === 'PageUp' ? -1 : 1)))];
          return next && seek(next.start + 0.001);
        }
        case 'f':
        case 'а':
          return void player?.canvas.parentElement?.requestFullscreen();
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          e.preventDefault();
          const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
          const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
          const n = e.shiftKey ? 10 : 1;
          // выделен объект — стрелки двигают его, иначе плейхед
          if (picked.length && s.kind === 'obj') {
            picked.forEach((o, i) =>
              patchObj(s.slide, o.id, { x: o.cur.x + dx * n, y: o.cur.y + dy * n }, i ? { merge: true } : { key: `nudge:${s.obj}` }),
            );
            return;
          }
          if (dx) seek(time.peek() + dx * (e.shiftKey ? 1 : 1 / fps));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal]);

  if (fatal.value) return <div class="splash is-error">{fatal.value}</div>;
  if (loading.value && !d) return <div class="splash">Загрузка…</div>;

  return (
    <>
      {d ? (
        <div class="app">
          <header class="topbar">
            <IconBtn icon="back" label="К списку тем" onClick={closeDeck} />
            <input
              class="title-input"
              type="text"
              value={d.title}
              spellcheck={false}
              title="Заголовок ролика"
              onInput={(e) => update((x) => void (x.title = e.currentTarget.value), { key: 'title' })}
            />
            <span class="deck-id" title="Папка ролика: src/decks/…">
              {d.id}
            </span>
            <span class={`save-state is-${saveState.value}`}>{SAVE_TEXT[saveState.value]}</span>
            <span class="tl-spacer" />
            <IconBtn icon="undo" label="Отменить (Ctrl+Z)" disabled={!canUndo.value} onClick={undo} />
            <IconBtn icon="redo" label="Вернуть (Ctrl+Shift+Z)" disabled={!canRedo.value} onClick={redo} />
            <StyleChip style={d.style} onClick={() => setModal('style')} />
            <button type="button" class="btn" onClick={() => setModal('resplit')}>
              <Icon name="text" size={15} /> Текст и разбивка
            </button>
            <button type="button" class="btn" title="README видеопроекта, доступный каждому агенту по MCP" onClick={() => setModal('readme')}>
              <Icon name="text" size={15} /> README проекта
            </button>
            <button type="button" class="btn" title="Машинно-проверяемые визуальные правила для всех агентов" onClick={() => setModal('style-contract')}>
              <Icon name="check" size={15} /> Контракт стиля
            </button>
            <button type="button" class="btn" title="3D-объекты и анимация выбранной сцены" onClick={() => setModal('scene3d')}>
              <Icon name="film" size={15} /> 3D сцена
            </button>
            <button type="button" class="btn" title="Задания для агентов и чекпоинты по каждой сцене" onClick={() => setModal('tasks')}>
              <Icon name="check" size={15} /> Задания агентам
            </button>
            <button type="button" class="btn" title="P16: два варианта истории только по утверждённому сценарию" onClick={() => setModal('creative')}>
              <Icon name="film" size={15} /> Режиссёрские истории
            </button>
            <button type="button" class="btn" title="M51: таймкоды QA и замечания по исходным версиям сцен" onClick={() => setModal('qc-cockpit')}>
              <Icon name="film" size={15} /> QC-кокпит
            </button>
            <button type="button" class="btn" title="M01: монтажная шкала с рациональными отсчётами, без публикации" onClick={() => setModal('edit-graph')}>
              <Icon name="film" size={15} /> Монтажная шкала
            </button>
            <button type="button" class="btn" title="M40: машинно-проверяемое назначение агента на основе утверждённого режиссёрского плана" onClick={() => setModal('typed-brief')}>
              <Icon name="text" size={15} /> Контракт агента
            </button>
            <button type="button" class="btn" title="P17: проверка подлинности последнего/первого кадра утверждённых MP4" onClick={() => setModal('continuity')}>
              <Icon name="film" size={15} /> Стыки сцен
            </button>
            <button type="button" class="btn" title="P15: серверный черновик ритмических склеек по разметке слов и пауз" onClick={() => setModal('rhythm')}>
              <Icon name="film" size={15} /> Ритм монтажа
            </button>
            <button type="button" class="btn" title="Ревью кадров и версии MP4, доступно в облачном редакторе" onClick={() => setModal('review')}>
              <Icon name="film" size={15} /> Ревью MP4
            </button>
            <DurationChip onClick={() => setModal('export')} />
            <button type="button" class="btn is-primary" onClick={() => setModal('export')}>
              <Icon name="film" size={15} /> Вывод
            </button>
          </header>
          <ScriptPanel />
          <Stage />
          <Inspector />
          <TimelinePanel />
        </div>
      ) : (
        <Home onNew={() => setModal('new')} />
      )}

      {modal === 'new' && <DeckDialog mode="new" onClose={() => setModal(null)} />}
      {modal === 'resplit' && <DeckDialog mode="resplit" onClose={() => setModal(null)} />}
      {modal === 'style' && <StyleDialog onClose={() => setModal(null)} />}
      {modal === 'tasks' && d && <SceneTasksPanel projectId={d.id} initialSlide={curSlide.value?.slide.id} onClose={() => setModal(null)} />}
      {modal === 'readme' && d && <ProjectReadmePanel projectId={d.id} onClose={() => setModal(null)} />}
      {modal === 'style-contract' && d && <StyleContractPanel projectId={d.id} onClose={() => setModal(null)} />}
      {modal === 'scene3d' && d && <Scene3DPanel projectId={d.id} slideId={curSlide.value?.slide.id??d.slides[0]?.id} onClose={() => setModal(null)} />}
      {modal === 'review' && d && <SceneReviewPanel projectId={d.id} initialSlide={curSlide.value?.slide.id} onClose={() => setModal(null)} />}
      {modal === 'rhythm' && d && <RhythmPreviewPanel projectId={d.id} onClose={() => setModal(null)} />}
      {modal === 'creative' && d && <CreativeStoryPanel projectId={d.id} onClose={() => setModal(null)} />}
      {modal === 'continuity' && d && <ContinuityBoundaryPanel projectId={d.id} onClose={() => setModal(null)} />}
      {modal === 'typed-brief' && d && <TypedSceneBriefPanel projectId={d.id} initialScene={curSlide.value?.slide.id} onClose={() => setModal(null)} />}
      {modal === 'edit-graph' && d && <EditGraphPanel projectId={d.id} onClose={() => setModal(null)} />}
      {modal === 'qc-cockpit' && d && <QcCockpitPanel projectId={d.id} onClose={() => setModal(null)} />}
      {(modal === 'export' || modal === 'export-auto') && (
        <ExportDialog autoStart={modal === 'export-auto'} slides={modal === 'export-auto' ? exportSlides : undefined} onClose={() => setModal(null)} />
      )}
      {toast.value && <div class="toast">{toast.value}</div>}
    </>
  );
}

/** Кружки палитры стиля: фон, h1, accent, pos. */
function Swatches({ style }: { style?: string }) {
  const c = styleById(style).colors;
  return (
    <span class="style-swatches" aria-hidden="true">
      {[c.bg, c.h1, c.accent, c.pos].map((x) => (
        <i key={x} style={{ background: x }} />
      ))}
    </span>
  );
}

function StyleChip({ style, onClick }: { style?: string; onClick(): void }) {
  return (
    <button type="button" class="btn" title="Стиль ролика: палитра, шрифты, фон" onClick={onClick}>
      <Swatches style={style} /> {styleById(style).name}
    </button>
  );
}

function DurationChip({ onClick }: { onClick(): void }) {
  const sch = schedule.value;
  const d = deck.value;
  if (!sch || !d) return null;
  return (
    <button type="button" class="chip" title="Хронометраж и формат — в окне вывода" onClick={onClick}>
      <b>{clock(sch.duration)}</b>
      <span>
        {d.target === null ? 'из текста' : 'задан'} · {d.format.height}p · {d.format.fps} к/с
      </span>
    </button>
  );
}

function Home({ onNew }: { onNew(): void }) {
  const list = decks.value;

  const remove = async (m: DeckMeta) => {
    if (!confirm(`Убрать тему «${m.title}» в корзину (.trash)?`)) return;
    await api.deleteDeck(m.id);
    await refreshDecks();
    say('Тема перенесена в .trash');
  };

  return (
    <div class="home">
      <div class="home-inner">
        <header class="home-head">
          <h1>
            PresBuilder <span>анимированные ролики из текста</span>
          </h1>
          <button type="button" class="btn is-primary is-big" onClick={onNew}>
            <Icon name="plus" size={16} /> Новая тема
          </button>
        </header>

        <ol class="steps">
          <li>
            <b>1</b> Создай тему: выбери стиль, вставь текст и приложи озвучку — время разложится само.
          </li>
          <li>
            <b>2</b> Скажи в чате Claude Code или Codex: <em>«делай тему …»</em> — агент нарисует сцены.
          </li>
          <li>
            <b>3</b> Поправь текст и положение объектов, нажми <em>«Вывод»</em>.
          </li>
        </ol>

        <div class="deck-grid">
          {list.map((m) => (
            <div
              key={m.id}
              class="deck-card"
              role="button"
              tabIndex={0}
              onClick={() => void openDeck(m.id)}
              onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && void openDeck(m.id)}
            >
              <div class="deck-card-top">
                <span class={`badge ${m.hasScenes ? 'is-ok' : ''}`}>{m.hasScenes ? 'сцены готовы' : 'черновик'}</span>
                <span onClick={(e) => e.stopPropagation()}>
                  <MenuBtn items={[{ label: 'Убрать в корзину', icon: 'trash', danger: true, onSelect: () => void remove(m) }]} />
                </span>
              </div>
              <h3>{m.title}</h3>
              <p>
                {m.id} · {nSlides(m.slides)}
                {m.target ? ` · ${clock(m.target)}` : ''}
              </p>
              <p class="deck-card-style">
                <Swatches style={m.style} /> {styleById(m.style).name}
              </p>
            </div>
          ))}
          {!list.length && <p class="muted">Тем пока нет — создай первую.</p>}
        </div>
      </div>
    </div>
  );
}
