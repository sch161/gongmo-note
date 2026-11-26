// DB 초기화 스크립트: mysql CLI 없이 `npm run db:init` 한 번으로 DB·테이블·샘플 데이터를 만든다.
// schema.sql 맨 위에서 기존 테이블을 DROP 하므로, 실행할 때마다 처음 상태로 돌아간다.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  const dbName = process.env.DB_NAME || 'gongmo_note';

  // .sql 파일 하나에 문장이 여러 개이므로 multipleStatements 가 필요하다.
  // 아직 DB가 없을 수 있어서 database 옵션 없이 먼저 접속한다.
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    charset: 'utf8mb4',
    multipleStatements: true
  });

  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4`
    );
    await conn.query(`USE \`${dbName}\``);

    // 순서 중요: 테이블이 있어야 seed 데이터를 넣을 수 있다
    for (const file of ['schema.sql', 'seed.sql']) {
      const sql = fs.readFileSync(path.join(__dirname, '..', 'server', 'db', file), 'utf8');
      await conn.query(sql);
      console.log(`${file} 실행 완료`);
    }
    // seed.sql의 제출물(file_path)에 해당하는 샘플 파일을 uploads/submissions/ 로 복사한다.
    // 폴더가 없으면 만들고, 이미 있는 파일은 덮어쓰지 않는다.
    const srcDir = path.join(__dirname, '..', 'seed-files');
    const destDir = path.join(__dirname, '..', 'uploads', 'submissions');
    fs.mkdirSync(destDir, { recursive: true });
    if (fs.existsSync(srcDir)) {
      for (const name of fs.readdirSync(srcDir)) {
        const dest = path.join(destDir, name);
        if (!fs.existsSync(dest)) fs.copyFileSync(path.join(srcDir, name), dest);
      }
    }

    console.log('DB 초기화 끝');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('DB 초기화 실패:', err.message);
  process.exit(1);
});
