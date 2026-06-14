import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (username, password) => api.post('/auth/login', { username, password }),
  getRoles: () => api.get('/auth/roles')
};

export const customerServiceApi = {
  getOrders: (params) => api.get('/customer-service/orders', { params }),
  getOrderDetail: (orderNo) => api.get(`/customer-service/orders/${orderNo}`),
  createAfterSale: (data) => api.post('/customer-service/after-sale', data),
  getAfterSales: (params) => api.get('/customer-service/after-sale', { params }),
  getAfterSaleDetail: (afterSaleNo) => api.get(`/customer-service/after-sale/${afterSaleNo}`),
  reviewAfterSale: (afterSaleNo, data) => api.post(`/customer-service/after-sale/${afterSaleNo}/review`, data),
  updateAfterSale: (afterSaleNo, data) => api.put(`/customer-service/after-sale/${afterSaleNo}`, data)
};

export const warehouseApi = {
  getInventory: (params) => api.get('/warehouse/inventory', { params }),
  getInventoryDetail: (inventoryNo) => api.get(`/warehouse/inventory/${inventoryNo}`),
  receiveInventory: (inventoryNo, data) => api.post(`/warehouse/inventory/${inventoryNo}/receive`, data),
  qcInventory: (inventoryNo, data) => api.post(`/warehouse/inventory/${inventoryNo}/qc`, data),
  returnToCustomer: (inventoryNo) => api.post(`/warehouse/inventory/${inventoryNo}/return-customer`),
  getStatistics: () => api.get('/warehouse/statistics')
};

export const anchorOpsApi = {
  getProductStats: (params) => api.get('/anchor-ops/products/stats', { params }),
  getProductDetail: (productId) => api.get(`/anchor-ops/products/${productId}`),
  batchRecall: (data) => api.post('/anchor-ops/products/batch-recall', data),
  triggerRemoval: (productId, data) => api.post(`/anchor-ops/products/${productId}/trigger-removal`, data),
  getRemovalReminders: (params) => api.get('/anchor-ops/removal-reminders', { params }),
  handleRemovalReminder: (reminderNo, data) => api.post(`/anchor-ops/removal-reminders/${reminderNo}/handle`, data),
  attributeResponsibility: (afterSaleNo, data) => api.post(`/anchor-ops/after-sale/${afterSaleNo}/attribute-responsibility`, data),
  getSessions: (params) => api.get('/anchor-ops/sessions', { params }),
  getSessionDetail: (sessionId) => api.get(`/anchor-ops/sessions/${sessionId}`),
  getDashboard: () => api.get('/anchor-ops/dashboard')
};

export const financeApi = {
  getPendingRefunds: (params) => api.get('/finance/refunds/pending', { params }),
  getRefunds: (params) => api.get('/finance/refunds', { params }),
  getRefundDetail: (refundNo) => api.get(`/finance/refunds/${refundNo}`),
  initiateRefund: (data) => api.post('/finance/refunds/initiate', data),
  confirmRefund: (refundNo, data) => api.post(`/finance/refunds/${refundNo}/confirm`, data),
  failRefund: (refundNo, data) => api.post(`/finance/refunds/${refundNo}/fail`, data),
  retryRefund: (refundNo, data) => api.post(`/finance/refunds/${refundNo}/retry`, data),
  getReconciliation: (params) => api.get('/finance/reconciliation', { params }),
  getStatistics: () => api.get('/finance/statistics')
};

export const commonApi = {
  getAuditLogs: (params) => api.get('/common/audit-logs', { params }),
  getProducts: (params) => api.get('/common/products', { params }),
  getAnchorSessions: () => api.get('/common/anchor-sessions'),
  getDashboardStats: () => api.get('/common/dashboard/stats')
};

export default api;
