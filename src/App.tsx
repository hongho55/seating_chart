import { startTransition, useEffect, useEffectEvent, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { createId } from './lib/ids';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CANVAS_PADDING_X,
  CANVAS_PADDING_Y,
  cloneGroups,
  cloneSeats,
  createPresetLayout,
  getDefaultVariant,
  getVariantOptions,
  GROUP_OUTLINE_PADDING,
  SEAT_CARD_HEIGHT,
  SEAT_CARD_WIDTH,
} from './lib/layouts';
import { inferGenderFromText, randomizeSeats } from './lib/randomize';
import {
  createEmptyClassroom,
  loadAppData,
  saveAppData,
} from './lib/storage';
import type {
  AppData,
  Classroom,
  DeskVariant,
  ConflictRule,
  GenderMode,
  LayoutSnapshot,
  Seat,
  SeatPreset,
  Student,
  ViewMode,
} from './types';

const PRESET_LABELS: Record<SeatPreset, string> = {
  single: '1인 시험형',
  pair: '2인 짝꿍형',
  group4: '4인 모둠형',
  group6: '6인 모둠형',
};

const GENDER_MODE_LABELS: Record<GenderMode, string> = {
  random: '랜덤',
  same: '동성 우선',
  mixed: '이성 우선',
};

const SNAP_GRID = 16;
const PRINT_MARGIN_MM = 8;
const MM_TO_PX = 96 / 25.4;
const PRINT_SAFETY_SCALE = 0.96;
const SEAT_PIN_OVERHANG = 12;

type DragState = {
  pointerId: number;
  groupId: string;
  flipped: boolean;
  startClientX: number;
  startClientY: number;
  startSeatPositions: Record<string, { x: number; y: number }>;
  minDeltaX: number;
  maxDeltaX: number;
  minDeltaY: number;
  maxDeltaY: number;
} | null;

type InspectorTab = 'layout' | 'students' | 'rules' | 'saved';

function formatTime(isoString: string | null): string {
  if (!isoString) {
    return '저장 대기';
  }

  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(isoString));
}

function isFlippedView(viewMode: ViewMode): boolean {
  return viewMode === 'teacher';
}

function classroomTitle(classroom: Classroom): string {
  return `${classroom.grade} ${classroom.className} · ${classroom.subjectRoomName}`;
}

function getStudentName(classroom: Classroom, studentId: string | null): string {
  if (!studentId) {
    return '';
  }

  return classroom.students.find((student) => student.id === studentId)?.name ?? '';
}

function getGroupLabelForSeat(classroom: Classroom, seat: Seat | null): string {
  if (!seat?.groupId) {
    return seat ? '배치됨' : '미배치';
  }

  return classroom.groups.find((group) => group.id === seat.groupId)?.label ?? '배치됨';
}

function removeStudentFromSeats(seats: Seat[], studentId: string): Seat[] {
  return seats.map((seat) =>
    seat.assignedStudentId === studentId ? { ...seat, assignedStudentId: null, fixed: false } : seat,
  );
}

function createSnapshot(name: string, classroom: Classroom, viewMode: ViewMode): LayoutSnapshot {
  return {
    id: createId('snapshot'),
    name,
    createdAt: new Date().toISOString(),
    seats: cloneSeats(classroom.seats),
    groups: cloneGroups(classroom.groups),
    layoutConfig: { ...classroom.layoutConfig },
    viewMode,
  };
}

function parseStudentLines(raw: string): Student[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const tabTokens = line.split('\t').map((token) => token.trim()).filter(Boolean);
      const csvTokens = line.split(',').map((token) => token.trim()).filter(Boolean);
      const tokens =
        tabTokens.length >= 2
          ? tabTokens
          : csvTokens.length >= 2
            ? csvTokens
            : line.split(/\s+/).filter(Boolean);
      const [first = '', second = '', third = ''] = tokens;
      const hasNumber = /^\d+$/.test(first);
      const number = hasNumber ? first : '';
      const name = hasNumber ? second : first;
      const genderToken = hasNumber ? third : second;

      return {
        id: createId('student'),
        number,
        name,
        gender: inferGenderFromText(genderToken),
        absent: false,
        note: '',
      };
    })
    .filter((student) => student.name);
}

function flipFrame(
  left: number,
  top: number,
  width: number,
  height: number,
  canvasWidth: number,
  canvasHeight: number,
  viewMode: ViewMode,
): { left: number; top: number } {
  if (!isFlippedView(viewMode)) {
    return { left, top };
  }

  return {
    left: canvasWidth - left - width,
    top: canvasHeight - top - height,
  };
}

function getSeatVisibleOverhang(seat: Seat, viewMode: ViewMode): number {
  return viewMode === 'teacher' && seat.assignedStudentId ? SEAT_PIN_OVERHANG : 0;
}

function getLayoutBounds(
  seats: Seat[],
  viewMode: ViewMode,
): { minX: number; maxX: number; minY: number; maxY: number } | null {
  if (seats.length === 0) {
    return null;
  }

  return {
    minX: Math.min(...seats.map((seat) => seat.x)),
    maxX: Math.max(...seats.map((seat) => seat.x + SEAT_CARD_WIDTH + getSeatVisibleOverhang(seat, viewMode))),
    minY: Math.min(...seats.map((seat) => seat.y)),
    maxY: Math.max(...seats.map((seat) => seat.y + SEAT_CARD_HEIGHT)),
  };
}

function getVisibleLayoutBounds(classroom: Classroom, viewMode: ViewMode): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} | null {
  const seatBounds = getLayoutBounds(classroom.seats, viewMode);

  if (!seatBounds) {
    return null;
  }

  let minX = seatBounds.minX;
  let maxX = seatBounds.maxX;
  let minY = seatBounds.minY;
  let maxY = seatBounds.maxY;

  classroom.groups.forEach((group) => {
    const groupSeats = classroom.seats.filter((seat) => group.seatIds.includes(seat.id));

    if (groupSeats.length === 0) {
      return;
    }

    const groupMinX = Math.min(...groupSeats.map((seat) => seat.x)) - GROUP_OUTLINE_PADDING;
    const groupMaxX =
      Math.max(
        ...groupSeats.map(
          (seat) => seat.x + SEAT_CARD_WIDTH + getSeatVisibleOverhang(seat, viewMode),
        ),
      ) +
      GROUP_OUTLINE_PADDING;
    const groupMinY = Math.min(...groupSeats.map((seat) => seat.y)) - GROUP_OUTLINE_PADDING - 12;
    const groupMaxY =
      Math.max(...groupSeats.map((seat) => seat.y + SEAT_CARD_HEIGHT)) + GROUP_OUTLINE_PADDING;

    minX = Math.min(minX, groupMinX);
    maxX = Math.max(maxX, groupMaxX);
    minY = Math.min(minY, groupMinY);
    maxY = Math.max(maxY, groupMaxY);
  });

  return { minX, maxX, minY, maxY };
}

function getPrintableAreaPx(orientation: 'landscape' | 'portrait'): { width: number; height: number } {
  const pageWidthMm = orientation === 'landscape' ? 297 : 210;
  const pageHeightMm = orientation === 'landscape' ? 210 : 297;
  const printableWidthMm = pageWidthMm - PRINT_MARGIN_MM * 2;
  const printableHeightMm = pageHeightMm - PRINT_MARGIN_MM * 2;

  return {
    width: printableWidthMm * MM_TO_PX,
    height: printableHeightMm * MM_TO_PX,
  };
}

function applyPrintLayout(
  canvasWidth: number,
  canvasHeight: number,
): void {
  const root = document.documentElement;
  (['portrait', 'landscape'] as const).forEach((orientation) => {
    const printableArea = getPrintableAreaPx(orientation);
    const scale =
      Math.min(
      1,
      printableArea.width / Math.max(canvasWidth, 1),
      printableArea.height / Math.max(canvasHeight, 1),
      ) * PRINT_SAFETY_SCALE;

    root.style.setProperty(`--print-scale-${orientation}`, String(scale));
    root.style.setProperty(`--print-stage-width-${orientation}`, `${Math.ceil(canvasWidth * scale)}px`);
    root.style.setProperty(`--print-stage-height-${orientation}`, `${Math.ceil(canvasHeight * scale)}px`);
  });
}

export default function App() {
  const [data, setData] = useState<AppData>(() => loadAppData());
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [presetType, setPresetType] = useState<SeatPreset>('group6');
  const [presetVariant, setPresetVariant] = useState<DeskVariant>(getDefaultVariant('group6'));
  const [presetRows, setPresetRows] = useState(2);
  const [presetCols, setPresetCols] = useState(2);
  const [bulkStudents, setBulkStudents] = useState('');
  const [newClassroom, setNewClassroom] = useState({
    grade: '5학년',
    className: '1반',
    subjectRoomName: '과학실',
  });
  const [ruleDraft, setRuleDraft] = useState({
    studentAId: '',
    studentBId: '',
  });
  const [randomSummary, setRandomSummary] = useState<{
    conflicts: number;
    genderMisses: number;
    unplacedStudents: number;
  } | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('layout');
  const [classroomMenuOpen, setClassroomMenuOpen] = useState(false);
  const [createPanelOpen, setCreatePanelOpen] = useState(false);
  const [dragState, setDragState] = useState<DragState>(null);
  const [boardScale, setBoardScale] = useState(1);
  const boardShellRef = useRef<HTMLDivElement | null>(null);
  const classroomPickerRef = useRef<HTMLDivElement | null>(null);
  const createPanelRef = useRef<HTMLDivElement | null>(null);
  const clearSelectedStudentsTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      saveAppData(data);
      setLastSavedAt(new Date().toISOString());
    }, 500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [data]);

  useEffect(() => {
    return () => {
      if (clearSelectedStudentsTimeoutRef.current) {
        window.clearTimeout(clearSelectedStudentsTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (selectedStudentIds.length !== 2) {
      return;
    }

    swapStudentSeats(selectedStudentIds[0], selectedStudentIds[1]);
    clearSelectedStudentsTimeoutRef.current = window.setTimeout(() => {
      setSelectedStudentIds([]);
      clearSelectedStudentsTimeoutRef.current = null;
    }, 180);
  }, [selectedStudentIds]);

  const activeClassroom = data.classrooms.find((classroom) => classroom.id === data.activeClassroomId) ?? null;
  const viewMode = activeClassroom?.lastViewMode ?? 'teacher';
  const layoutBounds = activeClassroom ? getVisibleLayoutBounds(activeClassroom, viewMode) : null;
  const layoutVisibleWidth = layoutBounds
    ? layoutBounds.maxX - layoutBounds.minX
    : CANVAS_WIDTH - CANVAS_PADDING_X * 2;
  const renderCanvasWidth = Math.max(
    CANVAS_WIDTH,
    layoutVisibleWidth + CANVAS_PADDING_X * 2,
  );
  const renderOffsetX = layoutBounds
    ? Math.round((renderCanvasWidth - layoutVisibleWidth) / 2) - layoutBounds.minX
    : 0;
  const renderCanvasHeight = Math.max(
    CANVAS_PADDING_Y * 2 + SEAT_CARD_HEIGHT,
    (layoutBounds?.maxY ?? SEAT_CARD_HEIGHT) + CANVAS_PADDING_Y + 12,
  );
  const flippedView = isFlippedView(viewMode);
  const teacherBoardCenterX = layoutBounds
    ? layoutBounds.minX + (layoutBounds.maxX - layoutBounds.minX) / 2 + renderOffsetX
    : renderCanvasWidth / 2;
  const boardCenterX =
    flippedView ? renderCanvasWidth - teacherBoardCenterX : teacherBoardCenterX;

  useEffect(() => {
    if (!activeClassroom) {
      return;
    }

    setPresetType(activeClassroom.layoutConfig.preset);
    setPresetVariant(activeClassroom.layoutConfig.variant);
    setPresetRows(activeClassroom.layoutConfig.rows);
    setPresetCols(activeClassroom.layoutConfig.cols);
  }, [
    activeClassroom?.id,
    activeClassroom?.layoutConfig.preset,
    activeClassroom?.layoutConfig.variant,
    activeClassroom?.layoutConfig.rows,
    activeClassroom?.layoutConfig.cols,
  ]);

  function updateActiveClassroom(
    updater: (classroom: Classroom) => Classroom,
  ) {
    if (!activeClassroom) {
      return;
    }

    setData((current) => ({
      ...current,
      classrooms: current.classrooms.map((classroom) =>
        classroom.id === activeClassroom.id ? updater(classroom) : classroom,
      ),
    }));
  }

  function handleCreateClassroom() {
    const classroom = createEmptyClassroom(newClassroom);

    setData((current) => ({
      ...current,
      classrooms: [...current.classrooms, classroom],
      activeClassroomId: classroom.id,
    }));
    setSelectedStudentIds([]);
    setCreatePanelOpen(false);
  }

  function handleSelectClassroom(classroomId: string) {
    setData((current) => ({
      ...current,
      activeClassroomId: classroomId,
    }));
    setClassroomMenuOpen(false);
    setSelectedStudentIds([]);
    setRandomSummary(null);
  }

  function handleApplyPreset() {
    if (!activeClassroom) {
      return;
    }

    if (
      activeClassroom.seats.some((seat) => seat.assignedStudentId) &&
      !window.confirm('현재 배치가 지워집니다. 새 프리셋으로 바꿀까요?')
    ) {
      return;
    }

    const nextLayout = createPresetLayout({
      preset: presetType,
      rows: presetRows,
      cols: presetCols,
      variant: presetVariant,
    });

    updateActiveClassroom((classroom) => ({
      ...classroom,
      seats: nextLayout.seats,
      groups: nextLayout.groups,
      layoutConfig: {
        preset: presetType,
        rows: presetRows,
        cols: presetCols,
        variant: presetVariant,
      },
      updatedAt: new Date().toISOString(),
    }));
    setSelectedStudentIds([]);
    setRandomSummary(null);
  }

  function handleAddStudents() {
    const parsedStudents = parseStudentLines(bulkStudents);

    if (!activeClassroom || parsedStudents.length === 0) {
      return;
    }

    updateActiveClassroom((classroom) => ({
      ...classroom,
      students: [...classroom.students, ...parsedStudents],
      updatedAt: new Date().toISOString(),
    }));
    setBulkStudents('');
  }

  function handleDeleteStudent(studentId: string) {
    updateActiveClassroom((classroom) => ({
      ...classroom,
      students: classroom.students.filter((student) => student.id !== studentId),
      rules: classroom.rules.filter(
        (rule) => rule.studentAId !== studentId && rule.studentBId !== studentId,
      ),
      seats: removeStudentFromSeats(classroom.seats, studentId),
      updatedAt: new Date().toISOString(),
    }));

    if (selectedStudentIds.includes(studentId)) {
      setSelectedStudentIds((current) => current.filter((id) => id !== studentId));
    }
  }

  function swapStudentSeats(firstStudentId: string, secondStudentId: string) {
    if (!activeClassroom || firstStudentId === secondStudentId) {
      return;
    }

    updateActiveClassroom((classroom) => {
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
        updatedAt: new Date().toISOString(),
      };
    });
  }

  function handleStudentSelect(studentId: string) {
    if (clearSelectedStudentsTimeoutRef.current) {
      window.clearTimeout(clearSelectedStudentsTimeoutRef.current);
      clearSelectedStudentsTimeoutRef.current = null;
    }

    setSelectedStudentIds((current) => {
      if (current.includes(studentId)) {
        return current.filter((id) => id !== studentId);
      }

      if (current.length >= 2) {
        return [studentId];
      }

      return [...current, studentId];
    });
  }

  function handleToggleSeatPin(seatId: string) {
    updateActiveClassroom((classroom) => ({
      ...classroom,
      seats: classroom.seats.map((seat) =>
        seat.id === seatId && seat.assignedStudentId ? { ...seat, fixed: !seat.fixed } : seat,
      ),
      updatedAt: new Date().toISOString(),
    }));
  }

  function handleAddRule() {
    if (!activeClassroom) {
      return;
    }

    if (
      !ruleDraft.studentAId ||
      !ruleDraft.studentBId ||
      ruleDraft.studentAId === ruleDraft.studentBId
    ) {
      return;
    }

    const exists = activeClassroom.rules.some(
      (rule) =>
        (rule.studentAId === ruleDraft.studentAId && rule.studentBId === ruleDraft.studentBId) ||
        (rule.studentAId === ruleDraft.studentBId && rule.studentBId === ruleDraft.studentAId),
    );

    if (exists) {
      return;
    }

    const nextRule: ConflictRule = {
      id: createId('rule'),
      studentAId: ruleDraft.studentAId,
      studentBId: ruleDraft.studentBId,
    };

    updateActiveClassroom((classroom) => ({
      ...classroom,
      rules: [...classroom.rules, nextRule],
      updatedAt: new Date().toISOString(),
    }));
    setRuleDraft({ studentAId: '', studentBId: '' });
  }

  function handleDeleteRule(ruleId: string) {
    updateActiveClassroom((classroom) => ({
      ...classroom,
      rules: classroom.rules.filter((rule) => rule.id !== ruleId),
      updatedAt: new Date().toISOString(),
    }));
  }

  function handleRandomize() {
    if (!activeClassroom) {
      return;
    }

    startTransition(() => {
      const result = randomizeSeats(activeClassroom);

      updateActiveClassroom((classroom) => ({
        ...classroom,
        seats: result.seats,
        updatedAt: new Date().toISOString(),
      }));
      setRandomSummary({
        conflicts: result.conflicts,
        genderMisses: result.genderMisses,
        unplacedStudents: result.unplacedStudents,
      });
    });
    setSelectedStudentIds([]);
  }

  function handleSaveSnapshot() {
    if (!activeClassroom) {
      return;
    }

    const name = window.prompt(
      '저장본 이름을 입력하세요.',
      `${classroomTitle(activeClassroom)} ${new Date().toLocaleDateString('ko-KR')}`,
    );

    if (!name) {
      return;
    }

    updateActiveClassroom((classroom) => ({
      ...classroom,
      snapshots: [createSnapshot(name, classroom, classroom.lastViewMode), ...classroom.snapshots],
      updatedAt: new Date().toISOString(),
    }));
  }

  function handleRestoreSnapshot(snapshotId: string) {
    if (!activeClassroom) {
      return;
    }

    const snapshot = activeClassroom.snapshots.find((item) => item.id === snapshotId);

    if (!snapshot) {
      return;
    }

    updateActiveClassroom((classroom) => ({
      ...classroom,
      seats: cloneSeats(snapshot.seats),
      groups: cloneGroups(snapshot.groups),
      layoutConfig: { ...snapshot.layoutConfig },
      lastViewMode: snapshot.viewMode,
      updatedAt: new Date().toISOString(),
    }));
  }

  function handlePrint(nextMode: ViewMode) {
    applyPrintLayout(renderCanvasWidth, renderCanvasHeight);

    updateActiveClassroom((classroom) => ({
      ...classroom,
      lastViewMode: nextMode,
      updatedAt: new Date().toISOString(),
    }));

    setData((current) => ({
      ...current,
      recentPrintMode: nextMode,
    }));

    window.setTimeout(() => {
      window.print();
    }, 80);
  }

  function handleViewModeChange(nextMode: ViewMode) {
    updateActiveClassroom((classroom) => ({
      ...classroom,
      lastViewMode: nextMode,
      updatedAt: new Date().toISOString(),
    }));
  }

  function handleGenderModeChange(nextMode: GenderMode) {
    updateActiveClassroom((classroom) => ({
      ...classroom,
      randomSettings: {
        ...classroom.randomSettings,
        genderMode: nextMode,
      },
      updatedAt: new Date().toISOString(),
    }));
  }

  function handleResetLayout() {
    if (!activeClassroom) {
      return;
    }

    const nextLayout = createPresetLayout(activeClassroom.layoutConfig);
    const seatStateByLabel = new Map(
      activeClassroom.seats.map((seat) => [
        seat.label,
        {
          assignedStudentId: seat.assignedStudentId,
          fixed: seat.fixed,
        },
      ]),
    );
    const groupStateByLabel = new Map(
      activeClassroom.groups.map((group) => [
        group.label,
        {
          color: group.color,
        },
      ]),
    );

    updateActiveClassroom((classroom) => ({
      ...classroom,
      seats: nextLayout.seats.map((seat) => {
        const currentState = seatStateByLabel.get(seat.label);

        return {
          ...seat,
          assignedStudentId: currentState?.assignedStudentId ?? null,
          fixed: currentState?.assignedStudentId ? currentState.fixed : false,
        };
      }),
      groups: nextLayout.groups.map((group) => ({
        ...group,
        color: groupStateByLabel.get(group.label)?.color ?? group.color,
      })),
      updatedAt: new Date().toISOString(),
    }));
    setSelectedStudentIds([]);
  }

  function handleGroupDragStart(event: ReactPointerEvent<HTMLButtonElement>, groupId: string) {
    if (!activeClassroom || viewMode !== 'teacher') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const groupSeats = activeClassroom.seats.filter((seat) => seat.groupId === groupId);

    if (groupSeats.length === 0) {
      return;
    }

    const startSeatPositions = Object.fromEntries(
      groupSeats.map((seat) => [seat.id, { x: seat.x, y: seat.y }]),
    );
    const minX = Math.min(...groupSeats.map((seat) => seat.x));
    const maxX = Math.max(
      ...groupSeats.map((seat) => seat.x + SEAT_CARD_WIDTH + getSeatVisibleOverhang(seat, viewMode)),
    );
    const minY = Math.min(...groupSeats.map((seat) => seat.y));
    const maxY = Math.max(...groupSeats.map((seat) => seat.y + SEAT_CARD_HEIGHT));

    setDragState({
      groupId,
      flipped: flippedView,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startSeatPositions,
      minDeltaX: CANVAS_PADDING_X + GROUP_OUTLINE_PADDING - (minX + renderOffsetX),
      maxDeltaX: renderCanvasWidth - CANVAS_PADDING_X - GROUP_OUTLINE_PADDING - (maxX + renderOffsetX),
      minDeltaY: CANVAS_PADDING_Y + GROUP_OUTLINE_PADDING - minY,
      maxDeltaY: renderCanvasHeight - CANVAS_PADDING_Y + 4 - GROUP_OUTLINE_PADDING - maxY,
    });
  }

  function applyGroupDelta(groupId: string, deltaX: number, deltaY: number) {
    updateActiveClassroom((classroom) => ({
      ...classroom,
      seats: classroom.seats.map((seat) => {
        const startPosition = dragState?.startSeatPositions[seat.id];

        if (seat.groupId !== groupId || !startPosition) {
          return seat;
        }

        return {
          ...seat,
          x: startPosition.x + deltaX,
          y: startPosition.y + deltaY,
        };
      }),
      updatedAt: new Date().toISOString(),
    }));
  }

  const handleWindowPointerMove = useEffectEvent((event: PointerEvent) => {
    if (!dragState || event.pointerId !== dragState.pointerId || !activeClassroom) {
      return;
    }

    const rawDeltaX = event.clientX - dragState.startClientX;
    const rawDeltaY = event.clientY - dragState.startClientY;
    const nextDeltaX = dragState.flipped ? -rawDeltaX : rawDeltaX;
    const nextDeltaY = dragState.flipped ? -rawDeltaY : rawDeltaY;
    const deltaX = Math.max(
      dragState.minDeltaX,
      Math.min(dragState.maxDeltaX, nextDeltaX),
    );
    const deltaY = Math.max(
      dragState.minDeltaY,
      Math.min(dragState.maxDeltaY, nextDeltaY),
    );

    applyGroupDelta(dragState.groupId, deltaX, deltaY);
  });

  const handleWindowPointerUp = useEffectEvent((event: PointerEvent) => {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }

    const pointerDeltaX = event.clientX - dragState.startClientX;
    const pointerDeltaY = event.clientY - dragState.startClientY;
    const rawDeltaX = Math.max(
      dragState.minDeltaX,
      Math.min(dragState.maxDeltaX, dragState.flipped ? -pointerDeltaX : pointerDeltaX),
    );
    const rawDeltaY = Math.max(
      dragState.minDeltaY,
      Math.min(dragState.maxDeltaY, dragState.flipped ? -pointerDeltaY : pointerDeltaY),
    );
    const snappedDeltaX = Math.round(rawDeltaX / SNAP_GRID) * SNAP_GRID;
    const snappedDeltaY = Math.round(rawDeltaY / SNAP_GRID) * SNAP_GRID;

    applyGroupDelta(
      dragState.groupId,
      Math.max(dragState.minDeltaX, Math.min(dragState.maxDeltaX, snappedDeltaX)),
      Math.max(dragState.minDeltaY, Math.min(dragState.maxDeltaY, snappedDeltaY)),
    );
    setDragState(null);
  });

  useEffect(() => {
    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
    };
  }, [handleWindowPointerMove, handleWindowPointerUp]);

  useEffect(() => {
    const shell = boardShellRef.current;

    if (!shell) {
      return;
    }

    const updateScale = () => {
      const nextScale = Math.min(1, (shell.clientWidth - 40) / renderCanvasWidth);
      setBoardScale(Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1);
    };

    updateScale();

    const observer = new ResizeObserver(() => {
      updateScale();
    });

    observer.observe(shell);

    return () => {
      observer.disconnect();
    };
  }, [renderCanvasHeight, renderCanvasWidth]);

  useEffect(() => {
    if (!classroomMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const picker = classroomPickerRef.current;

      if (!picker) {
        return;
      }

      if (!picker.contains(event.target as Node)) {
        setClassroomMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setClassroomMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [classroomMenuOpen]);

  useEffect(() => {
    if (!createPanelOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const panel = createPanelRef.current;

      if (!panel) {
        return;
      }

      if (!panel.contains(event.target as Node)) {
        setCreatePanelOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCreatePanelOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [createPanelOpen]);

  return (
    <div className="app-shell">
      <main className="workspace">
        {activeClassroom ? (
          <>
            <header className="topbar">
              <div className="topbar-left">
                <div
                  ref={classroomPickerRef}
                  className={`classroom-picker header-classroom-picker ${classroomMenuOpen ? 'open' : ''}`}
                >
                  <button
                    className="classroom-picker-trigger"
                    type="button"
                    onClick={() => {
                      setClassroomMenuOpen((current) => !current);
                      setCreatePanelOpen(false);
                    }}
                  >
                    <div>
                      <strong>{classroomTitle(activeClassroom)}</strong>
                      <span>{activeClassroom.students.length}명</span>
                    </div>
                    <span>{classroomMenuOpen ? '닫기' : '반 선택'}</span>
                  </button>
                  <div className="classroom-picker-menu">
                    {data.classrooms.map((classroom) => (
                      <button
                        key={classroom.id}
                        className={`classroom-card ${classroom.id === data.activeClassroomId ? 'active' : ''}`}
                        type="button"
                        onClick={() => handleSelectClassroom(classroom.id)}
                      >
                        <strong>{classroomTitle(classroom)}</strong>
                        <span>{classroom.students.length}명</span>
                      </button>
                    ))}
                  </div>
                </div>
                <span className="autosave-pill">자동저장 {formatTime(lastSavedAt)}</span>
              </div>
              <div className="topbar-actions">
                <div
                  ref={createPanelRef}
                  className={`topbar-create-wrap print-hidden ${createPanelOpen ? 'open' : ''}`}
                >
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      setCreatePanelOpen((current) => !current);
                      setClassroomMenuOpen(false);
                    }}
                  >
                    새 반
                  </button>
                  {createPanelOpen ? (
                    <div className="panel topbar-create-panel">
                      <div className="mini-title">새 반 만들기</div>
                      <label className="field">
                        <span>학년</span>
                        <input
                          value={newClassroom.grade}
                          onChange={(event) =>
                            setNewClassroom((current) => ({ ...current, grade: event.target.value }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>반</span>
                        <input
                          value={newClassroom.className}
                          onChange={(event) =>
                            setNewClassroom((current) => ({ ...current, className: event.target.value }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>교실</span>
                        <input
                          value={newClassroom.subjectRoomName}
                          onChange={(event) =>
                            setNewClassroom((current) => ({
                              ...current,
                              subjectRoomName: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <button className="primary-button" type="button" onClick={handleCreateClassroom}>
                        반 추가
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="button-row print-hidden">
                  <button
                    className={viewMode === 'teacher' ? 'mode-button active' : 'mode-button'}
                    type="button"
                    onClick={() => handleViewModeChange('teacher')}
                  >
                    교사 관점
                  </button>
                  <button
                    className={viewMode === 'student' ? 'mode-button active' : 'mode-button'}
                    type="button"
                    onClick={() => handleViewModeChange('student')}
                  >
                    학생 관점
                  </button>
                </div>
                <div className="button-row print-hidden">
                  <button className="secondary-button" type="button" onClick={handleSaveSnapshot}>
                    현재 배치 저장
                  </button>
                  <button className="secondary-button" type="button" onClick={() => handlePrint('teacher')}>
                    교사용 인쇄
                  </button>
                  <button className="secondary-button" type="button" onClick={() => handlePrint('student')}>
                    학생용 인쇄
                  </button>
                </div>
              </div>
            </header>

            <section className="workspace-grid">
              <section className="canvas-section">
                <div className="canvas-toolbar print-hidden">
                  <button
                    className="secondary-button toolbar-icon-button"
                    type="button"
                    onClick={handleResetLayout}
                    aria-label="레이아웃 리셋"
                    title="레이아웃 리셋"
                  >
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path
                        d="M4.5 8A5.5 5.5 0 1 1 6 14.5"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.8"
                      />
                      <path
                        d="M4.5 3.5V8h4.5"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.8"
                      />
                    </svg>
                  </button>
                  <div className="selection-hint">
                    학생 두 명 클릭: 자리 교환 / 핀 버튼: 고정 / 모둠 라벨 드래그: 블록 이동
                  </div>
                </div>

                <div ref={boardShellRef} className="board-shell">
                  <div className="board-stage" style={{ height: renderCanvasHeight * boardScale }}>
                    <div
                      className="board-canvas"
                      style={{
                        width: renderCanvasWidth,
                        height: renderCanvasHeight,
                        transform: `scale(${boardScale})`,
                      }}
                    >
                    <div
                      className={`board-label ${flippedView ? 'student-anchor' : ''}`}
                      style={{ left: boardCenterX }}
                    >
                      {activeClassroom.boardLabel}
                    </div>

                    {activeClassroom.groups.map((group) => {
                      const groupSeats = activeClassroom.seats.filter((seat) => group.seatIds.includes(seat.id));

                      if (groupSeats.length === 0) {
                        return null;
                      }

                      const minX = Math.min(...groupSeats.map((seat) => seat.x));
                      const minY = Math.min(...groupSeats.map((seat) => seat.y));
                      const maxX = Math.max(...groupSeats.map((seat) => seat.x));
                      const maxY = Math.max(...groupSeats.map((seat) => seat.y));
                      const groupFrame = flipFrame(
                        minX - GROUP_OUTLINE_PADDING + renderOffsetX,
                        minY - GROUP_OUTLINE_PADDING,
                        maxX - minX + SEAT_CARD_WIDTH + GROUP_OUTLINE_PADDING * 2,
                        maxY - minY + SEAT_CARD_HEIGHT + GROUP_OUTLINE_PADDING * 2,
                        renderCanvasWidth,
                        renderCanvasHeight,
                        viewMode,
                      );

                      return (
                        <div
                          key={group.id}
                          className="seat-group-outline"
                          style={{
                            left: groupFrame.left,
                            top: groupFrame.top,
                            width: maxX - minX + SEAT_CARD_WIDTH + GROUP_OUTLINE_PADDING * 2,
                            height: maxY - minY + SEAT_CARD_HEIGHT + GROUP_OUTLINE_PADDING * 2,
                            borderColor: group.color,
                            backgroundColor: `${group.color}22`,
                          }}
                        >
                          {viewMode === 'teacher' ? (
                            <button
                              className="group-badge"
                              type="button"
                              onPointerDown={(event) => handleGroupDragStart(event, group.id)}
                            >
                              {group.label}
                            </button>
                          ) : (
                            <span className="group-badge">{group.label}</span>
                          )}
                        </div>
                      );
                    })}

                    {activeClassroom.seats.map((seat) => {
                      const student = activeClassroom.students.find(
                        (candidate) => candidate.id === seat.assignedStudentId,
                      );
                      const studentSelected = student ? selectedStudentIds.includes(student.id) : false;
                      const seatFrame = flipFrame(
                        seat.x + renderOffsetX,
                        seat.y,
                        SEAT_CARD_WIDTH,
                        SEAT_CARD_HEIGHT,
                        renderCanvasWidth,
                        renderCanvasHeight,
                        viewMode,
                      );

                      return (
                        <div
                          key={seat.id}
                          className={`seat-card ${seat.fixed ? 'fixed' : ''} ${student ? 'clickable' : ''} ${studentSelected ? 'active' : ''}`}
                          style={{ left: seatFrame.left, top: seatFrame.top }}
                          onClick={() => {
                            if (student && viewMode === 'teacher') {
                              handleStudentSelect(student.id);
                            }
                          }}
                          role={student && viewMode === 'teacher' ? 'button' : undefined}
                          tabIndex={student && viewMode === 'teacher' ? 0 : undefined}
                        >
                          <div className="seat-content">
                            {student && viewMode === 'teacher' ? (
                              <button
                                className={`seat-pin-button ${seat.fixed ? 'active' : ''}`}
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleToggleSeatPin(seat.id);
                                }}
                                aria-label={seat.fixed ? '고정 해제' : '자리 고정'}
                                title={seat.fixed ? '고정 해제' : '자리 고정'}
                              >
                                <svg viewBox="0 0 20 20" aria-hidden="true">
                                  <path
                                    d="M7 3h6l-1.6 4.4 2.9 2.6H5.7l2.9-2.6L7 3Zm3 7.2V17"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="1.6"
                                  />
                                </svg>
                              </button>
                            ) : null}
                            <strong>{student?.name || '빈자리'}</strong>
                            <span className="seat-meta">
                              {student
                                ? `${student.number ? `${student.number}번` : '번호 없음'} · ${
                                    student.gender === 'male'
                                      ? '남'
                                      : student.gender === 'female'
                                        ? '여'
                                        : '성별 미입력'
                                  }`
                                : '미배치'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  </div>
                </div>
              </section>

              <aside className="inspector print-hidden">
                <div className="inspector-tabs">
                  <button
                    className={inspectorTab === 'layout' ? 'mode-button active' : 'mode-button'}
                    type="button"
                    onClick={() => setInspectorTab('layout')}
                  >
                    빠른 설정
                  </button>
                  <button
                    className={inspectorTab === 'students' ? 'mode-button active' : 'mode-button'}
                    type="button"
                    onClick={() => setInspectorTab('students')}
                  >
                    학생
                  </button>
                  <button
                    className={inspectorTab === 'rules' ? 'mode-button active' : 'mode-button'}
                    type="button"
                    onClick={() => setInspectorTab('rules')}
                  >
                    규칙
                  </button>
                  <button
                    className={inspectorTab === 'saved' ? 'mode-button active' : 'mode-button'}
                    type="button"
                    onClick={() => setInspectorTab('saved')}
                  >
                    저장본
                  </button>
                </div>

                {inspectorTab === 'layout' ? (
                  <>
                    <div className="inspector-section">
                      <div className="mini-title">좌석 프리셋</div>
                      <label className="field">
                        <span>유형</span>
                        <select
                          value={presetType}
                          onChange={(event) => {
                            const nextPreset = event.target.value as SeatPreset;
                            setPresetType(nextPreset);
                            setPresetVariant(getDefaultVariant(nextPreset));
                          }}
                        >
                          {Object.entries(PRESET_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>형태</span>
                        <select
                          value={presetVariant}
                          onChange={(event) => setPresetVariant(event.target.value as DeskVariant)}
                        >
                          {getVariantOptions(presetType).map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="preset-grid-fields">
                        <label className="field">
                          <span>{presetType === 'single' ? '행' : '블록 행'}</span>
                          <input
                            min={1}
                            type="number"
                            value={presetRows}
                            onChange={(event) => setPresetRows(Number(event.target.value) || 1)}
                          />
                        </label>
                        <label className="field">
                          <span>{presetType === 'single' ? '열' : '블록 열'}</span>
                          <input
                            min={1}
                            type="number"
                            value={presetCols}
                            onChange={(event) => setPresetCols(Number(event.target.value) || 1)}
                          />
                        </label>
                      </div>
                      <div className="status-card compact-status">
                        <span>
                          생성 결과: {presetRows * presetCols}
                          {presetType === 'single' ? '자리' : '개 책상 블록'}
                        </span>
                        <span>
                          총 좌석 수: {presetRows * presetCols * (presetType === 'single' ? 1 : presetType === 'pair' ? 2 : presetType === 'group4' ? 4 : 6)}석
                        </span>
                        <span>모둠 라벨을 잡고 끌면 블록 전체가 칸에 맞춰 이동합니다.</span>
                      </div>
                      <button className="primary-button" type="button" onClick={handleApplyPreset}>
                        프리셋 생성
                      </button>
                    </div>

                    <div className="inspector-section">
                      <div className="mini-title">랜덤 배치</div>
                      <div className="segment-control">
                        {Object.entries(GENDER_MODE_LABELS).map(([value, label]) => (
                          <button
                            key={value}
                            className={
                              activeClassroom.randomSettings.genderMode === value
                                ? 'mode-button active'
                                : 'mode-button'
                            }
                            type="button"
                            onClick={() => handleGenderModeChange(value as GenderMode)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <button className="primary-button" type="button" onClick={handleRandomize}>
                        조건 반영 랜덤 배치
                      </button>
                      {randomSummary ? (
                        <div className="status-card">
                          <span>금지 조합 충돌: {randomSummary.conflicts}</span>
                          <span>성별 조건 미충족: {randomSummary.genderMisses}</span>
                          <span>자리 부족 미배치: {randomSummary.unplacedStudents}</span>
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : null}

                {inspectorTab === 'students' ? (
                  <>
                    <div className="inspector-section">
                      <div className="mini-title">학생 추가</div>
                      <p className="helper-text">
                        엑셀에서 `번호 / 이름 / 성별` 3칸을 그대로 복사해서 붙여넣을 수 있습니다.
                      </p>
                      <textarea
                        rows={7}
                        placeholder={'예시\n1\t김하늘\t여\n2\t박준서\t남'}
                        value={bulkStudents}
                        onChange={(event) => setBulkStudents(event.target.value)}
                      />
                      <button className="primary-button" type="button" onClick={handleAddStudents}>
                        학생 명단 추가
                      </button>
                    </div>

                    <div className="inspector-section">
                      <div className="mini-title">학생 목록</div>
                      <p className="helper-text">학생 두 명을 차례로 클릭하면 자리가 서로 바뀝니다.</p>
                      {selectedStudentIds.length > 0 ? (
                        <div className="status-card compact-status">
                          <span>
                            선택됨: {selectedStudentIds.map((studentId) => getStudentName(activeClassroom, studentId)).join(' · ')}
                          </span>
                        </div>
                      ) : null}
                      <div className="student-list">
                        {activeClassroom.students.map((student) => {
                          const assignedSeat = activeClassroom.seats.find(
                            (seat) => seat.assignedStudentId === student.id,
                          );

                          return (
                            <div key={student.id} className="student-row">
                              <button
                                className={`student-chip ${selectedStudentIds.includes(student.id) ? 'active' : ''}`}
                                type="button"
                                onClick={() => handleStudentSelect(student.id)}
                              >
                                <div>
                                  <strong>
                                    {student.number ? `${student.number}. ` : ''}
                                    {student.name}
                                  </strong>
                                  <span>
                                    {student.gender === 'male'
                                      ? '남'
                                      : student.gender === 'female'
                                        ? '여'
                                        : '미입력'}
                                    {' · '}
                                    {getGroupLabelForSeat(activeClassroom, assignedSeat ?? null)}
                                  </span>
                                </div>
                              </button>
                              <div className="student-actions">
                                <button
                                  className="ghost-button"
                                  type="button"
                                  onClick={() => handleDeleteStudent(student.id)}
                                >
                                  삭제
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : null}

                {inspectorTab === 'rules' ? (
                  <div className="inspector-section">
                    <div className="mini-title">만나면 안 되는 학생</div>
                    <label className="field">
                      <span>학생 A</span>
                      <select
                        value={ruleDraft.studentAId}
                        onChange={(event) =>
                          setRuleDraft((current) => ({ ...current, studentAId: event.target.value }))
                        }
                      >
                        <option value="">선택</option>
                        {activeClassroom.students.map((student) => (
                          <option key={student.id} value={student.id}>
                            {student.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>학생 B</span>
                      <select
                        value={ruleDraft.studentBId}
                        onChange={(event) =>
                          setRuleDraft((current) => ({ ...current, studentBId: event.target.value }))
                        }
                      >
                        <option value="">선택</option>
                        {activeClassroom.students.map((student) => (
                          <option key={student.id} value={student.id}>
                            {student.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="primary-button" type="button" onClick={handleAddRule}>
                      규칙 추가
                    </button>
                    <div className="rule-list">
                      {activeClassroom.rules.map((rule) => (
                        <div key={rule.id} className="rule-item">
                          <span>
                            {getStudentName(activeClassroom, rule.studentAId)} ·{' '}
                            {getStudentName(activeClassroom, rule.studentBId)}
                          </span>
                          <button className="ghost-button" type="button" onClick={() => handleDeleteRule(rule.id)}>
                            삭제
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {inspectorTab === 'saved' ? (
                  <div className="inspector-section">
                    <div className="mini-title">저장본</div>
                    <div className="snapshot-list">
                      {activeClassroom.snapshots.map((snapshot) => (
                        <button
                          key={snapshot.id}
                          className="snapshot-card"
                          type="button"
                          onClick={() => handleRestoreSnapshot(snapshot.id)}
                        >
                          <strong>{snapshot.name}</strong>
                          <span>{new Date(snapshot.createdAt).toLocaleString('ko-KR')}</span>
                        </button>
                      ))}
                      {activeClassroom.snapshots.length === 0 ? (
                        <p className="helper-text">현재 배치 저장 버튼으로 반별 저장본을 만들 수 있습니다.</p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </aside>
            </section>
          </>
        ) : (
          <section className="empty-state">
            <h2>반이 없습니다.</h2>
            <p>왼쪽에서 새 반을 만들거나 샘플 반을 불러오면 바로 시작할 수 있습니다.</p>
          </section>
        )}
      </main>
    </div>
  );
}
