// 선택한 분야의 field_id를 모아 두는 집합 (같은 값이 두 번 들어가지 않는다)
const selected = new Set();

// 분야 이름 -> { chip: 버튼, id: field_id } (AI가 알려 준 분야 이름으로 칩을 켜기 위한 표)
const chipByName = {};

// 페이지가 열리면 실행: 헤더를 그리고 분야 칩을 만든다
(async () => {
    const me = await renderHeader('list');
    if (!me) return;

    // 서버에서 분야 목록(고정)을 읽는다
    const r = await api('/api/fields');
    const box = document.getElementById('field-chips');

    r.data.forEach((f) => {
        const chip = el('button', 'chip', f.name);
        chip.type = 'button';
        // 칩을 누르면 선택/해제를 바꾼다
        chip.addEventListener('click', () => setChip(f.name, !selected.has(f.field_id)));
        box.appendChild(chip);
        chipByName[f.name] = { chip: chip, id: f.field_id };
    });

    addPrizeRow(); // 시상 입력 줄 하나로 시작
})();

// 분야 칩을 켜거나 끈다 (on이 true면 선택)
function setChip(name, on) {
    const item = chipByName[name];
    if (!item) return;
    if (on) selected.add(item.id);
    else selected.delete(item.id);
    item.chip.classList.toggle('on', on);
}

// 포스터를 고르면 미리보기를 보여 준다
document.getElementById('poster').addEventListener('change', (e) => {
    const file = e.target.files[0];
    const img = document.getElementById('preview');
    if (file) {
        img.src = URL.createObjectURL(file);
        img.hidden = false;
    } else {
        img.hidden = true;
    }
});

// 시상 행 추가 버튼
document.getElementById('add-prize').addEventListener('click', () => addPrizeRow());

// 시상 입력 줄 하나를 만든다 (AI가 채울 때는 값을 넘겨 준다)
function addPrizeRow(rankValue, amountValue) {
    const row = el('div', 'prize-row');
    const rank = el('input');
    rank.placeholder = '등급 (예: 대상)';
    rank.maxLength = 30;
    rank.value = rankValue || '';
    const amount = el('input');
    amount.placeholder = '상금(원, 비워도 돼요)';
    amount.value = amountValue === null || amountValue === undefined ? '' : amountValue;
    const del = el('button', 'x-btn', '×');
    del.type = 'button';
    del.title = '이 행 삭제';
    del.addEventListener('click', () => row.remove());
    row.appendChild(rank);
    row.appendChild(amount);
    row.appendChild(del);
    document.getElementById('prize-rows').appendChild(row);
}

// ---------- AI로 칸 채우기 ----------
document.getElementById('ai-btn').addEventListener('click', async () => {
    const msg = document.getElementById('ai-msg');
    const btn = document.getElementById('ai-btn');
    const file = document.getElementById('poster').files[0];

    if (!file) {
        msg.textContent = '먼저 포스터 이미지를 선택해 주세요';
        return;
    }

    btn.disabled = true; // 두 번 누르지 못하게
    msg.textContent = 'AI가 포스터를 읽는 중이에요... (10~20초 걸려요)';

    // 파일을 서버로 보낸다
    const fd = new FormData();
    fd.append('poster', file);
    const r = await apiForm('/api/contests/extract', 'POST', fd);

    btn.disabled = false;
    if (!r.ok) {
        msg.textContent = r.data.error;
        return;
    }
    fillForm(r.data);
});

// AI가 읽어 온 값을 폼에 채운다 (사용자가 고친 뒤 저장해야 DB에 들어간다)
function fillForm(d) {
    const msg = document.getElementById('ai-msg');

    document.getElementById('title').value = d.title || '';
    document.getElementById('organizer').value = d.organizer || '';
    document.getElementById('apply_start').value = d.apply_start || '';
    document.getElementById('apply_end').value = d.apply_end || '';
    document.getElementById('announce_date').value = d.announce_date || '';

    // 분야 칩: 전부 끄고, AI가 알려 준 분야만 켠다
    Object.keys(chipByName).forEach((name) => setChip(name, false));
    d.field_names.forEach((name) => setChip(name, true));

    // 시상 줄: 비우고 AI가 알려 준 만큼 다시 만든다
    document.getElementById('prize-rows').replaceChildren();
    d.prizes.forEach((p) => addPrizeRow(p.rank_name, p.amount));
    if (d.prizes.length === 0) addPrizeRow();

    // 못 찾은 필수 값을 알려 준다
    const missing = [];
    if (!d.title) missing.push('공모전명');
    if (!d.organizer) missing.push('주최기관');
    if (!d.apply_end) missing.push('접수 마감일');
    msg.textContent = missing.length === 0
        ? '채웠어요. 틀린 곳이 없는지 확인하고 저장하세요.'
        : '채웠어요. 포스터에서 못 찾은 칸이 있어요: ' + missing.join(', ');
}

// ---------- 저장 ----------
document.getElementById('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('msg');
    msg.textContent = '';

    // 시상: 등급을 비워 둔 줄은 무시한다
    const prizes = [];
    document.querySelectorAll('.prize-row').forEach((row) => {
        const [rank, amount] = row.querySelectorAll('input');
        if (rank.value.trim()) prizes.push({ rank_name: rank.value, amount: amount.value });
    });

    // 파일이 들어가므로 JSON이 아니라 FormData로 보낸다 (목록은 JSON 문자열로)
    const fd = new FormData();
    ['title', 'organizer', 'status', 'apply_start', 'apply_end', 'announce_date', 'memo'].forEach((k) => {
        fd.append(k, document.getElementById(k).value);
    });
    fd.append('field_ids', JSON.stringify([...selected]));
    fd.append('prizes', JSON.stringify(prizes));
    const file = document.getElementById('poster').files[0];
    if (file) fd.append('poster', file);

    const r = await apiForm('/api/contests', 'POST', fd);
    if (r.ok) location.href = '/detail.html?id=' + r.data.contest_id;
    else msg.textContent = r.data.error;
});