const express = require('express');
const db = require('../database');
const { v4: uuidv4 } = require('uuid');
const { checkAfterSaleDeadline, getStatusText } = require('../rules/businessRules');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/orders', requireRole('customer_service'), (req, res) => {
  const { status, keyword, page = 1, pageSize = 10 } = req.query;
  const offset = (page - 1) * pageSize;
  
  let whereClause = 'WHERE 1=1';
  const params = [];
  
  if (status) {
    whereClause += ' AND order_status = ?';
    params.push(status);
  }
  
  if (keyword) {
    whereClause += ' AND (order_no LIKE ? OR user_name LIKE ? OR user_phone LIKE ?)';
    const search = `%${keyword}%`;
    params.push(search, search, search);
  }
  
  const total = db.prepare(`SELECT COUNT(*) as count FROM order_snapshots ${whereClause}`).get(...params).count;
  const orders = db.prepare(`
    SELECT o.*, p.name as product_name, p.sku as product_sku
    FROM order_snapshots o
    LEFT JOIN products p ON o.product_id = p.id
    ${whereClause}
    ORDER BY o.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(pageSize), offset);
  
  const ordersWithDeadlineCheck = orders.map(order => ({
    ...order,
    deadlineCheck: checkAfterSaleDeadline(order.after_sale_deadline)
  }));
  
  res.json({
    list: ordersWithDeadlineCheck,
    total,
    page: parseInt(page),
    pageSize: parseInt(pageSize)
  });
});

router.get('/orders/:orderNo', requireRole('customer_service'), (req, res) => {
  const order = db.prepare(`
    SELECT o.*, p.name as product_name, p.sku as product_sku, p.price as product_price,
           a.anchor_name, a.session_no as anchor_session_no
    FROM order_snapshots o
    LEFT JOIN products p ON o.product_id = p.id
    LEFT JOIN anchor_sessions a ON o.anchor_session_id = a.id
    WHERE o.order_no = ?
  `).get(req.params.orderNo);
  
  if (!order) {
    return res.status(404).json({ error: '订单不存在' });
  }
  
  const existingAfterSale = db.prepare(`
    SELECT * FROM after_sale_versions 
    WHERE order_no = ? 
    ORDER BY created_at DESC 
    LIMIT 1
  `).get(req.params.orderNo);
  
  res.json({
    order,
    deadlineCheck: checkAfterSaleDeadline(order.after_sale_deadline),
    existingAfterSale: existingAfterSale ? {
      ...existingAfterSale,
      statusText: getStatusText(existingAfterSale.status)
    } : null
  });
});

router.post('/after-sale', requireRole('customer_service'), (req, res) => {
  const { orderNo, type, reason, description, images } = req.body;
  
  if (!orderNo || !type || !reason) {
    return res.status(400).json({ error: '订单号、售后类型、售后原因不能为空' });
  }
  
  const order = db.prepare('SELECT * FROM order_snapshots WHERE order_no = ?').get(orderNo);
  if (!order) {
    return res.status(404).json({ error: '订单不存在' });
  }
  
  const deadlineCheck = checkAfterSaleDeadline(order.after_sale_deadline);
  if (deadlineCheck.isExpired) {
    return res.status(400).json({ error: deadlineCheck.message });
  }
  
  const existing = db.prepare(`
    SELECT * FROM after_sale_versions 
    WHERE order_no = ? AND status NOT IN ('completed', 'closed', 'returned_to_customer', 'cs_rejected')
  `).get(orderNo);
  
  if (existing) {
    return res.status(400).json({ error: '该订单已有进行中的售后申请' });
  }
  
  const afterSaleNo = 'AS' + Date.now() + uuidv4().slice(0, 6).toUpperCase();
  const refundAmount = type === 'return' ? order.total_amount : order.total_amount * 0.5;
  
  const tx = db.transaction(() => {
    const insertAfterSale = db.prepare(`
      INSERT INTO after_sale_versions 
      (after_sale_no, order_no, order_snapshot_id, version, type, reason, description, images, 
       status, cs_id, cs_name, refund_amount)
      VALUES (?, ?, ?, 1, ?, ?, ?, ?, 'pending_review', ?, ?, ?)
    `);
    
    const result = insertAfterSale.run(
      afterSaleNo,
      orderNo,
      order.id,
      type,
      reason,
      description || null,
      images ? JSON.stringify(images) : null,
      req.user.id,
      req.user.name,
      refundAmount
    );
    
    const inventoryNo = 'INV' + Date.now() + uuidv4().slice(0, 4).toUpperCase();
    db.prepare(`
      INSERT INTO inventory_records
      (inventory_no, after_sale_no, order_no, product_id, product_sku, product_name, quantity, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      inventoryNo,
      afterSaleNo,
      orderNo,
      order.product_id,
      order.product_sku,
      order.product_name,
      order.quantity
    );
    
    req.audit.log('create_after_sale', 'after_sale', afterSaleNo, null, {
      afterSaleNo, orderNo, type, reason, refundAmount
    });
    
    return db.prepare('SELECT * FROM after_sale_versions WHERE id = ?').get(result.lastInsertRowid);
  });
  
  const afterSale = tx();
  res.json({
    success: true,
    message: '售后申请已创建',
    afterSale: {
      ...afterSale,
      statusText: getStatusText(afterSale.status)
    }
  });
});

router.get('/after-sale', requireRole('customer_service'), (req, res) => {
  const { status, keyword, page = 1, pageSize = 10 } = req.query;
  const offset = (page - 1) * pageSize;
  
  let whereClause = 'WHERE 1=1';
  const params = [];
  
  if (status) {
    whereClause += ' AND status = ?';
    params.push(status);
  }
  
  if (keyword) {
    whereClause += ' AND (after_sale_no LIKE ? OR order_no LIKE ?)';
    const search = `%${keyword}%`;
    params.push(search, search);
  }
  
  const total = db.prepare(`SELECT COUNT(*) as count FROM after_sale_versions ${whereClause}`).get(...params).count;
  const afterSales = db.prepare(`
    SELECT a.*, o.user_name, o.user_phone, o.product_name, o.product_sku, o.total_amount
    FROM after_sale_versions a
    LEFT JOIN order_snapshots o ON a.order_no = o.order_no
    ${whereClause}
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(pageSize), offset);
  
  const list = afterSales.map(as => ({
    ...as,
    statusText: getStatusText(as.status)
  }));
  
  res.json({ list, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

router.get('/after-sale/:afterSaleNo', requireRole('customer_service'), (req, res) => {
  const afterSale = db.prepare(`
    SELECT a.*, o.*, a.id as after_sale_id
    FROM after_sale_versions a
    LEFT JOIN order_snapshots o ON a.order_snapshot_id = o.id
    WHERE a.after_sale_no = ?
  `).get(req.params.afterSaleNo);
  
  if (!afterSale) {
    return res.status(404).json({ error: '售后单不存在' });
  }
  
  const inventory = db.prepare(`
    SELECT * FROM inventory_records WHERE after_sale_no = ? ORDER BY created_at DESC LIMIT 1
  `).get(req.params.afterSaleNo);
  
  const refund = db.prepare(`
    SELECT * FROM refund_records WHERE after_sale_no = ? ORDER BY created_at DESC LIMIT 1
  `).get(req.params.afterSaleNo);
  
  const versions = db.prepare(`
    SELECT * FROM after_sale_versions 
    WHERE order_no = ? 
    ORDER BY version DESC
  `).all(afterSale.order_no);
  
  const auditLogs = db.prepare(`
    SELECT * FROM audit_logs 
    WHERE target_type = 'after_sale' AND target_id = ?
    ORDER BY created_at DESC
  `).all(req.params.afterSaleNo);
  
  res.json({
    afterSale: { ...afterSale, statusText: getStatusText(afterSale.status) },
    inventory: inventory ? { ...inventory, statusText: getStatusText(inventory.status) } : null,
    refund: refund ? { ...refund, statusText: getStatusText(refund.status) } : null,
    versions: versions.map(v => ({ ...v, statusText: getStatusText(v.status) })),
    auditLogs
  });
});

router.post('/after-sale/:afterSaleNo/review', requireRole('customer_service'), (req, res) => {
  const { afterSaleNo } = req.params;
  const { approved, rejectReason, refundAmount, shippingFee, shippingBearer } = req.body;
  
  const afterSale = db.prepare('SELECT * FROM after_sale_versions WHERE after_sale_no = ?').get(afterSaleNo);
  if (!afterSale) {
    return res.status(404).json({ error: '售后单不存在' });
  }
  
  if (afterSale.status !== 'pending_review') {
    return res.status(400).json({ error: `当前状态 [${getStatusText(afterSale.status)}] 不能审核` });
  }
  
  const tx = db.transaction(() => {
    const before = { ...afterSale };
    let newStatus, newRefundAmount = afterSale.refund_amount;
    
    if (approved) {
      newStatus = afterSale.type === 'return' ? 'pending_inventory' : 'pending_refund';
      newRefundAmount = refundAmount || afterSale.refund_amount;
    } else {
      newStatus = 'cs_rejected';
    }
    
    db.prepare(`
      UPDATE after_sale_versions 
      SET status = ?, refund_amount = ?, shipping_fee = ?, shipping_bearer = ?, 
          cs_id = ?, cs_name = ?, updated_at = CURRENT_TIMESTAMP
      WHERE after_sale_no = ?
    `).run(
      newStatus,
      newRefundAmount,
      shippingFee || 0,
      shippingBearer || 'platform',
      req.user.id,
      req.user.name,
      afterSaleNo
    );
    
    if (!approved && rejectReason) {
      db.prepare(`
        UPDATE after_sale_versions 
        SET description = COALESCE(description, '') || ?
        WHERE after_sale_no = ?
      `).run(`\n【审核拒绝原因】${rejectReason}`, afterSaleNo);
    }
    
    const updated = db.prepare('SELECT * FROM after_sale_versions WHERE after_sale_no = ?').get(afterSaleNo);
    req.audit.log(approved ? 'cs_approve' : 'cs_reject', 'after_sale', afterSaleNo, before, updated);
    
    return updated;
  });
  
  const result = tx();
  res.json({
    success: true,
    message: approved ? '审核通过' : '审核已拒绝',
    afterSale: { ...result, statusText: getStatusText(result.status) }
  });
});

router.put('/after-sale/:afterSaleNo', requireRole('customer_service'), (req, res) => {
  const { afterSaleNo } = req.params;
  const { type, reason, description, images } = req.body;
  
  const afterSale = db.prepare('SELECT * FROM after_sale_versions WHERE after_sale_no = ?').get(afterSaleNo);
  if (!afterSale) {
    return res.status(404).json({ error: '售后单不存在' });
  }
  
  if (afterSale.status !== 'pending_review') {
    return res.status(400).json({ error: '只有待审核状态才能修改' });
  }
  
  const tx = db.transaction(() => {
    const newVersion = afterSale.version + 1;
    db.prepare(`
      UPDATE after_sale_versions 
      SET version = ?, type = ?, reason = ?, description = ?, images = ?, updated_at = CURRENT_TIMESTAMP
      WHERE after_sale_no = ?
    `).run(newVersion, type, reason, description, images ? JSON.stringify(images) : null, afterSaleNo);
    
    const updated = db.prepare('SELECT * FROM after_sale_versions WHERE after_sale_no = ?').get(afterSaleNo);
    req.audit.log('update_after_sale', 'after_sale', afterSaleNo, afterSale, updated);
    
    return updated;
  });
  
  const result = tx();
  res.json({
    success: true,
    message: '售后申请已更新',
    afterSale: { ...result, statusText: getStatusText(result.status) }
  });
});

module.exports = router;
