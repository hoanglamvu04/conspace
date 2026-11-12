import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl, getJson, requireList } from '../lib/api.js';

export function useResource(url, options = {}) {
  const enabled = options.enabled ?? true;
  const list = options.list ?? true;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ status: enabled ? 'loading' : 'idle', data: list ? [] : null, error: null });

  useEffect(() => {
    if (!enabled || !url) {
      setState({ status: 'idle', data: list ? [] : null, error: null });
      return undefined;
    }
    const controller = new AbortController();
    setState({ status: 'loading', data: list ? [] : null, error: null });
    getJson(url, { signal: controller.signal })
      .then((payload) => {
        if (controller.signal.aborted) return;
        const data = list ? requireList(payload) : payload.data;
        if (!list && (!data || typeof data !== 'object' || Array.isArray(data))) {
          throw new Error('Nội dung không hợp lệ.');
        }
        setState({ status: 'success', data, error: null, meta: payload.meta || {} });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setState({ status: 'error', data: list ? [] : null, error });
      });
    return () => controller.abort();
  }, [url, enabled, list, revision]);

  const retry = useCallback(() => setRevision((current) => current + 1), []);
  return { ...state, retry };
}

export function useNiches(group) {
  return useResource(apiUrl('/niches', group ? { group } : {}));
}

export function useTerms(query, enabled = true) {
  return useResource(apiUrl('/terms', { q: query, limit: 20 }), { enabled });
}

export function useArticles(role, niche, limit = 9) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ status: 'loading', data: [], error: null, nextCursor: null, loadingMore: false });
  const controllerRef = useRef(null);
  const nextRef = useRef(null);
  const busyRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    nextRef.current = null;
    busyRef.current = false;
    setState({ status: 'loading', data: [], error: null, nextCursor: null, loadingMore: false });
    getJson(apiUrl('/articles', { role, niche, limit }), { signal: controller.signal })
      .then((payload) => {
        if (controller.signal.aborted) return;
        const data = requireList(payload);
        nextRef.current = typeof payload.meta?.nextCursor === 'string' && payload.meta.nextCursor ? payload.meta.nextCursor : null;
        setState({ status: 'success', data, error: null, nextCursor: nextRef.current, loadingMore: false });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setState({ status: 'error', data: [], error, nextCursor: null, loadingMore: false });
      });
    return () => { controller.abort(); controllerRef.current = null; };
  }, [role, niche, limit, revision]);

  const loadMore = useCallback(async () => {
    const controller = controllerRef.current;
    if (!controller || controller.signal.aborted || !nextRef.current || busyRef.current) return;
    busyRef.current = true;
    setState((current) => ({ ...current, loadingMore: true, error: null }));
    try {
      const payload = await getJson(apiUrl('/articles', { role, niche, limit, cursor: nextRef.current }), { signal: controller.signal });
      const data = requireList(payload);
      if (controller.signal.aborted) return;
      const cursor = typeof payload.meta?.nextCursor === 'string' && payload.meta.nextCursor ? payload.meta.nextCursor : null;
      // A misbehaving cursor must not create a loop.
      nextRef.current = cursor === nextRef.current ? null : cursor;
      setState((current) => ({ ...current, status: 'success', data: [...current.data, ...data.filter((item) => !current.data.some((old) => old.id === item.id))], nextCursor: nextRef.current, loadingMore: false }));
    } catch (error) {
      if (!controller.signal.aborted) setState((current) => ({ ...current, loadingMore: false, error }));
    } finally {
      busyRef.current = false;
    }
  }, [role, niche, limit]);
  return { ...state, retry: () => setRevision((n) => n + 1), loadMore };
}
