# 核对结果取消了后来重新勾选的计划

批量处理后，一笔成功、一笔待核对。用户重新勾选已成功的计划，再核对另一笔结果，重新勾选的状态被取消。

核对循环把此前成功的行也加入完成回调，列表因此再次清理这些行的选择。完成回调现在只包含本轮实际核对过的对象，历史成功结果继续展示。

`tests/sales-plan-submission.browser.mjs` 的 `readback completion reports only newly checked plans and preserves later selections` 在修复前返回两笔计划，修复后只返回本轮核对的一笔；审批调用次数保持两次，核对不增加提交。

对应整链路场景保留在 GEA 的 `returned-resubmit-recovery-web.test.mjs`。本轮没有真实 DMS 写入，主线 CI 与正式包验收分别记录。
