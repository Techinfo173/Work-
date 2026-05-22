import { useEffect, useRef } from 'react';
import { initGame } from './game';

export default function App() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const dispose = initGame(ref.current);
    return () => dispose();
  }, []);
  return <div ref={ref} style={{ width: '100vw', height: '100vh', overflow: 'hidden' }} />;
}
