// 공모전 API: 공모전 목록·상세·등록·수정·삭제와 포스터 AI 추출
// 모든 API에 로그인 확인과 user_id 조건을 걸어 내 공모전만 다룸

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
// 빈 값 NULL 변환 함수, 시상 한 줄 검사 함수
const { emptyToNull, parsePrize } = require('../validate');
// 포스터를 AI로 읽는 함수
const { extractContestFromPoster } = require('../services/ai');

// 이 파일의 주소들을 모아 두는 라우터
const router = express.Router();
// 이 파일의 모든 API 앞에 로그인 확인을 붙임
router.use(requireLogin);

// 업로드 파일 최상위 폴더 (포스터는 posters 하위 폴더)
const UPLOADS = path.join(__dirname, '..', '..', 'uploads');
// 허용 상태 값 (DB ENUM과 같은 목록, 서버에서도 한 번 더 검사)
const STATUSES = ['관심', '준비중', '제출완료', '수상'];

// multer 설정: 포스터는 화면에 계속 보여 줘야 해서 디스크에 저장함
// 파일 이름을 서버가 새로 만드는 이유: 사용자 이름을 쓰면 같은 이름이 덮어써지고, ../ 로 다른 폴더에 저장될 수 있어서
// DB에는 서버가 만든 이름(poster_path)만 저장함
const upload = multer({
    storage: multer.diskStorage({                    // 디스크에 저장하는 방식
        destination: path.join(UPLOADS, 'posters'),  // 저장할 폴더 (uploads/posters)
        // 저장할 파일 이름을 만드는 함수
        filename: (req, file, cb) => {
            // 확장자만 소문자로 가져옴
            const ext = path.extname(file.originalname).toLowerCase();
            // '시간-난수.확장자'로 겹치지 않는 고유한 이름을 만듦
            cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
        },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },                                       // 파일 크기 10MB 제한 (디스크 꽉 참 방지)
    fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/')),  // 이미지가 아니면 안 받음 (에러 없이 req.file이 비게 됨)
});

// uploadPoster(req, res, next): 포스터 업로드 미들웨어. 성공하면 next(), 오류는 400 안내로 응답함
// 직접 감싸는 이유: 그대로 두면 500처럼 보이는데 사용자 잘못이라 이해하기 쉬운 400을 주려고
function uploadPoster(req, res, next) {
    // 'poster' 이름의 파일 한 개를 받음
    upload.single('poster')(req, res, (err) => {
        // 업로드 중 오류가 있으면
        if (err) {
            // 용량 초과면 전용 안내, 그 외는 일반 안내
            const msg = err.code === 'LIMIT_FILE_SIZE'
                ? '포스터 파일은 10MB 이하만 올릴 수 있어요'  // 용량 초과 안내
                : '파일 업로드에 실패했어요';             // 그 외 실패 안내
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

// AI 추출용 multer 설정: 메모리에만 잠깐 둠 (AI에 보내고 버릴 파일이라 디스크에 쓰면 지울 파일만 늘어서)
const memoryUpload = multer({
    storage: multer.memoryStorage(),                                              // 디스크 대신 메모리(buffer)에 보관
    limits: { fileSize: 10 * 1024 * 1024 },                                       // 파일 크기 10MB 제한
    fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/')),  // 이미지가 아니면 안 받음
});

// uploadForAi(req, res, next): AI 추출용 업로드 미들웨어. uploadPoster와 같은 방식으로 오류를 400 안내로 바꿈
function uploadForAi(req, res, next) {
    // 'poster' 이름의 파일 한 개를 받음
    memoryUpload.single('poster')(req, res, (err) => {
        // 업로드 중 오류가 있으면
        if (err) {
            // 용량 초과면 전용 안내, 그 외는 일반 안내
            const msg = err.code === 'LIMIT_FILE_SIZE' ? '포스터 파일은 10MB 이하만 올릴 수 있어요' : '파일 업로드에 실패했어요';
            // 400과 안내 메시지 응답
            return res.status(400).json({ error: msg });
        }
        // 오류가 없으면 다음 단계로 넘김
        next();
    });
}

// GET /api/contests: 내 공모전 목록. 쿼리스트링으로 제목 검색(q), 분야 필터(field)를 받음, 반환은 목록 배열
router.get('/', handle(async (req, res) => {
    // 주소 뒤 ?q=...&field=... 값을 꺼냄
    const { q, field } = req.query;
    // params: SQL의 ? 자리에 들어갈 값 목록. 값을 SQL 문장에 직접 안 붙이고 ?로 따로 넘기는 이유는 SQL 인젝션 방지
    // 첫 값은 요청값이 아닌 세션의 로그인한 사람 번호 (내 것만 조회)
    const params = [req.session.userId];
    // 쿼리: 내 공모전 목록 (분야 이름은 한 칸에 합쳐서)
    // SELECT: 목록에 필요한 컬럼, GROUP_CONCAT은 분야 이름을 'IT·SW, 데이터·AI'처럼 한 칸으로 합침
    // FROM contests c: 공모전 표에서
    // LEFT JOIN contest_fields cf: 연결 표를 붙임, 분야 없는 공모전도 목록에서 안 사라지게 LEFT
    // LEFT JOIN fields f: 분야 이름을 가져오려고 붙임
    // WHERE c.user_id = ?: 내 공모전만 (소유자 확인)
    // 아래 if문이 조건을 이어 붙이고, 끝에 GROUP BY·ORDER BY를 붙임
    let sql = `
    SELECT c.contest_id, c.title, c.organizer, c.status, c.apply_end,
           GROUP_CONCAT(f.name ORDER BY f.field_id SEPARATOR ', ') AS fields
      FROM contests c
      LEFT JOIN contest_fields cf ON cf.contest_id = c.contest_id
      LEFT JOIN fields f ON f.field_id = cf.field_id
     WHERE c.user_id = ?`;
    // 검색어가 있을 때만 제목 조건을 붙임
    if (q) {
        // LIKE: 제목 어디에든 검색어가 들어 있으면 일치 (값은 ?로 넘김)
        sql += ' AND c.title LIKE ?';
        // 검색어 앞뒤에 %를 붙여 ? 자리 값으로 추가
        params.push('%' + q + '%');
    }
    // 분야를 골랐을 때만 분야 조건을 붙임
    if (field) {
        // IN (SELECT ...): 그 분야에 연결된 공모전 번호에 속한 것만 (JOIN으로 거르면 합친 분야 이름에 고른 분야만 남아서 IN을 씀)
        sql += ' AND c.contest_id IN (SELECT contest_id FROM contest_fields WHERE field_id = ?)';
        // 고른 분야 번호를 ? 자리 값으로 추가
        params.push(field);
    }
    // 쿼리 끝: GROUP BY c.contest_id: 공모전 하나당 한 줄로 묶음
    // ORDER BY (c.apply_end < CURDATE()): 마감 지났으면 1이라 뒤로 감
    // 그다음 c.apply_end: 마감 가까운 순
    sql += ' GROUP BY c.contest_id ORDER BY (c.apply_end < CURDATE()), c.apply_end';

    // 완성된 쿼리를 params와 함께 실행함
    const [rows] = await db.query(sql, params);
    // 목록 응답
    res.json(rows);
}));

// GET /api/contests/:id/poster: 포스터 이미지를 내려 줌 (내 공모전만)
router.get('/:id/poster', handle(async (req, res) => {
    // 쿼리: 내 공모전의 포스터 파일 이름
    // SELECT poster_path: 서버 저장 이름
    // FROM contests: 공모전 표에서
    // WHERE contest_id = ? AND user_id = ?: 번호가 같고 주인이 나인 행만 (소유자 확인, 값은 ?로 넘김)
    const [rows] = await db.query(
        'SELECT poster_path FROM contests WHERE contest_id = ? AND user_id = ?',  // 실행할 쿼리
        [req.params.id, req.session.userId]                                       // ? 자리에 들어갈 값
    );
    // 내 공모전이 아니거나 포스터가 없으면 404
    if (rows.length === 0 || !rows[0].poster_path) return res.status(404).end();
    // DB에 저장된 파일 이름만 써서 포스터를 보냄 (요청값으로 경로를 안 만듦)
    res.sendFile(path.join(UPLOADS, 'posters', rows[0].poster_path));
}));

// GET /api/contests/:id: 상세. 공모전 + 분야 + 시상 + 제출물을 모아 반환 (버전은 저장하지 않고 계산)
router.get('/:id', handle(async (req, res) => {
    // 주소의 공모전 번호
    const id = req.params.id;
    // 쿼리: 내 공모전 한 건
    // SELECT: 상세 화면에 필요한 컬럼
    // FROM contests: 공모전 표에서
    // WHERE contest_id = ? AND user_id = ?: 번호가 같고 주인이 나인 행만 (소유자 확인, 값은 ?로 넘김)
    const [rows] = await db.query(
        `SELECT contest_id, organizer, title, status, apply_start, apply_end,
            announce_date, memo, poster_path
       FROM contests WHERE contest_id = ? AND user_id = ?`,
        [id, req.session.userId]  // ? 자리에 들어갈 값
    );
    // 없거나 남의 공모전이면 404
    if (rows.length === 0) return res.status(404).json({ error: '공모전을 찾을 수 없어요' });
    // 찾은 공모전 한 건
    const contest = rows[0];

    // 쿼리: 이 공모전의 분야 목록
    // SELECT f.field_id, f.name: 분야 번호와 이름
    // FROM contest_fields cf: 연결 표에서
    // JOIN fields f: 분야 표와 이어 이름을 가져옴 (분야 번호가 같은 것끼리)
    // WHERE cf.contest_id = ?: 이 공모전에 연결된 것만
    // ORDER BY f.field_id: 분야 번호순
    const [fields] = await db.query(
        `SELECT f.field_id, f.name
       FROM contest_fields cf JOIN fields f ON f.field_id = cf.field_id
      WHERE cf.contest_id = ? ORDER BY f.field_id`,
        [id]  // ? 자리에 들어갈 값
    );
    // 쿼리: 이 공모전의 시상 목록
    // SELECT: 시상 번호, 등급, 상금
    // FROM prizes: 시상 표에서
    // WHERE contest_id = ?: 이 공모전 것만
    // ORDER BY prize_id: 등록한 순서
    const [prizes] = await db.query(
        'SELECT prize_id, rank_name, amount FROM prizes WHERE contest_id = ? ORDER BY prize_id',  // 실행할 쿼리
        [id]                                                                                      // ? 자리에 들어갈 값
    );
    // 쿼리: 이 공모전의 제출물 목록 (최신순) + 버전 번호
    // SELECT: 제출물 컬럼과 버전, ROW_NUMBER() OVER (...): 줄마다 1, 2, 3 ... 번호를 매김
    // PARTITION BY contest_id: 공모전별로 따로 번호를 매김
    // ORDER BY submission_id: 먼저 올린 것이 1번
    // CONCAT('v', 번호): 'v1', 'v2'로 만듦, 저장 안 하고 조회 때 계산하면 삭제해도 번호를 안 고쳐도 됨
    // FROM submissions: 제출물 표에서
    // WHERE contest_id = ?: 이 공모전 것만
    // ORDER BY submission_id DESC: 화면에는 최신 제출물이 위로
    const [submissions] = await db.query(
        `SELECT submission_id, file_name, note, submitted_at,
            CONCAT('v', ROW_NUMBER() OVER (PARTITION BY contest_id ORDER BY submission_id)) AS version
       FROM submissions WHERE contest_id = ?
      ORDER BY submission_id DESC`,
        [id]  // ? 자리에 들어갈 값
    );

    // 공모전 + 분야 + 시상 + 제출물을 한 객체로 응답
    res.json({ ...contest, fields, prizes, submissions });
}));

// POST /api/contests/extract: 포스터를 AI로 읽어 정보를 돌려줌
// DB에 저장하지 않는 이유: AI가 날짜·상금을 잘못 읽을 수 있어서, 사용자가 확인하고 고친 뒤 등록 API로 저장하게 하려고
router.post('/extract', uploadForAi, handle(async (req, res) => {
    // 파일이 없으면 안내 (이미지가 아니면 multer가 걸러서 없음)
    if (!req.file) {
        // 400과 안내 메시지 응답
        return res.status(400).json({ error: '이미지 파일을 선택해 주세요 (jpg, png 등)' });
    }

    // AI가 고를 수 있는 분야 이름 목록을 DB에서 읽음 (없는 분야를 지어내지 않게)
    // 쿼리: 분야 이름 목록
    // SELECT name: 분야 이름
    // FROM fields: 분야 표에서
    // ORDER BY field_id: 번호순 (사용자 입력이 없어 ?가 필요 없음)
    const [fields] = await db.query('SELECT name FROM fields ORDER BY field_id');
    // 이름만 뽑은 배열
    const fieldNames = fields.map((f) => f.name);

    // AI 호출은 실패할 수 있어서 감쌈
    try {
        // 메모리의 이미지를 AI에 보내 정리된 결과를 받음
        const data = await extractContestFromPoster(req.file.buffer, req.file.mimetype, fieldNames);
        // 결과 응답 (아직 저장 안 함)
        res.json(data);
    // AI 실패 처리
    } catch (err) {
        console.error(err);  // 원인은 터미널에서 확인
        // AI가 실패해도 직접 입력할 수 있으니 502와 안내만 보냄
        res.status(502).json({ error: 'AI가 포스터를 읽지 못했어요. 직접 입력해 주세요.' });
    }
}));

// POST /api/contests: 공모전 등록, 반환 {contest_id}
// contests, contest_fields, prizes를 한 트랜잭션으로 저장함
router.post('/', uploadPoster, handle(async (req, res) => {
    // 폼으로 받은 글자 값들
    const b = req.body;
    // multer가 저장한 포스터의 서버 파일 이름 (없으면 null)
    const posterName = req.file ? req.file.filename : null;
    // fail(code, msg): 에러 응답 도우미. 보내기 전에 이미 저장된 포스터 파일을 지움
    // multer가 먼저 파일을 저장해 둬서, 검사에서 걸려 등록이 안 되면 파일만 남기 때문
    const fail = (code, msg) => {
        // 포스터가 있으면 지움
        if (posterName) removeFile(path.join(UPLOADS, 'posters', posterName));
        // 상태 코드와 안내 메시지 응답
        return res.status(code).json({ error: msg });
    };

    // 필수값이 비었으면 거절 (서버도 직접 만든 요청을 받아서 다시 검사)
    if (!b.title || !b.organizer || !b.apply_end) {
        // 안내와 함께 끝냄
        return fail(400, '공모전명, 주최기관, 접수 마감일은 꼭 입력해 주세요');
    }
    // 제목이 200자를 넘으면 거절 (DB 컬럼 크기)
    if (b.title.length > 200) return fail(400, '공모전명은 200자 이하로 입력해 주세요');
    // 주최기관이 100자를 넘으면 거절 (DB 컬럼 크기)
    if (b.organizer.length > 100) return fail(400, '주최기관은 100자 이하로 입력해 주세요');
    // 상태: 안 보내면 기본 '관심'
    const status = b.status || '관심';
    // 허용 목록에 없는 상태면 거절
    if (!STATUSES.includes(status)) return fail(400, '상태가 올바르지 않아요');
    // 시작일이 마감일보다 늦으면 거절
    if (b.apply_start && b.apply_start > b.apply_end) {
        // 안내와 함께 끝냄
        return fail(400, '접수 시작일이 마감일보다 늦어요');
    }

    // 분야 번호 목록과 시상 목록 (아래에서 채움)
    let fieldIds, prizes;
    // 글자로 온 JSON을 풀다가 형식이 이상하면 실패하므로 감쌈
    try {
        // 분야 번호 배열 (multipart는 배열을 못 보내서 JSON 글자로 받음)
        fieldIds = JSON.parse(b.field_ids || '[]').map(Number);
        // 시상 배열: 한 줄씩 검사·정리함
        prizes = JSON.parse(b.prizes || '[]').map(parsePrize);
    // JSON 형식이 이상하면
    } catch (e) {
        // 400과 안내로 끝냄
        return fail(400, '잘못된 요청이에요');
    }
    // 시상 중 검사에 걸린 줄을 찾음
    const bad = prizes.find((p) => p.error);
    // 있으면 그 안내 메시지로 거절
    if (bad) return fail(400, bad.error);

    // 트랜잭션을 쓰는 이유: 세 번의 INSERT 중 하나만 실패해도 일부만 저장된 상태가 되므로, 전부 성공하거나 전부 취소되게 묶으려고
    // getConnection: 트랜잭션은 같은 연결에서만 이어져서 풀에서 연결 하나를 직접 빌림
    const conn = await db.getConnection();
    // 중간에 실패하면 rollback하려고 감쌈
    try {
        // 여기부터 commit 전까지의 변경은 임시임
        await conn.beginTransaction();

        // 쿼리: 공모전 한 건 저장
        // INSERT INTO contests (...): 공모전 표의 컬럼 지정
        // VALUES (?, ...): 값 자리, 값은 따로 넘겨 SQL 인젝션 방지
        // user_id는 요청값이 아닌 세션 값 (남의 이름으로 등록 방지)
        const [result] = await conn.query(
            `INSERT INTO contests
         (user_id, organizer, title, status, apply_start, apply_end, announce_date, memo, poster_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.session.userId, b.organizer, b.title, status,                       // 주인(세션), 주최, 제목, 상태
                emptyToNull(b.apply_start), b.apply_end, emptyToNull(b.announce_date),  // 시작일, 마감일, 발표일 (빈 값은 NULL)
                emptyToNull(b.memo), posterName,                                        // 메모 (빈 값은 NULL), 포스터 파일 이름
            ]
        );
        // DB가 방금 자동으로 부여한 공모전 번호
        const contestId = result.insertId;

        // 분야마다 연결 표에 한 줄씩 저장
        for (const fieldId of fieldIds) {
            // 쿼리: 공모전-분야 연결 저장 (INSERT INTO contest_fields: 연결 표, VALUES (?, ?): 값은 따로 넘김)
            await conn.query('INSERT INTO contest_fields (contest_id, field_id) VALUES (?, ?)', [contestId, fieldId]);
        }
        // 시상마다 한 줄씩 저장
        for (const p of prizes) {
            // 쿼리: 시상 저장 (INSERT INTO prizes: 시상 표, VALUES (?, ?, ?): 값은 따로 넘김)
            await conn.query('INSERT INTO prizes (contest_id, rank_name, amount) VALUES (?, ?, ?)', [contestId, p.rank_name, p.amount]);
        }

        // 모두 성공했으니 변경을 확정함
        await conn.commit();
        // 새 공모전 번호 응답
        res.json({ contest_id: contestId });
    // 하나라도 실패하면 아래에서 전부 취소함
    } catch (err) {
        await conn.rollback();  // 하나라도 실패하면 전부 취소 (반쪽 데이터 방지)
        // 등록 실패했으니 저장된 포스터도 지움
        if (posterName) removeFile(path.join(UPLOADS, 'posters', posterName));
        // DB의 UNIQUE 위반(같은 공모전 중복, 같은 등급 중복)이면 409 안내
        if (err.code === 'ER_DUP_ENTRY') {
            // 409(충돌)와 안내 메시지 응답
            return res.status(409).json({ error: '이미 등록한 공모전이거나, 같은 등급이 두 번 들어 있어요' });
        }
        // 그 외 에러는 위로 넘겨 handle이 500으로 처리
        throw err;
    } finally {
        // 성공·실패 모두 빌린 연결을 풀에 반납함 (안 하면 연결이 줄어 서버가 멈춤)
        conn.release();
    }
}));

// PUT /api/contests/:id: 상태와 메모만 수정, 반환 {ok: true}
router.put('/:id', handle(async (req, res) => {
    // 요청 본문에서 상태·메모를 꺼냄
    const { status, memo } = req.body;
    // 허용 목록에 없는 상태면 거절
    if (!STATUSES.includes(status)) return res.status(400).json({ error: '상태가 올바르지 않아요' });

    // 쿼리: 내 공모전의 상태·메모 수정
    // UPDATE contests SET: 상태와 메모 컬럼을 새 값으로 바꿈
    // WHERE contest_id = ? AND user_id = ?: 번호가 같고 주인이 나인 행만 (소유자 확인, 값은 ?로 넘김)
    const [result] = await db.query(
        'UPDATE contests SET status = ?, memo = ? WHERE contest_id = ? AND user_id = ?',  // 실행할 쿼리
        [status, emptyToNull(memo), req.params.id, req.session.userId]                    // ? 자리에 들어갈 값 (빈 메모는 NULL)
    );
    // 바뀐 행이 없으면 없거나 남의 공모전이라 404
    if (result.affectedRows === 0) return res.status(404).json({ error: '공모전을 찾을 수 없어요' });
    // 수정 성공 응답
    res.json({ ok: true });
}));

// DELETE /api/contests/:id: 공모전 삭제. 순서: 내 것 확인하며 포스터 이름 읽기, 제출물 파일 이름 읽기, DB 삭제, 파일 삭제
// DB 행은 CASCADE로 같이 지워지고, 파일은 직접 지움 (지우기 전에 이름을 읽어 둬야 함)
router.delete('/:id', handle(async (req, res) => {
    // 주소의 공모전 번호
    const id = req.params.id;
    // 쿼리: 내 공모전의 포스터 파일 이름 (소유자 확인 겸용)
    // SELECT poster_path: 서버 저장 이름
    // FROM contests: 공모전 표에서
    // WHERE contest_id = ? AND user_id = ?: 번호가 같고 주인이 나인 행만 (값은 ?로 넘김)
    const [rows] = await db.query(
        'SELECT poster_path FROM contests WHERE contest_id = ? AND user_id = ?',  // 실행할 쿼리
        [id, req.session.userId]                                                  // ? 자리에 들어갈 값
    );
    // 없거나 남의 공모전이면 404
    if (rows.length === 0) return res.status(404).json({ error: '공모전을 찾을 수 없어요' });

    // 쿼리: 이 공모전의 제출물 파일 이름 (지울 파일 목록)
    // SELECT file_path: 서버 저장 이름
    // FROM submissions: 제출물 표에서
    // WHERE contest_id = ?: 이 공모전 것만 (값은 ?로 넘김, 위에서 내 것임을 확인함)
    const [files] = await db.query('SELECT file_path FROM submissions WHERE contest_id = ?', [id]);

    // 쿼리: 공모전 삭제
    // DELETE FROM contests: 공모전 행을 지움
    // WHERE contest_id = ?: 해당 번호만
    // ON DELETE CASCADE가 분야 연결·시상·제출물 행도 자동으로 지움
    await db.query('DELETE FROM contests WHERE contest_id = ?', [id]);

    // 포스터 파일이 있으면 지움
    if (rows[0].poster_path) removeFile(path.join(UPLOADS, 'posters', rows[0].poster_path));
    // 제출물 파일도 하나씩 지움
    files.forEach((f) => removeFile(path.join(UPLOADS, 'submissions', f.file_path)));

    // 삭제 성공 응답
    res.json({ ok: true });
}));

// 다른 파일에서 쓰도록 내보냄
module.exports = router;