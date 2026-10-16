import { redirect } from 'next/navigation';
import { getParticipant } from '../lib/session';
import ExperimentRunner from '../components/ExperimentRunner';
export default async function ControlPage() {
  const participant = await getParticipant();
  if (!participant) redirect('/');
  if (participant.group !== 'control') redirect('/experiment');
  return <ExperimentRunner participant={participant} />;
}
