import { redirect } from 'next/navigation';
import { getParticipant } from '../lib/session';
import ExperimentRunner from '../components/ExperimentRunner';
import { speakingMaterials } from '../lib/materials';
export default async function ControlPage() {
  const participant = await getParticipant();
  if (!participant) redirect('/');
  if (participant.group !== 'control') redirect('/experiment');
  return <ExperimentRunner participant={participant} materials={await speakingMaterials()} />;
}
