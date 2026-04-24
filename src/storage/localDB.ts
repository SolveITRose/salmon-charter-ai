import * as SQLite from 'expo-sqlite';
import { CatchEvent } from '../models/Event';
import { TripConditions } from '../services/weatherWaterService';

const DB_NAME = 'salmon_charter.db';
let db: SQLite.SQLiteDatabase | null = null;

/**
 * Open and initialize the SQLite database.
 * Creates the catch_events table if it does not exist.
 */
export async function initDB(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;

  try {
    db = await SQLite.openDatabaseAsync(DB_NAME);

    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS catch_events (
        id TEXT PRIMARY KEY NOT NULL,
        event_code TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        data TEXT NOT NULL,
        synced INTEGER NOT NULL DEFAULT 0,
        synced_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_catch_events_event_code
        ON catch_events (event_code);

      CREATE INDEX IF NOT EXISTS idx_catch_events_timestamp
        ON catch_events (timestamp DESC);

      CREATE INDEX IF NOT EXISTS idx_catch_events_synced
        ON catch_events (synced);

      CREATE TABLE IF NOT EXISTS trip_conditions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trip_id TEXT,
        lake_id TEXT,
        fetched_at TEXT,
        conditions_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('[DB] Initialized successfully');
    return db;
  } catch (error) {
    console.error('[DB] initDB failed:', error);
    throw error;
  }
}

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    return await initDB();
  }
  return db;
}

// ─── CRUD Operations ─────────────────────────────────────────────────────────

/**
 * Insert a new CatchEvent into local SQLite.
 */
export async function insertEvent(event: CatchEvent): Promise<void> {
  const database = await getDB();
  await database.runAsync(
    `INSERT OR REPLACE INTO catch_events
       (id, event_code, timestamp, data, synced, synced_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      event.id,
      event.eventCode,
      event.timestamp,
      JSON.stringify(event),
      event.synced ? 1 : 0,
      event.syncedAt ?? null,
    ]
  );
}

/**
 * Retrieve a single CatchEvent by id.
 */
export async function getEventById(id: string): Promise<CatchEvent | null> {
  const database = await getDB();
  const row = await database.getFirstAsync<{ data: string }>(
    'SELECT data FROM catch_events WHERE id = ?',
    [id]
  );
  if (!row) return null;
  try {
    return JSON.parse(row.data) as CatchEvent;
  } catch {
    return null;
  }
}

/**
 * Retrieve a single CatchEvent by event code.
 */
export async function getEventByCode(
  eventCode: string
): Promise<CatchEvent | null> {
  const database = await getDB();
  const row = await database.getFirstAsync<{ data: string }>(
    'SELECT data FROM catch_events WHERE event_code = ? ORDER BY timestamp DESC LIMIT 1',
    [eventCode]
  );
  if (!row) return null;
  try {
    return JSON.parse(row.data) as CatchEvent;
  } catch {
    return null;
  }
}

/**
 * Retrieve all CatchEvents sorted by timestamp descending.
 */
export async function getAllEvents(): Promise<CatchEvent[]> {
  const database = await getDB();
  const rows = await database.getAllAsync<{ data: string }>(
    'SELECT data FROM catch_events ORDER BY timestamp DESC'
  );
  return rows
    .map((r) => {
      try {
        return JSON.parse(r.data) as CatchEvent;
      } catch {
        return null;
      }
    })
    .filter((e): e is CatchEvent => e !== null);
}

/**
 * Retrieve all CatchEvents for a given event code.
 */
export async function getEventsByCode(
  eventCode: string
): Promise<CatchEvent[]> {
  const database = await getDB();
  const rows = await database.getAllAsync<{ data: string }>(
    'SELECT data FROM catch_events WHERE event_code = ? ORDER BY timestamp DESC',
    [eventCode]
  );
  return rows
    .map((r) => {
      try {
        return JSON.parse(r.data) as CatchEvent;
      } catch {
        return null;
      }
    })
    .filter((e): e is CatchEvent => e !== null);
}

/**
 * Update an existing CatchEvent.
 */
export async function updateEvent(event: CatchEvent): Promise<void> {
  const database = await getDB();
  await database.runAsync(
    `UPDATE catch_events
     SET event_code = ?, timestamp = ?, data = ?, synced = ?, synced_at = ?
     WHERE id = ?`,
    [
      event.eventCode,
      event.timestamp,
      JSON.stringify(event),
      event.synced ? 1 : 0,
      event.syncedAt ?? null,
      event.id,
    ]
  );
}

/**
 * Get all events that have not been synced to Supabase.
 */
export async function getUnsyncedEvents(): Promise<CatchEvent[]> {
  const database = await getDB();
  const rows = await database.getAllAsync<{ data: string }>(
    'SELECT data FROM catch_events WHERE synced = 0 ORDER BY timestamp ASC'
  );
  return rows
    .map((r) => {
      try {
        return JSON.parse(r.data) as CatchEvent;
      } catch {
        return null;
      }
    })
    .filter((e): e is CatchEvent => e !== null);
}

/**
 * Mark an event as synced.
 */
export async function markSynced(
  id: string,
  syncedAt?: string
): Promise<void> {
  const database = await getDB();
  const at = syncedAt || new Date().toISOString();

  // Update JSON blob too
  const row = await database.getFirstAsync<{ data: string }>(
    'SELECT data FROM catch_events WHERE id = ?',
    [id]
  );
  if (row) {
    try {
      const event = JSON.parse(row.data) as CatchEvent;
      event.synced = true;
      event.syncedAt = at;
      await database.runAsync(
        'UPDATE catch_events SET synced = 1, synced_at = ?, data = ? WHERE id = ?',
        [at, JSON.stringify(event), id]
      );
    } catch {
      await database.runAsync(
        'UPDATE catch_events SET synced = 1, synced_at = ? WHERE id = ?',
        [at, id]
      );
    }
  }
}

/**
 * Returns all events with status 'bite' (hooked but not yet photographed), newest first.
 */
export async function getPendingBiteEvents(): Promise<CatchEvent[]> {
  const all = await getAllEvents();
  return all.filter((e) => e.status === 'bite');
}

/**
 * Delete an event by id.
 */
export async function deleteEvent(id: string): Promise<void> {
  const database = await getDB();
  await database.runAsync('DELETE FROM catch_events WHERE id = ?', [id]);
}

/**
 * Get count of all events.
 */
export async function getEventCount(): Promise<number> {
  const database = await getDB();
  const row = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM catch_events'
  );
  return row?.count ?? 0;
}

/**
 * Persist a full TripConditions snapshot for a given trip/session.
 */
export async function saveTripConditions(
  tripId: string,
  conditions: TripConditions,
): Promise<void> {
  const database = await getDB();
  await database.runAsync(
    `INSERT INTO trip_conditions (trip_id, lake_id, fetched_at, conditions_json)
     VALUES (?, ?, ?, ?)`,
    [tripId, conditions.lake_id, conditions.fetched_at, JSON.stringify(conditions)],
  );
}
