let currentField = ''; // 선택한 분야 (빈 값 = 전체)

(async () => {
    const me = await renderHeader('list');
    if (!me) return;

    await renderChips();
    await loadContests();

    document.getElementById('q').addEventListener('input', loadContests);
})();

// 분야 칩: '전체' + fields 테이블의 모든 분야
async function renderChips() {
    const r = await api('/api/fields');
    const box = document.getElementById('field-chips');
    const items = [{ field_id: '', name: '전체' }, ...r.data];

    items.forEach((f) => {
        const chip = el('button', 'chip' + (f.field_id === currentField ? ' on' : ''), f.name);
        chip.type = 'button';
        chip.addEventListener('click', () => {
            currentField = f.field_id;
            box.replaceChildren();
            renderChips();
            loadContests();
        });
        box.appendChild(chip);
    });
}

async function loadContests() {
    const params = new URLSearchParams();
    const q = document.getElementById('q').value.trim();
    if (q) params.set('q', q);
    if (currentField) params.set('field', currentField);

    const r = await api('/api/contests?' + params);
    const list = r.data;

    document.getElementById('count').textContent = '총 ' + list.length + '건 · 마감 임박 순';

    const table = document.getElementById('table');
    table.replaceChildren();

    const head = el('div', 'row head');
    ['마감', '공모전', '주최기관', '접수 마감일', '내 상태'].forEach((t) => head.appendChild(el('span', '', t)));
    table.appendChild(head);

    if (list.length === 0) {
        table.appendChild(el('div', 'empty', '조건에 맞는 공모전이 없어요.'));
        return;
    }

    list.forEach((c) => {
        const row = el('div', 'row');
        const d = dday(c.apply_end);
        row.appendChild(el('span', d.urgent ? 'urgent strong' : 'strong', d.text));

        const titleBox = el('div', 'title-box');
        const a = el('a', 'strong', c.title);
        a.href = '/detail.html?id=' + c.contest_id;
        titleBox.appendChild(a);
        titleBox.appendChild(el('span', 'sub', c.fields || '분야 없음'));
        row.appendChild(titleBox);

        row.appendChild(el('span', '', c.organizer));
        row.appendChild(el('span', '', c.apply_end));
        const st = el('span');
        st.appendChild(statusBadge(c.status));
        row.appendChild(st);

        table.appendChild(row);
    });
}