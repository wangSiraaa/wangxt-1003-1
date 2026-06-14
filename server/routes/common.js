const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/audit-logs', authMiddleware, (req, res) => {
  const { targetType, targetId, operatorId, page = 1, pageSize = 20 } = req.query;
  const offset = (page - 1) * pageSize;
  
  let whereClause = 'WHERE 1=1';
  const params = [];
  
  if (targetType) {
    whereClause += ' AND target_type = ?';
    params.push(targetType);
  }
  
  if (targetId) {
    whereClause += ' AND target_id = ?';
    params.push(targetId);
  }
  
  if (operatorId) {
    whereClause += ' AND operator_id = ?';
    params.push(operatorId);
  }
  
  const total = db.prepare(`SELECT COUNT(*) as count FROM audit_logs ${whereClause}`).get(...params).count;
  const logs = db.prepare(`
    SELECT * FROM audit_logs
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(pageSize), offset);
  
  res.json({
    list: logs.map(l => ({
      ...l,
      before_data: l.before_data ? JSON.parse(l.before_data) : null,
      after_data: l.after_data ? JSON.parse(l.after_data) : null
    })),
    total,
    page: parseInt(page),
    pageSize: parseInt(pageSize)
  });
});

router.get('/products', authMiddleware, (req, res) => {
  const { keyword, status, page = 1, pageSize = 20 } = req.query;
  const offset = (page - 1) * pageSize;
  
  let whereClause = 'WHERE 1=1';
  const params = [];
  
  if (keyword) {
    whereClause += ' AND (sku LIKE ? OR name LIKE ?)';
    const search = `%${keyword}%`;
    params.push(search, search);
  }
  
  if (status) {
    whereClause += ' AND status = ?';
    params.push(status);
  }
  
  const total = db.prepare(`SELECT COUNT(*) as count FROM products ${whereClause}`).get(...params).count;
  const products = db.prepare(`
    SELECT p.*, 
           (SELECT total_issues FROM product_stats WHERE product_id = p.id) as total_issues
    FROM products p
    ${whereClause}
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(pageSize), offset);
  
  res.json({ list: products, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

router.get('/anchor-sessions', authMiddleware, (req, res) => {
  const sessions = db.prepare(`
    SELECT * FROM anchor_sessions
    ORDER BY start_time DESC
    LIMIT 50
  `).all();
  res.json(sessions);
});

router.get('/dashboard/stats', authMiddleware, (req, res) => {
  const afterSaleStats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending_review' THEN 1 ELSE 0 END) as pending_review,
      SUM(CASE WHEN status = 'cs_approved' THEN 1 ELSE 0 END) as cs_approved,
      SUM(CASE WHEN status = 'pending_inventory' THEN 1 ELSE 0 END) as pending_inventory,
      SUM(CASE WHEN status = 'received' THEN 1 ELSE 0 END) as received,
      SUM(CASE WHEN status = 'qc_passed' THEN 1 ELSE 0 END) as qc_passed,
      SUM(CASE WHEN status = 'qc_rejected' THEN 1 ELSE 0 END) as qc_rejected,
      SUM(CASE WHEN status = 'pending_refund' THEN 1 ELSE 0 END) as pending_refund,
      SUM(CASE WHEN status = 'refund_processing' THEN 1 ELSE 0 END) as refund_processing,
      SUM(CASE WHEN status = 'refund_success' THEN 1 ELSE 0 END) as refund_success,
      SUM(CASE WHEN status = 'refund_hung' THEN 1 ELSE 0 END) as refund_hung,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(refund_amount) as total_refund_amount
    FROM after_sale_versions
    WHERE DATE(created_at) >= DATE('now', '-30 days')
  `).get();
  
  const inventoryStats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'received' THEN 1 ELSE 0 END) as received,
      SUM(CASE WHEN status = 'qc_passed' THEN 1 ELSE 0 END) as qc_passed,
      SUM(CASE WHEN status = 'qc_rejected' THEN 1 ELSE 0 END) as qc_rejected
    FROM inventory_records
    WHERE DATE(created_at) >= DATE('now', '-30 days')
  `).get();
  
  const productAlertCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM product_stats ps
    INNER JOIN products p ON ps.product_id = p.id
    WHERE ps.total_issues >= p.threshold
  `).get().count;
  
  const pendingRemovalCount = db.prepare("SELECT COUNT(*) as count FROM removal_reminders WHERE status = 'pending'").get().count;
  
  const recentActivity = db.prepare(`
    SELECT * FROM audit_logs
    ORDER BY created_at DESC
    LIMIT 10
  `).all();
  
  res.json({
    afterSaleStats,
    inventoryStats,
    productAlertCount,
    pendingRemovalCount,
    recentActivity: recentActivity.map(a => ({
      ...a,
      before_data: a.before_data ? JSON.parse(a.before_data) : null,
      after_data: a.after_data ? JSON.parse(a.after_data) : null
    }))
  });
});

module.exports = router;
