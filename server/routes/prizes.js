// 시상(등수·상금) API: 공모전에 시상을 추가·수정·삭제함
// 항상 "내 공모전"의 시상만 다룸 (소유자 확인)

// 웹 서버 프레임워크 Express
const express = require('express');
// DB 연결 풀
const db = require('../db');
// 로그인 확인 미들웨어
const requireLogin = require('../middleware/auth');
// async 에러를 잡아 주는 도우미
const handle = require('../middleware/handle');
// 시상 한 줄 검사 함수
const { parsePrize } = require('../validate');

// 이 파일의 주소들을 모아 두는 라우터
const router = express.Router();
// 모든 API 앞에 로그인 확인 (소유자 확인은 각 쿼리의 user_id 조건에서 함)
router.use(requireLogin);

// POST /api/contests/:id/prizes: 시상 추가, 반환 {prize_id}
// 먼저 내 공모전인지 확인함: 로그인만 보면 남의 공모전 번호로 시상을 넣을 수 있어서
router.post('/contests/:id/prizes', handle(async (req, res) => {
  // 쿼리: 이 공모전이 내 것인지 확인함 (소유자 확인)
  // SELECT contest_id: 있는지만 확인
  // FROM contests: 공모전 표에서
  // WHERE contest_id = ? AND user_id = ?: 번호가 같고 주인이 나인 행만
  // 로그인만 보면 남의 공모전에 시상을 넣을 수 있어서 확인, 값은 ?로 넘겨 SQL 인젝션 방지
  const [owned] = await db.query(
    'SELECT contest_id FROM contests WHERE contest_id = ? AND user_id = ?',  // 실행할 쿼리
    [req.params.id, req.session.userId]                                      // ? 자리에 들어갈 값 (주소의 번호, 세션의 내 번호)
  );
  // 없거나 남의 것이면 404 (있는지 여부도 안 알려 주려고 둘 다 404)
  if (owned.length === 0) return res.status(404).json({ error: '공모전을 찾을 수 없어요' });

  // 등급·상금을 서버에서 검사·정리함
  const p = parsePrize(req.body);
  // 검사에 걸리면 400과 안내 메시지 응답
  if (p.error) return res.status(400).json({ error: p.error });

  // 중복 에러를 따로 처리하려고 감쌈
  try {
    // 쿼리: 시상 한 줄을 저장함
    // INSERT INTO prizes (...): 시상 표의 컬럼 지정
    // VALUES (?, ?, ?): 값 자리, 값은 따로 넘겨 SQL 인젝션 방지
    const [result] = await db.query(
      'INSERT INTO prizes (contest_id, rank_name, amount) VALUES (?, ?, ?)',  // 실행할 쿼리
      [req.params.id, p.rank_name, p.amount]                                  // ? 자리에 들어갈 값
    );
    // 새로 만들어진 시상 번호 응답
    res.json({ prize_id: result.insertId });
  // DB 에러를 여기서 처리함
  } catch (err) {
    // 같은 등급 이름이 있으면 DB의 UNIQUE가 이 에러를 냄 → 409 안내
    // 다른 에러는 다시 던져 handle이 500으로 처리
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: '같은 등급이 이미 있어요' });
    // 처리 못 하는 에러는 위로 넘김
    throw err;
  }
}));

// PUT /api/prizes/:id: 시상 수정, 반환 {ok: true}
// 내 공모전의 시상만 바꿈 (contests와 JOIN해서 소유자 확인)
router.put('/prizes/:id', handle(async (req, res) => {
  // 등급·상금을 서버에서 검사·정리함
  const p = parsePrize(req.body);
  // 검사에 걸리면 400과 안내 메시지 응답
  if (p.error) return res.status(400).json({ error: p.error });

  // 중복 에러를 따로 처리하려고 감쌈
  try {
    // 쿼리: 내 공모전의 시상을 수정함
    // UPDATE prizes p: 시상 표를 수정
    // JOIN contests c: 시상엔 user_id가 없어 공모전과 연결해 주인 확인
    // ON c.contest_id = p.contest_id: 같은 공모전끼리 이음
    // SET: 등급 이름과 상금을 새 값으로
    // WHERE p.prize_id = ? AND c.user_id = ?: 번호가 같고 주인이 나인 시상만 (값은 ?로 넘김)
    const [result] = await db.query(
      `UPDATE prizes p JOIN contests c ON c.contest_id = p.contest_id
          SET p.rank_name = ?, p.amount = ?
        WHERE p.prize_id = ? AND c.user_id = ?`,
      [p.rank_name, p.amount, req.params.id, req.session.userId]  // ? 자리에 차례로 들어갈 값
    );
    // 바뀐 행이 없으면 없거나 남의 시상이라 404
    if (result.affectedRows === 0) return res.status(404).json({ error: '시상을 찾을 수 없어요' });
    // 수정 성공 응답
    res.json({ ok: true });
  // DB 에러를 여기서 처리함
  } catch (err) {
    // 같은 등급 이름이 이미 있으면 409 안내
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: '같은 등급이 이미 있어요' });
    // 처리 못 하는 에러는 위로 넘김
    throw err;
  }
}));

// DELETE /api/prizes/:id: 시상 삭제, 반환 {ok: true}
// 수정과 같은 방식(JOIN + user_id 조건)으로 내 공모전의 시상만 지움
router.delete('/prizes/:id', handle(async (req, res) => {
  // 쿼리: 내 공모전의 시상을 삭제함
  // DELETE p FROM prizes p: JOIN을 쓸 땐 지울 표를 별칭 p로 지정
  // JOIN contests c ON ...: 공모전과 이어 주인 확인
  // WHERE p.prize_id = ? AND c.user_id = ?: 번호가 같고 주인이 나인 시상만 (값은 ?로 넘김)
  const [result] = await db.query(
    `DELETE p FROM prizes p JOIN contests c ON c.contest_id = p.contest_id
      WHERE p.prize_id = ? AND c.user_id = ?`,
    [req.params.id, req.session.userId]  // ? 자리에 들어갈 값
  );
  // 지운 행이 없으면 없거나 남의 시상이라 404
  if (result.affectedRows === 0) return res.status(404).json({ error: '시상을 찾을 수 없어요' });
  // 삭제 성공 응답
  res.json({ ok: true });
}));

// 다른 파일에서 쓰도록 내보냄
module.exports = router;