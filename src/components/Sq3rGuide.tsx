import React, { useEffect, useRef, useState } from 'react';
import { Check, Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import type { Sq3rProgress, SubTopic } from '../types';
import { LEVEL_LABEL, SQ3R_STEPS, formatInterval, parseLocalDate, previewLevels, sq3rStepsDone, subTopicReviewState, type Level } from '../srs';

interface Sq3rGuideProps {
  sub: SubTopic;
  today: string;
  onUpdate: (sq3r: Sq3rProgress) => void;
  onRate: (level: Level) => void;
}

const EMPTY: Sq3rProgress = { surveyNotes: '', surveyDone: false, questions: [], readDone: false, reciteDone: false };

const STEP_HELP = [
  'Skim before you read: headings, bold terms, diagrams, the intro and the summary. Jot down what this topic seems to be about.',
  'Turn each subheading into a question you want the reading to answer. For example "Cell membrane" becomes "What does the cell membrane do?"',
  'Now read properly, one section at a time, and answer each question as you go.',
  'Cover your answers. Ask yourself each question and answer out loud, then check. Fix any answer you got wrong.',
  'Rate how well you know this topic. This concludes it and adds it to your review rotation. It will come back in "What are we doing today?" when it is due.',
];

const LEVEL_BTN: Record<Level, string> = {
  RED: 'bg-[#FFF0EF] text-[#9E2A2B] hover:bg-[#FFE4E1]',
  YELLOW: 'bg-[#FFF4E5] text-[#B85A12] hover:bg-[#FFEBD1]',
  GREEN: 'bg-[#EEF7EA] text-[#2F6B24] hover:bg-[#E1F0DA]',
};
const LEVEL_ACTIVE: Record<Level, string> = {
  RED: 'bg-[#9E2A2B] text-white',
  YELLOW: 'bg-[#B85A12] text-white',
  GREEN: 'bg-[#2F6B24] text-white',
};

export function Sq3rGuide({ sub, today, onUpdate, onRate }: Sq3rGuideProps) {
  const [data, setData] = useState<Sq3rProgress>({ ...EMPTY, ...(sub.sq3r || {}) });
  const done = sq3rStepsDone({ ...sub, sq3r: data });
  const [step, setStep] = useState(() => {
    const firstOpen = done.findIndex(d => !d);
    return firstOpen === -1 ? 4 : firstOpen;
  });
  const [shown, setShown] = useState<Record<number, boolean>>({});

  // Debounced save for typing; immediate for button presses
  const timer = useRef<number | null>(null);
  const latest = useRef(data);
  latest.current = data;
  const save = (next: Sq3rProgress, immediate = false) => {
    setData(next);
    if (timer.current) window.clearTimeout(timer.current);
    if (immediate) onUpdate(next);
    else timer.current = window.setTimeout(() => onUpdate(latest.current), 500);
  };
  useEffect(() => () => {
    if (timer.current) { window.clearTimeout(timer.current); onUpdate(latest.current); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const questions = data.questions;
  const setQuestion = (i: number, patch: Partial<{ q: string; a: string }>) =>
    save({ ...data, questions: questions.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const addQuestion = () => save({ ...data, questions: [...questions, { q: '', a: '' }] }, true);
  const removeQuestion = (i: number) => save({ ...data, questions: questions.filter((_, j) => j !== i) }, true);

  const goNext = (patch: Partial<Sq3rProgress> = {}) => {
    save({ ...data, ...patch }, true);
    setStep(s => Math.min(4, s + 1));
  };

  const rated = sub.confidenceStatus !== 'NONE' ? (sub.confidenceStatus as Level) : null;
  const previews = previewLevels(sub, today);
  const state = subTopicReviewState(sub);
  const filledQuestions = questions.filter(x => x.q.trim());

  const btn = 'px-4 py-2 rounded-full text-xs font-bold cursor-pointer transition-colors';
  const primary = `${btn} bg-[#4C5E24] text-white hover:bg-[#3E4D1D]`;
  const area = 'w-full bg-[#FAF8F5] border border-[#E2DDD5] rounded-xl p-3 text-sm text-[#1C1A17] focus:outline-none focus:border-[#4C5E24]';

  return (
    <div className="bg-white border border-[#E2DDD5] rounded-3xl p-4 md:p-6 space-y-5">
      {/* Stepper */}
      <ol className="grid grid-cols-5 gap-1.5">
        {SQ3R_STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => setStep(i)}
              className={`w-full flex flex-col items-center gap-1 py-2 rounded-xl cursor-pointer transition-colors ${step === i ? 'bg-[#F1F4EA]' : 'hover:bg-[#FAF8F5]'}`}
            >
              <span className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-black ${done[i] ? 'bg-[#4C5E24] text-white' : step === i ? 'bg-white text-[#4C5E24] ring-2 ring-[#4C5E24]' : 'bg-[#F2EEE8] text-[#7C7468]'}`}>
                {done[i] ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={`text-[11px] font-bold ${step === i ? 'text-[#1C1A17]' : 'text-[#7C7468]'}`}>{label}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="space-y-1">
        <h4 className="text-lg font-bold text-[#1C1A17]">{SQ3R_STEPS[step]}</h4>
        <p className="text-sm text-[#7C7468]">{STEP_HELP[step]}</p>
      </div>

      {step === 0 && (
        <div className="space-y-3">
          <textarea
            rows={4}
            value={data.surveyNotes}
            onChange={(e) => save({ ...data, surveyNotes: e.target.value })}
            placeholder="Main headings, key terms, what it's roughly about…"
            className={area}
          />
          <div className="flex justify-end">
            <button type="button" onClick={() => goNext({ surveyDone: true })} className={primary}>
              {data.surveyDone ? 'Next: Question' : 'Done surveying'}
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-2">
          {questions.length === 0 && <p className="text-sm text-[#9A9184] italic">No questions yet.</p>}
          {questions.map((x, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs font-black text-[#7C7468] w-5 text-right shrink-0">{i + 1}.</span>
              <input
                value={x.q}
                autoFocus={i === questions.length - 1 && !x.q}
                onChange={(e) => setQuestion(i, { q: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addQuestion(); } }}
                placeholder="Turn a subheading into a question…"
                className="flex-1 bg-[#FAF8F5] border border-[#E2DDD5] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#4C5E24]"
              />
              <button type="button" onClick={() => removeQuestion(i)} className="p-2 rounded-lg text-[#9A9184] hover:text-[#9E2A2B] hover:bg-[#FFF0EF] cursor-pointer" aria-label="Remove question">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1">
            <button type="button" onClick={addQuestion} className={`${btn} border border-[#E2DDD5] text-[#1C1A17] hover:bg-[#FAF7F2] flex items-center gap-1`}>
              <Plus className="h-3.5 w-3.5" /> Add question
            </button>
            <button type="button" disabled={filledQuestions.length === 0} onClick={() => goNext()} className={`${primary} disabled:opacity-40 disabled:cursor-not-allowed`}>
              Next: Read
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          {filledQuestions.length === 0 ? (
            <p className="text-sm text-[#9A9184] italic">Add your questions in the Question step first.</p>
          ) : questions.map((x, i) => x.q.trim() && (
            <div key={i} className="space-y-1.5">
              <p className="text-sm font-bold text-[#1C1A17]">{i + 1}. {x.q}</p>
              <textarea
                rows={2}
                value={x.a}
                onChange={(e) => setQuestion(i, { a: e.target.value })}
                placeholder="Your answer, in your own words…"
                className={area}
              />
            </div>
          ))}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-[#7C7468]">Answered questions become review cards for this topic.</p>
            <button type="button" onClick={() => goNext({ readDone: true })} className={primary}>
              {data.readDone ? 'Next: Recite' : 'Done reading'}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-2.5">
          {filledQuestions.length === 0 && <p className="text-sm text-[#9A9184] italic">No questions to recite yet.</p>}
          {questions.map((x, i) => x.q.trim() && (
            <div key={i} className="border border-[#EFEBE4] rounded-xl p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-bold text-[#1C1A17]">{i + 1}. {x.q}</p>
                <button
                  type="button"
                  onClick={() => setShown(s => ({ ...s, [i]: !s[i] }))}
                  className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-[#4C5E24] px-2 py-1 rounded-lg hover:bg-[#F1F4EA] cursor-pointer"
                >
                  {shown[i] ? <><EyeOff className="h-3.5 w-3.5" /> Hide</> : <><Eye className="h-3.5 w-3.5" /> Check</>}
                </button>
              </div>
              {shown[i] && <p className="text-sm text-[#3F3A33] whitespace-pre-wrap">{x.a.trim() || <em className="text-[#9A9184]">No answer written yet.</em>}</p>}
            </div>
          ))}
          <div className="flex justify-end pt-1">
            <button type="button" onClick={() => goNext({ reciteDone: true })} className={primary}>
              {data.reciteDone ? 'Next: Review' : 'Done reciting'}
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {(['RED', 'YELLOW', 'GREEN'] as Level[]).map(level => (
              <button
                key={level}
                type="button"
                onClick={() => onRate(level)}
                className={`rounded-2xl py-3 px-2 cursor-pointer transition-colors ${rated === level ? LEVEL_ACTIVE[level] : LEVEL_BTN[level]}`}
              >
                <div className="text-sm font-black">{LEVEL_LABEL[level]}</div>
                <div className="text-[11px] font-bold opacity-80">back in {formatInterval(previews[level])}</div>
              </button>
            ))}
          </div>
          {rated && state ? (
            <p className="text-sm text-[#3F3A33]">
              <strong>In your review rotation.</strong> Rated {LEVEL_LABEL[rated]}; next review{' '}
              {parseLocalDate(state.due).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}.
              {' '}Changing your rating today replaces today's rating.
            </p>
          ) : (
            <p className="text-sm text-[#7C7468]">Not in your review rotation yet. Pick a rating to conclude this topic.</p>
          )}
        </div>
      )}
    </div>
  );
}
