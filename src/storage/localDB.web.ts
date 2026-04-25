import AsyncStorage from '@react-native-async-storage/async-storage';
import { CatchEvent, GpsMark } from '../models/Event';
import { TripConditions } from '../services/weatherWaterService';

const EVENTS_KEY = 'catch_events';
const CONDITIONS_KEY = 'trip_conditions';
const MARKS_KEY = 'gps_marks';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function readEvents(): Promise<CatchEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(EVENTS_KEY);
    return raw ? (JSON.parse(raw) as CatchEvent[]) : [];
  } catch {
    return [];
  }
}

async function writeEvents(events: CatchEvent[]): Promise<void> {
  await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(events));
}

// ─── No-op init (no SQLite on web) ───────────────────────────────────────────

export async function initDB(): Promise<void> {
  return;
}

// ─── CRUD Operations ─────────────────────────────────────────────────────────

export async function insertEvent(event: CatchEvent): Promise<void> {
  const events = await readEvents();
  const idx = events.findIndex((e) => e.id === event.id);
  if (idx !== -1) {
    events[idx] = event;
  } else {
    events.unshift(event);
  }
  await writeEvents(events);
}

export async function getEventById(id: string): Promise<CatchEvent | null> {
  const events = await readEvents();
  return events.find((e) => e.id === id) ?? null;
}

export async function getEventByCode(eventCode: string): Promise<CatchEvent | null> {
  const events = await readEvents();
  return events.find((e) => e.eventCode === eventCode) ?? null;
}

export async function getAllEvents(): Promise<CatchEvent[]> {
  const events = await readEvents();
  return [...events].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

export async function getEventsByCode(eventCode: string): Promise<CatchEvent[]> {
  const events = await readEvents();
  return events
    .filter((e) => e.eventCode === eventCode)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export async function updateEvent(event: CatchEvent): Promise<void> {
  await insertEvent(event);
}

export async function getUnsyncedEvents(): Promise<CatchEvent[]> {
  const events = await readEvents();
  return events.filter((e) => !e.synced);
}

export async function markSynced(id: string, syncedAt?: string): Promise<void> {
  const events = await readEvents();
  const idx = events.findIndex((e) => e.id === id);
  if (idx !== -1) {
    events[idx] = { ...events[idx], synced: true, syncedAt: syncedAt ?? new Date().toISOString() };
    await writeEvents(events);
  }
}

export async function deleteEvent(id: string): Promise<void> {
  const events = await readEvents();
  await writeEvents(events.filter((e) => e.id !== id));
}

export async function getEventCount(): Promise<number> {
  const events = await readEvents();
  return events.length;
}

export async function getPendingBiteEvents(): Promise<CatchEvent[]> {
  const events = await readEvents();
  return events.filter((e) => e.status === 'bite');
}

// ─── GPS Marks ───────────────────────────────────────────────────────────────

async function readMarks(): Promise<GpsMark[]> {
  try {
    const raw = await AsyncStorage.getItem(MARKS_KEY);
    return raw ? (JSON.parse(raw) as GpsMark[]) : [];
  } catch {
    return [];
  }
}

async function writeMarks(marks: GpsMark[]): Promise<void> {
  await AsyncStorage.setItem(MARKS_KEY, JSON.stringify(marks));
}

export async function insertMark(mark: GpsMark): Promise<void> {
  const marks = await readMarks();
  const idx = marks.findIndex((m) => m.id === mark.id);
  if (idx !== -1) {
    marks[idx] = mark;
  } else {
    marks.unshift(mark);
  }
  await writeMarks(marks);
}

export async function getAllMarks(): Promise<GpsMark[]> {
  const marks = await readMarks();
  return [...marks].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

export async function saveTripConditions(
  _tripId: string,
  conditions: TripConditions,
): Promise<void> {
  try {
    await AsyncStorage.setItem(CONDITIONS_KEY, JSON.stringify(conditions));
  } catch {
    // Non-critical — ignore storage failures
  }
}
