(async () => {
    const me = await renderHeader('me');
    if (!me) return;

    document.getElementById('email').value = me.email;
    document.getElementById('name').value = me.name;
})();

// 이름·비밀번호 수정
document.getElementById('edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('edit-msg');
    msg.textContent = '';

    const newPassword = document.getElementById('new-password').value;
    if (newPassword !== document.getElementById('new-password2').value) {
        msg.textContent = '새 비밀번호가 서로 달라요';
        return;
    }

    const r = await api('/api/me', 'PUT', {
        name: document.getElementById('name').value,
        newPassword: newPassword,
    });

    if (r.ok) {
        alert('저장했어요');
        location.reload(); // 헤더의 이름도 새로 불러오기
    } else {
        msg.textContent = r.data.error;
    }
});

// 회원 탈퇴
document.getElementById('leave-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('leave-msg');
    msg.textContent = '';

    if (!confirm('정말 탈퇴할까요? 모든 데이터가 삭제돼요.')) return;

    const r = await api('/api/me', 'DELETE', {
        password: document.getElementById('leave-password').value,
    });

    if (r.ok) {
        location.href = '/login.html';
    } else {
        msg.textContent = r.data.error;
    }
});