export type Gender = 'male' | 'female' | 'unknown';

export type SeatPreset = 'single' | 'pair' | 'group4' | 'group6';

export type ViewMode = 'teacher' | 'student';
export type BoardLayoutMode = 'classic' | 'tv';
export type GenderMode = 'random' | 'same' | 'mixed';

export type DeskVariant =
  | 'single'
  | 'pair-horizontal'
  | 'pair-vertical'
  | 'group4-2x2'
  | 'group4-1x4'
  | 'group4-4x1'
  | 'group6-2x3'
  | 'group6-3x2'
  | 'group6-u';

export interface LayoutPresetConfig {
  preset: SeatPreset;
  rows: number;
  cols: number;
  variant: DeskVariant;
}

export interface Student {
  id: string;
  name: string;
  number: string;
  gender: Gender;
  absent: boolean;
  note: string;
}

export interface Seat {
  id: string;
  x: number;
  y: number;
  label: string;
  preset: SeatPreset;
  groupId: string | null;
  assignedStudentId: string | null;
  fixed: boolean;
}

export interface SeatGroup {
  id: string;
  label: string;
  preset: SeatPreset;
  variant: DeskVariant;
  color: string;
  seatIds: string[];
}

export interface ConflictRule {
  id: string;
  studentAId: string;
  studentBId: string;
}

export interface LayoutSnapshot {
  id: string;
  name: string;
  createdAt: string;
  seats: Seat[];
  groups: SeatGroup[];
  layoutConfig: LayoutPresetConfig;
  viewMode: ViewMode;
}

export interface BasePlan {
  seats: Seat[];
  groups: SeatGroup[];
  layoutConfig: LayoutPresetConfig;
}

export interface Classroom {
  id: string;
  grade: string;
  className: string;
  subjectRoomName: string;
  students: Student[];
  seats: Seat[];
  groups: SeatGroup[];
  layoutConfig: LayoutPresetConfig;
  basePlan: BasePlan;
  hasSavedBasePlan: boolean;
  rules: ConflictRule[];
  snapshots: LayoutSnapshot[];
  boardLabel: string;
  boardLayoutMode: BoardLayoutMode;
  randomSettings: {
    genderMode: GenderMode;
  };
  lastViewMode: ViewMode;
  updatedAt: string;
}

export interface AppData {
  version: number;
  classrooms: Classroom[];
  activeClassroomId: string | null;
  recentPrintMode: ViewMode;
}

export interface RandomizeResult {
  seats: Seat[];
  score: number;
  conflicts: number;
  unplacedStudents: number;
  genderMisses: number;
}
