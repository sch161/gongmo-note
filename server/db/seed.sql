-- 샘플 데이터: 화면 개발·시연용. 마감일은 실행한 날짜(CURDATE) 기준으로 계산함
-- schema.sql 직후 빈 테이블에 넣으므로 AUTO_INCREMENT id는 1부터 순서대로 부여됨

-- 분야 6개 (고정 목록)
INSERT INTO fields (name) VALUES
  ('IT·SW'), ('데이터·AI'), ('디자인'), ('영상'), ('아이디어'), ('기타');

-- 샘플 사용자 (비밀번호 test1234를 bcrypt로 해시한 값: 원문 대신 해시를 넣어 실제 가입·로그인과 똑같이 동작)
INSERT INTO users (name, email, password_hash) VALUES
  ('홍길동', 'gildong@example.com', '$2b$10$qXEWRHnjzVAyrkRUgQReC.vo8XybZSoEIIqLtKTKhv2Ogl6dS99Ci');  -- 이름, 이메일, 비밀번호 해시 ($2b$10$ = bcrypt, 반복 10)

-- 샘플 공모전 6개 (홍길동 = user_id 1). 상태 4종, 마감일은 지난 것~먼 것까지 다양하게. CURDATE() = 오늘, INTERVAL n DAY = n일
INSERT INTO contests (user_id, organizer, title, status, apply_start, apply_end, announce_date, memo) VALUES
  (1, '예시기관 A', '전국 대학생 앱 개발 공모전',    '준비중',   CURDATE() - INTERVAL 10 DAY, CURDATE() + INTERVAL 3 DAY,  CURDATE() + INTERVAL 30 DAY, '팀원 구하는 중'),     -- 준비중, 3일 뒤 마감
  (1, '예시기관 B', '공공데이터 활용 AI 경진대회',   '관심',     NULL,                        CURDATE() + INTERVAL 14 DAY, CURDATE() + INTERVAL 45 DAY, NULL),          -- 관심, 시작일 없음(NULL)
  (1, '예시기관 C', '청년 포스터 디자인 공모전',     '제출완료', CURDATE() - INTERVAL 20 DAY, CURDATE() - INTERVAL 2 DAY,  CURDATE() + INTERVAL 10 DAY, '마감 지남, 제출 완료'),  -- 제출완료, 이미 마감
  (1, '예시기관 D', '숏폼 영상 콘텐츠 공모전',       '수상',     CURDATE() - INTERVAL 60 DAY, CURDATE() - INTERVAL 30 DAY, CURDATE() - INTERVAL 5 DAY,  '장려상 수상'),     -- 수상, 발표까지 끝남
  (1, '예시기관 E', '생활 속 아이디어 제안 공모전',  '관심',     CURDATE() + INTERVAL 5 DAY,  CURDATE() + INTERVAL 40 DAY, NULL,                        NULL),           -- 관심, 아직 접수 전, 발표일 미정
  (1, '예시기관 F', '지역 문화 홍보 공모전',         '준비중',   CURDATE() - INTERVAL 3 DAY,  CURDATE() + INTERVAL 7 DAY,  CURDATE() + INTERVAL 25 DAY, '기획서 작성 중');   -- 준비중, 7일 뒤 마감

-- 공모전-분야 연결 (field_id: 1 IT·SW, 2 데이터·AI, 3 디자인, 4 영상, 5 아이디어, 6 기타)
INSERT INTO contest_fields (contest_id, field_id) VALUES
  (1, 1),          -- 공모전 1: IT·SW
  (2, 2), (2, 1),  -- 공모전 2: 데이터·AI + IT·SW (N:M 예시)
  (3, 3),          -- 공모전 3: 디자인
  (4, 4),          -- 공모전 4: 영상
  (5, 5),          -- 공모전 5: 아이디어
  (6, 6), (6, 4);  -- 공모전 6: 기타 + 영상

-- 시상 9개 (상금 NULL = 상금 미정/없음)
INSERT INTO prizes (contest_id, rank_name, amount) VALUES
  (1, '대상', 3000000),    -- 공모전 1 대상
  (1, '우수상', 1000000),   -- 공모전 1 우수상
  (2, '대상', 5000000),    -- 공모전 2 대상
  (2, '최우수상', 2000000),  -- 공모전 2 최우수상
  (3, '대상', 1000000),    -- 공모전 3 대상
  (4, '대상', 2000000),    -- 공모전 4 대상
  (4, '장려상', 300000),    -- 공모전 4 장려상
  (5, '대상', NULL),       -- 공모전 5 대상 (상금 미정)
  (6, '대상', 1500000);    -- 공모전 6 대상

-- 제출물 3개 (공모전 3번에 2개, 4번에 1개). file_path는 seed-files의 샘플 파일 이름 (init-db.js가 uploads로 복사)
INSERT INTO submissions (contest_id, file_name, file_path, note) VALUES
  (3, '포스터_초안.pdf', 'sample-1.pdf', '첫 제출'),  -- 공모전 3의 첫 제출 (v1)
  (3, '포스터_최종.pdf', 'sample-2.pdf', '수정본'),   -- 공모전 3의 두 번째 제출 (v2)
  (4, '숏폼_기획서.pdf', 'sample-3.pdf', NULL);    -- 공모전 4의 제출 (메모 없음)
