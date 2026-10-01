import { ArrowLeft, LogIn, ShieldCheck, UserPlus } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useOperationsSession } from '../auth/OperationsSession';
import { hasStartedLearningJourney, startLearningJourney } from '../training/journey';

function requestedDestination(search: string): string {
  const candidate = new URLSearchParams(search).get('next');
  if (candidate?.startsWith('/learn/')) return candidate;
  return '/learn/orientation';
}

export function AccessPage() {
  const { signIn, register, isAuthenticated, sessionMessage } = useOperationsSession();
  const location = useLocation();
  const navigate = useNavigate();
  const destination = requestedDestination(location.search);
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      if (mode === 'signin') {
        await signIn(email, password);
        const resumed = hasStartedLearningJourney();
        startLearningJourney();
        navigate(resumed ? '/learn/desk' : destination, { replace: true });
      } else {
        const result = await register(email, password);
        if (result === 'SIGNED_IN') {
          const resumed = hasStartedLearningJourney();
          startLearningJourney();
          navigate(resumed ? '/learn/desk' : destination, { replace: true });
        } else {
          setTone('info');
          setMessage('Account created. Check your email to confirm the address, then sign in here.');
          setMode('signin');
          setPassword('');
        }
      }
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null;
      setTone('error');
      setMessage(apiError?.message ?? 'FreightBridge could not complete the account request.');
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
          <h1>{mode === 'signin' ? 'Sign in to continue training.' : 'Create your learner account.'}</h1>
          <p>
            {mode === 'signin'
              ? 'Your course progress is tied to your account, so you can resume on another browser or device.'
              : 'Use an email and password to save your FreightBridge course progress securely.'}
          </p>
        </div>

        <div className="journey-account-switch" role="group" aria-label="Account action">
          <button
            type="button"
            className={mode === 'signin' ? 'active' : ''}
            aria-label="Show sign in"
            onClick={() => {
              setMode('signin');
              setMessage(null);
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            aria-label="Show create account"
            onClick={() => {
              setMode('register');
              setMessage(null);
            }}
          >
            Create account
          </button>
        </div>

        <form onSubmit={onSubmit} className="journey-access-form">
          <label htmlFor="account-email">Email</label>
          <input
            id="account-email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            autoFocus
          />

          <label htmlFor="account-password">Password</label>
          <input
            id="account-password"
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            minLength={8}
            required
          />
          {mode === 'register' && <small>Use at least 8 characters.</small>}

          {message && (
            <p className={`form-message ${tone === 'error' ? 'form-error' : 'form-info'}`} role="alert">
              {message}
            </p>
          )}

          <button className="journey-start-button" type="submit" disabled={isSubmitting}>
            {mode === 'signin' ? <LogIn size={16} /> : <UserPlus size={16} />}
            {isSubmitting
              ? mode === 'signin' ? 'Signing in…' : 'Creating account…'
              : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
      </section>
    </main>
  );
}
