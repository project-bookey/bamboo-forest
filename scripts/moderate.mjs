// Run on the server with node --env-file=/opt/bamboo-forest/subway.env.
const [action = 'list', id, minutes = '30'] = process.argv.slice(2);
const token = process.env.METRO_ADMIN_TOKEN;
if (!token || !['list', 'dismiss', 'hide', 'mute'].includes(action) || action !== 'list' && !id) throw Error('관리자 키와 명령(list / hide ID / dismiss ID / mute ID 분)을 확인하세요.');
const origin = `http://127.0.0.1:${process.env.PORT || 3212}`;
const response = await fetch(origin + '/metro-chat/api/moderation/' + (action === 'list' ? 'reports' : 'review'), { headers: { Authorization: `Bearer ${token}`, Origin: origin, 'Content-Type': 'application/json' }, ...(action === 'list' ? {} : { method: 'POST', body: JSON.stringify({ id, action, minutes: Number(minutes) }) }) });
const result = await response.json();
if (!response.ok) throw Error(result.error || '운영 요청 실패');
console.log(JSON.stringify(result, null, 2));
