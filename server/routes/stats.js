const express = require('express');
const db = require('../db');
const requireLogin = require('../middleware/auth');
const handle = require('../middleware/handle');

const router = express.Router();
router.use(requireLogin);

router.get('/', handle(async (req, res) => {
    const userId = req.session.userId;

    // 상태별 건수
    const [byStatus] = await db.query(
        'SELECT status, COUNT(*) AS count FROM contests WHERE user_id = ? GROUP BY status',
        [userId]
    );

    // 마감 임박 3건 (아직 안 지난 것만)
    const [soon] = await db.query(
        `SELECT contest_id, title, apply_end, status
       FROM contests
      WHERE user_id = ? AND apply_end >= CURDATE()
      ORDER BY apply_end LIMIT 3`,
        [userId]
    );

    // 분야별 공모전 수: 공모전이 없는 분야도 0으로 나오도록 fields에서 시작해 LEFT JOIN
    const [byField] = await db.query(
        `SELECT f.name, COUNT(c.contest_id) AS count
       FROM fields f
       LEFT JOIN contest_fields cf ON cf.field_id = f.field_id
       LEFT JOIN contests c ON c.contest_id = cf.contest_id AND c.user_id = ?
      GROUP BY f.field_id, f.name
      ORDER BY f.field_id`,
        [userId]
    );

    res.json({ byStatus, soon, byField });
}));

module.exports = router;