import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Layout, Menu, Dropdown, Avatar, Button, Tag } from 'antd';
import {
  UserOutlined,
  DashboardOutlined,
  ShoppingCartOutlined,
  InboxOutlined,
  DollarOutlined,
  WarningOutlined,
  VideoCameraOutlined,
  FileTextOutlined,
  LogoutOutlined
} from '@ant-design/icons';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CustomerService from './pages/CustomerService';
import Warehouse from './pages/Warehouse';
import Refund from './pages/Refund';
import ProductWarning from './pages/ProductWarning';
import AnchorSessions from './pages/AnchorSessions';
import Reconciliation from './pages/Reconciliation';
import AfterSaleDetail from './pages/AfterSaleDetail';

const { Header, Sider, Content } = Layout;

const roleMenus = {
  customer_service: [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '总览' },
    { key: '/customer-service', icon: <ShoppingCartOutlined />, label: '客服工作台' }
  ],
  warehouse: [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '总览' },
    { key: '/warehouse', icon: <InboxOutlined />, label: '仓库验收' }
  ],
  anchor_ops: [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '总览' },
    { key: '/product-warning', icon: <WarningOutlined />, label: '商品预警' },
    { key: '/anchor-sessions', icon: <VideoCameraOutlined />, label: '主播场次追踪' }
  ],
  finance: [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '总览' },
    { key: '/refund', icon: <DollarOutlined />, label: '退款处理' },
    { key: '/reconciliation', icon: <FileTextOutlined />, label: '对账差异' }
  ]
};

const roleNames = {
  customer_service: '客服',
  warehouse: '仓库',
  anchor_ops: '主播运营',
  finance: '财务'
};

function AppContent() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  const getDefaultRoute = (role) => {
    const defaults = {
      customer_service: '/customer-service',
      warehouse: '/warehouse',
      anchor_ops: '/product-warning',
      finance: '/refund'
    };
    return defaults[role] || '/dashboard';
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
      const parsedUser = JSON.parse(userStr);
      setUser(parsedUser);
      if (window.location.pathname === '/login') {
        navigate(getDefaultRoute(parsedUser.role), { replace: true });
      }
    } else if (window.location.pathname !== '/login') {
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  const handleLogin = (u) => {
    setUser(u);
    navigate(getDefaultRoute(u.role), { replace: true });
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    navigate('/login', { replace: true });
  };

  if (!user) {
    return <Routes><Route path="/login" element={<Login onLogin={handleLogin} />} /><Route path="*" element={<Navigate to="/login" replace />} /></Routes>;
  }

  const menuItems = roleMenus[user.role] || [];

  const userMenu = {
    items: [
      { key: 'role', label: <span>角色：<Tag color="blue">{roleNames[user.role]}</Tag></span> },
      { type: 'divider' },
      { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: handleLogout }
    ]
  };

  return (
    <Layout className="main-layout" style={{ minHeight: '100vh' }}>
      <Sider className="sider" collapsible collapsed={collapsed} onCollapse={setCollapsed}>
        <div className="logo">售后协同</div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[window.location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>电商直播售后协同系统</div>
          <Dropdown menu={userMenu}>
            <Button type="text" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar icon={<UserOutlined />} />
              <span>{user.name}</span>
              <Tag color="blue">{roleNames[user.role]}</Tag>
            </Button>
          </Dropdown>
        </Header>
        <Content style={{ background: '#f0f2f5' }}>
          <div className="content-wrapper">
            <Routes>
              <Route path="/login" element={<Navigate to={getDefaultRoute(user.role)} replace />} />
              <Route path="/dashboard" element={<Dashboard user={user} />} />
              <Route path="/customer-service" element={<CustomerService user={user} />} />
              <Route path="/warehouse" element={<Warehouse user={user} />} />
              <Route path="/refund" element={<Refund user={user} />} />
              <Route path="/product-warning" element={<ProductWarning user={user} />} />
              <Route path="/anchor-sessions" element={<AnchorSessions user={user} />} />
              <Route path="/reconciliation" element={<Reconciliation user={user} />} />
              <Route path="/after-sale/:afterSaleNo" element={<AfterSaleDetail user={user} />} />
              <Route path="*" element={<Navigate to={getDefaultRoute(user.role)} replace />} />
            </Routes>
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}

function App() {
  return (
    <div className="app-container">
      <AppContent />
    </div>
  );
}

export default App;
