# Inventory query verification (2026-11-04)

- Correct the database type spelling in direct and daily aging queries without changing filters, weights or pagination.
- Use the page inventory facts for base dialogue metrics, preserve independently known quantities, and weight fulfillment with matching shipped/order quantities.
- Preserve structured supplementary authorization failures and independently readable facts.
- Distinguish outbound completion timestamps from explicit active transport states. Keep signed, cancelled, inactive closed, invalid and conflicting records under the existing guards.
- Resolve authorized daily default target metadata when global calendar rows are hidden, preserving authorized global history. A selected base SKU page keeps the final base filter and uses its equivalent daily summary.

Verification: targeted fact/browser and pagination tests; SQL source regressions; read-only governed gateway and database comparisons. No business data, account identity, order identifiers or internal artifacts are included here. Complete internal acceptance records remain in the private task workspace.

Historical behavior review preserves the original shipped-order pool, capped shipments, duplicate/conflict handling, authorization boundaries and column controls. No files, APIs or product capabilities are removed.
