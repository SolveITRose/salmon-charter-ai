import { CatchEvent } from './Event';

export interface CatchLog {
  eventCode: string;
  events: CatchEvent[];
  createdAt: string;
  updatedAt: string;
  totalCatch: number;
  speciesSummary: Record<string, number>;
}

export function createCatchLog(eventCode: string): CatchLog {
  return {
    eventCode,
    events: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    totalCatch: 0,
    speciesSummary: {},
  };
}

export function addEventToLog(log: CatchLog, event: CatchEvent): CatchLog {
  const events = [...log.events, event];
  const speciesSummary = { ...log.speciesSummary };
  if (event.species) {
    speciesSummary[event.species] = (speciesSummary[event.species] || 0) + 1;
  }
  return {
    ...log,
    events,
    updatedAt: new Date().toISOString(),
    totalCatch: events.length,
    speciesSummary,
  };
}

export function getTopSpecies(log: CatchLog): string {
  let max = 0;
  let top = 'Unknown';
  for (const [species, count] of Object.entries(log.speciesSummary)) {
    if (count > max) {
      max = count;
      top = species;
    }
  }
  return top;
}
