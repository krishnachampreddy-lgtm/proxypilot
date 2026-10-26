import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

/**
 * The live 3D school campus. The 3D code is loaded only when this component mounts,
 * and a photo of the same campus shows until the live scene is ready.
 */
const CampusScene = forwardRef(function CampusScene({ time = 'morning', className = '', onProgress }, ref) {
  const mount = useRef(null);
  const api = useRef(null);
  const [ready, setReady] = useState(false);
  const timeRef = useRef(time);
  timeRef.current = time;

  useEffect(() => {
    let disposed = false;
    import('../../campus/index.js').then(({ createCampus }) => {
      if (disposed || !mount.current) return;
      api.current = createCampus(mount.current, {
        mode: 'hero',
        time: timeRef.current,
        onProgress,
        onReady: (ok) => !disposed && setReady(ok),
      });
    });
    return () => {
      disposed = true;
      api.current?.dispose();
      api.current = null;
    };
    // built once; time changes are animated below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.current?.setTime(time);
  }, [time]);

  useImperativeHandle(ref, () => ({
    goTo: (i) => api.current?.goTo(i),
    endTour: () => api.current?.endTour(),
  }));

  return (
    <div className={className || "relative"} aria-hidden="true">
      <CampusBackdrop time={time} className={`absolute inset-0 transition-opacity duration-1000 ${ready ? 'opacity-0' : 'opacity-100'}`} />
      <div ref={mount} className="absolute inset-0" />
    </div>
  );
});

export default CampusScene;

/** A rendered photo of the campus, used behind the app screens (light on phones and batteries). */
export function CampusBackdrop({ time = 'morning', className = '', drift = false }) {
  return (
    <div
      className={`campus-fallback bg-cover bg-center ${drift ? 'campus-drift' : ''} ${className}`}
      style={{ backgroundImage: `url(/campus/stills/campus-${time}.jpg)` }}
    />
  );
}

/** Morning before 3 pm, evening after — so the campus matches the real day. */
export function timeOfDayNow() {
  const h = new Date().getHours();
  return h >= 15 || h < 5 ? 'evening' : 'morning';
}
