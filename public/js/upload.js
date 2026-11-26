const selected = new Set(); // 선택한 분야의 field_id

(async () => {
    const me = await renderHeader('list');
    if (!me) return;

    // 분야 칩: 고정 목록을 읽어서 토글로 선택
    const r = await api('/api/fields');
    const box = document.getElementById('field-chips');
    r.data.forEach((f) => {
        const chip = el('button', 'chip', f.name);
        chip.type = 'button';
        chip.addEventListener('click', () => {
            if (selected.has(f.field_id)) selected.delete(f.field_id);
            else selected.add(f.field_id);
            chip.classList.toggle('on');
        });
        box.appendChild(chip);
    });

    addPrizeRow();
})();

// 포스터 미리보기
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

// 시상 행 추가 / 삭제(×)
document.getElementById('add-prize').addEventListener('click', addPrizeRow);

function addPrizeRow() {
    const row = el('div', 'prize-row');
    const rank = el('input');
    rank.placeholder = '등급 (예: 대상)';
    rank.maxLength = 30;
    const amount = el('input');
    amount.placeholder = '상금(원, 비워도 돼요)';
    const del = el('button', 'x-btn', '×');
    del.type = 'button';
    del.title = '이 행 삭제';
    del.addEventListener('click', () => row.remove());
    row.appendChild(rank);
    row.appendChild(amount);
    row.appendChild(del);
    document.getElementById('prize-rows').appendChild(row);
}

// 저장: 파일이 있으니 FormData로 보낸다 (목록 값은 JSON 문자열로)
document.getElementById('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('msg');
    msg.textContent = '';

    // 등급을 비워 둔 행은 무시
    const prizes = [];
    document.querySelectorAll('.prize-row').forEach((row) => {
        const [rank, amount] = row.querySelectorAll('input');
        if (rank.value.trim()) prizes.push({ rank_name: rank.value, amount: amount.value });
    });

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