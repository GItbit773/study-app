import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Calendar, AlertTriangle, Trash2, ShieldAlert } from 'lucide-react';
import { Course, Deadline } from '../types';

interface TermCalendarProps {
  deadlines: Deadline[];
  courses: Course[];
  simulatedTodayString: string;
  getCourseColors: (colorKey: string) => { bg: string; border: string; accent: string; text: string; gradient: string };
  onAddEvent: (event: Omit<Deadline, 'id'>) => Promise<void>;
  onDeleteEvent: (id: number) => Promise<void>;
}

function formatDateDDMMYYYY(dateInput: Date | string | number | null | undefined): string {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function TermCalendar({
  deadlines,
  courses,
  simulatedTodayString,
  getCourseColors,
  onAddEvent,
  onDeleteEvent,
}: TermCalendarProps) {
  // Use simulated date as initial anchor month
  const simDateObj = new Date(simulatedTodayString);
  const [currentYear, setCurrentYear] = useState<number>(simDateObj.getFullYear() || 2026);
  const [currentMonth, setCurrentMonth] = useState<number>(simDateObj.getMonth() || 5); // 0-indexed

  // Event modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventCourseId, setNewEventCourseId] = useState(courses[0]?.id || 'GENERAL');
  const [newEventDate, setNewEventDate] = useState(simulatedTodayString);
  const [newEventType, setNewEventType] = useState<'assignment' | 'exam' | 'event'>('event');

  // Month navigation helpers
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay(); // 0 is Sunday
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  // Create calendar grids
  const calendarCells: { date: Date | null; dayNum: number | null; isToday: boolean }[] = [];

  // Padding for last month's trailing days
  for (let i = 0; i < firstDayIndex; i++) {
    calendarCells.push({ date: null, dayNum: null, isToday: false });
  }

  // Active days
  const simYear = simDateObj.getFullYear();
  const simMonth = simDateObj.getMonth();
  const simDay = simDateObj.getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const isToday =
      currentYear === simYear &&
      currentMonth === simMonth &&
      day === simDay;

    calendarCells.push({
      date: new Date(currentYear, currentMonth, day),
      dayNum: day,
      isToday,
    });
  }

  // Handle addition
  const handleSubmitEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim()) return;

    await onAddEvent({
      courseId: newEventCourseId,
      title: newEventTitle.trim(),
      dueDate: new Date(newEventDate).toISOString(),
      completed: false,
      type: newEventType,
    });

    // Reset and close
    setNewEventTitle('');
    setShowAddModal(false);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden" id="dashboard-term-calendar">
      {/* Calendar Header Section */}
      <div className="bg-slate-900 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-white border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-amber-500/10 text-amber-400 rounded-lg">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-display font-bold text-sm md:text-base tracking-tight text-white">Academic Calendar & Term Milestone Tracker</h3>
            <p className="text-xs text-slate-400 font-sans mt-0.5">Visualize exam clusters, problem sets, and personal review items.</p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          <div className="flex items-center gap-1.5 bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-700 text-xs">
            <button
              onClick={handlePrevMonth}
              className="p-1 hover:bg-slate-700 rounded text-slate-300 transition-colors cursor-pointer"
              title="Previous Month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-semibold px-2 min-w-[120px] text-center font-mono">
              {monthNames[currentMonth]} {currentYear}
            </span>
            <button
              onClick={handleNextMonth}
              className="p-1 hover:bg-slate-700 rounded text-slate-300 transition-colors cursor-pointer"
              title="Next Month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={() => {
              setNewEventDate(simulatedTodayString);
              setNewEventType('event');
              setNewEventTitle('');
              setShowAddModal(true);
            }}
            className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1 transition-all cursor-pointer shadow-sm shadow-amber-950/20"
          >
            <Plus className="h-3.5 w-3.5" /> Add Milestone
          </button>
        </div>
      </div>

      {/* Grid Canvas */}
      <div className="p-4 bg-slate-50/50">
        <div className="grid grid-cols-7 gap-1 text-center font-mono text-xs font-bold text-slate-500 mb-2 py-1 border-b border-slate-200">
          <div>SUN</div>
          <div>MON</div>
          <div>TUE</div>
          <div>WED</div>
          <div>THU</div>
          <div>FRI</div>
          <div>SAT</div>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {calendarCells.map((cell, idx) => {
            const hasDate = cell.date !== null;
            let dayDeadlines: Deadline[] = [];

            if (hasDate && cell.date) {
              const cellDayStr = cell.date.toISOString().split('T')[0];
              dayDeadlines = deadlines.filter(dl => dl.dueDate.split('T')[0] === cellDayStr);
            }

            // Detect if cell day has exams
            const hasExam = dayDeadlines.some(dl => dl.type === 'exam');

            return (
              <div
                key={idx}
                className={`min-h-[90px] rounded-xl border p-2 flex flex-col justify-between transition-all ${
                  !hasDate
                    ? 'bg-slate-100/40 border-transparent opacity-30 cursor-not-allowed'
                    : cell.isToday
                    ? 'bg-amber-50/70 border-amber-400 shadow-sm ring-1 ring-amber-400/30'
                    : hasExam
                    ? 'bg-red-50/40 border-red-200 hover:border-red-300'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Day Number Row */}
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded-md ${
                      cell.isToday
                        ? 'bg-slate-950 text-amber-400 shadow-sm'
                        : hasExam
                        ? 'bg-red-500 text-white font-black'
                        : 'text-slate-500'
                    }`}
                  >
                    {cell.dayNum}
                  </span>
                  {cell.isToday && (
                    <span className="text-[9px] font-mono tracking-wider font-extrabold uppercase text-amber-600 bg-amber-100 px-1 py-0.2 rounded-sm border border-amber-300/40">
                      TODAY
                    </span>
                  )}
                </div>

                {/* Day events stack */}
                <div className="mt-1.5 space-y-1 select-none flex-1 flex flex-col justify-end">
                  {dayDeadlines.slice(0, 3).map((dl) => {
                    const targetCourse = courses.find(c => c.id === dl.courseId);
                    const isExam = dl.type === 'exam';

                    // Style depending on type and completion
                    return (
                      <div
                        key={dl.id}
                        title={`${isExam ? '⚠️ HIGH URGENCY EXAM: ' : ''}${dl.title} (${targetCourse ? targetCourse.code : 'General'})`}
                        className={`text-[10px] truncate px-1.5 py-0.5 rounded border transition-shadow ${
                          dl.completed
                            ? 'bg-slate-100 text-slate-400 border-slate-250 line-through opacity-80'
                            : isExam
                            ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white border-red-700 font-extrabold shadow-sm animate-pulse-ring'
                            : 'bg-amber-500/10 text-amber-950 border-amber-500/30 font-semibold'
                        }`}
                      >
                        <div className="flex items-center gap-0.5 leading-none">
                          {isExam ? '🚨 ' : null}
                          {dl.completed ? '✓ ' : null}
                          <span className="truncate">{dl.title}</span>
                        </div>
                      </div>
                    );
                  })}
                  {dayDeadlines.length > 3 && (
                    <p className="text-[9px] font-mono font-bold text-slate-400 text-center">
                      +{dayDeadlines.length - 3} more
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Side-by-Side: Legends & Upcoming Milestone List for context */}
      <div className="border-t border-slate-200 bg-white grid grid-cols-1 md:grid-cols-2 p-5 gap-6 text-xs text-slate-600">
        <div className="space-y-3">
          <h4 className="font-display font-bold text-slate-800 text-xs uppercase tracking-wider">Milestone Categories & Visual Legend</h4>
          <div className="grid grid-cols-2 gap-2 text-slate-500">
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-amber-500 text-white flex items-center justify-center text-[7px] font-mono font-bold border border-amber-600/30">✓</span>
              <span>General Assignment / Task</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-red-600 border border-red-700 animate-pulse flex items-center justify-center text-[7px] text-white">🔥</span>
              <span className="font-bold text-red-600">🚨 EXAM Cluster Key (DANGER)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-slate-950 border border-slate-800 flex items-center justify-center text-[8px] text-amber-400 font-mono">1</span>
              <span>Today indicator date card</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-slate-100 border border-slate-350 opacity-80"></span>
              <span className="line-through text-slate-400">Completed items</span>
            </div>
          </div>
        </div>

        <div className="space-y-3.5">
          <h4 className="font-display font-bold text-slate-800 text-xs uppercase tracking-wider">Schedule Quick-Lookup Desk</h4>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {deadlines.filter(dl => !dl.completed).sort((a,b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()).slice(0, 5).map(dl => {
              const dateObj = new Date(dl.dueDate);
              const isExam = dl.type === 'exam';
              return (
                <div key={dl.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200/60 font-sans">
                  <div className="flex items-center gap-2">
                    {isExam ? (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-red-100 text-red-700 border border-red-300 animate-pulse">
                        EXAM
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-200 text-slate-700 border border-slate-300">
                        TASK
                      </span>
                    )}
                    <span className={`font-medium ${isExam ? 'text-rose-950 font-bold' : 'text-slate-700'}`}>{dl.title}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-slate-500 font-bold">
                      {formatDateDDMMYYYY(dateObj)}
                    </span>
                    <button
                      onClick={() => onDeleteEvent(dl.id!)}
                      className="text-slate-300 hover:text-red-500 cursor-pointer transition-colors p-0.5"
                      title="Remove event"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
            {deadlines.filter(dl => !dl.completed).length === 0 && (
              <p className="text-slate-400 italic text-center py-2">No upcoming student milestones listed.</p>
            )}
          </div>
        </div>
      </div>

      {/* Interactive Modal to Create Milestones */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden text-xs">
            <div className="bg-slate-900 px-5 py-4 flex items-center justify-between text-white border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-amber-400" />
                <span className="font-display font-bold text-sm tracking-tight">Add Personal Term Calendar Event</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitEvent} className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-slate-600 font-bold block bg-amber-500/5 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider text-amber-700">Urgency Mode Select:</label>
                <div className="grid grid-cols-3 gap-2 mt-1.5">
                  <button
                    type="button"
                    onClick={() => setNewEventType('event')}
                    className={`p-2 rounded-lg border font-bold transition-all text-center ${
                      newEventType === 'event'
                        ? 'bg-amber-100 text-amber-950 border-amber-400 font-extrabold'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    📝 Task
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewEventType('assignment')}
                    className={`p-2 rounded-lg border font-bold transition-all text-center ${
                      newEventType === 'assignment'
                        ? 'bg-amber-100 text-amber-950 border-amber-400 font-extrabold'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    📅 Homework
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewEventType('exam')}
                    className={`p-2 rounded-lg border font-bold transition-all text-center relative overflow-hidden ${
                      newEventType === 'exam'
                        ? 'bg-red-600 text-white border-red-700 font-black shadow-md ring-2 ring-red-300'
                        : 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100 font-black'
                    }`}
                  >
                    🚨 EXAM !!
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-600 font-semibold block">Milestone Title</label>
                <input
                  type="text"
                  required
                  placeholder={newEventType === 'exam' ? 'e.g. Midterm Examination Phase' : 'e.g. Problem Set 2 Submission'}
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                  className="w-full bg-slate-50 px-3 py-2 border border-slate-200 rounded-lg hover:border-slate-300 focus:outline-none focus:border-amber-500 focus:bg-white text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-600 font-semibold block">Relevant Subject / Context</label>
                  <select
                    value={newEventCourseId}
                    onChange={(e) => setNewEventCourseId(e.target.value)}
                    className="w-full bg-slate-50 px-2.5 py-2 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-amber-500"
                  >
                    <option value="GENERAL">General/No Subject</option>
                    {courses.map(c => (
                      <option key={c.id} value={c.id}>{c.code} ({c.name.substring(0, 15)})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-600 font-semibold block">Due / Event Date String</label>
                  <input
                    type="date"
                    required
                    value={newEventDate}
                    onChange={(e) => setNewEventDate(e.target.value)}
                    className="w-full bg-slate-50 px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-150 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 rounded-xl font-black transition-all cursor-pointer text-white shadow-md ${
                    newEventType === 'exam'
                      ? 'bg-rose-600 hover:bg-rose-700 font-black'
                      : 'bg-slate-900 hover:bg-amber-500 hover:text-slate-950 font-bold'
                  }`}
                >
                  Save Milestone
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
