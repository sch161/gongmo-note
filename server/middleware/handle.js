// async 라우트에서 에러가 나면 500 JSON으로 응답해 주는 감싸기 함수 (Express 5는 자동 처리하지만, 에러 형식을 통일하려고 직접 감싼다)
module.exports = (fn) => (req, res) => {
    fn(req, res).catch((err) => {
        console.error(err);
        res.status(500).json({ error: '서버 오류가 났어요' });
    });
};