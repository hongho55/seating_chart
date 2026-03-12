import { useEffect, useRef, useState } from 'react';

interface ClassroomOverflowMenuProps {
  isBasePlanEditMode: boolean;
  basePlanApplyArmed: boolean;
  basePlanApplyDisabled: boolean;
  basePlanApplyHelperText: string;
  onToggleBasePlanEditMode: () => void;
  onToggleBasePlanApplyArmed: () => void;
}

export function ClassroomOverflowMenu({
  isBasePlanEditMode,
  basePlanApplyArmed,
  basePlanApplyDisabled,
  basePlanApplyHelperText,
  onToggleBasePlanEditMode,
  onToggleBasePlanApplyArmed,
}: ClassroomOverflowMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const menu = menuRef.current;

      if (!menu) {
        return;
      }

      if (!menu.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <div
      ref={menuRef}
      className={`classroom-overflow-menu ${menuOpen ? 'open' : ''}`}
    >
      <button
        className={`classroom-overflow-trigger ${isBasePlanEditMode ? 'active' : ''}`}
        type="button"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label="반 설정"
        title="반 설정"
        onClick={() => setMenuOpen((current) => !current)}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="5" cy="10" r="1.6" />
          <circle cx="10" cy="10" r="1.6" />
          <circle cx="15" cy="10" r="1.6" />
        </svg>
      </button>
      {menuOpen ? (
        <div className="classroom-overflow-panel" role="menu">
          <button
            className="classroom-overflow-item"
            type="button"
            role="menuitem"
            onClick={() => {
              onToggleBasePlanEditMode();
              setMenuOpen(false);
            }}
          >
            {isBasePlanEditMode ? '기준 배치 편집 종료' : '기준 배치 편집'}
          </button>
          <div className="classroom-overflow-divider" />
          <button
            className={`classroom-overflow-item classroom-overflow-toggle ${basePlanApplyArmed ? 'active' : ''}`}
            type="button"
            role="menuitemcheckbox"
            aria-checked={basePlanApplyArmed}
            disabled={basePlanApplyDisabled}
            onClick={onToggleBasePlanApplyArmed}
          >
            <span>기준안 적용</span>
            <span>{basePlanApplyArmed ? 'ON' : 'OFF'}</span>
          </button>
          <p className={`classroom-overflow-helper ${basePlanApplyArmed ? 'active' : ''}`}>
            {basePlanApplyHelperText}
          </p>
        </div>
      ) : null}
    </div>
  );
}
