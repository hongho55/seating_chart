import type { Seat } from '../types';

export function hasAssignedSeatAssignments(
  seats: ReadonlyArray<Pick<Seat, 'assignedStudentId'>>,
): boolean {
  return seats.some((seat) => seat.assignedStudentId !== null);
}

export function sanitizeSeatAssignments(
  seats: Seat[],
  validStudentIds: Iterable<string>,
): Seat[] {
  const studentIds = new Set(validStudentIds);

  return seats.map((seat) =>
    seat.assignedStudentId && !studentIds.has(seat.assignedStudentId)
      ? { ...seat, assignedStudentId: null, fixed: false }
      : { ...seat },
  );
}

export function clearSeatAssignments(seats: Seat[]): Seat[] {
  return seats.map((seat) => ({
    ...seat,
    assignedStudentId: null,
    fixed: false,
  }));
}
