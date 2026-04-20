import * as FileSystem from 'expo-file-system/legacy';
import { CatchEvent } from '../models/Event';

const EVENTS_BASE = FileSystem.documentDirectory + 'events/';

/**
 * Ensure the base events directory exists.
 */
async function ensureBaseDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(EVENTS_BASE);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(EVENTS_BASE, { intermediates: true });
  }
}

/**
 * Get the folder path for an event code.
 */
export function getEventFolderPath(eventCode: string): string {
  return EVENTS_BASE + eventCode + '/';
}

/**
 * Create the event folder for a given event code.
 */
export async function createEventFolder(eventCode: string): Promise<string> {
  await ensureBaseDir();
  const folderPath = getEventFolderPath(eventCode);
  const info = await FileSystem.getInfoAsync(folderPath);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(folderPath, { intermediates: true });
  }
  return folderPath;
}

/**
 * Copy a photo to the event's folder.
 * Returns the new local path.
 */
export async function saveEventPhoto(
  eventCode: string,
  sourceUri: string
): Promise<string> {
  const folderPath = await createEventFolder(eventCode);
  const extension = sourceUri.split('.').pop() || 'jpg';
  const timestamp = Date.now();
  const destPath = folderPath + `photo_${timestamp}.${extension}`;

  await FileSystem.copyAsync({ from: sourceUri, to: destPath });
  return destPath;
}

/**
 * Save a full JSON snapshot of the event to its folder.
 */
export async function saveEventSnapshot(event: CatchEvent): Promise<string> {
  const folderPath = await createEventFolder(event.eventCode);
  const snapshotPath = folderPath + 'event.json';
  await FileSystem.writeAsStringAsync(
    snapshotPath,
    JSON.stringify(event, null, 2),
    { encoding: FileSystem.EncodingType.UTF8 }
  );
  return snapshotPath;
}

/**
 * Load the JSON snapshot for an event code.
 * Returns null if not found.
 */
export async function loadEventSnapshot(
  eventCode: string
): Promise<CatchEvent | null> {
  const folderPath = getEventFolderPath(eventCode);
  const snapshotPath = folderPath + 'event.json';

  try {
    const info = await FileSystem.getInfoAsync(snapshotPath);
    if (!info.exists) return null;

    const json = await FileSystem.readAsStringAsync(snapshotPath, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return JSON.parse(json) as CatchEvent;
  } catch (error) {
    console.error('[EventStore] loadEventSnapshot error:', error);
    return null;
  }
}

/**
 * List all event codes that have a folder in the events directory.
 */
export async function listEventCodes(): Promise<string[]> {
  try {
    await ensureBaseDir();
    const contents = await FileSystem.readDirectoryAsync(EVENTS_BASE);
    // Filter to only directories (event codes)
    const codes: string[] = [];
    for (const name of contents) {
      const path = EVENTS_BASE + name;
      const info = await FileSystem.getInfoAsync(path);
      if (info.isDirectory) {
        codes.push(name);
      }
    }
    return codes.sort().reverse(); // newest first if event codes contain dates
  } catch (error) {
    console.error('[EventStore] listEventCodes error:', error);
    return [];
  }
}

/**
 * Delete an event folder and all its contents.
 */
export async function deleteEventFolder(eventCode: string): Promise<void> {
  const folderPath = getEventFolderPath(eventCode);
  const info = await FileSystem.getInfoAsync(folderPath);
  if (info.exists) {
    await FileSystem.deleteAsync(folderPath, { idempotent: true });
  }
}

/**
 * List all photos in an event folder.
 */
export async function listEventPhotos(eventCode: string): Promise<string[]> {
  try {
    const folderPath = getEventFolderPath(eventCode);
    const info = await FileSystem.getInfoAsync(folderPath);
    if (!info.exists) return [];

    const contents = await FileSystem.readDirectoryAsync(folderPath);
    return contents
      .filter((name) => /\.(jpg|jpeg|png|heic|heif)$/i.test(name))
      .map((name) => folderPath + name);
  } catch (error) {
    console.error('[EventStore] listEventPhotos error:', error);
    return [];
  }
}

/**
 * Save audio file to event folder.
 * Returns the new local path.
 */
export async function saveEventAudio(
  eventCode: string,
  sourceUri: string
): Promise<string> {
  const folderPath = await createEventFolder(eventCode);
  const extension = sourceUri.split('.').pop() || 'm4a';
  const timestamp = Date.now();
  const destPath = folderPath + `voice_${timestamp}.${extension}`;

  await FileSystem.copyAsync({ from: sourceUri, to: destPath });
  return destPath;
}

/**
 * Get total storage used by all events in bytes.
 */
export async function getStorageUsed(): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(EVENTS_BASE, { size: true });
    if (info.exists && 'size' in info) {
      return info.size ?? 0;
    }
    return 0;
  } catch {
    return 0;
  }
}
