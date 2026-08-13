import { useEffect, useRef } from 'react';

/**
 * Focus a search input when "/" is pressed, and blur it on Escape.
 *
 * Both search boxes already render a "/" glyph in their leading slot, which is the
 * established convention for a focus shortcut (GitHub, Slack, LeetCode itself). The
 * glyph was decorative — this makes it mean what it looks like it means.
 *
 * Returns a ref to attach to the input.
 */
export default function useSearchShortcut() {
  const ref = useRef(null);

  useEffect(() => {
    const onKeyDown = (event) => {
      const input = ref.current;
      if (!input) return;

      // "/" is a legitimate character once you are in a field, so never steal it from
      // someone who is already typing — including in the search box itself.
      const target = event.target;
      const isTyping =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT');

      if (event.key === '/' && !isTyping && !event.metaKey && !event.ctrlKey && !event.altKey) {
        // Firefox binds "/" to quick-find, which would swallow the keystroke.
        event.preventDefault();
        input.focus();
        input.select();
        return;
      }

      if (event.key === 'Escape' && target === input) input.blur();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return ref;
}
