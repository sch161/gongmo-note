function requireLogin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: '로그인이 필요해요' });
    }
    next();
}

module.exports = requireLogin;