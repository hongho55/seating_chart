interface RandomSummary {
  conflicts: number;
  genderMisses: number;
  unplacedStudents: number;
}

interface BasePlanEditActionBarProps {
  randomSummary: RandomSummary | null;
  onCancel: () => void;
  onRandomizeAll: () => void;
  onRandomizeUnfixed: () => void;
  onSave: () => void;
}

export function BasePlanEditActionBar({
  randomSummary,
  onCancel,
  onRandomizeAll,
  onRandomizeUnfixed,
  onSave,
}: BasePlanEditActionBarProps) {
  return (
    <section className="base-plan-edit-bar print-hidden">
      <div className="base-plan-edit-bar-copy">
        <strong>기준 배치 편집</strong>
        <span>핀을 유지한 채 다시 섞거나 전체를 다시 섞은 뒤 저장할 수 있습니다.</span>
        {randomSummary ? (
          <span className="base-plan-edit-summary">
            최근 랜덤 결과 · 충돌 {randomSummary.conflicts} · 성별 {randomSummary.genderMisses} · 미배치{' '}
            {randomSummary.unplacedStudents}
          </span>
        ) : null}
      </div>
      <div className="base-plan-edit-bar-actions">
        <button className="ghost-button" type="button" onClick={onCancel}>
          취소
        </button>
        <button className="secondary-button" type="button" onClick={onRandomizeAll}>
          전체 랜덤
        </button>
        <button className="secondary-button" type="button" onClick={onRandomizeUnfixed}>
          미고정만 랜덤
        </button>
        <button className="primary-button" type="button" onClick={onSave}>
          기준 배치 저장
        </button>
      </div>
    </section>
  );
}
