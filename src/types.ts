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
