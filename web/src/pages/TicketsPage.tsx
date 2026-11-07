import { useAuth } from '../auth/AuthContext';

export function TicketsPage() {
  const { state } = useAuth();
  if (state.status !== 'authenticated') return null;

  return (
    <section>
      <h1 className="text-2xl font-semibold">Tickets</h1>
      <p className="mt-2 text-slate-600">
        You are signed in as {state.user.fullName}. The ticket list comes next.
      </p>
    </section>
  );
}