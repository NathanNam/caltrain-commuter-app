'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { Train } from '@/lib/types';

// MapLibre is large: load it only in the browser, and only when needed.
const TrainMap = dynamic(() => import('./TrainMap'), {
  ssr: false,
  loading: () => <span>Loading street map&hellip;</span>,
});

interface MapSectionProps {
  originId: string;
  destinationId: string;
  trains: Train[];
}

/** Secondary street map, mounted when the section is scrolled near or opened. */
export default function MapSection({ originId, destinationId, trains }: MapSectionProps) {
  const ref = useRef<HTMLElement>(null);
  const [show, setShow] = useState(false);
  const live = trains.filter((t) => t.vehiclePosition).length;

  useEffect(() => {
    if (show || !ref.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShow(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [show]);

  return (
    <section className="panel mapsec" ref={ref} aria-labelledby="street-map-h">
      <div className="maphead">
        <h2 className="label" id="street-map-h" style={{ margin: 0 }}>
          Street map &middot; live trains
        </h2>
        <div className="legend" style={{ margin: 0 }}>
          <span>
            <i className="dir-dot" style={{ background: '#1f4e9c' }} aria-hidden="true" />
            Northbound
          </span>
          <span>
            <i className="dir-dot" style={{ background: '#c8202e' }} aria-hidden="true" />
            Southbound
          </span>
        </div>
      </div>
      <div className="map-frame">
        {show ? (
          <TrainMap originId={originId} destinationId={destinationId} trains={trains} />
        ) : (
          <button type="button" className="btn" onClick={() => setShow(true)}>
            Open street map
          </button>
        )}
      </div>
      <p className="line-note">
        {live > 0
          ? `${live} ${live === 1 ? 'train' : 'trains'} on this route reporting a live position.`
          : 'No live positions for these trains right now; they appear once a train is running.'}
      </p>
    </section>
  );
}
