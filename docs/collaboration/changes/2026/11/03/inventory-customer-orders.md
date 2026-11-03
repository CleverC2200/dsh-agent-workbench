# Inventory customer-order scope

The branch order card, current orders, shortage and monthly fulfillment now describe orders supplied to downstream customers. Upstream ASN and transfer executions remain available separately for replenishment preparation and transit. Base customer-order rules remain unchanged.

Monthly fulfillment follows the base shipped-order pool: sum shipments capped at ordered quantity per valid line, divided by ordered quantity for lines with a shipment. Company fulfillment sums these numerators and denominators before dividing. Current customer demand remains cross-month, shares available stock once per warehouse/SKU, and feeds replenishment net demand. Conflicting latest execution records and invalid quantities are excluded without removing valid peers.

Full-chain inventory with channel includes customer on-hand only; transit remains a separate supporting value. Main turnover sums corresponding inventory and daily movement quantities before division. Channel turnover uses matched valid on-hand and movement records. No averages of percentages or turnover days.

The existing three daily tables are retained under rule version `inventory-daily-v3-20261103`. Three customer-order materializations are added inside the existing order table. The branch `calculation_order_remaining` quantity column must be widened from TINYINT to DOUBLE before loading customer demand. This is an administrative ETL migration, not a runtime gateway query. V3 activation requires all materializations to reconcile; old clients retain their V2 batch.

Regeneration: run `update-branch-customer-orders.py`, then `rebuild-inventory-first-screen.py` and `compact-inventory-first-screen.py` using sqlglot 30.23. The customer-order source and exported materializations are versioned with the queries. Generated runtime SQL remains explicit-column, named-parameter, read-only governed SQL. ETL uses a separately authorized administrative connection.

Regression coverage retains upstream scope and authorization, piece conversion, warehouse isolation, duplicate/conflicting executions, shared stock allocation, partial pages, invalid records, positive replenishment selection, and channel arithmetic. Current-order fixture expectations now use customer orders rather than the superseded ASN requirement.
