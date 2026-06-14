const express = require('express');
const db = require('../database');
const { v4: uuidv4 } = require('uuid');
const { getStatusText, canInitiateRefund, handleFailedRefund, checkReconciliationDifference } = require('../rules/businessRules');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/refunds/pending', requireRole('finance'), (req, res) => {
  const { keyword, page = 1, pageSize = 10 } = req.query;
  const offset = (page - 1) * pageSize;
  
  let whereClause = "WHERE a.status IN ('pending_refund', 'qc_passed', 'cs_approved')";
  const params = [];
  
  if (keyword) {
    whereClause += ' AND (a.after_sale_no LIKE ? OR a.order_no LIKE ? OR o.user_name LIKE ?)';
    const search = `%${keyword}%`;
    params.push(search, search, search);
  }
  
  const total = db.prepare(`
    SELECT COUNT(*) as count FROM after_sale_versions a
    LEFT JOIN order_snapshots o ON a.order_no = o.order_no
    ${whereClause}
  `).get(...params).count;
  
  const refunds = db.prepare(`
    SELECT a.*, o.user_name, o.user_phone, o.product_name, o.product_sku, o.total_amount,
           i.status as inventory_status, i.received_time, i.qc_result,
           a.refund_amount as expected_refund, a.shipping_fee, a.shipping_bearer
    FROM after_sale_versions a
    LEFT JOIN order_snapshots o ON a.order_no = o.order_no
    LEFT JOIN inventory_records i ON a.after_sale_no = i.after_sale_no
    ${whereClause}
    AND a.status NOT IN ('refund_success', 'completed', 'refund_hung', 'refund_failed')
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(pageSize), offset);
  
  const list = refunds.map(r => ({
    ...r,
    statusText: getStatusText(r.status),
    inventoryStatusText: getStatusText(r.inventory_status),
    refundCheck: canInitiateRefund(r.after_sale_no)
  }));
  
  res.json({ list, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

router.get('/refunds', requireRole('finance'), (req, res) => {
  const { status, keyword, page = 1, pageSize = 10 } = req.query;
  const offset = (page - 1) * pageSize;
  
  let whereClause = 'WHERE 1=1';
  const params = [];
  
  if (status) {
    whereClause += ' AND r.status = ?';
    params.push(status);
  }
  
  if (keyword) {
    whereClause += ' AND (r.refund_no LIKE ? OR r.after_sale_no LIKE ? OR r.order_no LIKE ?)';
    const search = `%${keyword}%`;
    params.push(search, search, search);
  }
  
  const total = db.prepare(`SELECT COUNT(*) as count FROM refund_records r ${whereClause}`).get(...params).count;
  const refunds = db.prepare(`
    SELECT r.*, a.type as after_sale_type, a.reason, a.refund_amount as expected_amount,
           o.user_name, o.product_name, o.product_sku
    FROM refund_records r
    LEFT JOIN after_sale_versions a ON r.after_sale_no = a.after_sale_no
    LEFT JOIN order_snapshots o ON r.order_no = o.order_no
    ${whereClause}
    ORDER BY r.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(pageSize), offset);
  
  const statusMap = {
    pending: '待处理',
    processing: '处理中',
    success: '退款成功',
    failed: '退款失败',
    hung: '已挂账'
  };
  
  res.json({
    list: refunds.map(r => ({ ...r, statusText: statusMap[r.status] || r.status })),
    total,
    page: parseInt(page),
    pageSize: parseInt(pageSize)
  });
});

router.get('/refunds/:refundNo', requireRole('finance'), (req, res) => {
  const refund = db.prepare(`
    SELECT r.*, a.*, o.*, r.id as refund_id, a.id as after_sale_id
    FROM refund_records r
    LEFT JOIN after_sale_versions a ON r.after_sale_no = a.after_sale_no
    LEFT JOIN order_snapshots o ON r.order_no = o.order_no
    WHERE r.refund_no = ?
  `).get(req.params.refundNo);
  
  if (!refund) {
    return res.status(404).json({ error: '退款记录不存在' });
  }
  
  const inventory = db.prepare(`
    SELECT * FROM inventory_records WHERE after_sale_no = ? ORDER BY created_at DESC LIMIT 1
  `).get(refund.after_sale_no);
  
  const auditLogs = db.prepare(`
    SELECT * FROM audit_logs 
    WHERE (target_type = 'refund' AND target_id = ?) 
       OR (target_type = 'after_sale' AND target_id = ?)
    ORDER BY created_at DESC
  `).all(req.params.refundNo, refund.after_sale_no);
  
  const statusMap = {
    pending: '待处理',
    processing: '处理中',
    success: '退款成功',
    failed: '退款失败',
    hung: '已挂账'
  };
  
  res.json({
    refund: { ...refund, statusText: statusMap[refund.status] || refund.status },
    afterSale: { ...refund, statusText: getStatusText(refund.status) },
    inventory: inventory ? { ...inventory, statusText: getStatusText(inventory.status) } : null,
    refundCheck: canInitiateRefund(refund.after_sale_no),
    auditLogs
  });
});

router.post('/refunds/initiate', requireRole('finance'), (req, res) => {
  const { afterSaleNo, amount, channel } = req.body;
  
  if (!afterSaleNo || !amount || !channel) {
    return res.status(400).json({ error: '售后单号、退款金额、退款渠道不能为空' });
  }
  
  const refundCheck = canInitiateRefund(afterSaleNo);
  if (!refundCheck.canRefund) {
    return res.status(400).json({ error: refundCheck.reason, checkResult: refundCheck });
  }
  
  const existingRefund = db.prepare(`
    SELECT * FROM refund_records 
    WHERE after_sale_no = ? AND status NOT IN ('success', 'hung')
  `).get(afterSaleNo);
  
  if (existingRefund) {
    return res.status(400).json({ error: '该售后单已有进行中的退款' });
  }
  
  const refundNo = 'REF' + Date.now() + uuidv4().slice(0, 6).toUpperCase();
  
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO refund_records
      (refund_no, after_sale_no, order_no, amount, channel, operator_id, operator_name, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'processing')
    `).run(
      refundNo,
      afterSaleNo,
      refundCheck.afterSale.order_no,
      amount,
      channel,
      req.user.id,
      req.user.name
    );
    
    const before = db.prepare('SELECT * FROM after_sale_versions WHERE after_sale_no = ?').get(afterSaleNo);
    db.prepare(`
      UPDATE after_sale_versions 
      SET status = 'refund_processing', refund_channel = ?, 
          finance_id = ?, finance_name = ?, updated_at = CURRENT_TIMESTAMP
      WHERE after_sale_no = ?
    `).run(channel, req.user.id, req.user.name, afterSaleNo);
    
    const afterSaleAfter = db.prepare('SELECT * FROM after_sale_versions WHERE after_sale_no = ?').get(afterSaleNo);
    const refund = db.prepare('SELECT * FROM refund_records WHERE refund_no = ?').get(refundNo);
    
    req.audit.log('initiate_refund', 'refund', refundNo, null, refund);
    req.audit.log('update_status', 'after_sale', afterSaleNo, before, afterSaleAfter);
    
    return { refund, afterSale: afterSaleAfter };
  });
  
  const result = tx();
  res.json({
    success: true,
    message: '退款已发起',
    refund: result.refund,
    afterSale: { ...result.afterSale, statusText: getStatusText(result.afterSale.status) }
  });
});

router.post('/refunds/:refundNo/confirm', requireRole('finance'), (req, res) => {
  const { refundNo } = req.params;
  const { transactionId, actualAmount } = req.body;
  
  const refund = db.prepare('SELECT * FROM refund_records WHERE refund_no = ?').get(refundNo);
  if (!refund) {
    return res.status(404).json({ error: '退款记录不存在' });
  }
  
  if (refund.status !== 'processing') {
    return res.status(400).json({ error: `当前状态 [${refund.status}] 不能确认` });
  }
  
  const expectedAmount = refund.amount;
  const reconciliationCheck = checkReconciliationDifference(
    refund.id,
    expectedAmount,
    actualAmount || expectedAmount
  );
  
  const tx = db.transaction(() => {
    const before = { ...refund };
    
    db.prepare(`
      UPDATE refund_records 
      SET status = 'success', transaction_id = ?, processed_at = CURRENT_TIMESTAMP
      WHERE refund_no = ?
    `).run(transactionId || null, refundNo);
    
    const afterSaleBefore = db.prepare('SELECT * FROM after_sale_versions WHERE after_sale_no = ?').get(refund.after_sale_no);
    db.prepare(`
      UPDATE after_sale_versions 
      SET status = 'completed', updated_at = CURRENT_TIMESTAMP
      WHERE after_sale_no = ?
    `).run(refund.after_sale_no);
    
    const updatedRefund = db.prepare('SELECT * FROM refund_records WHERE refund_no = ?').get(refundNo);
    const updatedAfterSale = db.prepare('SELECT * FROM after_sale_versions WHERE after_sale_no = ?').get(refund.after_sale_no);
    
    req.audit.log('confirm_refund', 'refund', refundNo, before, updatedRefund);
    req.audit.log('complete_after_sale', 'after_sale', refund.after_sale_no, afterSaleBefore, updatedAfterSale);
    
    return { refund: updatedRefund, afterSale: updatedAfterSale, reconciliationCheck };
  });
  
  const result = tx();
  res.json({
    success: true,
    message: reconciliationCheck.hasDifference 
      ? `退款成功，但存在对账差异: ${reconciliationCheck.difference.toFixed(2)} 元`
      : '退款成功',
    refund: result.refund,
    afterSale: { ...result.afterSale, statusText: getStatusText(result.afterSale.status) },
    reconciliationCheck: result.reconciliationCheck
  });
});

router.post('/refunds/:refundNo/fail', requireRole('finance'), (req, res) => {
  const { refundNo } = req.params;
  const { failedReason, hangRefund } = req.body;
  
  const refund = db.prepare('SELECT * FROM refund_records WHERE refund_no = ?').get(refundNo);
  if (!refund) {
    return res.status(404).json({ error: '退款记录不存在' });
  }
  
  if (refund.status !== 'processing') {
    return res.status(400).json({ error: `当前状态 [${refund.status}] 不能标记失败` });
  }
  
  const result = handleFailedRefund(refund.id, failedReason, req.user, hangRefund);
  
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }
  
  res.json({
    success: true,
    message: result.message,
    status: result.status,
    refund: db.prepare('SELECT * FROM refund_records WHERE id = ?').get(refund.id)
  });
});

router.post('/refunds/:refundNo/retry', requireRole('finance'), (req, res) => {
  const { refundNo } = req.params;
  const { channel } = req.body;
  
  const refund = db.prepare('SELECT * FROM refund_records WHERE refund_no = ?').get(refundNo);
  if (!refund) {
    return res.status(404).json({ error: '退款记录不存在' });
  }
  
  if (!['failed', 'hung'].includes(refund.status)) {
    return res.status(400).json({ error: `当前状态 [${refund.status}] 不能重试` });
  }
  
  const refundCheck = canInitiateRefund(refund.after_sale_no);
  if (!refundCheck.canRefund) {
    return res.status(400).json({ error: refundCheck.reason });
  }
  
  const tx = db.transaction(() => {
    const before = { ...refund };
    
    db.prepare(`
      UPDATE refund_records 
      SET status = 'processing', channel = ?, failed_reason = NULL, 
          is_hung = 0, hung_reason = NULL, processed_at = NULL,
          operator_id = ?, operator_name = ?
      WHERE refund_no = ?
    `).run(channel || refund.channel, req.user.id, req.user.name, refundNo);
    
    const beforeAfterSale = db.prepare('SELECT * FROM after_sale_versions WHERE after_sale_no = ?').get(refund.after_sale_no);
    db.prepare(`
      UPDATE after_sale_versions 
      SET status = 'refund_processing', is_hung = 0, hung_reason = NULL,
          refund_channel = ?, finance_id = ?, finance_name = ?, updated_at = CURRENT_TIMESTAMP
      WHERE after_sale_no = ?
    `).run(channel || refund.channel, req.user.id, req.user.name, refund.after_sale_no);
    
    const updatedRefund = db.prepare('SELECT * FROM refund_records WHERE refund_no = ?').get(refundNo);
    const updatedAfterSale = db.prepare('SELECT * FROM after_sale_versions WHERE after_sale_no = ?').get(refund.after_sale_no);
    
    req.audit.log('retry_refund', 'refund', refundNo, before, updatedRefund);
    req.audit.log('retry_refund', 'after_sale', refund.after_sale_no, beforeAfterSale, updatedAfterSale);
    
    return { refund: updatedRefund, afterSale: updatedAfterSale };
  });
  
  const result = tx();
  res.json({
    success: true,
    message: '退款重试已发起',
    refund: result.refund,
    afterSale: { ...result.afterSale, statusText: getStatusText(result.afterSale.status) }
  });
});

router.get('/reconciliation', requireRole('finance'), (req, res) => {
  const { startDate, endDate, hasDifference, page = 1, pageSize = 10 } = req.query;
  const offset = (page - 1) * pageSize;
  
  let whereClause = "WHERE r.status = 'success'";
  const params = [];
  
  if (startDate) {
    whereClause += ' AND DATE(r.processed_at) >= DATE(?)';
    params.push(startDate);
  }
  
  if (endDate) {
    whereClause += ' AND DATE(r.processed_at) <= DATE(?)';
    params.push(endDate);
  }
  
  const allRecords = db.prepare(`
    SELECT r.*, a.refund_amount as expected_amount
    FROM refund_records r
    LEFT JOIN after_sale_versions a ON r.after_sale_no = a.after_sale_no
    ${whereClause}
  `).all(...params);
  
  const recordsWithDiff = allRecords.map(r => ({
    ...r,
    difference: (r.amount || 0) - (r.expected_amount || 0),
    hasDifference: Math.abs((r.amount || 0) - (r.expected_amount || 0)) > 0.01
  }));
  
  const filtered = hasDifference === 'true' 
    ? recordsWithDiff.filter(r => r.hasDifference)
    : recordsWithDiff;
  
  const total = filtered.length;
  const list = filtered.slice(offset, offset + parseInt(pageSize));
  
  const summary = {
    totalRecords: recordsWithDiff.length,
    totalAmount: recordsWithDiff.reduce((sum, r) => sum + (r.amount || 0), 0),
    totalExpected: recordsWithDiff.reduce((sum, r) => sum + (r.expected_amount || 0), 0),
    totalDifference: recordsWithDiff.reduce((sum, r) => sum + r.difference, 0),
    differenceCount: recordsWithDiff.filter(r => r.hasDifference).length
  };
  
  res.json({ list, total, page: parseInt(page), pageSize: parseInt(pageSize), summary });
});

router.get('/statistics', requireRole('finance'), (req, res) => {
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'hung' THEN 1 ELSE 0 END) as hung,
      SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END) as total_refunded,
      SUM(CASE WHEN status = 'hung' THEN amount ELSE 0 END) as total_hung
    FROM refund_records
    WHERE DATE(created_at) >= DATE('now', '-30 days')
  `).get();
  
  const channelStats = db.prepare(`
    SELECT channel, COUNT(*) as count, SUM(amount) as total
    FROM refund_records
    WHERE status = 'success'
    AND DATE(created_at) >= DATE('now', '-30 days')
    GROUP BY channel
  `).all();
  
  const bearerStats = db.prepare(`
    SELECT shipping_bearer, COUNT(*) as count, SUM(shipping_fee) as total
    FROM after_sale_versions
    WHERE shipping_fee IS NOT NULL
    AND DATE(created_at) >= DATE('now', '-30 days')
    GROUP BY shipping_bearer
  `).all();
  
  res.json({ stats, channelStats, bearerStats });
});

module.exports = router;
