import { render, screen, waitFor } from '@/test/query';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { DeliveryStatus } from './DeliveryStatus';
import { intentsService } from '@/services/intents';
vi.mock('@/services/intents', () => ({
  intentsService: { previewDelivery: vi.fn(), retryDelivery: vi.fn() },
}));
const repo = {
  repoId: 'owner/web',
  provider: 'github',
  branch: 'intent/feature',
  baseBranch: 'develop',
  status: 'failed',
  reason: 'Provider unavailable',
};
const preview = {
  previewToken: 'checked-head',
  historical: false,
  retryable: true,
  canRecord: true,
  delivery: { status: 'partial' as const, repositories: [repo] },
};
const reload = vi.fn(async () => {});
const props = {
  projectId: 'project',
  intentId: 'intent',
  canRetry: true,
  delivery: preview.delivery,
  reload,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(intentsService.previewDelivery).mockResolvedValue(preview);
  vi.mocked(intentsService.retryDelivery).mockResolvedValue({
    delivery: { status: 'in_progress', repositories: [repo] },
  });
});
it('shows the affected repository and checks delivery before retrying only publication', async () => {
  render(<DeliveryStatus {...props} />);
  const user = userEvent.setup();
  expect(screen.getByText('Provider unavailable')).toBeInTheDocument();
  // The Retry explanation only appears once a Retry button is actually offered.
  expect(screen.queryByText(/does not regenerate code/)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Check delivery' }));
  const retryButton = await screen.findByRole('button', { name: 'Retry delivery' });
  expect(screen.getByText(/does not regenerate code/)).toBeInTheDocument();
  await user.click(retryButton);
  await waitFor(() =>
    expect(intentsService.retryDelivery).toHaveBeenCalledWith('project', 'intent', 'checked-head'),
  );
  expect(reload).toHaveBeenCalled();
});
it('requires a fresh check after a stale confirmation and displays its explanation', async () => {
  vi.mocked(intentsService.retryDelivery).mockRejectedValue(
    new Error('Delivery state changed. Check again.'),
  );
  render(<DeliveryStatus {...props} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Check delivery' }));
  await user.click(await screen.findByRole('button', { name: 'Retry delivery' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Delivery state changed');
  expect(screen.queryByRole('button', { name: 'Retry delivery' })).not.toBeInTheDocument();
});
it('keeps completed links visible and hides retry for nonowners or active publication', () => {
  const { rerender } = render(<DeliveryStatus {...props} canRetry={false} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  rerender(
    <DeliveryStatus {...props} delivery={{ status: 'in_progress', repositories: [repo] }} />,
  );
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  rerender(
    <DeliveryStatus
      {...props}
      delivery={{
        status: 'succeeded',
        repositories: [
          {
            ...repo,
            status: 'succeeded',
            pr: {
              prNumber: 7,
              prUrl: 'https://example.test/pr/7',
              branch: repo.branch,
              baseBranch: repo.baseBranch,
            },
          },
        ],
      }}
    />,
  );
  expect(screen.getByRole('link', { name: 'View pull request #7' })).toHaveAttribute(
    'href',
    'https://example.test/pr/7',
  );
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
it('explains historical unknown status and a read-only assessment of closed work', async () => {
  vi.mocked(intentsService.previewDelivery).mockResolvedValue({
    ...preview,
    historical: true,
    retryable: false,
    delivery: {
      status: 'failed',
      repositories: [
        {
          ...repo,
          retryable: false,
          reason: 'The existing pull request is closed. Retry will not recreate it.',
        },
      ],
    },
  });
  render(<DeliveryStatus {...props} delivery={undefined} />);
  expect(screen.getByText('Delivery not yet verified')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Check delivery' }));
  expect(await screen.findByText(/This older run/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retry delivery' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save delivery assessment' })).toBeInTheDocument();
});
it('shows an unconfirmed pull request as needing review without offering a retry', async () => {
  const uncertain = {
    ...repo,
    status: 'uncertain',
    retryable: false,
    reason: 'Check the branch pull requests at the provider.',
  };
  vi.mocked(intentsService.previewDelivery).mockResolvedValue({
    ...preview,
    retryable: false,
    canRecord: false,
    delivery: { status: 'failed' as const, repositories: [uncertain] },
  });
  render(<DeliveryStatus {...props} delivery={{ status: 'failed', repositories: [uncertain] }} />);
  const user = userEvent.setup();
  expect(screen.getByText(/Pull request ownership unconfirmed/)).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /View pull request/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Check delivery' }));
  await waitFor(() => expect(intentsService.previewDelivery).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: 'Retry delivery' })).not.toBeInTheDocument();
});
it('recognises a recorded pull request instead of saying delivery is unverified', () => {
  render(
    <DeliveryStatus
      {...props}
      delivery={undefined}
      pullRequests={[
        {
          id: 'pr-1',
          repository: 'eipasteur/retail-store-cart',
          prUrl: 'https://github.com/eipasteur/retail-store-cart/pull/57',
          prNumber: '57',
          branch: 'aidlc/cf2-v2618-express',
          baseBranch: null,
          createdAt: '2026-10-01T10:56:00Z',
        },
      ]}
    />,
  );
  expect(screen.queryByText(/not yet verified/)).not.toBeInTheDocument();
  expect(screen.getByText('1 pull request opened')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'View pull request #57' })).toHaveAttribute(
    'href',
    'https://github.com/eipasteur/retail-store-cart/pull/57',
  );
  expect(screen.getByText('retail-store-cart')).toBeInTheDocument();
  expect(screen.getByText(/aidlc\/cf2-v2618-express/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Check delivery' })).toBeInTheDocument();
});
it('uses no text below 11 px and no native details', () => {
  const { container } = render(<DeliveryStatus {...props} />);
  expect(container.innerHTML).not.toMatch(/text-\[(?:[0-9]|10)px\]/);
  expect(container.querySelector('details')).toBeNull();
});
it('does not describe a Retry button that a non-retryable check does not offer', async () => {
  vi.mocked(intentsService.previewDelivery).mockResolvedValue({
    ...preview,
    retryable: false,
    canRecord: false,
  });
  render(<DeliveryStatus {...props} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Check delivery' }));
  await waitFor(() => expect(intentsService.previewDelivery).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument();
  expect(screen.queryByText(/Retry publishes/)).not.toBeInTheDocument();
});
