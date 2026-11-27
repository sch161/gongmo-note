// 내 정보 API: 이름·비밀번호 수정과 회원 탈퇴
// 대상은 항상 세션의 로그인한 본인 (요청값으로 남을 지정하지 못하게 함)

// 웹 서버 프레임워크 Express
const express = require('express');
// 비밀번호 해시·비교용 모듈
const bcrypt = require('bcrypt');
// 파일 삭제용 내장 모듈
const fs = require('fs');
// 경로를 OS에 맞게 합치는 내장 모듈
const path = require('path');
// DB 연결 풀
const db = require('../db');
// 로그인 확인 미들웨어
const requireLogin = require('../middleware/auth');

// 이 파일의 주소들을 모아 두는 라우터
const router = express.Router();
// 이 파일의 모든 API 앞에 로그인 확인을 붙임
router.use(requireLogin);

// PUT /api/me: 이름 수정, newPassword가 있으면 비밀번호도 수정 (이메일은 수정 불가), 반환 {ok: true}
router.put('/', async (req, res) => {
    // 요청 본문에서 이름·새 비밀번호를 꺼냄
    const { name, newPassword } = req.body;

    // 이름이 없거나 50자를 넘으면 거절
    if (!name || name.length > 50) {
        // 400과 안내 메시지 응답
        return res.status(400).json({ error: '이름은 1~50자로 입력해 주세요' });
    }

    // DB 작업 중 에러가 나도 서버가 안 죽게 감쌈
    try {
        // 새 비밀번호를 보냈을 때만 비밀번호도 바꿈
        if (newPassword) {
            // 8자 미만이면 거절
            if (newPassword.length < 8) {
                // 400과 안내 메시지 응답
                return res.status(400).json({ error: '비밀번호는 8자 이상이어야 해요' });
            }
            // 새 비밀번호도 원문이 아닌 bcrypt 해시로 저장함 (가입 때와 같은 이유)
            const hash = await bcrypt.hash(newPassword, 10);
            // 쿼리: 내 이름과 비밀번호 해시를 수정함
            // UPDATE users SET: 이름·해시 컬럼을 새 값으로 바꿈
            // WHERE user_id = ?: 세션의 내 번호인 행만 바뀜 (남의 계정 보호)
            // 값은 ?로 따로 넘겨 SQL 인젝션을 막음
            await db.query(
                'UPDATE users SET name = ?, password_hash = ? WHERE user_id = ?',  // 실행할 쿼리
                [name, hash, req.session.userId]                                   // ? 자리에 들어갈 값 (마지막은 세션의 내 번호)
            );
        } else {
            // 쿼리: 내 이름만 수정함
            // UPDATE users SET name = ?: 이름 컬럼만 새 값으로 바꿈
            // WHERE user_id = ?: 세션의 내 번호인 행만 (값은 ?로 넘김)
            await db.query('UPDATE users SET name = ? WHERE user_id = ?', [
                name,
                req.session.userId,
            ]);
        }
        // 수정 성공 응답
        res.json({ ok: true });
    // DB 에러를 여기서 처리함
    } catch (err) {
        // 원인은 터미널에만 남김
        console.error(err);
        // 사용자에게는 500과 짧은 안내만 보냄
        res.status(500).json({ error: '서버 오류가 났어요' });
    }
});

// DELETE /api/me: 회원 탈퇴. 순서: 비밀번호 확인, 파일 목록 기억, 사용자 삭제(CASCADE), 파일 삭제
// 비밀번호를 다시 확인하는 이유: 로그인된 컴퓨터를 남이 써도 계정이 안 지워지게 하려고
router.delete('/', async (req, res) => {
    // 요청 본문에서 비밀번호를 꺼냄
    const { password } = req.body;
    // 세션의 로그인한 사용자번호 (요청값을 안 믿음)
    const userId = req.session.userId;

    // DB 작업 중 에러가 나도 서버가 안 죽게 감쌈
    try {
        // 쿼리: 내 비밀번호 해시를 읽음 (탈퇴 확인용)
        // SELECT password_hash: 비교에 필요한 값만
        // FROM users: 회원 표에서
        // WHERE user_id = ?: 내 행만 (값은 ?로 넘김)
        const [users] = await db.query(
            'SELECT password_hash FROM users WHERE user_id = ?',  // 실행할 쿼리
            [userId]                                              // ? 자리에 들어갈 값
        );
        // 입력한 비밀번호를 해시와 비교함 (해시는 되돌릴 수 없어서 복호화 아닌 비교)
        const same = await bcrypt.compare(password || '', users[0].password_hash);
        // 비밀번호가 다르면 탈퇴 안 시키고 거절
        if (!same) {
            // 401(인증 실패) 응답
            return res.status(401).json({ error: '비밀번호가 올바르지 않아요' });
        }

        // 사용자를 지우면 CASCADE로 행이 사라져 파일 이름을 알 수 없게 됨
        // 그래서 지우기 전에 포스터·제출물 파일 이름을 먼저 읽어 둠
        // 쿼리: 내 포스터 파일 이름을 읽음 (지울 파일 목록)
        // SELECT poster_path: 저장된 파일 이름
        // FROM contests: 공모전 표에서
        // WHERE user_id = ?: 내 공모전만 (값은 ?로 넘김)
        // AND poster_path IS NOT NULL: 포스터가 있는 것만
        const [posters] = await db.query(
            'SELECT poster_path FROM contests WHERE user_id = ? AND poster_path IS NOT NULL',  // 실행할 쿼리
            [userId]                                                                           // ? 자리에 들어갈 값
        );
        // 쿼리: 내 제출물 파일 이름을 읽음 (지울 파일 목록)
        // SELECT s.file_path: 저장된 파일 이름
        // FROM submissions s: 제출물 표에서
        // JOIN contests c: 제출물엔 user_id가 없어 공모전과 연결해 주인 확인
        // ON c.contest_id = s.contest_id: 같은 공모전끼리 이음
        // WHERE c.user_id = ?: 내 공모전의 제출물만 (값은 ?로 넘김)
        const [files] = await db.query(
            `SELECT s.file_path
         FROM submissions s
         JOIN contests c ON c.contest_id = s.contest_id
        WHERE c.user_id = ?`,
            [userId]  // ? 자리에 들어갈 값
        );

        // 쿼리: 내 계정 삭제
        // DELETE FROM users: 회원 행을 지움
        // WHERE user_id = ?: 내 행만 (값은 ?로 넘김)
        // ON DELETE CASCADE가 내 공모전·분야 연결·시상·제출물 행도 자동 삭제
        await db.query('DELETE FROM users WHERE user_id = ?', [userId]);

        // 업로드 폴더 경로
        const uploads = path.join(__dirname, '..', '..', 'uploads');
        // DB 행은 CASCADE로 지워졌지만 디스크 파일은 남아서 직접 지움 (쓰레기 파일 방지)
        posters.forEach((p) => removeFile(path.join(uploads, 'posters', p.poster_path)));
        // 제출물 파일도 지움
        files.forEach((f) => removeFile(path.join(uploads, 'submissions', f.file_path)));

        // 탈퇴했으니 세션도 없애 로그아웃 상태로 만듦
        req.session.destroy(() => {
            // 탈퇴 성공 응답
            res.json({ ok: true });
        });
    // DB 에러를 여기서 처리함
    } catch (err) {
        // 원인은 터미널에만 남김
        console.error(err);
        // 사용자에게는 500과 짧은 안내만 보냄
        res.status(500).json({ error: '서버 오류가 났어요' });
    }
});

// removeFile(filePath): 파일 하나를 지움 (반환값 없음)
// 콜백을 비워 둔 이유: 파일이 이미 없어도 에러로 안 멈추게 하려고
function removeFile(filePath) {
    // 파일 삭제 (결과는 무시)
    fs.unlink(filePath, () => { });
}

// 다른 파일에서 쓰도록 내보냄
module.exports = router;