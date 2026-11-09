// ==============================================================================
// MINI CINEMA — BACKEND API SERVER (NODE.JS & EXPRESS)
// ==============================================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { readDB, writeDB } = require('./store');
const { register, login, authenticate, admin, tokens } = require('./auth');

const app = express();

// Cho phép payload JSON lên đến 10MB (hỗ trợ upload ảnh dạng Base64)
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
require('./cinemaExtras')(app);

// Đảm bảo thư mục uploads tồn tại
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Đường dẫn tiện ích mở trang Quản trị
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

// Helper: Chuyển HH:mm thành số phút từ đầu ngày
function timeToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const parts = timeStr.trim().split(':');
    return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
}

// Helper: Chuyển số phút thành định dạng HH:mm
function minutesToTime(mins) {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ==============================================================================
// 1. AUTHENTICATION & PHÂN QUYỀN
// ==============================================================================

app.post('/api/register', register);
app.post('/api/login', login);

app.post('/api/logout', authenticate, (req, res) => {
    tokens.delete(req.token);
    res.json({ message: 'Đã đăng xuất.' });
});

// Kiểm tra thông tin người dùng đang đăng nhập
app.get('/api/auth/me', authenticate, (req, res) => {
    res.json({
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        status: req.user.status || 'active'
    });
});

// Kiểm tra phiên đăng nhập quản trị viên
app.get('/api/admin/check-auth', authenticate, admin, (req, res) => {
    res.json({
        ok: true,
        user: {
            id: req.user.id,
            name: req.user.name,
            email: req.user.email,
            role: req.user.role
        }
    });
});

// ==============================================================================
// 2. DASHBOARD THỐNG KÊ (ADMIN)
// ==============================================================================

app.get('/api/admin/stats', authenticate, admin, (req, res) => {
    const db = readDB();

    const movies = db.movies || [];
    const users = db.users || [];
    const showtimes = db.showtimes || [];
    const bookings = db.bookings || [];

    // Tổng số phim
    const totalMovies = movies.length;
    const activeMovies = movies.filter(m => m.status !== 'ended').length;

    // Tổng số người dùng
    const totalUsers = users.length;
    const activeUsers = users.filter(u => u.status !== 'locked').length;
    const lockedUsers = users.filter(u => u.status === 'locked').length;

    // Thống kê vé
    const totalBookings = bookings.length;
    const confirmedBookings = bookings.filter(b => b.status === 'confirmed');
    const cancelledBookings = bookings.filter(b => b.status === 'cancelled');
    const refundedBookings = bookings.filter(b => b.status === 'refunded');

    // Tổng doanh thu (từ các vé confirmed)
    const totalRevenue = confirmedBookings.reduce((sum, b) => sum + (Number(b.finalPrice ?? b.price) || 0), 0);

    // Suất chiếu
    const totalShowtimes = showtimes.length;

    // Thống kê doanh thu theo ngày (7 ngày gần nhất)
    const revenueByDateMap = {};
    const ticketsByDateMap = {};

    // Khởi tạo 7 ngày gần nhất
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateKey = d.toISOString().split('T')[0];
        revenueByDateMap[dateKey] = 0;
        ticketsByDateMap[dateKey] = 0;
    }

    confirmedBookings.forEach(b => {
        if (!b.createdAt) return;
        const dateKey = b.createdAt.split('T')[0];
        if (revenueByDateMap[dateKey] !== undefined) {
            revenueByDateMap[dateKey] += Number(b.finalPrice ?? b.price) || 0;
            ticketsByDateMap[dateKey] += 1;
        }
    });

    const revenueByDate = Object.keys(revenueByDateMap).map(date => ({
        date,
        label: date.slice(5),
        revenue: revenueByDateMap[date],
        tickets: ticketsByDateMap[date]
    }));

    // Thống kê doanh thu 12 tháng
    const currentYear = now.getFullYear();
    const revenueByMonth = Array.from({ length: 12 }, (_, i) => {
        const monthNum = i + 1;
        const monthStr = `${currentYear}-${String(monthNum).padStart(2, '0')}`;
        const monthBookings = confirmedBookings.filter(b => b.createdAt && b.createdAt.startsWith(monthStr));
        const monthRev = monthBookings.reduce((s, b) => s + (Number(b.finalPrice ?? b.price) || 0), 0);
        return {
            month: `Th${monthNum}`,
            revenue: monthRev,
            tickets: monthBookings.length
        };
    });

    // Thống kê doanh thu theo năm (3 năm gần nhất)
    const revenueByYear = [currentYear - 2, currentYear - 1, currentYear].map(year => {
        const yrStr = String(year);
        const yrBookings = confirmedBookings.filter(b => b.createdAt && b.createdAt.startsWith(yrStr));
        return {
            year: yrStr,
            revenue: yrBookings.reduce((s, b) => s + (Number(b.finalPrice ?? b.price) || 0), 0),
            tickets: yrBookings.length
        };
    });

    // Danh sách phim đang được đặt vé nhiều nhất
    const movieBookingCounts = {};
    confirmedBookings.forEach(b => {
        const show = showtimes.find(s => s.id === b.showtimeId);
        const movieId = show ? show.movieId : 'unknown';
        if (!movieBookingCounts[movieId]) {
            movieBookingCounts[movieId] = { count: 0, revenue: 0 };
        }
        movieBookingCounts[movieId].count += 1;
        movieBookingCounts[movieId].revenue += Number(b.finalPrice ?? b.price) || 0;
    });

    const topMovies = Object.keys(movieBookingCounts)
        .map(movieId => {
            const m = movies.find(x => x.id === movieId);
            return {
                id: movieId,
                title: m ? m.title : 'Phim khác',
                genre: m ? m.genre : '',
                poster: m ? (m.poster || '') : '',
                tickets: movieBookingCounts[movieId].count,
                revenue: movieBookingCounts[movieId].revenue,
                percentage: totalBookings > 0 ? Math.round((movieBookingCounts[movieId].count / confirmedBookings.length) * 100) : 0
            };
        })
        .sort((a, b) => b.tickets - a.tickets)
        .slice(0, 5);

    // Giao dịch gần đây (10 giao dịch mới nhất)
    const recentBookings = bookings
        .slice()
        .reverse()
        .slice(0, 10)
        .map(b => {
            const user = users.find(u => u.id === b.userId);
            const show = showtimes.find(s => s.id === b.showtimeId);
            const movie = show ? movies.find(m => m.id === show.movieId) : null;
            return {
                id: b.id,
                userName: user ? user.name : 'Khách vãng lai',
                userEmail: user ? user.email : '',
                movieTitle: movie ? movie.title : 'Phim đã xóa',
                showtime: show ? (show.time || `${show.date} ${show.startTime}`) : 'Suất chiếu',
                room: show ? (show.room || 'Phòng 1') : '',
                seat: b.seat,
                price: Number(b.finalPrice ?? b.price) || 0,
                status: b.status || 'confirmed',
                paymentStatus: b.paymentStatus || 'paid',
                createdAt: b.createdAt
            };
        });

    res.json({
        metrics: {
            totalMovies,
            activeMovies,
            totalUsers,
            activeUsers,
            lockedUsers,
            totalBookings,
            confirmedBookings: confirmedBookings.length,
            cancelledBookings: cancelledBookings.length,
            refundedBookings: refundedBookings.length,
            totalRevenue,
            totalShowtimes
        },
        revenueByDate,
        revenueByMonth,
        revenueByYear,
        topMovies,
        recentBookings
    });
});

// ==============================================================================
// 3. QUẢN LÝ PHIM
// ==============================================================================

// Lấy danh sách phim (Public)
app.get('/api/movies', (req, res) => {
    let movies = readDB().movies || [];
    const { search, genre, status } = req.query || {};

    if (search) {
        const kw = search.trim().toLowerCase();
        movies = movies.filter(m => m.title.toLowerCase().includes(kw));
    }
    if (genre) {
        movies = movies.filter(m => m.genre && m.genre.toLowerCase().includes(genre.trim().toLowerCase()));
    }
    if (status) {
        movies = movies.filter(m => m.status === status);
    }

    res.json(movies);
});

// Lấy chi tiết một phim
app.get('/api/movies/:id', (req, res) => {
    const movie = (readDB().movies || []).find(m => m.id === req.params.id);
    if (!movie) return res.status(404).json({ error: 'Không tìm thấy phim.' });
    res.json(movie);
});

// Thêm phim mới (Admin)
app.post('/api/movies', authenticate, admin, (req, res) => {
    const {
        title, genre, duration, description,
        poster, banner, director, actors, releaseDate, status, trailer
    } = req.body || {};

    if (!title || typeof title !== 'string' || !title.trim() ||
        !genre || typeof genre !== 'string' || !genre.trim() ||
        !Number.isInteger(Number(duration)) || Number(duration) < 1 || Number(duration) > 400) {
        return res.status(400).json({ error: 'Vui lòng nhập tên phim, thể loại hợp lệ và thời lượng từ 1 - 400 phút.' });
    }

    const db = readDB();
    const movie = {
        id: crypto.randomUUID(),
        title: title.trim(),
        genre: genre.trim(),
        duration: Number(duration),
        description: typeof description === 'string' ? description.trim() : '',
        poster: typeof poster === 'string' ? poster.trim() : '',
        banner: typeof banner === 'string' ? banner.trim() : '',
        director: typeof director === 'string' ? director.trim() : '',
        actors: typeof actors === 'string' ? actors.trim() : '',
        releaseDate: typeof releaseDate === 'string' ? releaseDate.trim() : new Date().toISOString().split('T')[0],
        status: ['now_showing', 'coming_soon', 'ended'].includes(status) ? status : 'now_showing',
        trailer: typeof trailer === 'string' ? trailer.trim() : ''
    };

    if (!db.movies) db.movies = [];
    db.movies.push(movie);
    writeDB(db);

    res.status(201).json(movie);
});

// Chỉnh sửa phim (Admin)
app.put('/api/movies/:id', authenticate, admin, (req, res) => {
    const {
        title, genre, duration, description,
        poster, banner, director, actors, releaseDate, status, trailer
    } = req.body || {};

    if (!title || typeof title !== 'string' || !title.trim() ||
        !genre || typeof genre !== 'string' || !genre.trim() ||
        !Number.isInteger(Number(duration)) || Number(duration) < 1 || Number(duration) > 400) {
        return res.status(400).json({ error: 'Vui lòng nhập tên phim, thể loại hợp lệ và thời lượng từ 1 - 400 phút.' });
    }

    const db = readDB();
    const movie = (db.movies || []).find(m => m.id === req.params.id);
    if (!movie) return res.status(404).json({ error: 'Không tìm thấy phim.' });

    Object.assign(movie, {
        title: title.trim(),
        genre: genre.trim(),
        duration: Number(duration),
        description: typeof description === 'string' ? description.trim() : movie.description,
        poster: typeof poster === 'string' ? poster.trim() : (movie.poster || ''),
        banner: typeof banner === 'string' ? banner.trim() : (movie.banner || ''),
        director: typeof director === 'string' ? director.trim() : (movie.director || ''),
        actors: typeof actors === 'string' ? actors.trim() : (movie.actors || ''),
        releaseDate: typeof releaseDate === 'string' ? releaseDate.trim() : (movie.releaseDate || ''),
        status: ['now_showing', 'coming_soon', 'ended'].includes(status) ? status : (movie.status || 'now_showing'),
        trailer: typeof trailer === 'string' ? trailer.trim() : (movie.trailer || '')
    });

    writeDB(db);
    res.json(movie);
});

// Xóa phim (Admin)
app.delete('/api/movies/:id', authenticate, admin, (req, res) => {
    const db = readDB();
    const movieExists = (db.movies || []).some(m => m.id === req.params.id);
    if (!movieExists) return res.status(404).json({ error: 'Không tìm thấy phim.' });

    const hasShowtimes = (db.showtimes || []).some(s => s.movieId === req.params.id);
    const force = req.query.force === 'true';

    if (hasShowtimes && !force) {
        return res.status(409).json({
            error: 'Phim đã có suất chiếu, không thể xóa trực tiếp. Hãy chọn xóa cả suất chiếu hoặc chỉnh sửa trạng thái thành ngừng chiếu.'
        });
    }

    if (hasShowtimes && force) {
        const showtimeIds = db.showtimes.filter(s => s.movieId === req.params.id).map(s => s.id);
        db.bookings = (db.bookings || []).filter(b => !showtimeIds.includes(b.showtimeId));
        db.showtimes = (db.showtimes || []).filter(s => s.movieId !== req.params.id);
    }

    db.movies = db.movies.filter(m => m.id !== req.params.id);
    writeDB(db);

    res.json({ message: 'Đã xóa phim thành công.' });
});

// Upload ảnh poster/banner (Admin)
app.post('/api/admin/upload-image', authenticate, admin, (req, res) => {
    const { data } = req.body || {};
    if (!data || typeof data !== 'string') {
        return res.status(400).json({ error: 'Dữ liệu ảnh không hợp lệ.' });
    }

    try {
        const matches = data.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
        let buffer;
        let ext = 'jpg';

        if (matches) {
            const mime = matches[1].toLowerCase();
            if (mime.includes('png')) ext = 'png';
            else if (mime.includes('webp')) ext = 'webp';
            else if (mime.includes('gif')) ext = 'gif';
            buffer = Buffer.from(matches[2], 'base64');
        } else {
            buffer = Buffer.from(data, 'base64');
        }

        const fileName = `img_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
        const filePath = path.join(uploadsDir, fileName);

        fs.writeFileSync(filePath, buffer);
        res.json({ url: `/uploads/${fileName}` });
    } catch (err) {
        console.error('Lỗi lưu ảnh:', err);
        res.status(500).json({ error: 'Không thể lưu tệp ảnh.' });
    }
});

// ==============================================================================
// 4. QUẢN LÝ PHÒNG CHIẾU VÀ GHẾ
// ==============================================================================

// Lấy danh sách phòng chiếu
app.get('/api/rooms', (req, res) => {
    const db = readDB();
    res.json(db.rooms || []);
});

// Lấy thông tin chi tiết một phòng chiếu
app.get('/api/rooms/:id', (req, res) => {
    const db = readDB();
    const room = (db.rooms || []).find(r => r.id === req.params.id);
    if (!room) return res.status(404).json({ error: 'Không tìm thấy phòng chiếu.' });
    res.json(room);
});

// Thêm phòng chiếu mới (Admin)
app.post('/api/rooms', authenticate, admin, (req, res) => {
    const { name, type, rows, cols, seatTypes, status } = req.body || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Tên phòng chiếu không được để trống.' });
    }

    const rowCount = Math.max(1, Math.min(10, parseInt(rows, 10) || 4));
    const colCount = Math.max(1, Math.min(16, parseInt(cols, 10) || 8));

    const db = readDB();
    if (!db.rooms) db.rooms = [];

    if (db.rooms.some(r => r.name.trim().toLowerCase() === name.trim().toLowerCase())) {
        return res.status(409).json({ error: 'Tên phòng chiếu này đã tồn tại.' });
    }

    const defaultSeatTypes = {
        'A': 'standard',
        'B': 'standard',
        'C': 'vip',
        'D': 'couple'
    };

    const newRoom = {
        id: crypto.randomUUID(),
        name: name.trim(),
        type: typeof type === 'string' && type.trim() ? type.trim() : '2D Standard',
        rows: rowCount,
        cols: colCount,
        totalSeats: rowCount * colCount,
        seatTypes: seatTypes && typeof seatTypes === 'object' ? seatTypes : defaultSeatTypes,
        disabledSeats: [],
        status: status === 'maintenance' ? 'maintenance' : 'active'
    };

    db.rooms.push(newRoom);
    writeDB(db);

    res.status(201).json(newRoom);
});

// Cập nhật thông tin phòng chiếu (Admin)
app.put('/api/rooms/:id', authenticate, admin, (req, res) => {
    const { name, type, rows, cols, seatTypes, disabledSeats, status } = req.body || {};

    const db = readDB();
    const room = (db.rooms || []).find(r => r.id === req.params.id);
    if (!room) return res.status(404).json({ error: 'Không tìm thấy phòng chiếu.' });

    if (name && typeof name === 'string' && name.trim()) {
        const dup = db.rooms.find(r => r.id !== req.params.id && r.name.trim().toLowerCase() === name.trim().toLowerCase());
        if (dup) return res.status(409).json({ error: 'Tên phòng chiếu đã được sử dụng.' });
        room.name = name.trim();
    }

    if (type && typeof type === 'string') room.type = type.trim();
    if (rows) room.rows = Math.max(1, Math.min(10, parseInt(rows, 10) || room.rows));
    if (cols) room.cols = Math.max(1, Math.min(16, parseInt(cols, 10) || room.cols));
    room.totalSeats = room.rows * room.cols;

    if (seatTypes && typeof seatTypes === 'object') room.seatTypes = seatTypes;
    if (Array.isArray(disabledSeats)) room.disabledSeats = disabledSeats;
    if (status) room.status = status;

    writeDB(db);
    res.json(room);
});

// Xóa phòng chiếu (Admin)
app.delete('/api/rooms/:id', authenticate, admin, (req, res) => {
    const db = readDB();
    const room = (db.rooms || []).find(r => r.id === req.params.id);
    if (!room) return res.status(404).json({ error: 'Không tìm thấy phòng chiếu.' });

    const hasShowtimes = (db.showtimes || []).some(s => s.roomId === req.params.id || s.room === room.name);
    if (hasShowtimes) {
        return res.status(409).json({ error: 'Phòng chiếu đang có suất chiếu, không thể xóa. Hãy chuyển hoặc xóa các suất chiếu trước.' });
    }

    db.rooms = db.rooms.filter(r => r.id !== req.params.id);
    writeDB(db);

    res.json({ message: 'Đã xóa phòng chiếu thành công.' });
});

// Cập nhật cấu hình sơ đồ ghế và trạng thái ghế của phòng (Admin)
app.put('/api/rooms/:id/seats', authenticate, admin, (req, res) => {
    const { seatTypes, disabledSeats } = req.body || {};
    const db = readDB();
    const room = (db.rooms || []).find(r => r.id === req.params.id);
    if (!room) return res.status(404).json({ error: 'Không tìm thấy phòng chiếu.' });

    if (seatTypes && typeof seatTypes === 'object') {
        room.seatTypes = { ...room.seatTypes, ...seatTypes };
    }
    if (Array.isArray(disabledSeats)) {
        room.disabledSeats = disabledSeats;
    }

    writeDB(db);
    res.json(room);
});

// ==============================================================================
// 5. QUẢN LÝ SUẤT CHIẾU
// ==============================================================================

// Lấy danh sách suất chiếu (Public)
app.get('/api/showtimes', (req, res) => {
    res.json(readDB().showtimes || []);
});

// Lấy danh sách ghế đã đặt của một suất chiếu
app.get('/api/showtimes/:id/seats', (req, res) => {
    const db = readDB();
    const showtime = (db.showtimes || []).find(s => s.id === req.params.id);

    if (!showtime) {
        return res.status(404).json({ error: 'Không tìm thấy suất chiếu.' });
    }

    const bookedSeats = (db.bookings || [])
        .filter(b => b.showtimeId === req.params.id && b.status !== 'cancelled' && b.status !== 'refunded')
        .map(b => b.seat);

    res.json(bookedSeats);
});

// Thêm suất chiếu mới (Admin) - Kiểm tra trùng lịch cùng phòng
app.post('/api/showtimes', authenticate, admin, (req, res) => {
    const { movieId, roomId, room, date, startTime, endTime, price, time } = req.body || {};

    if (!movieId || typeof movieId !== 'string') {
        return res.status(400).json({ error: 'Vui lòng chọn phim cho suất chiếu.' });
    }

    const db = readDB();
    const movie = (db.movies || []).find(m => m.id === movieId);
    if (!movie) return res.status(404).json({ error: 'Phim không tồn tại.' });

    // Xác định phòng chiếu
    let roomObj = (db.rooms || []).find(r => r.id === roomId || r.name === room);
    if (!roomObj && db.rooms && db.rooms.length > 0) {
        roomObj = db.rooms[0];
    }
    const finalRoomName = roomObj ? roomObj.name : (room || 'Phòng 1');
    const finalRoomId = roomObj ? roomObj.id : (roomId || 'r1');

    const finalPrice = Number(price);
    if (!Number.isFinite(finalPrice) || finalPrice <= 0) {
        return res.status(400).json({ error: 'Giá vé phải là số dương lớn hơn 0.' });
    }

    // Xử lý ngày và giờ bắt đầu
    const showDate = date ? String(date).trim() : new Date().toISOString().split('T')[0];
    const showStartTime = startTime ? String(startTime).trim() : '18:00';

    // Tự động tính giờ kết thúc nếu chưa có: thời lượng phim + 15 phút dọn dẹp
    let showEndTime = endTime ? String(endTime).trim() : '';
    const startMins = timeToMinutes(showStartTime);
    if (!showEndTime) {
        const endMins = startMins + Number(movie.duration) + 15;
        showEndTime = minutesToTime(endMins);
    }
    const endMins = timeToMinutes(showEndTime);

    // KIỂM TRA TRÙNG LỊCH TRONG CÙNG PHÒNG
    const conflict = (db.showtimes || []).find(s => {
        // Cùng phòng
        const sameRoom = (s.roomId && s.roomId === finalRoomId) || (s.room && s.room === finalRoomName);
        if (!sameRoom) return false;

        // Cùng ngày (hoặc nếu một trong hai không có date thì so khớp theo time string)
        const sDate = s.date || '';
        if (sDate && showDate && sDate === showDate) {
            const sStart = timeToMinutes(s.startTime || '00:00');
            const sEnd = timeToMinutes(s.endTime || '23:59');
            // Giao nhau giữa 2 khoảng thời gian [startMins, endMins] và [sStart, sEnd]
            return startMins < sEnd && endMins > sStart;
        }

        // So sánh theo chuỗi time cũ nếu cả 2 không có ngày chuẩn
        if (s.time && time && s.time.trim() === time.trim()) {
            return true;
        }

        return false;
    });

    if (conflict) {
        return res.status(409).json({
            error: `Phòng ${finalRoomName} bị trùng lịch với suất chiếu khác trong khung giờ này (${conflict.startTime || ''} - ${conflict.endTime || ''}). Vui lòng chọn giờ khác hoặc phòng khác.`
        });
    }

    const displayTime = time || `${showDate} – ${showStartTime}`;

    const newShowtime = {
        id: crypto.randomUUID(),
        movieId,
        roomId: finalRoomId,
        room: finalRoomName,
        date: showDate,
        startTime: showStartTime,
        endTime: showEndTime,
        time: displayTime,
        price: finalPrice,
        status: 'active'
    };

    if (!db.showtimes) db.showtimes = [];
    db.showtimes.push(newShowtime);
    writeDB(db);

    res.status(201).json(newShowtime);
});

// Chỉnh sửa suất chiếu (Admin) - Kiểm tra trùng lịch ngoại trừ chính nó
app.put('/api/showtimes/:id', authenticate, admin, (req, res) => {
    const { movieId, roomId, room, date, startTime, endTime, price, time, status } = req.body || {};

    const db = readDB();
    const showtime = (db.showtimes || []).find(s => s.id === req.params.id);
    if (!showtime) return res.status(404).json({ error: 'Không tìm thấy suất chiếu.' });

    const targetMovieId = movieId || showtime.movieId;
    const movie = (db.movies || []).find(m => m.id === targetMovieId);
    if (!movie) return res.status(404).json({ error: 'Phim không tồn tại.' });

    let roomObj = (db.rooms || []).find(r => r.id === (roomId || showtime.roomId) || r.name === (room || showtime.room));
    const finalRoomName = roomObj ? roomObj.name : (room || showtime.room);
    const finalRoomId = roomObj ? roomObj.id : (roomId || showtime.roomId);

    const showDate = date ? String(date).trim() : (showtime.date || new Date().toISOString().split('T')[0]);
    const showStartTime = startTime ? String(startTime).trim() : (showtime.startTime || '18:00');

    let showEndTime = endTime ? String(endTime).trim() : '';
    const startMins = timeToMinutes(showStartTime);
    if (!showEndTime) {
        const endMins = startMins + Number(movie.duration) + 15;
        showEndTime = minutesToTime(endMins);
    }
    const endMins = timeToMinutes(showEndTime);

    // KIỂM TRA TRÙNG LỊCH NGOẠI TRỪ CHÍNH NÓ
    const conflict = (db.showtimes || []).find(s => {
        if (s.id === req.params.id) return false;

        const sameRoom = (s.roomId && s.roomId === finalRoomId) || (s.room && s.room === finalRoomName);
        if (!sameRoom) return false;

        const sDate = s.date || '';
        if (sDate && showDate && sDate === showDate) {
            const sStart = timeToMinutes(s.startTime || '00:00');
            const sEnd = timeToMinutes(s.endTime || '23:59');
            return startMins < sEnd && endMins > sStart;
        }

        if (s.time && time && s.time.trim() === time.trim()) {
            return true;
        }

        return false;
    });

    if (conflict) {
        return res.status(409).json({
            error: `Phòng ${finalRoomName} đã có suất chiếu khác trong khung giờ này (${conflict.startTime || ''} - ${conflict.endTime || ''}).`
        });
    }

    Object.assign(showtime, {
        movieId: targetMovieId,
        roomId: finalRoomId,
        room: finalRoomName,
        date: showDate,
        startTime: showStartTime,
        endTime: showEndTime,
        time: time || `${showDate} – ${showStartTime}`,
        price: price !== undefined ? Number(price) : showtime.price,
        status: status || showtime.status || 'active'
    });

    writeDB(db);
    res.json(showtime);
});

// Xóa suất chiếu (Admin)
app.delete('/api/showtimes/:id', authenticate, admin, (req, res) => {
    const db = readDB();
    const showtime = (db.showtimes || []).find(s => s.id === req.params.id);
    if (!showtime) return res.status(404).json({ error: 'Không tìm thấy suất chiếu.' });

    const hasActiveBookings = (db.bookings || []).some(
        b => b.showtimeId === req.params.id && b.status !== 'cancelled' && b.status !== 'refunded'
    );

    if (hasActiveBookings && req.query.force !== 'true') {
        return res.status(409).json({
            error: 'Suất chiếu đã có vé được đặt. Không thể xóa trực tiếp. Hãy hủy vé hoặc hoàn tiền cho khách trước.'
        });
    }

    db.showtimes = db.showtimes.filter(s => s.id !== req.params.id);
    if (req.query.force === 'true') {
        db.bookings = (db.bookings || []).filter(b => b.showtimeId !== req.params.id);
    }
    writeDB(db);

    res.json({ message: 'Đã xóa suất chiếu thành công.' });
});

// ==============================================================================
// 6. QUẢN LÝ ĐẶT VÉ (BOOKINGS)
// ==============================================================================

// Lấy vé của người dùng hiện tại
app.get('/api/my-bookings', authenticate, (req, res) => {
    const db = readDB();
    const myBookings = (db.bookings || []).filter(b => b.userId === req.user.id);
    res.json(myBookings);
});

// Người dùng đặt vé (Hỗ trợ mã giảm giá nếu có)
app.post('/api/bookings', authenticate, (req, res) => {
    const { showtimeId, seat, promoCode } = req.body || {};

    if (typeof showtimeId !== 'string' || typeof seat !== 'string' || !/^[A-Z][0-9]{1,2}$/.test(seat)) {
        return res.status(400).json({ error: 'Ghế không hợp lệ (ví dụ: A1, B3, D8).' });
    }

    const db = readDB();
    const show = (db.showtimes || []).find(s => s.id === showtimeId);
    if (!show) return res.status(404).json({ error: 'Suất chiếu không tồn tại.' });

    const movie = (db.movies || []).find(m => m.id === show.movieId);
    if (!movie) return res.status(404).json({ error: 'Phim không còn tồn tại.' });

    // Kiểm tra ghế đã có người đặt chưa
    const isBooked = (db.bookings || []).some(
        b => b.showtimeId === showtimeId && b.seat === seat && b.status !== 'cancelled' && b.status !== 'refunded'
    );

    if (isBooked) {
        return res.status(409).json({ error: 'Ghế này đã được đặt. Hãy chọn ghế khác.' });
    }

    // Xác định loại ghế từ phòng chiếu
    const room = (db.rooms || []).find(r => r.id === show.roomId || r.name === show.room);
    const rowChar = seat.charAt(0);
    let seatType = 'standard';
    if (room && room.seatTypes && room.seatTypes[rowChar]) {
        seatType = room.seatTypes[rowChar];
    } else if (rowChar === 'C') {
        seatType = 'vip';
    } else if (rowChar === 'D') {
        seatType = 'couple';
    }

    // Tính giá vé cơ bản (ghế VIP +20%, Couple +40%)
    let basePrice = Number(show.price) || 75000;
    if (seatType === 'vip') basePrice = Math.round(basePrice * 1.2 / 1000) * 1000;
    else if (seatType === 'couple') basePrice = Math.round(basePrice * 1.4 / 1000) * 1000;

    let discountAmount = 0;
    let appliedPromo = null;

    // Áp dụng khuyến mãi nếu có mã
    if (promoCode && typeof promoCode === 'string' && promoCode.trim()) {
        const pCode = promoCode.trim().toUpperCase();
        const promo = (db.promotions || []).find(p => p.code.toUpperCase() === pCode && p.status === 'active');
        if (promo) {
            const today = new Date().toISOString().split('T')[0];
            const isValidDate = (!promo.startDate || promo.startDate <= today) && (!promo.endDate || promo.endDate >= today);
            const hasUsageLeft = !promo.maxUsage || promo.usedCount < promo.maxUsage;
            const meetsMinSpend = !promo.minSpend || basePrice >= promo.minSpend;

            if (isValidDate && hasUsageLeft && meetsMinSpend) {
                if (promo.discountType === 'percent') {
                    discountAmount = Math.round((basePrice * promo.discountValue) / 100);
                    if (promo.maxDiscount && discountAmount > promo.maxDiscount) {
                        discountAmount = promo.maxDiscount;
                    }
                } else {
                    discountAmount = Math.min(basePrice, promo.discountValue);
                }
                promo.usedCount = (promo.usedCount || 0) + 1;
                appliedPromo = promo.code;
            }
        }
    }

    const finalPrice = Math.max(0, basePrice - discountAmount);

    const booking = {
        id: crypto.randomUUID(),
        userId: req.user.id,
        showtimeId: showtimeId,
        seat: seat,
        seatType: seatType,
        price: basePrice,
        discountAmount: discountAmount,
        finalPrice: finalPrice,
        promoCode: appliedPromo || null,
        status: 'confirmed',
        paymentStatus: 'pending',
        createdAt: new Date().toISOString()
    };

    if (!db.bookings) db.bookings = [];
    db.bookings.push(booking);
    writeDB(db);

    res.status(201).json(booking);
});

// Người dùng hủy vé của mình
app.delete('/api/bookings/:id', authenticate, (req, res) => {
    const db = readDB();
    const booking = (db.bookings || []).find(b => b.id === req.params.id);

    if (!booking) return res.status(404).json({ error: 'Không tìm thấy vé.' });
    if (booking.userId !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Bạn không có quyền hủy vé này.' });
    }

    if (booking.status === 'cancelled' || booking.status === 'refunded') {
        return res.status(409).json({ error: 'Vé này đã được hủy hoặc hoàn tiền trước đó.' });
    }

    booking.status = 'cancelled';
    booking.paymentStatus = booking.paymentStatus === 'paid'
  ? 'refunded'
  : 'cancelled';
    booking.cancelledAt = new Date().toISOString();
    writeDB(db);

    res.json({ message: 'Hủy vé thành công!', booking });
});

// ==============================================================================
// 7. QUẢN LÝ ĐƠN ĐẶT VÉ (ADMIN)
// ==============================================================================

// Lấy danh sách tất cả đơn đặt vé kèm tìm kiếm & lọc
app.get('/api/admin/bookings', authenticate, admin, (req, res) => {
    const db = readDB();
    let bookings = db.bookings || [];
    const users = db.users || [];
    const showtimes = db.showtimes || [];
    const movies = db.movies || [];

    // Gắn thông tin mở rộng cho đơn hàng
    let fullBookings = bookings.map(b => {
        const user = users.find(u => u.id === b.userId);
        const show = showtimes.find(s => s.id === b.showtimeId);
        const movie = show ? movies.find(m => m.id === show.movieId) : null;
        return {
            ...b,
            userName: user ? user.name : 'Khách vãng lai',
            userEmail: user ? user.email : '',
            movieTitle: movie ? movie.title : 'Phim đã xóa',
            moviePoster: movie ? (movie.poster || '') : '',
            showtimeString: show ? (show.time || `${show.date} ${show.startTime}`) : 'Suất chiếu',
            roomName: show ? (show.room || 'Phòng 1') : 'Phòng 1'
        };
    });

    const { search, status, date, paymentStatus } = req.query || {};

    if (search) {
        const kw = search.trim().toLowerCase();
        fullBookings = fullBookings.filter(b =>
            b.id.toLowerCase().includes(kw) ||
            b.userName.toLowerCase().includes(kw) ||
            b.userEmail.toLowerCase().includes(kw) ||
            b.movieTitle.toLowerCase().includes(kw) ||
            b.seat.toLowerCase().includes(kw)
        );
    }

    if (status) {
        fullBookings = fullBookings.filter(b => b.status === status);
    }

    if (paymentStatus) {
        fullBookings = fullBookings.filter(b => b.paymentStatus === paymentStatus);
    }

    if (date) {
        fullBookings = fullBookings.filter(b => b.createdAt && b.createdAt.startsWith(date));
    }

    fullBookings.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    res.json(fullBookings);
});

// Xem chi tiết một đơn đặt vé (Admin)
app.get('/api/admin/bookings/:id', authenticate, admin, (req, res) => {
    const db = readDB();
    const booking = (db.bookings || []).find(b => b.id === req.params.id);
    if (!booking) return res.status(404).json({ error: 'Không tìm thấy đơn đặt vé.' });

    const user = (db.users || []).find(u => u.id === booking.userId);
    const show = (db.showtimes || []).find(s => s.id === booking.showtimeId);
    const movie = show ? (db.movies || []).find(m => m.id === show.movieId) : null;

    res.json({
        ...booking,
        userName: user ? user.name : 'Khách vãng lai',
        userEmail: user ? user.email : '',
        movieTitle: movie ? movie.title : 'Phim đã xóa',
        movieGenre: movie ? movie.genre : '',
        movieDuration: movie ? movie.duration : 0,
        showtimeInfo: show || null
    });
});

// Xử lý hoàn tiền / Cập nhật trạng thái đơn vé (Admin)
app.post('/api/admin/bookings/:id/refund', authenticate, admin, (req, res) => {
    const db = readDB();
    const booking = (db.bookings || []).find(b => b.id === req.params.id);
    if (!booking) return res.status(404).json({ error: 'Không tìm thấy đơn đặt vé.' });

    if (booking.status === 'refunded') {
        return res.status(409).json({ error: 'Đơn hàng này đã được hoàn tiền trước đó.' });
    }

    booking.status = 'refunded';
    booking.paymentStatus = 'refunded';
    booking.refundedAt = new Date().toISOString();
    writeDB(db);

    res.json({ message: 'Hoàn tiền thành công. Ghế đã được mở lại cho khách khác.', booking });
});

// Cập nhật trạng thái đơn vé (Admin)
app.put('/api/admin/bookings/:id/status', authenticate, admin, (req, res) => {
    const { status, paymentStatus } = req.body || {};
    const db = readDB();
    const booking = (db.bookings || []).find(b => b.id === req.params.id);
    if (!booking) return res.status(404).json({ error: 'Không tìm thấy đơn đặt vé.' });

    if (status && ['confirmed', 'cancelled', 'refunded'].includes(status)) {
        booking.status = status;
    }
    if (paymentStatus && ['paid', 'pending', 'refunded'].includes(paymentStatus)) {
        booking.paymentStatus = paymentStatus;
    }

    writeDB(db);
    res.json(booking);
});

// ==============================================================================
// 8. QUẢN LÝ NGƯỜI DÙNG (ADMIN)
// ==============================================================================

// Lấy danh sách người dùng
app.get('/api/admin/users', authenticate, admin, (req, res) => {
    const db = readDB();
    let users = (db.users || []).map(u => {
        const userBookings = (db.bookings || []).filter(b => b.userId === u.id);
        const confirmedBookings = userBookings.filter(b => b.status === 'confirmed');
        const totalSpent = confirmedBookings.reduce((sum, b) => sum + (Number(b.finalPrice ?? b.price) || 0), 0);
        return {
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            status: u.status || 'active',
            createdAt: u.createdAt || '',
            bookingCount: userBookings.length,
            totalSpent: totalSpent
        };
    });

    const { search, role, status } = req.query || {};

    if (search) {
        const kw = search.trim().toLowerCase();
        users = users.filter(u => u.name.toLowerCase().includes(kw) || u.email.toLowerCase().includes(kw));
    }
    if (role) {
        users = users.filter(u => u.role === role);
    }
    if (status) {
        users = users.filter(u => u.status === status);
    }

    res.json(users);
});

// Xem chi tiết và lịch sử đặt vé của một người dùng
app.get('/api/admin/users/:id', authenticate, admin, (req, res) => {
    const db = readDB();
    const user = (db.users || []).find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });

    const userBookings = (db.bookings || [])
        .filter(b => b.userId === user.id)
        .map(b => {
            const show = (db.showtimes || []).find(s => s.id === b.showtimeId);
            const movie = show ? (db.movies || []).find(m => m.id === show.movieId) : null;
            return {
                ...b,
                movieTitle: movie ? movie.title : 'Phim đã xóa',
                showtime: show ? (show.time || `${show.date} ${show.startTime}`) : 'Suất chiếu'
            };
        });

    const totalSpent = userBookings
        .filter(b => b.status === 'confirmed')
        .reduce((sum, b) => sum + (Number(b.finalPrice ?? b.price) || 0), 0);

    res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status || 'active',
        createdAt: user.createdAt,
        totalSpent,
        bookings: userBookings
    });
});

// Khóa hoặc mở khóa tài khoản người dùng (Admin)
app.put('/api/admin/users/:id/status', authenticate, admin, (req, res) => {
    const { status } = req.body || {};
    const db = readDB();
    const user = (db.users || []).find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });

    // Không cho phép tự khóa chính tài khoản admin đang đăng nhập hoặc admin demo
    if (user.id === req.user.id || user.id === 'admin-1') {
        return res.status(400).json({ error: 'Không thể khóa tài khoản quản trị viên hiện tại.' });
    }

    const newStatus = status ? status : (user.status === 'locked' ? 'active' : 'locked');
    user.status = newStatus;

    // Nếu khóa tài khoản, xóa toàn bộ token đang hoạt động của người này
    if (newStatus === 'locked') {
        for (const [token, uid] of tokens.entries()) {
            if (uid === user.id) tokens.delete(token);
        }
    }

    writeDB(db);
    res.json({ message: `Đã ${newStatus === 'locked' ? 'khóa' : 'mở khóa'} tài khoản thành công.`, status: newStatus });
});

// Thay đổi vai trò người dùng (Admin / User)
app.put('/api/admin/users/:id/role', authenticate, admin, (req, res) => {
    const { role } = req.body || {};
    if (!['admin', 'user'].includes(role)) {
        return res.status(400).json({ error: 'Vai trò không hợp lệ (admin hoặc user).' });
    }

    const db = readDB();
    const user = (db.users || []).find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });

    if (user.id === 'admin-1' && role !== 'admin') {
        return res.status(400).json({ error: 'Không thể hạ quyền tài khoản Admin mặc định của hệ thống.' });
    }

    user.role = role;
    writeDB(db);
    res.json({ message: `Đã cập nhật vai trò thành ${role === 'admin' ? 'Quản trị viên' : 'Khách hàng'}.`, role });
});

// ==============================================================================
// 9. QUẢN LÝ KHUYẾN MÃI (PROMOTIONS)
// ==============================================================================

// Lấy danh sách khuyến mãi đang hoạt động (Public / Customer)
app.get('/api/promotions', (req, res) => {
    const db = readDB();
    const today = new Date().toISOString().split('T')[0];
    const activePromos = (db.promotions || []).filter(p =>
        p.status === 'active' &&
        (!p.startDate || p.startDate <= today) &&
        (!p.endDate || p.endDate >= today) &&
        (!p.maxUsage || (p.usedCount || 0) < p.maxUsage)
    );
    res.json(activePromos);
});

// Kiểm tra và áp dụng mã giảm giá
app.post('/api/promotions/apply', (req, res) => {
    const { code, price } = req.body || {};
    if (!code || typeof code !== 'string') {
        return res.status(400).json({ error: 'Vui lòng nhập mã giảm giá.' });
    }

    const orderPrice = Number(price) || 0;
    const db = readDB();
    const promo = (db.promotions || []).find(p => p.code.trim().toUpperCase() === code.trim().toUpperCase());

    if (!promo || promo.status !== 'active') {
        return res.status(404).json({ error: 'Mã giảm giá không tồn tại hoặc đã hết hiệu lực.' });
    }

    const today = new Date().toISOString().split('T')[0];
    if (promo.startDate && promo.startDate > today) {
        return res.status(400).json({ error: `Mã giảm giá chỉ có hiệu lực từ ngày ${promo.startDate}.` });
    }
    if (promo.endDate && promo.endDate < today) {
        return res.status(400).json({ error: `Mã giảm giá đã hết hạn từ ngày ${promo.endDate}.` });
    }
    if (promo.maxUsage && (promo.usedCount || 0) >= promo.maxUsage) {
        return res.status(400).json({ error: 'Mã giảm giá đã hết lượt sử dụng.' });
    }
    if (promo.minSpend && orderPrice < promo.minSpend) {
        return res.status(400).json({
            error: `Đơn hàng phải từ ${Number(promo.minSpend).toLocaleString('vi-VN')}đ để áp dụng mã này.`
        });
    }

    let discount = 0;
    if (promo.discountType === 'percent') {
        discount = Math.round((orderPrice * promo.discountValue) / 100);
        if (promo.maxDiscount && discount > promo.maxDiscount) {
            discount = promo.maxDiscount;
        }
    } else {
        discount = Math.min(orderPrice, promo.discountValue);
    }

    const finalPrice = Math.max(0, orderPrice - discount);

    res.json({
        valid: true,
        code: promo.code,
        discount,
        finalPrice,
        description: promo.description
    });
});

// Lấy danh sách tất cả khuyến mãi (Admin)
app.get('/api/admin/promotions', authenticate, admin, (req, res) => {
    const db = readDB();
    res.json(db.promotions || []);
});

// Tạo mã khuyến mãi mới (Admin)
app.post('/api/admin/promotions', authenticate, admin, (req, res) => {
    const {
        code, description, discountType, discountValue,
        minSpend, maxDiscount, startDate, endDate, maxUsage, status
    } = req.body || {};

    if (!code || typeof code !== 'string' || !code.trim()) {
        return res.status(400).json({ error: 'Mã khuyến mãi không được để trống.' });
    }

    const cleanCode = code.trim().toUpperCase();
    const db = readDB();
    if (!db.promotions) db.promotions = [];

    if (db.promotions.some(p => p.code === cleanCode)) {
        return res.status(409).json({ error: 'Mã khuyến mãi này đã tồn tại.' });
    }

    const val = Number(discountValue);
    if (!Number.isFinite(val) || val <= 0) {
        return res.status(400).json({ error: 'Giá trị giảm giá không hợp lệ.' });
    }

    const newPromo = {
        id: crypto.randomUUID(),
        code: cleanCode,
        description: typeof description === 'string' ? description.trim() : '',
        discountType: discountType === 'fixed' ? 'fixed' : 'percent',
        discountValue: val,
        minSpend: Math.max(0, Number(minSpend) || 0),
        maxDiscount: Math.max(0, Number(maxDiscount) || 0),
        startDate: startDate ? String(startDate).trim() : new Date().toISOString().split('T')[0],
        endDate: endDate ? String(endDate).trim() : '2026-12-31',
        maxUsage: Math.max(1, parseInt(maxUsage, 10) || 100),
        usedCount: 0,
        status: status === 'inactive' ? 'inactive' : 'active'
    };

    db.promotions.push(newPromo);
    writeDB(db);

    res.status(201).json(newPromo);
});

// Chỉnh sửa mã khuyến mãi (Admin)
app.put('/api/admin/promotions/:id', authenticate, admin, (req, res) => {
    const {
        code, description, discountType, discountValue,
        minSpend, maxDiscount, startDate, endDate, maxUsage, status
    } = req.body || {};

    const db = readDB();
    const promo = (db.promotions || []).find(p => p.id === req.params.id);
    if (!promo) return res.status(404).json({ error: 'Không tìm thấy mã khuyến mãi.' });

    if (code && typeof code === 'string' && code.trim()) {
        const cleanCode = code.trim().toUpperCase();
        const dup = db.promotions.find(p => p.id !== req.params.id && p.code === cleanCode);
        if (dup) return res.status(409).json({ error: 'Mã khuyến mãi đã trùng với mã khác.' });
        promo.code = cleanCode;
    }

    if (description !== undefined) promo.description = String(description).trim();
    if (discountType) promo.discountType = discountType === 'fixed' ? 'fixed' : 'percent';
    if (discountValue !== undefined) promo.discountValue = Number(discountValue);
    if (minSpend !== undefined) promo.minSpend = Number(minSpend);
    if (maxDiscount !== undefined) promo.maxDiscount = Number(maxDiscount);
    if (startDate) promo.startDate = String(startDate).trim();
    if (endDate) promo.endDate = String(endDate).trim();
    if (maxUsage !== undefined) promo.maxUsage = Number(maxUsage);
    if (status) promo.status = status;

    writeDB(db);
    res.json(promo);
});

// Xóa mã khuyến mãi (Admin)
app.delete('/api/admin/promotions/:id', authenticate, admin, (req, res) => {
    const db = readDB();
    const promo = (db.promotions || []).find(p => p.id === req.params.id);
    if (!promo) return res.status(404).json({ error: 'Không tìm thấy mã khuyến mãi.' });

    db.promotions = db.promotions.filter(p => p.id !== req.params.id);
    writeDB(db);

    res.json({ message: 'Đã xóa mã khuyến mãi thành công.' });
});

// ==============================================================================
// 10. XỬ LÝ 404 & LỖI MÁY CHỦ
// ==============================================================================

app.use('/api', (req, res) => {
    res.status(404).json({ error: 'API không tồn tại.' });
});

app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ.' });
});

// Khởi động server
const port = process.env.PORT || 3000;
if (require.main === module) {
    app.listen(port, () => {
        console.log(`Mini Cinema đang chạy tại: http://localhost:${port}`);
    });
}

module.exports = app;
