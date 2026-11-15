import { pageList } from '../lib/paging'

interface Props {
  page: number
  pages: number
  onPage: (page: number) => void
}

/** ← Previous  1 … 4 5 6 … 12  Next →   (on a phone: ← Page 5 of 12 →) */
export default function Pagination({ page, pages, onPage }: Props) {
  if (pages <= 1) return null
  const go = (next: number) => onPage(Math.min(Math.max(1, next), pages))

  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-2 pt-2 sm:justify-center">
      <button type="button" onClick={() => go(page - 1)} disabled={page === 1} className="btn btn-secondary" aria-label="Previous page">
        ← <span className="hidden sm:inline">Previous</span>
      </button>
      <span className="text-sm text-muted sm:hidden">
        Page <b className="font-display font-extrabold text-ink">{page}</b> of {pages}
      </span>
      <ol className="hidden items-center gap-1 sm:flex">
        {pageList(page, pages).map((p, i) => (
          <li key={p === 'gap' ? `gap-${i}` : p}>
            {p === 'gap' ? (
              <span className="px-1.5 text-faint" aria-hidden>
                …
              </span>
            ) : (
              <button
                type="button"
                onClick={() => go(p)}
                aria-current={p === page ? 'page' : undefined}
                aria-label={`Page ${p}`}
                className={`h-9 min-w-9 rounded-full px-3 font-display text-sm font-bold transition ${
                  p === page ? 'bg-ink text-white' : 'text-muted hover:bg-paper-subtle hover:text-ink'
                }`}
              >
                {p}
              </button>
            )}
          </li>
        ))}
      </ol>
      <button type="button" onClick={() => go(page + 1)} disabled={page === pages} className="btn btn-secondary" aria-label="Next page">
        <span className="hidden sm:inline">Next</span> →
      </button>
    </nav>
  )
}
