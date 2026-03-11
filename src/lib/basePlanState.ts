import { cloneGroups, cloneSeats } from './layouts';
import { sanitizeSeatAssignments } from './seatAssignments';
import type { BasePlan, Classroom } from '../types';

export function cloneBasePlan(basePlan: BasePlan): BasePlan {
  return {
    seats: cloneSeats(basePlan.seats),
    groups: cloneGroups(basePlan.groups),
    layoutConfig: { ...basePlan.layoutConfig },
  };
}

export function createBasePlan(
  input: Pick<Classroom, 'seats' | 'groups' | 'layoutConfig'>,
): BasePlan {
  return {
    seats: cloneSeats(input.seats),
    groups: cloneGroups(input.groups),
    layoutConfig: { ...input.layoutConfig },
  };
}

export function sanitizeBasePlanAssignments(
  basePlan: BasePlan,
  validStudentIds: Iterable<string>,
): BasePlan {
  const nextBasePlan = cloneBasePlan(basePlan);

  return {
    ...nextBasePlan,
    seats: sanitizeSeatAssignments(nextBasePlan.seats, validStudentIds),
  };
}

export function synchronizeClassroomBasePlan(classroom: Classroom): Classroom {
  return {
    ...classroom,
    basePlan: createBasePlan(classroom),
  };
}
