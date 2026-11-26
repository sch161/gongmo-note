// Express 4는 async 함수의 에러를 자동으로 잡지 못해서, 에러가 나면 500으로 응답하게 감싸 준다
module.exports = (fn) => (req, res) => {
    fn(req, res).catch((err) => {
        console.error(err);
        res.status(500).json({ error: '서버 오류가 났어요' });
    });
};