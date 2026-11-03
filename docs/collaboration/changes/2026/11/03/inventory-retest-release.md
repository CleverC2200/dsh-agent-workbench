<!-- collaboration-record
{
  "kind": "change",
  "id": "CHANGE-20261103-inventory-retest-release",
  "date": "2026-11-03",
  "title": "Fix scoped inventory loading and transfer calculations",
  "module": "Inventory",
  "status": "已验证待发布"
}
-->
# Fix scoped inventory loading and transfer calculations

Daily summary readers now accept warehouse/base scoped completion records. Current transfer quantities come from the latest eligible execution lines rather than monthly plan balances. Base turnover retains valid stock and movement independently of missing targets. Aging tables retain full-result filtering, totals and column controls. Plan export queries carry an outer page limit so governed gateway defaults cannot truncate them. Physical branch plan warehouse fields use warehouseid. Customer-order and transfer-order pools remain separate.

Candidate version: 0.1.55. Source changes are prepared on a task branch from the fetched GitHub mainline; generated artifacts and private database evidence are not included in this source record. This is not yet a published release.

Prior repairs retained: customer downstream-order fulfillment uses its existing shipped-order pool; unavailable evidence is not converted to zero; authorization refusals do not trigger a source bypass. No product/API/file deletion or new business write workflow is part of this change. The transfer-source correction and missing-target turnover behavior follow the confirmed inventory requirements; old monthly transfer totals remain plan fields.

Validation: affected source, query, presentation, package-version and compatibility checks run before the PR is merged. The final release records bind the actual merged source, package digests, channel revision and verification boundaries. Existing unresolved business reconciliations are not marked complete by packaging.

Release workflow: dsh-plugin-release 1.3.0, locally distributed bundle; no registered team-maintenance source. The plugin suite uses the existing GitHub/OSS destinations. Desktop packaging is outside this release.

Source plan paging uses the plan-only count query; it does not inherit current transfer execution parameters or stock permissions. The actual source SQL fixture verifies count/list equality across warehouse and empty scopes. Export checks account separately for one snapshot metadata read while preserving bounded data pages, source-change restart and permission-denial assertions.

Resizable column headers keep their own accessible names while filter/resize controls retain separate labels. The existing maximum-age detail regression remains unchanged; the column-visibility test selects its checkbox by role to distinguish it from the same-named header.
