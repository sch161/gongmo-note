-- 공모노트 스키마: 6개 테이블 / 28컬럼 / 3NF·BCNF

-- 다시 실행해도 되도록 기존 테이블을 먼저 지움 (자식 테이블부터: FK 때문에 순서가 중요)
DROP TABLE IF EXISTS submissions;     -- 제출물 (contests를 참조하는 자식)
DROP TABLE IF EXISTS prizes;          -- 시상 (자식)
DROP TABLE IF EXISTS contest_fields;  -- 공모전-분야 연결 (자식)
DROP TABLE IF EXISTS fields;          -- 분야 (contest_fields가 참조하므로 그 뒤)
DROP TABLE IF EXISTS contests;        -- 공모전 (users를 참조하는 자식)
DROP TABLE IF EXISTS users;           -- 회원 (맨 마지막: 가장 위쪽 부모)

-- 회원: 공모전을 "누가" 관리하는지 구분하려고 필요 (로그인 정보)
CREATE TABLE users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,  -- 회원 번호. PK: 행을 구분, AUTO_INCREMENT: 번호 자동 부여
  name VARCHAR(50) NOT NULL,               -- 이름. NOT NULL: 비워 둘 수 없음
  email VARCHAR(255) NOT NULL UNIQUE,      -- 로그인 이메일. UNIQUE: 같은 이메일로 두 번 가입 못 하게 DB가 막음
  password_hash VARCHAR(255) NOT NULL      -- 비밀번호 원문이 아닌 bcrypt 해시 (유출돼도 원래 비밀번호를 알기 어렵게)
) CHARACTER SET utf8mb4;

-- 공모전: 사용자가 지원하려는 공모전 한 건의 기본 정보. 같은 사용자가 같은 공모전을 중복 등록 못 하게 UNIQUE
CREATE TABLE contests (
  contest_id INT AUTO_INCREMENT PRIMARY KEY,                         -- 공모전 번호 (PK, 자동 부여)
  user_id INT NOT NULL,                                              -- 주인 회원 번호. FK. "내 공모전만" 조회할 때 기준
  organizer VARCHAR(100) NOT NULL,                                   -- 주최기관 (필수)
  title VARCHAR(200) NOT NULL,                                       -- 공모전 이름 (필수)
  status ENUM('관심','준비중','제출완료','수상') NOT NULL DEFAULT '관심',         -- 상태. ENUM: 정해진 4가지 값만 저장 가능, DEFAULT: 안 정하면 '관심'
  apply_start DATE NULL,                                             -- 접수 시작일 (모를 수 있어 NULL 허용)
  apply_end DATE NOT NULL,                                           -- 접수 마감일 (필수: 마감 임박 정렬에 씀)
  announce_date DATE NULL,                                           -- 결과 발표일 (미정일 수 있어 NULL 허용)
  memo TEXT NULL,                                                    -- 내 메모 (길이를 예측하기 어려워 TEXT, 선택)
  poster_path VARCHAR(255) NULL,                                     -- 포스터 파일의 서버 저장 이름 (없으면 NULL)
  UNIQUE (user_id, organizer, title),                                -- 세 값의 조합이 같으면 중복: 같은 공모전 두 번 등록 방지
  CHECK (apply_start IS NULL OR apply_start <= apply_end),           -- 시작일이 마감일보다 늦은 잘못된 데이터를 DB가 마지막으로 막음
  INDEX (user_id, apply_end),                                        -- 인덱스(색인): "내 공모전을 마감일순" 조회를 빠르게 함
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE  -- FK: 없는 회원의 공모전은 못 만듦. ON DELETE CASCADE: 회원이 지워지면 공모전도 DB가 자동 삭제
) CHARACTER SET utf8mb4;

-- 분야: 공모전 분야 이름을 한 곳에만 저장(오타·중복 방지)하는 고정 목록. seed.sql로 입력
CREATE TABLE fields (
  field_id INT AUTO_INCREMENT PRIMARY KEY,  -- 분야 번호 (PK, 자동 부여)
  name VARCHAR(30) NOT NULL UNIQUE          -- 분야 이름. UNIQUE: 같은 이름 중복 방지
) CHARACTER SET utf8mb4;

-- 공모전-분야 연결: 공모전 하나가 여러 분야, 분야 하나가 여러 공모전에 속하므로(N:M) 별도 테이블로 분리
CREATE TABLE contest_fields (
  contest_id INT NOT NULL,                                                     -- 공모전 번호 (FK)
  field_id INT NOT NULL,                                                       -- 분야 번호 (FK)
  PRIMARY KEY (contest_id, field_id),                                          -- 두 컬럼 조합이 PK: 같은 공모전에 같은 분야를 두 번 연결 못 함
  FOREIGN KEY (contest_id) REFERENCES contests(contest_id) ON DELETE CASCADE,  -- 공모전이 지워지면 연결 행도 자동 삭제 (CASCADE)
  FOREIGN KEY (field_id) REFERENCES fields(field_id) ON DELETE CASCADE         -- 분야가 지워져도 연결 행이 자동 삭제 (CASCADE)
) CHARACTER SET utf8mb4;

-- 시상: 공모전 하나에 등수·상금이 여러 개 있으므로(1:N) contests 컬럼으로 두지 않고 분리
CREATE TABLE prizes (
  prize_id INT AUTO_INCREMENT PRIMARY KEY,                                    -- 시상 번호 (PK, 자동 부여)
  contest_id INT NOT NULL,                                                    -- 소속 공모전 번호 (FK)
  rank_name VARCHAR(30) NOT NULL,                                             -- 등급 이름 (대상, 우수상 등, 필수)
  amount BIGINT NULL,                                                         -- 상금(원). 큰 수라 BIGINT, NULL은 상금 미정/없음
  UNIQUE (contest_id, rank_name),                                             -- 한 공모전 안에서 같은 등급 이름 중복 방지
  FOREIGN KEY (contest_id) REFERENCES contests(contest_id) ON DELETE CASCADE  -- 공모전이 지워지면 시상도 자동 삭제 (CASCADE)
) CHARACTER SET utf8mb4;

-- 제출물: 공모전 하나에 파일을 여러 번 제출할 수 있어서(1:N) 분리. 버전(v1, v2)은 저장하지 않고 조회할 때 계산
CREATE TABLE submissions (
  submission_id INT AUTO_INCREMENT PRIMARY KEY,                               -- 제출물 번호 (PK, 자동 부여). 버전 계산의 기준 순서
  contest_id INT NOT NULL,                                                    -- 소속 공모전 번호 (FK)
  file_name VARCHAR(255) NOT NULL,                                            -- 사용자가 올린 원래 파일명 (화면 표시·다운로드 이름)
  file_path VARCHAR(255) NOT NULL UNIQUE,                                     -- 서버가 새로 만든 고유 파일명 (UNIQUE: 파일이 겹치지 않게)
  note VARCHAR(200) NULL,                                                     -- 제출 메모 (선택, 200자까지)
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,                   -- 제출 시각. DEFAULT: 저장되는 순간의 시간을 DB가 자동 기록
  FOREIGN KEY (contest_id) REFERENCES contests(contest_id) ON DELETE CASCADE  -- 공모전이 지워지면 제출물 기록도 자동 삭제 (디스크 파일은 서버 코드가 따로 지움)
) CHARACTER SET utf8mb4;
