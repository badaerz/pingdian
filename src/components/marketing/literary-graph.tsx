const graphNodes = [
  { id: "work", label: "作品", relation: "产出", x: 16, y: 18, labelX: 32, labelY: 31, signalDuration: "4.8s" },
  { id: "author", label: "作者", relation: "署名", x: 84, y: 18, labelX: 68, labelY: 31, signalDuration: "5.4s" },
  { id: "theme", label: "主题", relation: "聚焦", x: 20, y: 82, labelX: 34, labelY: 69, signalDuration: "5.1s" },
  { id: "craft", label: "技法", relation: "采用", x: 80, y: 82, labelX: 66, labelY: 69, signalDuration: "4.5s" },
] as const;

export function LiteraryGraph() {
  return (
    <svg className="literary-graph" viewBox="0 0 100 100" role="img" aria-label="文学知识关系示意图">
      <ellipse className="literary-graph-orbit" cx="50" cy="50" rx="44" ry="39" />
      {graphNodes.map((node) => (
        <g key={node.id} className="literary-graph-relation">
          <line
            className="literary-graph-edge"
            x1="50"
            y1="50"
            x2={node.x}
            y2={node.y}
            data-testid={`literary-path-${node.id}`}
            data-connects={node.id}
          />
          <circle className="literary-graph-signal" r=".75">
            <animateMotion
              dur={node.signalDuration}
              path={`M 50 50 L ${node.x} ${node.y}`}
              repeatCount="indefinite"
            />
          </circle>
          <rect
            className="literary-graph-label-bg"
            x={node.labelX - 5}
            y={node.labelY - 2.5}
            width="10"
            height="5"
            rx="1"
          />
          <text
            className="literary-graph-label"
            x={node.labelX}
            y={node.labelY}
            aria-label={`文学与${node.label}的关系：${node.relation}`}
            data-testid={`literary-relation-${node.id}`}
          >
            {node.relation}
          </text>
        </g>
      ))}
      <circle className="literary-graph-center" cx="50" cy="50" r="12" />
      <text x="50" y="50" data-node="literature">文学</text>
      {graphNodes.map((node) => (
        <g key={node.id} className="literary-graph-node" data-node={node.id} transform={`translate(${node.x} ${node.y})`}>
          <rect x="-7" y="-4" width="14" height="8" />
          <text>{node.label}</text>
        </g>
      ))}
    </svg>
  );
}
