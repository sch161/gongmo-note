// DB 연결 풀: 요청마다 새로 연결하지 않고 연결을 재사용하기 위해 풀을 쓴다.
// 접속 정보(비밀번호 등)는 코드에 적지 않고 .env에서 읽는다. (Public 레포라서)
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true // DATE 컬럼을 JS Date 대신 'YYYY-MM-DD' 문자열로 받아 시간대 문제를 피한다
});

module.exports = pool;
