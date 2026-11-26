const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const requireLogin = require('../middleware/auth');

const router = express.Router();

// 회원가입
router.post('/signup', async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || name.length > 50) {
        return res.status(400).json({ error: '이름은 1~50자로 입력해 주세요' });
    }
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ error: '이메일 형식이 올바르지 않아요' });
    }
    if (email.length > 255) {
        return res.status(400).json({ error: '이메일은 255자 이하로 입력해 주세요' });
    }
    if (!password || password.length < 8) {
        return res.status(400).json({ error: '비밀번호는 8자 이상이어야 해요' });
    }

    try {
        const hash = await bcrypt.hash(password, 10);
        await db.query(
            'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
            [name, email, hash]
        );
        res.json({ ok: true });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: '이미 가입된 이메일이에요' });
        }
        console.error(err);
        res.status(500).json({ error: '서버 오류가 났어요' });
    }
});

// 로그인
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const FAIL = '이메일 또는 비밀번호가 올바르지 않아요';

    try {
        const [rows] = await db.query(
            'SELECT user_id, password_hash FROM users WHERE email = ?',
            [email]
        );
        if (rows.length === 0) {
            return res.status(401).json({ error: FAIL });
        }

        const same = await bcrypt.compare(password || '', rows[0].password_hash);
        if (!same) {
            return res.status(401).json({ error: FAIL });
        }

        req.session.userId = rows[0].user_id;
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '서버 오류가 났어요' });
    }
});

// 로그아웃
router.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ ok: true });
    });
});

// 내 정보 (헤더의 "홍길동 님"에 사용)
router.get('/me', requireLogin, async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT user_id, name, email FROM users WHERE user_id = ?',
            [req.session.userId]
        );
        if (rows.length === 0) {
            return res.status(401).json({ error: '로그인이 필요해요' });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '서버 오류가 났어요' });
    }
});

module.exports = router;