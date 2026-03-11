import { createId } from './ids';
import { cloneSeats, createPresetLayout } from './layouts';
import {
  clearSeatAssignments,
  createClassroomSnapshot,
  removeStudentFromClassroom,
  restoreSnapshotToClassroom,
} from './classroomState';
import type { Classroom, LayoutPresetConfig, Student } from '../types';

function now(): string {
  return new Date().toISOString();
}

function touchClassroom(classroom: Classroom): Classroom {
  return {
    ...classroom,
    updatedAt: now(),
  };
}

export function applyClassroomPreset(
  classroom: Classroom,
  layoutConfig: LayoutPresetConfig,
): Classroom {
  const nextLayout = createPresetLayout(layoutConfig);

  return {
    ...classroom,
    seats: nextLayout.seats,
    groups: nextLayout.groups,
    layoutConfig: { ...layoutConfig },
    updatedAt: now(),
  };
}

export function addStudentsToClassroom(classroom: Classroom, students: Student[]): Classroom {
  return {
    ...classroom,
    students: [...classroom.students, ...students],
    updatedAt: now(),
  };
}

export function resetClassroomStudents(classroom: Classroom): Classroom {
  return {
    ...classroom,
    students: [],
    rules: [],
    seats: clearSeatAssignments(classroom.seats),
    snapshots: classroom.snapshots.map((snapshot) => ({
      ...snapshot,
      seats: clearSeatAssignments(snapshot.seats),
    })),
    updatedAt: now(),
  };
}

export function deleteStudentFromClassroom(classroom: Classroom, studentId: string): Classroom {
  return touchClassroom(removeStudentFromClassroom(classroom, studentId));
}

export function swapStudentsInClassroom(
  classroom: Classroom,
  firstStudentId: string,
  secondStudentId: string,
): Classroom {
  if (firstStudentId === secondStudentId) {
    return classroom;
  }

  const seats = cloneSeats(classroom.seats);
  const firstSeat = seats.find((seat) => seat.assignedStudentId === firstStudentId) ?? null;
  const secondSeat = seats.find((seat) => seat.assignedStudentId === secondStudentId) ?? null;

  if (!firstSeat && !secondSeat) {
    return classroom;
  }

  const firstFixed = firstSeat?.fixed ?? false;
  const secondFixed = secondSeat?.fixed ?? false;

  if (firstSeat) {
    firstSeat.assignedStudentId = secondStudentId;
    firstSeat.fixed = secondSeat ? secondFixed : false;
  }

  if (secondSeat) {
    secondSeat.assignedStudentId = firstStudentId;
    secondSeat.fixed = firstSeat ? firstFixed : false;
  }

  return {
    ...classroom,
    seats,
    updatedAt: now(),
  };
}

export function toggleSeatPinInClassroom(classroom: Classroom, seatId: string): Classroom {
  return {
    ...classroom,
    seats: classroom.seats.map((seat) =>
      seat.id === seatId && seat.assignedStudentId ? { ...seat, fixed: !seat.fixed } : seat,
    ),
    updatedAt: now(),
  };
}

export function addRuleToClassroom(
  classroom: Classroom,
  studentAId: string,
  studentBId: string,
): Classroom {
  if (!canAddRuleToClassroom(classroom, studentAId, studentBId)) {
    return classroom;
  }

  return {
    ...classroom,
    rules: [
      ...classroom.rules,
      {
        id: createId('rule'),
        studentAId,
        studentBId,
      },
    ],
    updatedAt: now(),
  };
}

export function canAddRuleToClassroom(
  classroom: Classroom,
  studentAId: string,
  studentBId: string,
): boolean {
  if (!studentAId || !studentBId || studentAId === studentBId) {
    return false;
  }

  return !classroom.rules.some(
    (rule) =>
      (rule.studentAId === studentAId && rule.studentBId === studentBId) ||
      (rule.studentAId === studentBId && rule.studentBId === studentAId),
  );
}

export function deleteRuleFromClassroom(classroom: Classroom, ruleId: string): Classroom {
  return {
    ...classroom,
    rules: classroom.rules.filter((rule) => rule.id !== ruleId),
    updatedAt: now(),
  };
}

export function saveClassroomSnapshot(classroom: Classroom, name: string): Classroom {
  return {
    ...classroom,
    snapshots: [
      createClassroomSnapshot(name, classroom, classroom.lastViewMode),
      ...classroom.snapshots,
    ],
    updatedAt: now(),
  };
}

export function restoreSnapshotInClassroom(classroom: Classroom, snapshotId: string): Classroom {
  const snapshot = classroom.snapshots.find((item) => item.id === snapshotId);

  if (!snapshot) {
    return classroom;
  }

  return {
    ...restoreSnapshotToClassroom(classroom, snapshot),
    updatedAt: now(),
  };
}
