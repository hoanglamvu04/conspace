import { createContext, useCallback, useContext, useState } from 'react';
import { READERS } from '../config.js';
import { readReaderCookie, readerCookieValue } from '../lib/readerLens.js';

const ReaderContext = createContext(null);

function initialReader() {
  if (typeof document === 'undefined') return 'homeowner';
  return readReaderCookie(document.cookie);
}

export function ReaderProvider({ children }) {
  const [reader, setReaderState] = useState(initialReader);
  const setReader = useCallback((id) => {
    if (!READERS.some((role) => role.id === id)) return;
    setReaderState(id);
    const cookie = readerCookieValue(id);
    if (cookie && typeof document !== 'undefined') document.cookie = cookie;
  }, []);
  return <ReaderContext.Provider value={{ reader, setReader }}>{children}</ReaderContext.Provider>;
}

export function useReader() {
  const value = useContext(ReaderContext);
  if (!value) throw new Error('useReader must be inside ReaderProvider');
  return value;
}
