const express = require('express');
const { login } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  
  const result = login(username, password);
  if (!result) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  
  res.json(result);
});

router.get('/roles', (req, res) => {
  res.json({
    roles: [
      { key: 'customer_service', name: '客服' },
      { key: 'warehouse', name: '仓库' },
      { key: 'anchor_ops', name: '主播运营' },
      { key: 'finance', name: '财务' }
    ],
    testAccounts: [
      { username: 'kefu', password: '123456', role: 'customer_service', name: '张客服' },
      { username: 'cangku', password: '123456', role: 'warehouse', name: '李仓库' },
      { username: 'zhubo', password: '123456', role: 'anchor_ops', name: '王运营' },
      { username: 'caiwu', password: '123456', role: 'finance', name: '赵财务' }
    ]
  });
});

module.exports = router;
