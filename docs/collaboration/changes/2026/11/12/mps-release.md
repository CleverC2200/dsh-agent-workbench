<!-- collaboration-record
{
  "kind": "change",
  "id": "CHANGE-20261112-mps-release",
  "date": "2026-11-12",
  "title": "MPS修复与提速插件发行 0.1.93",
  "module": "主生产计划(MPS)",
  "status": "已发布待验收"
}
-->
# MPS 修复与提速发行

MPS 自动准备发货和库存输入；缺项按来源、字段和处理动作输出。SQL 批量读取由200行扩大至5000行，保留完整性、权限及总量校验，等待所有在途输入完成后再评估。既有金额核对、ODM 到货和需求推导改动一并纳入。

- 对比基线：`05f4c43e46ded72e5e8f94211c0f5c49932f8375`，目标版本 `0.1.93`。
- 已整合当前 GitHub 主线，保留主线新增的菜单、更新与业务资源修复；本轮未发现候选删除文件或有意取消旧修复。
- 验证：开发窗口同一输入完整结果逐字一致，评估123.7秒降至33.3秒。定向检查通过。使用匹配 Chromium 完整复验后，MPS 浏览器152项通过、1项跳过；单元120项通过、1项跳过。已更新与自动读取、三个月份和200编码批次不一致的测试夹具，未降低业务校验。
- 发布技能：本机 dsh-plugin-release 1.3.1，local_draft，未声明为团队同步版本。
- 发布状态：已发布至测试、正式插件频道；GitHub Release 已发布并读回。原源码标签与归档保持固定。
- 业务边界：本轮不补造源数据，不将未知数量改成0；源码、构建、安装接收与完整排产验收分别记录。

## 2026-11-12 发行回填

- 修复版本与固定来源：`0.1.93`，`2c2115b38a258c645844b7b3dd5f01a46df7b87c`。
- [GitHub Release](https://github.com/CleverC2200/dsh-agent-workbench/releases/tag/v0.1.93)，包含 TGZ、release JSON 的固定下载地址、大小与摘要。
- 合并后 [主线 CI](https://github.com/CleverC2200/dsh-agent-workbench/actions/runs/43143052611) 通过；本轮三包正式构建、发布预检、官方隔离安装与 Host/client 入口图观察通过。
- 测试频道 revision 108→109，正式频道 revision 100→101，均通过生产 reader 的 check 与三包匿名 download 校验。
- 归档 SHA-256：`bce9a80e66e857e18e5d5b008af262f5f9e9edad425af323bb7cd9e107176e8b`。
- 本轮未构建桌面安装包，未升级用户正式设备。MPS 真实取数与提速验收复用本轮授权开发 profile 证据；源数据待补仍输出异常，完整排产未验收。
