import { useRef, useEffect, useCallback } from 'react';

export function useDebouncedCallback(callback, delay = 1500) {
  const timeoutRef = useRef(null);

  const debounced = useCallback((...args) => {
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      callback(...args);
    }, delay);
  }, [callback, delay]);

  useEffect(() => {
    return () => window.clearTimeout(timeoutRef.current);
  }, []);

  return debounced;
}
