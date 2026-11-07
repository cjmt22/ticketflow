export function FormError({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <div
      role="alert"
      className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700"
    >
      {messages.length === 1 ? (
        messages[0]
      ) : (
        <ul className="list-disc pl-5">
          {messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}