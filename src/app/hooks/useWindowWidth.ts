import { useEffect, useState } from 'react';

export function useWindowWidth(fallback = 1366) {
  const [windowWidth, setWindowWidth] = useState(() => (typeof window === 'undefined' ? fallback : window.innerWidth));

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let frame = 0;
    const onResize = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setWindowWidth(window.innerWidth);
      });
    };

    window.addEventListener('resize', onResize);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return windowWidth;
}
