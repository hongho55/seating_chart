import type {
  Classroom,
  Gender,
  GenderMode,
  RandomizeResult,
  Seat,
  Student,
} from '../types';
import { cloneSeats } from './layouts';

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
  const groupMembers = getGroupMembers(classroom, seats);
  let misses = 0;

  groupMembers.forEach((studentIds) => {
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

    if (genderMode === 'same') {
      misses += Math.min(maleCount, femaleCount);
      return;
    }

    const knownCount = maleCount + femaleCount;

    if (knownCount <= 1) {
      return;
    }

    misses += Math.abs(maleCount - femaleCount);

    if (maleCount === 0 || femaleCount === 0) {
      misses += knownCount;
    }
  });

  return misses;
}

function buildTrialSeats(classroom: Classroom, shuffledStudents: Student[]): Seat[] {
  const seats = cloneSeats(classroom.seats);
  const availableStudentIds = new Set(shuffledStudents.map((student) => student.id));
  let studentIndex = 0;

  seats.forEach((seat) => {
    if (seat.fixed && seat.assignedStudentId) {
      availableStudentIds.delete(seat.assignedStudentId);
      return;
    }

    seat.assignedStudentId = null;
  });

  const remainingStudents = shuffledStudents.filter((student) => availableStudentIds.has(student.id));

  seats.forEach((seat) => {
    if (seat.fixed && seat.assignedStudentId) {
      return;
    }

    const nextStudent = remainingStudents[studentIndex];

    if (!nextStudent) {
      seat.assignedStudentId = null;
      return;
    }

    seat.assignedStudentId = nextStudent.id;
    studentIndex += 1;
  });

  return seats;
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
