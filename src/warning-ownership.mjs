export function warningOwner(status) {
  const user = status?.user;
  if (!status?.authenticated || !status.environment || !user?.id || !user?.username)
    throw Error('请登录 GEA 后查看或管理自己的预警');
  return {
    key: JSON.stringify([status.environment, user.tenantId ?? null, String(user.id)]),
    environment: status.environment,
    tenantId: user.tenantId ?? null,
    id: String(user.id),
    username: String(user.username),
    name: user.name || user.username,
  };
}

export function ownsWarningTask(task, owner) {
  return Boolean(owner?.key && task?.owner?.key === owner.key);
}

// Only a reviewed, local migration file may assign legacy records; never a page field.
export function migrateWarningOwners(state, mappings) {
  for (const task of state.tasks) {
    const owner = mappings[task.id];
    if (!task.owner && owner?.key && task.definedBy === owner.name) {
      task.owner = { ...owner };
      task.ownerMigration = 'verified-directory-20261111';
    }
  }
}

export function ownerWarningState(state, owner) {
  const owned = state.tasks.filter((t) => ownsWarningTask(t, owner));
  const ids = new Set(owned.map((t) => t.id));
  return {
    tasks: owned.filter((t) => !t.deletedAt),
    events: state.events
      .filter((e) => ids.has(e.monitorId))
      .map((e) => ({ ...e, task: owned.find((t) => t.id === e.monitorId) })),
    runs: state.runs.filter((r) => ids.has(r.taskId)),
  };
}

export function createOwnerScopedApi({ state, currentOwner, api }) {
  return async (input) => {
    const owner = await currentOwner();
    if (input.op === 'list') return ownerWarningState(state, owner);
    let taskId;
    if (['delete', 'toggle', 'run'].includes(input.op)) taskId = input.id;
    else if (input.op === 'save' && input.task?.id) taskId = input.task.id;
    else if (['close-event', 'notify-test'].includes(input.op)) {
      const event = state.events.find(
        (e) => e.id === (input.op === 'notify-test' ? input.eventId : input.id),
      );
      taskId = event?.monitorId;
      if (!taskId) throw Error('预警不存在或不属于当前用户');
    }
    if (taskId !== undefined || ['delete', 'toggle', 'run'].includes(input.op)) {
      if (
        !ownsWarningTask(
          state.tasks.find((t) => t.id === taskId),
          owner,
        )
      )
        throw Error('预警不存在或不属于当前用户');
    }
    // Page-provided owner and display-name fields never grant ownership.
    const request =
      input.op === 'save'
        ? { ...input, task: { ...input.task, owner, definedBy: owner.name } }
        : input;
    return api(request);
  };
}
