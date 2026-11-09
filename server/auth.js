// THANH VIEN 2: Dang ky, dang nhap, xac thuc phien
const crypto = require('crypto');
const { readDB, writeDB } = require('./store');

const tokens = new Map(); // Phien dang nhap trong bo nho; khoi dong lai se dang xuat
const hash = (password, salt) => crypto.scryptSync(password, salt, 64).toString('hex');

function register(req, res) {
  const { name, email, password } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email) || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Nhập họ tên, email hợp lệ và mật khẩu từ 6 ký tự.' });
  }

  const db = readDB();
  if (db.users.some(u => u.email === email.trim().toLowerCase())) {
    return res.status(409).json({ error: 'Email đã được sử dụng.' });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const user = {
    id: crypto.randomUUID(),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    salt,
    passwordHash: hash(password, salt),
    role: 'user',
    status: 'active',
    createdAt: new Date().toISOString()
  };

  db.users.push(user);
  writeDB(db);

  return res.status(201).json({ message: 'Đăng ký thành công.', user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}

function login(req, res) {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Nhập email và mật khẩu.' });
  }

  const db = readDB();
  const u = db.users.find(x => x.email === email.trim().toLowerCase());
  if (!u || hash(password, u.salt) !== u.passwordHash) {
    return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng.' });
  }

  if (u.status === 'locked') {
    return res.status(403).json({ error: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  tokens.set(token, u.id);

  return res.json({
    token,
    user: { id: u.id, name: u.name, email: u.email, role: u.role, status: u.status || 'active' }
  });
}

function authenticate(req, res, next) {
  const token = (req.get('Authorization') || '').replace(/^Bearer /, '').trim();
  const id = tokens.get(token);
  const u = id && readDB().users.find(x => x.id === id);

  if (!u) {
    return res.status(401).json({ error: 'Bạn cần đăng nhập.' });
  }

  if (u.status === 'locked') {
    tokens.delete(token);
    return res.status(403).json({ error: 'Tài khoản của bạn đã bị khóa.' });
  }

  req.user = u;
  req.token = token;
  next();
}

function admin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Chỉ quản trị viên mới được thao tác.' });
  }
  next();
}

module.exports = { register, login, authenticate, admin, tokens, hash };
