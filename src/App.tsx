import { createBrowserRouter, Link, NavLink, Navigate, Outlet, useLocation, useRouteError } from 'react-router-dom';
import { FileUp, LayoutDashboard, Library as LibraryIcon, MonitorCheck } from 'lucide-react';
import { Brand } from './components/AuthFrame';
import Library from './pages/Library';
import Landing from './pages/Landing';
import Import from './pages/Import';
import Editor from './pages/Editor';
import Instructions from './pages/Instructions';
import Exam from './pages/Exam';
import Result from './pages/Result';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Pricing from './pages/Pricing';
import Account from './pages/Account';
import Dashboard from './pages/Dashboard';
import { useAuth } from './lib/session';

function navClass({ isActive }: { isActive: boolean }) {
  return `btn ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`;
}

function OfflineNote() {
  const { offline } = useAuth();
  if (!offline) return null;
  return (
    <div className="bg-amber-50 px-4 py-2 text-center text-sm text-amber-950">
      The account server is not running. Sign-in and saved papers need it. Start the app with npm run dev.
    </div>
  );
}

function Boot() {
  return (
    <div className="grid min-h-full place-items-center text-sm text-slate-500">
      <span className="inline-flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white">
          <MonitorCheck size={18} />
        </span>
        Loading CBT Studio…
      </span>
    </div>
  );
}

function AppShell() {
  const { user, billing } = useAuth();
  return (
    <div className="flex min-h-full flex-col">
      <OfflineNote />
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 sm:px-4">
          <Brand />
          <nav className="ml-auto flex items-center gap-0.5 sm:gap-1">
            <NavLink to="/dashboard" className={navClass}>
              <LayoutDashboard size={16} /> <span className="hidden sm:inline">Dashboard</span>
            </NavLink>
            <NavLink to="/" end className={navClass}>
              <LibraryIcon size={16} /> <span className="hidden sm:inline">Library</span>
            </NavLink>
            <NavLink to="/import" className={navClass}>
              <FileUp size={16} /> <span className="hidden sm:inline">Import</span>
            </NavLink>
            <NavLink to="/pricing" className={navClass}>
              Plans
            </NavLink>
            {billing?.status !== 'active' && (
              <Link to="/pricing" className="btn-primary py-1.5">
                Upgrade
              </Link>
            )}
            <NavLink to="/account" className={navClass}>
              <span className="max-w-16 truncate">{user?.name.split(' ')[0] ?? 'Account'}</span>
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

function PublicShell() {
  return (
    <div className="flex min-h-full flex-col">
      <OfflineNote />
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3 sm:px-4">
          <Brand />
          <nav className="ml-auto flex items-center gap-1">
            <NavLink to="/pricing" className={navClass}>
              Plans
            </NavLink>
            <NavLink to="/login" className={navClass}>
              Sign in
            </NavLink>
            <Link to="/signup" className="btn-primary px-3">
              <span className="sm:hidden">Start</span>
              <span className="hidden sm:inline">Create account</span>
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 px-4 py-6 text-center text-xs text-slate-500">
        CBT Studio · Upload only question papers you have the right to use.
      </footer>
    </div>
  );
}

function Root() {
  const { user, loading } = useAuth();
  if (loading) return <Boot />;
  return user ? <AppShell /> : <PublicShell />;
}

function Home() {
  const { user } = useAuth();
  return user ? <Library /> : <Landing />;
}

function RequireAuth() {
  const { user, loading, offline } = useAuth();
  const location = useLocation();
  if (loading) return <Boot />;
  if (offline) {
    return (
      <div className="grid min-h-full place-items-center p-8 text-center">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Account server is not running</h1>
          <p className="mt-2 text-sm text-slate-600">Start CBT Studio with npm run dev, then refresh this page.</p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <Outlet />;
}

function ErrorPage() {
  const err = useRouteError() as Error | undefined;
  return (
    <div className="mx-auto max-w-lg p-10 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-500">{err?.message ?? 'Unknown error'}</p>
      <Link to="/" className="btn-primary mt-6">
        Back to library
      </Link>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <ErrorPage />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/pricing', element: <Pricing /> },
      { path: '/login', element: <Login /> },
      { path: '/signup', element: <Signup /> },
      {
        element: <RequireAuth />,
        children: [
          { path: '/dashboard', element: <Dashboard /> },
          { path: '/import', element: <Import /> },
          { path: '/paper/:id', element: <Editor /> },
          { path: '/account', element: <Account /> },
          { path: '/result/:attemptId', element: <Result /> },
        ],
      },
    ],
  },
  {
    element: <RequireAuth />,
    errorElement: <ErrorPage />,
    children: [
      { path: '/paper/:id/start', element: <Instructions /> },
      { path: '/exam/:attemptId', element: <Exam /> },
    ],
  },
]);
