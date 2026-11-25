import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { OAuthCallbackShell } from '@/components/OAuthCallbackShell';
import { useOAuthReturnPath } from '@/hooks/useOAuthReturnPath';
import { useOAuthExchange } from '@/hooks/useOAuthExchange';
import { getTrackerProvider } from '@/lib/trackerProviders';

export function GitOAuthCallback({ trackerProviderId }: { trackerProviderId: string }) {
  const navigate = useNavigate();
  const meta = getTrackerProvider(trackerProviderId);
  const { back, resume } = useOAuthReturnPath();
  const result = useOAuthExchange(meta.callbackPath, meta.tabLabel);
  const provider =
    trackerProviderId === 'gitlab-issues'
      ? 'gitlab'
      : trackerProviderId === 'bitbucket-issues'
        ? 'bitbucket'
        : 'github';
  useEffect(() => {
    if (!result?.success) return;
    const timer = setTimeout(
      () =>
        navigate(resume ?? `${back}?reopenCreateSpace=1&gitProvider=${provider}`, {
          replace: true,
        }),
      1500,
    );
    return () => clearTimeout(timer);
  }, [navigate, provider, back, resume, result?.success]);
  return (
    <OAuthCallbackShell
      status={!result ? 'loading' : result.success ? 'success' : 'error'}
      providerLabel={meta.tabLabel}
      errorMessage={result?.error}
      backTo={back}
    />
  );
}
