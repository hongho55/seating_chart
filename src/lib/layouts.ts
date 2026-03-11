import { createId } from './ids';
import type { DeskVariant, LayoutPresetConfig, Seat, SeatGroup, SeatPreset } from '../types';

const GROUP_COLORS = ['#f4c95d', '#98c1d9', '#b8e0a5', '#f2a7a7', '#d0bdf4', '#f7d6bf'];

export const CANVAS_WIDTH = 980;
export const CANVAS_HEIGHT = 720;
export const SEAT_CARD_WIDTH = 136;
export const SEAT_CARD_HEIGHT = 70;
export const SEAT_GAP = 8;
export const GROUP_GAP_X = 46;
export const GROUP_GAP_Y = 40;
export const GROUP_OUTLINE_PADDING = 12;
export const CANVAS_PADDING_X = 48;
export const CANVAS_PADDING_Y = 60;

function getGroupSize(preset: SeatPreset): number {
  if (preset === 'single') {
    return 1;
  }

  if (preset === 'pair') {
    return 2;
  }

  if (preset === 'group4') {
    return 4;
  }

  return 6;
}

export function getDefaultVariant(preset: SeatPreset): DeskVariant {
  if (preset === 'single') {
    return 'single';
  }

  if (preset === 'pair') {
    return 'pair-horizontal';
  }

  if (preset === 'group4') {
    return 'group4-2x2';
  }

  return 'group6-2x3';
}

export function getVariantOptions(preset: SeatPreset): Array<{ value: DeskVariant; label: string }> {
  if (preset === 'single') {
    return [{ value: 'single', label: '1칸' }];
  }

  if (preset === 'pair') {
    return [
      { value: 'pair-horizontal', label: '가로 1x2' },
      { value: 'pair-vertical', label: '세로 2x1' },
    ];
  }

  if (preset === 'group4') {
    return [
      { value: 'group4-2x2', label: '2x2' },
      { value: 'group4-1x4', label: '1x4' },
      { value: 'group4-4x1', label: '4x1' },
    ];
  }

  return [
    { value: 'group6-2x3', label: '2x3' },
    { value: 'group6-3x2', label: '3x2' },
    { value: 'group6-u', label: 'U자형' },
  ];
}

function getSeatOffsets(variant: DeskVariant): Array<{ x: number; y: number }> {
  if (variant === 'single') {
    return [{ x: 0, y: 0 }];
  }

  if (variant === 'pair-horizontal') {
    return [
      { x: 0, y: 0 },
      { x: SEAT_CARD_WIDTH + SEAT_GAP, y: 0 },
    ];
  }

  if (variant === 'pair-vertical') {
    return [
      { x: 0, y: 0 },
      { x: 0, y: SEAT_CARD_HEIGHT + SEAT_GAP },
    ];
  }

  if (variant === 'group4-2x2') {
    return [
      { x: 0, y: 0 },
      { x: SEAT_CARD_WIDTH + SEAT_GAP, y: 0 },
      { x: 0, y: SEAT_CARD_HEIGHT + SEAT_GAP },
      { x: SEAT_CARD_WIDTH + SEAT_GAP, y: SEAT_CARD_HEIGHT + SEAT_GAP },
    ];
  }

  if (variant === 'group4-1x4') {
    return [
      { x: 0, y: 0 },
      { x: SEAT_CARD_WIDTH + SEAT_GAP, y: 0 },
      { x: 2 * (SEAT_CARD_WIDTH + SEAT_GAP), y: 0 },
      { x: 3 * (SEAT_CARD_WIDTH + SEAT_GAP), y: 0 },
    ];
  }

  if (variant === 'group4-4x1') {
    return [
      { x: 0, y: 0 },
      { x: 0, y: SEAT_CARD_HEIGHT + SEAT_GAP },
      { x: 0, y: 2 * (SEAT_CARD_HEIGHT + SEAT_GAP) },
      { x: 0, y: 3 * (SEAT_CARD_HEIGHT + SEAT_GAP) },
    ];
  }

  if (variant === 'group6-3x2') {
    return [
      { x: 0, y: 0 },
      { x: SEAT_CARD_WIDTH + SEAT_GAP, y: 0 },
      { x: 0, y: SEAT_CARD_HEIGHT + SEAT_GAP },
      { x: SEAT_CARD_WIDTH + SEAT_GAP, y: SEAT_CARD_HEIGHT + SEAT_GAP },
      { x: 0, y: 2 * (SEAT_CARD_HEIGHT + SEAT_GAP) },
      { x: SEAT_CARD_WIDTH + SEAT_GAP, y: 2 * (SEAT_CARD_HEIGHT + SEAT_GAP) },
    ];
  }

  if (variant === 'group6-u') {
    return [
      { x: 0, y: 0 },
      { x: SEAT_CARD_WIDTH + SEAT_GAP, y: 0 },
      { x: 2 * (SEAT_CARD_WIDTH + SEAT_GAP), y: 0 },
      { x: 0, y: SEAT_CARD_HEIGHT + SEAT_GAP },
      { x: 2 * (SEAT_CARD_WIDTH + SEAT_GAP), y: SEAT_CARD_HEIGHT + SEAT_GAP },
      { x: SEAT_CARD_WIDTH + SEAT_GAP, y: 2 * (SEAT_CARD_HEIGHT + SEAT_GAP) },
    ];
  }

  return [
    { x: 0, y: 0 },
    { x: SEAT_CARD_WIDTH + SEAT_GAP, y: 0 },
    { x: 2 * (SEAT_CARD_WIDTH + SEAT_GAP), y: 0 },
    { x: 0, y: SEAT_CARD_HEIGHT + SEAT_GAP },
    { x: SEAT_CARD_WIDTH + SEAT_GAP, y: SEAT_CARD_HEIGHT + SEAT_GAP },
    { x: 2 * (SEAT_CARD_WIDTH + SEAT_GAP), y: SEAT_CARD_HEIGHT + SEAT_GAP },
  ];
}

function getGroupLabel(preset: SeatPreset, index: number): string {
  if (preset === 'single') {
    return `자리 ${index}`;
  }

  if (preset === 'pair') {
    return `짝 ${index}`;
  }

  return `모둠 ${index}`;
}

function getMinimumGroupGapX(preset: SeatPreset): number {
  if (preset === 'single') {
    return 16;
  }

  if (preset === 'pair') {
    return 28;
  }

  if (preset === 'group4') {
    return 38;
  }

  return GROUP_GAP_X;
}

function getVisibleBounds(
  seats: Seat[],
  groups: SeatGroup[],
): { minX: number; maxX: number; minY: number; maxY: number } | null {
  if (seats.length === 0) {
    return null;
  }

  let minX = Math.min(...seats.map((seat) => seat.x));
  let maxX = Math.max(...seats.map((seat) => seat.x + SEAT_CARD_WIDTH));
  let minY = Math.min(...seats.map((seat) => seat.y));
  let maxY = Math.max(...seats.map((seat) => seat.y + SEAT_CARD_HEIGHT));

  groups.forEach((group) => {
    const groupSeats = seats.filter((seat) => group.seatIds.includes(seat.id));

    if (groupSeats.length === 0) {
      return;
    }

    minX = Math.min(minX, Math.min(...groupSeats.map((seat) => seat.x)) - GROUP_OUTLINE_PADDING);
    maxX = Math.max(
      maxX,
      Math.max(...groupSeats.map((seat) => seat.x + SEAT_CARD_WIDTH)) + GROUP_OUTLINE_PADDING,
    );
    minY = Math.min(
      minY,
      Math.min(...groupSeats.map((seat) => seat.y)) - GROUP_OUTLINE_PADDING - 12,
    );
    maxY = Math.max(
      maxY,
      Math.max(...groupSeats.map((seat) => seat.y + SEAT_CARD_HEIGHT)) + GROUP_OUTLINE_PADDING,
    );
  });

  return { minX, maxX, minY, maxY };
}

export function createPresetLayout(config: LayoutPresetConfig): { seats: Seat[]; groups: SeatGroup[] } {
  const safeRows = Math.max(1, config.rows);
  const safeCols = Math.max(1, config.cols);
  const seats: Seat[] = [];
  const groups: SeatGroup[] = [];
  const groupSize = getGroupSize(config.preset);
  const offsets = getSeatOffsets(config.variant);
  const groupWidth = Math.max(...offsets.map((offset) => offset.x)) + SEAT_CARD_WIDTH;
  const groupHeight = Math.max(...offsets.map((offset) => offset.y)) + SEAT_CARD_HEIGHT;
  const availableInnerWidth =
    CANVAS_WIDTH - CANVAS_PADDING_X * 2 - GROUP_OUTLINE_PADDING * 2;
  const minimumGroupGapX = getMinimumGroupGapX(config.preset);
  const compressedGapX =
    safeCols > 1
      ? Math.floor((availableInnerWidth - safeCols * groupWidth) / (safeCols - 1))
      : GROUP_GAP_X;
  const effectiveGroupGapX =
    safeCols > 1
      ? Math.max(minimumGroupGapX, Math.min(GROUP_GAP_X, compressedGapX))
      : GROUP_GAP_X;
  const totalWidth = safeCols * groupWidth + Math.max(0, safeCols - 1) * effectiveGroupGapX;
  const totalVisibleWidth = totalWidth + GROUP_OUTLINE_PADDING * 2;
  const centeredStartX =
    totalVisibleWidth < CANVAS_WIDTH - CANVAS_PADDING_X * 2
      ? Math.round((CANVAS_WIDTH - totalVisibleWidth) / 2) + GROUP_OUTLINE_PADDING
      : CANVAS_PADDING_X + GROUP_OUTLINE_PADDING;

  for (let row = 0; row < safeRows; row += 1) {
    for (let column = 0; column < safeCols; column += 1) {
      const index = row * safeCols + column;
      const blockIndex = index + 1;
      const groupId = createId('group');
      const groupLabel = getGroupLabel(config.preset, blockIndex);
      const baseX = centeredStartX + column * (groupWidth + effectiveGroupGapX);
      const baseY = CANVAS_PADDING_Y + row * (groupHeight + GROUP_GAP_Y);
      const seatIds: string[] = [];

      offsets.slice(0, groupSize).forEach((offset, seatIndex) => {
        const seatId = createId('seat');
        seatIds.push(seatId);
        seats.push({
          id: seatId,
          x: baseX + offset.x,
          y: baseY + offset.y,
          label: config.preset === 'single' ? `${blockIndex}` : `${blockIndex}-${seatIndex + 1}`,
          preset: config.preset,
          groupId,
          assignedStudentId: null,
          fixed: false,
        });
      });

      groups.push({
        id: groupId,
        label: groupLabel,
        preset: config.preset,
        variant: config.variant,
        color: GROUP_COLORS[index % GROUP_COLORS.length],
        seatIds,
      });
    }
  }

  const bounds = getVisibleBounds(seats, groups);

  if (!bounds) {
    return { seats, groups };
  }

  const visibleWidth = bounds.maxX - bounds.minX;
  const visibleHeight = bounds.maxY - bounds.minY;
  const targetCanvasWidth = Math.max(CANVAS_WIDTH, visibleWidth + CANVAS_PADDING_X * 2);
  const targetLeft = Math.round((targetCanvasWidth - visibleWidth) / 2);
  const targetTop = CANVAS_PADDING_Y;
  const shiftX = targetLeft - bounds.minX;
  const shiftY = targetTop - bounds.minY;

  return {
    seats: seats.map((seat) => ({
      ...seat,
      x: seat.x + shiftX,
      y: seat.y + shiftY,
    })),
    groups,
  };
}

export function cloneSeats(seats: Seat[]): Seat[] {
  return seats.map((seat) => ({ ...seat }));
}

export function cloneGroups(groups: SeatGroup[]): SeatGroup[] {
  return groups.map((group) => ({
    ...group,
    variant: group.variant ?? getDefaultVariant(group.preset),
    seatIds: [...group.seatIds],
  }));
}
