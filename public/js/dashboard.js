(async () => {
    const me = await renderHeader('dash');
    if (!me) return;

    const r = await api('/api/stats');
    renderTiles(r.data.byStatus);
    renderSoon(r.data.soon);
    renderFields(r.data.byField);
})();

// 상태별 건수 (없는 상태는 0건)
function renderTiles(byStatus) {
    const box = document.getElementById('tiles');
    Object.keys(STATUS_CLASS).forEach((status) => {
        const found = byStatus.find((s) => s.status === status);
        const tile = el('div', 'card tile');
        tile.appendChild(statusBadge(status));
        tile.appendChild(el('div', 'num', (found ? found.count : 0) + ' 건'));
        box.appendChild(tile);
    });
}

function renderSoon(list) {
    const ul = document.getElementById('soon');
    if (list.length === 0) {
        ul.appendChild(el('li', 'sub', '마감이 다가오는 공모전이 없어요.'));
        return;
    }
    list.forEach((c) => {
        const d = dday(c.apply_end);
        const li = el('li', 'item');
        li.appendChild(el('span', 'strong' + (d.urgent ? ' urgent' : ''), d.text));
        const a = el('a', 'grow strong', c.title);
        a.href = '/detail.html?id=' + c.contest_id;
        li.appendChild(a);
        li.appendChild(el('span', 'sub', c.apply_end));
        li.appendChild(statusBadge(c.status));
        ul.appendChild(li);
    });
}

// 분야별 막대: 가장 큰 값을 100%로 놓고 비율로 그린다
function renderFields(list) {
    const ul = document.getElementById('field-bars');
    const max = Math.max(1, ...list.map((f) => f.count));
    list.forEach((f) => {
        const li = el('li', 'item');
        li.appendChild(el('span', 'field-name', f.name));
        const bar = el('div', 'bar');
        const fill = el('span');
        fill.style.width = (f.count / max) * 100 + '%';
        bar.appendChild(fill);
        li.appendChild(bar);
        li.appendChild(el('strong', '', String(f.count)));
        ul.appendChild(li);
    });
}