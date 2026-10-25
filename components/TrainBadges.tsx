import { Train } from '@/lib/types';
import { statusOf } from '@/lib/board';

/** Service type as a flat-colour "company charter" badge. */
export function CharterBadge({ type }: { type: Train['type'] }) {
  return (
    <span className={`charter ${type.toLowerCase()}`}>
      <i aria-hidden="true" />
      {type}
    </span>
  );
}

const STATUS_CLASS = {
  on: 'on',
  early: 'on',
  late: 'late',
  verylate: 'verylate',
  cancel: 'cancel',
  sched: 'sched',
} as const;

/** Status in tile-phase colours; the text always carries the meaning too. */
export function StatusChip({ train }: { train: Train }) {
  const { kind, text } = statusOf(train);
  return (
    <span className={`status ${STATUS_CLASS[kind]}`}>
      <StatusIcon kind={kind} />
      <span className="txt">{text}</span>
    </span>
  );
}

function StatusIcon({ kind }: { kind: ReturnType<typeof statusOf>['kind'] }) {
  const common = { width: 14, height: 14, viewBox: '0 0 14 14', 'aria-hidden': true } as const;
  if (kind === 'on' || kind === 'early') {
    return (
      <svg {...common}>
        <path d="M2 7l3 3 7-7" stroke="currentColor" strokeWidth="2.4" fill="none" />
      </svg>
    );
  }
  if (kind === 'cancel') {
    return (
      <svg {...common}>
        <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="2.4" fill="none" />
      </svg>
    );
  }
  if (kind === 'sched') {
    return (
      <svg {...common}>
        <circle cx="7" cy="7" r="5.2" stroke="currentColor" strokeWidth="1.8" fill="none" />
        <path d="M7 4v3.3l2 1.4" stroke="currentColor" strokeWidth="1.8" fill="none" />
      </svg>
    );
  }
  // late / very late: a clock with a hand pushed past the hour
  return (
    <svg {...common}>
      <circle cx="7" cy="7" r="5.2" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path d="M7 3.6V7h3.2" stroke="currentColor" strokeWidth="1.8" fill="none" />
    </svg>
  );
}

export const CHARTER_COLOR: Record<Train['type'], string> = {
  Local: 'var(--co-lblue)',
  Limited: 'var(--co-orange)',
  Express: 'var(--co-red)',
};
