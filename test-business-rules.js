function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
}

function diffHours(date1, date2) {
  return Math.floor((date1 - date2) / (1000 * 60 * 60));
}

function diffDays(date1, date2) {
  return Math.floor((date1 - date2) / (1000 * 60 * 60 * 24));
}

console.log('========================================');
console.log('   电商直播售后协同系统 - 业务规则测试');
console.log('========================================\n');

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

function checkAfterSaleDeadline(afterSaleDeadline) {
  const now = new Date();
  const deadline = new Date(afterSaleDeadline);
  const isExpired = now > deadline;
  const totalHoursLeft = diffHours(deadline, now);
  const daysLeft = Math.floor(totalHoursLeft / 24);
  const hoursLeft = totalHoursLeft % 24;
  
  let message;
  if (isExpired) {
    const daysExpired = Math.abs(diffDays(deadline, now));
    message = `售后申请已过期${daysExpired}天，无法申请售后`;
  } else if (daysLeft > 0) {
    message = `售后期剩余${daysLeft}天${hoursLeft}小时`;
  } else {
    message = `售后期剩余${totalHoursLeft}小时`;
  }
  
  return { isExpired, daysLeft, hoursLeft, message, deadline: formatDate(deadline) };
}

function checkInventoryReceived(inventoryStatus) {
  const statusMap = {
    pending: { received: false, status: 'pending', message: '待入库' },
    received: { received: false, status: 'received', message: '已入库待质检' },
    qc_pass: { received: true, status: 'qc_pass', message: '质检通过' },
    qc_rejected: { received: false, status: 'qc_rejected', message: '质检拒收' },
    returned: { received: false, status: 'returned', message: '已退回客户' }
  };
  return statusMap[inventoryStatus] || { received: false, status: 'unknown', message: '未知状态' };
}

function canInitiateRefund(afterSaleStatus, inventoryStatus) {
  if (afterSaleStatus === 'pending_refund' || afterSaleStatus === 'refund_failed') {
    if (afterSaleStatus === 'refund_failed') {
      return { canRefund: true, reason: '退款失败，可重试', inventoryStatus: 'passed' };
    }
    const inventoryCheck = checkInventoryReceived(inventoryStatus);
    if (!inventoryCheck.received) {
      return { 
        canRefund: false, 
        reason: `退货未入库，当前状态：${inventoryCheck.message}`,
        inventoryStatus: inventoryCheck.status
      };
    }
    return { canRefund: true, reason: '可以发起退款', inventoryCheck };
  }
  return { canRefund: false, reason: `当前状态 [${statusLabels[afterSaleStatus]}] 不能发起退款` };
}

function checkProductThreshold(issueCount, threshold) {
  const percentage = (issueCount / threshold) * 100;
  const isOverThreshold = issueCount >= threshold;
  const isWarning = percentage >= 70 && !isOverThreshold;
  
  let level, message;
  if (isOverThreshold) {
    level = 'danger';
    message = `问题商品数量(${issueCount})已超过阈值(${threshold})，请立即处理！`;
  } else if (isWarning) {
    level = 'warning';
    message = `问题商品数量(${issueCount})接近阈值(${threshold})，当前${percentage.toFixed(1)}%`;
  } else {
    level = 'normal';
    message = `问题商品数量(${issueCount})正常，阈值(${threshold})`;
  }
  
  return { isOverThreshold, isWarning, percentage, level, message, issueCount, threshold };
}

function handleFailedRefund(refundId, failedReason, hangRefund) {
  const result = {
    refundId,
    failedReason,
    hangRefund,
    newStatus: hangRefund ? 'refund_hung' : 'refund_failed',
    statusText: hangRefund ? '退款挂账' : '退款失败',
    action: hangRefund ? '已挂账，可后续重试' : '已标记失败'
  };
  return result;
}

function handleQcRejection(afterSaleNo, qcDescription) {
  return {
    afterSaleNo,
    qcDescription,
    newStatus: 'qc_rejected',
    statusText: '质检拒收',
    nextStep: '需退回客户处理',
    action: '已标记质检拒收，售后单无法继续退款流程'
  };
}

let passed = 0;
let failed = 0;

function test(description, testFn) {
  try {
    testFn();
    console.log(`✅ ${description}`);
    passed++;
  } catch (e) {
    console.log(`❌ ${description}`);
    console.log(`   错误: ${e.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || '断言失败');
  }
}

console.log('【测试1】售后期检查规则\n');

test('未过期订单 - 剩余30天', () => {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 30);
  const result = checkAfterSaleDeadline(futureDate.toISOString());
  assert(result.isExpired === false, '应该未过期');
  assert(result.daysLeft >= 29 && result.daysLeft <= 30, '应该剩余约30天');
  assert(result.message.includes('剩余'), '消息应该包含剩余天数');
});

test('已过期订单 - 过期5天', () => {
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 5);
  const result = checkAfterSaleDeadline(pastDate.toISOString());
  assert(result.isExpired === true, '应该已过期');
  assert(result.message.includes('已过期'), '消息应该包含已过期');
});

test('即将过期 - 剩余12小时', () => {
  const nearDate = new Date();
  nearDate.setHours(nearDate.getHours() + 12);
  const result = checkAfterSaleDeadline(nearDate.toISOString());
  assert(result.isExpired === false, '应该未过期');
  assert(result.daysLeft === 0, '应该剩余0天');
  assert(result.hoursLeft >= 11 && result.hoursLeft <= 12, '应该剩余约12小时');
});

console.log('\n【测试2】入库状态对退款的限制\n');

test('待入库状态 - 不能退款', () => {
  const result = canInitiateRefund('pending_refund', 'pending');
  assert(result.canRefund === false, '待入库不能退款');
  assert(result.reason.includes('退货未入库'), '应该提示退货未入库');
  assert(result.inventoryStatus === 'pending', '状态应该是pending');
  console.log(`   ${result.reason}`);
});

test('已入库待质检 - 不能退款', () => {
  const result = canInitiateRefund('pending_refund', 'received');
  assert(result.canRefund === false, '待质检不能退款');
  assert(result.reason.includes('退货未入库'), '应该提示退货未入库');
  assert(result.inventoryStatus === 'received', '状态应该是received');
  console.log(`   ${result.reason}`);
});

test('质检拒收 - 不能退款', () => {
  const result = canInitiateRefund('pending_refund', 'qc_rejected');
  assert(result.canRefund === false, '质检拒收不能退款');
  assert(result.reason.includes('退货未入库'), '应该提示退货未入库');
  assert(result.inventoryStatus === 'qc_rejected', '状态应该是qc_rejected');
  console.log(`   ${result.reason}`);
});

test('质检通过 - 可以退款', () => {
  const result = canInitiateRefund('pending_refund', 'qc_pass');
  assert(result.canRefund === true, '质检通过可以退款');
  assert(result.reason.includes('可以发起退款'), '应该提示可以退款');
  console.log(`   ${result.reason}`);
});

test('退款失败状态 - 可以重试', () => {
  const result = canInitiateRefund('refund_failed', 'qc_pass');
  assert(result.canRefund === true, '退款失败可以重试');
  assert(result.reason.includes('退款失败，可重试'), '应该提示可以重试');
  console.log(`   ${result.reason}`);
});

test('非待退款状态 - 不能退款', () => {
  const result = canInitiateRefund('pending_inventory', 'qc_pass');
  assert(result.canRefund === false, '非待退款状态不能退款');
  assert(result.reason.includes('当前状态'), '应该提示当前状态');
  console.log(`   ${result.reason}`);
});

console.log('\n【测试3】质检拒收处理\n');

test('质检拒收 - 退回客户', () => {
  const result = handleQcRejection('AS2024001', '商品外观破损，影响二次销售');
  assert(result.newStatus === 'qc_rejected', '状态应为质检拒收');
  assert(result.nextStep === '需退回客户处理', '下一步应为退回客户');
  assert(result.action.includes('无法继续退款流程'), '应提示无法退款');
  console.log(`   售后单: ${result.afterSaleNo}`);
  console.log(`   质检说明: ${result.qcDescription}`);
  console.log(`   处理结果: ${result.action}`);
});

console.log('\n【测试4】问题商品阈值检查\n');

test('正常状态 - 3/10', () => {
  const result = checkProductThreshold(3, 10);
  assert(result.isOverThreshold === false, '不应超过阈值');
  assert(result.isWarning === false, '不应警告');
  assert(result.level === 'normal', '级别应为normal');
  assert(result.percentage === 30, '百分比应为30%');
  console.log(`   ${result.message}`);
});

test('预警状态 - 8/10 (80%)', () => {
  const result = checkProductThreshold(8, 10);
  assert(result.isOverThreshold === false, '不应超过阈值');
  assert(result.isWarning === true, '应该警告');
  assert(result.level === 'warning', '级别应为warning');
  assert(result.percentage === 80, '百分比应为80%');
  console.log(`   ${result.message}`);
});

test('危险状态 - 12/10 (120%)', () => {
  const result = checkProductThreshold(12, 10);
  assert(result.isOverThreshold === true, '应该超过阈值');
  assert(result.level === 'danger', '级别应为danger');
  assert(result.percentage === 120, '百分比应为120%');
  console.log(`   ${result.message}`);
});

test('刚好阈值 - 10/10', () => {
  const result = checkProductThreshold(10, 10);
  assert(result.isOverThreshold === true, '应该超过阈值');
  assert(result.level === 'danger', '级别应为danger');
  console.log(`   ${result.message}`);
});

console.log('\n【测试5】退款失败与挂账处理\n');

test('退款失败 - 挂账处理', () => {
  const result = handleFailedRefund('RF2024001', '第三方支付渠道维护', true);
  assert(result.newStatus === 'refund_hung', '状态应为退款挂账');
  assert(result.statusText === '退款挂账', '状态文本应为退款挂账');
  assert(result.hangRefund === true, '应该挂账');
  console.log(`   退款单: ${result.refundId}`);
  console.log(`   失败原因: ${result.failedReason}`);
  console.log(`   处理结果: ${result.action}`);
});

test('退款失败 - 不挂账', () => {
  const result = handleFailedRefund('RF2024002', '用户账户已注销', false);
  assert(result.newStatus === 'refund_failed', '状态应为退款失败');
  assert(result.statusText === '退款失败', '状态文本应为退款失败');
  assert(result.hangRefund === false, '不应该挂账');
  console.log(`   退款单: ${result.refundId}`);
  console.log(`   失败原因: ${result.failedReason}`);
  console.log(`   处理结果: ${result.action}`);
});

console.log('\n【测试6】完整协同流程模拟\n');

console.log('   模拟完整售后流程:');
console.log('   ┌─────────────────────────────────────────┐');
console.log('   │ 1. 客服创建售后申请                    │');
console.log('   │    ↓ 检查售后期                        │');
console.log('   │ 2. 客服审核通过 → 状态: pending_inventory │');
console.log('   │    ↓ 仓库处理                          │');
console.log('   │ 3. 仓库登记入库 → 状态: inventory_received │');
console.log('   │    ↓ 质检                              │');
console.log('   │ 4. 质检通过 → 状态: qc_pass            │');
console.log('   │    ↓ 财务处理                          │');
console.log('   │ 5. 财务发起退款 → 状态: refund_processing │');
console.log('   │    ↓ 确认到账                          │');
console.log('   │ 6. 退款完成 → 状态: completed          │');
console.log('   └─────────────────────────────────────────┘\n');

const testFlow = () => {
  let afterSaleStatus = 'pending_review';
  let inventoryStatus = 'pending';
  
  console.log('   流程步骤验证:');
  
  afterSaleStatus = 'pending_inventory';
  inventoryStatus = 'pending';
  let refundCheck = canInitiateRefund(afterSaleStatus, inventoryStatus);
  assert(refundCheck.canRefund === false, '待入库时不能退款');
  console.log(`   ✅ 步骤2后: 状态=${statusLabels[afterSaleStatus]}, 入库=${checkInventoryReceived(inventoryStatus).message}`);
  console.log(`      退款检查: ${refundCheck.reason}`);
  
  afterSaleStatus = 'inventory_received';
  inventoryStatus = 'received';
  refundCheck = canInitiateRefund('pending_refund', inventoryStatus);
  assert(refundCheck.canRefund === false, '待质检时不能退款');
  console.log(`   ✅ 步骤3后: 状态=${statusLabels[afterSaleStatus]}, 入库=${checkInventoryReceived(inventoryStatus).message}`);
  console.log(`      退款检查: ${refundCheck.reason}`);
  
  afterSaleStatus = 'pending_refund';
  inventoryStatus = 'qc_pass';
  refundCheck = canInitiateRefund(afterSaleStatus, inventoryStatus);
  assert(refundCheck.canRefund === true, '质检通过后可以退款');
  console.log(`   ✅ 步骤4后: 状态=${statusLabels[afterSaleStatus]}, 入库=${checkInventoryReceived(inventoryStatus).message}`);
  console.log(`      退款检查: ${refundCheck.reason}`);
  
  afterSaleStatus = 'completed';
  console.log(`   ✅ 步骤6后: 状态=${statusLabels[afterSaleStatus]}, 流程完成`);
  
  return true;
};

test('完整协同流程验证', testFlow);

console.log('\n========================================');
console.log(`   测试完成: ${passed} 通过, ${failed} 失败`);
console.log('========================================');

if (failed > 0) {
  process.exit(1);
}

console.log('\n✅ 所有业务规则验证通过！');
console.log('\n核心业务规则总结:');
console.log('  1. 超过售后期的订单无法申请售后');
console.log('  2. 退货未完成入库（待入库/待质检/质检拒收）时，财务无法发起退款');
console.log('  3. 质检拒收的商品需退回客户，售后单关闭');
console.log('  4. 问题商品数量超过阈值时触发预警和下架提醒');
console.log('  5. 退款失败可选择挂账，后续可重试');
console.log('  6. 四角色（客服/仓库/主播运营/财务）在同一张售后单上协同');
