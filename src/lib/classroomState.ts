import { sanitizeBasePlanAssignments } from './basePlanState';
import { createId } from './ids';
import { cloneGroups, cloneSeats } from './layouts';
import { sanitizeSeatAssignments } from './seatAssignments';
import type { Classroom, LayoutSnapshot, ViewMode } from '../types';

export function sanitizeSnapshotAssignments(
  snapshot: LayoutSnapshot,
  validStudentIds: Iterable<string>,
): LayoutSnapshot {
  return {
    ...snapshot,
    seats: sanitizeSeatAssignments(cloneSeats(snapshot.seats), validStudentIds),
    groups: cloneGroups(snapshot.groups),
    layoutConfig: { ...snapshot.layoutConfig },
  };
}

export function sanitizeClassroomStudentAssignments(classroom: Classroom): Classroom {
  const studentIds = classroom.students.map((student) => student.id);

  return {
    ...classroom,
    seats: sanitizeSeatAssignments(classroom.seats, studentIds),
    basePlan: sanitizeBasePlanAssignments(classroom.basePlan, studentIds),
    snapshots: classroom.snapshots.map((snapshot) =>
      sanitizeSnapshotAssignments(snapshot, studentIds),
    ),
  };
}

export function removeStudentFromClassroom(classroom: Classroom, studentId: string): Classroom {
  const nextClassroom = sanitizeClassroomStudentAssignments({
    ...classroom,
    students: classroom.students.filter((student) => student.id !== studentId),
    rules: classroom.rules.filter(
      (rule) => rule.studentAId !== studentId && rule.studentBId !== studentId,
    ),
  });

  return nextClassroom;
}

export function createClassroomSnapshot(
  name: string,
  classroom: Classroom,
  viewMode: ViewMode,
): LayoutSnapshot {
  return {
    id: createId('snapshot'),
    name,
    createdAt: new Date().toISOString(),
    seats: sanitizeSeatAssignments(cloneSeats(classroom.seats), classroom.students.map((student) => student.id)),
    groups: cloneGroups(classroom.groups),
    layoutConfig: { ...classroom.layoutConfig },
    viewMode,
  };
}

export function restoreSnapshotToClassroom(
  classroom: Classroom,
  snapshot: LayoutSnapshot,
): Classroom {
  const sanitizedSnapshot = sanitizeSnapshotAssignments(
    snapshot,
    classroom.students.map((student) => student.id),
  );

  return {
    ...classroom,
    seats: sanitizedSnapshot.seats,
    groups: sanitizedSnapshot.groups,
    layoutConfig: { ...sanitizedSnapshot.layoutConfig },
    lastViewMode: sanitizedSnapshot.viewMode,
  };
}
