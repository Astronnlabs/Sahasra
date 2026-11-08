import { useEffect, useRef } from 'react';

interface HotkeyOptions {
  ctrl?: boolean;
  /** Fire even while typing in an input. */
  allowInInputs?: boolean;
  enabled?: boolean;
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

export function useHotkey(key: string, handler: (e: KeyboardEvent) => void, { ctrl, allowInInputs, enabled = true }: HotkeyOptions = {}) {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== key.toLowerCase()) return;
      if (ctrl && !(e.ctrlKey || e.metaKey)) return;
      if (!ctrl && (e.ctrlKey || e.metaKey || e.altKey)) return;
      if (!allowInInputs && isTyping(e.target)) return;
      ref.current(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [key, ctrl, allowInInputs, enabled]);
}
