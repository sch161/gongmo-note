// 통계 API: 대시보드에 보여 줄 숫자(상태별 건수, 마감 임박, 분야별 개수)를 계산해 줌
// 모든 쿼리에 user_id 조건이 있어 내 데이터만 셈

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
// 로그인한 사람만 사용 가능
router.use(requireLogin);

// GET /api/stats: {byStatus, soon, byField} 반환
router.get('/', handle(async (req, res) => {
    // 세션의 사용자번호 (요청값을 믿으면 남의 통계를 볼 수 있어서 세션 값을 씀)
    const userId = req.session.userId;

    // 상태별 건수
    // 쿼리: 상태별 내 공모전 수
    // SELECT status, COUNT(*): 상태와 그 개수
    // FROM contests: 공모전 표에서
    // WHERE user_id = ?: 내 공모전만 (값은 ?로 넘김)
    // GROUP BY status: 같은 상태끼리 묶어서 셈
    const [byStatus] = await db.query(
        'SELECT status, COUNT(*) AS count FROM contests WHERE user_id = ? GROUP BY status',  // 실행할 쿼리
        [userId]                                                                             // ? 자리에 들어갈 값
    );

    // 마감 임박 3건 (아직 안 지난 것만)
    // 쿼리: 마감 임박 공모전 3건
    // SELECT: 화면에 필요한 컬럼
    // FROM contests: 공모전 표에서
    // WHERE: 내 공모전 중 마감일이 오늘 이후인 것만
    // ORDER BY apply_end: 마감 가까운 순
    // LIMIT 3: 3건만
    const [soon] = await db.query(
        `SELECT contest_id, title, apply_end, status
       FROM contests
      WHERE user_id = ? AND apply_end >= CURDATE()
      ORDER BY apply_end LIMIT 3`,
        [userId]  // ? 자리에 들어갈 값
    );

    // 분야별 공모전 수: 공모전이 없는 분야도 0으로 나오게 fields에서 시작해 LEFT JOIN함
    // 쿼리: 분야별 내 공모전 수
    // SELECT f.name, COUNT(c.contest_id): 분야 이름과 공모전 개수
    // FROM fields f: 분야 표가 기준 (공모전 없는 분야도 나오게)
    // LEFT JOIN contest_fields cf: 분야-공모전 연결 표를 붙임, 연결 없어도 분야 줄 유지
    // LEFT JOIN contests c ... AND c.user_id = ?: 내 공모전만 붙임
    // user_id를 WHERE가 아닌 ON에 둔 이유: WHERE에 두면 공모전 없는 분야 줄(c가 NULL)이 걸러져
    // LEFT JOIN이 INNER JOIN처럼 되어 0건 분야가 사라짐
    // COUNT(c.contest_id): 안 붙은 줄은 NULL이라 안 세서 0 (COUNT(*)는 1이 나옴)
    // GROUP BY f.field_id, f.name: 분야 하나당 한 줄로 묶음
    // ORDER BY f.field_id: 분야 번호순
    const [byField] = await db.query(
        `SELECT f.name, COUNT(c.contest_id) AS count
       FROM fields f
       LEFT JOIN contest_fields cf ON cf.field_id = f.field_id
       LEFT JOIN contests c ON c.contest_id = cf.contest_id AND c.user_id = ?
      GROUP BY f.field_id, f.name
      ORDER BY f.field_id`,
        [userId]  // ? 자리에 들어갈 값 (ON 조건의 ?)
    );

    // 세 결과를 한 번에 응답
    res.json({ byStatus, soon, byField });
}));

// 다른 파일에서 쓰도록 내보냄
module.exports = router;