// 인증 API: 회원가입·로그인·로그아웃·내 정보 확인
// 비밀번호는 bcrypt 해시로만 저장하고, 로그인 상태는 세션으로 관리함

// 웹 서버 프레임워크 Express
const express = require('express');
// 비밀번호 해시·비교용 모듈
const bcrypt = require('bcrypt');
// DB 연결 풀
const db = require('../db');
// 로그인 확인 미들웨어 (/me에 사용)
const requireLogin = require('../middleware/auth');

// 이 파일의 주소들을 모아 두는 라우터
const router = express.Router();

// POST /api/auth/signup: 회원가입, 반환 {ok: true}
// 서버에서도 입력을 검사함 (프론트 검사는 우회할 수 있어서 서버가 마지막 방어선)
router.post('/signup', async (req, res) => {
    // 요청 본문에서 이름·이메일·비밀번호를 꺼냄
    const { name, email, password } = req.body;

    // 이름이 없거나 50자를 넘으면 거절
    if (!name || name.length > 50) {
        // 400(잘못된 요청)과 안내 메시지 응답
        return res.status(400).json({ error: '이름은 1~50자로 입력해 주세요' });
    }
    // 이메일이 없거나 '글자@글자.글자' 모양이 아니면 거절
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        // 400과 안내 메시지 응답
        return res.status(400).json({ error: '이메일 형식이 올바르지 않아요' });
    }
    // 이메일이 255자를 넘으면 거절 (DB 컬럼 길이)
    if (email.length > 255) {
        // 400과 안내 메시지 응답
        return res.status(400).json({ error: '이메일은 255자 이하로 입력해 주세요' });
    }
    // 비밀번호가 없거나 8자 미만이면 거절
    if (!password || password.length < 8) {
        // 400과 안내 메시지 응답
        return res.status(400).json({ error: '비밀번호는 8자 이상이어야 해요' });
    }

    // DB 작업 중 에러가 나도 서버가 안 죽게 감쌈
    try {
        // 비밀번호를 bcrypt 해시(되돌릴 수 없는 글자)로 바꿈. DB가 유출돼도 원래 비밀번호를 알기 어려움
        // 10은 계산 반복 횟수 (느릴수록 무차별 대입이 어려움). 같은 비밀번호도 salt가 달라 해시가 다름
        const hash = await bcrypt.hash(password, 10);
        // 쿼리: 회원 한 명을 users 표에 저장함
        // INSERT INTO users (...): 값을 넣을 표와 컬럼을 지정
        // VALUES (?, ?, ?): 넣을 값 자리. 값은 따로 넘겨 SQL 인젝션 방지
        await db.query(
            'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',  // 실행할 쿼리
            [name, email, hash]                                                 // ? 자리에 차례로 들어갈 값 (비밀번호는 해시)
        );
        // 가입 성공 응답
        res.json({ ok: true });
    // DB 에러를 여기서 처리함
    } catch (err) {
        // 이메일이 중복이면 DB의 UNIQUE가 이 에러를 냄
        // (먼저 조회 후 넣기는 동시 요청에 뚫릴 수 있어서 DB의 UNIQUE에 맡김)
        if (err.code === 'ER_DUP_ENTRY') {
            // 409(충돌)와 안내 메시지 응답
            return res.status(409).json({ error: '이미 가입된 이메일이에요' });
        }
        // 원인은 터미널에만 남김
        console.error(err);
        // 사용자에게는 500과 짧은 안내만 보냄
        res.status(500).json({ error: '서버 오류가 났어요' });
    }
});

// POST /api/auth/login: 로그인, 성공하면 세션에 userId 저장, 반환 {ok: true}
router.post('/login', async (req, res) => {
    // 요청 본문에서 이메일·비밀번호를 꺼냄
    const { email, password } = req.body;
    // 이메일 없음/비밀번호 틀림에 같은 메시지를 씀 (가입된 이메일을 알아내는 것을 막으려고)
    const FAIL = '이메일 또는 비밀번호가 올바르지 않아요';

    // DB 작업 중 에러가 나도 서버가 안 죽게 감쌈
    try {
        // 쿼리: 이메일로 회원을 찾음
        // SELECT: 비밀번호 비교에 필요한 컬럼만 읽음
        // FROM users: 회원 표에서
        // WHERE email = ?: 이메일이 같은 행만 (값은 ?로 넘겨 SQL 인젝션 방지)
        const [rows] = await db.query(
            'SELECT user_id, password_hash FROM users WHERE email = ?',  // 실행할 쿼리
            [email]                                                      // ? 자리에 들어갈 값
        );
        // 그 이메일의 회원이 없으면 실패 처리
        if (rows.length === 0) {
            // 401(인증 실패)과 공통 메시지 응답
            return res.status(401).json({ error: FAIL });
        }

        // 입력한 비밀번호를 같은 방식으로 계산해 저장된 해시와 비교함 (해시는 되돌릴 수 없어서 복호화 아닌 비교)
        // password || '': 비밀번호가 비어 와도 에러 없이 "틀림"으로 처리하려고
        const same = await bcrypt.compare(password || '', rows[0].password_hash);
        // 비밀번호가 다르면 실패 처리
        if (!same) {
            // 401과 공통 메시지 응답
            return res.status(401).json({ error: FAIL });
        }

        // 로그인 성공: 세션에 사용자번호 기록 (이후 요청은 이 값으로 누구인지 앎)
        req.session.userId = rows[0].user_id;
        // 로그인 성공 응답
        res.json({ ok: true });
    // DB 에러를 여기서 처리함
    } catch (err) {
        // 원인은 터미널에만 남김
        console.error(err);
        // 사용자에게는 500과 짧은 안내만 보냄
        res.status(500).json({ error: '서버 오류가 났어요' });
    }
});

// POST /api/auth/logout: 서버의 세션을 없애 로그아웃함
router.post('/logout', (req, res) => {
    // 세션 삭제 (끝나면 콜백 실행)
    req.session.destroy(() => {
        // 로그아웃 성공 응답
        res.json({ ok: true });
    });
});

// GET /api/auth/me: 로그인한 사람의 이름·이메일 반환 (헤더의 "홍길동 님"에 사용)
// requireLogin: 로그인한 사람만 접근
router.get('/me', requireLogin, async (req, res) => {
    // DB 작업 중 에러가 나도 서버가 안 죽게 감쌈
    try {
        // 쿼리: 내 이름·이메일을 읽음
        // SELECT: 화면에 필요한 컬럼만 (password_hash는 안 읽음)
        // FROM users: 회원 표에서
        // WHERE user_id = ?: 세션의 내 번호인 행만 (값은 ?로 넘김)
        const [rows] = await db.query(
            'SELECT user_id, name, email FROM users WHERE user_id = ?',  // 실행할 쿼리
            [req.session.userId]                                         // ? 자리에 들어갈 값 (요청값 아닌 세션의 내 번호)
        );
        // 회원이 없으면(탈퇴 등) 로그인 필요로 처리
        if (rows.length === 0) {
            // 401 응답
            return res.status(401).json({ error: '로그인이 필요해요' });
        }
        // 내 정보 한 건 응답
        res.json(rows[0]);
    // DB 에러를 여기서 처리함
    } catch (err) {
        // 원인은 터미널에만 남김
        console.error(err);
        // 사용자에게는 500과 짧은 안내만 보냄
        res.status(500).json({ error: '서버 오류가 났어요' });
    }
});

// 다른 파일에서 쓰도록 내보냄
module.exports = router;