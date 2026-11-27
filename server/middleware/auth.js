// 로그인 확인 미들웨어: 로그인 안 한 사람이 API를 못 쓰게 막는 문지기
// 라우터 앞에 붙여 씀 (예: router.use(requireLogin))

// requireLogin(req, res, next): 세션으로 로그인 여부를 확인함 (반환값 없음)
// 화면 버튼을 숨겨도 주소는 직접 호출할 수 있어서 서버에서 꼭 확인함
// 이건 "누구인지"만 확인하고, "내 것인지"는 각 쿼리의 user_id 조건으로 확인함
function requireLogin(req, res, next) {
    // 세션에 사용자번호가 없으면 로그인 안 한 상태
    if (!req.session.userId) {
        // 401(로그인 필요) 응답하고 여기서 끝냄
        return res.status(401).json({ error: '로그인이 필요해요' });
    }
    // 로그인했으면 다음 단계(실제 라우트 함수)로 넘김
    next();
}

// 다른 파일에서 쓰도록 내보냄
module.exports = requireLogin;