export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="animate-pulse space-y-6">
      <div className="h-9 w-56 rounded-lg bg-sunken" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-xl bg-sunken" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-sunken" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
