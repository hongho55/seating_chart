import {
  applyBasePlanToClassroom,
  sanitizeBasePlanAssignments,
  saveClassroomBasePlan,
} from './basePlanState';
import { createId } from './ids';
import { cloneSeats, createPresetLayout } from './layouts';
import {
  createClassroomSnapshot,
  removeStudentFromClassroom,
  restoreSnapshotToClassroom,
} from './classroomState';
import { clearSeatAssignments } from './seatAssignments';
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

function touchClassroomLayout(classroom: Classroom): Classroom {
  return touchClassroom(classroom);
}

export function applyClassroomPreset(
  classroom: Classroom,
  layoutConfig: LayoutPresetConfig,
): Classroom {
  const nextLayout = createPresetLayout(layoutConfig);

  return touchClassroomLayout({
    ...classroom,
    seats: nextLayout.seats,
    groups: nextLayout.groups,
    layoutConfig: { ...layoutConfig },
  });
}

export function addStudentsToClassroom(classroom: Classroom, students: Student[]): Classroom {
  return {
    ...classroom,
    students: [...classroom.students, ...students],
    updatedAt: now(),
  };
}

export function resetClassroomStudents(classroom: Classroom): Classroom {
  return touchClassroomLayout({
    ...classroom,
    students: [],
    rules: [],
    seats: clearSeatAssignments(classroom.seats),
    basePlan: sanitizeBasePlanAssignments(classroom.basePlan, []),
    snapshots: classroom.snapshots.map((snapshot) => ({
      ...snapshot,
      seats: clearSeatAssignments(snapshot.seats),
    })),
  });
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

  return touchClassroomLayout({
    ...classroom,
    seats,
  });
}

export function toggleSeatPinInClassroom(classroom: Classroom, seatId: string): Classroom {
  return touchClassroomLayout({
    ...classroom,
    seats: classroom.seats.map((seat) =>
      seat.id === seatId && seat.assignedStudentId ? { ...seat, fixed: !seat.fixed } : seat,
    ),
  });
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

  return touchClassroomLayout(restoreSnapshotToClassroom(classroom, snapshot));
}

export function setClassroomSeats(classroom: Classroom, seats: Classroom['seats']): Classroom {
  return touchClassroomLayout({
    ...classroom,
    seats: cloneSeats(seats),
  });
}

export function setSeatsFromBasePlanInClassroom(
  classroom: Classroom,
  seats: Classroom['seats'],
): Classroom {
  return touchClassroomLayout({
    ...applyBasePlanToClassroom(classroom),
    seats: cloneSeats(seats),
  });
}

export function restoreBasePlanInClassroom(classroom: Classroom): Classroom {
  return touchClassroomLayout(applyBasePlanToClassroom(classroom));
}

export function saveBasePlanInClassroom(classroom: Classroom): Classroom {
  return touchClassroom(saveClassroomBasePlan(classroom));
}
