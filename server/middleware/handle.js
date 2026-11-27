// Express 5는 async 에러를 자동 처리하지만, 에러 응답 형식을 통일하려고 직접 감쌈

// handle(fn): async 라우트 함수를 받아 에러를 잡아 주는 함수를 반환함
// 사용 예: router.get('/', handle(async (req, res) => {...}))
module.exports = (fn) => (req, res) => {
    // 원래 라우트를 실행하고, 에러가 나면 아래에서 잡음
    fn(req, res).catch((err) => {
        // 원인은 터미널에만 남김 (내부 정보가 밖으로 새면 안 됨)
        console.error(err);
        // 사용자에게는 500과 짧은 안내만 보냄
        res.status(500).json({ error: '서버 오류가 났어요' });
    });
};