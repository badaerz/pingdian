const steps = ["输入灵感", "生成设定", "构建蓝图", "协作写作", "诊断与导出"];

export function ProcessTimeline() {
  return (
    <ol className="marketing-process-list">
      <svg className="marketing-process-line" viewBox="0 0 1000 24" preserveAspectRatio="none" aria-hidden="true">
        <path d="M20 12 H980" data-motion-process-line />
      </svg>
      {steps.map((label, index) => (
        <li data-motion-item key={label}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>{label}</strong>
        </li>
      ))}
    </ol>
  );
}
