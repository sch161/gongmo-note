document.getElementById('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('msg');
    msg.textContent = '';

    const password = document.getElementById('password').value;
    if (password !== document.getElementById('password2').value) {
        msg.textContent = '비밀번호가 서로 달라요';
        return;
    }

    const r = await api('/api/auth/signup', 'POST', {
        name: document.getElementById('name').value,
        email: document.getElementById('email').value,
        password: password,
    });

    if (r.ok) {
        alert('가입이 끝났어요. 로그인해 주세요.');
        location.href = '/login.html';
    } else {
        msg.textContent = r.data.error;
    }
});