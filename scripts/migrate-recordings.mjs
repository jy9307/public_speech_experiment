import nextEnv from '@next/env';
import { database } from '../app/lib/db.js';
import { storeRecording, recordingBytes } from '../app/lib/recording-storage.js';
import { createHash } from 'node:crypto';
nextEnv.loadEnvConfig(process.cwd());
const release = process.argv.includes('--release-db-copy');
try {
 const records = (await database().query(`SELECT rec.round_id,r.participant_id,r.number FROM speech_experiment.recordings rec JOIN speech_experiment.rounds r ON r.id=rec.round_id WHERE rec.video IS NOT NULL AND r.participant_id NOT LIKE 'qa_%' ORDER BY rec.recorded_at`)).rows;
 for (const item of records) {
  const record = (await database().query('SELECT * FROM speech_experiment.recordings WHERE round_id=$1',[item.round_id])).rows[0];
  if (!record?.video) continue;
  const stored = await storeRecording({participantId:item.participant_id,number:item.number,roundId:item.round_id,mimeType:record.mime_type,bytes:record.video});
  const downloaded = await recordingBytes({...record,...stored});
  const verified = createHash('sha256').update(downloaded).digest('hex');
  if (verified !== stored.sha256) throw Error('Migration checksum mismatch');
  await database().query(`UPDATE speech_experiment.recordings SET storage_bucket=$2,storage_path=$3,storage_generation=$4,sha256=$5${release?',video=NULL':''} WHERE round_id=$1 AND video IS NOT NULL`,[item.round_id,stored.storage_bucket,stored.storage_path,stored.storage_generation,stored.sha256]);
  console.log(JSON.stringify({roundId:item.round_id,path:stored.storage_path,bytes:downloaded.length,sha256:verified,verified:true,dbCopyReleased:release}));
 }
 console.log(`Verified ${records.length} recordings; database copies ${release?'released':'retained'}`);
} finally { await database().end(); }
