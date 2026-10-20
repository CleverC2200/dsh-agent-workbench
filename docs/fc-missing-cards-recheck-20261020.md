# 分仓红框指标缺值复核

核对时间：2026-10-20。检查当前 31 张 `agents` 非宽表清单，并实时复查分仓计划、库存、订单执行及月度履约表。

## 页面现状

新版 `configured-workbench.tsx` 中“待补货量”“需补货SKU”“紧急补货SKU”“当前订单”的主值仍是 `null` 占位，未接入可计算的完整来源。不是查询已返回对应指标但渲染时漏显示；后续数据补齐，还须接通计算，单独加权限不会自动恢复这些值。

## 每项原因

| 业务 Agent | 指标 | 已核对的来源字段和剩余条件 |
| --- | --- | --- |
| 分仓库存 | 待补货量 | `agents_scm_warehouse_transfer_plan_data_d.future30_avg_plan`、`warehouse_month_out_plan`、`warehouse_future30_qty` 在2,353条记录上合计均为0；`plan_month`、`snapshot_date`、`plan_version`、`plan_qty_unit` 全空，`warehouse_month_transfer_plan` 全空。不能据此认定当前有效需求就是0。 |
| 分仓库存 | 需补货SKU | 依赖逐仓库SKU的可计算补货量；2026-10-19分仓库存1,761条记录的 `agents_scm_inventory_sku_data_d.safe_stock_qty`、`target_stock_qty` 全空，源注释明确为基地口径、分仓为NULL。不能把基地目标直接分配给分仓。 |
| 分仓库存 | 紧急补货SKU | 依赖有效需求、补货规则和同单位供给量。`agents_scm_warehouse_transfer_plan_data_d.future30_avg_plan` 全部为0、`plan_qty_unit` 和 `snapshot_date` 全空；补货周期是业务配置，不列为大数据缺失字段。 |
| 分仓库存 | 当前订单（当前待发量） | 新增 `agents_scm_execute_detail_d` 已有 `bizflowstatus`、`order_qty`、`adjust_order_qty`、`qtyallocated`、`qtyshipped`；但没有分仓编码、源快照时间、数量单位或换算列。`belong_base` 当前只有基地名及空值，不能作为分仓归属。`header_addtime` 是创建时间，不能当作状态快照。需核对仓库关联、去重粒度、状态及数量口径后再接入。 |

## 已展示的真实源量

- `transfer_prepare_qty` 合计28,627；`transfer_onway_qty` 合计1,086,415。与用户截图一致，继续按源量展示；备单和在途是供给量，不是待补货需求。
- 本月涉及订单2,770单、本月缺货SKU220个、本月缺货订单675单、本月订单量172,005箱、本月缺货量15,675箱来自已经接入的月度履约查询。这些是月累计，不能直接充当当前待发状态快照。

缺失数量按0相加适用于已确定时间、单位和业务范围的数量；本次缺口包含整项来源口径，显示0会把“尚不能判断”变成“无需补货／没有待发”。本轮保留现有有效汇总，没有改写数据、没有发版。
