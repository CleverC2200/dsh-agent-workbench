# 分仓库存页面来源

从隔离资源库 `dsh-agent-fc-plugin` 的固定提交 `906b3b08947b71cecf627073c0b0e9a389b692bf` 迁入。交付 HTML 版本为 `0.2.6-preview.9`；旧源码快照标记 `preview.7`，因此验收分别对照该提交的已交付 HTML 与源码，不能仅凭版本字符串判断等价。

只保留构建所需源码和原有定向测试，未引入旧 node_modules 软链、旧发行脚本或其它业务入口。`scripts/build-inventory-fc.mjs` 是工作台侧构建入口。Skill 与提示词由同级 Agent Manage 提供，现有 GEA 受控查询保持不变。

输出 `build-inputs.json` 记录参与页面构建的源码 SHA256。旧页面仍在原资源仓保留，本目录没有覆盖或删除旧入口。
