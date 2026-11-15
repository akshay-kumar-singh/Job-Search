/** Grey placeholder cards shown while the jobs load. */
export default function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading jobs">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="card animate-pulse p-5">
          <div className="flex gap-4">
            <div className="hidden h-14 w-14 shrink-0 rounded-2xl bg-paper-subtle sm:block" />
            <div className="flex-1 space-y-2.5 pt-1">
              <div className="h-3 w-1/4 rounded-full bg-paper-subtle" />
              <div className="h-4 w-2/3 rounded-full bg-paper-subtle" />
              <div className="h-3 w-2/5 rounded-full bg-paper-subtle" />
              <div className="flex gap-2 pt-1">
                <div className="h-5 w-24 rounded-full bg-paper-subtle" />
                <div className="h-5 w-32 rounded-full bg-paper-subtle" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
