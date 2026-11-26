const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const requireLogin = require('../middleware/auth');
const handle = require('../middleware/handle');
const { emptyToNull, parsePrize } = require('../validate');
const { extractContestFromPoster } = require('../services/ai');

const router = express.Router();
router.use(requireLogin);

const UPLOADS = path.join(__dirname, '..', '..', 'uploads');
const STATUSES = ['관심', '준비중', '제출완료', '수상'];

// 포스터 업로드: 서버가 고유한 파일명을 만들어 저장한다 (사용자가 보낸 이름은 쓰지 않음)
const upload = multer({
    storage: multer.diskStorage({
        destination: path.join(UPLOADS, 'posters'),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
        },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

// multer 에러(용량 초과 등)를 500이 아니라 안내 메시지로 돌려준다
function uploadPoster(req, res, next) {
    upload.single('poster')(req, res, (err) => {
        if (err) {
            const msg = err.code === 'LIMIT_FILE_SIZE'
                ? '포스터 파일은 10MB 이하만 올릴 수 있어요'
                : '파일 업로드에 실패했어요';
            return res.status(400).json({ error: msg });
        }
        next();
    });
}

function removeFile(filePath) {
    fs.unlink(filePath, () => { });
}

// AI 추출용 업로드: 파일을 디스크에 저장하지 않고 메모리에만 잠깐 둔다 (AI에게 보내고 버릴 것이므로)
const memoryUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

function uploadForAi(req, res, next) {
    memoryUpload.single('poster')(req, res, (err) => {
        if (err) {
            const msg = err.code === 'LIMIT_FILE_SIZE' ? '포스터 파일은 10MB 이하만 올릴 수 있어요' : '파일 업로드에 실패했어요';
            return res.status(400).json({ error: msg });
        }
        next();
    });
}

// 목록: 제목 검색(q), 분야 필터(field), 마감 임박순
router.get('/', handle(async (req, res) => {
    const { q, field } = req.query;
    const params = [req.session.userId];
    let sql = `
    SELECT c.contest_id, c.title, c.organizer, c.status, c.apply_end,
           GROUP_CONCAT(f.name ORDER BY f.field_id SEPARATOR ', ') AS fields
      FROM contests c
      LEFT JOIN contest_fields cf ON cf.contest_id = c.contest_id
      LEFT JOIN fields f ON f.field_id = cf.field_id
     WHERE c.user_id = ?`;
    if (q) {
        sql += ' AND c.title LIKE ?';
        params.push('%' + q + '%');
    }
    if (field) {
        sql += ' AND c.contest_id IN (SELECT contest_id FROM contest_fields WHERE field_id = ?)';
        params.push(field);
    }
    // 이미 마감된 공모전은 뒤로 보낸다
    sql += ' GROUP BY c.contest_id ORDER BY (c.apply_end < CURDATE()), c.apply_end';

    const [rows] = await db.query(sql, params);
    res.json(rows);
}));

// 포스터 이미지 (내 공모전만)
router.get('/:id/poster', handle(async (req, res) => {
    const [rows] = await db.query(
        'SELECT poster_path FROM contests WHERE contest_id = ? AND user_id = ?',
        [req.params.id, req.session.userId]
    );
    if (rows.length === 0 || !rows[0].poster_path) return res.status(404).end();
    res.sendFile(path.join(UPLOADS, 'posters', rows[0].poster_path));
}));

// 상세: 공모전 + 분야 + 시상 + 제출물(버전은 저장하지 않고 계산)
router.get('/:id', handle(async (req, res) => {
    const id = req.params.id;
    const [rows] = await db.query(
        `SELECT contest_id, organizer, title, status, apply_start, apply_end,
            announce_date, memo, poster_path
       FROM contests WHERE contest_id = ? AND user_id = ?`,
        [id, req.session.userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: '공모전을 찾을 수 없어요' });
    const contest = rows[0];

    const [fields] = await db.query(
        `SELECT f.field_id, f.name
       FROM contest_fields cf JOIN fields f ON f.field_id = cf.field_id
      WHERE cf.contest_id = ? ORDER BY f.field_id`,
        [id]
    );
    const [prizes] = await db.query(
        'SELECT prize_id, rank_name, amount FROM prizes WHERE contest_id = ? ORDER BY prize_id',
        [id]
    );
    const [submissions] = await db.query(
        `SELECT submission_id, file_name, note, submitted_at,
            CONCAT('v', ROW_NUMBER() OVER (PARTITION BY contest_id ORDER BY submission_id)) AS version
       FROM submissions WHERE contest_id = ?
      ORDER BY submission_id DESC`,
        [id]
    );

    res.json({ ...contest, fields, prizes, submissions });
}));

// 포스터 AI 추출: DB에는 저장하지 않고, 읽어 낸 내용만 돌려준다 (저장은 사용자가 확인한 뒤 등록 API로)
router.post('/extract', uploadForAi, handle(async (req, res) => {
    // 파일이 없으면 (이미지가 아니면 multer가 걸러서 없다) 안내
    if (!req.file) {
        return res.status(400).json({ error: '이미지 파일을 선택해 주세요 (jpg, png 등)' });
    }

    // AI가 고를 수 있는 분야 이름 목록을 DB에서 읽는다
    const [fields] = await db.query('SELECT name FROM fields ORDER BY field_id');
    const fieldNames = fields.map((f) => f.name);

    try {
        const data = await extractContestFromPoster(req.file.buffer, req.file.mimetype, fieldNames);
        res.json(data);
    } catch (err) {
        console.error(err); // 원인은 터미널에서 확인
        // AI가 실패해도 직접 입력할 수 있으므로 안내만 한다
        res.status(502).json({ error: 'AI가 포스터를 읽지 못했어요. 직접 입력해 주세요.' });
    }
}));

// 등록: contests → contest_fields → prizes를 한 트랜잭션으로 저장
router.post('/', uploadPoster, handle(async (req, res) => {
    const b = req.body;
    const posterName = req.file ? req.file.filename : null;
    const fail = (code, msg) => {
        if (posterName) removeFile(path.join(UPLOADS, 'posters', posterName));
        return res.status(code).json({ error: msg });
    };

    if (!b.title || !b.organizer || !b.apply_end) {
        return fail(400, '공모전명, 주최기관, 접수 마감일은 꼭 입력해 주세요');
    }
    const status = b.status || '관심';
    if (!STATUSES.includes(status)) return fail(400, '상태가 올바르지 않아요');
    if (b.apply_start && b.apply_start > b.apply_end) {
        return fail(400, '접수 시작일이 마감일보다 늦어요');
    }

    let fieldIds, prizes;
    try {
        fieldIds = JSON.parse(b.field_ids || '[]').map(Number);
        prizes = JSON.parse(b.prizes || '[]').map(parsePrize);
    } catch (e) {
        return fail(400, '잘못된 요청이에요');
    }
    const bad = prizes.find((p) => p.error);
    if (bad) return fail(400, bad.error);

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [result] = await conn.query(
            `INSERT INTO contests
         (user_id, organizer, title, status, apply_start, apply_end, announce_date, memo, poster_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.session.userId, b.organizer, b.title, status,
                emptyToNull(b.apply_start), b.apply_end, emptyToNull(b.announce_date),
                emptyToNull(b.memo), posterName,
            ]
        );
        const contestId = result.insertId;

        for (const fieldId of fieldIds) {
            await conn.query('INSERT INTO contest_fields (contest_id, field_id) VALUES (?, ?)', [contestId, fieldId]);
        }
        for (const p of prizes) {
            await conn.query('INSERT INTO prizes (contest_id, rank_name, amount) VALUES (?, ?, ?)', [contestId, p.rank_name, p.amount]);
        }

        await conn.commit();
        res.json({ contest_id: contestId });
    } catch (err) {
        await conn.rollback(); // 하나라도 실패하면 전부 취소
        if (posterName) removeFile(path.join(UPLOADS, 'posters', posterName));
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: '이미 등록한 공모전이거나, 같은 등급이 두 번 들어 있어요' });
        }
        throw err;
    } finally {
        conn.release();
    }
}));

// 상태·메모 저장
router.put('/:id', handle(async (req, res) => {
    const { status, memo } = req.body;
    if (!STATUSES.includes(status)) return res.status(400).json({ error: '상태가 올바르지 않아요' });

    const [result] = await db.query(
        'UPDATE contests SET status = ?, memo = ? WHERE contest_id = ? AND user_id = ?',
        [status, emptyToNull(memo), req.params.id, req.session.userId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: '공모전을 찾을 수 없어요' });
    res.json({ ok: true });
}));

// 삭제: DB 행은 CASCADE로 같이 지워지고, 파일은 직접 지운다
router.delete('/:id', handle(async (req, res) => {
    const id = req.params.id;
    const [rows] = await db.query(
        'SELECT poster_path FROM contests WHERE contest_id = ? AND user_id = ?',
        [id, req.session.userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: '공모전을 찾을 수 없어요' });

    const [files] = await db.query('SELECT file_path FROM submissions WHERE contest_id = ?', [id]);

    await db.query('DELETE FROM contests WHERE contest_id = ?', [id]);

    if (rows[0].poster_path) removeFile(path.join(UPLOADS, 'posters', rows[0].poster_path));
    files.forEach((f) => removeFile(path.join(UPLOADS, 'submissions', f.file_path)));

    res.json({ ok: true });
}));

module.exports = router;