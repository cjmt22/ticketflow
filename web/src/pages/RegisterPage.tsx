import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { errorMessages } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { FormError } from '../components/FormError';

export function RegisterPage() {
  const { state, registerOrganisation } = useAuth();
  const navigate = useNavigate();

  const [organisationName, setOrganisationName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  if (state.status === 'authenticated') {
    return <Navigate to="/tickets" replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrors([]);
    setSubmitting(true);
    try {
      await registerOrganisation({ organisationName, fullName, email, password });
      void navigate('/tickets', { replace: true });
    } catch (error) {
      setErrors(errorMessages(error));
      setSubmitting(false);
    }
  }

  const fields = [
    { id: 'organisationName', label: 'Company name', type: 'text', value: organisationName, set: setOrganisationName, autoComplete: 'organization' },
    { id: 'fullName', label: 'Your full name', type: 'text', value: fullName, set: setFullName, autoComplete: 'name' },
    { id: 'email', label: 'Email', type: 'email', value: email, set: setEmail, autoComplete: 'email' },
    { id: 'password', label: 'Password (10 to 72 characters)', type: 'password', value: password, set: setPassword, autoComplete: 'new-password' },
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold">Register your organisation</h1>
        <FormError messages={errors} />
        {fields.map((field) => (
          <div key={field.id} className="space-y-1">
            <label htmlFor={field.id} className="block text-sm font-medium">
              {field.label}
            </label>
            <input
              id={field.id}
              type={field.type}
              autoComplete={field.autoComplete}
              required
              value={field.value}
              onChange={(event) => field.set(event.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2"
            />
          </div>
        ))}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-indigo-600 px-3 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {submitting ? 'Creating…' : 'Create organisation'}
        </button>
        <p className="text-center text-sm text-slate-600">
          Already have an account?{' '}
          <Link to="/login" className="text-indigo-600 hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}