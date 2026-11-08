import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LINES, route, reachesDestination, TransitProvider } from '../transit.mjs';
import { TimetableProvider } from '../timetable.mjs';
import { createSubwayServer } from '../server.mjs';

test('all 19 official realtime lines have connected sections and direction-aware routes', () => {
  assert.deepEqual(LINES.map(l => l.id), ['1001','1002','1003','1004','1005','1006','1007','1008','1009','1032','1063','1065','1067','1075','1077','1081','1092','1093','1094']);
  for (const line of LINES) {
    assert.equal(new Set(line.stations).size, line.stations.length);
    for (const path of line.paths) {
      for (const station of path) assert.ok(line.stations.includes(station));
      assert.ok(route(line.id, path[0], path.at(-1), line.id === '1002' && path === line.paths[0] ? 0 : 1), `${line.name} ${path[0]}`);
    }
  }
  assert.equal(route('1001', '연천', '인천', 1).at(-1), '인천');
  assert.equal(route('1001', '서울역', '신창', 1).at(-1), '신창');
  assert.deepEqual(route('1001', '병점', '서동탄', 1), ['병점','서동탄']);
  assert.equal(route('1001', '인천', '신창', 1), null);
  assert.equal(route('1001', '인천', '신창', 0), null);
  assert.equal(route('1005', '길동', '마천', 1), null);
  assert.deepEqual(route('1005', '강동', '둔촌동', 1), ['강동','둔촌동']);
  assert.deepEqual(route('1002', '용두', '성수', 0), ['용두','신답','용답','성수']);
  assert.deepEqual(route('1004', '진접', '불암산', 1), ['진접','오남','별내별가람','불암산']);
  assert.equal(route('1032', '서울역', '동탄', 1), null);
  assert.equal(route('1063', '문산', '서울역', 1).at(-2), '신촌');
  assert.equal(route('1065', '마곡나루', '인천공항2터미널', 1).includes('영종'), true);
  assert.equal(route('1067', '광운대', '춘천', 1)[1], '상봉');
});
test('응암 circuit never permits the reverse loop; destinations exclude wrong branches and short turns', () => {
  assert.deepEqual(route('1006', '구산', '새절', 1), ['구산','응암','새절']);
  assert.deepEqual(route('1006', '역촌', '구산', 0), ['역촌','불광','독바위','연신내','구산']);
  assert.equal(route('1006', '불광', '역촌', 1), null);
  assert.equal(reachesDestination('1001','서울역','신창',1,'인천'),false);
  assert.equal(reachesDestination('1001','서울역','안양',1,'천안'),true);
  assert.equal(reachesDestination('1005','천호','하남검단산',1,'마천'),false);
  assert.equal(reachesDestination('1002','강남','신림',0,'서울대입구'),false);
  assert.equal(reachesDestination('1002','강남','사당',0,'성수'),true);
  assert.equal(reachesDestination('1006','새절','역촌',0,'응암순환'),true);
  assert.equal(reachesDestination('1006','새절','신내',0,'응암순환'),false);
  assert.equal(reachesDestination('1004','명동','불암산',0,'당고개'),true);
});
test('all line providers preserve API IDs, official station query aliases and train kinds', async () => {
  const now = Date.parse('2026-11-08T10:00:00+09:00');
  for (const line of LINES) {
    const station = line.stations.find(s => line.queries[s]) || line.stations[0];
    let requested;
    const p = new TransitProvider({ key:'test', demo:false, now:()=>now, fetcher: async url => { requested = url; return { ok:true, json:async()=>({ realtimeArrivalList:[{ subwayId:line.id,btrainNo:'A123',updnLine:'하행',bstatnNm:line.paths[0].at(-1),recptnDt:'2026-11-08 10:00:00',btrainSttus:'ITX' }] }) }; } });
    const result = await p.arrivals(line.id,station);
    assert.equal(result.trains.length,1); assert.equal(result.trains[0].number,'A123'); assert.equal(result.trains[0].express,true);
    assert.equal(decodeURIComponent(requested.split('/').at(-1)),line.queries[station] || station);
  }
});
test('new lines expose station-specific schedules; unsupported timetable lines remain unknown', async () => {
  const p = new TimetableProvider({refresh:false});
  for (const [line,station] of [['1001','종각'],['1003','충무로'],['1004','명동'],['1005','광화문'],['1006','공덕'],['1007','논현'],['1008','잠실']]) {
    assert.ok((await p.states(line,station)).some(s=>s.status!=='unknown'),`${line}:${station}`);
  }
  assert.ok((await p.states('1077','강남')).every(s=>s.status==='unknown'));
});
test('same 1호선 train shares chat across branch selections while wrong destinations are rejected', async t => {
  const now = Date.parse('2026-11-08T10:00:00+09:00');
  const provider = { key:'test', demo:false, arrivals:async()=>({mode:'live',trains:[{id:'123',number:'123',direction:1,destination:'인천',express:false}]}) };
  const {server}=createSubwayServer({provider,secure:false,now:()=>now,timetable:{states:async()=>[]}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>{server.closeAllConnections();server.close();});
  const origin=`http://127.0.0.1:${server.address().port}`,base=origin+'/metro-chat/api/';
  const post=(name,data,cookie)=>fetch(base+name,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(data)});
  const a=await post('session',{}),b=await post('session',{});
  const ac=a.headers.get('set-cookie').split(';')[0],bc=b.headers.get('set-cookie').split(';')[0];
  const trip={line:'1001',from:'서울역',to:'부평',direction:1,train:'123'};
  const first=await post('board',trip,ac);assert.equal(first.status,200);const ar=(await first.json()).trip.room;
  const second=await post('board',{...trip,from:'구로',to:'인천'},bc);assert.equal(second.status,200);assert.equal((await second.json()).trip.room,ar);
  assert.equal((await post('board',{...trip,to:'천안'},bc)).status,400);
  assert.equal((await post('say',{text:'1호선 대화'},ac)).status,200);
  assert.equal((await (await post('session',{},bc)).json()).messages[0].text,'1호선 대화');
  assert.equal((await fetch(base+'trains?line=1001&station='+encodeURIComponent('서울역')+'&path=99',{headers:{Cookie:ac}})).status,400);
});
