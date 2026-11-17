/**
 * Hooks fetch after render. Hide results from the previous route/reader lens
 * immediately, before the next effect runs, to avoid flashing stale content.
 */
export function visibleResourceState(state, activeKey, list = true) {
  if (state?.key === activeKey) return state;
  return {
    key: activeKey,
    status: activeKey ? 'loading' : 'idle',
    data: list ? [] : null,
    error: null,
    meta: null,
  };
}

export function visibleArticleState(state, requestKey) {
  if (state?.requestKey === requestKey) return state;
  return {
    requestKey,
    status: 'loading',
    data: [],
    error: null,
    nextCursor: null,
    loadingMore: false,
  };
}
