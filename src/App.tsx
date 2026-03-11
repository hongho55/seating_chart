import { startTransition, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ClassroomOverflowMenu } from './components/ClassroomOverflowMenu';
import { createId } from './lib/ids';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CANVAS_PADDING_X,
  CANVAS_PADDING_Y,
  getDefaultVariant,
  getVariantOptions,
  GROUP_OUTLINE_PADDING,
  SEAT_CARD_HEIGHT,
  SEAT_CARD_WIDTH,
} from './lib/layouts';
import { inferGenderFromText, randomizeSeats } from './lib/randomize';
import {
  addRuleToClassroom,
  addStudentsToClassroom,
  applyClassroomPreset,
  canAddRuleToClassroom,
  deleteRuleFromClassroom,
  deleteStudentFromClassroom,
  resetClassroomStudents,
  restoreSnapshotInClassroom,
  saveClassroomSnapshot,
  setClassroomSeats,
  swapStudentsInClassroom,
  toggleSeatPinInClassroom,
} from './lib/classroomActions';
import {
  createBasePlanEditMode,
  createDefaultAppMode,
  isBasePlanEditMode,
} from './lib/appMode';
import {
  createBackupFile,
  createEmptyClassroom,
  loadAppData,
  parseBackupFile,
  saveAppData,
} from './lib/storage';
import type {
  AppData,
  Classroom,
  DeskVariant,
  GenderMode,
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

const PRINT_MARGIN_MM = 8;
const MM_TO_PX = 96 / 25.4;
const PRINT_SAFETY_SCALE = 0.96;
const SEAT_PIN_OVERHANG = 12;

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

function createBackupFilename(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const date = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `seating-chart-backup-${year}${month}${date}-${hours}${minutes}${seconds}.json`;
}

function downloadTextFile(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: 'application/json;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.URL.revokeObjectURL(url);
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
  const [appMode, setAppMode] = useState(() => createDefaultAppMode());
  const [classroomMenuOpen, setClassroomMenuOpen] = useState(false);
  const [createPanelOpen, setCreatePanelOpen] = useState(false);
  const [boardScale, setBoardScale] = useState(1);
  const boardShellRef = useRef<HTMLDivElement | null>(null);
  const classroomPickerRef = useRef<HTMLDivElement | null>(null);
  const createPanelRef = useRef<HTMLDivElement | null>(null);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);
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
  const basePlanEditModeActive = isBasePlanEditMode(appMode, activeClassroom?.id ?? null);
  const viewMode = activeClassroom?.lastViewMode ?? 'teacher';
  const layoutBounds = activeClassroom ? getVisibleLayoutBounds(activeClassroom, viewMode) : null;
  const layoutVisibleWidth = layoutBounds
    ? layoutBounds.maxX - layoutBounds.minX
    : CANVAS_WIDTH - CANVAS_PADDING_X * 2;
  const renderCanvasWidth = Math.max(
    CANVAS_PADDING_X * 2 + SEAT_CARD_WIDTH,
    layoutVisibleWidth + CANVAS_PADDING_X * 2,
  );
  const renderOffsetX = layoutBounds
    ? CANVAS_PADDING_X - layoutBounds.minX
    : 0;
  const renderCanvasHeight = Math.max(
    CANVAS_PADDING_Y * 2 + SEAT_CARD_HEIGHT,
    (layoutBounds?.maxY ?? SEAT_CARD_HEIGHT) + CANVAS_PADDING_Y + 12,
  );
  const flippedView = isFlippedView(viewMode);
  const scaledBoardWidth = renderCanvasWidth * boardScale;
  const scaledBoardHeight = renderCanvasHeight * boardScale;
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

  function openBackupImportPicker() {
    backupFileInputRef.current?.click();
  }

  function handleCreateClassroom() {
    const classroom = createEmptyClassroom(newClassroom);

    setData((current) => ({
      ...current,
      classrooms: [...current.classrooms, classroom],
      activeClassroomId: classroom.id,
    }));
    setAppMode(createDefaultAppMode());
    setSelectedStudentIds([]);
    setCreatePanelOpen(false);
  }

  function handleDeleteActiveClassroom() {
    if (!activeClassroom) {
      return;
    }

    const confirmMessage =
      data.classrooms.length === 1
        ? `"${classroomTitle(activeClassroom)}"을 삭제하면 반이 없는 상태가 됩니다. 계속할까요?`
        : `"${classroomTitle(activeClassroom)}"을 삭제할까요?`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setData((current) => {
      const deletedIndex = current.classrooms.findIndex(
        (classroom) => classroom.id === activeClassroom.id,
      );
      const classrooms = current.classrooms.filter((classroom) => classroom.id !== activeClassroom.id);
      const fallbackClassroom =
        classrooms[Math.min(deletedIndex, classrooms.length - 1)] ?? classrooms[0] ?? null;

      return {
        ...current,
        classrooms,
        activeClassroomId: fallbackClassroom?.id ?? null,
      };
    });
    setSelectedStudentIds([]);
    setRandomSummary(null);
    setRuleDraft({ studentAId: '', studentBId: '' });
    setAppMode(createDefaultAppMode());
    setClassroomMenuOpen(false);
    setCreatePanelOpen(false);
  }

  function handleSelectClassroom(classroomId: string) {
    setData((current) => ({
      ...current,
      activeClassroomId: classroomId,
    }));
    setAppMode(createDefaultAppMode());
    setClassroomMenuOpen(false);
    setSelectedStudentIds([]);
    setRandomSummary(null);
  }

  function handleToggleBasePlanEditMode() {
    if (!activeClassroom) {
      return;
    }

    setAppMode((current) =>
      isBasePlanEditMode(current, activeClassroom.id)
        ? createDefaultAppMode()
        : createBasePlanEditMode(activeClassroom.id),
    );
    setSelectedStudentIds([]);
    setClassroomMenuOpen(false);
    setCreatePanelOpen(false);
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

    updateActiveClassroom((classroom) =>
      applyClassroomPreset(classroom, {
        preset: presetType,
        rows: presetRows,
        cols: presetCols,
        variant: presetVariant,
      }),
    );
    setSelectedStudentIds([]);
    setRandomSummary(null);
  }

  function handleAddStudents() {
    const parsedStudents = parseStudentLines(bulkStudents);

    if (!activeClassroom || parsedStudents.length === 0) {
      return;
    }

    updateActiveClassroom((classroom) => addStudentsToClassroom(classroom, parsedStudents));
    setBulkStudents('');
  }

  function handleResetStudents() {
    if (!activeClassroom || activeClassroom.students.length === 0) {
      return;
    }

    const shouldReset = window.confirm(
      `"${classroomTitle(activeClassroom)}"의 학생 ${activeClassroom.students.length}명, 자리 배치, 금지 규칙을 모두 초기화할까요?`,
    );

    if (!shouldReset) {
      return;
    }

    updateActiveClassroom(resetClassroomStudents);
    setSelectedStudentIds([]);
    setRuleDraft({ studentAId: '', studentBId: '' });
    setRandomSummary(null);
  }

  function handleDeleteStudent(studentId: string) {
    updateActiveClassroom((classroom) => deleteStudentFromClassroom(classroom, studentId));

    if (selectedStudentIds.includes(studentId)) {
      setSelectedStudentIds((current) => current.filter((id) => id !== studentId));
    }
  }

  function swapStudentSeats(firstStudentId: string, secondStudentId: string) {
    if (!activeClassroom || firstStudentId === secondStudentId) {
      return;
    }

    updateActiveClassroom((classroom) =>
      swapStudentsInClassroom(classroom, firstStudentId, secondStudentId),
    );
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
    updateActiveClassroom((classroom) => toggleSeatPinInClassroom(classroom, seatId));
  }

  function handleAddRule() {
    if (!activeClassroom) {
      return;
    }

    if (!canAddRuleToClassroom(activeClassroom, ruleDraft.studentAId, ruleDraft.studentBId)) {
      return;
    }

    updateActiveClassroom((classroom) =>
      addRuleToClassroom(classroom, ruleDraft.studentAId, ruleDraft.studentBId),
    );
    setRuleDraft({ studentAId: '', studentBId: '' });
  }

  function handleDeleteRule(ruleId: string) {
    updateActiveClassroom((classroom) => deleteRuleFromClassroom(classroom, ruleId));
  }

  function handleRandomize() {
    if (!activeClassroom) {
      return;
    }

    startTransition(() => {
      const result = randomizeSeats(activeClassroom);

      updateActiveClassroom((classroom) => setClassroomSeats(classroom, result.seats));
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

    updateActiveClassroom((classroom) => saveClassroomSnapshot(classroom, name));
  }

  function handleRestoreSnapshot(snapshotId: string) {
    if (!activeClassroom) {
      return;
    }

    const nextClassroom = restoreSnapshotInClassroom(activeClassroom, snapshotId);

    if (nextClassroom === activeClassroom) {
      return;
    }

    updateActiveClassroom((classroom) => restoreSnapshotInClassroom(classroom, snapshotId));
  }

  function handleDownloadBackup() {
    downloadTextFile(createBackupFilename(), createBackupFile(data));
  }

  function handleBackupFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const raw = typeof reader.result === 'string' ? reader.result : '';
      const { data: importedData, error } = parseBackupFile(raw);

      if (!importedData) {
        window.alert(error ? `백업 파일을 가져올 수 없습니다: ${error}` : '올바른 좌석표 백업 파일이 아닙니다.');
        return;
      }

      const shouldReplace = window.confirm(
        `현재 저장된 반 ${data.classrooms.length}개를 백업 파일 내용으로 덮어쓸까요?`,
      );

      if (!shouldReplace) {
        return;
      }

      setData(importedData);
      setLastSavedAt(new Date().toISOString());
      setSelectedStudentIds([]);
      setBulkStudents('');
      setRuleDraft({ studentAId: '', studentBId: '' });
      setRandomSummary(null);
      setAppMode(createDefaultAppMode());
      setClassroomMenuOpen(false);
      setCreatePanelOpen(false);
    };

    reader.onerror = () => {
      window.alert('백업 파일을 읽지 못했습니다.');
    };

    reader.readAsText(file, 'utf-8');
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

  useEffect(() => {
    const shell = boardShellRef.current;

    if (!shell) {
      return;
    }

    const updateScale = () => {
      const availableWidth = Math.max(shell.clientWidth - 12, 1);
      const nextScale = Math.min(1, availableWidth / renderCanvasWidth);
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
      <input
        ref={backupFileInputRef}
        accept=".json,application/json"
        hidden
        type="file"
        onChange={handleBackupFileChange}
      />
      <main className="workspace">
        {activeClassroom ? (
          <>
            <header className={`topbar ${basePlanEditModeActive ? 'base-plan-edit-active' : ''}`}>
              <div className="topbar-left">
                <div className="classroom-selector-controls">
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
                  <ClassroomOverflowMenu
                    isBasePlanEditMode={basePlanEditModeActive}
                    onToggleBasePlanEditMode={handleToggleBasePlanEditMode}
                  />
                </div>
                {basePlanEditModeActive ? <span className="mode-status-pill">기준 배치 편집 중</span> : null}
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
                <button
                  className="danger-button print-hidden"
                  type="button"
                  onClick={handleDeleteActiveClassroom}
                >
                  반 삭제
                </button>
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
                <div ref={boardShellRef} className="board-shell">
                  <div className="board-stage" style={{ height: scaledBoardHeight }}>
                    <div
                      className="board-stage-inner"
                      style={{ width: scaledBoardWidth, height: scaledBoardHeight }}
                    >
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
                          const groupSeats = activeClassroom.seats.filter((seat) =>
                            group.seatIds.includes(seat.id),
                          );

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
                              <span className="group-badge">{group.label}</span>
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
                </div>
              </section>

              <aside className="inspector print-hidden">
                <div className="inspector-tabs">
                  <button
                    className={inspectorTab === 'layout' ? 'mode-button active' : 'mode-button'}
                    type="button"
                    onClick={() => setInspectorTab('layout')}
                  >
                    배치
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
                    저장
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
                      {activeClassroom.students.length > 0 ? (
                        <button className="danger-button" type="button" onClick={handleResetStudents}>
                          학생 전체 초기화
                        </button>
                      ) : null}
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
                    <div className="mini-title">통합 백업</div>
                    <p className="helper-text">
                      현재 만들어진 모든 반이 하나의 JSON 파일로 함께 저장됩니다. 불러오기는 전체 데이터를 덮어씁니다.
                    </p>
                    <div className="button-stack">
                      <button className="primary-button" type="button" onClick={handleDownloadBackup}>
                        전체 백업 다운로드
                      </button>
                      <button className="secondary-button" type="button" onClick={openBackupImportPicker}>
                        백업 불러오기
                      </button>
                    </div>
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
            <div className="panel empty-state-card">
              <h2>반이 없습니다.</h2>
              <p>새 반을 만들거나 통합 백업 파일을 불러오면 바로 다시 시작할 수 있습니다.</p>
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
              <div className="button-stack">
                <button className="primary-button" type="button" onClick={handleCreateClassroom}>
                  첫 반 만들기
                </button>
                <button className="secondary-button" type="button" onClick={openBackupImportPicker}>
                  백업 불러오기
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
