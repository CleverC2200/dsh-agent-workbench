import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { orderWorkbenchSourceConfig } from "../business/inventory-orderworkbench/source-config.mjs";

test("batched stock snapshots use inventory boundaries in selection and scan for every period", () => {
  const config = orderWorkbenchSourceConfig(
    JSON.parse(
      readFileSync("business/inventory-apsplan/sql.config.json", "utf8"),
    ),
  );
  const sql = config.queries["workbench.period-snapshots"].request.sql;
  const stock = sql.slice(
    sql.indexOf("FROM (") + 6,
    sql.indexOf(") stock_dates"),
  );
  for (let index = 0; index < 6; index++) {
    const inventory = ":gea_p" + (830 + index),
      order = ":gea_p" + (811 + index * 3);
    assert.equal(stock.split("s.the_date<" + inventory).length - 1, 2);
    assert.ok(!stock.includes("s.the_date<" + order));
  }
  const orders = config.queries["workbench.orders.periods.summary"].request.sql;
  assert.match(orders, /:gea_p811/);
});
