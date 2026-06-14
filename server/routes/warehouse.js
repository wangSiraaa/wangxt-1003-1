const express = require('express');
const db = require('../database');
const { getStatusText, handleQcRejection, checkInventoryReceived, processReturnToCustomer } = require('../rules/businessRules');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/inventory', requireRole('warehouse'), (req, res) => {
  const { status, keyword, page = 1, pageSize = 10 } = req.query;
  const offset = (page - 1) * pageSize;
  
  let whereClause = 'WHERE 1=1';
  const params = [];
  
  if (status) {
    whereClause += ' AND status = ?';
    params.push(status);
  }
  
  if (keyword) {
    whereClause += ' AND (inventory_no LIKE ? OR after_sale_no LIKE ? OR order_no LIKE ? OR product_sku LIKE ?)';
    const search = `%${keyword}%`;
    params.push(search, search, search, search);
  }
  
  const total = db.prepare(`SELECT COUNT(*) as count FROM inventory_records ${whereClause}`).get(...params).count;
  const records = db.prepare(`
    SELECT i.*, a.type as after_sale_type, a.reason as after_sale_reason,
           o.user_name, o.user_phone, o.anchor_name
    FROM inventory_records i
    LEFT JOIN after_sale_versions a ON i.after_sale_no = a.after_sale_no
    LEFT JOIN order_snapshots o ON i.order_no = o.order_no
    ${whereClause}
    ORDER BY i.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(pageSize), offset);
  
  const list = records.map(r => ({
    ...r,
    statusText: getStatusText(r.status),
    inventoryCheck: checkInventoryReceived(r.after_sale_no)
  }));
  
  res.json({ list, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

router.get('/inventory/:inventoryNo', requireRole('warehouse'), (req, res) => {
  const record = db.prepare(`
    SELECT i.*, a.*, o.*, i.id as inventory_id, a.id as after_sale_id
    FROM inventory_records i
    LEFT JOIN after_sale_versions a ON i.after_sale_no = a.after_sale_no
    LEFT JOIN order_snapshots o ON i.order_no = o.order_no
    WHERE i.inventory_no = ?
  `).get(req.params.inventoryNo);
  
  if (!record) {
    return res.status(404).json({ error: '入库记录不存在' });
  }
  
  const auditLogs = db.prepare(`
    SELECT * FROM audit_logs 
    WHERE (target_type = 'inventory' AND target_id = ?) 
       OR (target_type = 'after_sale' AND target_id = ?)
    ORDER BY created_at DESC
  `).all(req.params.inventoryNo, record.after_sale_no);
  
  res.json({
    inventory: { ...record, statusText: getStatusText(record.status) },
    afterSale: { ...record, statusText: getStatusText(record.status) },
    inventoryCheck: checkInventoryReceived(record.after_sale_no),
    auditLogs
  });
});

router.post('/inventory/:inventoryNo/receive', requireRole('warehouse'), (req, res) => {
  const { inventoryNo } = req.params;
  const { receivedQuantity, notes } = req.body;
  
  const inventory = db.prepare('SELECT * FROM inventory_records WHERE inventory_no = ?').get(inventoryNo);
  if (!inventory) {
    return res.status(404).json({ error: '入库记录不存在' });
  }
  
  if (inventory.status !== 'pending') {
    return res.status(400).json({ error: `当前状态 [${getStatusText(inventory.status)}] 不能登记入库` });
  }
  
  const tx = db.transaction(() => {
    const before = { ...inventory };
    
    db.prepare(`
      UPDATE inventory_records 
      SET status = 'received', received_time = CURRENT_TIMESTAMP,
          warehouse_operator_id = ?, warehouse_operator_name = ?,
          quantity = COALESCE(?, quantity)
      WHERE inventory_no = ?
    `).run(req.user.id, req.user.name, receivedQuantity, inventoryNo);
    
    db.prepare(`
      UPDATE after_sale_versions 
      SET status = 'received', warehouse_id = ?, warehouse_name = ?, updated_at = CURRENT_TIMESTAMP
      WHERE after_sale_no = ?
    `).run(req.user.id, req.user.name, inventory.after_sale_no);
    
    const updatedInventory = db.prepare('SELECT * FROM inventory_records WHERE inventory_no = ?').get(inventoryNo);
    const updatedAfterSale = db.prepare('SELECT * FROM after_sale_versions WHERE after_sale_no = ?').get(inventory.after_sale_no);
    
    req.audit.log('receive_inventory', 'inventory', inventoryNo, before, updatedInventory);
    
    return { inventory: updatedInventory, afterSale: updatedAfterSale };
  });
  
  const result = tx();
  res.json({
    success: true,
    message: '退货已登记入库',
    inventory: { ...result.inventory, statusText: getStatusText(result.inventory.status) },
    afterSale: { ...result.afterSale, statusText: getStatusText(result.afterSale.status) }
  });
});

router.post('/inventory/:inventoryNo/qc', requireRole('warehouse'), (req, res) => {
  const { inventoryNo } = req.params;
  const { qcResult, qcDescription } = req.body;
  
  if (!qcResult) {
    return res.status(400).json({ error: '质检结果不能为空' });
  }
  
  const inventory = db.prepare('SELECT * FROM inventory_records WHERE inventory_no = ?').get(inventoryNo);
  if (!inventory) {
    return res.status(404).json({ error: '入库记录不存在' });
  }
  
  if (inventory.status !== 'received') {
    return res.status(400).json({ error: `当前状态 [${getStatusText(inventory.status)}] 不能质检` });
  }
  
  if (qcResult === 'rejected') {
    const result = handleQcRejection(inventory.after_sale_no, qcDescription, req.user);
    return res.json({
      success: true,
      message: '质检拒收，已退回处理',
      qcResult: 'rejected',
      afterSale: { ...result, statusText: getStatusText(result.status) }
    });
  }
  
  const tx = db.transaction(() => {
    const beforeInv = { ...inventory };
    
    db.prepare(`
      UPDATE inventory_records 
      SET status = 'qc_passed', qc_result = 'passed', qc_description = ?,
          qc_time = CURRENT_TIMESTAMP, qc_operator_id = ?, qc_operator_name = ?
      WHERE inventory_no = ?
    `).run(qcDescription, req.user.id, req.user.name, inventoryNo);
    
    const afterSaleBefore = db.prepare('SELECT * FROM after_sale_versions WHERE after_sale_no = ?').get(inventory.after_sale_no);
    db.prepare(`
      UPDATE after_sale_versions 
      SET status = 'qc_passed', qc_result = 'passed', qc_description = ?,
          warehouse_id = ?, warehouse_name = ?, updated_at = CURRENT_TIMESTAMP
      WHERE after_sale_no = ?
    `).run(qcDescription, req.user.id, req.user.name, inventory.after_sale_no);
    
    const updatedInventory = db.prepare('SELECT * FROM inventory_records WHERE inventory_no = ?').get(inventoryNo);
    const updatedAfterSale = db.prepare('SELECT * FROM after_sale_versions WHERE after_sale_no = ?').get(inventory.after_sale_no);
    
    req.audit.log('qc_pass', 'inventory', inventoryNo, beforeInv, updatedInventory);
    req.audit.log('qc_pass', 'after_sale', inventory.after_sale_no, afterSaleBefore, updatedAfterSale);
    
    return { inventory: updatedInventory, afterSale: updatedAfterSale };
  });
  
  const result = tx();
  res.json({
    success: true,
    message: '质检通过',
    qcResult: 'passed',
    inventory: { ...result.inventory, statusText: getStatusText(result.inventory.status) },
    afterSale: { ...result.afterSale, statusText: getStatusText(result.afterSale.status) }
  });
});

router.post('/inventory/:inventoryNo/return-customer', requireRole('warehouse'), (req, res) => {
  const { inventoryNo } = req.params;
  
  const inventory = db.prepare('SELECT * FROM inventory_records WHERE inventory_no = ?').get(inventoryNo);
  if (!inventory) {
    return res.status(404).json({ error: '入库记录不存在' });
  }
  
  if (inventory.status !== 'qc_rejected') {
    return res.status(400).json({ error: `当前状态 [${getStatusText(inventory.status)}] 不能退回客户` });
  }
  
  const result = processReturnToCustomer(inventory.after_sale_no, req.user);
  res.json({
    success: true,
    message: '已退回客户处理',
    afterSale: { ...result, statusText: getStatusText(result.status) }
  });
});

router.get('/statistics', requireRole('warehouse'), (req, res) => {
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'received' THEN 1 ELSE 0 END) as received,
      SUM(CASE WHEN status = 'qc_passed' THEN 1 ELSE 0 END) as qc_passed,
      SUM(CASE WHEN status = 'qc_rejected' THEN 1 ELSE 0 END) as qc_rejected,
      SUM(CASE WHEN status = 'returned_to_customer' THEN 1 ELSE 0 END) as returned
    FROM inventory_records
    WHERE DATE(created_at) >= DATE('now', '-30 days')
  `).get();
  
  const todayStats = db.prepare(`
    SELECT 
      COUNT(*) as today_received,
      COUNT(CASE WHEN qc_result = 'passed' THEN 1 END) as today_qc_passed,
      COUNT(CASE WHEN qc_result = 'rejected' THEN 1 END) as today_qc_rejected
    FROM inventory_records
    WHERE DATE(created_at) = DATE('now')
  `).get();
  
  res.json({
    stats,
    todayStats
  });
});

module.exports = router;
