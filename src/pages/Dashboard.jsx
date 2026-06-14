import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Table, Statistic, Tag, Space, Button, Typography, Timeline } from 'antd';
import { useNavigate } from 'react-router-dom';
import { commonApi, customerServiceApi, warehouseApi, financeApi, anchorOpsApi } from '../api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const statusColors = {
  pending_review: 'orange',
  cs_reviewed: 'blue',
  cs_rejected: 'red',
  inventory_pending: 'cyan',
  inventory_received: 'purple',
  qc_pass: 'green',
  qc_rejected: 'red',
  refund_pending: 'orange',
  refund_processing: 'blue',
  refund_completed: 'green',
  refund_failed: 'red',
  refund_hung: 'orange',
  returned_to_customer: 'red',
  completed: 'green',
  cancelled: 'default'
};

const statusLabels = {
  pending_review: '待客服审核',
  cs_reviewed: '客服已审核',
  cs_rejected: '客服驳回',
  inventory_pending: '待入库',
  inventory_received: '已入库',
  qc_pass: '质检通过',
  qc_rejected: '质检拒收',
  refund_pending: '待退款',
  refund_processing: '退款处理中',
  refund_completed: '退款完成',
  refund_failed: '退款失败',
  refund_hung: '退款挂账',
  returned_to_customer: '退回客户',
  completed: '已完成',
  cancelled: '已取消'
};

function Dashboard({ user }) {
  const navigate = useNavigate();
  const [stats, setStats] = useState({});
  const [recentAfterSales, setRecentAfterSales] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, [user.role]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const [statsRes, asRes, auditRes] = await Promise.all([
        commonApi.getDashboardStats(),
        customerServiceApi.getAfterSales({ limit: 10 }),
        commonApi.getAuditLogs({ limit: 10 })
      ]);
      setStats(statsRes.data || {});
      setRecentAfterSales(asRes.data?.list || []);
      setAuditLogs(auditRes.data?.list || []);
    } catch (err) {
      console.error('加载仪表盘失败', err);
    } finally {
      setLoading(false);
    }
  };

  const roleColors = {
    customer_service: '#1890ff',
    warehouse: '#52c41a',
    anchor_ops: '#722ed1',
    finance: '#fa8c16'
  };

  const actionLabels = {
    login: '登录',
    create_after_sale: '创建售后',
    review_after_sale: '审核售后',
    receive_inventory: '登记入库',
    qc_inventory: '质检',
    initiate_refund: '发起退款',
    confirm_refund: '确认退款',
    fail_refund: '退款失败',
    hang_refund: '挂账处理',
    attribute_responsibility: '责任归因',
    batch_recall: '批量召回',
    trigger_removal: '触发下架提醒'
  };

  const statCards = [
    { label: '今日售后', value: stats.todayAfterSales || 0, color: '#1890ff', path: '/customer-service', role: 'customer_service' },
    { label: '待入库', value: stats.pendingInventory || 0, color: '#52c41a', path: '/warehouse', role: 'warehouse' },
    { label: '待退款', value: stats.pendingRefunds || 0, color: '#fa8c16', path: '/refund', role: 'finance' },
    { label: '问题商品预警', value: stats.warningProducts || 0, color: '#f5222d', path: '/product-warning', role: 'anchor_ops' }
  ].filter(s => !s.role || s.role === user.role || true);

  const asColumns = [
    { title: '售后单号', dataIndex: 'after_sale_no', width: 140 },
    { title: '关联订单', dataIndex: 'order_no', width: 140 },
    { title: '售后类型', dataIndex: 'after_sale_type', render: v => v === 'return' ? '退货退款' : v === 'exchange' ? '换货' : '仅退款' },
    { title: '状态', dataIndex: 'status', render: v => <Tag color={statusColors[v]}>{statusLabels[v]}</Tag> },
    { title: '申请时间', dataIndex: 'created_at', render: v => dayjs(v).format('MM-DD HH:mm') },
    {
      title: '操作',
      render: (_, r) => (
        <Button type="link" size="small" onClick={() => navigate(`/after-sale/${r.after_sale_no}`)}>
          详情
        </Button>
      )
    }
  ];

  return (
    <div>
      <div className="page-header">
        <div className="page-title">总览仪表盘</div>
        <Text type="secondary">实时监控各环节协同进度与关键指标</Text>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        {statCards.map((s, i) => (
          <Col xs={12} sm={6} key={i}>
            <Card hoverable onClick={() => s.path && navigate(s.path)} style={{ cursor: s.path ? 'pointer' : 'default' }}>
              <Statistic
                title={s.label}
                value={s.value}
                valueStyle={{ color: s.color }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={16}>
        <Col xs={24} lg={16}>
          <Card title="最近售后单" style={{ marginBottom: 24 }}>
            <Table
              size="small"
              dataSource={recentAfterSales}
              columns={asColumns}
              rowKey="after_sale_no"
              pagination={false}
              loading={loading}
            />
          </Card>

          <Card title="业务流程说明" className="info-card">
            <div className="process-flow" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
              <div className="process-step done">客服创建售后</div>
              <div className="process-arrow">→</div>
              <div className="process-step done">客服审核售后期</div>
              <div className="process-arrow">→</div>
              <div className="process-step active">仓库登记入库</div>
              <div className="process-arrow">→</div>
              <div className="process-step">质检</div>
              <div className="process-arrow">→</div>
              <div className="process-step">财务退款</div>
              <div className="process-arrow">→</div>
              <div className="process-step">完成</div>
            </div>
            <div className="rule-hint">
              <strong>核心业务规则：</strong>
              <div>1. 超过售后期的订单，客服无法创建售后申请</div>
              <div>2. 退货未完成入库，财务无法发起退款</div>
              <div>3. 质检拒收的商品，需退回客户重新处理</div>
              <div>4. 问题商品数量超阈值，自动触发下架提醒</div>
              <div>5. 退款失败可选择挂账，后续再重试</div>
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="最近操作日志" style={{ marginBottom: 24 }}>
            <Timeline className="timeline-custom" size="small">
              {auditLogs.slice(0, 8).map((log, i) => (
                <Timeline.Item key={i} color={roleColors[log.operator_role] || 'blue'}>
                  <Space direction="vertical" size={0}>
                    <Space>
                      <Tag color={roleColors[log.operator_role] || 'blue'} size="small">
                        {log.operator_name}
                      </Tag>
                      <Text strong>{actionLabels[log.action] || log.action}</Text>
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {log.target_type} {log.target_id} · {dayjs(log.created_at).format('HH:mm:ss')}
                    </Text>
                    {log.ip && <Text type="secondary" style={{ fontSize: 11 }}>IP: {log.ip}</Text>}
                  </Space>
                </Timeline.Item>
              ))}
              {auditLogs.length === 0 && <Text type="secondary">暂无操作记录</Text>}
            </Timeline>
          </Card>

          <Card title="当前角色权限" style={{ marginBottom: 24 }}>
            <Space direction="vertical" size="small">
              <Tag color={roleColors[user.role]} style={{ fontSize: 14, padding: '4px 12px' }}>
                {user.name} · {user.role === 'customer_service' ? '客服' : user.role === 'warehouse' ? '仓库' : user.role === 'anchor_ops' ? '主播运营' : '财务'}
              </Tag>
              <Text type="secondary">
                {user.role === 'customer_service' && '创建售后申请、审核售后期、修改售后信息'}
                {user.role === 'warehouse' && '登记退货入库、质检商品、退回拒收商品'}
                {user.role === 'anchor_ops' && '查看问题商品、批量召回、责任归因、下架提醒'}
                {user.role === 'finance' && '处理退款渠道、运费承担、对账差异、退款挂账'}
              </Text>
            </Space>
          </Card>

          <Card title="入库状态对退款的限制" className="warning-card">
            <div style={{ fontSize: 13, lineHeight: 1.8 }}>
              <div>✅ 已入库 → 可以发起退款</div>
              <div>❌ 待入库 → 禁止发起退款</div>
              <div>❌ 质检拒收 → 禁止发起退款，需退回客户</div>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default Dashboard;
