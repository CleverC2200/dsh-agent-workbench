// Management is open to all users in this version.
export async function deleteDetectionTask({state,id,running,stopJob,save,now=()=>new Date().toISOString()}) {
  const task=state.tasks.find(t=>t.id===id);
  if (!task) throw Error('检测任务不存在');
  if (task.deletedAt) { await save(); return task; }
  if (running.has(id)) throw Error('检测正在执行，请执行结束后再删除');
  // Stop the scheduler first: a failed stop must leave a recoverable task.
  running.add(id);
  try {
  await stopJob(task.jobId);
  task.enabled=false;
  task.deletedAt=now();

  await save();
  return task;
  } finally { running.delete(id); }
}
