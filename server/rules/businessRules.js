const dayjs = require('dayjs');
const db = require('../database');
const { createAuditLog } = require('../middleware/audit');
const { v4: uuidv4 } = require('uuid');

const AFTER_SALE_PERIOD_DAYS = 7;

function checkAfterSaleDeadline(afterSaleDeadline) {
  const now = dayjs();
  const deadline = dayjs(afterSaleDeadline);
  const isExpired = now.isAfter(deadline);
  const daysLeft = deadline.diff(now, 'day');
  return {
    isExpired,
    daysLeft,
    deadline: deadline.format('YYYY-MM-DD HH:mm:ss'),
    message: isExpired 
      ? `售后申请已过期，截止日期为 ${deadline.format('YYYY-MM-DD')}` 
      : `售后有效期剩余 ${daysLeft} 天`
  };
}

function checkInventoryReceived(afterSaleNo) {
  const inventory = db.prepare(`
    SELECT * FROM inventory_records 
    WHERE after_sale_no = ? 
    ORDER BY created_at DESC 
    LIMIT 1
  `).get(afterSaleNo);
  
  if (!inventory) {
    return { received: false, status: 'no_record', message: '未找到入库记录' };
  }
  
  const received = inventory.status === 'received' || inventory.status === 'qc_passed';
  return {
    received,
    status: inventory.status,
    inventoryId: inventory.id,
    inventoryNo: inventory.inventory_no,
    receivedTime: inventory.received_time,
    qcResult: inventory.qc_result,
    message: received ? '退货已入库' : getInventoryStatusMessage(inventory.status)
  };
}

function getInventoryStatusMessage(status) {
  const messages = {
    pending: '待入库',
    received: '已入库待质检',
    qc_passed: '质检通过',
    qc_rejected: '质检拒收',
    returned_to_customer: '已退回客户'
  };
  return messages[status] || status;
}

function handleQcRejection(afterSaleNo, qcDescription, operator) {
  const updateAfterSale = db.prepare(`
    UPDATE after_sale_versions 
    SET status = 'qc_rejected', qc_result = 'rejected', qc_description = ?, updated_at = CURRENT_TIMESTAMP
    WHERE after_sale_no = ?
  `);
  
  const updateInventory = db.prepare(`
    UPDATE inventory_records 
    SET status = 'qc_rejected', qc_description = ?, qc_operator_id = ?, qc_operator_name = ?, qc_time = CURRENT_TIMESTAMP
    WHERE after_sale_no = ? AND status = 'received'
  `);
  
  const tx = db.transaction(() => {
    const before = db.prepare('SELECT * FROM after_sale_versions WHERE after_sale_no = ?').get(afterSaleNo);
    updateAfterSale.run(qcDescription, afterSaleNo);
    updateInventory.run(qcDescription, operator.id, operator.name, afterSaleNo);
    const after = db.prepare('SELECT * FROM after_sale_versions WHERE after_sale_no = ?').get(afterSaleNo);
    createAuditLog(operator, 'qc_reject', 'after_sale', afterSaleNo, before, after);
    return after;
  });
  
  return tx();
}

function processReturnToCustomer(afterSaleNo, operator) {
  const updateInventory = db.prepare(`
    UPDATE inventory_records 
    SET status = 'returned_to_customer'
    WHERE after_sale_no = ? AND status = 'qc_rejected'
  `);
  
  const updateAfterSale = db.prepare(`
    UPDATE after_sale_versions 
    SET status = 'returned_to_customer', updated_at = CURRENT_TIMESTAMP
    WHERE after_sale_no = ?
  `);
  
  const tx = db.transaction(() => {
    const before = db.prepare('SELECT * FROM after_sale_versions WHERE after_sale_no = ?').get(afterSaleNo);
    updateInventory.run(afterSaleNo);
    updateAfterSale.run(afterSaleNo);
    const after = db.prepare('SELECT * FROM after_sale_versions WHERE after_sale_no = ?').get(afterSaleNo);
    createAuditLog(operator, 'return_to_customer', 'after_sale', afterSaleNo, before, after);
    return after;
  });
  
  return tx();
}

function checkProductThreshold(productId, operator) {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) return null;
  
  const stats = db.prepare('SELECT * FROM product_stats WHERE product_id = ?').get(productId);
  if (!stats) return { product, stats: null, exceedsThreshold: false };
  
  const exceedsThreshold = stats.total_issues >= product.threshold;
  const currentCount = stats.total_issues;
  const threshold = product.threshold;
  
  return {
    product,
    stats,
    exceedsThreshold,
    currentCount,
    threshold,
    message: exceedsThreshold 
      ? `问题商品 ${product.name} 问题数 ${currentCount} 已超过阈值 ${threshold}，请触发下架` 
      : `问题商品 ${product.name} 问题数 ${currentCount}/${threshold}`
  };
}

function triggerRemovalReminder(productId, operator, anchorSessionId = null) {
  const check = checkProductThreshold(productId, operator);
  if (!check || !check.exceedsThreshold) {
    return { success: false, message: '未超过阈值，无需触发下架提醒' };
  }
  
  const existingReminder = db.prepare(`
    SELECT * FROM removal_reminders 
    WHERE product_id = ? AND status = 'pending'
  `).get(productId);
  
  if (existingReminder) {
    return { success: false, message: '已有待处理的下架提醒', reminder: existingReminder };
  }
  
  const reminderNo = 'REM' + Date.now() + uuidv4().slice(0, 4).toUpperCase();
  const anchorSession = anchorSessionId 
    ? db.prepare('SELECT * FROM anchor_sessions WHERE id = ?').get(anchorSessionId)
    : null;
  
  const insertReminder = db.prepare(`
    INSERT INTO removal_reminders 
    (reminder_no, product_id, product_sku, product_name, issue_count, threshold, anchor_session_id, anchor_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const result = insertReminder.run(
    reminderNo,
    productId,
    check.product.sku,
    check.product.name,
    check.currentCount,
    check.threshold,
    anchorSessionId,
    anchorSession?.anchor_name || null
  );
  
  const reminder = db.prepare('SELECT * FROM removal_reminders WHERE id = ?').get(result.lastInsertRowid);
  createAuditLog(operator, 'trigger_removal_reminder', 'removal_reminder', reminderNo, null, reminder);
  
  return { success: true, message: '下架提醒已触发', reminder };
}

function batchRecallProducts(productIds, operator, reason) {
  const results = productIds.map(pid => {
    const check = checkProductThreshold(pid, operator);
    if (!check) return { productId: pid, success: false, message: '商品不存在' };
    
    const updateProduct = db.prepare('UPDATE products SET status = ? WHERE id = ?');
    const before = db.prepare('SELECT * FROM products WHERE id = ?').get(pid);
    updateProduct.run('recalled', pid);
    const after = db.prepare('SELECT * FROM products WHERE id = ?').get(pid);
    
    createAuditLog(operator, 'batch_recall', 'product', pid.toString(), before, after);
    triggerRemovalReminder(pid, operator);
    
    return { productId: pid, success: true, productName: check.product.name };
  });
  
  return results;
}

function attributeResponsibility(afterSaleNo, responsibility, operator, reason = '') {
  const before = db.prepare('SELECT * FROM after_sale_versions WHERE after_sale_no = ?').get(afterSaleNo);
  if (!before) return { success: false, message: '售后单不存在' };
  
  const update = db.prepare(`
    UPDATE after_sale_versions 
    SET responsibility = ?, anchor_op_id = ?, anchor_op_name = ?, updated_at = CURRENT_TIMESTAMP
    WHERE after_sale_no = ?
  `);
  
  update.run(responsibility, operator.id, operator.name, afterSaleNo);
  const after = db.prepare('SELECT * FROM after_sale_versions WHERE after_sale_no = ?').get(afterSaleNo);
  createAuditLog(operator, 'attribute_responsibility', 'after_sale', afterSaleNo, before, after);
  
  const afterSale = db.prepare('SELECT * FROM after_sale_versions WHERE after_sale_no = ?').get(afterSaleNo);
  updateProductStats(afterSale.order_snapshot_id, afterSale.type, responsibility);
  
  return { success: true, afterSale };
}

function updateProductStats(orderSnapshotId, type, responsibility) {
  const order = db.prepare('SELECT * FROM order_snapshots WHERE id = ?').get(orderSnapshotId);
  if (!order) return;
  
  const existing = db.prepare('SELECT * FROM product_stats WHERE product_id = ?').get(order.product_id);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(order.product_id);
  
  const updateFields = {
    return_count: type === 'return' ? 1 : 0,
    quality_issue_count: responsibility === 'quality' ? 1 : 0,
    description_issue_count: responsibility === 'description' ? 1 : 0,
    other_issue_count: responsibility === 'other' || responsibility === 'customer' ? 1 : 0
  };
  
  if (existing) {
    db.prepare(`
      UPDATE product_stats 
      SET total_issues = total_issues + 1,
          return_count = return_count + ?,
          quality_issue_count = quality_issue_count + ?,
          description_issue_count = description_issue_count + ?,
          other_issue_count = other_issue_count + ?,
          last_issue_time = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE product_id = ?
    `).run(
      updateFields.return_count,
      updateFields.quality_issue_count,
      updateFields.description_issue_count,
      updateFields.other_issue_count,
      order.product_id
    );
  } else {
    db.prepare(`
      INSERT INTO product_stats 
      (product_id, product_sku, product_name, total_issues, return_count, quality_issue_count, description_issue_count, other_issue_count, last_issue_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      order.product_id,
      product.sku,
      product.name,
      1,
      updateFields.return_count,
      updateFields.quality_issue_count,
      updateFields.description_issue_count,
      updateFields.other_issue_count
    );
  }
}

function handleFailedRefund(refundId, failedReason, operator, hangRefund = false) {
  const before = db.prepare('SELECT * FROM refund_records WHERE id = ?').get(refundId);
  if (!before) return { success: false, message: '退款记录不存在' };
  
  const updates = {
    status: hangRefund ? 'hung' : 'failed',
    failed_reason: failedReason,
    is_hung: hangRefund ? 1 : 0,
    hung_reason: hangRefund ? failedReason : null,
    processed_at: new Date().toISOString()
  };
  
  const updateStmt = db.prepare(`
    UPDATE refund_records 
    SET status = ?, failed_reason = ?, is_hung = ?, hung_reason = ?, processed_at = ?
    WHERE id = ?
  `);
  
  updateStmt.run(
    updates.status,
    updates.failed_reason,
    updates.is_hung,
    updates.hung_reason,
    updates.processed_at,
    refundId
  );
  
  const updateAfterSale = db.prepare(`
    UPDATE after_sale_versions 
    SET status = ?, is_hung = ?, hung_reason = ?, updated_at = CURRENT_TIMESTAMP
    WHERE after_sale_no = ?
  `);
  updateAfterSale.run(hangRefund ? 'refund_hung' : 'refund_failed', updates.is_hung, updates.hung_reason, before.after_sale_no);
  
  const after = db.prepare('SELECT * FROM refund_records WHERE id = ?').get(refundId);
  createAuditLog(operator, hangRefund ? 'hang_refund' : 'refund_failed', 'refund', refundId.toString(), before, after);
  
  return { success: true, status: updates.status, message: hangRefund ? '退款已挂账' : '退款失败' };
}

function canInitiateRefund(afterSaleNo) {
  const afterSale = db.prepare('SELECT * FROM after_sale_versions WHERE after_sale_no = ?').get(afterSaleNo);
  if (!afterSale) {
    return { canRefund: false, reason: '售后单不存在' };
  }
  
  const validStatuses = ['cs_approved', 'qc_passed'];
  if (!validStatuses.includes(afterSale.status)) {
    return { canRefund: false, reason: `当前状态 [${getStatusText(afterSale.status)}] 不能发起退款` };
  }
  
  const inventoryCheck = checkInventoryReceived(afterSaleNo);
  if (!inventoryCheck.received) {
    return { 
      canRefund: false, 
      reason: `退货未入库，当前状态：${inventoryCheck.message}`,
      inventoryStatus: inventoryCheck.status
    };
  }
  
  if (inventoryCheck.qcResult === 'rejected') {
    return { canRefund: false, reason: '质检已拒收，不能退款' };
  }
  
  return { canRefund: true, afterSale, inventoryCheck };
}

function getStatusText(status) {
  const texts = {
    pending_review: '待客服审核',
    cs_approved: '客服审核通过',
    cs_rejected: '客服审核拒绝',
    pending_inventory: '待仓库入库',
    received: '已入库待质检',
    qc_passed: '质检通过',
    qc_rejected: '质检拒收',
    returned_to_customer: '已退回客户',
    pending_refund: '待财务退款',
    refund_processing: '退款处理中',
    refund_success: '退款成功',
    refund_failed: '退款失败',
    refund_hung: '退款已挂账',
    completed: '已完成',
    closed: '已关闭'
  };
  return texts[status] || status;
}

function checkReconciliationDifference(refundId, expectedAmount, actualAmount) {
  const difference = actualAmount - expectedAmount;
  return {
    hasDifference: Math.abs(difference) > 0.01,
    difference,
    expectedAmount,
    actualAmount,
    message: Math.abs(difference) > 0.01 
      ? `对账差异：${difference.toFixed(2)} 元` 
      : '对账一致'
  };
}

module.exports = {
  AFTER_SALE_PERIOD_DAYS,
  checkAfterSaleDeadline,
  checkInventoryReceived,
  getInventoryStatusMessage,
  handleQcRejection,
  processReturnToCustomer,
  checkProductThreshold,
  triggerRemovalReminder,
  batchRecallProducts,
  attributeResponsibility,
  updateProductStats,
  handleFailedRefund,
  canInitiateRefund,
  getStatusText,
  checkReconciliationDifference
};
