
(() => {
  'use strict';

  const el = id => document.getElementById(id);

  const moneyText = number =>
    Number(number || 0).toLocaleString('vi-VN') + 'đ';

  const html = value =>
    String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[c]);

  const currentUser = () => {
    try {
      return JSON.parse(sessionStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  };

  async function request(path, options = {}) {
    const token = sessionStorage.getItem('token');

    const response = await fetch('/api' + path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(options.headers || {})
      }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'Yêu cầu thất bại.');
    }

    return data;
  }

  let dialog;
  let panel;
  let movies = [];
  let chosenMovieId = '';
  let activeTab = '';

  function showError(error) {
    panel.innerHTML =
      `<p class="extra-error">${html(error.message)}</p>`;
  }

  function openDialog(title) {
    el('cinemaExtraTitle').textContent = title;
    panel.innerHTML = '<p>Đang tải dữ liệu...</p>';

    if (!dialog.open) {
      dialog.showModal();
    }
  }

  function loginPrompt() {
    panel.innerHTML = `
      <p>Bạn cần đăng nhập để sử dụng chức năng này.</p>
      <button type="button" class="extra-button" data-extra-login>
        Đăng nhập
      </button>
    `;
  }

  function methodLabel(method) {
    return ({
      counter: 'Tại quầy (demo)',
      bank_demo: 'Chuyển khoản (demo)',
      wallet_demo: 'Ví điện tử (demo)'
    })[method] || method;
  }

  function formatDate(iso) {
    const date = new Date(iso);

    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleString('vi-VN');
  }

  // Hien thi thanh toan va lich su giao dich
  async function loadPayments() {
    activeTab = 'payments';
    openDialog('Thanh toán vé xem phim');

    if (!currentUser() || !sessionStorage.getItem('token')) {
      loginPrompt();
      return;
    }

    try {
      const tickets = await request('/payments/my');

      if (activeTab !== 'payments') return;

      if (!tickets.length) {
        panel.innerHTML =
          '<p>Bạn chưa có vé. Hãy đặt vé ở trang chủ trước.</p>';
        return;
      }

      panel.innerHTML = `
        <p class="extra-note">
          Chế độ DEMO: thao tác xác nhận không trừ tiền
          hay chuyển khoản thật.
        </p>

        ${tickets.slice().reverse().map(t => {
          const closed =
            t.bookingStatus === 'cancelled' ||
            t.bookingStatus === 'refunded';

          const pending =
            !closed && t.paymentStatus === 'pending';

          const status = closed
            ? 'Đã hủy / hoàn vé'
            : pending
              ? 'Chờ thanh toán'
              : 'Đã thanh toán';

          const paidInfo = t.payment
            ? `<small>
                Mã giao dịch: ${html(t.payment.id)}<br>
                Phương thức: ${html(methodLabel(t.payment.method))}<br>
                Ngày: ${html(formatDate(t.payment.paidAt))}
              </small>`
            : (!pending && !closed
              ? `<small>
                  Vé cũ hoặc vé được cập nhật trước khi bổ sung
                  lịch sử giao dịch.
                </small>`
              : '');

          return `
            <article class="extra-ticket">
              <div class="extra-line">
                <strong>${html(t.title)}</strong>
                <span>${html(status)}</span>
              </div>

              <p>
                Suất: ${html(t.showtime || 'Chưa rõ')}
                · Ghế ${html(t.seat)}
              </p>

              <p class="extra-amount">
                ${moneyText(t.amount)}
              </p>

              ${paidInfo}

              ${pending ? `
                <div class="extra-pay-controls">
                  <select class="extra-method"
                          aria-label="Phương thức thanh toán">
                    <option value="counter">
                      Thanh toán tại quầy (demo)
                    </option>
                    <option value="bank_demo">
                      Chuyển khoản ngân hàng (demo)
                    </option>
                    <option value="wallet_demo">
                      Ví điện tử (demo)
                    </option>
                  </select>

                  <button type="button"
                          class="extra-button"
                          data-extra-pay="${html(t.bookingId)}">
                    Xác nhận thanh toán
                  </button>
                </div>
              ` : ''}
            </article>
          `;
        }).join('')}
      `;

    } catch (error) {
      if (activeTab === 'payments') showError(error);
    }
  }

  // Tai danh sach phim cho trang danh gia
  async function loadReviews() {
    activeTab = 'reviews';
    openDialog('Đánh giá phim');

    try {
      movies = await request('/movies');

      if (activeTab !== 'reviews') return;

      if (!movies.length) {
        panel.innerHTML = '<p>Chưa có phim để đánh giá.</p>';
        return;
      }

      if (!movies.some(m => m.id === chosenMovieId)) {
        chosenMovieId = movies[0].id;
      }

      panel.innerHTML = `
        <label class="extra-label" for="extraMovieSelect">
          Chọn phim
        </label>

        <select id="extraMovieSelect">
          ${movies.map(m => `
            <option value="${html(m.id)}"
                    ${m.id === chosenMovieId ? 'selected' : ''}>
              ${html(m.title)}
            </option>
          `).join('')}
        </select>

        <div id="extraReviewDetails"></div>
      `;

      await showReviews();

    } catch (error) {
      if (activeTab === 'reviews') showError(error);
    }
  }

  // Hien thi diem trung binh, form va binh luan
  async function showReviews() {
    const details = el('extraReviewDetails');
    if (!details) return;

    details.innerHTML = '<p>Đang tải đánh giá...</p>';

    const movieId = chosenMovieId;

    try {
      const data = await request(
        '/reviews/' + encodeURIComponent(movieId)
      );

      if (
        activeTab !== 'reviews' ||
        chosenMovieId !== movieId ||
        !el('extraReviewDetails')
      ) return;

      const user = currentUser();

      const mine = user
        ? data.reviews.find(r => r.userId === user.id)
        : null;

      const form = user ? `
        <form id="extraReviewForm"
              data-own-id="${html(mine?.id || '')}">

          <h3>
            ${mine ? 'Sửa đánh giá của bạn' : 'Viết đánh giá'}
          </h3>

          <label class="extra-label" for="extraStars">
            Điểm đánh giá
          </label>

          <select id="extraStars" required>
            ${[5, 4, 3, 2, 1].map(n => `
              <option value="${n}"
                ${Number(mine?.rating || 5) === n ? 'selected' : ''}>
                ${'★'.repeat(n)} (${n} sao)
              </option>
            `).join('')}
          </select>

          <label class="extra-label" for="extraComment">
            Nhận xét (tối đa 500 ký tự)
          </label>

          <textarea id="extraComment"
                    rows="3"
                    minlength="1"
                    maxlength="500"
                    required
                    placeholder="Cảm nhận của bạn về phim...">${html(mine?.comment || '')}</textarea>

          <div class="extra-actions">
            <button class="extra-button" type="submit">
              ${mine ? 'Lưu chỉnh sửa' : 'Gửi đánh giá'}
            </button>

            ${mine ? `
              <button type="button"
                      class="extra-button extra-danger"
                      data-extra-delete="${html(mine.id)}">
                Xóa đánh giá
              </button>
            ` : ''}
          </div>

          <small>
            Chỉ người đã đặt vé và thanh toán mới được gửi đánh giá.
          </small>
        </form>
      ` : `
        <p>
          Đăng nhập để viết đánh giá.
          Mọi người đều có thể xem nhận xét.
        </p>
        <button type="button"
                class="extra-button"
                data-extra-login>
          Đăng nhập
        </button>
      `;

      details.innerHTML = `
        <div class="extra-rating-summary">
          <strong>
            ⭐ ${data.count ? data.average.toFixed(1) : 'Chưa có điểm'}
          </strong>
          · ${data.count} lượt đánh giá
        </div>

        ${form}

        <h3>Nhận xét của khán giả</h3>

        ${data.reviews.length
          ? data.reviews.map(r => `
              <article class="extra-review">
                <div class="extra-line">
                  <strong>${html(r.author)}</strong>
                  <span>
                    ${'★'.repeat(r.rating)}
                    ${'☆'.repeat(5 - r.rating)}
                  </span>
                </div>

                <small>
                  ${html(formatDate(r.updatedAt))}
                </small>

                <p>
                  ${html(r.comment).replace(/\n/g, '<br>')}
                </p>
              </article>
            `).join('')
          : '<p>Chưa có đánh giá. Hãy là người đầu tiên!</p>'}
      `;

    } catch (error) {
      if (activeTab === 'reviews' && el('extraReviewDetails')) {
        el('extraReviewDetails').textContent = error.message;
      }
    }
  }

  // Khoi tao giao dien moi
  function init() {
    const nav = document.querySelector('.topbar nav');

    if (!nav) return;

    const adminLink = el('adminNav');

    const payButton = document.createElement('button');
    payButton.type = 'button';
    payButton.className = 'extra-nav';
    payButton.textContent = '💳 Thanh toán';
    payButton.addEventListener('click', loadPayments);
    nav.insertBefore(payButton, adminLink);

    const reviewButton = document.createElement('button');
    reviewButton.type = 'button';
    reviewButton.className = 'extra-nav';
    reviewButton.textContent = '⭐ Đánh giá phim';
    reviewButton.addEventListener('click', loadReviews);
    nav.insertBefore(reviewButton, adminLink);

    dialog = document.createElement('dialog');
    dialog.id = 'cinemaExtraDialog';
    dialog.className = 'extra-dialog';

    dialog.innerHTML = `
      <div class="extra-heading">
        <h2 id="cinemaExtraTitle"></h2>
        <button type="button"
                class="extra-close"
                aria-label="Đóng cửa sổ">
          ✕
        </button>
      </div>

      <div id="cinemaExtraPanel"></div>
    `;

    document.body.appendChild(dialog);
    panel = el('cinemaExtraPanel');

    dialog.querySelector('.extra-close')
      .addEventListener('click', () => dialog.close());

    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });

    // Doi phim
    panel.addEventListener('change', event => {
      if (event.target.id === 'extraMovieSelect') {
        chosenMovieId = event.target.value;
        showReviews();
      }
    });

    // Gui hoac cap nhat danh gia
    panel.addEventListener('submit', async event => {
      if (event.target.id !== 'extraReviewForm') return;

      event.preventDefault();

      const form = event.target;
      const id = form.dataset.ownId;

      const rating = Number(el('extraStars').value);
      const comment = el('extraComment').value.trim();

      if (!comment) {
        alert('Vui lòng nhập nhận xét.');
        return;
      }

      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;

      try {
        await request(
          id
            ? '/reviews/' + encodeURIComponent(id)
            : '/reviews/' + encodeURIComponent(chosenMovieId),
          {
            method: id ? 'PUT' : 'POST',
            body: JSON.stringify({ rating, comment })
          }
        );

        await showReviews();
        alert('Đã lưu đánh giá thành công!');

      } catch (error) {
        alert(error.message);
        submit.disabled = false;
      }
    });

    // Xu ly cac nut thanh toan, xoa, dang nhap
    panel.addEventListener('click', async event => {

      if (event.target.closest('[data-extra-login]')) {
        dialog.close();

        if (typeof openAuth === 'function') {
          openAuth(false);
        } else {
          alert('Hãy bấm nút Đăng nhập trên trang chủ.');
        }
        return;
      }

      const payButton = event.target.closest('[data-extra-pay]');

      if (payButton) {
        if (!confirm(
          'Xác nhận THANH TOÁN MÔ PHỎNG? Không có tiền thật được chuyển.'
        )) return;

        const method = payButton
          .closest('.extra-ticket')
          .querySelector('.extra-method').value;

        payButton.disabled = true;

        try {
          const result = await request('/payments/pay', {
            method: 'POST',
            body: JSON.stringify({
              bookingId: payButton.dataset.extraPay,
              method
            })
          });

          alert(result.message);
          await loadPayments();

        } catch (error) {
          alert(error.message);
          payButton.disabled = false;
        }
        return;
      }

      const deleteButton = event.target.closest('[data-extra-delete]');

      if (deleteButton) {
        if (!confirm('Bạn chắc chắn muốn xóa đánh giá của mình?')) {
          return;
        }

        deleteButton.disabled = true;

        try {
          await request(
            '/reviews/' +
            encodeURIComponent(deleteButton.dataset.extraDelete),
            { method: 'DELETE' }
          );

          await showReviews();

        } catch (error) {
          alert(error.message);
          deleteButton.disabled = false;
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
