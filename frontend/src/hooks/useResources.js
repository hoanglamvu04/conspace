import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl, getJson, requireList } from '../lib/api.js';
import { mergePriorityPages, sortByPriorityIds } from '../lib/readerLens.js';

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

export function useFeed(role = 'homeowner') {
  return useResource(apiUrl('/feed', { limit: 6, role }), { list: false });
}

export function useBooks(role = 'homeowner') {
  return useResource(apiUrl('/books', { role }));
}

export function useFieldNotes(niche = null, limit = 12, offset = 0, role = 'homeowner') {
  return useResource(apiUrl('/field-notes', { niche, limit, offset, role }));
}

export function useQuestions(page = 1, limit = 30) {
  return useResource(apiUrl('/questions', { page, limit }));
}

export function useTerms(query, enabled = true) {
  return useResource(apiUrl('/terms', { q: query, limit: 20 }), { enabled });
}

export function useArticles(role, niche, limit = 9, tag = null) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ status: 'loading', data: [], error: null, nextCursor: null, loadingMore: false });
  const controllerRef = useRef(null);
  const nextAllRef = useRef(null);
  const nextPriorityRef = useRef(null);
  const priorityIdsRef = useRef(new Set());
  const busyRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    nextAllRef.current = null;
    nextPriorityRef.current = null;
    priorityIdsRef.current = new Set();
    busyRef.current = false;
    setState({ status: 'loading', data: [], error: null, nextCursor: null, loadingMore: false });
    const allUrl = apiUrl('/articles', { niche, tag, limit });
    const priorityUrl = role ? apiUrl('/articles', { role, niche, tag, limit }) : null;
    Promise.all([
      getJson(allUrl, { signal: controller.signal }),
      priorityUrl ? getJson(priorityUrl, { signal: controller.signal }).catch(() => null) : Promise.resolve(null),
    ]).then(([allPayload, priorityPayload]) => {
      if (controller.signal.aborted) return;
      const allData = requireList(allPayload);
      const priorityData = priorityPayload ? requireList(priorityPayload) : [];
      priorityIdsRef.current = new Set(priorityData.map((item) => item.id));
      nextAllRef.current = typeof allPayload.meta?.nextCursor === 'string' && allPayload.meta.nextCursor ? allPayload.meta.nextCursor : null;
      nextPriorityRef.current = typeof priorityPayload?.meta?.nextCursor === 'string' && priorityPayload.meta.nextCursor ? priorityPayload.meta.nextCursor : null;
      const merged = sortByPriorityIds(mergePriorityPages(priorityData, allData), priorityIdsRef.current);
      setState({ status: 'success', data: merged, error: null, nextCursor: nextAllRef.current, loadingMore: false });
    }).catch((error) => {
      if (!controller.signal.aborted) setState({ status: 'error', data: [], error, nextCursor: null, loadingMore: false });
    });
    return () => { controller.abort(); controllerRef.current = null; };
  }, [role, niche, tag, limit, revision]);

  const loadMore = useCallback(async () => {
    const controller = controllerRef.current;
    if (!controller || controller.signal.aborted || !nextAllRef.current || busyRef.current) return;
    busyRef.current = true;
    setState((current) => ({ ...current, loadingMore: true, error: null }));
    try {
      const allUrl = apiUrl('/articles', { niche, tag, limit, cursor: nextAllRef.current });
      const priorityUrl = role && nextPriorityRef.current
        ? apiUrl('/articles', { role, niche, tag, limit, cursor: nextPriorityRef.current })
        : null;
      const [allPayload, priorityPayload] = await Promise.all([
        getJson(allUrl, { signal: controller.signal }),
        priorityUrl ? getJson(priorityUrl, { signal: controller.signal }).catch(() => null) : Promise.resolve(null),
      ]);
      if (controller.signal.aborted) return;
      const allData = requireList(allPayload);
      const priorityData = priorityPayload ? requireList(priorityPayload) : [];
      priorityData.forEach((item) => priorityIdsRef.current.add(item.id));
      const allCursor = typeof allPayload.meta?.nextCursor === 'string' && allPayload.meta.nextCursor ? allPayload.meta.nextCursor : null;
      const priorityCursor = typeof priorityPayload?.meta?.nextCursor === 'string' && priorityPayload.meta.nextCursor ? priorityPayload.meta.nextCursor : null;
      nextAllRef.current = allCursor;
      nextPriorityRef.current = priorityCursor;
      setState((current) => ({
        ...current,
        status: 'success',
        data: sortByPriorityIds(mergePriorityPages([...priorityData, ...current.data], allData), priorityIdsRef.current),
        nextCursor: allCursor,
        loadingMore: false,
      }));
    } catch (error) {
      if (!controller.signal.aborted) setState((current) => ({ ...current, loadingMore: false, error }));
    } finally {
      busyRef.current = false;
    }
  }, [role, niche, tag, limit]);

  const retry = useCallback(() => setRevision((current) => current + 1), []);
  return { ...state, retry, loadMore };
}
