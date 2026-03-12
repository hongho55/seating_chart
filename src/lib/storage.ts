import { normalizeAppData } from './backupParser';
import { createEmptyBasePlan } from './basePlanState';
import { createId } from './ids';
import { createPresetLayout } from './layouts';
import type { AppData, Classroom } from '../types';

const STORAGE_KEY = 'seating-chart.app.v1';

function now(): string {
  return new Date().toISOString();
}

export function createEmptyClassroom(input?: {
  grade?: string;
  className?: string;
  subjectRoomName?: string;
}): Classroom {
  const layout = createPresetLayout({
    preset: 'group6',
    rows: 2,
    cols: 2,
    variant: 'group6-2x3',
  });
  const layoutConfig = {
    preset: 'group6',
    rows: 2,
    cols: 2,
    variant: 'group6-2x3',
  } as const;

  return {
    id: createId('class'),
    grade: input?.grade?.trim() || '5학년',
    className: input?.className?.trim() || '1반',
    subjectRoomName: input?.subjectRoomName?.trim() || '과학실',
    students: [],
    seats: layout.seats,
    groups: layout.groups,
    layoutConfig,
    basePlan: createEmptyBasePlan({
      seats: layout.seats,
      groups: layout.groups,
      layoutConfig,
    }),
    hasSavedBasePlan: false,
    rules: [],
    snapshots: [],
    boardLabel: '칠판',
    randomSettings: {
      genderMode: 'random',
    },
    lastViewMode: 'teacher',
    updatedAt: now(),
  };
}

export function createDefaultData(): AppData {
  const initialClassroom = createEmptyClassroom();

  return {
    version: 1,
    classrooms: [initialClassroom],
    activeClassroomId: initialClassroom.id,
    recentPrintMode: 'teacher',
  };
}

export function loadAppData(): AppData {
  if (typeof window === 'undefined') {
    return createDefaultData();
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return createDefaultData();
  }

  try {
    const normalized = normalizeAppData(JSON.parse(raw));
    return normalized.ok ? normalized.value : createDefaultData();
  } catch {
    return createDefaultData();
  }
}

export function saveAppData(data: AppData): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export type { BackupParseResult } from './backupParser';
export { createBackupFile, parseBackupFile } from './backupParser';
