import { applyBasePlanToClassroom } from './basePlanState';
import type { Classroom, Seat } from '../types';

export const BASE_PLAN_REVEAL_STEP_MS = 180;

export function getBasePlanRevealSeatIds(
  seats: ReadonlyArray<Pick<Seat, 'id' | 'x' | 'y' | 'assignedStudentId'>>,
): string[] {
  return seats
    .filter((seat) => seat.assignedStudentId !== null)
    .slice()
    .sort((firstSeat, secondSeat) => {
      if (firstSeat.y !== secondSeat.y) {
        return firstSeat.y - secondSeat.y;
      }

      if (firstSeat.x !== secondSeat.x) {
        return firstSeat.x - secondSeat.x;
      }

      return firstSeat.id.localeCompare(secondSeat.id);
    })
    .map((seat) => seat.id);
}

export function createProgressiveBasePlanClassroom(
  classroom: Classroom,
  orderedSeatIds: ReadonlyArray<string>,
  visibleCount: number,
): Classroom {
  const visibleSeatIds = new Set(orderedSeatIds.slice(0, visibleCount));
  const basePlanClassroom = applyBasePlanToClassroom(classroom);

  return {
    ...basePlanClassroom,
    seats: basePlanClassroom.seats.map((seat) =>
      visibleSeatIds.has(seat.id)
        ? seat
        : { ...seat, assignedStudentId: null, fixed: false },
    ),
  };
}
