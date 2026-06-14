const express = require('express');
const db = require('../database');
const { v4: uuidv4 } = require('uuid');
const { getStatusText, checkProductThreshold, triggerRemovalReminder, batchRecallProducts, attributeResponsibility } = require('../rules/businessRules');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/products/stats', requireRole('anchor_ops'), (req, res) => {
  const { thresholdExceededOnly, keyword, page = 1, pageSize = 10 } = req.query;
  const offset = (page - 1) * pageSize;
  
  let whereClause = 'WHERE 1=1';
  const params = [];
  
  if (keyword) {
    whereClause += ' AND (ps.product_sku LIKE ? OR ps.product_name LIKE ?)';
    const search = `%${keyword}%`;
    params.push(search, search);
  }
  
  const joinClause = thresholdExceededOnly === 'true' 
    ? 'INNER JOIN products p ON ps.product_id = p.id AND ps.total_issues >= p.threshold'
    : 'LEFT JOIN products p ON ps.product_id = p.id';
  
  const total = db.prepare(`
    SELECT COUNT(*) as count FROM product_stats ps ${whereClause}
  `).get(...params).count;
  
  const stats = db.prepare(`
    SELECT ps.*, p.threshold, p.status as product_status, p.category,
           CASE WHEN ps.total_issues >= p.threshold THEN 1 ELSE 0 END as exceeds_threshold
    FROM product_stats ps
    ${joinClause}
    ${whereClause}
    ORDER BY ps.total_issues DESC, ps.updated_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(pageSize), offset);
  
  const list = stats.map(s => ({
    ...s,
    thresholdCheck: checkProductThreshold(s.product_id, req.user)
  }));
  
  res.json({ list, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

router.get('/products/:productId', requireRole('anchor_ops'), (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.productId);
  if (!product) {
    return res.status(404).json({ error: '商品不存在' });
  }
  
  const stats = db.prepare('SELECT * FROM product_stats WHERE product_id = ?').get(req.params.productId);
  const relatedAfterSales = db.prepare(`
    SELECT a.*, o.user_name, o.order_no, o.anchor_name
    FROM after_sale_versions a
    LEFT JOIN order_snapshots o ON a.order_snapshot_id = o.id
    WHERE o.product_id = ?
    ORDER BY a.created_at DESC
    LIMIT 20
  `).all(req.params.productId);
  
  const removalReminders = db.prepare(`
    SELECT * FROM removal_reminders 
    WHERE product_id = ? 
    ORDER BY triggered_at DESC
  `).all(req.params.productId);
  
  res.json({
    product,
    stats: stats || null,
    thresholdCheck: checkProductThreshold(req.params.productId, req.user),
    relatedAfterSales: relatedAfterSales.map(a => ({ ...a, statusText: getStatusText(a.status) })),
    removalReminders: removalReminders.map(r => ({ ...r, statusText: getStatusText(r.status) }))
  });
});

router.post('/products/batch-recall', requireRole('anchor_ops'), (req, res) => {
  const { productIds, reason } = req.body;
  
  if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
    return res.status(400).json({ error: '请选择要召回的商品' });
  }
  
  const results = batchRecallProducts(productIds, req.user, reason);
  const successCount = results.filter(r => r.success).length;
  
  res.json({
    success: true,
    message: `批量召回完成，成功 ${successCount}/${results.length}`,
    results
  });
});

router.post('/products/:productId/trigger-removal', requireRole('anchor_ops'), (req, res) => {
  const { anchorSessionId } = req.body;
  const result = triggerRemovalReminder(parseInt(req.params.productId), req.user, anchorSessionId);
  
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }
  
  res.json(result);
});

router.get('/removal-reminders', requireRole('anchor_ops'), (req, res) => {
  const { status, keyword, page = 1, pageSize = 10 } = req.query;
  const offset = (page - 1) * pageSize;
  
  let whereClause = 'WHERE 1=1';
  const params = [];
  
  if (status) {
    whereClause += ' AND status = ?';
    params.push(status);
  }
  
  if (keyword) {
    whereClause += ' AND (product_sku LIKE ? OR product_name LIKE ? OR anchor_name LIKE ?)';
    const search = `%${keyword}%`;
    params.push(search, search, search);
  }
  
  const total = db.prepare(`SELECT COUNT(*) as count FROM removal_reminders ${whereClause}`).get(...params).count;
  const reminders = db.prepare(`
    SELECT r.*, p.status as product_status, p.category
    FROM removal_reminders r
    LEFT JOIN products p ON r.product_id = p.id
    ${whereClause}
    ORDER BY r.triggered_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(pageSize), offset);
  
  const statusMap = {
    pending: '待处理',
    handled: '已处理',
    ignored: '已忽略'
  };
  
  res.json({
    list: reminders.map(r => ({ ...r, statusText: statusMap[r.status] || r.status })),
    total,
    page: parseInt(page),
    pageSize: parseInt(pageSize)
  });
});

router.post('/removal-reminders/:reminderNo/handle', requireRole('anchor_ops'), (req, res) => {
  const { reminderNo } = req.params;
  const { action, actionTaken } = req.body;
  
  const reminder = db.prepare('SELECT * FROM removal_reminders WHERE reminder_no = ?').get(reminderNo);
  if (!reminder) {
    return res.status(404).json({ error: '下架提醒不存在' });
  }
  
  if (reminder.status !== 'pending') {
    return res.status(400).json({ error: `当前状态 [${reminder.status}] 不能处理` });
  }
  
  const tx = db.transaction(() => {
    const before = { ...reminder };
    
    db.prepare(`
      UPDATE removal_reminders 
      SET status = ?, action_taken = ?, operator_id = ?, operator_name = ?, handled_at = CURRENT_TIMESTAMP
      WHERE reminder_no = ?
    `).run(action === 'ignore' ? 'ignored' : 'handled', actionTaken, req.user.id, req.user.name, reminderNo);
    
    if (action === 'remove') {
      db.prepare('UPDATE products SET status = ? WHERE id = ?').run('removed', reminder.product_id);
    }
    
    const updated = db.prepare('SELECT * FROM removal_reminders WHERE reminder_no = ?').get(reminderNo);
    req.audit.log('handle_removal_reminder', 'removal_reminder', reminderNo, before, updated);
    
    return updated;
  });
  
  const result = tx();
  res.json({
    success: true,
    message: '处理完成',
    reminder: result
  });
});

router.post('/after-sale/:afterSaleNo/attribute-responsibility', requireRole('anchor_ops'), (req, res) => {
  const { afterSaleNo } = req.params;
  const { responsibility, reason } = req.body;
  
  if (!responsibility) {
    return res.status(400).json({ error: '责任归因不能为空' });
  }
  
  const result = attributeResponsibility(afterSaleNo, responsibility, req.user, reason);
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }
  
  res.json({
    success: true,
    message: '责任归因已完成',
    afterSale: { ...result.afterSale, statusText: getStatusText(result.afterSale.status) }
  });
});

router.get('/sessions', requireRole('anchor_ops'), (req, res) => {
  const { status, keyword, page = 1, pageSize = 10 } = req.query;
  const offset = (page - 1) * pageSize;
  
  let whereClause = 'WHERE 1=1';
  const params = [];
  
  if (status) {
    whereClause += ' AND status = ?';
    params.push(status);
  }
  
  if (keyword) {
    whereClause += ' AND (session_no LIKE ? OR anchor_name LIKE ?)';
    const search = `%${keyword}%`;
    params.push(search, search);
  }
  
  const total = db.prepare(`SELECT COUNT(*) as count FROM anchor_sessions ${whereClause}`).get(...params).count;
  const sessions = db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM order_snapshots o WHERE o.anchor_session_id = s.id) as order_count,
      (SELECT COUNT(*) FROM after_sale_versions a 
       LEFT JOIN order_snapshots o ON a.order_snapshot_id = o.id
       WHERE o.anchor_session_id = s.id) as after_sale_count
    FROM anchor_sessions s
    ${whereClause}
    ORDER BY s.start_time DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(pageSize), offset);
  
  res.json({
    list: sessions,
    total,
    page: parseInt(page),
    pageSize: parseInt(pageSize)
  });
});

router.get('/sessions/:sessionId', requireRole('anchor_ops'), (req, res) => {
  const session = db.prepare('SELECT * FROM anchor_sessions WHERE id = ?').get(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: '场次不存在' });
  }
  
  const orders = db.prepare(`
    SELECT o.*, 
      (SELECT COUNT(*) FROM after_sale_versions a WHERE a.order_no = o.order_no) as has_after_sale
    FROM order_snapshots o
    WHERE o.anchor_session_id = ?
    ORDER BY o.pay_time DESC
  `).all(req.params.sessionId);
  
  const afterSales = db.prepare(`
    SELECT a.*, o.product_name, o.user_name, o.product_sku
    FROM after_sale_versions a
    LEFT JOIN order_snapshots o ON a.order_snapshot_id = o.id
    WHERE o.anchor_session_id = ?
    ORDER BY a.created_at DESC
  `).all(req.params.sessionId);
  
  const productStats = db.prepare(`
    SELECT p.sku, p.name, COUNT(*) as issue_count, p.threshold,
           CASE WHEN COUNT(*) >= p.threshold THEN 1 ELSE 0 END as exceeds_threshold
    FROM after_sale_versions a
    LEFT JOIN order_snapshots o ON a.order_snapshot_id = o.id
    LEFT JOIN products p ON o.product_id = p.id
    WHERE o.anchor_session_id = ?
    GROUP BY p.id
    ORDER BY issue_count DESC
  `).all(req.params.sessionId);
  
  res.json({
    session,
    orders: orders.map(o => ({ ...o, deadlineCheck: require('../rules/businessRules').checkAfterSaleDeadline(o.after_sale_deadline) })),
    afterSales: afterSales.map(a => ({ ...a, statusText: getStatusText(a.status) })),
    productStats
  });
});

router.get('/dashboard', requireRole('anchor_ops'), (req, res) => {
  const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  const totalIssues = db.prepare('SELECT COALESCE(SUM(total_issues), 0) as total FROM product_stats').get().total;
  const exceedingThreshold = db.prepare(`
    SELECT COUNT(*) as count 
    FROM product_stats ps
    INNER JOIN products p ON ps.product_id = p.id
    WHERE ps.total_issues >= p.threshold
  `).get().count;
  const pendingReminders = db.prepare("SELECT COUNT(*) as count FROM removal_reminders WHERE status = 'pending'").get().count;
  
  const recentIssues = db.prepare(`
    SELECT ps.*, p.threshold, p.name, p.sku
    FROM product_stats ps
    LEFT JOIN products p ON ps.product_id = p.id
    ORDER BY ps.last_issue_time DESC
    LIMIT 10
  `).all();
  
  const responsibilityStats = db.prepare(`
    SELECT responsibility, COUNT(*) as count
    FROM after_sale_versions
    WHERE responsibility IS NOT NULL
    GROUP BY responsibility
  `).all();
  
  res.json({
    overview: {
      totalProducts,
      totalIssues,
      exceedingThreshold,
      pendingReminders
    },
    recentIssues,
    responsibilityStats
  });
});

module.exports = router;
