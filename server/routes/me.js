const express = require('express');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const requireLogin = require('../middleware/auth');

const router = express.Router();
router.use(requireLogin);

// 이름(과 새 비밀번호) 수정. 이메일은 수정할 수 없다.
router.put('/', async (req, res) => {
    const { name, newPassword } = req.body;

    if (!name || name.length > 50) {
        return res.status(400).json({ error: '이름은 1~50자로 입력해 주세요' });
    }

    try {
        if (newPassword) {
            if (newPassword.length < 8) {
                return res.status(400).json({ error: '비밀번호는 8자 이상이어야 해요' });
            }
            const hash = await bcrypt.hash(newPassword, 10);
            await db.query(
                'UPDATE users SET name = ?, password_hash = ? WHERE user_id = ?',
                [name, hash, req.session.userId]
            );
        } else {
            await db.query('UPDATE users SET name = ? WHERE user_id = ?', [
                name,
                req.session.userId,
            ]);
        }
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '서버 오류가 났어요' });
    }
});

// 회원 탈퇴: 비밀번호 확인 → 파일 목록 기억 → 사용자 삭제(CASCADE) → 파일 삭제
router.delete('/', async (req, res) => {
    const { password } = req.body;
    const userId = req.session.userId;

    try {
        const [users] = await db.query(
            'SELECT password_hash FROM users WHERE user_id = ?',
            [userId]
        );
        const same = await bcrypt.compare(password || '', users[0].password_hash);
        if (!same) {
            return res.status(401).json({ error: '비밀번호가 올바르지 않아요' });
        }

        // 사용자를 지우면 DB 행은 CASCADE로 사라지므로, 지우기 전에 파일 이름을 먼저 읽어 둔다
        const [posters] = await db.query(
            'SELECT poster_path FROM contests WHERE user_id = ? AND poster_path IS NOT NULL',
            [userId]
        );
        const [files] = await db.query(
            `SELECT s.file_path
         FROM submissions s
         JOIN contests c ON c.contest_id = s.contest_id
        WHERE c.user_id = ?`,
            [userId]
        );

        await db.query('DELETE FROM users WHERE user_id = ?', [userId]);

        const uploads = path.join(__dirname, '..', '..', 'uploads');
        posters.forEach((p) => removeFile(path.join(uploads, 'posters', p.poster_path)));
        files.forEach((f) => removeFile(path.join(uploads, 'submissions', f.file_path)));

        req.session.destroy(() => {
            res.json({ ok: true });
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '서버 오류가 났어요' });
    }
});

// 파일이 이미 없어도 에러로 멈추지 않는다
function removeFile(filePath) {
    fs.unlink(filePath, () => { });
}

module.exports = router;