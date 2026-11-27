// AI 서비스: 공모전 포스터 이미지를 OpenAI에 보내 제목·주최·날짜·분야·시상을 뽑아 옴
// AI와 통신하고 결과를 정리만 하며, DB 저장은 안 함

// OpenAI 라이브러리 불러옴
const OpenAI = require('openai');

// cleanDate(v): YYYY-MM-DD 모양이면 그대로, 아니면 null 반환
// (엉뚱한 날짜 형식이 DATE 컬럼에 들어가 DB 에러 나는 것을 막으려고 검사)
function cleanDate(v) {
    // 글자이고 날짜 모양일 때만 통과
    return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

// cleanText(v, max): 글자면 공백 지우고 max자까지만 잘라 반환, 아니면 null
// (max는 DB 컬럼 길이에 맞춰 너무 긴 글이 DB에서 막히는 것을 방지)
function cleanText(v, max) {
    // 글자이고 공백만 아닐 때만 통과
    return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

// extractContestFromPoster: 포스터 이미지로 공모전 정보를 뽑는 함수 (AI 부분은 이것 하나)
// imageBuffer: 이미지 파일 내용, mimetype: 'image/jpeg' 같은 형식
// fieldNames: DB 분야 이름 목록 (이 중에서만 고르게 함)
// 반환: {title, organizer, apply_start, apply_end, announce_date, field_names, prizes} (못 읽은 값은 null)
// 실패하면 에러를 던지고 호출한 라우터가 안내함
async function extractContestFromPoster(imageBuffer, mimetype, fieldNames) {
    // 키가 없으면 AI를 못 부르니 안내와 함께 에러를 던짐
    // .env에 키가 있는지 확인
    if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY가 설정되지 않았어요');
    }

    // 클라이언트를 함수 안에서 만듦 (키가 없어도 서버 시작이 안 죽게 하려고)
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // 이미지를 글자(base64)로 바꿔 data URL 형태로 보냄
    // 이미지 바이트를 base64 글자로 바꿈
    const base64 = imageBuffer.toString('base64');
    // 'data:형식;base64,내용' 모양의 주소로 만듦
    const imageUrl = 'data:' + mimetype + ';base64,' + base64;

    // 오늘 날짜: 포스터에 연도가 없을 때 올해로 보게 하려고 알려 줌
    // 오늘을 'YYYY-MM-DD' 글자로 만듦
    const today = new Date().toISOString().slice(0, 10);

    // AI에게 하는 지시문 (JSON으로만 답하게 하고, 없는 값은 null로 쓰게 해서 지어내기를 줄임)
    // 분야는 DB 목록에서만 고르게 해서 없는 분야 이름이 안 나오게 함
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

    // OpenAI에 요청함 (이미지+글을 함께 보내고, 답은 JSON으로 받음)
    const response = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-6.2-sol',  // 모델 이름 (.env의 OPENAI_MODEL 우선)
        response_format: { type: 'json_object' },          // JSON으로만 답하게 해서 JSON.parse 가능하게 함
        messages: [
            {
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    // detail: 'high' = 이미지를 크게 읽음 (긴 포스터의 작은 글씨 인식용)
                    { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
                ],
            },
        ],
    });

    // AI 답(글자)을 JSON 객체로 바꿈. 아직 믿으면 안 되는 날것의 값
    const raw = JSON.parse(response.choices[0].message.content);

    // AI 답은 틀리거나 형식이 어긋날 수 있어서 믿지 않고 하나씩 검사해 정리함
    // 상금은 0 이상 정수만 인정하고(DB amount와 같은 규칙), 아니면 null
    const prizes = (Array.isArray(raw.prizes) ? raw.prizes : [])
        .map((p) => ({
            rank_name: cleanText(p.rank_name, 30),
            amount: Number.isInteger(p.amount) && p.amount >= 0 ? p.amount : null,
        }))
        .filter((p) => p.rank_name)  // 등급 이름 없는 줄은 버림
        .slice(0, 10);               // 최대 10줄만 씀

    // 정리한 결과만 반환함. 이 값은 DB에 바로 저장하지 않고 화면 입력칸을 채우는 데만 씀
    // (AI가 날짜·상금을 잘못 읽었을 수 있어서, 사용자가 확인하고 고친 뒤 "등록"해야 저장됨)
    return {
        title: cleanText(raw.title, 200),                                                                            // 공모전 이름 (200자까지)
        organizer: cleanText(raw.organizer, 100),                                                                    // 주최기관 (100자까지)
        apply_start: cleanDate(raw.apply_start),                                                                     // 접수 시작일 (날짜 형식 검사)
        apply_end: cleanDate(raw.apply_end),                                                                         // 접수 마감일 (날짜 형식 검사)
        announce_date: cleanDate(raw.announce_date),                                                                 // 결과 발표일 (날짜 형식 검사)
        field_names: (Array.isArray(raw.field_names) ? raw.field_names : []).filter((n) => fieldNames.includes(n)),  // DB에 있는 분야 이름만 남김
        prizes: prizes,                                                                                              // 위에서 정리한 시상 목록
    };
}

// 밖에는 이 함수 하나만 공개함 (cleanDate, cleanText는 파일 안에서만 씀)
module.exports = { extractContestFromPoster };