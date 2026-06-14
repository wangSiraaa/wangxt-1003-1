import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Descriptions,
  Tag,
  Button,
  Space,
  Row,
  Col,
  Timeline,
  Table,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Steps,
  Divider,
  Typography,
  Alert,
  Statistic,
  message
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  DollarOutlined,
  PackageOutlined,
  UserOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import { customerServiceApi, commonApi, warehouseApi, financeApi, anchorOpsApi } from '../api';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;
const { Step } = Steps;
const { TextArea } = Input;
const { Option } = Select;

const statusColors = {
  pending_review: 'orange',
  cs_reviewed: 'blue',
  cs_rejected: 'red',
  pending_inventory: 'cyan',
  inventory_received: 'purple',
  qc_pass: 'green',
  qc_rejected: 'red',
  pending_refund: 'orange',
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
  pending_inventory: '待入库',
  inventory_received: '已入库',
  qc_pass: '质检通过',
  qc_rejected: '质检拒收',
  pending_refund: '待退款',
  refund_processing: '退款处理中',
  refund_completed: '退款完成',
  refund_failed: '退款失败',
  refund_hung: '退款挂账',
  returned_to_customer: '退回客户',
  completed: '已完成',
  cancelled: '已取消'
};

const roleColors = {
  customer_service: '#1890ff',
  warehouse: '#52c41a',
  anchor_ops: '#722ed1',
  finance: '#fa8c16',
  system: '#666'
};

const roleNames = {
  customer_service: '客服',
  warehouse: '仓库',
  anchor_ops: '主播运营',
  finance: '财务',
  system: '系统'
};

const actionLabels = {
  login: '登录',
  create_after_sale: '创建售后',
  cs_approve: '客服审核通过',
  cs_reject: '客服审核拒绝',
  review_after_sale: '审核售后',
  receive_inventory: '登记入库',
  qc_pass: '质检通过',
  qc_reject: '质检拒收',
  qc_inventory: '质检',
  initiate_refund: '发起退款',
  confirm_refund: '确认退款',
  fail_refund: '退款失败',
  hang_refund: '挂账处理',
  retry_refund: '重试退款',
  attribute_responsibility: '责任归因',
  batch_recall: '批量召回',
  trigger_removal: '触发下架提醒',
  return_customer: '退回客户',
  update_after_sale: '修改售后'
};

function AfterSaleDetail({ user }) {
  const { afterSaleNo } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('basic');

  const [reviewModal, setReviewModal] = useState(false);
  const [qcModal, setQcModal] = useState(false);
  const [refundModal, setRefundModal] = useState(false);
  const [failModal, setFailModal] = useState(false);
  const [attributeModal, setAttributeModal] = useState(false);
  const [form] = Form.useForm();
  const [qcForm] = Form.useForm();
  const [refundForm] = Form.useForm();
  const [failForm] = Form.useForm();
  const [attributeForm] = Form.useForm();

  useEffect(() => {
    loadDetail();
  }, [afterSaleNo]);

  const loadDetail = async () => {
    setLoading(true);
    try {
      const res = await customerServiceApi.getAfterSaleDetail(afterSaleNo);
      setDetail(res.data);
    } catch (err) {
      message.error('加载售后单详情失败: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const getProcessSteps = () => {
    if (!detail) return [];
    const { afterSale, inventory, refund } = detail;
    const steps = [];

    steps.push({
      title: '创建售后',
      description: afterSale.created_at ? dayjs(afterSale.created_at).format('YYYY-MM-DD HH:mm') : '-',
      status: 'finish',
      icon: <CheckCircleOutlined />,
      operator: afterSale.cs_name
    });

    if (afterSale.status === 'cs_rejected') {
      steps.push({
        title: '客服审核拒绝',
        description: afterSale.updated_at ? dayjs(afterSale.updated_at).format('YYYY-MM-DD HH:mm') : '-',
        status: 'error',
        icon: <CloseCircleOutlined />
      });
      return steps;
    }

    steps.push({
      title: '客服审核',
      description: afterSale.status !== 'pending_review' ? (afterSale.updated_at ? dayjs(afterSale.updated_at).format('YYYY-MM-DD HH:mm') : '-') : '待处理',
      status: afterSale.status === 'pending_review' ? 'process' : 'finish',
      icon: afterSale.status === 'pending_review' ? <ClockCircleOutlined /> : <CheckCircleOutlined />
    });

    if (afterSale.type === 'return') {
      steps.push({
        title: '退货入库',
        description: inventory?.received_at ? dayjs(inventory.received_at).format('YYYY-MM-DD HH:mm') : (afterSale.status === 'pending_inventory' || afterSale.status === 'inventory_received' || afterSale.status === 'qc_pass' || afterSale.status === 'qc_rejected' ? '待仓库处理' : '待开始'),
        status: afterSale.status === 'pending_inventory' ? 'process' : (inventory?.status === 'received' || inventory?.status === 'qc_pass' ? 'finish' : (afterSale.status === 'qc_rejected' || afterSale.status === 'returned_to_customer' ? 'error' : 'wait')),
        icon: <PackageOutlined />
      });

      steps.push({
        title: '质检',
        description: inventory?.qc_at ? dayjs(inventory.qc_at).format('YYYY-MM-DD HH:mm') : (afterSale.status === 'inventory_received' ? '待质检' : '待开始'),
        status: afterSale.status === 'inventory_received' ? 'process' : (afterSale.status === 'qc_pass' ? 'finish' : (afterSale.status === 'qc_rejected' || afterSale.status === 'returned_to_customer' ? 'error' : 'wait')),
        icon: afterSale.status === 'qc_rejected' ? <CloseCircleOutlined /> : <CheckCircleOutlined />
      });

      if (afterSale.status === 'returned_to_customer') {
        steps.push({
          title: '退回客户',
          description: inventory?.returned_at ? dayjs(inventory.returned_at).format('YYYY-MM-DD HH:mm') : '-',
          status: 'finish',
          icon: <ExclamationCircleOutlined />
        });
        return steps;
      }
    }

    steps.push({
      title: '退款处理',
      description: refund?.completed_at ? dayjs(refund.completed_at).format('YYYY-MM-DD HH:mm') : (afterSale.status === 'pending_refund' || afterSale.status === 'refund_processing' ? '待财务处理' : '待开始'),
      status: afterSale.status === 'pending_refund' || afterSale.status === 'refund_processing' ? 'process' : (afterSale.status === 'refund_completed' || afterSale.status === 'completed' ? 'finish' : (afterSale.status === 'refund_failed' || afterSale.status === 'refund_hung' ? 'error' : 'wait')),
      icon: <DollarOutlined />
    });

    if (afterSale.status === 'refund_hung') {
      steps.push({
        title: '退款挂账',
        description: refund?.updated_at ? dayjs(refund.updated_at).format('YYYY-MM-DD HH:mm') : '-',
        status: 'error',
        icon: <ExclamationCircleOutlined />
      });
    }

    if (afterSale.status === 'completed' || afterSale.status === 'refund_completed') {
      steps.push({
        title: '完成',
        description: refund?.completed_at ? dayjs(refund.completed_at).format('YYYY-MM-DD HH:mm') : '-',
        status: 'finish',
        icon: <CheckCircleOutlined />
      });
    }

    return steps;
  };

  const canReview = () => {
    if (!detail) return false;
    return user.role === 'customer_service' && detail.afterSale.status === 'pending_review';
  };

  const canReceive = () => {
    if (!detail) return false;
    return user.role === 'warehouse' && detail.afterSale.status === 'pending_inventory' && detail.inventory?.status === 'pending';
  };

  const canQC = () => {
    if (!detail) return false;
    return user.role === 'warehouse' && detail.afterSale.status === 'inventory_received' && detail.inventory?.status === 'received';
  };

  const canReturnCustomer = () => {
    if (!detail) return false;
    return user.role === 'warehouse' && detail.afterSale.status === 'qc_rejected' && detail.inventory?.status === 'qc_rejected';
  };

  const canInitiateRefund = () => {
    if (!detail) return false;
    return user.role === 'finance' && (detail.afterSale.status === 'pending_refund' || detail.afterSale.status === 'refund_failed');
  };

  const canConfirmRefund = () => {
    if (!detail) return false;
    return user.role === 'finance' && detail.afterSale.status === 'refund_processing';
  };

  const canFailRefund = () => {
    if (!detail) return false;
    return user.role === 'finance' && detail.afterSale.status === 'refund_processing';
  };

  const canRetryRefund = () => {
    if (!detail) return false;
    return user.role === 'finance' && detail.afterSale.status === 'refund_hung';
  };

  const canAttribute = () => {
    if (!detail) return false;
    return user.role === 'anchor_ops' && !detail.afterSale.responsibility && 
      ['qc_pass', 'pending_refund', 'refund_processing', 'refund_completed', 'completed'].includes(detail.afterSale.status);
  };

  const handleReceive = async () => {
    try {
      await warehouseApi.receiveInventory(detail.inventory.inventory_no, {
        received_quantity: detail.inventory.quantity,
        received_by: user.name
      });
      message.success('入库登记成功');
      loadDetail();
    } catch (err) {
      message.error('入库失败: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleReview = async (values) => {
    try {
      await customerServiceApi.reviewAfterSale(afterSaleNo, {
        approved: values.approved,
        rejectReason: values.rejectReason,
        refundAmount: values.refundAmount,
        shippingFee: values.shippingFee || 0,
        shippingBearer: values.shippingBearer
      });
      message.success(values.approved ? '审核通过' : '已拒绝');
      setReviewModal(false);
      form.resetFields();
      loadDetail();
    } catch (err) {
      message.error('操作失败: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleQC = async (values) => {
    try {
      await warehouseApi.qcInventory(detail.inventory.inventory_no, {
        qcResult: values.qcResult,
        qcDescription: values.qcDescription,
        qcBy: user.name
      });
      message.success(values.qcResult === 'pass' ? '质检通过' : '质检拒收');
      setQcModal(false);
      qcForm.resetFields();
      loadDetail();
    } catch (err) {
      message.error('质检失败: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleReturnCustomer = async () => {
    Modal.confirm({
      title: '确认退回客户',
      content: '确定要将此商品退回客户吗？退回后售后单将关闭。',
      okText: '确认退回',
      okType: 'danger',
      onOk: async () => {
        try {
          await warehouseApi.returnToCustomer(detail.inventory.inventory_no);
          message.success('已退回客户');
          loadDetail();
        } catch (err) {
          message.error('操作失败: ' + (err.response?.data?.error || err.message));
        }
      }
    });
  };

  const handleInitiateRefund = async (values) => {
    try {
      await financeApi.initiateRefund({
        afterSaleNo,
        refundChannel: values.refundChannel,
        refundAmount: values.refundAmount,
        shippingFee: values.shippingFee || 0,
        shippingBearer: values.shippingBearer,
        operator: user.name
      });
      message.success('退款已发起');
      setRefundModal(false);
      refundForm.resetFields();
      loadDetail();
    } catch (err) {
      message.error('发起退款失败: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleConfirmRefund = async () => {
    Modal.confirm({
      title: '确认退款到账',
      content: '请确认第三方支付渠道已完成退款，确认后无法撤销。',
      onOk: async () => {
        try {
          await financeApi.confirmRefund(detail.refund.refund_no, {
            transactionId: 'TXN' + Date.now(),
            confirmedBy: user.name
          });
          message.success('退款已确认到账');
          loadDetail();
        } catch (err) {
          message.error('操作失败: ' + (err.response?.data?.error || err.message));
        }
      }
    });
  };

  const handleFailRefund = async (values) => {
    try {
      await financeApi.failRefund(detail.refund.refund_no, {
        failedReason: values.failedReason,
        hangRefund: values.hangRefund,
        operator: user.name
      });
      message.success(values.hangRefund ? '已挂账处理' : '已标记失败');
      setFailModal(false);
      failForm.resetFields();
      loadDetail();
    } catch (err) {
      message.error('操作失败: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleRetryRefund = async () => {
    Modal.confirm({
      title: '重试退款',
      content: '确定要重试此退款吗？',
      onOk: async () => {
        try {
          await financeApi.retryRefund(detail.refund.refund_no, {
            operator: user.name
          });
          message.success('退款已重试');
          loadDetail();
        } catch (err) {
          message.error('重试失败: ' + (err.response?.data?.error || err.message));
        }
      }
    });
  };

  const handleAttribute = async (values) => {
    try {
      await anchorOpsApi.attributeResponsibility(afterSaleNo, {
        responsibility: values.responsibility,
        responsibilityReason: values.responsibilityReason,
        operator: user.name
      });
      message.success('责任归因完成');
      setAttributeModal(false);
      attributeForm.resetFields();
      loadDetail();
    } catch (err) {
      message.error('归因失败: ' + (err.response?.data?.error || err.message));
    }
  };

  const versionColumns = [
    { title: '版本', dataIndex: 'version', width: 80 },
    { title: '状态', dataIndex: 'statusText', render: (v, r) => <Tag color={statusColors[r.status]}>{v}</Tag> },
    { title: '退款金额', dataIndex: 'refund_amount', render: v => v ? `¥${v.toFixed(2)}` : '-' },
    { title: '操作人', dataIndex: 'cs_name' },
    { title: '创建时间', dataIndex: 'created_at', render: v => dayjs(v).format('YYYY-MM-DD HH:mm') },
    { title: '更新时间', dataIndex: 'updated_at', render: v => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-' }
  ];

  const auditColumns = [
    { title: '操作时间', dataIndex: 'created_at', width: 180, render: v => dayjs(v).format('YYYY-MM-DD HH:mm:ss') },
    { title: '操作人', dataIndex: 'operator_name', width: 100, render: (v, r) => <Tag color={roleColors[r.operator_role]}>{v}</Tag> },
    { title: '操作', dataIndex: 'action', width: 120, render: v => actionLabels[v] || v },
    { title: 'IP', dataIndex: 'ip', width: 120, render: v => v || '-' }
  ];

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Text type="secondary">加载中...</Text>
      </div>
    );
  }

  if (!detail) {
    return (
      <div style={{ padding: 24 }}>
        <Alert type="error" message="售后单不存在或已被删除" />
        <Button style={{ marginTop: 16 }} icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
          返回
        </Button>
      </div>
    );
  }

  const { afterSale, inventory, refund, versions, auditLogs } = detail;

  const getInventoryStatusHint = () => {
    if (afterSale.type !== 'return') return null;
    if (afterSale.status === 'pending_inventory') {
      return <Alert type="warning" showIcon message="当前状态：待仓库登记入库，财务暂无法发起退款" />;
    }
    if (afterSale.status === 'inventory_received') {
      return <Alert type="info" showIcon message="当前状态：已入库待质检，质检通过后财务可发起退款" />;
    }
    if (afterSale.status === 'qc_rejected' || afterSale.status === 'returned_to_customer') {
      return <Alert type="error" showIcon message="当前状态：质检拒收，无法发起退款，需退回客户处理" />;
    }
    if (afterSale.status === 'qc_pass' || afterSale.status === 'pending_refund' || afterSale.status === 'refund_processing' || afterSale.status === 'refund_completed' || afterSale.status === 'completed') {
      return <Alert type="success" showIcon message="当前状态：质检已通过，财务可以发起退款" />;
    }
    return null;
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} style={{ marginRight: 16 }}>
            返回
          </Button>
          <span className="page-title" style={{ display: 'inline-block' }}>售后单详情</span>
          <Tag color={statusColors[afterSale.status]} style={{ marginLeft: 12, fontSize: 14 }}>
            {afterSale.statusText}
          </Tag>
        </div>
        <Space>
          {canReview() && (
            <Button type="primary" onClick={() => {
              form.setFieldsValue({
                approved: true,
                refundAmount: afterSale.refund_amount,
                shippingFee: afterSale.shipping_fee || 0,
                shippingBearer: afterSale.shipping_bearer || 'platform'
              });
              setReviewModal(true);
            }}>
              审核售后
            </Button>
          )}
          {canReceive() && (
            <Button type="primary" onClick={handleReceive}>
              登记入库
            </Button>
          )}
          {canQC() && (
            <Button type="primary" onClick={() => setQcModal(true)}>
              质检
            </Button>
          )}
          {canReturnCustomer() && (
            <Button type="primary" danger onClick={handleReturnCustomer}>
              退回客户
            </Button>
          )}
          {canInitiateRefund() && (
            <Button 
              type="primary" 
              onClick={() => {
                refundForm.setFieldsValue({
                  refundChannel: refund?.refund_channel || 'alipay',
                  refundAmount: afterSale.refund_amount,
                  shippingFee: afterSale.shipping_fee || 0,
                  shippingBearer: afterSale.shipping_bearer || 'platform'
                });
                setRefundModal(true);
              }}
              disabled={afterSale.type === 'return' && afterSale.status !== 'pending_refund' && afterSale.status !== 'refund_failed'}
            >
              发起退款
            </Button>
          )}
          {canConfirmRefund() && (
            <Button type="primary" onClick={handleConfirmRefund}>
              确认到账
            </Button>
          )}
          {canFailRefund() && (
            <Button danger onClick={() => setFailModal(true)}>
              退款失败/挂账
            </Button>
          )}
          {canRetryRefund() && (
            <Button type="primary" onClick={handleRetryRefund}>
              重试退款
            </Button>
          )}
          {canAttribute() && (
            <Button type="primary" onClick={() => setAttributeModal(true)}>
              责任归因
            </Button>
          )}
        </Space>
      </div>

      {getInventoryStatusHint()}

      <Card style={{ marginTop: 16 }}>
        <Steps items={getProcessSteps()} size="small" />
      </Card>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col xs={24} lg={16}>
          <Card 
            title="售后信息" 
            style={{ marginBottom: 16 }}
            tabList={[
              { key: 'basic', tab: '基本信息' },
              { key: 'inventory', tab: '入库记录' },
              { key: 'refund', tab: '退款记录' }
            ]}
            activeTabKey={activeTab}
            onTabChange={setActiveTab}
          >
            {activeTab === 'basic' && (
              <Descriptions column={2} bordered size="small">
                <Descriptions.Item label="售后单号" span={2}>
                  <Text copyable>{afterSale.after_sale_no}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="关联订单">{afterSale.order_no}</Descriptions.Item>
                <Descriptions.Item label="售后类型">
                  {afterSale.type === 'return' ? '退货退款' : afterSale.type === 'exchange' ? '换货' : '仅退款'}
                </Descriptions.Item>
                <Descriptions.Item label="售后原因">{afterSale.reason}</Descriptions.Item>
                <Descriptions.Item label="问题描述">
                  <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{afterSale.description || '-'}</Paragraph>
                </Descriptions.Item>
                <Descriptions.Item label="申请退款金额">¥{afterSale.refund_amount?.toFixed(2) || '0.00'}</Descriptions.Item>
                <Descriptions.Item label="运费">¥{afterSale.shipping_fee?.toFixed(2) || '0.00'}</Descriptions.Item>
                <Descriptions.Item label="运费承担">
                  {afterSale.shipping_bearer === 'customer' ? '客户承担' : afterSale.shipping_bearer === 'platform' ? '平台承担' : afterSale.shipping_bearer === 'merchant' ? '商家承担' : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="责任归因">
                  {afterSale.responsibility ? (
                    <Space>
                      <Tag color="purple">{afterSale.responsibility === 'product' ? '商品质量' : afterSale.responsibility === 'logistics' ? '物流问题' : afterSale.responsibility === 'anchor' ? '主播宣传' : afterSale.responsibility === 'customer' ? '客户原因' : '其他'}</Tag>
                      {afterSale.responsibility_reason && <Text type="secondary">{afterSale.responsibility_reason}</Text>}
                    </Space>
                  ) : <Text type="secondary">待主播运营归因</Text>}
                </Descriptions.Item>
                <Descriptions.Item label="当前版本">v{afterSale.version}</Descriptions.Item>
                <Descriptions.Item label="创建时间">{dayjs(afterSale.created_at).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
                <Descriptions.Item label="更新时间">{afterSale.updated_at ? dayjs(afterSale.updated_at).format('YYYY-MM-DD HH:mm:ss') : '-'}</Descriptions.Item>
              </Descriptions>
            )}

            {activeTab === 'inventory' && (
              inventory ? (
                <Descriptions column={2} bordered size="small">
                  <Descriptions.Item label="入库单号" span={2}>{inventory.inventory_no}</Descriptions.Item>
                  <Descriptions.Item label="商品SKU">{inventory.product_sku}</Descriptions.Item>
                  <Descriptions.Item label="商品名称">{inventory.product_name}</Descriptions.Item>
                  <Descriptions.Item label="应退数量">{inventory.quantity}</Descriptions.Item>
                  <Descriptions.Item label="实收数量">{inventory.received_quantity || '-'}</Descriptions.Item>
                  <Descriptions.Item label="入库状态">
                    <Tag color={statusColors[inventory.status]}>{inventory.statusText}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="登记人">{inventory.received_by || '-'}</Descriptions.Item>
                  <Descriptions.Item label="登记时间">{inventory.received_at ? dayjs(inventory.received_at).format('YYYY-MM-DD HH:mm:ss') : '-'}</Descriptions.Item>
                  <Descriptions.Item label="质检结果">
                    {inventory.qc_result === 'pass' ? <Tag color="green">通过</Tag> : inventory.qc_result === 'reject' ? <Tag color="red">拒收</Tag> : '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="质检说明">
                    <Paragraph style={{ margin: 0 }}>{inventory.qc_description || '-'}</Paragraph>
                  </Descriptions.Item>
                  <Descriptions.Item label="质检人">{inventory.qc_by || '-'}</Descriptions.Item>
                  <Descriptions.Item label="质检时间">{inventory.qc_at ? dayjs(inventory.qc_at).format('YYYY-MM-DD HH:mm:ss') : '-'}</Descriptions.Item>
                  {inventory.status === 'returned' && (
                    <>
                      <Descriptions.Item label="退回时间">{inventory.returned_at ? dayjs(inventory.returned_at).format('YYYY-MM-DD HH:mm:ss') : '-'}</Descriptions.Item>
                      <Descriptions.Item label="退回说明">{inventory.return_reason || '-'}</Descriptions.Item>
                    </>
                  )}
                </Descriptions>
              ) : (
                <Alert type="info" message="暂无入库记录" />
              )
            )}

            {activeTab === 'refund' && (
              refund ? (
                <Descriptions column={2} bordered size="small">
                  <Descriptions.Item label="退款单号" span={2}>{refund.refund_no}</Descriptions.Item>
                  <Descriptions.Item label="退款状态">
                    <Tag color={statusColors[refund.status]}>{refund.statusText}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="退款渠道">
                    {refund.refund_channel === 'alipay' ? '支付宝' : refund.refund_channel === 'wechat' ? '微信支付' : refund.refund_channel === 'bank' ? '银行卡' : '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="退款金额">¥{refund.refund_amount?.toFixed(2) || '0.00'}</Descriptions.Item>
                  <Descriptions.Item label="运费">¥{refund.shipping_fee?.toFixed(2) || '0.00'}</Descriptions.Item>
                  <Descriptions.Item label="运费承担">
                    {refund.shipping_bearer === 'customer' ? '客户承担' : refund.shipping_bearer === 'platform' ? '平台承担' : '商家承担'}
                  </Descriptions.Item>
                  <Descriptions.Item label="交易流水号">{refund.transaction_id || '-'}</Descriptions.Item>
                  <Descriptions.Item label="是否挂账">{refund.is_hung ? <Tag color="orange">是</Tag> : '否'}</Descriptions.Item>
                  {refund.is_hung && (
                    <Descriptions.Item label="挂账原因" span={2}>{refund.hung_reason || '-'}</Descriptions.Item>
                  )}
                  {refund.failed_reason && (
                    <Descriptions.Item label="失败原因" span={2}>{refund.failed_reason}</Descriptions.Item>
                  )}
                  <Descriptions.Item label="操作人">{refund.operator_name || '-'}</Descriptions.Item>
                  <Descriptions.Item label="发起时间">{refund.created_at ? dayjs(refund.created_at).format('YYYY-MM-DD HH:mm:ss') : '-'}</Descriptions.Item>
                  <Descriptions.Item label="完成时间">{refund.completed_at ? dayjs(refund.completed_at).format('YYYY-MM-DD HH:mm:ss') : '-'}</Descriptions.Item>
                  <Descriptions.Item label="重试次数">{refund.retry_count || 0}</Descriptions.Item>
                </Descriptions>
              ) : (
                <Alert type="info" message="暂无退款记录" />
              )
            )}
          </Card>

          <Card title="订单快照" style={{ marginBottom: 16 }}>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="订单号">{afterSale.order_no}</Descriptions.Item>
              <Descriptions.Item label="下单时间">{afterSale.order_time ? dayjs(afterSale.order_time).format('YYYY-MM-DD HH:mm:ss') : '-'}</Descriptions.Item>
              <Descriptions.Item label="商品名称">{afterSale.product_name}</Descriptions.Item>
              <Descriptions.Item label="商品SKU">{afterSale.product_sku}</Descriptions.Item>
              <Descriptions.Item label="购买数量">{afterSale.quantity}</Descriptions.Item>
              <Descriptions.Item label="订单金额">¥{afterSale.total_amount?.toFixed(2) || '0.00'}</Descriptions.Item>
              <Descriptions.Item label="客户姓名">{afterSale.user_name}</Descriptions.Item>
              <Descriptions.Item label="联系电话">{afterSale.user_phone}</Descriptions.Item>
              <Descriptions.Item label="收货地址" span={2}>{afterSale.user_address}</Descriptions.Item>
              <Descriptions.Item label="主播场次">{afterSale.anchor_session_no || '-'}</Descriptions.Item>
              <Descriptions.Item label="主播名称">{afterSale.anchor_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="售后期截止">{dayjs(afterSale.after_sale_deadline).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="版本历史">
            <Table
              size="small"
              dataSource={versions}
              columns={versionColumns}
              rowKey="version"
              pagination={false}
            />
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="操作日志" style={{ marginBottom: 16 }}>
            <Timeline className="timeline-custom" size="small">
              {auditLogs.map((log, i) => (
                <Timeline.Item key={i} color={roleColors[log.operator_role] || 'blue'}>
                  <Space direction="vertical" size={0} style={{ width: '100%' }}>
                    <Space wrap>
                      <Tag color={roleColors[log.operator_role] || 'blue'} size="small">
                        {log.operator_name}
                      </Tag>
                      <Text strong>{actionLabels[log.action] || log.action}</Text>
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {dayjs(log.created_at).format('YYYY-MM-DD HH:mm:ss')}
                    </Text>
                    {log.before_data && (
                      <div style={{ marginTop: 4, padding: 6, background: '#fff2f0', borderRadius: 4, fontSize: 12 }}>
                        <Text type="danger">变更前: </Text>
                        <Text code style={{ fontSize: 11 }}>{JSON.stringify(log.before_data).slice(0, 100)}...</Text>
                      </div>
                    )}
                    {log.after_data && (
                      <div style={{ marginTop: 4, padding: 6, background: '#f6ffed', borderRadius: 4, fontSize: 12 }}>
                        <Text type="success">变更后: </Text>
                        <Text code style={{ fontSize: 11 }}>{JSON.stringify(log.after_data).slice(0, 100)}...</Text>
                      </div>
                    )}
                  </Space>
                </Timeline.Item>
              ))}
              {auditLogs.length === 0 && <Text type="secondary">暂无操作记录</Text>}
            </Timeline>
          </Card>

          <Card title="四角色协同信息">
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Row align="middle">
                <Col span={4}><UserOutlined style={{ color: roleColors.customer_service }} /></Col>
                <Col span={20}>
                  <Text strong style={{ color: roleColors.customer_service }}>客服</Text>
                  <div><Text type="secondary">{afterSale.cs_name || '未分配'}</Text></div>
                </Col>
              </Row>
              <Divider style={{ margin: '8px 0' }} />
              <Row align="middle">
                <Col span={4}><PackageOutlined style={{ color: roleColors.warehouse }} /></Col>
                <Col span={20}>
                  <Text strong style={{ color: roleColors.warehouse }}>仓库</Text>
                  <div><Text type="secondary">{inventory?.received_by || inventory?.qc_by || '待处理'}</Text></div>
                </Col>
              </Row>
              <Divider style={{ margin: '8px 0' }} />
              <Row align="middle">
                <Col span={4}><FileTextOutlined style={{ color: roleColors.anchor_ops }} /></Col>
                <Col span={20}>
                  <Text strong style={{ color: roleColors.anchor_ops }}>主播运营</Text>
                  <div><Text type="secondary">{afterSale.responsibility ? '已归因' : '待归因'}</Text></div>
                </Col>
              </Row>
              <Divider style={{ margin: '8px 0' }} />
              <Row align="middle">
                <Col span={4}><DollarOutlined style={{ color: roleColors.finance }} /></Col>
                <Col span={20}>
                  <Text strong style={{ color: roleColors.finance }}>财务</Text>
                  <div><Text type="secondary">{refund?.operator_name || '待处理'}</Text></div>
                </Col>
              </Row>
            </Space>
          </Card>
        </Col>
      </Row>

      <Modal
        title="审核售后申请"
        open={reviewModal}
        onCancel={() => setReviewModal(false)}
        onOk={() => form.submit()}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleReview}>
          <Form.Item label="审核结果" name="approved" rules={[{ required: true, message: '请选择审核结果' }]}>
            <Select>
              <Option value={true}>审核通过</Option>
              <Option value={false}>审核拒绝</Option>
            </Select>
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(p, c) => p.approved !== c.approved}>
            {({ getFieldValue }) => getFieldValue('approved') === false && (
              <Form.Item label="拒绝原因" name="rejectReason" rules={[{ required: true, message: '请输入拒绝原因' }]}>
                <TextArea rows={3} placeholder="请说明拒绝原因" />
              </Form.Item>
            )}
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(p, c) => p.approved !== c.approved}>
            {({ getFieldValue }) => getFieldValue('approved') === true && (
              <>
                <Form.Item label="退款金额(元)" name="refundAmount" rules={[{ required: true, message: '请输入退款金额' }]}>
                  <InputNumber style={{ width: '100%' }} min={0} step={0.01} precision={2} />
                </Form.Item>
                <Form.Item label="运费(元)" name="shippingFee">
                  <InputNumber style={{ width: '100%' }} min={0} step={0.01} precision={2} />
                </Form.Item>
                <Form.Item label="运费承担" name="shippingBearer" rules={[{ required: true, message: '请选择运费承担方' }]}>
                  <Select>
                    <Option value="platform">平台承担</Option>
                    <Option value="merchant">商家承担</Option>
                    <Option value="customer">客户承担</Option>
                  </Select>
                </Form.Item>
              </>
            )}
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="质检处理"
        open={qcModal}
        onCancel={() => setQcModal(false)}
        onOk={() => qcForm.submit()}
        width={500}
      >
        <Form form={qcForm} layout="vertical" onFinish={handleQC}>
          <Form.Item label="质检结果" name="qcResult" rules={[{ required: true, message: '请选择质检结果' }]}>
            <Select>
              <Option value="pass">质检通过</Option>
              <Option value="reject">质检拒收</Option>
            </Select>
          </Form.Item>
          <Form.Item label="质检说明" name="qcDescription">
            <TextArea rows={3} placeholder="请填写质检说明（选填）" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="发起退款"
        open={refundModal}
        onCancel={() => setRefundModal(false)}
        onOk={() => refundForm.submit()}
        width={500}
      >
        <Form form={refundForm} layout="vertical" onFinish={handleInitiateRefund}>
          <Form.Item label="退款渠道" name="refundChannel" rules={[{ required: true, message: '请选择退款渠道' }]}>
            <Select>
              <Option value="alipay">支付宝</Option>
              <Option value="wechat">微信支付</Option>
              <Option value="bank">银行卡</Option>
            </Select>
          </Form.Item>
          <Form.Item label="退款金额(元)" name="refundAmount" rules={[{ required: true, message: '请输入退款金额' }]}>
            <InputNumber style={{ width: '100%' }} min={0} step={0.01} precision={2} />
          </Form.Item>
          <Form.Item label="运费(元)" name="shippingFee">
            <InputNumber style={{ width: '100%' }} min={0} step={0.01} precision={2} />
          </Form.Item>
          <Form.Item label="运费承担" name="shippingBearer" rules={[{ required: true, message: '请选择运费承担方' }]}>
            <Select>
              <Option value="platform">平台承担</Option>
              <Option value="merchant">商家承担</Option>
              <Option value="customer">客户承担</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="退款失败处理"
        open={failModal}
        onCancel={() => setFailModal(false)}
        onOk={() => failForm.submit()}
        width={500}
      >
        <Form form={failForm} layout="vertical" onFinish={handleFailRefund}>
          <Form.Item label="失败原因" name="failedReason" rules={[{ required: true, message: '请输入失败原因' }]}>
            <TextArea rows={3} placeholder="请描述退款失败的具体原因" />
          </Form.Item>
          <Form.Item label="是否挂账" name="hangRefund" rules={[{ required: true, message: '请选择' }]}>
            <Select>
              <Option value={true}>挂账（后续重试）</Option>
              <Option value={false}>仅标记失败</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="责任归因"
        open={attributeModal}
        onCancel={() => setAttributeModal(false)}
        onOk={() => attributeForm.submit()}
        width={500}
      >
        <Form form={attributeForm} layout="vertical" onFinish={handleAttribute}>
          <Form.Item label="责任方" name="responsibility" rules={[{ required: true, message: '请选择责任方' }]}>
            <Select>
              <Option value="product">商品质量问题</Option>
              <Option value="logistics">物流问题</Option>
              <Option value="anchor">主播宣传问题</Option>
              <Option value="customer">客户原因</Option>
              <Option value="other">其他</Option>
            </Select>
          </Form.Item>
          <Form.Item label="归因说明" name="responsibilityReason">
            <TextArea rows={3} placeholder="请填写归因说明（选填）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default AfterSaleDetail;
