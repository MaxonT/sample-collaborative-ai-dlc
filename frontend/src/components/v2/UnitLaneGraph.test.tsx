import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@/test/query';
import { UnitLaneGraph } from './UnitLaneGraph';
import type { UnitLanesInput } from './unit-lane-graph';
import type { CompiledWorkflow } from '@/services/workflows';

const compiled = {
  graph: {
    nodes: [
      { stageId: 'requirements-analysis', phasePath: '03', order: 0 },
      { stageId: 'func-design', phasePath: '04', order: 1, forEach: 'unit-of-work' },
      { stageId: 'code-gen', phasePath: '04', order: 2, forEach: 'unit-of-work' },
      { stageId: 'build-and-test', phasePath: '04', order: 3 },
    ],
    edges: [],
  },
} as unknown as CompiledWorkflow;

const phases = [
  { path: '03', name: 'Inception' },
  { path: '04', name: 'Construction' },
];

const lanes: UnitLanesInput = {
  sectionStageIds: ['func-design', 'code-gen'],
  units: [
    {
      slug: 'cart-badge-template',
      state: 'MERGED',
      stages: [
        {
          stageId: 'func-design',
          stageInstanceId: 'si-1',
          state: 'SUCCEEDED',
          synthesized: false,
          rowKey: 'si-1',
        },
        {
          stageId: 'code-gen',
          stageInstanceId: 'si-2',
          state: 'SUCCEEDED',
          synthesized: false,
          rowKey: 'si-2',
        },
      ],
    },
    {
      slug: 'cart-badge-tests',
      state: 'RUNNING',
      stages: [
        {
          stageId: 'func-design',
          stageInstanceId: 'si-3',
          state: 'RUNNING',
          synthesized: false,
          rowKey: 'si-3',
        },
        {
          stageId: 'code-gen',
          stageInstanceId: null,
          state: 'PENDING',
          synthesized: true,
          rowKey: null,
        },
      ],
    },
    {
      slug: 'cart-badge-docs',
      state: 'WAITING_INPUT',
      stages: [
        {
          stageId: 'func-design',
          stageInstanceId: null,
          state: 'PENDING',
          synthesized: true,
          rowKey: null,
        },
        {
          stageId: 'code-gen',
          stageInstanceId: null,
          state: 'PENDING',
          synthesized: true,
          rowKey: null,
        },
      ],
    },
  ],
};

describe('UnitLaneGraph', () => {
  it('colours unit nodes from the status registry tone and labels them by human name', () => {
    const { container } = render(
      <UnitLaneGraph compiled={compiled} phases={phases} unitLanes={lanes} />,
    );
    const merged = container.querySelector('g[data-unit-state="MERGED"]')!;
    expect(merged.getAttribute('data-tone')).toBe('success');
    expect(merged.querySelector('rect')!.getAttribute('fill')).toBe('var(--agent-success)');
    expect(merged.textContent).toContain('Cart Badge Template');

    const running = container.querySelector('g[data-unit-state="RUNNING"]')!;
    expect(running.getAttribute('data-tone')).toBe('running');
    expect(running.getAttribute('class')).toContain('animate-pulse');

    const waiting = container.querySelector('g[data-unit-state="WAITING_INPUT"]')!;
    expect(waiting.getAttribute('data-tone')).toBe('waiting');
    expect(waiting.querySelector('rect')!.getAttribute('fill')).toBe('var(--agent-waiting)');
  });

  it('shows stage nodes by display name and keeps the raw id for clicks', () => {
    const onStageClick = vi.fn();
    const { container, getByText } = render(
      <UnitLaneGraph
        compiled={compiled}
        phases={phases}
        unitLanes={lanes}
        stageStatus={{ 'requirements-analysis': 'SUCCEEDED' }}
        onStageClick={onStageClick}
      />,
    );
    expect(getByText('Requirements Analysis')).toBeInTheDocument();
    expect(container.textContent).not.toContain('requirements-analysis');
    fireEvent.click(getByText('Requirements Analysis').closest('g[role="button"]')!);
    expect(onStageClick).toHaveBeenCalledWith('requirements-analysis', undefined);
    const svg = container.querySelector('svg')!;
    expect(svg.innerHTML).not.toMatch(/text-\[(?:[0-9]|10)px\]/);
  });
});
