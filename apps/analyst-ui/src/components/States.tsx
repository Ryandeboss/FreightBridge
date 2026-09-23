import { AlertCircle, RefreshCw } from 'lucide-react';

export function LoadingBlock({ label = 'Loading data' }: { label?: string }) {
  return <div className="state-block">{label}...</div>;
}

export function EmptyBlock({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="state-block">
      <strong>{title}</strong>
      {detail && <span>{detail}</span>}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state-block state-error" role="alert">
      <AlertCircle size={18} />
      <strong>{message}</strong>
      {onRetry && (
        <button className="secondary-button" type="button" onClick={onRetry}>
          <RefreshCw size={16} />
          Retry
        </button>
      )}
    </div>
  );
}
