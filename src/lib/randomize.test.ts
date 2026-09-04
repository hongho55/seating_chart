import { describe, expect, it } from 'vitest';
import { createEmptyBasePlan } from './basePlanState';
import { createPresetLayout } from './layouts';
import { randomizeSeats } from './randomize';
import type { Classroom, Gender, LayoutPresetConfig, Seat, Student } from '../types';

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

function createStudent(index: number, gender: Gender, absent = false): Student {
  return {
    id: `student-${index}`,
    name: `학생${index}`,
    number: String(index),
    gender,
    absent,
    note: '',
  };
}

function createClassroom(
  layoutConfig: LayoutPresetConfig,
  students: Student[],
  genderMode: Classroom['randomSettings']['genderMode'] = 'random',
): Classroom {
  const layout = createPresetLayout(layoutConfig);

  return {
    id: 'classroom-test',
    grade: '5학년',
    className: '1반',
    subjectRoomName: '테스트실',
    students,
    seats: layout.seats,
    groups: layout.groups,
    layoutConfig,
    basePlan: createEmptyBasePlan({ ...layout, layoutConfig }),
    hasSavedBasePlan: false,
    rules: [],
    snapshots: [],
    boardLabel: '칠판',
    boardLayoutMode: 'classic',
    randomSettings: { genderMode },
    lastViewMode: 'teacher',
    updatedAt: new Date(0).toISOString(),
  };
}

function getGroupMembers(seats: Seat[], groupId: string): string[] {
  return seats
    .filter((seat) => seat.groupId === groupId && seat.assignedStudentId)
    .map((seat) => seat.assignedStudentId as string);
}

function getGroupPairKeys(seats: Seat[]): Set<string> {
  const groupIds = new Set(seats.map((seat) => seat.groupId).filter((id): id is string => Boolean(id)));
  const pairKeys = new Set<string>();

  groupIds.forEach((groupId) => {
    const members = getGroupMembers(seats, groupId);

    for (let leftIndex = 0; leftIndex < members.length - 1; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < members.length; rightIndex += 1) {
        pairKeys.add(JSON.stringify([members[leftIndex], members[rightIndex]].sort()));
      }
    }
  });

  return pairKeys;
}

function countRepeatedGroupPairs(previousSeats: Seat[], candidateSeats: Seat[]): number {
  const previousPairs = getGroupPairKeys(previousSeats);
  return [...getGroupPairKeys(candidateSeats)].filter((pairKey) => previousPairs.has(pairKey)).length;
}

function countRepeatedSeats(previousSeats: Seat[], candidateSeats: Seat[]): number {
  const previousAssignments = new Map(
    previousSeats.map((seat) => [seat.id, seat.assignedStudentId]),
  );

  return candidateSeats.filter(
    (seat) => seat.assignedStudentId && previousAssignments.get(seat.id) === seat.assignedStudentId,
  ).length;
}

const GROUP6_LAYOUT: LayoutPresetConfig = {
  preset: 'group6',
  rows: 2,
  cols: 2,
  variant: 'group6-2x3',
};

const SINGLE_LAYOUT: LayoutPresetConfig = {
  preset: 'single',
  rows: 1,
  cols: 2,
  variant: 'single',
};

describe('randomizeSeats', () => {
  it('excludes absent students and reports active students accurately', () => {
    const students = [
      createStudent(1, 'male'),
      createStudent(2, 'female'),
      createStudent(3, 'male', true),
    ];
    const result = randomizeSeats(
      createClassroom(SINGLE_LAYOUT, students),
      24,
      seededRandom(1),
    );

    expect(result.seats.some((seat) => seat.assignedStudentId === 'student-3')).toBe(false);
    expect(result.unplacedStudents).toBe(0);
    expect(new Set(result.seats.map((seat) => seat.assignedStudentId).filter(Boolean))).toEqual(
      new Set(['student-1', 'student-2']),
    );
  });

  it('keeps an active fixed assignment in place', () => {
    const students = [createStudent(1, 'male'), createStudent(2, 'female')];
    const classroom = createClassroom(SINGLE_LAYOUT, students);
    classroom.seats[0] = {
      ...classroom.seats[0],
      assignedStudentId: 'student-1',
      fixed: true,
    };

    const result = randomizeSeats(classroom, 24, seededRandom(2));

    expect(result.seats[0].assignedStudentId).toBe('student-1');
    expect(result.seats[0].fixed).toBe(true);
    expect(result.seats[1].assignedStudentId).toBe('student-2');
  });

  it('preserves mixed-gender balance while avoiding the previous grouping', () => {
    const students = Array.from({ length: 24 }, (_, index) =>
      createStudent(index + 1, index < 12 ? 'male' : 'female'),
    );
    const initialClassroom = createClassroom(GROUP6_LAYOUT, students, 'mixed');
    const first = randomizeSeats(initialClassroom, 120, seededRandom(17));
    const second = randomizeSeats(
      { ...initialClassroom, seats: first.seats },
      120,
      seededRandom(29),
    );

    initialClassroom.groups.forEach((group) => {
      const members = getGroupMembers(second.seats, group.id);
      const maleCount = members.filter((id) => Number(id.split('-')[1]) <= 12).length;
      const femaleCount = members.length - maleCount;

      expect({ maleCount, femaleCount }).toEqual({ maleCount: 3, femaleCount: 3 });
    });
    expect(countRepeatedGroupPairs(first.seats, second.seats)).toBeLessThan(13);
    expect(countRepeatedSeats(first.seats, second.seats)).toBeLessThan(2);
  });

  it('does not always fill the first groups when only a few students are active', () => {
    const students = [createStudent(1, 'male'), createStudent(2, 'female')];
    const usedGroupIds = new Set<string>();

    for (let seed = 1; seed <= 8; seed += 1) {
      const result = randomizeSeats(
        createClassroom(GROUP6_LAYOUT, students),
        24,
        seededRandom(seed),
      );
      result.seats.forEach((seat) => {
        if (seat.assignedStudentId) {
          usedGroupIds.add(seat.groupId as string);
        }
      });
    }

    expect(usedGroupIds.size).toBeGreaterThan(2);
  });

  it('supports deterministic RNG injection for reproducible algorithm tests', () => {
    const students = [createStudent(1, 'male'), createStudent(2, 'female')];
    const classroom = createClassroom(SINGLE_LAYOUT, students, 'mixed');
    const first = randomizeSeats(classroom, 24, seededRandom(99));
    const second = randomizeSeats(classroom, 24, seededRandom(99));

    expect(second.seats.map((seat) => seat.assignedStudentId)).toEqual(
      first.seats.map((seat) => seat.assignedStudentId),
    );
  });
});
