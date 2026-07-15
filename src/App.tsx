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
  Upload,
  GripVertical
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

function getLocalTodayDateString() {
  const localDate = new Date();
  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, '0');
  const day = String(localDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
  const [newDeadlineDate, setNewDeadlineDate] = useState(getLocalTodayDateString());
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
  const [simDate, setSimDate] = useState(getLocalTodayDateString()); // default system simulated date
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
  const [newQuizOption5, setNewQuizOption5] = useState<string>('');
  const [newQuizOptionCount, setNewQuizOptionCount] = useState<number>(4);
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
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editingCourseName, setEditingCourseName] = useState<string>('');
  const [editingCourseCode, setEditingCourseCode] = useState<string>('');
  const [editingCourseColor, setEditingCourseColor] = useState<string>('');
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

  // Drag and drop state for subtopics reordering
  const [draggedSubTopicIndex, setDraggedSubTopicIndex] = useState<number | null>(null);
  const [draggedFromTopicId, setDraggedFromTopicId] = useState<number | null>(null);

  const handleSubTopicDragStart = (e: React.DragEvent, topicId: number, index: number) => {
    setDraggedSubTopicIndex(index);
    setDraggedFromTopicId(topicId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleSubTopicDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
  };

  const handleSubTopicDrop = async (e: React.DragEvent, topicId: number, targetIndex: number) => {
    e.preventDefault();
    if (draggedSubTopicIndex === null || draggedFromTopicId !== topicId) return;
    if (draggedSubTopicIndex === targetIndex) return;

    // Find the topic record
    const topicRec = topics?.find(t => t.id === topicId);
    if (!topicRec || !topicRec.subTopics) return;

    // Reorder the subTopics array
    const updatedSubTopics = [...topicRec.subTopics];
    const [draggedItem] = updatedSubTopics.splice(draggedSubTopicIndex, 1);
    updatedSubTopics.splice(targetIndex, 0, draggedItem);

    // Update orderIndex values to maintain sequence
    const finalSubTopics = updatedSubTopics.map((sub, idx) => ({
      ...sub,
      orderIndex: idx
    }));

    try {
      await db.topics.update(topicId, { subTopics: finalSubTopics });
    } catch (err) {
      console.error("Failed to reorder subtopics:", err);
    }

    setDraggedSubTopicIndex(null);
    setDraggedFromTopicId(null);
  };

  const handleSubTopicDragEnd = () => {
    setDraggedSubTopicIndex(null);
    setDraggedFromTopicId(null);
  };

  // Keyboard shortcut handler for notes editor textarea (Cmd/Ctrl + B/I/U and Tab)
  const handleNotesKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

    if (isCmdOrCtrl && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const selected = text.substring(start, end);
      const before = text.substring(0, start);
      const after = text.substring(end, text.length);

      const isWrapped = selected.startsWith('**') && selected.endsWith('**');
      const replacement = isWrapped 
        ? selected.substring(2, selected.length - 2)
        : `**${selected}**`;

      textarea.value = before + replacement + after;
      textarea.selectionStart = start;
      textarea.selectionEnd = start + replacement.length;
      textarea.focus();

      const event = new Event('input', { bubbles: true });
      textarea.dispatchEvent(event);

    } else if (isCmdOrCtrl && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const selected = text.substring(start, end);
      const before = text.substring(0, start);
      const after = text.substring(end, text.length);

      const isWrapped = selected.startsWith('*') && selected.endsWith('*');
      const replacement = isWrapped 
        ? selected.substring(1, selected.length - 1)
        : `*${selected}*`;

      textarea.value = before + replacement + after;
      textarea.selectionStart = start;
      textarea.selectionEnd = start + replacement.length;
      textarea.focus();

      const event = new Event('input', { bubbles: true });
      textarea.dispatchEvent(event);

    } else if (isCmdOrCtrl && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const selected = text.substring(start, end);
      const before = text.substring(0, start);
      const after = text.substring(end, text.length);

      const isWrapped = selected.startsWith('<u>') && selected.endsWith('</u>');
      const replacement = isWrapped 
        ? selected.substring(3, selected.length - 4)
        : `<u>${selected}</u>`;

      textarea.value = before + replacement + after;
      textarea.selectionStart = start;
      textarea.selectionEnd = start + replacement.length;
      textarea.focus();

      const event = new Event('input', { bubbles: true });
      textarea.dispatchEvent(event);

    } else if (e.key === 'Tab') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;

      if (e.shiftKey) {
        const before = text.substring(0, start);
        const lineStartPos = before.lastIndexOf('\n') + 1;
        const after = text.substring(end);
        const middle = text.substring(lineStartPos, end);
        
        const lines = middle.split('\n');
        const modifiedLines = lines.map(line => {
          if (line.startsWith('  ')) return line.substring(2);
          if (line.startsWith(' ')) return line.substring(1);
          return line;
        });
        
        const replacement = modifiedLines.join('\n');
        textarea.value = text.substring(0, lineStartPos) + replacement + after;
        textarea.selectionStart = Math.max(lineStartPos, start - (middle.length - replacement.length));
        textarea.selectionEnd = lineStartPos + replacement.length;
      } else {
        const before = text.substring(0, start);
        const lineStartPos = before.lastIndexOf('\n') + 1;
        const after = text.substring(end);
        const middle = text.substring(lineStartPos, end);
        
        const lines = middle.split('\n');
        const modifiedLines = lines.map(line => '  ' + line);
        
        const replacement = modifiedLines.join('\n');
        textarea.value = text.substring(0, lineStartPos) + replacement + after;
        textarea.selectionStart = start + 2;
        textarea.selectionEnd = lineStartPos + replacement.length;
      }
      textarea.focus();
      const event = new Event('input', { bubbles: true });
      textarea.dispatchEvent(event);
    }
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

  const handleStartRenameCourse = (course: Course) => {
    setEditingCourseId(course.id);
    setEditingCourseName(course.name);
    setEditingCourseCode(course.code);
    setEditingCourseColor(course.color);
  };

  const handleSaveRenameCourse = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingCourseId) return;

    const trimmedName = editingCourseName.trim();
    const trimmedCode = editingCourseCode.trim();

    if (!trimmedName || !trimmedCode) {
      alert("Course name and shorthand code cannot be empty!");
      return;
    }

    try {
      await db.courses.update(editingCourseId, {
        name: trimmedName,
        code: trimmedCode,
        color: editingCourseColor
      });
      showToast("Course details updated successfully!");
    } catch (err) {
      console.error("Failed to update course:", err);
      alert("Error saving course edits.");
    }

    setEditingCourseId(null);
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

    const optionsList: string[] = [];
    if (newQuizOptionCount >= 1) optionsList.push(newQuizOption1.trim());
    if (newQuizOptionCount >= 2) optionsList.push(newQuizOption2.trim());
    if (newQuizOptionCount >= 3) optionsList.push(newQuizOption3.trim());
    if (newQuizOptionCount >= 4) optionsList.push(newQuizOption4.trim());
    if (newQuizOptionCount >= 5) optionsList.push(newQuizOption5.trim());

    if (optionsList.some(opt => !opt)) {
      alert("Please fill in all of your visible option fields!");
      return;
    }

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
    setNewQuizOption5('');
    setNewQuizOptionCount(4);
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
          bg: 'bg-[#EAF8FC]',
          border: 'border-[#B6E5F0] text-[#136A7E]',
          hover: 'hover:bg-[#D5F0F7]',
          accent: 'bg-[#1EA5C4]',
          text: 'text-[#136A7E]',
          gradient: 'from-[#1EA5C4] to-[#17829B]'
        };
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#1C1A17] font-retro text-lg flex flex-col selection:bg-[#4C5E24]/10 pb-20 relative overflow-x-hidden">

      {/* Custom float toast message */}
      {toastMessage && (
        <div className="fixed bottom-16 right-6 z-50 bg-[#FAF8F4] border border-neutral-200 text-[#1C1A17] px-5 py-3 rounded-xl shadow-md flex items-center gap-2.5 animate-bounce-short max-w-sm">
          <div className="h-2.5 w-2.5 bg-[#4C5E24] rounded-full shrink-0" />
          <p className="text-xs font-semibold leading-relaxed font-mono">{toastMessage}</p>
        </div>
      )}
      
      {/* 1. TOP GLOBAL NAVIGATION / ELEGANT HEADER BAR */}
      <header className="bg-white/85 backdrop-blur-md border border-[#E8E3D7] text-[#1C1A17] shrink-0 sticky top-4 mx-4 md:mx-auto my-4 z-40 px-6 py-4 rounded-2xl shadow-sm max-w-7xl w-[calc(100%-2rem)] flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#4C5E24]/10 text-[#4C5E24] rounded-xl flex items-center justify-center">
            <span className="text-2xl">🎓</span>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-pixel text-[11px] tracking-tight text-[#1C1A17] uppercase">🎮 STUDYMASTER OS</span>
              <span className="text-[7px] font-pixel tracking-wider bg-[#55a846] text-white border-2 border-[#1C1A17] px-2 py-0.5 rounded shadow-[1px_1px_0px_0px_#1C1A17]">CART_OK</span>
            </div>
            <p className="text-xs text-[#7C7468] font-bold uppercase tracking-wider">13-Week Retro Academic RPG Engine</p>
          </div>
        </div>

        {/* Dynamic Week Tracker Widget */}
        <div className="flex items-center gap-4 bg-white border-2 border-[#1C1A17] px-4 py-2 rounded-xl shadow-[2px_2px_0px_0px_#1C1A17] text-xs min-w-[280px] md:min-w-0">
          <div className="grow">
            <div className="flex items-center justify-between text-[11px] font-medium text-[#7C7468] mb-1">
              <span className="flex items-center gap-1 font-pixel text-[8px] text-[#FF8C32]">
                🏆 WEEK {activeWeek} / 13
              </span>
              <span className="text-[#55a846] font-pixel text-[8px] font-bold">{progressPercent}% SYNCED</span>
            </div>
            <div className="w-40 h-3.5 bg-[#FAF7F2] border-2 border-[#1C1A17] rounded-none overflow-hidden relative">
              <div 
                className="h-full bg-[#FF8C32] border-r-2 border-[#1C1A17] transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>
          
          {/* Quick Export/Import Data icons or settings button */}
          <button 
            onClick={handleExportData}
            title="Export database backup (JSON)"
            className="retro-btn-press p-2 bg-[#FAF6EE] text-[#1C1A17] border-2 border-[#1C1A17] rounded-lg shadow-[2px_2px_0px_0px_#1C1A17] cursor-pointer flex items-center gap-1.5 text-[8px] font-pixel"
          >
            <span>💾</span>
            <span className="hidden sm:inline">SAVE</span>
          </button>

          {/* Action Cog to edit active simulation dates and name */}
          <button 
            onClick={() => setShowSettingsModal(true)} 
            title="Calibrate study parameters"
            className="retro-btn-press bg-[#FAF6EE] text-[#1C1A17] border-2 border-[#1C1A17] p-2 rounded-lg shadow-[2px_2px_0px_0px_#1C1A17] cursor-pointer hover:bg-[#FAF7F2]"
          >
            <span>⚙️</span>
          </button>
        </div>

      </header>

      {/* 2. MAIN LAYOUT STAGE */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col gap-6">
        
        {/* VIEW A: MASTER DASHBOARD HOMEPAGE */}
        {currentView === 'dashboard' && (
          <div className="space-y-6">
            
            {/* Elegant Navy/Slate Welcome Banner */}
            <div className="bg-[#121829] border border-slate-800/80 rounded-3xl p-6 md:p-8 text-white flex flex-col md:flex-row md:items-center md:justify-between gap-6 relative overflow-hidden shadow-md">
              <div className="space-y-2 md:space-y-3 z-10">
                <h2 className="text-2xl md:text-3xl font-black tracking-tight leading-none flex items-center gap-2">
                  <span className="text-amber-400">✨</span> Welcome back, {customUserName}!
                </h2>
                <p className="text-sm md:text-base text-slate-300 font-medium leading-relaxed max-w-2xl">
                  Your courses are fully mapped onto IndexedDB. Current academic workspace context running simulated date <strong className="text-[#FF8C32] font-mono font-bold bg-[#FF8C32]/10 px-2 py-0.5 rounded border border-[#FF8C32]/25">{formatDateDDMMYYYY(simulatedTodayString)}</strong>.
                </p>
              </div>

              <div className="flex gap-3 items-center shrink-0 z-10 flex-wrap">
                <button 
                  onClick={() => {
                    const todayStr = new Date().toISOString().split('T')[0];
                    setSimDate(todayStr);
                    alert("Simulated date synchronized to modern device clock!");
                  }}
                  className="px-4 py-2.5 bg-slate-800/40 hover:bg-slate-800/80 border border-slate-700/50 rounded-xl text-xs font-semibold text-slate-200 transition-all cursor-pointer flex items-center gap-2"
                >
                  <span className="text-sm">🔄</span> Synchronize Real Clock
                </button>
                <button 
                  onClick={() => setShowSettingsModal(true)}
                  className="px-4 py-2.5 bg-[#FF8C32] hover:bg-[#E06E1A] text-slate-950 font-bold rounded-xl text-xs transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
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
                <section className="bg-[#FAF6EE] border-4 border-[#1C1A17] rounded-3xl shadow-[6px_6px_0px_0px_#1C1A17] overflow-hidden animate-fade-in text-[#1C1A17]">
                  {(() => {
                    const dueItems = spacedRepetitionQueue.filter(item => item.status === 'DUE');
                    const upcomingItems = spacedRepetitionQueue.filter(item => item.status === 'UPCOMING');

                    return (
                      <>
                        <div className="bg-[#FFF4E5] px-6 py-4.5 border-b-4 border-[#1C1A17] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">⏳</span>
                            <div>
                              <h3 className="font-pixel text-[11px] text-[#1C1A17] uppercase tracking-tight">Active Spaced-Repetition Quests</h3>
                              <p className="text-xs text-[#7C7468] font-bold">Automated review intervals based on confidence status</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {dueItems.length > 0 && (
                              <span className="text-[7px] font-pixel bg-[#FFF0EF] border-2 border-[#1C1A17] text-[#9E2A2B] px-3 py-1 rounded shadow-[2px_2px_0px_0px_#1C1A17] animate-pulse">
                                {dueItems.length} DUE NOW!
                              </span>
                            )}
                            {upcomingItems.length > 0 && (
                              <span className="text-[7px] font-pixel bg-[#EAF5FC] border-2 border-[#1C1A17] text-[#1E6B9D] px-3 py-1 rounded shadow-[2px_2px_0px_0px_#1C1A17]">
                                {upcomingItems.length} PREPPED
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="p-5 md:p-6 bg-[#FAF6EE]">
                          {spacedRepetitionQueue.length === 0 ? (
                            <div className="text-center py-10 px-4 bg-white rounded-2xl border-4 border-[#1C1A17] shadow-[4px_4px_0px_0px_#1C1A17]">
                              <span className="text-4xl block mb-2.5">🏆</span>
                              <h4 className="font-pixel text-[10px] text-[#1C1A17] uppercase">All Quests Completed!</h4>
                              <p className="text-xs text-[#7C7468] mt-1.5 max-w-sm mx-auto font-bold">
                                You are in perfect spaced standing. Configure confidence levels of subtopics inside your workspace map to generate custom automatic review schedules!
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-5 max-h-[380px] overflow-y-auto pr-1">
                              
                              {/* DUE NOW ROUNDS */}
                              {dueItems.length > 0 && (
                                <div className="space-y-3">
                                  <h4 className="text-xs font-pixel text-[#9E2A2B] flex items-center gap-1.5 uppercase">
                                    🚨 OVERDUE REVIEWS ({dueItems.length})
                                  </h4>
                                  <div className="space-y-3">
                                    {dueItems.map((item, qidx) => {
                                      const clrSet = getCourseColors(item.color);
                                      return (
                                        <div 
                                          key={`due-${qidx}`} 
                                          className="group flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-[#FFF5F4] hover:bg-[#FFEBEA] text-[#1C1A17] rounded-2xl border-4 border-[#1C1A17] shadow-[3px_3px_0px_0px_#1C1A17] transition-all"
                                        >
                                          <div className="flex items-start gap-3.5 grow min-w-0">
                                            <input
                                              type="checkbox"
                                              checked={!!item.subTopic.completed}
                                              onChange={(e) => handleToggleSubTopicComplete(item.topicRecord, item.subIdx, e.target.checked)}
                                              className="mt-1 h-5 w-5 rounded border-2 border-[#1C1A17] text-[#9E2A2B] focus:ring-0 cursor-pointer accent-[#9E2A2B] shrink-0"
                                              title="Mark task as completed"
                                            />
                                            <div className="space-y-1.5 grow min-w-0">
                                              <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-[7px] font-pixel bg-white text-[#1C1A17] border-2 border-[#1C1A17] px-2 py-0.5 rounded shadow-[1px_1px_0px_0px_#1C1A17]">
                                                  {item.courseCode}
                                                </span>
                                                <span className="text-xs font-bold text-[#7C7468]">Week {item.topicRecord.weekNumber}</span>
                                                <span className="h-2.5 w-2.5 rounded bg-red-500 border border-[#1C1A17] animate-ping shrink-0" />
                                                <span className="text-[7px] font-pixel text-red-600 bg-white border-2 border-[#1C1A17] px-1.5 py-0.5 rounded">{item.subTopic.confidenceStatus} CALIBRATION</span>
                                              </div>
                                              <h4 className="text-sm font-bold text-[#1C1A17] leading-tight font-sans">{item.subTopic.title}</h4>
                                              <p className="text-xs text-[#7C7468] font-bold">Concept Module: {item.topicRecord.topicTitle}</p>
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-2.5 self-end md:self-auto shrink-0 pl-8 md:pl-0">
                                            <span className="text-[8px] font-pixel text-[#9E2A2B] bg-white px-2 py-1 rounded border-2 border-[#1C1A17] shadow-[1px_1px_0px_0px_#1C1A17]">
                                              {item.daysOverdue >= 1 ? `${item.daysOverdue}d ago` : 'today'}
                                            </span>
                                            <button
                                              onClick={() => handleLaunchSubTopic(item.topicRecord.courseId, item.topicRecord.weekNumber, item.subTopic.subTopicId)}
                                              className="retro-btn-press px-4 py-2 bg-[#9E2A2B] text-white border-2 border-[#1C1A17] rounded-lg text-xs font-pixel font-bold cursor-pointer flex items-center gap-1 shadow-[2px_2px_0px_0px_#1C1A17]"
                                            >
                                              START ⚔️
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
                                <div className="space-y-3 pt-2">
                                  <h4 className="text-xs font-pixel text-[#1E6B9D] flex items-center gap-1.5 uppercase">
                                    ⏳ FUTURE ADVENTURES ({upcomingItems.length})
                                  </h4>
                                  <div className="space-y-2.5">
                                    {upcomingItems.map((item, qidx) => {
                                      const clrSet = getCourseColors(item.color);
                                      const daysLeft = Math.abs(item.daysOverdue);
                                      return (
                                        <div 
                                          key={`upcoming-${qidx}`} 
                                          className="group flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 bg-white hover:bg-[#FAF7F2] rounded-2xl border-4 border-[#1C1A17] shadow-[3px_3px_0px_0px_#1C1A17] transition-all"
                                        >
                                          <div className="flex items-start gap-3 grow min-w-0">
                                            <input
                                              type="checkbox"
                                              checked={!!item.subTopic.completed}
                                              onChange={(e) => handleToggleSubTopicComplete(item.topicRecord, item.subIdx, e.target.checked)}
                                              className="mt-0.5 h-4.5 w-4.5 rounded border-2 border-[#1C1A17] text-[#1E6B9D] focus:ring-0 cursor-pointer accent-[#1E6B9D] shrink-0"
                                              title="Mark task as completed"
                                            />
                                            <div className="space-y-1.5 grow min-w-0">
                                              <div className="flex items-center gap-2 flex-wrap">
                                                <span className={`text-[7px] font-pixel bg-white border-2 border-[#1C1A17] px-2 py-0.5 rounded shadow-[1px_1px_0px_0px_#1C1A17] text-[#1C1A17]`}>
                                                  {item.courseCode}
                                                </span>
                                                <span className="text-xs font-bold text-[#7C7468]">Week {item.topicRecord.weekNumber}</span>
                                                <span className={`h-2.5 w-2.5 rounded-full border border-[#1C1A17] ${item.subTopic.confidenceStatus === 'RED' ? 'bg-red-500' : item.subTopic.confidenceStatus === 'YELLOW' ? 'bg-amber-400' : 'bg-emerald-500'}`} />
                                                <span className="text-[7px] font-pixel text-[#7C7468] uppercase bg-[#FAF6EE] px-1.5 py-0.5 rounded border border-[#EAE3D5]">{item.subTopic.confidenceStatus} CALIBRATED</span>
                                              </div>
                                              <h4 className="text-sm font-bold text-[#1C1A17] leading-tight font-sans">{item.subTopic.title}</h4>
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-2.5 self-end md:self-auto shrink-0 pl-7 md:pl-0">
                                            <span className="text-xs text-[#7C7468] font-bold italic">
                                              In {daysLeft} {daysLeft === 1 ? 'day' : 'days'} ({formatDateDDMMYYYY(item.subTopic.nextReviewDate)})
                                            </span>
                                            <button
                                              onClick={() => handleLaunchSubTopic(item.topicRecord.courseId, item.topicRecord.weekNumber, item.subTopic.subTopicId)}
                                              className="retro-btn-press px-3.5 py-1.5 bg-white text-[#1C1A17] border-2 border-[#1C1A17] rounded-lg text-[10px] font-bold cursor-pointer flex items-center gap-1 shadow-[2px_2px_0px_0px_#1C1A17]"
                                            >
                                              {daysLeft <= 0 ? "PRACTICE NOW 🛡️" : "PRE-PRACTICE Early"}
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
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-pixel text-[11px] text-[#1C1A17] uppercase tracking-tight">🎒 Academic Course Map</h3>
                    <button 
                      type="button"
                      onClick={() => setCourseEditorActive(!courseEditorActive)}
                      className={`px-4.5 py-2.5 text-[9px] font-pixel rounded-xl border-4 border-[#1C1A17] transition-all cursor-pointer flex items-center gap-1.5 shadow-[2px_2px_0px_0px_#1C1A17] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_0px_#1C1A17] active:translate-y-[2px] active:shadow-none ${
                        courseEditorActive 
                          ? 'bg-[#1C1A17] text-white border-[#1C1A17]' 
                          : 'bg-[#FAF6EE] text-[#1C1A17] hover:bg-[#FAF7F2]'
                      }`}
                    >
                      🛠️ EDITOR {courseEditorActive ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  {courseEditorActive && (
                    <form onSubmit={handleCreateCourse} className="bg-[#FAF6EE] border-4 border-[#1C1A17] rounded-3xl p-6 space-y-4 text-xs animate-fadeIn shadow-[4px_4px_0px_0px_#1C1A17]">
                      <div className="flex items-center justify-between border-b-2 border-[#1C1A17] pb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">➕</span>
                          <span className="font-pixel text-[10px] text-[#1C1A17] uppercase">BOOTSTRAP CUSTOM ADVENTURE</span>
                        </div>
                        <span className="text-[7px] font-pixel bg-[#E8F6F0] text-[#1E5D44] border-2 border-[#1C1A17] px-2.5 py-1 rounded shadow-[1px_1px_0px_0px_#1C1A17]">13-WEEK AUTO SETUP</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <label className="text-[#1C1A17] font-bold block uppercase text-[10px]">Unique ID (e.g. CS101)</label>
                          <input 
                            type="text" 
                            required 
                            placeholder="e.g. CS303, MATH101"
                            value={customCourseId}
                            onChange={(e) => setCustomCourseId(e.target.value)}
                            className="bg-white border-2 border-[#1C1A17] px-3.5 py-2 rounded-xl w-full font-mono text-[#1C1A17] focus:outline-none focus:ring-0 transition-all"
                          />
                        </div>
                        
                        <div className="space-y-1">
                          <label className="text-[#1C1A17] font-bold block uppercase text-[10px]">Shorthand Display</label>
                          <input 
                            type="text" 
                            required 
                            placeholder="e.g. CS 303, MATH 101"
                            value={customCourseCode}
                            onChange={(e) => setCustomCourseCode(e.target.value)}
                            className="bg-white border-2 border-[#1C1A17] px-3.5 py-2 rounded-xl w-full font-mono text-[#1C1A17] focus:outline-none focus:ring-0 transition-all"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[#1C1A17] font-bold block uppercase text-[10px]">Course Title Name</label>
                          <input 
                            type="text" 
                            required 
                            placeholder="e.g. Theory of Computation"
                            value={customCourseName}
                            onChange={(e) => setCustomCourseName(e.target.value)}
                            className="bg-white border-2 border-[#1C1A17] px-3.5 py-2 rounded-xl w-full text-[#1C1A17] focus:outline-none focus:ring-0 transition-all"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[#1C1A17] font-bold block uppercase text-[10px]">Cartridge Color</label>
                          <select 
                            value={customCourseColor}
                            onChange={(e) => setCustomCourseColor(e.target.value)}
                            className="bg-white border-2 border-[#1C1A17] px-3.5 py-2 rounded-xl w-full text-[#1C1A17] font-bold cursor-pointer focus:outline-none focus:ring-0 transition-all"
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
                          className="retro-btn-press px-4 py-2 bg-white text-[#1C1A17] border-2 border-[#1C1A17] rounded-lg font-bold cursor-pointer shadow-[2px_2px_0px_0px_#1C1A17]"
                        >
                          CANCEL
                        </button>
                        <button 
                          type="submit" 
                          className="retro-btn-press px-4 py-2 bg-[#FF8C32] text-white border-2 border-[#1C1A17] rounded-lg font-pixel text-[8px] cursor-pointer shadow-[2px_2px_0px_0px_#1C1A17]"
                        >
                          ⚔️ BOOTSTRAP ADVENTURE
                        </button>
                      </div>
                    </form>
                  )}

                  {courses.length === 0 ? (
                    <div className="bg-[#FAF6EE] border-4 border-[#1C1A17] rounded-3xl p-8 py-10 text-center space-y-3.5 shadow-[6px_6px_0px_0px_#1C1A17]">
                      <span className="text-4xl block">📦</span>
                      <div className="space-y-1">
                        <h4 className="font-pixel text-[10px] text-[#1C1A17] uppercase">No Syllabus Cartridges Loaded</h4>
                        <p className="text-[#7C7468] text-xs max-w-sm mx-auto leading-relaxed font-bold">
                          Ready to sync? Toggle <strong>Editor Mode</strong> above to add custom course categories and auto-generate structured 13-week milestones!
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCourseEditorActive(true)}
                        className="retro-btn-press px-4 py-2 bg-[#1C1A17] text-white border-2 border-[#1C1A17] rounded-lg text-xs font-bold cursor-pointer shadow-[2px_2px_0px_0px_#1C1A17]"
                      >
                        CREATE FIRST CART 🎮
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {courses.map((course) => {
                        const stats = getCourseProgress(course.id);
                        const cls = getCourseColors(course.color);
                        
                        if (editingCourseId === course.id) {
                          return (
                            <form 
                              key={course.id}
                              onSubmit={handleSaveRenameCourse}
                              onClick={(e) => e.stopPropagation()}
                              className="bg-white border-4 border-[#FF8C32] rounded-3xl p-5.5 flex flex-col justify-between h-52 relative animate-fadeIn shadow-[4px_4px_0px_0px_#1C1A17]"
                            >
                              <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[9px] font-pixel text-[#7C7468] block uppercase">Code</label>
                                    <input 
                                      type="text"
                                      required
                                      value={editingCourseCode}
                                      onChange={(e) => setEditingCourseCode(e.target.value)}
                                      className="bg-white border-2 border-[#1C1A17] px-3 py-1.5 rounded-xl text-xs w-full font-mono text-[#1C1A17] focus:outline-none"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[9px] font-pixel text-[#7C7468] block uppercase">Theme</label>
                                    <select 
                                      value={editingCourseColor}
                                      onChange={(e) => setEditingCourseColor(e.target.value)}
                                      className="bg-white border-2 border-[#1C1A17] px-2 py-1.5 rounded-xl text-xs w-full text-[#1C1A17] cursor-pointer focus:outline-none font-bold"
                                    >
                                      <option value="amber">Amber</option>
                                      <option value="rose">Rose</option>
                                      <option value="indigo">Indigo</option>
                                      <option value="violet">Violet</option>
                                      <option value="emerald">Emerald</option>
                                      <option value="teal">Teal</option>
                                      <option value="orange">Orange</option>
                                      <option value="sky">Sky</option>
                                    </select>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[9px] font-pixel text-[#7C7468] block uppercase">Title</label>
                                  <input 
                                    type="text"
                                    required
                                    value={editingCourseName}
                                    onChange={(e) => setEditingCourseName(e.target.value)}
                                    className="bg-white border-2 border-[#1C1A17] px-3 py-1.5 rounded-xl text-xs w-full text-[#1C1A17] focus:outline-none"
                                  />
                                </div>
                              </div>

                              <div className="flex justify-end gap-2 pt-1">
                                <button 
                                  type="button"
                                  onClick={() => setEditingCourseId(null)}
                                  className="retro-btn-press px-3 py-1.5 bg-white text-[#1C1A17] border-2 border-[#1C1A17] rounded-lg font-bold text-xs cursor-pointer shadow-[2px_2px_0px_0px_#1C1A17]"
                                >
                                  CANCEL
                                </button>
                                <button 
                                  type="submit"
                                  className="retro-btn-press px-4 py-1.5 bg-[#FF8C32] text-white border-2 border-[#1C1A17] rounded-lg font-bold text-xs cursor-pointer shadow-[2px_2px_0px_0px_#1C1A17]"
                                >
                                  SAVE
                                </button>
                              </div>
                            </form>
                          );
                        }

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
                            className={`bg-white rounded-3xl border-4 border-[#1C1A17] p-5.5 hover:border-[#FF8C32] shadow-[4px_4px_0px_0px_#1C1A17] hover:shadow-[6px_6px_0px_0px_#1C1A17] hover:translate-y-[-2px] transition-all cursor-pointer group flex flex-col justify-between h-[210px] relative ${
                              courseEditorActive ? 'opacity-80' : ''
                            }`}
                          >
                            {courseEditorActive && (
                              <div className="absolute top-4 right-4 flex gap-1.5 z-10" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => handleStartRenameCourse(course)}
                                  title={`Edit course ${course.code}`}
                                  className="retro-btn-press p-1.5 bg-white text-[#FF8C32] hover:bg-[#FFF4E5] border-2 border-[#1C1A17] rounded-xl cursor-pointer shadow-[2px_2px_0px_0px_#1C1A17]"
                                >
                                  ✏️
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCourse(course.id)}
                                  title={`Delete course ${course.code}`}
                                  className="retro-btn-press p-1.5 bg-white text-[#9E2A2B] hover:bg-[#FFF0EF] border-2 border-[#1C1A17] rounded-xl cursor-pointer shadow-[2px_2px_0px_0px_#1C1A17]"
                                >
                                  🗑️
                                </button>
                              </div>
                            )}

                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <span className={`text-[8px] font-pixel font-bold px-3 py-1 rounded border-2 border-[#1C1A17] shadow-[2px_2px_0px_0px_#1C1A17] ${cls.bg} text-[#1C1A17]`}>
                                  {course.code}
                                </span>
                                {!courseEditorActive && (
                                  <div className="text-[8px] font-pixel text-[#7C7468] group-hover:text-[#FF8C32] transition-colors flex items-center gap-1">
                                    LOAD 🕹️
                                  </div>
                                )}
                              </div>
                              
                              <h4 className="text-lg font-bold text-[#1C1A17] group-hover:text-[#FF8C32] tracking-tight leading-tight mb-2 pr-6 transition-colors">
                                {course.name}
                              </h4>
                            </div>

                            {/* Stat Indicators Section */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-xs text-[#7C7468]">
                                <span className="font-bold uppercase tracking-wider text-[10px]">Mastery Quotient</span>
                                <span className="font-pixel text-[8px] font-black text-[#1C1A17]">{stats.completionRate}%</span>
                              </div>
                              
                              {/* Complete bar indicator */}
                              <div className="w-full h-3.5 bg-[#FAF7F2] border-2 border-[#1C1A17] rounded-none overflow-hidden relative">
                                <div 
                                  className={`h-full ${cls.accent} border-r-2 border-[#1C1A17] transition-all duration-300`}
                                  style={{ width: `${stats.completionRate}%` }}
                                />
                              </div>

                              {/* Bullet metrics counts */}
                              <div className="flex justify-between items-center text-[9px] font-mono font-bold text-[#7C7468] pt-1">
                                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500 border border-[#1C1A17]" /> {stats.confidenceCount.GREEN}</span>
                                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400 border border-[#1C1A17]" /> {stats.confidenceCount.YELLOW}</span>
                                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500 border border-[#1C1A17]" /> {stats.confidenceCount.RED}</span>
                                <span className="font-pixel text-[7px] bg-[#FAF6EE] border-2 border-[#1C1A17] px-1 py-0.5 rounded shadow-[1px_1px_0px_0px_#1C1A17]">{stats.totalSubtopics} STAGES</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>

              {/* Right Grid Column: Deadlines Urgency Engine & Knowledge Gaps */}
              <div className="space-y-6">
                <section className="bg-white rounded-3xl border-4 border-[#1C1A17] overflow-hidden shadow-[4px_4px_0px_0px_#1C1A17]">
                  <div className="bg-[#FAF6EE] px-6 py-4 border-b-4 border-[#1C1A17] flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[#1C1A17]">
                      <span className="text-xl">⏳</span>
                      <h3 className="font-pixel text-[10px] uppercase tracking-tight">URGENCY RADAR</h3>
                    </div>
                  </div>

                  <div className="p-5.5 space-y-4 bg-white">
                    
                    {/* Simplified Form Inline to Add Course Deadlines */}
                    <form onSubmit={handleAddDeadline} className="bg-[#FAF6EE] p-4.5 rounded-2xl border-2 border-[#1C1A17] space-y-3.5 text-xs shadow-[2px_2px_0px_0px_#1C1A17]">
                      <p className="font-pixel text-[8px] text-[#1C1A17] uppercase">LOG NEW DEADLINE</p>
                      
                      <div className="space-y-2">
                        <input 
                          type="text" 
                          required
                          placeholder="Problem Set 3, Essay, Project Draft..."
                          value={newDeadlineTitle}
                          onChange={(e) => setNewDeadlineTitle(e.target.value)}
                          className="w-full bg-white px-3.5 py-2 border-2 border-[#1C1A17] rounded-xl text-[#1C1A17] focus:outline-none transition-all font-sans"
                        />
                        
                        <div className="grid grid-cols-2 gap-2">
                          <select 
                            value={newDeadlineCourseId}
                            onChange={(e) => setNewDeadlineCourseId(e.target.value)}
                            className="bg-white px-3.5 py-2 border-2 border-[#1C1A17] rounded-xl text-[#1C1A17] font-bold focus:outline-none transition-all cursor-pointer font-sans"
                          >
                            {courses.map(c => (
                              <option key={c.id} value={c.id}>{c.code}</option>
                            ))}
                          </select>

                          <input 
                            type="time" 
                            value={newDeadlineTime}
                            onChange={(e) => setNewDeadlineTime(e.target.value)}
                            className="bg-white px-3.5 py-2 border-2 border-[#1C1A17] rounded-xl text-[#1C1A17] focus:outline-none transition-all font-sans"
                          />
                        </div>

                        <div className="flex items-center gap-2 justify-between">
                          <input 
                            type="date" 
                            value={newDeadlineDate}
                            onChange={(e) => setNewDeadlineDate(e.target.value)}
                            className="bg-white px-3.5 py-2 border-2 border-[#1C1A17] rounded-xl text-[#1C1A17] focus:outline-none transition-all font-sans"
                          />
                          <button 
                            type="submit"
                            className="retro-btn-press px-4 py-2 bg-[#FF8C32] text-white font-pixel text-[8px] border-2 border-[#1C1A17] rounded-lg cursor-pointer flex items-center gap-1 shrink-0 shadow-[2px_2px_0px_0px_#1C1A17]"
                          >
                            ➕ ADD
                          </button>
                        </div>
                      </div>
                    </form>

                    {/* Deadline Cards List */}
                    <div className="space-y-3.5 max-h-96 overflow-y-auto pr-1">
                      {sortedDeadlines.length === 0 ? (
                        <p className="text-center text-[9px] font-pixel text-slate-400 py-4 uppercase">NO DEADLINES ACTIVE 🛡️</p>
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
                              className={`p-4 rounded-2xl border-2 border-[#1C1A17] transition-all shadow-[2px_2px_0px_0px_#1C1A17] ${
                                dl.completed 
                                  ? 'bg-[#FAF7F2] opacity-60 grayscale' 
                                  : stat.level === 'CRITICAL' 
                                    ? 'bg-[#FFF5F4] border-red-500' 
                                    : 'bg-white hover:bg-[#FAF7F2]/30'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                
                                <div className="flex items-start gap-2.5">
                                  <input 
                                    type="checkbox"
                                    checked={dl.completed}
                                    id={`checkbox-${dl.id}`}
                                    onChange={(e) => handleToggleDeadline(dl.id!, e.target.checked)}
                                    className="mt-1 h-4 w-4 border-2 border-[#1C1A17] text-[#FF8C32] rounded focus:ring-0 cursor-pointer accent-[#FF8C32]"
                                  />
                                  <div>
                                    <h4 className={`text-xs font-bold text-[#1C1A17] leading-tight ${dl.completed ? 'line-through text-[#7C7468]' : ''}`}>
                                      {dl.title}
                                    </h4>
                                    <div className="flex items-center gap-1.5 mt-1.5">
                                      <span className={`text-[8px] font-pixel px-2 py-0.5 rounded border-2 border-[#1C1A17] shadow-[1px_1px_0px_0px_#1C1A17] ${clsMap.bg} text-[#1C1A17]`}>
                                        {courseCode}
                                      </span>
                                      <span className="text-[10px] text-[#7C7468] font-mono font-semibold">
                                        📅 {formatDateDDMMYYYY(dl.dueDate)} {new Date(dl.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <button 
                                  type="button"
                                  onClick={() => handleDeleteDeadline(dl.id!)}
                                  className="text-[#7C7468] hover:text-[#9E2A2B] p-1 transition-colors cursor-pointer text-sm"
                                >
                                  ❌
                                </button>
                              </div>

                              {!dl.completed && (
                                <div className="mt-2.5 flex items-center justify-between text-[11px]">
                                  <span className="text-[#7C7468] font-bold uppercase text-[9px]">Status</span>
                                  <span className={`px-2 py-0.5 rounded border-2 border-[#1C1A17] font-pixel text-[7px] shadow-[1px_1px_0px_0px_#1C1A17] ${stat.level === 'CRITICAL' ? 'bg-[#FFF0EF] text-[#9E2A2B]' : 'bg-[#FAF7F2] text-[#1C1A17]'}`}>
                                    {stat.text.toUpperCase()}
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
                <section className="bg-white rounded-3xl border-4 border-[#1C1A17] overflow-hidden shadow-[4px_4px_0px_0px_#1C1A17]">
                  <div className="bg-[#FAF6EE] px-6 py-4 border-b-4 border-[#1C1A17] flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[#1C1A17]">
                      <span className="text-xl">🧬</span>
                      <div>
                        <h3 className="font-pixel text-[10px] uppercase tracking-tight">KNOWLEDGE GAPS</h3>
                      </div>
                    </div>
                  </div>

                  <div className="p-5.5 space-y-4 bg-white">
                    {/* Inline Form to Add Prerequisite Review Node */}
                    <form onSubmit={handleAddUrgentReview} className="bg-[#FAF6EE] p-4.5 rounded-2xl border-2 border-[#1C1A17] space-y-3.5 text-xs shadow-[2px_2px_0px_0px_#1C1A17]">
                      <p className="font-pixel text-[8px] text-[#1C1A17] uppercase">FLAG SYLLABUS GAP</p>

                      <div className="space-y-2">
                        <input 
                          type="text" 
                          required
                          placeholder="e.g. Partial Fractions, Matrix Expansion..."
                          value={newUrgentTitle}
                          onChange={(e) => setNewUrgentTitle(e.target.value)}
                          className="w-full bg-white px-3.5 py-2 border-2 border-[#1C1A17] rounded-xl text-[#1C1A17] focus:outline-none transition-all font-sans"
                        />

                        <input 
                          type="text" 
                          placeholder="Short description/notes (e.g. missing formula)..."
                          value={newUrgentNotes}
                          onChange={(e) => setNewUrgentNotes(e.target.value)}
                          className="w-full bg-white px-3.5 py-2 border-2 border-[#1C1A17] rounded-xl text-[#1C1A17] focus:outline-none transition-all font-sans"
                        />
                        
                        <div className="flex items-center gap-2 justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-[#1C1A17] font-bold uppercase">Class:</span>
                            <select 
                              value={newUrgentCourseId}
                              onChange={(e) => setNewUrgentCourseId(e.target.value)}
                              className="bg-white px-3 py-1.5 border-2 border-[#1C1A17] rounded-xl text-[#1C1A17] focus:outline-none text-[11px] font-bold cursor-pointer font-sans"
                            >
                              {courses.map(c => (
                                <option key={c.id} value={c.id}>{c.code}</option>
                              ))}
                            </select>
                          </div>

                          <button 
                            type="submit"
                            className="retro-btn-press px-4 py-2 bg-[#FF8C32] text-white font-pixel text-[8px] border-2 border-[#1C1A17] rounded-lg cursor-pointer flex items-center gap-1 shrink-0 shadow-[2px_2px_0px_0px_#1C1A17]"
                          >
                            ⚡ GAP-TRACK
                          </button>
                        </div>
                      </div>
                    </form>

                    {/* Prerequisite reviews list */}
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                      {urgentReviews.length === 0 ? (
                        <p className="text-center text-[9px] font-pixel text-[#7C7468] py-4 uppercase">NO PREREQUISITE GAPS AT PRESENT 💮</p>
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
                                className={`p-4 rounded-2xl border-2 border-[#1C1A17] transition-all shadow-[2px_2px_0px_0px_#1C1A17] ${
                                  ur.completed 
                                    ? 'bg-[#FAF7F2] opacity-60 grayscale' 
                                    : 'bg-white hover:bg-[#FAF7F2]/30'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-start gap-2.5">
                                    <input 
                                      type="checkbox"
                                      id={`urgent-review-${ur.id}`}
                                      checked={ur.completed}
                                      onChange={(e) => handleToggleUrgentReview(ur.id!, e.target.checked)}
                                      className="mt-1 h-4 w-4 border-2 border-[#1C1A17] text-[#FF8C32] rounded focus:ring-0 cursor-pointer accent-[#FF8C32]"
                                    />
                                    <div>
                                      <h4 className={`text-xs font-bold text-[#1C1A17] leading-tight ${ur.completed ? 'line-through text-[#7C7468]' : ''}`}>
                                        {ur.title}
                                      </h4>
                                      
                                      {ur.notes && (
                                        <p className={`text-[11px] mt-1 text-[#7C7468] leading-relaxed ${ur.completed ? 'line-through opacity-70' : ''}`}>
                                          {ur.notes}
                                        </p>
                                      )}

                                      <div className="flex items-center gap-1.5 mt-2">
                                        <span className={`text-[8px] font-pixel px-2 py-0.5 rounded border-2 border-[#1C1A17] shadow-[1px_1px_0px_0px_#1C1A17] ${clsMap.bg} text-[#1C1A17]`}>
                                          {courseCode}
                                        </span>
                                        <span className="text-[9px] text-[#7C7468] font-bold uppercase tracking-wide">
                                          PREREQUISITE GAP
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <button 
                                    type="button"
                                    onClick={() => handleDeleteUrgentReview(ur.id!)}
                                    className="text-[#7C7468] hover:text-[#9E2A2B] p-1 transition-colors cursor-pointer text-sm"
                                  >
                                    ❌
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
            <div className="bg-white border-4 border-[#1C1A17] rounded-3xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-[4px_4px_0px_0px_#1C1A17]">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setCurrentView('dashboard')}
                  className="retro-btn-press px-4 py-2 bg-white hover:bg-[#FAF7F2] text-[#1C1A17] border-2 border-[#1C1A17] rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-[2px_2px_0px_0px_#1C1A17]"
                >
                  <ArrowLeft className="h-4 w-4 text-[#FF8C32]" /> Exit Workspace
                </button>
                <div className="h-6 w-px bg-[#1C1A17] hidden md:block" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[8px] font-pixel px-2.5 py-0.5 border-2 border-[#1C1A17] rounded shadow-[1px_1px_0px_0px_#1C1A17] ${getCourseColors(activeCourse.color).bg} ${getCourseColors(activeCourse.color).text}`}>
                      {activeCourse.code}
                    </span>
                    <h3 className="font-pixel text-xs text-[#1C1A17] uppercase tracking-tight">{activeCourse.name}</h3>
                  </div>
                  <p className="text-[10px] text-[#7C7468] font-bold mt-0.5">Week accordion menu lists custom curriculum guidelines</p>
                </div>
              </div>

              {/* Course-level Action Panel */}
              <div className="flex items-center gap-2.5">
                <button 
                  onClick={() => setSyllabusEditorMode(!syllabusEditorMode)}
                  className={`retro-btn-press px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border-2 border-[#1C1A17] shadow-[2px_2px_0px_0px_#1C1A17] ${
                    syllabusEditorMode 
                      ? 'bg-[#FF8C32] text-white' 
                      : 'bg-white hover:bg-[#FAF7F2] text-[#1C1A17]'
                  }`}
                  title="Toggle custom detailed structure, topic addition, and syllabus editing"
                >
                  🛠️ {syllabusEditorMode ? 'Structure Editor [ON]' : 'Subject Editor Mode'}
                </button>

                {syllabusEditorMode ? (
                  <button 
                    onClick={() => handleAddSyllabusTopic(activeCourse.id, activeCourseTopics)}
                    className="retro-btn-press px-4 py-2 bg-[#1C1A17] text-white hover:bg-[#322F2A] rounded-xl text-xs font-bold cursor-pointer transition-colors flex items-center gap-1 border-2 border-[#1C1A17] shadow-[2px_2px_0px_0px_#1C1A17]"
                  >
                    <Plus className="h-3.5 w-3.5 text-[#FF8C32]" /> New Topic Week
                  </button>
                ) : (
                  <button 
                    onClick={() => {
                      setNewSubTopicWeek(1);
                      setShowAddSubTopicModal(true);
                    }}
                    className="retro-btn-press px-4 py-2 bg-[#1C1A17] hover:bg-[#322F2A] text-white rounded-xl text-xs font-bold cursor-pointer transition-colors flex items-center gap-1 border-2 border-[#1C1A17] shadow-[2px_2px_0px_0px_#1C1A17]"
                  >
                    <Plus className="h-3.5 w-3.5 text-[#FF8C32]" /> Add Sub-Topic
                  </button>
                )}
              </div>
            </div>

            {/* Structured Workspace 2p Panel Container */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-5 min-h-[550px] items-stretch relative">
              
              {/* SIDEBAR NAVIGATION PANE: LEFT (Column 4 of 12) */}
              {!sidebarHidden && (
                <nav className="md:col-span-4 bg-white border-4 border-[#1C1A17] rounded-3xl p-5 flex flex-col gap-3.5 h-[650px] overflow-y-auto relative shadow-[4px_4px_0px_0px_#1C1A17]">
                  <div className="flex items-center justify-between pb-2 border-b-2 border-[#1C1A17] sticky top-0 bg-white z-10">
                    <span className="font-pixel text-[8px] uppercase text-[#7C7468]">13-Week Syllabus Accordion</span>
                    <button 
                      onClick={() => setSidebarHidden(true)}
                      className="p-1 text-[#7C7468] hover:text-[#9E2A2B] bg-[#FAF7F2] rounded-lg transition-all cursor-pointer"
                      title="Collapse Navigation sidebar"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* 13-Week Accordion */}
                  <div className="space-y-2.5">
                    {activeCourseTopics.map((topicRec) => {
                      const isExpanded = !!expandedWeeks[topicRec.weekNumber];
                      
                      return (
                        <div key={topicRec.id} className={`border rounded-2xl overflow-hidden transition-all ${syllabusEditorMode ? 'border-[#FF8C32] ring-1 ring-[#FF8C32]/10 bg-white' : 'border-[#EAE3D5] bg-white'}`}>
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedWeeks(prev => ({
                                ...prev,
                                [topicRec.weekNumber]: !prev[topicRec.weekNumber]
                              }));
                            }}
                            className={`w-full flex items-center justify-between p-3.5 text-left transition-colors cursor-pointer ${syllabusEditorMode ? 'bg-[#FFF4E5]/10 hover:bg-[#FFF4E5]/20' : 'bg-[#FAF7F2]/40 hover:bg-[#FAF7F2]'}`}
                          >
                            <div className="flex items-center gap-1.5 justify-between w-full pr-1">
                              {renamingTopicId === topicRec.id ? (
                                <div className="flex items-center gap-1.5 w-full" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="text"
                                    value={renamingTopicValue}
                                    onChange={(e) => setRenamingTopicValue(e.target.value)}
                                    className="grow text-xs bg-white border border-[#EAE3D5] rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-[#FF8C32] font-bold text-[#1C1A17]"
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
                                    className="px-2.5 py-1.5 bg-[#FF8C32] text-white rounded-lg text-[10px] font-bold cursor-pointer hover:bg-[#E06E1A] shrink-0 shadow-xs"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setRenamingTopicId(null)}
                                    className="px-2.5 py-1.5 bg-white text-[#7C7468] border border-[#EAE3D5] rounded-lg text-[10px] font-bold cursor-pointer hover:bg-[#FAF7F2] shrink-0"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <div 
                                    className="space-y-0.5 grow cursor-pointer select-none"
                                    onDoubleClick={(e) => {
                                      e.stopPropagation();
                                      if (syllabusEditorMode) {
                                        handleRenameTopic(topicRec.id!, topicRec.topicTitle);
                                      }
                                    }}
                                    title={syllabusEditorMode ? "Double click to rename topic" : undefined}
                                  >
                                    <span className="text-[9px] font-mono font-black text-[#7C7468] uppercase tracking-wider">WEEK {topicRec.weekNumber}</span>
                                    <h5 className="text-xs font-bold text-[#1C1A17] truncate max-w-[180px] leading-tight flex items-center gap-1 hover:text-[#FF8C32] transition-colors">
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
                                        className="p-1 px-1.5 hover:bg-[#FFF4E5] text-[10px] rounded-lg text-[#7C7468] hover:text-[#FF8C32] transition-all cursor-pointer font-bold flex items-center gap-0.5 border border-transparent hover:border-[#FFE1B8]"
                                        title="Rename Syllabus Topic"
                                      >
                                        <span>✏️</span>
                                        <span className="hidden sm:inline">Rename</span>
                                      </button>
                                    )}
                                    {isExpanded ? <ChevronDown className="h-4 w-4 text-[#7C7468]" /> : <ChevronRight className="h-4 w-4 text-[#7C7468]" />}
                                  </div>
                                </>
                              )}
                            </div>
                          </button>

                          {/* Nested week subcomponents */}
                          {isExpanded && (
                            <div className="p-3 bg-white space-y-2 border-t border-[#EAE3D5]">
                              {/* Subtopic nodes */}
                              {topicRec.subTopics?.length === 0 ? (
                                <p className="text-[10px] text-[#7C7468] px-2 py-1 italic">No nodes assigned yet.</p>
                              ) : (
                                topicRec.subTopics?.map((sub, sidx) => {
                                  const isActive = activeSubTopicId === sub.subTopicId;
                                  const isBeingDragged = draggedSubTopicIndex === sidx && draggedFromTopicId === topicRec.id;
                                  
                                  const nowLimit = new Date(simulatedTodayString);
                                  nowLimit.setHours(23, 59, 59, 999);
                                  const isOverdue = sub.nextReviewDate && 
                                                    sub.confidenceStatus !== 'NONE' && 
                                                    !sub.completed && 
                                                    (new Date(sub.nextReviewDate) <= nowLimit);

                                  let containerBgClass = '';
                                  if (isOverdue) {
                                    containerBgClass = isActive 
                                      ? 'bg-[#9E2A2B] text-white border-2 border-[#1C1A17] font-bold shadow-xs' 
                                      : 'bg-[#FFF5F4] border border-[#FAD3D1] text-[#9E2A2B] hover:bg-[#FFEBEA] font-bold shadow-xs';
                                  } else if (sub.completed) {
                                    containerBgClass = isActive
                                      ? 'bg-[#1C1A17] text-[#FFF4E5] border border-[#1C1A17]'
                                      : 'bg-[#FAF7F2] hover:bg-[#FAF7F2]/80 text-[#7C7468]/70 border border-[#EAE3D5]/50';
                                  } else {
                                    containerBgClass = isActive 
                                      ? 'bg-[#FF8C32] text-white font-bold border border-[#FF8C32]' 
                                      : 'bg-white hover:bg-[#FAF7F2] border border-[#EAE3D5] text-[#1C1A17]';
                                  }

                                  return (
                                    <div 
                                      key={sub.subTopicId}
                                      draggable
                                      onDragStart={(e) => handleSubTopicDragStart(e, topicRec.id!, sidx)}
                                      onDragOver={(e) => handleSubTopicDragOver(e, sidx)}
                                      onDrop={(e) => handleSubTopicDrop(e, topicRec.id!, sidx)}
                                      onDragEnd={handleSubTopicDragEnd}
                                      className={`flex items-center gap-1.5 justify-between rounded-xl p-2 transition-all text-xs cursor-grab active:cursor-grabbing ${containerBgClass} ${isBeingDragged ? 'opacity-40 border border-dashed border-[#FF8C32]' : ''}`}
                                    >
                                      {/* Drag handle & checkbox */}
                                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                        <span className={`p-0.5 rounded transition-colors ${isActive ? 'text-white/80' : 'text-[#7C7468] hover:text-[#1C1A17]'}`} title="Drag to reorder">
                                          <GripVertical className="h-3.5 w-3.5" />
                                        </span>
                                        <input
                                          type="checkbox"
                                          checked={!!sub.completed}
                                          onChange={(e) => handleToggleSubTopicComplete(topicRec, sidx, e.target.checked)}
                                          className="h-3.5 w-3.5 rounded text-[#FF8C32] focus:ring-[#FF8C32] border-[#EAE3D5] cursor-pointer shrink-0 accent-[#FF8C32]"
                                          title="Toggle completion"
                                        />
                                      </div>

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
                                          <span className="mr-0.5 font-mono text-[9px] opacity-70">{sidx + 1}.</span>
                                          <span className="truncate font-medium">{sub.title}</span>
                                          {!isOverdue && !sub.completed && sub.confidenceStatus !== 'NONE' && (
                                            <span className={`inline-block h-1.5 w-1.5 rounded-full ml-0.5 ${
                                              sub.confidenceStatus === 'RED' ? 'bg-[#9E2A2B]' : sub.confidenceStatus === 'YELLOW' ? 'bg-[#FF8C32]' : 'bg-emerald-500'
                                            }`} />
                                          )}
                                        </div>
                                        {isOverdue && (
                                          <span className={`text-[8px] font-black uppercase tracking-wider mt-0.5 ${isActive ? 'text-amber-200' : 'text-[#9E2A2B]'}`}>
                                            Urgent Due
                                          </span>
                                        )}
                                      </button>

                                      {/* Deletion control wrapper */}
                                      <button 
                                        onClick={() => handleDeleteSubTopic(topicRec.id!, sidx, sub.title)}
                                        className={`p-1 rounded transition-all cursor-pointer ${isActive ? 'text-white/80 hover:text-red-200' : 'text-[#7C7468] hover:text-[#9E2A2B]'}`}
                                        title="Delete sub-topic node"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  );
                                })
                              )}

                              {/* Sidebar direct add subtopic link */}
                              {syllabusEditorMode && (
                                <div className="mt-1 space-y-1.5 w-full">
                                  {quickAddingSubTopicTopicId === topicRec.id ? (
                                    <div className="p-3 bg-[#FAF7F2] border border-[#EAE3D5] rounded-xl flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                                      <span className="text-[9px] font-mono font-bold text-[#7C7468] uppercase">New Submodule Title</span>
                                      <input
                                        type="text"
                                        value={quickAddingSubTopicValue}
                                        onChange={(e) => setQuickAddingSubTopicValue(e.target.value)}
                                        placeholder="e.g., Memory Architecture"
                                        className="text-xs bg-white border border-[#EAE3D5] rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-[#FF8C32] placeholder-[#7C7468]/50 font-medium text-[#1C1A17]"
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
                                          className="px-3 py-1.5 bg-white border border-[#EAE3D5] text-[#1C1A17] rounded-full text-[10px] font-bold cursor-pointer hover:bg-[#FAF7F2] shadow-xs"
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleSaveQuickAddSubTopic(topicRec.id!, activeCourse.id, topicRec.subTopics || [])}
                                          className="px-3 py-1.5 bg-[#1C1A17] text-white rounded-full text-[10px] font-bold cursor-pointer hover:bg-[#322F2A] shadow-xs"
                                        >
                                          Add Node
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleQuickAddSubTopic(topicRec.id!, activeCourse.id, topicRec.subTopics || [])}
                                      className="w-full text-left p-2 rounded-xl text-[11px] font-bold text-[#FF8C32] bg-[#FFF4E5] border border-[#FFE1B8] hover:bg-[#FFF4E5]/80 flex items-center justify-center gap-1 transition-all cursor-pointer mt-1"
                                    >
                                      <Plus className="h-3 w-3 text-[#FF8C32] font-black" /> Add Sub-Topic Node
                                    </button>
                                  )}
                                </div>
                              )}

                              {/* Overarching Topic Flashcards item */}
                              <div className="h-px bg-[#EAE3D5] my-1" />
                              <button
                                onClick={() => handleLaunchFlashcards(topicRec.courseId, topicRec.weekNumber, topicRec.topicId)}
                                className={`w-full text-left p-2.5 rounded-xl flex items-center justify-between text-xs font-bold transition-all border ${
                                  activeFlashcardsTopicId === topicRec.topicId 
                                    ? 'bg-[#FFF4E5] text-[#FF8C32] border-[#FFE1B8] shadow-xs' 
                                    : 'bg-white hover:bg-[#FAF7F2] text-[#7C7468] border-[#EAE3D5] shadow-xs'
                                }`}
                              >
                                <span className="flex items-center gap-1">
                                  <BookMarked className="h-3.5 w-3.5" /> Topic Flashcards
                                </span>
                                <span className="text-[10px] font-mono font-bold bg-[#FFF4E5] text-[#FF8C32] px-2 py-0.5 rounded-full border border-[#FFE1B8]">
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
                  className="absolute left-6 top-8 z-10 p-3 bg-[#1C1A17] border-2 border-[#1C1A17] text-white hover:bg-[#322F2A] rounded-xl shadow-[2px_2px_0px_0px_#1C1A17] transition-all cursor-pointer flex items-center gap-2 text-xs font-bold"
                >
                  <Menu className="h-4 w-4 text-[#FF8C32]" /> <span>Show Accordion Menu</span>
                </button>
              )}

              {/* CONTEXT CENTER PANE: RIGHT (Column 8 of 12 if sidebar shown/ 12 of 12 if collapsed) */}
              <section className={`${sidebarHidden ? 'md:col-span-12' : 'md:col-span-8'} bg-white border-4 border-[#1C1A17] rounded-3xl p-5 md:p-6 flex flex-col gap-4.5 h-[650px] overflow-y-auto shadow-[4px_4px_0px_0px_#1C1A17]`}>
                
                {/* Scenario 1: No subtopic or flashcards are selected */}
                {!activeSelectionDetails && !activeFlashcardTopicDetails && (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[#FAF6EE] rounded-2xl border-4 border-[#1C1A17] shadow-[2px_2px_0px_0px_#1C1A17]">
                    <BookOpen className="h-12 w-12 text-[#FF8C32] mb-3" />
                    <h4 className="font-pixel text-xs text-[#1C1A17] uppercase tracking-tight">No Module Loaded</h4>
                    <p className="text-xs text-[#7C7468] font-bold mt-2 max-w-sm mx-auto leading-relaxed">
                      Click any subtopic lecture or the Topic Flashcards deck within the left 13-week syllabus accordion to load resources into this study pane. Or create a custom subtopic node from the options header.
                    </p>
                    <div className="mt-5 flex gap-2">
                      {activeCourseTopics.length > 0 && activeCourseTopics[0].subTopics?.length > 0 && (
                        <button
                          onClick={() => {
                            const sub = activeCourseTopics[0].subTopics[0];
                            handleLaunchSubTopic(activeCourse.id, 1, sub.subTopicId);
                          }}
                          className="retro-btn-press px-5 py-2 bg-[#FF8C32] text-white border-2 border-[#1C1A17] rounded-xl text-[9px] font-pixel cursor-pointer shadow-[2px_2px_0px_0px_#1C1A17]"
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
                    <div className="flex items-center justify-between border-b border-[#EAE3D5] pb-4">
                      <div>
                        <div className="flex items-center gap-1.5 text-[9px] font-mono font-bold text-[#7C7468] uppercase tracking-wider">
                          <span>{activeCourse.code}</span>
                          <span>/</span>
                          <span>Week {activeSelectionDetails.topicRecord.weekNumber}</span>
                          <span>/</span>
                          <span className="text-[#1C1A17] font-black">{activeSelectionDetails.topicRecord.topicTitle}</span>
                        </div>
                        <h2 className="text-lg md:text-xl font-bold font-display text-[#1C1A17] mt-1 tracking-tight">{activeSelectionDetails.subTopic.title}</h2>
                      </div>

                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setEditMode(!editMode)}
                          className={`px-4 py-2 rounded-full text-xs font-bold cursor-pointer border flex items-center gap-1.5 transition-colors shadow-xs ${
                            editMode 
                              ? 'bg-[#FF8C32] text-white border-[#FF8C32] hover:bg-[#E06E1A]' 
                              : 'bg-white text-[#1C1A17] hover:bg-[#FAF7F2] border-[#EAE3D5]'
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
                      <div className="space-y-5 bg-[#FAF7F2]/50 p-5 rounded-2xl border border-[#EAE3D5] shadow-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[#1C1A17] block">✏️ Notes Markdown Editor</span>
                          <span className="text-[9px] font-mono font-bold text-[#7C7468]">Ctrl+Enter to save / exit</span>
                        </div>
                        
                        <textarea
                          id="markdown-notes-editor"
                          defaultValue={activeSelectionDetails.subTopic.notesMarkdown}
                          rows={14}
                          onKeyDown={handleNotesKeyDown}
                          className="w-full bg-white p-4 font-mono text-xs border border-[#EAE3D5] rounded-xl focus:outline-none focus:border-[#FF8C32] focus:ring-1 focus:ring-[#FF8C32] text-[#1C1A17]"
                        />

                        {/* Obsidian-Style Formatting Glossary */}
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                            <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                              <span className="text-sm">📓</span>
                              <span className="font-display font-bold text-slate-700 tracking-tight text-xs">Standard & Math Formatting Glossary</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">Reference Guide</span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-slate-600">
                            {/* Column 1: Typography & Lists */}
                            <div className="space-y-2">
                              <div className="font-semibold text-[10px] uppercase tracking-wider text-slate-400">Typography & Lists</div>
                              <div className="grid grid-cols-1 gap-1.5">
                                <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-[11px] text-slate-800">Heading 1</span>
                                    <span className="font-mono text-[10px] text-amber-600 font-medium"># Title</span>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-[11px] text-slate-800">Heading 2</span>
                                    <span className="font-mono text-[10px] text-amber-600 font-medium">## Subsection</span>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-[11px] text-slate-800">Bold Text</span>
                                    <span className="font-mono text-[10px] text-amber-600 font-medium">**bold text**</span>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-[11px] text-slate-800">Bullet Item</span>
                                    <span className="font-mono text-[10px] text-amber-600 font-medium">- List Item</span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Column 2: Code & Math Block Layout */}
                            <div className="space-y-2">
                              <div className="font-semibold text-[10px] uppercase tracking-wider text-slate-400">Code & Math Formulas</div>
                              <div className="grid grid-cols-1 gap-1.5">
                                <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-[11px] text-slate-800">Inline Code Block</span>
                                    <span className="font-mono text-[10px] text-amber-600 font-medium">`code code`</span>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-[11px] text-slate-800">Code Block (Multiline)</span>
                                    <span className="font-mono text-[10px] text-amber-600 font-medium">```typescript ... ```</span>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-[11px] text-slate-800">Inline Math formula</span>
                                    <span className="font-mono text-[10px] text-amber-600 font-medium">$$ E = mc^2 $$</span>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-[11px] text-slate-800">Display Math Block</span>
                                    <span className="font-mono text-[10px] text-amber-600 font-medium">$$ equation $$</span>
                                  </div>
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
                          <div className="bg-slate-50/50 border border-slate-200/60 rounded-2xl p-4 mt-5 space-y-3 text-xs shadow-xs">
                            <div className="flex items-center gap-1.5 border-b border-slate-200/40 pb-2">
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

                              <div className="flex items-center gap-2.5 bg-amber-50/40 border border-amber-100 p-2 rounded-xl">
                                <label className="text-[10px] text-amber-800 font-bold block">How many options do you want? (2-5):</label>
                                <select
                                  value={newQuizOptionCount}
                                  onChange={(e) => {
                                    const count = parseInt(e.target.value);
                                    setNewQuizOptionCount(count);
                                    if (newQuizCorrectIndex >= count) {
                                      setNewQuizCorrectIndex(count - 1);
                                    }
                                  }}
                                  className="bg-white px-2.5 py-1 border border-amber-200 rounded text-xs font-bold text-slate-800 cursor-pointer focus:outline-none focus:border-amber-500 shadow-xs"
                                >
                                  <option value={2}>2 Options (A-B)</option>
                                  <option value={3}>3 Options (A-C)</option>
                                  <option value={4}>4 Options (A-D)</option>
                                  <option value={5}>5 Options (A-E)</option>
                                </select>
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

                                {newQuizOptionCount >= 3 && (
                                  <div className="space-y-1">
                                    <label className="text-[10px] text-slate-500 font-semibold block">Option C (Required)</label>
                                    <input 
                                      type="text"
                                      required
                                      placeholder="e.g. Theta(1)"
                                      value={newQuizOption3}
                                      onChange={(e) => setNewQuizOption3(e.target.value)}
                                      className="w-full bg-white px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-amber-500 text-slate-800"
                                    />
                                  </div>
                                )}

                                {newQuizOptionCount >= 4 && (
                                  <div className="space-y-1">
                                    <label className="text-[10px] text-slate-500 font-semibold block">Option D (Required)</label>
                                    <input 
                                      type="text"
                                      required
                                      placeholder="e.g. None of the above"
                                      value={newQuizOption4}
                                      onChange={(e) => setNewQuizOption4(e.target.value)}
                                      className="w-full bg-white px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-amber-500 text-slate-800"
                                    />
                                  </div>
                                )}

                                {newQuizOptionCount >= 5 && (
                                  <div className="space-y-1 col-span-1 sm:col-span-2">
                                    <label className="text-[10px] text-slate-500 font-semibold block">Option E (Required)</label>
                                    <input 
                                      type="text"
                                      required
                                      placeholder="e.g. All of the above"
                                      value={newQuizOption5}
                                      onChange={(e) => setNewQuizOption5(e.target.value)}
                                      className="w-full bg-white px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-amber-500 text-slate-800"
                                    />
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center justify-between gap-3 pt-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-slate-500 font-semibold">Mark Correct Option:</span>
                                  <select 
                                    value={newQuizCorrectIndex}
                                    onChange={(e) => setNewQuizCorrectIndex(parseInt(e.target.value))}
                                    className="bg-white px-2.5 py-1.5 border border-slate-250 rounded-lg font-semibold text-xs text-slate-800 cursor-pointer focus:outline-none focus:border-amber-500"
                                  >
                                    <option value={0}>Option A</option>
                                    <option value={1}>Option B</option>
                                    {newQuizOptionCount >= 3 && <option value={2}>Option C</option>}
                                    {newQuizOptionCount >= 4 && <option value={3}>Option D</option>}
                                    {newQuizOptionCount >= 5 && <option value={4}>Option E</option>}
                                  </select>
                                </div>

                                <button 
                                  type="submit"
                                  className="retro-btn-press px-4 py-2 bg-[#FF8C32] hover:bg-[#E06E1A] text-white font-bold rounded-xl transition-all cursor-pointer shadow-xs"
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
                        <div className="flex items-center justify-start border-b border-[#EAE3D5] pb-3 mb-2">
                          <div className="bg-[#FAF7F2] p-1.5 rounded-full flex items-center gap-1 border border-[#EAE3D5] shadow-xs">
                            <button
                              type="button"
                              onClick={() => setActiveViewTab('notes')}
                              className={`px-4.5 py-1.5 rounded-full text-xs font-bold tracking-tight transition-all duration-150 flex items-center gap-2 cursor-pointer ${
                                activeViewTab === 'notes'
                                  ? 'bg-white text-[#1C1A17] shadow-xs font-bold border border-[#EAE3D5]'
                                  : 'text-[#7C7468] hover:text-[#1C1A17] bg-transparent'
                              }`}
                            >
                              <span className="text-sm">📖</span> Notes
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveViewTab('quiz')}
                              className={`px-4.5 py-1.5 rounded-full text-xs font-bold tracking-tight transition-all duration-150 flex items-center gap-2 cursor-pointer ${
                                activeViewTab === 'quiz'
                                  ? 'bg-white text-[#1C1A17] shadow-xs font-bold border border-[#EAE3D5]'
                                  : 'text-[#7C7468] hover:text-[#1C1A17] bg-transparent'
                              }`}
                            >
                              <span className="text-sm">❓</span> Quiz ({activeSelectionDetails.subTopic.quiz?.length || 0})
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveViewTab('flashcards');
                                setSubFCIndex(0);
                                setSubIsFlipped(false);
                              }}
                              className={`px-4.5 py-1.5 rounded-full text-xs font-bold tracking-tight transition-all duration-150 flex items-center gap-2 cursor-pointer ${
                                activeViewTab === 'flashcards'
                                  ? 'bg-white text-[#1C1A17] shadow-xs font-bold border border-[#EAE3D5]'
                                  : 'text-[#7C7468] hover:text-[#1C1A17] bg-transparent'
                              }`}
                            >
                              <span className="text-sm">⚡</span> Flashcards ({activeSelectionDetails.subTopic.flashcards?.length || 0})
                            </button>
                          </div>
                        </div>

                        {activeViewTab === 'notes' ? (
                          /* A. Core Markdown Study Notes View */
                          <article className="prose max-w-none prose-slate bg-[#FAF6EE] border-4 border-[#1C1A17] p-6 rounded-3xl shadow-[4px_4px_0px_0px_#1C1A17] text-xs text-[#1C1A17]">
                            <MarkdownView content={activeSelectionDetails.subTopic.notesMarkdown} />
                          </article>
                        ) : activeViewTab === 'quiz' ? (
                          /* B. Mastery Quiz Block */
                          <div className="bg-white border-4 border-[#1C1A17] rounded-3xl p-5 md:p-6 space-y-5 shadow-[4px_4px_0px_0px_#1C1A17]">
                            
                            <div className="flex items-center justify-between flex-wrap gap-2 border-b-2 border-[#1C1A17] pb-3 mb-1">
                              <div className="flex items-center gap-2">
                                <Award className="h-5 w-5 text-[#FF8C32]" />
                                <h3 className="font-pixel text-[10px] text-[#1C1A17] uppercase tracking-tight">Module Mastery Check-Quiz</h3>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[8px] font-pixel bg-[#FAF6EE] text-[#1C1A17] border-2 border-[#1C1A17] px-2.5 py-1 rounded shadow-[1px_1px_0px_0px_#1C1A17]">
                                  PASS GOAL: 80% SCORE REQUIRED
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setShowViewModeQuizBuilder(!showViewModeQuizBuilder)}
                                  className={`retro-btn-press px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer border-2 border-[#1C1A17] flex items-center gap-1 transition-all shadow-[2px_2px_0px_0px_#1C1A17] ${
                                    showViewModeQuizBuilder
                                      ? 'bg-[#FF8C32] text-white'
                                      : 'bg-white text-[#1C1A17] hover:bg-[#FAF7F2]'
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
                                        className="w-full bg-white px-3 py-2 border border-slate-250 rounded-lg focus:outline-none focus:border-amber-500 text-slate-800"
                                      />
                                    </div>

                                    <div className="flex items-center gap-2.5 bg-amber-50/40 border border-amber-100 p-2 rounded-xl">
                                      <label className="text-[10px] text-amber-800 font-bold block">How many options do you want? (2-5):</label>
                                      <select
                                        value={newQuizOptionCount}
                                        onChange={(e) => {
                                          const count = parseInt(e.target.value);
                                          setNewQuizOptionCount(count);
                                          if (newQuizCorrectIndex >= count) {
                                            setNewQuizCorrectIndex(count - 1);
                                          }
                                        }}
                                        className="bg-white px-2.5 py-1 border border-amber-200 rounded text-xs font-bold text-slate-800 cursor-pointer focus:outline-none focus:border-amber-500 shadow-xs"
                                      >
                                        <option value={2}>2 Options (A-B)</option>
                                        <option value={3}>3 Options (A-C)</option>
                                        <option value={4}>4 Options (A-D)</option>
                                        <option value={5}>5 Options (A-E)</option>
                                      </select>
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

                                      {newQuizOptionCount >= 3 && (
                                        <div className="space-y-1">
                                          <label className="text-[10px] text-slate-500 font-semibold block">Option C (Required)</label>
                                          <input 
                                            type="text"
                                            required
                                            placeholder="e.g. Theta(1)"
                                            value={newQuizOption3}
                                            onChange={(e) => setNewQuizOption3(e.target.value)}
                                            className="w-full bg-white px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-amber-500 text-slate-800"
                                          />
                                        </div>
                                      )}

                                      {newQuizOptionCount >= 4 && (
                                        <div className="space-y-1">
                                          <label className="text-[10px] text-slate-500 font-semibold block">Option D (Required)</label>
                                          <input 
                                            type="text"
                                            required
                                            placeholder="e.g. None of the above"
                                            value={newQuizOption4}
                                            onChange={(e) => setNewQuizOption4(e.target.value)}
                                            className="w-full bg-white px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-amber-500 text-slate-800"
                                          />
                                        </div>
                                      )}

                                      {newQuizOptionCount >= 5 && (
                                        <div className="space-y-1 col-span-1 sm:col-span-2">
                                          <label className="text-[10px] text-slate-500 font-semibold block">Option E (Required)</label>
                                          <input 
                                            type="text"
                                            required
                                            placeholder="e.g. All of the above"
                                            value={newQuizOption5}
                                            onChange={(e) => setNewQuizOption5(e.target.value)}
                                            className="w-full bg-white px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-amber-500 text-slate-800"
                                          />
                                        </div>
                                      )}
                                    </div>

                                    <div className="flex items-center justify-between gap-3 pt-2">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] text-slate-500 font-semibold">Mark Correct Option:</span>
                                        <select 
                                          value={newQuizCorrectIndex}
                                          onChange={(e) => setNewQuizCorrectIndex(parseInt(e.target.value))}
                                          className="bg-white px-2.5 py-1.5 border border-slate-250 rounded-lg font-semibold text-xs text-slate-800 cursor-pointer focus:outline-none focus:border-amber-500"
                                        >
                                          <option value={0}>Option A</option>
                                          <option value={1}>Option B</option>
                                          {newQuizOptionCount >= 3 && <option value={2}>Option C</option>}
                                          {newQuizOptionCount >= 4 && <option value={3}>Option D</option>}
                                          {newQuizOptionCount >= 5 && <option value={4}>Option E</option>}
                                        </select>
                                      </div>

                                      <button 
                                        type="submit"
                                        className="retro-btn-press px-4 py-2 bg-[#FF8C32] hover:bg-[#E06E1A] text-white font-bold rounded-xl transition-all cursor-pointer shadow-xs"
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
