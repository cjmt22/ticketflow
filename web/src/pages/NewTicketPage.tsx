import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { errorMessages } from '../api/errors';
import { createTicket } from '../api/tickets';
import { FormError } from '../components/FormError';
import { queryClient } from '../queryClient';

export function NewTicketPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const mutation = useMutation({
    mutationFn: createTicket,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
      void navigate('/tickets');
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate({ title: title.trim(), description: description.trim() });
  }

  return (
    <section className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">New ticket</h1>
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-5"
      >
        {mutation.isError && <FormError messages={errorMessages(mutation.error)} />}
        <div className="space-y-1">
          <label htmlFor="title" className="block text-sm font-medium">
            Title
          </label>
          <input
            id="title"
            required
            minLength={3}
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="description" className="block text-sm font-medium">
            Description
          </label>
          <textarea
            id="description"
            required
            minLength={5}
            maxLength={10000}
            rows={6}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {mutation.isPending ? 'Creating…' : 'Create ticket'}
          </button>
          <Link to="/tickets" className="text-sm text-slate-600 hover:underline">
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
}