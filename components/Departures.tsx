import { Station, Train } from '@/lib/types';
import { formatTime, formatDuration } from '@/lib/utils';
import { countdown, lineStations, minutesUntil, nearestLineStation, plainName } from '@/lib/board';
import { CHARTER_COLOR, CharterBadge, StatusChip } from './TrainBadges';

function departsFrom(station: Station): string {
  const paren = station.name.match(/\((.*)\)/);
  return paren ? paren[1] : plainName(station);
}

function livePositionText(train: Train, liveFeed: boolean): string {
  const pos = train.vehiclePosition;
  if (!pos) {
    return liveFeed
      ? `Train ${train.trainNumber}: not yet tracking (no live position reported for this train)`
      : 'Live train positions are not available right now';
  }
  const near = lineStations[nearestLineStation(pos.latitude, pos.longitude)];
  const verb = pos.currentStatus === 'STOPPED_AT' ? 'is at' : 'is near';
  return `Train ${train.trainNumber} ${verb} ${plainName(near)} (live position)`;
}

interface HeroProps {
  train: Train;
  origin: Station;
  destination: Station;
  now: number;
  /** Whether the API had any live vehicle positions at all. */
  liveFeed: boolean;
}

/** The black "N MIN" block plus the next train's time, type and status. */
export function NextTrainHero({ train, origin, destination, now, liveFeed }: HeroProps) {
  const mins = minutesUntil(train.departureTime, now);
  const cd = countdown(mins);
  const live = livePositionText(train, liveFeed);
  const spoken = mins === 0 ? 'departing now' : `departs in ${mins} minutes`;

  return (
    <section className="panel hero" aria-labelledby="next-train-label">
      <div className="mins" aria-hidden="true">
        <div className={`n${cd.long ? ' long' : ''}`}>{mins === 0 ? 'Due' : cd.value}</div>
        {mins !== 0 && <div className="u">{cd.unit}</div>}
      </div>
      <div className="body">
        <h2 className="label" id="next-train-label" style={{ margin: 0 }}>
          Next train &middot; leaves {departsFrom(origin)}
          <span className="sr-only">, {spoken}</span>
        </h2>
        <div className="dep">
          {formatTime(train.departureTime)}
          <span className="arr">
            arrives {plainName(destination)} {formatTime(train.arrivalTime)}
          </span>
        </div>
        <div className="chips">
          <CharterBadge type={train.type} />
          <StatusChip train={train} />
          <span className="meta">
            Train {train.trainNumber} &middot; {formatDuration(train.duration)} ride
          </span>
        </div>
        <div className="live">
          {train.vehiclePosition && <span className="dot" aria-hidden="true" />}
          <span>{live}</span>
        </div>
      </div>
    </section>
  );
}

interface ListProps {
  trains: Train[];
  now: number;
}

/** Later departures as train cards with a minutes-to-go box. */
export function DepartureList({ trains, now }: ListProps) {
  if (trains.length === 0) {
    return <p className="hint">No later trains in the current schedule window.</p>;
  }
  return (
    <ol className="rows">
      {trains.map((train, i) => {
        const mins = minutesUntil(train.departureTime, now);
        const cd = countdown(mins);
        const cancelled = train.status === 'cancelled';
        return (
          <li
            key={`${train.trainNumber}-${i}`}
            className={`tcard${cancelled ? ' is-cancelled' : ''}`}
          >
            <span className="stripe" style={{ background: CHARTER_COLOR[train.type] }} aria-hidden="true" />
            <div className={`num${cd.long ? ' long' : ''}`}>
              <span aria-hidden="true">{mins === 0 ? 'Due' : cd.value}</span>
              {mins !== 0 && <small aria-hidden="true">{cd.unit}</small>}
              <span className="sr-only">
                {mins === 0 ? 'Departing now' : `In ${mins} minutes`}
              </span>
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="t">
                {formatTime(train.departureTime)}{' '}
                <span className="to">&rarr; {formatTime(train.arrivalTime)}</span>
              </div>
              <div className="s">{formatDuration(train.duration)} ride</div>
            </div>
            <div className="right">
              <StatusChip train={train} />
              <span className="tn">
                {train.type} &middot; Train {train.trainNumber}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
