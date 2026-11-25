import { useMemo } from 'react';
import type { CompiledWorkflow } from '@/services/workflows';
import type { StageState } from '@/services/intents';
import { displayStageName, humanizeSlug } from '@/lib/displayNames';
import { getStatus, type StatusTone } from '@/lib/statusModel';
import { cn } from '@/lib/utils';
import {
  computeUnitLaneLayout,
  NODE_W,
  NODE_H,
  UNIT_NODE_W,
  type PhaseInput,
  type UnitLaneNode,
  type UnitLanesInput,
} from './unit-lane-graph';

// Self-contained observability graph for a fan-out run: per-unit stage lanes
// with synthetic unit nodes. Owns its own dimensions, colours and edge helper —
// deliberately shares nothing with the composer graph (WorkflowScopeGraph).

export interface UnitLaneGraphProps {
  compiled: CompiledWorkflow;
  phases: PhaseInput[];
  unitLanes: UnitLanesInput;
  /** Per-stageId live status for the plain (non-fan-out) stage nodes. */
  stageStatus?: Record<string, StageState>;
  onStageClick?: (stageId: string, rowKey?: string | null) => void;
}

const PHASE_PALETTE = ['#94a3b8', '#6366f1', '#f59e0b', '#10b981', '#ec4899'] as const;

// Solid SVG fills per registry tone (CSS tokens from index.css). The label/tone
// itself comes from statusModel so the graph never carries its own status map.
const TONE_FILL: Record<StatusTone, { fill: string; text: string }> = {
  neutral: { fill: 'var(--muted)', text: 'var(--muted-foreground)' },
  info: { fill: 'var(--agent-idle)', text: '#ffffff' },
  running: { fill: 'var(--agent-running)', text: '#ffffff' },
  waiting: { fill: 'var(--agent-waiting)', text: '#1c1917' },
  success: { fill: 'var(--agent-success)', text: '#ffffff' },
  danger: { fill: 'var(--agent-error)', text: '#ffffff' },
  warning: { fill: 'var(--warning)', text: '#1c1917' },
};

function stageNodeStyle(state: StageState) {
  const entry = getStatus('stage', state);
  const skipped = state === 'SKIPPED';
  return {
    ...TONE_FILL[entry.tone],
    tone: entry.tone,
    pulse: Boolean(entry.live),
    stroke: skipped ? 'var(--muted-foreground)' : undefined,
    strokeDash: skipped ? '4 3' : undefined,
  };
}

const EDGE_STYLES: Record<string, { width: number; dash: string; color: string }> = {
  data: { width: 1.5, dash: '4 3', color: 'var(--border)' },
  requires: { width: 2, dash: '', color: 'var(--border)' },
  blocks: { width: 3, dash: '', color: 'var(--destructive)' },
};

function truncate(name: string, max = 30): string {
  return name.length > max ? name.slice(0, max - 1) + '…' : name;
}

// Left→right cubic between two nodes (local to this screen).
function edgePath(from: UnitLaneNode, to: UnitLaneNode, fromWidth: number): string {
  const x1 = from.x + fromWidth;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  const dx = (x2 - x1) * 0.5;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

export function UnitLaneGraph({
  compiled,
  phases,
  unitLanes,
  stageStatus,
  onStageClick,
}: UnitLaneGraphProps) {
  const layout = useMemo(
    () => computeUnitLaneLayout(compiled.graph.nodes, phases, unitLanes, compiled.graph.edges),
    [compiled.graph.nodes, compiled.graph.edges, phases, unitLanes],
  );

  const colorByPath = useMemo(() => {
    const map: Record<string, string> = { __other__: '#cbd5e1' };
    phases
      .toSorted((a, b) => a.path.localeCompare(b.path))
      .forEach((p, i) => {
        map[p.path] = PHASE_PALETTE[i % PHASE_PALETTE.length];
      });
    return map;
  }, [phases]);

  if (!layout) return null;
  const nodeList = [...layout.nodes.values()];

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width={layout.width}
        height={layout.height}
        className="max-w-none rounded border border-border bg-card/50 block"
      >
        {layout.phaseColumns.map(({ phasePath, name, x, colWidth }) => (
          <g key={phasePath}>
            <rect
              x={x - 5}
              y={18}
              width={colWidth + 10}
              height={layout.height - 20}
              rx={6}
              fill="var(--muted)"
              opacity={0.3}
            />
            <text
              x={x + colWidth / 2}
              y={16}
              textAnchor="middle"
              fill="var(--muted-foreground)"
              className="text-2xs font-medium"
            >
              {name}
            </text>
          </g>
        ))}

        {layout.edges.map((edge, i) => {
          const from = layout.nodes.get(edge.from);
          const to = layout.nodes.get(edge.to);
          if (!from || !to) return null;
          // Same-column stage→stage progression: short vertical connector (a
          // left→right cubic would loop awkwardly around same-x nodes).
          const d = edge.vertical
            ? `M ${from.x + NODE_W / 2} ${from.y + NODE_H} L ${to.x + NODE_W / 2} ${to.y}`
            : edgePath(from, to, from.kind === 'unit' ? UNIT_NODE_W : NODE_W);
          const style = edge.kind ? (EDGE_STYLES[edge.kind] ?? EDGE_STYLES.requires) : null;
          return (
            <path
              key={`${edge.from}->${edge.to}:${i}`}
              d={d}
              fill="none"
              stroke={style ? style.color : 'var(--border)'}
              strokeWidth={style ? style.width : 2}
              strokeDasharray={style?.dash || undefined}
              opacity={0.6}
            />
          );
        })}

        {nodeList.map((node) => {
          if (node.kind === 'unit') {
            const unitEntry = node.unitState ? getStatus('unit', node.unitState) : null;
            const us = unitEntry ? TONE_FILL[unitEntry.tone] : null;
            const name = humanizeSlug(node.slug ?? '');
            return (
              <g
                key={node.key}
                transform={`translate(${node.x},${node.y})`}
                className={cn(unitEntry?.live && 'motion-safe:animate-pulse-subtle')}
                data-unit-state={node.unitState ?? undefined}
                data-tone={unitEntry?.tone}
              >
                <title>{unitEntry ? `${name} · ${unitEntry.label}` : name}</title>
                <rect
                  width={UNIT_NODE_W}
                  height={NODE_H}
                  rx={6}
                  fill={us?.fill ?? 'var(--primary)'}
                  opacity={0.85}
                />
                <text
                  x={UNIT_NODE_W / 2}
                  y={NODE_H / 2 + 4}
                  textAnchor="middle"
                  fill={us?.text ?? 'var(--primary-foreground)'}
                  className="text-xs font-semibold"
                >
                  {truncate(name, 20)}
                </text>
              </g>
            );
          }

          // Plan stage (pre/post) takes its live status from `stageStatus`;
          // per-unit cells carry their own state + rowKey.
          const state =
            node.kind === 'unitStage'
              ? node.state
              : (stageStatus?.[node.stageId ?? ''] ?? undefined);
          const style = state ? stageNodeStyle(state) : undefined;
          const fill = style ? style.fill : (colorByPath[node.phasePath] ?? '#94a3b8');
          const textFill = style ? style.text : '#ffffff';
          const opacity = state === 'SKIPPED' ? 0.55 : 1;
          const clickable = !!onStageClick && (node.kind === 'stage' || node.rowKey != null);
          const clickKey = node.kind === 'unitStage' ? node.rowKey : undefined;
          return (
            <g
              key={node.key}
              transform={`translate(${node.x},${node.y})`}
              opacity={opacity}
              className={cn(style?.pulse && 'motion-safe:animate-pulse-subtle')}
              data-stage-status={state ?? undefined}
              data-tone={style?.tone}
              {...(clickable
                ? {
                    role: 'button',
                    tabIndex: 0,
                    style: { cursor: 'pointer' },
                    onClick: () => onStageClick(node.stageId ?? '', clickKey),
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onStageClick(node.stageId ?? '', clickKey);
                      }
                    },
                  }
                : {})}
            >
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={6}
                fill={fill}
                stroke={style?.stroke ?? 'none'}
                strokeWidth={style?.stroke ? 1.5 : 0}
                strokeDasharray={style?.strokeDash ?? undefined}
              />
              <title>
                {state
                  ? `${displayStageName(node.stageId ?? '')} · ${getStatus('stage', state).label}`
                  : displayStageName(node.stageId ?? '')}
              </title>
              <text x={10} y={NODE_H / 2 + 4} fill={textFill} className="text-[13px]">
                {truncate(displayStageName(node.stageId ?? ''), 30)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
