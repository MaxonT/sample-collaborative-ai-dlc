import { useEffect, useRef, useState } from 'react';
import { CircleCheck, ExternalLink, GitPullRequest, type LucideIcon } from 'lucide-react';
import { useIntentOptional } from '@/contexts/IntentContext';
import {
  intentsService,
  type DeliveryPreview,
  type IntentDelivery,
  type IntentPullRequest,
} from '@/services/intents';
import { gitRepoSlug } from '@/services/gitProvider';
import { Button } from '@/components/ui/button';
import { getStatus, TONE_CLASSES, type ConfigStatusKey, type StatusTone } from '@/lib/statusModel';
import { cn } from '@/lib/utils';

type DeliveryStatusKey = IntentDelivery['status'] | 'uncertain';

const labels: Record<DeliveryStatusKey, string> = {
  unknown: 'Delivery not yet verified',
  pending: 'Ready to publish',
  in_progress: 'Publishing pull requests…',
  succeeded: 'Pull requests published',
  failed: 'Delivery needs attention',
  partial: 'Some repositories need attention',
  no_change: 'No changes to publish',
  uncertain: 'Pull request ownership unconfirmed',
};

// Delivery outcomes are a config-shaped question ("is publication in place?"),
// so the pill reuses the config registry: configured / incomplete / error / none / unknown.
const PILL_STATUS: Record<DeliveryStatusKey, ConfigStatusKey> = {
  unknown: 'unknown',
  pending: 'incomplete',
  in_progress: 'incomplete',
  succeeded: 'configured',
  failed: 'error',
  partial: 'error',
  no_change: 'none',
  uncertain: 'incomplete',
};

const SECTION_TONE: Record<StatusTone, string> = {
  neutral: 'border-border',
  info: 'border-border',
  running: 'border-agent-running/40',
  waiting: 'border-agent-waiting/40',
  success: 'border-agent-success/40',
  danger: 'border-agent-error/40',
  warning: 'border-warning/40',
};

const repoShortName = (repository: string | null | undefined) =>
  repository ? (gitRepoSlug(repository).split('/').pop() ?? repository) : null;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function PullRequestLink({
  url,
  number,
}: {
  url: string | null | undefined;
  number: string | number | null | undefined;
}) {
  if (!url) return null;
  return (
    <a
      className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
      href={url}
      target="_blank"
      rel="noreferrer"
    >
      View pull request{number != null && number !== '' ? ` #${number}` : ''}
      <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
    </a>
  );
}

function RepositoryRow({
  icon: Icon,
  name,
  status,
  branch,
  baseBranch,
  reason,
  pr,
}: {
  icon: LucideIcon;
  name: string;
  status?: string;
  branch: string | null;
  baseBranch: string | null;
  reason?: string;
  pr?: { url: string | null; number: string | number | null } | null;
}) {
  return (
    <li className="flex gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs">
      <Icon aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-medium text-foreground">{name}</span>
          {status && <span className="text-muted-foreground">{status}</span>}
          {pr && (
            <span className="ml-auto">
              <PullRequestLink url={pr.url} number={pr.number} />
            </span>
          )}
        </p>
        {branch && (
          <p className="text-muted-foreground">
            <code className="break-all font-mono text-foreground">{branch}</code>
            {' → '}
            {baseBranch || 'default branch'}
          </p>
        )}
        {reason && <p className="text-foreground">{reason}</p>}
      </div>
    </li>
  );
}

export function DeliveryStatus({
  projectId,
  intentId,
  delivery,
  pullRequests,
  canRetry,
  reload,
}: {
  projectId: string;
  intentId: string;
  delivery?: IntentDelivery;
  /** Run-level pull requests already recorded by the engine (fan-in). */
  pullRequests?: IntentPullRequest[];
  canRetry: boolean;
  reload: () => Promise<unknown>;
}) {
  const intentContext = useIntentOptional();
  const recordedPrs = (pullRequests ?? intentContext?.detail?.pullRequests ?? []).filter(
    (pr) => pr.prUrl,
  );
  const [preview, setPreview] = useState<DeliveryPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const shown = preview?.delivery ?? delivery;
  const status: DeliveryStatusKey = shown?.status ?? 'unknown';
  const recordedOnly = status === 'unknown' && recordedPrs.length > 0;
  const headline = recordedOnly
    ? `${plural(recordedPrs.length, 'pull request')} opened`
    : labels[status];
  const pillStatus: ConfigStatusKey = recordedOnly ? 'configured' : PILL_STATUS[status];
  const headlineEntry = getStatus('config', pillStatus);
  const tone = headlineEntry.tone;
  const HeadlineIcon = headlineEntry.icon;
  const offersRetry = !!preview && (preview.retryable || preview.canRecord);
  const offersActions =
    canRetry &&
    status !== 'in_progress' &&
    !['succeeded', 'no_change'].includes(delivery?.status ?? '');

  const check = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await intentsService.previewDelivery(projectId, intentId);
      if (alive.current) setPreview(result);
    } catch (cause) {
      if (alive.current)
        setError(cause instanceof Error ? cause.message : 'Delivery could not be checked');
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const retry = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      await intentsService.retryDelivery(projectId, intentId, preview.previewToken);
      if (alive.current) {
        setPreview(null);
        await reload();
      }
    } catch (cause) {
      if (alive.current) {
        setPreview(null);
        setError(cause instanceof Error ? cause.message : 'Delivery retry could not start');
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <section
      aria-label="Final delivery"
      className={cn('space-y-3 rounded-lg border p-4 text-sm', SECTION_TONE[tone])}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Delivery</h2>
        <span
          data-tone={tone}
          className={cn('inline-flex items-center gap-1.5 text-sm', TONE_CLASSES[tone].text)}
        >
          <HeadlineIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
          {headline}
        </span>
      </div>
      {shown?.message && !recordedOnly && <p className="text-muted-foreground">{shown.message}</p>}

      {(shown?.repositories.length ?? 0) > 0 && (
        <ul className="space-y-1.5">
          {shown!.repositories.map((repo) => (
            <RepositoryRow
              key={repo.repoId}
              icon={repo.pr ? GitPullRequest : CircleCheck}
              name={repoShortName(repo.repoId) ?? repo.repoId}
              status={labels[repo.status as DeliveryStatusKey] ?? repo.status}
              branch={repo.branch}
              baseBranch={repo.baseBranch}
              reason={repo.reason}
              pr={repo.pr ? { url: repo.pr.prUrl, number: repo.pr.prNumber } : null}
            />
          ))}
        </ul>
      )}

      {recordedOnly && (
        <ul className="space-y-1.5">
          {recordedPrs.map((pr) => (
            <RepositoryRow
              key={pr.id}
              icon={GitPullRequest}
              name={repoShortName(pr.repository) ?? 'Repository'}
              branch={pr.branch}
              baseBranch={pr.baseBranch}
              pr={{ url: pr.prUrl, number: pr.prNumber }}
            />
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-agent-error-fg">
          {error}
        </p>
      )}

      {offersActions && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {recordedOnly
              ? 'Check delivery confirms the pull request is still open.'
              : 'Check delivery inspects the recorded branches and pull requests.'}
            {offersRetry && preview.retryable
              ? ' Retry publishes the existing intent branch; it does not regenerate code, rerun stages or merge the pull request.'
              : null}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" loading={busy} onClick={() => void check()}>
              {busy ? 'Checking…' : 'Check delivery'}
            </Button>
            {offersRetry && (
              <Button size="sm" disabled={busy} onClick={() => void retry()}>
                {preview.retryable ? 'Retry delivery' : 'Save delivery assessment'}
              </Button>
            )}
          </div>
        </div>
      )}
      {preview?.historical && (
        <p className="text-xs text-muted-foreground">
          This older run has no delivery record. Review the branch and repository results above
          before confirming.
        </p>
      )}
    </section>
  );
}
