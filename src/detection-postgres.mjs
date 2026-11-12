import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const ROOT = process.env.GEA_WARNING_HOME || '';
export async function createPostgresStore() {
  const { Pool } = createRequire(ROOT + '/package.json')('pg');
  const pool = new Pool({
    ...JSON.parse(await readFile(ROOT + '/config/postgres.json', 'utf8')),
    max: 4,
  });
  return {
    close: () => pool.end(),
    async load() {
      const tasks = (
        await pool.query(
          'SELECT payload FROM gea_warning_local_test.detection_tasks ORDER BY updated_at DESC',
        )
      ).rows.map((r) => r.payload);
      const runs = (
        await pool.query(
          'SELECT payload FROM gea_warning_local_test.detection_runs ORDER BY started_at DESC',
        )
      ).rows.map((r) => r.payload);
      const events = (
        await pool.query(
          'SELECT payload FROM gea_warning_local_test.warning_events ORDER BY first_triggered_at DESC',
        )
      ).rows.map((r) => r.payload);
      return { tasks, runs, events };
    },
    async save(state) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        for (const t of state.tasks)
          await c.query(
            'INSERT INTO gea_warning_local_test.detection_tasks(id,metric_name,scope_type,xxl_job_id,enabled,payload) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET metric_name=excluded.metric_name,scope_type=excluded.scope_type,xxl_job_id=excluded.xxl_job_id,enabled=excluded.enabled,payload=excluded.payload,updated_at=now()',
            [t.id, t.metric, t.scope, t.jobId, t.enabled, t],
          );
        for (const r of state.runs)
          await c.query(
            'INSERT INTO gea_warning_local_test.detection_runs(id,task_id,run_key,status,started_at,session_id,payload) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET status=excluded.status,session_id=excluded.session_id,payload=excluded.payload,updated_at=now()',
            [r.id, r.taskId, r.runKey, r.status, r.at, r.sessionId || null, r],
          );
        for (const e of [...state.events].sort(
          (a, b) => (a.eventStatus === '活跃' ? 1 : 0) - (b.eventStatus === '活跃' ? 1 : 0),
        )) {
          await c.query(
            'INSERT INTO gea_warning_local_test.warning_events(id,task_id,dedup_key,object_key,risk_level,event_status,first_triggered_at,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET dedup_key=excluded.dedup_key,object_key=excluded.object_key,risk_level=excluded.risk_level,event_status=excluded.event_status,payload=excluded.payload,updated_at=now()',
            [e.id, e.monitorId, e.monitorKey, e.objectKey, e.level, e.eventStatus, e.first, e],
          );
          for (const h of e.history || [])
            await c.query(
              'INSERT INTO gea_warning_local_test.warning_observations(event_id,run_id,payload) VALUES($1,$2,$3) ON CONFLICT(event_id,run_id) DO NOTHING',
              [e.id, h.runId, h],
            );
        }
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    },
  };
}
