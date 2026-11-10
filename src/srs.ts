// Spaced repetition for topics (SM-2 style, day granularity).
//
// A topic enters the review rotation once you conclude it with a rating
// (Hard = Red, Medium = Yellow, Easy = Green). Reviewing it again later,
// either directly or through its flashcards, moves its next review further
// out each time you know it, and pulls it back in when you don't.

import type { CalendarEvent, Flashcard, ReviewState, SubTopic, TopicRecord } from './types';

export type Grade = 'again' | 'hard' | 'good' | 'easy';
export type Level = 'RED' | 'YELLOW' | 'GREEN';
export type CardRating = 'hard' | 'medium' | 'easy';

export const LEVEL_LABEL: Record<Level, string> = { RED: 'Hard', YELLOW: 'Medium', GREEN: 'Easy' };
export const RATING_LEVEL: Record<CardRating, Level> = { hard: 'RED', medium: 'YELLOW', easy: 'GREEN' };

/** Days until the next review the first time a topic is rated. */
export type FirstIntervals = Record<Grade, number>;
// Keeps the app's original Red 2d / Yellow 5d / Green 14d on the first rating.
export const SUBTOPIC_FIRST_INTERVALS: FirstIntervals = { again: 2, hard: 5, good: 14, easy: 21 };

const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;
const MAX_INTERVAL = 365;

// ---------- Local date helpers (YYYY-MM-DD, no time zone surprises) ----------

export function parseLocalDate(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(day: string, n: number): string {
  const date = parseLocalDate(day);
  date.setDate(date.getDate() + n);
  return toLocalDateString(date);
}

export function daysBetween(fromDay: string, toDay: string): number {
  return Math.round((parseLocalDate(toDay).getTime() - parseLocalDate(fromDay).getTime()) / 86400000);
}

/** Converts a stored ISO timestamp (e.g. SubTopic.nextReviewDate) to a local day string. */
export function isoToLocalDay(iso: string): string {
  return toLocalDateString(new Date(iso));
}

/** Noon local time as ISO, so code comparing ISO timestamps sees the right day. */
export function localDayToIso(day: string): string {
  return parseLocalDate(day).toISOString();
}

// ---------- Scheduler ----------

export function schedule(
  prev: ReviewState | undefined,
  grade: Grade,
  today: string,
  first: FirstIntervals = SUBTOPIC_FIRST_INTERVALS,
): ReviewState {
  if (!prev || prev.reps === 0) {
    const ease = grade === 'again' ? DEFAULT_EASE - 0.2 : grade === 'hard' ? DEFAULT_EASE - 0.15 : grade === 'easy' ? DEFAULT_EASE + 0.15 : DEFAULT_EASE;
    const interval = first[grade];
    return {
      due: addDays(today, interval),
      interval,
      ease,
      reps: grade === 'again' ? 0 : 1,
      lapses: grade === 'again' ? 1 : 0,
      lastReviewed: today,
    };
  }

  let { ease, interval, reps, lapses } = prev;
  switch (grade) {
    case 'again':
      ease = Math.max(MIN_EASE, ease - 0.2);
      interval = first.again;
      reps = 0;
      lapses += 1;
      break;
    case 'hard':
      ease = Math.max(MIN_EASE, ease - 0.15);
      interval = Math.max(interval + 1, Math.round(interval * 1.2));
      reps += 1;
      break;
    case 'good':
      interval = Math.max(interval + 1, Math.round(interval * ease));
      reps += 1;
      break;
    case 'easy':
      ease += 0.15;
      interval = Math.max(interval + 1, Math.round(interval * ease * 1.3));
      reps += 1;
      break;
  }
  interval = Math.min(MAX_INTERVAL, interval);
  return { due: addDays(today, interval), interval, ease, reps, lapses, lastReviewed: today };
}

export function formatInterval(days: number): string {
  if (days <= 1) return '1 day';
  if (days < 30) return `${days} days`;
  if (days < 365) {
    const months = Math.round(days / 30);
    return `${months} ${months === 1 ? 'month' : 'months'}`;
  }
  return '1 year';
}

// ---------- Topic (subtopic) ratings ----------

const LEGACY_INTERVAL: Record<string, number> = { RED: 2, YELLOW: 5, GREEN: 14 };

export function subTopicReviewState(sub: SubTopic): ReviewState | undefined {
  if (sub.review) return sub.review;
  if (sub.confidenceStatus === 'NONE' || !sub.nextReviewDate) return undefined;
  return {
    due: isoToLocalDay(sub.nextReviewDate),
    interval: LEGACY_INTERVAL[sub.confidenceStatus] ?? 2,
    ease: DEFAULT_EASE,
    reps: sub.confidenceStatus === 'RED' ? 0 : 1,
    lapses: 0,
  };
}

export function levelToGrade(level: Level): Grade {
  return level === 'RED' ? 'again' : level === 'YELLOW' ? 'hard' : 'good';
}

/**
 * The state a new rating should build on. Re-rating on the same day replaces
 * that day's rating (a change of mind) instead of stacking on top of it.
 */
export function subTopicGradeBase(sub: SubTopic, today: string): ReviewState | undefined {
  const current = subTopicReviewState(sub);
  if (current?.lastReviewed === today && sub.reviewBefore !== undefined) {
    return sub.reviewBefore ?? undefined;
  }
  return current;
}

/** Days until the next review for each rating, for button labels. */
export function previewLevels(sub: SubTopic, today: string): Record<Level, number> {
  const base = subTopicGradeBase(sub, today);
  return {
    RED: schedule(base, 'again', today).interval,
    YELLOW: schedule(base, 'hard', today).interval,
    GREEN: schedule(base, 'good', today).interval,
  };
}

/** Returns a copy of the subtopic rated at `level`, rescheduled. */
export function applySubTopicLevel(sub: SubTopic, level: Level, today: string): SubTopic {
  const base = subTopicGradeBase(sub, today);
  const review = schedule(base, levelToGrade(level), today);
  return {
    ...sub,
    review,
    reviewBefore: base ?? null,
    confidenceStatus: level,
    nextReviewDate: localDayToIso(review.due),
  };
}

/** A topic is in the review rotation once it has been rated. */
export function isInRotation(sub: SubTopic): boolean {
  return sub.confidenceStatus !== 'NONE' && !!sub.nextReviewDate && !sub.completed;
}

// ---------- Combining flashcard ratings into one topic rating ----------

const RATING_SCORE: Record<CardRating, number> = { hard: 0, medium: 1, easy: 2 };
// Cards you got wrong count 1.5x, so a few misses pull the topic back sooner than a plain average would.
const RATING_WEIGHT: Record<CardRating, number> = { hard: 1.5, medium: 1, easy: 1 };

/** Weighted average of card ratings → topic level. Returns null for no ratings. */
export function combineCardRatings(ratings: CardRating[]): { level: Level; score: number } | null {
  if (ratings.length === 0) return null;
  let total = 0;
  let weights = 0;
  for (const r of ratings) {
    total += RATING_SCORE[r] * RATING_WEIGHT[r];
    weights += RATING_WEIGHT[r];
  }
  const score = total / weights; // 0 (all hard) .. 2 (all easy)
  const level: Level = score < 2 / 3 ? 'RED' : score < 4 / 3 ? 'YELLOW' : 'GREEN';
  return { level, score };
}

/** Cards reviewed for a topic: its flashcards plus answered SQ3R questions. */
export function topicReviewCards(sub: SubTopic): Flashcard[] {
  const cards: Flashcard[] = [...(sub.flashcards || [])];
  for (const { q, a } of sub.sq3r?.questions || []) {
    if (q.trim() && a.trim()) cards.push({ front: q.trim(), back: a.trim() });
  }
  return cards;
}

// ---------- Review queue ----------

export interface TopicRef {
  topicDbId: number;
  record: TopicRecord;
  sub: SubTopic;
  due: string;
}

/** Rated topics, with their due day. */
export function rotationTopics(topics: TopicRecord[]): TopicRef[] {
  const out: TopicRef[] = [];
  for (const record of topics) {
    if (record.id == null) continue;
    for (const sub of record.subTopics || []) {
      if (!isInRotation(sub)) continue;
      const state = subTopicReviewState(sub);
      if (state) out.push({ topicDbId: record.id, record, sub, due: state.due });
    }
  }
  return out.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
}

export function dueTopics(topics: TopicRecord[], today: string): TopicRef[] {
  return rotationTopics(topics).filter(t => t.due <= today);
}

export function findTopic(topics: TopicRecord[], subTopicId: string): TopicRef | null {
  for (const record of topics) {
    const sub = record.subTopics?.find(s => s.subTopicId === subTopicId);
    if (sub && record.id != null) {
      const state = subTopicReviewState(sub);
      return { topicDbId: record.id, record, sub, due: state?.due ?? '' };
    }
  }
  return null;
}

// ---------- Topic progress (SQ3R) ----------

export const SQ3R_STEPS = ['Survey', 'Question', 'Read', 'Recite', 'Review'] as const;

/** Which SQ3R steps are done, in order. Review = topic has been rated. */
export function sq3rStepsDone(sub: SubTopic): boolean[] {
  const s = sub.sq3r;
  return [
    !!s?.surveyDone,
    (s?.questions || []).some(x => x.q.trim()),
    !!s?.readDone,
    !!s?.reciteDone,
    sub.confidenceStatus !== 'NONE',
  ];
}

/** 0..1, one fifth per SQ3R step. */
export function topicProgress(sub: SubTopic): number {
  return sq3rStepsDone(sub).filter(Boolean).length / SQ3R_STEPS.length;
}

export function courseProgress(topics: TopicRecord[], courseId: string): { pct: number; done: number; total: number } {
  const subs = topics.filter(t => t.courseId === courseId).flatMap(t => t.subTopics || []);
  if (subs.length === 0) return { pct: 0, done: 0, total: 0 };
  const sum = subs.reduce((acc, s) => acc + topicProgress(s), 0);
  return {
    pct: Math.round((sum / subs.length) * 100),
    done: subs.filter(s => s.confidenceStatus !== 'NONE').length,
    total: subs.length,
  };
}

// ---------- Calendar ----------

export function occursOn(ev: CalendarEvent, day: string): boolean {
  if (ev.date === day) return true;
  if (!ev.repeatWeekly || day < ev.date) return false;
  if (ev.repeatUntil && day > ev.repeatUntil) return false;
  return daysBetween(ev.date, day) % 7 === 0;
}

export function eventsOn(events: CalendarEvent[], day: string): CalendarEvent[] {
  return events
    .filter(ev => occursOn(ev, day))
    .sort((a, b) => (a.start || '') < (b.start || '') ? -1 : (a.start || '') > (b.start || '') ? 1 : 0);
}

/** Tags whose entries appear in "What are we doing today?". */
export function isPriorityTag(tag: CalendarEvent['tag']): boolean {
  return tag === 'study' || tag === 'priority';
}

export function formatTime(hhmm?: string): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, '0')}${suffix}` : `${h12}${suffix}`;
}
