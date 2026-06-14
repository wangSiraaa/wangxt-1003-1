import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, message, Typography, Row, Col, Statistic, Card, List, Timeline, Tooltip, Descriptions } from 'antd';
import { useNavigate } from 'react-router-dom';
import { VideoCameraOutlined, ShoppingCartOutlined, DollarOutlined, SearchOutlined, EyeOutlined } from '@ant-design/icons';
import { anchorOpsApi } from '../api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const sessionStatusColors = {
  upcoming: 'blue',
  live: 'green',
  completed: 'gray'
};

const sessionStatusLabels = {
  upcoming: '即将开播',
  live: '直播中',
  completed: '已结束'
};

function AnchorSessions({ user }) {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sessionsRes, statsRes] = await Promise.all([
        anchorOpsApi.getSessions(),
        anchorOpsApi.getDashboard()
      ]);
      setSessions(sessionsRes.data?.list || []);
      setStats(statsRes.data || {});
    } finally {
      setLoading(false);
    }
  };

  const handleViewSession = async (session) => {
    try {
      const res = await anchorOpsApi.getSessionDetail(session.id);
      setSelectedSession(res.data);
    } catch (err) {
      message.error('加载场次详情失败');
    }
  };

  const columns = [
    { title: '场次ID', dataIndex: 'session_id', width: 120 },
    { title: '场次名称', dataIndex: 'session_name' },
    { title: '主播', dataIndex: 'anchor_name' },
    {
      title: '状态',
      dataIndex: 'status',
      render: v => <Tag color={sessionStatusColors[v]}>{sessionStatusLabels[v]}</Tag>
    },
    { title: '开播时间', dataIndex: 'start_time', render: v => dayjs(v).format('YYYY-MM-DD HH:mm') },
    { title: '预计结束', dataIndex: 'end_time', render: v => dayjs(v).format('HH:mm') },
    { title: '销售件数', dataIndex: 'total_sales', render: v => v || 0 },
    { title: '销售额', dataIndex: 'total_amount', render: v => `¥${(v || 0).toFixed(2)}` },
    {
      title: '售后问题',
      dataIndex: 'issue_count',
      render: (v, r) => (
        <Tooltip title={`问题率: ${r.issue_rate || 0}%`}>
          <Tag color={v > 3 ? 'red' : v > 0 ? 'orange' : 'green'}>
            {v || 0} 件
          </Tag>
        </Tooltip>
      )
    },
    {
      title: '操作',
      render: (_, r) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleViewSession(r)}>
          详情
        </Button>
      )
    }
  ];

  return (
    <div>
      <div className="page-header">
        <div className="page-title">主播场次追踪</div>
        <Text type="secondary">追踪各主播场次销售和售后情况，识别问题场次</Text>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="今日场次"
              value={stats.todaySessions || 0}
              valueStyle={{ color: '#722ed1' }}
              prefix={<VideoCameraOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="直播中"
              value={stats.liveSessions || 0}
              valueStyle={{ color: '#52c41a' }}
              prefix={<VideoCameraOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="总销售件数"
              value={stats.totalSessionSales || 0}
              valueStyle={{ color: '#1890ff' }}
              prefix={<ShoppingCartOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="总销售额"
              value={stats.totalSessionAmount || 0}
              valueStyle={{ color: '#fa8c16' }}
              precision={2}
              prefix="¥"
            />
          </Card>
        </Col>
      </Row>

      <div className="info-card" style={{ padding: 16, marginBottom: 24, borderRadius: 8 }}>
        <Space>
          <VideoCameraOutlined style={{ color: '#1890ff', fontSize: 20 }} />
          <div>
            <Text strong>场次追踪说明：</Text>
            <div style={{ marginTop: 8 }}>
              追踪每个主播场次的销售数据和售后问题，售后问题率高的场次需要重点关注，可能存在商品质量或主播宣传问题。
            </div>
          </div>
        </Space>
      </div>

      <Space className="table-actions">
        <Button icon={<SearchOutlined />} onClick={loadData}>刷新</Button>
      </Space>

      {selectedSession ? (
        <div style={{ marginBottom: 24 }}>
          <Card
            title={`场次详情：${selectedSession.session_name}`}
            extra={<Button onClick={() => setSelectedSession(null)}>返回列表</Button>}
          >
            <Row gutter={24}>
              <Col xs={24} md={12}>
                <div className="detail-section">
                  <div className="detail-section-title">基本信息</div>
                  <Descriptions column={1} size="small" bordered>
                    <Descriptions.Item label="场次ID">{selectedSession.session_id}</Descriptions.Item>
                    <Descriptions.Item label="场次名称">{selectedSession.session_name}</Descriptions.Item>
                    <Descriptions.Item label="主播">{selectedSession.anchor_name}</Descriptions.Item>
                    <Descriptions.Item label="状态">
                      <Tag color={sessionStatusColors[selectedSession.status]}>
                        {sessionStatusLabels[selectedSession.status]}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="开播时间">{dayjs(selectedSession.start_time).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
                    <Descriptions.Item label="结束时间">{dayjs(selectedSession.end_time).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
                  </Descriptions>
                </div>
              </Col>
              <Col xs={24} md={12}>
                <div className="detail-section">
                  <div className="detail-section-title">销售数据</div>
                  <Row gutter={16}>
                    <Col span={8}>
                      <Card className="stats-card" size="small">
                        <Statistic title="销售件数" value={selectedSession.total_sales || 0} />
                      </Card>
                    </Col>
                    <Col span={8}>
                      <Card className="stats-card" size="small">
                        <Statistic title="销售额" value={selectedSession.total_amount || 0} prefix="¥" precision={2} />
                      </Card>
                    </Col>
                    <Col span={8}>
                      <Card className="stats-card" size="small">
                        <Statistic
                          title="售后问题"
                          value={selectedSession.issue_count || 0}
                          valueStyle={{ color: (selectedSession.issue_count || 0) > 3 ? '#f5222d' : '#fa8c16' }}
                        />
                      </Card>
                    </Col>
                  </Row>
                  <div style={{ marginTop: 16 }}>
                    <Text type="secondary">问题率：</Text>
                    <Text strong style={{ color: (selectedSession.issue_rate || 0) > 5 ? '#f5222d' : '#52c41a', fontSize: 16 }}>
                      {selectedSession.issue_rate || 0}%
                    </Text>
                    {(selectedSession.issue_rate || 0) > 5 && (
                      <Tag color="red" style={{ marginLeft: 8 }}>高风险场次</Tag>
                    )}
                  </div>
                </div>
              </Col>
            </Row>

            <div className="detail-section">
              <div className="detail-section-title">本场次售后问题商品</div>
              <Table
                size="small"
                dataSource={selectedSession.issue_products || []}
                columns={[
                  { title: '商品ID', dataIndex: 'product_id', width: 100 },
                  { title: '商品名称', dataIndex: 'product_name' },
                  { title: '销售数量', dataIndex: 'sales_count' },
                  { title: '问题数量', dataIndex: 'issue_count' },
                  {
                    title: '问题率',
                    dataIndex: 'issue_rate',
                    render: v => `${v}%`
                  },
                  {
                    title: '责任归因',
                    dataIndex: 'responsibility',
                    render: v => v ? (
                      <Tag color={v === 'product' ? 'orange' : v === 'anchor' ? 'purple' : 'blue'}>
                        {v === 'product' ? '商品质量' : v === 'anchor' ? '主播宣传' : v === 'warehouse' ? '仓储' : v === 'logistics' ? '物流' : v === 'customer' ? '客户' : '平台'}
                      </Tag>
                    ) : '-'
                  },
                  {
                    title: '操作',
                    render: (_, r) => (
                      <Button type="link" size="small" onClick={() => navigate(`/after-sale/${r.last_after_sale_no}`)}>
                        查看售后
                      </Button>
                    )
                  }
                ]}
                rowKey="product_id"
                pagination={false}
              />
            </div>

            {selectedSession.timeline && (
              <div className="detail-section">
                <div className="detail-section-title">场次时间线</div>
                <Timeline className="timeline-custom">
                  {selectedSession.timeline.map((item, i) => (
                    <Timeline.Item key={i} color={item.color}>
                      <Space direction="vertical" size={0}>
                        <Text strong>{item.title}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {dayjs(item.time).format('YYYY-MM-DD HH:mm')}
                        </Text>
                        {item.description && <Text type="secondary">{item.description}</Text>}
                      </Space>
                    </Timeline.Item>
                  ))}
                </Timeline>
              </div>
            )}
          </Card>
        </div>
      ) : null}

      <Table
        columns={columns}
        dataSource={sessions}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />
    </div>
  );
}

export default AnchorSessions;
