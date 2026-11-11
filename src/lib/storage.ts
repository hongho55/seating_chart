import { normalizeAppData } from './backupParser';
import { createEmptyBasePlan } from './basePlanState';
import { createId } from './ids';
import { createPresetLayout } from './layouts';
import type { AppData, Classroom } from '../types';

const STORAGE_KEY = 'seating-chart.app.v1';
const SHOW_SEAT_PIN_BUTTONS_KEY = 'seating-chart.ui.show-seat-pin-buttons.v1';

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
    boardLayoutMode: 'classic',
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

export interface AppDataLoadResult {
  data: AppData;
  error: string | null;
}

export function loadAppData(): AppDataLoadResult {
  if (typeof window === 'undefined') {
    return { data: createDefaultData(), error: null };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return { data: createDefaultData(), error: null };
    }
    const normalized = normalizeAppData(JSON.parse(raw));
    if (normalized.ok) {
      return { data: normalized.value, error: null };
    }
  } catch {
    // A blocked read or invalid saved value is not a new, empty installation.
  }

  return {
    data: createDefaultData(),
    error: '저장된 좌석표를 읽지 못해 자동 저장을 중지했습니다. 기존 저장본은 덮어쓰지 않습니다.',
  };
}

export function saveAppData(data: AppData): string | null {
  if (typeof window === 'undefined') {
    return '브라우저 저장소를 사용할 수 없습니다.';
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return null;
  } catch {
    return '좌석표를 저장하지 못했습니다. 저장 공간과 브라우저 권한을 확인하고 현재 화면을 백업해 주세요.';
  }
}

export function loadShowSeatPinButtons(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem(SHOW_SEAT_PIN_BUTTONS_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveShowSeatPinButtons(value: boolean): string | null {
  if (typeof window === 'undefined') {
    return '브라우저 저장소를 사용할 수 없습니다.';
  }

  try {
    window.localStorage.setItem(SHOW_SEAT_PIN_BUTTONS_KEY, value ? 'true' : 'false');
    return null;
  } catch {
    return '좌석 고정 버튼 표시 설정을 저장하지 못했습니다.';
  }
}

export type { BackupParseResult } from './backupParser';
export { createBackupFile, parseBackupFile } from './backupParser';
