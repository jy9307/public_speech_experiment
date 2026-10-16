import { redirect } from 'next/navigation';
import { getParticipant } from '../lib/session';
import ExperimentRunner from '../components/ExperimentRunner';
export default async function ExperimentPage() {
  const participant = await getParticipant();
  if (!participant) redirect('/');
  if (participant.group !== 'experiment') redirect('/control');
  return <ExperimentRunner participant={participant} />;
}
