import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-ink-muted">Page not found</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">This page isn&rsquo;t available</h1>
        <p className="mt-3 text-ink-soft">
          The link may be mistyped, or the page may have been unpublished. If an agent shared it with you, please
          contact them directly.
        </p>
        <Link href="/" className="mt-6 inline-block text-sm font-medium text-accent-ink underline-offset-4 hover:underline">
          Go to the home page
        </Link>
      </div>
    </main>
  );
}
