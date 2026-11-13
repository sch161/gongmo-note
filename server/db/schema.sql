-- 공모노트 스키마: 6개 테이블 / 28컬럼 / 3NF·BCNF
-- 다시 실행해도 되도록 기존 테이블을 먼저 지운다 (자식 테이블부터: FK 때문에 순서가 중요)
DROP TABLE IF EXISTS submissions;
DROP TABLE IF EXISTS prizes;
DROP TABLE IF EXISTS contest_fields;
DROP TABLE IF EXISTS fields;
DROP TABLE IF EXISTS contests;
DROP TABLE IF EXISTS users;

-- 회원: 공모전을 "누가" 관리하는지 구분하기 위해 필요 (로그인 정보)
CREATE TABLE users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL
) CHARACTER SET utf8mb4;

-- 공모전: 사용자가 지원하려는 공모전 한 건의 기본 정보. 같은 사용자가 같은 공모전을 중복 등록하지 못하게 UNIQUE
CREATE TABLE contests (
  contest_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  organizer VARCHAR(100) NOT NULL,
  title VARCHAR(200) NOT NULL,
  status ENUM('관심','준비중','제출완료','수상') NOT NULL DEFAULT '관심',
  apply_start DATE NULL,
  apply_end DATE NOT NULL,
  announce_date DATE NULL,
  memo TEXT NULL,
  poster_path VARCHAR(255) NULL,
  UNIQUE (user_id, organizer, title),
  CHECK (apply_start IS NULL OR apply_start <= apply_end),
  INDEX (user_id, apply_end),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) CHARACTER SET utf8mb4;

-- 분야: 공모전 분야 이름을 한 곳에만 저장(오타·중복 방지)하는 고정 목록. seed.sql로 입력
CREATE TABLE fields (
  field_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(30) NOT NULL UNIQUE
) CHARACTER SET utf8mb4;

-- 공모전-분야 연결: 공모전 하나가 여러 분야, 분야 하나가 여러 공모전에 속하므로(N:M) 별도 테이블로 분리
CREATE TABLE contest_fields (
  contest_id INT NOT NULL,
  field_id INT NOT NULL,
  PRIMARY KEY (contest_id, field_id),
  FOREIGN KEY (contest_id) REFERENCES contests(contest_id) ON DELETE CASCADE,
  FOREIGN KEY (field_id) REFERENCES fields(field_id) ON DELETE CASCADE
) CHARACTER SET utf8mb4;

-- 시상: 공모전 하나에 등수·상금이 여러 개 있으므로(1:N) contests 컬럼으로 두지 않고 분리
CREATE TABLE prizes (
  prize_id INT AUTO_INCREMENT PRIMARY KEY,
  contest_id INT NOT NULL,
  rank_name VARCHAR(30) NOT NULL,
  amount BIGINT NULL,
  UNIQUE (contest_id, rank_name),
  FOREIGN KEY (contest_id) REFERENCES contests(contest_id) ON DELETE CASCADE
) CHARACTER SET utf8mb4;

-- 제출물: 공모전 하나에 파일을 여러 번 제출할 수 있어서(1:N) 분리. 버전(v1, v2)은 저장하지 않고 조회할 때 계산
CREATE TABLE submissions (
  submission_id INT AUTO_INCREMENT PRIMARY KEY,
  contest_id INT NOT NULL,
  file_name VARCHAR(255) NOT NULL,        -- 사용자가 올린 원래 파일명 (화면 표시, 다운로드 이름)
  file_path VARCHAR(255) NOT NULL UNIQUE, -- 서버에 저장한 고유 파일명
  note VARCHAR(200) NULL,
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contest_id) REFERENCES contests(contest_id) ON DELETE CASCADE
) CHARACTER SET utf8mb4;
