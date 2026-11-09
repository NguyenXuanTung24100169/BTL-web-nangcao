
/* =====================================================
   THANH VIEN 1 - GIAO DIEN VA KET NOI API
   WEBSITE MINI CINEMA
===================================================== */

// 1. BIEN DUNG CHUNG

const $ = id => document.getElementById(id);

const state = {
    movies: [],
    showtimes: [],
    user: JSON.parse(sessionStorage.getItem('user') || 'null'),
    token: sessionStorage.getItem('token'),
    selectedMovie: null,
    selectedShow: null,
    selectedSeat: null,
    appliedCoupon: null,
    register: false
};

// 2. CAC HAM HO TRO

function money(number) {
    return Number(number).toLocaleString('vi-VN') + 'đ';
}

function safe(value) {
    const chars = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };

    return String(value ?? '').replace(
        /[&<>"']/g,
        char => chars[char]
    );
}

function notify(message) {
    $('toast').textContent = message;
    $('toast').classList.remove('hidden');

    setTimeout(() => {
        $('toast').classList.add('hidden');
    }, 3200);
}

// 3. KET NOI BACKEND BANG FETCH

async function api(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...(state.token
            ? { Authorization: 'Bearer ' + state.token }
            : {}),
        ...options.headers
    };

    let response;

    try {
        response = await fetch('/api' + url, {
            ...options,
            headers
        });
    } catch {
        throw new Error('Không kết nối được máy chủ.');
    }

    const data = await response.json();

    if (!response.ok) {
        if (response.status === 401 && state.user) {
            state.user = null;
            state.token = null;

            sessionStorage.removeItem('user');
            sessionStorage.removeItem('token');

            updateAccount();
        }

        throw new Error(data.error || 'Thao tác thất bại');
    }

    return data;
}

// 4. HIEN THI TAI KHOAN

function updateAccount() {
    const account = $('account');
    account.replaceChildren();

    $('adminNav').classList.toggle(
        'hidden',
        state.user?.role !== 'admin'
    );

    if (!state.user) {
        const button = document.createElement('button');

        button.className = 'primary';
        button.textContent = 'Đăng nhập';
        button.onclick = () => openAuth(false);

        account.append(button);
        return;
    }

    const greeting = document.createElement('span');
    greeting.textContent = 'Xin chào, ' + state.user.name;

    const logoutButton = document.createElement('button');

    logoutButton.className = 'ghost';
    logoutButton.textContent = 'Đăng xuất';

    logoutButton.onclick = async () => {
        try {
            await api('/logout', { method: 'POST' });
        } catch {
            // Van dang xuat tren trinh duyet
        }

        sessionStorage.removeItem('user');
        sessionStorage.removeItem('token');

        state.user = null;
        state.token = null;

        updateAccount();
        route();

        notify('Đã đăng xuất');
    };

    account.append(greeting, logoutButton);
}

// 5. DANH SACH PHIM VA ANH POSTER

const posters = [
    "https://i.pinimg.com/originals/9c/74/2c/9c742c26c3762505a0cf11ff50f7a1fb.jpg",
    "https://th.bing.com/th/id/OIP.Ru5SWFQiVtN-QX8BfLPHAQHaJ4?r=0&o=7rm=3&rs=1&pid=ImgDetMain&o=7&rm=3",
    "https://cdn2.tuoitre.vn/471584752817336320/2026/2/19/2-17714808145351717034450.jpg",
    "https://tse2.mm.bing.net/th/id/OIP.bDzrZ2guo9ot1w6WIJyEQQHaJQ?r=0&rs=1&pid=ImgDetMain&o=7&rm=3"
];

const movieNames = [
    "Mai",
    "Avengers",
    "Thỏ Ơi",
    "Quỷ Ăn Tạng"
];

async function load() {
    [state.movies, state.showtimes] = await Promise.all([
        api('/movies'),
        api('/showtimes')
    ]);

    renderMovies();
}

function renderMovies() {
    const keyword = $('search').value.trim().toLowerCase();

    const movies = state.movies.map((movie, index) => ({
        ...movie,
        displayTitle: movie.title || movieNames[index],
        poster: movie.poster || posters[index] || ''
    }));

    const filteredMovies = movies.filter(movie =>
        movie.displayTitle.toLowerCase().includes(keyword) ||
        (movie.genre && movie.genre.toLowerCase().includes(keyword))
    );

    $('movieList').innerHTML = filteredMovies.length
        ? filteredMovies.map(movie => {
            const validPoster = /^https?:\/\/.+/i.test(movie.poster) || movie.poster.startsWith('/uploads/');

            const posterHTML = validPoster
                ? `<img
                    src="${safe(movie.poster)}"
                    alt="${safe(movie.displayTitle)}"
                    loading="lazy"
                  >`
                : '🎬';

            return `
                <article class="movie">
                    <div class="poster">
                        ${posterHTML}
                    </div>

                    <div class="movie-content">
                        <h3>${safe(movie.displayTitle)}</h3>

                        <div class="muted">
                            ${safe(movie.genre)}
                            · ${Number(movie.duration)} phút
                        </div>

                        ${movie.director ? `<small class="muted" style="display:block;margin-top:4px;">Đạo diễn: ${safe(movie.director)}</small>` : ''}
                        ${movie.releaseDate ? `<small class="muted" style="display:block;">Khởi chiếu: ${safe(movie.releaseDate)}</small>` : ''}

                        <p>${safe(movie.description || '')}</p>

                        <button
                            class="primary"
                            data-book="${safe(movie.id)}"
                        >
                            Đặt vé ngay →
                        </button>
                    </div>
                </article>
            `;
        }).join('')
        : '<p class="muted">Không tìm thấy phim.</p>';
}

// 6. CHUYEN DOI CAC TRANG

function showOnly(pageId) {
    const pages = ['home', 'booking', 'tickets', 'admin'];

    for (const page of pages) {
        $(page).classList.toggle(
            'hidden',
            page !== pageId
        );
    }

    $('hero').classList.toggle(
        'hidden',
        pageId !== 'home'
    );
}

async function route() {
    const page = location.hash.slice(1).split('/')[0] || 'home';

    if (page === 'tickets') {
        showOnly('tickets');
        await renderTickets();

    } else if (page === 'admin') {
        if (!state.user) {
            openAuth(false);
            notify('Bạn cần đăng nhập bằng tài khoản quản trị.');
            location.hash = 'home';
            return;
        }
        if (state.user.role === 'admin') {
            location.href = '/admin.html';
            return;
        } else {
            notify('Bạn không có quyền truy cập trang quản trị.');
            location.hash = 'home';
            return;
        }

    } else if (
        page === 'booking' &&
        state.selectedMovie
    ) {
        showOnly('booking');
        renderShowtimes();

    } else {
        showOnly('home');
    }
}

// 7. CHON SUAT CHIEU

function renderShowtimes() {
    const movieIndex = state.movies.findIndex(
        movie => movie.id === state.selectedMovie
    );

    if (movieIndex === -1) {
        location.hash = 'home';
        return;
    }

    const movie = state.movies[movieIndex];

    $('bookingTitle').textContent =
        movieNames[movieIndex] || movie.title;

    $('seatArea').classList.add('hidden');

    const shows = state.showtimes.filter(
        show => show.movieId === movie.id
    );

    $('showtimeArea').innerHTML = shows.length
        ? shows.map(show => `
            <button
                class="showtime"
                data-show="${safe(show.id)}"
            >
                <strong>${safe(show.time)}</strong>
                <br>
                ${safe(show.room)}
                <br>
                ${money(show.price)}
            </button>
        `).join('')
        : '<p>Chưa có suất chiếu cho phim này.</p>';
}

// 8. HIEN THI SO DO GHE

async function showSeats(showId) {
    state.selectedShow = showId;
    state.selectedSeat = null;
    state.appliedCoupon = null;
    if ($('couponInput')) $('couponInput').value = '';
    if ($('couponMsg')) $('couponMsg').textContent = '';

    const takenSeats = await api(
        `/showtimes/${encodeURIComponent(showId)}/seats`
    );

    $('seatArea').classList.remove('hidden');

    const rows = ['A', 'B', 'C', 'D'];
    const seatButtons = [];

    for (const row of rows) {
        for (let number = 1; number <= 8; number++) {
            const seat = row + number;
            const taken = takenSeats.includes(seat);

            seatButtons.push(`
                <button
                    class="seat ${taken ? 'taken' : ''}"
                    data-seat="${seat}"
                    ${taken ? 'disabled' : ''}
                >
                    ${seat}
                </button>
            `);
        }
    }

    $('seatGrid').innerHTML = seatButtons.join('');

    updateSeat();
}

// 9. CAP NHAT GHE DUOC CHON

function updateSeat() {
    if (!state.selectedSeat) {
        $('selection').textContent = 'Chưa chọn ghế';
        $('confirmBooking').disabled = true;
        return;
    }

    const show = state.showtimes.find(
        item => item.id === state.selectedShow
    );

    let basePrice = Number(show?.price || 0);
    const rowChar = state.selectedSeat.charAt(0);
    if (rowChar === 'C') basePrice = Math.round(basePrice * 1.2 / 1000) * 1000;
    else if (rowChar === 'D') basePrice = Math.round(basePrice * 1.4 / 1000) * 1000;

    let finalPrice = basePrice;
    let discountText = '';

    if (state.appliedCoupon) {
        finalPrice = Math.max(0, basePrice - state.appliedCoupon.discount);
        discountText = ` (Đã giảm ${money(state.appliedCoupon.discount)})`;
    }

    $('selection').innerHTML =
        `Ghế ${state.selectedSeat} · <strong>${money(finalPrice)}</strong>${discountText ? `<span style="color:#10b981;font-size:0.85rem;">${discountText}</span>` : ''}`;

    $('confirmBooking').disabled = false;
}

// =====================================
// 10. HIEN THI VE DA DAT + HUY VE
// =====================================

async function renderTickets() {
    if (!state.user) {
        $('ticketList').innerHTML = `
            <p>Bạn cần đăng nhập để xem vé đã đặt.</p>

            <button class="primary" id="ticketLogin">
                Đăng nhập
            </button>
        `;
        return;
    }

    try {
        const tickets = await api('/my-bookings');

        if (tickets.length === 0) {
            $('ticketList').innerHTML =
                '<p>Bạn chưa đặt vé nào.</p>';
            return;
        }

        $('ticketList').innerHTML = tickets
            .slice()
            .reverse()
            .map(ticket => {
                const show = state.showtimes.find(
                    item => item.id === ticket.showtimeId
                );

                const movieIndex = state.movies.findIndex(
                    item => item.id === show?.movieId
                );

                const movie = state.movies[movieIndex];

                const title = movieIndex >= 0
                    ? movieNames[movieIndex] || movie.title
                    : 'Phim đã xóa';

                // KIEM TRA TRANG THAI VE
                const cancelled = ticket.status === 'cancelled';

                return `
                    <article class="ticket ${cancelled ? 'ticket-cancelled' : ''}">

                        <div>
                            <strong>
                                🎟 ${safe(title)}
                            </strong>

                            <small>
                                ${safe(show?.time || 'Suất chiếu')}
                                · ${safe(show?.room || 'Phòng chiếu')}
                                · Ghế ${safe(ticket.seat)}
                            </small>
                        </div>

                        <div class="ticket-actions">

                            <strong>
                                ${money(ticket.price)}
                            </strong>

                            <span class="ticket-status ${cancelled ? 'status-cancelled' : 'status-confirmed'}">
                                ${cancelled ? 'Đã hủy' : 'Đã đặt'}
                            </span>

                            ${cancelled ? '' : `
                                <button
                                    class="cancel-ticket"
                                    data-cancel-ticket="${safe(ticket.id)}"
                                >
                                    Hủy vé
                                </button>
                            `}

                        </div>

                    </article>
                `;
            }).join('');

    } catch (error) {
        notify(error.message);
    }
}

// 11. TRANG QUAN TRI PHIM

function renderAdmin() {
    $('adminMovies').innerHTML = state.movies.map(
        movie => `
            <div class="admin-row">
                <div>
                    <strong>${safe(movie.title)}</strong>

                    <div class="muted">
                        ${safe(movie.genre)}
                        · ${Number(movie.duration)} phút
                    </div>
                </div>

                <div>
                    <button
                        class="ghost"
                        data-edit="${safe(movie.id)}"
                    >
                        Sửa
                    </button>

                    <button
                        class="ghost"
                        data-delete="${safe(movie.id)}"
                    >
                        Xóa
                    </button>
                </div>
            </div>
        `
    ).join('');
}

// 12. HOP THOAI DANG NHAP / DANG KY

function openAuth(isRegister) {
    state.register = isRegister;

    $('authTitle').textContent =
        isRegister ? 'Đăng ký tài khoản' : 'Đăng nhập';

    $('authSubmit').textContent =
        isRegister ? 'Đăng ký' : 'Đăng nhập';

    $('toggleAuth').textContent = isRegister
        ? 'Đã có tài khoản? Đăng nhập'
        : 'Chưa có tài khoản? Đăng ký';

    $('nameWrap').classList.toggle(
        'hidden',
        !isRegister
    );

    $('authName').required = isRegister;

    if (!$('authDialog').open) {
        $('authDialog').showModal();
    }
}

// 13. CAC SU KIEN NGUOI DUNG

$('search').oninput = renderMovies;

// BAM NUT DAT VE
$('movieList').onclick = event => {
    const button = event.target.closest('[data-book]');

    if (!button) return;

    state.selectedMovie = button.dataset.book;
    state.selectedShow = null;

    location.hash = 'booking';
    route();
};

// BAM CHON SUAT CHIEU
$('showtimeArea').onclick = event => {
    const button = event.target.closest('[data-show]');

    if (!button) return;

    showSeats(button.dataset.show)
        .catch(error => notify(error.message));
};

// BAM CHON GHE
$('seatGrid').onclick = event => {
    const button = event.target.closest('[data-seat]');

    if (!button || button.disabled) return;

    state.selectedSeat = button.dataset.seat;

    document.querySelectorAll('.seat').forEach(
        seatButton => {
            seatButton.classList.toggle(
                'selected',
                seatButton === button
            );
        }
    );

    updateSeat();
};

// AP DUNG MA GIAM GIA
if ($('applyCouponBtn')) {
    $('applyCouponBtn').onclick = async () => {
        if (!state.selectedSeat) {
            notify('Vui lòng chọn ghế trước khi áp dụng mã giảm giá.');
            return;
        }

        const code = $('couponInput').value.trim();
        if (!code) {
            notify('Vui lòng nhập mã giảm giá.');
            return;
        }

        const show = state.showtimes.find(s => s.id === state.selectedShow);
        let basePrice = Number(show?.price || 75000);
        const rowChar = state.selectedSeat.charAt(0);
        if (rowChar === 'C') basePrice = Math.round(basePrice * 1.2 / 1000) * 1000;
        else if (rowChar === 'D') basePrice = Math.round(basePrice * 1.4 / 1000) * 1000;

        try {
            const res = await api('/promotions/apply', {
                method: 'POST',
                body: JSON.stringify({ code, price: basePrice })
            });

            state.appliedCoupon = { code: res.code, discount: res.discount, finalPrice: res.finalPrice };
            $('couponMsg').innerHTML = `<span style="color:#10b981;">✓ ${safe(res.description || 'Áp dụng thành công!')} (Giảm ${money(res.discount)})</span>`;
            updateSeat();
            notify(`Đã áp dụng mã ${res.code}: Giảm ${money(res.discount)}!`);
        } catch (err) {
            state.appliedCoupon = null;
            $('couponMsg').innerHTML = `<span style="color:#ef4444;">✕ ${safe(err.message)}</span>`;
            updateSeat();
            notify(err.message);
        }
    };
}

// 14. XAC NHAN DAT VE

$('confirmBooking').onclick = async () => {
    if (!state.user) {
        openAuth(false);
        notify('Đăng nhập trước khi đặt vé.');
        return;
    }

    try {
        await api('/bookings', {
            method: 'POST',

            body: JSON.stringify({
                showtimeId: state.selectedShow,
                seat: state.selectedSeat,
                promoCode: state.appliedCoupon ? state.appliedCoupon.code : undefined
            })
        });

        notify('Đặt vé thành công!');

        location.hash = 'tickets';
        route();

    } catch (error) {
        notify(error.message);

        if (state.selectedShow) {
            await showSeats(state.selectedShow);
        }
    }
};

// =====================================
// 15. CHUC NANG HUY VE - MOI THEM
// =====================================

$('ticketList').onclick = async event => {

    // DANG NHAP TU TRANG VE
    if (event.target.closest('#ticketLogin')) {
        openAuth(false);
        return;
    }

    // TIM NUT HUY VE DUOC NHAN
    const button = event.target.closest('[data-cancel-ticket]');

    if (!button || button.disabled) return;

    // HIEN THONG BAO XAC NHAN
    const confirmCancel = confirm(
        'Bạn có chắc chắn muốn hủy vé này? Ghế sẽ được mở lại.'
    );

    if (!confirmCancel) return;

    // KHONG CHO BAM LIEN TUC
    button.disabled = true;

    try {

        // GUI YEU CAU HUY VE LEN BACKEND
        await api(
            '/bookings/' +
            encodeURIComponent(button.dataset.cancelTicket),
            {
                method: 'DELETE'
            }
        );

        // THONG BAO THANH CONG
        notify('Hủy vé thành công!');

        // CAP NHAT DANH SACH VE
        await renderTickets();

    } catch (error) {

        // THONG BAO LOI
        notify(error.message);

        // CHO PHEP THU LAI
        button.disabled = false;
    }
};

// 16. NUT DIEU HUONG

$('backBtn').onclick = () => {
    location.hash = 'home';
};

$('closeDialog').onclick = () => {
    $('authDialog').close();
};

$('toggleAuth').onclick = () => {
    openAuth(!state.register);
};

// 17. XU LY DANG KY / DANG NHAP

$('authForm').onsubmit = async event => {
    event.preventDefault();

    const email = $('authEmail').value;
    const password = $('authPassword').value;

    try {
        if (state.register) {
            await api('/register', {
                method: 'POST',

                body: JSON.stringify({
                    name: $('authName').value,
                    email,
                    password
                })
            });

            notify('Đăng ký thành công. Hãy đăng nhập.');
            openAuth(false);

        } else {
            const result = await api('/login', {
                method: 'POST',

                body: JSON.stringify({
                    email,
                    password
                })
            });

            state.user = result.user;
            state.token = result.token;

            sessionStorage.setItem(
                'user',
                JSON.stringify(result.user)
            );

            sessionStorage.setItem(
                'token',
                result.token
            );

            $('authDialog').close();

            updateAccount();
            route();

            notify('Đăng nhập thành công.');
        }

    } catch (error) {
        notify(error.message);
    }
};

// 18. THEM HOAC SUA PHIM

$('movieForm').onsubmit = async event => {
    event.preventDefault();

    const id = $('movieId').value;

    const movieData = {
        title: $('movieTitle').value,
        genre: $('movieGenre').value,
        duration: Number($('movieDuration').value),
        description: $('movieDescription').value
    };

    try {
        await api(
            '/movies' + (id ? '/' + encodeURIComponent(id) : ''),
            {
                method: id ? 'PUT' : 'POST',
                body: JSON.stringify(movieData)
            }
        );

        $('movieForm').reset();
        $('movieId').value = '';

        await load();
        renderAdmin();

        notify('Lưu phim thành công.');

    } catch (error) {
        notify(error.message);
    }
};

// 19. HUY CHINH SUA

$('cancelEdit').onclick = () => {
    $('movieForm').reset();
    $('movieId').value = '';
};

// 20. SUA / XOA PHIM

$('adminMovies').onclick = async event => {
    const editButton = event.target.closest('[data-edit]');
    const deleteButton = event.target.closest('[data-delete]');

    // SUA PHIM
    if (editButton) {
        const movie = state.movies.find(
            item => item.id === editButton.dataset.edit
        );

        if (!movie) return;

        $('movieId').value = movie.id;
        $('movieTitle').value = movie.title;
        $('movieGenre').value = movie.genre;
        $('movieDuration').value = movie.duration;
        $('movieDescription').value = movie.description;

        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }

    // XOA PHIM
    if (
        deleteButton &&
        confirm('Bạn có chắc muốn xóa phim này?')
    ) {
        try {
            await api(
                '/movies/' +
                encodeURIComponent(deleteButton.dataset.delete),
                { method: 'DELETE' }
            );

            await load();
            renderAdmin();

            notify('Xóa phim thành công.');

        } catch (error) {
            notify(error.message);
        }
    }
};

// 21. KHOI DONG WEBSITE

window.onhashchange = route;

updateAccount();

load()
    .then(route)
    .catch(error => notify(error.message));
