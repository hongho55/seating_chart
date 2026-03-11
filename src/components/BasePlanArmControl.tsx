interface BasePlanArmControlProps {
  armed: boolean;
  disabled: boolean;
  onToggle: () => void;
}

export function BasePlanArmControl({
  armed,
  disabled,
  onToggle,
}: BasePlanArmControlProps) {
  const helperText = disabled
    ? '저장된 기준안이 있어야 사용할 수 있습니다.'
    : armed
      ? '기준안 적용 예정 · 다음 자리 배정 시작은 저장된 기준안을 그대로 적용합니다.'
      : '일반 랜덤 모드 · 다음 자리 배정 시작은 조건을 반영해 새로 배정합니다.';

  return (
    <div className="base-plan-arm-control">
      <button
        className={`base-plan-arm-toggle ${armed ? 'active' : ''}`}
        type="button"
        aria-pressed={armed}
        disabled={disabled}
        onClick={onToggle}
      >
        <span>기준안 적용</span>
        <span>{armed ? 'ON' : 'OFF'}</span>
      </button>
      <p className={`helper-text base-plan-arm-helper ${armed ? 'active' : ''}`}>{helperText}</p>
    </div>
  );
}
