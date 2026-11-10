import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MarkdownView } from './MarkdownView';
import {
  LEVEL_LABEL,
  RATING_LEVEL,
  combineCardRatings,
  formatInterval,
  previewLevels,
  topicReviewCards,
  type CardRating,
  type Level,
  type TopicRef,
} from '../srs';
import type { Course } from '../types';

interface ReviewSessionProps {
  queue: TopicRef[];
  today: string;
  courses: Course[];
  /** Persists the topic's new rating. */
  onRateTopic: (ref: TopicRef, level: Level) => Promise<void>;
  onClose: () => void;
}

const RATING_BUTTONS: { rating: CardRating; label: string; hint: string; key: string; className: string }[] = [
  { rating: 'hard', label: 'Hard', hint: "Didn't know it", key: '1', className: 'bg-[#FFF0EF] text-[#9E2A2B]' },
  { rating: 'medium', label: 'Medium', hint: 'Partly / slowly', key: '2', className: 'bg-[#FFF4E5] text-[#B85A12]' },
  { rating: 'easy', label: 'Easy', hint: 'Knew it well', key: '3', className: 'bg-[#EEF7EA] text-[#2F6B24]' },
];

const LEVEL_STYLE: Record<Level, string> = {
  RED: 'bg-[#FFF0EF] text-[#9E2A2B]',
  YELLOW: 'bg-[#FFF4E5] text-[#B85A12]',
  GREEN: 'bg-[#EEF7EA] text-[#2F6B24]',
};

interface TopicResult { title: string; level: Level; days: number; cards: number }

export function ReviewSession({ queue, today, courses, onRateTopic, onClose }: ReviewSessionProps) {
  const [topicIdx, setTopicIdx] = useState(0);
  const [cardIdx, setCardIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [ratings, setRatings] = useState<CardRating[]>([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<TopicResult | null>(null); // shown between topics
  const [results, setResults] = useState<TopicResult[]>([]);

  const ref = queue[topicIdx];
  const finished = topicIdx >= queue.length;
  const cards = useMemo(() => (ref ? topicReviewCards(ref.sub) : []), [ref]);
  const recallMode = cards.length === 0; // no cards: explain the topic from memory instead
  const card = cards[cardIdx];
  const course = ref ? courses.find(c => c.id === ref.record.courseId) : undefined;

  const finishTopic = useCallback(async (level: Level, cardCount: number) => {
    if (!ref) return;
    setSaving(true);
    const days = previewLevels(ref.sub, today)[level];
    try {
      await onRateTopic(ref, level);
    } finally {
      setSaving(false);
    }
    const r = { title: ref.sub.title, level, days, cards: cardCount };
    setResults(prev => [...prev, r]);
    setResult(r);
  }, [ref, today, onRateTopic]);

  const rate = useCallback(async (rating: CardRating) => {
    if (!revealed || saving || result) return;
    if (recallMode) {
      await finishTopic(RATING_LEVEL[rating], 0);
      return;
    }
    const next = [...ratings, rating];
    if (cardIdx + 1 < cards.length) {
      setRatings(next);
      setCardIdx(i => i + 1);
      setRevealed(false);
      return;
    }
    setRatings(next);
    const combined = combineCardRatings(next)!;
    await finishTopic(combined.level, next.length);
  }, [revealed, saving, result, recallMode, ratings, cardIdx, cards.length, finishTopic]);

  const nextTopic = useCallback(() => {
    setResult(null);
    setRatings([]);
    setCardIdx(0);
    setRevealed(false);
    setTopicIdx(i => i + 1);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (finished) return;
      const isAdvance = e.key === ' ' || e.key === 'Enter';
      if (result && isAdvance) { e.preventDefault(); nextTopic(); return; }
      if (!result && !revealed && isAdvance) { e.preventDefault(); setRevealed(true); return; }
      if (!result && revealed) {
        const btn = RATING_BUTTONS.find(b => b.key === e.key);
        if (btn) { e.preventDefault(); rate(btn.rating); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finished, result, revealed, rate, nextTopic, onClose]);

  // Move focus off whatever opened the session, so Space doesn't re-press it.
  useEffect(() => { (document.activeElement as HTMLElement | null)?.blur?.(); }, []);

  const progressPct = queue.length === 0 ? 100 : Math.round(((topicIdx + (result ? 1 : 0)) / queue.length) * 100);
  const nextLabel = topicIdx + 1 < queue.length ? 'Next topic' : 'See summary';

  return (
    <div className="fixed inset-0 z-50 bg-[#1C1A17]/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Review session">
      <div className="w-full max-w-2xl bg-[#FAF6EE] border-4 border-[#1C1A17] rounded-3xl shadow-[6px_6px_0px_0px_#1C1A17] text-[#1C1A17] overflow-hidden">
        {/* Header */}
        <div className="bg-[#FFF4E5] border-b-4 border-[#1C1A17] px-5 py-4 flex items-center gap-4">
          <div className="grow min-w-0">
            <div className="flex items-center justify-between text-xs font-bold text-[#7C7468] mb-1.5 gap-3">
              <span className="font-pixel text-[10px] uppercase text-[#1C1A17]">Review</span>
              <span className="truncate">
                {finished
                  ? `${results.length} ${results.length === 1 ? 'topic' : 'topics'} reviewed`
                  : `Topic ${topicIdx + 1} of ${queue.length}${!recallMode && !result ? ` · card ${cardIdx + 1} of ${cards.length}` : ''}`}
              </span>
            </div>
            <div className="h-3 bg-white border-2 border-[#1C1A17] overflow-hidden">
              <div className="h-full bg-[#4C5E24] transition-all duration-300" style={{ width: `${finished ? 100 : progressPct}%` }} />
            </div>
          </div>
          <button
            onClick={onClose}
            className="retro-btn-press px-3 py-1.5 bg-white border-2 border-[#1C1A17] rounded-lg text-xs font-bold cursor-pointer shadow-[2px_2px_0px_0px_#1C1A17] shrink-0"
            title="Close (Esc). Topics you've finished are already saved."
          >
            Close
          </button>
        </div>

        {finished ? (
          <div className="p-6 sm:p-8 space-y-5">
            <div className="text-center space-y-2">
              <span className="text-5xl block">🏆</span>
              <h3 className="text-xl font-black">Review done</h3>
              <p className="text-sm text-[#7C7468] font-bold">Each topic is scheduled for its next review.</p>
            </div>
            <ul className="space-y-2">
              {results.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-3 bg-white border-2 border-[#1C1A17] rounded-xl px-4 py-2.5">
                  <span className="font-bold text-sm truncate">{r.title}</span>
                  <span className="flex items-center gap-2 shrink-0 text-xs font-bold">
                    <span className={`px-2 py-0.5 rounded border border-[#1C1A17]/20 ${LEVEL_STYLE[r.level]}`}>{LEVEL_LABEL[r.level]}</span>
                    <span className="text-[#7C7468]">in {formatInterval(r.days)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="text-center">
              <button
                onClick={onClose}
                className="retro-btn-press px-6 py-3 bg-[#1C1A17] text-white border-2 border-[#1C1A17] rounded-xl text-sm font-bold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        ) : ref ? (
          <div className="p-5 sm:p-6 space-y-4">
            {/* Topic context */}
            <div className="flex items-center gap-2 flex-wrap text-xs font-bold text-[#7C7468]">
              <span className="text-[10px] font-pixel bg-white text-[#1C1A17] border-2 border-[#1C1A17] px-2 py-0.5 rounded">
                {course?.code || ref.record.courseId}
              </span>
              <span>Week {ref.record.weekNumber}</span>
              <span className="text-[#1C1A17] truncate">· {ref.sub.title}</span>
            </div>

            {result ? (
              /* Topic result */
              <div className="bg-white border-4 border-[#1C1A17] rounded-2xl p-6 text-center space-y-3 shadow-[3px_3px_0px_0px_#1C1A17]">
                <p className="text-xs font-bold text-[#7C7468] uppercase">
                  {result.cards > 0 ? `Topic rating from ${result.cards} ${result.cards === 1 ? 'card' : 'cards'}` : 'Topic rating'}
                </p>
                <p className={`inline-block text-lg font-black px-4 py-1.5 rounded-xl border-2 border-[#1C1A17] ${LEVEL_STYLE[result.level]}`}>
                  {LEVEL_LABEL[result.level]}
                </p>
                <p className="text-sm font-bold">Next review in {formatInterval(result.days)}</p>
                {result.cards > 0 && (
                  <p className="text-xs text-[#7C7468] font-bold">Cards you found Hard count a little extra.</p>
                )}
                <button
                  onClick={nextTopic}
                  className="retro-btn-press w-full py-3.5 mt-2 bg-[#1C1A17] text-white border-2 border-[#1C1A17] rounded-xl text-sm font-bold cursor-pointer"
                >
                  {nextLabel} <span className="opacity-60 font-normal ml-1 hidden sm:inline">(Space)</span>
                </button>
              </div>
            ) : (
              <>
                {/* Front */}
                <div className="bg-white border-4 border-[#1C1A17] rounded-2xl p-5 sm:p-6 min-h-[120px] flex flex-col justify-center shadow-[3px_3px_0px_0px_#1C1A17]">
                  {recallMode ? (
                    <>
                      <p className="text-xs font-bold text-[#7C7468] uppercase mb-1">Explain from memory</p>
                      <h3 className="text-xl font-black leading-snug">{ref.sub.title}</h3>
                      <p className="text-xs text-[#7C7468] font-bold mt-2">This topic has no flashcards or answered questions yet. Recall the key ideas, then check your notes.</p>
                    </>
                  ) : (
                    <p className="text-lg sm:text-xl font-bold leading-snug whitespace-pre-wrap">{card?.front}</p>
                  )}
                </div>

                {/* Back */}
                {revealed && (
                  <div className="bg-[#FFFDF8] border-2 border-[#1C1A17]/30 rounded-2xl p-5 sm:p-6 max-h-[45vh] overflow-y-auto text-base">
                    {recallMode ? (
                      <div className="space-y-4">
                        {ref.sub.summary?.trim() && (
                          <div>
                            <p className="text-[10px] font-bold uppercase text-[#7C7468] mb-1">Your summary</p>
                            <MarkdownView content={ref.sub.summary} />
                          </div>
                        )}
                        <MarkdownView content={ref.sub.notesMarkdown || '_No notes yet._'} />
                      </div>
                    ) : (
                      <p className="font-medium whitespace-pre-wrap leading-relaxed">{card?.back}</p>
                    )}
                  </div>
                )}

                {/* Actions */}
                {!revealed ? (
                  <button
                    onClick={() => setRevealed(true)}
                    className="retro-btn-press w-full py-3.5 bg-[#1C1A17] text-white border-2 border-[#1C1A17] rounded-xl text-sm font-bold cursor-pointer"
                  >
                    Show answer <span className="opacity-60 font-normal ml-1 hidden sm:inline">(Space)</span>
                  </button>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {RATING_BUTTONS.map(b => (
                      <button
                        key={b.rating}
                        disabled={saving}
                        onClick={() => rate(b.rating)}
                        className={`retro-btn-press py-3 border-2 border-[#1C1A17] rounded-xl cursor-pointer shadow-[2px_2px_0px_0px_#1C1A17] disabled:opacity-50 ${b.className}`}
                      >
                        <div className="text-sm font-black">{b.label}</div>
                        <div className="text-[11px] font-bold opacity-80">
                          {b.hint}<span className="hidden sm:inline opacity-60"> · {b.key}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
