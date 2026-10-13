'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

const CURSOR_KEY = 'cursors';

/** Keeps list filters and the pagination cursor stack in the URL so views are shareable. */
export function useUrlFilters<K extends string>(keys: readonly K[]) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const filters = Object.fromEntries(keys.map((k) => [k, params.get(k) ?? ''])) as Record<K, string>;
  const cursorStack = params.get(CURSOR_KEY)?.split(',').filter(Boolean) ?? [];
  const cursor = cursorStack[cursorStack.length - 1];

  const replace = useCallback(
    (next: URLSearchParams) => {
      const s = next.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  /** Changing a filter resets pagination back to the first page. */
  const setFilter = useCallback(
    (key: K, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete(CURSOR_KEY);
      replace(next);
    },
    [params, replace],
  );

  const setCursorStack = useCallback(
    (stack: string[]) => {
      const next = new URLSearchParams(params.toString());
      if (stack.length) next.set(CURSOR_KEY, stack.join(','));
      else next.delete(CURSOR_KEY);
      replace(next);
    },
    [params, replace],
  );

  return { filters, cursor, cursorStack, setFilter, setCursorStack };
}
