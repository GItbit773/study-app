import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Repeat, X, Trash2 } from 'lucide-react';
import type { CalendarEvent, Course, Deadline, EventTag, TopicRecord } from '../types';
import { addDays, eventsOn, formatTime, isoToLocalDay, parseLocalDate, toLocalDateString } from '../srs';

export const TAGS: { tag: EventTag; label: string; color: string; bg: string }[] = [
  { tag: 'class', label: 'Class', color: '#1E6B9D', bg: '#EAF5FC' },
  { tag: 'study', label: 'Study', color: '#2F6B24', bg: '#EEF7EA' },
  { tag: 'priority', label: 'Priority', color: '#B85A12', bg: '#FFF4E5' },
  { tag: 'assignment', label: 'Assignment', color: '#6B3FA0', bg: '#F3EDFB' },
  { tag: 'exam', label: 'Exam', color: '#9E2A2B', bg: '#FFF0EF' },
  { tag: 'personal', label: 'Personal', color: '#57534E', bg: '#F2F0EC' },
];
export const tagStyle = (tag: EventTag) => TAGS.find(t => t.tag === tag) || TAGS[TAGS.length - 1];

type View = 'day' | 'week' | 'month';

interface PlannerCalendarProps {
  events: CalendarEvent[];
  deadlines: Deadline[];
  courses: Course[];
  topics: TopicRecord[];
  today: string;
  /** Default end date for weekly repeats (end of term). */
  termEnd: string;
  onSave: (ev: CalendarEvent) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  /** Lets other parts of the app open the editor (e.g. "Plan a study block"). */
  openRequest?: { draft: Partial<CalendarEvent>; nonce: number } | null;
}

const HOUR_START = 7;
const HOUR_END = 23; // exclusive
const ROW_H = 48;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const minutes = (hhmm?: string) => {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};
const hhmm = (mins: number) => `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

function startOfWeek(day: string): string {
  return addDays(day, -parseLocalDate(day).getDay());
}

export function PlannerCalendar({ events, deadlines, courses, topics, today, termEnd, onSave, onDelete, openRequest }: PlannerCalendarProps) {
  const [view, setView] = useState<View>(() => (typeof window !== 'undefined' && window.innerWidth < 768 ? 'day' : 'week'));
  const [anchor, setAnchor] = useState(today);
  const [draft, setDraft] = useState<CalendarEvent | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll the time grid to ~8am on first show
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = ROW_H * 1;
  }, [view]);

  useEffect(() => {
    if (openRequest) openEditor(openRequest.draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest?.nonce]);

  const days = useMemo(() => {
    if (view === 'day') return [anchor];
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [view, anchor]);

  const step = (dir: 1 | -1) => {
    if (view === 'day') setAnchor(a => addDays(a, dir));
    else if (view === 'week') setAnchor(a => addDays(a, 7 * dir));
    else {
      const d = parseLocalDate(anchor);
      d.setDate(1);
      d.setMonth(d.getMonth() + dir);
      setAnchor(toLocalDateString(d));
    }
  };

  const title = (() => {
    const a = parseLocalDate(anchor);
    if (view === 'month') return `${MONTHS[a.getMonth()]} ${a.getFullYear()}`;
    if (view === 'day') return a.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    const s = parseLocalDate(days[0]);
    const e = parseLocalDate(days[6]);
    return s.getMonth() === e.getMonth()
      ? `${s.getDate()}–${e.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()}`
      : `${s.getDate()} ${MONTHS[s.getMonth()].slice(0, 3)} – ${e.getDate()} ${MONTHS[e.getMonth()].slice(0, 3)} ${e.getFullYear()}`;
  })();

  const openEditor = (partial: Partial<CalendarEvent>) => {
    setDraft({
      title: '',
      date: today,
      tag: 'study',
      start: '09:00',
      end: '10:00',
      ...partial,
    });
  };

  const deadlinesOn = (day: string) => deadlines.filter(d => d.dueDate && isoToLocalDay(d.dueDate) === day);
  const courseCode = (id?: string) => (id ? courses.find(c => c.id === id)?.code || id : '');

  const EventChip = ({ ev, compact }: { ev: CalendarEvent; compact?: boolean }) => {
    const t = tagStyle(ev.tag);
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setDraft({ ...ev }); }}
        className="w-full text-left rounded-md px-1.5 py-0.5 text-[11px] leading-tight font-semibold truncate cursor-pointer hover:brightness-95"
        style={{ background: t.bg, color: t.color, borderLeft: `3px solid ${t.color}` }}
        title={`${ev.title}${ev.start ? ` · ${formatTime(ev.start)}` : ''}`}
      >
        {!compact && ev.start && <span className="opacity-70 mr-1">{formatTime(ev.start)}</span>}
        {ev.repeatWeekly && <Repeat className="inline h-2.5 w-2.5 mr-0.5 -mt-0.5" />}
        {ev.title}
      </button>
    );
  };

  const DeadlineChip = ({ d }: { d: Deadline }) => (
    <div
      className="w-full rounded-md px-1.5 py-0.5 text-[11px] leading-tight font-semibold truncate"
      style={{ background: d.type === 'exam' ? '#FFF0EF' : '#F3EDFB', color: d.type === 'exam' ? '#9E2A2B' : '#6B3FA0' }}
      title={`Due: ${d.title}`}
    >
      Due: {d.title}
    </div>
  );

  // ---------- Time grid (day / week) ----------
  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);

  const layoutDay = (day: string) => {
    const timed = eventsOn(events, day).filter(e => e.start);
    // Greedy lanes so overlapping events sit side by side
    const lanes: number[] = [];
    const placed = timed.map(ev => {
      const s = minutes(ev.start);
      const e = Math.max(s + 15, minutes(ev.end) || s + 60);
      let lane = lanes.findIndex(end => end <= s);
      if (lane === -1) { lane = lanes.length; lanes.push(e); } else lanes[lane] = e;
      return { ev, s, e, lane };
    });
    return { placed, laneCount: Math.max(1, lanes.length) };
  };

  const TimeGrid = () => (
    <div className="border border-[#E2DDD5] rounded-2xl overflow-hidden bg-white">
      {/* Day headers + all-day row */}
      <div className="grid border-b border-[#E2DDD5]" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))` }}>
        <div />
        {days.map(day => {
          const d = parseLocalDate(day);
          const isToday = day === today;
          const allDay = eventsOn(events, day).filter(e => !e.start);
          const dls = deadlinesOn(day);
          return (
            <div key={day} className="border-l border-[#EFEBE4] px-1 py-2 min-w-0">
              <button
                type="button"
                onClick={() => { setAnchor(day); setView('day'); }}
                className="w-full text-center cursor-pointer"
              >
                <div className={`text-[11px] font-bold uppercase ${isToday ? 'text-[#4C5E24]' : 'text-[#7C7468]'}`}>{WEEKDAYS[d.getDay()]}</div>
                <div className={`mx-auto mt-0.5 h-8 w-8 rounded-full flex items-center justify-center text-base font-bold ${isToday ? 'bg-[#4C5E24] text-white' : 'text-[#1C1A17]'}`}>{d.getDate()}</div>
              </button>
              <div className="mt-1 space-y-0.5">
                {allDay.map(ev => <EventChip key={`${ev.id}-${day}`} ev={ev} compact />)}
                {dls.map(dl => <DeadlineChip key={`dl-${dl.id}`} d={dl} />)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Hours */}
      <div ref={scrollRef} className="max-h-[560px] overflow-y-auto">
        <div className="grid relative" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))` }}>
          <div>
            {hours.map(h => (
              <div key={h} className="text-[10px] text-[#9A9184] font-semibold text-right pr-2 -translate-y-1.5" style={{ height: ROW_H }}>
                {h === HOUR_START ? '' : formatTime(hhmm(h * 60))}
              </div>
            ))}
          </div>
          {days.map(day => {
            const { placed, laneCount } = layoutDay(day);
            const nowMins = day === today ? new Date().getHours() * 60 + new Date().getMinutes() : -1;
            return (
              <div key={day} className="relative border-l border-[#EFEBE4]">
                {hours.map(h => (
                  <button
                    key={h}
                    type="button"
                    aria-label={`Add at ${formatTime(hhmm(h * 60))}`}
                    onClick={() => openEditor({ date: day, start: hhmm(h * 60), end: hhmm((h + 1) * 60) })}
                    className="block w-full border-t border-[#F2EEE8] hover:bg-[#F6F8F0] cursor-pointer"
                    style={{ height: ROW_H }}
                  />
                ))}
                {nowMins >= HOUR_START * 60 && nowMins < HOUR_END * 60 && (
                  <div className="absolute left-0 right-0 h-0.5 bg-[#C0392B] pointer-events-none z-10" style={{ top: ((nowMins - HOUR_START * 60) / 60) * ROW_H }} />
                )}
                {placed.map(({ ev, s, e, lane }) => {
                  const t = tagStyle(ev.tag);
                  const top = Math.max(0, ((s - HOUR_START * 60) / 60) * ROW_H);
                  const height = Math.max(20, ((Math.min(e, HOUR_END * 60) - Math.max(s, HOUR_START * 60)) / 60) * ROW_H - 2);
                  if (e <= HOUR_START * 60 || s >= HOUR_END * 60) return null;
                  const done = ev.doneDates?.includes(day);
                  return (
                    <button
                      key={`${ev.id}-${day}`}
                      type="button"
                      onClick={() => setDraft({ ...ev })}
                      className={`absolute rounded-lg px-1.5 py-1 text-left overflow-hidden cursor-pointer hover:brightness-95 ${done ? 'opacity-50' : ''}`}
                      style={{
                        top, height,
                        left: `calc(${(lane / laneCount) * 100}% + 2px)`,
                        width: `calc(${100 / laneCount}% - 4px)`,
                        background: t.bg, color: t.color, borderLeft: `3px solid ${t.color}`,
                      }}
                    >
                      <div className={`text-[11px] font-bold leading-tight truncate ${done ? 'line-through' : ''}`}>
                        {ev.repeatWeekly && <Repeat className="inline h-2.5 w-2.5 mr-0.5 -mt-0.5" />}{ev.title}
                      </div>
                      {height > 30 && (
                        <div className="text-[10px] font-semibold opacity-75 truncate">
                          {formatTime(ev.start)}–{formatTime(ev.end)}{ev.courseId ? ` · ${courseCode(ev.courseId)}` : ''}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ---------- Month grid ----------
  const MonthGrid = () => {
    const a = parseLocalDate(anchor);
    const first = toLocalDateString(new Date(a.getFullYear(), a.getMonth(), 1, 12));
    const gridStart = startOfWeek(first);
    const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
    return (
      <div className="border border-[#E2DDD5] rounded-2xl overflow-hidden bg-white">
        <div className="grid grid-cols-7 border-b border-[#E2DDD5]">
          {WEEKDAYS.map(w => <div key={w} className="text-[11px] font-bold uppercase text-[#7C7468] text-center py-2">{w}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map(day => {
            const d = parseLocalDate(day);
            const inMonth = d.getMonth() === a.getMonth();
            const isToday = day === today;
            const evs = eventsOn(events, day);
            const dls = deadlinesOn(day);
            const items = evs.length + dls.length;
            return (
              <div
                key={day}
                onClick={() => openEditor({ date: day, start: undefined, end: undefined })}
                className={`min-h-[92px] border-t border-l border-[#F2EEE8] p-1 cursor-pointer hover:bg-[#F6F8F0] ${inMonth ? '' : 'bg-[#FAF8F5]'}`}
              >
                <div className="flex justify-center mb-0.5">
                  <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${isToday ? 'bg-[#4C5E24] text-white' : inMonth ? 'text-[#1C1A17]' : 'text-[#B5AC9F]'}`}>
                    {d.getDate()}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {evs.slice(0, 3).map(ev => <EventChip key={`${ev.id}-${day}`} ev={ev} />)}
                  {dls.slice(0, Math.max(0, 3 - evs.length)).map(dl => <DeadlineChip key={`dl-${dl.id}`} d={dl} />)}
                  {items > 3 && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setAnchor(day); setView('day'); }}
                      className="text-[10px] font-bold text-[#7C7468] px-1 cursor-pointer hover:underline"
                    >
                      +{items - 3} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <section className="bg-white border border-[#E8E3D7] rounded-3xl p-4 md:p-6 shadow-sm space-y-4" id="calendar">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-xl font-bold text-[#1C1A17] mr-2">Calendar</h3>
          <button type="button" onClick={() => setAnchor(today)} className="px-3 py-1.5 rounded-full border border-[#E2DDD5] text-xs font-bold hover:bg-[#FAF7F2] cursor-pointer">Today</button>
          <button type="button" onClick={() => step(-1)} className="p-1.5 rounded-full hover:bg-[#FAF7F2] cursor-pointer" aria-label="Previous"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => step(1)} className="p-1.5 rounded-full hover:bg-[#FAF7F2] cursor-pointer" aria-label="Next"><ChevronRight className="h-4 w-4" /></button>
          <span className="text-sm font-bold text-[#1C1A17]">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-[#FAF7F2] border border-[#E2DDD5] rounded-full p-0.5">
            {(['day', 'week', 'month'] as View[]).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`px-3 py-1 rounded-full text-xs font-bold capitalize cursor-pointer ${view === v ? 'bg-white text-[#1C1A17] shadow-sm' : 'text-[#7C7468]'}`}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => openEditor({ date: view === 'month' ? today : anchor })}
            className="px-4 py-2 rounded-full bg-[#4C5E24] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:bg-[#3E4D1D]"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
      </div>

      <p className="text-xs text-[#7C7468] font-medium -mt-1">
        Click any time slot or day to add something. Entries tagged <strong style={{ color: '#2F6B24' }}>Study</strong> or <strong style={{ color: '#B85A12' }}>Priority</strong> appear in <em>What are we doing today?</em> on their day.
      </p>

      {view === 'month' ? MonthGrid() : TimeGrid()}

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] font-semibold text-[#7C7468]">
        {TAGS.map(t => (
          <span key={t.tag} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: t.color }} /> {t.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5"><Repeat className="h-3 w-3" /> Repeats weekly</span>
      </div>

      {draft && (
        <EventEditor
          draft={draft}
          courses={courses}
          topics={topics}
          termEnd={termEnd}
          onCancel={() => setDraft(null)}
          onSave={async (ev) => { await onSave(ev); setDraft(null); }}
          onDelete={draft.id != null ? async () => { await onDelete(draft.id!); setDraft(null); } : undefined}
        />
      )}
    </section>
  );
}

// ---------- Add / edit popup ----------

function EventEditor({ draft, courses, topics, termEnd, onCancel, onSave, onDelete }: {
  draft: CalendarEvent;
  courses: Course[];
  topics: TopicRecord[];
  termEnd: string;
  onCancel: () => void;
  onSave: (ev: CalendarEvent) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [ev, setEv] = useState<CalendarEvent>(draft);
  const allDay = !ev.start;
  const set = (patch: Partial<CalendarEvent>) => setEv(prev => ({ ...prev, ...patch }));

  const topicOptions = useMemo(() => topics
    .filter(t => !ev.courseId || t.courseId === ev.courseId)
    .sort((a, b) => a.courseId.localeCompare(b.courseId) || a.weekNumber - b.weekNumber)
    .flatMap(t => (t.subTopics || []).map(s => ({
      id: s.subTopicId,
      label: `${courses.find(c => c.id === t.courseId)?.code || t.courseId} · Wk ${t.weekNumber} · ${s.title}`,
      courseId: t.courseId,
    }))), [topics, courses, ev.courseId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let title = ev.title.trim();
    if (!title && ev.subTopicId) title = topicOptions.find(o => o.id === ev.subTopicId)?.label.split(' · ').pop() || '';
    if (!title) return;
    const clean: CalendarEvent = { ...ev, title };
    if (clean.start && clean.end && clean.end <= clean.start) clean.end = hhmm(minutes(clean.start) + 60);
    if (!clean.repeatWeekly) delete clean.repeatUntil;
    if (clean.tag !== 'study') delete clean.subTopicId;
    await onSave(clean);
  };

  const inputCls = 'w-full bg-[#FAF8F5] px-3 py-2 border border-[#E2DDD5] rounded-xl text-sm text-[#1C1A17] focus:outline-none focus:border-[#4C5E24]';

  return (
    <div className="fixed inset-0 z-50 bg-[#1C1A17]/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onCancel}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-xl p-5 space-y-4 max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h4 className="text-lg font-bold text-[#1C1A17]">{draft.id != null ? 'Edit entry' : 'New entry'}</h4>
          <button type="button" onClick={onCancel} className="p-1.5 rounded-full hover:bg-[#FAF7F2] cursor-pointer" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        <input
          autoFocus
          value={ev.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder={ev.tag === 'study' ? 'What are you studying? (or pick a topic below)' : 'Add title'}
          className="w-full text-lg font-semibold border-b-2 border-[#E2DDD5] focus:border-[#4C5E24] focus:outline-none py-1.5 bg-transparent"
        />

        <div className="flex flex-wrap gap-1.5">
          {TAGS.map(t => (
            <button
              key={t.tag}
              type="button"
              onClick={() => set({ tag: t.tag })}
              className="px-3 py-1 rounded-full text-xs font-bold cursor-pointer transition-colors"
              style={ev.tag === t.tag
                ? { background: t.color, color: '#fff' }
                : { background: t.bg, color: t.color }}
            >
              {t.label}
            </button>
          ))}
        </div>
        {(ev.tag === 'study' || ev.tag === 'priority') && (
          <p className="text-[11px] font-semibold text-[#4C5E24] -mt-2">Shows up in "What are we doing today?" on this day.</p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2 sm:col-span-1 text-xs font-bold text-[#7C7468] space-y-1">
            <span>Date</span>
            <input type="date" required value={ev.date} onChange={(e) => set({ date: e.target.value })} className={inputCls} />
          </label>
          <label className="col-span-2 sm:col-span-1 flex items-center gap-2 text-xs font-bold text-[#7C7468] sm:pt-5">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => set(e.target.checked ? { start: undefined, end: undefined } : { start: '09:00', end: '10:00' })}
            />
            All day
          </label>
          {!allDay && (
            <>
              <label className="text-xs font-bold text-[#7C7468] space-y-1">
                <span>Starts</span>
                <input type="time" value={ev.start || ''} onChange={(e) => set({ start: e.target.value })} className={inputCls} />
              </label>
              <label className="text-xs font-bold text-[#7C7468] space-y-1">
                <span>Ends</span>
                <input type="time" value={ev.end || ''} onChange={(e) => set({ end: e.target.value })} className={inputCls} />
              </label>
            </>
          )}
        </div>

        <label className="block text-xs font-bold text-[#7C7468] space-y-1">
          <span>Course (optional)</span>
          <select value={ev.courseId || ''} onChange={(e) => set({ courseId: e.target.value || undefined, subTopicId: undefined })} className={inputCls}>
            <option value="">None</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
          </select>
        </label>

        {ev.tag === 'study' && (
          <label className="block text-xs font-bold text-[#7C7468] space-y-1">
            <span>Topic to study (optional)</span>
            <select
              value={ev.subTopicId || ''}
              onChange={(e) => {
                const opt = topicOptions.find(o => o.id === e.target.value);
                set({ subTopicId: e.target.value || undefined, courseId: opt?.courseId || ev.courseId });
              }}
              className={inputCls}
            >
              <option value="">No specific topic</option>
              {topicOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
        )}

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs font-bold text-[#7C7468]">
            <input
              type="checkbox"
              checked={!!ev.repeatWeekly}
              onChange={(e) => set({ repeatWeekly: e.target.checked, repeatUntil: e.target.checked ? (ev.repeatUntil || termEnd) : undefined })}
            />
            Repeat every week (for your timetable)
          </label>
          {ev.repeatWeekly && (
            <label className="block text-xs font-bold text-[#7C7468] space-y-1 pl-6">
              <span>Until</span>
              <input type="date" value={ev.repeatUntil || ''} onChange={(e) => set({ repeatUntil: e.target.value })} className={inputCls} />
            </label>
          )}
          {draft.id != null && draft.repeatWeekly && (
            <p className="text-[11px] text-[#7C7468] pl-6">Changes apply to every week of this repeating entry.</p>
          )}
        </div>

        <div className="flex items-center justify-between pt-1">
          {onDelete ? (
            <button type="button" onClick={onDelete} className="flex items-center gap-1 text-xs font-bold text-[#9E2A2B] px-2 py-2 rounded-lg hover:bg-[#FFF0EF] cursor-pointer">
              <Trash2 className="h-3.5 w-3.5" /> Delete{draft.repeatWeekly ? ' all weeks' : ''}
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="px-4 py-2 rounded-full text-xs font-bold text-[#7C7468] hover:bg-[#FAF7F2] cursor-pointer">Cancel</button>
            <button type="submit" className="px-5 py-2 rounded-full bg-[#4C5E24] text-white text-xs font-bold cursor-pointer hover:bg-[#3E4D1D]">Save</button>
          </div>
        </div>
      </form>
    </div>
  );
}
