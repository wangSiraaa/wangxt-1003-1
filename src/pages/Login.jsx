import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Card, message, Select, Typography } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api';

const { Title, Text } = Typography;

const mockUsers = {
  kefu: { password: '123456', user: { id: 1, name: '王丽', role: 'customer_service', username: 'kefu' }, token: 'mock-token-kefu' },
  cangku: { password: '123456', user: { id: 2, name: '张伟', role: 'warehouse', username: 'cangku' }, token: 'mock-token-cangku' },
  zhubo: { password: '123456', user: { id: 3, name: '李娜', role: 'anchor_ops', username: 'zhubo' }, token: 'mock-token-zhubo' },
  caiwu: { password: '123456', user: { id: 4, name: '陈静', role: 'finance', username: 'caiwu' }, token: 'mock-token-caiwu' }
};

const defaultTestAccounts = [
  { username: 'kefu', password: '123456', role: 'customer_service', name: '王丽' },
  { username: 'cangku', password: '123456', role: 'warehouse', name: '张伟' },
  { username: 'zhubo', password: '123456', role: 'anchor_ops', name: '李娜' },
  { username: 'caiwu', password: '123456', role: 'finance', name: '陈静' }
];

function Login({ onLogin }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [testAccounts, setTestAccounts] = useState(defaultTestAccounts);
  const [selectedRole, setSelectedRole] = useState('');

  const roleDefaultRoutes = {
    customer_service: '/customer-service',
    warehouse: '/warehouse',
    anchor_ops: '/product-warning',
    finance: '/refund'
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
      try {
        const u = JSON.parse(userStr);
        const target = roleDefaultRoutes[u.role] || '/dashboard';
        navigate(target, { replace: true });
        onLogin && onLogin(u);
        return;
      } catch (e) {}
    }
    authApi.getRoles().then(res => {
      if (res.data?.testAccounts?.length) {
        setTestAccounts(res.data.testAccounts);
      }
    }).catch(() => {});
  }, [navigate, onLogin]);

  const completeLogin = (user, token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    message.success(`登录成功，欢迎 ${user.name}（${roleLabels[user.role]}）`);
    onLogin && onLogin(user);
    const target = roleDefaultRoutes[user.role] || '/dashboard';
    navigate(target, { replace: true });
  };

  const handleLogin = async (values) => {
    setLoading(true);
    try {
      const res = await authApi.login(values.username, values.password);
      completeLogin(res.data.user, res.data.token);
    } catch (err) {
      const mockUser = mockUsers[values.username];
      if (mockUser && mockUser.password === values.password) {
        message.info('后端服务未启动，使用本地 Mock 账号登录');
        completeLogin(mockUser.user, mockUser.token);
      } else {
        message.error(err.response?.data?.error || '登录失败，请检查用户名和密码');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (account) => {
    setSelectedRole(account.role);
    handleLogin({ username: account.username, password: account.password });
  };

  const roleLabels = {
    customer_service: '客服',
    warehouse: '仓库',
    anchor_ops: '主播运营',
    finance: '财务'
  };

  return (
    <div className="login-container">
      <Card className="login-card">
        <div className="login-title">电商直播售后协同系统</div>

        <div style={{ marginBottom: 24 }}>
          <Text type="secondary">快速登录（测试账号）</Text>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {testAccounts.map((account, idx) => (
              <Button
                key={idx}
                size="small"
                type={selectedRole === account.role ? 'primary' : 'default'}
                onClick={() => handleQuickLogin(account)}
              >
                {roleLabels[account.role]} - {account.name || account.username}
              </Button>
            ))}
          </div>
        </div>

        <Form
          onFinish={handleLogin}
          initialValues={{ username: 'kefu', password: '123456' }}
          layout="vertical"
        >
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="请输入用户名" size="large" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" size="large" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block size="large">
              登录
            </Button>
          </Form.Item>
        </Form>

        <div style={{ marginTop: 16, padding: 12, background: '#f5f5f5', borderRadius: 6, fontSize: 12 }}>
          <Text type="secondary">
            测试账号：kefu（王丽·客服）/ cangku（张伟·仓库）/ zhubo（李娜·主播运营）/ caiwu（陈静·财务），密码均为 123456
          </Text>
        </div>
      </Card>
    </div>
  );
}

export default Login;
