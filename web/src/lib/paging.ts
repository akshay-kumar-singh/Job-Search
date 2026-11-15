import { useCallback, useState } from 'react'

export const PAGE_SIZE = 10

/** One page of a long list. It goes back to page 1 whenever resetKey changes (another view, filter or search), and
 *  stays on a page that still exists when the list gets shorter (for example after marking a job applied). */
export function usePaged<T>(items: T[], resetKey: string, size = PAGE_SIZE) {
  const [state, setState] = useState({ key: resetKey, page: 1 })
  const pages = Math.max(1, Math.ceil(items.length / size))
  const page = Math.min(state.key === resetKey ? state.page : 1, pages)
  const setPage = useCallback((next: number) => setState({ key: resetKey, page: next }), [resetKey])
  const start = (page - 1) * size
  return {
    page,
    pages,
    setPage,
    items: items.slice(start, start + size),
    from: items.length ? start + 1 : 0,
    to: Math.min(start + size, items.length),
  }
}

/** The page numbers to show, at most 7 so the bar keeps its width: 1 2 3 4 5 … 12, 1 … 5 6 7 … 12, 1 … 8 9 10 11 12. */
export function pageList(page: number, pages: number): (number | 'gap')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  if (page <= 4) return [1, 2, 3, 4, 5, 'gap', pages]
  if (page >= pages - 3) return [1, 'gap', pages - 4, pages - 3, pages - 2, pages - 1, pages]
  return [1, 'gap', page - 1, page, page + 1, 'gap', pages]
}

/** Brings the top of a list into view after changing page (instantly for people who prefer less motion). */
export function scrollToTop(el: HTMLElement | null) {
  const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
}
