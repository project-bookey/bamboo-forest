// Virtual social spaces: these six cars do not describe a real train formation.
export const CAR_COUNT = 6;
export const CAR_THEMES = [
  { name: '첫 인사', color: '#46917c', hint: '처음 만난 사이도, 가벼운 인사부터.' },
  { name: '책 읽는 칸', color: '#7d91b0', hint: '요즘 읽는 책 한 권을 나눠 보세요.' },
  { name: '퇴근길', color: '#ba8767', hint: '오늘 하루도 여기까지 오느라 수고했어요.' },
  { name: '음악 산책', color: '#9a87b4', hint: '지금 듣는 노래가 있나요?' },
  { name: '한강 너머', color: '#5297a5', hint: '다음에 가 보고 싶은 곳을 이야기해요.' },
  { name: '느린 대화', color: '#9b9d70', hint: '말없이 함께 있어도 괜찮아요.' },
];
export const REACTIONS = { wave: '반가워요', heart: '공감해요', clap: '응원해요' };
export const COAT_COLORS = ['#f2ead4', '#8dc8bd', '#bdc2df', '#d6a4a2', '#9eb5d1'];
export const ADS = [
  { id: 'book', brand: '역 사이 책방', title: '한 정거장에\n한 페이지.', subtitle: '오늘의 이야기는 어디쯤인가요?', body: '책을 덮어도 이야기는 이어집니다. 지금 읽는 책, 오래 기억에 남은 문장, 누군가에게 권하고 싶은 한 권을 같은 칸에서 나눠 보세요.', bg: '#f3de9f', ink: '#354e46', accent: '#df745a', art: 'book' },
  { id: 'coffee', brand: '느린 커피', title: '급한 하루에\n느린 한 모금.', subtitle: '다음 역까지, 잠깐 쉬어 가요.', body: '바쁜 하루에도 작은 쉼표는 필요하니까요. 창밖을 바라보고, 어깨의 힘을 빼고, 오늘 좋았던 일 하나를 떠올려 보세요.', bg: '#bfd8ca', ink: '#284c44', accent: '#f3f0da', art: 'coffee' },
  { id: 'river', brand: '도시 산책부', title: '목적지 말고\n산책도 좋아요.', subtitle: '익숙한 역에서 낯선 풍경 찾기', body: '언젠가 한 정거장 먼저 내려 걸어 보는 건 어떨까요? 좋아하는 동네, 숨겨 둔 산책길, 노을이 예쁜 곳을 서로 소개해 주세요.', bg: '#b8d8e5', ink: '#2c5066', accent: '#f5ce7c', art: 'river' },
  { id: 'music', brand: '이어폰 한쪽', title: '오늘의 기분을\n재생해 주세요.', subtitle: '당신의 퇴근길에는 어떤 음악이 흐르나요?', body: '위로가 된 노래나 걷기 좋은 곡을 나눠 보세요. 소리를 직접 재생하는 광고는 없어요. 제목만으로도 누군가의 플레이리스트에 새로운 이야기가 생길 수 있습니다.', bg: '#d6cbe5', ink: '#514565', accent: '#f6eacb', art: 'music' },
  { id: 'hello', brand: '메트로챗', title: '같은 열차,\n다른 하루.', subtitle: '한마디의 인사가 닿는 거리', body: '바닥을 눌러 걷고, 빈 좌석을 눌러 앉고, 연결문을 눌러 옆 칸으로 건너가 보세요. 같은 열차의 사람들과 잠깐의 이야기를 나눌 수 있어요.', bg: '#efd2ba', ink: '#6a5144', accent: '#abbd9b', art: 'hello' },
  { id: 'kind', brand: '작은 배려 안내소', title: '편안한 거리를\n함께 만들어요.', subtitle: '대답하지 않을 자유도, 이야기할 자유도.', body: '서로의 개인정보를 묻거나 원치 않는 대화를 강요하지 말아 주세요. 불편한 메시지는 신고하고 차단할 수 있어요. 실제 지하철의 안내방송과 주변 상황도 확인해 주세요.', bg: '#dce3ba', ink: '#4f6043', accent: '#f3ebcc', art: 'hello' },
];
export const SEATS = [-1, 1].flatMap(side => Array.from({ length: 5 }, (_, row) => Array.from({ length: 3 }, (_, slot) => ({ id: `${side}:${row}:${slot}`, x: side * 2.22, z: -11 + row * 5.5 + (slot - 1) * 1.06, angle: side < 0 ? Math.PI / 2 : -Math.PI / 2 }))).flat());
