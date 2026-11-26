// 서버 호출 도우미: { ok, status, data }를 돌려준다
async function api(url, method = 'GET', body) {
    const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
}

// 태그를 만들고 글자는 textContent로 넣는다 (XSS 방지)
function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
}

// 로그인한 사용자 정보. 로그인 상태가 아니면 로그인 화면으로 보낸다
async function getMe() {
    const r = await api('/api/auth/me');
    if (!r.ok) {
        location.href = '/login.html';
        return null;
    }
    return r.data;
}

// 공통 헤더. active는 'list' | 'dash' | 'me'
async function renderHeader(active) {
    const me = await getMe();
    if (!me) return null;

    const header = document.getElementById('header');
    const inner = el('div', 'header-inner');

    inner.appendChild(link('공모전 지원 관리', '/index.html', 'brand'));

    const nav = el('nav', 'nav');
    nav.appendChild(link('공모전 목록', '/index.html', active === 'list' ? 'on' : ''));
    nav.appendChild(link('내 지원 현황', '/dashboard.html', active === 'dash' ? 'on' : ''));
    inner.appendChild(nav);

    inner.appendChild(el('div', 'spacer'));
    inner.appendChild(link('+ 포스터로 등록', '/upload.html', 'btn primary'));

    const user = el('div', 'user');
    user.appendChild(link(me.name + ' 님', '/me.html', active === 'me' ? 'on' : ''));

    const logout = el('button', 'text-btn', '로그아웃');
    logout.addEventListener('click', async () => {
        await api('/api/auth/logout', 'POST');
        location.href = '/login.html';
    });
    user.appendChild(logout);
    inner.appendChild(user);

    header.appendChild(inner);
    return me;
}

function link(text, href, className) {
    const a = el('a', className, text);
    a.href = href;
    return a;
}

// 지원 상태별 배지 색 (CSS의 s1~s4)
const STATUS_CLASS = { 관심: 's1', 준비중: 's2', 제출완료: 's3', 수상: 's4' };

function statusBadge(status) {
    return el('span', 'badge ' + STATUS_CLASS[status], status);
}

// D-day 계산: 오늘 날짜와 마감일의 차이(일)
function dday(dateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(dateStr + 'T00:00:00');
    const diff = Math.round((end - today) / 86400000);
    if (diff < 0) return { text: '마감', urgent: false };
    if (diff === 0) return { text: 'D-day', urgent: true };
    return { text: 'D-' + diff, urgent: diff <= 3 };
}

function money(n) {
    return n === null ? '상금 미입력' : Number(n).toLocaleString() + '원';
}

// 파일이 들어가는 요청은 JSON이 아니라 FormData로 보낸다
async function apiForm(url, method, formData) {
    const res = await fetch(url, { method, body: formData });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
}