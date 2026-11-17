import {permitsNullHealthy} from './task-rules.mjs';
export function detectionNullPolicy(task) {
  if (!permitsNullHealthy(task.description)) return '未授权空值正常；缺值不得判健康。';
  return '查询成功、对象完整且排除粒度重复后，当前值或目标为空（含零分母），按任务规则返回value:null、dataStatus:"queried-null"、status:"健康"、rule.nullPolicy:"healthy"，注明非实测达标；目标为空不编造阈值。全部对象为空也适用。partial等警告须核实仅是缺值；工具失败或对象遗漏不可视为空值。版本存在但值空不切版；不同版本对象数量不一致不单独否定已选版本。';
}
