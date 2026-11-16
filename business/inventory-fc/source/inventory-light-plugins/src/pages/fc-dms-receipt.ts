export function fcDmsReceiptNotice(receipt: { orderCode: string; dmsMessage?: string }): string {
  return receipt.dmsMessage
    ? `DMS返回：${receipt.dmsMessage}；订单号：${receipt.orderCode}`
    : `DMS已返回订单号：${receipt.orderCode}`;
}
