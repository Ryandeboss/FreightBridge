import { ArrowLeft, LockKeyhole, ShieldCheck } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useOperationsSession } from '../auth/OperationsSession';
import { startLearningJourney } from '../training/journey';

function requestedDestination(search: string): string {
  const candidate = new URLSearchParams(search).get('next');
  if (candidate?.startsWith('/learn/')) return candidate;
  return '/learn/orientation';
}

export function AccessPage() {
  const { connect, isAuthenticated, sessionMessage } = useOperationsSession();
  const location = useLocation();
  const navigate = useNavigate();
  const destination = requestedDestination(location.search);
  const [token, setToken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(sessionMessage);
  const [tone, setTone] = useState<'error' | 'info'>('info');

  if (isAuthenticated) {
    return <Navigate to={destination} replace />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    try {
      await connect(token);
      startLearningJourney();
      navigate(destination, { replace: true });
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null;
      setTone(apiError?.status === 401 ? 'error' : 'info');
      setMessage(apiError?.message ?? 'FreightBridge could not validate that access key.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="journey-access-page" data-testid="journey-access-page">
      <section className="journey-access-panel">
        <Link className="journey-access-back" to="/learn">
          <ArrowLeft size={16} />
          Back
        </Link>

        <div className="journey-access-mark">
          <ShieldCheck size={24} />
        </div>

        <div className="journey-access-copy">
          <p className="journey-wordmark">FreightBridge</p>
          <h1>One quick step before training.</h1>
          <p>Enter your access key to open the learning environment. Your training progress stays in this browser for now.</p>
        </div>

        <form onSubmit={onSubmit} className="journey-access-form">
          <label htmlFor="operations-token">Access key</label>
          <input
            id="operations-token"
            name="operations-token"
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            autoComplete="off"
            required
            autoFocus
          />
          {message && (
            <p className={`form-message ${tone === 'error' ? 'form-error' : 'form-info'}`} role="alert">
              {message}
            </p>
          )}
          <button className="journey-start-button" type="submit" disabled={isSubmitting}>
            <LockKeyhole size={16} />
            {isSubmitting ? 'Opening training…' : 'Enter Training'}
          </button>
        </form>
      </section>
    </main>
  );
}
