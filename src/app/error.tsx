"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-3 text-ink-soft">
          We couldn&rsquo;t load this page. Nothing you entered was lost on our side – please try again.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 h-10 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
