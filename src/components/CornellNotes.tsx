import React, { useEffect, useRef, useState } from 'react';
import { MarkdownView } from './MarkdownView';
import type { SubTopic } from '../types';

export interface NoteFields { notesMarkdown: string; cues: string; summary: string }

interface CornellNotesProps {
  sub: SubTopic;
  onSave: (fields: NoteFields) => void;
}

/**
 * Note sheet in three parts: main notes (largest), a margin for keywords and
 * questions, and a summary across the bottom. Saves automatically as you type.
 */
export function CornellNotes({ sub, onSave }: CornellNotesProps) {
  const [fields, setFields] = useState<NoteFields>({
    notesMarkdown: sub.notesMarkdown || '',
    cues: sub.cues || '',
    summary: sub.summary || '',
  });
  const isEmpty = !fields.cues.trim() && !fields.summary.trim() && fields.notesMarkdown.trim().length < 200;
  const [mode, setMode] = useState<'write' | 'read'>(isEmpty ? 'write' : 'read');
  const [status, setStatus] = useState<'saved' | 'saving' | null>(null);

  const timer = useRef<number | null>(null);
  const latest = useRef(fields);
  latest.current = fields;
  const dirty = useRef(false);

  const update = (patch: Partial<NoteFields>) => {
    setFields(f => ({ ...f, ...patch }));
    dirty.current = true;
    setStatus('saving');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      onSave(latest.current);
      dirty.current = false;
      setStatus('saved');
    }, 600);
  };

  // Save anything pending when leaving the topic
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
    if (dirty.current) onSave(latest.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const area = 'w-full h-full bg-transparent resize-none focus:outline-none text-sm leading-relaxed text-[#1C1A17] placeholder:text-[#B5AC9F]';
  const label = 'text-[10px] font-black uppercase tracking-wider text-[#7C7468] mb-2 block';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex bg-[#FAF7F2] border border-[#E2DDD5] rounded-full p-0.5">
          {(['write', 'read'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-3.5 py-1 rounded-full text-xs font-bold capitalize cursor-pointer ${mode === m ? 'bg-white text-[#1C1A17] shadow-sm' : 'text-[#7C7468]'}`}
            >
              {m}
            </button>
          ))}
        </div>
        <span className="text-[11px] font-semibold text-[#9A9184]">
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : mode === 'write' ? 'Saves as you type' : ''}
        </span>
      </div>

      <div className="bg-[#FFFEFB] border border-[#E2DDD5] rounded-3xl overflow-hidden shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,2.6fr)]">
          {/* Margin: keywords & questions */}
          <div className="order-2 md:order-1 p-4 md:p-5 bg-[#FAF6EE] border-t md:border-t-0 md:border-r border-[#E2DDD5] min-h-[140px] md:min-h-[420px] flex flex-col">
            <span className={label}>Keywords & questions</span>
            {mode === 'write' ? (
              <textarea
                value={fields.cues}
                onChange={(e) => update({ cues: e.target.value })}
                placeholder={'Key terms…\nQuestions to remember or ask…'}
                className={`${area} flex-1 min-h-[120px]`}
              />
            ) : fields.cues.trim() ? (
              <div className="text-sm"><MarkdownView content={fields.cues} /></div>
            ) : <p className="text-sm text-[#B5AC9F] italic">Nothing in the margin yet.</p>}
          </div>

          {/* Main notes */}
          <div className="order-1 md:order-2 p-4 md:p-6 min-h-[260px] md:min-h-[420px] flex flex-col">
            <span className={label}>Notes</span>
            {mode === 'write' ? (
              <textarea
                value={fields.notesMarkdown}
                onChange={(e) => update({ notesMarkdown: e.target.value })}
                placeholder="Take your notes here…"
                className={`${area} flex-1 min-h-[240px] font-mono text-[13px]`}
              />
            ) : <MarkdownView content={fields.notesMarkdown} />}
          </div>
        </div>

        {/* Summary */}
        <div className="p-4 md:p-5 border-t-2 border-[#E2DDD5] bg-white min-h-[110px] flex flex-col">
          <span className={label}>Summary</span>
          {mode === 'write' ? (
            <textarea
              value={fields.summary}
              onChange={(e) => update({ summary: e.target.value })}
              placeholder="Sum up this page in a few sentences, in your own words…"
              className={`${area} flex-1 min-h-[80px]`}
            />
          ) : fields.summary.trim() ? (
            <div className="text-sm"><MarkdownView content={fields.summary} /></div>
          ) : <p className="text-sm text-[#B5AC9F] italic">No summary yet. Writing one is the best test of whether you understood it.</p>}
        </div>
      </div>
      <p className="text-[11px] text-[#9A9184]">Tip: notes support Markdown, e.g. **bold**, - lists, # headings and $$math$$.</p>
    </div>
  );
}
