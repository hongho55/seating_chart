import type {
  Classroom,
  Gender,
  GenderMode,
  RandomizeResult,
  Seat,
  Student,
} from '../types';
import { cloneSeats } from './layouts';

type AssignmentBucket = {
  id: string;
  currentCount: number;
  openSeats: Seat[];
  priority: number;
};

type SeatColor = 0 | 1;

type MixedPatternContext = {
  components: string[][];
  seatColors: Map<string, SeatColor>;
};

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const temp = copy[index];
    copy[index] = copy[swapIndex];
    copy[swapIndex] = temp;
  }

  return copy;
}

function sortSeatsByLayout(seats: Seat[]): Seat[] {
  return [...seats].sort((left, right) => {
    if (left.y !== right.y) {
      return left.y - right.y;
    }

    if (left.x !== right.x) {
      return left.x - right.x;
    }

    return left.id.localeCompare(right.id);
  });
}

function getGroupMembers(classroom: Classroom, seats: Seat[]): Map<string, string[]> {
  const members = new Map<string, string[]>();

  seats.forEach((seat) => {
    if (!seat.groupId) {
      return;
    }

    const assignedStudentIds = members.get(seat.groupId) ?? [];

    if (seat.assignedStudentId) {
      assignedStudentIds.push(seat.assignedStudentId);
    }

    members.set(seat.groupId, assignedStudentIds);
  });

  classroom.groups.forEach((group) => {
    if (!members.has(group.id)) {
      members.set(group.id, []);
    }
  });

  return members;
}

function getStudentMap(students: Student[]): Map<string, Student> {
  return new Map(students.map((student) => [student.id, student]));
}

function getStudentGender(
  studentMap: Map<string, Student>,
  studentId: string | null,
): Gender | null {
  if (!studentId) {
    return null;
  }

  return studentMap.get(studentId)?.gender ?? null;
}

function getOrthogonalSeatPairs(seats: Seat[]): Array<[Seat, Seat]> {
  const pairs: Array<[Seat, Seat]> = [];

  seats.forEach((seat) => {
    const rightNeighbor = seats
      .filter((candidate) => candidate.id !== seat.id && candidate.y === seat.y && candidate.x > seat.x)
      .sort((left, right) => left.x - right.x)[0];

    if (rightNeighbor) {
      pairs.push([seat, rightNeighbor]);
    }

    const bottomNeighbor = seats
      .filter((candidate) => candidate.id !== seat.id && candidate.x === seat.x && candidate.y > seat.y)
      .sort((left, right) => left.y - right.y)[0];

    if (bottomNeighbor) {
      pairs.push([seat, bottomNeighbor]);
    }
  });

  return pairs;
}

function buildMixedPatternContext(seats: Seat[]): MixedPatternContext {
  const sortedSeats = sortSeatsByLayout(seats);
  const adjacency = new Map<string, string[]>(sortedSeats.map((seat) => [seat.id, []]));

  getOrthogonalSeatPairs(sortedSeats).forEach(([leftSeat, rightSeat]) => {
    adjacency.get(leftSeat.id)?.push(rightSeat.id);
    adjacency.get(rightSeat.id)?.push(leftSeat.id);
  });

  const components: string[][] = [];
  const seatColors = new Map<string, SeatColor>();

  sortedSeats.forEach((seat) => {
    if (seatColors.has(seat.id)) {
      return;
    }

    const component: string[] = [];
    const queue: Array<{ seatId: string; color: SeatColor }> = [{ seatId: seat.id, color: 0 }];

    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];

      if (seatColors.has(current.seatId)) {
        continue;
      }

      seatColors.set(current.seatId, current.color);
      component.push(current.seatId);

      (adjacency.get(current.seatId) ?? []).forEach((neighborSeatId) => {
        if (!seatColors.has(neighborSeatId)) {
          queue.push({
            seatId: neighborSeatId,
            color: current.color === 0 ? 1 : 0,
          });
        }
      });
    }

    components.push(component);
  });

  return { components, seatColors };
}

function countMixedCheckerboardMisses(
  seats: Seat[],
  studentMap: Map<string, Student>,
  mixedPatternContext: MixedPatternContext,
  assignedStudentIdsBySeatId?: Map<string, string | null>,
): number {
  let misses = 0;
  const seatMap = new Map(seats.map((seat) => [seat.id, seat]));

  mixedPatternContext.components.forEach((component) => {
    let maleLeadingMisses = 0;
    let femaleLeadingMisses = 0;

    component.forEach((seatId) => {
      const seat = seatMap.get(seatId);

      if (!seat) {
        return;
      }

      const studentId = assignedStudentIdsBySeatId?.get(seat.id) ?? seat.assignedStudentId;
      const gender = getStudentGender(studentMap, studentId);

      if (!gender || gender === 'unknown') {
        return;
      }

      const seatColor = mixedPatternContext.seatColors.get(seat.id) ?? 0;
      const maleLeadingPreferredGender = seatColor === 0 ? 'male' : 'female';
      const femaleLeadingPreferredGender = seatColor === 0 ? 'female' : 'male';

      if (gender !== maleLeadingPreferredGender) {
        maleLeadingMisses += 1;
      }

      if (gender !== femaleLeadingPreferredGender) {
        femaleLeadingMisses += 1;
      }
    });

    misses += Math.min(maleLeadingMisses, femaleLeadingMisses);
  });

  return misses;
}

function countConflictViolations(classroom: Classroom, seats: Seat[]): number {
  const groupMembers = getGroupMembers(classroom, seats);
  let violations = 0;

  classroom.rules.forEach((rule) => {
    groupMembers.forEach((studentIds) => {
      if (studentIds.includes(rule.studentAId) && studentIds.includes(rule.studentBId)) {
        violations += 1;
      }
    });
  });

  return violations;
}

function countGenderMisses(classroom: Classroom, seats: Seat[], genderMode: GenderMode): number {
  if (genderMode === 'random') {
    return 0;
  }

  const studentMap = getStudentMap(classroom.students);

  if (genderMode === 'mixed') {
    return countMixedCheckerboardMisses(seats, studentMap, buildMixedPatternContext(seats));
  }

  const groupMembers = getGroupMembers(classroom, seats);
  let misses = 0;

  classroom.groups.forEach((group) => {
    const studentIds = groupMembers.get(group.id) ?? [];
    let maleCount = 0;
    let femaleCount = 0;

    studentIds.forEach((studentId) => {
      const student = studentMap.get(studentId);

      if (!student) {
        return;
      }

      if (student.gender === 'male') {
        maleCount += 1;
      }

      if (student.gender === 'female') {
        femaleCount += 1;
      }
    });

    if (maleCount === 0 && femaleCount === 0) {
      return;
    }

    misses += Math.min(maleCount, femaleCount);
  });

  return misses;
}

function createAssignmentBuckets(classroom: Classroom, seats: Seat[]): AssignmentBucket[] {
  const seatMap = new Map(seats.map((seat) => [seat.id, seat]));
  const buckets: AssignmentBucket[] = classroom.groups
    .map((group, index) => {
      const groupSeats = sortSeatsByLayout(
        group.seatIds
          .map((seatId) => seatMap.get(seatId))
          .filter((seat): seat is Seat => Boolean(seat)),
      );

      if (groupSeats.length === 0) {
        return null;
      }

      return {
        id: group.id,
        currentCount: groupSeats.filter((seat) => seat.fixed && seat.assignedStudentId).length,
        openSeats: groupSeats.filter((seat) => !(seat.fixed && seat.assignedStudentId)),
        priority: index + Math.random(),
      };
    })
    .filter((bucket): bucket is AssignmentBucket => Boolean(bucket));
  const groupedSeatIds = new Set(classroom.groups.flatMap((group) => group.seatIds));
  const ungroupedSeats = sortSeatsByLayout(
    seats.filter((seat) => !groupedSeatIds.has(seat.id)),
  );

  ungroupedSeats.forEach((seat, index) => {
    buckets.push({
      id: seat.id,
      currentCount: seat.fixed && seat.assignedStudentId ? 1 : 0,
      openSeats: seat.fixed && seat.assignedStudentId ? [] : [seat],
      priority: classroom.groups.length + index + Math.random(),
    });
  });

  return buckets;
}

function pickBalancedBucket(buckets: AssignmentBucket[]): AssignmentBucket | null {
  let bestBucket: AssignmentBucket | null = null;

  buckets.forEach((bucket) => {
    if (bucket.openSeats.length === 0) {
      return;
    }

    if (!bestBucket) {
      bestBucket = bucket;
      return;
    }

    if (bucket.currentCount < bestBucket.currentCount) {
      bestBucket = bucket;
      return;
    }

    if (bucket.currentCount === bestBucket.currentCount && bucket.priority < bestBucket.priority) {
      bestBucket = bucket;
    }
  });

  return bestBucket;
}

function assignMixedPatternStudents(
  classroom: Classroom,
  seats: Seat[],
  remainingStudents: Student[],
): void {
  const openSeats = sortSeatsByLayout(
    seats.filter((seat) => !(seat.fixed && seat.assignedStudentId)),
  );

  if (openSeats.length === 0 || remainingStudents.length === 0) {
    return;
  }

  const mixedPatternContext = buildMixedPatternContext(seats);
  const studentMap = getStudentMap(classroom.students);
  let bestAssignments = new Map<string, string | null>();
  let bestMisses = Number.POSITIVE_INFINITY;
  let bestConflicts = Number.POSITIVE_INFINITY;

  ([0, 1] as const).forEach((maleLeadingColor) => {
    const maleStudents = remainingStudents.filter((student) => student.gender === 'male');
    const femaleStudents = remainingStudents.filter((student) => student.gender === 'female');
    const unknownStudents = remainingStudents.filter((student) => student.gender === 'unknown');

    openSeats.forEach((seat) => {
      const seatColor = mixedPatternContext.seatColors.get(seat.id) ?? 0;
      const prefersMale = seatColor === maleLeadingColor;
      const assignedStudent = prefersMale
        ? maleStudents.shift() ?? femaleStudents.shift() ?? unknownStudents.shift()
        : femaleStudents.shift() ?? maleStudents.shift() ?? unknownStudents.shift();

      seat.assignedStudentId = assignedStudent?.id ?? null;
    });

    const misses = countMixedCheckerboardMisses(seats, studentMap, mixedPatternContext);
    const conflicts = countConflictViolations(classroom, seats);

    if (misses < bestMisses || (misses === bestMisses && conflicts < bestConflicts)) {
      bestMisses = misses;
      bestConflicts = conflicts;
      bestAssignments = new Map(openSeats.map((seat) => [seat.id, seat.assignedStudentId]));
    }
  });

  openSeats.forEach((seat) => {
    seat.assignedStudentId = bestAssignments.get(seat.id) ?? null;
  });
}

function buildTrialSeats(classroom: Classroom, shuffledStudents: Student[]): Seat[] {
  const seats = cloneSeats(classroom.seats);
  const availableStudentIds = new Set(shuffledStudents.map((student) => student.id));

  seats.forEach((seat) => {
    if (seat.fixed && seat.assignedStudentId) {
      availableStudentIds.delete(seat.assignedStudentId);
      return;
    }

    seat.assignedStudentId = null;
  });

  const remainingStudents = shuffledStudents.filter((student) => availableStudentIds.has(student.id));

  if (classroom.randomSettings.genderMode === 'mixed') {
    assignMixedPatternStudents(classroom, seats, remainingStudents);
    optimizeMixedSeatAssignments(classroom, seats);
    return seats;
  }

  const buckets = createAssignmentBuckets(classroom, seats);

  remainingStudents.forEach((student) => {
    const nextBucket = pickBalancedBucket(buckets);

    if (!nextBucket) {
      return;
    }

    const targetSeat = nextBucket.openSeats.shift();

    if (!targetSeat) {
      return;
    }

    targetSeat.assignedStudentId = student.id;
    nextBucket.currentCount += 1;
  });

  return seats;
}

function optimizeMixedSeatAssignments(classroom: Classroom, seats: Seat[]): void {
  const studentMap = getStudentMap(classroom.students);
  const mixedPatternContext = buildMixedPatternContext(seats);
  const movableSeats = sortSeatsByLayout(
    seats.filter((seat) => !seat.fixed && seat.assignedStudentId),
  );

  if (movableSeats.length <= 1) {
    return;
  }

  let bestConflicts = countConflictViolations(classroom, seats);
  let bestGenderMisses = countMixedCheckerboardMisses(seats, studentMap, mixedPatternContext);
  let improved = true;

  while (improved) {
    improved = false;
    let bestSwap: [number, number] | null = null;
    let nextConflicts = bestConflicts;
    let nextGenderMisses = bestGenderMisses;

    for (let leftIndex = 0; leftIndex < movableSeats.length - 1; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < movableSeats.length; rightIndex += 1) {
        const leftSeat = movableSeats[leftIndex];
        const rightSeat = movableSeats[rightIndex];
        const leftStudentId = leftSeat.assignedStudentId;
        const rightStudentId = rightSeat.assignedStudentId;

        if (!leftStudentId || !rightStudentId || leftStudentId === rightStudentId) {
          continue;
        }

        leftSeat.assignedStudentId = rightStudentId;
        rightSeat.assignedStudentId = leftStudentId;

        const conflicts = countConflictViolations(classroom, seats);
        const genderMisses = countMixedCheckerboardMisses(
          seats,
          studentMap,
          mixedPatternContext,
        );

        leftSeat.assignedStudentId = leftStudentId;
        rightSeat.assignedStudentId = rightStudentId;

        if (
          conflicts < nextConflicts ||
          (conflicts === nextConflicts && genderMisses < nextGenderMisses)
        ) {
          bestSwap = [leftIndex, rightIndex];
          nextConflicts = conflicts;
          nextGenderMisses = genderMisses;
        }
      }
    }

    if (!bestSwap) {
      continue;
    }

    const [leftIndex, rightIndex] = bestSwap;
    const leftSeat = movableSeats[leftIndex];
    const rightSeat = movableSeats[rightIndex];
    const leftStudentId = leftSeat.assignedStudentId;
    const rightStudentId = rightSeat.assignedStudentId;

    leftSeat.assignedStudentId = rightStudentId;
    rightSeat.assignedStudentId = leftStudentId;
    bestConflicts = nextConflicts;
    bestGenderMisses = nextGenderMisses;
    improved = true;
  }
}

function calculateUnplacedStudents(classroom: Classroom, seats: Seat[]): number {
  const activeStudentCount = classroom.students.length;
  const assignedCount = seats.filter((seat) => seat.assignedStudentId).length;
  return Math.max(0, activeStudentCount - assignedCount);
}

export function randomizeSeats(classroom: Classroom, attempts = 240): RandomizeResult {
  const availableStudents = classroom.students;
  const trialCount = Math.max(24, attempts);
  let bestSeats = cloneSeats(classroom.seats);
  let bestScore = Number.POSITIVE_INFINITY;
  let bestConflicts = 0;
  let bestGenderMisses = 0;
  let bestUnplacedStudents = 0;

  for (let attempt = 0; attempt < trialCount; attempt += 1) {
    const trialSeats = buildTrialSeats(classroom, shuffle(availableStudents));
    const conflicts = countConflictViolations(classroom, trialSeats);
    const genderMisses = countGenderMisses(classroom, trialSeats, classroom.randomSettings.genderMode);
    const unplacedStudents = calculateUnplacedStudents(classroom, trialSeats);
    const score = conflicts * 10_000 + unplacedStudents * 2_000 + genderMisses * 100 + Math.random();

    if (score < bestScore) {
      bestSeats = trialSeats;
      bestScore = score;
      bestConflicts = conflicts;
      bestGenderMisses = genderMisses;
      bestUnplacedStudents = unplacedStudents;
    }
  }

  return {
    seats: bestSeats,
    score: bestScore,
    conflicts: bestConflicts,
    unplacedStudents: bestUnplacedStudents,
    genderMisses: bestGenderMisses,
  };
}

export function inferGenderFromText(input: string): Gender {
  const normalized = input.trim().toLowerCase();

  if (['m', 'male', '남', '남자', 'boy'].includes(normalized)) {
    return 'male';
  }

  if (['f', 'female', '여', '여자', 'girl'].includes(normalized)) {
    return 'female';
  }

  return 'unknown';
}
