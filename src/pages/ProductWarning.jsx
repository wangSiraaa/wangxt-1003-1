import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, Tag, message, Typography, Row, Col, Statistic, Card, Alert, Progress, Checkbox, Tooltip } from 'antd';
import { useNavigate } from 'react-router-dom';
import { WarningOutlined, DownloadOutlined, FlagOutlined, SearchOutlined, ExclamationCircleOutlined, UserOutlined } from '@ant-design/icons';
import { anchorOpsApi, commonApi } from '../api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const severityColors = {
  low: 'green',
  medium: 'orange',
  high: 'red'
};

const severityLabels = {
  low: '低风险',
  medium: '中风险',
  high: '高风险'
};

const responsibilityLabels = {
  product: '商品质量',
  warehouse: '仓库管理',
  logistics: '物流运输',
  anchor: '主播宣传',
  customer: '客户使用',
  platform: '平台责任'
};

function ProductWarning({ user }) {
  const navigate = useNavigate();
  const [productStats, setProductStats] = useState([]);
  const [removalReminders, setRemovalReminders] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recallModalVisible, setRecallModalVisible] = useState(false);
  const [attributeModalVisible, setAttributeModalVisible] = useState(false);
  const [removalModalVisible, setRemovalModalVisible] = useState(false);
  const [handleRemovalModalVisible, setHandleRemovalModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedAfterSale, setSelectedAfterSale] = useState(null);
  const [selectedReminder, setSelectedReminder] = useState(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [recallForm] = Form.useForm();
  const [attributeForm] = Form.useForm();
  const [removalForm] = Form.useForm();
  const [handleRemovalForm] = Form.useForm();
  const [stats, setStats] = useState({});
  const [activeTab, setActiveTab] = useState('stats');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, productsRes, remindersRes, allProducts] = await Promise.all([
        anchorOpsApi.getDashboard(),
        anchorOpsApi.getProductStats(),
        anchorOpsApi.getRemovalReminders(),
        commonApi.getProducts()
      ]);
      setProductStats(productsRes.data?.list || []);
      setRemovalReminders(remindersRes.data?.list || []);
      setProducts(allProducts.data?.list || []);
      setStats(statsRes.data || {});
    } finally {
      setLoading(false);
    }
  };

  const getSeverity = (count, threshold) => {
    const ratio = count / threshold;
    if (ratio >= 1) return 'high';
    if (ratio >= 0.7) return 'medium';
    return 'low';
  };

  const handleBatchRecall = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要召回的商品');
      return;
    }
    const selectedProducts = productStats.filter(p => selectedRowKeys.includes(p.product_id));
    recallForm.setFieldsValue({
      product_ids: selectedRowKeys,
      product_names: selectedProducts.map(p => p.product_name).join('、'),
      reason: ''
    });
    setRecallModalVisible(true);
  };

  const handleSubmitRecall = async (values) => {
    try {
      await anchorOpsApi.batchRecall(values);
      message.success(`已批量召回 ${selectedRowKeys.length} 个商品`);
      setRecallModalVisible(false);
      recallForm.resetFields();
      setSelectedRowKeys([]);
      loadData();
    } catch (err) {
      message.error(err.response?.data?.error || '批量召回失败');
    }
  };

  const handleAttribute = (afterSale) => {
    setSelectedAfterSale(afterSale);
    attributeForm.setFieldsValue({
      after_sale_no: afterSale.after_sale_no,
      responsibility: '',
      description: ''
    });
    setAttributeModalVisible(true);
  };

  const handleSubmitAttribute = async (values) => {
    try {
      await anchorOpsApi.attributeResponsibility(selectedAfterSale.after_sale_no, values);
      message.success('责任归因完成');
      setAttributeModalVisible(false);
      attributeForm.resetFields();
      loadData();
    } catch (err) {
      message.error(err.response?.data?.error || '归因失败');
    }
  };

  const handleTriggerRemoval = (product) => {
    setSelectedProduct(product);
    removalForm.setFieldsValue({
      product_id: product.product_id,
      product_name: product.product_name,
      reason: `问题商品数量已达阈值（${product.issue_count}/${product.threshold}）`,
      severity: getSeverity(product.issue_count, product.threshold)
    });
    setRemovalModalVisible(true);
  };

  const handleSubmitRemoval = async (values) => {
    try {
      await anchorOpsApi.triggerRemoval(selectedProduct.product_id, values);
      message.success('下架提醒已触发');
      setRemovalModalVisible(false);
      removalForm.resetFields();
      loadData();
    } catch (err) {
      message.error(err.response?.data?.error || '触发失败');
    }
  };

  const handleHandleRemoval = (reminder) => {
    setSelectedReminder(reminder);
    handleRemovalForm.setFieldsValue({
      reminder_no: reminder.reminder_no,
      handle_result: '',
      handle_remark: ''
    });
    setHandleRemovalModalVisible(true);
  };

  const handleSubmitHandleRemoval = async (values) => {
    try {
      await anchorOpsApi.handleRemovalReminder(selectedReminder.reminder_no, values);
      message.success('下架提醒已处理');
      setHandleRemovalModalVisible(false);
      handleRemovalForm.resetFields();
      loadData();
    } catch (err) {
      message.error(err.response?.data?.error || '处理失败');
    }
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys)
  };

  const statsColumns = [
    { title: '商品ID', dataIndex: 'product_id', width: 100 },
    { title: '商品名称', dataIndex: 'product_name' },
    {
      title: '问题数量',
      dataIndex: 'issue_count',
      render: (v, r) => (
        <Space>
          <Text strong style={{ color: v >= r.threshold ? '#f5222d' : '#fa8c16' }}>{v}</Text>
          <Text type="secondary">/ {r.threshold}</Text>
        </Space>
      )
    },
    {
      title: '风险等级',
      dataIndex: 'issue_count',
      render: (v, r) => {
        const severity = getSeverity(v, r.threshold);
        return <Tag color={severityColors[severity]}>{severityLabels[severity]}</Tag>;
      }
    },
    {
      title: '阈值进度',
      dataIndex: 'issue_count',
      width: 200,
      render: (v, r) => {
        const percent = Math.min(100, Math.round((v / r.threshold) * 100));
        const status = percent >= 100 ? 'exception' : percent >= 70 ? 'active' : 'normal';
        return <Progress percent={percent} status={status} size="small" />;
      }
    },
    { title: '主播场次', dataIndex: 'session_name' },
    { title: '主播', dataIndex: 'anchor_name' },
    { title: '最近问题', dataIndex: 'last_issue_at', render: v => v ? dayjs(v).format('MM-DD HH:mm') : '-' },
    {
      title: '操作',
      render: (_, r) => (
        <Space>
          <Tooltip title="查看售后单详情">
            <Button type="link" size="small" onClick={() => navigate(`/after-sale/${r.last_after_sale_no}`)}>
              详情
            </Button>
          </Tooltip>
          <Tooltip title="责任归因">
            <Button
              size="small"
              icon={<UserOutlined />}
              onClick={() => handleAttribute({ after_sale_no: r.last_after_sale_no })}
            >
              归因
            </Button>
          </Tooltip>
          <Tooltip title="触发下架提醒">
            <Button
              danger
              size="small"
              icon={<FlagOutlined />}
              onClick={() => handleTriggerRemoval(r)}
            >
              下架提醒
            </Button>
          </Tooltip>
        </Space>
      )
    }
  ];

  const reminderColumns = [
    { title: '提醒单号', dataIndex: 'reminder_no', width: 140 },
    { title: '商品', dataIndex: 'product_name' },
    {
      title: '严重程度',
      dataIndex: 'severity',
      render: v => <Tag color={severityColors[v]}>{severityLabels[v]}</Tag>
    },
    { title: '原因', dataIndex: 'reason' },
    {
      title: '状态',
      dataIndex: 'status',
      render: v => v === 'pending' ? <Tag color="orange">待处理</Tag> : <Tag color="green">已处理</Tag>
    },
    { title: '触发时间', dataIndex: 'created_at', render: v => dayjs(v).format('MM-DD HH:mm') },
    {
      title: '操作',
      render: (_, r) => (
        <Space>
          {r.status === 'pending' && (
            <Button type="primary" size="small" onClick={() => handleHandleRemoval(r)}>
              处理
            </Button>
          )}
          <Button type="link" size="small" onClick={() => navigate(`/after-sale/${r.after_sale_no}`)}>
            查看售后
          </Button>
        </Space>
      )
    }
  ];

  return (
    <div>
      <div className="page-header">
        <div className="page-title">商品预警工作台</div>
        <Text type="secondary">查看问题商品阈值、批量召回、责任归因、下架提醒</Text>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="问题商品总数" value={stats.totalIssueProducts || 0} valueStyle={{ color: '#fa8c16' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="超阈值商品" value={stats.overThresholdProducts || 0} valueStyle={{ color: '#f5222d' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="待处理下架提醒" value={stats.pendingRemovalReminders || 0} valueStyle={{ color: '#722ed1' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="本月已召回" value={stats.thisMonthRecalled || 0} valueStyle={{ color: '#13c2c2' }} />
          </Card>
        </Col>
      </Row>

      <div className="rule-hint">
        <strong>商品规则：</strong>
        <div>1. 问题商品数量超过阈值时，自动触发下架提醒</div>
        <div>2. 责任归因后自动更新问题商品统计</div>
        <div>3. 批量召回可选择多个商品统一处理</div>
      </div>

      <div className="warning-card" style={{ padding: 16, marginBottom: 24, borderRadius: 8 }}>
        <Space>
          <ExclamationCircleOutlined style={{ color: '#faad14', fontSize: 20 }} />
          <div>
            <Text strong style={{ color: '#d48806' }}>阈值提醒说明：</Text>
            <div style={{ marginTop: 8 }}>
              每个商品都有问题数量阈值，当售后问题数量达到阈值的70%时显示橙色预警，达到或超过阈值时显示红色预警并可触发下架提醒。
            </div>
          </div>
        </Space>
      </div>

      <Space className="table-actions">
        <Button.Group>
          <Button type={activeTab === 'stats' ? 'primary' : 'default'} onClick={() => setActiveTab('stats')}>
            问题商品统计
          </Button>
          <Button type={activeTab === 'reminders' ? 'primary' : 'default'} onClick={() => setActiveTab('reminders')}>
            下架提醒
          </Button>
        </Button.Group>
        {activeTab === 'stats' && (
          <Button
            type="primary"
            danger
            icon={<DownloadOutlined />}
            onClick={handleBatchRecall}
            disabled={selectedRowKeys.length === 0}
          >
            批量召回 ({selectedRowKeys.length})
          </Button>
        )}
        <Button icon={<SearchOutlined />} onClick={loadData}>刷新</Button>
      </Space>

      {activeTab === 'stats' ? (
        <Table
          rowSelection={rowSelection}
          columns={statsColumns}
          dataSource={productStats}
          rowKey="product_id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      ) : (
        <Table
          columns={reminderColumns}
          dataSource={removalReminders}
          rowKey="reminder_no"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      )}

      <Modal
        title="批量召回商品"
        open={recallModalVisible}
        onCancel={() => setRecallModalVisible(false)}
        footer={null}
        width={600}
      >
        <Alert
          message={`将召回 ${selectedRowKeys.length} 个商品`}
          description="批量召回后，这些商品将从直播间下架，并通知相关主播和运营人员。"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form form={recallForm} layout="vertical" onFinish={handleSubmitRecall}>
          <Form.Item label="召回商品" name="product_names">
            <Input.TextArea rows={2} disabled />
          </Form.Item>
          <Form.Item label="召回商品ID" name="product_ids">
            <Input.TextArea rows={1} disabled />
          </Form.Item>
          <Form.Item
            label="召回原因"
            name="reason"
            rules={[{ required: true, message: '请填写召回原因' }]}
          >
            <TextArea rows={3} placeholder="请详细描述召回原因" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ float: 'right' }}>
              <Button onClick={() => setRecallModalVisible(false)}>取消</Button>
              <Button danger type="primary" htmlType="submit">确认召回</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="责任归因"
        open={attributeModalVisible}
        onCancel={() => setAttributeModalVisible(false)}
        footer={null}
      >
        <Form form={attributeForm} layout="vertical" onFinish={handleSubmitAttribute}>
          <Form.Item label="售后单号" name="after_sale_no">
            <Input disabled />
          </Form.Item>
          <Form.Item
            label="责任归属"
            name="responsibility"
            rules={[{ required: true, message: '请选择责任归属' }]}
          >
            <Select>
              <Option value="product">商品质量问题</Option>
              <Option value="warehouse">仓库管理问题</Option>
              <Option value="logistics">物流运输问题</Option>
              <Option value="anchor">主播宣传问题</Option>
              <Option value="customer">客户使用问题</Option>
              <Option value="platform">平台责任问题</Option>
            </Select>
          </Form.Item>
          <Form.Item
            label="归因说明"
            name="description"
            rules={[{ required: true, message: '请填写归因说明' }]}
          >
            <TextArea rows={3} placeholder="请详细说明责任归因的依据" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ float: 'right' }}>
              <Button onClick={() => setAttributeModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit">确认归因</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="触发下架提醒"
        open={removalModalVisible}
        onCancel={() => setRemovalModalVisible(false)}
        footer={null}
      >
        <Alert
          message="下架提醒将通知所有相关人员"
          description="触发下架提醒后，运营、主播、客服都将收到通知，请谨慎操作。"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form form={removalForm} layout="vertical" onFinish={handleSubmitRemoval}>
          <Form.Item label="商品名称" name="product_name">
            <Input disabled />
          </Form.Item>
          <Form.Item
            label="严重程度"
            name="severity"
            rules={[{ required: true, message: '请选择严重程度' }]}
          >
            <Select>
              <Option value="low">低风险</Option>
              <Option value="medium">中风险</Option>
              <Option value="high">高风险</Option>
            </Select>
          </Form.Item>
          <Form.Item
            label="下架原因"
            name="reason"
            rules={[{ required: true, message: '请填写下架原因' }]}
          >
            <TextArea rows={3} placeholder="请详细描述下架原因" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ float: 'right' }}>
              <Button onClick={() => setRemovalModalVisible(false)}>取消</Button>
              <Button danger type="primary" htmlType="submit">确认触发</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="处理下架提醒"
        open={handleRemovalModalVisible}
        onCancel={() => setHandleRemovalModalVisible(false)}
        footer={null}
      >
        <Form form={handleRemovalForm} layout="vertical" onFinish={handleSubmitHandleRemoval}>
          <Form.Item label="提醒单号" name="reminder_no">
            <Input disabled />
          </Form.Item>
          <Form.Item
            label="处理结果"
            name="handle_result"
            rules={[{ required: true, message: '请选择处理结果' }]}
          >
            <Select>
              <Option value="removed">已下架</Option>
              <Option value="ignored">忽略，继续销售</Option>
              <Option value="improved">已改进，继续销售</Option>
            </Select>
          </Form.Item>
          <Form.Item
            label="处理说明"
            name="handle_remark"
            rules={[{ required: true, message: '请填写处理说明' }]}
          >
            <TextArea rows={3} placeholder="请详细描述处理过程和结果" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ float: 'right' }}>
              <Button onClick={() => setHandleRemovalModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit">确认处理</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default ProductWarning;
