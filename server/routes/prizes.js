const express = require('express');
const db = require('../db');
const requireLogin = require('../middleware/auth');
const handle = require('../middleware/handle');
const { parsePrize } = require('../validate');

const router = express.Router();
router.use(requireLogin);

// 시상 추가
router.post('/contests/:id/prizes', handle(async (req, res) => {
  const [owned] = await db.query(
    'SELECT contest_id FROM contests WHERE contest_id = ? AND user_id = ?',
    [req.params.id, req.session.userId]
  );
  if (owned.length === 0) return res.status(404).json({ error: '공모전을 찾을 수 없어요' });

  const p = parsePrize(req.body);
  if (p.error) return res.status(400).json({ error: p.error });

  try {
    const [result] = await db.query(
      'INSERT INTO prizes (contest_id, rank_name, amount) VALUES (?, ?, ?)',
      [req.params.id, p.rank_name, p.amount]
    );
    res.json({ prize_id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: '같은 등급이 이미 있어요' });
    throw err;
  }
}));

// 시상 수정 (내 공모전의 시상만: contests와 JOIN해서 소유자 확인)
router.put('/prizes/:id', handle(async (req, res) => {
  const p = parsePrize(req.body);
  if (p.error) return res.status(400).json({ error: p.error });

  try {
    const [result] = await db.query(
      `UPDATE prizes p JOIN contests c ON c.contest_id = p.contest_id
          SET p.rank_name = ?, p.amount = ?
        WHERE p.prize_id = ? AND c.user_id = ?`,
      [p.rank_name, p.amount, req.params.id, req.session.userId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: '시상을 찾을 수 없어요' });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: '같은 등급이 이미 있어요' });
    throw err;
  }
}));

// 시상 삭제
router.delete('/prizes/:id', handle(async (req, res) => {
  const [result] = await db.query(
    `DELETE p FROM prizes p JOIN contests c ON c.contest_id = p.contest_id
      WHERE p.prize_id = ? AND c.user_id = ?`,
    [req.params.id, req.session.userId]
  );
  if (result.affectedRows === 0) return res.status(404).json({ error: '시상을 찾을 수 없어요' });
  res.json({ ok: true });
}));

module.exports = router;