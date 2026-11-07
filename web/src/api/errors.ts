import { ApiError } from './client';

/** Turns any error into one or more messages a person can read. */
export function errorMessages(error: unknown): string[] {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return ['Too many attempts. Please wait a minute and try again.'];
    }
    const details = error.details;
    if (
      typeof details === 'object' &&
      details !== null &&
      'errors' in details &&
      Array.isArray(details.errors)
    ) {
      const messages = details.errors
        .map((item: unknown) => {
          if (typeof item !== 'object' || item === null) return null;
          const { path, message } = item as { path?: string; message?: string };
          if (!message) return null;
          return path ? `${path}: ${message}` : message;
        })
        .filter((message): message is string => message !== null);
      if (messages.length > 0) return messages;
    }
    return [error.message];
  }
  return ['Something went wrong. Please check your connection and try again.'];
}