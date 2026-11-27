// 여러 라우터가 같이 쓰는 입력값 정리·검사 함수 모음
// 같은 검사를 여러 곳에 복붙하지 않으려고 한 파일로 모음

// emptyToNull(v): 값이 없거나 빈 문자열이면 null, 아니면 그대로 반환
// (날짜 컬럼에 '' 를 넣으면 DB 에러라서 "값 없음"은 NULL로 저장)
function emptyToNull(v) {
    // 없음/빈 문자열이면 null, 아니면 원래 값
    return v === undefined || v === null || v === '' ? null : v;
}

// parsePrize(p): 시상 한 줄 {rank_name, amount}을 검사·정리함
// 반환: 정상이면 {rank_name, amount}, 문제면 {error: 메시지}
// 서버는 직접 만든 요청도 받으므로 프론트 검사와 별개로 다시 검사함
function parsePrize(p) {
    // 등급 이름: 글자로 바꾸고 앞뒤 공백 제거
    const rank_name = String(p.rank_name || '').trim();
    // 비었거나 30자를 넘으면 거절 (DB 컬럼이 30자)
    if (!rank_name || rank_name.length > 30) {
        // 안내 메시지와 함께 바로 끝냄
        return { error: '등급은 1~30자로 입력해 주세요' };
    }
    // 상금 입력값 (빈 값이면 null)
    const raw = emptyToNull(p.amount);
    // 상금: 기본은 null (상금 없음/미정)
    let amount = null;
    // 상금을 입력했을 때만 검사함
    if (raw !== null) {
        // '1,000,000'처럼 쉼표가 있어도 받으려고 쉼표 지우고 숫자로 바꿈
        amount = Number(String(raw).replace(/,/g, ''));
        // 정수가 아니거나 음수면 거절
        if (!Number.isInteger(amount) || amount < 0) {
            // 안내 메시지와 함께 바로 끝냄
            return { error: '상금은 0 이상의 숫자로 입력해 주세요' };
        }
    }
    // 검사 통과: 정리한 값 반환
    return { rank_name, amount };
}

// 다른 파일에서 쓸 두 함수를 내보냄
module.exports = { emptyToNull, parsePrize };