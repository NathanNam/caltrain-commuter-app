import type { Metadata } from 'next';
import FullBoard from '@/components/FullBoard';

export const metadata: Metadata = {
  title: 'Full board · Caltrain Commuter',
  description: 'Every Caltrain, every station, for any of the next 7 days, from the GTFS timetable.',
};

export default function BoardPage() {
  return <FullBoard />;
}
