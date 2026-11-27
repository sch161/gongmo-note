// 분야 목록 API: 공모전 분야(IT·SW, 디자인 등) 고정 목록을 읽기 전용으로 내려 줌
// 등록 화면의 분야 체크박스에 쓰임

// 웹 서버 프레임워크 Express
const express = require('express');
// DB 연결 풀
const db = require('../db');
// 로그인 확인 미들웨어
const requireLogin = require('../middleware/auth');
// async 에러를 잡아 주는 도우미
const handle = require('../middleware/handle');

// 이 파일의 주소들을 모아 두는 라우터
const router = express.Router();

// GET /api/fields: 분야 목록 [{field_id, name}] 반환 (로그인한 사람만)
// 분야 이름을 DB에서 읽는 이유: 한 곳만 고치면 되고 AI 추출도 같은 목록을 쓰려고
router.get('/', requireLogin, handle(async (req, res) => {
    // 쿼리: 분야 전체 목록을 읽음
    // SELECT: 분야 번호와 이름
    // FROM fields: 분야 표에서
    // ORDER BY field_id: 번호순으로 정렬
    // 사용자 입력이 없어서 ?가 필요 없음
    const [rows] = await db.query('SELECT field_id, name FROM fields ORDER BY field_id');
    // 분야 목록 응답
    res.json(rows);
}));

// 다른 파일에서 쓰도록 내보냄
module.exports = router;