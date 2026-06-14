import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, message, Typography, Row, Col, Statistic, Card, Alert, Tooltip } from 'antd';
import { useNavigate } from 'react-router-dom';
import { FileTextOutlined, CheckCircleOutlined, WarningOutlined, SearchOutlined, ExclamationCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { financeApi } from '../api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const diffTypeColors = {
  amount: 'red',
  channel: 'orange',
  status: 'purple',
  other: 'blue'
};

const diffTypeLabels = {
  amount: '金额差异',
  channel: '渠道差异',
  status: '状态差异',
  other: '其他差异'
};

const diffStatusColors = {
  pending: 'orange',
  resolved: 'green',
  ignored: 'gray'
};

const diffStatusLabels = {
  pending: '待处理',
  resolved: '已解决',
  ignored: '已忽略'
};

function Reconciliation({ user }) {
  const navigate = useNavigate();
  const [reconciliation, setReconciliation] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [recRes, statsRes] = await Promise.all([
        financeApi.getReconciliation(),
        financeApi.getStatistics()
      ]);
      setReconciliation(recRes.data?.list || []);
      setStats(statsRes.data || {});
    } finally {
      setLoading(false);
    }
  };

  const handleCheckDifference = (record) => {
    message.info(`正在检查差异：${record.diff_description}`);
  };

  const handleResolve = (record) => {
    message.success(`差异 ${record.diff_no} 已标记为解决`);
    loadData();
  };

  const handleIgnore = (record) => {
    message.info(`差异 ${record.diff_no} 已忽略`);
    loadData();
  };

  const columns = [
    { title: '差异单号', dataIndex: 'diff_no', width: 140 },
    { title: '关联退款', dataIndex: 'refund_no', width: 140 },
    { title: '售后单号', dataIndex: 'after_sale_no', width: 140 },
    {
      title: '差异类型',
      dataIndex: 'diff_type',
      render: v => <Tag color={diffTypeColors[v]}>{diffTypeLabels[v]}</Tag>
    },
    {
      title: '差异描述',
      dataIndex: 'diff_description',
      ellipsis: true,
      render: (v, r) => (
        <Tooltip title={v}>
          <Space>
            <ExclamationCircleOutlined style={{ color: '#faad14' }} />
            <span>{v}</span>
          </Space>
        </Tooltip>
      )
    },
    {
      title: '系统记录',
      dataIndex: 'expected_amount',
      render: (v, r) => (
        <div>
          <div><Text type="secondary">金额：</Text>¥{v?.toFixed(2)}</div>
          <div><Text type="secondary">渠道：</Text>{r.expected_channel || '-'}</div>
          <div><Text type="secondary">状态：</Text>{r.expected_status || '-'}</div>
        </div>
      )
    },
    {
      title: '第三方记录',
      dataIndex: 'actual_amount',
      render: (v, r) => (
        <div>
          <div><Text type="secondary">金额：</Text>
            <Text style={{ color: v !== r.expected_amount ? '#f5222d' : 'inherit' }}>
              ¥{v?.toFixed(2)}
            </Text>
          </div>
          <div><Text type="secondary">渠道：</Text>
            <Text style={{ color: r.actual_channel !== r.expected_channel ? '#f5222d' : 'inherit' }}>
              {r.actual_channel || '-'}
            </Text>
          </div>
          <div><Text type="secondary">状态：</Text>
            <Text style={{ color: r.actual_status !== r.expected_status ? '#f5222d' : 'inherit' }}>
              {r.actual_status || '-'}
            </Text>
          </div>
        </div>
      )
    },
    {
      title: '差额',
      dataIndex: 'diff_amount',
      render: (v, r) => {
        const diff = (r.actual_amount || 0) - (r.expected_amount || 0);
        return (
          <Text strong style={{ color: diff !== 0 ? '#f5222d' : '#52c41a' }}>
            {diff >= 0 ? '+' : ''}¥{diff.toFixed(2)}
          </Text>
        );
      }
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: v => <Tag color={diffStatusColors[v]}>{diffStatusLabels[v]}</Tag>
    },
    { title: '发现时间', dataIndex: 'created_at', render: v => dayjs(v).format('MM-DD HH:mm') },
    {
      title: '操作',
      render: (_, r) => (
        <Space direction="vertical" size={4}>
          <Button
            type="link"
            size="small"
            icon={<FileTextOutlined />}
            onClick={() => navigate(`/after-sale/${r.after_sale_no}`)}
          >
            查看售后
          </Button>
          {r.status === 'pending' && (
            <>
              <Button
                type="primary"
                size="small"
                icon={<CheckCircleOutlined />}
                onClick={() => handleResolve(r)}
              >
                标记解决
              </Button>
              <Button
                size="small"
                onClick={() => handleIgnore(r)}
              >
                忽略
              </Button>
            </>
          )}
        </Space>
      )
    }
  ];

  return (
    <div>
      <div className="page-header">
        <div className="page-title">对账差异工作台</div>
        <Text type="secondary">处理退款渠道、运费承担、对账差异</Text>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="待对账" value={stats.pendingReconciliation || 0} valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="差异总数"
              value={stats.totalDifferences || 0}
              valueStyle={{ color: '#f5222d' }}
              prefix={<WarningOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="已解决" value={stats.resolvedDifferences || 0} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="差异总金额"
              value={stats.totalDiffAmount || 0}
              valueStyle={{ color: '#fa8c16' }}
              prefix="¥"
              precision={2}
            />
          </Card>
        </Col>
      </Row>

      <div className="rule-hint">
        <strong>对账规则：</strong>
        <div>1. 每日定时对账，比对系统退款记录与第三方支付平台记录</div>
        <div>2. 差异类型包括：金额差异、渠道差异、状态差异等</div>
        <div>3. 发现差异后需要财务人员手动核实处理</div>
      </div>

      <div className="warning-card" style={{ padding: 16, marginBottom: 24, borderRadius: 8 }}>
        <Space>
          <WarningOutlined style={{ color: '#faad14', fontSize: 20 }} />
          <div>
            <Text strong style={{ color: '#d48806' }}>对账差异说明：</Text>
            <div style={{ marginTop: 8 }}>
              系统每天自动比对退款记录与支付宝、微信等第三方支付平台的交易记录，当发现金额、渠道或状态不一致时会创建对账差异记录，需要财务人员核实处理。
            </div>
          </div>
        </Space>
      </div>

      <Space className="table-actions">
        <Button icon={<ReloadOutlined />} onClick={loadData}>手动对账</Button>
        <Button icon={<SearchOutlined />} onClick={loadData}>刷新</Button>
      </Space>

      <Table
        columns={columns}
        dataSource={reconciliation}
        rowKey="diff_no"
        loading={loading}
        pagination={{ pageSize: 10 }}
        expandable={{
          expandedRowRender: (record) => (
            <div style={{ padding: '0 24px' }}>
              <div><Text strong>差异详情：</Text>{record.diff_description}</div>
              <div><Text strong>系统交易流水：</Text>{record.expected_transaction_id || '-'}</div>
              <div><Text strong>第三方流水：</Text>{record.actual_transaction_id || '-'}</div>
              <div><Text strong>系统处理时间：</Text>{record.expected_time ? dayjs(record.expected_time).format('YYYY-MM-DD HH:mm:ss') : '-'}</div>
              <div><Text strong>第三方时间：</Text>{record.actual_time ? dayjs(record.actual_time).format('YYYY-MM-DD HH:mm:ss') : '-'}</div>
              {record.remark && <div><Text strong>备注：</Text>{record.remark}</div>}
            </div>
          )
        }}
      />
    </div>
  );
}

export default Reconciliation;
