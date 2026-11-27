// 서버 시작 파일: Express 앱을 만들고 세션·정적 파일·API 라우터를 연결한 뒤 포트를 엶
// 접속 정보와 비밀 값은 코드에 안 쓰고 .env에서 읽음

// .env 값을 process.env로 읽으려고 불러옴
require('dotenv').config();
// 웹 서버 프레임워크 Express
const express = require('express');
// 로그인 상태를 서버에 기억하는 세션 모듈
const session = require('express-session');
// 경로를 OS에 맞게 합치는 내장 모듈
const path = require('path');
// DB 연결 풀 (health 확인에 씀)
const db = require('./db');

// 웹 서버 본체. 아래 app.use로 거치는 장치를 순서대로 붙임
const app = express();

// JSON 요청 본문을 req.body 객체로 바꿔 줌
app.use(express.json());
// 세션: 로그인 정보는 서버에 두고 브라우저엔 세션 ID 쿠키만 줌
// (사용자번호를 쿠키에 직접 두면 사용자가 바꿀 수 있어서 위험함)
app.use(
  session({
    secret: process.env.SESSION_SECRET,  // 쿠키 서명용 비밀 문자열 (.env, 코드에 안 씀)
    resave: false,                       // 안 바뀐 세션은 다시 저장하지 않음
    saveUninitialized: false,            // 로그인 전 방문자의 빈 세션은 안 만듦
    cookie: { httpOnly: true },          // JS가 쿠키를 못 읽게 막음 (XSS 대비)
  })
);
// public 폴더의 HTML/CSS/JS 화면 파일을 그대로 내려 줌
app.use(express.static(path.join(__dirname, '..', 'public')));

// 서버·DB가 살아 있는지 확인하는 주소
app.get('/api/health', async (req, res) => {
  // DB 확인 중 에러가 나도 서버가 안 죽게 try로 감쌈
  try {
    // 아무것도 안 읽고 연결만 확인하는 쿼리
    await db.query('SELECT 1');
    // 정상이면 ok: true 응답
    res.json({ ok: true });
  // 실패하면 500과 ok: false 응답
  } catch (err) {
    // DB에 문제가 있다고 알림
    res.status(500).json({ ok: false });
  }
});

// 주소 앞부분에 따라 담당 라우터 파일로 나눠 보냄 (기능별 파일 분리)
app.use('/api/auth', require('./routes/auth'));
// 내 정보 수정·탈퇴
app.use('/api/me', require('./routes/me'));
// 분야 목록
app.use('/api/fields', require('./routes/fields'));
// 공모전 목록·상세·등록·수정·삭제
app.use('/api/contests', require('./routes/contests'));
// 시상 (파일 안에 /contests/:id/prizes 처럼 전체 주소를 적어서 /api까지만 붙임)
app.use('/api', require('./routes/prizes'));
// 제출물 (위와 같은 방식)
app.use('/api', require('./routes/submissions'));
// 대시보드 통계
app.use('/api/stats', require('./routes/stats'));

// 포트 번호: .env의 PORT, 없으면 3000
const PORT = process.env.PORT || 3000;
// 서버를 켜고 요청을 기다림
app.listen(PORT, () => {
  // 접속 주소를 터미널에 표시함
  console.log(`http://localhost:${PORT}`);
});