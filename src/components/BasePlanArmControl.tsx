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
    ? '저장된 기준 배치가 없으면 사용할 수 없습니다.'
    : armed
      ? '기준안 적용 예정 · 다음 실행은 저장된 기준안을 그대로 적용합니다.'
      : '끄면 기존 조건 반영 랜덤 배치를 사용합니다.';

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
