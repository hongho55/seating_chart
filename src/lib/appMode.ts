export type AppMode =
  | {
      kind: 'default';
    }
  | {
      kind: 'base-plan-edit';
      classroomId: string;
    };

export function createDefaultAppMode(): AppMode {
  return { kind: 'default' };
}

export function createBasePlanEditMode(classroomId: string): AppMode {
  return {
    kind: 'base-plan-edit',
    classroomId,
  };
}

export function isBasePlanEditMode(appMode: AppMode, classroomId: string | null): boolean {
  return appMode.kind === 'base-plan-edit' && appMode.classroomId === classroomId;
}
