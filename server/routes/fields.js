const express = require('express');
const db = require('../db');
const requireLogin = require('../middleware/auth');
const handle = require('../middleware/handle');

const router = express.Router();

// 분야 고정 목록 (읽기만)
router.get('/', requireLogin, handle(async (req, res) => {
    const [rows] = await db.query('SELECT field_id, name FROM fields ORDER BY field_id');
    res.json(rows);
}));

module.exports = router;