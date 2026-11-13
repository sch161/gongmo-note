// 서버 시작점. 1단계에서는 정적 파일 서빙과 상태 확인(health)만 한다.
require('dotenv').config();
const express = require('express');
const path = require('path');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// JSON 요청 본문을 req.body로 읽기 위해 필요
app.use(express.json());

// public/ 폴더의 HTML·CSS·JS를 그대로 제공
app.use(express.static(path.join(__dirname, '..', 'public')));

// 서버와 DB가 살아 있는지 확인: DB에 SELECT 1을 보내 본다
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (err) {
    console.error('health 확인 실패:', err.message);
    res.status(500).json({ ok: false });
  }
});

app.listen(PORT, () => {
  console.log(`공모노트 서버 시작: http://localhost:${PORT}`);
});
