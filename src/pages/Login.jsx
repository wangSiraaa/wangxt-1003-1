import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Card, message, Select, Typography } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { authApi } from '../api';

const { Title, Text } = Typography;

function Login({ onLogin }) {
  const [loading, setLoading] = useState(false);
  const [testAccounts, setTestAccounts] = useState([]);
  const [selectedRole, setSelectedRole] = useState('');

  useEffect(() => {
    authApi.getRoles().then(res => {
      setTestAccounts(res.data.testAccounts || []);
    }).catch(() => {});
  }, []);

  const handleLogin = async (values) => {
    setLoading(true);
    try {
      const res = await authApi.login(values.username, values.password);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      message.success('登录成功');
      onLogin && onLogin(res.data.user);
    } catch (err) {
      message.error(err.response?.data?.error || '登录失败');
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
                {roleLabels[account.role]}
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
            rules={[{ required: true, message: '请输入用户名' }}
          >
            <Input prefix={<UserOutlined />} placeholder="请输入用户名" size="large" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }}
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
            测试账号：kefu/cangku/zhubo/caiwu，密码均为 123456
          </Text>
        </div>
      </Card>
    </div>
  );
}

export default Login;
