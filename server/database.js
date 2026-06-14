const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, '../data/aftersales.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT,
      price REAL NOT NULL,
      threshold INTEGER DEFAULT 3,
      status TEXT DEFAULT 'on_sale',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS anchor_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_no TEXT UNIQUE NOT NULL,
      anchor_name TEXT NOT NULL,
      start_time DATETIME NOT NULL,
      end_time DATETIME,
      status TEXT DEFAULT 'ongoing',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT UNIQUE NOT NULL,
      user_name TEXT NOT NULL,
      user_phone TEXT NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      product_sku TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      total_amount REAL NOT NULL,
      anchor_session_id INTEGER,
      anchor_name TEXT,
      pay_time DATETIME NOT NULL,
      after_sale_deadline DATETIME NOT NULL,
      order_status TEXT DEFAULT 'completed',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (anchor_session_id) REFERENCES anchor_sessions(id)
    );

    CREATE TABLE IF NOT EXISTS after_sale_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      after_sale_no TEXT UNIQUE NOT NULL,
      order_no TEXT NOT NULL,
      order_snapshot_id INTEGER NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      type TEXT NOT NULL,
      reason TEXT NOT NULL,
      description TEXT,
      images TEXT,
      status TEXT NOT NULL DEFAULT 'pending_review',
      cs_id INTEGER,
      cs_name TEXT,
      warehouse_id INTEGER,
      warehouse_name TEXT,
      finance_id INTEGER,
      finance_name TEXT,
      anchor_op_id INTEGER,
      anchor_op_name TEXT,
      qc_result TEXT,
      qc_description TEXT,
      refund_amount REAL,
      refund_channel TEXT,
      shipping_fee REAL,
      shipping_bearer TEXT,
      responsibility TEXT,
      is_hung INTEGER DEFAULT 0,
      hung_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_snapshot_id) REFERENCES order_snapshots(id),
      FOREIGN KEY (cs_id) REFERENCES users(id),
      FOREIGN KEY (warehouse_id) REFERENCES users(id),
      FOREIGN KEY (finance_id) REFERENCES users(id),
      FOREIGN KEY (anchor_op_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS inventory_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventory_no TEXT UNIQUE NOT NULL,
      after_sale_no TEXT NOT NULL,
      order_no TEXT NOT NULL,
      product_id INTEGER NOT NULL,
      product_sku TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      received_time DATETIME,
      warehouse_operator_id INTEGER,
      warehouse_operator_name TEXT,
      qc_time DATETIME,
      qc_operator_id INTEGER,
      qc_operator_name TEXT,
      qc_result TEXT,
      qc_description TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (after_sale_no) REFERENCES after_sale_versions(after_sale_no),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (warehouse_operator_id) REFERENCES users(id),
      FOREIGN KEY (qc_operator_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS refund_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      refund_no TEXT UNIQUE NOT NULL,
      after_sale_no TEXT NOT NULL,
      order_no TEXT NOT NULL,
      amount REAL NOT NULL,
      channel TEXT NOT NULL,
      operator_id INTEGER,
      operator_name TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      failed_reason TEXT,
      is_hung INTEGER DEFAULT 0,
      hung_reason TEXT,
      transaction_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      processed_at DATETIME,
      FOREIGN KEY (after_sale_no) REFERENCES after_sale_versions(after_sale_no),
      FOREIGN KEY (operator_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS product_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER UNIQUE NOT NULL,
      product_sku TEXT NOT NULL,
      product_name TEXT NOT NULL,
      total_issues INTEGER DEFAULT 0,
      return_count INTEGER DEFAULT 0,
      quality_issue_count INTEGER DEFAULT 0,
      description_issue_count INTEGER DEFAULT 0,
      other_issue_count INTEGER DEFAULT 0,
      last_issue_time DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS removal_reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reminder_no TEXT UNIQUE NOT NULL,
      product_id INTEGER NOT NULL,
      product_sku TEXT NOT NULL,
      product_name TEXT NOT NULL,
      issue_count INTEGER NOT NULL,
      threshold INTEGER NOT NULL,
      anchor_session_id INTEGER,
      anchor_name TEXT,
      triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'pending',
      operator_id INTEGER,
      operator_name TEXT,
      handled_at DATETIME,
      action_taken TEXT,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (anchor_session_id) REFERENCES anchor_sessions(id),
      FOREIGN KEY (operator_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      log_no TEXT UNIQUE NOT NULL,
      operator_id INTEGER,
      operator_name TEXT,
      operator_role TEXT,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      before_data TEXT,
      after_data TEXT,
      ip TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (operator_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_after_sale_order_no ON after_sale_versions(order_no);
    CREATE INDEX IF NOT EXISTS idx_after_sale_status ON after_sale_versions(status);
    CREATE INDEX IF NOT EXISTS idx_inventory_after_sale_no ON inventory_records(after_sale_no);
    CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory_records(status);
    CREATE INDEX IF NOT EXISTS idx_refund_after_sale_no ON refund_records(after_sale_no);
    CREATE INDEX IF NOT EXISTS idx_refund_status ON refund_records(status);
    CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_logs(target_type, target_id);
  `);

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    const salt = bcrypt.genSaltSync(10);
    const users = [
      { username: 'kefu', password: bcrypt.hashSync('123456', salt), role: 'customer_service', name: '张客服' },
      { username: 'cangku', password: bcrypt.hashSync('123456', salt), role: 'warehouse', name: '李仓库' },
      { username: 'zhubo', password: bcrypt.hashSync('123456', salt), role: 'anchor_ops', name: '王运营' },
      { username: 'caiwu', password: bcrypt.hashSync('123456', salt), role: 'finance', name: '赵财务' },
    ];
    const insertUser = db.prepare('INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)');
    users.forEach(u => insertUser.run(u.username, u.password, u.role, u.name));
  }

  const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  if (productCount === 0) {
    const products = [
      { sku: 'SKU001', name: '直播间专属保湿面膜', category: '美妆', price: 99.00, threshold: 3 },
      { sku: 'SKU002', name: '网红款运动蓝牙耳机', category: '数码', price: 299.00, threshold: 2 },
      { sku: 'SKU003', name: '夏季薄款防晒衣', category: '服装', price: 159.00, threshold: 3 },
      { sku: 'SKU004', name: '多功能养生壶', category: '家电', price: 199.00, threshold: 2 },
      { sku: 'SKU005', name: '进口零食大礼包', category: '食品', price: 128.00, threshold: 5 },
    ];
    const insertProduct = db.prepare('INSERT INTO products (sku, name, category, price, threshold) VALUES (?, ?, ?, ?, ?)');
    products.forEach(p => insertProduct.run(p.sku, p.name, p.category, p.price, p.threshold));
  }

  const sessionCount = db.prepare('SELECT COUNT(*) as count FROM anchor_sessions').get().count;
  if (sessionCount === 0) {
    const sessions = [
      { session_no: 'LIVE2024061401', anchor_name: '美妆小达人', start_time: '2024-06-14 19:00:00', end_time: '2024-06-14 23:00:00', status: 'completed' },
      { session_no: 'LIVE2024061402', anchor_name: '数码测评君', start_time: '2024-06-14 20:00:00', status: 'ongoing' },
    ];
    const insertSession = db.prepare('INSERT INTO anchor_sessions (session_no, anchor_name, start_time, end_time, status) VALUES (?, ?, ?, ?, ?)');
    sessions.forEach(s => insertSession.run(s.session_no, s.anchor_name, s.start_time, s.end_time, s.status));
  }

  const orderCount = db.prepare('SELECT COUNT(*) as count FROM order_snapshots').get().count;
  if (orderCount === 0) {
    const dayjs = require('dayjs');
    const orders = [
      { order_no: 'ORD20240610001', user_name: '王小明', user_phone: '13800138001', product_id: 1, product_name: '直播间专属保湿面膜', product_sku: 'SKU001', quantity: 2, unit_price: 99.00, total_amount: 198.00, anchor_session_id: 1, anchor_name: '美妆小达人', pay_time: dayjs().subtract(5, 'day').format('YYYY-MM-DD HH:mm:ss'), after_sale_deadline: dayjs().add(2, 'day').format('YYYY-MM-DD HH:mm:ss') },
      { order_no: 'ORD20240610002', user_name: '李小红', user_phone: '13800138002', product_id: 2, product_name: '网红款运动蓝牙耳机', product_sku: 'SKU002', quantity: 1, unit_price: 299.00, total_amount: 299.00, anchor_session_id: 2, anchor_name: '数码测评君', pay_time: dayjs().subtract(10, 'day').format('YYYY-MM-DD HH:mm:ss'), after_sale_deadline: dayjs().subtract(3, 'day').format('YYYY-MM-DD HH:mm:ss') },
      { order_no: 'ORD20240610003', user_name: '张小华', user_phone: '13800138003', product_id: 3, product_name: '夏季薄款防晒衣', product_sku: 'SKU003', quantity: 1, unit_price: 159.00, total_amount: 159.00, anchor_session_id: 1, anchor_name: '美妆小达人', pay_time: dayjs().subtract(3, 'day').format('YYYY-MM-DD HH:mm:ss'), after_sale_deadline: dayjs().add(4, 'day').format('YYYY-MM-DD HH:mm:ss') },
      { order_no: 'ORD20240610004', user_name: '刘小芳', user_phone: '13800138004', product_id: 2, product_name: '网红款运动蓝牙耳机', product_sku: 'SKU002', quantity: 1, unit_price: 299.00, total_amount: 299.00, anchor_session_id: 2, anchor_name: '数码测评君', pay_time: dayjs().subtract(4, 'day').format('YYYY-MM-DD HH:mm:ss'), after_sale_deadline: dayjs().add(3, 'day').format('YYYY-MM-DD HH:mm:ss') },
      { order_no: 'ORD20240610005', user_name: '陈大伟', user_phone: '13800138005', product_id: 4, product_name: '多功能养生壶', product_sku: 'SKU004', quantity: 1, unit_price: 199.00, total_amount: 199.00, anchor_session_id: 1, anchor_name: '美妆小达人', pay_time: dayjs().subtract(6, 'day').format('YYYY-MM-DD HH:mm:ss'), after_sale_deadline: dayjs().add(1, 'day').format('YYYY-MM-DD HH:mm:ss') },
    ];
    const insertOrder = db.prepare('INSERT INTO order_snapshots (order_no, user_name, user_phone, product_id, product_name, product_sku, quantity, unit_price, total_amount, anchor_session_id, anchor_name, pay_time, after_sale_deadline) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    orders.forEach(o => insertOrder.run(o.order_no, o.user_name, o.user_phone, o.product_id, o.product_name, o.product_sku, o.quantity, o.unit_price, o.total_amount, o.anchor_session_id, o.anchor_name, o.pay_time, o.after_sale_deadline));
  }
}

initDatabase();

module.exports = db;
