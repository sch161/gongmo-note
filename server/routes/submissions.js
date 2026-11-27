// 제출물 API: 공모전에 제출한 파일을 업로드·다운로드·메모수정·삭제함
// 파일 본체는 uploads/submissions 폴더에, 파일 정보는 DB submissions 표에 저장함

// 웹 서버 프레임워크 Express
const express = require('express');
// 파일 업로드(multipart)를 읽어 주는 모듈
const multer = require('multer');
// 경로를 OS에 맞게 합치는 내장 모듈
const path = require('path');
// 파일 삭제용 내장 모듈
const fs = require('fs');
// DB 연결 풀
const db = require('../db');
// 로그인 확인 미들웨어
const requireLogin = require('../middleware/auth');
// async 에러를 잡아 주는 도우미
const handle = require('../middleware/handle');
// 빈 문자열을 NULL로 바꾸는 함수
const { emptyToNull } = require('../validate');

// 이 파일의 주소들을 모아 두는 라우터
const router = express.Router();
// 모든 API 앞에 로그인 확인 (소유자 확인은 각 쿼리의 user_id 조건에서 함)
router.use(requireLogin);

// 제출 파일 저장 폴더 (다운로드·삭제에서도 쓰려고 상수로 둠)
const DIR = path.join(__dirname, '..', '..', 'uploads', 'submissions');
// 허용 확장자 목록. 막을 것보다 허용할 것을 적어야 빠뜨리지 않음 (.exe 등 실행 파일 차단)
const ALLOWED = ['.pdf', '.zip', '.doc', '.docx', '.hwp', '.hwpx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt', '.jpg', '.jpeg', '.png'];

// multer 설정: 파일을 디스크에 저장함 (제출물은 나중에 다시 받아야 해서 서버에 남겨야 함)
// 저장 이름을 서버가 새로 만드는 이유: 사용자 이름을 쓰면 같은 이름이 덮어써지고, ../ 로 다른 폴더에 저장될 수 있어서
// 원래 파일명은 DB(file_name)에 따로 적어 두고 다운로드 때 보여 줌
const upload = multer({
    // 디스크에 저장하는 방식
    storage: multer.diskStorage({
        destination: DIR,  // 저장할 폴더
        // 저장할 파일 이름을 만드는 함수
        filename: (req, file, cb) => {
            // 확장자만 소문자로 가져옴
            const ext = path.extname(file.originalname).toLowerCase();
            // '시간-난수.확장자'로 고유한 이름을 만듦
            cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
        },
    }),
    limits: { fileSize: 20 * 1024 * 1024 },  // 파일 크기 20MB 제한 (디스크 꽉 참 방지)
    // 허용 확장자가 아니면 파일을 안 받음 (에러 없이 req.file이 비게 됨)
    fileFilter: (req, file, cb) => {
        // 확장자가 허용 목록에 있는지 확인
        cb(null, ALLOWED.includes(path.extname(file.originalname).toLowerCase()));
    },
});

// uploadFile(req, res, next): multer 업로드를 실행하는 미들웨어. 성공하면 next(), 오류는 400 안내로 응답함
// 직접 감싸는 이유: 그대로 두면 500처럼 보이는데 사용자 잘못이라 이해하기 쉬운 400을 주려고
function uploadFile(req, res, next) {
    // 'file' 이름의 파일 한 개를 받음
    upload.single('file')(req, res, (err) => {
        // 업로드 중 오류가 있으면
        if (err) {
            // 용량 초과면 전용 안내, 그 외는 일반 안내
            const msg = err.code === 'LIMIT_FILE_SIZE' ? '파일은 20MB 이하만 올릴 수 있어요' : '파일 업로드에 실패했어요';
            // 400과 안내 메시지 응답
            return res.status(400).json({ error: msg });
        }
        // 오류가 없으면 다음 단계로 넘김
        next();
    });
}

// removeFile(filePath): 파일 하나를 지움 (이미 없어도 에러로 안 멈추게 콜백을 비움)
function removeFile(filePath) {
    // 파일 삭제 (결과는 무시)
    fs.unlink(filePath, () => { });
}

// fixName(name): 깨진 한글 파일명을 고쳐 반환함
// multer가 파일명을 latin1로 잘못 읽어 한글이 깨지는 경우가 있어서
function fixName(name) {
    // 0xff를 넘는 글자가 있으면 이미 한글이 제대로 들어온 것
    if (/[^\x00-\xff]/.test(name)) return name; // 이미 한글이 제대로 들어 있음
    // 깨진 글자의 바이트를 utf8로 다시 읽어 한글로 복원함
    return Buffer.from(name, 'latin1').toString('utf8');
}

// POST /api/contests/:id/submissions: 파일 업로드, 반환 {submission_id}
// uploadFile이 먼저 실행돼 파일이 이미 저장된 상태라서, 검사에 걸리면 그 파일을 직접 지워야 함
router.post('/contests/:id/submissions', uploadFile, handle(async (req, res) => {
    // multer가 저장한 파일 정보
    const file = req.file;
    // 파일이 없으면 (허용 안 된 형식 포함) 안내
    if (!file) {
        // 400과 안내 메시지 응답
        return res.status(400).json({ error: '파일을 선택해 주세요 (pdf, zip, 문서, 이미지만 가능해요)' });
    }

    // 메모: 글자로 바꿔 공백 지우고, 빈 값이면 null
    const note = emptyToNull(String(req.body.note || '').trim());
    // 메모가 200자를 넘으면 거절 (DB 컬럼 길이)
    if (note && note.length > 200) {
        // 이미 저장된 파일을 지움
        removeFile(file.path);
        // 400과 안내 메시지 응답
        return res.status(400).json({ error: '메모는 200자 이하로 써 주세요' });
    }

    // 쿼리: 이 공모전이 내 것인지 확인함 (소유자 확인)
    // SELECT contest_id: 있는지만 확인
    // FROM contests: 공모전 표에서
    // WHERE contest_id = ? AND user_id = ?: 번호가 같고 주인이 나인 행만
    // 로그인만 보면 남의 공모전에 올릴 수 있어서 확인, 값은 ?로 넘김
    const [owned] = await db.query(
        'SELECT contest_id FROM contests WHERE contest_id = ? AND user_id = ?',  // 실행할 쿼리
        [req.params.id, req.session.userId]                                      // ? 자리에 들어갈 값 (주소의 번호, 세션의 내 번호)
    );
    // 없거나 남의 공모전이면 404
    if (owned.length === 0) {
        // 이미 저장된 파일을 지움
        removeFile(file.path);
        // 404 응답
        return res.status(404).json({ error: '공모전을 찾을 수 없어요' });
    }

    // DB 저장 실패에 대비해 감쌈
    try {
        // 쿼리: 제출물 정보를 저장함
        // INSERT INTO submissions (...): 제출물 표의 컬럼 지정
        // VALUES (?, ?, ?, ?): 값 자리, 값은 따로 넘겨 SQL 인젝션 방지
        const [result] = await db.query(
            'INSERT INTO submissions (contest_id, file_name, file_path, note) VALUES (?, ?, ?, ?)',  // 실행할 쿼리
            [req.params.id, fixName(file.originalname).slice(0, 255), file.filename, note]           // ? 자리에 들어갈 값 (원래 이름은 255자로 자름, 저장 이름은 서버가 만든 것)
        );
        // 새로 만들어진 제출물 번호 응답
        res.json({ submission_id: result.insertId });
    // DB 저장이 실패한 경우
    } catch (err) {
        removeFile(file.path);  // DB 저장이 실패하면 파일도 지움
        // 에러는 위로 넘겨 handle이 500으로 처리
        throw err;
    }
}));

// GET /api/submissions/:id/download: 파일 다운로드 (내 공모전의 파일만)
// 경로는 요청값이 아니라 DB의 file_path만 씀 (../ 로 서버의 다른 파일을 받는 공격 방지)
router.get('/submissions/:id/download', handle(async (req, res) => {
    // 쿼리: 받을 파일 정보를 읽음 (내 파일만)
    // SELECT: 원래 이름과 서버 저장 이름
    // FROM submissions s: 제출물 표에서
    // JOIN contests c ON ...: 제출물엔 user_id가 없어 공모전과 이어 주인 확인
    // WHERE s.submission_id = ? AND c.user_id = ?: 번호가 같고 주인이 나인 행만 (값은 ?로 넘김)
    const [rows] = await db.query(
        `SELECT s.file_name, s.file_path
       FROM submissions s JOIN contests c ON c.contest_id = s.contest_id
      WHERE s.submission_id = ? AND c.user_id = ?`,
        [req.params.id, req.session.userId]  // ? 자리에 들어갈 값
    );
    // 없거나 남의 파일이면 404
    if (rows.length === 0) return res.status(404).json({ error: '파일을 찾을 수 없어요' });

    // 파일을 내려 줌 (두 번째 인자는 받을 때 보일 원래 이름)
    res.download(path.join(DIR, rows[0].file_path), rows[0].file_name, (err) => {
        // 파일이 디스크에 없어 실패하고 응답 전이면 404
        if (err && !res.headersSent) res.status(404).end();
    });
}));

// PUT /api/submissions/:id: 제출물 메모 수정, 반환 {ok: true}
router.put('/submissions/:id', handle(async (req, res) => {
    // 메모: 글자로 바꿔 공백 지우고, 빈 값이면 null
    const note = emptyToNull(String(req.body.note || '').trim());
    // 200자를 넘으면 거절 (DB 컬럼 길이)
    if (note && note.length > 200) return res.status(400).json({ error: '메모는 200자 이하로 써 주세요' });

    // 쿼리: 내 제출물 메모를 수정함
    // UPDATE submissions s: 제출물 표를 수정
    // JOIN contests c ON ...: 공모전과 이어 주인 확인
    // SET s.note: 메모 컬럼을 새 값으로
    // WHERE s.submission_id = ? AND c.user_id = ?: 번호가 같고 주인이 나인 행만 (값은 ?로 넘김)
    const [result] = await db.query(
        `UPDATE submissions s JOIN contests c ON c.contest_id = s.contest_id
        SET s.note = ?
      WHERE s.submission_id = ? AND c.user_id = ?`,
        [note, req.params.id, req.session.userId]  // ? 자리에 차례로 들어갈 값
    );
    // 바뀐 행이 없으면 없거나 남의 파일이라 404
    if (result.affectedRows === 0) return res.status(404).json({ error: '파일을 찾을 수 없어요' });
    // 수정 성공 응답
    res.json({ ok: true });
}));

// DELETE /api/submissions/:id: 제출물 삭제. 순서: 내 것 확인하며 파일 이름 읽기, DB 행 삭제, 디스크 파일 삭제
// DB를 먼저 지우는 이유: 파일을 먼저 지우면 DB 삭제 실패 시 "기록은 있는데 파일 없음" 상태가 되어서
router.delete('/submissions/:id', handle(async (req, res) => {
    // 쿼리: 지울 파일의 저장 이름을 읽음 (내 파일만)
    // SELECT s.file_path: 서버 저장 이름
    // FROM submissions s: 제출물 표에서
    // JOIN contests c ON ...: 공모전과 이어 주인 확인
    // WHERE s.submission_id = ? AND c.user_id = ?: 번호가 같고 주인이 나인 행만 (값은 ?로 넘김)
    const [rows] = await db.query(
        `SELECT s.file_path
       FROM submissions s JOIN contests c ON c.contest_id = s.contest_id
      WHERE s.submission_id = ? AND c.user_id = ?`,
        [req.params.id, req.session.userId]  // ? 자리에 들어갈 값
    );
    // 없거나 남의 파일이면 404
    if (rows.length === 0) return res.status(404).json({ error: '파일을 찾을 수 없어요' });

    // 쿼리: 제출물 행을 삭제함
    // DELETE FROM submissions: 제출물 표에서 지움
    // WHERE submission_id = ?: 해당 번호만 (값은 ?로 넘김)
    await db.query('DELETE FROM submissions WHERE submission_id = ?', [req.params.id]);
    // 디스크의 실제 파일도 지움
    removeFile(path.join(DIR, rows[0].file_path));
    // 삭제 성공 응답
    res.json({ ok: true });
}));

// 다른 파일에서 쓰도록 내보냄
module.exports = router;