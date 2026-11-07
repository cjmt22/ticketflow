import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api/client';

// Server data is cached here. It is cleared whenever someone logs in or out,
// so one person's tickets can never show up for the next person on the same browser.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Retrying a 400 or 404 never helps; only retry network and server errors.
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
        failureCount < 2,
    },
  },
});