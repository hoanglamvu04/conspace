import { createContext, useCallback, useContext, useState } from 'react';
import { READERS } from '../config.js';

const ReaderContext = createContext(null);
const COOKIE_NAME = 'conspace_reader';

function initialReader() {
  if (typeof document === 'undefined') return 'homeowner';
  const match = document.cookie.split('; ').find((entry) => entry.startsWith(`${COOKIE_NAME}=`));
  const value = match?.split('=')[1];
  return READERS.some((role) => role.id === value) ? value : 'homeowner';
}

export function ReaderProvider({ children }) {
  const [reader, setReaderState] = useState(initialReader);
  const setReader = useCallback((id) => {
    if (!READERS.some((role) => role.id === id)) return;
    setReaderState(id);
    document.cookie = `${COOKIE_NAME}=${id}; Max-Age=31536000; Path=/; SameSite=Lax`;
  }, []);
  return <ReaderContext.Provider value={{ reader, setReader }}>{children}</ReaderContext.Provider>;
}

export function useReader() {
  const value = useContext(ReaderContext);
  if (!value) throw new Error('useReader must be inside ReaderProvider');
  return value;
}
