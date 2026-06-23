import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, seedDatabase } from './db';
import { Course, TopicRecord, Deadline, SubTopic, Flashcard, UrgentReview, QuizQuestion } from './types';
import { MarkdownView } from './components/MarkdownView';
import { TermCalendar } from './components/TermCalendar';
import { ModernLogo } from './components/ModernLogo';
import { 
  BookOpen, 
  Clock, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  Play, 
  ArrowLeft, 
  Edit, 
  Eye, 
  Plus, 
  Trash2, 
  ChevronRight, 
  ChevronDown, 
  Menu, 
  X, 
  ExternalLink,
  GraduationCap,
  Sparkles,
  Award,
  BookMarked,
  RotateCcw,
  Sliders,
  Settings,
  Download,
  Upload
} from 'lucide-react';

export function parseBulkFlashcardText(text: string): { front: string; back: string }[] {
  if (!text.trim()) return [];

  // Pre-process text to insert double newlines before digit-started list indicators 
  // to ensure blocks split correctly even if there are no blank lines
  const processedText = text
    .split('\n')
    .map((line, idx, arr) => {
      if (idx > 0 && /^\s*(?:\d+[\s.)-]|Question\s*\d+|Card\s*\d+|Q\d+[:.-])/i.test(line)) {
        const prevLine = arr[idx - 1].trim();
        // If previous line is not empty and doesn't look like a question or answer label, insert a blank space
        if (prevLine && !prevLine.match(/^\s*(?:Question|Q|Card|Answer|Back|A\s*[:.-])/i)) {
          return '\n' + line;
        }
      }
      return line;
    })
    .join('\n');

  const blocks = processedText.split(/(?:\s*\n\s*\n|\n-+\n)/).map(b => b.trim()).filter(Boolean);
  const cards: { front: string; back: string }[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    let frontVal = '';
    let backVal = '';

    const hasQuestionPrefix = lines.some(l => /^Question:?/i.test(l) || /^Card:?/i.test(l) || /^Q:?/i.test(l));
    const hasAnswerPrefix = lines.some(l => /^Answer:?/i.test(l) || /^Back:?/i.test(l) || /^A:?/i.test(l));

    if (hasQuestionPrefix || hasAnswerPrefix) {
      const frontLines: string[] = [];
      const backLines: string[] = [];
      let inBack = false;

      for (const line of lines) {
        if (/^(?:Question|Card|Q)\s*\d*[:.-]?/i.test(line)) {
          frontLines.push(line.replace(/^(?:Question|Card|Q)\s*\d*[:.-]?/i, '').trim());
          inBack = false;
        } else if (/^(?:Answer|Back|A)\s*\d*[:.-]?/i.test(line)) {
          backLines.push(line.replace(/^(?:Answer|Back|A)\s*\d*[:.-]?/i, '').trim());
          inBack = true;
        } else {
          if (inBack) {
            backLines.push(line);
          } else {
            frontLines.push(line);
          }
        }
      }
      frontVal = frontLines.join(' ').trim();
      backVal = backLines.join(' ').trim();
    } else {
      // General format: first line is Front, all remaining lines are Back
      frontVal = lines[0].replace(/^\s*(?:\d+[\s.)-]|Question|Card|Q)\s*\d*[:.-]?\s*/i, '').trim();
      if (lines.length > 1) {
        backVal = lines.slice(1).map(l => l.replace(/^\s*[-*]\s*/, '').trim()).join('\n').trim();
      }
    }

    if (frontVal && backVal) {
      cards.push({ front: frontVal, back: backVal });
    }
  }

  return cards;
}

export function formatDateDDMMYYYY(dateInput: Date | string | number | null | undefined): string {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function cleanOptionForDisplay(optText: string): string {
  if (!optText) return '';
  // Strip out any markers like "(Correct Answer)", "[Correct Answer]", "- Correct Answer", "Correct Answer" or just "(Correct)", "[Correct]", "- Correct"
  let clean = optText.replace(/\s*[-—–~:]?\s*[\(\[]?\s*correct\s*(?:answer)?\s*[\)\]]?/i, '').trim();
  // Strip out any remaining markdown asterisks or brackets if any
  clean = clean.replace(/^\s*[-*+•\s]+/, '').replace(/\[[xX]\]/g, '').replace(/\([xX]\)/g, '').trim();
  return clean;
}

export function parseBulkQuizText(text: string): QuizQuestion[] {
  if (!text.trim()) return [];

  // Group lines into question blocks
  const lines = text.split('\n').map(l => l.trim());
  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  for (const line of lines) {
    if (!line) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock);
        currentBlock = [];
      }
      continue;
    }

    // Check if line indicates a brand new question start when we already have a block of lines
    const isNewQuestionLine = /^\s*(?:Question|Q|Quiz)?\s*\d+[:.-]\s/i.test(line) || /^\s*Question\s*\d+\s*$/i.test(line);
    
    if (isNewQuestionLine && currentBlock.length >= 3) {
      // If we already have a question and options, start a new block
      blocks.push(currentBlock);
      currentBlock = [line];
    } else {
      currentBlock.push(line);
    }
  }
  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  const parsedQuestions: QuizQuestion[] = [];

  for (const blockLines of blocks) {
    if (blockLines.length < 2) continue;

    let questionText = '';
    const options: string[] = [];
    let correctOptionIndex = -1;
    let explicitAnsStr: string | null = null;

    // Detect if we have an explicit answer line like "Answer: A" or "Correct: Paris"
    const remainingLines: string[] = [];
    for (const line of blockLines) {
      const match = line.match(/^\s*(?:Correct\s*Answer|Answer|Correct|Key|CorrectOption)\s*[:.-]\s*(.*)$/i);
      if (match) {
        explicitAnsStr = match[1].trim();
      } else {
        remainingLines.push(line);
      }
    }

    if (remainingLines.length < 1) continue;

    // First line is always the question text
    questionText = remainingLines[0].replace(/^\s*(?:Question|Q|Quiz)?\s*\d*[:.-]?\s*/i, '').trim();

    // The rest are options
    const optionLines = remainingLines.slice(1);
    for (const line of optionLines) {
      // Check if this option is marked correct inline: prefixed with asterisk, containing [x], or containing "correct" variations
      const isInlineCorrect = line.startsWith('*') || 
                            line.includes('[x]') || 
                            line.includes('(x)') || 
                            /\b(?:correct\s*answer|correct)\b/i.test(line);

      // Clean the option text from brackets, asterisk, inline markers, and option label
      let cleanOpt = line
        .replace(/^\s*[-*+•\s]+/, '') // lead bullets or symbols
        .replace(/\[[xX]\]/g, '') // [x] marker
        .replace(/\([xX]\)/g, '') // (x) marker
        .trim();

      // Remove "(Correct Answer)", "[Correct Answer]", "- Correct Answer", "Correct Answer" or just "(Correct)", "[Correct]", "- Correct"
      cleanOpt = cleanOpt.replace(/\s*[-—–~:]?\s*[\(\[]?\s*correct\s*(?:answer)?\s*[\)\]]?/i, '').trim();

      // Check if it has an option letter label like "A. Paris" or "A) Paris" or "a - Paris"
      const labelMatch = cleanOpt.match(/^([a-df-z\d])\s*[.)-]\s*(.*)$/i) || cleanOpt.match(/^([a-df-z\d])\s+-\s+(.*)$/i);
      let optLetter: string | null = null;
      if (labelMatch) {
        optLetter = labelMatch[1].toUpperCase();
        cleanOpt = labelMatch[2].trim();
      }

      if (cleanOpt) {
        options.push(cleanOpt);
        const currentIdx = options.length - 1;

        if (isInlineCorrect) {
          correctOptionIndex = currentIdx;
        }

        // If we have an explicit answer letter like "A" or "Answer: A" matching the label
        if (explicitAnsStr) {
          const cleanAns = explicitAnsStr.replace(/^[.*()-\s]+|[.*()-\s]+$/g, '').trim().toUpperCase();
          if (optLetter && optLetter === cleanAns) {
            correctOptionIndex = currentIdx;
          } else if (cleanOpt.toLowerCase() === explicitAnsStr.toLowerCase()) {
            correctOptionIndex = currentIdx;
          }
        }
      }
    }

    if (correctOptionIndex === -1) {
      correctOptionIndex = 0; // Default to Option A if nothing is specified or found
    }

    if (questionText && options.length >= 2) {
      parsedQuestions.push({
        question: questionText,
        options,
        correctOptionIndex
      });
    }
  }

  return parsedQuestions;
}

export default function App() {
  // 1. Fetching Dexie DB live values
  const courses = useLiveQuery(() => db.courses.toArray());
  const topics = useLiveQuery(() => db.topics.toArray());
  const deadlines = useLiveQuery(() => db.deadlines.toArray());
  const settings = useLiveQuery(() => db.settings.toArray());
  const urgentReviews = useLiveQuery(() => db.urgentReviews.toArray());

  const [dbSeeded, setDbSeeded] = useState(false);

  // View state managers
  const [currentView, setCurrentView] = useState<'dashboard' | 'course'>('dashboard');
  const [selectedCourseId, setSelectedCourseId] = useState<string>('FIN302');
  
  // Workspace selection state
  const [activeSubTopicId, setActiveSubTopicId] = useState<string | null>(null);
  const [activeFlashcardsTopicId, setActiveFlashcardsTopicId] = useState<string | null>(null);
  const [expandedWeeks, setExpandedWeeks] = useState<Record<number, boolean>>({ 1: true });

  // Sidebar toggle state
  const [sidebarHidden, setSidebarHidden] = useState<boolean>(false);

  // Editor mode toggles
  const [editMode, setEditMode] = useState<boolean>(false);
  
  // Quiz states
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState<boolean>(false);
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const [quizPassed, setQuizPassed] = useState<boolean | null>(null);

  // Flashcards state
  const [flashcardIndex, setFlashcardIndex] = useState<number>(0);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);

  // Subtopic level flashcard states
  const [subFCIndex, setSubFCIndex] = useState<number>(0);
  const [subIsFlipped, setSubIsFlipped] = useState<boolean>(false);
  const [subFCAddMode, setSubFCAddMode] = useState<'single' | 'bulk'>('single');
  const [newSubFCFront, setNewSubFCFront] = useState<string>('');
  const [newSubFCBack, setNewSubFCBack] = useState<string>('');
  const [bulkSubFCText, setBulkSubFCText] = useState<string>('');
  


  // Quick action states
  const [newDeadlineTitle, setNewDeadlineTitle] = useState('');
  const [newDeadlineDate, setNewDeadlineDate] = useState('2026-06-18');
  const [newDeadlineTime, setNewDeadlineTime] = useState('12:00');
  const [newDeadlineCourseId, setNewDeadlineCourseId] = useState('FIN302');

  // Course customization states
  const [courseEditorActive, setCourseEditorActive] = useState<boolean>(false);
  const [customCourseId, setCustomCourseId] = useState<string>('');
  const [customCourseCode, setCustomCourseCode] = useState<string>('');
  const [customCourseName, setCustomCourseName] = useState<string>('');
  const [customCourseColor, setCustomCourseColor] = useState<string>('amber');

  // Urgent review action states
  const [newUrgentTitle, setNewUrgentTitle] = useState<string>('');
  const [newUrgentNotes, setNewUrgentNotes] = useState<string>('');
  const [newUrgentCourseId, setNewUrgentCourseId] = useState<string>('FIN302');

  // Custom simulation and calibration state
  const [simDate, setSimDate] = useState('2026-06-16'); // default system simulated date
  const [customStart, setCustomStart] = useState('2026-06-08'); 
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [customUserName, setCustomUserName] = useState('Alex Developer');

  // New item creators
  const [showAddSubTopicModal, setShowAddSubTopicModal] = useState(false);
  const [newSubTopicTitle, setNewSubTopicTitle] = useState('');
  const [newSubTopicWeek, setNewSubTopicWeek] = useState<number>(1);

  const [newFCFront, setNewFCFront] = useState('');
  const [newFCBack, setNewFCBack] = useState('');

  // Custom quiz question builder state
  const [newQuizQuestionPrompt, setNewQuizQuestionPrompt] = useState<string>('');
  const [newQuizOption1, setNewQuizOption1] = useState<string>('');
  const [newQuizOption2, setNewQuizOption2] = useState<string>('');
  const [newQuizOption3, setNewQuizOption3] = useState<string>('');
  const [newQuizOption4, setNewQuizOption4] = useState<string>('');
  const [newQuizCorrectIndex, setNewQuizCorrectIndex] = useState<number>(0);
  const [showViewModeQuizBuilder, setShowViewModeQuizBuilder] = useState<boolean>(false);
  const [activeViewTab, setActiveViewTab] = useState<'notes' | 'quiz' | 'flashcards'>('notes');

  // Bulk input and subject editing states
  const [syllabusEditorMode, setSyllabusEditorMode] = useState<boolean>(false);
  const [quizAddMode, setQuizAddMode] = useState<'single' | 'bulk'>('single');
  const [flashcardAddMode, setFlashcardAddMode] = useState<'single' | 'bulk'>('single');
  const [bulkQuizText, setBulkQuizText] = useState<string>('');
  const [bulkFlashcardText, setBulkFlashcardText] = useState<string>('');
  const [calibratedConfidence, setCalibratedConfidence] = useState<'RED' | 'YELLOW' | 'GREEN' | 'NONE' | null>(null);

  // Safe non-blocking custom toasts to replace browser alert/dialog limitations in iframes
  const [renamingTopicId, setRenamingTopicId] = useState<number | null>(null);
  const [renamingTopicValue, setRenamingTopicValue] = useState<string>('');
  const [quickAddingSubTopicTopicId, setQuickAddingSubTopicTopicId] = useState<number | null>(null);
  const [quickAddingSubTopicValue, setQuickAddingSubTopicValue] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
  };

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const alert = (msg: string) => {
    showToast(msg);
  };

  const handleInsertSnippet = (snippet: string) => {
    const textarea = document.getElementById('markdown-notes-editor') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);

    textarea.value = before + snippet + after;
    const newCursorPos = start + snippet.length;
    textarea.selectionStart = textarea.selectionEnd = newCursorPos;
    textarea.focus();

    const event = new Event('input', { bubbles: true });
    textarea.dispatchEvent(event);
  };

  // Sync default selection states once courses load
  useEffect(() => {
    if (courses && courses.length > 0) {
      const hasFIN302 = courses.some(c => c.id === 'FIN302');
      if (!hasFIN302) {
        if (selectedCourseId === 'FIN302' || !selectedCourseId) {
          setSelectedCourseId(courses[0].id);
        }
        if (newDeadlineCourseId === 'FIN302' || !newDeadlineCourseId) {
          setNewDeadlineCourseId(courses[0].id);
        }
        if (newUrgentCourseId === 'FIN302' || !newUrgentCourseId) {
          setNewUrgentCourseId(courses[0].id);
        }
      }
    } else {
      if (selectedCourseId === 'FIN302') {
        setSelectedCourseId('');
      }
      if (newDeadlineCourseId === 'FIN302') {
        setNewDeadlineCourseId('');
      }
      if (newUrgentCourseId === 'FIN302') {
        setNewUrgentCourseId('');
      }
    }
  }, [courses]);

  // Sync confidence calibration rate for automated spaced repetition
  useEffect(() => {
    if (!topics || !activeSubTopicId) {
      setCalibratedConfidence(null);
      return;
    }
    let foundSubTopic: SubTopic | null = null;
    for (const t of topics) {
      const found = t.subTopics?.find(sub => sub.subTopicId === activeSubTopicId);
      if (found) {
        foundSubTopic = found;
        break;
      }
    }
    if (foundSubTopic) {
      setCalibratedConfidence(foundSubTopic.confidenceStatus || 'NONE');
    } else {
      setCalibratedConfidence(null);
    }
  }, [activeSubTopicId, topics]);

  // Bootstrap seed
  useEffect(() => {
    async function bootstrap() {
      // Clear data if placeholder 'FIN302' is still present inside db.courses to do a clean upgrade
      const hasFIN = await db.courses.get('FIN302');
      if (hasFIN) {
        console.log("Upgrading database - purging outdated placeholder courses");
        try {
          await db.courses.clear();
          await db.topics.clear();
          await db.deadlines.clear();
          await db.urgentReviews.clear();
        } catch (e) {
          console.error("Auto-clear of placeholders failed:", e);
        }
      }

      await seedDatabase();
      
      // Load stored preference start dates
      const startSet = await db.settings.get('semesterStartDate');
      if (startSet) setCustomStart(startSet.value);
      
      const userSet = await db.settings.get('userName');
      if (userSet) setCustomUserName(userSet.value);

      setDbSeeded(true);
    }
    bootstrap();
  }, []);

  // Sync state settings
  const handleSaveSettings = async () => {
    await db.settings.put({ key: 'semesterStartDate', value: customStart });
    await db.settings.put({ key: 'userName', value: customUserName });
    setShowSettingsModal(false);
  };

  const handleClearAllData = async () => {
    if (window.confirm("Are you absolutely sure you want to delete all courses, custom notes, checklists, deadlines, and flashcards? This will reset your database to a completely empty slate so you can enter your own information from scratch.")) {
      try {
        await db.courses.clear();
        await db.topics.clear();
        await db.deadlines.clear();
        await db.urgentReviews.clear();
        
        setSelectedCourseId("");
        setActiveSubTopicId(null);
        setActiveFlashcardsTopicId(null);
        
        setCurrentView('dashboard');
        setShowSettingsModal(false);
        alert("All placeholder data successfully erased! You are starting with a completely blank slate. Click 'Editor Mode' in 'My Course Grid' to add your custom courses & syllabus!");
      } catch (err) {
        console.error("Purge failed:", err);
        alert("Database reset failed. Please reload the tab and try again.");
      }
    }
  };

  const handleExportData = async () => {
    try {
      const exportObject = {
        app: "StudyMaster",
        version: "1.0.0",
        exportedAt: new Date().toISOString(),
        courses: await db.courses.toArray(),
        topics: await db.topics.toArray(),
        deadlines: await db.deadlines.toArray(),
        urgentReviews: await db.urgentReviews.toArray(),
        settings: await db.settings.toArray()
      };

      const jsonString = JSON.stringify(exportObject, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `studymaster-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      alert("StudyMaster database backup exported successfully!");
    } catch (err) {
      console.error("Export failed:", err);
      alert("Failed to export data backup: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleImportData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importObject = JSON.parse(text);

      // Simple structural validation
      if (!importObject || importObject.app !== "StudyMaster") {
        alert("Invalid backup file. Make sure it is a valid backup generated from StudyMaster.");
        return;
      }

      const confirmImport = window.confirm("Importing this backup will overwrite your current courses, notes, and progress. Do you want to continue?");
      if (!confirmImport) {
        if (event.target) event.target.value = '';
        return;
      }

      await db.transaction('rw', [db.courses, db.topics, db.deadlines, db.urgentReviews, db.settings], async () => {
        // Clear all
        await db.courses.clear();
        await db.topics.clear();
        await db.deadlines.clear();
        await db.urgentReviews.clear();
        await db.settings.clear();

        // Add imported items safely if they exist in the backup
        if (Array.isArray(importObject.courses)) {
          await db.courses.bulkAdd(importObject.courses);
        }
        if (Array.isArray(importObject.topics)) {
          await db.topics.bulkAdd(importObject.topics);
        }
        if (Array.isArray(importObject.deadlines)) {
          await db.deadlines.bulkAdd(importObject.deadlines);
        }
        if (Array.isArray(importObject.urgentReviews)) {
          await db.urgentReviews.bulkAdd(importObject.urgentReviews);
        }
        if (Array.isArray(importObject.settings)) {
          await db.settings.bulkAdd(importObject.settings);
        } else {
          // Re-add default settings if none imported
          await db.settings.bulkAdd([
            { key: 'semesterStartDate', value: '2026-06-08' },
            { key: 'userName', value: 'Alex' }
          ]);
        }
      });

      // Clear selection states to avoid pointing to non-existent ids
      setSelectedCourseId("");
      setActiveSubTopicId(null);
      setActiveFlashcardsTopicId(null);
      setCurrentView('dashboard');
      
      // Reload page preference values if imported
      const savedStart = importObject.settings?.find((s: any) => s.key === 'semesterStartDate')?.value;
      const savedUser = importObject.settings?.find((s: any) => s.key === 'userName')?.value;
      if (savedStart) setCustomStart(savedStart);
      if (savedUser) setCustomUserName(savedUser);

      alert("StudyMaster data backup restored successfully!");
    } catch (err) {
      console.error("Import failed:", err);
      alert("Failed to import backup: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      if (event.target) event.target.value = '';
    }
  };

  // Safe checks and helpers
  if (!dbSeeded || !courses || !topics || !deadlines || !urgentReviews) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center text-slate-100">
        <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl shadow-xl flex items-center justify-center animate-pulse mb-6">
          <ModernLogo className="text-amber-500" size={54} />
        </div>
        <p className="font-display text-base font-bold text-white tracking-tight">Initializing StudyMaster Local Database...</p>
        <p className="text-xs text-slate-400 mt-2 font-mono">Connecting secure, high-utility IndexedDB browser sandbox</p>
      </div>
    );
  }

  // Active user name and date values
  const semesterStartDateString = customStart || '2026-06-08';
  const simulatedTodayString = simDate || '2026-06-16';

  // Semester week calculation
  const getSemesterWeek = (startDateStr: string, simulatedDateStr: string): number => {
    const start = new Date(startDateStr);
    const current = new Date(simulatedDateStr);
    start.setHours(0,0,0,0);
    current.setHours(0,0,0,0);

    const diffTime = current.getTime() - start.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 1;
    const computedWeek = Math.floor(diffDays / 7) + 1;
    return computedWeek > 13 ? 13 : computedWeek;
  };

  const activeWeek = getSemesterWeek(semesterStartDateString, simulatedTodayString);
  const progressPercent = Math.min(100, Math.max(0, Math.round((activeWeek / 13) * 100)));

  // Countdown and urgency generator
  const getDeadlineUrgencyStatus = (dueDateStr: string, simDateStr: string) => {
    const due = new Date(dueDateStr);
    const sim = new Date(simDateStr);
    const diffMs = due.getTime() - sim.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours <= 0) {
      return { level: 'CRITICAL', text: 'Overdue', color: 'text-rose-600 bg-rose-50 border-rose-200' };
    } else if (diffHours <= 24) {
      const hours = Math.floor(diffHours);
      const mins = Math.round((diffHours % 1) * 60);
      return { level: 'CRITICAL', text: `${hours}h ${mins}m remaining`, color: 'text-red-700 bg-red-100 border-red-300 font-bold animate-pulse-ring' };
    } else if (diffHours <= 72) {
      const days = Math.floor(diffHours / 24);
      const hours = Math.round(diffHours % 24);
      return { level: 'APPROACHING', text: `${days}d ${hours}h left`, color: 'text-amber-800 bg-amber-100 border-amber-300' };
    } else {
      const days = Math.floor(diffHours / 24);
      return { level: 'ON-TRACK', text: `${days}d left`, color: 'text-emerald-800 bg-emerald-50 border-emerald-200' };
    }
  };

  // Deadlines prioritization
  const sortedDeadlines = [...deadlines].sort((a, b) => {
    if (a.completed && !b.completed) return 1;
    if (!a.completed && b.completed) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  // Toggle deadline completion
  const handleToggleDeadline = async (id: number, val: boolean) => {
    await db.deadlines.update(id, { completed: val });
  };

  // Delete deadline
  const handleDeleteDeadline = async (id: number) => {
    if (window.confirm("Delete this academic deadline?")) {
      await db.deadlines.delete(id);
    }
  };

  const handleCalendarAddEvent = async (event: Omit<Deadline, 'id'>) => {
    await db.deadlines.add(event);
  };

  const handleCalendarDeleteEvent = async (id: number) => {
    await db.deadlines.delete(id);
  };

  const handleRenameTopic = (topicDbId: number, currentTitle: string) => {
    setRenamingTopicId(topicDbId);
    setRenamingTopicValue(currentTitle || '');
  };

  const handleSaveTopicRename = async (topicDbId: number) => {
    if (renamingTopicValue.trim()) {
      await db.topics.update(topicDbId, { topicTitle: renamingTopicValue.trim() });
      showToast("Module topic title updated successfully!");
    }
    setRenamingTopicId(null);
  };

  const handleAddSyllabusTopic = async (courseId: string, currentTopics: TopicRecord[]) => {
    const maxWeek = currentTopics.reduce((max, t) => Math.max(max, t.weekNumber), 0);
    const nextWeekNum = maxWeek + 1;
    const newTopic: TopicRecord = {
      courseId: courseId,
      weekNumber: nextWeekNum,
      topicId: `topic_${courseId.toLowerCase()}_w${nextWeekNum}`,
      topicTitle: `New Syllabus Module Week ${nextWeekNum}`,
      subTopics: [],
      masterFlashcards: []
    };
    await db.topics.add(newTopic);
    setExpandedWeeks(prev => ({ ...prev, [nextWeekNum]: true }));
  };

  const handleQuickAddSubTopic = async (topicDbId: number, courseId: string, currentSubTopics: SubTopic[]) => {
    setQuickAddingSubTopicTopicId(topicDbId);
    setQuickAddingSubTopicValue('');
  };

  const handleSaveQuickAddSubTopic = async (topicDbId: number, courseId: string, currentSubTopics: SubTopic[]) => {
    if (quickAddingSubTopicValue.trim()) {
      const title = quickAddingSubTopicValue.trim();
      const subId = `sub_${courseId.toLowerCase()}_t${topicDbId}_s${currentSubTopics.length + 1}`;
      const newSub: SubTopic = {
        subTopicId: subId,
        orderIndex: currentSubTopics.length,
        title: title,
        notesMarkdown: `# ${title}\n\nWelcome to your new custom study notes module. Click 'Edit' above to customize your study notes with text, definitions, code blocks, or mathematical equations!`,
        confidenceStatus: 'NONE',
        nextReviewDate: null,
        quiz: [],
        quizPassed: false
      };
      const copy = [...currentSubTopics, newSub];
      await db.topics.update(topicDbId, { subTopics: copy });
      showToast(`Sub-topic "${title}" added to Week modules!`);
    }
    setQuickAddingSubTopicTopicId(null);
  };

  // Add customized deadline
  const handleAddDeadline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeadlineTitle.trim()) return;

    const combinedISOString = new Date(`${newDeadlineDate}T${newDeadlineTime || '12:00'}:00`).toISOString();
    await db.deadlines.add({
      courseId: newDeadlineCourseId,
      title: newDeadlineTitle,
      dueDate: combinedISOString,
      completed: false
    });

    setNewDeadlineTitle('');
  };

  // Spaced repetition scheduler algorithms
  // Red = 2 days, Yellow = 5 days, Green = 14 days
  const handleSetConfidence = async (tRecord: TopicRecord, subIdx: number, level: 'RED' | 'YELLOW' | 'GREEN' | 'NONE') => {
    const updatedSubtopics = [...tRecord.subTopics];
    const sub = updatedSubtopics[subIdx];
    
    sub.confidenceStatus = level;
    let daysToAdd = 0;
    if (level === 'RED') daysToAdd = 2;
    else if (level === 'YELLOW') daysToAdd = 5;
    else if (level === 'GREEN') daysToAdd = 14;

    if (daysToAdd > 0) {
      const reviewDate = new Date(simulatedTodayString);
      reviewDate.setDate(reviewDate.getDate() + daysToAdd);
      sub.nextReviewDate = reviewDate.toISOString();
    } else {
      sub.nextReviewDate = null;
    }

    await db.topics.update(tRecord.id!, { subTopics: updatedSubtopics });
    alert(`Confidence set to ${level}! Scheduled next review in ${daysToAdd} days.`);
  };

  const handleToggleSubTopicComplete = async (tRecord: TopicRecord, subIdx: number, isComplete: boolean) => {
    const updatedSubtopics = [...tRecord.subTopics];
    const sub = updatedSubtopics[subIdx];
    sub.completed = isComplete;
    await db.topics.update(tRecord.id!, { subTopics: updatedSubtopics });
    showToast(isComplete ? `Sub-topic task "${sub.title}" marked as complete!` : `Sub-topic task "${sub.title}" returned to focus.`);
  };

  // Pull queue items
  const spacedRepetitionQueue = (() => {
    const nowLimit = new Date(simulatedTodayString);
    nowLimit.setHours(23, 59, 59, 999);

    const queue: {
      dbId: number;
      courseCode: string;
      color: string;
      topicRecord: TopicRecord;
      subTopic: SubTopic;
      subIdx: number;
      daysOverdue: number;
      status: 'DUE' | 'UPCOMING';
    }[] = [];

    for (const record of topics || []) {
      const courseObj = courses?.find(c => c.id === record.courseId);
      const color = courseObj ? courseObj.color : 'slate';
      const courseCode = courseObj ? courseObj.code : record.courseId;

      record.subTopics?.forEach((sub, idx) => {
        if (sub.nextReviewDate && sub.confidenceStatus !== 'NONE' && !sub.completed) {
          const revDate = new Date(sub.nextReviewDate);
          const status = revDate <= nowLimit ? 'DUE' : 'UPCOMING';
          const overdueDays = Math.ceil((nowLimit.getTime() - revDate.getTime()) / (1000 * 60 * 60 * 24));

          queue.push({
            dbId: record.id!,
            courseCode,
            color,
            topicRecord: record,
            subTopic: sub,
            subIdx: idx,
            daysOverdue: overdueDays,
            status
          });
        }
      });
    }

    return queue.sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'DUE' ? -1 : 1;
      }
      return b.daysOverdue - a.daysOverdue;
    });
  })();

  // Course workspace calculations
  const getCourseProgress = (courseId: string) => {
    const courseTopics = topics.filter(t => t.courseId === courseId);
    let totalSubtopics = 0;
    let masteredCount = 0; // Strictly depends on quizPassed === true
    let confidenceCount = { RED: 0, YELLOW: 0, GREEN: 0, NONE: 0 };

    courseTopics.forEach(t => {
      t.subTopics?.forEach(sub => {
        totalSubtopics++;
        confidenceCount[sub.confidenceStatus]++;
        if (sub.quizPassed === true) {
          masteredCount++;
        }
      });
    });

    const completionRate = totalSubtopics > 0 ? Math.round((masteredCount / totalSubtopics) * 100) : 0;
    return { totalSubtopics, masteredCount, confidenceCount, completionRate };
  };

  // Course customization manager handlers
  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = customCourseId.trim().toUpperCase().replace(/\s+/g, '');
    if (!cleanId) return;

    // Check if duplicate course
    const existing = await db.courses.get(cleanId);
    if (existing) {
      alert(`Course code ${cleanId} is already in use.`);
      return;
    }

    const newCourseObj: Course = {
      id: cleanId,
      code: customCourseCode.trim() || cleanId,
      name: customCourseName.trim() || "New Customized Course",
      color: customCourseColor || "amber"
    };

    // 1. Save course
    await db.courses.add(newCourseObj);

    // 2. Automatically generate 13 empty weeks
    for (let w = 1; w <= 13; w++) {
      const topicTitle = `Syllabus Topic Week ${w}`;
      const topicId = `topic_${cleanId.toLowerCase()}_w${w}`;

      const defaultSub: SubTopic = {
        subTopicId: `sub_${cleanId.toLowerCase()}_w${w}_s1`,
        orderIndex: 0,
        title: "Introduction & Core Materials",
        notesMarkdown: `# Week ${w}: Overview\n\nWelcome to Week ${w}. Use the 'Edit Content' button in the upper right corner to edit notes, formulas, equations, or quizzes!`,
        confidenceStatus: 'NONE',
        nextReviewDate: null,
        quiz: [
          {
            question: "What is the primary definition of this topic?",
            options: ["Option A - Initial Answer", "Option B - Incorrect Distractor", "Option C - Secondary distraction", "Option D - Alternative choice"],
            correctOptionIndex: 0
          }
        ],
        quizPassed: false
      };

      const defaultFC: Flashcard = {
        front: "Recall prompt template front",
        back: "Definition recall answer back"
      };

      await db.topics.add({
        courseId: cleanId,
        weekNumber: w,
        topicId: topicId,
        topicTitle: topicTitle,
        subTopics: [defaultSub],
        masterFlashcards: [defaultFC]
      });
    }

    // Reset inputs
    setCustomCourseId('');
    setCustomCourseCode('');
    setCustomCourseName('');
    setCustomCourseColor('amber');
    setCourseEditorActive(false);
    setSelectedCourseId(cleanId);
    alert(`Course ${cleanId} created with 13 custom weekly chapters.`);
  };

  const handleDeleteCourse = async (courseIdStr: string) => {
    if (window.confirm(`Are you sure you want to delete course ${courseIdStr}? This will permanently delete all 13 weekly syllabus records, customized notes, flashcards, and quizzes.`)) {
      // Delete course from db
      await db.courses.delete(courseIdStr);

      // Clean topic records
      const associatedTopics = await db.topics.where({ courseId: courseIdStr }).toArray();
      for (const t of associatedTopics) {
        if (t.id) await db.topics.delete(t.id);
      }

      // Clean deadlines corresponding to it
      const associatedDeadlines = await db.deadlines.where({ courseId: courseIdStr }).toArray();
      for (const d of associatedDeadlines) {
        if (d.id) await db.deadlines.delete(d.id);
      }

      // Clean urgent reviews corresponding to it
      const associatedUrgent = await db.urgentReviews.where({ courseId: courseIdStr }).toArray();
      for (const u of associatedUrgent) {
        if (u.id) await db.urgentReviews.delete(u.id);
      }

      // If active course, select different one
      if (selectedCourseId === courseIdStr) {
        const remaining = await db.courses.toArray();
        if (remaining.length > 0) {
          setSelectedCourseId(remaining[0].id);
        }
      }
      alert(`Deleted Course ${courseIdStr} and all associated chapters.`);
    }
  };

  // Urgent reviews checklist handlers
  const handleToggleUrgentReview = async (id: number, val: boolean) => {
    await db.urgentReviews.update(id, { completed: val });
  };

  const handleDeleteUrgentReview = async (id: number) => {
    if (window.confirm("Remove this item from your urgent prerequisite reviews?")) {
      await db.urgentReviews.delete(id);
    }
  };

  const handleAddUrgentReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrgentTitle.trim()) return;

    await db.urgentReviews.add({
      courseId: newUrgentCourseId,
      title: newUrgentTitle.trim(),
      notes: newUrgentNotes.trim() || undefined,
      completed: false,
      createdAt: new Date().toISOString()
    });

    setNewUrgentTitle('');
    setNewUrgentNotes('');
  };

  // Topic detail helpers
  const activeCourse = courses && courses.length > 0 ? (courses.find(c => c.id === selectedCourseId) || courses[0]) : undefined;
  const activeCourseTopics = activeCourse ? topics.filter(t => t.courseId === activeCourse.id).sort((a,b) => a.weekNumber - b.weekNumber) : [];

  // Retrieve current selection subtopic object
  const activeSelectionDetails = (() => {
    if (activeSubTopicId) {
      for (const t of activeCourseTopics) {
        const foundIdx = t.subTopics?.findIndex(sub => sub.subTopicId === activeSubTopicId);
        if (foundIdx !== undefined && foundIdx !== -1) {
          return {
            topicRecord: t,
            subTopic: t.subTopics[foundIdx],
            subTopicIndex: foundIdx
          };
        }
      }
    }
    return null;
  })();

  const handleSaveCalibration = async () => {
    if (!activeSelectionDetails || !calibratedConfidence) return;
    const { topicRecord, subTopicIndex } = activeSelectionDetails;
    await handleSetConfidence(topicRecord, subTopicIndex, calibratedConfidence);
    alert("Spaced repetition confidence calibration saved! It has been archived and synced to the dashboard study queues.");
  };

  const activeFlashcardTopicDetails = (() => {
    if (activeFlashcardsTopicId) {
      return activeCourseTopics.find(t => t.topicId === activeFlashcardsTopicId);
    }
    return null;
  })();

  // Navigation redirect to a topic
  const handleLaunchSubTopic = (courseId: string, weekNum: number, subId: string) => {
    setSelectedCourseId(courseId);
    setExpandedWeeks(prev => ({ ...prev, [weekNum]: true }));
    setActiveSubTopicId(subId);
    setActiveFlashcardsTopicId(null);
    setCurrentView('course');
    setEditMode(false);
    resetQuizState();
  };

  const handleLaunchFlashcards = (courseId: string, weekNum: number, topicId: string) => {
    setSelectedCourseId(courseId);
    setExpandedWeeks(prev => ({ ...prev, [weekNum]: true }));
    setActiveSubTopicId(null);
    setActiveFlashcardsTopicId(topicId);
    setCurrentView('course');
    setFlashcardIndex(0);
    setIsFlipped(false);
  };

  // Reset quiz states each time a subtopic loads
  const resetQuizState = () => {
    setUserAnswers({});
    setQuizSubmitted(false);
    setQuizScore(null);
    setQuizPassed(null);
  };

  // Handle quiz submissions
  const handleOptionSelect = (qIdx: number, optIdx: number) => {
    if (quizSubmitted) return;
    const newAnswers = { ...userAnswers, [qIdx]: optIdx };
    setUserAnswers(newAnswers);

    const questions = activeSelectionDetails?.subTopic.quiz || [];
    if (questions.length > 0 && Object.keys(newAnswers).length === questions.length) {
      handleSubmitQuiz(questions, newAnswers);
    }
  };

  const handleSubmitQuiz = async (questions: any[], currentAnswers?: Record<number, number>) => {
    if (!questions || questions.length === 0) return;
    const answersToUse = currentAnswers || userAnswers;
    let correct = 0;
    questions.forEach((q, idx) => {
      if (answersToUse[idx] === q.correctOptionIndex) {
        correct++;
      }
    });

    const scorePct = Math.round((correct / questions.length) * 100);
    setQuizScore(scorePct);
    const passedCur = scorePct >= 80;
    setQuizPassed(passedCur);
    setQuizSubmitted(true);

    // Save calculation live into IndexedDB SubTopic!
    if (activeSelectionDetails) {
      const { topicRecord, subTopicIndex } = activeSelectionDetails;
      const subTopicsCopy = [...topicRecord.subTopics];
      subTopicsCopy[subTopicIndex].quizPassed = passedCur;

      await db.topics.update(topicRecord.id!, { subTopics: subTopicsCopy });
    }
  };

  // Notes and Markdown Updater save logic
  const handleSaveNotes = async (mdContent: string) => {
    if (!activeSelectionDetails) return;
    const { topicRecord, subTopicIndex } = activeSelectionDetails;
    const recordsCopy = [...topicRecord.subTopics];
    recordsCopy[subTopicIndex].notesMarkdown = mdContent;

    await db.topics.update(topicRecord.id!, { subTopics: recordsCopy });
    setEditMode(false);
  };

  // Subtopic Flashcard Handlers
  const handleCreateSubFC = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSelectionDetails) return;
    if (!newSubFCFront.trim() || !newSubFCBack.trim()) return;

    const { topicRecord, subTopicIndex } = activeSelectionDetails;
    const subTopicsCopy = [...topicRecord.subTopics];
    const subTopic = subTopicsCopy[subTopicIndex];
    
    const cardsCopy = [...(subTopic.flashcards || []), { front: newSubFCFront.trim(), back: newSubFCBack.trim() }];
    subTopicsCopy[subTopicIndex].flashcards = cardsCopy;

    await db.topics.update(topicRecord.id!, { subTopics: subTopicsCopy });
    setNewSubFCFront('');
    setNewSubFCBack('');
    setSubFCIndex(cardsCopy.length - 1);
    showToast("Subtopic flashcard added successfully!");
  };

  const handleBulkSubFCImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSelectionDetails) return;
    if (!bulkSubFCText.trim()) return;

    const parsedCards = parseBulkFlashcardText(bulkSubFCText);
    if (parsedCards.length === 0) {
      alert("No flashcards parsed. Check your format!");
      return;
    }

    const { topicRecord, subTopicIndex } = activeSelectionDetails;
    const subTopicsCopy = [...topicRecord.subTopics];
    const subTopic = subTopicsCopy[subTopicIndex];

    const cardsCopy = [...(subTopic.flashcards || []), ...parsedCards];
    subTopicsCopy[subTopicIndex].flashcards = cardsCopy;

    await db.topics.update(topicRecord.id!, { subTopics: subTopicsCopy });
    setBulkSubFCText('');
    setSubFCAddMode('single');
    setSubFCIndex(cardsCopy.length - 1);
    showToast(`Bulk imported ${parsedCards.length} flashcards to this subtopic!`);
  };



  const handleDeleteSubFC = async (idx: number) => {
    if (!activeSelectionDetails) return;
    if (!window.confirm("Delete this subtopic flashcard?")) return;

    const { topicRecord, subTopicIndex } = activeSelectionDetails;
    const subTopicsCopy = [...topicRecord.subTopics];
    const subTopic = subTopicsCopy[subTopicIndex];

    const cardsCopy = [...(subTopic.flashcards || [])];
    cardsCopy.splice(idx, 1);
    subTopicsCopy[subTopicIndex].flashcards = cardsCopy;

    await db.topics.update(topicRecord.id!, { subTopics: subTopicsCopy });

    const newIdx = Math.max(0, cardsCopy.length - 1);
    setSubFCIndex(newIdx);
    setSubIsFlipped(false);
    showToast("Subtopic flashcard deleted.");
  };

  // Subtopic Creation
  const handleCreateSubTopic = async () => {
    if (!newSubTopicTitle.trim() || !activeCourse) return;
    
    // Find matching topic record for course + week
    const targetTopic = activeCourseTopics.find(t => t.weekNumber === newSubTopicWeek);
    if (!targetTopic) {
      alert("Selected week module was not found!");
      return;
    }

    const nextIndex = targetTopic.subTopics.length;
    const randomizedSubId = `sub_${activeCourse.id.toLowerCase()}_w${newSubTopicWeek}_custom_${Date.now()}`;
    
    const newSub: SubTopic = {
      subTopicId: randomizedSubId,
      orderIndex: nextIndex,
      title: newSubTopicTitle.trim(),
      notesMarkdown: `# ${newSubTopicTitle}\n\nType your custom lecture notes here. Use bold text, math formatting equations, or lists to structure your insights!`,
      confidenceStatus: 'NONE',
      nextReviewDate: null,
      quiz: [
        {
          question: "What is the primary definition of this topic?",
          options: ["Incorrect Concept Alpha", "Correct Conceptual Solution", "Faulty Assumption Beta", "Standard Neutral filler choice"],
          correctOptionIndex: 1
        }
      ],
      quizPassed: false
    };

    const copySub = [...targetTopic.subTopics, newSub];
    await db.topics.update(targetTopic.id!, { subTopics: copySub });

    setNewSubTopicTitle('');
    setShowAddSubTopicModal(false);
    setActiveSubTopicId(randomizedSubId);
    setActiveFlashcardsTopicId(null);
    setEditMode(false);
    resetQuizState();
    alert(`Sub-topic "${newSubTopicTitle}" added to Week ${newSubTopicWeek}!`);
  };

  // Subtopic deletion
  const handleDeleteSubTopic = async (topicDbId: number, subIndex: number, subTitle: string) => {
    if (window.confirm(`Are you absolutely sure you want to delete the sub-topic "${subTitle}"? This will physically purge all personal notes, custom definitions, and quiz history related to this module.`)) {
      const record = await db.topics.get(topicDbId);
      if (record) {
        const copyList = [...record.subTopics];
        copyList.splice(subIndex, 1);
        // Correct order indices
        const correctedList = copyList.map((item, idx) => ({ ...item, orderIndex: idx }));
        await db.topics.update(topicDbId, { subTopics: correctedList });

        // If currently viewing deleted subtopic, deselect
        if (activeSubTopicId === record.subTopics[subIndex].subTopicId) {
          setActiveSubTopicId(null);
        }
      }
    }
  };

  // Quiz Editor Update Logic
  const handleUpdateQuiz = async (qIndex: number, fields: any) => {
    if (!activeSelectionDetails) return;
    const { topicRecord, subTopicIndex } = activeSelectionDetails;
    const subTopicsCopy = [...topicRecord.subTopics];
    const quizCopy = [...subTopicsCopy[subTopicIndex].quiz];

    quizCopy[qIndex] = { ...quizCopy[qIndex], ...fields };
    subTopicsCopy[subTopicIndex].quiz = quizCopy;

    await db.topics.update(topicRecord.id!, { subTopics: subTopicsCopy });
  };

  const handleAddNewQuizQuestion = async () => {
    if (!activeSelectionDetails) return;
    const { topicRecord, subTopicIndex } = activeSelectionDetails;
    const subTopicsCopy = [...topicRecord.subTopics];
    const quizCopy = [...subTopicsCopy[subTopicIndex].quiz];

    quizCopy.push({
      question: "New Custom True/False Question?",
      options: ["True", "False"],
      correctOptionIndex: 0
    });
    subTopicsCopy[subTopicIndex].quiz = quizCopy;

    await db.topics.update(topicRecord.id!, { subTopics: subTopicsCopy });
  };

  const handleCreateCustomQuizQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSelectionDetails) return;
    if (!newQuizQuestionPrompt.trim()) return;

    const optionsList = [
      newQuizOption1.trim(),
      newQuizOption2.trim(),
      newQuizOption3.trim(),
      newQuizOption4.trim()
    ].filter(Boolean);

    if (optionsList.length < 2) {
      alert("Please provide at least 2 multiple-choice options!");
      return;
    }

    if (newQuizCorrectIndex >= optionsList.length) {
      alert("Correct answer index cannot exceed the number of typed options!");
      return;
    }

    const { topicRecord, subTopicIndex } = activeSelectionDetails;
    const subTopicsCopy = [...topicRecord.subTopics];
    const quizCopy = [...subTopicsCopy[subTopicIndex].quiz];

    quizCopy.push({
      question: newQuizQuestionPrompt.trim(),
      options: optionsList,
      correctOptionIndex: newQuizCorrectIndex
    });
    subTopicsCopy[subTopicIndex].quiz = quizCopy;

    await db.topics.update(topicRecord.id!, { subTopics: subTopicsCopy });

    // Reset fields
    setNewQuizQuestionPrompt('');
    setNewQuizOption1('');
    setNewQuizOption2('');
    setNewQuizOption3('');
    setNewQuizOption4('');
    setNewQuizCorrectIndex(0);
    setShowViewModeQuizBuilder(false);
    alert("New quiz question successfully added!");
  };

  const handleDeleteQuizQuestion = async (qIndex: number) => {
    if (!activeSelectionDetails) return;
    if (window.confirm("Remove this quiz question permanently?")) {
      const { topicRecord, subTopicIndex } = activeSelectionDetails;
      const subTopicsCopy = [...topicRecord.subTopics];
      const quizCopy = [...subTopicsCopy[subTopicIndex].quiz];

      quizCopy.splice(qIndex, 1);
      subTopicsCopy[subTopicIndex].quiz = quizCopy;

      await db.topics.update(topicRecord.id!, { subTopics: subTopicsCopy });
    }
  };

  // Flashcards Management
  const handleCreateFlashcard = async (topicDbId: number) => {
    if (!newFCFront.trim() || !newFCBack.trim()) return;
    const record = await db.topics.get(topicDbId);
    if (record) {
      const copyFc = [...record.masterFlashcards, { front: newFCFront.trim(), back: newFCBack.trim() }];
      await db.topics.update(topicDbId, { masterFlashcards: copyFc });
      setNewFCFront('');
      setNewFCBack('');
      setFlashcardIndex(copyFc.length - 1);
      alert("Digital Flashcard successfully archived!");
    }
  };

  const handleBulkQuizImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSelectionDetails) {
      alert("Please select a lecture module subtopic from the sidebar first!");
      return;
    }
    if (!bulkQuizText.trim()) return;

    const parsedQuestions = parseBulkQuizText(bulkQuizText);

    if (parsedQuestions.length === 0) {
      alert("No questions could be parsed! Please specify a question statement and at least 2 labeled options.");
      return;
    }

    const { topicRecord, subTopicIndex } = activeSelectionDetails;
    const subTopicsCopy = [...topicRecord.subTopics];
    const quizCopy = [...(subTopicsCopy[subTopicIndex].quiz || []), ...parsedQuestions];

    subTopicsCopy[subTopicIndex].quiz = quizCopy;
    await db.topics.update(topicRecord.id!, { subTopics: subTopicsCopy });

    setBulkQuizText('');
    setQuizAddMode('single');
    alert(`Successfully bulk-imported ${parsedQuestions.length} custom quiz questions!`);
  };

  const handleBulkFlashcardImport = async (e: React.FormEvent, topicDbId: number) => {
    e.preventDefault();
    if (!bulkFlashcardText.trim()) return;

    const parsedCards = parseBulkFlashcardText(bulkFlashcardText);

    if (parsedCards.length === 0) {
      alert("No flashcards found. Check your bulk formatting!");
      return;
    }

    const record = await db.topics.get(topicDbId);
    if (record) {
      const cardsCopy = [...(record.masterFlashcards || []), ...parsedCards];
      await db.topics.update(topicDbId, { masterFlashcards: cardsCopy });
      setBulkFlashcardText('');
      setFlashcardAddMode('single');
      setFlashcardIndex(cardsCopy.length - 1);
      alert(`Successfully bulk-imported ${parsedCards.length} flashcards to this deck!`);
    }
  };

  const handleDeleteFlashcard = async (topicDbId: number, idx: number) => {
    if (window.confirm("Remove this exact flashcard?")) {
      const record = await db.topics.get(topicDbId);
      if (record) {
        const copyFc = [...record.masterFlashcards];
        copyFc.splice(idx, 1);
        await db.topics.update(topicDbId, { masterFlashcards: copyFc });
        setFlashcardIndex(prev => Math.max(0, Math.min(copyFc.length - 1, prev)));
        setIsFlipped(false);
      }
    }
  };


  // Colors Map for headers
  const getCourseColors = (colorKey: string) => {
    switch (colorKey) {
      case 'amber':
        return {
          bg: 'bg-amber-50',
          border: 'border-amber-200 text-amber-800',
          hover: 'hover:bg-amber-100',
          accent: 'bg-amber-500',
          text: 'text-amber-800',
          gradient: 'from-amber-600 to-amber-700'
        };
      case 'rose':
        return {
          bg: 'bg-rose-50',
          border: 'border-rose-200 text-rose-800',
          hover: 'hover:bg-rose-100',
          accent: 'bg-rose-500',
          text: 'text-rose-800',
          gradient: 'from-rose-600 to-rose-700'
        };
      case 'indigo':
        return {
          bg: 'bg-indigo-50',
          border: 'border-indigo-200 text-indigo-800',
          hover: 'hover:bg-indigo-100',
          accent: 'bg-indigo-600',
          text: 'text-indigo-800',
          gradient: 'from-indigo-600 to-indigo-700'
        };
      case 'violet':
        return {
          bg: 'bg-violet-50',
          border: 'border-violet-200 text-violet-800',
          hover: 'hover:bg-violet-100',
          accent: 'bg-violet-600',
          text: 'text-violet-800',
          gradient: 'from-violet-600 to-violet-700'
        };
      case 'emerald':
        return {
          bg: 'bg-emerald-50',
          border: 'border-emerald-200 text-emerald-800',
          hover: 'hover:bg-emerald-100',
          accent: 'bg-emerald-600',
          text: 'text-emerald-800',
          gradient: 'from-emerald-600 to-emerald-700'
        };
      case 'teal':
        return {
          bg: 'bg-teal-50',
          border: 'border-teal-200 text-teal-800',
          hover: 'hover:bg-teal-100',
          accent: 'bg-teal-600',
          text: 'text-teal-850',
          gradient: 'from-teal-600 to-teal-700'
        };
      case 'orange':
        return {
          bg: 'bg-orange-50',
          border: 'border-orange-200 text-orange-800',
          hover: 'hover:bg-orange-100',
          accent: 'bg-orange-500',
          text: 'text-orange-850',
          gradient: 'from-orange-600 to-orange-700'
        };
      case 'sky':
        default:
        return {
          bg: 'bg-sky-50',
          border: 'border-sky-200 text-sky-800',
          hover: 'hover:bg-sky-100',
          accent: 'bg-sky-500',
          text: 'text-sky-800',
          gradient: 'from-sky-600 to-sky-700'
        };
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col">

      {/* Custom float toast message */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-slate-700 text-slate-100 px-4.5 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 animate-bounce-short max-w-sm">
          <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
          <p className="text-xs font-semibold leading-relaxed font-sans">{toastMessage}</p>
        </div>
      )}
      
      {/* 1. TOP GLOBAL NAVIGATION / SEMESTER HEADER */}
      <header className="bg-slate-900 text-slate-100 border-b border-slate-800 shrink-0 sticky top-0 z-40 px-4 md:px-8 py-3.5 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-slate-950 border border-slate-800 rounded-xl shadow-inner flex items-center justify-center">
              <ModernLogo className="text-amber-500" size={30} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display font-black text-lg tracking-tight text-white">StudyMaster</span>
                <span className="text-[10px] font-mono tracking-widest uppercase bg-slate-800 px-2 py-0.5 rounded text-amber-500 border border-slate-700">INDEXED_DB_LOCAL</span>
              </div>
              <p className="text-xs text-slate-400">13-Week Rigorous Personalized Study Dashboard</p>
            </div>
          </div>

          {/* Dynamic Week Tracker Widget */}
          <div className="flex items-center gap-4 bg-slate-950/80 px-4 py-2 rounded-xl border border-slate-800 text-xs shadow-inner min-w-[280px] md:min-w-0">
            <div className="grow">
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-300 mb-1">
                <span className="flex items-center gap-1 font-semibold text-amber-400">
                  <Calendar className="h-3 w-3" /> Week {activeWeek} of 13
                </span>
                <span className="text-slate-400 font-mono">{progressPercent}% of Term Finished</span>
              </div>
              <div className="w-48 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-500 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
            </div>
            
            {/* Quick Export/Import Data icons or settings button */}
            <button 
              onClick={handleExportData}
              title="Export database backup (JSON)"
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 text-[10px] font-mono font-bold"
            >
              <Download className="h-3.5 w-3.5 text-amber-500" />
              <span className="hidden sm:inline">BACKUP</span>
            </button>

            {/* Action Cog to edit active simulation dates and name */}
            <button 
              onClick={() => setShowSettingsModal(true)} 
              title="Calibrate study parameters"
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>

        </div>
      </header>

      {/* 2. MAIN LAYOUT STAGE */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col gap-6">
        
        {/* VIEW A: MASTER DASHBOARD HOMEPAGE */}
        {currentView === 'dashboard' && (
          <div className="space-y-6">
            
            {/* Global Welcome Banner / Debug Alerts */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-6 shadow-md border border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-amber-400 fill-amber-400" />
                  <h2 className="text-xl font-bold font-display tracking-tight text-white">Welcome back, {customUserName}!</h2>
                </div>
                <p className="text-sm text-slate-300 max-w-xl">
                  Your courses are fully mapped onto IndexedDB. Current academic workspace context running simulated date <strong className="text-amber-300 font-mono">{formatDateDDMMYYYY(simulatedTodayString)}</strong>.
                </p>
              </div>
              
              <div className="flex gap-2 shrink-0">
                <button 
                  onClick={() => {
                    const todayStr = new Date().toISOString().split('T')[0];
                    setSimDate(todayStr);
                    alert("Date calibrated to real-time clock!");
                  }}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-medium rounded-lg border border-slate-700 hover:border-slate-600 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Synchronize Real Clock
                </button>
                <button 
                  onClick={() => setShowSettingsModal(true)}
                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-medium rounded-lg transition-all shadow-sm font-semibold cursor-pointer"
                >
                  Adjust Term Plan
                </button>
              </div>
            </div>

            {/* Launchpad Content Grid: Left 2 columns containing Courses + spaced-rep, Right 1 column containing Deadlines */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Grid: Spaced-Repetition Queue & Courses List */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* 1. AUTO-PILOT STUDY QUEUE (Spaced Repetition System) */}
                <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-fade-in">
                  {(() => {
                    const dueItems = spacedRepetitionQueue.filter(item => item.status === 'DUE');
                    const upcomingItems = spacedRepetitionQueue.filter(item => item.status === 'UPCOMING');

                    return (
                      <>
                        <div className="bg-slate-900 px-5 py-3.5 border-b border-indigo-900/40 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-white">
                            <div className="p-1 bg-amber-400/20 text-amber-400 rounded-md">
                              <Clock className="h-4 w-4" />
                            </div>
                            <h3 className="font-display font-bold text-sm tracking-tight text-white">Auto-Pilot Spaced Repetition Queue</h3>
                          </div>
                          <div className="flex items-center gap-2">
                            {dueItems.length > 0 && (
                              <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2.5 py-0.5 rounded-full font-mono font-semibold animate-pulse">
                                {dueItems.length} DUE TODAY
                              </span>
                            )}
                            {upcomingItems.length > 0 && (
                              <span className="text-[10px] bg-sky-500/20 text-sky-300 border border-sky-500/30 px-2.5 py-0.5 rounded-full font-mono font-semibold">
                                {upcomingItems.length} SCHEDULED
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="p-5">
                          {spacedRepetitionQueue.length === 0 ? (
                            <div className="text-center py-8 px-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                              <CheckCircle2 className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                              <h4 className="font-display font-semibold text-slate-700 text-sm">Perfect Spaced Repetition Standing!</h4>
                              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                                Zero lecture subtopics are currently due for timed feedback. Configure confidence status of any submodule node inside course workspaces to schedule automated spaced reviews!
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-5 max-h-[380px] overflow-y-auto pr-1">
                              
                              {/* DUE NOW ROUNDS */}
                              {dueItems.length > 0 && (
                                <div className="space-y-2">
                                  <h4 className="text-[10px] font-mono font-bold tracking-wider text-rose-500 uppercase flex items-center gap-1">
                                    🚨 OVERDUE REVIEWS DUE NOW ({dueItems.length})
                                  </h4>
                                  <div className="space-y-2.5">
                                    {dueItems.map((item, qidx) => {
                                      const clrSet = getCourseColors(item.color);
                                      return (
                                        <div 
                                          key={`due-${qidx}`} 
                                          className="group flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-red-650 hover:bg-red-700 text-white rounded-xl border border-red-700 shadow-md transition-all duration-250 animate-pulse-subtle"
                                        >
                                          <div className="flex items-start gap-3 grow min-w-0">
                                            <input
                                              type="checkbox"
                                              checked={!!item.subTopic.completed}
                                              onChange={(e) => handleToggleSubTopicComplete(item.topicRecord, item.subIdx, e.target.checked)}
                                              className="mt-1 h-5.5 w-5.5 rounded border-red-400 text-red-650 focus:ring-red-500 cursor-pointer accent-white shrink-0 scale-110"
                                              title="Mark task as completed"
                                            />
                                            <div className="space-y-1 grow min-w-0">
                                              <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-[9px] font-mono font-extrabold px-1.5 py-0.5 rounded bg-white text-red-700 border border-transparent shadow-xs">
                                                  {item.courseCode}
                                                </span>
                                                <span className="text-[10px] font-mono text-red-100 font-bold">Week {item.topicRecord.weekNumber}</span>
                                                <span className="h-1.5 w-1.5 rounded-full bg-white animate-ping" />
                                                <span className="text-[9px] font-extrabold text-red-100 uppercase tracking-wider">{item.subTopic.confidenceStatus} STATUS</span>
                                              </div>
                                              <h4 className="text-xs font-bold text-white leading-snug">{item.subTopic.title}</h4>
                                              <p className="text-[10px] text-red-100/90 truncate">Topic: {item.topicRecord.topicTitle}</p>
                                              
                                              {/* Write Urgent Underneath */}
                                              <p className="text-[11px] font-black uppercase text-amber-300 mt-1.5 tracking-widest flex items-center gap-1 animate-pulse">
                                                🚨 urgent
                                              </p>
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-2.5 self-end md:self-auto shrink-0 pl-8 md:pl-0">
                                            <span className="text-[10px] text-red-200 font-mono font-extrabold bg-red-800/80 px-2 py-1 rounded border border-red-700">
                                              Due {item.daysOverdue >= 1 ? `${item.daysOverdue}d ago` : 'today'}
                                            </span>
                                            <button
                                              onClick={() => handleLaunchSubTopic(item.topicRecord.courseId, item.topicRecord.weekNumber, item.subTopic.subTopicId)}
                                              className="px-2.5 py-1.5 bg-white hover:bg-amber-400 text-slate-900 rounded-md transition-all text-[11px] font-bold cursor-pointer flex items-center gap-1 shadow-xs"
                                            >
                                              Review <Play className="h-2.5 w-2.5 fill-current" />
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* UPCOMING REVIEWS ROUNDS */}
                              {upcomingItems.length > 0 && (
                                <div className="space-y-2">
                                  <h4 className="text-[10px] font-mono font-bold tracking-wider text-sky-500 uppercase flex items-center gap-1">
                                    ⏳ SCHEDULER: FUTURE REVIEWS ({upcomingItems.length})
                                  </h4>
                                  <div className="space-y-2">
                                    {upcomingItems.map((item, qidx) => {
                                      const clrSet = getCourseColors(item.color);
                                      const daysLeft = Math.abs(item.daysOverdue);
                                      return (
                                        <div 
                                          key={`upcoming-${qidx}`} 
                                          className="group flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200/60 transition-all opacity-85 hover:opacity-100"
                                        >
                                          <div className="flex items-start gap-3 grow min-w-0">
                                            <input
                                              type="checkbox"
                                              checked={!!item.subTopic.completed}
                                              onChange={(e) => handleToggleSubTopicComplete(item.topicRecord, item.subIdx, e.target.checked)}
                                              className="mt-0.5 h-4.5 w-4.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer accent-sky-600 shrink-0"
                                              title="Mark task as completed"
                                            />
                                            <div className="space-y-0.5 grow min-w-0">
                                              <div className="flex items-center gap-2 flex-wrap">
                                                <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${clrSet.border} ${clrSet.bg}`}>
                                                  {item.courseCode}
                                                </span>
                                                <span className="text-[10px] font-mono text-slate-400">Week {item.topicRecord.weekNumber}</span>
                                                <span className={`h-1.5 w-1.5 rounded-full ${item.subTopic.confidenceStatus === 'RED' ? 'bg-red-500' : item.subTopic.confidenceStatus === 'YELLOW' ? 'bg-amber-400' : 'bg-emerald-500'}`} />
                                                <span className="text-[9px] font-semibold text-slate-500 uppercase">{item.subTopic.confidenceStatus} CALIBRATION</span>
                                              </div>
                                              <h4 className="text-xs font-bold text-slate-750 leading-snug">{item.subTopic.title}</h4>
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-2.5 self-end md:self-auto shrink-0 pl-7 md:pl-0">
                                            <span className="text-[10px] text-slate-500 font-mono italic">
                                              In {daysLeft} {daysLeft === 1 ? 'day' : 'days'} ({formatDateDDMMYYYY(item.subTopic.nextReviewDate)})
                                            </span>
                                            <button
                                              onClick={() => handleLaunchSubTopic(item.topicRecord.courseId, item.topicRecord.weekNumber, item.subTopic.subTopicId)}
                                              className="px-2.5 py-1.5 bg-white hover:bg-amber-100 text-slate-700 hover:text-amber-950 border border-slate-200 hover:border-amber-300 rounded-md transition-all text-[11px] font-semibold cursor-pointer flex items-center gap-1"
                                            >
                                              {daysLeft <= 0 ? "Practice Now" : "Practice Early"}
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </section>

                {/* 2. COURSE WORKSPACE GRID WITH CUSTOM BOOTSTRAPPER */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display font-bold text-sm tracking-tight text-slate-900 uppercase">My Course Grid</h3>
                    <button 
                      type="button"
                      onClick={() => setCourseEditorActive(!courseEditorActive)}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                        courseEditorActive 
                          ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold' 
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                      }`}
                    >
                      <Edit className="h-3.5 w-3.5" /> Editor Mode {courseEditorActive ? 'On' : 'Off'}
                    </button>
                  </div>

                  {courseEditorActive && (
                    <form onSubmit={handleCreateCourse} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4 text-xs animate-fadeIn">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 bg-amber-500 text-slate-950 rounded-lg">
                            <Plus className="h-3.5 w-3.5" />
                          </span>
                          <span className="font-bold text-slate-800 text-sm">Add New Term Course & Syllabus</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono font-medium">AUTOMATED 13-WEEK SEED SETUP</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <label className="text-slate-600 font-semibold block">Unique ID (No spaces)</label>
                          <input 
                            type="text" 
                            required 
                            placeholder="e.g. CS303, MATH101"
                            value={customCourseId}
                            onChange={(e) => setCustomCourseId(e.target.value)}
                            className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg w-full font-mono text-slate-800 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                          />
                        </div>
                        
                        <div className="space-y-1">
                          <label className="text-slate-600 font-semibold block">Shorthand Code</label>
                          <input 
                            type="text" 
                            required 
                            placeholder="e.g. CS 303, MATH 101"
                            value={customCourseCode}
                            onChange={(e) => setCustomCourseCode(e.target.value)}
                            className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg w-full font-mono text-slate-800 focus:outline-none focus:border-amber-500"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-slate-600 font-semibold block">Course Title Name</label>
                          <input 
                            type="text" 
                            required 
                            placeholder="e.g. Theory of Computation"
                            value={customCourseName}
                            onChange={(e) => setCustomCourseName(e.target.value)}
                            className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg w-full text-slate-800 focus:outline-none focus:border-amber-500"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-slate-600 font-semibold block">Accent Visual Theme</label>
                          <select 
                            value={customCourseColor}
                            onChange={(e) => setCustomCourseColor(e.target.value)}
                            className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg w-full text-slate-800 font-medium cursor-pointer"
                          >
                            <option value="amber">Amber Slate</option>
                            <option value="rose">Rose Crimson</option>
                            <option value="indigo">Indigo Deep</option>
                            <option value="violet">Violet Electric</option>
                            <option value="emerald">Emerald Forest</option>
                            <option value="teal">Teal Aurora</option>
                            <option value="orange">Orange Sunset</option>
                            <option value="sky">Sky Oceanic</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2.5 pt-1">
                        <button 
                          type="button" 
                          onClick={() => setCourseEditorActive(false)}
                          className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold cursor-pointer transition-colors"
                        >
                          Cancel
                        </button>
                        <button 
                          type="submit" 
                          className="px-4 py-2 bg-slate-900 text-amber-400 hover:bg-amber-500 hover:text-slate-950 rounded-xl font-black transition-all cursor-pointer"
                        >
                          Bootstrap 13-Week Syllabus
                        </button>
                      </div>
                    </form>
                  )}

                  {courses.length === 0 ? (
                    <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-8 py-10 text-center space-y-3.5">
                      <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center text-xl font-bold">
                        📚
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-display font-medium text-slate-800 text-sm">No Active Courses Found</h4>
                        <p className="text-slate-400 text-xs max-w-sm mx-auto leading-relaxed">
                          Your local environment is clear! Turn on <strong>Editor Mode</strong> above to add customized courses and auto-bootstrap 13-week syllabus chapters.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCourseEditorActive(true)}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-850 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-sm transition-all"
                      >
                        Create Your First Course
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {courses.map((course) => {
                        const stats = getCourseProgress(course.id);
                        const cls = getCourseColors(course.color);
                        
                        return (
                          <div 
                            key={course.id} 
                            onClick={() => {
                              if (courseEditorActive) return; // Prevent navigation during edits
                              setSelectedCourseId(course.id);
                              setActiveSubTopicId(null);
                              setActiveFlashcardsTopicId(null);
                              setCurrentView('course');
                            }}
                            className={`bg-white rounded-2xl shadow-sm border border-slate-200 p-5 hover:border-slate-300 transition-all cursor-pointer hover:-translate-y-0.5 group flex flex-col justify-between h-44 relative ${
                              courseEditorActive ? 'ring-2 ring-amber-500/30 bg-slate-50/50' : ''
                            }`}
                          >
                            {courseEditorActive && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteCourse(course.id);
                                }}
                                title={`Delete course ${course.code}`}
                                className="absolute top-3.5 right-3.5 p-2 bg-rose-50 text-rose-500 hover:bg-rose-600 hover:text-white rounded-lg transition-all z-10 cursor-pointer shadow-sm shadow-rose-150"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}

                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <span className={`text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-lg border ${cls.border} ${cls.bg}`}>
                                  {course.code}
                                </span>
                                {!courseEditorActive && (
                                  <div className="text-[11px] font-mono text-slate-400 font-medium group-hover:text-amber-500 transition-colors flex items-center gap-1">
                                    Workspace <ChevronRight className="h-3 w-3" />
                                  </div>
                                )}
                              </div>
                              
                              <h4 className="text-base font-bold text-slate-900 group-hover:text-slate-800 tracking-tight leading-tight mb-2 pr-6">
                                {course.name}
                              </h4>
                            </div>

                            {/* Stat Indicators Section */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-xs text-slate-500">
                                <span className="font-medium">Mastery Quotient (Completed Quizzes)</span>
                                <span className="font-mono font-bold text-slate-800">{stats.completionRate}%</span>
                              </div>
                              
                              {/* Complete bar indicator */}
                              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full ${cls.accent} transition-all duration-300 rounded-full`}
                                  style={{ width: `${stats.completionRate}%` }}
                                />
                              </div>

                              {/* Bullet metrics counts */}
                              <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 pt-1">
                                <span className="flex items-center gap-0.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {stats.confidenceCount.GREEN} Green</span>
                                <span className="flex items-center gap-0.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> {stats.confidenceCount.YELLOW} Yellow</span>
                                <span className="flex items-center gap-0.5"><span className="h-1.5 w-1.5 rounded-full bg-red-500" /> {stats.confidenceCount.RED} Red</span>
                                <span>{stats.totalSubtopics} Topics</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

              </div>

              {/* Right Grid Column: Deadlines Urgency Engine */}
              <div className="space-y-6">
                
                {/* DYNAMIC URGENCY ENGINE */}
                <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="bg-slate-950 px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-white">
                      <div className="p-1 bg-rose-500/10 text-rose-400 rounded-md">
                        <AlertCircle className="h-4 w-4" />
                      </div>
                      <h3 className="font-display font-bold text-sm tracking-tight">Dynamic Urgency Deadlines</h3>
                    </div>
                  </div>

                  <div className="p-5 space-y-4">
                    
                    {/* Simplified Form Inline to Add Course Deadlines */}
                    <form onSubmit={handleAddDeadline} className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-3 text-xs">
                      <p className="font-semibold text-slate-700">Add Academic Deadline</p>
                      
                      <div className="space-y-2">
                        <input 
                          type="text" 
                          required
                          placeholder="Problem Set 3, Essay, Project Draft..."
                          value={newDeadlineTitle}
                          onChange={(e) => setNewDeadlineTitle(e.target.value)}
                          className="w-full bg-white px-3 py-1.5 border border-slate-200 rounded-md focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                        />
                        
                        <div className="grid grid-cols-2 gap-2">
                          <select 
                            value={newDeadlineCourseId}
                            onChange={(e) => setNewDeadlineCourseId(e.target.value)}
                            className="bg-white px-2 py-1.5 border border-slate-200 rounded-md focus:outline-none"
                          >
                            {courses.map(c => (
                              <option key={c.id} value={c.id}>{c.code}</option>
                            ))}
                          </select>

                          <input 
                            type="time" 
                            value={newDeadlineTime}
                            onChange={(e) => setNewDeadlineTime(e.target.value)}
                            className="bg-white px-2 py-1.5 border border-slate-200 rounded-md focus:outline-none"
                          />
                        </div>

                        <div className="flex items-center gap-2 justify-between">
                          <input 
                            type="date" 
                            value={newDeadlineDate}
                            onChange={(e) => setNewDeadlineDate(e.target.value)}
                            className="bg-white px-2 py-1 border border-slate-200 rounded-md focus:outline-none"
                          />
                          <button 
                            type="submit"
                            className="px-3 py-1 bg-slate-900 hover:bg-amber-500 hover:text-slate-950 text-white font-medium rounded-md transition-all cursor-pointer flex items-center gap-1 shrink-0"
                          >
                            <Plus className="h-3.5 w-3.5" /> Save
                          </button>
                        </div>
                      </div>
                    </form>

                    {/* Deadline Cards List */}
                    <div className="space-y-3.5 max-h-96 overflow-y-auto pr-1">
                      {sortedDeadlines.length === 0 ? (
                        <p className="text-center text-xs text-slate-400 py-4 italic">No deadline objects monitored yet. Set one above!</p>
                      ) : (
                        sortedDeadlines.map((dl) => {
                          const targetCourse = courses.find(c => c.id === dl.courseId);
                          const courseCode = targetCourse ? targetCourse.code : dl.courseId;
                          const courseColor = targetCourse ? targetCourse.color : 'slate';
                          const clsMap = getCourseColors(courseColor);

                          const stat = getDeadlineUrgencyStatus(dl.dueDate, simulatedTodayString);

                          return (
                            <div 
                              key={dl.id}
                              className={`p-3.5 rounded-xl border transition-all ${
                                dl.completed 
                                  ? 'bg-slate-100 border-slate-200 opacity-65 grayscale' 
                                  : stat.level === 'CRITICAL' 
                                    ? 'bg-red-50/70 border-red-200 shadow-sm shadow-red-100' 
                                    : 'bg-white border-slate-200'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                
                                <div className="flex items-start gap-2.5">
                                  <input 
                                    type="checkbox"
                                    checked={dl.completed}
                                    id={`checkbox-${dl.id}`}
                                    onChange={(e) => handleToggleDeadline(dl.id!, e.target.checked)}
                                    className="mt-1 h-4 w-4 rounded text-amber-500 focus:ring-amber-500 border-slate-300 cursor-pointer accent-amber-500"
                                  />
                                  <div>
                                    <h4 className={`text-xs font-bold text-slate-900 leading-tight ${dl.completed ? 'line-through text-slate-400' : ''}`}>
                                      {dl.title}
                                    </h4>
                                    <div className="flex items-center gap-1.5 mt-1">
                                      <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border ${clsMap.border} ${clsMap.bg}`}>
                                        {courseCode}
                                      </span>
                                      <span className="text-[10px] text-slate-400 font-mono">
                                        {formatDateDDMMYYYY(dl.dueDate)} {new Date(dl.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <button 
                                  type="button"
                                  onClick={() => handleDeleteDeadline(dl.id!)}
                                  className="text-slate-300 hover:text-rose-600 p-0.5 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>

                              {!dl.completed && (
                                <div className="mt-2.5 flex items-center justify-between text-[11px]">
                                  <span className="text-slate-400 font-medium">Status</span>
                                  <span className={`px-2 py-0.5 rounded font-mono font-semibold border ${stat.color}`}>
                                    {stat.text}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>

                  </div>
                </section>

                {/* URGENT REVIEW QUEUE */}
                <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="bg-slate-950 px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-white">
                      <div className="p-1 bg-amber-500/10 text-amber-400 rounded-md">
                        <BookMarked className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="font-display font-bold text-sm tracking-tight">Urgent Prerequisite Reviews</h3>
                        <p className="text-[10px] text-slate-400">Prerequisites lacking clarity are cataloged here</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-5 space-y-4">
                    {/* Inline Form to Add Prerequisite Review Node */}
                    <form onSubmit={handleAddUrgentReview} className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-3 text-xs">
                      <p className="font-semibold text-slate-700 font-display">Flag Hidden Gap or Prerequisite</p>

                      <div className="space-y-2">
                        <input 
                          type="text" 
                          required
                          placeholder="e.g. Partial Fractions, Matrix Expansion..."
                          value={newUrgentTitle}
                          onChange={(e) => setNewUrgentTitle(e.target.value)}
                          className="w-full bg-white px-3 py-1.5 border border-slate-200 rounded-md focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                        />

                        <input 
                          type="text" 
                          placeholder="Short description/notes (e.g. missing formula)..."
                          value={newUrgentNotes}
                          onChange={(e) => setNewUrgentNotes(e.target.value)}
                          className="w-full bg-white px-3 py-1.5 border border-slate-200 rounded-md focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                        />
                        
                        <div className="flex items-center gap-2 justify-between">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-400">Class:</span>
                            <select 
                              value={newUrgentCourseId}
                              onChange={(e) => setNewUrgentCourseId(e.target.value)}
                              className="bg-white px-1.5 py-1.5 border border-slate-200 rounded-md focus:outline-none text-[11px] font-mono cursor-pointer"
                            >
                              {courses.map(c => (
                                <option key={c.id} value={c.id}>{c.code}</option>
                              ))}
                            </select>
                          </div>

                          <button 
                            type="submit"
                            className="px-3 py-1 bg-slate-900 hover:bg-amber-500 hover:text-slate-950 text-white font-medium rounded-md transition-all cursor-pointer flex items-center gap-1 shrink-0"
                          >
                            <Plus className="h-3.5 w-3.5" /> Track Gap
                          </button>
                        </div>
                      </div>
                    </form>

                    {/* Prerequisite reviews list */}
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                      {urgentReviews.length === 0 ? (
                        <p className="text-center text-xs text-slate-400 py-4 italic">No priority knowledge gaps marked yet. Smooth sailing!</p>
                      ) : (
                        // Sort by completed status so incomplete stay on top
                        [...urgentReviews]
                          .sort((a, b) => (a.completed ? 1 : 0) - (b.completed ? 1 : 0))
                          .map((ur) => {
                            const targetCourse = courses.find(c => c.id === ur.courseId);
                            const courseCode = targetCourse ? targetCourse.code : ur.courseId;
                            const clsMap = getCourseColors(targetCourse?.color || 'slate');

                            return (
                              <div 
                                key={ur.id}
                                className={`p-3 rounded-xl border transition-all ${
                                  ur.completed 
                                    ? 'bg-slate-50 border-slate-150 opacity-60' 
                                    : 'bg-white border-slate-200 hover:shadow-xs'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-start gap-2.5">
                                    <input 
                                      type="checkbox"
                                      id={`urgent-review-${ur.id}`}
                                      checked={ur.completed}
                                      onChange={(e) => handleToggleUrgentReview(ur.id!, e.target.checked)}
                                      className="mt-1 h-4 w-4 rounded text-amber-500 focus:ring-amber-500 border-slate-300 cursor-pointer accent-amber-500"
                                    />
                                    <div>
                                      <h4 className={`text-xs font-bold text-slate-900 leading-tight ${ur.completed ? 'line-through text-slate-400' : ''}`}>
                                        {ur.title}
                                      </h4>
                                      
                                      {ur.notes && (
                                        <p className={`text-[11px] mt-0.5 text-slate-500 leading-relaxed ${ur.completed ? 'line-through text-slate-400' : ''}`}>
                                          {ur.notes}
                                        </p>
                                      )}

                                      <div className="flex items-center gap-1.5 mt-1.5">
                                        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border ${clsMap.border} ${clsMap.bg}`}>
                                          {courseCode}
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-mono scale-95 origin-left">
                                          Prerequisite Gap
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <button 
                                    type="button"
                                    onClick={() => handleDeleteUrgentReview(ur.id!)}
                                    className="text-slate-300 hover:text-rose-600 p-0.5 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })
                      )}
                    </div>

                  </div>
                </section>

              </div>

            </div>

            {/* Bottom Term Calendar Section */}
            <TermCalendar
              deadlines={deadlines || []}
              courses={courses || []}
              simulatedTodayString={simulatedTodayString}
              getCourseColors={getCourseColors}
              onAddEvent={handleCalendarAddEvent}
              onDeleteEvent={handleCalendarDeleteEvent}
            />

          </div>
        )}

        {/* VIEW B: THE COURSE WORKSPACE (Strict 2-Pane UI) */}
        {currentView === 'course' && activeCourse && (
          <div className="flex-1 flex flex-col gap-4">
            
            {/* Top Workspace Bar */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setCurrentView('dashboard')}
                  className="p-1 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-100 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowLeft className="h-4 w-4" /> Exit Workspace
                </button>
                <div className="h-6 w-px bg-slate-200 hidden md:block" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 border rounded ${getCourseColors(activeCourse.color).border} ${getCourseColors(activeCourse.color).bg}`}>
                      {activeCourse.code}
                    </span>
                    <h3 className="font-display font-bold text-slate-900 tracking-tight text-sm md:text-base">{activeCourse.name}</h3>
                  </div>
                  <p className="text-xs text-slate-400">Week accordion menu lists custom curriculum guidelines</p>
                </div>
              </div>

              {/* Course-level Action Panel */}
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setSyllabusEditorMode(!syllabusEditorMode)}
                  className={`px-3.5 py-1.5 rounded-lg text-[11.5px] font-mono font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                    syllabusEditorMode 
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-400 ring-2 ring-amber-500/10' 
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-250'
                  }`}
                  title="Toggle custom detailed structure, topic addition, and syllabus editing"
                >
                  🛠️ {syllabusEditorMode ? 'Structure Editor [ON]' : 'Subject Editor Mode'}
                </button>

                {syllabusEditorMode ? (
                  <button 
                    onClick={() => handleAddSyllabusTopic(activeCourse.id, activeCourseTopics)}
                    className="px-3.5 py-1.5 bg-slate-900 text-amber-400 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs font-bold cursor-pointer transition-colors flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> New Topic Week
                  </button>
                ) : (
                  <button 
                    onClick={() => {
                      setNewSubTopicWeek(1);
                      setShowAddSubTopicModal(true);
                    }}
                    className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-lg text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Sub-Topic
                  </button>
                )}
              </div>
            </div>

            {/* Structured Workspace 2p Panel Container */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-5 min-h-[550px] items-stretch relative">
              
              {/* SIDEBAR NAVIGATION PANE: LEFT (Column 4 of 12) */}
              {!sidebarHidden && (
                <nav className="md:col-span-4 bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 h-[600px] overflow-y-auto relative">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 sticky top-0 bg-white z-10">
                    <span className="font-display font-bold text-xs tracking-wider uppercase text-slate-400">13-Week Syllabus Accordion</span>
                    <button 
                      onClick={() => setSidebarHidden(true)}
                      className="p-1 text-slate-400 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded transition-all cursor-pointer"
                      title="Collapse Navigation sidebar"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* 13-Week Accordion */}
                  <div className="space-y-2">
                    {activeCourseTopics.map((topicRec) => {
                      const isExpanded = !!expandedWeeks[topicRec.weekNumber];
                      
                      return (
                        <div key={topicRec.id} className={`border rounded-lg overflow-hidden transition-all ${syllabusEditorMode ? 'border-amber-300 ring-1 ring-amber-400/10' : 'border-slate-100'}`}>
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedWeeks(prev => ({
                                ...prev,
                                [topicRec.weekNumber]: !prev[topicRec.weekNumber]
                              }));
                            }}
                            className={`w-full flex items-center justify-between p-2.5 text-left transition-colors cursor-pointer ${syllabusEditorMode ? 'bg-amber-50/20 hover:bg-amber-150/10' : 'bg-slate-50 hover:bg-slate-100'}`}
                          >
                            <div className="flex items-center gap-1.5 justify-between w-full pr-1">
                              {renamingTopicId === topicRec.id ? (
                                <div className="flex items-center gap-1.5 w-full" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="text"
                                    value={renamingTopicValue}
                                    onChange={(e) => setRenamingTopicValue(e.target.value)}
                                    className="grow text-xs bg-white border border-slate-300 rounded px-2 py-1 focus:outline-none focus:border-amber-500 font-bold text-slate-800"
                                    placeholder="Enter topic title..."
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleSaveTopicRename(topicRec.id!);
                                      } else if (e.key === 'Escape') {
                                        setRenamingTopicId(null);
                                      }
                                    }}
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleSaveTopicRename(topicRec.id!)}
                                    className="px-2 py-1 bg-amber-500 text-slate-950 rounded text-[10px] font-bold cursor-pointer hover:bg-amber-400 shrink-0"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setRenamingTopicId(null)}
                                    className="px-2 py-1 bg-slate-200 text-slate-600 rounded text-[10px] font-bold cursor-pointer hover:bg-slate-300 shrink-0"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">WEEK {topicRec.weekNumber}</span>
                                    <h5 className="text-xs font-bold text-slate-850 truncate max-w-[180px] leading-tight flex items-center gap-1">
                                      {topicRec.topicTitle || `Week ${topicRec.weekNumber} Modules`}
                                    </h5>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {syllabusEditorMode && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRenameTopic(topicRec.id!, topicRec.topicTitle);
                                        }}
                                        className="p-1 hover:bg-slate-250 hover:bg-amber-100 text-[10px] rounded text-slate-600 hover:text-amber-950 transition-all cursor-pointer font-bold"
                                        title="Rename Syllabus Topic"
                                      >
                                        ✏️ Rename
                                      </button>
                                    )}
                                    {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                                  </div>
                                </>
                              )}
                            </div>
                          </button>

                          {/* Nested week subcomponents */}
                          {isExpanded && (
                            <div className="p-2 bg-white space-y-1.5 border-t border-slate-100">
                                            {/* Subtopic nodes */}
                              {topicRec.subTopics?.length === 0 ? (
                                <p className="text-[10px] text-slate-400 px-2 italic">No notes assigned yet.</p>
                              ) : (
                                topicRec.subTopics?.map((sub, sidx) => {
                                  const isActive = activeSubTopicId === sub.subTopicId;
                                  
                                  const nowLimit = new Date(simulatedTodayString);
                                  nowLimit.setHours(23, 59, 59, 999);
                                  const isOverdue = sub.nextReviewDate && 
                                                    sub.confidenceStatus !== 'NONE' && 
                                                    !sub.completed && 
                                                    (new Date(sub.nextReviewDate) <= nowLimit);

                                  let containerBgClass = '';
                                  if (isOverdue) {
                                    containerBgClass = isActive 
                                      ? 'bg-red-700 text-white font-bold border border-red-650' 
                                      : 'bg-red-500 hover:bg-red-600 text-white font-bold shadow-xs';
                                  } else if (sub.completed) {
                                    containerBgClass = isActive
                                      ? 'bg-slate-800 text-slate-300'
                                      : 'hover:bg-slate-50 text-slate-400 hover:text-slate-500';
                                  } else {
                                    containerBgClass = isActive 
                                      ? 'bg-slate-900 text-white font-semibold' 
                                      : 'hover:bg-slate-50 text-slate-700';
                                  }

                                  return (
                                    <div 
                                      key={sub.subTopicId}
                                      className={`flex items-center gap-2 justify-between rounded-md p-1.5 transition-colors text-xs ${containerBgClass}`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={!!sub.completed}
                                        onChange={(e) => handleToggleSubTopicComplete(topicRec, sidx, e.target.checked)}
                                        className={`h-3.5 w-3.5 rounded cursor-pointer shrink-0 ${isOverdue ? 'accent-white border-white/40' : 'accent-red-600 border-slate-300'}`}
                                        title="Toggle completion"
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                      <button
                                        onClick={() => {
                                          setActiveSubTopicId(sub.subTopicId);
                                          setActiveFlashcardsTopicId(null);
                                          setEditMode(false);
                                          resetQuizState();
                                        }}
                                        className="grow text-left truncate cursor-pointer mr-1 pr-1 flex flex-col justify-start"
                                      >
                                        <div className={`flex items-center gap-1 flex-wrap ${sub.completed ? 'line-through opacity-75' : ''}`}>
                                          <span className={`mr-0.5 font-mono text-[9px] ${isOverdue ? 'text-red-200' : 'text-slate-400'}`}>{sidx + 1}.</span>
                                          <span className="truncate">{sub.title}</span>
                                          {!isOverdue && !sub.completed && sub.confidenceStatus !== 'NONE' && (
                                            <span className={`inline-block h-1.5 w-1.5 rounded-full ml-0.5 ${
                                              sub.confidenceStatus === 'RED' ? 'bg-rose-500' : sub.confidenceStatus === 'YELLOW' ? 'bg-amber-400' : 'bg-emerald-500'
                                            }`} />
                                          )}
                                        </div>
                                        {isOverdue && (
                                          <span className="text-[9px] font-black uppercase tracking-widest text-amber-200 mt-0.5 animate-pulse">
                                            Urgent
                                          </span>
                                        )}
                                      </button>

                                      {/* Deletion control wrapper */}
                                      <button 
                                        onClick={() => handleDeleteSubTopic(topicRec.id!, sidx, sub.title)}
                                        className={`p-0.5 rounded shrink-0 ${isActive ? 'text-slate-400 hover:text-red-400' : 'text-slate-300 hover:text-red-650'} transition-all cursor-pointer`}
                                        title="Delete sub-topic node"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    </div>
                                  );
                                })
                              )}

                              {/* Sidebar direct add subtopic link */}
                              {syllabusEditorMode && (
                                <div className="mt-1 space-y-1.5 w-full">
                                  {quickAddingSubTopicTopicId === topicRec.id ? (
                                    <div className="p-2 bg-amber-50/50 border border-amber-200 rounded-lg flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                                      <span className="text-[9px] font-mono font-bold text-amber-700 uppercase">New Submodule Title</span>
                                      <input
                                        type="text"
                                        value={quickAddingSubTopicValue}
                                        onChange={(e) => setQuickAddingSubTopicValue(e.target.value)}
                                        placeholder="e.g., Memory Architecture"
                                        className="text-xs bg-white border border-slate-250 rounded px-2 py-1.5 focus:outline-none focus:border-amber-500 placeholder-slate-400 font-medium text-slate-800"
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleSaveQuickAddSubTopic(topicRec.id!, activeCourse.id, topicRec.subTopics || []);
                                          } else if (e.key === 'Escape') {
                                            setQuickAddingSubTopicTopicId(null);
                                          }
                                        }}
                                        autoFocus
                                      />
                                      <div className="flex items-center gap-1.5 justify-end">
                                        <button
                                          type="button"
                                          onClick={() => setQuickAddingSubTopicTopicId(null)}
                                          className="px-2 py-1 bg-slate-200 text-slate-600 rounded text-[10px] font-bold cursor-pointer hover:bg-slate-300"
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleSaveQuickAddSubTopic(topicRec.id!, activeCourse.id, topicRec.subTopics || [])}
                                          className="px-2 py-1 bg-slate-900 text-amber-400 rounded text-[10px] font-bold cursor-pointer hover:bg-slate-800"
                                        >
                                          Add Node
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleQuickAddSubTopic(topicRec.id!, activeCourse.id, topicRec.subTopics || [])}
                                      className="w-full text-left p-1.5 rounded text-[11px] font-bold text-slate-700 bg-amber-500/10 border border-amber-300/40 hover:bg-amber-500/20 hover:text-amber-950 flex items-center justify-center gap-1 transition-all cursor-pointer mt-1"
                                    >
                                      <Plus className="h-3 w-3 text-amber-600 font-extrabold" /> Add Sub-Topic Node
                                    </button>
                                  )}
                                </div>
                              )}

                              {/* Overarching Topic Flashcards item */}
                              <div className="h-px bg-slate-100 my-1" />
                              <button
                                onClick={() => handleLaunchFlashcards(topicRec.courseId, topicRec.weekNumber, topicRec.topicId)}
                                className={`w-full text-left p-1.5 rounded flex items-center justify-between text-xs font-semibold ${
                                  activeFlashcardsTopicId === topicRec.topicId 
                                    ? 'bg-amber-100 text-amber-950 border border-amber-200' 
                                    : 'text-amber-800 hover:bg-amber-50'
                                }`}
                              >
                                <span className="flex items-center gap-1">
                                  <BookMarked className="h-3.5 w-3.5" /> Topic Flashcards
                                </span>
                                <span className="text-[10px] font-mono font-bold bg-amber-500/10 text-amber-600 px-1 rounded-sm border border-amber-500/20">
                                  {topicRec.masterFlashcards?.length || 0} cards
                                </span>
                              </button>

                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </nav>
              )}

              {/* Persistent sidebar recall tab option */}
              {sidebarHidden && (
                <button 
                  onClick={() => setSidebarHidden(false)}
                  className="absolute left-6 top-8 z-10 p-2.5 bg-slate-900 border border-slate-800 text-slate-100 hover:bg-slate-800 hover:text-white rounded-xl shadow-lg transition-all cursor-pointer flex items-center gap-2 text-xs"
                >
                  <Menu className="h-4 w-4" /> <span>Show Accordion Menu</span>
                </button>
              )}

              {/* CONTEXT CENTER PANE: RIGHT (Column 8 of 12 if sidebar shown/ 12 of 12 if collapsed) */}
              <section className={`${sidebarHidden ? 'md:col-span-12' : 'md:col-span-8'} bg-white border border-slate-200 rounded-2xl p-4 md:p-6 flex flex-col gap-4 h-[600px] overflow-y-auto`}>
                
                {/* Scenario 1: No subtopic or flashcards are selected */}
                {!activeSelectionDetails && !activeFlashcardTopicDetails && (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                    <BookOpen className="h-14 w-14 text-slate-300 mb-3" />
                    <h4 className="font-display font-bold text-slate-800 text-lg">No Module Loaded</h4>
                    <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">
                      Click any subtopic lecture or the Topic Flashcards deck within the left 13-week syllabus accordion to load resources into this study pane. Or create a custom subtopic node from the options header.
                    </p>
                    <div className="mt-5 flex gap-2">
                      {activeCourseTopics.length > 0 && activeCourseTopics[0].subTopics?.length > 0 && (
                        <button
                          onClick={() => {
                            const sub = activeCourseTopics[0].subTopics[0];
                            handleLaunchSubTopic(activeCourse.id, 1, sub.subTopicId);
                          }}
                          className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          Launch Week 1 Core Lecture
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Scenario 2: Active Subtopic module loaded */}
                {activeSelectionDetails && (
                  <div className="space-y-6">
                    
                    {/* Header breadcrumb & Edit Switcher */}
                    <div className="flex items-center justify-between border-b border-slate-150 pb-4">
                      <div>
                        <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400">
                          <span>{activeCourse.code}</span>
                          <span>/</span>
                          <span>Week {activeSelectionDetails.topicRecord.weekNumber}</span>
                          <span>/</span>
                          <span className="text-slate-500 font-semibold">{activeSelectionDetails.topicRecord.topicTitle}</span>
                        </div>
                        <h2 className="text-xl font-bold font-display text-slate-900 mt-0.5 tracking-tight">{activeSelectionDetails.subTopic.title}</h2>
                      </div>

                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setEditMode(!editMode)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border flex items-center gap-1.5 transition-colors ${
                            editMode 
                              ? 'bg-amber-100 text-amber-950 border-amber-250 hover:bg-amber-200' 
                              : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200'
                          }`}
                        >
                          {editMode ? (
                            <>
                              <Eye className="h-3.5 w-3.5" /> View Mode
                            </>
                          ) : (
                            <>
                              <Edit className="h-3.5 w-3.5" /> Edit Content
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* CONTEXT MODE A: EDITOR MODE */}
                    {editMode ? (
                      <div className="space-y-5 bg-amber-50/20 p-4 rounded-xl border border-amber-100">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-700 block">✏️ Notes Markdown Editor</span>
                          <span className="text-[10px] font-mono bg-slate-100 px-2 py-0.5 text-slate-400 float-right">Supports H1 (#), H2 (##), bullet lists (-), and inline code (`)</span>
                        </div>
                        
                        <textarea
                          id="markdown-notes-editor"
                          defaultValue={activeSelectionDetails.subTopic.notesMarkdown}
                          rows={14}
                          className="w-full bg-white p-3 font-mono text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-amber-500"
                        />

                        {/* Obsidian-Style Formatting Glossary */}
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                            <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                              <span className="text-sm">📓</span>
                              <span className="font-display font-bold text-slate-700 tracking-tight text-xs">Obsidian-Style Formatting Guide</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">Click [+ Use] to insert template at your cursor!</span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-slate-600">
                            {/* Column 1: Typography & Lists */}
                            <div className="space-y-2">
                              <div className="font-semibold text-[10px] uppercase tracking-wider text-slate-400">Typography & Lists</div>
                              <div className="grid grid-cols-1 gap-1.5">
                                <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-100 hover:border-amber-300 transition-colors">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-[11px] text-slate-800">Heading 1</span>
                                    <span className="font-mono text-[10px] text-slate-400 font-medium"># Title</span>
                                  </div>
                                  <button 
                                    type="button"
                                    onClick={() => handleInsertSnippet('\n# New Heading 1\n')} 
                                    className="px-2 py-0.5 bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-900 border border-slate-200 rounded text-[10px] transition-colors font-medium cursor-pointer"
                                  >
                                    + Use
                                  </button>
                                </div>

                                <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-100 hover:border-amber-300 transition-colors">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-[11px] text-slate-800">Heading 2</span>
                                    <span className="font-mono text-[10px] text-slate-400 font-medium">## Subsection</span>
                                  </div>
                                  <button 
                                    type="button"
                                    onClick={() => handleInsertSnippet('\n## New Heading 2\n')} 
                                    className="px-2 py-0.5 bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-900 border border-slate-200 rounded text-[10px] transition-colors font-medium cursor-pointer"
                                  >
                                    + Use
                                  </button>
                                </div>

                                <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-100 hover:border-amber-300 transition-colors">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-[11px] text-slate-800">Bold Text</span>
                                    <span className="font-mono text-[10px] text-slate-400 font-medium">**bold text**</span>
                                  </div>
                                  <button 
                                    type="button"
                                    onClick={() => handleInsertSnippet('**bold text**')} 
                                    className="px-2 py-0.5 bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-900 border border-slate-200 rounded text-[10px] transition-colors font-medium cursor-pointer"
                                  >
                                    + Use
                                  </button>
                                </div>

                                <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-100 hover:border-amber-300 transition-colors">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-[11px] text-slate-800">Bullet Item</span>
                                    <span className="font-mono text-[10px] text-slate-400 font-medium">- List Item</span>
                                  </div>
                                  <button 
                                    type="button"
                                    onClick={() => handleInsertSnippet('\n- New Bullet Item\n')} 
                                    className="px-2 py-0.5 bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-900 border border-slate-200 rounded text-[10px] transition-colors font-medium cursor-pointer"
                                  >
                                    + Use
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Column 2: Code & Math Block Layout */}
                            <div className="space-y-2">
                              <div className="font-semibold text-[10px] uppercase tracking-wider text-slate-400">Obsidian Code & Math</div>
                              <div className="grid grid-cols-1 gap-1.5">
                                <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-100 hover:border-amber-300 transition-colors">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-[11px] text-slate-800">Inline Code Block</span>
                                    <span className="font-mono text-[10px] text-slate-400 font-medium">`code code`</span>
                                  </div>
                                  <button 
                                    type="button"
                                    onClick={() => handleInsertSnippet('`const result = calculateValue();`')} 
                                    className="px-2 py-0.5 bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-900 border border-slate-200 rounded text-[10px] transition-colors font-medium cursor-pointer"
                                  >
                                    + Use
                                  </button>
                                </div>

                                <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-100 hover:border-amber-300 transition-colors">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-[11px] text-slate-800">Code Block (Multiline)</span>
                                    <span className="font-mono text-[10px] text-slate-400 font-medium">```typescript ... ```</span>
                                  </div>
                                  <button 
                                    type="button"
                                    onClick={() => handleInsertSnippet('\n```typescript\nconst sum = (a: number, b: number): number => {\n  return a + b;\n};\n```\n')} 
                                    className="px-2 py-0.5 bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-900 border border-slate-200 rounded text-[10px] transition-colors font-medium cursor-pointer"
                                  >
                                    + Use
                                  </button>
                                </div>

                                <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-100 hover:border-amber-300 transition-colors">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-[11px] text-slate-800">Inline Math formula</span>
                                    <span className="font-mono text-[10px] text-slate-400 font-medium">$$ E = mc^2 $$</span>
                                  </div>
                                  <button 
                                    type="button"
                                    onClick={() => handleInsertSnippet('$$E = mc^2$$')} 
                                    className="px-2 py-0.5 bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-900 border border-slate-200 rounded text-[10px] transition-colors font-medium cursor-pointer"
                                  >
                                    + Use
                                  </button>
                                </div>

                                <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-100 hover:border-amber-300 transition-colors">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-[11px] text-slate-800">Display Math Block</span>
                                    <span className="font-mono text-[10px] text-slate-400 font-medium">$$ equation $$</span>
                                  </div>
                                  <button 
                                    type="button"
                                    onClick={() => handleInsertSnippet('\n$$\nf(x) = \\int_{-\\infty}^{\\infty} e^{-x^2} dx\n$$\n')} 
                                    className="px-2 py-0.5 bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-900 border border-slate-200 rounded text-[10px] transition-colors font-medium cursor-pointer"
                                  >
                                    + Use
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Save Trigger */}
                        <div className="flex justify-between items-center text-xs">
                          <p className="text-slate-400">Local save immediately executes upon clicking commit.</p>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => setEditMode(false)}
                              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-md font-medium cursor-pointer"
                            >
                              Discard
                            </button>
                            <button 
                              onClick={() => {
                                const textareaEl = document.getElementById('markdown-notes-editor') as HTMLTextAreaElement;
                                handleSaveNotes(textareaEl?.value || '');
                              }}
                              className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold rounded-md shadow cursor-pointer"
                            >
                              Commit Notes
                            </button>
                          </div>
                        </div>

                        {/* QUIZ MANAGER SECTION UNDER EDITOR */}
                        <div className="h-px bg-slate-200 my-4" />
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h4 className="font-display font-black text-xs uppercase text-slate-500 tracking-wider">🛠️ Manage Quiz Questions ({activeSelectionDetails.subTopic.quiz?.length || 0})</h4>
                            <button 
                              onClick={handleAddNewQuizQuestion}
                              className="px-2.5 py-1 bg-slate-900 text-white hover:bg-slate-800 text-[10px] rounded font-semibold cursor-pointer flex items-center gap-1"
                            >
                              <Plus className="h-3 w-3" /> Append Question
                            </button>
                          </div>

                          <div className="space-y-3">
                            {activeSelectionDetails.subTopic.quiz?.map((q, qIdx) => (
                              <div key={qIdx} className="bg-white p-3 rounded-lg border border-slate-200 space-y-2 text-xs">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-bold text-[10px] uppercase text-slate-400">Question {qIdx + 1}</span>
                                  <button 
                                    onClick={() => handleDeleteQuizQuestion(qIdx)}
                                    className="text-slate-400 hover:text-red-500"
                                    title="Delete this question node"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                                <input 
                                  type="text"
                                  defaultValue={q.question}
                                  onChange={(e) => handleUpdateQuiz(qIdx, { question: e.target.value })}
                                  placeholder="Type question prompt..."
                                  className="w-full bg-slate-50 p-2 border border-slate-150 rounded"
                                />

                                {/* Edit Options */}
                                <div className="space-y-1 mt-1">
                                  <label className="text-[10px] text-slate-400 block font-semibold leading-none">Options List (comma separated):</label>
                                  <input 
                                    type="text"
                                    defaultValue={q.options.join(', ')}
                                    onChange={(e) => {
                                      const optsArr = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                                      handleUpdateQuiz(qIdx, { options: optsArr });
                                    }}
                                    placeholder="Option A, Option B, Option C, Option D"
                                    className="w-full bg-slate-50 p-2 border border-slate-150 rounded font-sans text-xs"
                                  />
                                </div>

                                {/* Correct Index Selection */}
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[10px] text-slate-400">Correct Alternative Index:</span>
                                  <select 
                                    value={q.correctOptionIndex}
                                    onChange={(e) => handleUpdateQuiz(qIdx, { correctOptionIndex: parseInt(e.target.value) })}
                                    className="bg-slate-100 rounded px-2 py-1"
                                  >
                                    {q.options.map((_, oIdx) => (
                                      <option key={oIdx} value={oIdx}>Option {oIdx + 1}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* New Quiz Question Builder Form */}
                          <div className="bg-slate-55 border border-amber-200/50 rounded-2xl p-4 mt-5 space-y-3 text-xs">
                            <div className="flex items-center gap-1.5 border-b border-amber-200/40 pb-2">
                              <span className="p-1 bg-amber-500/10 text-amber-600 rounded">
                                <Plus className="h-3.5 w-3.5" />
                              </span>
                              <span className="font-bold text-slate-800">Add Detailed Custom Quiz Question</span>
                            </div>

                            <form onSubmit={handleCreateCustomQuizQuestion} className="space-y-3">
                              <div className="space-y-1">
                                <label className="text-[10px] text-slate-500 font-semibold block">Question Prompt / Heading</label>
                                <input 
                                  type="text"
                                  required
                                  placeholder="e.g. What is the fundamental asymptotic limit of case 1 in Master Theorem?"
                                  value={newQuizQuestionPrompt}
                                  onChange={(e) => setNewQuizQuestionPrompt(e.target.value)}
                                  className="w-full bg-white px-3 py-2 border border-slate-250 rounded-lg focus:outline-none focus:border-amber-500 text-slate-800"
                                />
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <label className="text-[10px] text-slate-500 font-semibold block">Option A (Required)</label>
                                  <input 
                                    type="text"
                                    required
                                    placeholder="e.g. Theta(n^(log_b a))"
                                    value={newQuizOption1}
                                    onChange={(e) => setNewQuizOption1(e.target.value)}
                                    className="w-full bg-white px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-amber-500 text-slate-800"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[10px] text-slate-500 font-semibold block">Option B (Required)</label>
                                  <input 
                                    type="text"
                                    required
                                    placeholder="e.g. Theta(n log n)"
                                    value={newQuizOption2}
                                    onChange={(e) => setNewQuizOption2(e.target.value)}
                                    className="w-full bg-white px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-amber-500 text-slate-800"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[10px] text-slate-500 font-semibold block">Option C (Optional)</label>
                                  <input 
                                    type="text"
                                    placeholder="e.g. Theta(1)"
                                    value={newQuizOption3}
                                    onChange={(e) => setNewQuizOption3(e.target.value)}
                                    className="w-full bg-white px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-amber-500 text-slate-800"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[10px] text-slate-500 font-semibold block">Option D (Optional)</label>
                                  <input 
                                    type="text"
                                    placeholder="e.g. None of the above"
                                    value={newQuizOption4}
                                    onChange={(e) => setNewQuizOption4(e.target.value)}
                                    className="w-full bg-white px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-amber-500 text-slate-800"
                                  />
                                </div>
                              </div>

                              <div className="flex items-center justify-between gap-3 pt-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-slate-500 font-bold">Mark Select Correct Option:</span>
                                  <select 
                                    value={newQuizCorrectIndex}
                                    onChange={(e) => setNewQuizCorrectIndex(parseInt(e.target.value))}
                                    className="bg-white px-2.5 py-1.5 border border-slate-250 rounded-lg font-semibold text-xs text-slate-800 cursor-pointer focus:outline-none"
                                  >
                                    <option value={0}>Option A</option>
                                    <option value={1}>Option B</option>
                                    {newQuizOption3.trim() && <option value={2}>Option C</option>}
                                    {newQuizOption4.trim() && <option value={3}>Option D</option>}
                                  </select>
                                </div>

                                <button 
                                  type="submit"
                                  className="px-4 py-2 bg-slate-900 text-amber-400 hover:bg-amber-500 hover:text-slate-950 font-black rounded-xl transition-all cursor-pointer shadow-sm"
                                >
                                  Save Question Entry
                                </button>
                              </div>
                            </form>
                          </div>

                        </div>

                      </div>
                    ) : (
                      
                      // VIEW MODE: RENDER NOTES, QUIZ AND REPETITION
                      <div className="space-y-6">

                        {/* Interactive Pill Tabs to split Notes & Quiz */}
                        <div className="flex items-center justify-start border-b border-slate-150 pb-3 mb-2">
                          <div className="bg-slate-100/90 p-1.5 rounded-2xl flex items-center gap-1 border border-slate-200/50">
                            <button
                              type="button"
                              onClick={() => setActiveViewTab('notes')}
                              className={`px-4.5 py-1.5 rounded-xl text-xs font-semibold tracking-tight transition-all duration-150 flex items-center gap-2 cursor-pointer ${
                                activeViewTab === 'notes'
                                  ? 'bg-white text-slate-900 shadow-sm font-bold border border-slate-200/50'
                                  : 'text-slate-500 hover:text-slate-800 bg-transparent'
                              }`}
                            >
                              <span className="text-sm">📖</span> Notes
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveViewTab('quiz')}
                              className={`px-4.5 py-1.5 rounded-xl text-xs font-semibold tracking-tight transition-all duration-150 flex items-center gap-2 cursor-pointer ${
                                activeViewTab === 'quiz'
                                  ? 'bg-white text-slate-900 shadow-sm font-bold border border-slate-200/50'
                                  : 'text-slate-500 hover:text-slate-800 bg-transparent'
                              }`}
                            >
                              <span className="text-sm text-rose-500 font-bold">❓</span> Quiz ({activeSelectionDetails.subTopic.quiz?.length || 0})
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveViewTab('flashcards');
                                setSubFCIndex(0);
                                setSubIsFlipped(false);
                              }}
                              className={`px-4.5 py-1.5 rounded-xl text-xs font-semibold tracking-tight transition-all duration-150 flex items-center gap-2 cursor-pointer ${
                                activeViewTab === 'flashcards'
                                  ? 'bg-white text-slate-900 shadow-sm font-bold border border-slate-200/50'
                                  : 'text-slate-500 hover:text-slate-800 bg-transparent'
                              }`}
                            >
                              <span className="text-sm text-indigo-500 font-bold">⚡</span> Flashcards ({activeSelectionDetails.subTopic.flashcards?.length || 0})
                            </button>
                          </div>
                        </div>

                        {activeViewTab === 'notes' ? (
                          /* A. Core Markdown Study Notes View */
                          <article className="prose max-w-none prose-slate bg-indigo-50/10 border border-slate-100 p-5 rounded-2xl shadow-sm">
                            <MarkdownView content={activeSelectionDetails.subTopic.notesMarkdown} />
                          </article>
                        ) : activeViewTab === 'quiz' ? (
                          /* B. Mastery Quiz Block */
                          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 md:p-6 space-y-5">
                            
                            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-200/60 pb-3 mb-1">
                              <div className="flex items-center gap-2">
                                <Award className="h-5 w-5 text-amber-500" />
                                <h3 className="font-display font-medium text-slate-900 text-sm md:text-base">Module Mastery Check-Quiz</h3>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono bg-slate-200 text-slate-650 px-2.5 py-1 rounded-full font-bold">
                                  PASS GOAL: 80% SCORE REQUIRED
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setShowViewModeQuizBuilder(!showViewModeQuizBuilder)}
                                  className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer border flex items-center gap-1 transition-all ${
                                    showViewModeQuizBuilder
                                      ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                                      : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-200 shadow-xs'
                                  }`}
                                >
                                  <Plus className="h-3 w-3" /> Add Question
                                </button>
                              </div>
                            </div>

                            {/* View-Mode Quiz Builder Form */}
                            {showViewModeQuizBuilder && (
                              <div className="bg-white border border-slate-200 rounded-2xl p-5 my-2 space-y-4 text-xs shadow-xs">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className="p-1 bg-amber-500/10 text-amber-600 rounded">
                                      <Plus className="h-4 w-4" />
                                    </span>
                                    <span className="font-bold text-slate-800">Add Custom Quiz Questions</span>
                                  </div>

                                  {/* Select Toggles */}
                                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                                    <button
                                      type="button"
                                      onClick={() => setQuizAddMode('single')}
                                      className={`px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer transition-all ${
                                        quizAddMode === 'single'
                                          ? 'bg-white text-slate-850 shadow-xs'
                                          : 'text-slate-500 hover:text-slate-800'
                                      }`}
                                    >
                                      Single Form
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setQuizAddMode('bulk')}
                                      className={`px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer transition-all ${
                                        quizAddMode === 'bulk'
                                          ? 'bg-amber-400 text-slate-950 shadow-xs'
                                          : 'text-slate-500 hover:text-slate-800'
                                      }`}
                                    >
                                      🚀 Bulk Importer
                                    </button>
                                  </div>
                                </div>

                                {quizAddMode === 'single' ? (
                                  <form onSubmit={handleCreateCustomQuizQuestion} className="space-y-3">
                                    <div className="space-y-1">
                                      <label className="text-[10px] text-slate-500 font-semibold block">Question Prompt / Heading</label>
                                      <input 
                                        type="text"
                                        required
                                        placeholder="e.g. What is the fundamental asymptotic limit of case 1 in Master Theorem?"
                                        value={newQuizQuestionPrompt}
                                        onChange={(e) => setNewQuizQuestionPrompt(e.target.value)}
                                        className="w-full bg-slate-55 px-3 py-2 border border-slate-250 rounded-lg focus:outline-none focus:border-amber-500 text-slate-800 focus:bg-white"
                                      />
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                      <div className="space-y-1">
                                        <label className="text-[10px] text-slate-500 font-semibold block">Option A (Required)</label>
                                        <input 
                                          type="text"
                                          required
                                          placeholder="e.g. Theta(n^(log_b a))"
                                          value={newQuizOption1}
                                          onChange={(e) => setNewQuizOption1(e.target.value)}
                                          className="w-full bg-slate-55 px-3 py-1.5 border border-slate-205 rounded-lg focus:outline-none focus:border-amber-500 text-slate-800 focus:bg-white"
                                        />
                                      </div>

                                      <div className="space-y-1">
                                        <label className="text-[10px] text-slate-500 font-semibold block">Option B (Required)</label>
                                        <input 
                                          type="text"
                                          required
                                          placeholder="e.g. Theta(n log n)"
                                          value={newQuizOption2}
                                          onChange={(e) => setNewQuizOption2(e.target.value)}
                                          className="w-full bg-slate-55 px-3 py-1.5 border border-slate-205 rounded-lg focus:outline-none focus:border-amber-500 text-slate-800 focus:bg-white"
                                        />
                                      </div>

                                      <div className="space-y-1">
                                        <label className="text-[10px] text-slate-500 font-semibold block">Option C (Optional)</label>
                                        <input 
                                          type="text"
                                          placeholder="e.g. Theta(1)"
                                          value={newQuizOption3}
                                          onChange={(e) => setNewQuizOption3(e.target.value)}
                                          className="w-full bg-slate-55 px-3 py-1.5 border border-slate-205 rounded-lg focus:outline-none focus:border-amber-500 text-slate-800 focus:bg-white"
                                        />
                                      </div>

                                      <div className="space-y-1">
                                        <label className="text-[10px] text-slate-500 font-semibold block">Option D (Optional)</label>
                                        <input 
                                          type="text"
                                          placeholder="e.g. None of the above"
                                          value={newQuizOption4}
                                          onChange={(e) => setNewQuizOption4(e.target.value)}
                                          className="w-full bg-slate-55 px-3 py-1.5 border border-slate-205 rounded-lg focus:outline-none focus:border-amber-500 text-slate-800 focus:bg-white"
                                        />
                                      </div>
                                    </div>

                                    <div className="flex items-center justify-between gap-3 pt-2">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] text-slate-500 font-bold">Mark Correct Answer:</span>
                                        <select 
                                          value={newQuizCorrectIndex}
                                          onChange={(e) => setNewQuizCorrectIndex(parseInt(e.target.value))}
                                          className="bg-slate-55 px-2.5 py-1.5 border border-slate-200 rounded-lg font-semibold text-xs text-slate-800 cursor-pointer focus:outline-none"
                                        >
                                          <option value={0}>Option A</option>
                                          <option value={1}>Option B</option>
                                          {newQuizOption3.trim() && <option value={2}>Option C</option>}
                                          {newQuizOption4.trim() && <option value={3}>Option D</option>}
                                        </select>
                                      </div>

                                      <button 
                                        type="submit"
                                        className="px-4 py-2 bg-slate-900 text-amber-400 hover:bg-amber-500 hover:text-slate-950 font-black rounded-xl transition-all cursor-pointer shadow-sm"
                                      >
                                        Save Question Entry
                                      </button>
                                    </div>
                                  </form>
                                ) : (
                                  <form onSubmit={handleBulkQuizImport} className="space-y-3">
                                    <div className="bg-amber-50 border border-amber-200/50 rounded-xl p-3 text-slate-700 leading-relaxed">
                                      <span className="font-bold block text-amber-900 mb-1">💡 NOTE TO SELF (Instructions):</span>
                                      <p className="text-[10.5px]">
                                        Please format multiple questions by separating them with a blank line. For each question, label the options. Put <strong className="text-emerald-700 bg-emerald-55 px-1 py-0.5 rounded font-mono">"Correct Answer"</strong> next to the true answer option so it will be automatically selected.
                                      </p>
                                      <pre className="text-[10px] font-mono text-zinc-600 bg-white/70 p-2 rounded mt-2 border border-slate-100 leading-tight">
{`Who developed the Theory of General Relativity?
- Isaac Newton
- Albert Einstein (Correct Answer)
- Niels Bohr`}
                                      </pre>
                                    </div>

                                    <div className="space-y-1">
                                      <label className="text-[10px] text-slate-500 font-bold block">Bulk Paste Input Area</label>
                                      <textarea
                                        required
                                        rows={6}
                                        value={bulkQuizText}
                                        onChange={(e) => setBulkQuizText(e.target.value)}
                                        placeholder="Paste multiple questions here..."
                                        className="w-full bg-slate-55 font-mono text-[11px] px-3 py-2 border border-slate-250 rounded-lg focus:outline-none focus:border-amber-500 text-slate-800 focus:bg-white"
                                      />
                                    </div>

                                    <div className="flex items-center justify-end">
                                      <button 
                                        type="submit"
                                        className="px-4 py-2 bg-slate-900 text-amber-400 hover:bg-amber-500 hover:text-slate-950 font-black rounded-xl transition-all cursor-pointer shadow-sm text-xs font-mono"
                                      >
                                        ⚡ Parse & Import Questions
                                      </button>
                                    </div>
                                  </form>
                                )}
                              </div>
                            )}

                            {/* Quiz Questions List */}
                            {!activeSelectionDetails.subTopic.quiz || activeSelectionDetails.subTopic.quiz.length === 0 ? (
                              <p className="text-xs text-slate-400 italic">No quiz created yet. Click "Add Question" above to append questions directly!</p>
                            ) : (
                              <div className="space-y-4">
                                {activeSelectionDetails.subTopic.quiz.map((qObj, idx) => {
                                  const givenAns = userAnswers[idx];
                                  const hasBeenAnswered = givenAns !== undefined;
                                  
                                  return (
                                    <div key={idx} className="space-y-2">
                                      <h5 className="text-xs font-bold text-slate-800">
                                        <span className="text-amber-500 mr-1 font-mono">{idx + 1}.</span> {qObj.question}
                                      </h5>
                                      
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {qObj.options.map((opt, oIdx) => {
                                          const isSelected = givenAns === oIdx;
                                          const showSuccess = (quizSubmitted || hasBeenAnswered) && oIdx === qObj.correctOptionIndex;
                                          const showFailure = (quizSubmitted || hasBeenAnswered) && isSelected && oIdx !== qObj.correctOptionIndex;

                                          let btnCls = "bg-white border-slate-200 hover:bg-slate-100 text-slate-700 hover:border-slate-300";
                                          if (isSelected) btnCls = "bg-slate-900 text-white border-slate-900 font-medium";
                                          if (showSuccess) btnCls = "bg-emerald-50 text-emerald-900 border-emerald-400 font-bold shadow-xs";
                                          if (showFailure) btnCls = "bg-rose-50 text-rose-900 border-rose-400 font-medium";

                                          return (
                                            <button
                                              key={oIdx}
                                              type="button"
                                              onClick={() => handleOptionSelect(idx, oIdx)}
                                              disabled={hasBeenAnswered || quizSubmitted}
                                              className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors cursor-pointer ${btnCls}`}
                                            >
                                              <span className="font-mono text-[10px] mr-1.5 text-slate-400">({String.fromCharCode(65 + oIdx)})</span> {cleanOptionForDisplay(opt)}
                                              {showSuccess && <span className="ml-1 text-emerald-600 font-bold">✓</span>}
                                              {showFailure && <span className="ml-1 text-rose-600 font-bold">✗</span>}
                                            </button>
                                          );
                                        })}
                                      </div>

                                      {hasBeenAnswered && (
                                        <div className={`mt-2 p-2.5 rounded-lg text-xs flex items-center gap-2 border transition-all duration-200 ${
                                          givenAns === qObj.correctOptionIndex 
                                            ? 'bg-emerald-50/80 text-emerald-800 border-emerald-200' 
                                            : 'bg-rose-50/80 text-rose-800 border-rose-250'
                                        }`}>
                                          <span className="text-sm">
                                            {givenAns === qObj.correctOptionIndex ? '✅' : '❌'}
                                          </span>
                                          <span>
                                            {givenAns === qObj.correctOptionIndex 
                                              ? 'Correct! You understood this concept.' 
                                              : `Incorrect. The correct answer is Option (${String.fromCharCode(65 + qObj.correctOptionIndex)}): ${cleanOptionForDisplay(qObj.options[qObj.correctOptionIndex])}.`}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}

                                {/* Submit Quiz Actions / Dynamic results report */}
                                <div className="pt-3 border-t border-slate-150 flex items-center justify-between flex-wrap gap-2.5">
                                  {!quizSubmitted ? (
                                    <>
                                      <p className="text-[11px] text-slate-400">Complete all choices prior to auditing.</p>
                                      <button 
                                        type="button"
                                        onClick={() => handleSubmitQuiz(activeSelectionDetails.subTopic.quiz)}
                                        className="px-4 py-2 bg-slate-900 hover:bg-amber-500 hover:text-slate-950 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                                      >
                                        Audit Answers
                                      </button>
                                    </>
                                  ) : (
                                    <div className="w-full flex-col md:flex-row flex items-center justify-between gap-4 p-4 rounded-xl bg-slate-100 border border-slate-200">
                                      <div className="flex items-center gap-3">
                                        <div className={`p-2.5 rounded-lg ${quizPassed ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-650'}`}>
                                          <CheckCircle2 className="h-6 w-6" />
                                        </div>
                                        <div>
                                          <h4 className="text-sm font-bold text-slate-900">
                                            {quizPassed ? '🎉 Mastery Level Unlocked!' : '❌ Let\'s Review Notes Again!'}
                                          </h4>
                                          <p className="text-xs text-slate-500">
                                            Grade: <strong className="text-slate-800">{quizScore}% Correct</strong> ({activeSelectionDetails.subTopic.quiz.length} total questions)
                                          </p>
                                        </div>
                                      </div>

                                      <button 
                                        type="button"
                                        onClick={resetQuizState}
                                        className="px-3.5 py-1.5 bg-white hover:bg-slate-55 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
                                      >
                                        <RotateCcw className="h-3.5 w-3.5" /> Retake Answers
                                      </button>
                                    </div>
                                  )}
                                </div>

                              </div>
                            )}

                          </div>
                        ) : (
                          /* C. Subtopic Flashcards Study Panel */
                          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 md:p-6 space-y-5">
                            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-200/60 pb-3 mb-1">
                              <div className="flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-indigo-500" />
                                <h3 className="font-display font-medium text-slate-900 text-sm md:text-base">Subtopic Flashcards Deck ({activeSelectionDetails.subTopic.flashcards?.length || 0})</h3>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setSubFCAddMode(subFCAddMode === 'single' ? 'bulk' : 'single')}
                                  className="px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 cursor-pointer"
                                >
                                  {subFCAddMode === 'single' ? '🚀 Bulk Parser Importer' : '✍️ Single Add Mode'}
                                </button>
                              </div>
                            </div>

                            {/* Flashcards study and flip interface */}
                            {!activeSelectionDetails.subTopic.flashcards || activeSelectionDetails.subTopic.flashcards.length === 0 ? (
                              <div className="text-center py-6 bg-white/70 border border-dashed border-slate-250 rounded-xl">
                                <p className="text-xs text-slate-400 italic mb-2">No flashcards found specifically for this subtopic.</p>
                                <p className="text-[11px] text-slate-400">Add some using the Single Add or Bulk Parser tools below!</p>
                              </div>
                            ) : (
                              <div className="space-y-4">
                                <p className="text-[11px] text-slate-400 text-center">
                                  Card <span className="font-bold text-slate-700">{subFCIndex + 1}</span> of <span className="font-bold text-slate-700">{activeSelectionDetails.subTopic.flashcards.length}</span> — click inside the box below to flip face:
                                </p>

                                {/* 3D-styled Interactive Card */}
                                <div 
                                  onClick={() => setSubIsFlipped(!subIsFlipped)}
                                  className={`w-full min-h-[160px] md:min-h-[180px] p-6 rounded-2xl border flex flex-col items-center justify-center text-center cursor-pointer select-none transition-all duration-305 relative overflow-hidden shadow-xs hover:shadow-md ${
                                    subIsFlipped 
                                      ? 'bg-indigo-950 text-white border-indigo-900 ring-1 ring-indigo-500' 
                                      : 'bg-white text-slate-900 border-slate-250 hover:border-slate-300 hover:bg-indigo-50/10'
                                  }`}
                                >
                                  {/* Corner Indicator badges */}
                                  <div className="absolute top-2.5 right-3 text-[9px] uppercase tracking-widest font-bold text-slate-400">
                                    {subIsFlipped ? '💡 Explanation Face' : '❓ Prompt Face'}
                                  </div>

                                  <div className="space-y-2 max-w-lg">
                                    <h4 className={`font-medium leading-relaxed tracking-tight ${subIsFlipped ? 'text-sm md:text-base text-indigo-100 font-normal' : 'text-sm md:text-base text-slate-800 font-semibold'}`}>
                                      {subIsFlipped 
                                        ? activeSelectionDetails.subTopic.flashcards[subFCIndex]?.back 
                                        : activeSelectionDetails.subTopic.flashcards[subFCIndex]?.front
                                      }
                                    </h4>
                                  </div>
                                </div>

                                {/* Flashcard Navigation Controls */}
                                <div className="flex items-center justify-between gap-3 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSubFCIndex(prev => Math.max(0, prev - 1));
                                      setSubIsFlipped(false);
                                    }}
                                    disabled={subFCIndex === 0}
                                    className="px-3 py-1.5 bg-white border border-slate-250 text-slate-600 rounded-lg text-xs hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer font-semibold transition"
                                  >
                                    Previous
                                  </button>
                                  
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSubFC(subFCIndex)}
                                    className="p-1 px-2 hover:bg-rose-50 text-rose-500 hover:text-rose-600 rounded-md text-[11px] font-semibold transition cursor-pointer border border-transparent hover:border-rose-200"
                                  >
                                    Remove Card
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSubFCIndex(prev => Math.min((activeSelectionDetails.subTopic.flashcards?.length || 1) - 1, prev + 1));
                                      setSubIsFlipped(false);
                                    }}
                                    disabled={subFCIndex === activeSelectionDetails.subTopic.flashcards.length - 1}
                                    className="px-3 py-1.5 bg-white border border-slate-250 text-slate-600 rounded-lg text-xs hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer font-semibold transition"
                                  >
                                    Next
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Flashcard creators section */}
                            <div className="border-t border-slate-200/60 pt-4.5 mt-2">
                              {subFCAddMode === 'single' ? (
                                <form onSubmit={handleCreateSubFC} className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-[11px] uppercase tracking-wider font-extrabold text-slate-500">✍️ Add a Single Flashcard</h4>
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                    <div className="space-y-1">
                                      <label className="text-[10px] text-slate-400 font-semibold block">Front Face (Question/Term)</label>
                                      <input
                                        type="text"
                                        required
                                        placeholder="e.g. Price Earnings Ratio"
                                        value={newSubFCFront}
                                        onChange={(e) => setNewSubFCFront(e.target.value)}
                                        className="w-full bg-white px-3 py-1.5 border border-slate-205 rounded-lg focus:outline-none focus:border-indigo-500 text-xs text-slate-800"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[10px] text-slate-400 font-semibold block">Back Face (Answer/Explanation)</label>
                                      <input
                                        type="text"
                                        required
                                        placeholder="e.g. P/E is stock price divided by EPS..."
                                        value={newSubFCBack}
                                        onChange={(e) => setNewSubFCBack(e.target.value)}
                                        className="w-full bg-white px-3 py-1.5 border border-slate-205 rounded-lg focus:outline-none focus:border-indigo-500 text-xs text-slate-800"
                                      />
                                    </div>
                                  </div>
                                  <div className="flex justify-end pt-1">
                                    <button
                                      type="submit"
                                      className="px-4 py-1.5 bg-slate-900 hover:bg-indigo-600 hover:text-white text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                                    >
                                      Save Flashcard
                                    </button>
                                  </div>
                                </form>
                              ) : (
                                <form onSubmit={handleBulkSubFCImport} className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-[11px] uppercase tracking-wider font-extrabold text-slate-500">🚀 Smart Bulk Parser Importer</h4>
                                    <span className="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded font-semibold">Multiple formats supported</span>
                                  </div>

                                  <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3 text-indigo-950 leading-relaxed text-[11px] space-y-1">
                                    <p className="font-bold text-indigo-900">💡 Multi-Format Parser Instructions:</p>
                                    <p>Standard Q&A blocks or multiple choice quiz lists are accepted. Correct answer lines will automatically form the back of your card.</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2 text-[10px] font-mono text-indigo-900 bg-white/75 p-2 rounded border border-indigo-100/50">
                                      <div>
                                        <span className="font-bold underline">Format A (Q&A Blocks):</span>
                                        <br />Question: What is CAPM?
                                        <br />Answer: Capital Asset Pricing Model
                                      </div>
                                      <div>
                                        <span className="font-bold underline">Format B (Quiz List):</span>
                                        <br />Who developed Relativity theory?
                                        <br />- Isaac Newton
                                        <br />- Albert Einstein (Correct Answer)
                                      </div>
                                    </div>
                                  </div>

                                  <div className="space-y-1">
                                    <label className="text-[10px] text-slate-400 font-semibold block">Paste content below:</label>
                                    <textarea
                                      required
                                      rows={5}
                                      value={bulkSubFCText}
                                      onChange={(e) => setBulkSubFCText(e.target.value)}
                                      placeholder={`Question: Define asymptotic bounds\nAnswer: Limit of runtime scalability\n\nQuestion: Define CAPM\nAnswer: Capital Asset Pricing Model\n\n-- OR PASTE LECTURE MULTIPLE-CHOICE QUESTIONS directly --`}
                                      className="w-full bg-white px-3 py-2 border border-slate-205 rounded-lg focus:outline-none focus:border-indigo-500 text-xs font-mono text-slate-800"
                                    />
                                  </div>

                                  <div className="flex justify-end pt-1">
                                    <button
                                      type="submit"
                                      className="px-4 py-1.5 bg-indigo-650 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                                    >
                                      Smart Parse & Import
                                    </button>
                                  </div>
                                </form>
                              )}
                            </div>
                          </div>
                        )}

                        {/* C. Timed spaced-repetition selector manually configured */}
                        <section className="border-t border-slate-200 pt-6">
                          <div className="bg-slate-950 text-slate-100 p-5 rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-5 border border-slate-800 shadow-sm">
                            <div className="space-y-1 block shrink-0">
                              <h4 className="font-display font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
                                🧠 Automated Spaced Repetition Calibration
                              </h4>
                              <p className="text-xs text-slate-400 max-w-sm">
                                Rate confidence status: RED (2 days), YELLOW (5 days), GREEN (14 days). Confirmed rating appears on dashboard queue ONLY after saving.
                              </p>
                            </div>

                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 grow justify-end">
                              {/* Quick selection block */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <button
                                  onClick={() => setCalibratedConfidence('RED')}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                                    calibratedConfidence === 'RED'
                                      ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-400 font-extrabold'
                                      : 'bg-transparent text-rose-500 border-rose-950/40 hover:bg-rose-500/10'
                                  }`}
                                >
                                  🔴 Critical (2d)
                                </button>
                                <button
                                  onClick={() => setCalibratedConfidence('YELLOW')}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                                    calibratedConfidence === 'YELLOW'
                                      ? 'bg-amber-400 hover:bg-amber-500 text-slate-950 border-amber-300 font-extrabold'
                                      : 'bg-transparent text-amber-400 border-amber-950/40 hover:bg-amber-400/10'
                                  }`}
                                >
                                  🟡 Struggling (5d)
                                </button>
                                <button
                                  onClick={() => setCalibratedConfidence('GREEN')}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                                    calibratedConfidence === 'GREEN'
                                      ? 'bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-400 font-extrabold'
                                      : 'bg-transparent text-emerald-500 border-emerald-950/40 hover:bg-emerald-500/10'
                                  }`}
                                >
                                  🟢 Mastered (14d)
                                </button>
                              </div>

                              <div className="flex items-center gap-3">
                                <button
                                  onClick={handleSaveCalibration}
                                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-lg text-xs tracking-wide transition-all cursor-pointer shadow-sm shadow-amber-950/10"
                                >
                                  Save Rating
                                </button>

                                {/* Selected scheduler information */}
                                {activeSelectionDetails.subTopic.nextReviewDate ? (
                                  <p className="text-[10px] text-zinc-400 font-mono italic">
                                    Sync: Due {formatDateDDMMYYYY(activeSelectionDetails.subTopic.nextReviewDate)}
                                  </p>
                                ) : (
                                  <p className="text-[10px] text-zinc-500 font-mono italic">
                                    No intervals queued.
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </section>

                      </div>
                    )}

                  </div>
                )}


                {/* Scenario 3: Topic-Level Flashcard workspace */}
                {activeFlashcardTopicDetails && (
                  <div className="space-y-6">
                    
                    {/* Header bar */}
                    <div className="border-b border-slate-150 pb-4">
                      <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400">
                        <span>{activeCourse.code}</span>
                        <span>/</span>
                        <span>Week {activeFlashcardTopicDetails.weekNumber}</span>
                        <span>/</span>
                        <span className="text-amber-800 font-semibold font-mono">TOPIC FLASH_RECALL</span>
                      </div>
                      <h2 className="text-xl font-bold font-display text-slate-950 mt-0.5 tracking-tight">
                        "{activeFlashcardTopicDetails.topicTitle}" Recall Deck
                      </h2>
                      <p className="text-xs text-slate-400">Consolidated overarching review. Click cards to flip them vertically.</p>
                    </div>

                    {/* FLASHCARD INTERACTIVE SCENE */}
                    {(!activeFlashcardTopicDetails.masterFlashcards || activeFlashcardTopicDetails.masterFlashcards.length === 0) ? (
                      <div className="text-center py-10 px-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                        <p className="text-xs text-slate-400 italic">No study flashcards cataloged for this overarching topic yet.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        
                        {/* Genuine 3D Flip Card Widget */}
                        <div 
                          onClick={() => setIsFlipped(!isFlipped)}
                          className="w-full h-64 cursor-pointer perspective-1000 relative group"
                        >
                          <div className={`w-full h-full relative transition-all duration-500 transform-preserve-3d ${
                            isFlipped ? 'rotate-y-180' : ''
                          }`}>
                            
                            {/* FRONT FACE */}
                            <div className="absolute inset-0 w-full h-full backface-hidden rounded-2xl border border-slate-800 bg-slate-900 text-slate-50 p-6 flex flex-col justify-between shadow-md hover:shadow-lg transition-all">
                              <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
                                <span className="uppercase tracking-wider">RECALL PROMPT</span>
                                <span>CARD {flashcardIndex + 1} OF {activeFlashcardTopicDetails.masterFlashcards.length}</span>
                              </div>

                              <div className="text-center self-center py-4">
                                <h4 className="text-base md:text-lg font-display font-medium tracking-wide leading-relaxed">
                                  {activeFlashcardTopicDetails.masterFlashcards[flashcardIndex].front}
                                </h4>
                              </div>

                              <span className="text-[10px] text-center text-amber-400 animate-pulse font-mono tracking-wider">
                                [🔄 CLICK TO REVEAL ANSWER KEY]
                              </span>
                            </div>

                            {/* BACK FACE */}
                            <div className="absolute inset-0 w-full h-full backface-hidden rotate-y-180 rounded-2xl border border-indigo-900 bg-indigo-950 text-indigo-50 p-6 flex flex-col justify-between shadow-md hover:shadow-lg transition-all">
                              <div className="flex justify-between items-center text-[10px] font-mono text-amber-400">
                                <span className="uppercase tracking-wider">KEY DEFINITION ANSWER</span>
                                <span>CARD {flashcardIndex + 1} OF {activeFlashcardTopicDetails.masterFlashcards.length}</span>
                              </div>

                              <div className="text-center self-center py-4 px-2">
                                <p className="text-xs md:text-sm font-sans leading-relaxed text-indigo-100">
                                  {activeFlashcardTopicDetails.masterFlashcards[flashcardIndex].back}
                                </p>
                              </div>

                              <span className="text-[10px] text-center text-slate-400 font-mono">
                                [🔄 CLICK TO RETURN TO PROMPT]
                              </span>
                            </div>

                          </div>
                        </div>

                        {/* Slide controllers + delete option */}
                        <div className="flex items-center justify-between text-xs pt-1">
                          <button
                            onClick={() => handleDeleteFlashcard(activeFlashcardTopicDetails.id!, flashcardIndex)}
                            className="text-slate-400 hover:text-red-500 font-medium transition-colors cursor-pointer"
                          >
                            Remove This Card
                          </button>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={flashcardIndex === 0}
                              onClick={() => {
                                setIsFlipped(false);
                                setFlashcardIndex(prev => Math.max(0, prev - 1));
                              }}
                              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 disabled:opacity-40 rounded-lg font-semibold cursor-pointer select-none"
                            >
                              Prev
                            </button>
                            <span className="text-slate-500 font-semibold font-mono">{flashcardIndex + 1} / {activeFlashcardTopicDetails.masterFlashcards.length}</span>
                            <button
                              type="button"
                              disabled={flashcardIndex === activeFlashcardTopicDetails.masterFlashcards.length - 1}
                              onClick={() => {
                                setIsFlipped(false);
                                setFlashcardIndex(prev => Math.min(activeFlashcardTopicDetails.masterFlashcards!.length - 1, prev + 1));
                              }}
                              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 disabled:opacity-40 rounded-lg font-semibold cursor-pointer select-none"
                            >
                              Next
                            </button>
                          </div>
                        </div>

                      </div>
                    )}


                    {/* CREATE FLASHCARD BLOCK FOR THIS OVERARCHING TOPIC */}
                    <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl mt-5 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-3">
                        <h4 className="font-display font-bold text-xs uppercase text-slate-600 tracking-wider">🛠️ Add Custom Retention Flashcards</h4>
                        
                        {/* Selector Toggles */}
                        <div className="flex items-center gap-1 bg-slate-200/60 p-0.5 rounded-lg text-[10px] font-bold">
                          <button
                            type="button"
                            onClick={() => setFlashcardAddMode('single')}
                            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                              flashcardAddMode === 'single'
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'text-slate-500 hover:text-slate-805'
                            }`}
                          >
                            Single Card
                          </button>
                          <button
                            type="button"
                            onClick={() => setFlashcardAddMode('bulk')}
                            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                              flashcardAddMode === 'bulk'
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'text-slate-500 hover:text-slate-805'
                            }`}
                          >
                            🚀 Bulk Importer
                          </button>
                        </div>
                      </div>
                      
                      {flashcardAddMode === 'single' ? (
                        <div className="space-y-3.5 text-xs">
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-slate-400">Front (Recall Prompt / Question):</label>
                            <input 
                              type="text"
                              placeholder="e.g. Write out the formula for CAPM Cost of Equity"
                              value={newFCFront}
                              onChange={(e) => setNewFCFront(e.target.value)}
                              className="w-full bg-white p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-slate-400">Back (Answer Summary / Definition):</label>
                            <textarea 
                              rows={3}
                              placeholder="e.g. Re = Rf + Beta * (Rm - Rf) where Rf = risk free, Rm = expected market returns, Beta = equity risk ratio."
                              value={newFCBack}
                              onChange={(e) => setNewFCBack(e.target.value)}
                              className="w-full bg-white p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => handleCreateFlashcard(activeFlashcardTopicDetails.id!)}
                            className="px-4 py-2 bg-slate-900 hover:bg-amber-500 hover:text-slate-950 text-white rounded-lg transition-colors font-semibold cursor-pointer text-xs"
                          >
                            Archive Flashcard Node
                          </button>
                        </div>
                      ) : (
                        <form onSubmit={(e) => handleBulkFlashcardImport(e, activeFlashcardTopicDetails.id!)} className="space-y-3.5 text-xs">
                          <div className="bg-indigo-50 border border-indigo-150 rounded-xl p-3 text-indigo-950 leading-relaxed font-sans">
                            <span className="font-bold block text-indigo-900 mb-1">💡 NOTE TO SELF (Instructions):</span>
                            <p className="text-[11px] font-medium leading-normal">
                              Format each flashcard with a clear prefix labeling. Prefix the question with <strong className="text-zinc-900 font-mono select-all font-bold">"Question:"</strong> and the answer key with <strong className="text-zinc-900 font-mono select-all font-bold">"Answer:"</strong>. Separate different cards with a blank blank space.
                            </p>
                            <pre className="text-[9.5px] font-mono text-indigo-805 bg-white/70 p-2 rounded mt-2 border border-indigo-100 leading-tight">
{`Question: Define asymptotic bounds
Answer: It is the mathematical limit of runtime execution scalability.

Question: What is FIFO?
Answer: First-in, First-out processing queue strategy.`}
                            </pre>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-slate-500">Bulk Paste Input Area</label>
                            <textarea
                              required
                              rows={6}
                              value={bulkFlashcardText}
                              onChange={(e) => setBulkFlashcardText(e.target.value)}
                              placeholder="Paste bulk flashcards formatted with Question: and Answer: prefixes here..."
                              className="w-full bg-white font-mono text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                            />
                          </div>

                          <button
                            type="submit"
                            className="px-5 py-2.5 bg-indigo-650 hover:bg-indigo-700 text-white rounded-lg transition-all font-bold cursor-pointer text-xs shadow-xs"
                          >
                            ⚡ Parse & Bulk Import Cards
                          </button>
                        </form>
                      )}
                    </div>

                  </div>
                )}

              </section>

            </div>

          </div>
        )}

      </main>

      {/* 3. SETTINGS & SIMULATOR CALIBRATION MODAL */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-slate-950/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in duration-150">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-1.5 text-slate-900 font-display">
                <Sliders className="h-5 w-5 text-amber-500" />
                <h4 className="font-bold text-base">StudyMaster Calibration Panel</h4>
              </div>
              <button 
                onClick={() => setShowSettingsModal(false)}
                className="text-slate-400 hover:text-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              
              {/* User Persona */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 block">STUDENT PROFILE NAME</label>
                <input 
                  type="text"
                  value={customUserName}
                  onChange={(e) => setCustomUserName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-sm focus:outline-none focus:border-amber-500 font-sans"
                />
              </div>

              {/* Semester start settings */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 block">SEMESTER START DATE (WEEK 1)</label>
                <input 
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-sm focus:outline-none focus:border-amber-500 font-mono"
                />
                <p className="text-[10px] text-slate-400">Weekly progress coordinates dynamically shifting between Week 1 and 13 based on this start date.</p>
              </div>

              {/* Simulated clock settings */}
              <div className="space-y-1 border-t border-slate-100 pt-4">
                <label className="text-[11px] font-bold text-slate-500 block flex items-center gap-1">
                  TEMPORAL SIMULATOR DATE <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1 rounded uppercase font-mono font-black">TEST_ENVIRONMENT</span>
                </label>
                <input 
                  type="date"
                  value={simDate}
                  onChange={(e) => setSimDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-sm focus:outline-none focus:border-amber-500 font-mono"
                />
                <p className="text-[10px] text-slate-400 leading-snug">
                  Shift dates arbitrarily to test deadline changes (<em className="text-rose-500">Critical &lt; 24h</em> turns Red and pulses) or verify how spaced repetition scheduled reviews pop up due in real time!
                </p>
              </div>

              {/* Data Portability */}
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <label className="text-[11px] font-bold text-slate-500 block uppercase tracking-wider">
                  💾 Local Data Portability
                </label>
                <p className="text-[10px] text-slate-400 leading-snug">
                  Save a physical backup file on your machine. Restore it anytime to recover your courses, custom study notes, flashcards, and completed quizzes if your browser cache is cleared.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleExportData}
                    className="flex items-center justify-center gap-1.5 p-2 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold rounded-lg transition-all text-[11px] cursor-pointer shadow-sm"
                  >
                    <Download className="h-3.5 w-3.5 text-amber-500" />
                    <span>Export Backup</span>
                  </button>
                  <label className="flex items-center justify-center gap-1.5 p-2 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold rounded-lg transition-all text-[11px] cursor-pointer shadow-sm relative">
                    <Upload className="h-3.5 w-3.5 text-amber-500" />
                    <span>Import Backup</span>
                    <input 
                      type="file" 
                      accept=".json" 
                      onChange={handleImportData} 
                      className="hidden" 
                    />
                  </label>
                </div>
              </div>

              {/* Reset to empty slate */}
              <div className="space-y-2 border-t border-slate-150 pt-4">
                <label className="text-[11px] font-bold text-rose-550 block flex items-center gap-1.5 uppercase">
                  <span>⚠️</span> Danger Zone: Blank Slate
                </label>
                <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
                  Prune all built-in Finance & CS demo data to clear your slate. This database-erases all placeholder courses, notes, flashcards, quizzes, and tasks so you can input your own personal curriculum!
                </p>
                <button
                  type="button"
                  onClick={handleClearAllData}
                  className="w-full flex items-center justify-center gap-1.5 p-2 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 hover:text-rose-950 font-bold rounded-lg transition-all text-[11px] cursor-pointer shadow-sm"
                >
                  Clear All Data & Start Blank
                </button>
              </div>

            </div>

            <div className="flex justify-end gap-2 text-xs pt-2">
              <button 
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={handleSaveSettings}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold cursor-pointer"
              >
                Apply Parameters
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 4. MODAL TO ADD SUBTOPIC */}
      {showAddSubTopicModal && (
        <div className="fixed inset-0 bg-slate-950/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="font-bold text-slate-900 font-display flex items-center gap-1">
                <Plus className="h-5 w-5 text-amber-500" /> Create Custom Sub-Topic
              </h4>
              <button 
                onClick={() => setShowAddSubTopicModal(false)}
                className="text-slate-400 hover:text-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 block">SUB-TOPIC MODULE TITLE</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. Free Cash Flows to Firm (FCFF)"
                  value={newSubTopicTitle}
                  onChange={(e) => setNewSubTopicTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-sm focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 block">MAPPED ACADEMIC WEEK</label>
                <select 
                  value={newSubTopicWeek}
                  onChange={(e) => setNewSubTopicWeek(parseInt(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-sm focus:outline-none"
                >
                  {Array.from({ length: 13 }, (_, i) => i + 1).map((weekNum) => (
                    <option key={weekNum} value={weekNum}>Week {weekNum}</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">This binds the new study sheet onto the selected collapsible block in your course sidebar.</p>
              </div>

            </div>

            <div className="flex justify-end gap-2 text-xs pt-2">
              <button 
                type="button"
                onClick={() => setShowAddSubTopicModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={handleCreateSubTopic}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold cursor-pointer"
              >
                Create Node
              </button>
            </div>

          </div>
        </div>
      )}

      {/* FOOTER BAR */}
      <footer className="bg-slate-900 text-slate-500 py-6 px-4 border-t border-slate-800 text-center text-xs space-y-1 shrink-0 mt-8">
        <p className="font-mono text-[10px] text-slate-400">
          STUDY_MASTER LOCAL V2.0 • BUILT WITH DEEP RECALL SYSTEMS • PERSISTENT BROWSER INDEXEDDB STORAGE
        </p>
        <p className="text-slate-500">
          State variables and syllabus trees save instantly onto Dexie records. Clean sandbox execution ensures absolute client privacy.
        </p>
      </footer>

    </div>
  );
}
