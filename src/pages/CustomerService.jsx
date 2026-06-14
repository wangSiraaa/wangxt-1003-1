import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, DatePicker, Space, Tag, message, Typography, Row, Col, Statistic, Card } from 'antd';
import { useNavigate } from 'react-router-dom';
import { PlusOutlined, CheckOutlined, CloseOutlined, SearchOutlined } from '@ant-design/icons';
import { customerServiceApi, commonApi } from '../api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const statusColors = {
  pending_review: 'orange',
  cs_reviewed: 'blue',
  cs_rejected: 'red',
  inventory_pending: 'cyan',
  inventory_received: 'purple',
  qc_pass: 'green',
  qc_rejected: 'red',
  refund_pending: 'orange',
  refund_completed: 'green',
  returned_to_customer: 'red',
  completed: 'green'
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
  refund_completed: '退款完成',
  returned_to_customer: '退回客户',
  completed: '已完成'
};

function CustomerService({ user }) {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [afterSales, setAfterSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedAfterSale, setSelectedAfterSale] = useState(null);
  const [form] = Form.useForm();
  const [reviewForm] = Form.useForm();
  const [stats, setStats] = useState({});
  const [activeTab, setActiveTab] = useState('aftersales');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ordersRes, asRes, productsRes, statsRes] = await Promise.all([
        customerServiceApi.getOrders(),
        customerServiceApi.getAfterSales(),
        commonApi.getProducts(),
        commonApi.getDashboardStats()
      ]);
      setOrders(ordersRes.data?.list || []);
      setAfterSales(asRes.data?.list || []);
      setProducts(productsRes.data?.list || []);
      setStats(statsRes.data || {});
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAfterSale = (order) => {
    if (dayjs().isAfter(dayjs(order.after_sale_deadline))) {
      message.error(`该订单已超过售后期（截止：${dayjs(order.after_sale_deadline).format('YYYY-MM-DD')}），无法申请售后`);
      return;
    }
    setSelectedOrder(order);
    form.setFieldsValue({
      order_no: order.order_no,
      product_id: order.product_id,
      product_name: order.product_name,
      after_sale_type: 'return'
    });
    setModalVisible(true);
  };

  const handleSubmitAfterSale = async (values) => {
    try {
      const res = await customerServiceApi.createAfterSale({
        ...values,
        order_no: selectedOrder.order_no,
        order_snapshot_id: selectedOrder.order_snapshot_id,
        product_id: selectedOrder.product_id
      });
      message.success('售后申请创建成功');
      setModalVisible(false);
      form.resetFields();
      loadData();
    } catch (err) {
      message.error(err.response?.data?.error || '创建失败');
    }
  };

  const handleReview = (afterSale, approved) => {
    setSelectedAfterSale(afterSale);
    reviewForm.setFieldsValue({
      after_sale_no: afterSale.after_sale_no,
      approved,
      review_remark: ''
    });
    setReviewModalVisible(true);
  };

  const handleSubmitReview = async (values) => {
    try {
      await customerServiceApi.reviewAfterSale(selectedAfterSale.after_sale_no, values);
      message.success(values.approved ? '审核通过' : '已驳回');
      setReviewModalVisible(false);
      reviewForm.resetFields();
      loadData();
    } catch (err) {
      message.error(err.response?.data?.error || '审核失败');
    }
  };

  const orderColumns = [
    { title: '订单号', dataIndex: 'order_no', width: 140 },
    { title: '商品', dataIndex: 'product_name' },
    { title: '金额', dataIndex: 'order_amount', render: v => `¥${v.toFixed(2)}` },
    { title: '下单时间', dataIndex: 'order_date', render: v => dayjs(v).format('YYYY-MM-DD HH:mm') },
    {
      title: '售后期',
      dataIndex: 'after_sale_deadline',
      render: (v, rec) => {
        const expired = dayjs().isAfter(dayjs(v));
        return (
          <Space>
            <Tag color={expired ? 'red' : 'green'}>
              {expired ? '已过期' : '在售后期内'}
            </Tag>
            <Text type="secondary">{dayjs(v).format('YYYY-MM-DD')}</Text>
          </Space>
        );
      }
    },
    {
      title: '操作',
      render: (_, r) => (
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            disabled={dayjs().isAfter(dayjs(r.after_sale_deadline))}
            onClick={() => handleCreateAfterSale(r)}
          >
            申请售后
          </Button>
        </Space>
      )
    }
  ];

  const asColumns = [
    { title: '售后单号', dataIndex: 'after_sale_no', width: 140 },
    { title: '关联订单', dataIndex: 'order_no', width: 140 },
    {
      title: '售后类型',
      dataIndex: 'after_sale_type',
      render: v => v === 'return' ? '退货退款' : v === 'exchange' ? '换货' : '仅退款'
    },
    { title: '退款金额', dataIndex: 'refund_amount', render: v => v ? `¥${v.toFixed(2)}` : '-' },
    { title: '状态', dataIndex: 'status', render: v => <Tag color={statusColors[v]}>{statusLabels[v]}</Tag> },
    { title: '版本', dataIndex: 'version', render: v => `v${v}` },
    { title: '创建时间', dataIndex: 'created_at', render: v => dayjs(v).format('MM-DD HH:mm') },
    {
      title: '操作',
      render: (_, r) => (
        <Space>
          <Button type="link" size="small" onClick={() => navigate(`/after-sale/${r.after_sale_no}`)}>详情</Button>
          {r.status === 'pending_review' && (
            <>
              <Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => handleReview(r, true)}>通过</Button>
              <Button danger size="small" icon={<CloseOutlined />} onClick={() => handleReview(r, false)}>驳回</Button>
            </>
          )}
        </Space>
      )
    }
  ];

  return (
    <div>
      <div className="page-header">
        <div className="page-title">客服工作台</div>
        <Text type="secondary">创建售后申请、审核售后期、管理售后单</Text>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="今日售后申请" value={stats.todayAfterSales || 0} valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="待审核" value={stats.pendingReview || 0} valueStyle={{ color: '#fa8c16' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="已审核通过" value={stats.csReviewed || 0} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="已驳回" value={stats.csRejected || 0} valueStyle={{ color: '#f5222d' }} />
          </Card>
        </Col>
      </Row>

      <div className="rule-hint">
        <strong>售后期规则：</strong>超过售后期截止日期的订单，无法申请售后。下单时自动计算30天售后期。
      </div>

      <Space className="table-actions">
        <Button.Group>
          <Button type={activeTab === 'aftersales' ? 'primary' : 'default'} onClick={() => setActiveTab('aftersales')}>
            售后单列表
          </Button>
          <Button type={activeTab === 'orders' ? 'primary' : 'default'} onClick={() => setActiveTab('orders')}>
            可申请订单
          </Button>
        </Button.Group>
        <Button icon={<SearchOutlined />} onClick={loadData}>刷新</Button>
      </Space>

      {activeTab === 'orders' ? (
        <Table
          columns={orderColumns}
          dataSource={orders}
          rowKey="order_no"
          loading={loading}
          pagination={{ pageSize: 10 }}
          expandable={{
            expandedRowRender: (record) => (
              <div style={{ padding: '0 24px' }}>
                <div><Text strong>用户：</Text>{record.user_name}</div>
                <div><Text strong>联系电话：</Text>{record.user_phone}</div>
                <div><Text strong>收货地址：</Text>{record.shipping_address}</div>
                <div><Text strong>数量：</Text>{record.quantity}</div>
                <div><Text strong>主播场次：</Text>{record.session_name || '-'}</div>
              </div>
            )
          }}
        />
      ) : (
        <Table
          columns={asColumns}
          dataSource={afterSales}
          rowKey="after_sale_no"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      )}

      <Modal
        title="创建售后申请"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmitAfterSale}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="订单号" name="order_no">
                <Input disabled />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="商品" name="product_name">
                <Input disabled />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="售后类型"
                name="after_sale_type"
                rules={[{ required: true, message: '请选择售后类型' }]}
              >
                <Select>
                  <Option value="return">退货退款</Option>
                  <Option value="exchange">换货</Option>
                  <Option value="refund_only">仅退款</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="退款金额"
                name="refund_amount"
                rules={[{ required: true, message: '请输入退款金额' }]}
              >
                <Input type="number" step="0.01" prefix="¥" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            label="问题描述"
            name="description"
            rules={[{ required: true, message: '请描述问题' }]}
          >
            <TextArea rows={3} placeholder="请详细描述售后问题" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="退货运费承担" name="shipping_bearer">
                <Select defaultValue="customer">
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
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ float: 'right' }}>
              <Button onClick={() => setModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit">提交申请</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={reviewForm.getFieldValue('approved') ? '审核通过' : '审核驳回'}
        open={reviewModalVisible}
        onCancel={() => setReviewModalVisible(false)}
        footer={null}
      >
        <Form form={reviewForm} layout="vertical" onFinish={handleSubmitReview}>
          <Form.Item label="售后单号" name="after_sale_no">
            <Input disabled />
          </Form.Item>
          <Form.Item label="审核结果" name="approved">
            <Select disabled>
              <Option value={true}>通过</Option>
              <Option value={false}>驳回</Option>
            </Select>
          </Form.Item>
          <Form.Item
            label={reviewForm.getFieldValue('approved') ? '审核备注' : '驳回原因'}
            name="review_remark"
            rules={[{ required: true, message: '请填写审核意见' }]}
          >
            <TextArea rows={3} placeholder={reviewForm.getFieldValue('approved') ? '请输入审核备注' : '请输入驳回原因'} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ float: 'right' }}>
              <Button onClick={() => setReviewModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit">确认</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default CustomerService;
