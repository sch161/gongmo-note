-- 샘플 데이터: 화면 개발·시연용. 마감일은 실행한 날짜(CURDATE) 기준으로 계산한다.
-- schema.sql 직후 빈 테이블에 넣으므로 AUTO_INCREMENT id는 1부터 순서대로 부여된다.

-- 분야 6개 (고정 목록)
INSERT INTO fields (name) VALUES
  ('IT·SW'), ('데이터·AI'), ('디자인'), ('영상'), ('아이디어'), ('기타');

-- 샘플 사용자 (비밀번호 test1234 를 bcrypt로 해시한 값)
INSERT INTO users (name, email, password_hash) VALUES
  ('홍길동', 'gildong@example.com', '$2b$10$qXEWRHnjzVAyrkRUgQReC.vo8XybZSoEIIqLtKTKhv2Ogl6dS99Ci');

-- 샘플 공모전 6개 (홍길동 = user_id 1). 상태 4종, 마감일은 지난 것~먼 것까지 다양하게
INSERT INTO contests (user_id, organizer, title, status, apply_start, apply_end, announce_date, memo) VALUES
  (1, '예시기관 A', '전국 대학생 앱 개발 공모전',    '준비중',   CURDATE() - INTERVAL 10 DAY, CURDATE() + INTERVAL 3 DAY,  CURDATE() + INTERVAL 30 DAY, '팀원 구하는 중'),
  (1, '예시기관 B', '공공데이터 활용 AI 경진대회',   '관심',     NULL,                        CURDATE() + INTERVAL 14 DAY, CURDATE() + INTERVAL 45 DAY, NULL),
  (1, '예시기관 C', '청년 포스터 디자인 공모전',     '제출완료', CURDATE() - INTERVAL 20 DAY, CURDATE() - INTERVAL 2 DAY,  CURDATE() + INTERVAL 10 DAY, '마감 지남, 제출 완료'),
  (1, '예시기관 D', '숏폼 영상 콘텐츠 공모전',       '수상',     CURDATE() - INTERVAL 60 DAY, CURDATE() - INTERVAL 30 DAY, CURDATE() - INTERVAL 5 DAY,  '장려상 수상'),
  (1, '예시기관 E', '생활 속 아이디어 제안 공모전',  '관심',     CURDATE() + INTERVAL 5 DAY,  CURDATE() + INTERVAL 40 DAY, NULL,                        NULL),
  (1, '예시기관 F', '지역 문화 홍보 공모전',         '준비중',   CURDATE() - INTERVAL 3 DAY,  CURDATE() + INTERVAL 7 DAY,  CURDATE() + INTERVAL 25 DAY, '기획서 작성 중');

-- 공모전-분야 연결 (field_id: 1 IT·SW, 2 데이터·AI, 3 디자인, 4 영상, 5 아이디어, 6 기타)
INSERT INTO contest_fields (contest_id, field_id) VALUES
  (1, 1),
  (2, 2), (2, 1),
  (3, 3),
  (4, 4),
  (5, 5),
  (6, 6), (6, 4);

-- 시상 9개 (상금 NULL = 상금 미정/없음)
INSERT INTO prizes (contest_id, rank_name, amount) VALUES
  (1, '대상', 3000000),
  (1, '우수상', 1000000),
  (2, '대상', 5000000),
  (2, '최우수상', 2000000),
  (3, '대상', 1000000),
  (4, '대상', 2000000),
  (4, '장려상', 300000),
  (5, '대상', NULL),
  (6, '대상', 1500000);

-- 제출물 3개 (공모전 3번에 2개, 4번에 1개). file_path는 임시 값
INSERT INTO submissions (contest_id, file_name, file_path, note) VALUES
  (3, '포스터_초안.pdf', 'sample-1.pdf', '첫 제출'),
  (3, '포스터_최종.pdf', 'sample-2.pdf', '수정본'),
  (4, '숏폼_기획서.pdf', 'sample-3.pdf', NULL);
