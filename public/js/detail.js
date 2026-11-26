const id = new URLSearchParams(location.search).get('id');
let contest = null;       // 서버에서 받은 공모전
let selectedStatus = '';  // 화면에서 고른 상태 (저장 전)

(async () => {
    const me = await renderHeader('list');
    if (!me) return;

    contest = await fetchContest();
    if (!contest) return;
    selectedStatus = contest.status;

    renderTop();
    renderPoster();
    renderSchedule();
    renderPrizes();
    renderStatus();
    renderSubmissions();
})();

async function fetchContest() {
    const r = await api('/api/contests/' + id);
    if (!r.ok) {
        alert(r.data.error || '불러오지 못했어요');
        location.href = '/index.html';
        return null;
    }
    return r.data;
}

// ---------- 제목 / 주최 / 분야 / 삭제 ----------
function renderTop() {
    document.getElementById('title').textContent = contest.title;
    document.getElementById('organizer').textContent = '주최 ' + contest.organizer;

    const box = document.getElementById('fields');
    contest.fields.forEach((f) => box.appendChild(el('span', 'badge s1', f.name)));

    document.getElementById('delete-btn').addEventListener('click', async () => {
        if (!confirm('이 공모전을 삭제할까요? 시상·제출물도 함께 삭제돼요.')) return;
        const r = await api('/api/contests/' + id, 'DELETE');
        if (r.ok) location.href = '/index.html';
        else alert(r.data.error);
    });
}

// ---------- 포스터 ----------
function renderPoster() {
    const card = document.getElementById('poster-card');
    if (contest.poster_path) {
        const img = el('img', 'poster-img');
        img.src = '/api/contests/' + id + '/poster';
        img.alt = '포스터';
        card.appendChild(img);
    } else {
        card.appendChild(el('p', 'sub', '등록된 포스터가 없어요.'));
    }
}

// ---------- 일정 ----------
function renderSchedule() {
    const ul = document.getElementById('schedule');
    const d = dday(contest.apply_end);

    addKV(ul, '접수 시작', contest.apply_start || '-');
    addKV(ul, '접수 마감', contest.apply_end + '  ' + d.text, d.urgent);
    addKV(ul, '결과 발표', contest.announce_date || '-');
}

function addKV(ul, label, value, urgent) {
    const li = el('li', 'item');
    li.appendChild(el('span', 'sub', label));
    li.appendChild(el('span', 'grow right' + (urgent ? ' urgent' : ''), value));
    ul.appendChild(li);
}

// ---------- 시상 내역 (추가 / 수정 / 삭제) ----------
function renderPrizes() {
    const ul = document.getElementById('prizes');
    ul.replaceChildren();
    if (contest.prizes.length === 0) {
        ul.appendChild(el('li', 'sub', '등록된 시상 내역이 없어요.'));
    }
    contest.prizes.forEach((p) => ul.appendChild(prizeRow(p)));
}

async function reloadPrizes() {
    contest.prizes = (await fetchContest()).prizes;
    renderPrizes();
}

function prizeRow(p) {
    const li = el('li', 'item');
    li.appendChild(el('strong', '', p.rank_name));
    li.appendChild(el('span', 'grow right' + (p.amount === null ? ' sub' : ''), money(p.amount)));

    const edit = el('button', 'pill-btn', '✎ 수정');
    edit.type = 'button';
    edit.addEventListener('click', () => li.replaceWith(prizeEditRow(p)));
    li.appendChild(edit);

    const del = el('button', 'x-btn', '×');
    del.type = 'button';
    del.title = '삭제';
    del.addEventListener('click', async () => {
        if (!confirm('"' + p.rank_name + '" 시상을 삭제할까요?')) return;
        const r = await api('/api/prizes/' + p.prize_id, 'DELETE');
        if (r.ok) reloadPrizes();
        else alert(r.data.error);
    });
    li.appendChild(del);
    return li;
}

// 수정 모드: 글자 대신 입력칸이 보인다
function prizeEditRow(p) {
    const li = el('li', 'item');
    const rank = el('input');
    rank.value = p.rank_name;
    rank.maxLength = 30;
    const amount = el('input');
    amount.value = p.amount === null ? '' : p.amount;
    amount.placeholder = '상금(원)';
    li.appendChild(rank);
    li.appendChild(amount);

    const save = el('button', 'pill-btn', '저장');
    save.type = 'button';
    save.addEventListener('click', async () => {
        const r = await api('/api/prizes/' + p.prize_id, 'PUT', {
            rank_name: rank.value,
            amount: amount.value,
        });
        if (r.ok) reloadPrizes();
        else alert(r.data.error);
    });
    li.appendChild(save);

    const cancel = el('button', 'x-btn', '×');
    cancel.type = 'button';
    cancel.title = '취소';
    cancel.addEventListener('click', () => li.replaceWith(prizeRow(p)));
    li.appendChild(cancel);
    return li;
}

document.getElementById('prize-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('prize-msg');
    msg.textContent = '';

    const r = await api('/api/contests/' + id + '/prizes', 'POST', {
        rank_name: document.getElementById('prize-rank').value,
        amount: document.getElementById('prize-amount').value,
    });
    if (r.ok) {
        e.target.reset();
        reloadPrizes();
    } else {
        msg.textContent = r.data.error;
    }
});

// ---------- 지원 상태 / 메모 ----------
function renderStatus() {
    const box = document.getElementById('status-btns');
    box.replaceChildren();
    Object.keys(STATUS_CLASS).forEach((s) => {
        const on = s === selectedStatus;
        const btn = el('button', 'btn' + (on ? ' on ' + STATUS_CLASS[s] : ''), s);
        btn.type = 'button';
        btn.addEventListener('click', () => {
            selectedStatus = s;
            renderStatus();
        });
        box.appendChild(btn);
    });
    document.getElementById('memo').value = contest.memo || '';
}

document.getElementById('save-btn').addEventListener('click', async () => {
    const r = await api('/api/contests/' + id, 'PUT', {
        status: selectedStatus,
        memo: document.getElementById('memo').value,
    });
    document.getElementById('save-msg').textContent = r.ok ? ' 저장했어요' : ' ' + r.data.error;
});

// ---------- 제출물 (업로드 / 다운로드 / 메모 수정 / 삭제) ----------
function renderSubmissions() {
    const ul = document.getElementById('submissions');
    ul.replaceChildren();
    if (contest.submissions.length === 0) {
        ul.appendChild(el('li', 'sub', '제출한 파일이 없어요.'));
        return;
    }
    // 서버가 최신 순으로 보내 주므로 첫 번째가 최신 버전
    contest.submissions.forEach((s, i) => ul.appendChild(submissionRow(s, i === 0)));
}

async function reloadSubmissions() {
    contest.submissions = (await fetchContest()).submissions;
    renderSubmissions();
}

function submissionRow(s, isLatest) {
    const li = el('li', 'item');
    li.appendChild(el('span', 'badge s3', s.version + (isLatest ? ' 최신' : '')));

    const info = el('div', 'grow');
    const link = el('a', 'strong link', s.file_name); // 파일 이름을 누르면 다운로드
    link.href = '/api/submissions/' + s.submission_id + '/download';
    info.appendChild(link);
    info.appendChild(el('div', 'sub', '메모: ' + (s.note || '-') + ' · ' + s.submitted_at));
    li.appendChild(info);

    const edit = el('button', 'pill-btn', '✎ 수정');
    edit.type = 'button';
    edit.addEventListener('click', () => li.replaceWith(submissionEditRow(s, isLatest)));
    li.appendChild(edit);

    const del = el('button', 'x-btn', '×');
    del.type = 'button';
    del.title = '삭제';
    del.addEventListener('click', async () => {
        if (!confirm('"' + s.file_name + '" 파일을 삭제할까요?')) return;
        const r = await api('/api/submissions/' + s.submission_id, 'DELETE');
        if (r.ok) reloadSubmissions();
        else alert(r.data.error);
    });
    li.appendChild(del);
    return li;
}

// 메모 수정 모드
function submissionEditRow(s, isLatest) {
    const li = el('li', 'item');
    li.appendChild(el('span', 'badge s3', s.version));
    const note = el('input');
    note.value = s.note || '';
    note.maxLength = 200;
    note.placeholder = '메모';
    li.appendChild(note);

    const save = el('button', 'pill-btn', '저장');
    save.type = 'button';
    save.addEventListener('click', async () => {
        const r = await api('/api/submissions/' + s.submission_id, 'PUT', { note: note.value });
        if (r.ok) reloadSubmissions();
        else alert(r.data.error);
    });
    li.appendChild(save);

    const cancel = el('button', 'x-btn', '×');
    cancel.type = 'button';
    cancel.title = '취소';
    cancel.addEventListener('click', () => li.replaceWith(submissionRow(s, isLatest)));
    li.appendChild(cancel);
    return li;
}

// 파일 추가 버튼 → 업로드 폼 열기
document.getElementById('add-file-btn').addEventListener('click', () => {
    const form = document.getElementById('file-form');
    form.hidden = !form.hidden;
});

document.getElementById('file-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('file-msg');
    msg.textContent = '';

    const fd = new FormData();
    fd.append('note', document.getElementById('file-note').value);
    fd.append('file', document.getElementById('file').files[0]);

    const r = await apiForm('/api/contests/' + id + '/submissions', 'POST', fd);
    if (r.ok) {
        e.target.reset();
        e.target.hidden = true;
        reloadSubmissions();
    } else {
        msg.textContent = r.data.error;
    }
});