// 빈 문자열은 DB에 NULL로 저장한다
function emptyToNull(v) {
    return v === undefined || v === null || v === '' ? null : v;
}

// 시상 한 줄 검사: { rank_name, amount } 또는 { error }
function parsePrize(p) {
    const rank_name = String(p.rank_name || '').trim();
    if (!rank_name || rank_name.length > 30) {
        return { error: '등급은 1~30자로 입력해 주세요' };
    }
    const raw = emptyToNull(p.amount);
    let amount = null;
    if (raw !== null) {
        amount = Number(String(raw).replace(/,/g, ''));
        if (!Number.isInteger(amount) || amount < 0) {
            return { error: '상금은 0 이상의 숫자로 입력해 주세요' };
        }
    }
    return { rank_name, amount };
}

module.exports = { emptyToNull, parsePrize };