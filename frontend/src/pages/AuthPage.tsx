import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { BrandMark } from '../components/BrandMark';
import { ThemeToggle } from '../theme';

interface AuthPageProps {
  mode: 'login' | 'register';
  onAuthenticated: (token: string) => void;
}

interface NavigationState {
  registrationSuccess?: boolean;
  sessionExpired?: boolean;
  from?: { pathname?: string };
}

function messageFrom(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'FinTrack could not complete your request. Check your connection and try again.';
}

export function AuthPage(props: AuthPageProps) {
  return <AuthForm key={props.mode} {...props} />;
}

function AuthForm({ mode, onAuthenticated }: AuthPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationState = location.state as NavigationState | null;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isPending, setIsPending] = useState(false);
  const activeRequest = useRef<symbol | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState(
    navigationState?.registrationSuccess ? 'Account created. Sign in to continue.'
      : navigationState?.sessionExpired ? 'Your session ended. Sign in again to continue.'
        : '',
  );

  useEffect(() => {
    document.title = `${mode === 'login' ? 'Sign in' : 'Create account'} · FinTrack by Finnet Technologies`;
  }, [mode]);

  useLayoutEffect(() => () => {
    activeRequest.current = null;
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeRequest.current !== null) return;

    const request = Symbol();
    activeRequest.current = request;
    setErrorMessage('');
    setNotice('');
    setIsPending(true);
    const credentials = { username: username.trim(), password };
    try {
      if (mode === 'register') {
        await api.register(credentials);
        if (activeRequest.current !== request) return;
        navigate('/login', { replace: true, state: { registrationSuccess: true } });
      } else {
        const session = await api.login(credentials);
        if (activeRequest.current !== request) return;
        onAuthenticated(session.access_token);
        navigate(navigationState?.from?.pathname || '/portfolios', { replace: true });
      }
    } catch (error) {
      if (activeRequest.current === request) setErrorMessage(messageFrom(error));
    } finally {
      if (activeRequest.current === request) {
        activeRequest.current = null;
        setIsPending(false);
      }
    }
  }

  const isLogin = mode === 'login';
  return (
    <main id="main-content" className="auth-page">
      <section className="auth-intro" aria-labelledby="auth-intro-heading">
        <p className="eyebrow">Finnet portfolio workspace</p>
        <h1 id="auth-intro-heading">A clearer view of every portfolio.</h1>
        <p>Keep trades together, follow open positions and review values from one dependable ledger.</p>
        <div className="auth-proofline"><span aria-hidden="true" /> Ledger-backed holdings and trade history</div>
      </section>

      <section className="auth-panel" aria-labelledby="auth-heading">
        <div className="auth-panel-header">
          <div className="auth-brand" aria-label="FinTrack by Finnet Technologies">
            <BrandMark />
            <span><strong>FinTrack</strong><small>by Finnet Technologies</small></span>
          </div>
          <ThemeToggle />
        </div>
        <div className="auth-form-heading">
          <p className="eyebrow">Secure analyst access</p>
          <h2 id="auth-heading">{isLogin ? 'Welcome back' : 'Create your account'}</h2>
          <p>{isLogin ? 'Sign in to open your portfolios.' : 'Set up an analyst account to start tracking portfolios.'}</p>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <div className="field-group">
            <label htmlFor="auth-username">Username</label>
            <input
              id="auth-username"
              name="username"
              autoComplete="username"
              minLength={3}
              maxLength={64}
              pattern="[A-Za-z0-9_.\-]{3,64}"
              required
              value={username}
              onChange={(event) => setUsername(event.currentTarget.value)}
              disabled={isPending}
            />
          </div>
          <div className="field-group">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              name="password"
              type="password"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              minLength={10}
              maxLength={128}
              required
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              disabled={isPending}
            />
          </div>
          {notice ? <p className="form-message form-message-success" role="status" aria-live="polite">{notice}</p> : null}
          {errorMessage ? <p className="form-message form-message-error" role="alert">{errorMessage}</p> : null}
          <button className="button button-primary button-wide" type="submit" disabled={isPending} aria-busy={isPending}>
            {isPending ? (isLogin ? 'Signing in…' : 'Creating account…') : (isLogin ? 'Sign in' : 'Create account')}
          </button>
        </form>

        <p className="auth-switch">
          {isLogin ? 'New to FinTrack?' : 'Already have an account?'}{' '}
          <Link to={isLogin ? '/register' : '/login'}>{isLogin ? 'Create an account' : 'Sign in'}</Link>
        </p>
        <p className="auth-session-note">Your sign-in lasts for this browser session. Sign in again after refreshing the page.</p>
      </section>
    </main>
  );
}
