import { database } from "../lib/db";
import { isAdmin } from "../lib/admin";
import AdminDashboard from "../components/AdminDashboard";
import AdminLogin from "../components/AdminLogin";
import "./admin.css";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAdmin())) return <AdminLogin />;
  const rows = (await database().query(`
    SELECT p.id,p.condition,a.is_test,p.created_at,p.completed_at,
      GREATEST(p.last_seen_at,COALESCE(max(r.last_seen_at),p.last_seen_at)) AS activity_at,
      COALESCE(max(r.number),0)::int AS current_round,
      (array_agg(r.state ORDER BY r.number DESC) FILTER (WHERE r.id IS NOT NULL))[1] AS current_state,
      count(r.id)::int AS round_count,
      count(r.id) FILTER (WHERE r.state='completed')::int AS completed_rounds,
      count(rec.round_id)::int AS recording_count
    FROM speech_experiment.participants p
    JOIN speech_experiment.assignments a ON a.participant_id=p.id
    LEFT JOIN speech_experiment.rounds r ON r.participant_id=p.id
    LEFT JOIN speech_experiment.recordings rec ON rec.round_id=r.id
    GROUP BY p.id,a.is_test ORDER BY activity_at DESC NULLS LAST,p.id
  `)).rows;
  return <AdminDashboard participants={rows.map((p) => ({ ...p, created_at: p.created_at?.toISOString(), activity_at: p.activity_at?.toISOString(), completed_at: p.completed_at?.toISOString() }))} />;
}
