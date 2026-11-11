import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultData,
  loadAppData,
  loadShowSeatPinButtons,
  saveAppData,
  saveShowSeatPinButtons,
} from './storage';

// Synthetic records and a private in-memory storage only; no real student data.
const STORAGE_KEY = 'seating-chart.app.v1';

function mockStorage(raw: string | null = null) {
  const values = new Map<string, string>();
  if (raw !== null) values.set(STORAGE_KEY, raw);
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  };
  vi.stubGlobal('window', { localStorage: storage });
  return { values, storage };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('app storage recovery', () => {
  it('allows a genuinely new app to save', () => {
    const { storage } = mockStorage();
    const result = loadAppData();
    expect(result.error).toBeNull();
    expect(result.data.classrooms).toHaveLength(1);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('loads valid saved data without treating it as a recovery failure', () => {
    const data = createDefaultData();
    mockStorage(JSON.stringify(data));
    const result = loadAppData();
    expect(result.error).toBeNull();
    expect(result.data.activeClassroomId).toBe(data.activeClassroomId);
  });

  for (const raw of ['{broken-json', '{"version":1,"classrooms":"invalid"}', '']) {
    it(`reports unreadable data without changing its original value: ${JSON.stringify(raw)}`, () => {
      const { values, storage } = mockStorage(raw);
      const result = loadAppData();
      expect(result.error).toBeTruthy();
      expect(result.data.classrooms).toHaveLength(1);
      expect(values.get(STORAGE_KEY)).toBe(raw);
      expect(storage.setItem).not.toHaveBeenCalled();
    });
  }

  it('survives getItem SecurityError and does not mistake it for a new app', () => {
    const { storage } = mockStorage();
    storage.getItem.mockImplementation(() => { throw new Error('SecurityError'); });
    const result = loadAppData();
    expect(result.error).toBeTruthy();
    expect(result.data.classrooms).toHaveLength(1);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(loadShowSeatPinButtons()).toBe(false);
  });

  it('survives an exception from the localStorage property itself', () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage { throw new Error('SecurityError'); },
    });
    expect(loadAppData().error).toBeTruthy();
    expect(loadShowSeatPinButtons()).toBe(false);
    expect(saveAppData(createDefaultData())).toBeTruthy();
    expect(saveShowSeatPinButtons(true)).toBeTruthy();
  });

  it('reports quota errors without modifying the existing saved record', () => {
    const data = createDefaultData();
    const original = JSON.stringify(data);
    const { values, storage } = mockStorage(original);
    storage.setItem.mockImplementation(() => { throw new Error('QuotaExceededError'); });
    expect(saveAppData({ ...data, recentPrintMode: 'student' })).toBeTruthy();
    expect(values.get(STORAGE_KEY)).toBe(original);
    expect(saveShowSeatPinButtons(true)).toBeTruthy();
  });

  it('returns success only after a real mock write and keeps preference keys separate', () => {
    const { values } = mockStorage();
    const data = createDefaultData();
    expect(saveAppData(data)).toBeNull();
    expect(JSON.parse(values.get(STORAGE_KEY)!)).toEqual(data);
    expect(saveShowSeatPinButtons(true)).toBeNull();
    expect(loadShowSeatPinButtons()).toBe(true);
    expect(JSON.parse(values.get(STORAGE_KEY)!)).toEqual(data);
  });
});
