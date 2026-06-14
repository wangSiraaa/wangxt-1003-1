import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, Tag, message, Typography, Row, Col, Statistic, Card, Steps, Radio, Alert } from 'antd';
import { useNavigate } from 'react-router-dom';
import { InboxOutlined, CheckCircleOutlined, CloseCircleOutlined, RollbackOutlined, SearchOutlined } from '@ant-design/icons';
import { warehouseApi } from '../api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;
const { Step } = Steps;

const statusColors = {
  pending_review: 'orange',
  cs_reviewed: 'blue',
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
  inventory_pending: '待入库',
  inventory_received: '已入库',
  qc_pass: '质检通过',
  qc_rejected: '质检拒收',
  refund_pending: '待退款',
  refund_completed: '退款完成',
  returned_to_customer: '退回客户',
  completed: '已完成'
};

const invStatusLabels = {
  pending: '待入库',
  received: '已入库',
  qc_pass: '质检通过',
  qc_rejected: '质检拒收',
  returned: '已退回客户'
};

const invStatusColors = {
  pending: 'cyan',
  received: 'purple',
  qc_pass: 'green',
  qc_rejected: 'red',
  returned: 'red'
};

function Warehouse({ user }) {
  const navigate = useNavigate();
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [receiveModalVisible, setReceiveModalVisible] = useState(false);
  const [qcModalVisible, setQcModalVisible] = useState(false);
  const [returnModalVisible, setReturnModalVisible] = useState(false);
  const [selectedInv, setSelectedInv] = useState(null);
  const [receiveForm] = Form.useForm();
  const [qcForm] = Form.useForm();
  const [returnForm] = Form.useForm();
  const [stats, setStats] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [invRes, statsRes] = await Promise.all([
        warehouseApi.getInventory(),
        warehouseApi.getStatistics()
      ]);
      setInventory(invRes.data?.list || []);
      setStats(statsRes.data || {});
    } finally {
      setLoading(false);
    }
  };

  const handleReceive = (inv) => {
    setSelectedInv(inv);
    receiveForm.setFieldsValue({
      inventory_no: inv.inventory_no,
      receive_quantity: inv.quantity
    });
    setReceiveModalVisible(true);
  };

  const handleSubmitReceive = async (values) => {
    try {
      await warehouseApi.receiveInventory(selectedInv.inventory_no, values);
      message.success('入库登记成功');
      setReceiveModalVisible(false);
      receiveForm.resetFields();
      loadData();
    } catch (err) {
      message.error(err.response?.data?.error || '登记失败');
    }
  };

  const handleQC = (inv) => {
    setSelectedInv(inv);
    qcForm.setFieldsValue({
      inventory_no: inv.inventory_no,
      qc_result: 'pass',
      qc_quantity: inv.quantity
    });
    setQcModalVisible(true);
  };

  const handleSubmitQC = async (values) => {
    try {
      await warehouseApi.qcInventory(selectedInv.inventory_no, values);
      message.success(values.qc_result === 'pass' ? '质检通过' : '已拒收');
      setQcModalVisible(false);
      qcForm.resetFields();
      loadData();
    } catch (err) {
      message.error(err.response?.data?.error || '质检失败');
    }
  };

  const handleReturnToCustomer = (inv) => {
    setSelectedInv(inv);
    returnForm.setFieldsValue({
      inventory_no: inv.inventory_no,
      return_reason: ''
    });
    setReturnModalVisible(true);
  };

  const handleSubmitReturn = async (values) => {
    try {
      await warehouseApi.returnToCustomer(selectedInv.inventory_no);
      message.success('已退回客户');
      setReturnModalVisible(false);
      returnForm.resetFields();
      loadData();
    } catch (err) {
      message.error(err.response?.data?.error || '操作失败');
    }
  };

  const getStepStatus = (status) => {
    if (status === 'pending') return { step: 0, status: 'process' };
    if (status === 'received') return { step: 1, status: 'process' };
    if (status === 'qc_pass' || status === 'qc_rejected') return { step: 2, status: 'finish' };
    if (status === 'returned') return { step: 3, status: 'finish' };
    return { step: -1, status: 'wait' };
  };

  const invColumns = [
    { title: '入库单号', dataIndex: 'inventory_no', width: 140 },
    { title: '售后单号', dataIndex: 'after_sale_no', width: 140 },
    { title: '关联订单', dataIndex: 'order_no', width: 140 },
    { title: '商品', dataIndex: 'product_name' },
    { title: '数量', dataIndex: 'quantity' },
    {
      title: '入库状态',
      dataIndex: 'status',
      render: v => <Tag color={invStatusColors[v]}>{invStatusLabels[v]}</Tag>
    },
    {
      title: '流程进度',
      dataIndex: 'status',
      width: 200,
      render: (v) => {
        const stepInfo = getStepStatus(v);
        return (
          <Steps size="small" current={stepInfo.step} style={{ minWidth: 200 }}>
            <Step title="待入库" />
            <Step title="已入库" />
            <Step title="质检" />
            <Step title="完成" />
          </Steps>
        );
      }
    },
    { title: '入库时间', dataIndex: 'received_at', render: v => v ? dayjs(v).format('MM-DD HH:mm') : '-' },
    {
      title: '操作',
      render: (_, r) => (
        <Space>
          <Button type="link" size="small" onClick={() => navigate(`/after-sale/${r.after_sale_no}`)}>
            详情
          </Button>
          {r.status === 'pending' && (
            <Button type="primary" size="small" icon={<InboxOutlined />} onClick={() => handleReceive(r)}>
              登记入库
            </Button>
          )}
          {r.status === 'received' && (
            <Button type="primary" size="small" icon={<CheckCircleOutlined />} onClick={() => handleQC(r)}>
              质检
            </Button>
          )}
          {r.status === 'qc_rejected' && (
            <Button danger size="small" icon={<RollbackOutlined />} onClick={() => handleReturnToCustomer(r)}>
              退回客户
            </Button>
          )}
        </Space>
      )
    }
  ];

  return (
    <div>
      <div className="page-header">
        <div className="page-title">仓库验收工作台</div>
        <Text type="secondary">登记退货入库、质检商品、处理拒收退回</Text>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="待入库" value={stats.pending || 0} valueStyle={{ color: '#13c2c2' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="今日入库" value={stats.todayReceived || 0} valueStyle={{ color: '#722ed1' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="待质检" value={stats.pendingQC || 0} valueStyle={{ color: '#fa8c16' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="质检拒收" value={stats.qcRejected || 0} valueStyle={{ color: '#f5222d' }} />
          </Card>
        </Col>
      </Row>

      <div className="rule-hint">
        <strong>入库规则：</strong>
        <div>1. 退货商品需先登记入库，财务才能发起退款</div>
        <div>2. 质检拒收的商品需退回客户，禁止退款</div>
        <div>3. 入库登记时需核对商品数量与实际退货数量</div>
      </div>

      <Space className="table-actions">
        <Button icon={<SearchOutlined />} onClick={loadData}>刷新</Button>
      </Space>

      <Table
        columns={invColumns}
        dataSource={inventory}
        rowKey="inventory_no"
        loading={loading}
        pagination={{ pageSize: 10 }}
        expandable={{
          expandedRowRender: (record) => (
            <div style={{ padding: '0 24px' }}>
              <div><Text strong>退货人：</Text>{record.user_name}</div>
              <div><Text strong>联系电话：</Text>{record.user_phone}</div>
              <div><Text strong>退货地址：</Text>{record.return_address}</div>
              <div><Text strong>快递单号：</Text>{record.express_no || '-'}</div>
              <div><Text strong>售后描述：</Text>{record.after_sale_description || '-'}</div>
              {record.qc_result && (
                <>
                  <div><Text strong>质检结果：</Text>{record.qc_result === 'pass' ? '通过' : '拒收'}</div>
                  <div><Text strong>质检说明：</Text>{record.qc_description || '-'}</div>
                </>
              )}
            </div>
          )
        }}
      />

      <Modal
        title="登记退货入库"
        open={receiveModalVisible}
        onCancel={() => setReceiveModalVisible(false)}
        footer={null}
      >
        <Form form={receiveForm} layout="vertical" onFinish={handleSubmitReceive}>
          <Form.Item label="入库单号" name="inventory_no">
            <Input disabled />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="实收数量"
                name="receive_quantity"
                rules={[{ required: true, message: '请输入实收数量' }]}
              >
                <Input type="number" min="1" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="快递单号" name="express_no">
                <Input placeholder="请输入快递单号" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="入库备注" name="receive_remark">
            <TextArea rows={2} placeholder="请输入入库备注（可选）" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ float: 'right' }}>
              <Button onClick={() => setReceiveModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit">确认入库</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="商品质检"
        open={qcModalVisible}
        onCancel={() => setQcModalVisible(false)}
        footer={null}
      >
        <Form form={qcForm} layout="vertical" onFinish={handleSubmitQC}>
          <Form.Item label="入库单号" name="inventory_no">
            <Input disabled />
          </Form.Item>
          <Form.Item
            label="质检结果"
            name="qc_result"
            rules={[{ required: true, message: '请选择质检结果' }]}
          >
            <Radio.Group>
              <Radio value="pass">质检通过</Radio>
              <Radio value="reject">质检拒收</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item
            label="质检数量"
            name="qc_quantity"
            rules={[{ required: true, message: '请输入质检数量' }]}
          >
            <Input type="number" min="1" />
          </Form.Item>
          <Form.Item
            label="质检说明"
            name="qc_description"
            rules={[{ required: true, message: '请填写质检说明' }]}
          >
            <TextArea rows={3} placeholder="请详细描述质检结果，拒收需说明原因" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ float: 'right' }}>
              <Button onClick={() => setQcModalVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit">提交质检结果</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="退回客户确认"
        open={returnModalVisible}
        onCancel={() => setReturnModalVisible(false)}
        footer={null}
      >
        <div style={{ marginBottom: 16 }}>
          <Alert
            message="质检拒收商品将退回客户"
            description="确认后该商品将无法退款，售后单状态将更新为退回客户。请确认已通知客户。"
            type="warning"
            showIcon
          />
        </div>
        <Form form={returnForm} layout="vertical" onFinish={handleSubmitReturn}>
          <Form.Item label="入库单号" name="inventory_no">
            <Input disabled />
          </Form.Item>
          <Form.Item label="退回原因" name="return_reason">
            <TextArea rows={2} placeholder="请输入退回原因（可选）" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ float: 'right' }}>
              <Button onClick={() => setReturnModalVisible(false)}>取消</Button>
              <Button danger type="primary" htmlType="submit">确认退回</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default Warehouse;
