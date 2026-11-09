const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const net = require('net');
const app = require('../server/index');
const { readDB } = require('../server/store');

// Mock in-memory HTTP request handler for Express
function request(method, url, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const req = new http.IncomingMessage(socket);
    req.method = method;
    req.url = url;
    req.headers = { 'content-type': 'application/json' };
    if (token) {
      req.headers['authorization'] = `Bearer ${token}`;
    }

    if (body !== null && body !== undefined) {
      const buf = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
      req.headers['content-length'] = String(buf.length);
      req.push(buf);
    }
    req.push(null);

    const res = new http.ServerResponse(req);
    let resBody = '';

    res.write = (chunk) => {
      if (chunk) resBody += chunk;
      return true;
    };

    res.end = (chunk) => {
      if (chunk) resBody += chunk;
      let parsed = resBody;
      try {
        parsed = JSON.parse(resBody);
      } catch (e) {}
      resolve({ status: res.statusCode, body: parsed });
    };

    try {
      app(req, res);
    } catch (err) {
      reject(err);
    }
  });
}

test('ADMIN SUITE: Phân quyền và Bảo vệ Route', async () => {
  // 1. Không có token -> 401
  const resNoAuth = await request('GET', '/api/admin/stats');
  assert.equal(resNoAuth.status, 401);

  // 2. Đăng ký & đăng nhập với User thường
  await request('POST', '/api/register', {
    name: 'Test Regular User',
    email: 'testuser_perm@example.com',
    password: 'password123'
  });

  const loginUserRes = await request('POST', '/api/login', {
    email: 'testuser_perm@example.com',
    password: 'password123'
  });
  assert.equal(loginUserRes.status, 200);
  const userToken = loginUserRes.body.token;

  // User thường truy cập route admin -> 403 Forbidden
  const resForbidden = await request('GET', '/api/admin/stats', null, userToken);
  assert.equal(resForbidden.status, 403);

  // 3. Đăng nhập với Admin
  const loginAdminRes = await request('POST', '/api/login', {
    email: 'admin@mini.vn',
    password: 'Admin123!'
  });
  assert.equal(loginAdminRes.status, 200);
  assert.equal(loginAdminRes.body.user.role, 'admin');
  const adminToken = loginAdminRes.body.token;

  // Admin truy cập hợp lệ -> 200 OK
  const resAdminStats = await request('GET', '/api/admin/stats', null, adminToken);
  assert.equal(resAdminStats.status, 200);
  assert.ok(resAdminStats.body.metrics);
  assert.ok(typeof resAdminStats.body.metrics.totalRevenue === 'number');
  assert.ok(Array.isArray(resAdminStats.body.revenueByDate));
  assert.ok(Array.isArray(resAdminStats.body.topMovies));
});

test('ADMIN SUITE: Quản lý Phim CRUD', async () => {
  const loginAdmin = await request('POST', '/api/login', {
    email: 'admin@mini.vn',
    password: 'Admin123!'
  });
  const token = loginAdmin.body.token;

  // Tạo phim mới
  const newMovie = {
    title: 'Phim Test Admin 2026',
    genre: 'Khoa học viễn tưởng',
    duration: 125,
    description: 'Mô tả phim thử nghiệm quản trị viên.',
    director: 'Đạo diễn A',
    actors: 'Diễn viên B, Diễn viên C',
    releaseDate: '2026-11-09',
    status: 'now_showing',
    poster: 'https://example.com/poster.jpg'
  };

  const createRes = await request('POST', '/api/movies', newMovie, token);
  assert.equal(createRes.status, 201);
  const createdId = createRes.body.id;
  assert.equal(createRes.body.title, newMovie.title);

  // Sửa phim
  const updateRes = await request('PUT', `/api/movies/${createdId}`, {
    ...newMovie,
    title: 'Phim Test Admin Đã Cập Nhật',
    duration: 130
  }, token);
  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.body.title, 'Phim Test Admin Đã Cập Nhật');

  // Lọc phim
  const filterRes = await request('GET', '/api/movies?search=Cập Nhật');
  assert.equal(filterRes.status, 200);
  assert.ok(filterRes.body.some(m => m.id === createdId));

  // Xóa phim vừa tạo
  const delRes = await request('DELETE', `/api/movies/${createdId}`, null, token);
  assert.equal(delRes.status, 200);
});

test('ADMIN SUITE: Quản lý Suất chiếu & Kiểm tra trùng lịch cùng phòng', async () => {
  const loginAdmin = await request('POST', '/api/login', {
    email: 'admin@mini.vn',
    password: 'Admin123!'
  });
  const token = loginAdmin.body.token;

  const testDate = `2027-01-${String(Math.floor(Math.random() * 25) + 1).padStart(2, '0')}`;

  let show1Id = null;
  let showDiffId = null;

  try {
    // Tạo suất chiếu 1: 09:00 - 11:30 Phòng 1
    const show1 = {
      movieId: 'm1',
      roomId: 'r1',
      room: 'Phòng 1',
      date: testDate,
      startTime: '09:00',
      endTime: '11:30',
      price: 80000
    };
    const res1 = await request('POST', '/api/showtimes', show1, token);
    assert.equal(res1.status, 201);
    show1Id = res1.body.id;

    // Tạo suất chiếu 2: Trùng giờ (10:00 - 12:00) tại cùng Phòng 1 -> Phải bị từ chối 409
    const showOverlap = {
      movieId: 'm2',
      roomId: 'r1',
      room: 'Phòng 1',
      date: testDate,
      startTime: '10:00',
      endTime: '12:00',
      price: 85000
    };
    const resOverlap = await request('POST', '/api/showtimes', showOverlap, token);
    assert.equal(resOverlap.status, 409);
    assert.ok(resOverlap.body.error.includes('trùng lịch'));

    // Tạo suất chiếu 3: Khác phòng (Phòng 2) cùng giờ -> Thành công
    const showDifferentRoom = {
      movieId: 'm2',
      roomId: 'r2',
      room: 'Phòng 2',
      date: testDate,
      startTime: '09:00',
      endTime: '11:30',
      price: 85000
    };
    const resDiffRoom = await request('POST', '/api/showtimes', showDifferentRoom, token);
    assert.equal(resDiffRoom.status, 201);
    showDiffId = resDiffRoom.body.id;
  } finally {
    if (show1Id) {
      await request('DELETE', `/api/showtimes/${show1Id}?force=true`, null, token);
    }
    if (showDiffId) {
      await request('DELETE', `/api/showtimes/${showDiffId}?force=true`, null, token);
    }
  }
});

test('ADMIN SUITE: Quản lý Người dùng & Khóa/Mở tài khoản', async () => {
  const loginAdmin = await request('POST', '/api/login', {
    email: 'admin@mini.vn',
    password: 'Admin123!'
  });
  const token = loginAdmin.body.token;

  // Tạo tài khoản test để khóa
  const testEmail = `lock_test_${Date.now()}@example.com`;
  await request('POST', '/api/register', {
    name: 'Khách Khóa Test',
    email: testEmail,
    password: 'Password123'
  });

  const db = readDB();
  const testUser = db.users.find(u => u.email === testEmail);
  assert.ok(testUser);

  // Khóa tài khoản
  const lockRes = await request('PUT', `/api/admin/users/${testUser.id}/status`, { status: 'locked' }, token);
  assert.equal(lockRes.status, 200);
  assert.equal(lockRes.body.status, 'locked');

  // Thử đăng nhập bằng tài khoản bị khóa -> 403 Forbidden
  const loginLocked = await request('POST', '/api/login', {
    email: testEmail,
    password: 'Password123'
  });
  assert.equal(loginLocked.status, 403);
  assert.ok(loginLocked.body.error.includes('bị khóa'));

  // Mở khóa tài khoản
  const unlockRes = await request('PUT', `/api/admin/users/${testUser.id}/status`, { status: 'active' }, token);
  assert.equal(unlockRes.status, 200);
  assert.equal(unlockRes.body.status, 'active');

  // Đăng nhập lại thành công
  const loginUnlocked = await request('POST', '/api/login', {
    email: testEmail,
    password: 'Password123'
  });
  assert.equal(loginUnlocked.status, 200);
});

test('ADMIN SUITE: Quản lý Khuyến mãi & Áp dụng mã giảm giá', async () => {
  const loginAdmin = await request('POST', '/api/login', {
    email: 'admin@mini.vn',
    password: 'Admin123!'
  });
  const token = loginAdmin.body.token;

  // Tạo mã khuyến mãi mới
  const promoCode = `TESTPROMO${Date.now().toString().slice(-4)}`;
  const createPromo = await request('POST', '/api/admin/promotions', {
    code: promoCode,
    description: 'Giảm 50% thử nghiệm',
    discountType: 'percent',
    discountValue: 50,
    minSpend: 50000,
    maxDiscount: 40000,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    maxUsage: 10
  }, token);
  assert.equal(createPromo.status, 201);
  const promoId = createPromo.body.id;

  // Áp dụng mã giảm giá cho đơn giá 100.000đ (50% = 50.000đ, max = 40.000đ -> giảm 40.000đ)
  const applyRes = await request('POST', '/api/promotions/apply', {
    code: promoCode,
    price: 100000
  });
  assert.equal(applyRes.status, 200);
  assert.equal(applyRes.body.discount, 40000);
  assert.equal(applyRes.body.finalPrice, 60000);

  // Xóa mã khuyến mãi
  const delPromo = await request('DELETE', `/api/admin/promotions/${promoId}`, null, token);
  assert.equal(delPromo.status, 200);
});

test('ADMIN SUITE: Quản lý Phòng chiếu, Ghế & Đơn Đặt Vé Hoàn Tiền', async () => {
  const loginAdmin = await request('POST', '/api/login', {
    email: 'admin@mini.vn',
    password: 'Admin123!'
  });
  const token = loginAdmin.body.token;

  // 1. Quản lý phòng chiếu
  const newRoomName = `Phòng Test ${Date.now().toString().slice(-4)}`;
  const createRoom = await request('POST', '/api/rooms', {
    name: newRoomName,
    type: '3D IMAX VIP',
    rows: 4,
    cols: 8,
    status: 'active'
  }, token);
  assert.equal(createRoom.status, 201);
  const roomId = createRoom.body.id;

  // Cập nhật cấu hình ghế của phòng
  const updateSeat = await request('PUT', `/api/rooms/${roomId}/seats`, {
    seatTypes: { 'A': 'standard', 'B': 'vip', 'C': 'vip', 'D': 'couple' },
    disabledSeats: ['A1', 'A2']
  }, token);
  assert.equal(updateSeat.status, 200);
  assert.deepEqual(updateSeat.body.disabledSeats, ['A1', 'A2']);

  // 2. Quản lý đơn đặt vé & Hoàn tiền
  const bookingsRes = await request('GET', '/api/admin/bookings', null, token);
  assert.equal(bookingsRes.status, 200);
  assert.ok(Array.isArray(bookingsRes.body));

  if (bookingsRes.body.length > 0) {
    const firstBooking = bookingsRes.body[0];
    const detailRes = await request('GET', `/api/admin/bookings/${firstBooking.id}`, null, token);
    assert.equal(detailRes.status, 200);
    assert.equal(detailRes.body.id, firstBooking.id);
  }

  // 3. Upload ảnh poster (base64)
  const fakePngBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const uploadRes = await request('POST', '/api/admin/upload-image', { data: fakePngBase64 }, token);
  assert.equal(uploadRes.status, 200);
  assert.ok(uploadRes.body.url.startsWith('/uploads/'));

  // Dọn dẹp phòng test
  await request('DELETE', `/api/rooms/${roomId}`, null, token);
});
