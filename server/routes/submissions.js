const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const requireLogin = require('../middleware/auth');
const handle = require('../middleware/handle');
const { emptyToNull } = require('../validate');

const router = express.Router();
router.use(requireLogin);

const DIR = path.join(__dirname, '..', '..', 'uploads', 'submissions');
const ALLOWED = ['.pdf', '.zip', '.doc', '.docx', '.hwp', '.hwpx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt', '.jpg', '.jpeg', '.png'];

// 서버에는 고유한 이름으로 저장하고, 원래 파일명은 DB(file_name)에 따로 적어 둔다
const upload = multer({
    storage: multer.diskStorage({
        destination: DIR,
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
        },
    }),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        cb(null, ALLOWED.includes(path.extname(file.originalname).toLowerCase()));
    },
});

function uploadFile(req, res, next) {
    upload.single('file')(req, res, (err) => {
        if (err) {
            const msg = err.code === 'LIMIT_FILE_SIZE' ? '파일은 20MB 이하만 올릴 수 있어요' : '파일 업로드에 실패했어요';
            return res.status(400).json({ error: msg });
        }
        next();
    });
}

function removeFile(filePath) {
    fs.unlink(filePath, () => { });
}

// 한글 파일명이 깨져서 들어오는 경우를 바로잡는다
function fixName(name) {
    if (/[^\x00-\xff]/.test(name)) return name; // 이미 한글이 제대로 들어 있음
    return Buffer.from(name, 'latin1').toString('utf8');
}

// 업로드
router.post('/contests/:id/submissions', uploadFile, handle(async (req, res) => {
    const file = req.file;
    if (!file) {
        return res.status(400).json({ error: '파일을 선택해 주세요 (pdf, zip, 문서, 이미지만 가능해요)' });
    }

    const note = emptyToNull(String(req.body.note || '').trim());
    if (note && note.length > 200) {
        removeFile(file.path);
        return res.status(400).json({ error: '메모는 200자 이하로 써 주세요' });
    }

    const [owned] = await db.query(
        'SELECT contest_id FROM contests WHERE contest_id = ? AND user_id = ?',
        [req.params.id, req.session.userId]
    );
    if (owned.length === 0) {
        removeFile(file.path);
        return res.status(404).json({ error: '공모전을 찾을 수 없어요' });
    }

    try {
        const [result] = await db.query(
            'INSERT INTO submissions (contest_id, file_name, file_path, note) VALUES (?, ?, ?, ?)',
            [req.params.id, fixName(file.originalname).slice(0, 255), file.filename, note]
        );
        res.json({ submission_id: result.insertId });
    } catch (err) {
        removeFile(file.path); // DB 저장이 실패하면 파일도 지운다
        throw err;
    }
}));

// 다운로드: 내 공모전의 파일만 (DB에 있는 file_path만 사용)
router.get('/submissions/:id/download', handle(async (req, res) => {
    const [rows] = await db.query(
        `SELECT s.file_name, s.file_path
       FROM submissions s JOIN contests c ON c.contest_id = s.contest_id
      WHERE s.submission_id = ? AND c.user_id = ?`,
        [req.params.id, req.session.userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: '파일을 찾을 수 없어요' });

    res.download(path.join(DIR, rows[0].file_path), rows[0].file_name, (err) => {
        if (err && !res.headersSent) res.status(404).end();
    });
}));

// 메모 수정
router.put('/submissions/:id', handle(async (req, res) => {
    const note = emptyToNull(String(req.body.note || '').trim());
    if (note && note.length > 200) return res.status(400).json({ error: '메모는 200자 이하로 써 주세요' });

    const [result] = await db.query(
        `UPDATE submissions s JOIN contests c ON c.contest_id = s.contest_id
        SET s.note = ?
      WHERE s.submission_id = ? AND c.user_id = ?`,
        [note, req.params.id, req.session.userId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: '파일을 찾을 수 없어요' });
    res.json({ ok: true });
}));

// 삭제: DB 행을 지우고 파일도 지운다
router.delete('/submissions/:id', handle(async (req, res) => {
    const [rows] = await db.query(
        `SELECT s.file_path
       FROM submissions s JOIN contests c ON c.contest_id = s.contest_id
      WHERE s.submission_id = ? AND c.user_id = ?`,
        [req.params.id, req.session.userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: '파일을 찾을 수 없어요' });

    await db.query('DELETE FROM submissions WHERE submission_id = ?', [req.params.id]);
    removeFile(path.join(DIR, rows[0].file_path));
    res.json({ ok: true });
}));

module.exports = router;