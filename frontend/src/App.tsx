import { useEffect, useState } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { getApiToken, onUnauthorized, setApiToken } from './api';
import { AuthPage } from './pages/AuthPage';
import { PortfoliosPage } from './pages/PortfoliosPage';
import { PortfolioPage } from './pages/PortfolioPage';
import { BrandMark } from './components/BrandMark';
import { ThemeProvider, ThemeToggle } from './theme';

function RequireSession({ token }: { token: string | null }) {
  const location = useLocation();
  return token ? <Outlet /> : <Navigate to="/login" replace state={{ from: location }} />;
}

function ApplicationLayout({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="site-header-inner">
          <Link className="brand-lockup" to="/portfolios" aria-label="FinTrack by Finnet Technologies — portfolios">
            <BrandMark />
            <span className="brand-name"><strong>FinTrack</strong><small>by Finnet Technologies</small></span>
          </Link>
          <nav className="primary-navigation" aria-label="Main navigation">
            <Link to="/portfolios">Portfolios</Link>
            <ThemeToggle />
            <button className="button button-quiet sign-out-button" type="button" onClick={onSignOut}>Sign out</button>
          </nav>
        </div>
      </header>
      <Outlet />
      <footer className="site-footer"><span>FinTrack by Finnet Technologies</span><span>Ledger-based portfolio tracking</span></footer>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => getApiToken());
  const navigate = useNavigate();
  const location = useLocation();
  const loginReturnPath = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;

  useEffect(() => onUnauthorized(() => {
    setApiToken(null);
    setToken(null);
    navigate('/login', { replace: true, state: { sessionExpired: true } });
  }), [navigate]);

  function acceptSession(value: string) {
    setApiToken(value);
    setToken(value);
  }

  function signOut() {
    setApiToken(null);
    setToken(null);
    navigate('/login', { replace: true });
  }

  return (
    <ThemeProvider>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Routes>
      <Route path="/login" element={token && !loginReturnPath ? <Navigate to="/portfolios" replace /> : <AuthPage mode="login" onAuthenticated={acceptSession} />} />
      <Route path="/register" element={token ? <Navigate to="/portfolios" replace /> : <AuthPage mode="register" onAuthenticated={acceptSession} />} />
      <Route element={<RequireSession token={token} />}>
        <Route element={<ApplicationLayout onSignOut={signOut} />}>
          <Route path="/portfolios" element={<PortfoliosPage />} />
          <Route path="/portfolios/:id" element={<PortfolioPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to={token ? '/portfolios' : '/login'} replace />} />
      </Routes>
    </ThemeProvider>
  );
}
