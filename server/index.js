const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const { authMiddleware } = require('./middleware/auth');
const { auditMiddleware } = require('./middleware/audit');
require('./database');

const authRoutes = require('./routes/auth');
const customerServiceRoutes = require('./routes/customerService');
const warehouseRoutes = require('./routes/warehouse');
const anchorOpsRoutes = require('./routes/anchorOps');
const financeRoutes = require('./routes/finance');
const commonRoutes = require('./routes/common');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(auditMiddleware);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '电商直播售后协同系统 API 正常运行' });
});

app.use('/api/auth', authRoutes);
app.use('/api/customer-service', authMiddleware, customerServiceRoutes);
app.use('/api/warehouse', authMiddleware, warehouseRoutes);
app.use('/api/anchor-ops', authMiddleware, anchorOpsRoutes);
app.use('/api/finance', authMiddleware, financeRoutes);
app.use('/api/common', commonRoutes);

app.use(express.static(path.join(__dirname, '../dist')));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ error: err.message || '服务器内部错误' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
========================================
   电商直播售后协同系统已启动
   后端服务端口: ${PORT}
   前端服务: http://localhost:${PORT}
   API文档: http://localhost:${PORT}/api/health
   
   测试账号:
   - 客服: kefu / 123456
   - 仓库: cangku / 123456
   - 主播运营: zhubo / 123456
   - 财务: caiwu / 123456
========================================
  `);
});
