import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { ApiError } from '../api/client';
import { useOperationsSession } from '../auth/OperationsSession';

export function AccessPage() {
  const { connect, sessionMessage } = useOperationsSession();
  const [token, setToken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(sessionMessage);
  const [tone, setTone] = useState<'error' | 'info'>('info');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    try {
      await connect(token);
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null;
      setTone(apiError?.status === 401 ? 'error' : 'info');
      setMessage(apiError?.message ?? 'The console could not validate that token.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="access-page">
      <section className="access-panel">
        <div className="brand-mark large">
          <ShieldCheck size={30} />
        </div>
        <p className="eyebrow">Operations access</p>
        <h1>FreightBridge Analyst Console</h1>
        <form onSubmit={onSubmit} className="access-form">
          <label htmlFor="operations-token">Operations bearer token</label>
          <input
            id="operations-token"
            name="operations-token"
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            autoComplete="off"
            required
          />
          {message && (
            <p className={`form-message ${tone === 'error' ? 'form-error' : 'form-info'}`} role="alert">
              {message}
            </p>
          )}
          <button className="primary-button full-width" type="submit" disabled={isSubmitting}>
            <LockKeyhole size={16} />
            {isSubmitting ? 'Validating' : 'Unlock Console'}
          </button>
        </form>
      </section>
    </main>
  );
}
