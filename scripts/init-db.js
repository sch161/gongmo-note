// DB 초기화 스크립트: mysql CLI 없이 `npm run db:init` 한 번으로 DB·테이블·샘플 데이터를 만듦
// schema.sql 맨 위에서 기존 테이블을 DROP 하므로, 실행할 때마다 처음 상태로 돌아감

// .env 값을 process.env로 읽으려고 dotenv를 불러옴
require('dotenv').config();
// 파일 읽기·복사용 내장 모듈
const fs = require('fs');
// OS에 맞게 경로를 합치는 내장 모듈
const path = require('path');
// await 방식으로 쓰는 MySQL 모듈
const mysql = require('mysql2/promise');

// 초기화 전체를 하는 함수 (인자·반환값 없음, 실패하면 에러를 던짐)
async function main() {
  // DB 이름: .env의 DB_NAME, 없으면 gongmo_note
  const dbName = process.env.DB_NAME || 'gongmo_note';

  // MySQL에 연결하는 객체 conn (await: 연결이 끝날 때까지 기다림)
  // 아직 DB가 없을 수 있어서 database 옵션 없이 먼저 접속함
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,          // DB 서버 주소 (.env에서 읽음)
    user: process.env.DB_USER,          // DB 접속 계정
    password: process.env.DB_PASSWORD,  // DB 비밀번호 (Public 레포라 코드에 안 쓰고 .env에 둠)
    charset: 'utf8mb4',                 // 한글·이모지가 안 깨지는 문자 인코딩
    multipleStatements: true            // .sql 파일 하나에 문장이 여러 개라서 한 번에 실행하려고 킴
  });

  try {
    // DB 만드는 SQL: IF NOT EXISTS라 이미 있으면 넘어감
    // DB 이름은 ?로 못 넘기는 자리라 백틱으로 감싸 넣음 (.env 값이라 사용자 입력 아님)
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4`
    );
    // 방금 만든(또는 있던) DB를 사용하도록 선택함
    await conn.query(`USE \`${dbName}\``);

    // 순서 중요: 테이블이 있어야 seed 데이터를 넣을 수 있음
    for (const file of ['schema.sql', 'seed.sql']) {
      // server/db 폴더의 .sql 파일 내용을 글자로 읽음
      const sql = fs.readFileSync(path.join(__dirname, '..', 'server', 'db', file), 'utf8');
      // 읽은 SQL 전체를 한 번에 실행함
      await conn.query(sql);
      // 어떤 파일이 끝났는지 터미널에 표시함
      console.log(`${file} 실행 완료`);
    }
    // seed.sql의 제출물(file_path)에 해당하는 샘플 파일을 uploads/submissions/ 로 복사함
    // 샘플 파일 원본 폴더 경로
    const srcDir = path.join(__dirname, '..', 'seed-files');
    // 복사해 넣을 폴더 경로
    const destDir = path.join(__dirname, '..', 'uploads', 'submissions');
    // 폴더가 없으면 만듦 (recursive: 중간 폴더까지 한 번에)
    fs.mkdirSync(destDir, { recursive: true });
    // 원본 폴더가 있을 때만 복사함
    if (fs.existsSync(srcDir)) {
      // 원본 폴더의 파일 이름을 하나씩 처리함
      for (const name of fs.readdirSync(srcDir)) {
        // 복사될 위치의 전체 경로
        const dest = path.join(destDir, name);
        // 이미 있는 파일은 덮어쓰지 않으려고 없을 때만 복사함
        if (!fs.existsSync(dest)) fs.copyFileSync(path.join(srcDir, name), dest);
      }
    }

    // 모든 과정이 끝났음을 표시함
    console.log('DB 초기화 끝');
  } finally {
    // 성공이든 실패든 DB 연결을 닫으려고 finally에 둠
    await conn.end();
  }
}

// main 실행. 실패하면 원인을 보여 주고 종료 코드 1로 끝냄 (npm이 실패를 알게 하려고)
main().catch((err) => {
  // 실패 원인 메시지를 터미널에 표시함
  console.error('DB 초기화 실패:', err.message);
  // 비정상 종료(1)로 끝냄
  process.exit(1);
});
