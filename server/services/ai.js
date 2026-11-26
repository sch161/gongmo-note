// OpenAI 라이브러리를 불러온다
const OpenAI = require('openai');

// AI가 준 값이 날짜 형식(YYYY-MM-DD)인지 검사한다. 아니면 null
function cleanDate(v) {
    return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

// AI가 준 값이 글자이면 앞뒤 공백을 지우고 max자까지만 쓴다. 아니면 null
function cleanText(v, max) {
    return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

// 포스터 이미지 -> 공모전 정보를 뽑아 주는 함수 (이 프로젝트의 AI 부분은 이 함수 하나)
// imageBuffer: 이미지 파일 내용, mimetype: 'image/jpeg' 같은 형식
// fieldNames: DB fields 테이블의 분야 이름 목록 (이 중에서만 고르게 한다)
async function extractContestFromPoster(imageBuffer, mimetype, fieldNames) {
    // 키가 없으면 AI를 부를 수 없으니 안내 메시지와 함께 에러를 던진다
    if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY가 설정되지 않았어요');
    }

    // 함수 안에서 클라이언트를 만든다 (키가 없을 때 서버 시작 단계에서 죽지 않게 하려는 것)
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // 이미지를 글자(base64)로 바꿔서 data URL 형태로 보낸다
    const base64 = imageBuffer.toString('base64');
    const imageUrl = 'data:' + mimetype + ';base64,' + base64;

    // 오늘 날짜: 포스터에 연도가 없을 때 올해로 보게 하려고 알려 준다
    const today = new Date().toISOString().slice(0, 10);

    // AI에게 하는 지시 (반드시 JSON으로 답하게 한다)
    const prompt = `
이 이미지는 공모전 포스터입니다. 포스터에서 아래 정보를 찾아 JSON으로만 답하세요.
- 포스터에 없는 값은 추측하지 말고 null로 쓰세요.
- 날짜는 YYYY-MM-DD 형식으로 쓰세요. 연도가 없으면 올해(오늘은 ${today})로 보세요.
- field_names는 반드시 다음 중에서만 고르세요(여러 개 가능, 없으면 빈 배열): ${fieldNames.join(', ')}
- prizes의 amount는 원 단위 정수(예: 100만원 -> 1000000)로 쓰고, 상금이 없으면 null로 쓰세요.
- announce_date는 최종 수상자(최종 결과) 발표일입니다. 예선 발표일이 아닙니다.
- 시상이 부문별(예: 고등부/대학부)로 금액이 다르면, 부문마다 한 줄씩 만들고 rank_name에 부문을 포함하세요(예: "대상(고등부)").
- 주최기관은 문의처가 아니라 포스터의 주최·주관 기관으로 쓰세요.

{
  "title": "공모전 이름",
  "organizer": "주최기관",
  "apply_start": "접수 시작일",
  "apply_end": "접수 마감일",
  "announce_date": "결과 발표일",
  "field_names": ["분야"],
  "prizes": [{ "rank_name": "대상", "amount": 1000000 }]
}`;

    // OpenAI에 요청한다. 이미지와 글을 함께 보내고, 답은 JSON 형식으로 받는다
    const response = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
            {
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    { type: 'image_url', image_url: { url: imageUrl } },
                ],
            },
        ],
    });

    // AI의 답(글자)을 JSON 객체로 바꾼다
    const raw = JSON.parse(response.choices[0].message.content);

    // AI의 답은 믿지 않고 하나씩 검사해서 정리한다
    const prizes = (Array.isArray(raw.prizes) ? raw.prizes : [])
        .map((p) => ({
            rank_name: cleanText(p.rank_name, 30),
            amount: Number.isInteger(p.amount) && p.amount >= 0 ? p.amount : null,
        }))
        .filter((p) => p.rank_name) // 등급 이름이 없는 줄은 버린다
        .slice(0, 10); // 최대 10줄

    return {
        title: cleanText(raw.title, 200),
        organizer: cleanText(raw.organizer, 100),
        apply_start: cleanDate(raw.apply_start),
        apply_end: cleanDate(raw.apply_end),
        announce_date: cleanDate(raw.announce_date),
        // DB에 있는 분야 이름만 남긴다
        field_names: (Array.isArray(raw.field_names) ? raw.field_names : []).filter((n) => fieldNames.includes(n)),
        prizes: prizes,
    };
}

module.exports = { extractContestFromPoster };