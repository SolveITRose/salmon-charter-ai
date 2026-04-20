import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as Network from 'expo-network';
import { CatchEvent } from '../models/Event';
import { getUnsyncedEvents, markSynced } from '../storage/localDB';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabase;
}

/**
 * Check if the device has internet connectivity.
 */
export async function checkConnectivity(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return state.isConnected === true && state.isInternetReachable === true;
  } catch {
    return false;
  }
}

/**
 * Sync a single CatchEvent to Supabase.
 * Returns true on success.
 */
export async function syncEvent(event: CatchEvent): Promise<boolean> {
  try {
    const client = getSupabase();
    if (!client) return false;

    const { error } = await client.from('catch_events').upsert(
      {
        id: event.id,
        event_code: event.eventCode,
        data: event,
        created_at: event.timestamp,
        synced_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (error) {
      console.error('[Sync] syncEvent error:', error.message);
      return false;
    }

    await markSynced(event.id);
    return true;
  } catch (error) {
    console.error('[Sync] syncEvent exception:', error);
    return false;
  }
}

/**
 * Sync all events that haven't been synced yet.
 * Skips if no connectivity.
 */
export async function syncAllPending(): Promise<{
  synced: number;
  failed: number;
}> {
  const result = { synced: 0, failed: 0 };

  try {
    const connected = await checkConnectivity();
    if (!connected) {
      console.log('[Sync] No connectivity, skipping sync');
      return result;
    }

    const pending = await getUnsyncedEvents();
    if (pending.length === 0) {
      return result;
    }

    console.log(`[Sync] Syncing ${pending.length} pending events...`);

    for (const event of pending) {
      const success = await syncEvent(event);
      if (success) {
        result.synced++;
      } else {
        result.failed++;
      }
    }

    console.log(
      `[Sync] Complete: ${result.synced} synced, ${result.failed} failed`
    );
  } catch (error) {
    console.error('[Sync] syncAllPending exception:', error);
  }

  return result;
}

/**
 * Fetch all catch events from Supabase for a given event code.
 */
export async function fetchRemoteEvents(
  eventCode: string
): Promise<CatchEvent[]> {
  try {
    const connected = await checkConnectivity();
    if (!connected) return [];

    const client = getSupabase();
    if (!client) return [];
    const { data, error } = await client
      .from('catch_events')
      .select('data')
      .eq('event_code', eventCode)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Sync] fetchRemoteEvents error:', error.message);
      return [];
    }

    return (data || []).map((row) => row.data as CatchEvent);
  } catch (error) {
    console.error('[Sync] fetchRemoteEvents exception:', error);
    return [];
  }
}

/**
 * Supabase table schema (for reference / migration):
 *
 * CREATE TABLE catch_events (
 *   id UUID PRIMARY KEY,
 *   event_code TEXT NOT NULL,
 *   data JSONB NOT NULL,
 *   created_at TIMESTAMPTZ DEFAULT NOW(),
 *   synced_at TIMESTAMPTZ
 * );
 *
 * CREATE INDEX idx_catch_events_event_code ON catch_events(event_code);
 * CREATE INDEX idx_catch_events_created_at ON catch_events(created_at DESC);
 */
