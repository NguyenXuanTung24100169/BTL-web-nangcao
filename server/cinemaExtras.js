
const crypto = require('crypto');
const { readDB, writeDB } = require('./store');
const { authenticate } = require('./auth');

module.exports = function registerCinemaExtras(app) {

  // Lay danh sach ve va lich su thanh toan
  app.get('/api/payments/my', authenticate, (req, res) => {
    const db = readDB();

    const tickets = (db.bookings || [])
      .filter(b => b.userId === req.user.id)
      .map(b => {
        const show = (db.showtimes || [])
          .find(s => s.id === b.showtimeId);

        const movie = (db.movies || [])
          .find(m => m.id === show?.movieId);

        const payment = (db.payments || [])
          .find(p => p.bookingId === b.id);

        return {
          bookingId: b.id,
          title: movie?.title || 'Phim không còn trong hệ thống',
          seat: b.seat,
          showtime: show?.time || '',
          amount: Number(b.finalPrice ?? b.price ?? 0),
          bookingStatus: b.status,
          paymentStatus: b.paymentStatus || 'paid',
          payment: payment ? {
            id: payment.id,
            method: payment.method,
            paidAt: payment.paidAt,
            amount: payment.amount
          } : null,
          createdAt: b.createdAt
        };
      });

    res.json(tickets);
  });

  // Xu ly thanh toan mo phong
  app.post('/api/payments/pay', authenticate, (req, res) => {
    const { bookingId, method } = req.body || {};

    const methods = ['counter', 'bank_demo', 'wallet_demo'];

    if (typeof bookingId !== 'string' || !methods.includes(method)) {
      return res.status(400).json({
        error: 'Mã vé hoặc phương thức không hợp lệ.'
      });
    }

    const db = readDB();

    const booking = (db.bookings || [])
      .find(b => b.id === bookingId);

    if (!booking) {
      return res.status(404).json({
        error: 'Không tìm thấy vé.'
      });
    }

    if (booking.userId !== req.user.id) {
      return res.status(403).json({
        error: 'Bạn không có quyền thanh toán vé này.'
      });
    }

    if (booking.status !== 'confirmed') {
      return res.status(409).json({
        error: 'Vé đã hủy hoặc không còn hợp lệ.'
      });
    }

    if (booking.paymentStatus !== 'pending') {
      return res.status(409).json({
        error: 'Vé này không ở trạng thái chờ thanh toán.'
      });
    }

    const amount = Number(booking.finalPrice ?? booking.price);

    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({
        error: 'Số tiền trên vé không hợp lệ.'
      });
    }

    db.payments ||= [];

    if (db.payments.some(p => p.bookingId === bookingId)) {
      return res.status(409).json({
        error: 'Vé này đã có giao dịch.'
      });
    }

    const payment = {
      id: crypto.randomUUID(),
      bookingId,
      userId: req.user.id,
      amount,
      method,
      status: 'paid',
      paidAt: new Date().toISOString(),
      note: 'Thanh toán mô phỏng, không chuyển tiền thật'
    };

    db.payments.push(payment);

    booking.paymentStatus = 'paid';
    booking.paidAt = payment.paidAt;

    writeDB(db);

    res.status(201).json({
      message: 'Thanh toán mô phỏng thành công!',
      payment
    });
  });

  // Xem danh gia cua mot phim
  app.get('/api/reviews/:movieId', (req, res) => {
    const db = readDB();

    const movie = (db.movies || [])
      .find(m => m.id === req.params.movieId);

    if (!movie) {
      return res.status(404).json({
        error: 'Không tìm thấy phim.'
      });
    }

    const reviews = (db.reviews || [])
      .filter(r => r.movieId === movie.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(r => {
        const user = (db.users || [])
          .find(u => u.id === r.userId);

        return {
          id: r.id,
          userId: r.userId,
          author: user?.name || 'Người dùng',
          rating: r.rating,
          comment: r.comment,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt
        };
      });

    const average = reviews.length
      ? Math.round(
          reviews.reduce((sum, r) => sum + r.rating, 0)
          * 10 / reviews.length
        ) / 10
      : 0;

    res.json({
      movieId: movie.id,
      title: movie.title,
      average,
      count: reviews.length,
      reviews
    });
  });

  // Them danh gia phim
  app.post('/api/reviews/:movieId', authenticate, (req, res) => {
    const { rating, comment } = req.body || {};

    const score = Number(rating);
    const content = typeof comment === 'string'
      ? comment.trim()
      : '';

    if (
      !Number.isInteger(score) ||
      score < 1 ||
      score > 5 ||
      !content ||
      content.length > 500
    ) {
      return res.status(400).json({
        error: 'Chọn 1-5 sao và nhập nhận xét 1-500 ký tự.'
      });
    }

    const db = readDB();

    if (!(db.movies || []).some(m => m.id === req.params.movieId)) {
      return res.status(404).json({
        error: 'Không tìm thấy phim.'
      });
    }

    const showIds = (db.showtimes || [])
      .filter(s => s.movieId === req.params.movieId)
      .map(s => s.id);

    const hasTicket = (db.bookings || []).some(b =>
      b.userId === req.user.id &&
      b.status === 'confirmed' &&
      b.paymentStatus === 'paid' &&
      showIds.includes(b.showtimeId)
    );

    if (!hasTicket) {
      return res.status(403).json({
        error: 'Cần có vé phim đã thanh toán mới được đánh giá.'
      });
    }

    db.reviews ||= [];

    const existed = db.reviews.some(r =>
      r.movieId === req.params.movieId &&
      r.userId === req.user.id
    );

    if (existed) {
      return res.status(409).json({
        error: 'Bạn đã đánh giá phim này. Hãy sửa đánh giá cũ.'
      });
    }

    const now = new Date().toISOString();

    const review = {
      id: crypto.randomUUID(),
      movieId: req.params.movieId,
      userId: req.user.id,
      rating: score,
      comment: content,
      createdAt: now,
      updatedAt: now
    };

    db.reviews.push(review);
    writeDB(db);

    res.status(201).json(review);
  });

  // Sua danh gia
  app.put('/api/reviews/:id', authenticate, (req, res) => {
    const score = Number(req.body?.rating);

    const content = typeof req.body?.comment === 'string'
      ? req.body.comment.trim()
      : '';

    if (
      !Number.isInteger(score) ||
      score < 1 ||
      score > 5 ||
      !content ||
      content.length > 500
    ) {
      return res.status(400).json({
        error: 'Chọn 1-5 sao và nhập nhận xét 1-500 ký tự.'
      });
    }

    const db = readDB();

    const review = (db.reviews || [])
      .find(r => r.id === req.params.id);

    if (!review) {
      return res.status(404).json({
        error: 'Không tìm thấy đánh giá.'
      });
    }

    if (review.userId !== req.user.id) {
      return res.status(403).json({
        error: 'Bạn chỉ có thể sửa đánh giá của mình.'
      });
    }

    review.rating = score;
    review.comment = content;
    review.updatedAt = new Date().toISOString();

    writeDB(db);

    res.json(review);
  });

  // Xoa danh gia
  app.delete('/api/reviews/:id', authenticate, (req, res) => {
    const db = readDB();

    const review = (db.reviews || [])
      .find(r => r.id === req.params.id);

    if (!review) {
      return res.status(404).json({
        error: 'Không tìm thấy đánh giá.'
      });
    }

    if (review.userId !== req.user.id) {
      return res.status(403).json({
        error: 'Bạn chỉ có thể xóa đánh giá của mình.'
      });
    }

    db.reviews = db.reviews.filter(r => r.id !== review.id);

    writeDB(db);

    res.json({
      message: 'Đã xóa đánh giá.'
    });
  });
};
