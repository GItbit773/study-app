import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Calendar, AlertTriangle, Trash2 } from 'lucide-react';
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
    <div className="bg-[#FAF6EE] border-4 border-[#1C1A17] rounded-3xl shadow-[6px_6px_0px_0px_#1C1A17] overflow-hidden" id="dashboard-term-calendar">
      {/* Calendar Header Section */}
      <div className="bg-[#FFF4E5] px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-4 border-[#1C1A17]">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 text-amber-600 rounded-xl border-2 border-[#1C1A17]">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-pixel text-xs text-slate-800 tracking-tight">Academic Calendar & Term Milestones</h3>
            <p className="text-xs text-slate-500 font-bold mt-1">Visualize exam clusters, homework sets, and student review items.</p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border-2 border-[#1C1A17] text-xs font-bold text-slate-700 shadow-[2px_2px_0px_0px_#1C1A17]">
            <button
              onClick={handlePrevMonth}
              className="p-1 hover:bg-slate-100 rounded-full text-slate-500 hover:text-slate-850 transition-colors cursor-pointer"
              title="Previous Month"
              type="button"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-pixel text-[10px] px-2 min-w-[120px] text-center text-slate-850">
              {monthNames[currentMonth]} {currentYear}
            </span>
            <button
              onClick={handleNextMonth}
              className="p-1 hover:bg-slate-100 rounded-full text-slate-500 hover:text-slate-850 transition-colors cursor-pointer"
              title="Next Month"
              type="button"
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
            className="retro-btn-press px-4 py-2 bg-[#FF8C32] text-white border-2 border-[#1C1A17] rounded-xl text-xs font-bold shadow-[2px_2px_0px_0px_#1C1A17] cursor-pointer flex items-center gap-1.5"
            type="button"
          >
            <Plus className="h-4 w-4" /> Add Milestone
          </button>
        </div>
      </div>

      {/* Grid Canvas */}
      <div className="p-5 bg-white">
        <div className="grid grid-cols-7 gap-1 text-center font-pixel text-[9px] text-slate-400 mb-3 py-1 border-b-2 border-[#1C1A17]">
          <div>SUN</div>
          <div>MON</div>
          <div>TUE</div>
          <div>WED</div>
          <div>THU</div>
          <div>FRI</div>
          <div>SAT</div>
        </div>

        <div className="grid grid-cols-7 gap-2">
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
                className={`min-h-[105px] rounded-2xl border-2 p-2.5 flex flex-col justify-between transition-all ${
                  !hasDate
                    ? 'bg-slate-50/20 border-transparent opacity-30 cursor-not-allowed'
                    : cell.isToday
                    ? 'bg-[#FFF4E5] border-2 border-[#FF8C32] shadow-[2px_2px_0px_0px_#1C1A17]'
                    : hasExam
                    ? 'bg-[#FFF0EF] border-2 border-[#9E2A2B] hover:bg-[#FFEBEA] shadow-[2px_2px_0px_0px_#1C1A17]'
                    : 'bg-white border-[#1C1A17] hover:bg-slate-50/50 shadow-[2px_2px_0px_0px_#1C1A17]'
                }`}
              >
                {/* Day Number Row */}
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded border-2 ${
                      cell.isToday
                        ? 'bg-[#FF8C32] text-white border-[#1C1A17]'
                        : hasExam
                        ? 'bg-[#FFF0EF] text-[#9E2A2B] border-[#1C1A17]'
                        : 'text-slate-700 bg-slate-50 border-[#1C1A17]'
                    }`}
                  >
                    {cell.dayNum}
                  </span>
                  {cell.isToday && (
                    <span className="text-[7px] font-pixel bg-[#FFF4E5] border-2 border-[#1C1A17] px-1 py-0.5 rounded">
                      LIVE
                    </span>
                  )}
                </div>

                {/* Day events stack */}
                <div className="mt-2 space-y-1 select-none flex-1 flex flex-col justify-end">
                  {dayDeadlines.slice(0, 3).map((dl) => {
                    const targetCourse = courses.find(c => c.id === dl.courseId);
                    const isExam = dl.type === 'exam';

                    return (
                      <div
                        key={dl.id}
                        title={`${isExam ? '⚠️ EXAM: ' : ''}${dl.title} (${targetCourse ? targetCourse.code : 'General'})`}
                        className={`text-[10px] truncate px-1.5 py-0.5 rounded border-2 transition-all ${
                          dl.completed
                            ? 'bg-slate-50 text-slate-400 border-slate-200 line-through opacity-65'
                            : isExam
                            ? 'bg-red-500 text-white border-[#1C1A17] font-bold shadow-xs'
                            : 'bg-[#FFF4E5] text-slate-800 border-[#1C1A17] font-bold shadow-xs'
                        }`}
                      >
                        <div className="flex items-center gap-1 leading-none">
                          {isExam ? '🚨 ' : null}
                          {dl.completed ? '✓ ' : null}
                          <span className="truncate">{dl.title}</span>
                        </div>
                      </div>
                    );
                  })}
                  {dayDeadlines.length > 3 && (
                    <p className="text-[9px] text-slate-400 font-bold text-center pt-0.5">
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
      <div className="border-t-4 border-[#1C1A17] bg-[#FAF6EE] grid grid-cols-1 md:grid-cols-2 p-6 gap-6 text-xs text-slate-500">
        <div className="space-y-3">
          <h4 className="font-pixel text-[10px] text-slate-700 uppercase tracking-wider">Milestone Legend</h4>
          <div className="grid grid-cols-2 gap-2 text-slate-650">
            <div className="flex items-center gap-1.5">
              <span className="h-4.5 w-4.5 bg-[#FFF4E5] border-2 border-[#1C1A17] text-[#FF8C32] flex items-center justify-center text-[10px] font-bold rounded shadow-xs">✓</span>
              <span className="font-bold">General Assignment</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-4.5 w-4.5 bg-red-500 text-white border-2 border-[#1C1A17] flex items-center justify-center text-[10px] rounded shadow-xs">🚨</span>
              <span className="font-bold text-red-600">Major Exam (Priority)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-4.5 w-4.5 bg-[#FF8C32] rounded border-2 border-[#1C1A17] flex items-center justify-center text-[10px] text-white font-mono font-bold shadow-xs">1</span>
              <span className="font-bold">Today Indicator</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-4.5 w-4.5 bg-slate-50 border-2 border-[#1C1A17] rounded opacity-60"></span>
              <span className="line-through text-slate-400 font-bold opacity-65">Completed</span>
            </div>
          </div>
        </div>

        <div className="space-y-3.5">
          <h4 className="font-pixel text-[10px] text-slate-700 uppercase tracking-wider">Schedule Quick-Lookup</h4>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {deadlines.filter(dl => !dl.completed).sort((a,b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()).slice(0, 5).map(dl => {
              const dateObj = new Date(dl.dueDate);
              const isExam = dl.type === 'exam';
              return (
                <div key={dl.id} className="flex items-center justify-between p-2.5 rounded-xl bg-white border-2 border-[#1C1A17] font-sans shadow-[2px_2px_0px_0px_#1C1A17] hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-2">
                    {isExam ? (
                      <span className="px-2 py-0.5 rounded text-[8px] font-pixel bg-red-50 text-red-600 border border-red-200">
                        EXAM
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[8px] font-pixel bg-amber-50 text-[#FF8C32] border border-amber-100">
                        TASK
                      </span>
                    )}
                    <span className={`font-bold text-xs ${isExam ? 'text-red-700' : 'text-slate-800'}`}>{dl.title}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-slate-400 font-bold">
                      {formatDateDDMMYYYY(dateObj)}
                    </span>
                    <button
                      onClick={() => onDeleteEvent(dl.id!)}
                      className="text-slate-400 hover:text-red-500 cursor-pointer transition-colors p-1"
                      title="Remove event"
                      type="button"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
            {deadlines.filter(dl => !dl.completed).length === 0 && (
              <p className="text-slate-400 italic text-center font-bold py-2">No upcoming student milestones listed.</p>
            )}
          </div>
        </div>
      </div>

      {/* Interactive Modal to Create Milestones */}
      {showAddModal && (
        <div className="fixed inset-0 bg-[#1C1A17]/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-[6px_6px_0px_0px_#1C1A17] max-w-md w-full border-4 border-[#1C1A17] overflow-hidden text-xs">
            <div className="bg-[#FFF4E5] px-6 py-4.5 flex items-center justify-between text-[#1C1A17] border-b-4 border-[#1C1A17]">
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-[#FF8C32]" />
                <span className="font-pixel text-[11px]">Add Term Milestone</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-700 transition-colors font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitEvent} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-slate-500 font-bold block mb-1">Milestone Category:</label>
                <div className="grid grid-cols-3 gap-2 mt-1.5">
                  <button
                    type="button"
                    onClick={() => setNewEventType('event')}
                    className={`p-2.5 rounded-xl border-2 font-bold transition-all text-center cursor-pointer ${
                      newEventType === 'event'
                        ? 'bg-[#FFF4E5] border-[#FF8C32] text-[#FF8C32]'
                        : 'bg-white border-[#1C1A17] text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    📝 Task
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewEventType('assignment')}
                    className={`p-2.5 rounded-xl border-2 font-bold transition-all text-center cursor-pointer ${
                      newEventType === 'assignment'
                        ? 'bg-[#FFF4E5] border-[#FF8C32] text-[#FF8C32]'
                        : 'bg-white border-[#1C1A17] text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    📅 Homework
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewEventType('exam')}
                    className={`p-2.5 rounded-xl border-2 font-bold transition-all text-center relative overflow-hidden cursor-pointer ${
                      newEventType === 'exam'
                        ? 'bg-red-500 border-red-500 text-white'
                        : 'bg-red-50 border-red-100 text-red-600 hover:bg-red-100/50'
                    }`}
                  >
                    🚨 EXAM
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-600 font-bold block">Milestone Title</label>
                <input
                  type="text"
                  required
                  placeholder={newEventType === 'exam' ? 'e.g. Midterm Examination' : 'e.g. Problem Set 2 Submission'}
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                  className="w-full bg-slate-50 px-3.5 py-2 border-2 border-[#1C1A17] focus:border-[#FF8C32] focus:outline-none focus:bg-white rounded-xl text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-600 font-bold block">Relevant Subject / Course</label>
                  <select
                    value={newEventCourseId}
                    onChange={(e) => setNewEventCourseId(e.target.value)}
                    className="w-full bg-slate-50 px-3 py-2 border-2 border-[#1C1A17] rounded-xl text-slate-800 font-medium cursor-pointer focus:outline-none"
                  >
                    <option value="GENERAL">General/No Subject</option>
                    {courses.map(c => (
                      <option key={c.id} value={c.id}>{c.code} ({c.name.substring(0, 15)})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-600 font-bold block">Due Date</label>
                  <input
                    type="date"
                    required
                    value={newEventDate}
                    onChange={(e) => setNewEventDate(e.target.value)}
                    className="w-full bg-slate-50 px-3.5 py-2 border-2 border-[#1C1A17] rounded-xl text-slate-800 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-2.5 border-t-4 border-[#1C1A17]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="retro-btn-press px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border-2 border-[#1C1A17] rounded-xl font-bold cursor-pointer transition-all shadow-[2px_2px_0px_0px_#1C1A17]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`retro-btn-press px-5 py-2.5 rounded-xl text-xs font-bold cursor-pointer text-white transition-all shadow-[2px_2px_0px_0px_#1C1A17] ${
                    newEventType === 'exam'
                      ? 'bg-red-500 border-2 border-[#1C1A17]'
                      : 'bg-[#FF8C32] border-2 border-[#1C1A17]'
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
