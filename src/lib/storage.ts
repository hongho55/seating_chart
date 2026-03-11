import { createId } from './ids';
import { cloneGroups, cloneSeats, createPresetLayout, getDefaultVariant } from './layouts';
import type { AppData, Classroom, LayoutPresetConfig, ViewMode } from '../types';

const STORAGE_KEY = 'seating-chart.app.v1';
const BACKUP_FORMAT = 'seating-chart-backup';

interface AppBackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  appData: AppData;
}

function now(): string {
  return new Date().toISOString();
}

function bucketize(values: number[]): number[] {
  const sorted = [...values].sort((left, right) => left - right);
  const buckets: number[] = [];

  sorted.forEach((value) => {
    if (buckets.length === 0 || Math.abs(value - buckets[buckets.length - 1]) > 40) {
      buckets.push(value);
    }
  });

  return buckets;
}

function inferLayoutConfig(input: Pick<Classroom, 'groups' | 'seats'>): LayoutPresetConfig {
  if (input.groups.length > 0) {
    const firstGroup = input.groups[0];
    const positions = input.groups
      .map((group) => {
        const groupSeats = input.seats.filter((seat) => group.seatIds.includes(seat.id));

        if (groupSeats.length === 0) {
          return null;
        }

        return {
          x: Math.min(...groupSeats.map((seat) => seat.x)),
          y: Math.min(...groupSeats.map((seat) => seat.y)),
        };
      })
      .filter((position): position is { x: number; y: number } => Boolean(position));

    return {
      preset: firstGroup.preset,
      variant: firstGroup.variant ?? getDefaultVariant(firstGroup.preset),
      rows: Math.max(1, bucketize(positions.map((position) => position.y)).length),
      cols: Math.max(1, bucketize(positions.map((position) => position.x)).length),
    };
  }

  return {
    preset: 'single',
    variant: 'single',
    rows: 1,
    cols: Math.max(1, input.seats.length),
  };
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

  return {
    id: createId('class'),
    grade: input?.grade?.trim() || '5학년',
    className: input?.className?.trim() || '1반',
    subjectRoomName: input?.subjectRoomName?.trim() || '과학실',
    students: [],
    seats: layout.seats,
    groups: layout.groups,
    layoutConfig: {
      preset: 'group6',
      rows: 2,
      cols: 2,
      variant: 'group6-2x3',
    },
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

function normalizeAppData(input: unknown): AppData | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const parsed = input as Partial<AppData>;

  if (!Array.isArray(parsed.classrooms)) {
    return null;
  }

  const classrooms = parsed.classrooms.map((classroom) => ({
    ...classroom,
    seats: cloneSeats(classroom.seats ?? []),
    groups: cloneGroups(classroom.groups ?? []),
    layoutConfig:
      classroom.layoutConfig ??
      inferLayoutConfig({
        groups: cloneGroups(classroom.groups ?? []),
        seats: cloneSeats(classroom.seats ?? []),
      }),
    snapshots: (classroom.snapshots ?? []).map((snapshot) => ({
      ...snapshot,
      seats: cloneSeats(snapshot.seats ?? []),
      groups: cloneGroups(snapshot.groups ?? []),
      layoutConfig:
        snapshot.layoutConfig ??
        inferLayoutConfig({
          groups: cloneGroups(snapshot.groups ?? []),
          seats: cloneSeats(snapshot.seats ?? []),
        }),
    })),
  }));

  const activeClassroomId =
    classrooms.some((classroom) => classroom.id === parsed.activeClassroomId)
      ? parsed.activeClassroomId ?? null
      : classrooms[0]?.id ?? null;

  return {
    version: parsed.version ?? 1,
    classrooms,
    activeClassroomId,
    recentPrintMode: (parsed.recentPrintMode as ViewMode | undefined) ?? 'teacher',
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
    return normalized ?? createDefaultData();
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

export function createBackupFile(data: AppData): string {
  const payload: AppBackupFile = {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: now(),
    appData: data,
  };

  return JSON.stringify(payload, null, 2);
}

export function parseBackupFile(raw: string): AppData | null {
  try {
    const parsed = JSON.parse(raw) as Partial<AppBackupFile> | AppData;

    if (
      parsed &&
      typeof parsed === 'object' &&
      'format' in parsed &&
      parsed.format === BACKUP_FORMAT &&
      'appData' in parsed
    ) {
      return normalizeAppData(parsed.appData);
    }

    return normalizeAppData(parsed);
  } catch {
    return null;
  }
}
