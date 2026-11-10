export interface QuizQuestion {
  question: string;
  options: string[];
  correctOptionIndex: number;
}

export interface SubTopic {
  subTopicId: string;
  orderIndex: number;
  title: string;
  notesMarkdown: string;
  confidenceStatus: 'RED' | 'YELLOW' | 'GREEN' | 'NONE';
  nextReviewDate: string | null; // ISO dynamic date
  quiz: QuizQuestion[];
  quizPassed: boolean; // Tracks if the quiz has been passed (critical for progress scoring)
  completed?: boolean;
  flashcards?: Flashcard[];
  review?: ReviewState; // Spaced-repetition state; confidenceStatus/nextReviewDate are kept in sync with it
  reviewBefore?: ReviewState | null; // State before the latest rating, so a same-day re-rating replaces it
  cues?: string;    // Note taker margin: keywords and questions
  summary?: string; // Note taker bottom: summary of the notes
  sq3r?: Sq3rProgress;
}

/** Guided SQ3R study steps for a topic. The final Review step is the Red/Yellow/Green rating. */
export interface Sq3rProgress {
  surveyNotes: string;
  surveyDone: boolean;
  questions: { q: string; a: string }[];
  readDone: boolean;
  reciteDone: boolean;
}

export type EventTag = 'class' | 'study' | 'priority' | 'assignment' | 'exam' | 'personal';

/** A calendar entry. Study and Priority entries show up in "What are we doing today?". */
export interface CalendarEvent {
  id?: number;
  title: string;
  date: string;          // YYYY-MM-DD (first occurrence)
  start?: string;        // HH:MM; absent = all day
  end?: string;          // HH:MM
  tag: EventTag;
  courseId?: string;
  subTopicId?: string;   // Linked topic, for Study entries
  repeatWeekly?: boolean;
  repeatUntil?: string;  // YYYY-MM-DD, inclusive
  doneDates?: string[];  // Occurrences ticked off in Today's priorities
  notes?: string;
}

/** Spaced-repetition scheduling state (see src/srs.ts). Absent = never reviewed. */
export interface ReviewState {
  due: string;          // local day, YYYY-MM-DD
  interval: number;     // days used for the current due date
  ease: number;         // growth multiplier, >= 1.3
  reps: number;         // successful reviews in a row
  lapses: number;       // times forgotten
  lastReviewed?: string; // local day, YYYY-MM-DD
}

export interface Flashcard {
  front: string;
  back: string;
}

export interface TopicRecord {
  id?: number;
  courseId: string;   // e.g. "FIN302"
  weekNumber: number;  // 1-13
  topicId: string;
  topicTitle: string;
  subTopics: SubTopic[];
  masterFlashcards: Flashcard[];
}

export interface Course {
  id: string; // e.g. "FIN302"
  code: string; // "FIN 302"
  name: string; // "Corporate Finance"
  color: string; // camelCase color keyword, e.g. "amber", "rose", etc.
}

export interface Deadline {
  id?: number;
  courseId: string;
  title: string;
  dueDate: string; // ISO string
  completed: boolean;
  type?: 'assignment' | 'exam' | 'event'; // Distinguish events
}

export interface UrgentReview {
  id?: number;
  courseId: string;
  title: string;
  notes?: string;
  completed: boolean;
  createdAt: string;
}

export interface Setting {
  key: string;
  value: string;
}
