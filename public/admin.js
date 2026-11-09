/* ==============================================================================
   MINI CINEMA — ADMIN PORTAL JAVASCRIPT
   ============================================================================== */

const $ = id => document.getElementById(id);

const state = {
    token: sessionStorage.getItem('token'),
    user: JSON.parse(sessionStorage.getItem('user') || 'null'),
    currentSection: 'dashboard',
    stats: null,
    movies: [],
    showtimes: [],
    rooms: [],
    bookings: [],
    users: [],
    promotions: [],
    selectedRoom: null,
    chartPeriod: 'date' // 'date' | 'month' | 'year'
};

// ==============================================================================
// 1. HELPERS & FORMATTING
// ==============================================================================
function money(val) {
    return Number(val || 0).toLocaleString('vi-VN') + 'đ';
}

function safe(str) {
    const chars = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(str ?? '').replace(/[&<>"']/g, c => chars[c]);
}

function formatDate(isoStr) {
    if (!isoStr) return '';
    try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return isoStr;
        return d.toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
        return isoStr;
    }
}

function notify(message, type = 'success') {
    const container = $('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = '✓';
    if (type === 'error') icon = '✕';
    else if (type === 'info') icon = 'ℹ';

    toast.innerHTML = `<span>${icon}</span><span>${safe(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3200);
}

// Confirmation Dialog Modal Helper
let onConfirmCallback = null;
function confirmDialog(title, message, callback) {
    $('confirmModalTitle').textContent = title || 'Xác Nhận';
    $('confirmModalMessage').textContent = message || 'Bạn có chắc chắn muốn thực hiện thao tác này?';
    onConfirmCallback = callback;
    openModal('confirmModal');
}

$('confirmModalOkBtn').onclick = () => {
    closeModal('confirmModal');
    if (typeof onConfirmCallback === 'function') {
        onConfirmCallback();
        onConfirmCallback = null;
    }
};

// ==============================================================================
// 2. API REQUEST WRAPPER
// ==============================================================================
async function api(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}),
        ...options.headers
    };

    let response;
    try {
        response = await fetch('/api' + url, {
            ...options,
            headers
        });
    } catch {
        throw new Error('Không thể kết nối đến máy chủ.');
    }

    let data;
    try {
        data = await response.json();
    } catch {
        data = { error: 'Lỗi định dạng dữ liệu máy chủ.' };
    }

    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            if (url !== '/login' && url !== '/admin/check-auth') {
                showAuthOverlay();
            }
        }
        throw new Error(data.error || 'Thao tác thất bại');
    }

    return data;
}

// ==============================================================================
// 3. AUTHENTICATION & ACCESS GUARD
// ==============================================================================
function showAuthOverlay() {
    $('adminAuthOverlay').classList.remove('hidden');
}

function hideAuthOverlay() {
    $('adminAuthOverlay').classList.add('hidden');
}

async function checkAdminAuth() {
    if (!state.token || !state.user || state.user.role !== 'admin') {
        showAuthOverlay();
        return false;
    }

    try {
        const res = await api('/admin/check-auth');
        if (res.ok) {
            hideAuthOverlay();
            updateAdminProfileUI(res.user);
            return true;
        }
    } catch {
        showAuthOverlay();
        return false;
    }
    return false;
}

function updateAdminProfileUI(user) {
    if (!user) return;
    $('sidebarAdminName').textContent = user.name;
    $('sidebarAdminEmail').textContent = user.email;
    $('sidebarAvatar').textContent = (user.name || 'A').charAt(0).toUpperCase();
    $('topbarAdminName').textContent = user.name;
}

$('adminLoginForm').onsubmit = async (e) => {
    e.preventDefault();
    const email = $('adminEmail').value.trim();
    const password = $('adminPassword').value;

    try {
        const res = await api('/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        if (res.user.role !== 'admin') {
            throw new Error('Tài khoản này không có quyền quản trị viên.');
        }

        state.token = res.token;
        state.user = res.user;
        sessionStorage.setItem('token', res.token);
        sessionStorage.setItem('user', JSON.stringify(res.user));

        hideAuthOverlay();
        updateAdminProfileUI(res.user);
        notify('Đăng nhập quản trị thành công!');
        await initAdminData();
    } catch (err) {
        notify(err.message, 'error');
    }
};

function logoutAdmin() {
    confirmDialog('Đăng xuất', 'Bạn có chắc chắn muốn đăng xuất khỏi trang quản trị?', async () => {
        try {
            await api('/logout', { method: 'POST' });
        } catch {}
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        state.token = null;
        state.user = null;
        location.href = '/';
    });
}

$('logoutBtn').onclick = logoutAdmin;
$('topbarLogoutBtn').onclick = logoutAdmin;

// ==============================================================================
// 4. NAVIGATION & SECTION ROUTING
// ==============================================================================
function switchSection(sectionId) {
    state.currentSection = sectionId;

    // Cập nhật menu sidebar
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.section === sectionId);
    });

    // Cập nhật tiêu đề trang
    const titles = {
        dashboard: 'Tổng Quan Dashboard',
        movies: 'Quản Lý Danh Sách Phim',
        showtimes: 'Quản Lý Suất Chiếu',
        rooms: 'Quản Lý Phòng Chiếu & Sơ Đồ Ghế',
        bookings: 'Quản Lý Đơn Đặt Vé',
        users: 'Quản Lý Tài Khoản Khách Hàng',
        promotions: 'Quản Lý Mã Khuyến Mãi'
    };
    $('pageTitle').textContent = titles[sectionId] || 'Hệ Thống Quản Trị';

    // Ẩn/hiện section
    document.querySelectorAll('.admin-section').forEach(sec => {
        sec.classList.toggle('active', sec.id === `sec-${sectionId}`);
    });

    // Tự động load dữ liệu theo section
    if (sectionId === 'dashboard') loadDashboard();
    else if (sectionId === 'movies') loadMovies();
    else if (sectionId === 'showtimes') loadShowtimes();
    else if (sectionId === 'rooms') loadRooms();
    else if (sectionId === 'bookings') loadBookings();
    else if (sectionId === 'users') loadUsers();
    else if (sectionId === 'promotions') loadPromotions();

    // Đóng sidebar trên mobile nếu đang mở
    $('sidebar').classList.remove('show');
}

// Lắng nghe click sidebar
document.querySelectorAll('.sidebar-nav [data-section]').forEach(item => {
    item.onclick = (e) => {
        e.preventDefault();
        const sec = item.dataset.section;
        location.hash = sec;
        switchSection(sec);
    };
});

window.onhashchange = () => {
    const sec = location.hash.slice(1) || 'dashboard';
    switchSection(sec);
};

// Mobile toggle
$('mobileMenuBtn').onclick = () => $('sidebar').classList.add('show');
$('sidebarCloseBtn').onclick = () => $('sidebar').classList.remove('show');

// ==============================================================================
// 5. MODAL MANAGER
// ==============================================================================
function openModal(modalId) {
    const m = $(modalId);
    if (m) m.classList.add('active');
}

function closeModal(modalId) {
    const m = $(modalId);
    if (m) m.classList.remove('active');
}

document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.onclick = () => closeModal(btn.dataset.closeModal);
});

// Click ra ngoài modal để đóng
document.querySelectorAll('.modal').forEach(m => {
    m.onclick = (e) => {
        if (e.target === m) closeModal(m.id);
    };
});

// ==============================================================================
// 6. DASHBOARD & BIỂU ĐỒ REVENUE CHART (HTML5 CANVAS)
// ==============================================================================
async function loadDashboard() {
    try {
        const stats = await api('/admin/stats');
        state.stats = stats;

        // Metric Cards
        const m = stats.metrics || {};
        $('statRevenue').textContent = money(m.totalRevenue);
        $('statTickets').textContent = (m.confirmedBookings || 0).toLocaleString();
        $('statTicketSub').textContent = `${m.cancelledBookings || 0} đã hủy · ${m.refundedBookings || 0} đã hoàn tiền`;
        $('statMovies').textContent = `${m.activeMovies || 0} / ${m.totalMovies || 0}`;
        $('statShowtimes').textContent = (m.totalShowtimes || 0).toLocaleString();
        $('statUsers').textContent = (m.totalUsers || 0).toLocaleString();
        $('statUserSub').textContent = `${m.lockedUsers || 0} tài khoản đang bị khóa`;

        // Render Biểu đồ
        renderRevenueChart();

        // Render Top Phim Ăn Khách
        renderTopMovies(stats.topMovies || []);

        // Render Giao dịch gần đây
        renderRecentBookings(stats.recentBookings || []);
    } catch (err) {
        notify(err.message, 'error');
    }
}

// Chuyển đổi tab thời gian biểu đồ
document.querySelectorAll('.chart-period-tabs .period-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.chart-period-tabs .period-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.chartPeriod = btn.dataset.period;
        renderRevenueChart();
    };
});

function renderRevenueChart() {
    if (!state.stats) return;
    const canvas = $('revenueChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let dataPoints = [];
    if (state.chartPeriod === 'date') {
        dataPoints = (state.stats.revenueByDate || []).map(d => ({ label: d.label, value: d.revenue, sub: `${d.tickets} vé` }));
    } else if (state.chartPeriod === 'month') {
        dataPoints = (state.stats.revenueByMonth || []).map(d => ({ label: d.month, value: d.revenue, sub: `${d.tickets} vé` }));
    } else {
        dataPoints = (state.stats.revenueByYear || []).map(d => ({ label: d.year, value: d.revenue, sub: `${d.tickets} vé` }));
    }

    if (dataPoints.length === 0) return;

    // Reset canvas resolution
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = (rect.width || 800) * dpr;
    canvas.height = 280 * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width || 800;
    const h = 280;
    const padding = { top: 30, right: 25, bottom: 45, left: 65 };

    ctx.clearRect(0, 0, w, h);

    // Max value calculation
    const maxVal = Math.max(...dataPoints.map(p => p.value), 100000);
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    // Draw horizontal grid lines & labels
    const gridLines = 4;
    ctx.strokeStyle = '#26293d';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#64748b';
    ctx.font = '11px Plus Jakarta Sans, sans-serif';
    ctx.textAlign = 'right';

    for (let i = 0; i <= gridLines; i++) {
        const yVal = (maxVal / gridLines) * i;
        const yPos = padding.top + chartH - (chartH * (i / gridLines));
        
        ctx.beginPath();
        ctx.moveTo(padding.left, yPos);
        ctx.lineTo(w - padding.right, yPos);
        ctx.stroke();

        ctx.fillText(money(yVal), padding.left - 10, yPos + 4);
    }

    // Draw Bars
    const barWidth = Math.min(42, (chartW / dataPoints.length) * 0.55);
    const step = chartW / dataPoints.length;

    dataPoints.forEach((point, idx) => {
        const x = padding.left + idx * step + (step - barWidth) / 2;
        const barH = (point.value / maxVal) * chartH;
        const y = padding.top + chartH - barH;

        // Gradient for bars
        const grad = ctx.createLinearGradient(0, y, 0, padding.top + chartH);
        grad.addColorStop(0, '#ef4444');
        grad.addColorStop(1, '#991b1b');

        ctx.fillStyle = grad;
        // Rounded bar top
        const r = Math.min(6, barWidth / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + barWidth - r, y);
        ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + r);
        ctx.lineTo(x + barWidth, padding.top + chartH);
        ctx.lineTo(x, padding.top + chartH);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fill();

        // X-axis label
        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px Plus Jakarta Sans, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(point.label, x + barWidth / 2, h - 22);

        // Sub text (tickets count)
        ctx.fillStyle = '#64748b';
        ctx.font = '10px Plus Jakarta Sans, sans-serif';
        ctx.fillText(point.sub, x + barWidth / 2, h - 8);

        // Bar top value if > 0
        if (point.value > 0) {
            ctx.fillStyle = '#f8fafc';
            ctx.font = 'bold 10px Plus Jakarta Sans, sans-serif';
            ctx.fillText(money(point.value), x + barWidth / 2, y - 6);
        }
    });
}

function renderTopMovies(topMovies) {
    const container = $('topMoviesList');
    if (!topMovies || topMovies.length === 0) {
        container.innerHTML = '<p class="text-muted text-center py-4">Chưa có dữ liệu đặt vé</p>';
        return;
    }

    container.innerHTML = topMovies.map((m, idx) => `
        <div class="top-movie-item">
            ${m.poster ? `<img src="${safe(m.poster)}" class="top-movie-poster" alt="${safe(m.title)}">` : '<div class="top-movie-poster">🎬</div>'}
            <div class="top-movie-info">
                <h4>#${idx + 1}. ${safe(m.title)}</h4>
                <div class="top-movie-stats">
                    <span>${m.tickets} vé đã bán</span>
                    <strong>${money(m.revenue)}</strong>
                </div>
                <div class="top-movie-progress">
                    <div class="top-movie-progress-bar" style="width: ${m.percentage || 10}%"></div>
                </div>
            </div>
        </div>
    `).join('');
}

function renderRecentBookings(bookings) {
    const tbody = $('recentBookingsTbody');
    if (!bookings || bookings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Chưa có giao dịch đặt vé nào.</td></tr>';
        return;
    }

    tbody.innerHTML = bookings.map(b => {
        let badgeClass = 'badge-success';
        let badgeLabel = 'Đã đặt';
        if (b.status === 'cancelled') {
            badgeClass = 'badge-danger';
            badgeLabel = 'Đã hủy';
        } else if (b.status === 'refunded') {
            badgeClass = 'badge-warning';
            badgeLabel = 'Đã hoàn tiền';
        }

        return `
            <tr>
                <td><code>#${safe(b.id.slice(0, 8))}</code></td>
                <td>
                    <strong>${safe(b.userName)}</strong>
                    <br><small class="text-muted">${safe(b.userEmail)}</small>
                </td>
                <td>${safe(b.movieTitle)}</td>
                <td>${safe(b.showtime)} · ${safe(b.room)}</td>
                <td><span class="badge badge-secondary">${safe(b.seat)}</span></td>
                <td><strong>${money(b.price)}</strong></td>
                <td><span class="badge ${badgeClass}">${badgeLabel}</span></td>
                <td><small class="text-muted">${formatDate(b.createdAt)}</small></td>
            </tr>
        `;
    }).join('');
}

// ==============================================================================
// 7. QUẢN LÝ PHIM (MOVIES CRUD)
// ==============================================================================
async function loadMovies() {
    try {
        const movies = await api('/movies');
        state.movies = movies;

        // Populate Genre filter dropdown
        const genres = Array.from(new Set(movies.flatMap(m => (m.genre || '').split(',').map(g => g.trim())))).filter(Boolean);
        $('movieGenreFilter').innerHTML = '<option value="">Tất cả thể loại</option>' + genres.map(g => `<option value="${safe(g)}">${safe(g)}</option>`).join('');

        renderMoviesTable();
    } catch (err) {
        notify(err.message, 'error');
    }
}

function renderMoviesTable() {
    const tbody = $('moviesTableBody');
    const kw = $('movieSearchInput').value.trim().toLowerCase();
    const genre = $('movieGenreFilter').value;
    const status = $('movieStatusFilter').value;

    let filtered = state.movies.filter(m => {
        const matchKw = !kw || m.title.toLowerCase().includes(kw) || (m.director && m.director.toLowerCase().includes(kw));
        const matchGenre = !genre || (m.genre && m.genre.includes(genre));
        const matchStatus = !status || m.status === status;
        return matchKw && matchGenre && matchStatus;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Không tìm thấy phim nào phù hợp.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(m => {
        let statusBadge = '<span class="badge badge-success">Đang chiếu</span>';
        if (m.status === 'coming_soon') statusBadge = '<span class="badge badge-warning">Sắp chiếu</span>';
        else if (m.status === 'ended') statusBadge = '<span class="badge badge-secondary">Ngừng chiếu</span>';

        return `
            <tr>
                <td>
                    ${m.poster ? `<img src="${safe(m.poster)}" alt="${safe(m.title)}" style="width:48px;height:64px;border-radius:4px;object-fit:cover;">` : '<div style="width:48px;height:64px;background:#1b1e2e;display:flex;align-items:center;justify-content:center;border-radius:4px;">🎬</div>'}
                </td>
                <td>
                    <strong>${safe(m.title)}</strong>
                    <br><small class="text-muted">${safe((m.description || '').slice(0, 50))}...</small>
                </td>
                <td><span class="badge badge-info">${safe(m.genre)}</span></td>
                <td>${m.duration} phút</td>
                <td>
                    <small><strong>ĐD:</strong> ${safe(m.director || 'Chưa cập nhật')}</small>
                    <br><small class="text-muted"><strong>DV:</strong> ${safe(m.actors || 'Chưa cập nhật')}</small>
                </td>
                <td><small>${safe(m.releaseDate || 'N/A')}</small></td>
                <td>${statusBadge}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-outline btn-sm" onclick="editMovie('${safe(m.id)}')">✏️ Sửa</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteMovie('${safe(m.id)}')">🗑️ Xóa</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

$('movieSearchInput').oninput = renderMoviesTable;
$('movieGenreFilter').onchange = renderMoviesTable;
$('movieStatusFilter').onchange = renderMoviesTable;

// Thêm phim mới button
$('addMovieBtn').onclick = () => {
    $('movieModalTitle').textContent = 'Thêm Phim Mới';
    $('formMovieId').value = '';
    $('movieForm').reset();
    $('posterPreview').innerHTML = '<span>Chưa có ảnh</span>';
    openModal('movieModal');
};

// Sửa phim
window.editMovie = (id) => {
    const movie = state.movies.find(m => m.id === id);
    if (!movie) return;

    $('movieModalTitle').textContent = 'Chỉnh Sửa Thông Tin Phim';
    $('formMovieId').value = movie.id;
    $('formMovieTitle').value = movie.title;
    $('formMovieDuration').value = movie.duration;
    $('formMovieGenre').value = movie.genre;
    $('formMovieStatus').value = movie.status || 'now_showing';
    $('formMovieReleaseDate').value = movie.releaseDate || '';
    $('formMovieDirector').value = movie.director || '';
    $('formMovieActors').value = movie.actors || '';
    $('formMoviePoster').value = movie.poster || '';
    $('formMovieBanner').value = movie.banner || '';
    $('formMovieTrailer').value = movie.trailer || '';
    $('formMovieDescription').value = movie.description || '';

    if (movie.poster) {
        $('posterPreview').innerHTML = `<img src="${safe(movie.poster)}" alt="Preview">`;
    } else {
        $('posterPreview').innerHTML = '<span>Chưa có ảnh</span>';
    }

    openModal('movieModal');
};

// Xem preview khi paste link ảnh poster
$('formMoviePoster').oninput = () => {
    const url = $('formMoviePoster').value.trim();
    if (url) {
        $('posterPreview').innerHTML = `<img src="${safe(url)}" alt="Preview" onerror="this.src='';this.alt='Lỗi tải ảnh';">`;
    } else {
        $('posterPreview').innerHTML = '<span>Chưa có ảnh</span>';
    }
};

// Upload file ảnh poster trực tiếp từ máy tính
$('posterFileInput').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
        try {
            notify('Đang tải ảnh lên...', 'info');
            const res = await api('/admin/upload-image', {
                method: 'POST',
                body: JSON.stringify({ data: reader.result })
            });
            $('formMoviePoster').value = res.url;
            $('posterPreview').innerHTML = `<img src="${safe(res.url)}" alt="Preview">`;
            notify('Tải ảnh poster thành công!');
        } catch (err) {
            notify(err.message, 'error');
        }
    };
    reader.readAsDataURL(file);
};

// Lưu phim (Thêm / Sửa)
$('movieForm').onsubmit = async (e) => {
    e.preventDefault();
    const id = $('formMovieId').value;

    const payload = {
        title: $('formMovieTitle').value.trim(),
        duration: Number($('formMovieDuration').value),
        genre: $('formMovieGenre').value.trim(),
        status: $('formMovieStatus').value,
        releaseDate: $('formMovieReleaseDate').value,
        director: $('formMovieDirector').value.trim(),
        actors: $('formMovieActors').value.trim(),
        poster: $('formMoviePoster').value.trim(),
        banner: $('formMovieBanner').value.trim(),
        trailer: $('formMovieTrailer').value.trim(),
        description: $('formMovieDescription').value.trim()
    };

    try {
        if (id) {
            await api(`/movies/${encodeURIComponent(id)}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            notify('Cập nhật phim thành công!');
        } else {
            await api('/movies', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            notify('Thêm phim mới thành công!');
        }

        closeModal('movieModal');
        await loadMovies();
    } catch (err) {
        notify(err.message, 'error');
    }
};

// Xóa phim
window.deleteMovie = (id) => {
    const movie = state.movies.find(m => m.id === id);
    if (!movie) return;

    confirmDialog('Xóa Phim', `Bạn có chắc chắn muốn xóa phim "${movie.title}"?`, async () => {
        try {
            await api(`/movies/${encodeURIComponent(id)}`, { method: 'DELETE' });
            notify('Đã xóa phim thành công!');
            await loadMovies();
        } catch (err) {
            // Nếu có suất chiếu, hỏi admin có muốn force xóa không
            if (err.message.includes('suất chiếu')) {
                confirmDialog('Cảnh Báo Xóa Phim Có Suất Chiếu', `${err.message}\nBạn có muốn XÓA TOÀN BỘ suất chiếu và vé liên quan đến phim này không?`, async () => {
                    try {
                        await api(`/movies/${encodeURIComponent(id)}?force=true`, { method: 'DELETE' });
                        notify('Đã xóa phim và các suất chiếu liên quan!');
                        await loadMovies();
                    } catch (forceErr) {
                        notify(forceErr.message, 'error');
                    }
                });
            } else {
                notify(err.message, 'error');
            }
        }
    });
};

// ==============================================================================
// 8. QUẢN LÝ SUẤT CHIẾU (SHOWTIMES)
// ==============================================================================
async function loadShowtimes() {
    try {
        const [shows, movies, rooms] = await Promise.all([
            api('/showtimes'),
            api('/movies'),
            api('/rooms')
        ]);
        state.showtimes = shows;
        state.movies = movies;
        state.rooms = rooms;

        // Populate filters
        $('showtimeMovieFilter').innerHTML = '<option value="">Tất cả phim</option>' + movies.map(m => `<option value="${safe(m.id)}">${safe(m.title)}</option>`).join('');
        $('showtimeRoomFilter').innerHTML = '<option value="">Tất cả phòng</option>' + rooms.map(r => `<option value="${safe(r.name)}">${safe(r.name)}</option>`).join('');

        // Populate modal dropdowns
        $('formShowtimeMovie').innerHTML = '<option value="">-- Chọn Phim --</option>' + movies.map(m => `<option value="${safe(m.id)}" data-duration="${m.duration}">${safe(m.title)} (${m.duration}p)</option>`).join('');
        $('formShowtimeRoom').innerHTML = '<option value="">-- Chọn Phòng Chiếu --</option>' + rooms.map(r => `<option value="${safe(r.id)}" data-name="${safe(r.name)}">${safe(r.name)} (${safe(r.type)})</option>`).join('');

        renderShowtimesTable();
    } catch (err) {
        notify(err.message, 'error');
    }
}

function renderShowtimesTable() {
    const tbody = $('showtimesTableBody');
    const movieFilter = $('showtimeMovieFilter').value;
    const roomFilter = $('showtimeRoomFilter').value;
    const dateFilter = $('showtimeDateFilter').value;

    let filtered = state.showtimes.filter(s => {
        const matchMovie = !movieFilter || s.movieId === movieFilter;
        const matchRoom = !roomFilter || s.room === roomFilter;
        const matchDate = !dateFilter || s.date === dateFilter;
        return matchMovie && matchRoom && matchDate;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Không có suất chiếu nào phù hợp.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(s => {
        const movie = state.movies.find(m => m.id === s.movieId);
        const movieTitle = movie ? movie.title : 'Phim đã xóa';

        return `
            <tr>
                <td><strong>${safe(movieTitle)}</strong></td>
                <td><span class="badge badge-info">${safe(s.room || 'Phòng 1')}</span></td>
                <td>${safe(s.date || 'Hàng tuần')}</td>
                <td><strong>${safe(s.startTime || '18:00')}</strong> - ${safe(s.endTime || '')} <small class="text-muted">(${safe(s.time)})</small></td>
                <td><strong class="text-success">${money(s.price)}</strong></td>
                <td><span class="badge badge-success">Đang hoạt động</span></td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-outline btn-sm" onclick="editShowtime('${safe(s.id)}')">✏️ Sửa</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteShowtime('${safe(s.id)}')">🗑️ Xóa</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

$('showtimeMovieFilter').onchange = renderShowtimesTable;
$('showtimeRoomFilter').onchange = renderShowtimesTable;
$('showtimeDateFilter').onchange = renderShowtimesTable;

// Tự động tính giờ kết thúc khi chọn phim và giờ bắt đầu
function autoCalculateEndTime() {
    const movieOpt = $('formShowtimeMovie').selectedOptions[0];
    const duration = movieOpt ? Number(movieOpt.dataset.duration) || 120 : 120;
    const startTime = $('formShowtimeStart').value;

    if (!startTime) return;
    const [h, m] = startTime.split(':').map(Number);
    const startMins = (h || 0) * 60 + (m || 0);
    const endMins = startMins + duration + 15; // 15 phút dọn phòng

    const endH = Math.floor(endMins / 60) % 24;
    const endM = endMins % 60;
    $('formShowtimeEnd').value = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

$('formShowtimeMovie').onchange = autoCalculateEndTime;
$('formShowtimeStart').oninput = autoCalculateEndTime;

// Thêm suất chiếu modal
$('addShowtimeBtn').onclick = () => {
    $('showtimeModalTitle').textContent = 'Thêm Suất Chiếu Mới';
    $('formShowtimeId').value = '';
    $('showtimeForm').reset();
    $('formShowtimeDate').value = new Date().toISOString().split('T')[0];
    $('formShowtimeStart').value = '18:00';
    $('formShowtimePrice').value = '75000';
    $('showtimeConflictAlert').classList.add('hidden');
    autoCalculateEndTime();
    openModal('showtimeModal');
};

// Sửa suất chiếu
window.editShowtime = (id) => {
    const s = state.showtimes.find(x => x.id === id);
    if (!s) return;

    $('showtimeModalTitle').textContent = 'Chỉnh Sửa Suất Chiếu';
    $('formShowtimeId').value = s.id;
    $('formShowtimeMovie').value = s.movieId;
    
    // Select room
    const roomOpt = Array.from($('formShowtimeRoom').options).find(opt => opt.value === s.roomId || opt.dataset.name === s.room);
    if (roomOpt) $('formShowtimeRoom').value = roomOpt.value;

    $('formShowtimeDate').value = s.date || new Date().toISOString().split('T')[0];
    $('formShowtimeStart').value = s.startTime || '18:00';
    $('formShowtimeEnd').value = s.endTime || '';
    $('formShowtimePrice').value = s.price || 75000;
    $('showtimeConflictAlert').classList.add('hidden');

    openModal('showtimeModal');
};

// Lưu suất chiếu (Kiểm tra trùng phòng)
$('showtimeForm').onsubmit = async (e) => {
    e.preventDefault();
    const id = $('formShowtimeId').value;
    const roomOpt = $('formShowtimeRoom').selectedOptions[0];

    const payload = {
        movieId: $('formShowtimeMovie').value,
        roomId: $('formShowtimeRoom').value,
        room: roomOpt ? roomOpt.dataset.name : 'Phòng 1',
        date: $('formShowtimeDate').value,
        startTime: $('formShowtimeStart').value,
        endTime: $('formShowtimeEnd').value,
        price: Number($formShowtimePrice = $('formShowtimePrice').value)
    };

    $('showtimeConflictAlert').classList.add('hidden');

    try {
        if (id) {
            await api(`/showtimes/${encodeURIComponent(id)}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            notify('Cập nhật suất chiếu thành công!');
        } else {
            await api('/showtimes', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            notify('Thêm suất chiếu mới thành công!');
        }

        closeModal('showtimeModal');
        await loadShowtimes();
    } catch (err) {
        if (err.message.includes('trùng lịch')) {
            $('showtimeConflictAlert').textContent = `⚠️ Cảnh báo: ${err.message}`;
            $('showtimeConflictAlert').classList.remove('hidden');
        } else {
            notify(err.message, 'error');
        }
    }
};

// Xóa suất chiếu
window.deleteShowtime = (id) => {
    confirmDialog('Xóa Suất Chiếu', 'Bạn có chắc chắn muốn xóa suất chiếu này?', async () => {
        try {
            await api(`/showtimes/${encodeURIComponent(id)}`, { method: 'DELETE' });
            notify('Đã xóa suất chiếu thành công!');
            await loadShowtimes();
        } catch (err) {
            if (err.message.includes('vé được đặt')) {
                confirmDialog('Cảnh Báo Xóa Suất Chiếu Có Vé', `${err.message}\nBạn có muốn XÓA CẢ CÁC VÉ đã đặt trong suất chiếu này không?`, async () => {
                    try {
                        await api(`/showtimes/${encodeURIComponent(id)}?force=true`, { method: 'DELETE' });
                        notify('Đã xóa suất chiếu và các vé đã đặt!');
                        await loadShowtimes();
                    } catch (forceErr) {
                        notify(forceErr.message, 'error');
                    }
                });
            } else {
                notify(err.message, 'error');
            }
        }
    });
};

// ==============================================================================
// 9. QUẢN LÝ PHÒNG CHIẾU & GHẾ (ROOMS & SEATS)
// ==============================================================================
async function loadRooms() {
    try {
        const rooms = await api('/rooms');
        state.rooms = rooms;
        renderRoomsGrid();

        if (rooms.length > 0) {
            selectRoomForSeatMap(rooms[0].id);
        }
    } catch (err) {
        notify(err.message, 'error');
    }
}

function renderRoomsGrid() {
    const grid = $('roomsListGrid');
    grid.innerHTML = state.rooms.map(r => `
        <div class="room-card ${state.selectedRoom?.id === r.id ? 'active' : ''}" onclick="selectRoomForSeatMap('${safe(r.id)}')">
            <div class="room-card-header">
                <span class="room-card-title">🏛️ ${safe(r.name)}</span>
                <span class="badge ${r.status === 'maintenance' ? 'badge-warning' : 'badge-success'}">
                    ${r.status === 'maintenance' ? 'Bảo trì' : 'Hoạt động'}
                </span>
            </div>
            <div class="room-card-body">
                <div><strong>Màn hình:</strong> ${safe(r.type)}</div>
                <div><strong>Tổng số ghế:</strong> ${r.totalSeats || (r.rows * r.cols)} ghế</div>
                <div><strong>Kích thước:</strong> ${r.rows} hàng x ${r.cols} ghế</div>
                <div><strong>Ghế đôi:</strong> Hàng ${Object.keys(r.seatTypes || {}).filter(k => r.seatTypes[k] === 'couple').join(', ') || 'D'}</div>
            </div>
            <div class="table-actions mt-2" style="justify-content: flex-end;">
                <button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); editRoom('${safe(r.id)}')">Sửa</button>
                <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); deleteRoom('${safe(r.id)}')">Xóa</button>
            </div>
        </div>
    `).join('');
}

window.selectRoomForSeatMap = (roomId) => {
    const room = state.rooms.find(r => r.id === roomId);
    if (!room) return;
    state.selectedRoom = room;

    document.querySelectorAll('.room-card').forEach(c => c.classList.remove('active'));
    renderRoomsGrid();

    $('roomMapTitle').textContent = `Sơ Đồ Ghế: ${room.name} (${room.type} · ${room.totalSeats} ghế)`;
    renderAdminSeatGrid(room);
};

function renderAdminSeatGrid(room) {
    const container = $('adminSeatGrid');
    container.innerHTML = '';

    const rowLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    const rowCount = room.rows || 4;
    const colCount = room.cols || 8;
    const seatTypes = room.seatTypes || {};
    const disabledSeats = room.disabledSeats || [];

    for (let r = 0; r < rowCount; r++) {
        const rowChar = rowLetters[r];
        const rowDiv = document.createElement('div');
        rowDiv.className = 'seat-row';

        const label = document.createElement('span');
        label.className = 'row-label';
        label.textContent = rowChar;
        rowDiv.appendChild(label);

        const defaultType = seatTypes[rowChar] || (rowChar === 'C' ? 'vip' : (rowChar === 'D' ? 'couple' : 'standard'));

        for (let c = 1; c <= colCount; c++) {
            const seatCode = `${rowChar}${c}`;
            const isDisabled = disabledSeats.includes(seatCode);

            const seatBtn = document.createElement('button');
            seatBtn.type = 'button';
            seatBtn.className = `seat-item ${isDisabled ? 'disabled' : defaultType}`;
            seatBtn.textContent = c;
            seatBtn.title = `Ghế ${seatCode} (${isDisabled ? 'Khóa/Bảo trì' : defaultType.toUpperCase()}) - Bấm để đổi trạng thái`;

            // Click ghế để chuyển đổi trạng thái: standard -> vip -> couple -> disabled
            seatBtn.onclick = () => cycleSeatType(room, rowChar, seatCode);

            rowDiv.appendChild(seatBtn);
        }

        container.appendChild(rowDiv);
    }
}

async function cycleSeatType(room, rowChar, seatCode) {
    if (!room.seatTypes) room.seatTypes = {};
    if (!room.disabledSeats) room.disabledSeats = [];

    const isCurrentlyDisabled = room.disabledSeats.includes(seatCode);
    const currentType = room.seatTypes[rowChar] || 'standard';

    if (!isCurrentlyDisabled) {
        if (currentType === 'standard') {
            room.seatTypes[rowChar] = 'vip';
        } else if (currentType === 'vip') {
            room.seatTypes[rowChar] = 'couple';
        } else if (currentType === 'couple') {
            room.disabledSeats.push(seatCode);
        }
    } else {
        room.disabledSeats = room.disabledSeats.filter(s => s !== seatCode);
        room.seatTypes[rowChar] = 'standard';
    }

    try {
        await api(`/rooms/${room.id}/seats`, {
            method: 'PUT',
            body: JSON.stringify({
                seatTypes: room.seatTypes,
                disabledSeats: room.disabledSeats
            })
        });
        renderAdminSeatGrid(room);
        notify(`Đã cập nhật hàng ${rowChar} / Ghế ${seatCode}`);
    } catch (err) {
        notify(err.message, 'error');
    }
}

// Thêm phòng mới
$('addRoomBtn').onclick = () => {
    $('roomModalTitle').textContent = 'Thêm Phòng Chiếu Mới';
    $('formRoomId').value = '';
    $('roomForm').reset();
    openModal('roomModal');
};

// Sửa phòng
window.editRoom = (id) => {
    const room = state.rooms.find(r => r.id === id);
    if (!room) return;

    $('roomModalTitle').textContent = 'Chỉnh Sửa Thông Tin Phòng';
    $('formRoomId').value = room.id;
    $('formRoomName').value = room.name;
    $('formRoomType').value = room.type || '2D Standard';
    $('formRoomRows').value = room.rows || 4;
    $('formRoomCols').value = room.cols || 8;
    $('formRoomStatus').value = room.status || 'active';

    openModal('roomModal');
};

// Lưu phòng
$('roomForm').onsubmit = async (e) => {
    e.preventDefault();
    const id = $('formRoomId').value;
    const payload = {
        name: $('formRoomName').value.trim(),
        type: $('formRoomType').value,
        rows: Number($('formRoomRows').value),
        cols: Number($('formRoomCols').value),
        status: $('formRoomStatus').value
    };

    try {
        if (id) {
            await api(`/rooms/${encodeURIComponent(id)}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            notify('Cập nhật phòng chiếu thành công!');
        } else {
            await api('/rooms', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            notify('Thêm phòng chiếu mới thành công!');
        }

        closeModal('roomModal');
        await loadRooms();
    } catch (err) {
        notify(err.message, 'error');
    }
};

// Xóa phòng
window.deleteRoom = (id) => {
    confirmDialog('Xóa Phòng Chiếu', 'Bạn có chắc chắn muốn xóa phòng chiếu này?', async () => {
        try {
            await api(`/rooms/${encodeURIComponent(id)}`, { method: 'DELETE' });
            notify('Đã xóa phòng chiếu thành công!');
            await loadRooms();
        } catch (err) {
            notify(err.message, 'error');
        }
    });
};

// ==============================================================================
// 10. QUẢN LÝ ĐƠN ĐẶT VÉ (BOOKINGS)
// ==============================================================================
async function loadBookings() {
    try {
        const bookings = await api('/admin/bookings');
        state.bookings = bookings;
        renderBookingsTable();
    } catch (err) {
        notify(err.message, 'error');
    }
}

function renderBookingsTable() {
    const tbody = $('bookingsTableBody');
    const kw = $('bookingSearchInput').value.trim().toLowerCase();
    const status = $('bookingStatusFilter').value;
    const date = $('bookingDateFilter').value;

    let filtered = state.bookings.filter(b => {
        const matchKw = !kw || b.id.toLowerCase().includes(kw) || b.userName.toLowerCase().includes(kw) || b.movieTitle.toLowerCase().includes(kw) || b.seat.toLowerCase().includes(kw);
        const matchStatus = !status || b.status === status;
        const matchDate = !date || (b.createdAt && b.createdAt.startsWith(date));
        return matchKw && matchStatus && matchDate;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">Không tìm thấy đơn đặt vé nào.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(b => {
        let statusBadge = '<span class="badge badge-success">Đã đặt</span>';
        if (b.status === 'cancelled') statusBadge = '<span class="badge badge-danger">Đã hủy</span>';
        else if (b.status === 'refunded') statusBadge = '<span class="badge badge-warning">Đã hoàn tiền</span>';

        let payBadge = '<span class="badge badge-success">Đã thanh toán</span>';
        if (b.paymentStatus === 'refunded') payBadge = '<span class="badge badge-secondary">Đã hoàn</span>';

        return `
            <tr>
                <td><code>#${safe(b.id.slice(0, 8))}</code></td>
                <td><small>${formatDate(b.createdAt)}</small></td>
                <td>
                    <strong>${safe(b.userName)}</strong>
                    <br><small class="text-muted">${safe(b.userEmail)}</small>
                </td>
                <td><strong>${safe(b.movieTitle)}</strong></td>
                <td>${safe(b.showtimeString)} · <span class="badge badge-secondary">${safe(b.roomName)}</span></td>
                <td><span class="badge badge-info">${safe(b.seat)} (${safe(b.seatType || 'standard')})</span></td>
                <td>
                    <strong>${money(b.finalPrice ?? b.price)}</strong>
                    ${b.discountAmount ? `<br><small class="text-success">-${money(b.discountAmount)} (${safe(b.promoCode || 'KM')})</small>` : ''}
                </td>
                <td>${statusBadge}</td>
                <td>${payBadge}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-outline btn-sm" onclick="viewBookingDetail('${safe(b.id)}')">Chi Tiết</button>
                        ${b.status === 'confirmed' ? `<button class="btn btn-danger btn-sm" onclick="refundBooking('${safe(b.id)}')">Hoàn Tiền</button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

$('bookingSearchInput').oninput = renderBookingsTable;
$('bookingStatusFilter').onchange = renderBookingsTable;
$('bookingDateFilter').onchange = renderBookingsTable;

// Xem chi tiết đơn vé
window.viewBookingDetail = async (id) => {
    try {
        const b = await api(`/admin/bookings/${encodeURIComponent(id)}`);
        const body = $('bookingDetailBody');
        const footer = $('bookingDetailFooter');

        body.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:0.75rem;">
                <div><strong>Mã đơn hàng:</strong> <code>${safe(b.id)}</code></div>
                <div><strong>Thời gian đặt:</strong> ${formatDate(b.createdAt)}</div>
                <hr style="border:none;border-top:1px solid #26293d;">
                <div><strong>Khách hàng:</strong> ${safe(b.userName)} (${safe(b.userEmail)})</div>
                <div><strong>Phim chiếu:</strong> ${safe(b.movieTitle)} (${b.movieDuration} phút · ${safe(b.movieGenre)})</div>
                <div><strong>Suất chiếu:</strong> ${safe(b.showtimeInfo?.time || 'N/A')} · ${safe(b.showtimeInfo?.room || 'Phòng 1')}</div>
                <div><strong>Vị trí ghế:</strong> Ghế ${safe(b.seat)} (Loại: ${safe(b.seatType || 'standard').toUpperCase()})</div>
                <hr style="border:none;border-top:1px solid #26293d;">
                <div><strong>Giá vé gốc:</strong> ${money(b.price)}</div>
                ${b.discountAmount ? `<div><strong>Khuyến mãi:</strong> -${money(b.discountAmount)} (Mã: ${safe(b.promoCode || '')})</div>` : ''}
                <div><strong>Thành tiền thanh toán:</strong> <strong class="text-success" style="font-size:1.1rem;">${money(b.finalPrice ?? b.price)}</strong></div>
                <div><strong>Trạng thái vé:</strong> <span class="badge ${b.status === 'confirmed' ? 'badge-success' : 'badge-danger'}">${b.status.toUpperCase()}</span></div>
                <div><strong>Thanh toán:</strong> <span class="badge badge-info">${(b.paymentStatus || 'paid').toUpperCase()}</span></div>
            </div>
        `;

        footer.innerHTML = `
            <button type="button" class="btn btn-secondary" data-close-modal="bookingDetailModal">Đóng</button>
            ${b.status === 'confirmed' ? `<button type="button" class="btn btn-danger" onclick="refundBooking('${safe(b.id)}'); closeModal('bookingDetailModal');">Xử Lý Hoàn Tiền</button>` : ''}
        `;

        openModal('bookingDetailModal');
    } catch (err) {
        notify(err.message, 'error');
    }
};

// Hoàn tiền đơn vé
window.refundBooking = (id) => {
    confirmDialog('Xử Lý Hoàn Tiền', 'Bạn có chắc chắn muốn hoàn tiền cho đơn vé này? Ghế sẽ được mở khóa ngay lập tức để người khác có thể đặt.', async () => {
        try {
            await api(`/admin/bookings/${encodeURIComponent(id)}/refund`, { method: 'POST' });
            notify('Đã xử lý hoàn tiền thành công!');
            await loadBookings();
        } catch (err) {
            notify(err.message, 'error');
        }
    });
};

// ==============================================================================
// 11. QUẢN LÝ NGƯỜI DÙNG (USERS)
// ==============================================================================
async function loadUsers() {
    try {
        const users = await api('/admin/users');
        state.users = users;
        renderUsersTable();
    } catch (err) {
        notify(err.message, 'error');
    }
}

function renderUsersTable() {
    const tbody = $('usersTableBody');
    const kw = $('userSearchInput').value.trim().toLowerCase();
    const role = $('userRoleFilter').value;
    const status = $('userStatusFilter').value;

    let filtered = state.users.filter(u => {
        const matchKw = !kw || u.name.toLowerCase().includes(kw) || u.email.toLowerCase().includes(kw);
        const matchRole = !role || u.role === role;
        const matchStatus = !status || u.status === status;
        return matchKw && matchRole && matchStatus;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Không tìm thấy người dùng nào.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(u => {
        const isLocked = u.status === 'locked';
        const isAdmin = u.role === 'admin';

        return `
            <tr>
                <td>
                    <div style="display:flex;align-items:center;gap:0.75rem;">
                        <div class="admin-avatar" style="width:32px;height:32px;font-size:0.85rem;">${safe(u.name.charAt(0).toUpperCase())}</div>
                        <strong>${safe(u.name)}</strong>
                    </div>
                </td>
                <td>${safe(u.email)}</td>
                <td>
                    <span class="badge ${isAdmin ? 'badge-danger' : 'badge-secondary'}">
                        ${isAdmin ? 'Quản trị viên' : 'Khách hàng'}
                    </span>
                </td>
                <td>
                    <span class="badge ${isLocked ? 'badge-danger' : 'badge-success'}">
                        ${isLocked ? 'Đã bị khóa' : 'Hoạt động'}
                    </span>
                </td>
                <td><strong>${u.bookingCount || 0}</strong> vé</td>
                <td><strong class="text-success">${money(u.totalSpent || 0)}</strong></td>
                <td><small class="text-muted">${formatDate(u.createdAt)}</small></td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-outline btn-sm" onclick="viewUserDetail('${safe(u.id)}')">Lịch Sử Vé</button>
                        ${u.id !== 'admin-1' && u.id !== state.user?.id ? `
                            <button class="btn ${isLocked ? 'btn-primary' : 'btn-danger'} btn-sm" onclick="toggleUserStatus('${safe(u.id)}')">
                                ${isLocked ? 'Mở Khóa' : 'Khóa'}
                            </button>
                            <button class="btn btn-secondary btn-sm" onclick="toggleUserRole('${safe(u.id)}', '${isAdmin ? 'user' : 'admin'}')">
                                ${isAdmin ? 'Hạ Quyền User' : 'Nâng Admin'}
                            </button>
                        ` : '<small class="text-muted">Quản trị viên gốc</small>'}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

$('userSearchInput').oninput = renderUsersTable;
$('userRoleFilter').onchange = renderUsersTable;
$('userStatusFilter').onchange = renderUsersTable;

// Xem chi tiết & lịch sử đặt vé của user
window.viewUserDetail = async (id) => {
    try {
        const u = await api(`/admin/users/${encodeURIComponent(id)}`);
        $('userDetailTitle').textContent = `Lịch Sử Hoạt Động: ${u.name}`;

        const body = $('userDetailBody');
        body.innerHTML = `
            <div style="margin-bottom:1.25rem;display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;background:#1b1e2e;padding:1rem;border-radius:8px;">
                <div><strong>Họ tên:</strong> ${safe(u.name)}</div>
                <div><strong>Email:</strong> ${safe(u.email)}</div>
                <div><strong>Vai trò:</strong> ${u.role === 'admin' ? 'Quản trị viên' : 'Khách hàng'}</div>
                <div><strong>Trạng thái:</strong> ${u.status === 'locked' ? '<span class="text-danger">Đã khóa</span>' : '<span class="text-success">Hoạt động</span>'}</div>
                <div><strong>Tổng chi tiêu:</strong> <strong class="text-success">${money(u.totalSpent)}</strong></div>
                <div><strong>Tổng số đơn vé:</strong> ${u.bookings?.length || 0} đơn</div>
            </div>

            <h4>Danh Sách Vé Đã Đặt:</h4>
            <div class="table-responsive mt-2">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Mã Vé</th>
                            <th>Phim</th>
                            <th>Suất Chiếu</th>
                            <th>Ghế</th>
                            <th>Giá Vé</th>
                            <th>Trạng Thái</th>
                            <th>Thời Gian</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${u.bookings && u.bookings.length > 0 ? u.bookings.map(b => `
                            <tr>
                                <td><code>#${safe(b.id.slice(0, 8))}</code></td>
                                <td><strong>${safe(b.movieTitle)}</strong></td>
                                <td>${safe(b.showtime)}</td>
                                <td><span class="badge badge-secondary">${safe(b.seat)}</span></td>
                                <td>${money(b.finalPrice ?? b.price)}</td>
                                <td><span class="badge ${b.status === 'confirmed' ? 'badge-success' : 'badge-danger'}">${b.status}</span></td>
                                <td><small>${formatDate(b.createdAt)}</small></td>
                            </tr>
                        `).join('') : '<tr><td colspan="7" class="text-center text-muted">Khách hàng chưa đặt vé nào.</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;

        openModal('userDetailModal');
    } catch (err) {
        notify(err.message, 'error');
    }
};

// Khóa / Mở khóa tài khoản
window.toggleUserStatus = (id) => {
    confirmDialog('Đổi Trạng Thái Tài Khoản', 'Bạn có chắc chắn muốn thay đổi trạng thái khóa/mở tài khoản này?', async () => {
        try {
            const res = await api(`/admin/users/${encodeURIComponent(id)}/status`, { method: 'PUT' });
            notify(res.message);
            await loadUsers();
        } catch (err) {
            notify(err.message, 'error');
        }
    });
};

// Thay đổi vai trò (Admin / User)
window.toggleUserRole = (id, newRole) => {
    confirmDialog('Thay Đổi Vai Trò', `Bạn có chắc chắn muốn chuyển vai trò tài khoản thành ${newRole === 'admin' ? 'Quản trị viên' : 'Khách hàng'}?`, async () => {
        try {
            const res = await api(`/admin/users/${encodeURIComponent(id)}/role`, {
                method: 'PUT',
                body: JSON.stringify({ role: newRole })
            });
            notify(res.message);
            await loadUsers();
        } catch (err) {
            notify(err.message, 'error');
        }
    });
};

// ==============================================================================
// 12. QUẢN LÝ KHUYẾN MÃI (PROMOTIONS)
// ==============================================================================
async function loadPromotions() {
    try {
        const promos = await api('/admin/promotions');
        state.promotions = promos;
        renderPromotionsTable();
    } catch (err) {
        notify(err.message, 'error');
    }
}

function renderPromotionsTable() {
    const tbody = $('promotionsTableBody');
    if (state.promotions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">Chưa có mã khuyến mãi nào.</td></tr>';
        return;
    }

    tbody.innerHTML = state.promotions.map(p => `
        <tr>
            <td><strong style="color:var(--primary);letter-spacing:1px;">${safe(p.code)}</strong></td>
            <td>${safe(p.description || '')}</td>
            <td><span class="badge badge-info">${p.discountType === 'percent' ? 'Phần trăm (%)' : 'Số tiền (VNĐ)'}</span></td>
            <td><strong>${p.discountType === 'percent' ? `${p.discountValue}%` : money(p.discountValue)}</strong></td>
            <td>${p.minSpend ? money(p.minSpend) : '0đ'}</td>
            <td>${p.maxDiscount ? money(p.maxDiscount) : 'Không giới hạn'}</td>
            <td><small>${safe(p.startDate || 'Bắt đầu')} → ${safe(p.endDate || 'Vô thời hạn')}</small></td>
            <td>${p.usedCount || 0} / ${p.maxUsage || '∞'}</td>
            <td><span class="badge ${p.status === 'active' ? 'badge-success' : 'badge-secondary'}">${p.status === 'active' ? 'Đang áp dụng' : 'Tạm dừng'}</span></td>
            <td>
                <div class="table-actions">
                    <button class="btn btn-outline btn-sm" onclick="editPromo('${safe(p.id)}')">Sửa</button>
                    <button class="btn btn-danger btn-sm" onclick="deletePromo('${safe(p.id)}')">Xóa</button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Thêm khuyến mãi modal
$('addPromoBtn').onclick = () => {
    $('promoModalTitle').textContent = 'Tạo Mã Khuyến Mãi Mới';
    $('formPromoId').value = '';
    $('promoForm').reset();
    $('formPromoStart').value = new Date().toISOString().split('T')[0];
    $('formPromoEnd').value = '2026-12-31';
    openModal('promoModal');
};

// Sửa khuyến mãi
window.editPromo = (id) => {
    const p = state.promotions.find(x => x.id === id);
    if (!p) return;

    $('promoModalTitle').textContent = 'Chỉnh Sửa Mã Khuyến Mãi';
    $('formPromoId').value = p.id;
    $('formPromoCode').value = p.code;
    $('formPromoType').value = p.discountType || 'percent';
    $('formPromoValue').value = p.discountValue;
    $('formPromoDesc').value = p.description || '';
    $('formPromoMinSpend').value = p.minSpend || 0;
    $('formPromoMaxDiscount').value = p.maxDiscount || 0;
    $('formPromoStart').value = p.startDate || '';
    $('formPromoEnd').value = p.endDate || '';
    $('formPromoMaxUsage').value = p.maxUsage || 100;
    $('formPromoStatus').value = p.status || 'active';

    openModal('promoModal');
};

// Lưu khuyến mãi
$('promoForm').onsubmit = async (e) => {
    e.preventDefault();
    const id = $('formPromoId').value;

    const payload = {
        code: $('formPromoCode').value.trim().toUpperCase(),
        discountType: $('formPromoType').value,
        discountValue: Number($('formPromoValue').value),
        description: $('formPromoDesc').value.trim(),
        minSpend: Number($('formPromoMinSpend').value),
        maxDiscount: Number($('formPromoMaxDiscount').value),
        startDate: $('formPromoStart').value,
        endDate: $('formPromoEnd').value,
        maxUsage: Number($('formPromoMaxUsage').value),
        status: $('formPromoStatus').value
    };

    try {
        if (id) {
            await api(`/admin/promotions/${encodeURIComponent(id)}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            notify('Cập nhật mã khuyến mãi thành công!');
        } else {
            await api('/admin/promotions', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            notify('Tạo mã khuyến mãi mới thành công!');
        }

        closeModal('promoModal');
        await loadPromotions();
    } catch (err) {
        notify(err.message, 'error');
    }
};

// Xóa khuyến mãi
window.deletePromo = (id) => {
    confirmDialog('Xóa Khuyến Mãi', 'Bạn có chắc chắn muốn xóa mã khuyến mãi này?', async () => {
        try {
            await api(`/admin/promotions/${encodeURIComponent(id)}`, { method: 'DELETE' });
            notify('Đã xóa mã khuyến mãi thành công!');
            await loadPromotions();
        } catch (err) {
            notify(err.message, 'error');
        }
    });
};

// ==============================================================================
// 13. KHỞI TẠO HỆ THỐNG
// ==============================================================================
async function initAdminData() {
    const isAuthed = await checkAdminAuth();
    if (isAuthed) {
        const initialSection = location.hash.slice(1) || 'dashboard';
        switchSection(initialSection);
    }
}

// Resize listener to redraw chart
window.onresize = () => {
    if (state.currentSection === 'dashboard') {
        renderRevenueChart();
    }
};

initAdminData();
