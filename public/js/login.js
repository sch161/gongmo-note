document.getElementById('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('msg');
    msg.textContent = '';

    const r = await api('/api/auth/login', 'POST', {
        email: document.getElementById('email').value,
        password: document.getElementById('password').value,
    });

    if (r.ok) {
        location.href = '/index.html';
    } else {
        msg.textContent = r.data.error;
    }
});