import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { buildCampus } from './buildCampus.js';

/**
 * The 3D school campus.
 * mode="hero"    – full detail, drag to look around, guided tour
 * mode="ambient" – lighter version that slowly circles behind the app screens
 */
const CampusScene = forwardRef(function CampusScene({ mode = 'hero', time = 'morning', className = '' }, ref) {
  const mount = useRef(null);
  const api = useRef(null);

  useEffect(() => {
    api.current = buildCampus(mount.current, { mode, time });
    return () => {
      api.current?.dispose();
      api.current = null;
    };
    // the scene is built once per mode; time changes are animated below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    api.current?.setTime(time);
  }, [time]);

  useImperativeHandle(ref, () => ({
    goTo: (i) => api.current?.goTo(i),
    endTour: () => api.current?.endTour(),
  }));

  return (
    <div
      ref={mount}
      className={`campus-fallback ${className}`}
      aria-hidden="true"
    />
  );
});

export default CampusScene;

/** Morning before 3 pm, evening after — so the campus matches the real day. */
export function timeOfDayNow() {
  const h = new Date().getHours();
  return h >= 15 || h < 5 ? 'evening' : 'morning';
}
