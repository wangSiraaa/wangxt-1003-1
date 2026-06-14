const db = require('../database');
const { v4: uuidv4 } = require('uuid');

function createAuditLog(operator, action, targetType, targetId, beforeData = null, afterData = null, ip = null) {
  const logNo = 'LOG' + Date.now() + uuidv4().slice(0, 6).toUpperCase();
  const stmt = db.prepare(`
    INSERT INTO audit_logs 
    (log_no, operator_id, operator_name, operator_role, action, target_type, target_id, before_data, after_data, ip)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    logNo,
    operator?.id || null,
    operator?.name || 'system',
    operator?.role || 'system',
    action,
    targetType,
    targetId,
    beforeData ? JSON.stringify(beforeData) : null,
    afterData ? JSON.stringify(afterData) : null,
    ip
  );
}

function auditMiddleware(req, res, next) {
  req.audit = {
    log: (action, targetType, targetId, beforeData, afterData) => {
      createAuditLog(
        req.user,
        action,
        targetType,
        targetId,
        beforeData,
        afterData,
        req.ip
      );
    }
  };
  next();
}

module.exports = { auditMiddleware, createAuditLog };
