import { createEmptyBasePlan } from './basePlanState';
import { sanitizeClassroomStudentAssignments } from './classroomState';
import { cloneGroups, cloneSeats, getDefaultVariant } from './layouts';
import { hasAssignedSeatAssignments } from './seatAssignments';
import type {
  AppData,
  BasePlan,
  BoardLayoutMode,
  Classroom,
  ConflictRule,
  DeskVariant,
  Gender,
  GenderMode,
  LayoutPresetConfig,
  LayoutSnapshot,
  Seat,
  SeatGroup,
  SeatPreset,
  Student,
  ViewMode,
} from '../types';

const BACKUP_FORMAT = 'seating-chart-backup';

interface AppBackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  appData: AppData;
}

export interface BackupParseResult {
  data: AppData | null;
  error: string | null;
}

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const VALID_GENDERS: Gender[] = ['male', 'female', 'unknown'];
const VALID_PRESETS: SeatPreset[] = ['single', 'pair', 'group4', 'group6'];
const VALID_VARIANTS: DeskVariant[] = [
  'single',
  'pair-horizontal',
  'pair-vertical',
  'group4-2x2',
  'group4-1x4',
  'group4-4x1',
  'group6-2x3',
  'group6-3x2',
  'group6-u',
];
const VALID_VIEW_MODES: ViewMode[] = ['teacher', 'student'];
const VALID_BOARD_LAYOUT_MODES: BoardLayoutMode[] = ['classic', 'tv'];
const VALID_GENDER_MODES: GenderMode[] = ['random', 'same', 'mixed'];

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return isString(value) && allowed.includes(value as T);
}

function parseArray<T>(
  value: unknown,
  label: string,
  itemParser: (entry: unknown, index: number) => ParseResult<T>,
  options?: { optional?: boolean },
): ParseResult<T[]> {
  if (value == null && options?.optional) {
    return { ok: true, value: [] };
  }

  if (!Array.isArray(value)) {
    return { ok: false, error: `${label} 항목이 배열이 아닙니다.` };
  }

  const items: T[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const result = itemParser(value[index], index);

    if (!result.ok) {
      return result;
    }

    items.push(result.value);
  }

  return { ok: true, value: items };
}

function parseStudent(value: unknown, index: number): ParseResult<Student> {
  if (!isRecord(value)) {
    return { ok: false, error: `classrooms[].students[${index}] 항목이 객체가 아닙니다.` };
  }

  if (!isString(value.id) || !isString(value.name) || !isString(value.number)) {
    return { ok: false, error: `classrooms[].students[${index}] 기본 필드 형식이 잘못되었습니다.` };
  }

  if (
    !isOneOf(value.gender, VALID_GENDERS) ||
    typeof value.absent !== 'boolean' ||
    !isString(value.note)
  ) {
    return { ok: false, error: `classrooms[].students[${index}] 학생 정보 형식이 잘못되었습니다.` };
  }

  return {
    ok: true,
    value: {
      id: value.id,
      name: value.name,
      number: value.number,
      gender: value.gender,
      absent: value.absent,
      note: value.note,
    },
  };
}

function parseSeat(value: unknown, index: number): ParseResult<Seat> {
  return parseSeatAtPath(value, `classrooms[].seats[${index}]`);
}

function parseSeatAtPath(value: unknown, label: string): ParseResult<Seat> {
  if (!isRecord(value)) {
    return { ok: false, error: `${label} 항목이 객체가 아닙니다.` };
  }

  if (
    !isString(value.id) ||
    !isFiniteNumber(value.x) ||
    !isFiniteNumber(value.y) ||
    !isString(value.label) ||
    !isOneOf(value.preset, VALID_PRESETS) ||
    (value.groupId !== null && !isString(value.groupId)) ||
    (value.assignedStudentId !== null && !isString(value.assignedStudentId)) ||
    typeof value.fixed !== 'boolean'
  ) {
    return { ok: false, error: `${label} 좌석 정보 형식이 잘못되었습니다.` };
  }

  return {
    ok: true,
    value: {
      id: value.id,
      x: value.x,
      y: value.y,
      label: value.label,
      preset: value.preset,
      groupId: value.groupId,
      assignedStudentId: value.assignedStudentId,
      fixed: value.fixed,
    },
  };
}

function parseSeatGroup(value: unknown, index: number): ParseResult<SeatGroup> {
  return parseSeatGroupAtPath(value, `classrooms[].groups[${index}]`);
}

function parseSeatGroupAtPath(value: unknown, label: string): ParseResult<SeatGroup> {
  if (!isRecord(value)) {
    return { ok: false, error: `${label} 항목이 객체가 아닙니다.` };
  }

  if (
    !isString(value.id) ||
    !isString(value.label) ||
    !isOneOf(value.preset, VALID_PRESETS) ||
    !isOneOf(value.variant, VALID_VARIANTS) ||
    !isString(value.color)
  ) {
    return { ok: false, error: `${label} 모둠 정보 형식이 잘못되었습니다.` };
  }

  const seatIds = parseArray(value.seatIds, `${label}.seatIds`, (entry) =>
    isString(entry)
      ? { ok: true, value: entry }
      : { ok: false, error: `${label}.seatIds에는 문자열만 들어갈 수 있습니다.` },
  );

  if (!seatIds.ok) {
    return seatIds;
  }

  return {
    ok: true,
    value: {
      id: value.id,
      label: value.label,
      preset: value.preset,
      variant: value.variant,
      color: value.color,
      seatIds: seatIds.value,
    },
  };
}

function parseConflictRule(value: unknown, index: number): ParseResult<ConflictRule> {
  if (!isRecord(value)) {
    return { ok: false, error: `classrooms[].rules[${index}] 항목이 객체가 아닙니다.` };
  }

  if (!isString(value.id) || !isString(value.studentAId) || !isString(value.studentBId)) {
    return { ok: false, error: `classrooms[].rules[${index}] 규칙 정보 형식이 잘못되었습니다.` };
  }

  return {
    ok: true,
    value: {
      id: value.id,
      studentAId: value.studentAId,
      studentBId: value.studentBId,
    },
  };
}

function parseLayoutConfig(
  value: unknown,
  fallback: Pick<Classroom, 'groups' | 'seats'>,
  label: string,
): ParseResult<LayoutPresetConfig> {
  if (value == null) {
    return { ok: true, value: inferLayoutConfig(fallback) };
  }

  if (!isRecord(value)) {
    return { ok: false, error: `${label} 항목이 객체가 아닙니다.` };
  }

  if (
    !isOneOf(value.preset, VALID_PRESETS) ||
    !isOneOf(value.variant, VALID_VARIANTS) ||
    !isFiniteNumber(value.rows) ||
    !isFiniteNumber(value.cols) ||
    value.rows < 1 ||
    value.cols < 1
  ) {
    return { ok: false, error: `${label} 레이아웃 형식이 잘못되었습니다.` };
  }

  return {
    ok: true,
    value: {
      preset: value.preset,
      variant: value.variant,
      rows: Math.max(1, Math.round(value.rows)),
      cols: Math.max(1, Math.round(value.cols)),
    },
  };
}

function parseSnapshot(value: unknown, index: number): ParseResult<LayoutSnapshot> {
  if (!isRecord(value)) {
    return { ok: false, error: `classrooms[].snapshots[${index}] 항목이 객체가 아닙니다.` };
  }

  if (!isString(value.id) || !isString(value.name) || !isString(value.createdAt)) {
    return { ok: false, error: `classrooms[].snapshots[${index}] 저장본 정보 형식이 잘못되었습니다.` };
  }

  const seats = parseArray(value.seats, `classrooms[].snapshots[${index}].seats`, parseSeat);

  if (!seats.ok) {
    return seats;
  }

  const groups = parseArray(value.groups, `classrooms[].snapshots[${index}].groups`, parseSeatGroup);

  if (!groups.ok) {
    return groups;
  }

  const layoutConfig = parseLayoutConfig(
    value.layoutConfig,
    { seats: cloneSeats(seats.value), groups: cloneGroups(groups.value) },
    `classrooms[].snapshots[${index}].layoutConfig`,
  );

  if (!layoutConfig.ok) {
    return layoutConfig;
  }

  const viewMode = value.viewMode == null ? 'teacher' : value.viewMode;

  if (!isOneOf(viewMode, VALID_VIEW_MODES)) {
    return { ok: false, error: `classrooms[].snapshots[${index}].viewMode 값이 올바르지 않습니다.` };
  }

  return {
    ok: true,
    value: {
      id: value.id,
      name: value.name,
      createdAt: value.createdAt,
      seats: cloneSeats(seats.value),
      groups: cloneGroups(groups.value),
      layoutConfig: { ...layoutConfig.value },
      viewMode,
    },
  };
}

function parseBasePlan(
  value: unknown,
  fallback: Pick<Classroom, 'seats' | 'groups' | 'layoutConfig'>,
  label: string,
): ParseResult<BasePlan> {
  if (value == null) {
    return {
      ok: true,
      value: createEmptyBasePlan(fallback),
    };
  }

  if (!isRecord(value)) {
    return { ok: false, error: `${label} 항목이 객체가 아닙니다.` };
  }

  const seats = parseArray(value.seats, `${label}.seats`, (entry, seatIndex) =>
    parseSeatAtPath(entry, `${label}.seats[${seatIndex}]`),
  );

  if (!seats.ok) {
    return seats;
  }

  const groups = parseArray(value.groups, `${label}.groups`, (entry, groupIndex) =>
    parseSeatGroupAtPath(entry, `${label}.groups[${groupIndex}]`),
  );

  if (!groups.ok) {
    return groups;
  }

  const layoutConfig = parseLayoutConfig(
    value.layoutConfig,
    { seats: cloneSeats(seats.value), groups: cloneGroups(groups.value) },
    `${label}.layoutConfig`,
  );

  if (!layoutConfig.ok) {
    return layoutConfig;
  }

  return {
    ok: true,
    value: {
      seats: cloneSeats(seats.value),
      groups: cloneGroups(groups.value),
      layoutConfig: { ...layoutConfig.value },
    },
  };
}

function inferHasSavedBasePlan(
  rawClassroom: Record<string, unknown>,
  basePlan: BasePlan,
): boolean {
  if (isBoolean(rawClassroom.hasSavedBasePlan)) {
    return rawClassroom.hasSavedBasePlan;
  }

  return hasAssignedSeatAssignments(basePlan.seats);
}

function parseClassroom(value: unknown, index: number): ParseResult<Classroom> {
  if (!isRecord(value)) {
    return { ok: false, error: `classrooms[${index}] 항목이 객체가 아닙니다.` };
  }

  if (
    !isString(value.id) ||
    !isString(value.grade) ||
    !isString(value.className) ||
    !isString(value.subjectRoomName) ||
    !isString(value.updatedAt)
  ) {
    return { ok: false, error: `classrooms[${index}] 반 정보 형식이 잘못되었습니다.` };
  }

  const students = parseArray(value.students, `classrooms[${index}].students`, parseStudent);

  if (!students.ok) {
    return students;
  }

  const seats = parseArray(value.seats, `classrooms[${index}].seats`, parseSeat);

  if (!seats.ok) {
    return seats;
  }

  const groups = parseArray(value.groups, `classrooms[${index}].groups`, parseSeatGroup);

  if (!groups.ok) {
    return groups;
  }

  const rules = parseArray(value.rules, `classrooms[${index}].rules`, parseConflictRule, {
    optional: true,
  });

  if (!rules.ok) {
    return rules;
  }

  const snapshots = parseArray(value.snapshots, `classrooms[${index}].snapshots`, parseSnapshot, {
    optional: true,
  });

  if (!snapshots.ok) {
    return snapshots;
  }

  const layoutConfig = parseLayoutConfig(
    value.layoutConfig,
    { seats: cloneSeats(seats.value), groups: cloneGroups(groups.value) },
    `classrooms[${index}].layoutConfig`,
  );

  if (!layoutConfig.ok) {
    return layoutConfig;
  }

  const basePlan = parseBasePlan(
    value.basePlan,
    {
      seats: cloneSeats(seats.value),
      groups: cloneGroups(groups.value),
      layoutConfig: { ...layoutConfig.value },
    },
    `classrooms[${index}].basePlan`,
  );

  if (!basePlan.ok) {
    return basePlan;
  }

  const boardLabel = value.boardLabel == null ? '칠판' : value.boardLabel;
  const boardLayoutMode =
    value.boardLayoutMode == null ? 'classic' : value.boardLayoutMode;
  const lastViewMode = value.lastViewMode == null ? 'teacher' : value.lastViewMode;
  const randomSettings = value.randomSettings == null ? { genderMode: 'random' } : value.randomSettings;
  const hasSavedBasePlan = inferHasSavedBasePlan(value, basePlan.value);

  if (!isString(boardLabel)) {
    return { ok: false, error: `classrooms[${index}].boardLabel은 문자열이어야 합니다.` };
  }

  if (!isOneOf(boardLayoutMode, VALID_BOARD_LAYOUT_MODES)) {
    return { ok: false, error: `classrooms[${index}].boardLayoutMode 값이 올바르지 않습니다.` };
  }

  if (!isOneOf(lastViewMode, VALID_VIEW_MODES)) {
    return { ok: false, error: `classrooms[${index}].lastViewMode 값이 올바르지 않습니다.` };
  }

  if (!isRecord(randomSettings) || !isOneOf(randomSettings.genderMode, VALID_GENDER_MODES)) {
    return { ok: false, error: `classrooms[${index}].randomSettings.genderMode 값이 올바르지 않습니다.` };
  }

  return {
    ok: true,
    value: sanitizeClassroomStudentAssignments({
      id: value.id,
      grade: value.grade,
      className: value.className,
      subjectRoomName: value.subjectRoomName,
      students: students.value,
      seats: cloneSeats(seats.value),
      groups: cloneGroups(groups.value),
      layoutConfig: { ...layoutConfig.value },
      basePlan: hasSavedBasePlan ? basePlan.value : createEmptyBasePlan(basePlan.value),
      hasSavedBasePlan,
      rules: rules.value,
      snapshots: snapshots.value,
      boardLabel,
      boardLayoutMode,
      randomSettings: {
        genderMode: randomSettings.genderMode,
      },
      lastViewMode,
      updatedAt: value.updatedAt,
    }),
  };
}

export function normalizeAppData(input: unknown) {
  if (!isRecord(input)) {
    return { ok: false, error: '백업 데이터 최상위 형식이 객체가 아닙니다.' } as const;
  }

  const classrooms = parseArray(input.classrooms, 'classrooms', parseClassroom);

  if (!classrooms.ok) {
    return classrooms;
  }

  const activeClassroomId =
    isString(input.activeClassroomId) && classrooms.value.some((classroom) => classroom.id === input.activeClassroomId)
      ? input.activeClassroomId
      : classrooms.value[0]?.id ?? null;

  const recentPrintMode = input.recentPrintMode == null ? 'teacher' : input.recentPrintMode;

  if (!isOneOf(recentPrintMode, VALID_VIEW_MODES)) {
    return { ok: false, error: 'recentPrintMode 값이 올바르지 않습니다.' } as const;
  }

  if (input.version != null && !isFiniteNumber(input.version)) {
    return { ok: false, error: 'version은 숫자여야 합니다.' } as const;
  }

  return {
    ok: true,
    value: {
      version: input.version ?? 1,
      classrooms: classrooms.value,
      activeClassroomId,
      recentPrintMode,
    },
  } as const;
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

export function parseBackupFile(raw: string): BackupParseResult {
  try {
    const parsed = JSON.parse(raw) as Partial<AppBackupFile> | AppData;

    if (isRecord(parsed) && 'format' in parsed) {
      if (parsed.format !== BACKUP_FORMAT) {
        return { data: null, error: '지원하지 않는 백업 형식입니다.' };
      }

      if (!('appData' in parsed)) {
        return { data: null, error: '백업 파일에 appData가 없습니다.' };
      }

      const normalized = normalizeAppData(parsed.appData);
      return normalized.ok ? { data: normalized.value, error: null } : { data: null, error: normalized.error };
    }

    const normalized = normalizeAppData(parsed);
    return normalized.ok ? { data: normalized.value, error: null } : { data: null, error: normalized.error };
  } catch {
    return { data: null, error: '백업 파일이 올바른 JSON 형식이 아닙니다.' };
  }
}
