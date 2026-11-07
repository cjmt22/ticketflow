import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth/AuthContext';

export function Layout() {
  const { state, logout } = useAuth();
  if (state.status !== 'authenticated') return null;
  const { user } = state;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-lg font-semibold">TicketFlow</span>
            <nav className="flex gap-4 text-sm">
              <NavLink
                to="/tickets"
                className={({ isActive }) =>
                  isActive ? 'font-medium text-indigo-600' : 'text-slate-600 hover:text-slate-900'
                }
              >
                Tickets
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-600">
              {user.fullName}{' '}
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                {user.role}
              </span>
            </span>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-100"
            >
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}