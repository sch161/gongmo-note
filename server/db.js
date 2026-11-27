// DB 연결 풀: 요청마다 새로 연결하지 않고 재사용하려고 풀을 씀
// 접속 정보는 코드에 안 적고 .env에서 읽음 (Public 레포라서)

// .env 값을 process.env로 읽으려고 불러옴
require('dotenv').config();
// await 방식으로 쓰는 MySQL 모듈
const mysql = require('mysql2/promise');

// 연결 10개를 미리 만들어 돌려 쓰는 풀 (다른 파일은 db.query(sql, [값])로 사용)
const pool = mysql.createPool({
  host: process.env.DB_HOST,          // DB 서버 주소 (.env)
  user: process.env.DB_USER,          // DB 접속 계정 (.env)
  password: process.env.DB_PASSWORD,  // DB 비밀번호 (코드에 안 쓰려고 .env에 둠)
  database: process.env.DB_NAME,      // DB 이름 (.env)
  charset: 'utf8mb4',                 // 한글·이모지가 안 깨지는 인코딩
  waitForConnections: true,           // 연결이 다 쓰이면 에러 대신 줄 서서 기다림
  connectionLimit: 10,                // 동시에 쓰는 연결 최대 10개
  dateStrings: true                   // DATE를 'YYYY-MM-DD' 문자열로 받아 시간대 문제를 피함
});

// 풀을 내보내 다른 파일이 같은 풀을 같이 쓰게 함
module.exports = pool;
