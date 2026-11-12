import { useCallback, useEffect, useState } from 'react';
import { adminList, adminObject, adminPath } from './api.js';

export function useAdminList(resource, params = {}, enabled = true) {
  const key = JSON.stringify(params);
  const [rev, setRev] = useState(0);
  const [state, setState] = useState({ status: 'loading', data: [], meta: {}, error: null });
  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    setState({ status: 'loading', data: [], meta: {}, error: null });
    const safeParams = JSON.parse(key);
    adminList(resource, safeParams, { signal: controller.signal })
      .then((payload) => { if (!controller.signal.aborted) setState({ status: 'success', data: payload.data, meta: payload.meta || {}, error: null }); })
      .catch((error) => { if (!controller.signal.aborted) setState({ status: 'error', data: [], meta: {}, error }); });
    return () => controller.abort();
  }, [resource, key, rev, enabled]);
  const retry = useCallback(() => setRev((x) => x + 1), []);
  return { ...state, retry };
}

export function useAdminObject(resource, enabled = true) {
  const [rev, setRev] = useState(0);
  const [state, setState] = useState({ status: enabled ? 'loading' : 'idle', data: null, error: null });
  useEffect(() => {
    if (!enabled || !resource) { setState({ status: 'idle', data: null, error: null }); return undefined; }
    const controller = new AbortController();
    setState({ status: 'loading', data: null, error: null });
    adminObject(resource, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setState({ status: 'success', data, error: null }); })
      .catch((error) => { if (!controller.signal.aborted) setState({ status: 'error', data: null, error }); });
    return () => controller.abort();
  }, [resource, rev, enabled]);
  return { ...state, retry: useCallback(() => setRev((x) => x + 1), []) };
}

export function useAdminPagination(defaultLimit = 15) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(defaultLimit);
  return { page, setPage, limit, setLimit };
}

export function makeAdminQuery({ q, status, page, limit, extra = {} } = {}) {
  return { q: q?.trim() || undefined, status: status || undefined, page, limit, ...extra };
}
