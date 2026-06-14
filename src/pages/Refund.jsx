import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, Tag, message, Typography, Row, Col, Statistic, Card, Alert, Radio, Tooltip } from 'antd';
import { useNavigate } from 'react-router-dom';
import { DollarOutlined, CheckOutlined, CloseOutlined, RedoOutlined, PauseCircleOutlined, SearchOutlined, WarningOutlined } from '@ant-design/icons';
import { financeApi } from '../api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const refundStatusColors = {
  pending: 'orange',
  processing: 'blue',
  completed: 'green',
  failed: 'red',
  hung: 'orange',
  cancelled: 'default'
};

const refundStatusLabels = {
  pending: '待退款',
  processing: '处理中',
  completed: '已完成',
  failed: '失败',
  hung: '已挂账',
  cancelled: '已取消'
};

const inventoryStatusForRefund = {
  pending: { canRefund: false, reason: '退货未入库', color: 'red' },
  received: { canRefund: true, reason: '已入库待质检', color: 'orange' },
  qc_pass: { canRefund: true, reason: '质检通过', color: 'green' },
  qc_rejected: { canRefund: false, reason: '质检拒收', color: 'red' },
  returned: { canRefund: false, reason: '已退回客户', color: 'red' }
};

function Refund({ user }) {
  const navigate = useNavigate();
  const [pendingRefunds, setPendingRefunds] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');
  const [initiateModalVisible, setInitiateModalVisible] = useState(false);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [failModalVisible, setFailModalVisible] = useState(false);
  const [retryModalVisible, setRetryModalVisible] = useState(false);
  const [selectedRefund, setSelectedRefund] = useState(null);
  const [initiateForm] = Form.useForm();
  const [confirmForm] = Form.useForm();
  const [failForm] = Form.useForm();
  const [retryForm] = Form.useForm();
  const [stats, setStats] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pendingRes, refundsRes, statsRes] = await Promise.all([
        financeApi.getPendingRefunds(),
        financeApi.getRefunds(),
        financeApi.getStatistics()
      ]);
      setPendingRefunds(pendingRes.data?.list || []);
      setRefunds(refundsRes.data?.list || []);
      setStats(statsRes.data || {});
    } finally {
      setLoading(false);
    }
  };

  const handleInitiate = (refund) => {
    const invStatus = inventoryStatusForRefund[refund.inventory_status];
    if (!invStatus?.canRefund) {
      message.error(`无法发起退款：${invStatus?.reason || '入库状态不满足退款条件'}`);
      return;
    }
    setSelectedRefund(refund);
    initiateForm.setFieldsValue({
      after_sale_no: refund.after_sale_no,
      refund_amount: refund.refund_amount,
      refund_channel: 'alipay',
      shipping_bearer: refund.shipping_bearer,
      shipping_amount: refund.shipping_amount || 0
    });
    setInitiateModalVisible(true);
  };

  const handleSubmitInitiate = async (values) => {
    try {
      await financeApi.initiateRefund({
        ...values,
        after_sale_no: selectedRefund.after_sale_no
      });
      message.success('退款已发起');
      setInitiateModalVisible(false);
      initiateForm.resetFields();
      loadData();
    } catch (err) {
      message.error(err.response?.data?.error || '发起退款失败');
    }
  };

  const handleConfirm = (refund) => {
    setSelectedRefund(refund);
    confirmForm.setFieldsValue({
      refund_no: refund.refund_no,
      actual_amount: refund.refund_amount,
      transaction_id: ''
    });
    setConfirmModalVisible(true);
  };

  const handleSubmitConfirm = async (values) => {
    try {
      await financeApi.confirmRefund(selectedRefund.refund_no, values);
      message.success('退款已确认');
      setConfirmModalVisible(false);
      confirmForm.resetFields();
      loadData();
    } catch (err) {
      message.error(err.response?.data?.error || '确认失败');
    }
  };

  const handleFail = (refund) => {
    setSelectedRefund(refund);
    failForm.setFieldsValue({
      refund_no: refund.refund_no,
      failed_reason: '',
      hang_refund: true
    });
    setFailModalVisible(true);
  };

  const handleSubmitFail = async (values) => {
    try {
      await financeApi.failRefund(selectedRefund.refund_no, values);
      message.success(values.hang_refund ? '退款已挂账' : '已标记失败');
      setFailModalVisible(false);
      failForm.resetFields();
      loadData();
    } catch (err) {
      message.error(err.response?.data?.error || '操作失败');
    }
  };

  const handleRetry = (refund) => {
    setSelectedRefund(refund);
    retryForm.setFieldsValue({
      refund_no: refund.refund_no,
      refund_channel: refund.refund_channel,
      remark: ''
    });
    setRetryModalVisible(true);
  };

  const handleSubmitRetry = async (values) => {
    try {
      await financeApi.retryRefund(selectedRefund.refund_no, values);
      message.success('退款重试已发起');
      setRetryModalVisible(false);
      retryForm.resetFields();
      loadData();
    } catch (err) {
      message.error(err.response?.data?.error || '重试失败');
    }
  };

  const pendingColumns = [
    { title: '售后单号', dataIndex: 'after_sale_no', width: 140 },
    { title: '关联订单', dataIndex: 'order_no', width: 140 },
    { title: '商品', dataIndex: 'product_name' },
    { title: '退款金额', dataIndex: 'refund_amount', render: v => `¥${v.toFixed(2)}` },
    {
      title: '入库状态',
      dataIndex: 'inventory_status',
      render: (v) => {
        const status = inventoryStatusForRefund[v];
        return (
          <Tooltip title={status?.canRefund ? '可以退款' : status?.reason}>
            <Tag color={status?.color}>
              {status?.canRefund ? <CheckOutlined /> : <CloseOutlined />}
              {' '}{status?.reason || v}
            </Tag>
          </Tooltip>
        );
      }
    },
    { title: '运费承担', dataIndex: 'shipping_bearer', render: v => v === 'customer' ? '客户' : v === 'merchant' ? '商家' : v === 'platform' ? '平台' : '各半' },
    { title: '创建时间', dataIndex: 'created_at', render: v => dayjs(v).format('MM-DD HH:mm') },
    {
      title: '操作',
      render: (_, r) => {
        const invStatus = inventoryStatusForRefund[r.inventory_status];
        const canRefund = invStatus?.canRefund;
        return (
          <Space>
            <Button type="link" size="small" onClick={() => navigate(`/after-sale/${r.after_sale_no}`)}>
              详情
            </Button>
            <Button
              type="primary"
              size="small"
              icon={<DollarOutlined />}
              disabled={!canRefund}
              onClick={() => handleInitiate(r)}
            >
              发起退款
            </Button>
          </Space>
        );
      }
    }
  ];

  const refundColumns = [
    { title: '退款单号', dataIndex: 'refund_no', width: 140 },
    { title: '售后单号', dataIndex: 'after_sale_no', width: 140 },
    { title: '退款金额', dataIndex: 'refund_amount', render: v => `¥${v.toFixed(2)}` },
    { title: '退款渠道', dataIndex: 'refund_channel', render: v => v === 'alipay' ? '支付宝' : v === 'wechat' ? '微信' : v === 'bank' ? '银行卡' : v },
    {
      title: '状态',
      dataIndex: 'status',
      render: v => (
        <Space>
          <Tag color={refundStatusColors[v]}>{refundStatusLabels[v]}</Tag>
          {v === 'hung' && <Tag color="orange">已挂账</Tag>}
        </Space>
      )
    },
    {
      title: '挂账',
      dataIndex: 'is_hung',
      render: v => v ? <Tag color="orange">是</Tag> : <Tag color="default">否</Tag>
    },
    { title: '创建时间', dataIndex: 'created_at', render: v => dayjs(v).format('MM-DD HH:mm') },
    {
      title: '操作',
      render: (_, r) => (
        <Space>
          <Button type="link" size="small" onClick={() => navigate(`/after-sale/${r.after_sale_no}`)}>
            详情
          </Button>
          {r.status === 'processing' && (
            <Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => handleConfirm(r)}>
              确认到账
            </Button>
          )}
          {(r.status === 'failed' || r.status === 'hung') && (
            <>
              <Button size="small" icon={<RedoOutlined />} onClick={() => handleRetry(r)}>
                重试
              </Button>
              {r.status === 'failed' && !r.is_hung && (
                <Button size="small" icon={<PauseCircleOutlined />} onClick={() => handleFail(r)}>
                  挂账
                </Button>
              )}
            </>
          )}
        </Space>
      )
    }
  ];

  return (
    <div>
      <div className="page-header">
        <div className="page-title">退款处理工作台</div>
        <Text type="secondary">处理退款渠道、运费承担、对账差异</Text>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="待退款" value={stats.pending || 0} valueStyle={{ color: '#fa8c16' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="今日退款" value={stats.todayRefunded || 0} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="退款挂账" value={stats.hung || 0} valueStyle={{ color: '#faad14' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="退款失败" value={stats.failed || 0} valueStyle={{ color: '#f5222d' }} />
          </Card>
        </Col>
      </Row>

      <div className="rule-hint">
        <strong>退款规则：</strong>
        <div>1. 退货未完成入库或质检拒收，禁止发起退款</div>
        <div>2. 退款失败可选择挂账，后续再重试处理</div>
        <div>3. 运费承担需在创建售后时确认，退款时可调整</div>
      </div>

      <div className="danger-card" style={{ padding: 16, marginBottom: 24, borderRadius: 8 }}>
        <Space>
          <WarningOutlined style={{ color: '#f5222d', fontSize: 20 }} />
          <div>
            <Text strong style={{ color: '#f5222d' }}>入库状态对退款的限制说明：</Text>
            <div style={{ marginTop: 8 }}>
              <Tag color="green">已入库 + 质检通过</Tag> → 可以发起退款
              <br />
              <Tag color="red">待入库</Tag> → 禁止发起退款（按钮禁用）
              <br />
              <Tag color="red">质检拒收</Tag> → 禁止发起退款（按钮禁用）
            </div>
          </div>
        </Space>
      </div>

      <Space className="table-actions">
        <Button.Group>
          <Button type={activeTab === 'pending' ? 'primary' : 'default'} onClick={() => setActiveTab('pending')}>
            待退款
          </Button>
          <Button type={activeTab === 'all' ? 'primary' : 'default'} onClick={() => setActiveTab('all')}>
            全部退款记录
          </Button>
        </Button.Group>
        <Button icon={<SearchOutlined />} onClick={loadData}>刷新</Button>
      </Space>

      {activeTab === 'pending' ? (
        <Table
          columns={pendingColumns}
          dataSource={pendingRefunds}
          rowKey="after_sale_no"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      ) : (
        <Table
          columns={refundColumns}
          dataSource={refunds}
          rowKey="refund_no"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      )}

      <Modal
        title="发起退款"
        open={initiateModalVisible}
        onCancel={() => setInitiateModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form form={initiateForm} layout="vertical" onFinish={handleSubmitInitiate}>
          <Form.Item label="售后单号" name="after_sale_no">
            <Input disabled />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="退款金额"
                name="refund_amount"
                rules={[{ required: true, message: '请输入退款金额' }]}
              >
                <Input type="number" step="0.01" prefix="¥" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="退款渠道"
                name="refund_channel"
                rules={[{ required: true, message: '请选择退款渠道' }]}
              >
                <Select>
                  <Option value="alipay">支付宝</Option>
                  <Option value="wechat">微信支付</Option>
                  <Option value="bank">银行卡</Option>
                  <Option value="original">原路退回</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="运费承担" name="shipping_bearer">
                <Select>
                  <Option value="customer">客户承担</Option>
                  <Option value="merchant">商家承担</Option>
                  <Option value="platform">平台承担</Option>
                  <Option value="split">各承担一半</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="运费金额" name="shipping_amount">
                <Input type="number" step="0.01" prefix="¥" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="退款备注" name="remark">
            <TextArea rows={2} placeholder="请输入退款备注（可选）" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ float: 'right' }}>
              <Button onClick={() => setInitiateModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit">发起退款</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="确认退款到账"
        open={confirmModalVisible}
        onCancel={() => setConfirmModalVisible(false)}
        footer={null}
      >
        <Form form={confirmForm} layout="vertical" onFinish={handleSubmitConfirm}>
          <Form.Item label="退款单号" name="refund_no">
            <Input disabled />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="实际到账金额"
                name="actual_amount"
                rules={[{ required: true, message: '请输入实际到账金额' }]}
              >
                <Input type="number" step="0.01" prefix="¥" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="交易流水号" name="transaction_id">
                <Input placeholder="请输入第三方交易流水号" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="到账时间" name="confirmed_at">
            <Input defaultValue={dayjs().format('YYYY-MM-DD HH:mm:ss')} disabled />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ float: 'right' }}>
              <Button onClick={() => setConfirmModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit">确认到账</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="退款失败/挂账处理"
        open={failModalVisible}
        onCancel={() => setFailModalVisible(false)}
        footer={null}
      >
        <Form form={failForm} layout="vertical" onFinish={handleSubmitFail}>
          <Form.Item label="退款单号" name="refund_no">
            <Input disabled />
          </Form.Item>
          <Form.Item
            label="失败原因"
            name="failed_reason"
            rules={[{ required: true, message: '请填写失败原因' }]}
          >
            <TextArea rows={3} placeholder="请详细描述退款失败原因" />
          </Form.Item>
          <Form.Item
            label="是否挂账"
            name="hang_refund"
            valuePropName="checked"
            tooltip="挂账后可后续重试处理"
          >
            <Radio.Group>
              <Radio value={true}>挂账，后续重试</Radio>
              <Radio value={false}>不挂账，标记失败</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ float: 'right' }}>
              <Button onClick={() => setFailModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit">确认</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="重试退款"
        open={retryModalVisible}
        onCancel={() => setRetryModalVisible(false)}
        footer={null}
      >
        <Form form={retryForm} layout="vertical" onFinish={handleSubmitRetry}>
          <Form.Item label="退款单号" name="refund_no">
            <Input disabled />
          </Form.Item>
          <Form.Item
            label="退款渠道"
            name="refund_channel"
            rules={[{ required: true, message: '请选择退款渠道' }]}
          >
            <Select>
              <Option value="alipay">支付宝</Option>
              <Option value="wechat">微信支付</Option>
              <Option value="bank">银行卡</Option>
              <Option value="original">原路退回</Option>
            </Select>
          </Form.Item>
          <Form.Item label="备注" name="remark">
            <TextArea rows={2} placeholder="请输入重试备注（可选）" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ float: 'right' }}>
              <Button onClick={() => setRetryModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit">重试退款</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default Refund;
