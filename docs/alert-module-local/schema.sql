CREATE SCHEMA IF NOT EXISTS gea_warning_local_test;
CREATE TABLE IF NOT EXISTS gea_warning_local_test.detection_tasks (
 id text PRIMARY KEY, metric_name text NOT NULL, scope_type text NOT NULL CHECK(scope_type IN ('品类','基地','品类*基地','大区','省区')), xxl_job_id integer UNIQUE, enabled boolean NOT NULL, payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS gea_warning_local_test.detection_runs (
 id text PRIMARY KEY, task_id text NOT NULL REFERENCES gea_warning_local_test.detection_tasks(id), run_key text NOT NULL UNIQUE, status text NOT NULL, started_at timestamptz NOT NULL, session_id text, payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS gea_warning_local_test.warning_events (
 id text PRIMARY KEY, task_id text NOT NULL REFERENCES gea_warning_local_test.detection_tasks(id), dedup_key text NOT NULL, object_key text NOT NULL, risk_level text NOT NULL, event_status text NOT NULL, first_triggered_at timestamptz NOT NULL, payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS warning_events_one_active_key ON gea_warning_local_test.warning_events(dedup_key) WHERE event_status = '活跃';
CREATE TABLE IF NOT EXISTS gea_warning_local_test.warning_observations (
 event_id text NOT NULL REFERENCES gea_warning_local_test.warning_events(id), run_id text NOT NULL REFERENCES gea_warning_local_test.detection_runs(id), payload jsonb NOT NULL, PRIMARY KEY(event_id,run_id));
COMMENT ON SCHEMA gea_warning_local_test IS 'GEA本地预警功能测试：独立检测任务、执行记录、预警事件及观测历史';
