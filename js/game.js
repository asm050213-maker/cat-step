
/* 이미지는 문서 맨 끝 <script id="myo-image-data"> 에 모여 있고, 코드에서는 __IMG.이름 으로 불러 씁니다.
   (코드가 읽기 편하도록 DOMContentLoaded 뒤에 실행합니다) */
window.addEventListener("DOMContentLoaded", function(){
(function(){
  "use strict";

  /* ================= 데이터 정의 ================= */
  const STAGES = ["성장기","청년기","중년기","시니어기","노년기"];
  const MODALS_PER_STAGE = 2; // 스테이지당 '고양이 선택창' 등장 횟수
  const TURF_RANK_NAMES = ["", "냥아치", "동네 대장", "고양이들의 왕"];
  const SEASONS = [
    { name:"봄", icon:"🌸" },
    { name:"장마", icon:"☔" },
    { name:"가을", icon:"🍂" },
    { name:"겨울", icon:"❄️" },
  ];
  const SEASON_LENGTH = 12; // 하루(day) 기준 계절 길이 (한 판 약 31~51일 → 계절 3~4번 바뀜)
  // true: 계절이 인생 단계를 따라간다 (봄 → 장마 → 가을 → 겨울 → 이듬해 봄)
  // false: 예전 방식 (날짜 기준, 판마다 시작 계절 랜덤)
  const SEASON_FOLLOWS_STAGE = true;
  const SEASON_BY_STAGE = [0, 1, 2, 3, 0];
  function getSeason(day){
    if(SEASON_FOLLOWS_STAGE && state){
      return SEASONS[SEASON_BY_STAGE[Math.min(state.stageIdx || 0, SEASON_BY_STAGE.length - 1)]];
    }
    // 판마다 시작 계절이 달라서(seasonOffset) 끝나는 계절도 매번 달라진다
    const off = (state && state.seasonOffset) || 0;
    const idx = (Math.floor((day - 1) / SEASON_LENGTH) + off) % SEASONS.length;
    return SEASONS[idx];
  }

  /* ================= 장소 건자(거:4개 문개 후) =================
          공원 ── 놀이터 ── 시장
           │        │        │
         주택가 ─ 골목 ─ 상점가
           │        │        │
         공터 ─── 집 ─── 큰길 ── 하천
  */
  const LOCATIONS = [
    { id:"park",       name:"공원",   icon:"🌳", exits:{ right:"playground", down:"housing" } },
    { id:"playground", name:"놀이터", icon:"🎠", exits:{ left:"park", right:"market", down:"alley" } },
    { id:"market",      name:"시장",   icon:"🛒", exits:{ left:"playground", down:"market_st" } },
    { id:"housing",    name:"주택가", icon:"🏘️", exits:{ up:"park", right:"alley", down:"lot" } },
    { id:"alley",      name:"골목",   icon:"🌆", exits:{ up:"playground", left:"housing", right:"market_st", down:"home" } },
    { id:"market_st",  name:"상점가", icon:"🏪", exits:{ up:"market", left:"alley", down:"road" } },
    { id:"lot",        name:"공터",   icon:"🌾", exits:{ up:"housing", right:"home" } },
    { id:"home",       name:"집",     icon:"🏠", exits:{ up:"alley", left:"lot", right:"road" } },
    { id:"road",       name:"큰길",   icon:"🛣️", exits:{ up:"market_st", left:"home", right:"stream" } },
    { id:"stream",     name:"하천",   icon:"🌊", exits:{ left:"road" } },
  ];
  const LOC_BY_ID = {};
  LOCATIONS.forEach(l=> LOC_BY_ID[l.id] = l);

  // 지도 칸(열,행) 10개. 붙어 있는 칸끼리는 모두 길로 이어진다.
  const GRID_CELLS = [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2],[3,2]];
  // 게임을 시작할 때마다 어느 장소가 어느 칸에 놓일지 새로 섞고, 그에 맞춰 길(exits)을 다시 만든다.
  function randomizeLayout(){
    // 하천은 강이 가로막고 있어 옆으로 길이 이어질 수 없으니, 길이 한쪽(왼쪽)으로만 나 있는 맨 끝 칸에 늘 놓는다
    const ids = LOCATIONS.map(l=> l.id).filter(id=> id !== "stream");
    for(let i = ids.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const at = {}, pos = {};
    const cells = GRID_CELLS.filter(([c, r])=> !(c === 3 && r === 2));
    cells.forEach(([c, r], i)=>{ at[c + "," + r] = ids[i]; pos[ids[i]] = [c, r]; });
    at["3,2"] = "stream"; pos["stream"] = [3, 2];
    LOCATIONS.forEach(l=>{
      const [c, r] = pos[l.id], ex = {};
      const up = at[c + "," + (r - 1)], down = at[c + "," + (r + 1)];
      const left = at[(c - 1) + "," + r], right = at[(c + 1) + "," + r];
      if(up) ex.up = up;
      if(down) ex.down = down;
      if(left) ex.left = left;
      if(right) ex.right = right;
      l.exits = ex;
    });
    return pos;
  }

  const ROOM_BG = {
    park:"#DCEEDB", playground:"#FDE3EE", market:"#FFF1C2",
    housing:"#F1E6D3", alley:"#E6E0F7", market_st:"#FBDADA",
    lot:"#DCEFD2", home:"#FFE8CC", road:"#DCDCE2", stream:"#CFEAF4",
  };
  // 화면 전체 배경색 (게임 화면보다 한 톤 진하게)
  const PAGE_BG = {
    park:"#B3DAB1", playground:"#F5B8D1", market:"#F5D77E", housing:"#DCC49C", alley:"#C4BAEA",
    market_st:"#F0ABAB", lot:"#B7DDA4", home:"#FFCB97", road:"#B4B4C2", stream:"#9FD5E9",
  };

  const ITEM_TYPES = [
    // tier: 확률 가중치 (희귀할수록 등장은 적고, 효과는 큼)
    // food: 먹이류(대장냥이에게 음식을 준 적 있는지 판정용) · exercise: 체형 감소+근육 연출
    // mystery: 줍기 전엔 정체를 숨김 · bad: 위험 요소(도박형 결과 가능)
    { key:"kibble",   icon:"🥣", label:"건식 사료", tier:"common", food:true, hunger:+14, fun:0,  affection:0, weight:+2, risk:-1, msg:"건식 사료를 오독오독 먹었다" , places:["home","market","market_st","housing"] },
    { key:"wet",      icon:"🍗", label:"습식 사료", tier:"common", food:true, hunger:+18, fun:0,  affection:0, weight:+3, risk:-1, msg:"촉촉한 습식 사료를 먹었다" , places:["home","market","market_st"] },
    { key:"can_ok",   icon:"🥫", label:"온전한 캔", tier:"uncommon", food:true, hunger:+28, fun:0, affection:0, weight:+3, risk:-3, msg:"멀쩡한 캔을 발견해 배불리 먹었다" , places:["lot","road","alley","market_st"] },
    { key:"fishbone", icon:"🦴", label:"물고기뼈", tier:"common", food:true, hunger:+9, fun:0, affection:0, weight:+1, risk:0, msg:"물고기 뼈를 발라 먹었다" , places:["stream","lot","road"] },
    { key:"can_bad",  icon:"🥫", label:"상한 캔", tier:"uncommon", food:true, hunger:+8, fun:+4, affection:0, weight:0, risk:+10, bad:true, msg:"상한 캔을 먹고 속이 좋지 않다..." , places:["lot","road","market_st"] },
    { key:"mouse_toy",icon:"🖱️", label:"자동 쥐 장난감", tier:"uncommon", hunger:0, fun:+20, affection:0, weight:-4, risk:-1, exercise:true, msg:"버려진 장난감 쥐와 신나게 뛰어놀았다" , places:["playground","park"] },
    { key:"catgrass", icon:"🌿", label:"강아지풀", tier:"common", hunger:0, fun:+8, affection:0, weight:-1, risk:-1, exercise:true, msg:"강아지풀을 살랑살랑 흔들며 놀았다" , places:["park","lot","housing"] },
    { key:"trap",     icon:"🪤", label:"쥐덫", tier:"rare", hunger:0, fun:+10, affection:0, weight:0, risk:+18, bad:true, msg:"쥐덫 근처에서 깜짝 놀랐다! 심장이 쫄깃했다" , places:["lot","road","stream","park","housing"] },
    { key:"dog",      icon:"🐕", label:"사나운 개", tier:"rare", hunger:-6, fun:+8, affection:0, weight:-2, risk:+16, bad:true, exercise:true, msg:"사나운 개가 짖으며 쫓아와 정신없이 도망쳤다!" , places:["road","park"] },
    { key:"bug",      icon:"🦗", label:"벌레", tier:"uncommon", hunger:0, fun:+15, affection:+12, weight:-2, risk:-1, exercise:true, msg:"벌레를 사냥해 집사에게 자랑스럽게 물어다 줬다", msgUnadopted:"벌레를 사냥했다. 아직 물어다 줄 집사는 없다" , places:["lot","park","stream"] },
    { key:"bird",     icon:"🐦", label:"참새", tier:"rare", hunger:0, fun:+30, affection:+22, weight:-3, risk:-1, exercise:true, msg:"참새를 사냥해 선물했다! 집사가 놀라며 좋아했다", msgUnadopted:"참새를 사냥했다. 자랑할 상대가 없어 조금 허전하다" , places:["park","stream"] },
    { key:"cash",     icon:"💵", label:"지폐", tier:"rare", hunger:0, fun:0, affection:+20, weight:0, risk:-1, mystery:true, msg:"...정체는 지폐였다! 집사가 어이없어하면서도 사랑스러워한다", msgUnadopted:"...정체는 지폐였다. 아직 집사가 없어 그냥 물고 다닐 뿐이다" , places:["market_st","market","alley"] },
    { key:"paper",    icon:"📄", label:"폐지", tier:"common", hunger:0, fun:+14, affection:+6, weight:0, risk:0, mystery:true, paperPlay:true, msg:"...정체는 폐지였다! 바스락거리는 종이를 앞발로 툭툭 치며 한참을 놀았다", msgUnadopted:"...정체는 폐지였다! 쓸모는 없어도 바스락거리는 소리가 재미있다" , places:["alley","market_st","road","home"] },
    { key:"pushy",    icon:"🧍", label:"들이대는 사람", tier:"uncommon", hunger:0, fun:+6, affection:0, weight:0, risk:+4, bad:true, msg:"낯선 사람이 억지로 만지려 해서 잔뜩 스트레스를 받았다" , places:["market","playground","market_st","housing"] },
    { key:"kiss",     icon:"😘", label:"뽀뽀하려는 사람", tier:"uncommon", hunger:0, fun:+5, affection:0, weight:0, risk:+7, bad:true, msg:"낯선 사람이 갑자기 뽀뽀하려고 해서 화들짝 놀라 도망쳤다" , places:["market","playground","housing"] },
    { key:"stall",    icon:"🐟", label:"가판대 먹거리", tier:"uncommon", steal:true, hunger:0, fun:0, affection:0, weight:0, risk:0, msg:"", places:["market","market_st"] },
    { key:"feeder",   icon:"🧑‍🍳", label:"밥 주는 사람", tier:"uncommon", food:true, hunger:+18, fun:+2, affection:+4, weight:+2, risk:-2, msg:"친절한 사람이 밥을 챙겨줬다" , places:["home","market","market_st","housing"] },
    { key:"bee",      icon:"🐝", label:"꽃밭의 벌", tier:"rare", hunger:0, fun:+8, affection:0, weight:0, risk:+14, bad:true, msg:"나비 가득한 꽃밭에서 놀다가 그만 벌에 쏘였다!" , places:["park"] },
    { key:"dirty",    icon:"🕳️", label:"더러운 골목", tier:"uncommon", hunger:0, fun:-2, affection:0, weight:0, risk:+6, msg:"쓰레기가 잔뜩 쌓인 더러운 골목을 지나갔다. 왠지 이 근처가 더 위험하게 느껴진다..." , places:["alley"] },
    { key:"clean",    icon:"🌺", label:"깨끗한 골목", tier:"uncommon", hunger:0, fun:+2, affection:0, weight:0, risk:-3, msg:"화사하고 깨끗한 골목을 지나갔다" , places:["alley","housing"] },
    { key:"empty",    icon:"🍃", label:"조용한 길", tier:"common", hunger:0, fun:0, affection:0, weight:0, risk:0, msg:"별일 없이 지나갔다" , places:["any"] },
  ];
  const TREAT_ITEM = { key:"treat", icon:"🍬", label:"고급 츄르", tier:"special", food:true, hunger:+30, fun:+10, affection:+6, weight:+2, risk:-2, msgUnadopted:"길에서 주운 고급 츄르를 냠냠 먹었다", msg:"집사가 챙겨준 고급 츄르를 냠냠 먹었다" };

  /* ---------- 연인 퀘스트: 하트 아이콘이 4단계로 바뀐다 ----------
     0 🤍 만남 → (첫 데이트) → 1 🩷 → (작은 사냥감) → 2 ❤️ → (큰 사냥감) → 3 💖 → (츄르) → 4 💞 잉꼬 부부 */
  const LOVE_HEARTS = ["🤍","🩷","❤️","💖","💞"];
  const LOVER_ITEM = { key:"lover", icon:"😻", label:"연인", tier:"special", msg:"" };
  const TRIBUTE_DAYS = 10;   // 왕의 수명 연장 일수
  // 현재 하트 단계(index)에서 연인이 원하는 선물
  const LOVE_GOALS = {
    1: { key:"bug",   icon:"🦗", name:"작은 사냥감", boost:4,
         carryMsg:"🦗 연인에게 줄 작은 사냥감을 입에 물었다! 연인을 찾아가자",
         giftMsg:"🦗 작은 사냥감을 건넸다! 연인의 꼬리가 살랑살랑 흔들린다" },
    2: { key:"bird",  icon:"🐦", name:"큰 사냥감", boost:5,
         carryMsg:"🐦 참새를 사냥했다! 연인에게 가져가자",
         failMsg:"🐦 아쉽게도 참새가 푸드덕 날아가 버렸다…",
         giftMsg:"🐦 큰 사냥감을 건넸다! 연인이 감동해 이마를 비빈다" },
    3: { key:"treat", icon:"🍬", name:"츄르", boost:0,
         carryMsg:"🍬 귀한 츄르를 입에 물었다! 연인에게 가져가자",
         giftMsg:"🍬 귀한 츄르를 건넸다! 연인의 눈이 반짝반짝 빛난다" },
  };

  // 먹이 창고 잭팟 아이템 (일반 츄르: 창고에서만 나온다)
  const CHURU_ITEM = { key:"churu", icon:"🍭", label:"츄르", tier:"special", food:true, hunger:+36, fun:+20, affection:+4, weight:+2, risk:-3, msg:"🎉 잭팟! 창고 구석에서 츄르를 발견했다. 쭉쭉 짜 먹으니 천국이 따로 없다" };
  const SEASONAL_PUDDLE_ITEM = { key:"season_puddle", icon:"💦", label:"물웅덩이", tier:"special", msg:"" };
  const SEASONAL_CHURU_CHANCE = 0.05; // 가을·겨울 방에 들어갈 때 츄르가 나타날 확률(방당 5%)

  // 먹이 창고: 5개 중 대부분이 음식, 잭팟이면 츄르가 섞여 있다
  function makeStashItems(bold){
    const foods = ITEM_TYPES.filter(it=> it.food && !it.bad && it.key !== "feeder");
    const items = [];
    for(let i=0;i<5;i++){
      const r = Math.random();
      if(r < 0.85) items.push(foods[Math.floor(Math.random()*foods.length)]);
      else items.push(pickItem(state.currentLoc));
    }
    const jackpot = Math.random() < (bold ? 0.45 : 0.25);
    if(jackpot){ for(let i = 0; i < 5; i++) items[i] = CHURU_ITEM; }   // 잭팟이면 창고 가득 츄르 5개
    if(!jackpot && bold && !(state && state.day <= SAFE_DAYS) && Math.random() < 0.35){   // 대담하게 뛰어들면 사나운 개가 숨어 있을 수도
      const dog = ITEM_TYPES.find(it=> it.key === "dog");
      let k; do{ k = Math.floor(Math.random()*5); }while(items[k] === CHURU_ITEM);
      items[k] = dog;
    }
    return { items, jackpot };
  }

  const WEIGHTS = { common:50, uncommon:20, rare:10 };
  const MUSCLE_LINES = ["근육이 붙었다! 💪", "몸이 한결 가벼워졌다", "날렵해진 기분이다"];

  // 위험 아이템의 '도박' 결과: 나쁘기만 한 게 아니라 가끔 좋은 쪽으로 뒤집힘
  const GAMBLE_TWISTS = {
    can_bad: { chance:0.30, good:{ hunger:+14, risk:-4, msg:"🍀 상한 캔인 줄 알았는데, 안 상한 캔이었다" } },
    trap:    { chance:0.25, good:{ hunger:+10, risk:-6, msg:"🍀 쥐덫은... 안 아팠다" } },
    dog:     { chance:0.25, good:{ fun:+14, risk:-6, msg:"🍀 개는... 짖기만 하고 쫓아오지 않았다" } },
    bee:     { chance:0.30, good:{ fun:+12, risk:-4, msg:"🍀 벌은 쏘지 않았다" } },
    pushy:   { chance:0.50, good:{ affection:+10, risk:-4, msg:"🍀 들이대는 줄 알았는데, 그냥 다정한 사람이었다" } },
    kiss:    { chance:0.50, good:{ affection:+8, risk:-4, msg:"🍀 뽀뽀는... 싫지 않았다" } },
  };

  const TRAP_BOOST = { lot:6, road:6, stream:7, park:5, housing:2.5 };   // 장소별 덫 가중치 (도심 밖일수록 많음)
  const SAFE_DAYS = 5;   // 이 일차까지는 위험 요소(위험 아이템·시비·덫 등)가 나오지 않는다
  function pickItem(locId){
    const loc = locId || (state && state.currentLoc) || "home";
    const pool = [];
    ITEM_TYPES.forEach(it=>{
      if(!(it.places.includes(loc) || (it.places.includes("any") && loc !== "home"))) return;   // 집에는 '길' 계열(조용한 길 등)이 나오지 않는다
      if(state && state.day <= SAFE_DAYS && (it.bad || it.key === "dirty")) return;   // 5일차까지는 위험 요소 없음
      if(it.steal && state && (state.theft || state.day < THEFT_CFG.minDay)) return;   // 도망 중이거나 너무 어릴 땐 훔칠 거리가 안 보인다
      let w = WEIGHTS[it.tier] || 10;
      // 조용한 길(아무 일 없음)은 거의 나오지 않는다
      if(it.key === "empty"){ w = 2; }
      // 덫은 도심에서 벗어난 곳일수록 훨씬 많이 깔려 있다
      if(it.key === "trap"){ w *= (TRAP_BOOST[loc] || 1); }
      // 대장냥이에게 인정받지 못했다면 위험 아이템이 더 자주 등장
      if(state && state.gangApproved === false && it.bad){ w *= 2.4; }
      // 더러운 골목을 지난 여파(dangerStreak)로 위험 아이템 등장이 더 잦아짐
      if(state && state.dangerStreak > 0 && it.bad){ w *= (1 + 0.25 * state.dangerStreak); }
      // 장마철엔 위험 아이템이 더 자주 등장
      if(state && getSeason(state.day).name === "장마" && it.bad){ w *= 1.6; }
      // 연인 퀘스트: 지금 연인이 원하는 사냥감이 더 자주 눈에 띈다
      if(state && state.hasPartner && !state.carry){ const g = LOVE_GOALS[state.loveStage]; if(g && g.boost && it.key === g.key){ w *= g.boost; } }
      // 맡긴 새끼가 원하는 물건이 더 자주 눈에 띈다
      if(state && state.kittens && !state.carry && state.kittens.some(k=> k.mode === "follow" && k.wish && !k.wish.done && k.wish.type === "item" && k.wish.key === it.key)){ w *= 4; }
      for(let i=0;i<w;i++) pool.push(it);
    });
    if(!pool.length){
      const empty = ITEM_TYPES.find(it=> it.key === "empty");
      for(let i=0;i<10;i++) pool.push(empty);
    }
    // 부자냥이가 되면 고급 츄르가 섞여 등장 (장소 무관)
    if(state && state.richCat){
      for(let i=0;i<26;i++) pool.push(TREAT_ITEM);
    }
    // 연인에게 줄 츄르가 필요한 단계라면 귀한 츄르가 가끔 눈에 띈다
    if(state && state.hasPartner && !state.carry && state.loveStage === 3){
      for(let i=0;i<24;i++) pool.push(TREAT_ITEM);
    }
    return pool[Math.floor(Math.random()*pool.length)];
  }

  /* ================= 엔딩 도감 (재시작해도 유지됨) ================= */
  const discoveredEndings = new Set();
  const newEndings = new Set();                 // 이번에 새로 모은 엔딩 (도감에서 NEW 표시)
  const ENDING_SAVE_KEY = "catroad_endings_v1";
  const ENDING_CATALOG = [
    { key:"lovebirds", emoji:"😻💞", title:"잉꼬 부부", hint:"연인과 모든 인연의 단계를 함께 걸어서", hidden:true },
    { key:"rich", emoji:"💰😺", title:"부자냥이", hint:"지폐를 부지런히 물어다 준 결과" },
    { key:"turf_king", emoji:"⚔️👑", title:"고양이들의 왕", hint:"동네 서열의 정점에 서다" },
    { key:"home_chubby", emoji:"🏠😻", title:"사랑받는 집고양이 (통통이)", hint:"살이 오른 채 사랑받은 삶" },
    { key:"home_affectionate", emoji:"🏠🐈", title:"집사에게 애교떠는 집고양이", hint:"애정도 최고" },
    { key:"wanderer_rough", emoji:"🌧️🐾", title:"거친 길 위의 방랑묘", hint:"위험 속에서도 자유롭게" },
    { key:"muscle_legend", emoji:"💪🐈‍⬛", title:"전설의 근육냥이", hint:"운동과 사냥의 결실" },
    { key:"chubby_famous", emoji:"🐽🐱", title:"동네 유명 통통이", hint:"먹는 것을 너무 사랑한 결과" },
    { key:"family", emoji:"🐱👶", title:"다둥이 가족을 이룬 고양이", hint:"혼자가 아닌 삶을 선택한 결과" },
    { key:"adventurer", emoji:"🧭🐾", title:"모험가냥이", hint:"위험을 두려워하지 않는 삶" },
    { key:"peaceful", emoji:"☀️🐱", title:"평온하고 행복한 삶을 산 고양이", hint:"특별하지 않아도 충분했던 잔잔한 삶" },
    { key:"trap_death", emoji:"😿🩹", title:"덫을 밟으면 아파요ㅜㅜ", hint:"덫을 5번 밟은 결말" },
    { key:"turf_boss", emoji:"😼🏆", title:"동네 대장", hint:"왕좌 바로 아래까지 오른 삶" },
    { key:"turf_thug", emoji:"😾🧢", title:"냥아치", hint:"시비 걸며 서열을 오른 삶" },
    { key:"exiled", emoji:"☁️🐈‍⬛", title:"동네에서 쫓겨난 떠돌이", hint:"대장냥이의 허락을 받지 못한 결말" },
    { key:"starving", emoji:"🥴🐟", title:"배탈냥이", hint:"배고픔에 아무거나 주워먹은 결과" },
    { key:"miracle", emoji:"🏠✨", title:"기적처럼 집을 찾은 고양이", hint:"화재 속에서 만난 기적", hidden:true },
    { key:"thief_legend", emoji:"🐟😼", title:"시장의 전설 도둑냥", hint:"시장 가판대를 털고 끝까지 도망친 결말" },
    { key:"bee_cat", emoji:"🐝💚", title:"꿀벌냥이", hint:"벌 침을 모두 피하다 숨겨진 직업을 얻은 결말", hidden:true },
    { key:"thief_wanted", emoji:"📜😿", title:"시장 요주의 고양이", hint:"붙잡히고 또 붙잡혀도 포기하지 않은 결말" },
    { key:"mama_warm", emoji:"🐈🍼", title:"새끼들의 든든한 엄마냥", hint:"새끼를 맡겨도 오래 기다리게 하지 않고 늘 품에 안아 준 결말" },
    { key:"mama_busy", emoji:"🌙🐱", title:"늘 바빴던 엄마냥", hint:"맡겨 둔 새끼를 오래 기다리게 한 결말" },
  ];
  // 수집한 엔딩은 브라우저에 저장해 새로고침해도 남는다 (저장이 안 되는 환경에서는 조용히 건너뜀)
  try{
    JSON.parse(localStorage.getItem(ENDING_SAVE_KEY) || "[]").forEach(k=>{ if(k === "ordinary") k = "peaceful"; if(ENDING_CATALOG.some(e=>e.key === k)) discoveredEndings.add(k); });
  }catch(err){}
  function saveEndings(){ try{ localStorage.setItem(ENDING_SAVE_KEY, JSON.stringify([...discoveredEndings])); }catch(err){} }

  /* ================= 상태 ================= */
  let state;
  function freshState(){
    return {
      hunger:70, fun:70, affection:20, // affection 0~100 -> 5 hearts
      weight:0, // 누적 체형치 (-여윔 ~ +통통)
      risk:0,   // 누적 위험도 (하늘 표현)
      stageIdx:0,
      modalCount:0,
      itemsEatenSinceModal:0,
      modalTarget: 3 + Math.floor(Math.random()*3), // 3~5
      day:1,
      layout: randomizeLayout(),   // 이번 판의 장소 배치
      currentLoc:"home",
      visited:{ home:true },
      roomObjects:[],
      trailIcons:[], history:[],
      running:false,
      autoLock:false,
      napping:false, _justNapped:false,   // 노묘가 한 턴 조는 중 / 직전 턴에 졸았는지
      minigame:false,   // 사냥·눈치 싸움 미니게임 진행 중
      gameOver:false,
      gangApproved:null, // null=아직 안만남, true=인정, false=거절당함
      adopted:false, // true가 되기 전까지 애정도가 오르지 않음 (냥줍/입양 이후에만 상승)
      metLeader:false,
      hasEatenFood:false,
      pendingEventChain:null,
      muscleCount:0,
      trapHitCount:0,
      cashCount:0,
      richCat:false,
      dangerStreak:0,
      dangerExposure:0,
      adventurous:false,
      turfRank:0,
      encCooldown:0,
      leaderChallengeInterval:0,  // 대장냥이를 무시하면 5턴, 음식을 나누면 10턴마다 서열싸움
      leaderChallengeProgress:0,
      leaderChallengePending:false,
      weakened:0,
      hasKittens:false,
      kittens:[],         // 따라다니는/흩어진 새끼들 { sp, mode:follow|flee|lost, loc, lostDay … }
      personality:null, // 'introvert' | 'extrovert'
      fireEvent:null,
      fireMusicReady:false, // 화재 선택창이 실제로 표시된 뒤에만 화재 배경음악으로 전환
      fireTriggered:false, firePending:false,
      tributeDone:false,  // 왕의 조공 에필로그를 이미 했는지
      tributeDays:0,      // 조공을 받으며 더 산 날수
      expectedDays:0,     // 조공 시작 전 예상 수명(일)
      extLeft:0,          // 왕의 연장 수명 남은 일수
      tributeCount:0,     // 이번 생에 받은 조공 횟수
      loveStage:0,        // 연인 하트 단계 0~4
      carry:null,         // 연인에게 줄 선물을 물고 있는지
      lovebirds:false,    // 연인 퀘스트 완료(잉꼬 부부)
      starveCount:0, // 배고파서 스스로 아무거나 주워먹은 횟수
      miracle:false, // 화재 이벤트 희귀 결과(기적)
      seasonOffset: Math.floor(Math.random()*SEASONS.length), // 시작 계절 (0봄 1장마 2가을 3겨울)
      hasPartner:false, // 고양이 연인
      partnerLove:0,    // 연인 애정도 0~100
      lastDate:null,    // 직전 데이트 (연속 반복 방지)
      theft:null, stealWins:0, stealFails:0, kidReturns:0, kidReunions:0, kidSulks:0,   // 새끼 맡기기
         // 도둑고양이
      beeCat:false,   // 숨겨진 직업: 꿀벌냥이
      skills:{ passives:[], actives:[] }, hiddenUntil:0, secretCd:0, secretFound:0,   // 냥스킬
    };
  }

  /* ================= DOM refs ================= */
  const app = document.getElementById("app");
  const skyOverlayEl = document.getElementById("sky-overlay");
  const stageBadge = document.getElementById("stage-badge");
  const dayCount = document.getElementById("day-count");
  const barHunger = document.getElementById("bar-hunger");
  const barFun = document.getElementById("bar-fun");
  const heartsDisplay = document.getElementById("hearts-display");
  const trailEl = document.getElementById("trail");
  const catCaption = document.getElementById("cat-caption");
  const PLAYER_SIZE = 0.85;   // 주인공 고양이 그림 크기 (연인보다 조금 더 크게)
  let catScale = 1, catGray = false; // 방 캔버스에서 고양이를 그릴 때 체형/배고픔 반영
  const toastEl = document.getElementById("toast");
  const startOverlay = document.getElementById("start-overlay");
  const startBtn = document.getElementById("start-btn");
  const choiceOverlay = document.getElementById("choice-overlay");
  const choiceTitle = document.getElementById("choice-title");
  const choiceDesc = document.getElementById("choice-desc");
  const choiceOpts = document.getElementById("choice-opts");
  const endOverlay = document.getElementById("end-overlay");
  const restartBtn = document.getElementById("restart-btn");
  const dexBtn = document.getElementById("dex-btn");
  const dexOverlay = document.getElementById("dex-overlay");
  const dexGrid = document.getElementById("dex-grid");
  const dexCount = document.getElementById("dex-count");
  const dexCloseBtn = document.getElementById("dex-close-btn");
  const clouds = [1,2,3,4,5].map(i=> document.getElementById("cloud"+i));
  const lightningEl = document.getElementById("lightning");
  const seasonTintEl = document.getElementById("season-tint");
  const hurtTarget = document.getElementById("room-wrap");
  const barAff = document.getElementById("bar-aff");
  const barRisk = document.getElementById("bar-risk");
  const riskIcon = document.getElementById("risk-icon");

  /* ================= 고양이 표정: 상황에 따라 얼굴 아이콘이 바뀐다 ================= */
  let catMoodFace = null, catMoodUntil = 0;
  function setCatMood(face, ms){ catMoodFace = face; catMoodUntil = performance.now() + (ms || 1800); }
  // 우선순위: 방금 일어난 일(피해·먹이·승리 등) > 배고픔/지루함 > 위험 > 연인 > 평소
  let catCrownNow = false;   // 지금 얼굴 위에 왕관을 얹을지
  const RANK_FACE = { 1:"😏", 2:"😼", 3:"😐" };   // 냥아치: 우쭐 · 골목대장: 거만 · 왕: 근엄(+왕관)
  const OLD_FACE = "😴";                          // 노년기 이후: 늙은 표정
  function catFaceNow(){
    catCrownNow = false;
    if(catMoodFace && performance.now() < catMoodUntil) return catMoodFace;
    if(!state) return "🐱";
    if(strangerPresent()) return "😱";                     // 낯선 고양이가 앞에 있는 동안(이벤트 장면 포함) 계속 놀란 표정
    if(state.hunger < 25 || state.fun < 20) return "😿";   // 배고프거나 너무 심심하면 시무룩
    if(state.risk >= 70) return "😾";                      // 위험이 쌓이면 잔뜩 경계
    if(dangerAhead()) return "😱";                         // 위험이 코앞이면 화들짝
    if(state.hasPartner) return "😻";                      // 연인이 있으면 하트 눈
    if(state.turfRank >= 1){                               // 서열이 오른 뒤의 평소 표정 (노년기 이후엔 늙은 표정, 왕이면 왕관은 그대로)
      catCrownNow = state.turfRank >= 3;
      return state.stageIdx >= 4 ? OLD_FACE : (RANK_FACE[Math.min(3, state.turfRank)] || "🐱");
    }
    if(state.stageIdx >= 4) return "😴";                   // 노년기: 꾸벅꾸벅 졸린 얼굴
    if(state.stageIdx === 3) return "🥱";                  // 시니어기: 슬슬 피곤한 얼굴
    return "🐱";
  }
  // 위험한 물건에 다가가거나, 낯선 고양이가 다가오는 중이면 true
  function strangerPresent(){ return typeof stranger !== "undefined" && !!stranger && !stranger.hidden; }
  function dangerAhead(){
    if(strangerPresent()) return true;
    const o = state.roomObjects && nearbyIdx >= 0 ? state.roomObjects[nearbyIdx] : null;
    return !!(o && !o.consumed && o.item && o.item.bad && !o.item.mystery);
  }
  function drawCatFaceFx(ctx, S, face){
    const t = performance.now();
    // v36: 왕관은 필드 주인공 스프라이트에 직접 그린다 (중복 이모지 방지).
    if(face === "😻"){                                      // 하트가 폴폴
      const ph = (t % 3200) / 3200;
      ctx.save(); ctx.globalAlpha = Math.sin(Math.PI * ph); ctx.font = (15*S) + "px sans-serif";
      emoDraw(ctx, "💕", 15*S, -20*S - ph*16*S); ctx.restore();
    } else if(face === "🥴" || (face === "😿" && catMoodFace === "😿" && t < catMoodUntil)){   // 아플 때 식은땀
      ctx.save(); ctx.font = (15*S) + "px sans-serif";
      emoDraw(ctx, "💦", 17*S, -17*S + Math.sin(t/160) * 2*S); ctx.restore();
    }
  }

  /* ================= 컨디션·피해 연출 (파티클 속도 + 게임 화면 흔들림) ================= */
  const bgPlayer = (function(){
    let current = 1, target = 1, raf = null;
    let hurtUntil = 0, hurtTimer = null;

    function tick(){
      const diff = target - current;
      if(Math.abs(diff) < 0.005){ current = target; raf = null; return; }
      current += diff * 0.06;
      raf = requestAnimationFrame(tick);
    }
    function setTarget(v){
      target = Math.max(0.2, Math.min(1, v));
      if(raf === null) raf = requestAnimationFrame(tick);
    }
    function ambient(){
      if(!state || !state.running) return 1;
      let r = 1;
      const cond = Math.min(state.hunger, state.fun);
      if(cond < 65) r -= (65 - cond) / 65 * 0.34;
      if(state.risk > 40) r -= (state.risk - 40) / 60 * 0.14;
      if(state.weakened > 0) r -= 0.10;
      if(state.stageIdx >= 3) r -= 0.05 * (state.stageIdx - 2);
      return Math.max(0.42, r);
    }
    return {
      rate(){ return current; },
      cinematic(on){
        clearTimeout(hurtTimer);
        if(on){ hurtUntil = Date.now() + 600000; setTarget(0.5); }
        else { hurtUntil = 0; setTarget(ambient()); }
      },
      sync(){ if(Date.now() < hurtUntil) return; setTarget(ambient()); },
      hurt(strength){
        const s = Math.max(0.15, Math.min(0.8, strength || 0.4));
        const dur = 420 + 1100 * s;
        setCatMood(s >= 0.45 ? "🥴" : "😿", dur + 900);   // 피해를 입으면 표정이 일그러진다
        hurtUntil = Date.now() + dur;
        clearTimeout(hurtTimer);
        current = Math.max(0.18, ambient() - s);
        target = current;
        if(hurtTarget){
          hurtTarget.classList.remove("hurt");
          void hurtTarget.offsetWidth;
          hurtTarget.classList.add("hurt");
          setTimeout(()=> hurtTarget.classList.remove("hurt"), dur);
        }
        hurtTimer = setTimeout(()=>{ hurtUntil = 0; setTarget(ambient()); }, dur);
      },
      fade(){
        hurtUntil = Date.now() + 4000;
        clearTimeout(hurtTimer);
        setTarget(0.3);
        target = 0.3;
      },
      reset(){
        hurtUntil = 0; clearTimeout(hurtTimer);
        if(hurtTarget) hurtTarget.classList.remove("hurt");
        current = 1; target = 1;
      }
    };
  })();

  /* ================= 렌더 ================= */
  function clamp(v){ return Math.max(0, Math.min(100, v)); }

  // 노년기로 갈수록 재미도 상승폭이 줄어듦 · 모험가 성향이면 재미 상승폭이 커짐
  function scaleFun(delta){
    if(delta <= 0) return delta;
    let d = delta;
    if(state.stageIdx >= 3) d *= 0.5;
    if(state.adventurous) d *= 1.2;
    return d;
  }

  function applyEffToState(eff){
    if(!eff) return;
    state.hunger = clamp(state.hunger + (eff.hunger||0));
    state.fun = clamp(state.fun + scaleFun(eff.fun||0));
    let affDelta = eff.affection||0;
    if(!state.adopted && affDelta > 0){ affDelta = 0; state._affBlocked = true; } // 냥줍(입양)되기 전엔 애정도가 오르지 않음
    state.affection = clamp(state.affection + affDelta);
    state.weight = Math.max(-20, Math.min(45, state.weight + (eff.weight||0)));
    state.risk = Math.max(0, Math.min(100, state.risk + (eff.risk||0)));
  }

  function renderSky(){
    const r = clamp(state.risk);
    const sunny = ["#9A95B3","#B5B0C8","#D2CEDF"];
    const cloudy = ["#8B85A8","#C9C4D8","#F2EFF7"];
    function mix(a,b,t){
      const pa = hexToRgb(a), pb = hexToRgb(b);
      const r = Math.round(pa[0]+(pb[0]-pa[0])*t);
      const g = Math.round(pa[1]+(pb[1]-pa[1])*t);
      const bl = Math.round(pa[2]+(pb[2]-pa[2])*t);
      return `rgb(${r},${g},${bl})`;
    }
    function hexToRgb(h){
      const v = h.replace("#","");
      return [parseInt(v.substr(0,2),16), parseInt(v.substr(2,2),16), parseInt(v.substr(4,2),16)];
    }
    const t = r/100;
    const c1 = mix(sunny[0], cloudy[0], t);
    const c2 = mix(sunny[1], cloudy[1], t);
    const c3 = mix(sunny[2], cloudy[2], t);
    skyOverlayEl.style.background = `linear-gradient(180deg, ${c1} 0%, ${c2} 55%, ${c3} 100%)`;
    skyOverlayEl.style.opacity = ((r/100) * 0.38).toFixed(2);

    // 위험도에 따라 구름이 단계적으로 몰려옴
    const cloudThresholds = [15, 28, 42, 58, 72];
    clouds.forEach((cloudEl, i)=>{
      if(!cloudEl) return;
      const th = cloudThresholds[i];
      const op = Math.max(0, Math.min(0.85, (r - th) / 22));
      cloudEl.style.opacity = op.toFixed(2);
    });

    // 계절감 틴트: 장마엔 푸르스름하게, 겨울엔 하얗게
    const seasonName = getSeason(state.day).name;
    if(seasonName === "장마"){
      seasonTintEl.style.background = "linear-gradient(180deg, rgba(90,120,180,0.18), rgba(90,120,180,0.05))";
      seasonTintEl.style.opacity = "1";
    } else if(seasonName === "겨울"){
      seasonTintEl.style.background = "linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0.05))";
      seasonTintEl.style.opacity = "1";
    } else {
      seasonTintEl.style.opacity = "0";
    }

    setFxSeason(seasonName);
  }

  function isStormy(){
    return state.risk >= 78 || state.hunger < 15 || state.fun < 15;
  }

  /* ================= 컷신 (레터박스) ================= */
  const csEl     = document.getElementById("cutscene");
  const csBody   = document.getElementById("cs-body");
  const csEmoji  = document.getElementById("cs-emoji");
  const csText   = document.getElementById("cs-text");
  const csNext   = document.getElementById("cs-next");
  const csOpts   = document.getElementById("cs-opts");
  let csRun = null;
  let csClosing = false;

  /* ---------- 큰 이벤트 순서 대기열 ----------
     컷신·선택창·화재·엔딩이 서로 끼어들지 않도록, 진행 중인 큰 이벤트가 끝난 뒤에 차례대로 시작한다. */
  let eventHoldUntil = 0;
  const eventQueue = [];
  let eventPump = null;
  function bigEventBusy(){
    return csRun !== null || csClosing
      || choiceOverlay.classList.contains("show") || endOverlay.classList.contains("show") || dexOverlay.classList.contains("show")
      || !!state.fireEvent || !!state.roadGame || !!state.autoLock || !!state.minigame || !!state.napping
      || Date.now() < eventHoldUntil;
  }
  function holdEvents(ms){ eventHoldUntil = Math.max(eventHoldUntil, Date.now() + ms); }
  function pumpEvents(){
    // 튜토리얼을 읽는 동안 대기 중인 스토리 이벤트도 시작하지 않는다.
    if(window.__catroadTutorialPaused) return;
    if(state.gameOver){ eventQueue.length = 0; }
    if(!eventQueue.length){ clearInterval(eventPump); eventPump = null; return; }
    if(bigEventBusy()) return;
    const fn = eventQueue.shift();
    try{ fn(); }catch(err){ console.error(err); }
    holdEvents(250);   // 방금 시작한 이벤트가 화면을 잡을 때까지 다음 차례는 잠깐 기다린다
  }
  function runWhenIdle(fn){
    eventQueue.push(fn);
    if(!eventPump) eventPump = setInterval(pumpEvents, 200);
  }
  /* 방 안에 있는 동안엔 선택 이벤트·화재 같은 큰 사건을 미뤄 두었다가, 방을 나설 때 띄운다
     (창고 츄르를 다 챙기기 전에 사건이 끼어들어 먹이를 잃는 일이 없도록) */
  let _exitQueue = [];
  function whenLeavingRoom(fn){ _exitQueue.push(fn); }
  function flushRoomExit(){
    if(!_exitQueue.length) return false;
    const list = _exitQueue.splice(0, _exitQueue.length);
    list.forEach(fn=> runWhenIdle(fn));
    return true;
  }
  function maybeOpenModal(){
    if(!state || state.itemsEatenSinceModal < state.modalTarget) return;
    if(_exitQueue.some(f=> f._isModal)) return;          // 이미 나설 때를 기다리는 중
    const f = ()=>{ if(state && !state.gameOver && state.itemsEatenSinceModal >= state.modalTarget) openChoiceModal(); };
    f._isModal = true; whenLeavingRoom(f);
  }
  /* 이벤트가 끝난 직후 다음 큰 이벤트가 바로 이어 뜨면 헷갈리니, 끝난 뒤 잠깐의 텀을 둔다 */
  const EVENT_GAP_MS = 3500;          // 연달아 이어지는 이벤트(컷신 체인 등) 사이
  const QUIET_MS = 11000;             // 행동 선택 뒤, 새 우연 이벤트가 뜨기 전까지 조용히 지내는 시간
  let quietUntil = 0;
  let _wasBusy = false;
  setInterval(()=>{
    if(window.__catroadTutorialPaused) return;
    const raw = !!state && (csRun !== null || csClosing || choiceOverlay.classList.contains("show") || endOverlay.classList.contains("show")
      || !!state.fireEvent || !!state.roadGame || !!state.minigame);
    if(_wasBusy && !raw){ holdEvents(EVENT_GAP_MS); quietUntil = Date.now() + QUIET_MS; }
    _wasBusy = raw;
  }, 100);
  function resetEventQueue(){ _exitQueue.length = 0; eventQueue.length = 0; eventHoldUntil = 0; csClosing = false; loverMate.ready = false; }
  // 컷신 여러 개를 순서대로 (예: 보스 승리 → 왕 즉위)
  function playCutsceneChain(list, done){
    if(!list.length){ if(done) done(); return; }
    playCutscene({ panels:list[0], fade:(list[0] === CUT.adopted) }, ()=>{ if(list.length > 1) playCutsceneChain(list.slice(1), done); else if(done) done(); });
  }

  function cutsceneActive(){ return csRun !== null; }

  const dimEl = document.getElementById("dim-fade");
  let dimOn = false, dimT = 0;
  function dimIn(ms, kind, cb){          // 화면을 서서히 어둡게 (이미 어두우면 바로 이어간다)
    clearTimeout(dimT);
    dimEl.classList.toggle("fire", kind === "fire"); dimEl.classList.add("block");
    if(dimOn){ if(cb) cb(); return; }
    dimOn = true; dimEl.style.transition = "opacity " + ms + "ms ease"; dimEl.style.opacity = "1";
    dimT = setTimeout(()=>{ if(cb) cb(); }, ms);
  }
  function dimOut(ms){                   // 다시 서서히 밝게
    clearTimeout(dimT);
    dimOn = false; dimEl.style.transition = "opacity " + (ms || 900) + "ms ease"; dimEl.style.opacity = "0";
    dimT = setTimeout(()=> dimEl.classList.remove("block"), (ms || 900) + 50);
  }
  function dimFlash(kind, inMs, holdMs, outMs, mid){   // 번쩍 어두워졌다 밝아지며 장면이 바뀐다
    dimIn(inMs, kind, ()=>{ if(mid) mid(); setTimeout(()=> dimOut(outMs), holdMs); });
  }

  function playCutscene(cfg, onDone){
    if(!cfg || !cfg.panels || !cfg.panels.length){ if(onDone) onDone(); return; }
    const _fade = !!cfg.fade;
    csRun = {
      panels: cfg.panels,
      i: 0,
      opts: cfg.opts || null,
      onPick: cfg.onPick || null, onPickStart: cfg.onPickStart || null,
      onDone: onDone || null,
      autoMs: cfg.autoMs || 0,
      autoT: 0,
      locked: true            // 레터박스가 닫히는 동안의 오클릭 방지
    };
    setBackgroundInteractive(false);
    const _st = csRun;
    const _open = ()=>{
      if(csRun !== _st) return;
      sfx("cutStart");
      app.classList.add("cs-on");
      csEl.classList.add("show");
      bgPlayer.cinematic(true);
      setTimeout(()=>{ if(csRun === _st) csRun.locked = false; }, 520);
      renderCsPanel();
    };
    if(_fade){ _st.locked = true; dimIn(cfg.fadeKind === "fire" ? 1200 : 850, cfg.fadeKind, ()=>{ _open(); setTimeout(()=> dimOut(1000), 150); }); }
    else _open();
  }

  const csIllust = document.getElementById("cs-illust");
  const csImg = document.getElementById("cs-img");

  function renderCsPanel(){
    const st = csRun; if(!st) return;
    const p = st.panels[st.i];
    const last = st.i === st.panels.length - 1;

    if(p.img){
      csImg.src = p.img;
      csImg.classList.remove("cutout");
      csIllust.classList.add("on");
    } else {
      csIllust.classList.remove("on");
    }
    csEmoji.textContent = (p.emoji && !p.img) ? p.emoji : "";
    csEmoji.style.display = (p.emoji && !p.img) ? "" : "none";
    csText.textContent = p.text || "";
    csText.style.display = p.text ? "" : "none";

    csBody.classList.remove("enter");
    void csBody.offsetWidth;          // 리플로우 → 애니메이션 리플레이
    csBody.classList.add("enter");
    if(st.autoMs){ clearTimeout(st.autoT); const at = st.i; st.autoT = setTimeout(()=>{ if(csRun === st && st.i === at) advanceCutscene(); }, st.autoMs); }

    if(last && st.opts && st.opts.length){
      csNext.style.display = "none";
      csOpts.style.display = "";
      csOpts.innerHTML = "";
      st.opts.forEach(opt=>{
        const b = document.createElement("button");
        b.className = "cs-opt";
        b.innerHTML = `<b>${opt.label}</b>` + (opt.sub ? `<span>${opt.sub}</span>` : "");
        b.addEventListener("click", ev=>{
          ev.stopPropagation();
          const pick = st.onPick;
          if(st.onPickStart) st.onPickStart(opt);
          closeCutscene(()=>{ if(pick) pick(opt); });
        });
        csOpts.appendChild(b);
      });
    } else {
      csOpts.style.display = "none";
      csOpts.innerHTML = "";
      csNext.style.display = "";
      csNext.textContent = last ? "클릭해서 닫기 ▸" : "클릭해서 계속 ▸";
    }
  }

  function advanceCutscene(){
    const st = csRun;
    if(!st || st.locked) return;
    const last = st.i === st.panels.length - 1;
    // 선택지가 떠 있으면 클릭으로 넘길 수 없다 (실수로 골라지는 것 방지)
    if(last && st.opts && st.opts.length) return;
    if(last){ closeCutscene(st.onDone); return; }
    st.i++;
    sfx("cut");
    renderCsPanel();
  }

  function closeCutscene(after){
    csRun = null;
    csClosing = true;      // 닫히는 동안에도 다른 큰 이벤트가 끼어들지 못하게
    csEl.classList.remove("show");
    app.classList.remove("cs-on");
    bgPlayer.cinematic(false);
    setTimeout(()=>{
      csClosing = false;
      setBackgroundInteractive(true);
      if(after) after();
      holdEvents(150);
    }, 400);
  }

  csEl.addEventListener("click", advanceCutscene);
  window.addEventListener("keydown", e=>{
    if(!cutsceneActive()) return;
    if(e.key === " " || e.key === "ArrowRight"){
      e.preventDefault();
      e.stopPropagation();
      advanceCutscene();
    }
  }, true);

  /* ---------- 컷신 일러스트 (사용자 제공, 베이스64 인라인) ---------- */
  const CUT_IMG = {
    thiefCaught: __IMG.CUT_IMG_thiefCaught,
    beeCat: __IMG.CUT_IMG_beeCat,
    lovebirds1: __IMG.CUT_IMG_lovebirds1,
    lovebirds2: __IMG.CUT_IMG_lovebirds2,
    lovebirds3: __IMG.CUT_IMG_lovebirds3,
    adoptedAlone: __IMG.CUT_IMG_adoptedAlone,
    adoption1: __IMG.CUT_IMG_adoption1,
    adoption2: __IMG.CUT_IMG_adoption2,
    kingWall: __IMG.CUT_IMG_kingWall,
    kitten: __IMG.CUT_IMG_kitten,
    kittenIndependence: __IMG.CUT_IMG_kittenIndependence,
    leaderDark: __IMG.CUT_IMG_leaderDark,
    leaderBright: __IMG.CUT_IMG_leaderBright,
    trap1: __IMG.CUT_IMG_trap1,
    trap2: __IMG.CUT_IMG_trap2,
    rich: __IMG.CUT_IMG_rich,
    fire1: __IMG.CUT_IMG_fire1,
    fire2: __IMG.CUT_IMG_fire2,
    fire3: __IMG.CUT_IMG_fire3,
    rank1a: __IMG.CUT_IMG_rank1a,
    rank1b: __IMG.CUT_IMG_rank1b,
    rank2: __IMG.CUT_IMG_rank2,
    bossWin: __IMG.CUT_IMG_bossWin,
  };

  /* ---------- 컷신 대본 ---------- */
  const CUT = {
    // 2컷은 그림 속에 대사(말풍선)가 이미 그려져 있어 별도 자막(text)을 비워둔다 (1컷은 갑작스럽지 않게 발소리 자막을 먼저 보여 준다)
    adoption: [
      { img: CUT_IMG.adoption1, text:"저벅… 저벅…\n어디선가 낯선 발소리가 들려온다." },
      { img: CUT_IMG.adoption2, text:"" },
    ],
    leader: [
      { img: CUT_IMG.leaderDark, text:"골목의 공기가 문득 무거워진다.\n어둠 속에서 그림자들이 하나둘 모여든다." },
      { img: CUT_IMG.leaderBright, text:"이 골목의 대장냥이다.\n\n\u201c여기서 살고 싶다면… 자격을 증명해봐.\u201d" },
    ],
    fire: [
      { img: CUT_IMG.fire1, text:"여느 때와 다를 것 없는 밤이었다." },
      { img: CUT_IMG.fire2, text:"매캐한 냄새에 눈을 떴을 때,\n집 안은 이미 온통 붉은빛이었다." },
      { img: CUT_IMG.fire3, text:"연기를 뚫고 정신없이 달렸다.\n정신을 차려보니, 한 번도 와본 적 없는 동네다." },
    ],
    adopted: [
      { img: CUT_IMG.adoptedAlone, text:"…그런데 이상하게, 무섭지 않았다." },
    ],
    lovebirds: [
      { img: CUT_IMG.lovebirds1, text:"귀한 츄르를 입에 물고 한달음에 달려왔다.\n“…이걸, 나한테?”" },
      { img: CUT_IMG.lovebirds2, text:"작은 벌레, 큰 참새, 그리고 츄르 하나.\n서로에게 가장 좋은 것을 나누며 하루하루를 쌓아왔다." },
      { img: CUT_IMG.lovebirds3, text:"골목의 고양이들이 둘을 올려다보며 수군거린다.\n“…저 둘, 정말 잉꼬 부부 같아.”" },
    ],
    rich: [
      { img: CUT_IMG.rich, text:"물어다 준 종이 뭉치가 어느새 한가득.\n집사의 표정이 달라졌다.\n\n오늘부터 간식의 등급이 올라간다." },
    ],
    kitten: [
      { img: CUT_IMG.kitten, text:"작고 따뜻한 것들이 배에 파고든다.\n\n이제 이 고양이는 혼자가 아니다." },
    ],
    // 성장한 아이들이 가족의 품을 떠나는 순간 — 컷씬이 끝나기 전에는 새끼를 지우지 않는다.
    kittenIndependence: [
      { img: CUT_IMG.kittenIndependence, text:"어느덧 혼자서도 골목을 걸을 만큼 자랐다.\n한 번 뒤돌아본 아이들은 새로운 길로 발걸음을 옮겼다.\n\n씩씩하게 잘 지내렴." },
    ],
    king: [
      { img: CUT_IMG.kingWall, text:"골목 끝까지, 이제 아무도 앞을 막지 않는다.\n\n고양이들의 왕이 되었다." },
    ],
    rank1: [
      { img: CUT_IMG.rank1a, text:"으르렁거리던 상대가 먼저 꼬리를 내렸다.\n\n골목에서 슬슬 눈치를 보는 고양이들이 생겼다." },
      { img: CUT_IMG.rank1b, text:"어깨를 펴고 걷는다.\n\n오늘부터 이 고양이는 '냥아치'다." },
    ],
    rank2: [
      { img: CUT_IMG.rank2, text:"골목 가득한 고양이들이 이쪽을 바라본다.\n이제 이 동네에서 이 고양이를 모르는 고양이는 없다.\n\n동네 대장이 되었다." },
    ],
    bossWin: [
      { img: CUT_IMG.bossWin, text:"보스 고양이가 휘청이며 뒤로 물러난다.\n한참 말없이 바라보다 고개를 숙였다." },
    ],
    trapEnd: [
      { img: CUT_IMG.trap1, text:"딸깍.\n이번엔 소리가 유난히 크게 들렸다." },
      { img: CUT_IMG.trap2, text:"다리가 말을 듣지 않는다.\n걸어온 길이 여기서 멈춘다." },
    ],
  };

  /* ================= 계절 파티클 ================= */
  const fxCanvas = document.getElementById("fx-layer");
  const fxCtx = fxCanvas ? fxCanvas.getContext("2d") : null;
  let fxW = 0, fxH = 0, fxParticles = [], fxSeason = null, fxRaf = null, fxLast = 0;

  const FX_CONF = {
    "봄":   { kind:"petal", count:44,  colors:["#FFD3E2","#FFC0D4","#FFE9F1","#F9AEC8","#FFFFFF"] },
    "장마": { kind:"rain",  count:170, colors:["#BED7F0","#D6E7F7","#A9C6E4"] },
    "가을": { kind:"leaf",  count:40,  colors:["#E2703A","#D2543C","#E8A33D","#C4602C","#F0C069"] },
    "겨울": { kind:"snow",  count:80,  colors:["#FFFFFF","#EAF4FF","#F6FBFF"] },
  };

  function resizeFx(){
    if(!fxCanvas) return;
    const r = app.getBoundingClientRect();
    fxW = Math.max(1, r.width); fxH = Math.max(1, r.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    fxCanvas.width = Math.round(fxW * dpr);
    fxCanvas.height = Math.round(fxH * dpr);
    fxCanvas.style.width = fxW + "px";
    fxCanvas.style.height = fxH + "px";
    fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resizeFx);

  function makeFx(kind, colors, seeded){
    const p = {
      x: Math.random() * (fxW + 120) - 60,
      y: seeded ? Math.random() * fxH : -30 - Math.random() * 140,
      c: colors[Math.floor(Math.random() * colors.length)]
    };
    if(kind === "rain"){
      p.len = 11 + Math.random() * 20;
      p.vy  = 9 + Math.random() * 7;
      p.vx  = -1.8 - Math.random() * 1.4;
      p.w   = 0.8 + Math.random() * 1.1;
      p.a   = 0.28 + Math.random() * 0.42;
    } else if(kind === "snow"){
      p.r  = 1.4 + Math.random() * 2.8;
      p.vy = 0.45 + Math.random() * 1.0;
      p.vx = -0.2 + Math.random() * 0.4;
      p.sw = Math.random() * Math.PI * 2;
      p.ss = 0.010 + Math.random() * 0.018;
      p.amp = 0.5 + Math.random() * 1.1;
      p.a  = 0.55 + Math.random() * 0.45;
    } else { // petal / leaf
      p.size = kind === "leaf" ? 5 + Math.random() * 6 : 3.5 + Math.random() * 3.5;
      p.vy   = kind === "leaf" ? 0.85 + Math.random() * 1.15 : 0.45 + Math.random() * 0.8;
      p.vx   = -0.35 + Math.random() * 1.15;
      p.rot  = Math.random() * Math.PI * 2;
      p.vr   = -0.045 + Math.random() * 0.09;
      p.sw   = Math.random() * Math.PI * 2;
      p.ss   = 0.013 + Math.random() * 0.026;
      p.amp  = kind === "leaf" ? 1.1 + Math.random() * 1.4 : 0.7 + Math.random() * 1.0;
      p.a    = 0.6 + Math.random() * 0.4;
    }
    return p;
  }

  function fxTargetCount(conf){
    if(!conf) return 0;
    let n = conf.count;
    if(conf.kind === "rain" && typeof isStormy === "function" && state && state.running && isStormy()) n = Math.round(n * 1.5);
    return n;
  }

  function setFxSeason(name, instant){
    if(!fxCanvas) return;
    if(name === fxSeason) return;
    fxSeason = name;
    const conf = FX_CONF[name];
    fxParticles = [];
    if(conf){
      const n = fxTargetCount(conf);
      for(let i = 0; i < n; i++) fxParticles.push(makeFx(conf.kind, conf.colors, true));
      fxCanvas.classList.add("on");
    } else {
      fxCanvas.classList.remove("on");
    }
    if(instant) resizeFx();
  }

  function drawFx(){
    const conf = FX_CONF[fxSeason];
    fxCtx.clearRect(0, 0, fxW, fxH);
    if(!conf) return;
    const kind = conf.kind;
    for(let i = 0; i < fxParticles.length; i++){
      const p = fxParticles[i];
      fxCtx.globalAlpha = p.a;
      if(kind === "rain"){
        fxCtx.strokeStyle = p.c;
        fxCtx.lineWidth = p.w;
        fxCtx.lineCap = "round";
        fxCtx.beginPath();
        fxCtx.moveTo(p.x, p.y);
        fxCtx.lineTo(p.x + p.vx * (p.len / p.vy), p.y + p.len);
        fxCtx.stroke();
      } else if(kind === "snow"){
        fxCtx.fillStyle = p.c;
        fxCtx.beginPath();
        fxCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        fxCtx.fill();
      } else {
        fxCtx.save();
        fxCtx.translate(p.x, p.y);
        fxCtx.rotate(p.rot);
        fxCtx.fillStyle = p.c;
        fxCtx.beginPath();
        // 회전에 따라 납작해져서 팔랑거리는 느낌
        const flip = Math.abs(Math.cos(p.sw));
        if(kind === "leaf"){
          fxCtx.ellipse(0, 0, p.size, p.size * (0.42 + 0.3 * flip), 0, 0, Math.PI * 2);
          fxCtx.fill();
          fxCtx.strokeStyle = "rgba(120,60,20,0.35)";
          fxCtx.lineWidth = 0.7;
          fxCtx.beginPath();
          fxCtx.moveTo(-p.size, 0); fxCtx.lineTo(p.size, 0);
          fxCtx.stroke();
        } else {
          fxCtx.ellipse(0, 0, p.size, p.size * (0.5 + 0.38 * flip), 0, 0, Math.PI * 2);
          fxCtx.fill();
        }
        fxCtx.restore();
      }
    }
    fxCtx.globalAlpha = 1;
  }

  function fxStep(ts){
    fxRaf = requestAnimationFrame(fxStep);
    if(!fxCtx) return;
    if(document.hidden) return;
    if(!fxLast) fxLast = ts;
    let dt = (ts - fxLast) / 16.667;
    fxLast = ts;
    if(dt > 3) dt = 3;

    const conf = FX_CONF[fxSeason];
    if(!conf){ fxCtx.clearRect(0, 0, fxW, fxH); return; }

    // 고양이가 느려지면 날리는 것들도 같이 느려진다
    const rate = 0.45 + 0.55 * (bgPlayer.rate());
    const s = dt * rate;
    const kind = conf.kind;

    // 폭우일 땐 빗줄기를 더 늘린다
    const want = fxTargetCount(conf);
    if(fxParticles.length < want){
      fxParticles.push(makeFx(kind, conf.colors, false));
    } else if(fxParticles.length > want + 8){
      fxParticles.length = want;
    }

    for(let i = 0; i < fxParticles.length; i++){
      const p = fxParticles[i];
      if(kind === "rain"){
        p.x += p.vx * s;
        p.y += p.vy * s;
      } else if(kind === "snow"){
        p.sw += p.ss * s;
        p.x += (p.vx + Math.sin(p.sw) * p.amp * 0.5) * s;
        p.y += p.vy * s;
      } else {
        p.sw += p.ss * s;
        p.rot += p.vr * s;
        p.x += (p.vx + Math.sin(p.sw) * p.amp) * s;
        p.y += p.vy * s;
      }
      if(p.y > fxH + 40 || p.x < -90 || p.x > fxW + 90){
        fxParticles[i] = makeFx(kind, conf.colors, false);
      }
    }
    drawFx();
  }

  function startFx(){
    if(!fxCtx) return;
    resizeFx();
    // 캔버스 크기를 알기 전에 뿌려둔 입자가 있으면 다시 고르게 흩뿌린다
    const cur = fxSeason;
    if(cur){ fxSeason = null; setFxSeason(cur); }
    if(fxRaf === null) fxRaf = requestAnimationFrame(fxStep);
  }

  let stormTimer = null;
  function ensureStormLoop(){
    if(stormTimer) return;
    stormTimer = setInterval(()=>{
      if(!state || !state.running){ return; }
      if(isStormy() && Math.random() < 0.55){
        lightningEl.classList.remove("flash");
        void lightningEl.offsetWidth; // 리플레이를 위한 리플로우 트리거
        lightningEl.classList.add("flash");
      }
    }, 1800);
  }

  function snapStats(){
    return { hunger:state.hunger, fun:state.fun, affection:state.affection, risk:state.risk };
  }
  function showDeltas(before){
    if(!before || !state) return;
    [["hunger","stat-hunger"],["fun","stat-fun"],["affection","stat-aff"],["risk","stat-risk"]].forEach(([key,id])=>{
      const diff = Math.round(state[key] - before[key]);
      if(!diff) return;
      let host = document.getElementById(id);
      const _ih = document.querySelector('#isaac-hud [data-k="' + key + '"]');
      if(_ih && app.classList.contains("isaac-ui")) host = _ih;
      if(!host) return;
      const good = key === "risk" ? diff < 0 : diff > 0;
      const d = document.createElement("div");
      d.className = "delta " + (good ? "up" : "down");
      d.textContent = (diff > 0 ? "+" : "") + diff;
      host.appendChild(d);
      setTimeout(()=> d.remove(), 1600);
      host.classList.remove("pulse"); void host.offsetWidth; host.classList.add("pulse");
    });
  }

  function renderStats(){
    try{ renderIsaacHud(); }catch(err){}
    barHunger.style.width = state.hunger + "%";
    barHunger.style.background = state.hunger < 25 ? "var(--bad)" : "var(--coral)";
    barFun.style.width = state.fun + "%";
    barFun.style.background = state.fun < 25 ? "var(--bad)" : "#5BA6E5";
    barAff.style.width = clamp(state.affection) + "%";
    barRisk.style.width = clamp(state.risk) + "%";
    barRisk.style.background = state.risk >= 70 ? "var(--bad)" : (state.risk >= 40 ? "#E8A33D" : "var(--good)");
    riskIcon.textContent = state.risk >= 75 ? "⛈️" : (state.risk >= 50 ? "☁️" : (state.risk >= 25 ? "⛅" : "☀️"));

    const heartCount = Math.round(clamp(state.affection)/20);
    let h = "";
    for(let i=0;i<5;i++) h += i < heartCount ? "❤️" : "🤍";
    heartsDisplay.textContent = h;

    const loveBox = document.getElementById("stat-love");
    if(loveBox){
      loveBox.style.display = state.hasPartner ? "" : "none";
      if(state.hasPartner){
        const st = Math.max(0, Math.min(4, state.loveStage || 0));
        document.getElementById("love-icon").textContent = LOVE_HEARTS[st];
        document.getElementById("love-carry").innerHTML = state.carry ? ("<span class=\"lc-t\">물고 있음 </span>" + state.carry.icon) : "";
        const g = LOVE_GOALS[st];
        loveBox.title = st === 0 ? "연인과 첫 데이트를 해 보자 (연인을 만나 Space)"
          : (st >= 4 ? "💞 모든 단계 완료! 잉꼬 부부" : "다음 선물: " + g.icon + " " + g.name + (state.carry ? " (물고 있음! 연인에게 가져가자)" : ""));
      }
    }

    let stageLabel = STAGES[state.stageIdx];
    if(state.turfRank > 0) stageLabel += " · " + TURF_RANK_NAMES[state.turfRank];
    if(state.turfRank >= 3 || state.extLeft > 0) stageLabel += " · 👑 조공 " + (state.tributeCount || 0) + "회" + ((state.extLeft > 0 && window.innerWidth > 640) ? " (남은 " + state.extLeft + "일)" : "");
    stageBadge.textContent = stageLabel;
    try{ renderTributeBoxes(-1); }catch(err){}
    const season = getSeason(state.day);
    dayCount.textContent = state.day + "일차 · " + season.icon + " " + ((SEASON_FOLLOWS_STAGE && state.stageIdx === STAGES.length - 1) ? "이듬해 " : "") + season.name;

    const w = state.weight;
    catScale = Math.max(0.72, Math.min(1.2, 1 + w/90));   // 통통해져도 최대 1.2배
    catGray = state.hunger < 20;

    let caption;
    if(state.muscleCount >= 6) caption = "근육냥이 💪";
    else if(w > 18) caption = "포동포동 통통이";
    else if(w < -8) caption = "홀쭉이";
    else caption = "평범한 몸매";
    if(state.fun < 25) caption += " · 축 처짐";
    if(state.affection >= 80) caption += " · 애교쟁이";
    if(state.richCat) caption += " · 부잣집 고양이";
    if(state.adventurous) caption += " · 모험가";
    if(state.hasPartner) caption += " · 💕 연인";
    if(state.beeCat) caption += " · 꿀벌냥이 🐝";
    if(state.personality) caption += state.personality === "introvert" ? " · 내성적" : " · 외향적";
    catCaption.textContent = caption;
  }

  function iconFor(item){
    if(!item) return "❔";
    return (item.mystery && !hasSkill("whisker")) ? "❓" : item.icon;
  }
  function labelFor(item){
    if(item.mystery && !hasSkill("whisker")) return "정체불명의 물건";
    return (item.key === "feeder" && state && state.adopted && state.currentLoc === "home") ? "집사" : item.label;   // 집에서 밥을 챙겨주는 사람은 집사
  }

// 장소 이륨/아이콘: 입양 전/후 보교자리 <-> 집 표시가 다릅다
  function locDisplayName(loc){
    if(loc.id === "home") return state.adopted ? "집" : "보금자리";
    return loc.name;
  }
  function locDisplayIcon(loc){
    if(loc.id === "home") return state.adopted ? "\uD83C\uDFE0" : "\uD83D\uDCE6";
    return loc.icon;
  }

  /* ================= 방 캔버스 엔진 ================= */
  const player = { x:0, y:0, speed:2.6, face:1 };   // face: 1=오른쪽, -1=왼쪽

  /* 표정 8장 · 대치 컷씬 4장 · 횡단보도 도로 (한 HTML 안에 저장) */
  const MYO_ART = {"face":["assets/img_4.webp","assets/img_5.webp","assets/img_6.webp","assets/img_7.webp","assets/img_8.webp","assets/img_9.webp","assets/img_10.webp","assets/img_11.webp"],"extra":{"roadCrossing":"assets/roadCrossing.webp","normal":"assets/normal.webp","bully":"assets/bully.webp","leader":"assets/leader.webp","boss":"assets/boss.webp"},"rankCream":["assets/img_12.webp","assets/img_13.webp","assets/img_14.webp","assets/img_15.webp","assets/img_16.webp","assets/img_17.webp","assets/img_18.webp","assets/img_19.webp","assets/img_20.webp","assets/img_21.webp","assets/img_22.webp","assets/img_23.webp"],"loverTabby":["assets/img_24.webp","assets/img_25.webp","assets/img_26.webp","assets/img_27.webp","assets/img_28.webp","assets/img_29.webp","assets/img_30.webp","assets/img_31.webp"],"roadTwoLane":"assets/roadTwoLane.webp"};

  /* === 묘적 v36: 유효한 개별 PNG만 사용한 새 고양이 그림 (HTML에 완전 내장) === */
  const V36_CAT_SRC = {"player_walk_0":"assets/player_walk_0.webp","player_walk_1":"assets/player_walk_1.webp","player_walk_2":"assets/player_walk_2.webp","player_walk_3":"assets/player_walk_3.webp","player_left_0":"assets/player_left_0.webp","player_left_1":"assets/player_left_1.webp","player_left_2":"assets/player_left_2.webp","player_left_3":"assets/player_left_3.webp","face_default":"assets/face_default.webp","face_happy":"assets/face_happy.webp","face_yummy":"assets/face_yummy.webp","face_love":"assets/face_love.webp","face_scared":"assets/face_scared.webp","face_sad":"assets/face_sad.webp","face_angry":"assets/face_angry.webp","face_smug":"assets/face_smug.webp","face_confident":"assets/face_confident.webp","face_regal":"assets/face_regal.webp","face_tired":"assets/face_tired.webp","face_sleepy":"assets/face_sleepy.webp","face_hurt":"assets/face_hurt.webp","pose_stand":"assets/pose_stand.webp","pose_sit":"assets/pose_sit.webp","pose_lie":"assets/pose_lie.webp","pose_sleep":"assets/pose_sleep.webp","lover_walk_0":"assets/lover_walk_0.webp","lover_walk_1":"assets/lover_walk_1.webp","lover_walk_2":"assets/lover_walk_2.webp","lover_walk_3":"assets/lover_walk_3.webp","lover_left_0":"assets/lover_left_0.webp","lover_left_1":"assets/lover_left_1.webp","lover_left_2":"assets/lover_left_2.webp","lover_left_3":"assets/lover_left_3.webp","lover_sit":"assets/lover_sit.webp","crown":"assets/crown.webp","kitten_calico_walk_0":"assets/kitten_calico_walk_0.webp","kitten_calico_walk_1":"assets/kitten_calico_walk_1.webp","kitten_calico_walk_2":"assets/kitten_calico_walk_0.webp","kitten_calico_walk_3":"assets/kitten_calico_walk_1.webp","kitten_brown_walk_0":"assets/kitten_brown_walk_0.webp","kitten_brown_walk_1":"assets/kitten_brown_walk_1.webp","kitten_brown_walk_2":"assets/kitten_brown_walk_0.webp","kitten_brown_walk_3":"assets/kitten_brown_walk_1.webp","kitten_beige_walk_0":"assets/kitten_beige_walk_0.webp","kitten_beige_walk_1":"assets/kitten_beige_walk_1.webp","kitten_beige_walk_2":"assets/kitten_beige_walk_0.webp","kitten_beige_walk_3":"assets/kitten_beige_walk_1.webp"};
  const V36_CAT_IMG = {};
  Object.keys(V36_CAT_SRC).forEach(k=> { const im = new Image(); im.src = V36_CAT_SRC[k]; V36_CAT_IMG[k] = im; });
  function v36CatReady(name){ const im=V36_CAT_IMG[name]; return im && im.complete && im.naturalWidth > 0 ? im : null; }
  function v36EmotionName(face){
    return ({"🐱":"default","😺":"happy","😽":"happy","😊":"happy","😋":"yummy","😻":"love","❤️":"love","😍":"love",
             "😱":"scared","😨":"scared","😿":"sad","🥺":"sad","😾":"angry","😡":"angry",
             "😏":"smug","😼":"confident","😐":"regal","🥱":"tired","😴":"sleepy","🥴":"hurt","😵":"hurt","😵‍💫":"hurt"})[face] || "default";
  }

  const MYO_FACES = MYO_ART.face.map(src=>{ const im = new Image(); im.src = src; return im; });
  const ROAD_CROSS_BG = new Image(); ROAD_CROSS_BG.src = MYO_ART.extra.roadCrossing;
  const ROAD_TWO_LANE_BG = new Image(); ROAD_TWO_LANE_BG.src = MYO_ART.roadTwoLane;
  const MYO_RANK_FRAMES = MYO_ART.rankCream.map(src=>{ const im=new Image(); im.src=src; return im; });
  const MYO_MATE_FRAMES = MYO_ART.loverTabby.map(src=>{ const im=new Image(); im.src=src; return im; });
  function myoReady(frames, n){ const im=frames[n]; return im && im.complete && im.naturalWidth>0 ? im : null; }
  function drawMyoSprite(ctx, img, w, h, footY){
    if(!img) return false;
    const k=Math.min(w/img.naturalWidth,h/img.naturalHeight);
    const dw=img.naturalWidth*k, dh=img.naturalHeight*k;
    ctx.drawImage(img,-dw/2,(footY===undefined ? h/2 : footY)-dh,dw,dh); return true;
  }

  // 표정 이모지 → 표정 그림 번호 (0 무표정 · 1 지침 · 2 쿨쿨 · 3 놀람 · 4 어질 · 5 의기양양 · 6 행복 · 7 화남)
  function faceArtIndex(emoji){
    return ({"😿":1,"🥱":1,"😴":2,"😱":3,"🥴":4,"😏":5,"😼":5,"😐":5,"😻":6,"😺":6,"😾":7,"😡":7})[emoji] ?? -1;
  }
  const loverMate = { x:0, y:0, ready:false, t:0, face:1 };   // 실제 이동 방향에 따라 좌/우를 바라본다
  function loverHomed(){ return !!(state && state.lovebirds && kittenCount("sit") > 0); }   // 새끼를 맡긴 동안 연인은 집에 있다
  function loverAtHomeHere(){ return state.currentLoc === "home" && !state.homeInside && !state.jackpotRoom; }
  // v40: Stable companion formation. Each cat keeps an assigned relative slot until
  // that slot really becomes unavailable (edge, water or another cat). Never teleport
  // a follower inside the animation loop to resolve collisions.
  const COMPANION_SLOTS = [
    [66,8],[-66,8],[-126,8],[0,65],[0,-66],
    [-66,65],[66,65],[-66,-66],[66,-66],
    [126,8],[-126,65],[126,65],[0,126],[0,-126],
    [-125,-66],[125,-66],[-186,8],[186,8]
  ];
  function clampCompanion(o, S, isMate){
    if(!o || !Number.isFinite(o.x) || !Number.isFinite(o.y)) return;
    const hx = (isMate ? 30 : 27)*S, top=(isMate ? 29 : 27)*S, bottom=(isMate ? 28 : 25)*S;
    const w=roomW||480, h=roomH||320;
    if(w > 2*hx) o.x = Math.max(hx, Math.min(w-hx, o.x));
    if(h > top+bottom) o.y = Math.max(top, Math.min(h-bottom, o.y));
  }
  function planCompanionTargets(S){
    if(!state || !player || !roomW || !roomH) return;
    const sceneKey=state.currentLoc+'|'+(state.homeInside?1:0)+'|'+(state.jackpotRoom?1:0);
    const used=[{x:player.x,y:player.y,hx:27*S,hy:24*S}];
    const w=roomW,h=roomH;
    function valid(x,y,hx,hy){
      if(x<hx+3*S || x>w-hx-3*S || y<hy+7*S || y>h-hy-5*S) return false;
      if(waterAt(state.currentLoc,x,y)) return false;
      return !used.some(a => Math.abs(x-a.x)<hx+a.hx+5*S && Math.abs(y-a.y)<hy+a.hy+5*S);
    }
    function choose(o, ax, ay, isMate, order){
      const hx=(isMate?26:25)*S, hy=(isMate?24:21)*S;
      if(o._companionScene!==sceneKey){o._companionScene=sceneKey; o._companionSlot=-1;}
      const previous=o._companionSlot;
      let indices=[];
      if(previous>=0 && previous<COMPANION_SLOTS.length) indices.push(previous);
      indices.push(...order.filter(i=>i!==previous));
      for(const i of indices){
        const p=COMPANION_SLOTS[i]; if(!p)continue;
        const x=ax+p[0]*S,y=ay+p[1]*S;
        if(valid(x,y,hx,hy)){
          o._companionSlot=i; o._followTX=x; o._followTY=y;
          used.push({x,y,hx,hy});return true;
        }
      }
      // Degenerate very small canvases: retain the last stable, safe destination,
      // never re-pick a different ring position on each frame.
      if(Number.isFinite(o._followTX) && Number.isFinite(o._followTY) &&
         valid(o._followTX,o._followTY,hx,hy)){
         used.push({x:o._followTX,y:o._followTY,hx,hy}); return true;
      }
      o._followTX=o.x; o._followTY=o.y;
      used.push({x:o.x,y:o.y,hx,hy});return false;
    }
    const mateVisible=state.lovebirds && loverMate.ready && (!loverHomed() || loverAtHomeHere());
    if(mateVisible){
      if(loverHomed()){
        const q=state.adopted ? pctToXY('home',42,58) : pctToXY('home',64,66);
        used.push({x:q.x,y:q.y,hx:26*S,hy:24*S});
      } else choose(loverMate,player.x,player.y,true,[0,1,3,4,6,5,9,2,7,8,10,11,12,13,14,15]);
    }
    const followers=(state.kittens||[]).filter(k=>k.mode==='follow');
    followers.forEach((k,i)=>{
      const pref=i===0?[1,2,5,3,7,4,0,6,8,9,10,11,12,13,14,15]:
                 i===1?[2,5,1,7,3,10,4,6,8,9,11,0,12,13,14,15]:
                       [5,7,2,3,1,10,4,6,8,9,11,0,12,13,14,15];
      choose(k,player.x,player.y,false,pref);
    });
    if(loverAtHomeHere() && mateVisible){
      const q=state.adopted ? pctToXY('home',42,58) : pctToXY('home',64,66);
      (state.kittens||[]).filter(k=>k.mode==='sit').forEach((k,i)=>{
        const pref=i%2===0?[1,2,5,7,3,4,0,6,8,9,10,11,12]:[0,6,9,3,4,8,1,5,11,2,10,12];
        choose(k,q.x,q.y,false,pref);
      });
    }
  }
  function updateLoverMate(S){
    if(!state.lovebirds || !loverMate.ready) return;
    if(loverHomed()){
      loverMate._moving=false;
      loverMate._wasHomed = true;
      const key = state.currentLoc + "|" + (state.homeInside ? 1 : 0);
      if(loverMate._key !== key){
        loverMate._key = key;
        if(loverAtHomeHere()){
          const q = state.adopted ? pctToXY("home", 42, 58) : pctToXY("home", 64, 66);
          loverMate.x = q.x; loverMate.y = q.y;
          state.kittens.forEach((k, n)=>{ if(k.mode === "sit"){ k.x = loverMate.x + (n % 2 ? 1 : -1)*(48 + Math.floor(n/2)*38)*S; k.y = loverMate.y + (12 + (n % 2)*9)*S; k.moving = false; } });
        }
      }
      clampCompanion(loverMate,S,true);
      loverMate.t++;
      return;
    }
    if(loverMate._wasHomed){
      loverMate._wasHomed=false; loverMate._key=null;
      // A room transition may place the former home sitter outside the field.
      if(Number.isFinite(loverMate._followTX)){
        loverMate.x=loverMate._followTX;loverMate.y=loverMate._followTY;
      }
    }
    const tx=Number.isFinite(loverMate._followTX)?loverMate._followTX:player.x+62*S;
    const ty=Number.isFinite(loverMate._followTY)?loverMate._followTY:player.y+8*S;
    const dx=tx-loverMate.x,dy=ty-loverMate.y,d=Math.hypot(dx,dy);
    // Smooth approach and a true rest threshold. No constant correction/teleport.
    if(d>2*S){
      const sp=Math.min(Math.max(0.6*S,d*0.16),player.speed*S*1.15,d);
      loverMate.x+=dx/d*sp;loverMate.y+=dy/d*sp;
    }
    loverMate._moving=d>5*S || (loverMate._moving && d>2*S);
    // 2026 v42: 연인의 얼굴은 주인공 위치가 아닌 실제 걸어가는 방향을 따른다.
    // 수평 이동량이 충분할 때만 방향을 갱신하여 가까이 있을 때 덜컥 뒤집히지 않는다.
    if(d>2*S && Math.abs(dx)>2.5*S){ loverMate.face = dx>0 ? 1 : -1; }
    clampCompanion(loverMate,S,true);
    loverMate.t++;
  }
  // 뒤집힌 박스 스프라이트: 고양이는 완전히 감추고, 살짝 흔들리는 박스만 보인다.
  function drawHideBox(ctx, S, bob, scale){
    const sc = scale || 1;
    const im = assetImg("sprite_hidebox");
    ctx.save();
    if(im){
      const bw = 48*S*sc, bh = bw * im.naturalHeight / im.naturalWidth;
      ctx.drawImage(im, -bw/2, -bh/2 + bob, bw, bh);
    } else {
      // 이미지 준비 전 1프레임만 보여 주는 간단한 대체 표시
      ctx.font = (34*S*sc) + "px sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      emoDraw(ctx, "📦", 0, bob);
    }
    ctx.restore();
  }

  function drawLoverMate(ctx, S){
    if(!state.lovebirds || !loverMate.ready) return;
    if(loverHomed() && !loverAtHomeHere()) return;
    const inBox = hiding();
    const moving = !!loverMate._moving && !loverHomed() && !inBox;
    const right = (loverMate.face || 1)>0;
    const n = moving ? Math.floor(performance.now()/145)%4 : 0;
    // 모든 걷기 모션은 같은 오른쪽 원본을 사용하며, 왼쪽으로 가면
    // 주인공과 똑같이 캔버스를 반전한다. 좌측 전용 이미지의 크기 차이는 배제.
    const key = moving ? "lover_walk_" + n : "lover_sit";
    const mate = v36CatReady(key) || v36CatReady("lover_walk_0");
    clampCompanion(loverMate,S,true);
    ctx.save(); ctx.translate(loverMate.x, loverMate.y);
    if(inBox){
      const bob = loverMate._moving ? Math.sin(performance.now()/350 + loverMate.x*0.01)*0.35*S : 0;
      drawHideBox(ctx, S, bob, 1.04);
      ctx.restore();
      return;
    }
    // 걷기 원본=오른쪽, 앉기 원본=왼쪽. 동작별 기본 방향을 구분하여 적용.
    if((moving && !right) || (!moving && right)) ctx.scale(-1,1);
    ctx.save();ctx.shadowColor="transparent";ctx.shadowBlur=0;ctx.filter="none";
    if(mate) drawMyoSprite(ctx,mate,51*S,49*S,24*S);
    else { ctx.font=(26*S)+"px sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";emoDraw(ctx,"🐱",0,0); }
    ctx.restore();ctx.restore();
    // 가까이 붙어 있으면 가끔 하트가 떠오른다.
    const near = Math.hypot(player.x-loverMate.x,player.y-loverMate.y)<50*S;
    const phase = (loverMate.t%320)/320;
    if(near && phase<.45){
      ctx.save();ctx.globalAlpha=1-phase/.45;ctx.font=(16*S)+"px sans-serif";
      emoDraw(ctx,"💕",(player.x+loverMate.x)/2,Math.min(player.y,loverMate.y)-22*S-phase*40*S);
      ctx.restore();
    }
  }
  /* ================= 새끼 고양이: 졸졸 따라다니고, 위험하면 흩어지고, 흩어진 새끼는 찾으러 간다 =================
     새끼 이벤트로 생긴 새끼들은 방 안에서 주인공 뒤를 따라다닌다. 개·들이대는 사람이 달려들거나, 낯선 고양이와의 대치·벌 떼·화재가 닥치면
     가까운 출입구로 도망쳐 이웃한 장소 어딘가에 숨는다. 숨은 새끼는 그 장소에 들어가 가까이 다가가면 되찾는다 (일정 일수 안에 못 찾으면 떠난다). */
  const KITTEN_CFG = { keep:44, scatterR:150, fleeSp:3.6, findR:38, lostDays:10, maxKittens:3, hintGap:5500 };
  const KITTEN_DIR_TXT = { up:"위쪽", down:"아래쪽", left:"왼쪽", right:"오른쪽" };
  let _kittenHintAt = 0;
  function kittenCount(mode){ return ((state && state.kittens) || []).filter(k=> !mode || k.mode === mode).length; }
  function addKittens(n){
    if(!state.kittens) state.kittens = [];
    const S = uiScale(), used = state.kittens.map(k=> k.sp);
    if(state.kittenTurnCount==null) state.kittenTurnCount=0;
    const pool = [0, 1, 2].filter(s=> used.indexOf(s) < 0).sort(()=> Math.random() - .5);
    for(let i = 0; i < n && pool.length && state.kittens.length < KITTEN_CFG.maxKittens; i++){
      const j = state.kittens.length;
      state.kittens.push({ sp:pool.shift(), x:player.x - (48 + j*40)*S, y:player.y + (12 + (j % 2)*9)*S, mode:"follow", face:-1, t:Math.floor(Math.random()*60), moving:false, born:state.day, bornTurn:state.kittenTurnCount });
    }
    if(roomW>0 && roomH>0){
      planCompanionTargets(S);
      state.kittens.filter(k=>k.mode==='follow' && k.t<65).forEach(k=>{
        if(Number.isFinite(k._followTX) && !waterAt(state.currentLoc,k._followTX,k._followTY)){
          k.x=k._followTX;k.y=k._followTY;k.moving=false;
        }
      });
    }
    renderKittenHud();
  }
  function renderKittenHud(){
    const h = document.getElementById("kitten-hud"); if(!h || !state) return;
    const all = state.kittens || [];
    const ks = all.filter(k=> k.mode === "lost" || k.mode === "flee");
    const sit = all.filter(k=> k.mode === "sit" && k.wish);
    const wishing = all.filter(k=> k.mode === "follow" && k.wish && !k.wish.done);
    const parts = [];
    if(ks.length){
      const first = Math.min.apply(null, ks.map(k=> k.lostDay != null ? k.lostDay : state.day));
      const left = Math.max(1, KITTEN_CFG.lostDays - (state.day - first));
      parts.push("<span>🐾 흩어진 새끼 " + ks.length + "마리 · " + left + "일 안에 찾아 주세요</span>");
    }
    if(wishing.length) parts.push("<span>💭 새끼의 소원 " + wishing.map(k=> k.wish.icon).join(" ") + " · 이뤄 주면 연인에게 맡길 수 있어요</span>");
    if(sit.length) parts.push("<span>🍼 맡긴 새끼 " + sit.length + "마리 · 5턴이 지나면 외로워해요 · 데려와야 독립할 수 있어요</span>");
    if(!parts.length){ h.classList.remove("on"); h.innerHTML = ""; return; }
    h.innerHTML = parts.join(" &nbsp;·&nbsp; ");
    h.classList.add("on");
  }
  // 새끼들이 놀라 가까운 출입구로 도망친다 (위협에서 먼 문을 고른다). 화재처럼 곧장 장면이 바뀌는 경우엔 바로 숨는다.
  function scatterKittens(tx, ty, why, instant){
    if(!state || !state.kittens || state.homeInside || state.jackpotRoom) return;
    const fl = state.kittens.filter(k=> k.mode === "follow"); if(!fl.length) return;
    const loc = LOC_BY_ID[state.currentLoc], S = uiScale(), dirs = Object.keys((loc && loc.exits) || {});
    if(!dirs.length) return;
    if(tx == null){ tx = player.x; ty = player.y; }
    fl.forEach(k=>{
      let best = null, bs = -1e9;
      dirs.forEach(dir=> doorPts(loc.id, dir).forEach(q=>{
        const sc = Math.hypot(q.x - tx, q.y - ty) - Math.hypot(q.x - k.x, q.y - k.y)*0.5 + Math.random()*140*S;
        if(sc > bs){ bs = sc; best = { dir:dir, q:q }; }
      }));
      k.dest = loc.exits[best.dir]; k.tx = best.q.x; k.ty = best.q.y; k.t = 0;
      if(instant){ k.mode = "lost"; k.loc = k.dest; k.placed = false; k.lostDay = state.day; }
      else k.mode = "flee";
    });
    state.kittenScatters = (state.kittenScatters || 0) + 1;
    sfx("scared");
    showToast("🐱💦 " + (why || "깜짝 놀라") + " 새끼들이 사방으로 흩어졌다! 이웃한 곳에 숨었을 테니 찾으러 가자");
    renderKittenHud();
  }
  function kittenPlaceLost(k){
    const S = uiScale(), w = roomW || 480, h = roomH || 320, m = 64*S;
    let rects = []; try{ rects = hudRects(); }catch(e){}
    let q = null;
    for(let i = 0; i < 50 && !q; i++){
      const x = m + Math.random()*(w - 2*m), y = m + Math.random()*(h - 2*m);
      if(Math.hypot(x - player.x, y - player.y) < 150*S) continue;
      if(rects.length && hudHit({ x:x, y:y }, 30*S, rects)) continue;
      if(walkableAt(k.loc, x, y)) q = { x:x, y:y };
    }
    if(!q) q = nearestWalkable(k.loc, w*(0.3 + Math.random()*0.4), h*(0.3 + Math.random()*0.4));
    k.x = q.x; k.y = q.y; k.placed = true; k.t = 0;
  }
  function kittenFound(k){
    k.mode = "follow"; k.moving = false; k.t = 0; k.placed = false;
    state.kittenFoundTotal = (state.kittenFoundTotal || 0) + 1;
    puffAt(k.x, k.y, 10); addRing(k.x, k.y, 76, "#FF9EB5", 620, "찾았다!"); sfx("good");
    const left = kittenCount("lost") + kittenCount("flee");
    const before = snapStats();
    applyEffToState(left ? { fun:+4 } : { fun:+10, affection:+4 });
    showDeltas(before);
    showToast(left ? "🐱 새끼를 찾았다! 품으로 쏙 파고든다 (남은 " + left + "마리)" : "🐱💕 흩어졌던 새끼들을 모두 찾았다! 다시 졸졸 뒤를 따른다");
    renderKittenHud();
  }
  // 방에 들어올 때: 따라오는 새끼는 곁에 서고, 도망치던 새끼는 숨은 곳에 자리 잡고, 가까운 곳에 숨었다면 울음소리로 힌트를 준다
  function kittenOnEnter(){
    if(!state || !state.kittens || !state.kittens.length) return;
    const S = uiScale();
    let i = 0;
    state.kittens.forEach(k=>{
      if(k.mode === "flee"){ k.mode = "lost"; k.loc = k.dest; k.placed = false; k.lostDay = state.day; }
      if(k.mode === "follow"){ k.x = player.x - (48 + i*40)*S; k.y = player.y + (12 + (i % 2)*9)*S; k.moving = false; i++; }
      else if(k.mode === "sit" || k.mode === "return"){ kidPlaceNearLover(k); }
    });
    // On a map transition, clear former slots and start near the new safe formation.
    (state.kittens||[]).forEach(k=>{k._companionScene=null;});
    loverMate._companionScene=null;
    if(roomW>0 && roomH>0){
      planCompanionTargets(S);
      state.kittens.filter(k=>k.mode==='follow').forEach(k=>{
        if(Number.isFinite(k._followTX) && !waterAt(state.currentLoc,k._followTX,k._followTY)){
          k.x=k._followTX;k.y=k._followTY;k.moving=false;
        }
      });
    }
    renderKittenHud();
    if(state.fireSearch) return;
    const lost = state.kittens.filter(k=> k.mode === "lost"); if(!lost.length) return;
    const cur = state.currentLoc, now = Date.now();
    if(lost.some(k=> k.loc === cur)){ setTimeout(()=> showToast("🐱 구석에서 가냘픈 울음소리가 들린다… 가까이 가 보자!"), 500); _kittenHintAt = now; return; }
    if(now - _kittenHintAt < KITTEN_CFG.hintGap) return;
    const ex = (LOC_BY_ID[cur] && LOC_BY_ID[cur].exits) || {};
    const dirs = Object.keys(ex).filter(d=> lost.some(k=> k.loc === ex[d]));
    if(dirs.length){ _kittenHintAt = now; setTimeout(()=> showToast("🐾 " + dirs.map(d=> KITTEN_DIR_TXT[d]).join("·") + " 문 쪽에서 작은 울음소리가 들린다…"), 700); }
  }
  function kittenSnap(){
    if(!state || !state.kittens) return;
    const S=uiScale();
    state.kittens.forEach(k=>{k._companionScene=null;});
    loverMate._companionScene=null;
    planCompanionTargets(S);
    state.kittens.forEach(k=>{
      if((k.mode==='follow' || (k.mode==='sit' && loverAtHomeHere())) &&
         Number.isFinite(k._followTX) && !waterAt(state.currentLoc,k._followTX,k._followTY)){
        k.x=k._followTX;k.y=k._followTY;k.moving=false;
      } else if(k.mode==='return') kidPlaceNearLover(k);
    });
    if(state.lovebirds && loverMate.ready && !loverHomed() && Number.isFinite(loverMate._followTX)){
      loverMate.x=loverMate._followTX;loverMate.y=loverMate._followTY;loverMate._moving=false;
    }
  }
  function kittenDayTick(){
    if(!state || !state.kittens || !state.kittens.length) return;
    state.kittens.forEach(k=>{
      if(k.born == null) k.born=state.day;
      if(k.bornTurn==null) k.bornTurn=Math.max(0,(state.kittenTurnCount||0)-(state.day-k.born));
      if(k.mode === "sit"){   // 맡긴 지 5턴이 지나면 엄마가 보고 싶어지고, 더 오래 두면 시무룩해진다
        if(k.sitTurn == null) k.sitTurn = state.kittenTurnCount;
        const n = state.kittenTurnCount - k.sitTurn;
        if(!k.miss && n >= 5){ k.miss = true; state._missNew = (state._missNew || 0) + 1; }
        if(k.miss && !k.sulk && n >= 9){ k.sulk = true; state._sulkNew = (state._sulkNew || 0) + 1; }
      }
    });
    // 생후 10턴: 독립 예고만 등록한다. 컷씬을 보기 전에 새끼가 갑자기 사라지지 않게 한다.
    const grown = state.kittens.filter(k=> k.mode !== "lost" && k.mode !== "flee"
      && k.mode !== "sit"   // 연인에게 맡겨 둔 새끼는 데려온 뒤에 독립한다 (맡긴 새끼가 엄마를 기다리다 사라지지 않게)
      && k.wish && k.wish.done   // 소원을 이뤄 주기 전에는 독립하지 않는다
      && !k._independenceQueued && (state.kittenTurnCount-k.bornTurn)>=10);
    if(grown.length){
      grown.forEach(k=>{ k._independenceQueued = true; }); // 다음 턴이 와도 중복 예약 방지
      const familyState = state;
      runWhenIdle(()=>{
        if(state !== familyState || state.gameOver) return; // 새 게임이나 엔딩으로 전환된 경우 무시
        const departing = grown.filter(k=> state.kittens.includes(k));
        if(!departing.length) return;
        const leave = ()=>{
          if(state !== familyState || state.gameOver) return;
          // 컷씬을 직접 닫은 뒤에만 동행/맡김 목록에서 독립한 새끼를 제거한다.
          const present = departing.filter(k=>state.kittens.includes(k));
          state.kittens = state.kittens.filter(k=>!present.includes(k));
          state.kittenGrown = (state.kittenGrown || 0) + present.length;
          showToast("🌸 " + present.length + "마리의 새끼 고양이가 씩씩하게 독립했다!");
          renderKittenHud();
          renderAll();
        };
        // 새끼가 모두 독립하는 순간에만 이별 컷씬을 보여 준다 (아직 곁에 남는 새끼가 있으면 조용히 떠난다)
        const stay = state.kittens.filter(k=> !departing.includes(k));
        if(stay.length) leave();
        else playCutscene({ panels:CUT.kittenIndependence }, leave);
      });
    }
    const gone = state.kittens.filter(k=> k.mode === "lost" && state.day - k.lostDay >= KITTEN_CFG.lostDays);
    if(gone.length){
      state.kittens = state.kittens.filter(k=> gone.indexOf(k) < 0);
      state.kittenGone = (state.kittenGone || 0) + gone.length;
      const before = snapStats(); applyEffToState({ fun:-4*gone.length }); showDeltas(before);
      setTimeout(()=> showToast("🍃 끝내 찾지 못한 새끼 " + gone.length + "마리는 어딘가에서 새 보금자리를 찾은 듯하다…"), 1500);
    }
    renderKittenHud();
  }
  const KID_MISS1 = 1500, KID_MISS2 = 3600;   // 맡긴 지 약 25초 · 약 60초 (60fps 기준)
  function kidMissNotice(){
    if(!state) return;
    if(state._missNew){
      const n = state._missNew; state._missNew = 0;
      showToast("😿 맡겨 둔 새끼" + (n > 1 ? " " + n + "마리가" : "가") + " 엄마를 보고 싶어 한다… 연인에게 가서 데려오자");
      renderKittenHud();
    }
    if(state._sulkNew){
      const n = state._sulkNew; state._sulkNew = 0;
      state.kidSulks = (state.kidSulks || 0) + n;
      const before = snapStats(); applyEffToState({ affection:-2 }); showDeltas(before);
      showToast("🥺 엄마를 오래 기다린 새끼가 시무룩해졌다… 애정도가 조금 떨어졌다");
    }
  }
  // 새끼를 데려올 때: 엄마를 기다리던 새끼는 품에 폭 안긴다
  function kidReunion(list){
    const miss = list.filter(k=> k.miss), sulk = list.filter(k=> k.sulk).length;
    list.forEach(k=>{ k.miss = false; k.sulk = false; });
    if(!miss.length) return "😻 연인이 새끼들을 꼭 안아 인사한 뒤 엄마에게 돌려보냈다!";
    state.kidReunions = (state.kidReunions || 0) + miss.length;
    const before = snapStats(); applyEffToState({ affection:+2, fun:+2 }); showDeltas(before);
    sfx("love");
    return "😻 \"엄마 왔다!\" 기다리던 새끼 " + miss.length + "마리가 품으로 폭 안겼다" + (sulk ? " (시무룩했던 마음이 사르르 풀렸다)" : "") + " 💕";
  }
  function kittenStep(k, nx, ny){   // 새끼는 물·분수에 들어가지 않는다 (들어가면 못 데려온다)
    const L = state.currentLoc;
    if(!waterAt(L, nx, ny) || waterAt(L, k.x, k.y)){ k.x = nx; k.y = ny; }
    else if(!waterAt(L, nx, k.y)) k.x = nx;
    else if(!waterAt(L, k.x, ny)) k.y = ny;
  }
  function updateKittens(S){
    kidMissNotice();
    const ks = state && state.kittens; if(!ks || !ks.length || state.fireSearch) return;
    const inHome = state.homeInside || state.jackpotRoom;
    const followers = ks.filter(k=> k.mode === "follow");
    // 위험 감지: 개·들이대는 사람이 가까이 달려들면 새끼들은 도망친다 (고양이들의 왕 앞에서는 모두 물러나므로 안전하다)
    if(followers.length && !inHome && state.turfRank < 3 && !hiding()){
      const th = (state.roomObjects || []).find(o=> !o.consumed && CHASERS[o.item.key] && !(o.chaseGrace > 0) && !(o.fleeT > 0) && Math.hypot(o.x - player.x, o.y - player.y) < KITTEN_CFG.scatterR*S);
      if(th) scatterKittens(th.x, th.y, th.item.key === "dog" ? "개가 달려들자" : "사람이 달려들자");
    }
    // Followers use stable preassigned formation slots, not the previous kitten's
    // ever-changing position; this prevents oscillating chains of corrections.
    if(state.carry && state.carry.forKid){   // 물어 온 선물은 가까이 가면 새끼에게 건넨다
      const rcv = ks.find(q=> q.mode === "follow" && q.wish && !q.wish.done && q.wish.type === "item" && q.wish.key === state.carry.key && Math.hypot(q.x - player.x, q.y - player.y) < 52*S);
      if(rcv) kidGiveGift();
    }
    ks.forEach(k=>{
      k.t++;
      if(k.mode === "follow" && !k.wish) kidAssignWish(k);   // 새끼마다 소원은 하나만 — 한 번 이루면 더 빌지 않는다
      if(k.mode === "follow" || k.mode === "sit"){
        if(k.mode==="sit" && !loverAtHomeHere()){k.moving=false;return;}
        const tx=Number.isFinite(k._followTX)?k._followTX:k.x;
        const ty=Number.isFinite(k._followTY)?k._followTY:k.y;
        const dx=tx-k.x,dy=ty-k.y,d=Math.hypot(dx,dy);
        if(d>290*S && !waterAt(state.currentLoc,tx,ty)){
          k.x=tx;k.y=ty;k.moving=false;
        } else if(d>1.8*S){
          const sp=Math.min(Math.max(.5*S,d*.18),player.speed*S*1.15,d);
          kittenStep(k,k.x+dx/d*sp,k.y+dy/d*sp);
          k.moving=d>4*S || (k.moving && d>2*S);
          if(Math.abs(dx)>3*S)k.face=dx>0?1:-1;
        } else k.moving=false;
        clampCompanion(k,S,false);
      } else if(k.mode === "return"){       // 소원이 이뤄진 새끼: 엄마 품으로 달려온다
        const dx = player.x - k.x, dy = player.y - k.y, d = Math.hypot(dx, dy) || 1, sp = Math.max(KITTEN_CFG.fleeSp*S, player.speed*S*1.2);
        k.moving = true; if(Math.abs(dx) > 1) k.face = dx > 0 ? 1 : -1;
        if(d <= 44*S || k.t > 360){ k.mode = "follow"; k.moving = false; k.t = 0; puffAt(k.x, k.y, 8); addRing(k.x, k.y, 60, "#FF9EB5", 520, "💗"); renderKittenHud(); }
        else { kittenStep(k, k.x + dx/d*sp, k.y + dy/d*sp); }
      } else if(k.mode === "flee"){
        const dx = k.tx - k.x, dy = k.ty - k.y, d = Math.hypot(dx, dy) || 1, sp = KITTEN_CFG.fleeSp*S;
        k.moving = true; if(Math.abs(dx) > 1) k.face = dx > 0 ? 1 : -1;
        if(d <= sp + 6*S || k.t > 300){ k.mode = "lost"; k.loc = k.dest; k.placed = false; k.lostDay = state.day; k.t = 0; puffAt(k.x, k.y, 6); renderKittenHud(); }
        else { kittenStep(k, k.x + dx/d*sp, k.y + dy/d*sp); }
      } else if(k.mode === "lost" && k.loc === state.currentLoc && !inHome){
        if(!k.placed) kittenPlaceLost(k);
        if(roomInputAllowed() && Math.hypot(player.x - k.x, player.y - k.y) < KITTEN_CFG.findR*S) kittenFound(k);
      }
    });
    ks.forEach(k=>{   // 안전장치: 밀려나서 물에 들어갔다면 마지막 마른 자리로 되돌린다
      if(k.mode !== "follow" && k.mode !== "sit" && k.mode !== "return" && k.mode !== "flee") return;
      if(waterAt(state.currentLoc, k.x, k.y)){ if(k._dx != null){ k.x = k._dx; k.y = k._dy; } }
      else { k._dx = k.x; k._dy = k.y; }
    });
  }
  function drawKittens(ctx, S){
    const ks = state && state.kittens; if(!ks || !ks.length || state.fireSearch) return;
    const cur = state.currentLoc;
    const vis = ks.filter(k=> k.mode === "follow" || (k.mode === "sit" && loverAtHomeHere()) || k.mode === "return" || k.mode === "flee" || (k.mode === "lost" && k.placed && k.loc === cur && !state.homeInside)).sort((a, b)=> a.y - b.y);
    vis.forEach(k=>{
      if(k.mode==='follow' || k.mode==='sit' || k.mode==='return') clampCompanion(k,S,false);
      const im = kittenSprite(k.mode === "lost" ? "\uD83D\uDE3F" : (k.mode === "flee" ? "\uD83D\uDE40" : "\uD83D\uDC31"), k.sp), hh = 21*S, lost = k.mode === "lost";
      // v42: 새끼 특유의 통통 뛰는 모션 복원. 좌표 자체는 바꾸지 않고
      // 그림만 최대 3.5픽셀 위로 살짝 띄운다. 프레임은 투명 여백이 정렬돼 있다.
      const jumping = !hiding() && k.moving && !lost && (k.mode === "follow" || k.mode === "return" || k.mode === "flee");
      const bob = jumping ? -3.5*S*Math.abs(Math.sin(k.t*0.35 + k.sp*0.55)) : 0;
      const shake = lost ? Math.sin(k.t*0.9)*1.3*S : 0;
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.14)"; ctx.beginPath(); ctx.ellipse(k.x, k.y + hh*0.52, hh*0.42, hh*0.12, 0, 0, Math.PI*2); ctx.fill();
      ctx.translate(k.x + shake, k.y + bob);
      // 회전은 꼬리·귀를 필드 밖으로 밀어내므로 제거한다.
      if(lost) ctx.rotate(Math.sin(k.t*0.07)*0.025);
      if(k.face > 0) ctx.scale(-1, 1);
      const _kBox = k.mode === "follow" && hiding();   // 엄마가 박스를 쓰면 졸졸 따라오던 새끼들도 쏙 숨는다
      if(_kBox){
        const kb = k.moving ? Math.sin(performance.now()/390 + k.sp)*0.30*S : 0;
        drawHideBox(ctx, S, kb, 0.82);
      }
       else {
        const kind = k.sp === 2 ? "calico" : (k.sp === 1 ? "brown" : "beige");
        const f = (k.moving && !lost) ? Math.floor(k.t/11)%4 : 0;
        const kittenIm = v36CatReady("kitten_"+kind+"_walk_"+f);
        if(kittenIm) drawMyoSprite(ctx,kittenIm,49*S,39*S,21*S);
        else if(im){ const ww=hh*1.5;ctx.drawImage(im,-ww/2,-ww/2,ww,ww); }
        else { ctx.font=(24*S)+"px sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";emoDraw(ctx,"🐱",0,0); }
       }
      ctx.restore();
      if((k.mode === "follow" && k.wish && !k.wish.done) || (k.mode === "sit" && k.miss)){   // 소원이 남은 새끼: 원하는 것 / 맡겨져 외로운 새끼: 😿
        const by = k.y - hh*0.95 - 8*S + Math.sin(k.t*0.1)*1.6*S, r = 10*S;
        ctx.save(); ctx.fillStyle = "rgba(255,255,255,.95)"; ctx.strokeStyle = "rgba(242,178,121,.95)"; ctx.lineWidth = 1.6*S;
        ctx.beginPath(); ctx.arc(k.x, by, r, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(k.x - 3*S, by + r - 1*S); ctx.lineTo(k.x, by + r + 4*S); ctx.lineTo(k.x + 3*S, by + r - 1*S); ctx.fillStyle = "rgba(255,255,255,.95)"; ctx.fill();
        ctx.font = (12*S) + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#000"; emoDraw(ctx, k.mode === "sit" ? "\uD83D\uDE3F" : k.wish.icon, k.x, by + 0.5*S);
        ctx.restore();
      }
      if(lost || k.mode === "flee"){   // 숨은 새끼: 울음 말풍선 · 가까이 가면 반가워한다 / 도망 중: 느낌표
        const near = lost && Math.hypot(player.x - k.x, player.y - k.y) < 120*S;
        const txt = k.mode === "flee" ? "!" : (near ? "💗" : "미야…");
        const by = k.y - hh*0.72 - 6*S + Math.sin(k.t*0.12)*1.5*S;
        ctx.save();
        ctx.font = "800 " + (11*S) + "px 'Noto Sans KR', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const tw = ctx.measureText(txt).width + 12*S, bh = 17*S;
        ctx.fillStyle = "rgba(255,255,255,.93)"; ctx.strokeStyle = "rgba(242,178,121,.95)"; ctx.lineWidth = 1.6*S;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(k.x - tw/2, by - bh/2, tw, bh, 8*S) : ctx.rect(k.x - tw/2, by - bh/2, tw, bh); ctx.fill(); ctx.stroke();
        ctx.fillStyle = k.mode === "flee" ? "#E8543A" : "#8a4b17"; ctx.fillText(txt, k.x, by + 0.5*S);
        ctx.restore();
      }
    });
  }
  /* ================= 새끼 스프라이트: 엄마 고양이(이모지)를 그대로 쓰되 털색만 바꾼다 =================
     엄마와 같은 그림체라서 어색하지 않다. 이모지를 작은 캔버스에 그린 뒤, 털(노란·주황 계열)만 골라 색을 바꿔 캐시해 둔다. */
  const KITTEN_PALS = [
    { name:"베이지", h:40, s:0.50, lm:1.02, la:0.10 },
    { name:"연갈색", h:22, s:0.62, lm:0.77, la:0.08 },
    { name:"삼색이", pat:"calico" },
    { name:"갈색 태비", pat:"tabby" },     // 연인 전용 (새끼로는 나오지 않는다)
  ];
  const _CAL = { o:{ h:27, s:1.00, lm:1.00, la:0.00 }, k:{ h:24, s:0.45, lm:0.36, la:0.00 }, w:{ h:40, s:0.10, lm:1.30, la:0.12 } };
  const _TAB = { b:{ h:25, s:0.62, lm:0.52, la:0.00 }, d:{ h:22, s:0.55, lm:0.27, la:0.00 } };
  const _kSprite = {};
  function _rgb2hsl(r, g, b){
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn)/2;
    let h = 0, s = 0;
    if(mx !== mn){
      const d = mx - mn; s = l > 0.5 ? d/(2 - mx - mn) : d/(mx + mn);
      h = mx === r ? (g - b)/d + (g < b ? 6 : 0) : (mx === g ? (b - r)/d + 2 : (r - g)/d + 4); h *= 60;
    }
    return [h, s, l];
  }
  function _hsl2rgb(h, s, l){
    h = ((h % 360) + 360) % 360 / 360;
    if(!s){ const v = Math.round(l*255); return [v, v, v]; }
    const q = l < 0.5 ? l*(1 + s) : l + s - l*s, p = 2*l - q;
    const f = t=>{ t = (t + 1) % 1; return Math.round(255*(t < 1/6 ? p + (q - p)*6*t : t < 1/2 ? q : t < 2/3 ? p + (q - p)*(2/3 - t)*6 : p)); };
    return [f(h + 1/3), f(h), f(h - 1/3)];
  }
  function kittenSprite(face, pi){
    const key = face + "|" + pi;
    if(_kSprite[key]) return _kSprite[key];
    const N = 72, cv = document.createElement("canvas"); cv.width = cv.height = N;
    const c = cv.getContext("2d", { willReadFrequently:true });
    c.font = "52px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
    try{ emoDraw(c, face, N/2, N/2 + 2); }catch(e){ c.fillText(face, N/2, N/2 + 2); }
    try{
      const P = KITTEN_PALS[pi % KITTEN_PALS.length], id = c.getImageData(0, 0, N, N), d = id.data;
      for(let i = 0; i < d.length; i += 4){
        if(d[i+3] < 8) continue;
        const hsl = _rgb2hsl(d[i], d[i+1], d[i+2]), h = hsl[0], s = hsl[1], l = hsl[2];
        if(h >= 14 && h <= 68 && s > 0.28 && l > 0.22){      // 털 부분(노랑~주황)만 고른다. 눈·코·입·흰 발광은 그대로
          let Q = P;
          if(P.pat){
            const px = (i/4) % N, py = Math.floor((i/4) / N);
            if(P.pat === "calico"){ const v = Math.sin(px*0.23 + 1.3) + Math.sin(py*0.29 + 0.4) + Math.sin((px + py)*0.17); Q = v > 0.55 ? _CAL.o : (v < -0.6 ? _CAL.k : _CAL.w); }
            else { Q = Math.sin(px*0.55 + py*0.18) > 0.45 ? _TAB.d : _TAB.b; }       // 태비: 줄무늬
          }
          const rgb = _hsl2rgb(Q.h, Math.min(1, s*Q.s), Math.max(0, Math.min(1, l*Q.lm + Q.la)));
          d[i] = rgb[0]; d[i+1] = rgb[1]; d[i+2] = rgb[2];
        }
      }
      c.putImageData(id, 0, 0);
    }catch(e){ console.warn("kittenSprite", e); }
    _kSprite[key] = cv;
    return cv;
  }

  /* ================= 연인에게 새끼 맡기기 =================
     잉꼬 부부가 된 뒤 연인 곁에서 Space(탭)로 새끼를 맡길 수 있다. 맡긴 새끼는 연인 곁에 머물며(위험해도 흩어지지 않는다)
     저마다 소원이 있다 — 원하는 물건을 물어다 주거나, 가고 싶어 하는 곳에 데려가 체험시키면 엄마 품으로 달려온다. */
  var loverNear = false;
  const KID_WISHES = [
    { type:"item",  key:"catgrass",  icon:"🌿", text:"강아지풀로 놀고 싶어요" },
    { type:"item",  key:"mouse_toy", icon:"🖱️", text:"쥐 장난감이 갖고 싶어요" },
    { type:"item",  key:"bug",       icon:"🦗", text:"벌레가 보고 싶어요" },
    { type:"item",  key:"fishbone",  icon:"🐟", text:"물고기가 먹고 싶어요" },
    { type:"item",  key:"wet",       icon:"🍗", text:"촉촉한 사료가 먹고 싶어요" },
    { type:"place", loc:"park",       icon:"🌳", text:"공원에서 뛰놀고 싶어요" },
    { type:"place", loc:"playground", icon:"🎠", text:"놀이터에서 놀고 싶어요" },
    { type:"place", loc:"market",     icon:"🛒", text:"시장 구경이 하고 싶어요" },
    { type:"place", loc:"stream",     icon:"🌊", text:"냇물 구경이 하고 싶어요" },
  ];
  function kidPlaceNearLover(k){
    const S = uiScale(), base = (state.lovebirds && loverMate.ready) ? loverMate : player;
    const n = (state.kittens || []).filter(q=> q.mode === "sit" || q.mode === "return").indexOf(k);
    k.x = base.x + (n % 2 ? 1 : -1)*(48 + Math.floor(Math.max(0,n)/2)*38)*S;
    k.y = base.y + (12 + (n % 2)*9)*S; k.moving = false;
  }
  function kidAssignWish(k){
    const taken = (state.kittens || []).filter(q=> q !== k && q.wish && !q.wish.done).map(q=> q.wish.text);
    const pool = KID_WISHES.filter(w=> taken.indexOf(w.text) < 0 && !(w.type === "place" && w.loc === state.currentLoc));
    const w = (pool.length ? pool : KID_WISHES)[Math.floor(Math.random()*(pool.length || KID_WISHES.length))];
    k.wish = { type:w.type, key:w.key, loc:w.loc, icon:w.icon, text:w.text, done:false };
  }
  function kidWishPickup(item){
    if(!state || !state.kittens || state.carry) return false;
    const k = state.kittens.find(q=> q.mode === "follow" && q.wish && !q.wish.done && q.wish.type === "item" && q.wish.key === item.key);
    if(!k) return false;
    state.itemsEatenSinceModal++;
    state.carry = { key:item.key, icon:item.icon, label:item.label, forKid:true };
    sfx("pop");
    state._lastMsg = item.icon + " " + item.label + "을(를) 입에 물었다! 새끼에게 가져다주자";
    showToast(state._lastMsg);
    return true;
  }
  function kidFulfill(k, how){
    k.wish.done = true;
    state.kidReturns = (state.kidReturns || 0) + 1;
    const before = snapStats();
    applyEffToState({ fun:+6, affection:+3, risk:-2 });
    showDeltas(before);
    puffAt(k.x, k.y, 8); addRing(k.x, k.y, 70, "#FF9EB5", 600, "야호!"); sfx("love");
    const pal = KITTEN_PALS[k.sp % KITTEN_PALS.length].name;
    showToast("🐱💕 " + pal + " 새끼가 " + how + " 소원이 이뤄졌다! 이제 독립할 수 있고, 연인에게 맡길 수도 있다 (맡겨 두면 데려온 뒤에 독립해요)");
    renderKittenHud();
  }
  function kidPlaceCheck(locId){
    if(!state || !state.kittens) return;
    const k = state.kittens.find(q=> q.mode === "follow" && q.wish && !q.wish.done && q.wish.type === "place" && q.wish.loc === locId);
    if(!k) return;
    setTimeout(()=>{ if(state && state.kittens && k.mode === "follow" && !k.wish.done) kidFulfill(k, k.wish.icon + " 신나게 체험하고"); }, 900);
  }
  function kidGiveGift(){
    if(!state.carry || !state.carry.forKid) return false;
    const k = state.kittens.find(q=> q.mode === "follow" && q.wish && !q.wish.done && q.wish.type === "item" && q.wish.key === state.carry.key);
    if(!k){ state.carry = null; return false; }
    const ic = state.carry.icon; state.carry = null;
    kidFulfill(k, ic + " 선물을 받고 기뻐하며");
    return true;
  }
  function kidEntrust(){
    const fl = state.kittens.filter(k=> k.mode === "follow" && k.wish && k.wish.done);
    if(!fl.length){ showToast("🐾 소원을 이뤄 준 새끼만 맡길 수 있어요"); return; }
    fl.forEach(k=>{ k.mode = "sit"; k.t = 0; k.miss = false; k.sulk = false; k.sitTurn = state.kittenTurnCount; });
    sfx("good"); puffAt(loverMate.x, loverMate.y, 8);
    showToast("🐾 연인이 새끼를 맡아 줬다 · 5턴 안에 데리러 오자");
    renderKittenHud();
  }
  function closeSitterMenu(){
    const el = document.getElementById("sitter-ov"); if(el) el.remove();
    if(state) state.sitterMenu = false;
  }
  function openSitterMenu(){
    if(!state || document.getElementById("sitter-ov")) return;
    if(!document.getElementById("sitter-css")){
      const st = document.createElement("style"); st.id = "sitter-css";
      st.textContent = ".sitter-ov{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(48,28,10,.45);}"
        + ".sitter-box{width:min(360px,100%);max-height:86vh;overflow:auto;background:#FFF8EC;border:3px solid #F2B279;border-radius:18px;padding:16px 16px 14px;box-shadow:0 10px 30px rgba(0,0,0,.3);font-family:'Noto Sans KR',sans-serif;color:#6b3d14;}"
        + ".sitter-box h3{margin:0 0 4px;font-size:17px;font-weight:900;}.sitter-box p{margin:0 0 10px;font-size:13px;line-height:1.5;}"
        + ".sitter-row{display:flex;align-items:center;gap:8px;padding:7px 10px;margin:5px 0;border-radius:12px;background:#fff;border:2px solid #F7D9B8;font-size:13px;font-weight:700;}"
        + ".sitter-row .dot{width:14px;height:14px;border-radius:50%;flex:none;border:2px solid rgba(0,0,0,.15);}"
        + ".sitter-btns{display:flex;flex-direction:column;gap:7px;margin-top:10px;}"
        + ".sitter-btn{border:0;border-radius:12px;padding:11px 12px;font-size:14px;font-weight:900;font-family:inherit;cursor:pointer;background:#F2B279;color:#5b3010;}"
        + ".sitter-btn.sub{background:#F3E6D4;color:#8a4b17;}.sitter-btn:active{transform:scale(.98);}";
      document.head.appendChild(st);
    }
    state.sitterMenu = true; Object.keys(keysDown).forEach(k=> keysDown[k] = false);
    const ov = document.createElement("div"); ov.id = "sitter-ov"; ov.className = "sitter-ov";
    const box = document.createElement("div"); box.className = "sitter-box"; ov.appendChild(box);
    const fl = state.kittens.filter(k=> k.mode === "follow" && k.wish && k.wish.done), wishing = state.kittens.filter(k=> k.mode === "follow" && k.wish && !k.wish.done), sit = state.kittens.filter(k=> k.mode === "sit" && k.wish);
    const h = document.createElement("h3"), p = document.createElement("p"); box.appendChild(h); box.appendChild(p);
    h.textContent = "😻 연인과 새끼들";
    p.textContent = fl.length ? "소원을 이룬 새끼를 맡길 수 있어요. 5턴이 지나면 외로워해요." : (wishing.length ? "소원을 먼저 이뤄 줘야 맡길 수 있어요." : "맡긴 새끼를 데려올 수 있어요.");
    if(sit.some(k=> k.miss)) p.textContent = "😿 엄마를 보고 싶어 하는 새끼가 있어요. 데려오면 품에 폭 안겨요.";
    sit.forEach(k=>{
      const r = document.createElement("div"); r.className = "sitter-row";
      const dot = document.createElement("span"); dot.className = "dot"; dot.style.background = ["#F4E3C2", "#9a5a32", "#e8a050", "#7a4a2a"][k.sp % 4];
      const t = document.createElement("span"); t.textContent = KITTEN_PALS[k.sp % 4].name + " 새끼 · " + (k.sulk ? "🥺 시무룩 · " : (k.miss ? "😿 엄마 보고 싶어" : "🍼 맡겨 지내는 중"));
      r.appendChild(dot); r.appendChild(t); box.appendChild(r);
    });
    const bt = document.createElement("div"); bt.className = "sitter-btns"; box.appendChild(bt);
    function btn(label, fn, sub){ const b = document.createElement("button"); b.type = "button"; b.className = "sitter-btn" + (sub ? " sub" : ""); b.textContent = label; b.addEventListener("click", e=>{ e.preventDefault(); e.stopPropagation(); fn(); }); bt.appendChild(b); }
    if(sit.length) btn("💗 새끼 " + sit.length + "마리 데려오기", ()=>{
      closeSitterMenu();
      const back = state.kittens.filter(k=> k.mode === "sit");
      const msg = kidReunion(back);
      back.forEach(k=>{ k.mode = "return"; k.t = 0; });
      sfx("good"); showToast(msg); renderKittenHud();
    });
    if(fl.length) btn("🍼 새끼 " + fl.length + "마리 맡기기", ()=>{ closeSitterMenu(); kidEntrust(); });
    btn("닫기", closeSitterMenu, true);
    ov.addEventListener("pointerdown", e=>{ if(e.target === ov) closeSitterMenu(); });
    ov.addEventListener("keydown", e=>{ if(e.key === "Escape") closeSitterMenu(); });
    document.body.appendChild(ov);
    const first = bt.querySelector("button"); if(first) first.focus();
  }

  const keysDown = {};
  let roomW = 0, roomH = 0, roomDPR = 1;   // roomDPR: 화면 밀도(폰은 2~3배) — 캔버스를 그만큼 촘촘하게 그린다
  let nearbyIdx = -1;
  let roomLoopStarted = false;

  // 화면 크기에 비례해 고양이·아이템·이동속도를 키운다
  function uiScale(){
    if(!roomW || !roomH) return 1;
    return Math.max(0.9, Math.min(2.4, Math.min(roomW/520, roomH/360)));
  }
  function resizeRoomCanvas(){
    const canvas = document.getElementById("room-canvas");
    const wrap = document.getElementById("room-wrap");
    if(!canvas || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const nw = Math.round(rect.width), nh = Math.round(rect.height);
    const ndpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    if(!nw || !nh || (nw === roomW && nh === roomH && ndpr === roomDPR)) return;
    const ow = roomW, oh = roomH;
    roomDPR = ndpr;
    canvas.width = Math.round(nw * roomDPR); canvas.height = Math.round(nh * roomDPR);
    roomW = nw; roomH = nh;
    if(ow && oh){   // 크기가 바뀌어도 고양이와 물건이 같은 상대 위치에 있도록
      const kx = nw/ow, ky = nh/oh;
      player.x *= kx; player.y *= ky;
      ((state && state.roomObjects) || []).forEach(o=>{ o.x *= kx; o.y *= ky; if(o.sx != null){ o.sx *= kx; o.sy *= ky; } });
    }
    if(ow && oh) setTimeout(nudgeObjectsFromHud, 0);   // 화면 크기가 바뀌면 HUD 위치도 바뀐다
  }
  window.addEventListener("resize", resizeRoomCanvas);
  if(window.ResizeObserver){ new ResizeObserver(resizeRoomCanvas).observe(document.getElementById("room-wrap")); }

  // 이 장소에 새로 들어왔을 때 방 안에 놀러운 사건 3개를 새로 주지 놀아준다
  function spawnRoomObjects(locId){
    const w = roomW || 480, h = roomH || 320;
    const spots = spotsFor(locId, 3) || [
      { x: w*0.26, y: h*0.38 },
      { x: w*0.74, y: h*0.32 },
      { x: w*0.5,  y: h*0.72 },
    ];
    const seasonName = getSeason(state.day).name;
    const outdoors = !(locId === "home" && state.homeInside);
    state.roomObjects = spots.map(p=> ({ item: pickItem(locId), x:p.x, y:p.y, sx:p.x, sy:p.y, consumed:false }));
    // 연인 퀘스트: 연인이 가끔 모습을 드러낸다 (선물을 물고 있으면 더 자주)
    if(state.hasPartner && state.loveStage < 4){
      const chance = state.carry ? 0.6 : ((state.loveStage === 0) ? 0.35 : 0.28);
      if(Math.random() < chance){
        state.roomObjects[Math.floor(Math.random() * state.roomObjects.length)].item = LOVER_ITEM;
      }
    }

    if(outdoors && (seasonName === "가을" || seasonName === "겨울")){
      // 가을·겨울에는 방에 들어올 때 5% 확률로 츄르 하나가 숨겨져 나타난다.
      if(Math.random() < SEASONAL_CHURU_CHANCE){
        const candidates = state.roomObjects.map((o,i)=>({o,i})).filter(v=>
          v.o.item && !["lover","secret","owner","trap"].includes(v.o.item.key)
        );
        if(candidates.length){
          const chosen = candidates[Math.floor(Math.random() * candidates.length)];
          chosen.o.item = Object.assign({}, CHURU_ITEM, { msg: (seasonName === "가을" ? "🍂 낙엽 더미 밑에서 츄르를 발견했다! 쭉쭉 짜 먹으니 천국이 따로 없다" : "❄️ 눈더미 밑에서 츄르를 발견했다! 쭉쭉 짜 먹으니 천국이 따로 없다") });
          chosen.o.lastItem = null;
        }
      }
      // 덫과 희귀 츄르는 낙엽/눈 밑에 가려진다. 가까이 가거나 수염 센서가 있으면 알아챌 수 있다.
      state.roomObjects.forEach(o=>{
        if(o.item && (o.item.key === "trap" || o.item.key === "churu")){
          o.hiddenUnder = seasonName === "가을" ? "leaves" : "snow";
          o.hiddenRevealed = false;
        }
      });
    }

    if(outdoors && seasonName === "장마"){
      // 장마에는 방마다 물웅덩이 2개가 생긴다. 기존 아이템/출입구와 겹치지 않는 길 위에 놓는다.
      // 지형별 실제 길(바닥) 위 지정 위치만 사용한다. 랜덤 후보는 지붕·담장에 나타날 수 있어 사용하지 않는다.
      const S = uiScale(), puddleSpots = [];
      const pathSpots = {
        park:[[49,34],[49,69],[27,50],[72,50],[49,83]],
        playground:[[45,76],[78,76],[24,68],[49,88]],
        market:[[48,40],[50,72],[25,40],[73,40],[49,84]],
        housing:[[50,45],[50,83],[32,45],[66,45]],
        alley:[[49,43],[49,71],[49,89],[28,54],[72,54]],
        market_st:[[48,40],[50,56],[51,76],[29,40]],
        lot:[[45,47],[66,47],[45,71],[50,85]],
        home:[[50,70],[39,68],[61,68],[50,86]],
        home_adopted:[[50,70],[32,65],[69,65],[50,89]],
        road:[[20,46],[50,46],[80,46],[50,85]],
        stream:[[25,46],[73,46],[24,65],[75,65]],
      };
      const ground = pathSpots[layoutKey(locId)] || [];
      const D = doorSet(locId);
      for(const [px,py] of ground){
        const p = pctToXY(locId, px, py);
        if(p.x < 46*S || p.x > w-46*S || p.y < 46*S || p.y > h-46*S) continue;
        if(!walkableRaw(locId,p.x,p.y) || (D && !D.reach(p.x,p.y)) || !inPathArea(locId,p.x,p.y)) continue;
        if(state.roomObjects.some(o=> Math.hypot(o.x-p.x,o.y-p.y) < 76*S)) continue;
        if(puddleSpots.some(q=> Math.hypot(q.x-p.x,q.y-p.y) < 84*S)) continue;
        if(hudHit(p,22*S)) continue;
        puddleSpots.push(p);
        if(puddleSpots.length >= 2) break;
      }
      // 안전한 장소가 없으면 웅덩이를 생략한다. 벽이나 지붕에 생성하는 것보다 낫다.
      puddleSpots.forEach(p=> state.roomObjects.push({
        item:SEASONAL_PUDDLE_ITEM, x:p.x, y:p.y, sx:p.x, sy:p.y,
        consumed:false, seasonHazard:true, hazardType:"puddle", hazardRadius:31
      }));
    }

    nudgeObjectsFromHud();
    maybeSpawnSecret(locId);
  }

  const minimapEl = document.getElementById("minimap");
  function _renderMinimapFull(){
    if(!minimapEl || !state) return;
    minimapEl.innerHTML = "";
    minimapEl.classList.toggle("fog", !!state.fireSearch);
    LOCATIONS.forEach(loc=>{
      const [c,r] = state.layout[loc.id];
      const cell = document.createElement("div");
      const here = loc.id === state.currentLoc;
      cell.className = "mm-cell" + (state.visited[loc.id] ? " seen" : "") + (here ? " here" : "");
      cell.style.gridColumn = c+1; cell.style.gridRow = r+1;
      cell.style.background = state.visited[loc.id] ? (ROOM_BG[loc.id] || "#ECE9F7") : "#ECE9F7";
      cell.textContent = here ? "\uD83D\uDC31" : (state.visited[loc.id] ? locDisplayIcon(loc) : "???");
      if(!here && !state.visited[loc.id]) cell.classList.add("unk");
      cell.title = state.visited[loc.id] ? locDisplayName(loc) : "???";
      if(state.fireSearch){
        if(state.fireSearch.hint && loc.id === "home"){ cell.textContent = state.adopted ? "\uD83C\uDFE0" : "\uD83D\uDCE6"; cell.style.background = "#FFE9A8"; cell.title = state.adopted ? "집" : "보금자리"; cell.classList.add("seen"); cell.classList.remove("unk"); }
        else { cell.textContent = "\uD83C\uDF2B\uFE0F"; cell.style.background = "#DADBE6"; cell.title = "???"; }
      }
      minimapEl.appendChild(cell);
    });
  }


  /* ================= 아이작식 HUD (좌상단) ================= */
  const IH_HEART = '<path d="M8 13.4 1.6 6.9C-.4 4.4 1 .6 4.3.6 6 .6 7.3 1.7 8 3 8.7 1.7 10 .6 11.7.6c3.300 0 4.700 3.800 2.700 6.300z"/>';
  function ihHeart(frac){   // frac: 0, .5, 1
    return '<span class="ih"><svg viewBox="0 0 16 14"><g fill="#3a2030" stroke="#12080f" stroke-width="1">' + IH_HEART + '</g></svg>' +
      '<svg class="fill" viewBox="0 0 16 14" style="clip-path:inset(0 ' + Math.round((1 - frac)*100) + '% 0 0)"><g fill="#ff4d6a" stroke="#12080f" stroke-width="1">' + IH_HEART + '</g><path d="M3.200 2.300C4 1.700 5 1.800 5.500 2.600" stroke="#fff" stroke-opacity=".7" fill="none" stroke-width="1.100" stroke-linecap="round"/></svg></span>';
  }
  function ihRow(key, ico, val, color, lowAt){
    const v = Math.max(0, Math.min(100, Math.round(val)));
    const cls = (lowAt != null && v < lowAt) ? " low" : "";
    return '<div class="ih-row' + cls + '" data-k="' + key + '"><span class="ico">' + ico + '</span><b>' + String(v).padStart(2, "0") + '</b><i><em style="width:' + v + '%;background:' + color + '"></em></i></div>';
  }
  function renderIsaacHud(){
    const el = document.getElementById("isaac-hud");
    if(!el || !state) return;
    const units = Math.round(clamp(state.affection) / 10);    // 하트 5칸 = 반 칸 10단계
    let h = '<div class="ih-hearts" data-k="affection" title="애정도">';
    for(let i = 0; i < 5; i++) h += ihHeart(Math.max(0, Math.min(2, units - i*2)) / 2);
    h += '</div>';
    h += ihRow("hunger", "🍖", state.hunger, "#ffb27a", 25);
    h += ihRow("fun", "🧶", state.fun, "#7cc0ff", 25);
    const rk = clamp(state.risk);
    h += ihRow("risk", rk >= 75 ? "⛈️" : (rk >= 50 ? "☁️" : (rk >= 25 ? "⛅" : "☀️")), rk, rk >= 70 ? "#ff5a4a" : (rk >= 40 ? "#e8a33d" : "#5fd08a"), null);
    if(state.hasPartner){
      const st = Math.max(0, Math.min(4, state.loveStage || 0));
      h += '<div class="ih-sep"></div><div class="ih-love" title="연인">' + LOVE_HEARTS[st] + '<span>' + (state.carry ? state.carry.icon : "") + '</span></div>';
    }
    el.innerHTML = h;
  }

  /* ================= 미니맵: 가본 방 + 문이 이어진 방만 표시 ================= */
  function renderMinimap(){
    if(!minimapEl || !state) return;
    if(state.fireSearch) return _renderMinimapFull();      // 화재 중엔 안개 지도 그대로
    minimapEl.innerHTML = "";
    minimapEl.classList.remove("fog");
    const known = {};
    LOCATIONS.forEach(loc=>{
      if(!state.visited[loc.id]) return;
      known[loc.id] = 1;
      Object.keys(loc.exits || {}).forEach(d=> known[loc.exits[d]] = 1);
    });
    known[state.currentLoc] = 1;
    const dmap = { up:"u", down:"d", left:"l", right:"r" };
    LOCATIONS.forEach(loc=>{
      if(!known[loc.id]) return;
      const [c, r] = state.layout[loc.id];
      const seen = !!state.visited[loc.id], here = loc.id === state.currentLoc;
      const cell = document.createElement("div");
      cell.className = "mm-cell" + (seen ? " seen" : " unk") + (here ? " here" : "");
      cell.style.gridColumn = c + 1; cell.style.gridRow = r + 1;
      cell.textContent = here ? "🐱" : (seen ? locDisplayIcon(loc) : "?");
      cell.title = seen ? locDisplayName(loc) : "???";
      if(seen) Object.keys(loc.exits || {}).forEach(d=>{ const nb = document.createElement("i"); nb.className = "md " + dmap[d]; cell.appendChild(nb); });
      minimapEl.appendChild(cell);
    });
  }

  /* ================= 아이템 획득 배너 ================= */
  let _ibTimer = null;
  function showItemBanner(key){
    const sk = SKILLS[key]; if(!sk) return;
    const b = document.getElementById("item-banner"); if(!b) return;
    const rar = RARITY[SKILL_RARITY[key]] || RARITY.common;
    b.style.setProperty("--ib", rar.color);
    document.getElementById("ib-ico").innerHTML = skIcon(key);
    document.getElementById("ib-tag").textContent = rar.label + " · " + sk.tag;
    document.getElementById("ib-name").textContent = sk.name;
    const firstSentence = (sk.desc.split(/(?<=[.!?])\s/)[0] || sk.desc);
    document.getElementById("ib-desc").textContent = firstSentence;
    const fl = document.getElementById("ib-flash"); if(fl){ fl.classList.remove("go"); void fl.offsetWidth; fl.classList.add("go"); }
    b.classList.remove("show"); void b.offsetWidth; b.classList.add("show");
    clearTimeout(_ibTimer);
    _ibTimer = setTimeout(()=> b.classList.remove("show"), 3000);
  }

  /* ================= 보스 VS 인트로 ================= */
  function showVsIntro(opt, go){
    const el = document.getElementById("vs-intro");
    if(!el){ go(); return; }
    state.minigame = true;
    Object.keys(keysDown).forEach(k=> keysDown[k] = false);
    setBackgroundInteractive(false);
    document.getElementById("vs-me").src = DUEL_SPRITES.player[0];
    document.getElementById("vs-foe").src = BOSS_DUEL_SPRITES[1];
    // 보스 기본 스프라이트는 오른쪽을 보므로, 도전자 쪽(왼쪽)으로 향하게 한다.
    document.getElementById("vs-foe").style.transform = "scaleX(-1)";
    const next = TURF_RANK_NAMES[Math.min(3, (state.turfRank || 0) + 1)] || "";
    document.getElementById("vs-me-sub").textContent = "도전자";
    document.getElementById("vs-foe-sub").textContent = next ? "─ " + next + " ─" : "";
    el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
    sfx("duelStart");
    let done = false, t = null;
    const finish = ()=>{
      if(done) return; done = true; clearTimeout(t);
      window.removeEventListener("keydown", onKey, true);
      el.removeEventListener("pointerdown", finish);
      el.classList.remove("show");
      go();
    };
    const onKey = e=>{ if(e.key === " " || e.key === "Enter"){ e.preventDefault(); e.stopPropagation(); finish(); } };
    window.addEventListener("keydown", onKey, true);
    el.addEventListener("pointerdown", finish);
    t = setTimeout(finish, 2100);
  }

  /* ================= 문틀 (아이작의 문) ================= */
  function drawIsaacDoors(ctx, loc, w, h, S, wx, dw, dd){
    const post = "#6e4f35", hi = "rgba(255,226,170,.65)", pulse = 0.5 + 0.5*Math.sin(performance.now()/420);
    const arrow = (x, y, dx, dy, seen)=>{
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(dy, dx));
      ctx.globalAlpha = (seen ? 0.55 : 0.4) + 0.3*pulse;
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.6*S; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(-4*S, -6*S); ctx.lineTo(3*S, 0); ctx.lineTo(-4*S, 6*S); ctx.stroke();
      ctx.restore();
    };
    const dirs = [["up", 0, -1], ["down", 0, 1], ["left", -1, 0], ["right", 1, 0]];
    dirs.forEach(([dir, dx, dy])=>{
      if(!wx[dir]) return;
      const seen = !!state.visited[wx[dir]];
      doorPts(loc.id, dir).forEach(q=>{
        const vert = dir === "up" || dir === "down";
        const px = vert ? q.x : (dir === "left" ? 0 : w - dd), py = vert ? (dir === "up" ? 0 : h - dd) : q.y;
        const t = 6*S;
        ctx.fillStyle = post;
        if(vert){
          ctx.fillRect(q.x - dw/2 - t, py, t, dd); ctx.fillRect(q.x + dw/2, py, t, dd);
          ctx.fillStyle = hi; ctx.fillRect(q.x - dw/2 - t, py, 2*S, dd); ctx.fillRect(q.x + dw/2, py, 2*S, dd);
        } else {
          ctx.fillRect(px, q.y - dw/2 - t, dd, t); ctx.fillRect(px, q.y + dw/2, dd, t);
          ctx.fillStyle = hi; ctx.fillRect(px, q.y - dw/2 - t, dd, 2*S); ctx.fillRect(px, q.y + dw/2, dd, 2*S);
        }
        const ax = vert ? q.x : (dir === "left" ? dd*0.5 : w - dd*0.5), ay = vert ? (dir === "up" ? dd*0.5 : h - dd*0.5) : q.y;
        arrow(ax, ay, dx, dy, seen);
      });
    });
  }

  function renderLocBadge(){
    renderMinimap();
    const badgeEl = document.getElementById("loc-badge");
    const loc = LOC_BY_ID[state.currentLoc];
    app.style.backgroundColor = state.fireSearch ? "#B9BAC8" : (PAGE_BG[state.currentLoc] || "#E6E0F7");
    const hud = document.getElementById("fire-hud");
    app.classList.toggle("fire-on", !!state.fireSearch);
    if(hud){ hud.classList.toggle("on", !!state.fireSearch); if(state.fireSearch) hud.textContent = "🌫️ " + (state.adopted ? "집" : "보금자리") + "까지 👣 " + (state.fireSearch.d[state.currentLoc] || 0) + "걸음 남았습니다"; }
    if(badgeEl && state.fireSearch) badgeEl.textContent = "📍 ???";
    else if(badgeEl) badgeEl.textContent = state.jackpotRoom ? "💰 잭팟 방" : "\uD83D\uDCCD " + locDisplayName(loc);
  }

  // 들어갈 때는 반대편 문(들어온 방향의 거기)에서 등장한다 (아이작스타일)
  function spawnStash(bold){
    const w = roomW || 480, h = roomH || 320;
    const spots = spotsFor(state.currentLoc, 5) || [
      { x:w*0.2, y:h*0.35 }, { x:w*0.5, y:h*0.25 }, { x:w*0.8, y:h*0.35 },
      { x:w*0.34, y:h*0.72 }, { x:w*0.66, y:h*0.72 },
    ];
    const { items, jackpot } = makeStashItems(bold);
    if(jackpot){   // 잭팟: 창고 안쪽의 숨은 보물방으로 들어간다
      setTimeout(()=> showToast("✨ 창고 안쪽에서 금빛이 새어 나온다!"), 250);
      setTimeout(()=> enterJackpot(), 1100);
      return;
    }
    state.roomObjects = spots.map((p,i)=> ({ item:items[i], x:p.x, y:p.y, sx:p.x, sy:p.y, consumed:false, stash:true }));
    state.stashLeft = 5;
    nudgeObjectsFromHud();
    setTimeout(()=> showToast(jackpot ? "✨ 창고 안에서 반짝이는 무언가가 보인다!" : "📦 먹이 창고다! 바닥에 먹을 것이 가득하다"), 500);
  }

  const MOVE_COST = { hunger:2, fun:2 };
  /* 화재 속 안개: 집 근처에 닿으면 곧장 순간이동하지 않는다.
     마지막 관문인 도로 건너기 미니게임을 마친 뒤에만 집 맵으로 이동한다. */
  function fireWarp(locId){
    const fs = state.fireSearch;
    const home = locId === "home" || !!(fs && fs.d[locId] != null && fs.d[locId] <= 1);
    return { locId, warped:false, home };
  }
  function enterRoom(locId, fromDir){
    let _warp = null;
    if(state.fireSearch && fromDir){
      _warp = fireWarp(locId);
      if(_warp.home){
        const fs = state.fireSearch;
        if(fs && !fs._roadStarted){
          fs._roadStarted = true;
          if(fromDir && state.running && !state.gameOver) applyEffToState({hunger:-MOVE_COST.hunger, fun:-MOVE_COST.fun});
          fs.steps = (fs.steps || 0) + 1;
          state.hunger = Math.max(5, state.hunger);
          fs._msg = "🏠 익숙한 냄새가 코끝에 닿았다. 이제 마지막으로 차도를 건너야 한다...";
          showToast("🏠 거의 다 왔다! 차들을 피해 집으로 가자.");
          startRoadGame({ returnHome:true });
          return; // 도로 미니게임 전에는 목적지(집)로 이동하지 않는다.
        }
      } else if(_warp.warped){
        state.fireSearch._msg = "🌫️ 안개 때문에 엉뚱한 길로 들어섰다...";
        dimFlash(null, 260, 120, 650);
      }
    }
    sfx("step");
    if(fromDir && state.running && !state.gameOver){   // 장소를 옮길 때마다 기운이 조금 빠진다
      applyEffToState({hunger:-MOVE_COST.hunger, fun:-MOVE_COST.fun});
    }
    const wasVisited = !!state.visited[locId];
    state.currentLoc = locId;
    state.visited[locId] = true;
    state._trapGraceUntil = performance.now() + 1800;       // 들어오자마자 덫을 밟는 일이 없도록 잠깐 유예
    state.homeInside = false; state._homeIn = null; state._homeOut = null; state._homeFx = null; state.jackpotRoom = false; state._jpOut = null; state._jpBusy = false;
    const w = roomW || 480, h = roomH || 320, m = 36 * uiScale();
    const hx = player.x, hy = player.y;
    const _fd = (_warp && (_warp.warped || _warp.home)) ? null : fromDir;     // 순간이동·엉뚱한 곳: 문 대신 걸을 수 있는 자리에 내린다
    if(_fd === "up"){ player.x = doorXY(locId, "down", hx).x; player.y = h - m; }
    else if(_fd === "down"){ player.x = doorXY(locId, "up", hx).x; player.y = m; }
    else if(_fd === "left"){ player.x = w - m; player.y = doorXY(locId, "right", hy).y; }
    else if(_fd === "right"){ player.x = m; player.y = doorXY(locId, "left", hy).y; }
    else { const D0 = doorSet(locId), q = (D0 && D0.s0) || nearestWalkable(locId, w/2, h/2); player.x = q.x; player.y = q.y; }
    spawnRoomObjects(locId);
    theftOnEnter(fromDir);
    if(state.lovebirds){ loverMate.ready=true; loverMate._companionScene=null; planCompanionTargets(uiScale());
      if(Number.isFinite(loverMate._followTX)){ loverMate.x=loverMate._followTX; loverMate.y=loverMate._followTY; } }   // 연인도 함께 들어온다
    kittenOnEnter();   // 새끼들도 함께 들어온다 (도망친 새끼는 숨은 곳에서 기다린다)
    kidPlaceCheck(locId);   // 맡긴 새끼가 가고 싶어 하던 곳이면 체험 완료
    if(state.fireSearch) state.roomObjects = [];
    renderLocBadge();
    if(fromDir){ renderAll(); const _hadPending = flushRoomExit(); if(state.fireSearch) onFireSearchStep(locId); else if(!_hadPending) maybePathEncounter(); }
    if(state.firePending && locId === "home") tryStartFirePending();   // 집(보금자리)으로 돌아오면 화재(철거) 이벤트 시작
  }


  /* ---------- 잭팟 방: 먹이 창고 안쪽의 숨은 보물방 (집 안처럼 별도 장면) ---------- */
  const JP_SPOTS = [[25,40],[50,34],[75,40],[36,62],[64,62]];   // 받침대 자리(%)
  let _jpImgEl = null;
  function jpImage(){
    if(!ASSET_IMG.jackpot_room) return null;
    if(!_jpImgEl){ _jpImgEl = new Image(); _jpImgEl.onload = ()=> SCENE_CACHE_CLEAR(); _jpImgEl.src = ASSET_IMG.jackpot_room; }
    return (_jpImgEl.complete && _jpImgEl.naturalWidth > 0) ? _jpImgEl : null;
  }
  let _jpPedestalEl = null;
  function jpPedestalImage(){
    if(!ASSET_IMG.stone_pedestal) return null;
    if(!_jpPedestalEl){
      _jpPedestalEl = new Image();
      _jpPedestalEl.onload = ()=> SCENE_CACHE_CLEAR();
      _jpPedestalEl.src = ASSET_IMG.stone_pedestal;
    }
    return (_jpPedestalEl.complete && _jpPedestalEl.naturalWidth > 0) ? _jpPedestalEl : null;
  }
  function enterJackpot(){
    if(!state || state.jackpotRoom || state.gameOver || state._jpBusy || state.fireSearch) return;
    state._jpBusy = true;
    dimFlash(null, 420, 520, 750, ()=>{
      const w = roomW || 480, h = roomH || 320;
      state._jpOut = { objs: state.roomObjects, x: player.x, y: player.y, homeInside: state.homeInside };
      state.jackpotRoom = true;
      state.roomObjects = JP_SPOTS.map(p=>{ const x = w*p[0]/100, y = h*p[1]/100; return { item:CHURU_ITEM, x, y, sx:x, sy:y, consumed:false, stash:true }; });
      state.stashLeft = 5;
      player.x = w/2; player.y = h*0.78;
      nearbyIdx = -1;
      SCENE_CACHE_CLEAR();
      state._jpGrace = performance.now() + 900;
      state._jpBusy = false;
      renderLocBadge();
      setTimeout(()=> showToast("💰 잭팟 방이다! 받침대마다 츄르가 놓여 있다"), 900);
    });
  }
  function askLeaveJackpot(){
    if(!state || !state.jackpotRoom || state._jpBusy || document.getElementById("jp-ask")) return;
    if(!document.getElementById("jp-ask-css")){
      const st = document.createElement("style"); st.id = "jp-ask-css";
      st.textContent = ".jp-ask{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(48,28,10,.5);}"
        + ".jp-ask-box{width:min(320px,100%);background:#FFF8EC;border:3px solid #F2B279;border-radius:18px;padding:18px 16px 14px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.3);font-family:inherit;color:#5b3010;}"
        + ".jp-ask-box h3{margin:0 0 6px;font-size:18px;font-weight:900;}.jp-ask-box p{margin:0 0 14px;font-size:13px;line-height:1.5;font-weight:700;}"
        + ".jp-ask-btns{display:flex;gap:8px;}.jp-ask-btns button{flex:1;border:0;border-radius:12px;padding:11px 8px;font-size:15px;font-weight:900;font-family:inherit;cursor:pointer;background:#F2B279;color:#5b3010;}"
        + ".jp-ask-btns button.no{background:#F3E6D4;color:#8a4b17;}.jp-ask-btns button:active{transform:scale(.97);}";
      document.head.appendChild(st);
    }
    const left = state.stashLeft || 0;
    state.sitterMenu = true; Object.keys(keysDown).forEach(k=> keysDown[k] = false);   // 확인하는 동안 고양이는 멈춘다
    const ov = document.createElement("div"); ov.id = "jp-ask"; ov.className = "jp-ask";
    ov.innerHTML = '<div class="jp-ask-box"><h3>정말로 나가시겠습니까?</h3><p>' + (left > 0 ? "아직 츄르가 " + left + "개 남아 있어요." : "츄르를 모두 먹었어요.") + '</p><div class="jp-ask-btns"><button class="yes" type="button">예</button><button class="no" type="button">아니오</button></div></div>';
    const close = ()=>{ ov.remove(); document.removeEventListener("keydown", onKey, true); if(state) state.sitterMenu = false; };
    const yes = ()=>{ close(); leaveJackpot(); };
    const no = ()=>{
      close();
      const S = uiScale(); player.y = (roomH || 320) - 22*S - 70*S; state._jpGrace = performance.now() + 700; nearbyIdx = -1;
    };
    const onKey = e=>{ if(e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); no(); } };
    ov.querySelector(".yes").addEventListener("click", yes);
    ov.querySelector(".no").addEventListener("click", no);
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(ov);
  }
  function leaveJackpot(){
    if(!state || !state.jackpotRoom || state._jpBusy) return;
    state._jpBusy = true;
    dimFlash(null, 360, 260, 650, ()=>{
      const o = state._jpOut || {};
      state.jackpotRoom = false; state._jpOut = null;
      state.roomObjects = o.objs || [];
      const w = roomW || 480, h = roomH || 320;
      player.x = o.x != null ? o.x : w/2; player.y = o.y != null ? o.y : h/2;
      state.stashLeft = 0;
      nearbyIdx = -1;
      SCENE_CACHE_CLEAR();
      state._jpBusy = false;
      renderLocBadge();
    });
  }
  function drawJackpotExit(ctx, w, h, S, dw, dd){
    const cx = w/2, x0 = cx - dw/2, p = 0.5 + 0.5*Math.sin(performance.now()/420);
    ctx.save();
    ctx.fillStyle = "#12091a"; ctx.fillRect(x0, h - dd, dw, dd);
    const g = ctx.createLinearGradient(0, h - dd - 26*S, 0, h);
    g.addColorStop(0, "rgba(255,226,150,0)"); g.addColorStop(1, "rgba(255,226,150," + (0.35 + 0.2*p).toFixed(2) + ")");
    ctx.fillStyle = g; ctx.fillRect(x0, h - dd - 26*S, dw, 26*S + dd);
    ctx.fillStyle = "#e0b04a"; ctx.fillRect(x0 - 5*S, h - dd, 5*S, dd); ctx.fillRect(x0 + dw, h - dd, 5*S, dd);
    ctx.fillStyle = "rgba(255,255,255," + (0.6 + 0.3*p).toFixed(2) + ")";
    ctx.font = "800 " + (11*S) + "px 'Noto Sans KR', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("나가기 ▼", cx, h - dd - 12*S);
    ctx.restore();
  }
  function drawJackpotFx(ctx, w, h, S){
    const t = performance.now()/1000;
    ctx.save();
    // 횃불 불꽃
    [[0.12,0.17],[0.88,0.17]].forEach((q,i)=>{
      const x = w*q[0], y = h*q[1], f = 1 + 0.12*Math.sin(t*9 + i*2);
      const g = ctx.createRadialGradient(x, y, 0, x, y, 70*S*f);
      g.addColorStop(0, "rgba(255,200,90,.34)"); g.addColorStop(1, "rgba(255,200,90,0)");
      ctx.fillStyle = g; ctx.fillRect(x - 70*S, y - 70*S, 140*S, 140*S);
      ctx.fillStyle = "#ff9a2e"; ctx.beginPath(); ctx.ellipse(x, y - 4*S, 6*S*f, 11*S*f, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#ffe08a"; ctx.beginPath(); ctx.ellipse(x, y - 1*S, 3*S, 6*S*f, 0, 0, 7); ctx.fill();
    });
    // 츄르 위 반짝임
    (state.roomObjects || []).forEach((o, i)=>{
      if(o.consumed) return;
      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, 40*S);
      g.addColorStop(0, "rgba(255,230,140," + (0.30 + 0.12*Math.sin(t*3 + i)).toFixed(2) + ")"); g.addColorStop(1, "rgba(255,230,140,0)");
      ctx.fillStyle = g; ctx.fillRect(o.x - 40*S, o.y - 40*S, 80*S, 80*S);
      for(let k = 0; k < 3; k++){
        const a = t*1.3 + i*1.7 + k*2.1, r = (16 + 10*((k*0.37 + i*0.21) % 1))*S;
        const px = o.x + Math.cos(a)*r, py = o.y - 6*S + Math.sin(a*1.3)*r*0.7, al = 0.35 + 0.65*Math.abs(Math.sin(t*2.4 + k*1.9 + i)), sz = (2 + 1.5*Math.abs(Math.sin(a)))*S;
        ctx.fillStyle = "rgba(255,246,200," + al.toFixed(2) + ")";
        ctx.beginPath(); ctx.moveTo(px, py - sz*2); ctx.lineTo(px + sz*0.6, py - sz*0.6); ctx.lineTo(px + sz*2, py); ctx.lineTo(px + sz*0.6, py + sz*0.6); ctx.lineTo(px, py + sz*2); ctx.lineTo(px - sz*0.6, py + sz*0.6); ctx.lineTo(px - sz*2, py); ctx.lineTo(px - sz*0.6, py - sz*0.6); ctx.closePath(); ctx.fill();
      }
    });
    ctx.restore();
  }
  function jackpotPainter(P){
    const { c, w, h, S, rnd } = P;
    const img = jpImage();
    if(img){
      const sc = Math.max(w/img.naturalWidth, h/img.naturalHeight), dw = img.naturalWidth*sc, dh = img.naturalHeight*sc;
      c.drawImage(img, (w - dw)/2, (h - dh)/2, dw, dh);
    } else {
      const wallH = h*0.30;
      // 안쪽 벽: 보라빛 벽돌
      c.fillStyle = "#3a2548"; c.fillRect(0, 0, w, wallH);
      const bw = 46*S, bh = 20*S;
      for(let r = 0; r*bh < wallH; r++){
        for(let k = -1; k*bw < w; k++){
          const x = k*bw + (r % 2 ? bw/2 : 0), y = r*bh, v = (rnd() - 0.5)*18;
          c.fillStyle = "rgb(" + Math.round(78 + v) + "," + Math.round(52 + v*0.7) + "," + Math.round(98 + v) + ")";
          c.fillRect(x + 1.5*S, y + 1.5*S, bw - 3*S, bh - 3*S);
          c.fillStyle = "rgba(255,255,255,.07)"; c.fillRect(x + 2*S, y + 2*S, bw - 4*S, 2*S);
        }
      }
      const sh = c.createLinearGradient(0, wallH - 26*S, 0, wallH + 6*S);
      sh.addColorStop(0, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,0,.45)"); c.fillStyle = sh; c.fillRect(0, wallH - 26*S, w, 32*S);
      // 바닥: 따뜻한 나무판
      const fl = c.createLinearGradient(0, wallH, 0, h); fl.addColorStop(0, "#6b4a30"); fl.addColorStop(1, "#4a3220");
      c.fillStyle = fl; c.fillRect(0, wallH, w, h - wallH);
      for(let x = 0, k = 0; x < w; x += 54*S, k++){ c.fillStyle = k % 2 ? "rgba(0,0,0,.10)" : "rgba(255,230,180,.05)"; c.fillRect(x, wallH, 54*S, h - wallH); c.fillStyle = "rgba(20,10,6,.5)"; c.fillRect(x, wallH, 2*S, h - wallH); }
      // 붉은 카펫 (문에서 안쪽으로)
      const cw = Math.min(w*0.17, 92*S);
      c.fillStyle = "#e0b04a"; c.fillRect(w/2 - cw - 4*S, wallH - 2*S, cw*2 + 8*S, h - wallH + 2*S);
      c.fillStyle = "#8f2036"; c.fillRect(w/2 - cw, wallH - 2*S, cw*2, h - wallH + 2*S);
      c.strokeStyle = "rgba(255,214,120,.55)"; c.lineWidth = 2*S; c.strokeRect(w/2 - cw + 8*S, wallH + 6*S, cw*2 - 16*S, h - wallH);
      // 모서리 금화 더미
      const pile = (x, y)=>{
        P.shadow(x, y + 8*S, 30*S, 7*S, 0.3);
        for(let i = 0; i < 16; i++){ const px = x + (rnd() - 0.5)*44*S, py = y + (rnd() - 0.5)*14*S - i*0.8*S; P.ell(px, py, 8*S, 4.4*S, i % 3 ? "#f2c24a" : "#ffdf7a", "#9a6a14", S); }
      };
      pile(w*0.10, h*0.88); pile(w*0.90, h*0.88); pile(w*0.08, h*0.44); pile(w*0.92, h*0.44);
      // 횃불 걸이
      [0.12, 0.88].forEach(q=>{ P.rr(w*q - 4*S, h*0.17, 8*S, 26*S, 2*S, "#5a3d28", "#2b1b12", S); P.rr(w*q - 9*S, h*0.17 - 2*S, 18*S, 6*S, 2*S, "#7a5a3a", "#2b1b12", S); });
      // 금빛 조명
      const lg = c.createRadialGradient(w/2, h*0.46, 0, w/2, h*0.46, Math.max(w, h)*0.55);
      lg.addColorStop(0, "rgba(255,214,120,.22)"); lg.addColorStop(1, "rgba(255,214,120,0)"); c.fillStyle = lg; c.fillRect(0, 0, w, h);
    }
    // 돌기둥 받침대 (츄르 오브젝트는 별도 로직으로 그려지므로 원본 돌기둥엔 카드/츄르가 없음)
    const pedArt = jpPedestalImage();
    JP_SPOTS.forEach(sp=>{
      if(pedArt){
        const x = w*sp[0]/100, y = h*sp[1]/100;
        // 떠 있는 츄르보다 낮게 배치하여 기존 획득 판정을 건드리지 않는다.
        c.drawImage(pedArt, x - 29*S, y + 13*S, 58*S, 57*S);
        return;
      }
      const x = w*sp[0]/100, y = h*sp[1]/100, top = y + 16*S, bot = y + 46*S, pw = 21*S;
      P.shadow(x, bot + 2*S, pw*1.35, 6*S, 0.36);
      const g = c.createLinearGradient(x - pw, 0, x + pw, 0); g.addColorStop(0, "#5d566f"); g.addColorStop(0.4, "#9890ae"); g.addColorStop(1, "#5d566f");
      c.fillStyle = g; c.fillRect(x - pw*0.8, top, pw*1.6, bot - top);
      c.strokeStyle = "#17101e"; c.lineWidth = 2.5*S; c.strokeRect(x - pw*0.8, top, pw*1.6, bot - top);
      P.ell(x, bot, pw*0.9, 5*S, "#6f6884", "#17101e", 2.5*S);
      P.ell(x, top, pw*1.05, 7*S, "#c4bdd8", "#17101e", 2.5*S);
      P.ell(x, top - 1*S, pw*0.62, 3.4*S, "rgba(255,226,150,.55)");
    });
  }

  function toggleHome(inside){
    sfx("step");
    let _prevScene = null;   // 전환 효과용: 바뀌기 직전의 배경을 잡아 둔다
    try{ const rc = document.getElementById("room-canvas"); if(rc && rc.width) _prevScene = getScene(roomW, roomH, uiScale(), LOC_BY_ID[state.currentLoc]); }catch(e){}
    if(inside){
      state._homeOut = state.roomObjects; state.homeInside = true;
      if(state._homeIn){ state.roomObjects = state._homeIn; } else { spawnRoomObjects("home"); }
      const q = pctToXY("home", 50, 68); player.x = q.x; player.y = q.y;
    } else {
      state._homeIn = state.roomObjects; state.homeInside = false;
      if(state._homeOut){ state.roomObjects = state._homeOut; } else { spawnRoomObjects("home"); }
      const q = pctToXY("home", 50, 58); player.x = q.x; player.y = q.y;
    }
    nearbyIdx = -1;
    nudgeObjectsFromHud();
    if(state.lovebirds){ loverMate._companionScene=null;planCompanionTargets(uiScale());
      if(Number.isFinite(loverMate._followTX)){loverMate.x=loverMate._followTX;loverMate.y=loverMate._followTY;} }
    kittenSnap();
    SCENE_CACHE_CLEAR();
    if(_prevScene){ state._homeFx = { prev:_prevScene, t0:performance.now(), dur:900, x:player.x, y:player.y, inside:!!inside }; }
    flushRoomExit();   // 집 안팎을 오갈 때도 방을 나선 것으로 본다
  }
  /* 집 안팎 전환: 문 위치에서 새 장면이 원형으로 번지며 이전 장면을 덮는다 (+ 따뜻한 빛 번짐) */
  let _homeFxLayer = null;
  function drawHomeFx(ctx, w, h){
    const fx = state._homeFx; if(!fx) return;
    const t = (performance.now() - fx.t0) / fx.dur;
    if(t >= 1){ state._homeFx = null; return; }
    const e = 1 - Math.pow(1 - t, 3);
    const R = Math.hypot(w, h) * 1.05 * e + 1, soft = Math.max(40, R * 0.35);
    if(!_homeFxLayer){ _homeFxLayer = document.createElement("canvas"); }
    const pw = Math.round(w * roomDPR), ph = Math.round(h * roomDPR);
    if(_homeFxLayer.width !== pw || _homeFxLayer.height !== ph){ _homeFxLayer.width = pw; _homeFxLayer.height = ph; }
    const g = _homeFxLayer.getContext("2d");
    g.setTransform(roomDPR, 0, 0, roomDPR, 0, 0);
    g.globalCompositeOperation = "source-over"; g.clearRect(0, 0, w, h);
    g.drawImage(fx.prev, 0, 0, w, h);
    g.globalCompositeOperation = "destination-out";
    const grd = g.createRadialGradient(fx.x, fx.y, Math.max(0, R - soft), fx.x, fx.y, R);
    grd.addColorStop(0, "rgba(0,0,0,1)"); grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    ctx.drawImage(_homeFxLayer, 0, 0, w, h);
    const glow = Math.sin(Math.min(1, t) * Math.PI) * 0.22;
    const lg = ctx.createRadialGradient(fx.x, fx.y, 0, fx.x, fx.y, Math.max(w, h) * 0.55);
    lg.addColorStop(0, "rgba(255,236,190," + glow.toFixed(3) + ")"); lg.addColorStop(1, "rgba(255,236,190,0)");
    ctx.fillStyle = lg; ctx.fillRect(0, 0, w, h);
  }
  function SCENE_CACHE_CLEAR(){ Object.keys(SCENE_CACHE).forEach(k=> delete SCENE_CACHE[k]); }
  function updatePopup(){
    const pop = document.getElementById("room-popup");
    if(!pop) return;
    if(nearbyIdx >= 0 && state.roomObjects[nearbyIdx] && !state.roomObjects[nearbyIdx].consumed){
      const o = state.roomObjects[nearbyIdx];
      document.getElementById("popup-icon").textContent = iconFor(o.item);
      document.getElementById("popup-title").textContent = labelFor(o.item);
      const _pd = document.getElementById("popup-desc");
      if(_pd){ if(!_pd.dataset.def) _pd.dataset.def = _pd.textContent; _pd.textContent = o.item.steal ? (window.__IS_TOUCH ? "👆 탭해서 훔치기!" : "Space로 훔치기!") : (o.item.key === "bee" ? (window.__IS_TOUCH ? "👆 탭해서 침 피하기 도전!" : "Space로 침 피하기 도전!") : _pd.dataset.def); }
      pop.classList.add("show");
    } else if(loverNear){
      document.getElementById("popup-icon").textContent = "😻";
      document.getElementById("popup-title").textContent = "연인";
      const _pd2 = document.getElementById("popup-desc");
      if(_pd2) _pd2.textContent = (kittenCount("sit") ? (state.carry && state.carry.forKid ? (window.__IS_TOUCH ? "👆 탭해서 새끼에게 건네주기" : "Space로 새끼에게 건네주기") : (window.__IS_TOUCH ? "👆 탭해서 새끼 돌보기" : "Space로 새끼 돌보기")) : (window.__IS_TOUCH ? "👆 탭해서 새끼 맡기기" : "Space로 새끼 맡기기"));
      pop.classList.add("show");
    } else {
      pop.classList.remove("show");
    }
  }

  function roomInputAllowed(){
    if(!state.running || state.gameOver) return false;
    if(stranger) return false;                 // 낯선 고양이가 다가오는 동안엔 움직일 수 없다
    if(state.roadGame) return false;
    if(state.minigame) return false;
    if(cutsceneActive()) return false;
    if(choiceOverlay.classList.contains("show") || endOverlay.classList.contains("show")) return false;
    if(dexOverlay.classList.contains("show")) return false;
    if(state.autoLock) return false;
    if(state.sitterMenu) return false;         // 새끼 맡기기 창이 열려 있는 동안
    if(state.napping) return false;            // 노묘가 꾸벅꾸벅 조는 동안엔 움직일 수 없다
    return true;
  }

  /* ---------- 쫓아오는 것들: 개 · 들이대는 사람 · 뽀뽀하려는 사람 ----------
     닿으면 랜덤 0~1 데미지 × 10 만큼 배고픔이 닳는다 (전속력으로 도망치느라 힘이 빠지는 느낌) */
  const CHASE_DAMAGE_SCALE = 10;
  const CHASERS = {
    dog:   { risk:8, speed:0.6,  icon:"🐕", hit:"개에게 물렸다!",               miss:"개가 달려들었지만 간신히 피했다!",  label:"개에게 물림", msg:"쫓아온 개에게 물렸다" },
    pushy: { risk:3, speed:0.52, icon:"🧍", hit:"들이대는 사람에게 붙잡혔다!", miss:"뻗어오는 손길을 간신히 피했다!",    label:"붙잡힘",     msg:"쫓아온 사람에게 붙잡혀 발버둥쳤다" },
    kiss:  { risk:3, speed:0.52, icon:"😘", hit:"뽀뽀 세례를 받았다!",         miss:"날아오는 뽀뽀를 간신히 피했다!",    label:"뽀뽀 세례",  msg:"쫓아온 사람의 뽀뽀를 피하느라 진땀을 뺐다" },
    owner: { speed:0.74, icon:"👵", hit:"할머니에게 붙잡혔다!", miss:"할머니의 손을 간신히 피했다!", label:"집사에게 붙잡힘", msg:"가판대 집사에게 붙잡혔다" },
  };
  let chaseCooldown = 0;
  let onTrap = false;
  let onPuddle = false;
  function chaserHit(o, c, dx, dy, dist){
    const S = uiScale();
    if(o.item.key === "owner"){ chaseCooldown = 100; theftCaught(o); return; }
    chaseCooldown = 100;            // 연속으로 당하지 않도록 잠깐 무적
    o.consumed = true;              // 쫓아오는 것은 한 번 공격하면(맞든 피하든) 바로 사라진다 — 계속 따라오지 않는다
    if(nearbyIdx >= 0 && state.roomObjects[nearbyIdx] === o) nearbyIdx = -1;
    const dmg = Math.random() * (hasSkill("tumbler") ? 0.5 : 1);      // 0 ~ 1 (오뚜기의 꼬리는 절반)
    const loss = Math.round(dmg * CHASE_DAMAGE_SCALE);
    if(hasSkill("tumbler")){ addRing(player.x, player.y, 74, "#FFC83D", 560, "오뚝!"); FX.flash("rgba(255,200,61,.8)", 160); }
    if(loss <= 0){ sfx("dodge"); showToast(c.icon + " " + c.miss); return; }
    const before = snapStats();
    state.hunger = clamp(state.hunger - loss);
    applyEffToState({ risk: (c.risk || 0) });   // 공격당하면 위험도도 오른다 (오뚜기의 꼬리는 절반)
    if(hasSkill("tumbler")) state.risk = clamp(state.risk - Math.round((c.risk || 0) / 2));
    sfx("hurt");
    showToast(c.icon + " " + c.hit + " (-" + loss + ", 위험↑)");
    if(!hasSkill("tumbler")){      // 공격당하면 물고 있던 것을 반드시 떨어뜨린다 (오뚜기의 꼬리는 예외)
      if(state.carry){
        const dropped = state.carry; state.carry = null;
        addRing(player.x, player.y, 70, "#9C8CFF", 520, "툭!");
        setTimeout(()=> showToast(dropped.icon + (dropped.forKid ? " 공격당해서 새끼에게 줄 것을 떨어뜨렸다…" : " 공격당해서 연인에게 줄 선물을 떨어뜨렸다…")), 900);
      }
      if(state.theft){
        const T = state.theft; state.theft = null;
        (state.roomObjects || []).forEach(x=>{ if(x.item && x.item.key === "owner") x.consumed = true; });
        addRing(player.x, player.y, 70, "#FF7043", 520, "툭!");
        renderTheftHud();
        setTimeout(()=> showToast(T.icon + " 공격당해서 훔친 먹거리를 떨어뜨렸다…"), 900);
      }
    }
    bgPlayer.hurt(0.2 + dmg * 0.35);
    showDeltas(before);
    pushHistory({ kind:"item", item:{ icon:c.icon, label:c.label, bad:true }, msg:c.msg }, before);
    renderAll();
    checkForcedAction();
  }
  /* ---------- 고양이들의 왕: 개는 겁먹고 도망치고, 달려드는 사람은 신하 고양이가 막아선다 ---------- */
  function kingDogFlee(o, dx, dy, dist, S){
    const SCARE = 200*S;
    o.scared = dist < SCARE;
    if(!o.scared){ o.shake = 0; return; }
    if(!o._scaredToast){ o._scaredToast = true; sfx("scared"); showToast("\uD83D\uDC15 왕의 기세에 눌린 개가 꼬리를 말고 도망친다!"); }
    const m = 24*S, sp = player.speed * S * 0.95;
    let ax = -dx/dist, ay = -dy/dist;                                // 고양이 반대 방향
    const nx = o.x + ax*sp, ny = o.y + ay*sp;
    const cx = Math.max(m, Math.min(roomW - m, nx)), cy = Math.max(m, Math.min(roomH - m, ny));
    const stuck = (cx !== nx || cy !== ny);                          // 벽에 몰리면 벽을 따라 옆으로 빠져나간다
    o.x = cx; o.y = cy;
    if(stuck){
      const side = (o._side = o._side || (Math.random() < 0.5 ? 1 : -1));
      o.x = Math.max(m, Math.min(roomW - m, o.x + (-ay)*side*sp));
      o.y = Math.max(m, Math.min(roomH - m, o.y + ( ax)*side*sp));
    }
    o.shake = Math.sin(performance.now()/40) * 1.6*S;                // 덜덜 떠는 느낌
  }
  function kingGuardBlock(o, dx, dy, dist, S){
    const TRIGGER = 160*S, RELEASE = 280*S;
    if(!o.guard){
      if(dist > TRIGGER){                                            // 평소처럼 쫓아오다가, 가까워지면 신하가 뛰어든다
        const sp = player.speed * S * CHASERS[o.item.key].speed;
        o.x += dx/dist*sp; o.y += dy/dist*sp; return;
      }
      const px = -dy/dist, py = dx/dist, side = Math.random() < 0.5 ? 1 : -1;
      // 신하 고양이의 털색을 분리해 왕(크림색)과 구분한다.
      o.guard = { x:(o.x + player.x)/2 + px*side*110*S, y:(o.y + player.y)/2 + py*side*110*S,
        t:0, blocked:false, variant:Math.floor(Math.random()*3) };
      o.blockT = 0;
      sfx("guard");
      showToast("\uD83D\uDE3C 신하 고양이가 달려드는 사람 앞을 막아섰다!");
    }
    const g = o.guard;
    if(dist > RELEASE){ o.guard = null; o.shake = 0; return; }       // 멀어지면 신하는 물러나고, 다시 다가오면 또 막아선다
    const ux = dx/dist, uy = dy/dist, tx = o.x + ux*46*S, ty = o.y + uy*46*S;   // 사람과 고양이 사이
    const gx = tx - g.x, gy = ty - g.y, gd = Math.hypot(gx, gy);
    const gs = 9*S;
    if(gd > gs){ g.x += gx/gd*gs; g.y += gy/gd*gs; g.blocked = false; }
    else { g.x = tx; g.y = ty; g.blocked = true; }
    g.t++;
    if(g.blocked){
      o.blockT++;
      o.shake = Math.sin(o.blockT*0.9) * 2.4*S;                      // 막힌 채로 버둥버둥
      if(o.blockT > 170){                                            // 한참 못 지나가면 포기하고 쫓겨난다
        o.consumed = true; o.guard = null;
        sfx("good");
        showToast("\uD83D\uDE3C 신하 고양이들이 달려드는 사람을 쫓아냈다!");
      }
    }
  }
  function updateChasers(){
    const S = uiScale();
    if(chaseCooldown > 0) chaseCooldown--;
    (state.roomObjects||[]).forEach(o=>{
      if(o.item !== o.lastItem){
        o.lastItem = o.item;
        if(CHASERS[o.item.key]){ o.chaseGrace = 70; }                       // 등장 직후엔 잠깐 멈칫
        else if(o.sx != null){ o.x = o.sx; o.y = o.sy; }
      }
      const c = CHASERS[o.item.key];
      if(o.consumed || !c) return;
      if(o.chaseGrace > 0){ o.chaseGrace--; return; }
      if(o.fleeT > 0) return;                                        // 스킬에 놀라 도망치는 중 (updateSkillFx가 움직인다)
      if(hiding()){ o.shake = Math.sin(performance.now()/90) * 1.2 * S; return; }   // 박스 속 고양이를 못 찾는다
      const dx = player.x - o.x, dy = player.y - o.y;
      const dist = Math.hypot(dx, dy) || 1;
      if(state.turfRank >= 3){                                   // 고양이들의 왕 앞에서는 상황이 뒤집힌다
        if(o.item.key === "dog"){ kingDogFlee(o, dx, dy, dist, S); return; }
        kingGuardBlock(o, dx, dy, dist, S); return;
      }
      o.scared = false; o.guard = null; o.shake = 0;
      if(dist < 30*S){
        if(chaseCooldown <= 0) chaserHit(o, c, dx, dy, dist);
        return;
      }
      const sp = player.speed * S * c.speed;     // 고양이보다 조금 느리다
      o.x += dx/dist * sp; o.y += dy/dist * sp;
    });
  }

  /* ================= 도둑고양이: 시장 가판대 먹거리 훔치기 =================
     가판대 먹거리를 물고 튀면 집사 할머니가 뒤쫓아 온다.
     지도(방) THEFT_CFG.rooms 개를 붙잡히지 않고 지나가면 성공, 붙잡히면 먹거리를 빼앗기고 꿀밤. */
  const THEFT_CFG = { endWins:3, endFails:3, rooms:3, hunger:20, fun:20, weight:1, risk:4, failHunger:-10, failFun:-8, failRisk:8, minDay:3 };
  const OWNER_ITEM = { key:"owner", icon:"👵", label:"시장 할머니", tier:"special", bad:true, msg:"" };
  function spawnOwner(x, y){
    state.roomObjects.push({ item:OWNER_ITEM, x:x, y:y, sx:x, sy:y, consumed:false });   // 등장 직후 잠깐 멈칫(chaseGrace)하므로 도망칠 틈이 있다
  }
  function startTheft(obj){
    if(state.theft){ showToast("🐟 이미 먹거리를 물고 있다! 먼저 도망쳐야 해"); return; }
    obj.consumed = true; nearbyIdx = -1;
    state.theft = { icon:"🐟", rooms:0, need:THEFT_CFG.rooms };
    sfx("scared");
    addRing(obj.x, obj.y, 96, "#FF7043", 620, "슬쩍!");
    {   // 할머니는 가판대 안쪽(고양이 반대편)에서 튀어나온다 → 도망칠 거리가 생긴다
      const S = uiScale(), m = 24*S;
      let dx = obj.x - player.x, dy = obj.y - player.y, d = Math.hypot(dx, dy);
      if(d < 1){ dx = 1; dy = 0; d = 1; }
      spawnOwner(Math.max(m, Math.min(roomW - m, obj.x + dx/d * 90*S)), Math.max(m, Math.min(roomH - m, obj.y + dy/d * 90*S)));
    }
    showToast("🐟 슬쩍! 가판대 먹거리를 물고 튀었다!  👵 \"이 도둑고양이!!\"");
    setTimeout(()=>{ if(state.theft) showToast("🏃 지도 " + THEFT_CFG.rooms + "개를 붙잡히지 않고 지나가면 성공!"); }, 2200);
    renderTheftHud();
  }
  // 새 방에 들어올 때: 성공 판정 또는 집사가 문 뒤에서 쫓아 들어온다
  function theftOnEnter(fromDir){
    const T = state.theft;
    if(!T || !fromDir || state.fireSearch) return;
    T.rooms++;
    renderTheftHud();
    if(T.rooms >= T.need){ setTimeout(theftSuccess, 350); return; }
    const S = uiScale(), back = { up:[0, 1], down:[0, -1], left:[1, 0], right:[-1, 0] }[fromDir] || [0, 0], m = 24*S;
    const x = Math.max(m, Math.min(roomW - m, player.x + back[0] * 56*S)), y = Math.max(m, Math.min(roomH - m, player.y + back[1] * 56*S));
    spawnOwner(x, y);
    showToast("👵 \"거기 서!!\"  (" + T.rooms + "/" + T.need + ")");
  }
  function theftSuccess(){
    if(!state || !state.theft || state.gameOver) return;
    state.theft = null;
    state.roomObjects = (state.roomObjects || []).filter(o=> o.item.key !== "owner");
    const before = snapStats();
    applyEffToState({ hunger:THEFT_CFG.hunger, fun:THEFT_CFG.fun, weight:THEFT_CFG.weight, risk:THEFT_CFG.risk });
    state.hasEatenFood = true;
    state.itemsEatenSinceModal++;
    state.stealWins = (state.stealWins || 0) + 1;
    state.dangerExposure = (state.dangerExposure || 0) + 1;
    sfx("good"); setCatMood("😋", 2400);
    addRing(player.x, player.y, 130, "#FFC83D", 750, "냠냠!");
    const msg = "😼 완벽하게 따돌렸다! 훔친 먹거리를 맛있게 먹었다";
    state._lastMsg = msg; showToast(msg);
    showDeltas(before);
    pushHistory({ kind:"item", item:{ icon:"🐟", label:"훔친 먹거리", bad:false }, msg:msg }, before);
    bumpDay();
    passiveDecay(before);
    renderTheftHud(); renderAll();
    checkForcedAction();
    maybeOpenModal();
  }
  function theftCaught(o){
    o.consumed = true;
    if(nearbyIdx >= 0 && state.roomObjects[nearbyIdx] === o) nearbyIdx = -1;
    if(!state.theft) return;
    state.theft = null; state.stealFails = (state.stealFails || 0) + 1;
    if(state.stealFails === 1 && CUT_IMG.thiefCaught && !cutsceneActive()){
      setTimeout(()=>{ if(state && !state.gameOver && !cutsceneActive()) playCutscene({panels:[
        { img:CUT_IMG.thiefCaught, text:"앗! 생선가게 할머니에게 들켰다!\n거기 서, 이 도둑고양이!" }
      ]}); }, 700);
    }
    const before = snapStats();
    applyEffToState({ hunger:THEFT_CFG.failHunger, fun:THEFT_CFG.failFun, risk:THEFT_CFG.failRisk });
    sfx("hurt"); setCatMood("😿", 2200); bgPlayer.hurt(0.4);
    addRing(player.x, player.y, 90, "#E53935", 600, "꿀밤!");
    const msg = "👵 붙잡혔다! 먹거리를 빼앗기고 꿀밤까지 맞았다…";
    state._lastMsg = msg; showToast(msg);
    showDeltas(before);
    pushHistory({ kind:"item", item:{ icon:"👵", label:"집사에게 붙잡힘", bad:true }, msg:msg }, before);
    renderTheftHud(); renderAll();
    checkForcedAction();
  }
  function renderTheftHud(){
    const h = document.getElementById("theft-hud");
    if(!h || !state) return;
    const T = state.theft;
    if(!T){ h.classList.remove("on"); h.innerHTML = ""; return; }
    let pips = ""; for(let i = 0; i < T.need; i++) pips += `<i class="${i < T.rooms ? "on" : ""}"></i>`;
    h.innerHTML = `<span>${T.icon} 훔친 먹거리를 물고 도망 중!</span><b>${pips}</b>`;
    h.classList.add("on");
  }

  /* ================= 벌 떼 추적 피하기 미니게임 =================
     벌레를 건드리면 25% 확률로 벌 떼가 등장한다. 화면 가장자리의 벌이 고양이를 추적하며, 3웨이브 동안 3번 이상 쏘이지 않으면 성공.
     성공: 재미 +25, 일정 확률로 숨겨진 직업 '꿀벌냥이'(사냥 중 마비독). 실패: 쏘임(위험도↑). */
  const BEE_CFG = { bugBee:0.25, waves:3, hp:3, funWin:25, chancePerfect:0.30, chanceHurt:0.10, poison:0.35, paraSec:1.4 };
  const beeOverlay = document.getElementById("bee-overlay");
  function startBeeGame(obj){
    if(state.minigame) return;
    state.minigame = true;
    scatterKittens(null, null, "벌 떼가 몰려오자");
    Object.keys(keysDown).forEach(k=> keysDown[k] = false);
    const el = id=> document.getElementById(id);
    const field = el("bee-field"), cv = el("bee-canvas"), msgEl = el("bee-msg"), ctx = cv.getContext("2d");
    const touch = !!window.__IS_TOUCH;
    el("bee-help").textContent = touch
      ? "화면을 드래그해 벌을 피해요 · 벌들이 고양이를 따라 날아와요!"
      : "방향키(WASD)로 움직여요 · 벌들이 고양이를 따라 날아와요!";
    if(window.showEventTutorialOnce){
      window.showEventTutorialOnce("bee-game", "🐝 달려드는 벌 피하기",
        (touch ? "화면을 드래그해서" : "방향키(또는 WASD)로") + " 벌을 피해 도망쳐요! 3웨이브를 버티면 성공, 3번 쏘이면 실패예요.");
    }
    beeOverlay.classList.add("show"); setBackgroundInteractive(false);
    let N = 360, dpr = 1, bgCv = null;
    const beeArt = new Image();
    beeArt.onload = ()=>{ if(bgCv) makeBg(); };
    beeArt.src = ASSET_IMG.bee_arena;
    const U = ()=> N / 400;
    function makeBg(){
      bgCv = document.createElement("canvas"); bgCv.width = cv.width; bgCv.height = cv.height;
      const b = bgCv.getContext("2d"), u = U() * dpr;
      if(beeArt.complete && beeArt.naturalWidth){
        b.imageSmoothingEnabled = true;
        b.drawImage(beeArt, 0, 0, bgCv.width, bgCv.height);
        return;
      }
      const g = b.createLinearGradient(0, 0, 0, bgCv.height); g.addColorStop(0, "#d9f2c4"); g.addColorStop(1, "#b9e3a0");
      b.fillStyle = g; b.fillRect(0, 0, bgCv.width, bgCv.height);
      let seed = 7; const rnd = ()=> (seed = (seed * 16807) % 2147483647) / 2147483647;
      const fl = ["🌼", "🌸", "🌷", "🌻", "🌺"];
      b.textAlign = "center"; b.textBaseline = "middle"; b.globalAlpha = 0.55;
      for(let i = 0; i < 34; i++){ b.font = ((13 + rnd()*9) * u) + "px sans-serif"; emoDraw(b, fl[i % fl.length], rnd() * bgCv.width, rnd() * bgCv.height); }
    }
    function resize(){ N = field.clientWidth || 360; dpr = Math.min(3, window.devicePixelRatio || 1); cv.width = Math.round(N * dpr); cv.height = Math.round(N * dpr); makeBg(); }
    resize();
    window.addEventListener("resize", resize);

    const maxHp = BEE_CFG.hp + (hasSkill("tumbler") ? 1 : 0);
    const cat = { x:N/2, y:N/2 };
    let hp = maxHp, hits = 0, wave = 0, phase = "ready", pt = 0, wt = 0, over = false, invuln = 0, shake = 0, raf = null, last = performance.now(), msgT = 0;
    const bees = []; let plan = [];
    const held = {}; let joy = { x:0, y:0 }, joyId = null, jo = null;
    const COUNTS = [2, 3, 4];
    const teleTime = ()=> Math.max(0.62, 1.35 - wave * 0.12) + (hasSkill("whisker") ? 0.35 : 0);
    const rnd = (a, b)=> a + Math.random() * (b - a);
    function hud(){
      el("bee-wave").textContent = "웨이브 " + Math.max(1, wave) + " / " + BEE_CFG.waves;
      el("bee-hp").textContent = "❤️".repeat(Math.max(0, hp)) + "🖤".repeat(Math.max(0, maxHp - hp));
    }
    function say(t, sec){ msgEl.textContent = t; msgEl.classList.add("on"); msgT = sec; }
    function startWave(){
      wave++; wt = 0; phase = "play"; hud();
      say(wave === BEE_CFG.waves ? "마지막 벌 떼가 몰려온다!" : "벌 떼가 달려든다!", 0.9);
      const n = COUNTS[wave - 1], sides = ["L", "R", "T", "B"];
      plan = [];
      for(let i = 0; i < n; i++) plan.push({ at:0.35 + i * (2.25 / n) + Math.random() * 0.18, side:sides[Math.floor(Math.random() * sides.length)] });
      plan.sort((a,b)=>a.at-b.at);
    }
    function spawnBee(side){
      const u = U(), pad = 14*u;
      let x, y;
      if(side === "L"){ x = -pad; y = rnd(0.08, 0.92)*N; }
      else if(side === "R"){ x = N+pad; y = rnd(0.08, 0.92)*N; }
      else if(side === "T"){ x = rnd(0.08, 0.92)*N; y = -pad; }
      else { x = rnd(0.08, 0.92)*N; y = N+pad; }
      bees.push({ x, y, side, angle:Math.atan2(cat.y-y, cat.x-x), age:0,
        tele:teleTime(), speed:(116 + wave*12 + rnd(-5, 7))*u,
        turn:3.7 + wave*0.13, phase:rnd(0, Math.PI*2) });
    }
    function frame(now){
      if(over) return;
      if(window.__catroadTutorialPaused){ last = now; raf = requestAnimationFrame(frame); return; }
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const u = U();
      // 플레이어 고양이 이동
      let dx = 0, dy = 0;
      if(held.arrowleft || held.a) dx -= 1; if(held.arrowright || held.d) dx += 1;
      if(held.arrowup || held.w) dy -= 1; if(held.arrowdown || held.s) dy += 1;
      if(!dx && !dy){ dx = joy.x; dy = joy.y; }
      const len = Math.hypot(dx, dy); if(len > 1){ dx /= len; dy /= len; }
      const sp = 205 * u * (hasSkill("cheetah") ? 1.3 : 1);
      const r = 9 * u;
      cat.x = Math.max(r, Math.min(N-r, cat.x + dx*sp*dt));
      cat.y = Math.max(r, Math.min(N-r, cat.y + dy*sp*dt));
      cat.moving = len > 0.08; if(cat.moving) cat.wt = (cat.wt||0) + dt;
      if(dx < -0.2) cat.face = -1; else if(dx > 0.2) cat.face = 1;
      if(invuln > 0) invuln -= dt; if(shake > 0) shake -= dt;
      if(msgT > 0){ msgT -= dt; if(msgT <= 0) msgEl.classList.remove("on"); }

      if(phase === "ready"){
        pt += dt; if(pt > 1.1) startWave();
      } else if(phase === "play"){
        wt += dt;
        while(plan.length && plan[0].at <= wt) spawnBee(plan.shift().side);
        // 벌마다 고양이의 현재 위치를 향해 방향을 조금씩 꺾으며 추적한다.
        for(let i = bees.length - 1; i >= 0; i--){
          const b = bees[i]; b.age += dt;
          if(b.age >= b.tele){
            const target = Math.atan2(cat.y-b.y, cat.x-b.x);
            let diff = (target - b.angle + Math.PI*3) % (Math.PI*2) - Math.PI;
            const turn = b.turn * dt;
            b.angle += Math.max(-turn, Math.min(turn, diff));
            b.x += Math.cos(b.angle) * b.speed * dt;
            b.y += Math.sin(b.angle) * b.speed * dt;
            const dist = Math.hypot(cat.x-b.x, cat.y-b.y);
            if(dist < r + 10*u){
              bees.splice(i, 1);
              if(invuln <= 0){
                hp--; hits++; invuln = 1.1; shake = 0.3; sfx("hurt"); hud(); say("앗! 벌에 쏘였다!", 0.7);
                applyEffToState({ risk:+4 }); renderStats();   // 벌에 쏘일 때마다 위험도 상승
                if(hp <= 0) end(false);
              }
              continue;
            }
          } else {
            // 달려들기 전에는 가장자리에서 날개를 떨며 경고한다.
            b.x += Math.cos(b.age*13 + b.phase) * 1.5*u*dt;
            b.y += Math.sin(b.age*15 + b.phase) * 1.5*u*dt;
          }
          if(b.x < -36*u || b.x > N+36*u || b.y < -36*u || b.y > N+36*u || b.age > 5.2) bees.splice(i, 1);
        }
        if(!plan.length && !bees.length && wt > 1.25){
          if(wave >= BEE_CFG.waves) end(true);
          else { phase = "gap"; pt = 0; sfx("good"); }
        }
      } else if(phase === "gap"){
        pt += dt; if(pt > 0.55) startWave();
      }
      draw(now);
      raf = requestAnimationFrame(frame);
    }
    function draw(now){
      const u = U() * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
      if(shake > 0) ctx.translate((Math.random()-0.5)*7*dpr, (Math.random()-0.5)*7*dpr);
      if(bgCv) ctx.drawImage(bgCv, 0, 0);
      const NN = N*dpr;
      bees.forEach(b=>{
        const x = b.x*dpr, y = b.y*dpr;
        ctx.save(); ctx.translate(x, y);
        if(b.age >= b.tele){
          // 속도감을 주는 짧은 황금빛 비행 궤적
          ctx.strokeStyle = "rgba(207,139,25,.38)"; ctx.lineWidth = 2*u;
          ctx.beginPath(); ctx.moveTo(-Math.cos(b.angle)*13*u, -Math.sin(b.angle)*13*u); ctx.lineTo(-Math.cos(b.angle)*4*u, -Math.sin(b.angle)*4*u); ctx.stroke();
          ctx.rotate(b.angle);
        }
        const flutter = Math.sin(now/38 + b.phase) * 2.2*u;
        ctx.globalAlpha = 0.88;
        ctx.fillStyle = "rgba(255,255,255,.82)";
        ctx.beginPath(); ctx.ellipse(-3*u, -7*u+flutter, 4.5*u, 2.2*u, -0.45, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(3*u, -7*u-flutter, 4.5*u, 2.2*u, 0.45, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.font = (24*u) + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        emoDraw(ctx, "🐝", 0, 0);
        if(b.age < b.tele){
          const blink = 0.65 + 0.35*Math.sin(now/70 + b.phase);
          ctx.globalAlpha = blink; ctx.font = (14*u) + "px sans-serif"; emoDraw(ctx, "❗", 0, -19*u);
        }
        ctx.restore();
      });
      // 고양이
      ctx.save();
      if(invuln > 0 && Math.floor(invuln*12)%2 === 0) ctx.globalAlpha = 0.45;
      ctx.font = (30*u) + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const beeRight = (cat.face||1) > 0, beeWalk = !!cat.moving && invuln <= 0.7;
      const beeCat=v36CatReady(invuln>0.7 ? "face_sad" : (beeWalk ? (beeRight ? "player_walk_" : "player_left_") + (Math.floor((cat.wt||0)*7)%4) : "face_default"));
      if(beeCat){ctx.save();ctx.translate(cat.x*dpr,cat.y*dpr);if(!beeWalk && beeRight)ctx.scale(-1,1);drawMyoSprite(ctx,beeCat,36*u,31*u,16*u);ctx.restore();}
      else emoDraw(ctx,invuln>0.7 ? "😿" : catFaceNow(),cat.x*dpr,cat.y*dpr);
      ctx.restore();
    }
    function end(win){
      if(over) return;
      over = true;
      say(win ? (hits === 0 ? "🎉 벌 떼를 완벽하게 따돌렸다!" : "🎉 벌 떼를 따돌리고 살아남았다!") : "💥 벌에 너무 많이 쏘였다…", 5);
      sfx(win ? "catch" : "fail");
      setTimeout(()=>{ cleanup(); beeResolve(obj, win, hits); }, 1400);
    }
    function cleanup(){
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown, true); window.removeEventListener("keyup", onKeyUp, true); window.removeEventListener("resize", resize);
      field.onpointerdown = field.onpointermove = field.onpointerup = field.onpointercancel = null;
      msgEl.classList.remove("on"); beeOverlay.classList.remove("show"); setBackgroundInteractive(true); state.minigame = false;
    }
    const MOVE = ["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"];
    function onKeyDown(e){ const k = e.key.toLowerCase(); if(MOVE.indexOf(k) >= 0){ e.preventDefault(); e.stopPropagation(); held[k] = true; } }
    function onKeyUp(e){ const k = e.key.toLowerCase(); if(MOVE.indexOf(k) >= 0){ e.stopPropagation(); held[k] = false; } }
    window.addEventListener("keydown", onKeyDown, true); window.addEventListener("keyup", onKeyUp, true);
    field.onpointerdown = e=>{ if(over) return; e.preventDefault(); joyId = e.pointerId; jo = { x:e.clientX, y:e.clientY }; try{ field.setPointerCapture(joyId); }catch(_){} };
    field.onpointermove = e=>{
      if(e.pointerId !== joyId) return; e.preventDefault();
      let dx = e.clientX-jo.x, dy = e.clientY-jo.y, len = Math.hypot(dx,dy); const R = 34;
      if(len > R){ jo.x += dx/len*(len-R); jo.y += dy/len*(len-R); dx = dx/len*R; dy = dy/len*R; len = R; }
      joy = len < 6 ? {x:0,y:0} : {x:dx/R,y:dy/R};
    };
    field.onpointerup = field.onpointercancel = e=>{ if(e.pointerId === joyId){ joyId = null; joy = {x:0,y:0}; } };
    hud(); say("준비…", 1.0); raf = requestAnimationFrame(frame);
  }
  // 미니게임 결과 반영: 성공 = 재미 +25 · 꿀벌냥이 확률 / 실패 = 쏘임
  function beeResolve(obj, win, hits){
    if(!state || state.gameOver) return;
    const before = snapStats();
    let gotBeeCat = false;
    let item;
    if(win){
      item = { key:"bee_win", icon:"🐝", label:"벌 침 피하기", tier:"special", hunger:0, fun:BEE_CFG.funWin, affection:0, weight:-1, risk:-3, exercise:true,
        msg:(hits === 0 ? "🐝 침을 하나도 맞지 않고 모두 피했다! 벌들이 감탄하며 날아갔다" : "🐝 몇 번 쏘일 뻔했지만 끝까지 버텼다! 벌들이 흩어졌다") };
      if(!state.beeCat && Math.random() < (hits === 0 ? BEE_CFG.chancePerfect : BEE_CFG.chanceHurt)) gotBeeCat = true;
    } else {
      item = { key:"bee_fail", icon:"🐝", label:"벌 침에 쏘임", tier:"special", bad:true, hunger:-4, fun:-3, affection:0, weight:0, risk:+14,
        msg:"🐝 침에 너무 많이 쏘였다… 온몸이 퉁퉁 부었다" };
    }
    applyItem(item, false);
    if(state.gameOver) return;
    if(gotBeeCat) state.beeCat = true;
    showDeltas(before);
    pushHistory({ kind:"item", item:item, msg:state._lastMsg }, before);
    bumpDay();
    passiveDecay(before);
    obj.consumed = true; nearbyIdx = -1;
    renderAll();
    checkForcedAction();
    if(gotBeeCat){
      setTimeout(()=> playCutscene({ panels:[
        { img: CUT_IMG.beeCat, text:"벌들의 움직임이 눈에 익자 발톱 끝에 침 한 방울이 맺혔다!\n【 숨겨진 직업 · 꿀벌냥이 】 사냥할 때 일정 확률로 사냥감을 마비시킨다." },
      ] }, ()=>{ renderAll(); maybeOpenModal(); }), 700);
    } else {
      maybeOpenModal();
    }
  }

  (function setupTributeToggle(){   // 모바일: 조공 목록은 한 줄로 접어 두고, 탭하면 위로 펼친다
    const b = document.getElementById("tribute-box"); if(!b) return;
    b.addEventListener("click", e=>{ e.stopPropagation(); b.classList.toggle("open"); });
    document.addEventListener("click", ()=> b.classList.remove("open"));
  })();
  const FREE_ROAM = true;   // false로 바꾸면 예전처럼 길이 아닌 곳엔 못 들어간다
  // 도로의 주행 차량 위치는 그리기와 충돌 판정이 같은 함수를 사용한다.
  const ROAD_LANES = [   // 큰길 그림의 4개 차선 중심(% 높이). 위 두 차선은 왼쪽, 아래 두 차선은 오른쪽으로 달린다
    { y:34.3, dir:-1, sp:0.95, icons:["🚗","🚙"], vi:[0,3] }, { y:43, dir:-1, sp:1.2, icons:["🚕","🚗"], vi:[5,2] },
    { y:52.3, dir:1, sp:1.05, icons:["🚙","🚗"], vi:[1,6] },  { y:61.5, dir:1, sp:1.3, icons:["🚗","🚕"], vi:[4,7] }
  ];
  /* 자동차 색 8종: 기본 그림(빨강·크림)을 색만 돌려서 만든다. 한 차선의 두 대, 이웃 차선의 차가 서로 다른 색이 되게 배치한다. */
  const CAR_VARIANTS = [ {s:"red",h:0}, {s:"cream"}, {s:"red",h:120}, {s:"red",h:215}, {s:"red",h:55}, {s:"cream",t:[170,232,205]}, {s:"red",h:285}, {s:"cream",t:[88,92,108]} ];
  const _carCache = {};
  function carSprite(vi){
    const V = CAR_VARIANTS[((vi % 8) + 8) % 8];
    const base = assetImg(V.s === "red" ? "sprite_car_red" : "sprite_car_blue");
    if(!base) return null;
    const key = ((vi % 8) + 8) % 8;
    if(_carCache[key]) return _carCache[key];
    if(!V.h && !V.t){ _carCache[key] = base; return base; }
    try{
      const cv = document.createElement("canvas"); cv.width = 248; cv.height = 120;
      const c = cv.getContext("2d"); c.drawImage(base, 0, 0, 248, 120);
      const id = c.getImageData(0, 0, 248, 120), d = id.data;
      if(V.h){
        const a = V.h*Math.PI/180, co = Math.cos(a), si = Math.sin(a);
        const m = [ .213+co*.787-si*.213, .715-co*.715-si*.715, .072-co*.072+si*.928,
                    .213-co*.213+si*.143, .715+co*.285+si*.140, .072-co*.072-si*.283,
                    .213-co*.213-si*.787, .715-co*.715+si*.715, .072+co*.928+si*.072 ];
        for(let i = 0; i < d.length; i += 4){
          const r = d[i], g = d[i+1], b = d[i+2];
          d[i]   = Math.max(0, Math.min(255, m[0]*r + m[1]*g + m[2]*b));
          d[i+1] = Math.max(0, Math.min(255, m[3]*r + m[4]*g + m[5]*b));
          d[i+2] = Math.max(0, Math.min(255, m[6]*r + m[7]*g + m[8]*b));
        }
      } else {
        for(let i = 0; i < d.length; i += 4){ d[i] = d[i]*V.t[0]/255; d[i+1] = d[i+1]*V.t[1]/255; d[i+2] = d[i+2]*V.t[2]/255; }
      }
      c.putImageData(id, 0, 0); _carCache[key] = cv; return cv;
    }catch(err){ _carCache[key] = base; return base; }
  }
  function roadTrafficPositions(w, h, S, now){
    if(!w || !h) return [];
    const t = (now == null ? performance.now() : now) / 21, span = w + 100*S, out = [];
    ROAD_LANES.forEach((L, li)=>{
      const y = pctToXY("road", 50, L.y).y;
      [0, 0.5].forEach((ph, ci)=>{
        const p = ((t*L.sp + (ph + li*0.17)*span) % span) - 50*S;
        out.push({ x:(L.dir > 0 ? p : w - p), y, icon:L.icons[ci], flip:L.dir < 0, dir:L.dir, vi:L.vi[ci] });
      });
    });
    return out;
  }
  let _cbEl = null, _cbUntil = 0, _cbRaf = 0;
  function catSay(text, ms){   // 고양이 머리 위에 말풍선을 잠깐 띄운다 (고양이를 따라다닌다)
    const wrapEl = document.getElementById("room-wrap"); if(!wrapEl) return;
    if(!_cbEl){ _cbEl = document.createElement("div"); _cbEl.className = "cat-bubble"; wrapEl.appendChild(_cbEl); }
    text = String(text).replace(/[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, "").replace(/\s+/g, " ").trim();
    _cbEl.textContent = text; _cbEl.classList.remove("show"); void _cbEl.offsetWidth; _cbEl.classList.add("show");
    _cbUntil = performance.now() + (ms || 2600);
    cancelAnimationFrame(_cbRaf);
    (function tick(){
      if(performance.now() > _cbUntil){ _cbEl.classList.remove("show"); return; }
      const S = uiScale();
      _cbEl.style.left = Math.max(80, Math.min(roomW - 80, player.x)) + "px";
      _cbEl.style.top = Math.max(46, player.y - 30*S) + "px";
      _cbRaf = requestAnimationFrame(tick);
    })();
  }
  window.catSay = catSay;
  function updatePlayer(){
    if(!roomInputAllowed()) return;
    let vx = 0, vy = 0;
    let slowFactor = 1;   // 덫/물웅덩이마다 느려지는 정도가 다르다
    let trapNow = false, puddleNow = false;
    let trapOver = false;
    const S = uiScale();
    let _revN = 0, _revKind = null;
    (state.roomObjects||[]).forEach(o=>{
      if(o.consumed || o.seasonHazard) return;
      const dist = Math.hypot(player.x - o.x, player.y - o.y);
      // 낙엽/눈 아래의 물건은 가까이 다가가야 정체가 드러난다. 수염 센서는 미리 감지한다.
      if(o._sensedKind && dist < 54*S) o._sensedKind = null;   // 가까이 다가가면 반투명 덮개가 걷힌다
      if(o.hiddenUnder && !o.hiddenRevealed && (hasSkill("whisker") || dist < 54*S)){
        o.hiddenRevealed = true; _revN++; _revKind = o.hiddenUnder;
        if(hasSkill("whisker") && dist >= 54*S) o._sensedKind = o.hiddenUnder;   // 수염으로 먼저 알아챈 것: 낙엽/눈은 반투명하게 남겨 둔다
      }
    });
    if(_revN){   // 몇 개가 드러나도 말풍선은 한 번만, 이유가 보이게 고양이가 말한다
      const under = _revKind === "leaves" ? "낙엽 밑" : "눈더미 밑";
      catSay(hasSkill("whisker") ? "👃 수염이 떨린다! " + under + "에 무언가 있어!" : "바스락… " + under + "에 무언가 있다!");
    }
    (state.roomObjects||[]).forEach(o=>{
      if(o.consumed) return;
      if(o.seasonHazard && o.hazardType === "puddle"){
        if(Math.hypot(player.x - o.x, player.y - o.y) < (o.hazardRadius || 31)*S){
          puddleNow = true;
          slowFactor = Math.min(slowFactor, 0.66);
        }
        return;
      }
      if(o.item && o.item.key === "trap" && performance.now() > (state._trapGraceUntil || 0) && Math.hypot(player.x - o.x, player.y - o.y) < 34*S && !cheetahJump(o)){
        if(!o.trapStepped){
          o.trapStepped = true;
          trapOver = registerTrapHit();
          if(!trapOver) catSay("아야! 발이 걸렸다…");
        }
        trapNow = true; slowFactor = Math.min(slowFactor, hasSkill("tumbler") ? 0.75 : 0.4);
      }
    });
    if(state.minigame || trapOver) return;
    // 큰길에서는 달리는 차와 실제로 겹쳤을 때 덫과 같은 강도의 부상을 입는다.
    // 충돌 직후 잠깐의 무적 시간을 두어 한 대에 연속으로 여러 번 맞지 않게 한다.
    if(state.currentLoc === "road" && !state.homeInside && !state.jackpotRoom){
      const now = performance.now();
      if(now > (state._roadHitGraceUntil || 0)){
        const hitCar = roadTrafficPositions(roomW, roomH, S, now).find(c=>
          Math.abs(player.x - c.x) < 29*S && Math.abs(player.y - c.y) < 22*S
        );
        if(hitCar){
          state._roadHitGraceUntil = now + 1500;
          state.roadHitCount = (state.roadHitCount || 0) + 1;
          const beforeRoadHit = snapStats();
          bgPlayer.hurt(0.6);              // 덫 첫 타격과 같은 강도
          applyEffToState({ risk:+8 });    // 차량 사고는 위험도에도 누적된다
          sfx("hurt");
          player.x = Math.max(24*S, Math.min(roomW - 24*S, player.x - hitCar.dir*24*S));
          showDeltas(beforeRoadHit);
          renderAll();
          pushHistory({ kind:"item", item:{ icon:"🚗", label:"차량 충돌", bad:true }, msg:"큰길에서 달리는 차에 부딪혔다" }, beforeRoadHit);
          catSay("아야!! 차에 부딪혔다!");
        }
      }
    }
    if(trapNow && !onTrap){ sfx("trap"); }
    if(puddleNow && !onPuddle){ sfx("pop"); catSay("으앗, 미끄러워!"); }
    onTrap = trapNow;
    onPuddle = puddleNow;
    const SP = player.speed * uiScale() * slowFactor * speedMul();
    if(keysDown["arrowup"] || keysDown["w"]) vy = -SP;
    if(keysDown["arrowdown"] || keysDown["s"]) vy = SP;
    if(keysDown["arrowleft"] || keysDown["a"]) vx = -SP;
    if(keysDown["arrowright"] || keysDown["d"]) vx = SP;
    player._walking = !!(vx || vy);
    if(vx) player.face = vx > 0 ? 1 : -1;   // 가는 방향으로 몸을 돌린다
    {   // 탑다운 맵: 길이 아닌 곳(건물·나무·물·분수)으로는 들어갈 수 없다. 이미 막힌 곳에 있으면 빠져나올 수 있게 둔다
      const loc0 = state.currentLoc, ox = player.x, oy = player.y, nx = ox + vx, ny = oy + vy;
      if(FREE_ROAM){   // 건물·나무·가구 등은 모두 통과. 부딪히는 건 물(분수·시냇물)뿐이다
        const wet = (x, y)=> waterAt(loc0, x, y);
        if(!wet(nx, ny) || wet(ox, oy)){ player.x = nx; player.y = ny; }      // 이미 물 안에 있으면 빠져나올 수 있게 둔다
        else {
          const sh = waterShapeAt(loc0, nx, ny);
          if(sh && sh[0] === "e"){          // 둥근 분수: 가장자리를 따라 미끄러진다
            const c = bgCover(loc0), cx = c.ox + sh[1]/100*c.dw, cy = c.oy + sh[2]/100*c.dh;
            let tx = -(ny - cy), ty = (nx - cx); const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
            if(tx*vx + ty*vy < 0){ tx = -tx; ty = -ty; }
            const sp = Math.hypot(vx, vy);
            if(!wet(ox + tx*sp, oy + ty*sp)){ player.x = ox + tx*sp; player.y = oy + ty*sp; }
          }
          else if(vx && !wet(nx, oy)){ player.x = nx; }                       // 직사각형 물: 벽처럼 옆으로 미끄러진다
          else if(vy && !wet(ox, ny)){ player.y = ny; }
        }
      }
      else if(!layoutFor(loc0) || walkableAt(loc0, nx, ny) || !walkableAt(loc0, ox, oy)){ player.x = nx; player.y = ny; }
      else if(walkableAt(loc0, nx, oy)){ player.x = nx; }
      else if(walkableAt(loc0, ox, ny)){ player.y = ny; }
    }

    {   // 물(분수·하천) 안에 들어가 있으면 가장 가까운 마른 땅으로 즉시 밀어낸다 (다리 밖으로 튀어나가지 않게)
      const L1 = state.currentLoc, sh0 = waterShapeAt(L1, player.x, player.y);
      if(sh0){
        const c = bgCover(L1), X = v=> c.ox + v/100*c.dw, Y = v=> c.oy + v/100*c.dh;
        if(sh0[0] === "e"){
          const cx = X(sh0[1]), cy = Y(sh0[2]), rx = sh0[3]/100*c.dw, ry = sh0[4]/100*c.dh;
          const dx = player.x - cx, dy = player.y - cy, k = Math.sqrt((dx/rx)*(dx/rx) + (dy/ry)*(dy/ry)) || 0.001;
          player.x = cx + dx/k*1.05; player.y = cy + dy/k*1.05;
        } else {
          const x0 = X(sh0[1]), y0 = Y(sh0[2]), x1 = X(sh0[3]), y1 = Y(sh0[4]);
          const cand = [{ d:player.x - x0, x:x0 - 2, y:player.y }, { d:x1 - player.x, x:x1 + 2, y:player.y }];
          if(sh0[2] <= 0) cand.push({ d:y1 - player.y, x:player.x, y:y1 + 2 });     // 위쪽 물: 아래(다리)로만 나온다
          if(sh0[4] >= 100) cand.push({ d:player.y - y0, x:player.x, y:y0 - 2 });   // 아래쪽 물: 위(다리)로만 나온다
          cand.sort((a, b)=> a.d - b.d); player.x = cand[0].x; player.y = cand[0].y;
        }
      }
    }
    const w = roomW, h = roomH, m = 22 * uiScale();
    const exits = (state.homeInside || state.jackpotRoom) ? {} : LOC_BY_ID[state.currentLoc].exits;
    if(state.jackpotRoom && !state._jpBusy && performance.now() > (state._jpGrace || 0) && player.y > h - m - 3*uiScale() && Math.abs(player.x - w/2) < 38*uiScale()){ askLeaveJackpot(); return; }
    const gapHalf = 36 * uiScale();     // 벽돌담이 뚫린 입구의 반폭 (여기로만 나갈 수 있다)
    const curLoc = state.currentLoc;
    if(player.y < m){
      if(exits.up && doorNear(curLoc, "up", player.x, gapHalf)){ enterRoom(exits.up, "up"); } else { player.y = m; }
    }
    if(player.y > h - m){
      if(exits.down && doorNear(curLoc, "down", player.x, gapHalf)){ enterRoom(exits.down, "down"); } else { player.y = h - m; }
    }
    if(player.x < m){
      if(exits.left && doorNear(curLoc, "left", player.y, gapHalf)){ enterRoom(exits.left, "left"); } else { player.x = m; }
    }
    if(player.x > w - m){
      if(exits.right && doorNear(curLoc, "right", player.y, gapHalf)){ enterRoom(exits.right, "right"); } else { player.x = w - m; }
    }

    if(state.currentLoc === "home" && state.adopted){   // 집 앞의 문으로 들어가고, 안쪽 문으로 나온다
      const L0 = layoutFor("home"), c0 = bgCover("home"), px = (player.x - c0.ox)/c0.dw*100, py = (player.y - c0.oy)/c0.dh*100;
      const hit = r=> r && px >= r[0] && px <= r[2] && py >= r[1] && py <= r[3];
      if(vx || vy){   // 걸어서 문에 닿았을 때만 (가만히 놓여 있을 땐 바뀌지 않는다)
        if(!state.homeInside && hit(L0 && L0.enter)){   // 집을 눌러서 온 경우에만 들어간다
          const _n = performance.now();
          if(_n < (state._homeClick || 0)){ state._homeClick = 0; toggleHome(true); }
          else if(_n > (state._homeHintT || 0)){ state._homeHintT = _n + 5000; catSay("집을 눌러야 들어갈 수 있어"); }
        }
        else if(state.homeInside && (hit(L0 && L0.exit) || (player.y >= h - m - 2*uiScale() && px >= 41 && px <= 59))) toggleHome(false);
      }
    }

    if(state.currentLoc === "stream" && !layoutFor("stream")){        // 하천: 강물 위로는 못 걷고, 다리(아래 출입구)로만 건넌다
      const riverTop = h * 0.8 - 6 * uiScale();
      if(player.y > riverTop && Math.abs(player.x - w/2) > gapHalf){ player.y = riverTop; }
    }

    updateChasers();

    let nearest = -1, nearestDist = 9999;
    (state.roomObjects||[]).forEach((o,i)=>{
      if(o.consumed || o.seasonHazard || o.lure || o.fleeT > 0 || o.item.key === "owner") return;
      const d = Math.hypot(player.x - o.x, player.y - o.y);
      if(d < (o.item.key === "lover" ? 62 : 44) * uiScale() && d < nearestDist){ nearest = i; nearestDist = d; }
    });
    nearbyIdx = nearest;
    loverNear = nearest < 0 && !!(state.lovebirds && loverMate.ready && !state.homeInside && (!loverHomed() || loverAtHomeHere()) && (kittenCount("follow") + kittenCount("sit")) > 0 && Math.hypot(player.x - loverMate.x, player.y - loverMate.y) < 93 * uiScale());
    updatePopup();
  }

  /* ================= 장소별 풍경: 바닥·길·소품을 한 번 그려 두고 매 프레임 복사해서 쓴다 ================= */
  const SCENE_CACHE = {};
  let SCENE_SIZE = "";
  function hashStr(s){ let h = 2166136261; for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function makePainter(c, w, h, S, loc){
    const rnd = mulberry32(hashStr(loc.id + (state.adopted ? "a" : "")));
    const dd = 15*S, cx = w/2, cy = h/2, pw = 40*S, ex = loc.exits || {};
    const P = { c, w, h, S, rnd, dd, cx, cy, pw, ex };
    P.R = (a, b)=> a + rnd()*(b - a);
    P.pick = arr=> arr[Math.floor(rnd()*arr.length)];
    P.onPath = (x, y, m)=>{ const q = pw + (m||0);
      return (ex.up && Math.abs(x-cx) < q && y < cy) || (ex.down && Math.abs(x-cx) < q && y > cy) ||
             (ex.left && Math.abs(y-cy) < q && x < cx) || (ex.right && Math.abs(y-cy) < q && x > cx) || Math.hypot(x-cx, y-cy) < q; };
    P.rr = (x, y, ww, hh, r, fill, stroke, lw)=>{
      r = Math.max(0, Math.min(r, ww/2, hh/2));
      c.beginPath(); c.moveTo(x+r, y); c.arcTo(x+ww, y, x+ww, y+hh, r); c.arcTo(x+ww, y+hh, x, y+hh, r); c.arcTo(x, y+hh, x, y, r); c.arcTo(x, y, x+ww, y, r); c.closePath();
      if(fill){ c.fillStyle = fill; c.fill(); }
      if(stroke){ c.strokeStyle = stroke; c.lineWidth = lw || S; c.stroke(); }
    };
    P.circ = (x, y, r, fill, stroke, lw)=>{ c.beginPath(); c.arc(x, y, r, 0, Math.PI*2); if(fill){ c.fillStyle = fill; c.fill(); } if(stroke){ c.strokeStyle = stroke; c.lineWidth = lw || S; c.stroke(); } };
    P.ell = (x, y, rx, ry, fill, stroke, lw)=>{ c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI*2); if(fill){ c.fillStyle = fill; c.fill(); } if(stroke){ c.strokeStyle = stroke; c.lineWidth = lw || S; c.stroke(); } };
    P.line = (x1, y1, x2, y2, col, lw)=>{ c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = col; c.lineWidth = lw || S; c.lineCap = "round"; c.stroke(); };
    P.poly = (pts, fill, stroke, lw)=>{ c.beginPath(); pts.forEach((p, i)=> i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); if(fill){ c.fillStyle = fill; c.fill(); } if(stroke){ c.strokeStyle = stroke; c.lineWidth = lw || S; c.lineJoin = "round"; c.stroke(); } };
    P.shadow = (x, y, rx, ry, a)=> P.ell(x, y, rx, ry, "rgba(40,30,50," + (a == null ? 0.14 : a) + ")");
    // 입구들에서 가운데로 모이는 길
    P.paths = (fill, edge, wide)=>{
      const q = pw * (wide || 1);
      const strips = [];
      if(ex.up)    strips.push([cx - q, 0, 2*q, cy]);
      if(ex.down)  strips.push([cx - q, cy, 2*q, h - cy]);
      if(ex.left)  strips.push([0, cy - q, cx, 2*q]);
      if(ex.right) strips.push([cx, cy - q, w - cx, 2*q]);
      const draw = (grow, col)=>{
        c.fillStyle = col;
        strips.forEach(s=> c.fillRect(s[0] - grow, s[1] - grow, s[2] + 2*grow, s[3] + 2*grow));
        c.beginPath(); c.arc(cx, cy, q*1.22 + grow, 0, Math.PI*2); c.fill();
      };
      if(edge) draw(4*S, edge);
      draw(0, fill);
    };
    // 길을 피해 흩뿌리기
    P.scatter = (n, margin, fn)=>{
      let tries = 0, k = 0;
      while(k < n && tries++ < n*30){
        const x = P.R(dd + margin, w - dd - margin), y = P.R(dd + margin, h - dd - margin);
        if(P.onPath(x, y, 8*S)) continue;
        fn(x, y, k++);
      }
    };
    // 입구 틈을 피해 가로줄을 칸칸이 나눈다 (위/아래 벽을 따라 건물·가판대를 세울 때)
    P.slots = (sw, gapKey)=>{
      const out = [], n = Math.floor((w - 2*dd) / sw), real = (w - 2*dd) / n, gap = pw + 14*S;
      for(let k = 0; k < n; k++){
        const x0 = dd + k*real, x1 = x0 + real;
        if(gapKey && ex[gapKey] && x1 > cx - gap && x0 < cx + gap) continue;
        out.push({ x:x0, w:real, i:k });
      }
      return out;
    };
    P.tree = (x, y, r)=>{
      P.shadow(x, y + r*0.95, r*1.05, r*0.32);
      P.rr(x - r*0.14, y + r*0.15, r*0.28, r*0.85, r*0.08, "#9A6B4B");
      P.circ(x, y - r*0.1, r, "#6DB26A");
      P.circ(x - r*0.52, y + r*0.2, r*0.66, "#5FA45E");
      P.circ(x + r*0.52, y + r*0.14, r*0.66, "#66AB64");
      P.circ(x - r*0.3, y - r*0.42, r*0.3, "rgba(255,255,255,.24)");
    };
    P.flower = (x, y, r, col)=>{ for(let i=0;i<5;i++){ const a = i/5*Math.PI*2; P.circ(x + Math.cos(a)*r, y + Math.sin(a)*r, r*0.75, col); } P.circ(x, y, r*0.7, "#FFE27A"); };
    P.tuft = (x, y, s, col)=>{ c.strokeStyle = col; c.lineWidth = S; c.lineCap = "round"; for(let i=-1;i<=1;i++){ c.beginPath(); c.moveTo(x + i*s*0.5, y); c.quadraticCurveTo(x + i*s*0.9, y - s*0.7, x + i*s*0.5 + i*s*0.3, y - s*1.2); c.stroke(); } };
    P.crate = (x, y, ww, hh, col)=>{ P.rr(x, y, ww, hh, 2*S, col || "#C9976B", "#8E6643", S); P.line(x + 2*S, y + hh*0.5, x + ww - 2*S, y + hh*0.5, "rgba(90,55,30,.45)", S); };
    P.house = (x, y, ww, hh, body, roof)=>{
      P.rr(x, y, ww, hh, 3*S, body, "rgba(70,50,40,.35)", S);
      P.poly([[x - 4*S, y + 1*S], [x + ww/2, y - hh*0.42], [x + ww + 4*S, y + 1*S]], roof, "rgba(70,40,40,.4)", S);
      P.rr(x + ww*0.12, y + hh*0.28, ww*0.22, hh*0.28, 2*S, "#FFF6D8", "rgba(70,50,40,.4)", S);
      P.rr(x + ww*0.66, y + hh*0.28, ww*0.22, hh*0.28, 2*S, "#FFF6D8", "rgba(70,50,40,.4)", S);
      P.rr(x + ww*0.4, y + hh*0.45, ww*0.2, hh*0.55, 2*S, "#B07A55", "rgba(70,50,40,.4)", S);
      P.circ(x + ww*0.56, y + hh*0.74, S*0.9, "#FFD66B");
    };
    P.awning = (x, y, ww, colA, colB, depth)=>{
      const n = 6, bw = ww/n, d = depth || 22*S;
      for(let i=0;i<n;i++){ P.rr(x + i*bw, y, bw + 0.5, d, 0, i % 2 ? colB : colA); }
      for(let i=0;i<n;i++){ P.circ(x + i*bw + bw/2, y + d, bw/2, i % 2 ? colB : colA); }
      c.fillStyle = "rgba(0,0,0,.08)"; c.fillRect(x, y + d - 3*S, ww, 3*S);
    };
    return P;
  }

  const SCENE_PAINTERS = {
    /* 공원: 잔디 줄무늬 + 모래 길 + 나무 + 꽃 + 연못 + 벤치 */
    park(P){
      const { c, w, h, S } = P;
      for(let x = P.dd, k = 0; x < w - P.dd; x += 58*S, k++){ if(k % 2){ c.fillStyle = "rgba(255,255,255,.2)"; c.fillRect(x, P.dd, 58*S, h - 2*P.dd); } }
      P.paths("#EBDDB8", "#D8C697", 0.95);
      P.scatter(60, 6*S, (x, y)=> P.tuft(x, y, 5*S, "rgba(70,140,80,.45)"));
      P.ell(w*0.16, h*0.80, 54*S, 30*S, "#A9D6EC", "#8CC0DA", 2*S);                     // 연못
      P.ell(w*0.15, h*0.79, 34*S, 15*S, "rgba(255,255,255,.35)");
      P.ell(w*0.2, h*0.82, 9*S, 5*S, "#78B96F"); P.circ(w*0.2, h*0.82 - 2*S, 2.4*S, "#FFB7D0");
      P.tree(w*0.08, h*0.2, 30*S); P.tree(w*0.93, h*0.82, 32*S); P.tree(w*0.91, h*0.16, 26*S); P.tree(w*0.43, h*0.11, 22*S);
      // 벤치
      const bx = w*0.69, by = h*0.12;
      P.shadow(bx, by + 17*S, 30*S, 5*S);
      P.rr(bx - 28*S, by - 4*S, 56*S, 9*S, 3*S, "#B98A5E", "#8E6643", S);
      P.rr(bx - 28*S, by + 7*S, 56*S, 8*S, 3*S, "#C9996D", "#8E6643", S);
      P.rr(bx - 25*S, by + 14*S, 4*S, 7*S, S, "#6F5236"); P.rr(bx + 21*S, by + 14*S, 4*S, 7*S, S, "#6F5236");
      P.scatter(26, 10*S, (x, y)=> P.flower(x, y, 2.6*S, P.pick(["#FF9DB8", "#FFFFFF", "#FFD166", "#C7A6FF"])));
    },

    /* 놀이터: 고무 바닥 타일 + 모래밭 + 미끄럼틀 + 그네 + 시소 + 땅따먹기 */
    playground(P){
      const { c, w, h, S } = P, t = 54*S;
      for(let y = P.dd, r = 0; y < h - P.dd; y += t, r++) for(let x = P.dd, k = 0; x < w - P.dd; x += t, k++){
        c.fillStyle = (r + k) % 2 ? "rgba(255,255,255,.22)" : "rgba(235,120,160,.08)"; c.fillRect(x, y, t, t);
      }
      P.paths("#F6C9DC", "#EFB1CB", 0.9);
      // 모래밭
      P.rr(w*0.05, h*0.60, w*0.2, h*0.3, 22*S, "#F3DFA8", "#E3C984", 2*S);
      for(let i=0;i<60;i++){ P.circ(P.R(w*0.07, w*0.23), P.R(h*0.63, h*0.87), 0.9*S, "rgba(180,140,70,.35)"); }
      P.rr(w*0.09, h*0.7, 20*S, 14*S, 4*S, "#FF8FA3"); P.rr(w*0.11, h*0.67, 12*S, 6*S, 2*S, "#FFD166");        // 모래 장난감
      // 미끄럼틀
      const sx = w*0.84, sy = h*0.14;
      P.shadow(sx + 6*S, sy + 52*S, 46*S, 8*S);
      P.poly([[sx - 6*S, sy - 6*S], [sx + 14*S, sy - 6*S], [sx + 44*S, sy + 48*S], [sx + 22*S, sy + 48*S]], "#FF6F61", "#C8473C", S);
      P.poly([[sx - 6*S, sy - 6*S], [sx + 14*S, sy - 6*S], [sx + 22*S, sy + 8*S], [sx - 6*S, sy + 8*S]], "#FFD166", "#C8A03C", S);
      P.rr(sx - 28*S, sy - 10*S, 24*S, 6*S, 2*S, "#7AD3C1", "#4FA895", S);
      for(let i=0;i<4;i++) P.line(sx - 28*S, sy + i*11*S, sx - 6*S, sy + i*11*S, "#7AD3C1", 2*S);
      P.line(sx - 26*S, sy - 6*S, sx - 26*S, sy + 44*S, "#4FA895", 3*S); P.line(sx - 8*S, sy - 6*S, sx - 8*S, sy + 44*S, "#4FA895", 3*S);
      // 그네
      const gx = w*0.14, gy = h*0.17;
      P.shadow(gx, gy + 44*S, 46*S, 7*S);
      P.line(gx - 40*S, gy + 42*S, gx - 28*S, gy - 12*S, "#5B8DEF", 4*S); P.line(gx - 16*S, gy + 42*S, gx - 28*S, gy - 12*S, "#5B8DEF", 4*S);
      P.line(gx + 40*S, gy + 42*S, gx + 28*S, gy - 12*S, "#5B8DEF", 4*S); P.line(gx + 16*S, gy + 42*S, gx + 28*S, gy - 12*S, "#5B8DEF", 4*S);
      P.line(gx - 30*S, gy - 12*S, gx + 30*S, gy - 12*S, "#3C6BC9", 4*S);
      [-12, 12].forEach(o=>{ P.line(gx + o*S, gy - 11*S, gx + o*S, gy + 22*S, "#8A8FA3", S); P.rr(gx + (o - 7)*S, gy + 21*S, 14*S, 4*S, 2*S, "#FFB347", "#C98A2E", S); });
      // 시소
      const ssx = w*0.64, ssy = h*0.86;
      P.shadow(ssx, ssy + 8*S, 46*S, 5*S);
      P.poly([[ssx - 8*S, ssy + 8*S], [ssx + 8*S, ssy + 8*S], [ssx, ssy - 4*S]], "#8A8FA3");
      c.save(); c.translate(ssx, ssy - 4*S); c.rotate(-0.16); P.rr(-46*S, -4*S, 92*S, 8*S, 4*S, "#FFB347", "#C98A2E", S); P.rr(-46*S, -9*S, 6*S, 6*S, 2*S, "#FF6F61"); P.rr(40*S, -9*S, 6*S, 6*S, 2*S, "#FF6F61"); c.restore();
      // 땅따먹기
      const hx = w*0.47, hy = h*0.12;
      c.strokeStyle = "rgba(255,255,255,.85)"; c.lineWidth = 2*S;
      [[0,0],[0,1],[1,2],[0,3],[1,3]].forEach(([a, b])=>{ c.strokeRect(hx + a*17*S, hy + b*15*S, 17*S, 15*S); });
      P.circ(w*0.33, h*0.9, 6*S, "#FF6F61", "#C8473C", S); P.circ(w*0.37, h*0.86, 5*S, "#5B8DEF", "#3C6BC9", S);          // 공
    },

    /* 시장: 체크 타일 바닥 + 줄무늬 천막 가판대 + 과일 상자 + 깃발 */
    market(P){
      const { c, w, h, S } = P, t = 40*S;
      for(let y = P.dd, r = 0; y < h - P.dd; y += t, r++) for(let x = P.dd, k = 0; x < w - P.dd; x += t, k++){
        if((r + k) % 2){ c.fillStyle = "rgba(235,190,90,.2)"; c.fillRect(x, y, t, t); }
      }
      P.paths("#F7E2A0", "#E8CB78", 0.85);
      const cols = [["#E8543A", "#FFF6E8"], ["#3FA66B", "#FFF6E8"], ["#F5A623", "#FFF6E8"], ["#5B8DEF", "#FFF6E8"]];
      const goods = ["#E8543A", "#F5A623", "#7BC96F", "#C77DFF", "#FFD166"];
      P.slots(124*S, "up").forEach((s, i)=>{                         // 위쪽 가판대 줄
        const x = s.x + 8*S, ww = s.w - 16*S, y = P.dd + 2*S, col = cols[(s.i) % cols.length];
        P.rr(x + 4*S, y + 26*S, ww - 8*S, 30*S, 3*S, "#C9976B", "#8E6643", S);
        for(let k=0;k<5;k++){ P.circ(x + 14*S + k*(ww - 28*S)/4, y + 38*S, 6*S, goods[(k + s.i) % goods.length]); }
        P.awning(x, y, ww, col[0], col[1], 24*S);
      });
      P.slots(124*S, "down").forEach((s)=>{                           // 아래쪽 가판대 줄 (거울처럼 뒤집어서)
        c.save(); c.translate(0, h); c.scale(1, -1);
        const x = s.x + 8*S, ww = s.w - 16*S, y = P.dd + 2*S, col = cols[(s.i + 2) % cols.length];
        P.rr(x + 4*S, y + 26*S, ww - 8*S, 30*S, 3*S, "#C9976B", "#8E6643", S);
        for(let k=0;k<5;k++){ P.circ(x + 14*S + k*(ww - 28*S)/4, y + 38*S, 6*S, goods[(k + s.i + 2) % goods.length]); }
        P.awning(x, y, ww, col[0], col[1], 24*S);
        c.restore();
      });
      // 깃발 줄
      c.strokeStyle = "rgba(90,60,40,.5)"; c.lineWidth = S; c.beginPath(); c.moveTo(P.dd, h*0.3); c.quadraticCurveTo(w/2, h*0.38, w - P.dd, h*0.3); c.stroke();
      for(let i=1;i<14;i++){ const f = i/14, x = P.dd + f*(w - 2*P.dd), y = h*0.3 + Math.sin(f*Math.PI)*h*0.08 * 0.92; P.poly([[x - 5*S, y], [x + 5*S, y], [x, y + 11*S]], ["#FF6F61", "#FFD166", "#7AD3C1", "#8EB8FF"][i % 4]); }
      P.crate(w*0.9, h*0.64, 26*S, 20*S); P.crate(w*0.93, h*0.58, 22*S, 18*S, "#D6A878"); P.circ(w*0.93 + 11*S, h*0.58 - 2*S, 5*S, "#E8543A");
      P.shadow(w*0.1, h*0.8 + 14*S, 20*S, 5*S); P.ell(w*0.1, h*0.8, 16*S, 13*S, "#E6D2A8", "#C8AE7C", S); P.line(w*0.1 - 6*S, h*0.8 - 4*S, w*0.1 + 6*S, h*0.8 - 4*S, "#C8AE7C", 2*S);   // 자루
    },

    /* 주택가: 보도블록 + 지붕 있는 집들 + 울타리 + 가로등 + 우편함 */
    housing(P){
      const { c, w, h, S } = P, t = 36*S;
      c.strokeStyle = "rgba(120,95,60,.14)"; c.lineWidth = S;
      for(let y = P.dd; y < h; y += t){ c.beginPath(); c.moveTo(P.dd, y); c.lineTo(w - P.dd, y); c.stroke(); }
      for(let x = P.dd; x < w; x += t){ c.beginPath(); c.moveTo(x, P.dd); c.lineTo(x, h - P.dd); c.stroke(); }
      P.paths("#E0D2B6", "#CDBB98", 0.9);
      const bodies = ["#FFE0D0", "#E4F1D8", "#DDE9FA", "#FFF0BF", "#F3DDF0"], roofs = ["#D9715B", "#6FA3C7", "#B98A5E", "#8FBF7A", "#C77D9F"];
      P.slots(104*S, "up").forEach(s=>{
        const ww = s.w - 22*S, x = s.x + 11*S, hh = 54*S, y = P.dd + 28*S;
        P.house(x, y, ww, hh, bodies[s.i % 5], roofs[(s.i + 1) % 5]);
        P.rr(x - 6*S, y + hh + 2*S, ww + 12*S, 7*S, 3*S, "#7DB36F");                        // 화단
        for(let k=0;k<4;k++) P.circ(x + 4*S + k*(ww - 4*S)/3, y + hh + 1*S, 3*S, P.pick(["#FF9DB8", "#FFD166", "#FFFFFF"]));
      });
      // 아래 울타리
      c.save(); c.translate(0, h); c.scale(1, -1);
      P.slots(30*S, "down").forEach(s=>{ P.rr(s.x + 4*S, P.dd + 3*S, s.w - 8*S, 20*S, 2*S, "#FFFFFF", "rgba(120,100,80,.5)", S); P.poly([[s.x + 4*S, P.dd + 3*S], [s.x + s.w/2, P.dd - 4*S], [s.x + s.w - 4*S, P.dd + 3*S]], "#FFFFFF", "rgba(120,100,80,.5)", S); });
      c.restore();
      // 가로등 · 우편함
      const lx = w*0.9, ly = h*0.62; P.shadow(lx, ly + 36*S, 10*S, 3*S); P.rr(lx - 2*S, ly - 24*S, 4*S, 60*S, 2*S, "#5E6372"); P.circ(lx, ly - 28*S, 7*S, "#FFE9A0", "#C9A94C", S); P.circ(lx, ly - 28*S, 16*S, "rgba(255,230,150,.22)");
      const mx = w*0.1, my = h*0.74; P.rr(mx - 2*S, my, 4*S, 22*S, S, "#7B6A58"); P.rr(mx - 9*S, my - 12*S, 18*S, 13*S, 4*S, "#E8543A", "#B0382A", S); P.rr(mx + 4*S, my - 17*S, 3*S, 8*S, S, "#FFD166");
      P.scatter(18, 8*S, (x, y)=> P.tuft(x, y, 4*S, "rgba(90,140,80,.4)"));
    },

    /* 골목: 어두운 포장 + 웅덩이 + 쓰레기통 + 박스 + 파이프 + 가로등 불빛 */
    alley(P){
      const { c, w, h, S } = P, t = 24*S;
      c.fillStyle = "rgba(60,50,90,.1)"; c.fillRect(P.dd, P.dd, w - 2*P.dd, h - 2*P.dd);
      for(let y = P.dd, r = 0; y < h - P.dd; y += t/1.6, r++){ c.strokeStyle = "rgba(70,60,110,.16)"; c.lineWidth = S; c.beginPath(); c.moveTo(P.dd, y); c.lineTo(w - P.dd, y); c.stroke();
        for(let x = P.dd + (r % 2 ? t/2 : 0); x < w - P.dd; x += t){ c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + t/1.6); c.stroke(); } }
      P.paths("#D4CCEA", "#BDB3DC", 0.85);
      // 파이프 (위벽 따라)
      if(true){ const y = P.dd + 7*S; c.save(); P.slots(40*S, "up").forEach(s=>{ P.rr(s.x, y, s.w + 1, 8*S, 3*S, "#9AA0B4"); P.line(s.x, y + 2*S, s.x + s.w, y + 2*S, "rgba(255,255,255,.4)", 1.5*S); }); c.restore(); }
      P.slots(40*S, "up").forEach((s, i)=>{ if(i % 5 === 2){ P.rr(s.x + s.w/2 - 4*S, P.dd + 6*S, 8*S, 12*S, 2*S, "#7E8499"); } });
      // 웅덩이
      [[0.2, 0.64, 44, 15], [0.8, 0.8, 38, 12], [0.62, 0.2, 28, 9]].forEach(([a, b, rx, ry])=>{ P.ell(w*a, h*b, rx*S, ry*S, "rgba(110,150,200,.35)", "rgba(90,120,170,.35)", S); P.ell(w*a - rx*S*0.25, h*b - ry*S*0.3, rx*S*0.4, ry*S*0.25, "rgba(255,255,255,.4)"); });
      // 쓰레기통
      [[0.09, 0.2], [0.14, 0.24]].forEach(([a, b], i)=>{ const x = w*a, y = h*b; P.shadow(x, y + 22*S, 17*S, 5*S); P.rr(x - 13*S, y - 14*S, 26*S, 34*S, 4*S, i ? "#6E8A7A" : "#7C8696", "rgba(0,0,0,.25)", S); P.rr(x - 15*S, y - 19*S, 30*S, 8*S, 4*S, i ? "#7FA08C" : "#90A0B2", "rgba(0,0,0,.25)", S); P.line(x - 6*S, y - 6*S, x - 6*S, y + 14*S, "rgba(0,0,0,.18)", S); P.line(x + 6*S, y - 6*S, x + 6*S, y + 14*S, "rgba(0,0,0,.18)", S); });
      // 박스
      P.crate(w*0.86, h*0.28, 34*S, 28*S, "#C8A57C"); P.crate(w*0.9, h*0.2, 28*S, 24*S, "#D1AF86"); P.crate(w*0.82, h*0.86, 30*S, 24*S, "#BFA07A");
      // 낙서 (하트와 별)
      c.strokeStyle = "rgba(230,90,140,.55)"; c.lineWidth = 2.4*S; c.lineCap = "round"; c.beginPath(); c.moveTo(w*0.34, h*0.9); c.bezierCurveTo(w*0.32, h*0.84, w*0.38, h*0.84, w*0.34, h*0.9 - 0.1); c.stroke();
      P.circ(w*0.55, h*0.88, 4*S, null, "rgba(80,150,230,.5)", 2*S);
      // 가로등 빛
      const g = c.createRadialGradient(w*0.72, h*0.55, 4*S, w*0.72, h*0.55, 150*S); g.addColorStop(0, "rgba(255,220,140,.32)"); g.addColorStop(1, "rgba(255,220,140,0)");
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      P.rr(w*0.72 - 2*S, h*0.55 - 6*S, 4*S, 40*S, 2*S, "#4C4F63"); P.circ(w*0.72, h*0.55 - 10*S, 6*S, "#FFE9A0", "#B49A48", S);
    },

    /* 상점가: 분홍 타일 + 가게 정면(간판·유리창·차양) + 현수막 + 자전거 */
    market_st(P){
      const { c, w, h, S } = P, t = 30*S;
      for(let y = P.dd, r = 0; y < h - P.dd; y += t, r++) for(let x = P.dd, k = 0; x < w - P.dd; x += t, k++){
        if((r + k) % 2){ c.fillStyle = "rgba(255,255,255,.2)"; c.fillRect(x, y, t, t); }
      }
      P.paths("#F7C2C2", "#EBA6A6", 0.85);
      const signs = ["#FFB347", "#5B8DEF", "#7AD3C1", "#C77DFF", "#FF8FA3", "#8FBF7A"];
      const front = (s, flip)=>{
        const x = s.x + 6*S, ww = s.w - 12*S, y = P.dd + 2*S, col = signs[(s.i + (flip ? 3 : 0)) % signs.length];
        P.rr(x, y, ww, 58*S, 3*S, "#FFF6EE", "rgba(90,60,60,.35)", S);
        P.rr(x + 4*S, y + 4*S, ww - 8*S, 14*S, 3*S, col, "rgba(0,0,0,.2)", S);                // 간판
        for(let k=0;k<3;k++) P.circ(x + ww*(0.28 + k*0.22), y + 11*S, 2*S, "rgba(255,255,255,.85)");
        P.rr(x + 6*S, y + 28*S, ww*0.38, 26*S, 2*S, "#CFE8F5", "rgba(70,90,110,.45)", S);       // 유리창
        P.line(x + 6*S + ww*0.19, y + 28*S, x + 6*S + ww*0.19, y + 54*S, "rgba(70,90,110,.4)", S);
        P.rr(x + ww*0.58, y + 24*S, ww*0.3, 34*S, 2*S, "#B07A55", "rgba(70,50,40,.4)", S);      // 문
        P.circ(x + ww*0.58 + ww*0.24, y + 42*S, S, "#FFD66B");
        P.awning(x - 2*S, y + 18*S, ww + 4*S, col, "#FFFFFF", 9*S);
      };
      P.slots(112*S, "up").forEach(s=> front(s, false));
      c.save(); c.translate(0, h); c.scale(1, -1); P.slots(112*S, "down").forEach(s=> front(s, true)); c.restore();
      // 현수막
      P.rr(w*0.3, h*0.3, w*0.4, 14*S, 3*S, "#FFE08A", "#D4A93A", S); for(let i=0;i<9;i++) P.circ(w*0.3 + 10*S + i*(w*0.4 - 20*S)/8, h*0.3 + 7*S, 2.4*S, ["#E8543A", "#3FA66B", "#5B8DEF"][i % 3]);
      // 자전거
      const bx = w*0.86, by = h*0.7; P.circ(bx - 14*S, by, 9*S, null, "#4C4F63", 2*S); P.circ(bx + 14*S, by, 9*S, null, "#4C4F63", 2*S);
      P.poly([[bx - 14*S, by], [bx, by - 12*S], [bx + 14*S, by]], null, "#E8543A", 2*S); P.line(bx, by - 12*S, bx - 4*S, by - 16*S, "#4C4F63", 2*S);
    },

    /* 공터: 흙+잡초 + 돌 + 타이어 + 팔레트 + 키 큰 풀 */
    lot(P){
      const { c, w, h, S } = P;
      [[0.2, 0.3, 90, 50], [0.7, 0.72, 110, 56], [0.5, 0.15, 70, 34], [0.12, 0.82, 70, 38]].forEach(([a, b, rx, ry])=> P.ell(w*a, h*b, rx*S, ry*S, "rgba(176,140,96,.28)"));
      P.paths("#D9CDA6", "#C6B88C", 0.8);
      P.scatter(90, 6*S, (x, y)=> P.tuft(x, y, P.R(4, 8)*S, "rgba(80,150,70,.6)"));
      P.scatter(12, 10*S, (x, y)=>{ P.shadow(x, y + 5*S, 9*S, 3*S, 0.1); P.ell(x, y, P.R(5, 9)*S, P.R(4, 6)*S, "#B8B4AE", "#8F8B84", S); });
      // 타이어
      const tx = w*0.85, ty = h*0.3; P.shadow(tx, ty + 14*S, 22*S, 5*S); P.circ(tx, ty, 18*S, "#4A4A52"); P.circ(tx, ty, 8*S, "#D9CDA6"); P.circ(tx - 6*S, ty - 7*S, 5*S, "rgba(255,255,255,.14)");
      // 팔레트
      const px = w*0.1, py = h*0.2; for(let i=0;i<4;i++) P.rr(px, py + i*8*S, 46*S, 6*S, S, "#C9A06A", "#8E6643", S); P.rr(px + 4*S, py - 2*S, 6*S, 36*S, S, "#B38A58"); P.rr(px + 34*S, py - 2*S, 6*S, 36*S, S, "#B38A58");
      // 파이프 더미
      for(let i=0;i<3;i++) P.rr(w*0.62, h*0.84 + i*7*S, 50*S, 7*S, 3.5*S, ["#8E9AAB", "#9FAABA", "#7F8B9C"][i], "rgba(0,0,0,.2)", S);
      // 웅덩이
      P.ell(w*0.32, h*0.78, 34*S, 11*S, "rgba(120,160,200,.35)", "rgba(100,130,170,.35)", S);
      // 키 큰 풀 (벽 둘레)
      P.scatter(26, 0, (x, y)=>{ const edge = Math.min(x - P.dd, w - P.dd - x, y - P.dd, h - P.dd - y); if(edge < 38*S) P.tuft(x, y, 11*S, "rgba(70,140,64,.8)"); });
    },

    /* 보금자리(입양 전): 처마 밑 시멘트 바닥 + 종이 박스 집 + 밥그릇 */
    home(P){
      const { c, w, h, S } = P;
      // 보금자리 바닥: 거친 시멘트 질감 대신 밝고 깨끗한 크림색 바닥
      c.fillStyle = "#F1E5D5"; c.fillRect(P.dd, P.dd, w - 2*P.dd, h - 2*P.dd);
      c.fillStyle = "rgba(255,255,255,.20)"; c.fillRect(P.dd, P.dd, w - 2*P.dd, h - 2*P.dd);
      c.strokeStyle = "rgba(190,155,125,.16)"; c.lineWidth = Math.max(0.8, .8*S);
      for(let y = P.dd + 34*S; y < h - P.dd; y += 34*S){ c.beginPath(); c.moveTo(P.dd, y); c.lineTo(w - P.dd, y); c.stroke(); }
      for(let x = P.dd + 48*S; x < w - P.dd; x += 48*S){ c.beginPath(); c.moveTo(x, P.dd); c.lineTo(x, h - P.dd); c.stroke(); }
      P.paths("#F4D9AE", "#E5C48F", 0.8);
      // 처마 그림자 (위쪽)
      const g = c.createLinearGradient(0, P.dd, 0, P.dd + 70*S); g.addColorStop(0, "rgba(90,60,40,.26)"); g.addColorStop(1, "rgba(90,60,40,0)"); c.fillStyle = g; c.fillRect(P.dd, P.dd, w - 2*P.dd, 70*S);
      // 종이 박스 집
      const bx = w*0.12, by = h*0.3;
      P.shadow(bx + 30*S, by + 52*S, 50*S, 8*S);
      P.rr(bx, by, 62*S, 48*S, 3*S, "#D3A874", "#9D7648", 1.5*S);
      P.poly([[bx - 4*S, by], [bx + 16*S, by - 14*S], [bx + 78*S, by - 14*S], [bx + 66*S, by]], "#C39A68", "#9D7648", 1.5*S);
      P.rr(bx + 12*S, by + 14*S, 38*S, 34*S, 14*S, "#5A4636");
      P.rr(bx + 16*S, by + 34*S, 30*S, 8*S, 4*S, "#F2C3CF");                                   // 담요
      P.line(bx + 4*S, by + 8*S, bx + 56*S, by + 8*S, "rgba(120,90,60,.4)", S);
      // 밥그릇 두 개
      [[0.66, 0.78, "#7FB5E0"], [0.73, 0.82, "#E8A5B5"]].forEach(([a, b, col])=>{ P.shadow(w*a, h*b + 9*S, 17*S, 4*S); P.ell(w*a, h*b, 15*S, 8*S, col, "rgba(0,0,0,.25)", S); P.ell(w*a, h*b - 1*S, 10*S, 4.5*S, "#8B6A4E"); });
      // 나무 상자 + 빈 캔
      P.crate(w*0.88, h*0.2, 40*S, 30*S); P.circ(w*0.78, h*0.88, 6*S, "#B9C2CF", "#8C94A1", S);
      // 따뜻한 전구 빛
      const g2 = c.createRadialGradient(w*0.5, P.dd + 6*S, 2*S, w*0.5, P.dd + 6*S, 180*S); g2.addColorStop(0, "rgba(255,226,150,.22)"); g2.addColorStop(1, "rgba(255,226,150,0)"); c.fillStyle = g2; c.fillRect(0, 0, w, h);
    },

    /* 집(입양 후): 마루 바닥 + 러그 + 캣타워 + 화분 + 고양이 침대 */
    home_adopted(P){
      const { c, w, h, S } = P, t = 26*S;
      for(let y = P.dd, r = 0; y < h - P.dd; y += t, r++){
        c.fillStyle = r % 2 ? "#F5E7D5" : "#F0DFC9"; c.fillRect(P.dd, y, w - 2*P.dd, t);
        c.strokeStyle = "rgba(160,120,85,.13)"; c.lineWidth = S; c.beginPath(); c.moveTo(P.dd, y); c.lineTo(w - P.dd, y); c.stroke();
        for(let x = P.dd + ((r * 53) % 97)*S; x < w - P.dd; x += 130*S){ c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + t); c.stroke(); }
      }
      // 러그
      P.rr(w*0.3, h*0.34, w*0.4, h*0.34, 28*S, "#F7B9C4", "#E598A6", 3*S); P.rr(w*0.32, h*0.38, w*0.36, h*0.26, 22*S, null, "rgba(255,255,255,.7)", 2*S);
      for(let i=0;i<7;i++){ P.circ(w*0.38 + i*w*0.04, h*0.51, 4*S, "rgba(255,255,255,.55)"); }
      // 캣타워
      const tx = w*0.88, ty = h*0.18; P.shadow(tx, ty + 80*S, 30*S, 6*S);
      P.rr(tx - 16*S, ty + 64*S, 32*S, 12*S, 4*S, "#C9A27A", "#8E6D48", S); P.rr(tx - 5*S, ty + 10*S, 10*S, 60*S, 3*S, "#E6D3AE", "#B9A27A", S);
      P.rr(tx - 28*S, ty + 28*S, 36*S, 8*S, 4*S, "#C9A27A", "#8E6D48", S); P.rr(tx - 22*S, ty - 6*S, 44*S, 12*S, 6*S, "#F2C3CF", "#D49AA8", S);
      for(let i=0;i<6;i++) P.line(tx - 3*S, ty + 14*S + i*9*S, tx + 3*S, ty + 17*S + i*9*S, "rgba(150,120,80,.5)", S);
      // 화분
      const px = w*0.08, py = h*0.2; P.shadow(px, py + 30*S, 16*S, 4*S); P.poly([[px - 12*S, py + 8*S], [px + 12*S, py + 8*S], [px + 9*S, py + 30*S], [px - 9*S, py + 30*S]], "#D9825B", "#A85F3F", S);
      for(let i=0;i<6;i++){ const a = -Math.PI/2 + (i - 2.5)*0.4; P.rr(px + Math.cos(a)*10*S - 5*S, py + Math.sin(a)*18*S - 6*S, 10*S, 18*S, 5*S, i % 2 ? "#5FA45E" : "#6FB36B"); }
      // 고양이 침대 · 밥그릇
      P.ell(w*0.12, h*0.8, 34*S, 22*S, "#9CC7E8", "#6FA3C7", 2*S); P.ell(w*0.12, h*0.8, 22*S, 13*S, "#FFF1D6", "#E4D0A0", S);
      [[0.78, 0.86, "#7FB5E0"], [0.84, 0.9, "#E8A5B5"]].forEach(([a, b, col])=>{ P.shadow(w*a, h*b + 9*S, 17*S, 4*S); P.ell(w*a, h*b, 15*S, 8*S, col, "rgba(0,0,0,.2)", S); P.ell(w*a, h*b - 1*S, 10*S, 4.5*S, "#9C7B5A"); });
      // 창문 햇살
      c.save(); c.globalAlpha = 0.18; c.fillStyle = "#FFF3B0"; c.beginPath(); c.moveTo(w*0.52, P.dd); c.lineTo(w*0.66, P.dd); c.lineTo(w*0.58, h*0.7); c.lineTo(w*0.36, h*0.7); c.closePath(); c.fill(); c.restore();
    },

    /* 큰길: 아스팔트 + 차선 + 횡단보도 + 연석 + 주차된 차 */
    road(P){
      const { c, w, h, S } = P;
      c.fillStyle = "rgba(80,80,100,.14)"; c.fillRect(P.dd, P.dd, w - 2*P.dd, h - 2*P.dd);
      // 인도(위·아래)
      const sw = h*0.2;
      c.fillStyle = "#E8E4DA"; c.fillRect(P.dd, P.dd, w - 2*P.dd, sw); c.fillRect(P.dd, h - P.dd - sw, w - 2*P.dd, sw);
      c.strokeStyle = "rgba(120,110,90,.18)"; c.lineWidth = S;
      for(let x = P.dd; x < w; x += 30*S){ c.beginPath(); c.moveTo(x, P.dd); c.lineTo(x, P.dd + sw); c.stroke(); c.beginPath(); c.moveTo(x, h - P.dd - sw); c.lineTo(x, h - P.dd); c.stroke(); }
      c.fillStyle = "#B9B6AE"; c.fillRect(P.dd, P.dd + sw, w - 2*P.dd, 4*S); c.fillRect(P.dd, h - P.dd - sw - 4*S, w - 2*P.dd, 4*S);    // 연석
      // 위·아래 출입구 길 (인도를 가로지르는 보도)
      P.paths("rgba(232,228,218,1)", null, 0.8);
      c.fillStyle = "#D2D2DB"; c.fillRect(P.dd, P.dd + sw + 4*S, w - 2*P.dd, h - 2*P.dd - 2*sw - 8*S);                // 차도
      // 차선
      c.setLineDash([22*S, 16*S]); P.line(P.dd, cyOf(P), w - P.dd, cyOf(P), "#F5C84C", 3*S); c.setLineDash([]);
      c.strokeStyle = "rgba(255,255,255,.6)"; c.lineWidth = 2*S; c.setLineDash([30*S, 24*S]);
      c.beginPath(); c.moveTo(P.dd, h*0.36); c.lineTo(w - P.dd, h*0.36); c.moveTo(P.dd, h*0.64); c.lineTo(w - P.dd, h*0.64); c.stroke(); c.setLineDash([]);
      // 횡단보도
      for(let i=0;i<9;i++) P.rr(w*0.7 + i*10*S, P.dd + sw + 6*S, 6*S, h - 2*P.dd - 2*sw - 12*S, 0, "rgba(255,255,255,.82)");
      // 맨홀
      P.circ(w*0.3, h*0.58, 11*S, "#9C9CA8", "#7B7B88", 2*S); for(let i=-1;i<=1;i++) P.line(w*0.3 - 8*S, h*0.58 + i*4*S, w*0.3 + 8*S, h*0.58 + i*4*S, "#7B7B88", S);
      // 큰길의 주행 차량은 drawRoom()에서 실제 차량 일러스트로 매 프레임 그린다.
      // 가로등 · 표지판
      const lx = w*0.9, ly = h*0.1; P.rr(lx - 2*S, ly - 6*S, 4*S, 40*S, 2*S, "#5E6372"); P.rr(lx - 12*S, ly - 14*S, 24*S, 8*S, 4*S, "#FFE9A0", "#B49A48", S);
      const sx = w*0.34, sy = h*0.84; P.rr(sx - 1.5*S, sy, 3*S, 24*S, S, "#8A8FA3"); P.circ(sx, sy - 2*S, 9*S, "#E8543A", "#B0382A", S); P.rr(sx - 6*S, sy - 4*S, 12*S, 4*S, S, "#FFFFFF");
    },

    /* 하천: 풀밭 둑 + 아래쪽 강물 + 징검다리/다리 + 갈대 + 돌 */
    stream(P){
      const { c, w, h, S } = P, rt = h*0.8;
      c.fillStyle = "#D9EBD0"; c.fillRect(P.dd, P.dd, w - 2*P.dd, rt - P.dd);
      P.paths("#EADFC0", "#D8C9A0", 0.8);
      P.scatter(70, 6*S, (x, y)=>{ if(y < rt - 14*S) P.tuft(x, y, 5*S, "rgba(80,150,90,.5)"); });
      P.scatter(18, 10*S, (x, y)=>{ if(y < rt - 20*S) P.flower(x, y, 2.4*S, P.pick(["#FFFFFF", "#FFD166", "#C7A6FF"])); });
      // 강 (아래쪽)
      const g = c.createLinearGradient(0, rt, 0, h); g.addColorStop(0, "#7DC3E3"); g.addColorStop(1, "#5AA9D0"); c.fillStyle = g; c.fillRect(P.dd, rt, w - 2*P.dd, h - P.dd - rt);
      // 둑 가장자리 (물결 모양)
      c.fillStyle = "#EADFC0"; c.beginPath(); c.moveTo(P.dd, rt - 8*S); for(let x = P.dd; x <= w - P.dd; x += 8*S){ c.lineTo(x, rt - 8*S + Math.sin(x/(26*S))*4*S); } c.lineTo(w - P.dd, rt + 2*S); c.lineTo(P.dd, rt + 2*S); c.closePath(); c.fill();
      c.strokeStyle = "rgba(255,255,255,.55)"; c.lineWidth = 2*S; c.lineCap = "round";
      for(let r = 0; r < 3; r++) for(let x = P.dd + 20*S + r*26*S; x < w - P.dd - 30*S; x += 90*S){ const y = rt + 18*S + r*17*S; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 12*S, y - 6*S, x + 24*S, y); c.quadraticCurveTo(x + 36*S, y + 6*S, x + 48*S, y); c.stroke(); }
      for(let i=0;i<14;i++) P.circ(P.R(P.dd + 10*S, w - P.dd - 10*S), P.R(rt + 8*S, h - P.dd - 8*S), 1.6*S, "rgba(255,255,255,.7)");
      // 다리 (아래 출입구가 있을 때)
      if(P.ex.down){ P.rr(P.cx - 36*S, rt - 12*S, 72*S, h - P.dd - rt + 14*S, 4*S, "#C9996D", "#8E6643", 1.5*S); for(let y = rt - 8*S; y < h - P.dd; y += 9*S) P.line(P.cx - 34*S, y, P.cx + 34*S, y, "rgba(90,55,30,.45)", S); P.rr(P.cx - 38*S, rt - 12*S, 5*S, h - P.dd - rt + 14*S, 2*S, "#8E6643"); P.rr(P.cx + 33*S, rt - 12*S, 5*S, h - P.dd - rt + 14*S, 2*S, "#8E6643"); }
      // 징검다리 돌
      [[0.18, 0.86], [0.24, 0.92], [0.78, 0.88]].forEach(([a, b])=>{ P.shadow(w*a, h*b + 6*S, 16*S, 4*S, 0.2); P.ell(w*a, h*b, 15*S, 9*S, "#B8B4AE", "#8F8B84", S); });
      // 갈대와 큰 돌
      for(let k = 0; k < 7; k++){ const rx = w*0.08 + k*w*0.13 + P.R(-12, 12)*S, ry = rt - 6*S; for(let i=-2;i<=2;i++){ P.line(rx + i*3*S, ry, rx + i*5*S, ry - P.R(18, 30)*S, "#8DA85A", 2*S); P.ell(rx + i*5*S, ry - 24*S, 2*S, 5*S, "#9A6B4B"); } }
      P.ell(w*0.9, h*0.28, 22*S, 14*S, "#B8B4AE", "#8F8B84", S); P.ell(w*0.88, h*0.26, 9*S, 5*S, "rgba(255,255,255,.35)");
      P.tree(w*0.1, h*0.2, 26*S);
    },
  };
  function cyOf(P){ return P.cy; }

  /* ---------- 일러스트 배경 에셋 (이동·충돌 로직과 분리) ---------- */
const ILLUSTRATED_BG_DATA = {
    park: __IMG.ILLUSTRATED_BG_DATA_park,
    playground: __IMG.ILLUSTRATED_BG_DATA_playground,
    market: __IMG.ILLUSTRATED_BG_DATA_market,
    housing: __IMG.ILLUSTRATED_BG_DATA_housing,
    alley: __IMG.ILLUSTRATED_BG_DATA_alley,
    market_st: __IMG.ILLUSTRATED_BG_DATA_market_st,
    lot: __IMG.ILLUSTRATED_BG_DATA_lot,
    home: __IMG.ILLUSTRATED_BG_DATA_home,
    home_adopted: __IMG.ILLUSTRATED_BG_DATA_home_adopted,
    road: __IMG.ILLUSTRATED_BG_DATA_road,
    stream: __IMG.ILLUSTRATED_BG_DATA_stream,
    home_adopted_inside: __IMG.ILLUSTRATED_BG_DATA_home_adopted_inside
  };
  const ILLUSTRATED_BG = {};
  Object.keys(ILLUSTRATED_BG_DATA).forEach(id => {
    const img = new Image();
    img.onload = () => {
      Object.keys(SCENE_CACHE).forEach(k => delete SCENE_CACHE[k]);
      if (typeof drawRoom === "function" && document.getElementById("room-canvas")) drawRoom();
    };
    img.src = ILLUSTRATED_BG_DATA[id];
    ILLUSTRATED_BG[id] = img;
  });


  /* ---------- 탑다운 맵 레이아웃: 걸을 수 있는 곳 · 막힌 곳 · 출입구 · 아이템 자리 (이미지 기준 %) ----------
     r = 사각형[x0,y0,x1,y1], e = 타원[cx,cy,rx,ry]. walk 안이면서 hole 밖일 때만 고양이가 지나갈 수 있다. */
  /* 이동 규칙: 기본은 화면 전체를 자유롭게 다닐 수 있고(walk), 건물·물·분수·놀이기구·짐더미 같은 단단한 것(hole)만 막는다.
     spots는 아이템이 뜰 수 있는 "길 위" 자리다. enter/exit는 집 안팎을 오가는 문. */
  const FULL = ["r",0,0,100,100];
  const MAP_LAYOUT = {
    park:{ walk:[FULL],
      hole:[["e",49.5,50,8.5,13.5],["r",19,3,33,27],["r",0,0,9,44],["r",0,64,9,100],["r",88,0,100,46],["r",88,66,100,100]],
      doors:{up:49.5,down:49.5,left:56,right:56}, spots:[[20,56],[80,56],[49.5,18],[49.5,88],[38,64],[61,38]] },
    playground:{ walk:[FULL],
      hole:[["r",28,16,58,58],["r",64,28,81,43],["e",71,61,6.5,6.5],["r",19,51,24,58],["r",13,19,23,38],["r",0,0,12,42],["r",0,57,12,100],["r",88,0,100,42],["r",88,58,100,100],["r",0,0,43,9],["r",56,0,100,9]],
      doors:{up:49.5,down:49.5,left:48,right:49}, spots:[[20,68],[40,70],[72,48],[80,70],[22,46],[49.5,6],[49.5,90]] },
    market:{ walk:[FULL],
      hole:[["r",11,8,45,35],["r",54,8,90,35],["r",11,45,44,66],["r",55,45,90,66],["r",0,0,8,34],["r",0,47,8,100],["r",92,0,100,34],["r",92,47,100,100]],
      doors:{up:50,down:50,left:40,right:40}, spots:[[20,40],[80,40],[35,40],[65,40],[50,20],[50,85],[25,72],[72,72]] },
    housing:{ walk:[FULL],
      hole:[["r",10,0,30,23],["r",72,0,91,24],["r",0,60,21,88],["r",80,64,100,92],["r",25,55,42,82],["e",66,76,10,13],["e",66,10,8,10],["r",88,50,100,62]],
      doors:{up:50,down:50,left:42,right:42}, spots:[[15,42],[85,42],[35,42],[65,50],[50,15],[50,88],[35,35],[65,35]] },
    alley:{ walk:[FULL],
      hole:[["r",0,0,45.5,47],["r",55.5,0,100,47],["r",0,60.5,45.5,100],["r",56.5,60.5,100,100],["e",50.9,54.7,3.4,3.2]],
      doors:{up:50,down:50,left:54,right:54}, spots:[[20,54],[80,54],[33,54],[67,54],[50,24],[50.5,74],[50.5,86]] },
    market_st:{ walk:[FULL],
      hole:[["r",5,0,45,35],["r",55,0,100,35],["r",8,48,45,74],["r",55,48,92,74],["r",0,46,6,100],["r",94,46,100,100]],
      doors:{up:50.5,down:50.5,left:44,right:44}, spots:[[25,43],[38,44],[65,43],[78,44],[50,24],[50,62],[50,90],[25,88],[75,88]] },
    lot:{ walk:[FULL],
      hole:[["r",0,0,14,32],["r",84,0,100,32],["r",0,58,16,100],["r",80,56,100,100]],
      doors:{up:49.5,down:49.5,left:45,right:45}, spots:[[15,45],[85,45],[30,48],[70,48],[49.5,15],[49.5,88],[35,25],[65,70]] },
    road:{ walk:[FULL],
      hole:[["r",26,8,41,36],["r",57,8,72,36],["r",28,52,41,73],["r",60,50,82,76],["r",0,0,10,34],["r",0,58,12,100],["r",90,0,100,34],["r",88,58,100,100]],
      doors:{up:50,down:50,left:47,right:47}, spots:[[20,47],[80,47],[30,37],[70,37],[50,15],[50,85]] },
    stream:{ walk:[FULL],
      hole:[["r",40,0,60,38],["r",40,55,60,100]],
      doors:{up:[17,84],down:[17,84],left:44,right:44}, spots:[[17,25],[17,75],[30,44],[70,44],[84,30],[84,70],[50,46]] },
    home:{ walk:[FULL],
      // v38: 이전 직사각형 막힘구역이 보금자리 위쪽 길 전체를 차단하던 문제 수정.
      // 폐가전과 폐자재 좌/우만 아이템을 피하고 중앙 출입 통로는 비워 둔다.
      hole:[["r",6,13,43,37],["r",63,13,100,37]],
      doors:{up:51,down:51,left:51,right:51}, spots:[[52,7],[52,92],[30,66],[78,66],[44,78],[70,84]] },
    home_adopted:{ walk:[FULL],
      hole:[["r",29,8,71,44]], enter:[45,46,55,52],
      doors:{up:50,down:51,left:49,right:49}, spots:[[20,50],[80,50],[35,47],[65,47],[50,70],[50,92]] },
    home_adopted_inside:{ walk:[["r",15,24,66,87],["r",66,31,95,76],["r",43,86,57,100]], inside:true,
      hole:[["r",4,5,31,29],["r",31,0,58,21],["r",49,21,59,30],["r",57,8,66,28],["r",66,6,98,30],["r",3,31,26,80],["r",3,72,16,95],["e",86,56,8,15],["r",91,36,98,57],["r",76,78,98,95]],
      exit:[41,82,59,100], doors:{}, spots:[[38,42],[52,50],[30,82],[66,66],[76,40],[48,70]] },
  };
  /* 부딪히는 곳은 물뿐: 공원 분수, 하천(다리 부분만 건널 수 있다). 건물·나무·가구 등의 hole은 아이템 배치용일 뿐 이동은 막지 않는다 */
  const WATER_AREAS = {
    park:[["e",49.5,50,8.5,13.5]],
    stream:[["r",40,0,60,41],["r",40,52,60,100]],
  };
  function waterShapeAt(locId, x, y){
    const W = WATER_AREAS[layoutKey(locId)]; if(!W) return null;
    const c = bgCover(locId), px = (x - c.ox)/c.dw*100, py = (y - c.oy)/c.dh*100;
    return W.find(sh=> inShape(sh, px, py)) || null;
  }
  function waterAt(locId, x, y){ return !!waterShapeAt(locId, x, y); }
  function layoutKey(locId){
    if(state && state.jackpotRoom) return "jackpot";
    if(locId !== "home") return locId;
    if(state && state.adopted) return state.homeInside ? "home_adopted_inside" : "home_adopted";
    return "home";
  }
  function layoutFor(locId){ return MAP_LAYOUT[layoutKey(locId)] || null; }
  function bgCover(locId){
    const bg = ILLUSTRATED_BG[layoutKey(locId)], w = roomW || 480, h = roomH || 320;
    const iw = (bg && bg.naturalWidth) || 1672, ih = (bg && bg.naturalHeight) || 941;
    const sc = Math.max(w/iw, h/ih), dw = iw*sc, dh = ih*sc;
    // v38: 가로로 긴 모니터에서 중앙 크롭으로 보금자리의 상단 출입로가 사라지지 않게 함.
    // 다른 장소의 위치 계산은 원본 그대로 유지한다.
    const topAlignedHome = layoutKey(locId) === "home" && dh > h;
    return { ox:(w - dw)/2, oy:topAlignedHome ? 0 : (h - dh)/2, dw, dh };
  }
  function pctToXY(locId, px, py){ const c = bgCover(locId); return { x:c.ox + px/100*c.dw, y:c.oy + py/100*c.dh }; }
  function inShape(sh, px, py){
    if(sh[0] === "r") return px >= sh[1] && px <= sh[3] && py >= sh[2] && py <= sh[4];
    const dx = (px - sh[1])/sh[3], dy = (py - sh[2])/sh[4]; return dx*dx + dy*dy <= 1;
  }
  function walkableRaw(locId, x, y){
    const L = layoutFor(locId); if(!L) return true;
    const c = bgCover(locId), px = (x - c.ox)/c.dw*100, py = (y - c.oy)/c.dh*100;
    if(L.hole && L.hole.some(sh=> inShape(sh, px, py))) return false;
    return L.walk.some(sh=> inShape(sh, px, py));
  }
  /* 화면 비율에 따라 그림이 잘려 보이므로, 출입구는 "지금 화면에서 실제로 이어진 길"을 찾아 그 가장자리에 만든다.
     (세로로 긴 휴대폰 화면 등에서 출입구가 막히는 일을 막는다. 길이 아예 안 보이면 임시 통로를 낸다) */
  const DOOR_CACHE = {};
  function doorSet(locId){
    const L = layoutFor(locId); if(!L) return null;
    const w = roomW || 480, h = roomH || 320, bg = ILLUSTRATED_BG[layoutKey(locId)];
    const key = layoutKey(locId) + "|" + w + "x" + h + "|" + ((bg && bg.naturalWidth) || 0);
    if(DOOR_CACHE[key]) return DOOR_CACHE[key];
    const S = uiScale(), m = 22*S, st = 6, cols = Math.ceil(w/st) + 1, rows = Math.ceil(h/st) + 1, seen = new Uint8Array(cols*rows);
    // 화면에서 가장 큰 "이어진 길"을 기준으로 삼는다 (가운데 근처의 작은 웅덩이 같은 자리에서 시작해 출입구를 못 찾는 일을 막는다)
    const roomy = (x, y)=> [[0,0],[10,0],[-10,0],[0,10],[0,-10]].every(o=> walkableRaw(locId, x + o[0], y + o[1]));   // 사방이 트인 자리
    const comp = new Int32Array(cols*rows), okc = new Uint8Array(cols*rows);
    for(let cy = 0; cy < rows; cy++) for(let cx = 0; cx < cols; cx++) okc[cy*cols + cx] = walkableRaw(locId, cx*st, cy*st) ? 1 : 0;
    let bestId = 0, bestN = 0, cid = 0;
    for(let k = 0; k < cols*rows; k++){
      if(!okc[k] || comp[k]) continue;
      cid++; let n = 0; const stk = [k]; comp[k] = cid;
      while(stk.length){
        const q = stk.pop(), cx = q % cols, cy = (q - cx)/cols; n++;
        if(cx > 0 && okc[q-1] && !comp[q-1]){ comp[q-1] = cid; stk.push(q-1); }
        if(cx < cols-1 && okc[q+1] && !comp[q+1]){ comp[q+1] = cid; stk.push(q+1); }
        if(cy > 0 && okc[q-cols] && !comp[q-cols]){ comp[q-cols] = cid; stk.push(q-cols); }
        if(cy < rows-1 && okc[q+cols] && !comp[q+cols]){ comp[q+cols] = cid; stk.push(q+cols); }
      }
      if(n > bestN){ bestN = n; bestId = cid; }
    }
    for(let k = 0; k < cols*rows; k++) seen[k] = (comp[k] === bestId && bestId) ? 1 : 0;
    let s0 = { x:w/2, y:h/2 }, sd = 1e12, s1 = null, sd1 = 1e12;
    for(let cy = 0; cy < rows; cy++) for(let cx = 0; cx < cols; cx++){
      if(!seen[cy*cols + cx]) continue;
      const px = cx*st, py = cy*st, d = (px - w/2)*(px - w/2) + (py - h/2)*(py - h/2);
      if(d < sd1){ sd1 = d; s1 = { x:px, y:py }; }
      if(d < sd && roomy(px, py)){ sd = d; s0 = { x:px, y:py }; }
    }
    if(sd >= 1e12 && s1) s0 = s1;
    const reach = (x, y)=> { const cx = Math.round(x/st), cy = Math.round(y/st); return cx >= 0 && cy >= 0 && cx < cols && cy < rows && !!seen[cy*cols + cx]; };
    const res = { pts:{}, forced:[], reach, s0 };
    const hw = 28*S;
    ["up","down","left","right"].forEach(dir=>{
      if(!L.doors || L.doors[dir] == null) return;
      const vert = (dir === "up" || dir === "down"), len = vert ? w : h;
      const prefs = [].concat(L.doors[dir]).map(v=> vert ? pctToXY(locId, v, 0).x : pctToXY(locId, 0, v).y);
      const runs = []; let a = null;
      for(let c = 0; c <= len; c += 3){
        const x = vert ? c : (dir === "left" ? m : w - m), y = vert ? (dir === "up" ? m : h - m) : c;
        const ok = c < len && reach(x, y) && walkableRaw(locId, x, y);
        if(ok && a == null) a = c;
        if(!ok && a != null){ runs.push([a, c]); a = null; }
      }
      if(a != null) runs.push([a, len]);   // 가장자리까지 이어진 길이 3px 간격 때문에 버려지지 않게
      const cornerZone = 40*S;   // 모서리 끝에 걸친 좁은 구간은 출구로 쓰지 않는다 (가려진 구석이라 못 가는 것처럼 된다)
      const good = runs.filter(r=> r[1] - r[0] >= 14*S && (r[0] + r[1])/2 > cornerZone && (r[0] + r[1])/2 < len - cornerZone);
      const pts = [];
      prefs.forEach(pv=>{
        let coord = null;
        if(good.length){
          let bd = 1e9, br = null;
          good.forEach(r=>{ const d = (pv < r[0]) ? r[0] - pv : (pv > r[1] ? pv - r[1] : 0); if(d < bd){ bd = d; br = r; } });
          const pad = Math.min(14*S, (br[1] - br[0])/2);
          coord = Math.max(br[0] + pad, Math.min(br[1] - pad, pv));
        }
        else {   // 이 화면에서는 길이 보이지 않는다 → 가운데 길을 임시로 연결
          coord = Math.max(m*2, Math.min(len - m*2, len/2));
          if(vert){ res.forced.push([coord - hw, dir === "up" ? 0 : s0.y, coord + hw, dir === "up" ? s0.y : h]); res.forced.push([Math.min(coord, s0.x) - hw, s0.y - hw, Math.max(coord, s0.x) + hw, s0.y + hw]); }
          else { res.forced.push([dir === "left" ? 0 : s0.x, coord - hw, dir === "left" ? s0.x : w, coord + hw]); res.forced.push([s0.x - hw, Math.min(coord, s0.y) - hw, s0.x + hw, Math.max(coord, s0.y) + hw]); }
        }
        if(!pts.some(q=> Math.abs(q - coord) < 10*S)) pts.push(coord);
      });
      res.pts[dir] = pts.map(c=> vert ? { x:c, y:h/2 } : { x:w/2, y:c });
    });
    DOOR_CACHE[key] = res;
    return res;
  }
  function walkableAt(locId, x, y){
    if(!layoutFor(locId)) return true;
    if(walkableRaw(locId, x, y)) return true;
    const D = doorSet(locId);
    return !!(D && D.forced.some(r=> x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]));
  }
  function doorPts(locId, dir){
    const D = doorSet(locId), w = roomW || 480, h = roomH || 320;
    return (D && D.pts[dir] && D.pts[dir].length) ? D.pts[dir] : [{ x:w/2, y:h/2 }];
  }
  function doorXY(locId, dir, hint){
    const pts = doorPts(locId, dir), vert = (dir === "up" || dir === "down");
    if(pts.length === 1 || hint == null) return pts[0];
    let best = pts[0], bd = 1e9;
    pts.forEach(q=>{ const d = Math.abs((vert ? q.x : q.y) - hint); if(d < bd){ bd = d; best = q; } });
    return best;
  }
  function doorNear(locId, dir, coord, gap){
    const vert = (dir === "up" || dir === "down");
    return doorPts(locId, dir).some(q=> Math.abs((vert ? q.x : q.y) - coord) < gap);
  }
  function nearestWalkable(locId, x, y){
    if(walkableAt(locId, x, y)) return { x, y };
    for(let r = 6; r < 600; r += 6){
      for(let a = 0; a < 24; a++){
        const px = x + Math.cos(a/24*Math.PI*2)*r, py = y + Math.sin(a/24*Math.PI*2)*r;
        if(walkableAt(locId, px, py)) return { x:px, y:py };
      }
    }
    return { x, y };
  }
  /* ---------- HUD(미니맵·스킬 칸)에 가려지는 자리 피하기 ---------- */
  // 화면 위에 떠 있는 HUD 상자들을 캔버스 좌표로 읽어 온다 (보이지 않는 HUD는 제외)
  function hudRects(){
    const wrap = document.getElementById("room-wrap"); if(!wrap) return [];
    const base = wrap.getBoundingClientRect(), out = [];
    ["minimap", "isaac-wrap", "skill-dock", "theft-hud", "kitten-hud"].forEach(id=>{
      const el = document.getElementById(id); if(!el) return;
      const cs = getComputedStyle(el); if(cs.display === "none" || cs.visibility === "hidden") return;
      const r = el.getBoundingClientRect(); if(r.width < 2 || r.height < 2) return;
      // 스킬 칸은 사용법 안내 말풍선까지 포함한 상자 전체 (transform 반영된 실제 위치)
      out.push({ x0:r.left - base.left, y0:r.top - base.top, x1:r.right - base.left, y1:r.bottom - base.top });
    });
    return out;
  }
  function hudHit(q, pad, rects){
    return (rects || hudRects()).some(r=> q.x > r.x0 - pad && q.x < r.x1 + pad && q.y > r.y0 - pad && q.y < r.y1 + pad);
  }
  // 이미 놓인 물건 중 HUD에 가려진 것을 가까운 빈 자리로 옮긴다 (움직이는 물건·비밀 틈은 건드리지 않는다)
  function nudgeObjectsFromHud(){
    try{
      if(!state || !state.roomObjects || !state.roomObjects.length || !roomW || !roomH) return;
      const rects = hudRects(); if(!rects.length) return;
      const locId = state.currentLoc, S = uiScale(), w = roomW, h = roomH, mg = 40*S, pad = 28*S;
      const movable = o=> o && !o.consumed && !o.seasonHazard && o.item && !CHASERS[o.item.key] && o.item.key !== "owner" && o.item.key !== "secret";
      const objs = state.roomObjects;
      let D = null; try{ D = doorSet(locId); }catch(e){}
      const hasLayout = !!layoutFor(locId);
      const okAt = (q, self, zones, k)=>{
        if(q.x < mg || q.x > w - mg || q.y < mg || q.y > h - mg) return false;
        if(hudHit(q, pad, rects)) return false;
        if(hasLayout && !(walkableRaw(locId, q.x, q.y) && (!D || D.reach(q.x, q.y)))) return false;
        if(objs.some(o=> o !== self && !o.consumed && Math.hypot((o.x - q.x)*0.8, o.y - q.y) < 56*S)) return false;
        if(zones && zones.some(z=> z(q, k))) return false;
        return true;
      };
      let zones = null; try{ zones = clearZones(locId, w, h, S); }catch(e){}
      objs.forEach(o=>{
        if(!movable(o) || !hudHit(o, pad, rects)) return;
        let best = null;
        for(const useZones of [true, false]){
          for(let r = 8*S; r < Math.max(w, h) && !best; r += 8*S){
            const steps = Math.max(24, Math.round(r / (6*S)));
            for(let a = 0; a < steps; a++){
              const q = { x:o.x + Math.cos(a/steps*Math.PI*2)*r, y:o.y + Math.sin(a/steps*Math.PI*2)*r };
              if(okAt(q, o, useZones ? zones : null, 0.8)){ best = q; break; }
            }
          }
          if(best) break;
        }
        if(best){ o.x = best.x; o.y = best.y; o.sx = best.x; o.sy = best.y; }
      });
    }catch(e){}
  }
  // 물건을 놓으면 안 되는 자리: 출구(문) 앞 길목과 이름표, 방금 들어온 자리
  function clearZones(locId, w, h, S){
    const zones = [], dw = 84*S, dd = 27*S, pad = 24*S;
    const rect = (x0, y0, x1, y1)=> (q, k)=> q.x > x0 - pad*k && q.x < x1 + pad*k && q.y > y0 - pad*k && q.y < y1 + pad*k;
    const exs = (state && (state.homeInside || state.jackpotRoom)) ? {} : ((LOC_BY_ID[locId] && LOC_BY_ID[locId].exits) || {});
    try{
      if(exs.up)    doorPts(locId, "up").forEach(q=> zones.push(rect(q.x - 62*S, 0, q.x + 62*S, dd + 58*S)));
      if(exs.down)  doorPts(locId, "down").forEach(q=> zones.push(rect(q.x - 62*S, h - dd - 58*S, q.x + 62*S, h)));
      if(exs.left)  doorPts(locId, "left").forEach(q=> zones.push(rect(0, q.y - dw/2 - 6*S, dd + 8*S + 128*S, q.y + dw/2 + 36*S)));
      if(exs.right) doorPts(locId, "right").forEach(q=> zones.push(rect(w - dd - 8*S - 128*S, q.y - dw/2 - 6*S, w, q.y + dw/2 + 36*S)));
    }catch(e){}
    if(state && state.running){ zones.push((q, k)=> Math.hypot(q.x - player.x, q.y - player.y) < 92*S*k); }
    try{ const hr = hudRects(); if(hr.length) zones.push((q, k)=> hudHit(q, 28*S, hr)); }catch(e){}   // 미니맵·스킬 칸 밑은 피한다
    return zones;
  }
  /* 아이템은 "길로 보이는 구역"에만 놓는다 (지붕·벽·물·나무 위 금지). 값은 [x1,y1,x2,y2] % */
  const PATH_AREAS = {
    park:[[46,0,53,42],[46,58,53,100],[0,46,40,56],[60,46,100,56]],
    playground:[[30,58,66,82]],
    market:[[9,37,91,45],[45,0,54,100]],
    housing:[[10,41,92,56],[46,0,54,100]],
    alley:[[45,0,54,45],[0,48,100,60]],
    market_st:[[8,36,92,47],[47,0,53,100]],
    lot:[[16,35,84,58],[19,58,78,92]],
    road:[[12,28,88,34],[14,38,86,66],[14,72,86,86]],
    stream:[[1,38,33,52],[67,38,99,52]],
    home:[[14,42,86,86]],
    home_adopted:[[10,62,90,92]]
  };
  function pathPoint(locId){
    const A = PATH_AREAS[layoutKey(locId)]; if(!A) return null;
    const r = A[Math.floor(Math.random()*A.length)];
    return pctToXY(locId, r[0] + Math.random()*(r[2]-r[0]), r[1] + Math.random()*(r[3]-r[1]));
  }
  function inPathArea(locId, x, y){
    const A = PATH_AREAS[layoutKey(locId)]; if(!A) return true;
    const c = bgCover(locId), px = (x - c.ox)/c.dw*100, py = (y - c.oy)/c.dh*100;
    return A.some(r=> px >= r[0] && px <= r[2] && py >= r[1] && py <= r[3]);
  }
  function spotsFor(locId, n){
    const L = layoutFor(locId); if(!L || !L.spots || !L.spots.length) return null;
    if(PATH_AREAS[layoutKey(locId)]){
      const w = roomW || 480, h = roomH || 320, S = uiScale(), mg = 46*S, D = doorSet(locId), zones = clearZones(locId, w, h, S);
      const ok = q=> q.x > mg && q.x < w - mg && q.y > mg && q.y < h - mg && !waterAt(locId, q.x, q.y) && (!D || D.reach(q.x, q.y));
      for(const k of [1, 0.8, 0.62, 0.45, 0.3]){
        const picked = [];
        for(let t = 0; t < 500 && picked.length < n; t++){
          const q = pathPoint(locId); if(!q || !ok(q) || zones.some(z=> z(q, k))) continue;
          if(picked.some(p=> Math.hypot((p.x - q.x)*0.8, p.y - q.y) < 72*S*k)) continue;
          picked.push(q);
        }
        if(picked.length >= n) return picked;
      }
    }
    const w = roomW || 480, h = roomH || 320, S = uiScale(), mg = 46*S, D = doorSet(locId);
    const okAt = q=> q.x > mg && q.x < w - mg && q.y > mg && q.y < h - mg && walkableRaw(locId, q.x, q.y) && D.reach(q.x, q.y);
    const base = L.spots.map(sp=> pctToXY(locId, sp[0], sp[1])).filter(okAt);
    if(!base.length) return null;
    for(let i = base.length - 1; i > 0; i--){ const j = Math.floor(Math.random()*(i + 1)); const t = base[i]; base[i] = base[j]; base[j] = t; }
    const extra = [];   // 정해진 자리가 모자라거나 출구와 겹치면 쓸 여유 자리
    for(let t = 0; t < 140; t++){ const q = { x: mg + Math.random()*(w - mg*2), y: mg + Math.random()*(h - mg*2) }; if(okAt(q)) extra.push(q); }
    const pool = base.concat(extra), zones = clearZones(locId, w, h, S);
    let picked = [];
    for(const k of [1, 0.8, 0.62, 0.45]){          // 자리가 모자라면 간격을 조금씩 줄여 가며 찾는다
      picked = [];
      for(const q of pool){
        if(zones.some(z=> z(q, k))) continue;
        if(picked.some(p=> Math.hypot((p.x - q.x)*0.8, p.y - q.y) < 72*S*k)) continue;
        picked.push(q); if(picked.length >= n) break;
      }
      if(picked.length >= n) break;
    }
    while(picked.length < n) picked.push(base[picked.length % base.length]);
    return picked.slice(0, n);
  }

  function getScene(w, h, S, loc){
    const size = w + "x" + h + "@" + S.toFixed(2) + "x" + roomDPR;
    if(size !== SCENE_SIZE){ Object.keys(SCENE_CACHE).forEach(k=> delete SCENE_CACHE[k]); SCENE_SIZE = size; }
    const key = loc.id + "|" + (state.adopted ? 1 : 0) + "|" + (state.jackpotRoom ? "jp" : state.homeInside ? "in" : "out") + "|" + Object.keys(loc.exits || {}).sort().join("");
    if(SCENE_CACHE[key]) return SCENE_CACHE[key];
    const cv = document.createElement("canvas"); cv.width = Math.round(w * roomDPR); cv.height = Math.round(h * roomDPR);
    const c = cv.getContext("2d");
    c.scale(roomDPR, roomDPR); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "high";
    c.fillStyle = ROOM_BG[loc.id] || "#EDEAFB"; c.fillRect(0, 0, w, h);
    const bgId = layoutKey(loc.id);
    const bg = ILLUSTRATED_BG[bgId];
    if(bg && bg.complete && bg.naturalWidth > 0){
      // 고해상도 원본의 비율을 유지하며 화면을 채운다. 확대는 최소화하고 중앙 기준으로 가장자리를 크롭한다.
      // v38: 표시 위치와 출입구/물/아이템 좌표에 사용하는 bgCover를 동일하게 적용한다.
      const cover = bgCover(loc.id);
      c.drawImage(bg, cover.ox, cover.oy, cover.dw, cover.dh);
        } else {
      // 에셋 로딩 전에는 기존 배경을 사용하고, 로딩 완료 후 자동으로 일러스트로 교체한다.
      const fn = bgId === "jackpot" ? jackpotPainter : SCENE_PAINTERS[bgId];
      if(fn){ try{ fn(makePainter(c, w, h, S, loc)); }catch(err){ console.error("scene", loc.id, err); } }
    }
    SCENE_CACHE[key] = cv;
    return cv;
  }

  /* ---------- 장소별 벽 ---------- */

  /* ---------- 벽돌담: 방 둘레를 벽돌로 두르고 길(입구)만 비워 둔다 ---------- */
  /* ---------- 배경과 어우러지는 낮은 돌담: 장소 분위기에 맞춘 색조 + 안쪽 그림자·윗면 하이라이트로 또렷하게 ---------- */
  const WALL_TINT = {
    park:["#D8D9B9","#A9AD8C"], playground:["#EBDCC4","#C4AE90"], market:["#EBD6AE","#C2A67C"], housing:["#E6D6BE","#BBA68A"],
    alley:["#DDD3CB","#AFA096"], market_st:["#ECD3B4","#C3A183"], lot:["#D9DDB8","#A6AD88"], home:["#D6D3B6","#A19E82"],
    home_adopted:["#E3CFAA","#B99F76"], home_adopted_inside:["#E3CFAA","#B99F76"], jackpot:["#6d4a80","#2d1a3a"], road:["#D3D3D6","#A2A2AA"], stream:["#CBD6D8","#9DADB2"],
  };
  const _stoneCache = {};
  function stonePattern(ctx, S, key){
    const ck = key + "|" + S.toFixed(2) + "|" + roomDPR;
    if(_stoneCache[ck]) return _stoneCache[ck];
    S = S * roomDPR;     // 무늬를 화면 밀도만큼 크게 그린 뒤, 아래에서 원래 크기로 줄여 쓴다
    const tint = WALL_TINT[key] || WALL_TINT.park;
    const bw = Math.max(22, Math.round(34*S)), bh = Math.max(12, Math.round(16*S));
    const c = document.createElement("canvas"); c.width = bw*3; c.height = bh*4;
    const g = c.getContext("2d");
    g.fillStyle = tint[1]; g.fillRect(0, 0, c.width, c.height);   // 줄눈
    const rnd = mulberry32(hashStr(key));
    const base = tint[0];
    for(let r = 0; r < 4; r++){
      const off = (r % 2) ? -bw/2 : 0;
      for(let k = -1; k < 4; k++){
        const x = off + k*bw + 1.2*S, y = r*bh + 1.2*S, ww = bw - 2.4*S, hh = bh - 2.4*S;
        const v = (rnd() - 0.5) * 22;
        g.fillStyle = shadeHex(base, v);
        g.beginPath(); const rr = 3*S;
        g.moveTo(x + rr, y); g.arcTo(x + ww, y, x + ww, y + hh, rr); g.arcTo(x + ww, y + hh, x, y + hh, rr); g.arcTo(x, y + hh, x, y, rr); g.arcTo(x, y, x + ww, y, rr); g.closePath(); g.fill();
        g.fillStyle = "rgba(255,255,255,.28)"; g.fillRect(x + rr, y + 0.5*S, ww - 2*rr, 1.4*S);   // 돌 윗면 빛
        if(rnd() < 0.22){ g.fillStyle = "rgba(110,150,80,.22)"; g.beginPath(); g.ellipse(x + rnd()*ww, y + hh*0.85, 4*S, 2*S, 0, 0, 7); g.fill(); }   // 이끼
      }
    }
    const pat = ctx.createPattern(c, "repeat");
    if(roomDPR !== 1 && pat && pat.setTransform){ try{ pat.setTransform(new DOMMatrix().scale(1 / roomDPR)); }catch(e){} }
    return (_stoneCache[ck] = pat);
  }
  function shadeHex(hex, d){
    const n = parseInt(hex.slice(1), 16), cl = v=> Math.max(0, Math.min(255, Math.round(v)));
    return "rgb(" + cl((n >> 16) + d) + "," + cl(((n >> 8) & 255) + d) + "," + cl((n & 255) + d) + ")";
  }
  function drawBrickWalls(ctx, w, h, S, exits, dw, t){
    ctx.save();
    ctx.fillStyle = stonePattern(ctx, S, layoutKey(state.currentLoc));
    const rect = (x,y,ww,hh)=>{ if(ww>0 && hh>0) ctx.fillRect(x,y,ww,hh); };
    // 출입구 위치(그림의 길이 이어진 곳)를 기준으로 그 부분만 비운 벽 구간을 구한다
    const loc = state.currentLoc, lay = !!layoutFor(loc);
    const opens = n=> !exits[n] ? [] : (lay ? doorPts(loc, n).map(q=> (n === "up" || n === "down") ? q.x : q.y) : [(n === "up" || n === "down") ? w/2 : h/2]);
    const spans = (a0, a1, os)=>{ const iv = []; let cur = a0; os.slice().sort((p, q)=> p - q).forEach(c=>{ const a = c - dw/2, b = c + dw/2; if(a > cur) iv.push([cur, Math.min(a, a1)]); cur = Math.max(cur, b); }); if(cur < a1) iv.push([cur, a1]); return iv; };
    const sUp = spans(0, w, opens("up")), sDn = spans(0, w, opens("down")), sLf = spans(t, h - t, opens("left")), sRt = spans(t, h - t, opens("right"));
    sUp.forEach(v=> rect(v[0], 0, v[1] - v[0], t));
    sDn.forEach(v=> rect(v[0], h - t, v[1] - v[0], t));
    sLf.forEach(v=> rect(0, v[0], t, v[1] - v[0]));
    sRt.forEach(v=> rect(w - t, v[0], t, v[1] - v[0]));
    // 벽이 땅에 드리우는 부드러운 안쪽 그림자 (배경 위에서도 벽이 또렷하게 보이도록)
    const gd = 14*S;
    const shade = (x0, y0, x1, y1, rx, ry, rw, rh)=>{ const gr = ctx.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, "rgba(45,32,24,0.38)"); gr.addColorStop(1, "rgba(45,32,24,0)"); ctx.fillStyle = gr; rect(rx, ry, rw, rh); };
    sUp.forEach(v=> shade(0, t, 0, t + gd, v[0], t, v[1] - v[0], gd));
    sDn.forEach(v=> shade(0, h - t, 0, h - t - gd, v[0], h - t - gd, v[1] - v[0], gd));
    sLf.forEach(v=> shade(t, 0, t + gd, 0, t, v[0], gd, v[1] - v[0]));
    sRt.forEach(v=> shade(w - t, 0, w - t - gd, 0, w - t - gd, v[0], gd, v[1] - v[0]));
    // 벽 안쪽 가장자리의 진한 선과 위쪽 하이라이트 (돌담 윗면)
    ctx.fillStyle = "rgba(70,50,38,0.55)";
    const ln = Math.max(1.5, 2.2*S);
    sUp.forEach(v=> rect(v[0], t - ln, v[1] - v[0], ln));
    sDn.forEach(v=> rect(v[0], h - t, v[1] - v[0], ln));
    sLf.forEach(v=> rect(t - ln, v[0], ln, v[1] - v[0]));
    sRt.forEach(v=> rect(w - t, v[0], ln, v[1] - v[0]));
    ctx.fillStyle = "rgba(255,250,235,0.55)";
    sUp.forEach(v=> rect(v[0], t - ln - 1.6*S, v[1] - v[0], 1.6*S));
    sLf.forEach(v=> rect(t - ln - 1.6*S, v[0], 1.6*S, v[1] - v[0]));
    // 검은 외곽선은 사용하지 않고 부드러운 그림자와 밝은 하이라이트로 벽을 구분한다.
    // 벽 윗면에 밝은 얇은 하이라이트를 넣어 두께감을 준다.
    ctx.strokeStyle = "rgba(255,246,225,0.78)";
    ctx.lineWidth = Math.max(1, 1.4*S);
    ctx.beginPath();
    sUp.forEach(v=>{ ctx.moveTo(v[0], 2*S); ctx.lineTo(v[1], 2*S); });
    sDn.forEach(v=>{ ctx.moveTo(v[0], h - 2*S); ctx.lineTo(v[1], h - 2*S); });
    ctx.stroke();
    ctx.restore();
  }

  function drawRoom(){
    const canvas = document.getElementById("room-canvas");
    if(!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = roomW, h = roomH;
    if(!w || !h || !canvas.width) return;
    ctx.setTransform(roomDPR, 0, 0, roomDPR, 0, 0);     // 이후 모든 그리기는 화면 크기(CSS 픽셀) 기준 좌표를 그대로 쓴다
    const S = uiScale();
    const loc = LOC_BY_ID[state.currentLoc];
    ctx.clearRect(0,0,w,h);
    ctx.drawImage(getScene(w, h, S, loc), 0, 0, w, h);      // 장소마다 다른 바닥·길·소품
    if(loc.id === "road" && !state.homeInside && !state.jackpotRoom){
      // 기존 화재 도로 미니게임의 차량 이미지 에셋을 emoDraw로 재사용한다.
      const roadCar=(x,y,icon,flip,fontSize=42,vi)=>{
        ctx.save(); ctx.translate(x,y); if(flip) ctx.scale(-1,1);
        ctx.fillStyle="rgba(0,0,0,.18)"; ctx.beginPath(); ctx.ellipse(0,15*S,27*S,5*S,0,0,Math.PI*2); ctx.fill();
        const myoCar = (vi != null ? carSprite(vi) : null) || assetImg(icon === "🚗" ? "sprite_car_red" : "sprite_car_blue");
        if(myoCar){ ctx.drawImage(myoCar, -31*S, -14*S, 62*S, 30*S); }
        else {
          ctx.font=(fontSize*S)+"px sans-serif"; ctx.textAlign="center"; ctx.textBaseline="middle";
          if(typeof window.emoDraw === "function") window.emoDraw(ctx,icon,0,0);
          else ctx.fillText(icon,0,0);
        }
        ctx.restore();
      };
      // 실제 주행 차량만 차선 위치에 그리며, 충돌 판정과 같은 좌표를 사용한다.
      roadTrafficPositions(w,h,S,performance.now()).forEach(c=>roadCar(c.x,c.y,c.icon,c.dir<0,42,c.vi));
    }
    if(state.fireEvent && state.fireEvent.step === 1 && state.adopted && state.currentLoc === "home" && !state.homeInside && !state.fireSearch) drawHomeFire(ctx, w, h, S);   // 불 붙은 집
    if(state.jackpotRoom) drawJackpotFx(ctx, w, h, S);
    drawHomeFx(ctx, w, h);                              // 집 안팎 전환 효과
    if(state.risk > 0){   // 위험할수록 화면이 어둑해진다
      ctx.fillStyle = "rgba(60,52,100," + (clamp(state.risk)/100*0.3).toFixed(3) + ")";
      ctx.fillRect(0,0,w,h);
    }

    const dw = 84*S, dd = 27*S;   // 입구 폭 · 벽 두께 (배경 일러스트 위에서도 잘 보이도록 강화)
    const wx = (state.homeInside || state.jackpotRoom) ? {} : loc.exits;   // 집 안에서는 맵 이동이 없다
    drawBrickWalls(ctx, w, h, S, wx, dw, dd);
    if(state.jackpotRoom) drawJackpotExit(ctx, w, h, S, dw, dd);
    ctx.fillStyle = "rgba(255,246,214,0.55)";   // 입구 바닥에 은은한 빛
    if(wx.up) doorPts(loc.id, "up").forEach(q=> ctx.fillRect(q.x - dw/2, 0, dw, dd));
    if(wx.down) doorPts(loc.id, "down").forEach(q=> ctx.fillRect(q.x - dw/2, h-dd, dw, dd));
    if(wx.left) doorPts(loc.id, "left").forEach(q=> ctx.fillRect(0, q.y - dw/2, dd, dw));
    if(wx.right) doorPts(loc.id, "right").forEach(q=> ctx.fillRect(w-dd, q.y - dw/2, dd, dw));

    try{ drawIsaacDoors(ctx, loc, w, h, S, wx, dw, dd); }catch(err){}
    // 문 옆에 가는 곳 이름 표시 (고양이가 가까이 오면 흐려진다)
    ctx.save();
    ctx.font = "700 " + (12*S) + "px 'Noto Sans KR', sans-serif";
    ctx.textBaseline = "middle";
    const lbl = id=> { const t = LOC_BY_ID[id]; return !t ? "" : (state.visited[id] ? (locDisplayIcon(t) + " " + locDisplayName(t)) : "???"); };
    const doorLabels = [];
    const lex = (state.homeInside || state.jackpotRoom) ? {} : loc.exits;
    if(lex.up)    doorPts(loc.id,"up").forEach(q=> doorLabels.push({ t:lbl(loc.exits.up),    x:q.x,    y:dd + 14*S,            al:"center" }));
    if(lex.down)  doorPts(loc.id,"down").forEach(q=> doorLabels.push({ t:lbl(loc.exits.down),  x:q.x,  y:h - dd - 14*S,        al:"center" }));
    if(lex.left)  doorPts(loc.id,"left").forEach(q=> doorLabels.push({ t:lbl(loc.exits.left),  x:dd + 8*S,     y:q.y + dw/2 + 12*S,    al:"left" }));
    if(lex.right) doorPts(loc.id,"right").forEach(q=> doorLabels.push({ t:lbl(loc.exits.right), x:w - dd - 8*S, y:q.y + dw/2 + 12*S,    al:"right" }));
    const _hr = hudRects();   // 스킬 칸·미니맵 등 화면 위에 얹힌 것들 (문 이름표가 가려지지 않게 피해서 그린다)
    doorLabels.forEach(d=>{
      // 장소 이름은 고양이가 가까이 있어도 흐려지지 않도록 하고,
      // 반투명한 어두운 라벨과 흰 글자로 배경과 분리한다.
      const textW = ctx.measureText(d.t).width;
      const emojiCount = (d.t.match(/[\u{1F300}-\u{1FAFF}]/gu) || []).length;
      const tw = textW + emojiCount * 12*S;
      const padX = 8*S, padY = 5*S;
      const boxW = tw + padX*2, boxH = 21*S + padY*0.4;
      const cx = d.al === "center" ? d.x : (d.al === "left" ? d.x + boxW/2 : d.x - boxW/2);
      ctx.save();
      ctx.globalAlpha = 1;
      // 장소 라벨: 테두리 없는 반투명 어두운 배경으로 자연스럽게 표시
      ctx.fillStyle = "rgba(35,27,52,0.58)";
      let ly = d.y;
      for(let it = 0; it < 6; it++){
        const hit = _hr.find(r=> cx + boxW/2 > r.x0 && cx - boxW/2 < r.x1 && ly + boxH/2 > r.y0 && ly - boxH/2 < r.y1);
        if(!hit) break;
        ly = d.y > h/2 ? hit.y0 - boxH/2 - 4*S : hit.y1 + boxH/2 + 4*S;   // 아래쪽 문은 위로, 위쪽 문은 아래로 비켜 앉는다
      }
      const bx = cx - boxW/2, by = ly - boxH/2;
      const radius = 7*S;
      ctx.beginPath();
      ctx.moveTo(bx+radius, by); ctx.lineTo(bx+boxW-radius, by);
      ctx.quadraticCurveTo(bx+boxW, by, bx+boxW, by+radius);
      ctx.lineTo(bx+boxW, by+boxH-radius);
      ctx.quadraticCurveTo(bx+boxW, by+boxH, bx+boxW-radius, by+boxH);
      ctx.lineTo(bx+radius, by+boxH);
      ctx.quadraticCurveTo(bx, by+boxH, bx, by+boxH-radius);
      ctx.lineTo(bx, by+radius); ctx.quadraticCurveTo(bx, by, bx+radius, by); ctx.closePath();
      ctx.fill();
      ctx.font = "800 " + (12*S) + "px 'Noto Sans KR', sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillStyle = "#FFFFFF";
      ctx.shadowColor = "rgba(0,0,0,0.75)";
      ctx.shadowBlur = 2*S;
      // 기존 혼합 렌더러로 장소 아이콘과 한글 이름을 함께 그린다.
      emoDrawMixed(ctx, d.t, bx+padX, ly);
      ctx.restore();
    });
    ctx.restore();

    (state.roomObjects||[]).forEach((o,i)=>{
      if(o.consumed) return;
      ctx.save();
      ctx.font = (26*S) + "px sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      if(o.seasonHazard && o.hazardType === "puddle"){
        // 장마 물웅덩이: 물빛 반사와 동심원으로 바닥에서 미끄러운 구역을 보여 준다.
        const pulse = 0.5 + 0.5*Math.sin(performance.now()/430 + i*1.7);
        ctx.fillStyle = "rgba(37,87,132,0.16)";
        ctx.beginPath(); ctx.ellipse(o.x, o.y + 5*S, 34*S, 14*S, -0.12, 0, Math.PI*2); ctx.fill();
        const pg = ctx.createLinearGradient(o.x, o.y-10*S, o.x, o.y+12*S);
        pg.addColorStop(0, "rgba(190,226,246,0.82)"); pg.addColorStop(1, "rgba(73,145,190,0.64)");
        ctx.fillStyle = pg;
        ctx.beginPath(); ctx.ellipse(o.x, o.y, 31*S, 11*S, -0.12, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = "rgba(239,250,255," + (0.45 + 0.25*pulse).toFixed(2) + ")"; ctx.lineWidth = 1.5*S;
        ctx.beginPath(); ctx.ellipse(o.x-4*S, o.y-2*S, 18*S, 4*S, -0.12, 0, Math.PI*2); ctx.stroke();
        ctx.restore(); return;
      }
      if(o.fleeT > 0 && o.fleeMax){
        ctx.globalAlpha = Math.max(0, Math.min(1, o.fleeT / (o.fleeMax*0.6)));
        ctx.font = (18*S) + "px sans-serif"; emoDraw(ctx, "\u2757", o.x - 14*S, o.y - 22*S - Math.abs(Math.sin(performance.now()/90))*4*S);
        ctx.font = (26*S) + "px sans-serif";
      }
      const concealed = !!(o.hiddenUnder && !o.hiddenRevealed && !hasSkill("whisker"));
      // 낙엽 더미 / 눈더미: a=1이면 물건을 완전히 가리고, 수염 센서가 있으면 반투명하게 덮어 "밑에 뭔가 있다"는 걸 보여 준다.
      const drawCover = (kind, a)=>{
        ctx.save(); ctx.globalAlpha = a;
        if(kind === "leaves"){
          ctx.fillStyle = "rgba(82,49,28,0.18)"; ctx.beginPath(); ctx.ellipse(o.x, o.y+6*S, 23*S, 8*S, 0, 0, Math.PI*2); ctx.fill();
          ctx.font = (22*S) + "px sans-serif";
          emoDraw(ctx, "🍂", o.x-10*S, o.y+3*S); emoDraw(ctx, "🍁", o.x+9*S, o.y-3*S); emoDraw(ctx, "🍂", o.x+1*S, o.y-12*S);
        } else {
          ctx.fillStyle = "rgba(89,125,157,0.22)"; ctx.beginPath(); ctx.ellipse(o.x, o.y+7*S, 25*S, 8*S, 0, 0, Math.PI*2); ctx.fill();
          const sg = ctx.createLinearGradient(o.x, o.y-15*S, o.x, o.y+12*S);
          sg.addColorStop(0, "rgba(255,255,255,0.98)"); sg.addColorStop(1, "rgba(203,225,242,0.96)");
          ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(o.x, o.y, 24*S, 15*S, 0, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.beginPath(); ctx.ellipse(o.x-8*S, o.y-8*S, 8*S, 5*S, -0.25, 0, Math.PI*2); ctx.fill();
          ctx.font = (10*S) + "px sans-serif"; emoDraw(ctx, "❄️", o.x+15*S, o.y-10*S);
        }
        ctx.restore();
      };
      if(concealed){
        drawCover(o.hiddenUnder, 1);
      } else {
        const _crackImg = o.item.key === "secret" ? assetImg("obj_crack") : null;
        if(_crackImg){ const cs = 46*S, _gp = 0.5 + 0.5*Math.sin(performance.now()/380); ctx.globalAlpha = 0.82 + 0.18*_gp; ctx.drawImage(_crackImg, o.x - cs/2, o.y - cs/2, cs, cs); ctx.globalAlpha = 1; }
        else if(o.item.key === "owner" && assetImg("sprite_owner")){   // 시장 할머니: 달려오는 쪽을 보고, 총총 뛴다
          const im = assetImg("sprite_owner"), hh = 64*S, ww = hh * im.naturalWidth / im.naturalHeight, bob = Math.abs(Math.sin(performance.now()/90)) * 3*S;
          ctx.fillStyle = "rgba(0,0,0,0.14)"; ctx.beginPath(); ctx.ellipse(o.x, o.y + hh*0.42, ww*0.36, 5*S, 0, 0, Math.PI*2); ctx.fill();
          ctx.save(); ctx.translate(o.x + (o.shake || 0), o.y - bob); if(player.x < o.x) ctx.scale(-1, 1);   // 그림은 오른쪽을 본다
          ctx.drawImage(im, -ww/2, -hh/2, ww, hh); ctx.restore();
        }
        else if(o.item.key === "lover" && v36CatReady("lover_sit")){   // v43: 소환 연인도 동행 연인과 크기·발 위치 통일
          const im = v36CatReady("lover_sit");
          ctx.fillStyle = "rgba(0,0,0,0.14)"; ctx.beginPath(); ctx.ellipse(o.x, o.y + 17*S, 17*S, 4*S, 0, 0, Math.PI*2); ctx.fill();
          ctx.save(); ctx.translate(o.x + (o.shake || 0), o.y);
          if(player.x > o.x) ctx.scale(-1, 1);
          drawMyoSprite(ctx, im, 51*S, 49*S, 24*S);
          ctx.restore();
        }
        else {
          // 정체불명 물건은 너무 작아 보이지 않도록 약 1.5배 크게 표시
          if(o.item.mystery && !hasSkill("whisker")) ctx.font = (40*S) + "px sans-serif";
          emoDraw(ctx, iconFor(o.item), o.x + (o.shake || 0), o.y);
        }
      }
      if(o.hiddenUnder && hasSkill("whisker") && Math.hypot(player.x - o.x, player.y - o.y) >= 54*S) drawCover(o.hiddenUnder, 0.62);   // 수염 센서: 낙엽/눈 밑의 물건이 비쳐 보인다 (불투명도 62%)
      if(o.item.steal){   // 가판대 먹거리: 훔칠 수 있다는 신호로 반짝인다
        const pl = 0.5 + 0.5*Math.sin(performance.now()/240);
        ctx.font = (13*S) + "px sans-serif"; emoDraw(ctx, "\u2728", o.x + 16*S, o.y - 16*S - pl*3*S);
        ctx.beginPath(); ctx.arc(o.x, o.y, (22 + 3*pl)*S, 0, Math.PI*2); ctx.strokeStyle = "rgba(255,138,101," + (0.35 + 0.3*pl).toFixed(2) + ")"; ctx.lineWidth = 2*S; ctx.setLineDash([4*S, 4*S]); ctx.stroke(); ctx.setLineDash([]);
        ctx.font = (26*S) + "px sans-serif";
      }
      if(o.scared){ ctx.font = (16*S) + "px sans-serif"; emoDraw(ctx, "\uD83D\uDCA6", o.x + 16*S + (o.shake || 0), o.y - 16*S - Math.abs(Math.sin(performance.now()/120))*3*S); }
      if(hiding() && CHASERS[o.item.key]){ ctx.font = (16*S) + "px sans-serif"; emoDraw(ctx, "\u2753", o.x + 14*S, o.y - 18*S - Math.abs(Math.sin(performance.now()/160))*3*S); }
      if(o.guard){
        const g = o.guard, pop = Math.min(1, g.t/8);
        ctx.fillStyle = "rgba(0,0,0,0.12)"; ctx.beginPath(); ctx.ellipse(g.x, g.y + 16*S, 14*S*pop, 5*S*pop, 0, 0, Math.PI*2); ctx.fill();
        // 예전 단색 😼 이모지를 지우고 갈색·주황·회색 신하 스프라이트를 쓴다.
        const guardCatKeys = ["sprite_follower_c", "sprite_follower_b", "sprite_follower_a"];
        const guardImg = assetImg(guardCatKeys[(g.variant || 0) % guardCatKeys.length]);
        const guardBob = g.blocked ? 0 : -Math.abs(Math.sin(g.t*0.5))*4*S;
        if(guardImg){
          const gw = 37*S*pop, gh = gw*guardImg.naturalHeight/guardImg.naturalWidth;
          ctx.save(); ctx.translate(g.x, g.y + guardBob);
          if(player.x < g.x) ctx.scale(-1,1);
          ctx.drawImage(guardImg,-gw/2,-gh*0.65,gw,gh);
          ctx.restore();
        } else {
          ctx.font = (30*S*(0.6 + 0.4*pop)) + "px sans-serif";
          emoDraw(ctx, "\uD83D\uDE3C", g.x, g.y + guardBob);
        }
        if(!g.blocked){ ctx.globalAlpha = 0.7; ctx.font = (16*S) + "px sans-serif"; emoDraw(ctx, "\uD83E\uDEA8", g.x - 14*S, g.y + 12*S); ctx.globalAlpha = 1; }
      }
      if(hasSkill("whisker") && o.item.bad && !(o.fleeT > 0)){   // 수염 센서: 위험한 것 둘레의 붉은 경고
        const pulse = 0.5 + 0.5*Math.sin(performance.now()/170);
        ctx.beginPath(); ctx.arc(o.x, o.y, (24 + 4*pulse)*S, 0, Math.PI*2);
        ctx.strokeStyle = "rgba(255,64,64," + (0.45 + 0.4*pulse).toFixed(2) + ")"; ctx.lineWidth = 2.5*S;
        ctx.setLineDash([5*S, 4*S]); ctx.stroke(); ctx.setLineDash([]);
      }
      if(o.item.key === "secret"){   // 수상한 틈: 황금빛으로 은은하게 깜박인다
        const pulse = 0.5 + 0.5*Math.sin(performance.now()/260);
        if(assetImg("obj_crack")){
          const gr = ctx.createRadialGradient(o.x, o.y, 2*S, o.x, o.y, (34 + 6*pulse)*S);
          gr.addColorStop(0, "rgba(255,226,130," + (0.30 + 0.22*pulse).toFixed(2) + ")"); gr.addColorStop(1, "rgba(255,196,64,0)");
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(o.x, o.y, (34 + 6*pulse)*S, 0, Math.PI*2); ctx.fill();
        } else {
          ctx.beginPath(); ctx.arc(o.x, o.y, (26 + 5*pulse)*S, 0, Math.PI*2);
          ctx.strokeStyle = "rgba(255,196,64," + (0.5 + 0.4*pulse).toFixed(2) + ")"; ctx.lineWidth = 3*S; ctx.stroke();
        }
        ctx.font = (14*S) + "px sans-serif"; emoDraw(ctx, "\u2728", o.x + 18*S, o.y - 20*S - pulse*3*S);
      }
      if(i === nearbyIdx){
        ctx.beginPath();
        ctx.arc(o.x, o.y, 22*S, 0, Math.PI*2);
        ctx.strokeStyle = "#FF8A65"; ctx.lineWidth = 2*S;
        ctx.stroke();
      }
      ctx.restore();
    });

    try{ planCompanionTargets(S); }catch(err){ console.error('companion-formation',err); }
    updateLoverMate(S);
    try{ updateKittens(S); }catch(err){ console.error('kittens', err); }
    // v40: stable formation goals replace the v39 per-frame relocation solver.
    drawLoverMate(ctx, S);
    try{ drawKittens(ctx, S); }catch(err){ console.error('kittens-draw', err); }
    drawStranger(ctx, S);

    ctx.save();
    { const so = startleOffset(S); ctx.translate(player.x + so.x, player.y + so.y); }
    ctx.scale(catScale*PLAYER_SIZE, catScale*PLAYER_SIZE);
    if(catGray) ctx.filter = "grayscale(0.4)";
    ctx.font = (30*S) + "px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const catFace = catFaceNow();
    if(hiding()){
      const bob = player._walking ? Math.sin(performance.now()/370)*0.35*S : 0;
      drawHideBox(ctx, S, bob, 1.1);
      const frac = Math.max(0, Math.min(1, (state.hiddenUntil - performance.now()) / 6000));
      ctx.beginPath(); ctx.arc(0, 0, 28*S, -Math.PI/2, -Math.PI/2 + Math.PI*2*frac);
      ctx.strokeStyle = "rgba(255,184,92,.95)"; ctx.lineWidth = 3*S; ctx.lineCap = "round"; ctx.stroke();
    }
    else {
      ctx.save();  // 주인공 표정/보행 전용 레이어 (부모 transform 유지)
      const walking = !!player._walking && !state.napping && !state._endSleep;
      const rank = Math.max(0, Math.min(3, state.turfRank || 0));
      const lookRight = player.face >= 0;
      const rankFace = ["🐱","😏","😼","😐"][rank];
      // 연인 관계의 평상시 애정 표정이 서열 표정을 덮지 않도록, 서열 표현을 우선한다.
      const recentMood = catMoodFace && performance.now() < catMoodUntil;
      const shownFace = (rank > 0 && catFace === "😻" && !recentMood) ? rankFace : catFace;
      let spriteName;
      if(state.napping || state._endSleep) spriteName = "pose_sleep";
      else if(walking) spriteName = (lookRight ? "player_walk_" : "player_left_") + (Math.floor(performance.now()/142)%4);
      else spriteName = "face_" + v36EmotionName(shownFace);
      const newSprite = v36CatReady(spriteName);
      ctx.save();
      // 표정 스프라이트는 왼쪽을 보고 있으므로, 오른쪽을 볼 때만 반전한다.
      if(!walking && lookRight) ctx.scale(-1, 1);
      if(newSprite){
        drawMyoSprite(ctx, newSprite, 52*S, 46*S, 22*S);
      } else { // 이미지 로딩 전에만 기존 고양이 임시 표시
        const im = assetImg(walking ? "player_walk" + (1+Math.floor(performance.now()/142)%4) : "player_idle");
        if(im) drawMyoSprite(ctx, im, 52*S, 46*S, 22*S);
        else emoDraw(ctx, shownFace, 0, 0);
      }
      ctx.restore();
      // 왕 상태는 전용 고양이 그림을 쓰지 않고, 평소 크림색 고양이 위에 깨끗한 왕관만 별도로 얹는다.
      if(rank === 3){
        const cx = (lookRight ? 12 : -12)*S;
        ctx.save();
        ctx.font = (17*S) + "px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        emoDraw(ctx, "👑", cx, -23*S);
        ctx.restore();
      }
      // 감정은 고양이 본체의 표정으로 표시하고, 하트/식은땀 등 작은 효과만 별도로 유지한다.
      drawCatFaceFx(ctx, S, shownFace);
      ctx.restore();
    }
    if(state.theft && !hiding()){ ctx.font = (17*S) + "px sans-serif"; emoDraw(ctx, state.theft.icon, 16*S, 11*S); }   // 훔친 먹거리를 물고 있다
    ctx.restore();
    drawNapZzz(ctx, S);
    if(state._headIcon){   // 물음표 물건(지폐·폐지)의 정체: 머리 위로 톡 튀어 올랐다가 사라진다
      const hi = state._headIcon, t = (performance.now() - hi.t0) / hi.dur;
      if(t >= 1) state._headIcon = null;
      else if(t >= 0){
        const pop = t < 0.18 ? (0.4 + 0.9*(t/0.18)) : (t < 0.3 ? (1.3 - 0.3*((t-0.18)/0.12)) : 1);
        const a = t > 0.7 ? Math.max(0, 1 - (t-0.7)/0.3) : 1;
        const hx = player.x, hy = player.y - (30*catScale*PLAYER_SIZE + 14 + 10*Math.min(1, t/0.4))*S;
        ctx.save(); ctx.globalAlpha = a; ctx.translate(hx, hy); ctx.scale(pop, pop);
        ctx.beginPath(); ctx.arc(0, 0, 19*S, 0, Math.PI*2); ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.fill();
        ctx.lineWidth = 2*S; ctx.strokeStyle = "rgba(255,184,92,.95)"; ctx.stroke();
        ctx.font = (24*S) + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; emoDraw(ctx, hi.icon, 0, 1*S);
        ctx.restore();
      }
    }
    if(state._paperPlayUntil && performance.now() < state._paperPlayUntil){
      const pt = performance.now()/190 + (state._paperPlaySeed||0), px = player.x + Math.cos(pt)*30*S, py = player.y + 17*S + Math.sin(pt*1.7)*9*S;
      ctx.save(); ctx.translate(px,py); ctx.rotate(Math.sin(pt)*0.32); ctx.fillStyle="#FFFDF2"; ctx.strokeStyle="#C8B99C"; ctx.lineWidth=1.5*S;
      ctx.beginPath(); ctx.moveTo(-10*S,-7*S); ctx.lineTo(7*S,-9*S); ctx.lineTo(11*S,6*S); ctx.lineTo(-7*S,9*S); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(4*S,-8*S); ctx.lineTo(7*S,-2*S); ctx.lineTo(10*S,-3*S); ctx.stroke();
      ctx.restore();
    }
    drawSkillFx(ctx, S);
    if(state.fireSearch) drawFog(ctx, w, h, S);
  }

  /* ---------- 낯선 고양이가 옆에서 걸어와 마주 선다 (눈치 싸움 시비가 갑자기 뜨지 않게) ---------- */
  // 보스(골목 대장)는 "!" 경고 → 고양이 무리가 먼지를 일으키며 몰려오는 연출로 등장한다
  let stranger = null, strangerOK = false;
  const PACK_SLOTS = [ {back:46, side:-34}, {back:46, side:34}, {back:90, side:-66}, {back:90, side:0}, {back:90, side:66} ];
  const PACK_FACES = ["😾", "😾", "😼", "😾", "😾"];
  function startStrangerApproach(flavor){
    Object.keys(keysDown).forEach(k=> keysDown[k] = false);
    scatterKittens(null, null, "낯선 고양이가 다가오자");
    const S = uiScale(), w = roomW || 480, h = roomH || 320, m = 30*S;
    const fromLeft = player.x > w/2;                       // 고양이가 없는 쪽 벽에서 걸어 나온다
    // 첫 대장냥이 등장(leader:true)은 왕 보스와 같은 "무리 접근" 연출을 쓰되,
    // 리더 고양이의 모습은 왕 보스 스프라이트가 아니라 일반 대장냥이 느낌으로 유지한다.
    const kingBoss = !!(flavor.opts && flavor.opts.some(o=> o.boss));
    const leaderPack = !!flavor.leader;
    const packMode = kingBoss ? "king" : (leaderPack ? "leader" : "none");
    const packLike = packMode !== "none";
    const sx = packLike ? (fromLeft ? -26*S : w + 26*S) : (fromLeft ? m : w - m);   // 무리 연출은 화면 밖에서 들어온다
    const sy = Math.max(m, Math.min(h - m, player.y + (Math.random() - 0.5) * 36*S));
    const dist = Math.abs(player.x - sx);
    stranger = { x:sx, y:sy, stage: packLike ? "alert" : "walk", t:0, idle:0, walk:0, boss: kingBoss, packMode, face: packLike ? "😼" : "__follower_b__", flavor,
                 sp: Math.max(3.2*S, dist/(packLike ? 170 : 150)), ux: fromLeft ? 1 : -1, uy:0, fromLeft, dust:[], dustT:0,
                 pack: packLike ? PACK_SLOTS.map((slot,i)=> ({ back:slot.back, side:slot.side, face:PACK_FACES[i], ph:i*1.3,
                     imageId: ["__follower_a__", "__follower_b__", "__follower_c__", "__follower_b__", "__follower_a__"][i] })) : null };
    if(packLike){
      sfx("alertBoss");
      state._startle = performance.now();                                   // 깜짝 놀라 폴짝 뛰고 부들부들 떤다
      setCatMood("\uD83D\uDE31", 4800);                                    // 놀란 얼굴
      catSay(kingBoss ? "저, 저건… 왕?!" : "헉! 대장냥이다…!", 2000);
    }
    if(!packLike) showToast("😾 낯선 고양이가 이쪽으로 다가온다…");
  }
  function packPos(c, S, spread){
    const st = stranger, px = -st.uy, py = st.ux;           // 진행 방향의 수직 벡터
    return { x: st.x - st.ux * c.back*S + px * c.side*S*spread, y: st.y - st.uy * c.back*S + py * c.side*S*spread };
  }
  function updateStranger(){
    if(!stranger) return;
    if(state.gameOver){ stranger = null; return; }
    const S = uiScale();
    if(stranger.stage !== "wait" && Math.abs(stranger.x - player.x) > 2) player.face = stranger.x > player.x ? 1 : -1;   // 다가오는 고양이 쪽을 바라본다
    if(stranger.stage === "alert"){                // "!" 가 먼저 뜨고, 잠시 뒤 무리가 모습을 드러낸다
      if(++stranger.t >= 48){ stranger.stage = "walk"; stranger.t = 0; sfx("packRush"); showToast("😼 고양이 무리가 먼지를 일으키며 몰려온다…"); }
      return;
    }
    if(stranger.stage === "walk"){
      const dx = player.x - stranger.x, dy = player.y - stranger.y, d = Math.hypot(dx, dy) || 1;
      if(d <= 64*S){ stranger.stage = "face"; stranger.t = 0; if(!stranger.boss) sfx("alert"); return; }
      stranger.ux = dx/d; stranger.uy = dy/d;
      stranger.x += stranger.ux * stranger.sp; stranger.y += stranger.uy * stranger.sp; stranger.walk += 0.32;
      if(stranger.pack && ++stranger.dustT % 7 === 0){          // 걸음마다 먼지가 폴폴
        const cats = [{x:stranger.x, y:stranger.y}].concat(stranger.pack.map(c=> packPos(c, S, 1)));
        cats.forEach(c=> stranger.dust.push({ x:c.x - stranger.ux*14*S + (Math.random()-.5)*8*S, y:c.y + 14*S, t:0 }));
      }
    } else if(stranger.stage === "face"){
      stranger.walk += 0.12;
      if(++stranger.t >= 36){                      // 잠깐 서로 노려본 뒤에 시비가 시작된다
        stranger.stage = "wait"; strangerOK = true; openChoiceModal(stranger.flavor);
      }
    } else {
      const busy = choiceOverlay.classList.contains("show") || duelOverlay.classList.contains("show") || cutsceneActive();
      stranger.idle = busy ? 0 : stranger.idle + 1;
      if(stranger.idle > 240) stranger = null;     // 모달이 열리지 않았다면 조용히 사라진다
    }
    if(stranger && stranger.dust.length){ stranger.dust.forEach(p=> p.t++); stranger.dust = stranger.dust.filter(p=> p.t < 26); }
  }
  function drawOneCat(ctx, S, x, y, face, sc, bob, shadowA, dirX){
    ctx.save();
    ctx.translate(x, y + bob);
    const baseFacing = {"__boss__":1, "__leader__":1, "__follower_a__":1, "__follower_b__":-1, "__follower_c__":-1};
    const desiredFacing = (dirX || 1) >= 0 ? 1 : -1;
    const flip = (baseFacing[face] || 1) === desiredFacing ? 1 : -1;
    ctx.scale(sc * flip, sc);
    ctx.fillStyle = "rgba(0,0,0," + shadowA + ")"; ctx.beginPath(); ctx.ellipse(0, 17*S - bob/sc, 15*S, 5*S, 0, 0, Math.PI*2); ctx.fill();
    ctx.font = (30*S) + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    // 그룹 전용 스프라이트를 명시적으로 분리: 대장(갈색 장모) 1, 일반냥이 5.
    // 이전 sprite_rival 원본에는 잘린 부분이 붙어 있으므로 무리 장면에서는 사용하지 않는다.
    const imageKeys = {"__boss__":"sprite_boss", "__leader__":"sprite_leader",
      "__follower_a__":"sprite_follower_a", "__follower_b__":"sprite_follower_b", "__follower_c__":"sprite_follower_c"};
    const encounterImg = assetImg(imageKeys[face] || (face === "__boss__" ? "sprite_boss" : "sprite_follower_b"));
    if(encounterImg){
      const bw = face === "__boss__" ? 42*S : (face === "__leader__" ? 50*S : 38*S);
      const bh = bw*encounterImg.naturalHeight/encounterImg.naturalWidth;
      ctx.drawImage(encounterImg,-bw/2,-bh/2,bw,bh);
    } else emoDraw(ctx, face, 0, 0);
    ctx.restore();
  }
  function drawStranger(ctx, S){
    if(!stranger || stranger.hidden) return;
    const st = stranger, walking = st.stage === "walk";
    if(st.stage === "alert"){
      const w = roomW || 480, h = roomH || 320, k = Math.min(1, st.t/10);
      const g = ctx.createLinearGradient(st.fromLeft ? 0 : w, 0, st.fromLeft ? 70*S : w - 70*S, 0);   // 무리가 올 쪽 가장자리가 붉게 맥동
      const a = (0.30 + 0.12*Math.sin(st.t*0.5)) * k;
      g.addColorStop(0, "rgba(200,40,30," + a + ")"); g.addColorStop(1, "rgba(200,40,30,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const pop = st.t < 9 ? (st.t/9) * 1.5 : 1 + 0.12*Math.sin((st.t-9)*0.7);          // 통! 튀어 오르는 느낌표
      ctx.save(); ctx.translate(player.x, player.y - 36*S + (st.t < 9 ? 6*S*(1 - st.t/9) : 0)); ctx.scale(pop, pop);
      ctx.font = "900 " + (26*S) + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = 4*S; ctx.strokeStyle = "#fff"; ctx.strokeText("!", 0, 0);
      ctx.fillStyle = "#E8543A"; ctx.fillText("!", 0, 0);
      ctx.restore();
      return;
    }
    const spread = st.stage === "walk" ? 1 : 1 + Math.min(1, st.t/20) * 0.18;
    // 먼지 (고양이들 뒤쪽에 깔린다)
    st.dust.forEach(p=>{
      const f = p.t / 26;
      ctx.save(); ctx.globalAlpha = 0.20 * (1 - f); ctx.fillStyle = "#a99889";
      ctx.beginPath(); ctx.arc(p.x, p.y - f*10*S, (3+5*f)*S, 0, Math.PI*2); ctx.fill(); ctx.restore();
    });
    const list = [];
    if(st.pack) st.pack.forEach((c,i)=>{ const p = packPos(c, S, spread); list.push({ x:p.x, y:p.y, face:c.imageId, sc:1.0, ph:c.ph }); });
    const leadFace = st.packMode === "king" ? "__boss__" : (st.packMode === "leader" ? "__leader__" : st.face);
    list.push({ x:st.x, y:st.y, face:leadFace, sc: st.packMode === "king" ? 1.25 : (st.packMode === "leader" ? 1.12 : 1), ph:0, lead:true });
    list.sort((a,b)=> a.y - b.y);                       // 아래쪽 고양이가 위에 그려지게
    list.forEach(c=>{
      const bob = walking ? Math.abs(Math.sin(st.walk + c.ph)) * -4*S : 0;
      drawOneCat(ctx, S, c.x, c.y, c.face, c.sc, bob, c.lead ? 0.12 : 0.1, st.ux);
    });
    if(!walking){
      ctx.save(); ctx.translate(st.x, st.y); ctx.scale(st.boss ? 1.25 : 1, st.boss ? 1.25 : 1);
      ctx.font = "800 " + (20*S) + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#E8543A";
      ctx.fillText("!", 0, -26*S);
      ctx.restore();
    }
  }

  // 방 애니메이션 루프는 언제나 하나만 유지한다. 창 전환 중 RAF가 중단돼도
  // 복귀 시 시간 누적값을 초기화하고 한 번만 다시 예약한다.
  const _roomGate = { acc:0, last:0, raf:null };
  function scheduleRoomTick(){
    if(document.hidden || !document.hasFocus()) return;
    if(_roomGate.raf === null) _roomGate.raf = requestAnimationFrame(roomTick);
  }
  function roomTick(ts){
    _roomGate.raf = null;
    if(document.hidden || !document.hasFocus()){
      _roomGate.acc = 0; _roomGate.last = 0;
      return;
    }
    // 화면 주사율(60/90/120Hz)과 상관없이 1초에 60번만 갱신한다.
    ts = ts || performance.now();
    if(!_roomGate.last) _roomGate.last = ts;
    const elapsed = Math.max(0, Math.min(40, ts - _roomGate.last));
    _roomGate.last = ts;
    _roomGate.acc += elapsed;
    if(_roomGate.acc < 15.2){ scheduleRoomTick(); return; }
    _roomGate.acc -= 16.667; if(_roomGate.acc > 34) _roomGate.acc = 0;
    // 튜토리얼 중에는 이동과 낯선 고양이의 접근을 멈춘다.
    if(!window.__catroadTutorialPaused){
      try{ updatePlayer(); }catch(err){ console.error("updatePlayer", err); }
      try{ updateSkillFx(); }catch(err){ console.error("updateSkillFx", err); }
      try{ updateStranger(); }catch(err){ console.error("updateStranger", err); }
    }
    try{ drawRoom(); }catch(err){ console.error("drawRoom", err); }
    scheduleRoomTick();
  }
  // 폰에서 메모리 부족 등으로 방 캔버스가 비워졌을 때 다시 만들어 준다.
  window.__refreshRoom = function(){
    try{
      Object.keys(SCENE_CACHE).forEach(k=> delete SCENE_CACHE[k]); SCENE_SIZE = "";
      roomW = 0; roomH = 0; resizeRoomCanvas(); drawRoom();
    }catch(err){ console.error("refreshRoom", err); }
  };
  // 예외나 브라우저 절전으로 RAF가 끊긴 경우에도 중복 루프 없이 복구한다.
  setInterval(()=>{
    if(document.hidden || !document.hasFocus()) return;
    if(!_roomGate.last || performance.now() - _roomGate.last > 1500){
      if(_roomGate.raf !== null) cancelAnimationFrame(_roomGate.raf);
      _roomGate.raf = null; _roomGate.last = 0; _roomGate.acc = 0;
      scheduleRoomTick();
    }
  }, 1500);

  function tryInteract(){
    if(!roomInputAllowed()) return;
    if(nearbyIdx < 0){
      if(loverNear){
        const waiting = (state.kittens||[]).filter(k=>k.mode === "sit");
        const ready = (state.kittens||[]).some(k=> k.mode === "follow" && k.wish && k.wish.done);
        if(waiting.length && !ready){
          const _msg = kidReunion(waiting);
          waiting.forEach(k=>{ k.mode="return"; k.t=0; });
          sfx("good"); puffAt(loverMate.x,loverMate.y,8);
          showToast(_msg); renderKittenHud();
        } else openSitterMenu();
      }
      return;
    }
    resolveRoomObject(nearbyIdx);
  }

  /* ---------- 연인 퀘스트: 선물 물기 · 연인과 만나기 ---------- */
  function questPickup(item){
    if(kidWishPickup(item)) return true;                 // 맡긴 새끼가 원하는 물건이면 물어 간다
    if(!state.hasPartner || state.carry) return false;
    const st = state.loveStage || 0;
    const goal = LOVE_GOALS[st];
    if(!goal || item.key !== goal.key) return false;
    state.itemsEatenSinceModal++;
    if(goal.catchChance != null && Math.random() >= goal.catchChance){     // 큰 사냥감은 놓칠 수 있다
      applyEffToState({hunger:-3, fun:-2});
      state._lastMsg = goal.failMsg; showToast(goal.failMsg);
      return true;
    }
    state.carry = { key:item.key, icon:item.icon, label:item.label };
    // 참새를 성공적으로 사냥해 연인 퀘스트 선물로 가져가더라도 재미도 보상은 적용한다.
    // 일반 사냥은 applyItem(item, false)에서 재미도가 오르므로 여기서는 중복 적용하지 않는다.
    if(item.key === "bird") applyEffToState({fun:item.fun || 0});
    sfx("pop");
    state._lastMsg = goal.carryMsg; showToast(goal.carryMsg);
    return true;
  }
  function interactLover(obj){
    const st = state.loveStage || 0;
    if(st === 0 || st >= 4){           // 첫 데이트 또는 모든 단계 완료 후 데이트
      const sn = getSeason(state.day).name;
      const dates = DATE_FLAVORS.filter(d=> !d.seasons || d.seasons.includes(sn));
      if(!dates.length) return;
      openChoiceModal(dates[Math.floor(Math.random() * dates.length)]);
      // 데이트 상호작용이 시작됐으면 소환 연인은 그 방에서 퇴장한다.
      // 1~3단계의 선물 요구/전달 및 실제 동행 연인(loverMate)은 변경하지 않는다.
      obj.consumed = true;
      nearbyIdx = -1;
      updatePopup();
      return;
    }
    const goal = LOVE_GOALS[st];
    if(!goal) return;
    if(!state.carry || state.carry.key !== goal.key){
      showToast("😻 연인이 기대하는 눈빛으로 바라본다… (원하는 것: " + goal.icon + " " + goal.name + ")");
      return;
    }
    const before = snapStats();
    state.carry = null;
    state.loveStage = st + 1;
    applyEffToState({fun:+14, risk:-4});
    showDeltas(before);
    pushHistory({kind:"choice", flavor:{title:"연인에게 선물 · " + goal.name}, opt:{label:goal.icon + " " + goal.name + "을(를) 건넸다", sub:LOVE_HEARTS[st] + " → " + LOVE_HEARTS[st+1]}}, before);
    sfx("love");
    setCatMood("😻", 3000);
    showToast(goal.giftMsg + "  " + LOVE_HEARTS[st] + "→" + LOVE_HEARTS[st+1]);
    bumpDay();
    passiveDecay(before);
    obj.consumed = true;                         // 연인은 다정한 인사를 남기고 떠난다 (자리는 비워 둔다)
    if(state.loveStage >= 4){
      state.lovebirds = true;
      loverMate.x = obj.x; loverMate.y = obj.y; loverMate.ready = true; loverMate.t = 0;   // 연인이 있던 자리에서 출발
      holdEvents(1000);
      runWhenIdle(()=> playCutscene({ panels: CUT.lovebirds }));
      runWhenIdle(()=> showToast("😻 이제 연인이 곁을 졸졸 따라다닌다"));
    }
    renderAll();
    checkForcedAction();
  }

  /* ================= 사냥 미니게임: 도망치는 사냥감을 클릭해 발톱으로 공격 ================= */
  // 받침에 맞는 조사 (을/를)
  function eulreul(w){ const c = w.charCodeAt(w.length - 1) - 0xAC00; return (c >= 0 && c < 11172 && c % 28 !== 0) ? "을" : "를"; }
  const HUNT_CFG = {
    bug:  { name:"벌레", hits:3, miss:0, speed:170, r:38, dart:[60,140],  pause:[0.3,0.8],   flee:false, rule:"느려요 · 3번 공격하면 잡아요" },
    bird: { name:"참새", hits:3, miss:2, speed:430, r:46, dart:[140,260], pause:[0.12,0.3],  flee:true,  rule:"빨라요 · 3번 공격해야 잡는데, 빗나감 2번이면 날아가 버려요" },
  };
  // 서열이 오를수록(냥아치 → 동네 대장 → 왕) 사냥이 쉬워진다: 필요한 공격 횟수↓ · 새는 느려짐 · 빗나감 허용↑ · 판정 범위↑
  const HUNT_RANK = {
    bug:  { hits:[3,3,2,1], speed:[1,1,1,1],       miss:[0,0,0,0], r:[1,1.1,1.2,1.35] },
    bird: { hits:[3,3,2,1], speed:[1,.9,.75,.6],   miss:[2,2,3,4], r:[1,1.1,1.2,1.35] },
  };
  const HUNT_TAGS = ["", "\uD83D\uDE3E 냥아치의 발톱", "\uD83D\uDE3C 동네 대장의 발톱", "\uD83D\uDC51 왕의 발톱"];
  function huntCfgFor(key){
    const base = HUNT_CFG[key], t = HUNT_RANK[key], k = Math.max(0, Math.min(3, state.turfRank || 0));
    const cfg = Object.assign({}, base, {
      hits:t.hits[k], miss:t.miss[k], r:Math.round(base.r * t.r[k]),
      speed:base.speed * t.speed[k], dart:base.dart.map(v=> v * t.speed[k]),
    });
    cfg.rule = key === "bug"
      ? "느려요 · " + cfg.hits + "번 공격하면 잡아요"
      : "빨라요 · " + cfg.hits + "번 공격해야 잡는데, 빗나감 " + cfg.miss + "번이면 날아가 버려요";
    if(k > 0) cfg.rule = HUNT_TAGS[k] + ": " + cfg.rule + (cfg.hits === 1 ? " (한 방에 잡는다!)" : (k >= 2 && key === "bird" ? " (새가 느리게 보인다)" : ""));
    return cfg;
  }
  const huntOverlay = document.getElementById("hunt-overlay");
  const huntField = document.getElementById("hunt-field");
  const huntPrey = document.getElementById("hunt-prey");
  function startHunt(item, done){
    sfx("huntStart");
    const cfg = huntCfgFor(item.key);
    state.minigame = true;
    Object.keys(keysDown).forEach(k=> keysDown[k] = false);
    document.getElementById("hunt-title").textContent = item.icon + " " + cfg.name + " 사냥!";
    document.getElementById("hunt-sub").textContent = cfg.name + ": " + cfg.rule;
    if(window.showEventTutorialOnce){
      const isBird = item.key === "bird";
      window.showEventTutorialOnce("hunt-" + item.key,
        isBird ? "🐦 참새 사냥 방법" : "🦗 벌레 사냥 방법",
        isBird
          ? "참새를 3번 맞히면 성공! 2번 놓치면 날아가요."
          : "벌레를 3번 맞히면 성공! 천천히 움직이니 침착하게.");
    }
    document.getElementById("hunt-prey-ic").textContent = item.icon;
    huntField.style.background = ROOM_BG[state.currentLoc] || "#EDEAFB";
    huntField.querySelectorAll(".claw").forEach(c=> c.remove());
    const pips = document.getElementById("hunt-pips");
    const W = huntField.clientWidth, H = huntField.clientHeight, M = 34;
    const prey = { x:W*(0.3+Math.random()*0.4), y:H*(0.3+Math.random()*0.4), tx:0, ty:0, wait:0.6, dir:1 };
    const ptr = { x:-999, y:-999 };
    let hits = 0, misses = 0, over = false, last = performance.now(), raf = null;
    const rnd = (a,b)=> a + Math.random()*(b-a);
    const clampPt = (v,lo,hi)=> Math.max(lo, Math.min(hi, v));
    function drawPips(){
      pips.innerHTML = Array.from({length:cfg.hits}, (_,i)=> `<span class="${i < hits ? "" : "off"}">🐾</span>`).join("") +
        (cfg.miss ? Array.from({length:cfg.miss}, (_,i)=> `<span class="miss${i < misses ? "" : " off"}">❌</span>`).join("") : "");
    }
    function aim(awayFrom){
      let ang = Math.random()*Math.PI*2;
      if(awayFrom) ang = Math.atan2(prey.y - awayFrom.y, prey.x - awayFrom.x) + rnd(-0.7,0.7);
      const d = rnd(cfg.dart[0], cfg.dart[1]);
      prey.tx = clampPt(prey.x + Math.cos(ang)*d, M, W-M);
      prey.ty = clampPt(prey.y + Math.sin(ang)*d, M, H-M);
    }
    function claw(x,y,miss){
      sfx(miss ? "miss" : "hit");
      const c = document.createElement("div");
      c.className = "claw" + (miss ? " miss" : ""); c.style.left = x + "px"; c.style.top = y + "px";
      c.innerHTML = '<i style="--i:0"></i><i style="--i:1"></i><i style="--i:2"></i>';
      huntField.appendChild(c); setTimeout(()=> c.remove(), 520);
    }
    function local(e){
      const rc = huntField.getBoundingClientRect(), k = (rc.width / huntField.clientWidth) || 1;
      return { x:(e.clientX - rc.left)/k, y:(e.clientY - rc.top)/k };
    }
    function finish(ok){
      over = true; cancelAnimationFrame(raf);
      setTimeout(()=> sfx(ok ? "catch" : "fail"), 120);
      huntField.onpointerdown = null; huntField.onpointermove = null;
      document.getElementById("hunt-sub").textContent = ok ? "🐾 잡았다!" : "💨 놓쳐 버렸다…";
      if(ok) document.getElementById("hunt-prey-ic").textContent = "✨";
      setTimeout(()=>{
        huntOverlay.classList.remove("show"); setBackgroundInteractive(true);
        state.minigame = false; done(ok);
      }, 800);
    }
    huntField.onpointermove = e=>{ const p = local(e); ptr.x = p.x; ptr.y = p.y; };
    huntField.onpointerdown = e=>{
      if(over) return; e.preventDefault();
      const p = local(e); ptr.x = p.x; ptr.y = p.y;
      const hit = Math.hypot(p.x - prey.x, p.y - prey.y) < cfg.r;
      claw(p.x, p.y, !hit);
      if(!hit){
        if(cfg.miss){ misses++; drawPips(); if(misses >= cfg.miss){ finish(false); } }
        return;
      }
      hits++; drawPips();
      huntPrey.classList.remove("hit"); void huntPrey.offsetWidth; huntPrey.classList.add("hit");
      huntField.classList.remove("shake"); void huntField.offsetWidth; huntField.classList.add("shake");
      if(hits >= cfg.hits){ finish(true); return; }
      prey.wait = 0; aim(p);                    // 맞으면 놀라서 달아난다
      if(state.beeCat && Math.random() < BEE_CFG.poison){   // 🐝 꿀벌냥이: 마비독 — 사냥감이 잠깐 얼어붙는다
        prey.para = BEE_CFG.paraSec; huntPrey.classList.add("para"); sfx("good");
        const tag = document.createElement("div"); tag.className = "para-tag"; tag.textContent = "💚 마비독!"; tag.style.left = prey.x + "px"; tag.style.top = prey.y + "px";
        huntField.appendChild(tag); setTimeout(()=> tag.remove(), 1000);
      }
    };
    function frame(now){
      if(over) return;
      if(window.__catroadTutorialPaused){
        // 튜토리얼을 읽는 시간은 사냥 시간에 포함하지 않는다.
        last = now;
        raf = requestAnimationFrame(frame);
        return;
      }
      const dt = Math.min(0.05, (now - last)/1000); last = now;
      if(prey.para > 0){ prey.para -= dt; if(prey.para <= 0) huntPrey.classList.remove("para"); raf = requestAnimationFrame(frame); return; }   // 마비 중
      if(prey.wait > 0){
        prey.wait -= dt;
        if(cfg.flee && Math.hypot(ptr.x - prey.x, ptr.y - prey.y) < 120){ prey.wait = 0; aim(ptr); }   // 참새는 커서가 다가오면 날아간다
        if(prey.wait <= 0 && !(prey.tx || prey.ty) ) aim();
        if(prey.wait <= 0) aim(cfg.flee && Math.hypot(ptr.x - prey.x, ptr.y - prey.y) < 150 ? ptr : null);
      } else {
        const dx = prey.tx - prey.x, dy = prey.ty - prey.y, d = Math.hypot(dx, dy);
        const step = cfg.speed * dt;
        if(d <= step){ prey.x = prey.tx; prey.y = prey.ty; prey.wait = rnd(cfg.pause[0], cfg.pause[1]); }
        else { prey.x += dx/d*step; prey.y += dy/d*step; if(Math.abs(dx) > 4) prey.dir = dx > 0 ? -1 : 1; }
      }
      huntPrey.style.left = prey.x + "px"; huntPrey.style.top = prey.y + "px";
      huntPrey.firstElementChild.style.transform = "scaleX(" + prey.dir + ")";
      raf = requestAnimationFrame(frame);
    }
    drawPips();
    huntPrey.classList.remove("hit", "para");
    huntPrey.style.left = prey.x + "px"; huntPrey.style.top = prey.y + "px";
    huntOverlay.classList.add("show"); setBackgroundInteractive(false);
    raf = requestAnimationFrame(frame);
  }

  /* ================= 냥스킬: 비밀 틈에서 얻는 랜덤 스킬 (아이작 스타일) =================
     패시브(판 내내 유지) 3종 · 액티브(1·2·3 키 / 화면 버튼, 횟수제) 5종.
     비밀 틈은 아주 가끔 방 안에 나타난다. 위험한 곳을 다닐수록, 모험가일수록 더 자주 보인다. */
  const MAX_ACTIVE = 3;
  const SECRET_CFG = { chance:0.30, minDay:2, cooldownRooms:4, maxPerRun:6 };   // 틈이 나타날 확률 · 최소 일차 · 발견 뒤 쉬는 방 수 · 한 판 최대 횟수
  const SECRET_ITEM = { key:"secret", icon:"🧱", label:"수상한 틈", tier:"special", msg:"" };
  const SKILLS = {
    cheetah: { type:"passive", icon:"🐆", name:"치타의 다리", tag:"패시브 · 회피",
      desc:"다리가 엄청 빨라진다. 덫은 밟기 전에 훌쩍 뛰어넘고, 쫓아오는 것들과의 거리도 쭉쭉 벌어진다." },
    tumbler: { type:"passive", icon:"🪆", name:"오뚝이의 꼬리", tag:"패시브 · 회피",
      desc:"꼬리로 중심을 잡는다. 붙잡혀도 피해가 절반이고, 놀라서 선물을 떨어뜨리지도 않는다. 덫에 걸려도 덜 느려진다." },
    whisker: { type:"passive", icon:"📡", name:"수염 센서", tag:"패시브 · 탐지",
      desc:"수염이 위험을 먼저 느낀다. 위험한 것 둘레에 붉은 경고가 뜨고, 정체불명의 물건도 정체가 보인다." },
    roar:    { type:"active", icon:"🐅", name:"호랑이의 울음", tag:"액티브 · 퇴치", uses:2,
      desc:"으르렁! 방 안의 개와 사람이 전부 깜짝 놀라 도망간다." },
    hiss:    { type:"active", icon:"😾", name:"하악질", tag:"액티브 · 퇴치", uses:3,
      desc:"가장 가까이 온 개나 사람에게 하악! 놀라서 물러난다." },
    box:     { type:"active", icon:"📦", name:"박스 은신", tag:"액티브 · 회피", uses:2,
      desc:"박스를 뒤집어쓰고 6초간 숨는다. 쫓아오던 것들이 고양이를 못 찾는다. 숨는 동안은 움직임이 느리다." },
    bouquet: { type:"active", icon:"💐", name:"꽃다발", tag:"액티브 · 유인", uses:2,
      desc:"꽃다발을 멀리 놓아 벌을 유인한다. 벌들이 꽃다발로 날아가 버린다." },
    catnip:  { type:"active", icon:"🌿", name:"캣닙", tag:"액티브 · 서열 싸움", uses:2,
      desc:"서열 싸움(눈치 싸움) 중에 먹는다. 환각에 빠진 상대는 거짓 몸짓을 하지 못한다." },
  };
  const SKILL_SAVE_KEY = "catroad_skills_v1";
  const gotSkills = new Set();
  try{ JSON.parse(localStorage.getItem(SKILL_SAVE_KEY) || "[]").forEach(k=>{ if(SKILLS[k]) gotSkills.add(k); }); }catch(err){}
  function saveSkills(){ try{ localStorage.setItem(SKILL_SAVE_KEY, JSON.stringify([...gotSkills])); }catch(err){} }

  function hasSkill(k){ return !!(state && state.skills && state.skills.passives.indexOf(k) >= 0); }
  function hiding(){ return !!(state && state.hiddenUntil && performance.now() < state.hiddenUntil); }
  function speedMul(){ return (hasSkill("cheetah") ? 1.3 : 1) * (hiding() ? 0.55 : 1); }
  // 치타의 다리: 덫을 밟지 않고 뛰어넘는다 (true면 덫 효과를 건너뛴다)
  function cheetahJump(o){
    if(!hasSkill("cheetah")) return false;
    if(!o.trapStepped){ o.trapStepped = true; sfx("dodge"); addRing(player.x, player.y, 80, "#FFA726", 520, "휙!"); catSay("가뿐히 넘었다!"); }
    return true;
  }

  /* ---------- 이미지 에셋: 파일이 들어오면 여기에 data URI나 경로를 넣으면 이모지 대신 쓴다 ---------- */
  const ASSET_IMG = {
    player_idle:__IMG.PLAYER_IDLE,
    player_walk1:__IMG.PLAYER_WALK1,
    player_walk2:__IMG.PLAYER_WALK2,
    player_walk3:__IMG.PLAYER_WALK3,
    player_walk4:__IMG.PLAYER_WALK4,

    bee_arena: __IMG.ASSET_IMG_bee_arena,
    road_crossing: __IMG.ASSET_IMG_road_crossing,
    secret_room: __IMG.ASSET_IMG_secret_room,
    jackpot_room: __IMG.ASSET_IMG_jackpot_room,
    stone_pedestal: __IMG.ASSET_IMG_stone_pedestal,
    duel_normal: __IMG.ASSET_IMG_duel_normal,
    duel_boss: __IMG.ASSET_IMG_duel_boss,
    sprite_owner:__IMG.ASSET_IMG_sprite_owner,
    skill_tumbler:__IMG.ASSET_IMG_skill_tumbler,
    skill_box:__IMG.ASSET_IMG_skill_box,
    skill_catnip:__IMG.ASSET_IMG_skill_catnip,
    skill_cheetah:__IMG.ASSET_IMG_skill_cheetah,
    skill_whisker:__IMG.ASSET_IMG_skill_whisker,
    skill_roar:__IMG.ASSET_IMG_skill_roar,
    skill_hiss:__IMG.ASSET_IMG_skill_hiss,
    skill_bouquet:__IMG.ASSET_IMG_skill_bouquet,
    obj_crack:__IMG.ASSET_IMG_obj_crack,
    sprite_boxcat:__IMG.ASSET_IMG_sprite_boxcat,
    sprite_hidebox:"assets/sprite_hidebox.webp",
    cut_secret_1:__IMG.ASSET_IMG_cut_secret_1,
    cut_secret_2:__IMG.ASSET_IMG_cut_secret_2,
    card_back:__IMG.ASSET_IMG_card_back,
    sprite_car_blue:__IMG.ASSET_IMG_sprite_car_blue,
    sprite_car_red:__IMG.ASSET_IMG_sprite_car_red,
    sprite_rival:__IMG.ASSET_IMG_sprite_rival,
    sprite_boss:__IMG.ASSET_IMG_sprite_boss,
    sprite_leader:__IMG.BOSS_DUEL_SPRITES_70,
    sprite_follower_a:__IMG.DUEL_SPRITES_65,
    sprite_follower_b:__IMG.DUEL_SPRITES_66,
    sprite_follower_c:__IMG.DUEL_SPRITES_67,
  };
  const _assetCache = {};
  function assetImg(name){
    const src = ASSET_IMG[name]; if(!src) return null;
    let im = _assetCache[name];
    if(!im){ im = new Image(); im.src = src; _assetCache[name] = im; }
    return (im.complete && im.naturalWidth) ? im : null;
  }
  assetImg("sprite_hidebox"); // 첫 은신 전에 그림 미리 로딩
  function skIcon(key, cls){
    const sk = SKILLS[key];
    if(ASSET_IMG["skill_" + key]) return `<img class="sk-ico ${cls || ""}" src="${ASSET_IMG["skill_" + key]}" alt="${sk.name}" draggable="false">`;
    return `<span class="sk-emo ${cls || ""}">${sk.icon}</span>`;
  }
  function drawSkillIcon(ctx, key, x, y, size){
    const im = assetImg("skill_" + key);
    if(im){ ctx.drawImage(im, x - size/2, y - size/2, size, size); return; }
    ctx.font = size + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    emoDraw(ctx, SKILLS[key].icon, x, y);
  }

  /* ---------- 화면 전체 이펙트 엔진: 파티클 · 번쩍임 · 흔들림 (뽑기, 스킬, 캣닙 가루에서 함께 쓴다) ---------- */
  const FX = (function(){
    const REDUCE = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    let cv = null, cx = null, parts = [], raf = 0, last = 0, dpr = 1;
    function size(){ dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr); }
    function ensure(){
      if(cv) return;
      cv = document.createElement("canvas");
      cv.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:9000";
      document.body.appendChild(cv); cx = cv.getContext("2d"); size(); window.addEventListener("resize", size);
    }
    function drawOne(p, k){
      const a = (p.fade === false ? 1 : Math.max(0, 1 - k*k)) * (p.alpha == null ? 1 : p.alpha);
      if(a <= 0.01) return;
      cx.save(); cx.globalAlpha = a; cx.translate(p.x, p.y); cx.rotate(p.rot); cx.fillStyle = p.color;
      if(p.add) cx.globalCompositeOperation = "lighter";
      const r = p.size;
      if(p.shape === "star"){
        cx.beginPath(); const R = r*1.4, q = r*.32;
        for(let i = 0; i < 8; i++){ const ang = i*Math.PI/4, rad = i % 2 ? q : R; cx.lineTo(Math.cos(ang)*rad, Math.sin(ang)*rad); }
        cx.closePath(); cx.fill();
      } else if(p.shape === "circle"){
        cx.beginPath(); cx.arc(0, 0, r, 0, Math.PI*2); cx.fill();
      } else if(p.shape === "puff"){
        cx.globalAlpha = a * 0.55; cx.beginPath(); cx.arc(0, 0, r*(1 + k*1.8), 0, Math.PI*2); cx.fill();
      } else if(p.shape === "petal"){
        cx.beginPath(); cx.ellipse(0, 0, r*1.1, r*.55, 0, 0, Math.PI*2); cx.fill();
      } else {
        cx.fillRect(-r/2, -r/2, r, r*(p.h || 1));
      }
      cx.restore();
    }
    function loop(ts){
      const dt = Math.min(50, ts - last) || 16; last = ts;
      const f = dt / 16.67;
      cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, innerWidth, innerHeight);
      parts = parts.filter(p=>{
        p.age += dt; if(p.age >= p.life) return false;
        const dr = Math.pow(p.drag, f);
        p.vx *= dr; p.vy = p.vy*dr + p.g*f;
        p.x += p.vx*f + (p.wob ? Math.sin(p.age/190 + p.ph)*p.wob*f : 0); p.y += p.vy*f; p.rot += p.vr*f;
        drawOne(p, p.age / p.life); return true;
      });
      if(parts.length) raf = requestAnimationFrame(loop);
      else { raf = 0; cx.clearRect(0, 0, innerWidth, innerHeight); }
    }
    function add(p){
      ensure();
      parts.push(Object.assign({ x:0, y:0, vx:0, vy:0, g:0, drag:.985, life:900, age:0, size:4, rot:0, vr:0, color:"#fff", shape:"rect", wob:0, ph:Math.random()*6.28 }, p));
      if(!raf){ last = performance.now(); raf = requestAnimationFrame(loop); }
    }
    function burst(x, y, o){
      o = o || {};
      let n = o.n || 24; if(REDUCE) n = Math.max(3, Math.ceil(n*.25));
      const cols = o.colors || ["#fff"], sp = o.speed || 6;
      const a0 = o.angle == null ? 0 : o.angle, spread = o.spread == null ? Math.PI*2 : o.spread;
      for(let i = 0; i < n; i++){
        const ang = a0 + (Math.random() - .5)*spread + (o.spread == null ? 0 : 0), v = sp*(.35 + Math.random()*.85);
        add({ x:x + (Math.random() - .5)*(o.jitter || 0), y:y + (Math.random() - .5)*(o.jitter || 0), vx:Math.cos(ang)*v, vy:Math.sin(ang)*v,
          g:o.g == null ? .18 : o.g, life:(o.life || 900)*(.6 + Math.random()*.7), size:(o.size || 4)*(.6 + Math.random()*.8),
          color:cols[Math.floor(Math.random()*cols.length)], shape:o.shape || "rect", vr:(Math.random() - .5)*.4, rot:Math.random()*6.28,
          drag:o.drag || .985, wob:o.wob || 0, add:!!o.add });
      }
    }
    function shatter(rect, color){
      const cols = 6, rows = 8, w = rect.width/cols, h = rect.height/rows, cxm = rect.left + rect.width/2, cym = rect.top + rect.height/2;
      const pal = [color, "#2a1d4d", "#fff6d8", color];
      for(let i = 0; i < cols; i++) for(let j = 0; j < rows; j++){
        if(REDUCE && (i + j) % 3) continue;
        const px = rect.left + (i + .5)*w, py = rect.top + (j + .5)*h, dx = px - cxm, dy = py - cym, d = Math.hypot(dx, dy) || 1;
        add({ x:px, y:py, vx:dx/d*(3 + Math.random()*5) + (Math.random() - .5)*2, vy:dy/d*(3 + Math.random()*5) - 2 - Math.random()*2, g:.34,
          life:650 + Math.random()*350, size:w*(.5 + Math.random()*.4), h:h/w, color:pal[(i + j) % pal.length], vr:(Math.random() - .5)*.5, rot:Math.random()*6.28, drag:.99 });
      }
    }
    function powder(rect, ms){
      const cols = ["#7ddc6a", "#a8f08a", "#4fb83e", "#d6ffb0", "#9bf27c"];
      const cxm = rect.left + rect.width/2, cym = rect.top + rect.height*.45;
      burst(cxm, cym, { n:90, colors:cols, speed:5.2, g:-.015, life:2300, size:3.4, shape:"circle", drag:.972, wob:.55, add:true, jitter:30 });
      let t0 = performance.now();
      const id = setInterval(()=>{
        if(performance.now() - t0 > ms){ clearInterval(id); return; }
        for(let i = 0; i < (REDUCE ? 1 : 5); i++){
          add({ x:rect.left + Math.random()*rect.width, y:rect.top + Math.random()*rect.height*.55, vx:(Math.random() - .5)*.8, vy:.4 + Math.random()*.7,
            g:-.004, life:1700 + Math.random()*900, size:2 + Math.random()*3.2, color:cols[Math.floor(Math.random()*cols.length)], shape:"circle", wob:.5, drag:.99, add:true });
        }
      }, 70);
    }
    function flash(color, ms){
      if(REDUCE) return;
      const d = document.createElement("div");
      d.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9001;background:" + color + ";opacity:0";
      document.body.appendChild(d);
      const an = d.animate([{ opacity:.0 }, { opacity:.6, offset:.12 }, { opacity:0 }], { duration:ms || 250, easing:"ease-out" });
      an.onfinish = an.oncancel = ()=> d.remove();
    }
    function shake(el, ms, amp){
      if(REDUCE || !el || !el.animate) return;
      const fr = [], n = Math.max(4, Math.round((ms || 300)/40));
      for(let i = 0; i <= n; i++){ const k = 1 - i/n; fr.push({ transform:i === n ? "translate(0,0)" : "translate(" + ((Math.random() - .5)*2*amp*k).toFixed(1) + "px," + ((Math.random() - .5)*2*amp*k).toFixed(1) + "px)" }); }
      el.animate(fr, { duration:ms || 300, easing:"linear" });
    }
    return { burst, shatter, powder, flash, shake, REDUCE };
  })();
  const roomWrapEl = document.getElementById("room-wrap");
  function roomToScreen(x, y){
    const cvEl = document.getElementById("room-canvas"), r = cvEl.getBoundingClientRect();
    return { x:r.left + x*r.width/(roomW || r.width), y:r.top + y*r.height/(roomH || r.height) };
  }
  function puffAt(x, y, n){
    const p = roomToScreen(x, y);
    FX.burst(p.x, p.y, { n:n || 12, colors:["#f7f2ea", "#ddd5c8", "#c9c0b2"], speed:2.2, g:-.02, life:700, size:9, shape:"puff", drag:.95 });
  }

  const skillFx = { rings:[], bouquets:[] };
  const SKILL_FOUND = {   // 비밀 아지트 컷신의 마지막 장면 문구
    cheetah:"먼지 쌓인 선반 위, 바람처럼 빠른 발자국이 새겨진 낡은 방울이 놓여 있다.\n집어 드는 순간 다리가 간질간질해진다!",
    tumbler:"구석에서 오뚝이 인형이 끄덕끄덕 흔들리고 있다.\n쓰러뜨려도 오뚝, 꼬리 끝까지 중심이 잡히는 기분이다!",
    whisker:"어둠 속에서 반짝이는 은빛 수염 한 올.\n수염이 파르르 떨리더니 주변의 기척이 선명하게 느껴진다!",
    roar:"벽에 호랑이 그림이 희미하게 남아 있다.\n가만히 바라보자 배 속 깊은 곳에서 우렁찬 소리가 울린다!",
    hiss:"좁은 틈에서 누군가에게 쫓겨 나온 흔적이 보인다.\n입을 쩍 벌려 보니, 제법 위협적인 하악 소리가 난다!",
    box:"한가운데 얌전히 놓인 빈 종이박스 하나.\n들어가 보니 세상에서 제일 아늑하고, 아무도 나를 못 찾을 것 같다!",
    bouquet:"시들지 않은 꽃다발이 고이 놓여 있다.\n향기가 어찌나 좋은지, 벌들이 환장하고 달려들 것 같다!",
    catnip:"바닥에 푸릇푸릇한 풀 한 줌이 자라 있다.\n킁킁 맡았더니 눈이 핑글핑글, 세상이 몽글몽글해진다…",
  };

  /* ---------- 비밀 틈 만들기 ---------- */
  function maybeSpawnSecret(locId){
    if(!state || state.gameOver || state.fireSearch || state.homeInside || state.jackpotRoom || locId === "home") return;
    if((state.day || 1) < SECRET_CFG.minDay) return;
    if((state.secretFound || 0) >= SECRET_CFG.maxPerRun) return;
    if(state.secretCd > 0){ state.secretCd--; return; }
    let p = SECRET_CFG.chance;
    if(state.adventurous) p *= 1.8;                                    // 모험을 즐기는 고양이는 틈을 더 잘 찾는다
    if(state.dangerStreak > 0 || (state.risk || 0) >= 40) p *= 1.4;    // 위험한 길을 다닐수록 수상한 곳이 많다
    if(Math.random() >= p) return;
    const S = uiScale(), objs = state.roomObjects || [];
    // 위치: 벽돌담 면 위. 출입구 틈과 떨어져 있고, 고양이가 벽 앞까지 걸어가 닿을 수 있는 자리만 고른다
    const w = roomW, h = roomH, dd = 27*S, mid = dd/2, m = 22*S, dw = 84*S;
    const loc = LOC_BY_ID[locId], exits = (loc && loc.exits) || {};
    const doorAxis = n=> !exits[n] ? [] : doorPts(locId, n).map(q=> (n === "up" || n === "down") ? q.x : q.y);
    const nearDoor = (list, v)=> list.some(c=> Math.abs(c - v) < dw/2 + 34*S);
    const walls = [
      { n:"up",    len:w, door:doorAxis("up"),    wall:v=>({x:v, y:mid}),     stand:v=>({x:v, y:m}) },
      { n:"down",  len:w, door:doorAxis("down"),  wall:v=>({x:v, y:h-mid}),   stand:v=>({x:v, y:h-m}) },
      { n:"left",  len:h, door:doorAxis("left"),  wall:v=>({x:mid, y:v}),     stand:v=>({x:m, y:v}) },
      { n:"right", len:h, door:doorAxis("right"), wall:v=>({x:w-mid, y:v}),   stand:v=>({x:w-m, y:v}) },
    ];
    let D = null; try{ D = doorSet(locId); }catch(e){}
    const okSpots = [], hudNow = hudRects();
    walls.forEach(wl=>{
      for(let v = 60*S; v < wl.len - 60*S; v += 12*S){
        if(nearDoor(wl.door, v)) continue;
        const q = wl.wall(v), st = wl.stand(v);
        if(layoutFor(locId) && !(walkableAt(locId, st.x, st.y) && (!D || D.reach(st.x, st.y)))) continue;   // 그 앞까지 걸어갈 수 있어야 한다
        if(Math.min.apply(null, objs.map(o=> Math.hypot(o.x - q.x, o.y - q.y)).concat([Math.hypot(player.x - q.x, player.y - q.y)])) < 60*S) continue;
        if(hudHit(q, 30*S, hudNow)) continue;     // 미니맵·스킬 칸에 가려지는 벽 자리는 쓰지 않는다
        okSpots.push(q);
      }
    });
    if(!okSpots.length) return;
    const best = okSpots[Math.floor(Math.random() * okSpots.length)];
    objs.push({ item:SECRET_ITEM, x:best.x, y:best.y, sx:best.x, sy:best.y, consumed:false });
    setTimeout(()=>{ if(state && state.currentLoc === locId && !state.gameOver) showToast("✨ 벽 틈에서 수상한 기운이 느껴진다…"); }, 700);
  }

  /* ---------- 스킬 뽑기 · 획득 ---------- */
  function grantSkill(key){
    const sk = SKILLS[key], S = state.skills;
    gotSkills.add(key); saveSkills();
    if(sk.type === "passive"){ if(S.passives.indexOf(key) < 0) S.passives.push(key); return; }
    const ex = S.actives.find(a=> a.key === key);
    if(ex){ ex.uses += sk.uses; return; }                 // 같은 스킬을 또 얻으면 횟수가 늘어난다
    if(S.actives.length >= MAX_ACTIVE) S.actives.shift();   // 칸이 가득 차면 가장 오래된 스킬과 교체
    S.actives.push({ key:key, uses:sk.uses });
  }
  function consumeActive(key){
    const S = state.skills, i = S.actives.findIndex(a=> a.key === key);
    if(i < 0) return false;
    S.actives[i].uses--;
    if(S.actives[i].uses <= 0) S.actives.splice(i, 1);
    renderSkillHud();
    return true;
  }

  const secretOverlay = document.getElementById("secret-overlay");
  /* ---------- 비밀 아지트 뽑기: 카드 3장이 뒤집히고, 그중 1장만 고른다 ---------- */
  const RARITY = {
    common:{ label:"일반", color:"#7ec8ff", glow:"rgba(126,200,255,.9)", ray:"rgba(126,200,255,.22)", w:55 },
    rare:  { label:"레어", color:"#b07cff", glow:"rgba(176,124,255,.95)", ray:"rgba(176,124,255,.26)", w:33 },
    epic:  { label:"에픽", color:"#ffc83d", glow:"rgba(255,200,61,1)",   ray:"rgba(255,200,61,.34)",  w:12 },
  };
  const RARITY_ORDER = ["common", "rare", "epic"];
  const SKILL_RARITY = { hiss:"common", bouquet:"common", roar:"rare", box:"rare", catnip:"rare", cheetah:"epic", tumbler:"epic", whisker:"epic" };

  // 서로 다른 스킬 3장 (이미 가진 패시브는 나오지 않는다)
  function rollTrio(){
    const owned = k=> SKILLS[k].type === "passive" && state.skills.passives.indexOf(k) >= 0;
    const picked = [];
    function draw(){
      for(let tries = 0; tries < 24; tries++){
        const roll = Math.random()*100;
        const r = roll < RARITY.epic.w ? "epic" : (roll < RARITY.epic.w + RARITY.rare.w ? "rare" : "common");
        const pool = Object.keys(SKILLS).filter(k=> SKILL_RARITY[k] === r && !owned(k) && picked.indexOf(k) < 0);
        if(pool.length) return pool[Math.floor(Math.random()*pool.length)];
      }
      const any = Object.keys(SKILLS).filter(k=> !owned(k) && picked.indexOf(k) < 0);
      return any[Math.floor(Math.random()*any.length)];
    }
    while(picked.length < 3){ const k = draw(); if(!k) break; picked.push(k); }
    return picked;
  }

  let G = null;     // 진행 중인 뽑기
  function gEl(id){ return document.getElementById(id); }
  function gT(fn, ms){ if(!G) return; const id = setTimeout(()=>{ if(G) fn(); }, ms); G.timers.push(id); return id; }
  function gClear(){ if(G){ G.timers.forEach(clearTimeout); G.timers = []; } }
  function gCenter(el){ const r = el.getBoundingClientRect(); return { x:r.left + r.width/2, y:r.top + r.height/2, r:r }; }

  function openSecretRoom(idx){
    const obj = state.roomObjects[idx];
    if(!obj || obj.consumed || state.minigame || G) return;
    state.minigame = true;
    Object.keys(keysDown).forEach(k=> keysDown[k] = false);
    const picks = rollTrio();
    const p1 = { text:"벽돌 사이 좁은 틈에서 바람이 새어 나온다.\n수염이 파르르 떨린다…" };
    const p2 = { text:"몸을 납작하게 밀어 넣자,\n아무도 모르는 작은 아지트가 나타났다!" };
    if(ASSET_IMG.cut_secret_1) p1.img = ASSET_IMG.cut_secret_1; else p1.emoji = "🧱";
    if(ASSET_IMG.cut_secret_2) p2.img = ASSET_IMG.cut_secret_2; else p2.emoji = "✨";
    sfx("gachaRumble");
    playCutscene({ panels:[p1, p2], autoMs:2300 }, ()=> startGacha(obj, picks));
  }

  function startGacha(obj, picks){
    const row = gEl("gacha-row"), gacha = gEl("gacha");
    row.innerHTML = ""; row.className = "gacha-row";
    gacha.className = "gacha";
    gEl("gacha-flavor").className = "gacha-flavor"; gEl("gacha-flavor").textContent = "";
    gEl("gacha-confirm").hidden = true; gEl("gacha-leave").hidden = true;
    gEl("gacha-title").textContent = "비밀 아지트";
    gEl("gacha-sub").textContent = "받침대 위에 무언가 반짝이는 게 세 개 있다…";
    { const bg = gacha.querySelector(".gacha-bg");
      if(bg){ if(ASSET_IMG.secret_room){ bg.classList.add("img"); bg.style.setProperty("background-image", "url(" + ASSET_IMG.secret_room + ")", "important"); } else { bg.classList.remove("img"); bg.style.removeProperty("background-image"); } } }
    G = { obj:obj, picks:picks, cards:[], timers:[], phase:"reveal", sel:-1, locked:false, done:false, lockUntil:performance.now() + 450, onKey:null };
    const actives = state.skills.actives;
    picks.forEach((key, i)=>{
      const sk = SKILLS[key], rar = SKILL_RARITY[key], R = RARITY[rar];
      const have = sk.type === "active" && actives.find(a=> a.key === key);
      const full = sk.type === "active" && !have && actives.length >= MAX_ACTIVE;
      let note;
      if(sk.type === "passive") note = "가지고 있는 동안 계속 효과";
      else if(have) note = "이미 있어요 · 횟수 +" + sk.uses;
      else if(full) note = "교체: " + SKILLS[actives[0].key].name + " 대신";
      else note = key === "catnip" ? "서열 싸움 화면에서 사용" : "방에서 1·2·3 키로 사용";
      const d = document.createElement("div");
      d.className = "gcard r-" + rar; d.dataset.i = i; d.style.animationDelay = (-i*0.8) + "s";
      d.style.setProperty("--rc", R.color); d.style.setProperty("--rg", R.glow);
      d.innerHTML = '<div class="gc-inner"><div class="gc-back"><span class="gc-paw">🐾</span></div>'
        + '<div class="gc-front"><span class="gc-key">' + (i + 1) + '</span>' + (gotSkills.has(key) ? "" : '<span class="gc-new">NEW</span>')
        + '<span class="gc-rar">' + R.label + '</span><div class="gc-ico">' + skIcon(key) + '</div><h3>' + sk.name + '</h3>'
        + '<span class="gc-tag">' + sk.tag + (sk.type === "active" ? " · " + sk.uses + "회" : "") + '</span>'
        + '<p class="gc-desc">' + sk.desc + '</p><span class="gc-note">' + note + '</span></div></div>';
      if(ASSET_IMG.card_back){ const b = d.querySelector(".gc-back"); b.style.backgroundImage = "url(" + ASSET_IMG.card_back + ")"; b.querySelector(".gc-paw").style.display = "none"; }
      d.addEventListener("click", ev=>{ ev.stopPropagation(); onGachaCard(i); });
      const slot = document.createElement("div"); slot.className = "gslot"; slot.style.setProperty("--rc", R.color);
      slot.appendChild(d); const ped = document.createElement("i"); ped.className = "gped";
      ped.style.backgroundImage = "url(\"" + ASSET_IMG.stone_pedestal + "\")"; // 카드 없는 돌기둥
      slot.appendChild(ped);
      row.appendChild(slot);
      G.cards.push({ key:key, rar:rar, el:d, flipped:false });
    });
    secretOverlay.classList.add("show"); setBackgroundInteractive(false);
    sfx("pop");
    G.onKey = onGachaKey;
    window.addEventListener("keydown", G.onKey, true);
    gacha.onclick = ()=>{ if(G && G.phase === "flavor") flyChosen(); else if(G && G.phase === "reveal") revealAllNow(); };
    gEl("gacha-confirm").onclick = ev=>{ ev.stopPropagation(); if(G && G.sel >= 0) choose(G.sel); };
    gEl("gacha-leave").onclick = ev=>{ ev.stopPropagation(); leaveAll(); };
    scheduleReveal();
  }

  function scheduleReveal(){
    const ord = G.cards.map((c, i)=> i).sort((a, b)=> RARITY_ORDER.indexOf(G.cards[a].rar) - RARITY_ORDER.indexOf(G.cards[b].rar));   // 등급이 낮은 것부터 → 마지막에 가장 좋은 것
    let t = 1100;
    ord.forEach(i=>{
      const hold = { common:650, rare:1050, epic:1750 }[G.cards[i].rar];
      gT(()=> chargeCard(i), t);
      gT(()=> revealCard(i), t + hold);
      t += hold + 750;
    });
    gT(enablePick, t);
  }
  function revealAllNow(){
    if(!G || G.phase !== "reveal" || performance.now() < G.lockUntil) return;
    gClear();
    const left = G.cards.map((c, i)=> i).filter(i=> !G.cards[i].flipped)
      .sort((a, b)=> RARITY_ORDER.indexOf(G.cards[a].rar) - RARITY_ORDER.indexOf(G.cards[b].rar));
    left.forEach((i, n)=> gT(()=> revealCard(i), n*280));
    gT(enablePick, left.length*280 + 700);
  }
  function chargeCard(i){
    const c = G.cards[i]; if(!c || c.flipped) return;
    const R = RARITY[c.rar], g = gEl("gacha");
    G.cards.forEach(x=> x.el.classList.remove("focus"));
    c.el.classList.add("charge", "focus"); g.classList.add("focus", "rays-on");
    g.style.setProperty("--ray", R.ray);
    sfx("gachaCharge");
    if(c.rar === "epic"){ FX.shake(g, 900, 3); sfx("gachaRumble"); }
  }
  function revealCard(i){
    const c = G && G.cards[i]; if(!c || c.flipped) return;
    c.flipped = true;
    const R = RARITY[c.rar], g = gEl("gacha");
    c.el.classList.remove("charge"); c.el.classList.add("flipped"); if(c.el.parentElement) c.el.parentElement.classList.add("lit");
    g.style.setProperty("--ray", R.ray); g.classList.add("rays-on");
    FX.flash(R.color, c.rar === "epic" ? 460 : c.rar === "rare" ? 280 : 170);
    sfx(c.rar === "epic" ? "gachaEpic" : (c.rar === "rare" ? "gachaRare" : "gachaFlip"));
    gT(()=>{
      const ctr = gCenter(c.el);
      FX.burst(ctr.x, ctr.y, { n:c.rar === "epic" ? 110 : (c.rar === "rare" ? 56 : 24), colors:[R.color, "#ffffff", "#fff3b0"], speed:c.rar === "epic" ? 9 : 6.5, g:.12, life:1100, size:c.rar === "epic" ? 5 : 4, shape:"star", add:true });
      if(c.rar === "epic"){ FX.shake(g, 520, 10); FX.burst(ctr.x, ctr.y, { n:60, colors:["#ff6b9d", "#ffd35c", "#6be0ff", "#9d7bff", "#7dffb0"], speed:11, g:.2, life:1500, size:4 }); }
      else if(c.rar === "rare") FX.shake(g, 260, 4);
    }, 260);
    gT(()=>{ G.cards.forEach(x=> x.el.classList.remove("focus")); gEl("gacha").classList.remove("focus"); c.el.classList.remove("focus"); }, 650);
    if(G.cards.every(x=> x.flipped)) gT(enablePick, c.rar === "epic" ? 1100 : 750);
  }
  function enablePick(){
    if(!G || G.phase !== "reveal") return;
    gClear(); G.cards.forEach(c=>{ if(!c.flipped) revealCard(G.cards.indexOf(c)); });
    G.phase = "pick";
    G.cards.forEach(x=> x.el.classList.remove("focus", "charge")); gEl("gacha").classList.remove("focus");
    gEl("gacha-row").classList.add("pickable");
    gEl("gacha-sub").textContent = "딱 하나만 가져갈 수 있어요! 카드를 골라요 (1·2·3)";
    gEl("gacha-leave").hidden = false;
  }
  function onGachaCard(i){
    if(!G) return;
    if(G.phase === "reveal"){ if(performance.now() >= G.lockUntil) { chargeCard(i); gT(()=> revealCard(i), 380); } return; }
    if(G.phase !== "pick" || G.locked) return;
    if(G.sel === i){ choose(i); return; }      // 고른 카드를 한 번 더 누르면 확정
    selectCard(i);
  }
  function selectCard(i){
    if(!G || G.phase !== "pick" || G.locked) return;
    G.sel = i;
    G.cards.forEach((c, j)=> c.el.classList.toggle("sel", j === i));
    gEl("gacha-row").classList.add("hassel");
    const cf = gEl("gacha-confirm"); cf.hidden = false; cf.textContent = "이걸로 정했다!  (" + SKILLS[G.cards[i].key].name + ")";
    gEl("gacha-sub").textContent = "정말 이 카드로 할까요? 한 번 고르면 나머지는 사라져요";
    sfx("pop");
  }

  function onGachaKey(e){
    if(!G) return;
    const k = e.key;
    if(["1", "2", "3", " ", "Enter", "ArrowLeft", "ArrowRight"].indexOf(k) < 0) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if(e.repeat || performance.now() < G.lockUntil) return;
    if(G.phase === "reveal"){ if(k === " " || k === "Enter") revealAllNow(); return; }
    if(G.phase === "flavor"){ if(k === " " || k === "Enter") flyChosen(); return; }
    if(G.phase !== "pick" || G.locked) return;
    if(k === "1" || k === "2" || k === "3"){ const i = +k - 1; if(G.cards[i]) selectCard(i); return; }
    if(k === "ArrowLeft" || k === "ArrowRight"){
      const d = k === "ArrowLeft" ? -1 : 1, n = G.cards.length;
      selectCard(G.sel < 0 ? (d > 0 ? 0 : n - 1) : (G.sel + d + n) % n); return;
    }
    if((k === " " || k === "Enter") && G.sel >= 0) choose(G.sel);
  }

  // 선택 직후: 나머지 카드는 가루로 부서져 사라지고, 고른 카드는 가운데로 올라와 빛난다
  function shatterCard(c){
    const r = c.el.getBoundingClientRect(), R = RARITY[c.rar];
    c.el.classList.remove("sel", "charge", "focus"); c.el.classList.add("shatter");
    FX.shatter(r, R.color);
    c.el.style.pointerEvents = "none";
    gT(()=>{ c.el.style.visibility = "hidden"; }, 460);
  }
  function choose(i){
    if(!G || G.phase !== "pick" || G.locked) return;
    G.locked = true; G.phase = "chosen"; G.sel = i; gClear();
    const chosen = G.cards[i], R = RARITY[chosen.rar], row = gEl("gacha-row");
    gEl("gacha-confirm").hidden = true; gEl("gacha-leave").hidden = true;
    row.classList.remove("pickable", "hassel"); row.style.pointerEvents = "none";
    sfx("gachaPick"); sfx("gachaShatter");
    FX.flash(R.color, 220);
    G.cards.forEach((c, j)=>{ if(j !== i) shatterCard(c); });
    // 고른 카드를 줄 한가운데로
    const rr = row.getBoundingClientRect(), cc = gCenter(chosen.el);
    chosen.el.style.setProperty("--dx", ((rr.left + rr.width/2) - cc.x) + "px");
    chosen.el.classList.add("picked");
    gEl("gacha-title").textContent = "✨ " + SKILLS[chosen.key].name + " ✨";
    gEl("gacha-sub").textContent = "";
    gT(()=>{ FX.burst(...(function(){ const c = gCenter(chosen.el); return [c.x, c.y]; })(), { n:50, colors:[R.color, "#fff", "#fff3b0"], speed:7, g:.1, life:1000, size:4, shape:"star", add:true }); }, 380);
    gT(()=>{
      const f = gEl("gacha-flavor"); f.textContent = SKILL_FOUND[chosen.key] || ""; f.classList.add("in");
      gEl("gacha-sub").textContent = "클릭하거나 Space를 누르면 챙겨요";
      G.phase = "flavor";
    }, 600);
    gT(flyChosen, 4200);       // 안 눌러도 알아서 챙긴다
  }
  function leaveAll(){
    if(!G || G.phase !== "pick" || G.locked) return;
    G.locked = true; G.phase = "leaving"; gClear();
    gEl("gacha-confirm").hidden = true; gEl("gacha-leave").hidden = true;
    gEl("gacha-row").classList.remove("pickable", "hassel"); gEl("gacha-row").style.pointerEvents = "none";
    sfx("gachaShatter");
    G.cards.forEach(shatterCard);
    gT(()=> gEl("gacha").classList.add("closing"), 300);
    gT(()=> finishGacha(false), 800);
  }

  // 고른 카드가 왼쪽 위 스킬 칸으로 날아가며 줄어든다
  function hudTarget(key){
    const hud = gEl("skill-hud"), base = (hud && hud.parentElement ? hud.parentElement : gEl("room-canvas")).getBoundingClientRect();
    if(key && SKILLS[key] && SKILLS[key].type === "active"){
      const idx = Math.min(2, (state && state.skills ? state.skills.actives.length : 0));
      return { x:base.left + base.width/2 + (idx - 1)*63, y:base.bottom - 37 };
    }
    return { x:base.left + 34, y:base.top + 32 };
  }
  function flyChosen(){
    if(!G || G.flying || (G.phase !== "flavor" && G.phase !== "chosen")) return;
    G.flying = true; G.phase = "flying"; gClear();
    const chosen = G.cards[G.sel], el = chosen.el, R = RARITY[chosen.rar];
    gEl("gacha").classList.add("closing");
    const from = gCenter(el), to = hudTarget(chosen.key);
    const dx = to.x - from.x, dy = to.y - from.y, sc = Math.max(.12, 38/from.r.width);
    const cur = getComputedStyle(el).transform, base = cur && cur !== "none" ? cur : "";
    sfx("whoosh");
    const anim = el.animate([
      { transform:base, opacity:1 },
      { transform:"translate(" + (dx*.35) + "px," + (dy*.35 - 70) + "px) scale(.78) rotate(-6deg) " + base, opacity:1, offset:.45 },
      { transform:"translate(" + dx + "px," + dy + "px) scale(" + sc + ") " + base, opacity:.9 },
    ], { duration:700, easing:"cubic-bezier(.5,0,.3,1)", fill:"forwards" });
    let trail = true;
    (function tick(){
      if(!trail) return;
      const c = gCenter(el);
      FX.burst(c.x, c.y, { n:3, colors:[R.color, "#fff3b0"], speed:1.2, g:.02, life:520, size:3.2, shape:"star", add:true });
      requestAnimationFrame(tick);
    })();
    const done = ()=>{ trail = false; finishGacha(true); };
    anim.onfinish = done;
    gT(done, 900);             // 안전장치: 애니메이션 이벤트가 안 와도 반드시 끝낸다
  }

  let hudPingKey = null, hudPingUntil = 0;
  function hudPing(key){
    hudPingKey = key; hudPingUntil = performance.now() + 1000;
    renderSkillHud();
    const t = document.querySelector('#skill-hud [data-k="' + key + '"], #skill-dock [data-k="' + key + '"]');
    if(t){ const r = t.getBoundingClientRect(); FX.burst(r.left + r.width/2, r.top + r.height/2, { n:36, colors:["#ffd86b", "#fff", "#ffb02e"], speed:5, g:.08, life:800, size:3.6, shape:"star", add:true }); }
    sfx("hudPing");
  }

  function finishGacha(takeIt){
    const g = G; if(!g || g.done) return;
    g.done = true; gClear();
    window.removeEventListener("keydown", g.onKey, true);
    secretOverlay.classList.remove("show"); setBackgroundInteractive(true);
    state.minigame = false;
    g.obj.consumed = true;
    if(nearbyIdx >= 0 && state.roomObjects[nearbyIdx] === g.obj) nearbyIdx = -1;
    state.secretCd = SECRET_CFG.cooldownRooms;
    state.secretFound = (state.secretFound || 0) + 1;
    const before = snapStats();
    const key = takeIt && g.sel >= 0 ? g.picks[g.sel] : null;
    if(key){
      const sk = SKILLS[key];
      grantSkill(key);
      const msg = "✨ 비밀 아지트에서 「" + sk.name + "」을(를) 얻었다!";
      showToast(msg);
      pushHistory({ kind:"item", item:{ icon:sk.icon, label:sk.name, bad:false }, msg:msg }, before);
    } else {
      showToast("🧱 아쉽지만 스킬을 두고 나왔다");
    }
    renderAll();
    if(key){ hudPing(key); showItemBanner(key); }
    G = null;
    setTimeout(()=>{ if(!G){ const row = gEl("gacha-row"); row.innerHTML = ""; row.style.pointerEvents = ""; gEl("gacha").className = "gacha"; gEl("gacha-flavor").className = "gacha-flavor"; } }, 350);
  }

  /* ---------- 스킬 HUD (방 왼쪽 위) ---------- */
  const SKILL_HINT_KEY = "catroad_skillhint_v1";
  let skillHintDone = false;
  try{ skillHintDone = localStorage.getItem(SKILL_HINT_KEY) === "1"; }catch(err){}
  function markSkillHintDone(){ if(skillHintDone) return; skillHintDone = true; try{ localStorage.setItem(SKILL_HINT_KEY, "1"); }catch(err){} renderSkillHud(); }
  function renderSkillHud(){
    const hud = document.getElementById("skill-hud"), dock = document.getElementById("skill-dock");
    if(!hud || !state || !state.skills) return;
    const S = state.skills;
    const pinged = k=> (k === hudPingKey && performance.now() < hudPingUntil) ? " ping" : "";
    let h = "";
    if(S.passives.length) h += '<div class="sk-row">' + S.passives.map(k=>
      `<span class="sk-chip${pinged(k)}" data-k="${k}" title="${SKILLS[k].name} — ${SKILLS[k].desc}">${skIcon(k)}</span>`).join("") + '</div>';
    hud.innerHTML = h;
    hud.classList.toggle("on", !!h);
    // 액티브 스킬은 하단 중앙의 1~3번 칸에 놓인다
    const hasActive = S.actives.length > 0;
    if(dock){
      if(hasActive){
        const touch = document.documentElement.classList.contains("is-touch");
        let d = "";
        if(!skillHintDone) d += '<div class="sk-dock-hint">' + (touch ? '👆 칸을 <b>눌러서</b> 스킬 발동!' : '⌨️ 숫자키 <b>1·2·3</b> 또는 🖱️ <b>클릭</b>으로 스킬 발동!') + '</div>';
        d += '<div class="sk-dock-row">';
        for(let i = 0; i < 3; i++){
          const a = S.actives[i];
          d += a
            ? `<button type="button" class="sk-slot filled${pinged(a.key)}" data-i="${i}" data-k="${a.key}" title="${SKILLS[a.key].name} — ${SKILLS[a.key].desc}"><span class="sk-no">${i + 1}</span>${skIcon(a.key)}<em>×${a.uses}</em></button>`
            : `<div class="sk-slot empty"><span class="sk-no">${i + 1}</span></div>`;
        }
        d += '</div>';
        dock.innerHTML = d;
      } else dock.innerHTML = "";
      dock.classList.toggle("on", hasActive);
      const rw = document.getElementById("room-wrap"); if(rw) rw.classList.toggle("has-dock", hasActive);
    }
    nudgeObjectsFromHud();   // 스킬 칸이 새로 생기거나 늘어나면, 그 밑에 깔린 물건을 비켜 준다
  }
  (function setupSkillHud(){
    const hud = document.getElementById("skill-hud"), dock = document.getElementById("skill-dock");
    if(!hud) return;
    if(dock){
      dock.addEventListener("pointerdown", e=> e.stopPropagation());
      dock.addEventListener("click", e=>{
        const b = e.target.closest && e.target.closest(".sk-slot.filled");
        if(b) useActiveSkill(+b.dataset.i);
      });
    }
    hud.addEventListener("pointerdown", e=> e.stopPropagation());     // 터치 이동(조이스틱)과 섞이지 않게
    hud.addEventListener("click", e=>{
      const b = e.target.closest && e.target.closest(".sk-btn");
      if(b){ useActiveSkill(+b.dataset.i); return; }
      const c = e.target.closest && e.target.closest(".sk-chip");
      if(c){ const s = SKILLS[c.dataset.k]; showToast(s.icon + " " + s.name + " — " + s.desc); }
    });
  })();

  /* ---------- 액티브 스킬 사용 ---------- */
  function chasersNear(){
    return (state.roomObjects || []).filter(o=> !o.consumed && CHASERS[o.item.key] && !(o.fleeT > 0));
  }
  function scareAway(o){ o.fleeT = 46; o.fleeMax = 46; o.scared = true; o.shake = 0; o.chaseGrace = 0; puffAt(o.x, o.y, 10); }
  function skillThrill(sk, msg, eff){
    const before = snapStats();
    applyEffToState(eff || { fun:+4, risk:-2 });
    showToast(msg);
    showDeltas(before);
    pushHistory({ kind:"item", item:{ icon:sk.icon, label:sk.name, bad:false }, msg:msg }, before);
    renderAll();
  }
  function addRing(x, y, r1, color, dur, text){
    skillFx.rings.push({ x:x, y:y, r0:14, r1:r1, t0:performance.now(), dur:dur, color:color, text:text || "" });
  }
  function useActiveSkill(i){
    if(!state || !state.skills || !roomInputAllowed()) return;
    const slot = state.skills.actives[i];
    if(!slot) return;
    const sk = SKILLS[slot.key], S = uiScale();
    let ok = false;
    if(slot.key === "hiss"){
      let best = null, bd = 220*S;
      chasersNear().forEach(o=>{ const d = Math.hypot(o.x - player.x, o.y - player.y); if(d < bd){ bd = d; best = o; } });
      if(!best){ catSay("하악질할 상대가 없어…"); return; }
      scareAway(best); addRing(player.x, player.y, 110, "#FF7043", 600, "하악!"); sfx("scared"); FX.shake(roomWrapEl, 260, 4);
      skillThrill(sk, best.item.key === "dog" ? "😾 하악! 개가 깜짝 놀라 꼬리를 말고 도망쳤다!" : "😾 하악! 들이대던 사람이 움찔하며 물러났다!");
      ok = true;
    } else if(slot.key === "roar"){
      const list = chasersNear();
      if(!list.length){ catSay("울음을 들려줄 상대가 없어…"); return; }
      list.forEach(scareAway); addRing(player.x, player.y, 460, "#E53935", 950, "어흥!!"); setTimeout(()=> addRing(player.x, player.y, 340, "#FF8A65", 800), 140); sfx("scared"); FX.shake(roomWrapEl, 560, 9); FX.flash("#ff5a4a", 240);
      skillThrill(sk, "🐅 어흥!! 쩌렁쩌렁한 울음에 " + list.length + "명이 혼비백산 도망쳤다!", { fun:+6, risk:-3 });
      ok = true;
    } else if(slot.key === "box"){
      if(hiding()){ catSay("이미 박스 안이야"); return; }
      state.hiddenUntil = performance.now() + 6000; sfx("pop"); puffAt(player.x, player.y, 16); addRing(player.x, player.y, 70, "#FFB85C", 520, "쏙!");
      { const _kn = (state.kittens||[]).filter(k=> k.mode === "follow").length;
        if(_kn){ (state.kittens||[]).forEach(k=>{ if(k.mode === "follow") puffAt(k.x, k.y, 8); }); }
        showToast(_kn ? "📦 박스를 뒤집어썼다! 새끼들도 쏙 따라 들어갔다 · 6초 동안 못 찾는다" : "📦 박스를 뒤집어썼다! 6초 동안 쫓아오는 것들이 못 찾는다"); }
      ok = true;
    } else if(slot.key === "bouquet"){
      const bees = (state.roomObjects || []).filter(o=> !o.consumed && o.item.key === "bee" && !o.lure);
      if(!bees.length){ catSay("근처에 벌이 없어"); return; }
      const w = roomW, h = roomH;
      const tx = player.x < w/2 ? w*0.82 : w*0.18, ty = player.y < h/2 ? h*0.74 : h*0.26;
      const q = nearestWalkable(state.currentLoc, tx, ty);
      const t0 = performance.now(), FLIGHT = 650;
      skillFx.bouquets.push({ x:q.x, y:q.y, fx:player.x, fy:player.y, t0:t0, flight:FLIGHT, until:t0 + FLIGHT + 5000, landed:false });
      bees.forEach(o=>{ o.lure = { x:q.x, y:q.y }; o.lureAt = t0 + FLIGHT; });
      sfx("whoosh");
      showToast("💐 꽃다발을 멀리 던졌다! 벌들이 그쪽으로 날아간다");
      ok = true;
    } else if(slot.key === "catnip"){
      catSay("캣닙은 서열 싸움 때 먹을 수 있어");
      return;
    }
    if(ok){ markSkillHintDone(); consumeActive(slot.key); }
  }

  // 매 프레임: 도망치는 것 · 꽃다발로 끌려가는 벌 · 박스 은신 끝
  function updateSkillFx(){
    if(!state || !state.running) return;
    const S = uiScale(), w = roomW, h = roomH, now = performance.now();
    (state.roomObjects || []).forEach(o=>{
      if(o.consumed) return;
      if(o.fleeT > 0){
        const dx = o.x - player.x, dy = o.y - player.y, d = Math.hypot(dx, dy) || 1, sp = player.speed * S * 1.5;
        o.x = Math.max(10, Math.min(w - 10, o.x + dx/d*sp)); o.y = Math.max(10, Math.min(h - 10, o.y + dy/d*sp));
        o.fleeT--;
        if(o.fleeT <= 0){ o.consumed = true; o.scared = false; puffAt(o.x, o.y, 14); sfx("poof"); if(nearbyIdx >= 0 && state.roomObjects[nearbyIdx] === o) nearbyIdx = -1; }
      }
      if(o.lure && now >= (o.lureAt || 0)){
        const dx = o.lure.x - o.x, dy = o.lure.y - o.y, d = Math.hypot(dx, dy);
        if(d < 12*S){
          o.consumed = true; o.lure = null;
          if(nearbyIdx >= 0 && state.roomObjects[nearbyIdx] === o) nearbyIdx = -1;
          if(!state._bouquetToastAt || now - state._bouquetToastAt > 1500){
            state._bouquetToastAt = now;
            skillThrill(SKILLS.bouquet, "🐝 벌들이 꽃다발에 정신이 팔렸다! 쏘일 일은 없겠다", { fun:+5, risk:-2 });
          }
        } else { const sp = 3.0*S; o.x += dx/d*sp; o.y += dy/d*sp; }
      }
    });
    if(state.hiddenUntil && now >= state.hiddenUntil){
      state.hiddenUntil = 0; puffAt(player.x, player.y, 12); sfx("poof");
      (state.roomObjects || []).forEach(o=>{ if(CHASERS[o.item.key]) o.chaseGrace = 40; });
      showToast("📦 박스에서 슬그머니 빠져나왔다");
    }
  }
  function drawSkillFx(ctx, S){
    const now = performance.now();
    skillFx.rings = skillFx.rings.filter(r=> now - r.t0 < r.dur);
    skillFx.rings.forEach(r=>{
      const k = (now - r.t0) / r.dur;
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.8; ctx.strokeStyle = r.color; ctx.lineWidth = (7 - 5*k) * S;
      ctx.beginPath(); ctx.arc(r.x, r.y, (r.r0 + (r.r1 - r.r0) * k) * S, 0, Math.PI*2); ctx.stroke();
      if(r.text){
        ctx.globalAlpha = Math.min(1, (1 - k) * 1.6); ctx.fillStyle = r.color;
        ctx.font = "900 " + ((20 + 8*k) * S) + "px 'Noto Sans KR', sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 4*S; ctx.strokeText(r.text, r.x, r.y - (34 + 22*k) * S);
        ctx.fillText(r.text, r.x, r.y - (34 + 22*k) * S);
      }
      ctx.restore();
    });
    skillFx.bouquets = skillFx.bouquets.filter(b=> now < b.until);
    skillFx.bouquets.forEach(b=>{
      const k = b.flight ? Math.min(1, (now - b.t0) / b.flight) : 1;
      let x = b.x, y = b.y, rot = 0;
      if(k < 1){ x = b.fx + (b.x - b.fx)*k; y = b.fy + (b.y - b.fy)*k - Math.sin(Math.PI*k)*90*S; rot = k*Math.PI*4; }
      else if(!b.landed){
        b.landed = true; sfx("pop"); addRing(b.x, b.y, 64, "#FF80AB", 650);
        const sp = roomToScreen(b.x, b.y);
        FX.burst(sp.x, sp.y, { n:26, colors:["#ff9ec4", "#ffd1e3", "#ffe27a", "#fff"], speed:4.2, g:.09, life:1200, size:5, shape:"petal", wob:.6, drag:.97 });
      }
      ctx.save();
      ctx.globalAlpha = Math.min(1, (b.until - now) / 600);
      ctx.translate(x, y); ctx.rotate(rot);
      if(k >= 1){ ctx.shadowColor = "rgba(255,128,171,.9)"; ctx.shadowBlur = (10 + 5*Math.sin(now/160))*S; }
      drawSkillIcon(ctx, "bouquet", 0, 0, 30*S);
      ctx.restore();
    });
  }

  function renderSkillDex(){
    const box = document.getElementById("dex-skill-chips");
    if(!box) return;
    box.innerHTML = Object.keys(SKILLS).map(k=>{
      const s = SKILLS[k];
      return gotSkills.has(k)
        ? `<span class="tchip" title="${s.desc}">${ASSET_IMG["skill_" + k] ? skIcon(k) : s.icon} ${s.name}</span>`
        : `<span class="tchip q" title="비밀 아지트에서 찾을 수 있어요">❓ ？？？</span>`;
    }).join("");
    document.getElementById("dex-skill-count").textContent = "· " + gotSkills.size + " / " + Object.keys(SKILLS).length;
  }

  /* ================= 서열 싸움: 행동 예측형 배틀 ================= */
  const DUEL_SPRITES = { player: [__IMG.DUEL_SPRITES_61,
      __IMG.DUEL_SPRITES_62,
      __IMG.DUEL_SPRITES_63,
      __IMG.DUEL_SPRITES_64], opponent: [__IMG.DUEL_SPRITES_65,
      __IMG.DUEL_SPRITES_66,
      __IMG.DUEL_SPRITES_67,
      __IMG.DUEL_SPRITES_68] };

  // 네 가지 보스 포즈: 피하기 / 대기 / 하악질 / 공격.
  // 사용자가 지정한 갈색 장모 보스 시트에서 분리한 투명 스프라이트.
  const BOSS_DUEL_SPRITES = [__IMG.BOSS_DUEL_SPRITES_69,
    __IMG.BOSS_DUEL_SPRITES_70,
    __IMG.BOSS_DUEL_SPRITES_71,
    __IMG.BOSS_DUEL_SPRITES_72];

  const DUEL_MOVES = {
    growl:{ icon:"😾", name:"하악질" },
    dodge:{ icon:"💨", name:"피하기" },
    fight:{ icon:"🐾", name:"싸우기" }
  };
  // 이기는 상성: 하악질 > 피하기 > 싸우기 > 하악질
  const DUEL_BEATS = { growl:"dodge", dodge:"fight", fight:"growl" };
  const DUEL_POSE_INDEX = { dodge:0, ready:1, growl:2, fight:3 };
  const DUEL_CUES = {
    growl:["등을 둥글게 세우고 입을 벌려 하악질한다.","귀를 젖히고 이빨을 드러내며 위협한다.","꼬리를 부풀리고 날카롭게 하악거린다."],
    dodge:["몸을 낮추고 재빨리 옆으로 피할 준비를 한다.","상대의 움직임을 살피며 한 발짝 물러난다.","몸을 틀어 공격이 닿지 않는 쪽으로 피한다."],
    fight:["몸을 낮추고 앞발을 뻗을 준비를 한다.","엉덩이를 낮추고 도약할 자세를 잡는다.","바닥을 노려보며 금방이라도 달려들 듯하다."]
  };
  const DUEL_LINES = {
    win:{ growl:"날카로운 하악질에 눈싸움하던 상대가 움찔하고 물러났다!", dodge:"상대의 공격을 재빠르게 피하고 빈틈을 만들었다!", fight:"하악질하던 상대의 빈틈을 놓치지 않고 달려들어 물러서게 했다!" },
    lose:{ growl:"상대의 위협적인 기세에 눌려 눈빛이 흔들렸다…", dodge:"피하지 못하고 상대의 공격에 밀려났다…", fight:"하악질에도 겁먹지 않은 상대가 덮쳐 와 밀려났다…" }
  };
  const duelOverlay = document.getElementById("duel-overlay");
  function showDuelScreenClaw(){
    const fx = document.createElement("div");
    fx.id = "duel-screen-claw";
    fx.setAttribute("aria-hidden", "true");
    fx.innerHTML = "<i></i><i></i><i></i>";
    document.body.appendChild(fx);
    setTimeout(()=>{ if(fx.isConnected) fx.remove(); }, 820);
  }
  function startDuel(flavor, opt, done){
    // 상대 종류별 대치 컷씬: 일반 → 냥아치 → (동네대장) → 보스. 종류마다 처음 한 번만 길게 보여 준다.
    const boss=!!(opt && opt.boss);
    const title=String((flavor && flavor.title)||"");
    const kind=boss?"boss":(flavor&&flavor.encounterKind) || (/대장|두목/.test(title)?"leader":/냥아치|담장/.test(title)?"bully":"normal");
    const desc = {
      boss:"거대한 보스 고양이가 길을 막아섰다. 결전이 시작된다.",
      leader:"동네대장이 발걸음을 멈추고 날카롭게 노려본다.",
      bully:"골목의 냥아치가 다가와 시비를 걸어온다.",
      normal:"낯선 고양이가 앞을 막아선다."
    };
    state._duelSeen = state._duelSeen || {};
    const first = !state._duelSeen[kind]; state._duelSeen[kind] = true;
    const go=()=>startDuelCore(flavor,opt,done); // VS와 컷씬을 연달아 재생하지 않음
    if(first && MYO_ART.extra[kind]){
      state.minigame = true; Object.keys(keysDown).forEach(k=> keysDown[k] = false);
      playCutscene({ panels:[{ img:MYO_ART.extra[kind], text:desc[kind] }] }, go);
      return;
    }
    return go();
  }
  function startDuelCore(flavor, opt, done){
    state.minigame = true;
    Object.keys(keysDown).forEach(k=> keysDown[k] = false);
    const boss = !!opt.boss, foeName = boss ? "보스 고양이" : "낯선 고양이";
    const battleStage = document.getElementById("duel-arena");
    if(battleStage){
      battleStage.classList.add("art-scene");
      battleStage.style.backgroundImage = 'url("' + (boss ? ASSET_IMG.duel_boss : ASSET_IMG.duel_normal) + '")';
      battleStage.style.backgroundPosition = "center 54%";
      battleStage.style.backgroundSize = "cover";
    }
    // 기존 게임의 근육·약화·조공 보정과 보스전 난이도를 그대로 유지한다.
    const baseHonest = boss ? (opt.bribe ? 0.58 : 0.36) : 0.45;
    let r = baseHonest + Math.min(10, state.muscleCount||0)*0.02 + (!boss && opt.bribe ? 0.15 : 0) - (state.weakened > 0 ? 0.15 : 0);
    r = Math.max(0.34, Math.min(0.8, r));
    const NEED = boss ? (opt.bribe ? 3 : 2) : 2, LIMIT = 2;
    let me = 0, foe = 0, opp = null, busy = true;
    const el = id=> document.getElementById(id);
    const btns = [...duelOverlay.querySelectorAll(".duel-btn")];
    const playerCat = el("duel-player-cat"), foeCat = el("duel-foe-cat");
    const playerImg = el("duel-player-sprite"), foeImg = el("duel-foe-sprite");
    const setSprite = (img, side, move)=>{
      const idx = DUEL_POSE_INDEX[move] ?? 0;
      img.src = (boss && side === "opponent" ? BOSS_DUEL_SPRITES : DUEL_SPRITES[side])[idx];
      // 제공된 스프라이트는 대기 자세(idx 0)만 오른쪽을 보고,
      // 준비/하악질/돌진 자세(idx 1~3)는 왼쪽을 본다.
      // 전투 장면에서는 내 고양이는 중앙(오른쪽), 상대는 중앙(왼쪽)을 향하게 자세별 보정한다.
      const spriteFacesRight = (idx === 0);
      // 보스 전용 시트: 회피/돌진은 왼쪽을, 기본/하악질은 오른쪽을 향함.
      const needsFlip = (boss && side === "opponent")
        ? (idx === 1 || idx === 2)
        : (side === "player" ? !spriteFacesRight : spriteFacesRight);
      img.style.transform = needsFlip ? "scaleX(-1)" : "none";
    };
    const resetMotion = node=>{ node.className = node.classList.contains("player-cat") ? "duel-cat player-cat" : "duel-cat opponent-cat"; };
    const setMoveMotion = (node, move)=>{
      resetMotion(node);
      node.classList.add(move === "fight" ? "pounce" : (move === "growl" ? "growl-move" : "dodge-move"));
    };
    el("duel-title").textContent = boss ? "보스 고양이와 서열을 겨뤄보세요!" : "고양이들의 서열싸움은 가위바위보와 비슷해요!";
    el("duel-foe-name").textContent = foeName;
    el("duel-goal").textContent = NEED + "번 먼저 이기면 승리 · " + LIMIT + "번 지면 패배";
    // 행동 카드에는 기존 상단 설명의 고양이 자세 그림을 직접 표시한다.
    document.querySelectorAll("[data-duel-action]").forEach(img=>{
      const move = img.dataset.duelAction;
      img.src = DUEL_SPRITES.player[DUEL_POSE_INDEX[move]];
    });
    setSprite(playerImg,"player","ready");
    setSprite(foeImg,"opponent","ready");
    resetMotion(playerCat); resetMotion(foeCat);

    { // 캣닙: 기존 효과를 유지하며 상대의 거짓 몸짓을 없앤다.
      const cn = el("duel-catnip");
      const slotNow = ()=> state.skills.actives.find(a=> a.key === "catnip");
      const paintCn = ()=>{
        const skill = slotNow();
        if(r >= 1){ cn.hidden = false; cn.disabled = true; cn.textContent = "🌿 환각 중 · 상대가 거짓 몸짓을 못 해요"; }
        else if(skill){ cn.hidden = false; cn.disabled = false; cn.textContent = "🌿 캣닙 먹기 (남은 " + skill.uses + "회) · 거짓 몸짓 차단"; }
        else cn.hidden = true;
      };
      cn.onclick = ()=>{
        if(busy || r >= 1 || !slotNow()) return;
        consumeActive("catnip"); r = 1; sfx("pop"); sfx("powder");
        try{ FX.powder(duelOverlay.querySelector(".duel-modal").getBoundingClientRect(), 2400); FX.flash("rgba(120,220,100,.8)", 300); }catch(err){}
        if(opp){ setSprite(foeImg,"opponent",opp); }
        el("duel-foe-name").textContent = foeName + " 😵‍💫";
        el("duel-goal").textContent = NEED + "번 먼저 이기면 승리 · 🌿 상대의 몸짓이 정확해요";
        if(opp){ const lines=DUEL_CUES[opp]; el("duel-cue").innerHTML = "<b>" + foeName + "의 행동</b><br>" + lines[Math.floor(Math.random()*lines.length)] + "<small>캣닙 효과로 상대는 거짓 행동을 할 수 없어요.</small>"; }
        paintCn();
      };
      paintCn();
    }

    if(window.showEventTutorialOnce){
      window.showEventTutorialOnce(boss ? "duel-boss" : "duel-normal",
        boss ? "보스 고양이와의 서열싸움" : "서열싸움 방법",
        "상대 몸짓을 읽고 이기는 걸 골라요! " + NEED + "번 먼저 이기면 승리, " + LIMIT + "번 지면 패배예요.",
        '<div class="et-chain"><div class="et-chain-row"><span>💨 피하기</span><i>&lt;</i><span>😾 하악질</span><i>&lt;</i><span>🐾 싸우기</span></div>'
          + '</div>'
          + '<p class="et-rule">' + NEED + '번 먼저 이기면 승리, ' + LIMIT + '번 지면 패배!</p>');
    }

    function paint(){
      el("duel-me").textContent = me + "/" + NEED;
      el("duel-foe").textContent = foe + "/" + LIMIT;
      el("duel-player-fill").style.width = Math.max(0,(LIMIT-foe)/LIMIT*100) + "%";
      el("duel-foe-fill").style.width = Math.max(0,(NEED-me)/NEED*100) + "%";
    }
    function newRound(){
      const keys = Object.keys(DUEL_MOVES);
      opp = keys[Math.floor(Math.random()*3)];
      const cueMove = Math.random() < r ? opp : keys.filter(k=>k !== opp)[Math.floor(Math.random()*2)];
      setSprite(playerImg,"player","ready");
      setSprite(foeImg,"opponent",cueMove);
      resetMotion(playerCat); resetMotion(foeCat);
      el("duel-foe-name").textContent = foeName;
      const lines = DUEL_CUES[cueMove];
      el("duel-cue").innerHTML = "<b>" + foeName + "의 몸짓</b><br>" + lines[Math.floor(Math.random()*lines.length)] + "<small>…상대가 어떤 행동을 하려는 걸까?</small>";
      el("duel-reveal").textContent = "상대의 자세를 보고 다음 행동을 예측해 선택하세요.";
      btns.forEach(b=> b.disabled = false); busy = false; paint();
    }
    function pick(move){
      if(busy) return;
      busy = true; btns.forEach(b=> b.disabled = true);
      let res = "draw";
      if(move !== opp) res = (DUEL_BEATS[move] === opp) ? "win" : "lose";
      if(res === "win") me++; else if(res === "lose") foe++;
      if(res === "lose"){
        // 상대 공격/위협이 적중한 매 라운드마다 위험도(햇빛 HUD)가 오른다.
        applyEffToState({ risk: boss ? +7 : +4 });
        renderStats();
      }
      setSprite(playerImg,"player",move);
      setSprite(foeImg,"opponent",opp);
      setMoveMotion(playerCat,move); setMoveMotion(foeCat,opp);
      // 상대가 싸우기를 선택했고 내가 실제 공격에 당하면 화면 전체에 발톱 자국이 크게 지나간다.
      if(opp === "fight" && res === "lose") showDuelScreenClaw();
      if(res === "win") foeCat.classList.add("recoil");
      else if(res === "lose") playerCat.classList.add("recoil");
      else { playerCat.classList.add("draw-move"); foeCat.classList.add("draw-move"); }
      sfx(res === "win" ? "duelWin" : (res === "lose" ? "duelLose" : "duelDraw"));
      const line = res === "draw" ? "같은 행동! 두 고양이가 팽팽하게 맞선다." : (res === "win" ? DUEL_LINES.win[move] : DUEL_LINES.lose[opp]);
      el("duel-cue").innerHTML = "<b>상대의 실제 행동</b><br>" + DUEL_CUES[opp][Math.floor(Math.random()*DUEL_CUES[opp].length)];
      el("duel-reveal").innerHTML = `<div class="vs">${DUEL_MOVES[move].icon} ${DUEL_MOVES[move].name} <span style="opacity:.5">vs</span> ${DUEL_MOVES[opp].icon} ${DUEL_MOVES[opp].name}</div><div class="${res}">${line}</div>`;
      paint();
      const over = me >= NEED || foe >= LIMIT;
      setTimeout(()=>{
        if(!over){ newRound(); return; }
        const win = me >= NEED;
        el("duel-reveal").innerHTML += `<div class="${win ? "win" : "lose"}" style="margin-top:4px;font-size:15px">${win ? "🏆 서열싸움에서 이겼다!" : "😿 서열싸움에서 졌다…"}</div>`;
        setTimeout(()=>{
          duelOverlay.classList.remove("show"); setBackgroundInteractive(true);
          window.removeEventListener("keydown", onKey, true);
          state.minigame = false; done(win);
        }, 1200);
      }, over ? 950 : 1350);
    }
    function onKey(e){
      if(window.__catroadTutorialPaused) return;
      const m = { "1":"dodge", "2":"growl", "3":"fight" }[e.key];
      if(m && duelOverlay.classList.contains("show")){ e.preventDefault(); pick(m); }
    }
    btns.forEach(b=> b.onclick = ()=> pick(b.dataset.move));
    window.addEventListener("keydown", onKey, true);
    duelOverlay.classList.add("show"); setBackgroundInteractive(false);
    sfx("duelStart");
    paint(); newRound();
  }
  function resolveRoomObject(idx){
    const obj = state.roomObjects[idx];
    if(!obj || obj.consumed) return;
    const item = obj.item;
    // 쥐덫은 줍거나 미니게임을 진행하지 않는다. 상호작용으로 처음 밟아도 즉시 부상 처리한다.
    if(item.key === "trap"){
      if(!obj.trapStepped){
        obj.trapStepped = true;
        const over = registerTrapHit();
        if(!over) catSay("아야! 발이 걸렸다…");
        renderAll();
      } else {
        showToast("🪤 이미 발을 다친 쥐덫이다. 조심해서 지나가자");
      }
      return;
    }
    if(item.key === "lover"){ interactLover(obj); return; }
    if(item.key === "secret"){ openSecretRoom(idx); return; }
    if(item.key === "owner") return;
    if(item.steal){ startTheft(obj); return; }
    if(item.key === "bee"){ startBeeGame(obj); return; }
    if(item.key === "bug" && !obj._hunted && !obj._huntFail && !state.minigame && Math.random() < BEE_CFG.bugBee){   // 벌레를 잡으려다 25% 확률로 벌 떼가 나타나 고양이를 쫓아온다
      catSay("으악! 벌이다!");
      startBeeGame(obj); return;
    }
    if(HUNT_CFG[item.key] && !obj._hunted && !obj._huntFail){   // 벌레·참새는 미니게임으로 사냥한다 (결과가 나온 뒤 다시 들어올 땐 건너뜀)
      startHunt(item, ok=>{
        if(state.gameOver) return;
        const i = state.roomObjects.indexOf(obj); if(i < 0) return;
        if(ok) obj._hunted = true; else obj._huntFail = true;
        resolveRoomObject(i);
      });
      return;
    }
    obj._hunted = false;
    const before = snapStats();
    if(obj._huntFail){                               // 놓친 경우: 사냥감은 달아나고 힘만 뺐다
      obj._huntFail = false;
      state.itemsEatenSinceModal++;
      applyEffToState({hunger:-3, fun:-2});
      setCatMood("😿", 1800);
      state._lastMsg = item.icon + " " + item.label + eulreul(item.label) + " 놓쳤다. 날쌔게 도망쳐 버렸다…";
      showToast(state._lastMsg);
    } else if(!questPickup(item)){   // 연인에게 줄 선물을 물어 가는 경우엔 먹지 않는다
      applyItem(item, false);
      if(state.gameOver){ return; }
    }
    showDeltas(before);
    pushHistory({kind:"item", item, msg:state._lastMsg}, before);

    bumpDay();
    // 폐지는 먹이가 아니라 놀이 아이템이므로 획득 턴에도 배고픔 수치를 깎지 않는다.
    passiveDecay(before, { skipHunger: !!item.paperPlay });
    if(obj.stash){
      obj.consumed = true;   // 창고 먹이는 한 번 먹으면 사라진다
      state.stashLeft = Math.max(0, (state.stashLeft||1) - 1);
      if(state.stashLeft === 0){
        if(state.jackpotRoom){ setTimeout(()=> showToast("💰 잭팟 방을 싹 비웠다! 배가 빵빵하다"), 400); setTimeout(()=> leaveJackpot(), 1900); }
        else setTimeout(()=> showToast("📦 창고를 싹 비웠다! 배가 빵빵하다"), 400);
      }
    } else {
      obj.consumed = true;   // 먹은 자리는 비워 둔다 — 방을 나갔다 돌아와야 새 물건이 생긴다
    }

    renderAll();
    checkForcedAction();

    maybeOpenModal();
  }

  /* ---------- 지나온 길 기록 (아이콘 호버 = 자세히, 스크롤 = 예전 기록) ---------- */
  const STAT_NAMES = { hunger:"배고픔", fun:"재미도", affection:"애정도", risk:"위험도" };
  function diffStats(before){
    const out = [];
    ["hunger","fun","affection","risk"].forEach(k=>{
      const d = Math.round(state[k] - before[k]);
      if(d) out.push({ k, d, good: k === "risk" ? d < 0 : d > 0 });
    });
    return out;
  }
  function pushHistory(e, before){
    const loc = LOC_BY_ID[state.currentLoc];
    const h = { day:state.day, place: locDisplayIcon(loc) + " " + locDisplayName(loc), diffs: before ? diffStats(before) : [] };
    if(e.kind === "item"){
      h.icon = e.item.icon; h.title = e.item.label; h.msg = e.msg || e.item.msg || ""; h.bad = !!e.item.bad;
    } else if(e.kind === "nap"){
      h.kind = "nap"; h.icon = "\uD83D\uDCA4"; h.title = "꾸벅꾸벅 졸았다"; h.msg = e.msg || "";
    } else {
      h.kind = "choice"; h.icon = "\uD83D\uDCAC";
      h.title = (e.flavor && e.flavor.title) || "선택";
      h.msg = "선택: " + e.opt.label; h.sub = e.opt.sub || "";
    }
    state.history.push(h);
  }

  const tipEl = document.getElementById("trail-tip");
  function hideTip(){ tipEl.classList.remove("show"); }
  function showTip(h, el){
    const fx = h.diffs.map(x=> `<span class="${x.good ? "up" : "down"}">${STAT_NAMES[x.k]} ${x.d > 0 ? "+" : ""}${x.d}</span>`).join("");
    tipEl.innerHTML =
      `<div class="tt-head">${h.icon} ${h.title}</div>` +
      `<div class="tt-sub">${h.day}일차 · ${h.place}</div>` +
      (h.msg ? `<div class="tt-msg">${h.msg}</div>` : "") +
      (h.sub ? `<div class="tt-sub">${h.sub}</div>` : "") +
      (fx ? `<div class="tt-fx">${fx}</div>` : "");
    tipEl.classList.add("show");
    const r = el.getBoundingClientRect();
    const tw = tipEl.offsetWidth;
    const left = Math.max(8, Math.min(window.innerWidth - tw - 8, r.left + r.width/2 - tw/2));
    tipEl.style.left = left + "px";
    tipEl.style.top = (r.bottom + 8) + "px";
  }
  trailEl.addEventListener("wheel", ev=>{
    if(Math.abs(ev.deltaY) > Math.abs(ev.deltaX)){ trailEl.scrollLeft += ev.deltaY; ev.preventDefault(); }
    hideTip();
  }, { passive:false });
  trailEl.addEventListener("scroll", hideTip);
  document.addEventListener("click", hideTip);

  function renderTrail(){
    const list = state.history || [];
    if(trailEl.childElementCount > list.length) trailEl.innerHTML = "";
    const atEnd = trailEl.scrollLeft + trailEl.clientWidth >= trailEl.scrollWidth - 40;
    for(let i = trailEl.childElementCount; i < list.length; i++){
      const h = list[i];
      const d = document.createElement("div");
      d.className = "trail-item" + (h.kind === "choice" ? " choice" : (h.bad ? " bad" : ""));
      d.textContent = h.icon;
      d.addEventListener("pointerenter", ev=>{ if(ev.pointerType === "mouse") showTip(h, d); });
      d.addEventListener("pointerleave", ev=>{ if(ev.pointerType === "mouse") hideTip(); });
      d.addEventListener("click", ev=>{ ev.stopPropagation(); showTip(h, d); });
      trailEl.appendChild(d);
    }
    if(atEnd) trailEl.scrollLeft = trailEl.scrollWidth;
  }

  function renderAll(){
    renderSky();
    renderStats();
    renderTrail();
    renderSkillHud();
    renderTheftHud();
    bgPlayer.sync();
  }

  /* ---------- 효과음 도우미 ---------- */
  function sfx(n, a){ try{ Music.sfx(n, a); }catch(e){} }
  // 이벤트가 위험한지 안전한지: 싸움·대장 · 위험도가 오르는 선택지가 많으면 위험
  function eventMood(flavor){
    try{
      if(!flavor) return "safe";
      if(flavor.leader || flavor.danger) return "danger";
      const opts = flavor.opts || [];
      if(opts.some(o=> o.fight || o.boss)) return "danger";
      let r = 0; opts.forEach(o=>{ const e = o.eff || {}; r += (e.risk || 0) + (-Math.min(0, (e.hunger || 0))) * 0.3; });
      return (opts.length && r / opts.length >= 3) ? "danger" : "safe";
    }catch(e){ return "safe"; }
  }
  // 선택 결과: 위험도↑·배고픔↓ = 나쁨 / 능력치가 오르면 좋음
  function sfxOutcome(before){
    const d = k=> (state[k] || 0) - (before[k] || 0);
    const bad = d("risk") >= 4 || d("hunger") <= -8 || d("fun") <= -8;
    const good = d("hunger") + d("fun") + d("affection") >= 8 || d("risk") <= -4;
    sfx(bad && !good ? "bad" : (good && !bad ? "good" : "pop"));
  }
  // 알림 글귀는 대기열로 한 줄씩 차례대로 보여 준다 (앞 글이 다 읽히기 전에 다음 글이 덮어쓰지 않게)
  let toastTimer, toastBusy = false, toastShowing = "", toastShownAt = 0;
  const toastQ = [];
  const TOAST_MIN_MS = 1000;   // 새 글이 들어오면 앞 글을 최소 이만큼은 보여 준 뒤 바로 넘긴다 (빨리 움직여도 글이 밀리지 않게)
  function nextToast(){
    const msg = toastQ.shift();
    if(msg == null){ toastBusy = false; toastShowing = ""; toastEl.classList.remove("show"); return; }
    toastBusy = true; toastShowing = msg; toastShownAt = performance.now();
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    const base = Math.max(1600, Math.min(3000, 900 + msg.length * 50));       // 글이 길수록 오래 보인다
    clearTimeout(toastTimer);
    toastTimer = setTimeout(nextToast, toastQ.length >= 1 ? Math.max(TOAST_MIN_MS, Math.round(base * 0.5)) : base);   // 밀렸을 땐 빨리
  }
  function showToast(msg){
    if(msg === toastShowing || toastQ.includes(msg)) return;      // 같은 글이 이미 떠 있거나 줄 서 있으면 건너뜀
    toastQ.push(msg);
    if(toastQ.length > 2) toastQ.shift();                          // 너무 많이 밀리면 가장 오래된 것부터 버림
    if(!toastBusy){ nextToast(); return; }
    clearTimeout(toastTimer);                                      // 앞 글을 충분히 보여 줬다면 곧바로 새 글로 교체
    toastTimer = setTimeout(nextToast, Math.max(0, TOAST_MIN_MS - (performance.now() - toastShownAt)));
  }
  function clearToasts(){ toastQ.length = 0; clearTimeout(toastTimer); toastBusy = false; toastShowing = ""; toastEl.classList.remove("show"); }

  /* ================= 게임 로직 ================= */
  const TURF_TOASTS = ["🪤 골목에 덫이 늘어난 것 같다", "👀 다들 낯선 눈으로 쳐다본다", "🌫️ 골목의 분위기가 어수선하다..."];

  const SEASON_ARRIVE = { "봄":"🌸 봄이 찾아왔다", "장마":"☔ 장마가 시작됐다", "가을":"🍂 가을이 찾아왔다", "겨울":"❄️ 겨울이 찾아왔다" };
  function bumpDay(){
    const prev = getSeason(state.day).name;
    state.day++;
    state.kittenTurnCount=(state.kittenTurnCount||0)+1;
    kittenDayTick();
    // 대장냥이를 만난 뒤 매 턴 누적한다. 밥을 줬으면 10턴, 주지 않았으면 5턴마다 시비 이벤트.
    // 주기는 저장된 예전 값에 의존하지 않고 실제 선택 결과(gangApproved)로 매번 확정한다.
    if(state.metLeader && !state.gameOver && !state.endingNextTurn && state.turfRank < 3){
      if(!state.leaderChallengePending){
        const interval = state.gangApproved === true ? 10 : 5;
        state.leaderChallengeInterval = interval;
        state.leaderChallengeProgress = (state.leaderChallengeProgress || 0) + 1;
        if(state.leaderChallengeProgress >= interval){
          state.leaderChallengeProgress = 0;
          state.leaderChallengePending = true;
        }
      }
      if(state.leaderChallengePending) queueLeaderChallenge();
    }
    const now = getSeason(state.day).name;
    if(now !== prev){ setTimeout(()=>{ sfx("season"); showToast(SEASON_ARRIVE[now] || now); }, 1800); }
    if(state.endingNextTurn){            // 마지막 이벤트 뒤의 한 턴이 지났다 → 엔딩
      state.endingNextTurn = false;
      holdEvents(1500);
      runWhenIdle(beginEnding);
      return;
    }
    if(state.turfRank >= 3){ setTimeout(receiveTribute, 1100); }       // 왕이 되면 하루마다 조공이 온다
    if(state.extLeft > 0){
      state.extLeft--; state.tributeDays++;
      if(state.extLeft === 1){ setTimeout(()=>{ if(state && !state.gameOver && state.extLeft === 1) showToast("🌙 어느덧 마지막 날이 다가왔다… 한 걸음만 더 걸어 보자"); }, 2800); }   // 눈 감기 하루 전
      if(state.extLeft === 0){ holdEvents(2800); runWhenIdle(showEnding); }   // 마지막 조공까지 보고 마무리
    }
    if(!state.napping) setTimeout(maybeOldNap, 500);   // 노묘는 한 턴이 지날 때마다 졸 수 있다
  }

  /* ---------- 노묘: 몸이 무거워 가끔 한 턴을 꾸벅꾸벅 존다 ---------- */
  const OLD_NAP = { stage:4, chance:0.4, ms:2600 };   // 노년기부터 · 턴이 지날 때마다 40% · 졸고 있는 시간(ms) · 연달아 두 번은 졸지 않는다
  function maybeOldNap(){
    if(!state || state.gameOver || !state.running || state.napping) return;
    if(state.stageIdx < OLD_NAP.stage) return;
    if(state._justNapped){ state._justNapped = false; return; }        // 방금 졸았으면 이번 턴은 깨어 있는다
    if(state.endingNextTurn || state.extLeft > 0 || state.fireSearch) return;
    if(Math.random() >= OLD_NAP.chance) return;
    runWhenIdle(startOldNap);
  }
  function startOldNap(){
    if(!state || state.gameOver || !state.running || state.napping || state.stageIdx < OLD_NAP.stage) return;
    if(state.endingNextTurn || state.extLeft > 0 || state.fireSearch || state.theft || stranger) return;
    if(chasersNear().length) return;                                    // 쫓기는 중엔 졸 수 없다
    const before = snapStats();
    state.napping = true; state._justNapped = true;
    state._napT0 = performance.now();
    nearbyIdx = -1;
    setCatMood("😴", OLD_NAP.ms);
    catSay("꾸벅꾸벅…");
    bumpDay();                                                          // 졸아도 하루는 간다 (배고픔·재미도는 그대로 줄어든다)
    passiveDecay(before);
    showDeltas(before);
    pushHistory({kind:"nap", msg:"몸이 무거워 한 턴을 꾸벅꾸벅 졸며 보냈다"}, before);
    renderAll();
    setTimeout(()=>{
      if(!state) return;
      state.napping = false;
      if(!state.gameOver){ catSay("퍼뜩!"); checkForcedAction(); }
    }, OLD_NAP.ms);
  }
  function startleOffset(S){   // 깜짝 놀람: 처음 0.42초는 폴짝, 이후 1.5초까지 점점 잦아드는 떨림
    const st = state && state._startle; if(!st) return { x:0, y:0 };
    const t = performance.now() - st;
    if(t > 1500){ state._startle = 0; return { x:0, y:0 }; }
    const y = t < 420 ? -Math.sin(Math.PI*t/420) * 16*S : 0;
    const x = Math.sin(t/26) * 2.2*S * Math.max(0, 1 - t/1500);
    return { x:x, y:y };
  }
  function drawNapZzz(ctx, S){
    if(!state || !(state.napping || state._endSleep)) return;
    const t = (performance.now() - (state._napT0 || 0)) / 1000;
    ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for(let i = 0; i < 3; i++){
      const ph = ((t * 0.7 + i / 3) % 1);                               // 0→1: 머리 위로 천천히 떠오르며 사라지는 z
      ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.95;
      ctx.font = ((13 + ph * 11) * S) + "px sans-serif";
      emoDraw(ctx, i % 2 ? "💤" : "Z", player.x + (10 + ph * 16 + i * 3) * S, player.y - (22 + ph * 30) * S);
    }
    ctx.restore();
  }

  function passiveDecay(before, options){
    const season = getSeason(state.day).name;
    const hungerPenalty = (season === "장마" || season === "겨울") ? 1.6 : 1;
    // 이번 행동으로 오른 수치는 바로 깎지 않는다 (먹었는데 배고픔 바가 줄어드는 것처럼 보이던 문제)
    const hungerUp = before && state.hunger > before.hunger;
    const funUp = before && state.fun > before.fun;
    // 폐지는 놀이 아이템이다. 줍고 놀았다고 그 턴에 추가로 배고파지지 않는다.
    if(!(options && options.skipHunger) && !hungerUp) state.hunger = clamp(state.hunger - (3 + Math.random()*2.5) * hungerPenalty);
    if(!funUp) state.fun = clamp(state.fun - (2.5 + Math.random()*2.2));
    if(state.dangerStreak > 0){ state.dangerStreak = Math.max(0, state.dangerStreak - 1); }
    if(state.weakened > 0){ state.weakened = Math.max(0, state.weakened - 1); }
    if(state.gangApproved === false && state.turfRank < 3){
      state.risk = Math.max(0, Math.min(100, state.risk + 2));
      if(Math.random() < 0.22){
        setTimeout(()=> showToast(TURF_TOASTS[Math.floor(Math.random()*TURF_TOASTS.length)]), 850);
      }
    }
  }

  function registerTrapHit(){
    if(!state || state.gameOver) return true;
    state.trapHitCount = (state.trapHitCount||0) + 1;
    const before = snapStats();
    applyEffToState({ risk:+18 }); // 쥐덫 부상은 위험도에 실제로 반영
    showDeltas(before); renderStats();
    bgPlayer.hurt(0.55 + 0.05 * state.trapHitCount);
    if(state.trapHitCount < 5) showToast("🪤 쥐덫 부상 " + state.trapHitCount + "/5 · 위험도 상승");
    if(state.trapHitCount >= 5){
      state.running = false;
      state.gameOver = true;
      playCutscene({ panels: CUT.trapEnd }, ()=>{
        earlyEnding("😿🩹","덫을 밟으면 아파요ㅜㅜ","자꾸만 덫을 밟다가 다리를 크게 다치고 말았다. 더 이상 길을 걸을 수 없어, 이 고양이의 이야기는 여기서 멈춘다.", "trap_death");
      });
      return true;
    }
    return false;
  }

  function applyItem(item, skipped){
    if(skipped){
      showToast("길에 있던 " + labelFor(item) + "(을)를 지나쳤다");
      return;
    }

    let msgToShow = ((!state.adopted || (item.key === "treat" && state.currentLoc !== "home")) && item.msgUnadopted) ? item.msgUnadopted : item.msg;   // 길 위의 츄르는 집사가 챙겨준 게 아니다
    if(item.key === "feeder" && state.adopted && state.currentLoc === "home") msgToShow = "집사가 밥을 챙겨줬다";
    let twisted = false;
    if(item.bad && GAMBLE_TWISTS[item.key] && Math.random() < GAMBLE_TWISTS[item.key].chance){
      const g = GAMBLE_TWISTS[item.key].good;
      applyEffToState(g);
      msgToShow = g.msg;
      twisted = true;
    } else {
      applyEffToState(item);
    }

    {
      const harmful = item.bad && !twisted;
      const hurtish = harmful && ((item.risk || 0) >= 8 || (item.hunger || 0) <= -8);
      const snd = harmful ? (hurtish ? "hurt" : "bad") : (item.food ? "eat" : "good");
      if(item.mystery){ sfx("mystery"); setTimeout(()=> sfx(snd), 950); } else sfx(snd);
      if(!harmful){
        if(item.exercise) setCatMood("😼", 2200);                                         // 사냥·놀이 성공: 의기양양
        else if(item.food) setCatMood("😋", 2000);                                        // 맛있게 먹는 얼굴
        else if((item.fun||0) > 0 || (item.affection||0) > 0) setCatMood("😽", 1800);   // 좋은 일: 흐뭇
      }
    }
    if(item.mystery){
      showToast("❔ 정체불명의 물건을 주웠다...");
      setTimeout(()=>{ showToast(msgToShow); if(state) state._headIcon = { icon:item.icon, t0:performance.now(), dur:1700 }; }, 950);   // 정체가 밝혀지는 순간 머리 위에 아이콘을 띄운다
    } else {
      showToast(msgToShow);
    }

    state.itemsEatenSinceModal++;
    state._lastMsg = msgToShow;

    if(item.food){ state.hasEatenFood = true; foodOverMuscle(); }

    if(item.exercise){
      state.muscleCount = (state.muscleCount||0) + 1;
      setTimeout(()=> showToast(MUSCLE_LINES[Math.floor(Math.random()*MUSCLE_LINES.length)]), 900);
    }

    if(item.bad){
      if(!twisted){
        // 위험도가 큰 사건일수록 고양이가 크게 휘청인다
        bgPlayer.hurt(0.22 + Math.min(0.42, (item.risk||0) / 40));
      }
      state.dangerExposure = (state.dangerExposure||0) + 1;
      if(state.dangerExposure >= 8 && !state.adventurous){
        state.adventurous = true;
        setTimeout(()=> showToast("🧭 이제 이 고양이는 위험을 두려워하지 않는 모험가가 된 것 같다!"), 1150);
      }
      if(!twisted && BAD_FOLLOWUPS[item.key]){
        state.pendingEventChain = BAD_FOLLOWUPS[item.key];
      }
    }

    if(item.key === "feeder" && !state.adopted && Math.random() < 0.10){
      state.pendingEventChain = ADOPTION_EVENT;
      setTimeout(()=> showToast("🧑‍🍳 밥을 주던 사람이 한참 이쪽을 바라본다..."), 1300);
    }
    if(item.key === "dirty"){
      state.dangerStreak = Math.min(6, (state.dangerStreak||0) + 2);
    }
    if(item.key === "clean" && !state.adopted){
      const adoptChanceByStage = [0.5, 0.4, 0.25, 0.12, 0.05];
      if(Math.random() < adoptChanceByStage[state.stageIdx]){
        state.pendingEventChain = ADOPTION_EVENT;
      }
    }
    if(item.paperPlay){
      state._paperPlayUntil = performance.now() + 5200;
      state._paperPlaySeed = Math.random() * Math.PI * 2;
      setCatMood("😻", 5200);
      setTimeout(()=>{ if(state && state._paperPlayUntil) catSay("바스락! 팡팡!"); }, 650);
    }
    if(item.key === "cash"){
      if(state.adopted) state.cashCount = (state.cashCount||0) + 1;   // 지폐는 집사에게 물어다 줄 때만 센다 (집사가 없으면 부자냥이 씬이 나오지 않는다)
      if(state.adopted && state.cashCount >= 5 && !state.richCat){
        state.richCat = true;
        holdEvents(1100);
        runWhenIdle(()=> playCutscene({ panels: CUT.rich }));
      }
    }
  }

  const FORCED_JUNK = [
    { key:"dust_eat", icon:"🪨", label:"먼지", hunger:+2, fun:-1, affection:0, weight:0, risk:+2, forcedMsg:"바닥에 쌓인 먼지를 핥아 먹었다... 켁켁!" },
    { key:"dead_bug", icon:"🪲", label:"죽은 벌레", hunger:+3, fun:0, affection:0, weight:0, risk:+3, forcedMsg:"길바닥의 죽은 벌레를 주워 먹었다... 우웩" },
  ];
  function checkForcedAction(){
    if(state.gameOver) return;
    if(state.hunger < 15 || state.fun < 15){
      if(state.hunger < 15) state.starveCount = (state.starveCount||0) + 1;
      state.autoLock = true;
      setTimeout(()=>{
        // 참다못해 아무거나 주워먹을 땐 방에 놓인 아이템이 아니라 먼지나 죽은 벌레를 먹는다 (방 아이템은 그대로 남는다)
        const item = FORCED_JUNK[Math.floor(Math.random()*FORCED_JUNK.length)];
        showToast("\uD83D\uDE3E 고양이가 참지 못하고 " + item.forcedMsg);
        bgPlayer.hurt(item.bad ? 0.5 : 0.25);
        const before = snapStats();
        state.hunger = clamp(state.hunger + (item.hunger||0) - 4);
        state.fun = clamp(state.fun + scaleFun(item.fun||0) - 2);
        state.affection = clamp(state.affection + (item.affection||0));
        state.weight = Math.max(-20, Math.min(45, state.weight + (item.weight||0)));
        state.risk = Math.max(0, Math.min(100, state.risk + (item.risk||0) + 5));
        showDeltas(before);
        pushHistory({kind:"item", item, msg:"참지 못하고 스스로 달려갔다"}, before);
        state.itemsEatenSinceModal++;
        if(item.exercise) state.muscleCount = (state.muscleCount||0) + 1;
        if(item.food){ state.hasEatenFood = true; foodOverMuscle(); }

        bumpDay();
        state.autoLock = false;
        renderAll();
        maybeOpenModal();
      }, 700);
    }
  }

  const BAD_FOLLOWUPS = {
    can_bad: { title:"배탈 후유증", desc:"상한 캔을 먹은 후유증으로 아직도 속이 편치 않다.",
      opts:[
        {label:"물가를 찾아 물을 마신다", sub:"조금씩 나아진다", eff:{hunger:+6, fun:+4, risk:-6}},
        {label:"그냥 웅크려 버틴다", sub:"자연히 낫기를 기다린다", eff:{hunger:-8, fun:-4, risk:+2}},
      ]},
    trap: { title:"쥐덫의 여파", desc:"쥐덫에 놀란 뒤로 발걸음이 계속 조심스럽다.",
      opts:[
        {label:"몸을 낮추고 조심히 다닌다", sub:"경계 태세", eff:{fun:-6, risk:-8}},
        {label:"애써 아무렇지 않은 척한다", sub:"두려움을 떨쳐낸다", eff:{fun:+8, risk:+4}},
      ]},
    bee: { title:"퉁퉁 부은 코", desc:"벌에 쏘인 자리가 아직도 얼얼하다.",
      opts:[
        {label:"그늘에서 가만히 쉰다", sub:"천천히 가라앉힌다", eff:{fun:-5, risk:-6}},
        {label:"신경 쓰지 않고 계속 논다", sub:"괜찮은 척한다", eff:{fun:+6, risk:+3}},
      ]},
    pushy: { title:"낯선 손길의 여운", desc:"억지로 만지려던 손길이 자꾸 떠올라 경계심이 커졌다.",
      opts:[
        {label:"사람 눈에 띄지 않게 숨어 다닌다", sub:"당분간 조심한다", eff:{fun:-6, risk:-6}},
        {label:"금방 잊고 훌훌 털어낸다", sub:"씩씩하게 넘긴다", eff:{fun:+6, risk:+2}},
      ]},
    kiss: { title:"화들짝 놀란 기억", desc:"갑작스러운 손길에 놀란 기억이 계속 남아있다.",
      opts:[
        {label:"당분간 사람을 피해 다닌다", sub:"경계심 상승", eff:{fun:-6, risk:-5}},
        {label:"금방 괜찮아진다", sub:"의외로 쿨하게 넘긴다", eff:{fun:+7, risk:+2}},
      ]},
    dog: { title:"쫓기고 난 뒤", desc:"개에게 쫓긴 뒤로 다리가 후들거리고 심장이 쿵쾅거린다.",
      opts:[
        {label:"숨을 고르며 한참을 쉰다", sub:"안정을 되찾는다", eff:{hunger:-5, fun:-5, risk:-8}},
        {label:"괜히 우쭐해서 계속 돌아다닌다", sub:"짜릿함이 가시지 않는다", eff:{fun:+8, risk:+4}},
      ]},
  };

  const ADOPTION_EVENT = {
    cut: CUT.adoption,
    title:"누군가 다가온다",
    desc:"단정한 옷차림의 사람이 조심스럽게 쪼그려 앉는다.\n\u201c…나랑 같이 갈래?\u201d",
    opts:[
      { label:"손길을 받아들인다", sub:"새로운 가족이 될지도 모른다", eff:{affection:+20, risk:-20}, adopt:true },
      { label:"슬쩍 몸을 피한다", sub:"아직은 낯설다", eff:{fun:-5, risk:+2} },
    ]
  };

  function getLeaderEvent(){
    if(!state.hasEatenFood){
      return {
        title:"대장냥이의 텃세", leader:true, cut: CUT.leader,
        desc:"낯선 그림자가 앞을 가로막는다. 이 골목의 대장냥이다.\n\u201c여기서 살고 싶다면… 자격을 증명해봐.\u201d",
        opts:[
          { label:"가진 음식이 없다...", sub:"빈손으로는 어쩔 도리가 없다", eff:{fun:-6, risk:+10}, special:"reject" },
        ]
      };
    }
    return {
      title:"대장냥이의 텃세", leader:true, cut: CUT.leader,
      desc:"낯선 그림자가 앞을 가로막는다. 이 골목의 대장냥이다.\n\u201c여기서 살고 싶다면… 자격을 증명해봐.\u201d",
      opts:[
        { label:"대장냥이에게 남긴 음식을 준다", sub:"가진 음식을 나눠주며 허락을 구한다",
          eff:{ hunger:-10, risk:-16 }, special:"approve" },
        { label:"그냥 못 본 척 지나친다", sub:"신경 쓰지 않기로 한다",
          eff:{ fun:-6, risk:+10 }, special:"reject" },
      ]
    };
  }

  const TURF_FIGHT_FLAVOR = {
    title:"동네 고양이의 시비",
    desc:"낯선 고양이가 다가와 으르렁거리며 자리를 내놓으라 시비를 건다.",
    opts:[
      { label:"맞서 싸운다", sub:"서열을 걸고 눈치 싸움을 벌인다", fight:true },
      { label:"자리를 피한다", sub:"괜한 싸움은 피한다", eff:{fun:-5, risk:-3} },
    ]
  };

  const KITTEN_BIRTH_EVENT = {
    title:"작은 생명들",
    desc:"얼마 후, 처마 밑에서 작은 울음소리가 들렸다. 새끼 고양이들이 태어났다!",
    opts:[
      { label:"곁에서 돌본다", sub:"체력을 나눠준다", eff:{hunger:-10, fun:+14}, kitten:true, kittens:"litter" },
      { label:"각자의 삶을 살아간다", sub:"고양이는 원래 그런 존재다", eff:{fun:+8}, kitten:true, kittens:"litter" },
    ]
  };

  const STREET_ROMANCE_FLAVOR = {
    title:"골목에서 만난 인연",
    desc:"비 오는 처마 밑에서 낯익은 고양이와 마주쳤다. 왠지 자꾸 눈이 간다.",
    opts:[
      { label:"마음을 준다", sub:"함께 시간을 보낸다", eff:{fun:+10}, chain:KITTEN_BIRTH_EVENT, partner:true },
      { label:"거리를 둔다", sub:"아직은 혼자가 편하다", eff:{fun:-4} },
    ]
  };

  /* ---------- 연인과의 데이트 (연인이 생긴 뒤부터 등장 · seasons가 있으면 그 계절에만) ---------- */
  const DATE_FLAVORS = [
    { date:true, title:"길목 데이트",
      desc:"연인과 나란히 평범한 길목을 걷는다. 별것 없는 길인데, 이상하게 즐겁다.",
      opts:[
        {label:"나란히 느긋하게 걷는다", sub:"발맞춰 걷는 소소한 산책", eff:{fun:+12, risk:-4}},
        {label:"구석에서 서로 털을 골라준다", sub:"조용하고 포근한 시간", eff:{fun:+8, hunger:+3, risk:-6}},
      ]},
    { date:true, title:"꽃길 데이트", seasons:["봄","가을"],
      desc:"꽃이 흐드러진 길. 연인이 앞서 달려가다 돌아보며 꼬리를 흔든다.",
      opts:[
        {label:"꽃밭에서 함께 뒹군다", sub:"신나지만 벌이 있을지도 모른다", eff:{fun:+16, hunger:-3, risk:+4}},
        {label:"꽃잎을 맞으며 천천히 걷는다", sub:"느리고 다정한 시간", eff:{fun:+10, risk:-4}},
      ]},
    { date:true, title:"서로의 사냥 선물",
      desc:"연인이 사냥한 참새를 내 앞에 살포시 내려놓았다. 나도 직접 사냥해서 답례하고 싶다.",
      opts:[
        {label:"벌레를 잡아 답례한다", sub:"벌레를 직접 클릭해 3번 맞혀 잡는다", huntKey:"bug", eff:{hunger:+8, fun:+10}, failEff:{hunger:-2, fun:-4}, toast:"🐦 벌레를 선물하자 연인이 기뻐하며 먹이를 나눠 먹었다", failToast:"🦗 벌레를 놓쳤다... 연인이 아쉽다는 듯 꼬리를 흔든다"},
        {label:"참새를 사냥해 더 큰 선물을 한다", sub:"빠르게 움직이는 참새를 3번 맞혀 잡는다", huntKey:"bird", eff:{hunger:-4, fun:+16}, failEff:{hunger:-4, fun:-6}, toast:"😻 참새를 선물하자 연인이 감동해 한참을 비벼댄다", failToast:"🐦 참새가 푸드덕 날아가 버렸다... 연인이 살며시 위로해 준다"},
        {label:"받은 걸 함께 나눠 먹는다", sub:"사이좋게 반씩", eff:{hunger:+14, fun:+6}},
      ]},
    { date:true, title:"처마 밑 빗소리 데이트", seasons:["장마"],
      desc:"비가 쏟아지는 날, 처마 밑에 나란히 앉아 빗소리를 듣는다.",
      opts:[
        {label:"바싹 붙어 앉아 빗소리를 듣는다", sub:"포근하고 조용하다", eff:{fun:+10, risk:-5}},
        {label:"빗속으로 함께 뛰어든다", sub:"홀딱 젖지만 신난다", eff:{fun:+14, hunger:-5, risk:+4}},
      ]},
    { date:true, title:"낙엽길 데이트", seasons:["가을"],
      desc:"바스락거리는 낙엽길. 연인이 낙엽 더미 속으로 먼저 뛰어든다.",
      opts:[
        {label:"함께 낙엽 속을 뒹군다", sub:"바스락바스락 신난다", eff:{fun:+14, hunger:-3}},
        {label:"낙엽을 밟으며 나란히 걷는다", sub:"소리가 좋은 산책", eff:{fun:+9, risk:-4}},
      ]},
    { date:true, title:"눈 오는 날의 데이트", seasons:["겨울"],
      desc:"하얀 눈이 소복이 내린다. 연인이 눈밭에 작은 발자국을 남기며 돌아본다.",
      opts:[
        {label:"서로 몸을 붙이고 온기를 나눈다", sub:"추운 날엔 서로가 난로", eff:{fun:+10, hunger:-3, risk:-6}},
        {label:"눈밭을 함께 뛰어다닌다", sub:"신나지만 금세 배가 고파진다", eff:{fun:+16, hunger:-8, risk:+3}},
      ]},
  ];

  const NEW_KITTEN_FLAVOR = {
    title:"새 친구가 생겼다",
    desc:"집사가 조그만 새끼 고양이 한 마리를 집으로 데려왔다.\n\u201c너희 둘이 친구 하렴.\u201d",
    opts:[
      { label:"반갑게 맞이한다", sub:"곁을 내준다", eff:{affection:+10, fun:+10}, kitten:true },
      { label:"경계하며 거리를 둔다", sub:"아직 낯설다", eff:{fun:-4, risk:+2} },
    ]
  };

  const BOSS_FIGHT_FLAVOR = {
    title:"보스 고양이의 도전",
    desc:"담장 위에서 거대한 그림자가 내려온다. 이 일대를 지배해 온 보스 고양이다. \u201c내 자리를 넘보는 게 너냐.\u201d",
    opts:[
      { label:"정면으로 맞선다", sub:"2번만 이기면 승리! 대신 상대 몸짓에 거짓이 많다", fight:true, boss:true },
      { label:"몸을 풀고 맞붙는다", sub:"3번 이겨야 하지만 상대 몸짓의 거짓이 적다 (배고픔 -12)", eff:{hunger:-12}, fight:true, boss:true, bribe:true },
      { label:"물러나 힘을 기른다", sub:"오늘은 피한다", eff:{fun:-6, risk:-2} },
    ]
  };

  const PATH_CAT_FLAVORS = [
    { title:"길목의 고양이", desc:"길목에서 낯선 고양이와 눈이 마주쳤다. 꼬리가 부풀어 오른다.", opts:TURF_FIGHT_FLAVOR.opts },
    { title:"담장 위의 시비", desc:"담장 위의 고양이가 지나가는 나를 내려다보며 으르렁댄다.", opts:TURF_FIGHT_FLAVOR.opts },
    { title:"골목 모퉁이의 대치", desc:"모퉁이를 돌자마자 다른 고양이와 코끝이 닿을 뻔했다.", opts:TURF_FIGHT_FLAVOR.opts },
  ];

  function queueLeaderChallenge(){
    if(!state || !state.leaderChallengePending || state._leaderChallengeQueued) return;
    state._leaderChallengeQueued = true;
    runWhenIdle(()=>{
      if(!state) return;
      state._leaderChallengeQueued = false;
      if(!state.leaderChallengePending) return;
      if(!state.metLeader || state.gameOver || state.endingNextTurn || state.turfRank >= 3){
        state.leaderChallengePending = false;
        return;
      }
      // 컷신 직후의 짧은 이벤트 대기 시간에 한 번 놓쳐도 예약을 잃지 않고 다시 시도한다.
      if(state.fireEvent || state.autoLock || choiceOverlay.classList.contains("show") || cutsceneActive() || Date.now() < eventHoldUntil){
        const wait = Math.max(300, Date.now() < eventHoldUntil ? eventHoldUntil - Date.now() + 100 : 650);
        setTimeout(queueLeaderChallenge, wait);
        return;
      }
      maybePathEncounter();
    });
  }

  function maybePathEncounter(){
    if(!state || !state.leaderChallengePending) return;
    if(!state.metLeader || state.gameOver || state.endingNextTurn){
      state.leaderChallengePending = false;
      return;
    }
    if(state.turfRank >= 3){ state.leaderChallengePending = false; return; }
    if(state.fireEvent || state.autoLock || choiceOverlay.classList.contains("show") || cutsceneActive() || Date.now() < eventHoldUntil){
      queueLeaderChallenge();
      return;
    }
    // 대장냥이를 무시했는지, 음식을 나눴는지에 따라 정해진 턴마다 서열싸움이 발생한다.
    // 마지막 서열(동네 대장 → 왕) 도전은 반드시 보스전으로 진행한다.
    // 그래야 정면 승부 / 몸을 풀고 맞붙기 / 물러나기 선택지가 빠지지 않는다.
    const base = state.turfRank === 2
      ? BOSS_FIGHT_FLAVOR
      : PATH_CAT_FLAVORS[Math.floor(Math.random()*PATH_CAT_FLAVORS.length)];
    const context = state.gangApproved === true
      ? "대장냥이에게 먹이를 나눠줬지만, 골목의 다른 고양이가 10턴마다 서열을 확인하려 든다."
      : "대장냥이에게 밥을 주지 않은 뒤로 골목 고양이들이 만만하게 본다. 5턴마다 한 고양이가 길을 막고 서열싸움을 걸어온다.";
    const f = Object.assign({}, base, { desc:context, encounterKind:base===BOSS_FIGHT_FLAVOR?"boss": "normal" });
    state.leaderChallengePending = false;
    state._leaderChallengeQueued = false;
    Object.keys(keysDown).forEach(k=> keysDown[k] = false);
    startStrangerApproach(f);
  }

  const KITTEN_REGRET_EVENT = {
    title:"자꾸 생각나는 울음소리",
    desc:"그날 모른 척 지나친 새끼 고양이의 울음소리가 귓가에 맴돈다. 다시 가 볼까?",
    opts:[
      { label:"다시 찾아간다", sub:"아직 그 자리에 있을지도 모른다", eff:{hunger:-6, fun:+8}, kitten:true, toast:"🐾 작은 몸이 떨며 품으로 파고든다. 이번엔 놓치지 않았다" },
      { label:"마음을 접는다", sub:"고양이는 원래 그런 존재다", eff:{fun:-8} },
    ]
  };

  const FOUND_KITTEN_FLAVOR = {
    title:"상자 속 작은 울음소리",
    desc:"길가에 놓인 낡은 상자에서 가냘픈 울음소리가 들린다. 들여다보니 어미 없는 새끼 고양이가 떨고 있다.",
    opts:[
      { label:"곁에서 품어 돌본다", sub:"체온을 나눠주고 함께 지낸다", eff:{hunger:-8, fun:+14, affection:+4}, kitten:true, toast:"🐾 작은 새끼 고양이가 곁을 떠나지 않는다" },
      { label:"가진 먹이를 나눠준다", sub:"배고픈 새끼에게 먹이를 양보한다", eff:{hunger:-12, fun:+10}, kitten:true, toast:"🥫 허겁지겁 먹는 모습을 보니 마음이 놓인다" },
      { label:"모른 척 지나친다", sub:"내 앞가림도 벅차다", eff:{fun:-6}, chain:KITTEN_REGRET_EVENT },
    ]
  };

  const MODAL_FLAVORS = [
    { title:"낮잠 자리", desc:"따뜻한 담장 위와 그늘진 화단, 어디서 쉴까?",
      opts:[
        {label:"담장 위에서 볕을 쬔다", sub:"기분 좋은 낮잠, 지나가던 사람이 사진을 찍고 간다", eff:{fun:-2, affection:+4}},
        {label:"화단 그늘에 숨어든다", sub:"조용히 힘을 아낀다", eff:{hunger:+6, fun:-4}},
      ]},
    { title:"사람과의 거리", desc:"지나가던 사람이 손을 내민다.",
      opts:[
        {label:"다가가서 몸을 비빈다", sub:"애정도 상승 가능성", eff:{affection:+12, fun:+6}},
        {label:"슬쩍 거리를 둔다", sub:"경계심을 유지한다", eff:{fun:-4, risk:-3}},
      ]},
    { title:"먹이 창고 발견", desc:"음식 냄새가 나는 곳을 발견했다.",
      opts:[
        {label:"조심스럽게 살펴본다", sub:"안전하게 먹이 5개를 챙긴다. 츄르는 가끔만 있다", eff:{risk:-2}, stash:"safe"},
        {label:"일단 뛰어들어 본다", sub:"츄르 잭팟 확률 UP! 대신 사나운 개가 숨어 있을지도", eff:{risk:+6}, stash:"bold"},
      ]},
    // seasons가 있으면 그 계절에만 등장
    { title:"비 웅덩이", seasons:["장마"], desc:"장맛비가 고인 웅덩이가 길을 가로막고 있다. 건너편이 코앞인데...",
      opts:[
        {label:"첨벙첨벙 건너간다", sub:"⚠️ 위험! 온몸이 축축해져 배가 더 고파진다 (배고픔 -10)", eff:{hunger:-10, risk:+8}, toast:"💦 온몸이 흠뻑 젖었다. 으슬으슬 배가 고프다..."},
        {label:"처마 밑으로 돌아간다", sub:"안전하지만 멀리 돌아가느라 배가 고파진다 (배고픔 -15)", eff:{hunger:-15, fun:-3, risk:-2}},
      ]},
  ];

  function openChoiceModal(forced){
    if(state.gameOver || state.fireEvent) return;
    if(!forced && Date.now() < quietUntil) return;   // 우연 이벤트는 직전 이벤트 뒤 한동안 쉬었다가 (아이템 카운트는 유지돼 다음에 뜬다)
    if(bigEventBusy()){ runWhenIdle(()=> openChoiceModal(forced)); return; }   // 다른 큰 이벤트가 끝난 뒤에
    if(!forced){
      state.itemsEatenSinceModal = 0;
      state.modalTarget = 3 + Math.floor(Math.random()*3);
    }

    let flavor;
    if(forced){
      flavor = forced;
    } else if(!state.metLeader){
      flavor = getLeaderEvent();
    } else if(state.pendingEventChain){
      flavor = state.pendingEventChain;
      state.pendingEventChain = null;
    } else {
      const curSeason = getSeason(state.day).name;
      let pool = MODAL_FLAVORS.filter(f=> !f.seasons || f.seasons.includes(curSeason));
      const safeStart = state.day <= SAFE_DAYS;
      if(safeStart) pool = pool.filter(f=> !(f.opts && f.opts.some(o=> o.fight || (o.eff && o.eff.risk > 0) || o.stash === "bold")));
      if(safeStart){} else if(state.turfRank < 2){ pool.push(TURF_FIGHT_FLAVOR, TURF_FIGHT_FLAVOR, TURF_FIGHT_FLAVOR); }
      else if(state.turfRank === 2){ pool.push(BOSS_FIGHT_FLAVOR, BOSS_FIGHT_FLAVOR); }
      if(!state.hasPartner) pool.push(STREET_ROMANCE_FLAVOR);
      if(state.hasPartner){   // 연인이 있으면 지금 계절에 맞는 데이트가 2개 섞여 나온다
        const sn = getSeason(state.day).name;
        const dates = DATE_FLAVORS.filter(d=> (!d.seasons || d.seasons.includes(sn)) && d.title !== state.lastDate);
        for(let i=0; i<((state.loveStage||0) === 0 ? 3 : 2) && dates.length; i++){
          pool.push(dates.splice(Math.floor(Math.random()*dates.length), 1)[0]);
        }
      }
      if(state.adopted && !state.hasKittens) pool.push(NEW_KITTEN_FLAVOR);
      // 길에서 새끼 발견: 젊을 땐 드물고 중년기 이후 더 자주 (냥줍과 반대 곡선)
      if(!state.hasKittens && Math.random() < [0.05,0.12,0.3,0.3,0.2][state.stageIdx]) pool.push(FOUND_KITTEN_FLAVOR);
      flavor = pool[Math.floor(Math.random()*pool.length)];
    }

    // 눈치 싸움으로 이어지는 시비는, 낯선 고양이가 먼저 걸어와 마주 선 뒤에 뜬다
    if(!strangerOK && !stranger && (flavor.leader || (!flavor.cut && flavor.opts && flavor.opts.some(o=> o.fight))) && state.running && !state.fireSearch){
      startStrangerApproach(flavor); return;
    }
    strangerOK = false;

    // 특정 스토리 규칙만 처음 한 번 안내한다. 일반 선택지에는 튜토리얼을 띄우지 않는다.
    if(window.showEventTutorialOnce){
      const t = String(flavor.title || "");
      if(/보스 고양이/.test(t)){
        window.showEventTutorialOnce("story-boss", "👑 보스 고양이의 도전", "정면은 2승, 몸을 풀면 3승이 필요하고(2패하면 패배) 몸을 풀수록 상대의 거짓 몸짓이 줄어요.");
      } else if(/누군가 다가온다/.test(t)){
        window.showEventTutorialOnce("story-adoption", "🐾 낯선 발소리가 다가온다", "다가온 사람이 새 가족이 될지도 몰라요. 제안에 응할지 골라요.");
      } else if(/상자 속 작은 울음소리/.test(t)){
        window.showEventTutorialOnce("story-found-kitten", "🐾 작은 울음소리를 발견했다", "새끼를 어떻게 대하느냐에 따라 이야기가 달라져요.");
      } else if(/새 친구가 생겼다/.test(t)){
        window.showEventTutorialOnce("story-new-friend", "🐈 새로운 가족의 시작", "선택에 따라 새 가족과의 관계가 달라져요.");
      } else if(/대장/.test(t) && /영역|동네|고양이/.test(t)){
        window.showEventTutorialOnce("story-leader", "😼 동네 대장과의 만남", "가진 먹이를 보고 고르세요. 대장과의 관계가 동네 생활에 영향을 줘요.");
      }
    }
    // 인생의 분기점에는 모달 대신 레터박스 컷신으로 보여준다
    if(flavor.cut){
      sfx(eventMood(flavor) === "danger" ? "eventDanger" : "eventSafe");
      playCutscene({
        panels: flavor.cut,
        fade: (flavor.cut === CUT.adoption),      // 냥줍 컷신: 화면이 어두워졌다 밝아지며 시작
        opts: flavor.opts,
        onPick: opt => resolveChoice(flavor, opt),
        onPickStart: ()=>{ if(stranger) stranger.hidden = true; }   // 선택하는 순간 무리도 바로 사라진다
      });
      return;
    }

    choiceTitle.textContent = "🐾 " + flavor.title;
    choiceDesc.textContent = flavor.desc;
    choiceOpts.innerHTML = "";
    flavor.opts.forEach(opt=>{
      const btn = document.createElement("button");
      btn.className = "opt-btn";
      btn.innerHTML = `<b>${opt.label}</b><span>${opt.sub||""}</span>`;
      btn.addEventListener("click", ()=>{
        choiceOverlay.classList.remove("show");
        setBackgroundInteractive(true);
        resolveChoice(flavor, opt);
      });
      choiceOpts.appendChild(btn);
    });
    choiceOverlay.classList.add("show");
    setBackgroundInteractive(false);
    sfx(eventMood(flavor) === "danger" ? "eventDanger" : "eventSafe");
  }

  // 선택지 하나를 실제로 적용한다 (모달·컷신 공용)
  function resolveChoice(flavor, opt){
    if(opt.huntKey && !opt._huntResolved){
      const prey = opt.huntKey === "bird"
        ? { key:"bird", icon:"🐦", label:"참새", fun:30 }
        : { key:"bug", icon:"🦗", label:"벌레", fun:15 };
      startHunt(prey, ok=>{
        const resolved = Object.assign({}, opt, {
          _huntResolved:true,
          eff: ok ? opt.eff : (opt.failEff || {hunger:-3, fun:-3}),
          toast: ok ? opt.toast : opt.failToast
        });
        delete resolved.huntKey; delete resolved.failEff; delete resolved.failToast; delete resolved._huntResolved;
        resolveChoice(flavor, resolved);
      });
      return;
    }
    if(opt.fight && !opt._duelDone){          // 서열 싸움은 눈치 싸움으로 승패를 가린다
      if(stranger) stranger.hidden = true;
      startDuel(flavor, opt, win=> resolveChoice(flavor, Object.assign({}, opt, { _duelDone:true, _win:win })));
      return;
    }
    stranger = null;
    const after = [];   // 컷신으로 이어서 보여줄 연출
    const before = snapStats();
    state._affBlocked = false;

    if(opt.adopt){
      sfx("love");
      setCatMood("😽", 3500);
      state.adopted = true;
      after.push(CUT.adopted);
    }
    applyEffToState(opt.eff);

    if(opt.fight){
      const win = !!opt._win;
      if(win){
        const before = state.turfRank;
        state.turfRank = Math.min(3, state.turfRank + 1);
        applyEffToState({risk:-4, fun:+6});
        setCatMood("😼", 3000);
        { const _rn = TURF_RANK_NAMES[state.turfRank], _c = _rn.charCodeAt(_rn.length - 1), _jong = (_c >= 0xAC00 && _c <= 0xD7A3) ? ((_c - 0xAC00) % 28 !== 0) : false;
          state._rankSay = _rn + (_jong ? "이" : "가") + " 됐다!"; }
        sfx(state.turfRank >= 3 ? "king" : "rankUp");
        if(opt.boss && before < 3) after.push(CUT.bossWin);
        else if(state.turfRank === 1 && before < 1) after.push(CUT.rank1);
        else if(state.turfRank === 2 && before < 2) after.push(CUT.rank2);
        if(state.turfRank === 3 && before < 3) after.push(CUT.king);
      } else {
        applyEffToState({hunger:opt.boss ? -16 : -10, risk:+6});
        state.weakened = opt.boss ? 5 : 3;
        bgPlayer.hurt(0.5);
        sfx("hurt");
        catSay("으윽… 크게 밀렸다. 한동안 몸이 무겁겠다");
      }
    }

    if(opt.stash){ spawnStash(opt.stash === "bold"); }
    if(opt.chain){ state.pendingEventChain = opt.chain; }
    if(opt.partner && !state.hasPartner){
      state.hasPartner = true;
      state.loveStage = 0;
      state.carry = null;
      setTimeout(()=> showToast("💕 마음을 나눈 연인이 생겼다"), 700);
    }
    if(flavor.date){
      state.lastDate = flavor.title;
      if((state.loveStage||0) === 0){        // 첫 데이트를 마치면 하트가 한 단계 오른다
        state.loveStage = 1;
        setTimeout(()=> showToast("🩷 첫 데이트를 마쳤다! 연인과 한 걸음 가까워졌다"), 1200);
      }
    }
    if(opt.toast){ setTimeout(()=> showToast(opt.toast), 700); }
    if(opt.kitten && !state.hasKittens){
      state.hasKittens = true;
      after.push(CUT.kitten);
      const _n = opt.kittens === "litter" ? 2 + Math.floor(Math.random()*3) : (opt.kittens || 1);   // 출산이면 2~4마리, 그 밖엔 한 마리
      addKittens(_n);
      setTimeout(()=> showToast("🐾 새끼 " + _n + "마리가 졸졸 뒤를 따라온다! 위험할 땐 흩어지니 조심하자"), 2600);
    }

    if(flavor.leader){
      const firstLeaderMeeting = !state.metLeader;
      state.metLeader = true;
      if(firstLeaderMeeting){
        state.leaderChallengeInterval = opt.special === "approve" ? 10 : 5;
        state.leaderChallengeProgress = 0;
        state.leaderChallengePending = false;
      }
      if(opt.special === "approve"){
        state.gangApproved = true;
        sfx("good");
        showToast("😽 대장냥이가 만족스럽게 받아먹었다. 이 골목에서 살아도 좋다는 허락을 받았다!");
      } else {
        state.gangApproved = false;
        sfx("bad");
        showToast("😾 대장냥이가 못마땅한 눈초리로 노려본다...");
      }
    }

    showDeltas(before);
    if(!opt.fight && !opt.adopt) sfxOutcome(before);
    pushHistory({kind:"choice", flavor, opt}, before);
    if(state._affBlocked){
      state._affBlocked = false;
      setTimeout(()=> showToast("🐾 아직 곁을 내줄 집사가 없어 애정도는 오르지 않았다"), 1100);
    }
    const _rsay = state._rankSay; state._rankSay = null;
    if(after.length){                 // 선택 결과 컷신은 대기열/이벤트 간격을 거치지 않고 즉시 표시
      playCutsceneChain(after, _rsay ? ()=> setTimeout(()=> catSay(_rsay, 3200), 250) : null);
    } else if(_rsay){ setTimeout(()=> catSay(_rsay, 3200), 300); }
    advanceStageProgress();           // 화재·엔딩은 그 뒤 대기열에 쌓인다
    renderAll();
  }

  /* ---------- 화재: 안개 속 집 찾기 (돌아서 가기) ---------- */
  function distMapTo(target){
    const d = {}; d[target] = 0; const q = [target];
    while(q.length){ const c = q.shift(); Object.values(LOC_BY_ID[c].exits).forEach(n=>{ if(d[n] == null){ d[n] = d[c] + 1; q.push(n); } }); }
    return d;
  }
  const FIRE_LOST_LINES = {
    park:"🌳 공원이다. 여기는 아닌 것 같다...", playground:"🎠 놀이터... 처음 보는 미끄럼틀이다", market:"🛒 시장 냄새가 뒤섞여 코가 얼얼하다",
    housing:"🏘️ 비슷비슷한 집들뿐이다...", alley:"🐾 좁은 골목... 어디서 본 듯도 하다", market_st:"🏪 간판 불빛이 안개 속에서 번진다",
    lot:"🌾 풀숲 사이로 바람 소리만 들린다", road:"🚗 경적 소리에 귀가 멍멍하다", stream:"🌊 물소리뿐이다. 길이 막힌 것 같다",
  };
  function startFireSearch(hint, keepToast){
    const d = distMapTo("home");
    const start = (state.fireEvent && state.fireEvent.startLoc && d[state.fireEvent.startLoc] != null) ? state.fireEvent.startLoc : pickFireStart();   // 이미 도망쳐 온 곳에서 이어서 찾는다
    state.fireSearch = { steps:0, dist:d[start], d, hint:!!hint };
    if(window.showEventTutorialOnce){
      window.showEventTutorialOnce("fire-home-search", "🌫️ 안개 속에서 집 찾기", hint ? "지도의 집 표시를 따라가세요. 집 근처에 닿으면 돌아가요." : "익숙한 냄새를 따라 집을 찾아가세요. 위쪽에 남은 걸음 수가 보여요.");
    }
    enterRoom(start);              // 방향 없이 진입 → 이동 비용 없음
    state.roomObjects = [];        // 정신없는 중이라 물건은 눈에 들어오지 않는다
    renderLocBadge(); renderAll();
    if(!keepToast) catSay("연기 때문에 앞이 안 보여… 냄새를 따라가자");
    else setTimeout(()=> catSay(hint ? "알려준 대로 집 표시를 따라가자" : "연기 때문에 앞이 안 보여… 냄새를 따라가자"), 1700);
  }
  function onFireSearchStep(locId){
    const fs = state.fireSearch; fs.steps++;
    state.hunger = Math.max(5, state.hunger);
    if(locId === "home"){ const _m0 = fs._msg; fs._msg = null; if(_m0) showToast(_m0); finishFireSearch(); return; }
    renderLocBadge();
    const _m = fs._msg; fs._msg = null;
    if(_m) showToast(_m); else catSay(fs.d[locId] === 1 ? "익숙한 냄새다! 가까워졌어!" : (FIRE_LOST_LINES[locId] || "어디가 어딘지 모르겠어…"));
  }
  function finishFireSearch(){
    const fs = state.fireSearch; state.fireSearch = null;
    renderLocBadge(); renderAll();
    const good = (fs.steps - fs.dist) <= 3;
    const homeW = state.adopted ? "집" : "보금자리";
    resolveFireOption({ label:"안개 속에서 " + homeW + " 근처에 닿았다 (" + fs.steps + "걸음)", eff:{}, score: good ? 0 : -1,
      resultMsg: good ? "🏠 안개 너머로 " + homeW + " 근처에 닿았다! (" + fs.steps + "걸음)" : "🏠 한참을 헤맨 끝에 겨우 " + homeW + " 근처에 닿았다... (" + fs.steps + "걸음)" });
  }
  function drawFog(ctx, w, h, S){
    const fs = state.fireSearch, dd = fs.d[state.currentLoc];
    const R = (dd >= 3 ? 125 : (dd === 2 ? 170 : 235)) * S;      // 집에 가까울수록 안개가 걷힌다
    const g = ctx.createRadialGradient(player.x, player.y, R*0.2, player.x, player.y, R);
    g.addColorStop(0, "rgba(214,216,228,0)"); g.addColorStop(1, "rgba(214,216,228,0.96)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const t = performance.now()/4000;
    ctx.fillStyle = "rgba(235,236,245,0.16)";
    for(let i=0;i<6;i++){
      const x = (((i*0.19 + t*(i%2 ? 1 : -1)*0.6) % 1) + 1) % 1 * w;
      ctx.beginPath(); ctx.ellipse(x, h*(0.15 + i*0.14), 140*S, 36*S, 0, 0, Math.PI*2); ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,0.6)";                    // 출입구만은 희미하게 보인다
    const dw = 46*S, dz = 12*S, ex = LOC_BY_ID[state.currentLoc].exits;
    if(ex.up) ctx.fillRect(w/2 - dw/2, 0, dw, dz);
    if(ex.down) ctx.fillRect(w/2 - dw/2, h - dz, dw, dz);
    if(ex.left) ctx.fillRect(0, h/2 - dw/2, dz, dw);
    if(ex.right) ctx.fillRect(w - dz, h/2 - dw/2, dz, dw);
  }

  /* 미니게임 배경: 불이 난 것은 주인공의 집만. 이 도로엔 화재 효과를 그리지 않는다. */
  const ROAD_EVENT_BG = new Image();
  ROAD_EVENT_BG.src = ASSET_IMG.road_crossing;
  /* ---------- 화재: 돌진하는 차 피하기 (강행 돌파) ---------- */
  window.addEventListener("keydown", e=>{ if(state && state.roadGame && e.key.indexOf("Arrow") === 0) e.preventDefault(); }, true);
  function startRoadGame(options){
    const returnHome = !!(options && options.returnHome), noCross = !!(options && options.noCrosswalk);   // 강행 돌파: 횡단보도 없음
    const wrap = document.getElementById("room-wrap"), box = document.getElementById("road-game"), cv = document.getElementById("road-canvas");
    const W = Math.round(wrap.clientWidth), H = Math.round(wrap.clientHeight), dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const S = Math.max(0.9, Math.min(2.4, Math.min(W/520, H/360)));
    const sideH=H*0.2, laneCount=noCross?2:4, laneH=(H-sideH*2)/laneCount;
    const LANE_Y=noCross?[0.33,0.64]:[0.275,0.408,0.554,0.705];
    const g = { W, H, dpr, S, sideH, laneH, t:0, inv:0, flash:0, hits:0, cars:[], cat:{ x:W/2, y:H - sideH/2 }, returnHome, noCross,
      crossX:0.5*W, crossW:W*0.14,
      lanes:Array.from({length:laneCount}, (_,i)=> ({ dir:i < laneCount/2 ? -1 : 1, y:H*LANE_Y[i], dense:Math.random() < (noCross ? 0.85 : 0.55), next:(noCross ? 10 + Math.random()*40 : 40 + Math.random()*90), speed:((noCross ? 3.4 : 2.8) + Math.random()*2.6)*S })) };
    // 강행 돌파: 시작하자마자 도로에 차들이 이미 달리고 있다 (차가 늦게 출발해 너무 쉬워지던 문제)
    if(noCross) g.lanes.forEach(l=>{
      const n = l.dense ? 3 : 2;
      for(let i=0;i<n;i++){
        g.cars.push({ vi:((g._cv = (g._cv||0) + 3) % 8), x:W*((i + 0.15 + Math.random()*0.7)/n), y:l.y, dir:l.dir, v:l.speed*(0.9 + Math.random()*0.45), cur:l.speed, w:60*S, icon:["🚗","🚙","🚕","🚚"][Math.floor(Math.random()*4)] });
      }
    });
    state.roadGame = g; box.classList.add("show");
    if(window.showEventTutorialOnce){
      if(noCross) window.showEventTutorialOnce("road-crossing-nocross", "🚗 강행 돌파", "횡단보도가 없어요! 차 사이를 직접 뚫고 반대편 인도까지 건너가세요.");
      else window.showEventTutorialOnce("road-crossing", "🚗 도로 건너기", "차 간격을 보고 반대편 인도까지 건너가세요.");
    }
    roadTick();
  }
  function roadTick(ts){
    const g = state.roadGame; if(!g) return;
    ts = ts || performance.now();
    g._acc = (g._acc || 0) + Math.min(100, ts - (g._last || ts)); g._last = ts;     // 60Hz로 맞춤
    if(g._acc < 15.2){ requestAnimationFrame(roadTick); return; }
    g._acc -= 16.667; if(g._acc > 34) g._acc = 0;
    if(window.__catroadTutorialPaused){ requestAnimationFrame(roadTick); return; }
    const cv = document.getElementById("road-canvas"), ctx = cv.getContext("2d");
    ctx.setTransform(g.dpr || 1, 0, 0, g.dpr || 1, 0, 0);
    const { W, H, S, sideH, laneH, cat } = g;
    g.t++; if(g.inv > 0) g.inv--; if(g.flash > 0) g.flash--;
    const zoneL = g.crossX - g.crossW/2, zoneR = g.crossX + g.crossW/2;
    const signal = !g.noCross && Math.abs(cat.x - g.crossX) < g.crossW/2 + 8*S;      // 횡단보도 앞에 서면 차가 멈춘다
    if(g.t > 60){
      const sp = 3.4*S, k = keysDown;
      if(k["arrowleft"] || k["a"]) cat.x -= sp;
      if(k["arrowright"] || k["d"]) cat.x += sp;
      if(k["arrowup"] || k["w"]) cat.y -= sp;
      if(k["arrowdown"] || k["s"]) cat.y += sp;
      cat.x = Math.max(16*S, Math.min(W - 16*S, cat.x)); cat.y = Math.max(sideH*0.3, Math.min(H - sideH*0.3, cat.y));
      g.lanes.forEach(l=>{
        l.next--;
        if(l.next <= 0){
          g.cars.push({ vi:((g._cv = (g._cv||0) + 3) % 8), x:l.dir > 0 ? -40*S : W + 40*S, y:l.y, dir:l.dir, v:l.speed*(0.85 + Math.random()*0.5), cur:l.speed, w:60*S, icon:["🚗","🚙","🚕","🚚"][Math.floor(Math.random()*4)] });
          l.next = g.noCross ? (l.dense ? 38 + Math.random()*45 : 85 + Math.random()*80) : (l.dense ? 60 + Math.random()*70 : 170 + Math.random()*150);
        }
      });
      g.cars.forEach(c=>{
        const gap = c.dir > 0 ? zoneL - (c.x + c.w/2) : (c.x - c.w/2) - zoneR;
        if(signal && gap > -2 && gap < 130*S) c.cur *= 0.8; else c.cur += (c.v - c.cur)*0.05;
        c.x += c.dir*c.cur;
        if(g.inv <= 0 && Math.abs(cat.y - c.y) < laneH*0.42 && Math.abs(cat.x - c.x) < c.w/2 + 10*S){
          g.hits++; g.inv = 70; g.flash = 14; bgPlayer.hurt(0.4);
          applyEffToState({ risk:+8 }); renderStats();
          showToast("💥 차에 치일 뻔했다! 위험도 증가 (" + g.hits + "/3)");
          cat.x = W/2; cat.y = H - sideH/2;
        }
      });
      g.cars = g.cars.filter(c=> c.x > -120*S && c.x < W + 120*S);
    }
    // ---- 그리기 ----
    const _roadBg = g.noCross ? ROAD_TWO_LANE_BG : ROAD_CROSS_BG;   // 돌파: 2차선 · 둘러가기: 4차선 횡단보도
    if(_roadBg.complete && _roadBg.naturalWidth){
      ctx.drawImage(_roadBg, 0, 0, W, H);
    } else {
      ctx.fillStyle = "#CFC9D8"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#4A4658"; ctx.fillRect(0, sideH, W, H - sideH*2);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      for(let i=1;i<g.lanes.length;i++) for(let x=0;x<W;x+=50*S) ctx.fillRect(x, sideH + laneH*i - 1.5, 26*S, 3);
    }
    ctx.font = (20*S) + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if(!g.noCross){
      if(!(ROAD_CROSS_BG.complete && ROAD_CROSS_BG.naturalWidth)){                // 그림이 없을 때만 직접 그린다
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        for(let y=sideH + laneH*0.1; y < H - sideH; y += laneH*0.2) ctx.fillRect(zoneL, y, g.crossW, laneH*0.11);
      }
      emoDraw(ctx, "🚸", g.crossX, sideH/2); emoDraw(ctx, "🚸", g.crossX, H - sideH/2);
    }
    g.lanes.forEach(l=>{ if(l.next < 46 && g.t > 60){ emoDraw(ctx, "⚠️", l.dir > 0 ? 16*S : W - 16*S, l.y); } });
    g.cars.forEach(c=>{
      ctx.save(); ctx.translate(c.x, c.y);
      const carIm = (c.vi != null ? carSprite(c.vi) : null) || assetImg(c.icon === "🚙" || c.icon === "🚚" ? "sprite_car_blue" : "sprite_car_red");
      if(carIm){ if(c.dir < 0) ctx.scale(-1, 1); ctx.drawImage(carIm, -c.w/2, -18*S, c.w, 36*S); }   // 실제 이미지 전면은 오른쪽. 방향과 이동 부호 일치.
      else { if(c.dir > 0) ctx.scale(-1, 1); ctx.font = (34*S) + "px sans-serif"; emoDraw(ctx, c.icon, 0, 0); }   // 이모지는 왼쪽을 본다
      ctx.restore();
    });
    if(!(g.inv > 0 && g.t % 8 < 4)){
      const walking = !!(keysDown["arrowup"] || keysDown["arrowdown"] || keysDown["arrowleft"] || keysDown["arrowright"] || keysDown["w"] || keysDown["a"] || keysDown["s"] || keysDown["d"]);
      const frame = walking ? (1 + Math.floor(g.t / 8) % 4) : 0;
      if(keysDown["arrowleft"] || keysDown["a"]) g.catFacing=-1;
      else if(keysDown["arrowright"] || keysDown["d"]) g.catFacing=1;
      const right = (g.catFacing || 1)>0;
      const key=walking ? (right ? "player_walk_" : "player_left_") + Math.floor(g.t/8)%4 : "face_default";
      const catIm=v36CatReady(key);
      if(catIm){ ctx.save();ctx.translate(cat.x,cat.y);if(!walking && right)ctx.scale(-1,1);drawMyoSprite(ctx,catIm,49*S,44*S,21*S);ctx.restore(); }
      else { ctx.font = (30*S) + "px sans-serif"; emoDraw(ctx,catFaceNow(),cat.x,cat.y); }
    }
    if(g.flash > 0){ ctx.fillStyle = "rgba(255,70,50," + (g.flash/28).toFixed(2) + ")"; ctx.fillRect(0, 0, W, H); }
    ctx.textAlign = "left"; ctx.font = "700 " + (13*S) + "px 'Noto Sans KR', sans-serif";
    ctx.fillStyle = "#fff"; emoDrawMixed(ctx, "💥 " + g.hits + " / 3", 12*S, sideH*0.5);
    if(g.t < 170){
      ctx.textAlign = "center"; ctx.fillStyle = "rgba(30,26,50,0.72)"; ctx.fillRect(W/2 - 250*S, H/2 - 30*S, 500*S, 60*S);
      ctx.fillStyle = "#fff"; ctx.fillText("↑ 반대편 인도로 건너가세요!", W/2, H/2 - 10*S);
      ctx.fillStyle = "#FFD7B8"; emoDrawMixed(ctx, g.noCross ? "🚗 횡단보도가 없어요! 차가 멈추지 않아요" : "🚸 횡단보도 앞에 서면 차들이 멈춰요", W/2, H/2 + 12*S);
    }
    // 반대편 인도에 발을 들이는 순간 완료 (인도 한가운데까지 더 걸어갈 필요 없음)
    if(cat.y <= sideH + 12*S || g.hits >= 3){ endRoadGame(g, zoneL, zoneR); return; }
    requestAnimationFrame(roadTick);
  }
  function completeRoadReturn(opt){
    const fs = state.fireSearch;
    let result = opt;
    if(fs){
      const good = (fs.steps - fs.dist) <= 3;
      const homeW = state.adopted ? "집" : "보금자리";
      result = Object.assign({}, opt, {
        label:(good ? homeW + "을 찾아" : "한참 헤맨 끝에 " + homeW + "을 찾아") + " · " + opt.label,
        score:(good ? 0 : -1) + (opt.score || 0),
        resultMsg:(good ? "🏠 익숙한 냄새를 따라 " + homeW + "을 찾았다!" : "🏠 많이 헤맸지만 마침내 " + homeW + "에 도착했다...") + " " + (opt.resultMsg || "")
      });
      state.fireSearch = null;
    }
    // 미니게임이 끝난 뒤에만 실제 집 맵으로 이동한다.
    enterRoom("home");
    renderLocBadge(); renderAll();
    resolveFireOption(result);
  }
  function endRoadGame(g){
    state.roadGame = null;
    document.getElementById("road-game").classList.remove("show");
    const onCross = !g.noCross && Math.abs(g.cat.x - g.crossX) < g.crossW/2 + 10*g.S;
    let opt;
    if(g.hits >= 3)   opt = { label:"차에 연달아 치였다", eff:{ risk:+6, hunger:-14 }, score:-1, resultMsg:"무리하게 돌파하다 크게 다치고 말았다..." };
    else if(g.hits)   opt = { label:"아슬아슬하게 건넜다", eff:{ risk:0, hunger:-6*g.hits }, score:-1, resultMsg:"상처를 입고 겨우 반대편에 도착했다..." };
    else if(onCross)  opt = { label:"횡단보도로 건넜다", eff:{ risk:-4, fun:+2 }, score:+1, resultMsg:"🚸 횡단보도로 침착하게 건넜다!" };
    else              opt = { label:"차 사이를 무사히 건넜다", eff:{ risk:-1 }, score:0, resultMsg:"🚗 차 사이를 아슬아슬하게 가로질렀다!" };
    if(g.returnHome) completeRoadReturn(opt);
    else resolveFireOption(opt);
  }

  /* ---------- 화재 서바이벌 이벤트 (중년기 진입 시 1회, 3턴 구조) ---------- */
  function tryStartFirePending(){
    if(!state || !state.firePending) return;
    runWhenIdle(()=>{
      if(!state || !state.firePending || state.gameOver || state.fireEvent || state.fireSearch) return;
      if(state.currentLoc !== "home") return;           // 아직 집이 아니면 돌아올 때까지 기다린다
      state.firePending = false;
      triggerFireEvent();
    });
  }

  /* ---------- 화재: 불 붙은 집 (입양한 집에서 불이 났을 때만) ---------- */
  function _flame(ctx, x, y, w, h, sway, color){
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x - w*1.05, y - h*0.55, x + sway, y - h);
    ctx.quadraticCurveTo(x + w*1.05, y - h*0.5, x + w, y); ctx.closePath(); ctx.fill();
  }
  function drawHomeFire(ctx, w, h, S){
    const t = performance.now() / 1000;
    const pts = [[43,24],[50,19],[57,24],[46,33],[54,33],[50,40],[41,41],[59,41],[50,28],[47,25],[53,26]];
    const c = pctToXY("home", 50, 32);
    const gl = ctx.createRadialGradient(c.x, c.y, 10*S, c.x, c.y, 300*S);
    gl.addColorStop(0, "rgba(255,140,40," + (0.42 + 0.08*Math.sin(t*7)).toFixed(3) + ")"); gl.addColorStop(1, "rgba(255,90,20,0)");
    ctx.fillStyle = gl; ctx.fillRect(0, 0, w, h);
    for(let i = 0; i < 8; i++){                                   // 연기
      const ph = (t*0.32 + i/8) % 1, p = pctToXY("home", 43 + ((i*37) % 15), 22);
      ctx.fillStyle = "rgba(58,52,68," + (0.40*(1 - ph)).toFixed(3) + ")";
      ctx.beginPath(); ctx.arc(p.x + Math.sin(t*1.3 + i)*16*S, p.y - ph*170*S, (14 + ph*38)*S, 0, Math.PI*2); ctx.fill();
    }
    pts.forEach((q, i)=>{                                          // 불꽃
      const p = pctToXY("home", q[0], q[1]), fl = 0.82 + 0.26*Math.sin(t*9 + i*1.7), sw = Math.sin(t*5 + i)*3.5*S, hh = 36*S*fl*(i % 3 === 0 ? 1.45 : 1);
      _flame(ctx, p.x, p.y, hh*0.62, hh, sw, "#ff5a1f"); _flame(ctx, p.x, p.y, hh*0.44, hh*0.72, sw*0.8, "#ff9b2e"); _flame(ctx, p.x, p.y, hh*0.26, hh*0.46, sw*0.6, "#ffe28a");
    });
    for(let i = 0; i < 14; i++){                                   // 불똥
      const ph = (t*0.9 + i*0.37) % 1, p = pctToXY("home", 41 + (i*13 % 19), 30);
      ctx.fillStyle = "rgba(255," + (170 + (i*17 % 70)) + ",80," + (1 - ph).toFixed(2) + ")";
      ctx.fillRect(p.x + Math.sin(t*2 + i)*20*S, p.y - ph*120*S, 2.5*S, 2.5*S);
    }
  }
  function pickFireStart(){      // 불이 난 뒤 고양이가 정신없이 도망쳐 도착하는 곳 (집에서 떨어진 곳)
    const d = distMapTo("home");
    const maxd = Math.max.apply(null, Object.values(d)), need = Math.min(3, maxd);
    const cands = Object.keys(d).filter(id=> id !== "home" && d[id] >= Math.max(2, need));
    return cands[Math.floor(Math.random()*cands.length)];
  }
  function triggerFireEvent(){
    state.fireMusicReady = false;
    scatterKittens(null, null, "불길에 놀라", true);
    state.fireEvent = { step:1, path:null, score:0, startLoc:pickFireStart() };
    dimIn(2600, "fire");     // 암전 중에는 기존 장소 음악을 유지한다.
    if(window.showEventTutorialOnce){
      window.showEventTutorialOnce("fire-demolition", state.adopted ? "🔥 집에 불이 났다!" : "🏗️ 보금자리가 사라졌다!",
        "보금자리를 떠나게 됐어요. 길을 물을지, 직접 찾을지 골라요.");
    }
    setTimeout(()=>{
      if(!state || !state.fireEvent) return;
      state.fireMusicReady = true; // 화재 이벤트가 화면에 나타나는 시점에만 전환
      sfx("fireStart");
      Music.sync();
      if(state.fireEvent.startLoc){   // 암전된 사이 고양이를 낯선 곳으로 옮겨 둔다 (선택지 뒤로 집이 비치지 않게)
        enterRoom(state.fireEvent.startLoc); state.roomObjects = [];
        renderLocBadge(); renderAll();
      }
      // v38: 입양 전 보금자리 철거는 컷신이 아닌 선택창으로 곧바로 이어진다.
      // 기존에는 암전 레이어가 화면 위에 계속 남아 버튼 클릭까지 막았다.
      // 입양 후 화재는 playCutscene(fade:true)가 암전을 해제하므로 그 경로는 유지한다.
      if(!state.adopted) dimOut(650);
      renderFireStep();
    }, 2800);
  }

  function renderFireStep(){
    if(state.gameOver){ dimOut(600); return; }
    const step = state.fireEvent.step;
    let title, desc, opts;

    if(step === 1){
      title = state.adopted ? "🔥 집에 불이 났다!" : "🏗️ 보금자리가 사라졌다!";
      desc = state.adopted
        ? "연기와 불길에 놀라 정신없이 도망쳤다. 정신을 차려보니 낯선 동네다..."
        : "갑작스러운 철거 공사에 보금자리가 무너졌다. 정신없이 도망쳐 보니 낯선 동네다...";
      opts = [
        { label:"지나가는 고양이에게 묻는다", sub:"도움을 청해본다", path:"ask", eff:{hunger:-6, fun:-6} },
        { label:"스스로 길을 찾아본다", sub:"자신의 감각을 믿는다", path:"self", eff:{hunger:-6, fun:-6} },
      ];
    } else if(step === 2){
      if(state.fireEvent.path === "ask" && state.turfRank >= 3){   // 고양이들의 왕: 음식을 주지 않아도 길안내를 받는다
        title = "낯선 고양이와의 만남";
        desc = "지나가던 고양이가 고양이들의 왕을 알아보고 화들짝 고개를 숙인다.";
        opts = [
          { label:"왕으로서 길안내를 명한다", sub:"음식을 나눠주지 않아도 된다 · 지도에 집 위치를 알려준다", eff:{risk:-8}, score:+1, resultMsg:"왕의 명이다! 고양이가 공손히 길을 안내했다. 지도에 집 위치가 표시됐다", detour:true, askSearch:true, hint:true },
        ];
      } else if(state.fireEvent.path === "ask"){
        title = "낯선 고양이와의 만남";
        desc = "지나가던 고양이에게 다가가 조심스레 길을 물었다.";
        opts = [
          { label:"그냥 알려달라고 한다", sub:"밑져야 본전 · 집 위치를 모른 채 헤맨다", eff:{risk:+10, fun:-6}, score:-1, resultMsg:"...얻어맞았다 ㅜㅠ", detour:true, askSearch:true, hint:false },
          { label:"음식을 나눠주고 길안내를 부탁한다", sub:"가진 것을 나눈다 · 지도에 집 위치를 알려준다", eff:{hunger:-8, risk:-8}, score:+1, resultMsg:"길을 안내받는 데 성공했다! 지도에 집 위치가 표시됐다", detour:true, askSearch:true, hint:true },
        ];
      } else {
        title = "낯선 골목 탐색";
        desc = "스스로 감각을 믿고 길을 찾아 나섰다. 그런데 도로에 차가 너무 많아 지나갈 수가 없다!";
        const rare = Math.random() < 0.12;
        if(rare){
          opts = [
            { label: state.adopted ? "어쩌다 보니 집을 찾았다! (희귀)" : "어쩌다 보니 보금자리를 찾았다! (희귀)", sub:"기적처럼 익숙한 골목이 보인다", eff:{affection:+10}, score:2, skipToEnd:true },
            { label:"그래도 조심스럽게 돌아서 간다", sub:"안개 속에서 집까지 길을 찾아간다 (걸음 수만큼 지친다)", eff:{risk:-2, fun:-2}, detour:true },
          ];
        } else {
          opts = [
            { label:"차 사이를 그대로 강행 돌파한다", sub:"위험하지만 빠르다. 횡단보도 없이 달려오는 차 사이를 직접 건넌다", road:true },
            { label:"돌아서 다른 길로 간다", sub:"시간이 걸린다. 안개 속에서 집까지 길을 찾아간다", eff:{risk:-2, fun:-2}, detour:true },
          ];
        }
      }
    } else {
      const good = state.fireEvent.score >= 0;
      if(state.adopted){
        title = good ? "🏠 집 근처에 닿았다!" : "🏠 겨우 집 근처에 닿았다...";
        desc = good
          ? "우여곡절 끝에 익숙한 골목이 보인다. 저 멀리서 집사가 애타게 부르는 소리가 들린다!"
          : "여기저기 헤매다 지칠 대로 지쳐, 겨우 익숙한 냄새가 나는 골목 어귀에 닿았다.";
        opts = [
          { label:"집사에게 달려간다", sub:"", eff: good ? {affection:+14, fun:+6} : {affection:+4, hunger:-6}, finish:true },
        ];
      } else {
        title = good ? "📦 보금자리 근처에 닿았다!" : "📦 겨우 쉴 곳 근처에 닿았다...";
        desc = good
          ? "우여곡절 끝에 아늑해 보이는 처마 밑이 눈에 들어온다. 오늘부터 저기가 새 보금자리다!"
          : "여기저기 헤매다 지칠 대로 지쳐, 겨우 바람을 피할 구석이 보이는 곳까지 왔다.";
        opts = [
          { label:"새 보금자리에 몸을 누인다", sub:"", eff: good ? {fun:+10, hunger:-2} : {fun:+2, hunger:-6}, finish:true },
        ];
      }
    }

    // 화재의 시작은 이 게임에서 가장 큰 사건 — 3장짜리 컷신으로 연다
    if(step === 1 && state.adopted){
      playCutscene({
        panels: CUT.fire,
        fade: true, fadeKind: "fire",
        opts: opts,
        onPick: resolveFireOption
      });
      return;
    }

    choiceTitle.textContent = title;
    choiceDesc.textContent = desc;
    choiceOpts.innerHTML = "";
    opts.forEach(opt=>{
      const btn = document.createElement("button");
      btn.className = "opt-btn";
      btn.innerHTML = `<b>${opt.label}</b><span>${opt.sub||""}</span>`;
      btn.addEventListener("click", ()=>{
        choiceOverlay.classList.remove("show");
        setBackgroundInteractive(true);
        resolveFireOption(opt);
      });
      choiceOpts.appendChild(btn);
    });
    choiceOverlay.classList.add("show");
    setBackgroundInteractive(false);
  }

  function resolveFireOption(opt){
    if(!state.fireEvent) return;
    if(opt.detour && opt.askSearch){      // 낯선 고양이에게 길을 물은 뒤: 안개 속 집 찾기 (밥을 나눴으면 미니맵에 집 위치가 보인다)
      const before = snapStats();
      if(opt.eff) applyEffToState(opt.eff);
      showDeltas(before);
      pushHistory({kind:"choice", flavor:{title:"화재 사건"}, opt}, before);
      if(opt.score) state.fireEvent.score += opt.score;
      if(opt.resultMsg) showToast(opt.resultMsg);
      startFireSearch(!!opt.hint, true);
      return;
    }
    if(opt.detour){ if(opt.eff) applyEffToState(opt.eff); startFireSearch(); return; }
    if(opt.road){ startRoadGame({ returnHome:true, noCrosswalk:true }); return; }
    const before = snapStats();
    if(opt.path){
      state.fireEvent.path = opt.path;
      state.personality = opt.path === "self" ? "introvert" : "extrovert";
    }
    if(opt.eff) applyEffToState(opt.eff);
    showDeltas(before);
    pushHistory({kind:"choice", flavor:{title:"화재 사건"}, opt}, before);
    if(opt.score) state.fireEvent.score += opt.score;
    if(opt.resultMsg) showToast(opt.resultMsg);
    if(opt.skipToEnd) state.miracle = true;

    if(opt.finish || opt.skipToEnd){
      state.fireEvent = null;
      advanceStageProgress();
      renderAll();
      return;
    }
    state.fireEvent.step++;
    renderFireStep();
  }

  const trackCardEl = document.getElementById("track-card");
  function setBackgroundInteractive(enabled){
    if(trackCardEl) trackCardEl.classList.toggle("dimmed", !enabled);
    if(enabled && window.__refreshRoom) setTimeout(window.__refreshRoom, 450);
  }

  function advanceStageProgress(){
    state.modalCount++;
    if(state.modalCount >= MODALS_PER_STAGE){
      state.modalCount = 0;
      if(state.stageIdx < STAGES.length - 1){
        const prevSeason = getSeason(state.day).name;
        state.stageIdx++;
        if(state.stageIdx === 1 && window.showEventTutorialOnce){
          window.showEventTutorialOnce("first-growth", "🌱 고양이가 성장했어요!", "단계와 계절이 바뀔 때마다 짧게 알려줄게요.");
        }
        showToast("🌱 " + STAGES[state.stageIdx] + "(으)로 접어들었다");
        const nowSeason = getSeason(state.day).name;
        if(nowSeason !== prevSeason){
          const msg = (SEASON_FOLLOWS_STAGE && state.stageIdx === STAGES.length - 1) ? "🌸 긴 겨울을 지나, 이듬해 봄이 찾아왔다" : (SEASON_ARRIVE[nowSeason] || nowSeason);
          setTimeout(()=> showToast(msg), 1800);
        }
        if(state.stageIdx === 2 && !state.fireTriggered){   // 입양했다면 화재, 길고양이라면 보금자리 철거
          state.fireTriggered = true;
          state.firePending = true;      // 보금자리·집으로 돌아왔을 때 시작한다 (이미 집에 있다면 곧바로)
          tryStartFirePending();
        }
      } else if(!(state.extLeft > 0) && !state.endingNextTurn){
        // 마지막 이벤트 뒤에 한 턴을 더 보낸 다음 엔딩으로 넘어간다 (bumpDay에서 이어짐)
        state.endingNextTurn = true;
        state.modalTarget = 9999; state.itemsEatenSinceModal = 0;   // 그 사이 새 이벤트는 끼어들지 않는다
        if(!(state.turfRank >= 3 && !state.tributeDone)){   // 왕은 수명이 10일 늘어나기 전이라 아직 마지막이 아니다 (연장의 끝자락에 따로 알린다)
          setTimeout(()=> showToast("🌙 어느덧 마지막 날이 다가왔다… 한 걸음만 더 걸어 보자"), 900);
        }
      }
    }
  }

  /* ---------- 고양이들의 왕: 예상 수명보다 10일 더, 조공을 받으며 ---------- */
  const TRIBUTES = [
    "🐟 신하 고양이가 싱싱한 생선을 바쳤다", "🐦 참새 한 마리가 왕 앞에 놓였다", "🥛 따뜻한 우유가 올라왔다",
    "🧶 털실 공이 조공으로 도착했다", "🍗 닭고기 한 점이 바쳐졌다", "🌿 캣그라스가 한 아름 도착했다",
    "🥫 고급 캔이 줄지어 올라왔다", "🪶 깃털 장난감이 바쳐졌다", "🦐 새우 한 접시가 도착했다", "💐 꽃다발이 조공으로 도착했다",
  ];
  const TRIBUTE_ITEMS = [
    {icon:"🐟",name:"생선"},{icon:"🐦",name:"참새"},{icon:"🥛",name:"우유"},{icon:"🧶",name:"털실 공"},{icon:"🍗",name:"닭고기"},
    {icon:"🌿",name:"캣그라스"},{icon:"🥫",name:"고급 캔"},{icon:"🪶",name:"깃털 장난감"},{icon:"🦐",name:"새우"},{icon:"💐",name:"꽃다발"},
  ];
  const TRIBUTE_SAVE_KEY = "catroad_tributes_v1";
  const gotTributes = new Set();
  try{ JSON.parse(localStorage.getItem(TRIBUTE_SAVE_KEY) || "[]").forEach(n=>{ if(n >= 0 && n < TRIBUTE_ITEMS.length) gotTributes.add(n); }); }catch(err){}
  function saveTributes(){ try{ localStorage.setItem(TRIBUTE_SAVE_KEY, JSON.stringify([...gotTributes])); }catch(err){} }
  function renderTributeChips(el, fresh){
    if(!el) return;
    el.innerHTML = TRIBUTE_ITEMS.map((t,i)=> gotTributes.has(i)
      ? `<span class="tchip${i === fresh ? " new" : ""}">${t.icon} ${t.name}</span>`
      : `<span class="tchip q" title="아직 못 받았어요">❓ ？？？</span>`).join("");
  }
  function renderTributeBoxes(fresh){
    renderTributeChips(document.getElementById("dex-tribute-chips"), -1);
    const cnt = gotTributes.size + " / " + TRIBUTE_ITEMS.length;
    document.getElementById("dex-tribute-count").textContent = "· " + cnt;
    const box = document.getElementById("tribute-box");
    const show = !!state && (state.turfRank >= 3 || state.extLeft > 0);
    box.style.display = show ? "" : "none";
    if(show){ document.getElementById("tribute-count").textContent = "· 수집 " + cnt + " · 이번에 받은 횟수 " + (state.tributeCount || 0) + "회"; renderTributeChips(document.getElementById("tribute-chips"), fresh); }
  }
  let lastTribute = -1;
  window.addEventListener("load", ()=>{ try{ renderTributeBoxes(-1); }catch(err){} });
  // 왕이 되면 하루가 지날 때마다 조공이 한 번씩 도착한다
  function receiveTribute(){
    if(!state || state.gameOver) return;
    let n; do{ n = Math.floor(Math.random() * TRIBUTES.length); }while(n === lastTribute);
    lastTribute = n;
    state.tributeCount = (state.tributeCount || 0) + 1;
    const isNewTribute = !gotTributes.has(n);
    gotTributes.add(n); saveTributes();
    const before = snapStats();
    state.hunger = clamp(state.hunger + 5 + Math.random() * 4);
    state.fun = clamp(state.fun + 3 + Math.random() * 3);
    state.risk = Math.max(0, state.risk - 2);
    sfx("tribute");
    showToast("👑 오늘의 조공 · " + TRIBUTES[n] + (isNewTribute ? " ✨NEW" : ""));
    showDeltas(before);
    renderAll();
    renderTributeBoxes(isNewTribute ? n : -1);
  }
  function beginEnding(){
    if(state.turfRank >= 3 && !state.tributeDone){ startKingExtension(); return; }
    showEnding();
  }
  // 왕의 수명 연장: 예상 수명이 다해도 10일 더, 조공을 받으며 평소처럼 지낸다 (하루마다 조공은 bumpDay에서)
  function startKingExtension(){
    state.tributeDone = true;
    state.expectedDays = state.day;
    state.extLeft = TRIBUTE_DAYS;
    state.tributeDays = 0;
    state.modalTarget = 9999; state.itemsEatenSinceModal = 0;   // 남은 날들엔 큰 사건 없이 조용히
    showToast("👑 왕의 수명이 10일 늘어났다! 신하들의 조공을 받으며 느긋한 나날을 보낸다");
    renderAll();
  }

  /* ================= 엔딩 ================= */
  // 먹는 게 너무 많아 살이 붙으면(체형지수 10 초과) 근육이 살에 덮여 한 칸씩 줄어든다: 근육냥이 → 평범 → 통통이 순으로 자연스럽게 넘어간다
  const MUSCLE_FAT_W = 10;
  function foodOverMuscle(){
    if(!state || state.weight <= MUSCLE_FAT_W || !(state.muscleCount > 0)) return;
    const wasMuscle = state.muscleCount >= 6;
    state.muscleCount--;
    if(wasMuscle && state.muscleCount < 6) setTimeout(()=> showToast("🍖 너무 많이 먹어서 근육이 살에 덮여 버렸다… 근육냥이 졸업!"), 1300);
    else if(!state._fatMuscleToast || Date.now() - state._fatMuscleToast > 20000){ state._fatMuscleToast = Date.now(); setTimeout(()=> showToast("🍖 먹은 게 쌓여 근육이 조금 줄었다"), 1300); }
  }
  function computeEnding(){
    const aff = state.affection, w = state.weight, fun = state.fun, risk = state.risk;

    // 화재 속 희귀 선택지(기적)는 가장 먼저 본다: 뒤의 다른 엔딩 조건에 가려지지 않도록
    if(state.miracle){
      return { key:"miracle", emoji:"🏠✨", title:"기적처럼 집을 찾은 고양이", desc:(state.adopted ? "불길 속에서" : "철거의 먼지 속에서") + " 길을 잃었던 그날, 기적처럼 익숙한 골목이 눈앞에 나타났다. 이 고양이는 평생 그날의 행운을 자랑스러워했다." };
    }
    if(state.lovebirds){
      return { key:"lovebirds", emoji:"😻💞", title:"잉꼬 부부", desc:"수줍은 첫 데이트부터 작은 사냥감, 큰 사냥감, 그리고 귀한 츄르까지. 서로에게 가장 좋은 것을 나누며 한평생을 함께했다. 골목의 고양이들은 둘을 '잉꼬 부부'라 불렀다." };
    }
    if(state.richCat){
      return { key:"rich", emoji:"💰😺", title:"부자냥이", desc:"지폐를 부지런히 물어다 준 덕분에 집사가 큰 부자가 되었다. 이 고양이는 매일 최고급 츄르를 받아먹으며 호화롭게 살았다." };
    }
    if(state.turfRank >= 3){
      return { key:"turf_king", emoji:"⚔️👑", title:"고양이들의 왕", desc:"수많은 싸움 끝에 이 동네 모든 고양이 위에 군림하는 전설이 되었다." };
    }
    if(state.turfRank === 2){
      return { key:"turf_boss", emoji:"😼🏆", title:"동네 대장", desc:"싸움에서 이기며 이 동네의 대장 자리에 올랐다. 왕좌엔 닿지 못했지만, 골목의 고양이들은 모두 이 고양이에게 길을 비켜주었다." };
    }
    if(state.beeCat){
      return { key:"bee_cat", emoji:"🐝💚", title:"꿀벌냥이", desc:"꽃밭에서 벌들의 침을 피하고 또 피하다, 어느새 벌들과 한 팀이 되었다. 사냥감을 마비시키는 달콤한 독을 쓰는 이 고양이를 사람들은 '꿀벌냥이'라 불렀고, 꽃밭 위로 윙— 소리가 들리면 동네 쥐들은 먼저 짐을 쌌다." };
    }
    if((state.stealWins||0) >= THEFT_CFG.endWins){
      return { key:"thief_legend", emoji:"🐟😼", title:"시장의 전설 도둑냥", desc:"시장 상인들 사이에서는 \"그 고양이 또 왔다!\"가 인사말이 되었다. 멸치 봉지를 흔들며 뛰어오는 할머니의 뒷모습은 이 시장의 명물이 되었고, 이 고양이는 한 번도 잡히지 않는 그림자처럼 오늘도 어딘가에서 생선 한 마리를 물고 지붕 위를 달린다." };
    }
    if((state.stealFails||0) >= THEFT_CFG.endFails){
      return { key:"thief_wanted", emoji:"📜😿", title:"시장 요주의 고양이", desc:"번번이 할머니에게 붙잡혀 꿀밤을 맞았지만 이 고양이는 끝내 포기하지 않았다. 결국 시장 가게마다 '이 고양이 주의' 전단이 붙었고, 이제 할머니는 먼저 멸치 한 줌을 쥐여 주며 말한다. \"그냥 가져가, 이놈아.\"" };
    }
    // 새끼를 연인에게 맡겼던 기록: 오래 기다리게 했는지, 제때 품에 안아 줬는지
    if(state.hasKittens && (state.kidSulks || 0) >= 3){
      return { key:"mama_busy", emoji:"🌙🐱", title:"늘 바빴던 엄마냥", desc:"새끼들을 연인에게 맡겨 두고 길 위를 쏘다니느라, 아이들은 자주 엄마를 기다렸다. 그래서인지 새끼들은 누구보다 씩씩하고 독립적으로 자랐고, 가끔 돌아온 엄마를 보면 말없이 곁에 와 몸을 비볐다." };
    }
    if(state.hasKittens && (state.kidSulks || 0) === 0 && ((state.kidReturns || 0) + (state.kidReunions || 0)) >= 4){
      return { key:"mama_warm", emoji:"🐈🍼", title:"새끼들의 든든한 엄마냥", desc:"새끼를 맡길 때도, 데리러 갈 때도 늘 제때였다. 새끼들은 엄마가 반드시 돌아온다는 걸 알았고, 그 믿음 속에서 건강하게 자라 골목 어디서든 엄마를 따라 졸졸 걸었다." };
    }
    if(aff >= 75 && w > 18){
      return { key:"home_chubby", emoji:"🏠😻", title:"사랑받는 집고양이 (통통이)", desc:"집사의 사랑을 듬뿍 받으며 살이 오른 채 따뜻한 집에서 여생을 보냈다. 가끔 다이어트 잔소리를 듣지만 행복하다." };
    }
    if(aff >= 65){
      return { key:"home_affectionate", emoji:"🏠🐈", title:"집사에게 애교떠는 집고양이", desc:"매일 현관에서 반갑게 마중 나오는, 동네에서 가장 다정한 고양이로 소문났다." };
    }
    if(state.gangApproved === false){
      return { key:"exiled", emoji:"☁️🐈‍⬛", title:"동네에서 쫓겨난 떠돌이", desc:"끝내 대장냥이의 허락을 받지 못해, 이 동네 저 동네를 떠돌며 살았다. 텃세는 매서웠지만 이 고양이는 혼자서도 꿋꿋했다." };
    }
    if((state.starveCount||0) >= 3){
      return { key:"starving", emoji:"🥴🐟", title:"배탈냥이", desc:"툭하면 배가 고파 아무거나 주워먹다 배탈이 나곤 했다. 그래도 매번 툭툭 털고 일어나, 결국 끝까지 씩씩하게 살아냈다." };
    }
    if(aff <= 20 && risk >= 55){
      return { key:"wanderer_rough", emoji:"🌧️🐾", title:"거친 길 위의 방랑묘", desc:"누구에게도 곁을 주지 않고 스스로 길을 개척하며 살았다. 고단했지만 자유로웠다." };
    }
    if(state.hasKittens && aff >= 30 && state.muscleCount < 10){
      return { key:"family", emoji:"🐱👶", title:"다둥이 가족을 이룬 고양이", desc:"인연을 만나 새끼를 낳거나 새 친구를 맞이하며, 혼자가 아닌 북적이는 삶을 살았다." };
    }
    if(state.muscleCount >= 10 && w <= 18){
      return { key:"muscle_legend", emoji:"💪🐈‍⬛", title:"전설의 근육냥이", desc:"매일 사냥하고 뛰어논 덕분에 이 골목 어떤 고양이보다도 날렵하고 단단한 몸을 갖게 되었다." };
    }
    if(state.turfRank === 1){
      return { key:"turf_thug", emoji:"😾🧢", title:"냥아치", desc:"툭하면 다른 고양이에게 시비를 걸고 다녔다. 왕이 되진 못했지만, 이 골목에서 만만하게 보는 고양이는 없었다." };
    }
    if(w > 18){
      return { key:"chubby_famous", emoji:"🐽🐱", title:"동네 유명 통통이", desc:"먹는 것을 너무 사랑한 나머지 동네에서 제일 커다란 고양이가 되었다. 다들 귀여워하며 간식을 나눠준다." };
    }
    if(state.adventurous && fun >= 60){
      return { key:"adventurer", emoji:"🧭🐾", title:"모험가냥이", desc:"위험한 순간들을 두려워하지 않고 온 동네 구석구석을 누비며 스릴 넘치는 삶을 살았다." };
    }
    return { key:"peaceful", emoji:"☀️🐱", title:"평온하고 행복한 삶을 산 고양이", desc:"큰 사건은 없었지만, 나름의 방식으로 평온하고 행복한 하루하루를 보내며 충분히 만족스러운 한 생을 살았다." };
  }

  // 엔딩별 일러스트 (없는 엔딩은 이모지만 보여준다)
  const ENDING_IMG = {
    lovebirds: __IMG.ENDING_IMG_lovebirds,
    rich: __IMG.ENDING_IMG_rich,
    turf_king: __IMG.ENDING_IMG_turf_king,
    home_chubby: __IMG.ENDING_IMG_home_chubby,
    home_affectionate: __IMG.ENDING_IMG_home_affectionate,
    wanderer_rough: __IMG.ENDING_IMG_wanderer_rough,
    muscle_legend: __IMG.ENDING_IMG_muscle_legend,
    chubby_famous: __IMG.ENDING_IMG_chubby_famous,
    family: __IMG.ENDING_IMG_family,
    adventurer: __IMG.ENDING_IMG_adventurer,
    peaceful: __IMG.ENDING_IMG_peaceful,
    trap_death: __IMG.ENDING_IMG_trap_death,
    turf_boss: __IMG.ENDING_IMG_turf_boss,
    turf_thug: __IMG.ENDING_IMG_turf_thug,
    exiled: __IMG.ENDING_IMG_exiled,
    starving: __IMG.ENDING_IMG_starving,
    miracle: __IMG.ENDING_IMG_miracle,
    thief_legend: __IMG.ENDING_IMG_thief_legend,
    bee_cat: __IMG.ENDING_IMG_bee_cat,
    thief_wanted: __IMG.ENDING_IMG_thief_wanted,
    mama_warm: __IMG.ENDING_IMG_mama_warm,
    mama_busy: __IMG.ENDING_IMG_mama_busy
  };
  // 엔딩 이모지 두 개를 한 장으로 묶은 그림 (없는 엔딩은 이모지 그대로)
  const ENDING_ICON = {};
  function endIcon(key, emoji){ const src = ENDING_IMG[key] || ENDING_ICON[key]; return src ? '<img class="end-ico" src="' + src + '" alt="' + emoji + '">' : emoji; }
  function earlyEnding(emoji, title, desc, key, endSeason, blink){
    state.running = false;
    state.gameOver = true;
    if(key){ if(!discoveredEndings.has(key)) newEndings.add(key); discoveredEndings.add(key); saveEndings(); }
    const endArt = document.getElementById("end-art"), endModal = endOverlay.querySelector(".modal");
    endArt.classList.toggle("contain", key === "bee_cat");
    if(key && ENDING_IMG[key]){ endArt.src = ENDING_IMG[key]; endArt.classList.add("on"); endModal.classList.add("has-art"); document.getElementById("end-emoji").style.display = "none"; }
    else { endArt.classList.remove("on"); endArt.removeAttribute("src"); endModal.classList.remove("has-art"); document.getElementById("end-emoji").style.display = ""; }
    document.getElementById("end-emoji").innerHTML = endIcon(key, emoji);
    document.getElementById("end-title").textContent = title;
    document.getElementById("end-desc").textContent = desc;
    document.getElementById("end-stats").innerHTML = `
      <div>💜 애정도 ${Math.round(state.affection)}</div>
      <div>🍖 체형지수 ${state.weight > 0 ? "+" : ""}${state.weight}</div>
      <div>🧶 재미도 ${Math.round(state.fun)}</div>
      <div>📅 총 ${state.day}일</div>
      ${endSeason ? `<div>${endSeason.icon} ${(SEASON_FOLLOWS_STAGE && state.stageIdx === STAGES.length - 1 && endSeason.name === "봄") ? "이듬해 " : ""}${endSeason.name}에 눈을 감음</div>` : ""}
    `;
    choiceOverlay.classList.remove("show");
    setBackgroundInteractive(true);
    bgPlayer.fade();
    // 엔딩은 갑자기 뜨지 않고, 화면이 서서히 암전된 뒤에 나타난다
    const _lids = document.getElementById("end-lids");
    const _calm = !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    if(blink && _lids && _calm){
      // 수명을 다한 엔딩: 눈을 두 번 깜빡이다 천천히 감긴다 (화면을 누르면 건너뛴다)
      setCatMood("\uD83D\uDE34", BLINK_END.total + 1200);
      state._endSleep = true; state._napT0 = performance.now(); player._walking = false;   // 눈을 감는 동안 주인공은 누워 자는 모습
      _lids.classList.remove("play"); void _lids.offsetWidth; _lids.classList.add("on", "play");
      let done = false;
      const finish = ()=>{
        if(done) return; done = true; clearTimeout(_blinkT);
        const f = document.getElementById("end-fade"); f.style.transition = "none"; f.classList.add("on"); void f.offsetWidth; f.style.transition = "";
        _lids.removeEventListener("pointerdown", finish);
        setTimeout(()=>{ endOverlay.classList.add("show"); sfx("ending"); _lids.classList.remove("on", "play"); }, BLINK_END.hold);
      };
      const _blinkT = setTimeout(finish, BLINK_END.total);
      _lids.addEventListener("pointerdown", finish);
    } else {
      document.getElementById("end-fade").classList.add("on");
      setTimeout(()=>{ endOverlay.classList.add("show"); sfx("ending"); }, 3200);
    }
  }
  const BLINK_END = { total:4800, hold:900 };   // 눈 깜빡임 연출 길이(ms) · 완전히 감긴 뒤 어둠 속에서 머무는 시간(ms) — CSS의 4.8s와 맞춰 둔다

  function showEnding(){
    if(window.showEventTutorialOnce){
      window.showEventTutorialOnce("ending-catalog", "📖 묘생의 결말", "선택과 상태에 따라 엔딩이 달라져요. 도감에서 다른 결말도 찾아보세요.");
    }
    const result = computeEnding();
    let desc = result.desc;
    if(state.personality){
      desc += state.personality === "introvert"
        ? " 조용히 혼자만의 시간을 즐기는 내성적인 고양이였다."
        : " 누구에게나 스스럼없이 다가가는 외향적인 고양이였다.";
    }
    if(state.tributeDays > 0){
      desc += " 왕이 된 뒤에는 신하 고양이들이 바치는 조공을 받으며, 예상 수명(" + state.expectedDays + "일)보다 " + state.tributeDays + "일을 더 호화롭게 살았다.";
    }
    const endSeason = getSeason(state.day);
    const SEASON_END_LINES = {
      "봄": "벚꽃잎이 흩날리던 봄날, 따스한 햇살 아래에서 고양이는 조용히 눈을 감았다.",
      "장마": "빗소리가 자장가처럼 이어지던 장마철, 포근한 곳에 웅크린 채 고양이는 눈을 감았다.",
      "가을": "낙엽이 바스락거리던 가을 오후, 고양이는 마지막 낮잠에 들었다.",
      "겨울": "첫눈이 소복이 내리던 겨울날, 눈송이를 바라보던 고양이는 천천히 눈을 감았다."
    };
    const lastSpring = SEASON_FOLLOWS_STAGE && state.stageIdx === STAGES.length - 1 && endSeason.name === "봄";
    desc += " " + (lastSpring ? "긴 겨울을 이겨내고 맞이한 이듬해 봄, 흩날리는 벚꽃잎 아래에서 고양이는 조용히 눈을 감았다." : (SEASON_END_LINES[endSeason.name] || ""));
    earlyEnding(result.emoji, result.title, desc, result.key, endSeason, true);   // 수명을 다한 엔딩만 눈을 감으며 끝난다
  }

  /* ================= 도감 ================= */
  function renderDex(){
    dexGrid.innerHTML = "";
    ENDING_CATALOG.forEach(e=>{
      const got = discoveredEndings.has(e.key), isNew = newEndings.has(e.key);
      const card = document.createElement("div");
      card.className = "dex-card" + (got ? "" : " locked");
      card.innerHTML =
        `<span class="dex-badge ${isNew ? "new" : (got ? "got" : "no")}">${isNew ? "NEW" : (got ? "✔ 수집" : "미수집")}</span>` +
        `<div class="dex-emoji">${endIcon(e.key, e.emoji)}</div><div class="dex-title">${e.title}</div><div class="dex-hint">${e.hint}</div>` +
        (e.hidden ? `<span class="dex-tag">🔒 숨겨진 결말</span>` : "");
      dexGrid.appendChild(card);
    });
    dexCount.textContent = `총 ${ENDING_CATALOG.length}가지 결말 · 수집 ${discoveredEndings.size} / ${ENDING_CATALOG.length}`;
    renderSkillDex();
  }
  function openDex(){
    renderDex(); renderTributeBoxes(-1);
    dexOverlay.classList.add("show");
    setBackgroundInteractive(false);
  }
  function closeDex(){
    dexOverlay.classList.remove("show");
    newEndings.clear();
    setBackgroundInteractive(true);
  }
  dexBtn.addEventListener("click", openDex);
  dexCloseBtn.addEventListener("click", closeDex);
  document.getElementById("end-dex-btn").addEventListener("click", openDex);
  document.getElementById("dex-reset-btn").addEventListener("click", ()=>{
    if(!confirm("수집한 엔딩 기록을 모두 지울까요?")) return;
    discoveredEndings.clear(); newEndings.clear(); saveEndings(); gotTributes.clear(); saveTributes(); gotSkills.clear(); saveSkills(); renderDex(); renderTributeBoxes(-1);
  });
  window.addEventListener("keydown", e=>{
    if(e.key === "Escape" && dexOverlay.classList.contains("show")){ e.preventDefault(); closeDex(); }
  });

  /* ================= 입력 처리 ================= */
  const MOVE_KEYS = ["arrowup","arrowdown","arrowleft","arrowright","w","a","s","d"];
  function handleKey(e){
    const k = e.key.toLowerCase();
    // 이벤트 안내 창이 떠 있는 동안에는 이동·상호작용·컷신 넘기기 입력을 모두 무시한다
    if(window.__catroadTutorialPaused){
      if(MOVE_KEYS.includes(k) || k === " ") e.preventDefault();
      return;
    }
    if(MOVE_KEYS.includes(k)){
      if(roomInputAllowed()) e.preventDefault();
      keysDown[k] = true;
      return;
    }
    if((k === "1" || k === "2" || k === "3") && state && state.skills && roomInputAllowed()){
      e.preventDefault(); useActiveSkill(+k - 1); return;
    }
    if(k === " "){
      e.preventDefault();
      if(cutsceneActive()){ advanceCutscene(); return; }
      tryInteract();
    }
  }
  window.addEventListener("keydown", handleKey);
  window.addEventListener("keyup", (e)=>{
    keysDown[e.key.toLowerCase()] = false;
  });
  function clearMovementInput(){
    MOVE_KEYS.forEach(k=>{ keysDown[k] = false; });
    try{ if(window.__releaseTouchMove) window.__releaseTouchMove(); }catch(err){ console.warn("touch input release", err); }
  }
  function resumeRoomAfterFocus(){
    clearMovementInput();
    _roomGate.acc = 0; _roomGate.last = 0;
    if(!document.hidden){
      setTimeout(()=>{ try{ window.__refreshRoom(); }catch(err){} scheduleRoomTick(); }, 120);
    }
  }
  window.addEventListener("blur", clearMovementInput);
  window.addEventListener("pagehide", clearMovementInput);
  window.addEventListener("focus", resumeRoomAfterFocus);
  document.addEventListener("visibilitychange", ()=>{
    clearMovementInput();
    if(document.hidden){
      if(_roomGate.raf !== null) cancelAnimationFrame(_roomGate.raf);
      _roomGate.raf = null; _roomGate.acc = 0; _roomGate.last = 0;
    } else resumeRoomAfterFocus();
  });

  /* ================= 모바일 터치 조작: 화면 드래그로 이동 · 탭으로 선택/조사 (키보드 입력을 그대로 흉내 낸다) =================
     - 게임 화면 아무 데나 손가락을 대고 끌면 → 그 방향으로 걷는다 (손가락을 댄 자리가 조이스틱 중심이 된다)
     - 물건을 톡 탭하면 → 가까우면 바로 조사, 멀면 그쪽으로 걸어가서 조사
     - 화면 아래 말풍선(팝업)이나 고양이를 탭해도 가까운 물건을 조사한다 */
  (function setupTouchControls(){
    const IS_TOUCH = !!window.__IS_TOUCH;   // 컴퓨터(마우스 클릭)와 폰(터치) 모두 '누른 곳으로 걷기'를 쓴다
    const wrap = document.getElementById("room-wrap"), pop = document.getElementById("room-popup");
    if(!wrap) return;
    const DIRS = { up:"ArrowUp", down:"ArrowDown", left:"ArrowLeft", right:"ArrowRight" };
    const held = { up:false, down:false, left:false, right:false };
    const DRAG_PX = 8, DEAD = 10, RING_R = 40, TAP_MS = 500;
    function fire(type, key){ try{ window.dispatchEvent(new KeyboardEvent(type, { key:key, bubbles:true, cancelable:true })); }catch(e){} }
    function setDir(d, on){ if(held[d] === on) return; held[d] = on; fire(on ? "keydown" : "keyup", DIRS[d]); }
    function releaseAll(){ Object.keys(held).forEach(d=> setDir(d, false)); }
    // 방향 벡터 → 8방향 키 (22.5° 기준으로 가로/세로/대각선을 가른다)
    function applyDir(dx, dy, len){
      if(len < DEAD){ releaseAll(); return; }
      const ax = Math.abs(dx), ay = Math.abs(dy), K = 0.42;
      setDir("left",  dx < 0 && ax > ay*K);
      setDir("right", dx > 0 && ax > ay*K);
      setDir("up",    dy < 0 && ay > ax*K);
      setDir("down",  dy > 0 && ay > ax*K);
    }
    function interactNow(){ fire("keydown", " "); fire("keyup", " "); }   // Space와 똑같이 처리 (튜토리얼·컷신도 그대로 동작)

    // ----- 화면에 잠깐 나타나는 조이스틱 / 탭 표시 -----
    const stick = document.createElement("div"); stick.id = "tj-float"; stick.innerHTML = "<i></i>"; wrap.appendChild(stick);
    const knob = stick.firstChild;
    function showStick(x, y){ stick.style.left = x + "px"; stick.style.top = y + "px"; knob.style.transform = "translate(0,0)"; stick.classList.add("on"); }
    function moveStick(x, y, dx, dy){ stick.style.left = x + "px"; stick.style.top = y + "px"; knob.style.transform = "translate(" + dx + "px," + dy + "px)"; }
    function hideStick(){ stick.classList.remove("on"); }
    function ripple(x, y){ const r = document.createElement("i"); r.className = "tj-ripple"; r.style.left = x + "px"; r.style.top = y + "px"; wrap.appendChild(r); setTimeout(()=> r.remove(), 520); }

    // ----- 탭한 물건 쪽으로 자동으로 걸어가기 -----
    let auto = null;
    function cancelAuto(){ if(auto){ auto = null; releaseAll(); } }
    function startAutoWalk(idx){ const now = performance.now(); auto = { idx:idx, loc:state.currentLoc, start:now, lx:player.x, ly:player.y, lt:now }; }
    function startPointWalk(x, y){ const now = performance.now(); auto = { pt:{ x:x, y:y }, loc:state.currentLoc, start:now, lx:player.x, ly:player.y, lt:now }; }
    function autoStep(){
      if(!auto) return;
      if(auto.loc !== state.currentLoc){ cancelAuto(); return; }          // 다른 방으로 넘어가면 멈춘다
      if(auto.pt){
        if(!roomInputAllowed() || window.__catroadTutorialPaused){ cancelAuto(); return; }
        const S0 = uiScale(), ddx = auto.pt.x - player.x, ddy = auto.pt.y - player.y, dd = Math.hypot(ddx, ddy), n0 = performance.now();
        if(dd < 10*S0){ cancelAuto(); return; }
        if(Math.hypot(player.x - auto.lx, player.y - auto.ly) > 6*S0){ auto.lx = player.x; auto.ly = player.y; auto.lt = n0; }
        else if(n0 - auto.lt > 500){ cancelAuto(); return; }                // 막혀서 못 가는 곳이면 조용히 멈춘다
        if(n0 - auto.start > 8000){ cancelAuto(); return; }
        applyDir(ddx, ddy, dd);
        return;
      }
      const o = (state.roomObjects || [])[auto.idx];
      if(!o || o.consumed || !roomInputAllowed() || window.__catroadTutorialPaused){ cancelAuto(); return; }
      const S = uiScale(), dx = o.x - player.x, dy = o.y - player.y, d = Math.hypot(dx, dy), now = performance.now();
      if(d < 30*S){ cancelAuto(); interactNow(); return; }
      if(Math.hypot(player.x - auto.lx, player.y - auto.ly) > 6*S){ auto.lx = player.x; auto.ly = player.y; auto.lt = now; }   // 0.7초 넘게 제자리면 막힌 것
      else if(now - auto.lt > 700){ cancelAuto(); showToast("길이 막혀 있어요. 손가락으로 직접 움직여 보세요"); return; }
      if(now - auto.start > 8000){ cancelAuto(); return; }
      applyDir(dx, dy, d);
    }
    setInterval(autoStep, 40);

    // ----- 탭 처리 -----
    function handleTap(x, y){
      ripple(x, y);
      if(!roomInputAllowed()) return;
      const S = uiScale(), objs = state.roomObjects || [];
      let best = -1, bd = 1e9;
      objs.forEach((o, i)=>{ if(o.consumed || o.seasonHazard) return; const d = Math.hypot(o.x - x, o.y - y); if(d < bd){ bd = d; best = i; } });
      if(best >= 0 && bd <= (objs[best].item.key === "lover" ? 64 : 56)*S){ // 연인 전용 넓은 탭 영역
        if(nearbyIdx === best) interactNow(); else startAutoWalk(best);
        return;
      }
      if(loverNear && Math.hypot(loverMate.x - x, loverMate.y - y) < 52*S){ interactNow(); return; }   // 연인을 탭했다
      if(nearbyIdx >= 0 && Math.hypot(player.x - x, player.y - y) < 44*S){ interactNow(); return; }   // 고양이를 탭했다
      state._homeClick = 0;
      if(state.currentLoc === "home" && state.adopted && !state.homeInside && !state.jackpotRoom){   // 집을 눌렀다 → 문 앞까지 걸어가 들어간다
        const Lh = layoutFor("home"), ch = bgCover("home"), hx = (x - ch.ox)/ch.dw*100, hy = (y - ch.oy)/ch.dh*100;
        if(Lh && ((Lh.hole || []).some(sh=> inShape(sh, hx, hy)) || (Lh.enter && hx >= Lh.enter[0] && hx <= Lh.enter[2] && hy >= Lh.enter[1] && hy <= Lh.enter[3]))){
          state._homeClick = performance.now() + 8000;
          const dq = pctToXY("home", 50, 49); startPointWalk(dq.x, dq.y); return;
        }
      }
      startPointWalk(x, y);                                   // 빈 바닥을 눌렀다 → 그 자리로 걸어간다
    }

    // ----- 드래그 이동 -----
    let pid = null, sx = 0, sy = 0, ox = 0, oy = 0, t0 = 0, dragging = false;
    function rel(e){ const r = wrap.getBoundingClientRect(); return { x:e.clientX - r.left, y:e.clientY - r.top }; }
    wrap.addEventListener("pointerdown", e=>{
      if(e.pointerType === "mouse" || pid !== null) return;                  // 터치/펜 한 손가락만
      if(e.target.closest && e.target.closest("#room-popup")) return;        // 말풍선은 자기 탭 처리를 한다
      cancelAuto();
      pid = e.pointerId; const p = rel(e);
      sx = ox = p.x; sy = oy = p.y; t0 = performance.now(); dragging = false;
      try{ wrap.setPointerCapture(pid); }catch(_){}
      e.preventDefault();
    });
    wrap.addEventListener("pointermove", e=>{
      if(e.pointerId !== pid) return;
      e.preventDefault();
      const p = rel(e);
      if(!dragging){
        if(Math.hypot(p.x - sx, p.y - sy) < DRAG_PX) return;
        dragging = true; showStick(ox, oy);
      }
      let dx = p.x - ox, dy = p.y - oy, len = Math.hypot(dx, dy);
      if(len > RING_R){ dx = dx/len*RING_R; dy = dy/len*RING_R; len = RING_R; }   // 조이스틱 중심은 처음 누른 자리에 고정 (손가락을 따라오지 않는다)
      moveStick(ox, oy, dx, dy);
      applyDir(dx, dy, len);
    });
    function endPointer(e){
      if(e.pointerId !== pid) return;
      const wasDrag = dragging, dt = performance.now() - t0, p = rel(e);
      pid = null; dragging = false;
      releaseAll(); hideStick();
      try{ wrap.releasePointerCapture(e.pointerId); }catch(_){}
      if(e.type === "pointercancel" || wasDrag) return;
      if(dt <= TAP_MS) handleTap(p.x, p.y);
    }
    wrap.addEventListener("pointerdown", e=>{                                // 컴퓨터: 클릭한 곳으로 걷기
      if(e.pointerType !== "mouse" || e.button !== 0) return;
      if(e.target.closest && e.target.closest("#room-popup, #skill-dock, #skill-hud, button, a")) return;
      const p = rel(e); cancelAuto(); handleTap(p.x, p.y);
    });
    window.addEventListener("keydown", e=>{ if(e.isTrusted && auto && (e.key.indexOf("Arrow") === 0 || "wasd".indexOf(e.key.toLowerCase()) >= 0 && e.key.length === 1)) cancelAuto(); }, true);   // 키보드로 움직이면 자동 이동은 멈춘다
    wrap.addEventListener("pointerup", endPointer);
    wrap.addEventListener("pointercancel", endPointer);
    wrap.addEventListener("lostpointercapture", e=>{ if(e.pointerId === pid){ pid = null; dragging = false; releaseAll(); hideStick(); } });
    // 창 전환/포커스 이탈 시 눌린 채 남은 터치 방향과 자동 이동을 해제한다.
    window.__releaseTouchMove = function(){
      cancelAuto(); releaseAll(); hideStick();
      if(pid !== null){ try{ wrap.releasePointerCapture(pid); }catch(_){} }
      pid = null; dragging = false;
    };

    // 말풍선(팝업)을 탭해도 조사
    if(pop) pop.addEventListener("click", e=>{ e.preventDefault(); if(pop.classList.contains("show")) interactNow(); });

    // 창이 열려 이동 키가 초기화돼도, 손가락을 대고 있으면(또는 자동으로 걷는 중이면) 방향이 다시 적용된다
    setInterval(()=>{
      if(pid === null && !auto) return;
      Object.keys(held).forEach(d=>{ if(held[d] && !keysDown[DIRS[d].toLowerCase()]) fire("keydown", DIRS[d]); });
    }, 90);
    if(IS_TOUCH) ["contextmenu","gesturestart","dblclick"].forEach(t=> document.addEventListener(t, e=> e.preventDefault()));

    // 게임이 끝나거나 멈추면 입력 상태를 정리한다
    let wasOn = false;
    setInterval(()=>{
      let on = false;
      try{ on = !!(state && state.running && !state.gameOver); }catch(e){}
      if(on !== wasOn){ if(!on){ cancelAuto(); releaseAll(); hideStick(); } wasOn = on; }
    }, 250);
    // 안내 문구
    const pd = document.getElementById("popup-desc"); if(pd && IS_TOUCH) pd.textContent = "👆 탭해서 조사하기";
  })();
  /* 엔터 키는 아무 것도 실행하지 않는다 (포커스가 남은 버튼이 엔터로 눌리던 문제) */
  ["keydown","keyup","keypress"].forEach(t=>{
    window.addEventListener(t, e=>{ if(e.key === "Enter") e.preventDefault(); }, true);
  });
  // 마우스로 누른 버튼은 포커스를 풀어, 이후 키보드 입력에 다시 눌리지 않게 한다
  document.addEventListener("click", e=>{
    const b = e.target.closest && e.target.closest("button");
    if(b && e.detail > 0) setTimeout(()=> b.blur(), 0);
  }, true);

  /* ================= 시작/재시작 ================= */
  function startGame(){
    state = freshState();
    resetEventQueue();
    state.running = true;
    startOverlay.classList.remove("show");
    endOverlay.classList.remove("show");
    document.getElementById("end-fade").classList.remove("on");
    try{ document.getElementById("end-lids").classList.remove("on", "play"); }catch(err){}
    setBackgroundInteractive(true);
    bgPlayer.reset();
    ensureStormLoop();
    startFx();
    resizeRoomCanvas();
    enterRoom("home");
    renderKittenHud();
    renderAll();
    setTimeout(() => {
      if (typeof window.showTutorialIfNeeded === "function") {
        window.showTutorialIfNeeded();
      } else {
        // Defensive fallback: show the first instruction if the tutorial initializer failed.
        const panel = document.getElementById("tutorial-overlay");
        if (panel) panel.classList.add("show");
      }
    }, 900);
    if(!roomLoopStarted) roomLoopStarted = true;
    _roomGate.acc = 0; _roomGate.last = 0;
    scheduleRoomTick();
  }

  /* ================= 초보자 튜토리얼 ================= */

  /* 튜토리얼 카드를 게임 화면 위쪽(방 안쪽 상단)에 배치 */
  (function placeTutorialCard(){
    const ov = document.getElementById("tutorial-overlay");
    const card = ov && ov.querySelector(".tutorial-card");
    const room = document.getElementById("room-wrap");
    if(!ov || !card || !room) return;
    function place(){
      const r = room.getBoundingClientRect(), cw = card.offsetWidth || 440;
      const left = Math.max(16, Math.min(window.innerWidth - cw - 16, r.left + (window.innerWidth < 700 ? (r.width - cw)/2 : r.width*0.06)));
      card.style.left = left + "px";
      card.style.top = Math.max(8, r.top + 14) + "px";
    }
    new MutationObserver(place).observe(ov, { attributes:true, attributeFilter:["class"] });
    window.addEventListener("resize", place);
    place();
  })();
  (function initTutorial(){
    const SAVE_KEY = "catroad_tutorial_completed_v6";
    const overlay = document.getElementById("tutorial-overlay");
    const title = document.getElementById("tutorial-title");
    const desc = document.getElementById("tutorial-desc");
    const count = document.getElementById("tutorial-count");
    const status = document.getElementById("tutorial-status");
    const next = document.getElementById("tutorial-next");
    const skip = document.getElementById("tutorial-skip");
    let active = false;
    let step = 0;
    let moved = false;
    let interacted = false;
    let fadeTimer = null;
    let hideTimer = null;      // 페이드아웃 뒤 다음 단계로 넘기는 타이머 (겹침 방지용)
    let isFading = false;

    // 테스트용: 주소 끝에 ?resetTutorial 을 붙이면 저장된 튜토리얼 기록을 지운다
    try {
      if(/[?&]resetTutorial\b/.test(location.search)){
        const rm = [];
        for(let i = 0; i < localStorage.length; i++){
          const k = localStorage.key(i);
          if(k && (k === "catroad_tutorial_completed_v6" || k.indexOf("catroad_event_tutorial_v4:") === 0)) rm.push(k);
        }
        rm.forEach(k => localStorage.removeItem(k));
      }
    } catch(e) {}

    function clearTimers(){
      if(fadeTimer){ clearTimeout(fadeTimer); fadeTimer = null; }
      if(hideTimer){ clearTimeout(hideTimer); hideTimer = null; }
    }

    const steps = [
      {
        title:"골목을 걸어 보자",
        desc:'방향키 <span class="tutorial-key">↑</span> <span class="tutorial-key">↓</span> <span class="tutorial-key">←</span> <span class="tutorial-key">→</span> 또는 <span class="tutorial-key">W</span><span class="tutorial-key">A</span><span class="tutorial-key">S</span><span class="tutorial-key">D</span>를 눌러 고양이를 움직여 봐.',
        status:"이동하면 자동으로 다음 단계로 넘어가요"
      },
      {
        title:"주변을 살펴보자",
        desc:'주변 오브젝트 가까이에서 <span class="tutorial-key">Space</span>를 눌러 조사하거나 상호작용해 봐.',
        status:"Space를 누르면 튜토리얼이 끝나요"
      }
    ];

    function wasCompleted(){
      try {
        return localStorage.getItem(SAVE_KEY) === "1";
      } catch(e) {
        return false;
      }
    }
    function saveCompleted(){
      try { localStorage.setItem(SAVE_KEY, "1"); } catch(e) {}
    }
    function renderStep(){
      const item = steps[step];
      if(!item) return finish();
      clearTimers();
      isFading = false;
      overlay.classList.remove("fade-out");
      count.textContent = "기본 조작 · " + (step+1) + "/" + steps.length;
      title.textContent = item.title;
      desc.innerHTML = window.__IS_TOUCH ? (step === 0 ? "화면 아무 데나 <b>손가락으로 끌어서</b> 고양이를 걷게 해 봐." : "물건을 <b>톡 탭</b>하거나 가까이에서 말풍선을 눌러 상호작용해 봐.") : item.desc;
      status.textContent = (window.__IS_TOUCH && step === 1) ? "물건을 탭하면 튜토리얼이 끝나요" : item.status;
      next.disabled = true;
      next.textContent = step === steps.length-1 ? "완료" : "다음";
    }
    function fadeAfterAction(){
      if(isFading || !active) return;
      isFading = true;
      next.disabled = false;     // 행동을 마치면 '다음/완료' 버튼으로 바로 넘어갈 수 있게
      status.textContent = "잠시 후 안내가 사라져요";
      fadeTimer = setTimeout(() => {
        fadeTimer = null;
        if(!active) return;
        overlay.classList.add("fade-out");
        hideTimer = setTimeout(() => {
          hideTimer = null;
          if(active){
            if(step < steps.length - 1){
              step += 1;
              renderStep();
            } else {
              finish();
            }
          }
        }, 700);
      }, 3000);
    }
    function showTutorialIfNeeded(){
      // 새 게임을 시작할 때마다 기본 조작 안내를 보여준다.
      // 이전 테스트에서 완료 기록이 저장되어 있어도 오프닝 이후 안내가 생략되지 않게 한다.
      active = true;
      step = 0;
      moved = false;
      interacted = false;
      renderStep();
      overlay.classList.remove("fade-out");
      overlay.classList.add("show");
    }
    function finish(){
      active = false;
      // 기본 조작 안내는 일시정지 상태를 소유하지 않는다.
      clearTimers();
      overlay.classList.remove("fade-out");
      overlay.classList.remove("show");
      saveCompleted();
    }
    function skipTutorial(){
      finish();
    }
    function onGameKey(e){
      if(!active || !state || !state.running) return;
      if(window.__catroadTutorialPaused) return;   // 이벤트 안내 창이 떠 있으면 조작으로 치지 않는다
      if(e.repeat) return;
      // 컷신·미니게임·모달 중처럼 실제로 움직일 수 없을 때의 입력은 조작으로 치지 않는다
      if(typeof roomInputAllowed === "function" && !roomInputAllowed()) return;
      // 입력을 가로채지 않고 관찰만 하므로 이동/상호작용은 정상 작동한다.
      const key = (e.key || "").toLowerCase();
      if(step === 0 && ["arrowup","arrowdown","arrowleft","arrowright","w","a","s","d"].includes(key)){
        if(!moved){
          moved = true;
          fadeAfterAction();
        }
      } else if(step === 1 && (key === " " || key === "spacebar")){
        if(!interacted){
          interacted = true;
          fadeAfterAction();
        }
      }
    }
    skip.addEventListener("click", skipTutorial);
    next.addEventListener("click", () => {
      if(!active) return;
      clearTimers();
      if(step === 0 && moved){ step = 1; renderStep(); }
      else if(step === 1 && interacted) finish();
    });
    window.addEventListener("keydown", onGameKey, true);
    window.showTutorialIfNeeded = showTutorialIfNeeded;
  })();

  /* ================= 이벤트별 튜토리얼: 종류마다 한 번만 표시 ================= */
  (function initEventTutorials(){
    const PREFIX = "catroad_event_tutorial_v4:";
    window.__catroadTutorialPaused = false;
    let overlay = null;
    let activeTutorial = null;
    const pending = [];
    function alreadySeen(id){
      try { return localStorage.getItem(PREFIX + id) === "1"; } catch(e) { return false; }
    }
    function markSeen(id){
      try { localStorage.setItem(PREFIX + id, "1"); } catch(e) {}
    }
    function ensureOverlay(){
      if(overlay) return overlay;
      overlay = document.createElement("div");
      overlay.id = "event-tutorial-overlay";
      overlay.innerHTML = '<div class="event-tutorial-card" role="dialog" aria-modal="true" aria-labelledby="event-tutorial-title"><div class="event-tutorial-kicker">🐾 묘적 플레이 안내</div><h2 id="event-tutorial-title"></h2><div id="event-tutorial-desc"></div><button id="event-tutorial-close" type="button">알겠어!</button></div>';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;padding:20px;background:transparent;font-family:inherit;';
      const style = document.createElement("style");
      style.textContent = '#event-tutorial-overlay .event-tutorial-card{box-sizing:border-box;width:min(440px,100%);padding:25px 23px 20px;border:2px solid #d9c8f4;border-radius:22px;background:#fffaf1;color:#342b40;box-shadow:0 18px 55px #0005;text-align:center}#event-tutorial-overlay .event-tutorial-kicker{font-size:12px;letter-spacing:.08em;color:#8b6ab4;font-weight:800;margin-bottom:9px}#event-tutorial-overlay h2{font-size:23px;line-height:1.3;margin:0 0 13px}#event-tutorial-overlay #event-tutorial-desc{font-size:15px;line-height:1.8;text-align:left;white-space:pre-line}#event-tutorial-overlay button{display:block;margin:20px auto 0;border:0;border-radius:999px;background:#8d70bd;color:#fff;font:inherit;font-weight:800;padding:11px 27px;cursor:pointer}#event-tutorial-overlay button:focus-visible{outline:3px solid #342b40;outline-offset:3px}#event-tutorial-overlay #event-tutorial-desc.rich{white-space:normal}#event-tutorial-overlay .et-lead{margin:0 0 12px;font-size:16px}#event-tutorial-overlay .et-chain{margin:0 0 12px;padding:13px 16px;border-radius:14px;background:#efe6fa}#event-tutorial-overlay .et-chain-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;font-size:16px;font-weight:700}#event-tutorial-overlay .et-chain-row i{font-style:normal;color:#8b6ab4;font-weight:400}#event-tutorial-overlay .et-chain-sub{margin-top:7px;font-size:13px;color:#625a70}#event-tutorial-overlay .et-rule{margin:0;font-size:14px;line-height:1.7}';
      document.head.appendChild(style);
      document.body.appendChild(overlay);
      overlay.addEventListener('keydown', e=>{ if(e.key !== 'Tab') { e.preventDefault(); e.stopPropagation(); } }, true);
      overlay.addEventListener('pointerdown', e=>{ if(!e.target.closest('button')) { e.preventDefault(); e.stopPropagation(); } }, true);
      overlay.querySelector('#event-tutorial-close').addEventListener('click', ()=>{
        if(activeTutorial) markSeen(activeTutorial.id);
        activeTutorial = null;
        overlay.style.display = 'none';
        window.__catroadTutorialPaused = false;
        showNext();
      });
      return overlay;
    }
    function showNext(){
      if(activeTutorial || !pending.length) return;
      const item = pending.shift();
      if(alreadySeen(item.id)) return showNext();
      const el = ensureOverlay();
      activeTutorial = item;
      window.__catroadTutorialPaused = true;
      el.querySelector('#event-tutorial-title').textContent = item.title;
      const descEl = el.querySelector('#event-tutorial-desc');
      // htmlBody 는 이 파일 안에서 직접 만든 고정 문구만 넘긴다 (사용자 입력 아님)
      if(item.html){ descEl.innerHTML = item.html; descEl.classList.add('rich'); }
      else { descEl.textContent = item.body; descEl.classList.remove('rich'); }
      el.style.display = 'flex';
    }
    window.showEventTutorialOnce = function(id, titleText, bodyText, htmlBody){
      if(alreadySeen(id) || (activeTutorial && activeTutorial.id === id) || pending.some(item=>item.id === id)) return false;
      pending.push({id, title:titleText, body:bodyText, html:htmlBody || ""});
      showNext();
      return true;
    };
  })();

  /* ================= 아이콘 시스템: 이모지를 일러스트 아이콘으로 바꿔 보여준다 ================= */
  (function initIcons(){
    const ICONS = {"pin":__IMG.ICONS_pin,"map":__IMG.ICONS_map,"signpost":__IMG.ICONS_signpost,"flag":__IMG.ICONS_flag,"arrow_r":__IMG.ICONS_arrow_r,"compass":__IMG.ICONS_compass,"face_sleepy":__IMG.ICONS_face_sleepy,"face_shock":__IMG.ICONS_face_shock,"face_tired":__IMG.ICONS_face_sleepy,"face_eat":__IMG.ICONS_face_eat,"dust":__IMG.ICONS_dust,"meal":__IMG.ICONS_meal,"skip":__IMG.ICONS_skip,"affection":__IMG.ICONS_affection,"autumn":__IMG.ICONS_autumn,"baby":__IMG.ICONS_baby,"bandage":__IMG.ICONS_bandage,"bee":__IMG.ICONS_bee,"blackcat":__IMG.ICONS_blackcat,"bolt":__IMG.ICONS_bolt,"bouquet":__IMG.ASSET_IMG_skill_bouquet,"bug":__IMG.ICONS_bug,"calendar":__IMG.ICONS_calendar,"can":__IMG.ICONS_can,"cap":__IMG.ICONS_cap,"car_blue":__IMG.ICONS_car_blue,"car_red":__IMG.ICONS_car_red,"cash":__IMG.ICONS_cash,"catgrass":__IMG.ICONS_catgrass,"chat":__IMG.ICONS_chat,"check":__IMG.ICONS_check,"churu":__IMG.ICONS_churu,"churu_premium":__IMG.ICONS_churu_premium,"clean":__IMG.ICONS_clean,"clover":__IMG.ICONS_clover,"construction":__IMG.ICONS_construction,"controller":__IMG.ICONS_controller,"crash":__IMG.ICONS_crash,"dex":__IMG.ICONS_dex,"dirty":__IMG.ICONS_dirty,"dog":__IMG.ICONS_dog,"eyes":__IMG.ICONS_eyes,"face1":__IMG.ICONS_face1,"face2":__IMG.ICONS_face_eat,"face3":__IMG.ICONS_face3,"face4":__IMG.ICONS_face_sleepy,"face6":__IMG.ICONS_face6,"fail":__IMG.ICONS_fail,"faint":__IMG.ICONS_faint,"feather":__IMG.ICONS_feather,"feeder":__IMG.ICONS_feeder,"fight":__IMG.ICONS_fight,"fire":__IMG.ICONS_fire,"fire_search":__IMG.ICONS_fire_search,"fish":__IMG.ICONS_fish,"fishbone":__IMG.ICONS_fishbone,"foot":__IMG.ICONS_foot,"fun":__IMG.ICONS_fun,"growl":__IMG.ICONS_growl,"heart0":__IMG.ICONS_heart0,"heart1":__IMG.ICONS_heart1,"heart2":__IMG.ICONS_heart2,"heart3":__IMG.ICONS_heart3,"heart4":__IMG.ICONS_heart4,"here":__IMG.ICONS_here,"home":__IMG.ICONS_home,"housing":__IMG.ICONS_housing,"hunger":__IMG.ICONS_hunger,"kibble":__IMG.ICONS_hunger,"kids":__IMG.ICONS_kids,"kiss":__IMG.ICONS_kiss,"lock":__IMG.ICONS_lock,"lot":__IMG.ICONS_lot,"love":__IMG.ICONS_affection,"lover":__IMG.ICONS_face_eat,"magnifier":__IMG.ICONS_magnifier,"market":__IMG.ICONS_market,"market_st":__IMG.ICONS_market_st,"milk":__IMG.ICONS_milk,"miss":__IMG.ICONS_miss,"moneybag":__IMG.ICONS_moneybag,"mouse":__IMG.ICONS_mouse,"mouse_toy":__IMG.ICONS_mouse_toy,"muscle":__IMG.ICONS_muscle,"nose":__IMG.ICONS_nose,"paper":__IMG.ICONS_paper,"park":__IMG.ICONS_park,"party":__IMG.ICONS_party,"paw":__IMG.ICONS_paw,"pig":__IMG.ICONS_pig,"playground":__IMG.ICONS_playground,"pushy":__IMG.ICONS_pushy,"quiet":__IMG.ICONS_quiet,"rain":__IMG.ICONS_rain,"rainy":__IMG.ICONS_rainy,"road":__IMG.ICONS_road,"scroll":__IMG.ICONS_foot,"shelter":__IMG.ICONS_shelter,"shrimp":__IMG.ICONS_shrimp,"sparrow":__IMG.ICONS_sparrow,"spring":__IMG.ICONS_spring,"sprout":__IMG.ICONS_sprout,"stare":__IMG.ICONS_stare,"stream":__IMG.ICONS_stream,"success":__IMG.ICONS_success,"sweat":__IMG.ICONS_sweat,"taxi":__IMG.ICONS_taxi,"trap":__IMG.ICONS_trap,"tribute":__IMG.ICONS_tribute,"trophy":__IMG.ICONS_trophy,"truck":__IMG.ICONS_truck,"unknown":__IMG.ICONS_unknown,"warn":__IMG.ICONS_warn,"wet":__IMG.ICONS_wet,"winter":__IMG.ICONS_winter,"wx_cloud":__IMG.ICONS_wx_cloud,"wx_partly":__IMG.ICONS_wx_partly,"wx_storm":__IMG.ICONS_wx_storm,"wx_sun":__IMG.ICONS_wx_sun,"alley":__IMG.ICONS_alley,"secret_base":__IMG.ICONS_secret_base,"dead_bug":__IMG.ICONS_dead_bug,"face_smug":__IMG.ICONS_face_sleepy,"face_deadpan":__IMG.ICONS_face_sleepy,"face_dizzy":__IMG.ICONS_face_shock,"moon":__IMG.ICONS_moon,"exclaim":__IMG.ICONS_exclaim,"touch":__IMG.ICONS_touch,"keyboard":__IMG.ICONS_keyboard,"owner":__IMG.ICONS_owner
};
    const MAP = [["📍","pin"],["🧭","compass"],["🗺️","map"],["🗺","map"],["🪧","signpost"],["🚩","flag"],["🧱","secret_base"],["🪲","dead_bug"],["😏","face_smug"],["😐","face_deadpan"],["😵‍💫","face_dizzy"],["🌙","moon"],["❗","exclaim"],["📱","touch"],["👆","touch"],["⌨️","keyboard"],["😴", "face_sleepy"], ["😱", "face_shock"], ["🥱", "face_tired"], ["😋", "face_eat"], ["🪨", "dust"], ["🍽️", "meal"], ["⏭", "skip"], ["🍖", "hunger"], ["🧶", "fun"], ["💜", "affection"], ["🤍", "heart0"], ["🩷", "heart1"], ["❤️", "heart2"], ["💖", "heart3"], ["💞", "heart4"], ["💕", "love"], ["☀️", "wx_sun"], ["⛅", "wx_partly"], ["☁️", "wx_cloud"], ["⛈️", "wx_storm"], ["📖", "dex"], ["👑", "tribute"], ["🐾", "paw"], ["📅", "calendar"], ["🌸", "spring"], ["☔", "rainy"], ["🍂", "autumn"], ["❄️", "winter"], ["🌳", "park"], ["🎠", "playground"], ["🛒", "market"], ["🏘️", "housing"], ["🏪", "market_st"], ["🌾", "lot"], ["🏠", "home"], ["🛣️", "road"], ["🌊", "stream"], ["📦", "shelter"], ["📍", "here"], ["🌫️", "fire_search"], ["🥣", "kibble"], ["🍗", "wet"], ["🥫", "can"], ["🐟", "fish"], ["🦴", "fishbone"], ["🍬", "churu_premium"], ["🍭", "churu"], ["🥛", "milk"], ["🦐", "shrimp"], ["🖱️", "mouse_toy"], ["🌿", "catgrass"], ["🪶", "feather"], ["🦗", "bug"], ["🐦", "sparrow"], ["💐", "bouquet"], ["🪤", "trap"], ["🐕", "dog"], ["🐝", "bee"], ["🕳️", "dirty"], ["🧍", "pushy"], ["😘", "kiss"], ["👵","owner"], ["🧑‍🍳", "feeder"], ["💵", "cash"], ["📄", "paper"], ["🧻", "paper"], ["🍃", "quiet"], ["🌺", "clean"], ["❓", "unknown"], ["❔", "unknown"], ["😻", "lover"], ["😺", "face1"], ["😽", "face2"], ["😿", "face3"], ["😼", "face4"], ["😾", "face6"], ["🐱", "face1"], ["🐈", "face1"], ["🌆", "alley"], ["🐈‍⬛", "blackcat"], ["🚗", "car_red"], ["🚙", "car_blue"], ["🚕", "taxi"], ["🚚", "truck"], ["🚸", "kids"], ["⚠️", "warn"], ["💥", "crash"], ["❌", "fail"], ["💨", "miss"], ["✨", "success"], ["🗣️", "growl"], ["👁️", "stare"], ["⚔️", "fight"], ["🥴", "faint"], ["😵", "faint"], ["👀", "eyes"], ["💦", "sweat"], ["⚡", "bolt"], ["🏆", "trophy"], ["🧢", "cap"], ["🧭", "compass"], ["🩹", "bandage"], ["👶", "baby"], ["🐽", "pig"], ["🌧️", "rain"], ["💰", "moneybag"], ["🍀", "clover"], ["💪", "muscle"], ["🎉", "party"], ["🌱", "sprout"], ["🔥", "fire"], ["🏗️", "construction"], ["💬", "chat"], ["👃", "nose"], ["👣", "foot"], ["🎮", "controller"], ["🔎", "magnifier"], ["📜", "scroll"], ["🔒", "lock"], ["✔", "check"]];
    const st = document.createElement("style");
    st.textContent = Object.keys(ICONS).map(k => `.ic[data-k="${k}"]{background-image:url(${ICONS[k]})}`).join("\n");
    document.head.appendChild(st);
    const norm = s => s.replace(/\uFE0F/g, "");
    const dict = new Map(MAP.map(([e,k]) => [norm(e), k]));
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pat = [...dict.keys()].sort((a,b) => b.length - a.length).map(esc).join("|") + "";
    const RE_G = new RegExp("(?:" + pat + ")\\uFE0F?", "g");
    const RE_T = new RegExp("(?:" + pat + ")");
    const SKIP = ".ic,script,style,textarea,option,title";
    function iconifyText(tn){
      const s = tn.nodeValue;
      if(!s || s.search(RE_T) < 0) return;
      const p = tn.parentNode;
      if(!p || p.nodeType !== 1 || (p.closest && p.closest(SKIP))) return;
      const inMouseKey = !!p.closest("kbd.mouse");
      const frag = document.createDocumentFragment();
      let last = 0, m; RE_G.lastIndex = 0;
      while((m = RE_G.exec(s))){
        if(m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
        let k = dict.get(norm(m[0]));
        if(k === "mouse_toy" && inMouseKey) k = "mouse";
        const sp = document.createElement("span");
        sp.className = "ic"; sp.dataset.k = k; sp.setAttribute("aria-label", m[0]); sp.setAttribute("role", "img");   // 숨은 원본 이모지 글리프를 제거하여 잔상 방지
        frag.appendChild(sp); last = RE_G.lastIndex;
      }
      if(last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
      p.replaceChild(frag, tn);
    }
    function scan(root){
      if(root.nodeType === 3){ iconifyText(root); return; }
      if(root.nodeType !== 1 || (root.closest && root.closest(SKIP))) return;
      const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const list = []; while(tw.nextNode()) list.push(tw.currentNode);
      list.forEach(iconifyText);
    }
    scan(document.body);
    new MutationObserver(ms => {
      for(const m of ms){
        if(m.type === "characterData") iconifyText(m.target);
        else m.addedNodes.forEach(scan);
      }
    }).observe(document.body, { childList:true, subtree:true, characterData:true });

    /* --- 캔버스용: 같은 아이콘을 이미지로 그린다 (부드러운 흰색 발광) --- */
    const IMGS = {};
    Object.keys(ICONS).forEach(k => { const i = new Image(); i.src = ICONS[k]; IMGS[k] = i; });
    const pxOf = ctx => parseFloat((/(\d+(?:\.\d+)?)px/.exec(ctx.font) || [])[1]) || 16;
    window.emoDraw = function(ctx, str, x, y){
      const k = dict.get(norm(str)), im = k && IMGS[k];
      if(im && im.complete && im.naturalWidth){
        const s = pxOf(ctx) * 1.18 * (k === "face_sleepy" || k === "face_shock" ? 1.22 : 1);
        ctx.save(); ctx.shadowColor = "rgba(255, 255, 255, 0.98)"; ctx.shadowBlur = Math.max(8, s * 0.58);
        ctx.drawImage(im, x - s/2, y - s/2 - (k === "face_sleepy" || k === "face_shock" ? s*0.125 : 0), s, s); ctx.restore(); return true;
      }
      ctx.fillText(str, x, y); return false;
    };
    window.emoDrawMixed = function(ctx, text, x, y){
      const px = pxOf(ctx), isz = px * 1.18, parts = []; let last = 0, m, total = 0;
      RE_G.lastIndex = 0;
      while((m = RE_G.exec(text))){
        if(m.index > last){ const t = text.slice(last, m.index); parts.push({ t }); total += ctx.measureText(t).width; }
        parts.push({ k:dict.get(norm(m[0])), s:m[0] }); total += isz; last = RE_G.lastIndex;
      }
      if(last < text.length){ const t = text.slice(last); parts.push({ t }); total += ctx.measureText(t).width; }
      const al = ctx.textAlign;
      let cx = al === "center" ? x - total/2 : (al === "right" ? x - total : x);
      ctx.textAlign = "left";
      parts.forEach(p => {
        if(p.t != null){ ctx.fillText(p.t, cx, y); cx += ctx.measureText(p.t).width; }
        else {
          const im = IMGS[p.k];
          if(im && im.complete && im.naturalWidth){
            ctx.save(); ctx.shadowColor = "rgba(255, 255, 255, 0.98)"; ctx.shadowBlur = Math.max(8, isz * 0.58);
            ctx.drawImage(im, cx, y - isz/2, isz, isz); ctx.restore();
          } else ctx.fillText(p.s, cx, y);
          cx += isz;
        }
      });
      ctx.textAlign = al;
    };
  })();

  /* ================= 오프닝 일러스트 효과 (별 · 해 · 구름 · 창문 · 비콘) ================= */
  (function initOpeningArt(){
    const fx = document.getElementById("op-fx"); if(!fx) return;
    const W = 1840, H = 855, px = v => (v / W * 100).toFixed(3) + "%", py = v => (v / H * 100).toFixed(3) + "%";
    let seed = 23; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const add = (cls, css) => { const e = document.createElement("i"); e.className = cls; e.style.cssText = css; fx.appendChild(e); return e; };
    // 지는 해의 빛이 숨 쉬듯 일렁인다
    add("fx-sun", `left:${px(580)};top:${py(452)};width:${px(400)};aspect-ratio:1;`);
    // 하늘의 구름 결이 천천히 흘러간다
    [[8,16,110,-20],[20,13,140,-70],[30,18,125,-5],[14,15,160,-110]].forEach(([top,wd,dur,delay]) => {
      add("fx-cloud", `left:-30%;top:${top}%;width:${wd*1.6}%;height:${wd*.42}%;animation-duration:${dur}s;animation-delay:${delay}s;`);
    });
    // 초가집 굴뚝 연기
    // 창문 불빛: 따뜻하게 깜빡인다
    add("fx-glow", `left:${px(1690)};top:${py(505)};width:${px(240)};aspect-ratio:1;animation-duration:4.5s;`);
    
    // 들판 위로 떠오르는 빛 알갱이
    for(let i=0;i<14;i++) add("fx-dust", `left:${px(200 + rnd()*1500)};top:${py(560 + rnd()*260)};width:${px(4 + rnd()*3)};aspect-ratio:1;animation-duration:${(7 + rnd()*7).toFixed(1)}s;animation-delay:${(-rnd()*12).toFixed(1)}s;`);
  })();

  /* ================= 오프닝 (타이틀 / 인트로 / 안내) ================= */
  (function initOpening(){
    const $ = id => document.getElementById(id);
    const scenes = { title:$("op-title"), intro:$("op-intro"), rules:$("op-rules") };
    const lineEl = $("op-line"), dotsEl = $("op-dots");
    const INTRO = [
      "화려하지 않아도, 강하지 않아도 되는 가장 작은 존재의 하루.",
      "당신의 고양이는 어떤 일생을 남길까요?"
    ];
    const INTRO_PAGE = INTRO.join("\n");
    let cur = "title", idx = 0, lock = false;

    /* --- 장식: 별 · 반딧불 · 동네 실루엣 (고정 시드로 항상 같은 풍경) --- */
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const stars = $("op-stars");
    for(let i=0;stars && i<46;i++){
      const s = document.createElement("i");
      s.style.cssText = `left:${rnd()*100}%;top:${rnd()*42}%;animation-delay:${(rnd()*3.4).toFixed(2)}s;`;
      stars.appendChild(s);
    }
    const flies = $("op-flies");
    for(let i=0;i<12;i++){
      const f = document.createElement("div");
      f.className = "op-fly";
      f.style.cssText = `left:${8+rnd()*84}%;bottom:${6+rnd()*30}%;animation-duration:${(5+rnd()*5).toFixed(1)}s;animation-delay:${(rnd()*8).toFixed(1)}s;`;
      flies.appendChild(f);
    }
    function skyline(gid, base, minH, maxH, wins){
      const g = $(gid); if(!g) return; let x = -20, html = "";
      while(x < 1020){
        const w = 46 + rnd()*62, h = minH + rnd()*(maxH-minH), top = base - h;
        html += `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"/>`;
        if(rnd() > .45){
          const r = 14 + rnd()*14;
          html += `<polygon points="${(x-4).toFixed(1)},${top.toFixed(1)} ${(x+w/2).toFixed(1)},${(top-r).toFixed(1)} ${(x+w+4).toFixed(1)},${top.toFixed(1)}"/>`;
        }
        if(wins){
          for(let wy = top+14; wy < base-12; wy += 24){
            for(let wx = x+10; wx < x+w-12; wx += 22){
              if(rnd() > .62)
                html += `<rect class="op-win" style="animation-delay:${(rnd()*5).toFixed(1)}s" x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="7" height="10" rx="1" fill="#FFD98A"/>`;
            }
          }
        }
        x += w + 2 + rnd()*8;
      }
      g.innerHTML = html + `<rect x="-20" y="${base-6}" width="1040" height="${400-base+10}"/>`;
    }
    skyline("op-far", 330, 70, 120, false);
    skyline("op-mid", 350, 50, 105, true);
    function renderOpEnds(){ try{ const g=$("op-end-grid"); g.innerHTML = ENDING_CATALOG.map(e=>{ const got=discoveredEndings.has(e.key); return `<div class="e${got?"":" lock"}"><span class="ei">${endIcon(e.key,e.emoji)}</span>${e.title}</div>`; }).join(""); $("op-end-count").textContent = "· "+discoveredEndings.size+" / "+ENDING_CATALOG.length; }catch(e){} }
    renderOpEnds(); window.__renderOpEnds = renderOpEnds;

    /* --- 장면 전환 --- */
    window.__opGo = go;
    function go(name){
      cur = name;
      Object.keys(scenes).forEach(k => scenes[k].classList.toggle("on", k === name));
      startOverlay.classList.toggle("mood-intro", name === "intro");
      startOverlay.classList.toggle("mood-guide", name === "rules");
      if(name === "intro"){ idx = 0; showLine(); }
    }
    function showLine(){
      lineEl.classList.remove("in");
      void lineEl.offsetWidth;
      lineEl.textContent = INTRO_PAGE;
      lineEl.classList.add("in");
      dotsEl.innerHTML = "";
    }
    function advance(){
      if(lock) return;
      lock = true; setTimeout(()=> lock = false, 350);   // 연타로 대사를 건너뛰지 않도록
      if(cur === "title") go("intro");
      else if(cur === "intro"){ go("rules"); }
    }

    $("op-begin").addEventListener("click", advance);
    scenes.intro.addEventListener("click", e => { if(!e.target.closest("#op-skip")) advance(); });
    $("op-skip").addEventListener("click", () => go("rules"));

    // 오프닝이 떠 있는 동안에는 키 입력을 오프닝이 먼저 가져간다
    $("op-dex").addEventListener("click", openDex);
    $("op-dex2").addEventListener("click", openDex);
    window.addEventListener("keydown", e => {
      if(dexOverlay.classList.contains("show")) return;
      if(!startOverlay.classList.contains("show") || startOverlay.classList.contains("gone")) return;
      if(e.key === " " || e.key === "ArrowRight"){
        e.preventDefault(); e.stopPropagation();
        if(cur !== "rules") advance();
      } else if(e.key === "ArrowLeft" && cur === "rules"){
        e.preventDefault(); e.stopPropagation(); go("sky");
      }
    }, true);

    // 게임이 시작되어 페이드아웃이 끝나면 완전히 제거(애니메이션 비용 절약)
    startOverlay.addEventListener("transitionend", e => {
      if(e.target === startOverlay && !startOverlay.classList.contains("show")) startOverlay.classList.add("gone");
    });
  })();

  // 상단 왼쪽 제목(묘적)을 누르면 맨 처음 오프닝 화면으로 돌아간다
  // 브라우저 confirm()은 미리보기(iframe) 환경에서 막혀 조용히 "취소"가 되므로, 게임 안에 확인 창을 직접 띄운다
  function askConfirm(msg, onYes){
    if(document.getElementById("home-confirm")) return;
    const wrap = document.createElement("div");
    wrap.id = "home-confirm";
    wrap.style.cssText = "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(40,25,50,.55);padding:20px;";
    wrap.innerHTML = '<div role="alertdialog" aria-modal="true" style="background:#FFFBF4;border-radius:18px;padding:24px 26px 20px;max-width:340px;width:100%;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.35);font-family:inherit;color:#4A3A52;">'
      + '<div style="font-size:30px;margin-bottom:6px">\uD83D\uDC3E</div>'
      + '<div style="font-size:16px;font-weight:700;line-height:1.5;margin-bottom:18px;white-space:pre-line"></div>'
      + '<div style="display:flex;gap:10px;justify-content:center">'
      + '<button type="button" data-no style="flex:1;padding:10px 0;border-radius:12px;border:1.5px solid #D9CFE0;background:#fff;color:#6A5A72;font:inherit;font-weight:700;cursor:pointer">계속하기</button>'
      + '<button type="button" data-yes style="flex:1;padding:10px 0;border-radius:12px;border:0;background:#F08A5D;color:#fff;font:inherit;font-weight:700;cursor:pointer">처음으로</button>'
      + '</div></div>';
    wrap.querySelector("div > div:nth-child(2)").textContent = msg;
    const close = () => { wrap.remove(); document.removeEventListener("keydown", onKey, true); };
    const onKey = e => { if(e.key === "Escape"){ e.stopPropagation(); close(); } };
    wrap.querySelector("[data-no]").addEventListener("click", close);
    wrap.querySelector("[data-yes]").addEventListener("click", () => { close(); onYes(); });
    wrap.addEventListener("click", e => { if(e.target === wrap) close(); });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(wrap);
    wrap.querySelector("[data-yes]").focus();
  }
  function goHome(){
    if(state && state.running && !state.gameOver){
      askConfirm("처음 화면으로 돌아갈까요?\n진행 중인 여정은 사라져요.", doGoHome);
      return;
    }
    doGoHome();
  }
  function doGoHome(){
    clearToasts();
    if(state){ state.running = false; state.minigame = false; }
    try{ resetEventQueue(); }catch(err){}
    [endOverlay, dexOverlay].forEach(o=> o && o.classList.remove("show"));
    try{ document.getElementById("end-fade").classList.remove("on"); document.getElementById("end-lids").classList.remove("on", "play"); }catch(err){}
    startOverlay.classList.remove("gone"); void startOverlay.offsetWidth; startOverlay.classList.add("show");
    window.__opGo("title");
    setBackgroundInteractive(false);
  }
  const homeTitle = document.getElementById("home-title");
  homeTitle.addEventListener("click", goHome);
  homeTitle.addEventListener("keydown", e=>{ if(e.key === "Enter"){ e.preventDefault(); goHome(); } });
  startBtn.addEventListener("click", startGame);

  restartBtn.addEventListener("click", startGame);

  /* ================= 배경 음악: 음악 파일 없이 Web Audio로 장소마다 다른 분위기를 실시간 합성 ================= */
  const Music = (function(){
    const PREF = "catroad_music_v1";
    let ctx = null, master = null, comp = null, reverb = null, noiseBuf = null, sfxBus = null, sfxSend = null;
    let muted = false, volume = 0.7, unlocked = false, curName = null, tickTimer = null;
    const insts = [];
    try{ const p = JSON.parse(localStorage.getItem(PREF) || "{}"); if(typeof p.muted === "boolean") muted = p.muted; if(typeof p.volume === "number") volume = Math.max(0, Math.min(1, p.volume)); }catch(e){}
    function savePref(){ try{ localStorage.setItem(PREF, JSON.stringify({ muted, volume })); }catch(e){} }

    /* ---------- 음계 ---------- */
    const SC = { maj:[0,2,4,5,7,9,11], min:[0,2,3,5,7,8,10], dor:[0,2,3,5,7,9,10], mix:[0,2,4,5,7,9,10], phr:[0,1,3,5,7,8,10] };
    const PENT_M = [0,2,4,7,9], PENT_m = [0,3,5,7,10];
    const degMidi = (root, sc, d)=>{ const n = sc.length, o = Math.floor(d / n), i = ((d % n) + n) % n; return root + sc[i] + 12*o; };

    /* ---------- 장소별 분위기 ----------
       bpm · root(MIDI) · scale · prog(화음 근음 음도) · bpc(화음당 마디 수)
       악기(inst): epiano 전자피아노 · bell 오르골 · harp 하프 · guitar 기타 · marimba 마림바 · chip 8비트 · flute 플루트 · accordion 아코디언 · basic 기본
       pad 깔리는 소리 / comp 화음 스트럼 / arp 분산화음 / mel 멜로디 / bass 저음 / kick·snare·hat·shk·tick 리듬 / amb 환경음 */
    const THEMES = {
      // 오프닝: 느린 단조, 전자피아노 + 귀뚜라미 (노을 지는 동네)
      title:  { gain:0.55, bpm:66, root:57, scale:SC.min, prog:[0,5,2,6], bpc:2,
        pad:{ v:.05, type:"triangle", lp:900, det:7 }, arp:{ v:.06, inst:"epiano", pat:[0,1,2,3,2,1,2,1], dec:1.0 },
        mel:{ v:.07, inst:"bell", set:PENT_m, oct:1, p:.3, dec:1.4 }, bass:{ v:.08, type:"sine", pat:[1,0,0,0,0,0,1,0] },
        amb:[{ t:"crickets", v:.03 }, { t:"wind", v:.025 }] },
      // 공원: 밝은 장조, 어쿠스틱 기타 스트럼 + 플루트 + 새소리 + 셰이커
      park:   { gain:1.4, bpm:104, root:60, scale:SC.maj, prog:[0,4,5,3], bpc:1,
        comp:{ v:.05, inst:"guitar", pat:[1,0,0,1,0,1,1,0], dec:.5 }, pad:{ v:.02, type:"triangle", lp:1500, det:5 },
        mel:{ v:.075, inst:"flute", set:PENT_M, oct:1, p:.5, dec:.7 }, bass:{ v:.08, type:"sine", pat:[1,0,0,0,1,0,0,0] },
        shk:{ v:.02, pat:[0,1,0,1,0,1,0,1] }, amb:[{ t:"birds", v:.08 }, { t:"wind", v:.02 }] },
      // 놀이터: 빠른 8비트 칩튠
      playground:{ gain:3.2, bpm:138, root:67, scale:SC.maj, prog:[0,3,4,0], bpc:1,
        arp:{ v:.035, inst:"chip", pat:[0,2,1,3,0,2,1,3], dec:.12 },
        mel:{ v:.045, inst:"chip", set:PENT_M, oct:1, p:.62, dec:.16 }, bass:{ v:.08, inst:"chip", pat:[1,0,1,0,1,0,1,0], short:true },
        kick:{ v:.1, pat:[1,0,0,0,1,0,0,0] }, snare:{ v:.05, pat:[0,0,1,0,0,0,1,0] }, hat:{ v:.012, pat:[1,1,1,1,1,1,1,1] },
        amb:[{ t:"birds", v:.03 }] },
      // 시장: 아코디언 폴카 + 마림바 + 북적임
      market: { gain:3.0, bpm:120, root:62, scale:SC.mix, prog:[0,3,0,4], bpc:1,
        comp:{ v:.045, inst:"accordion", pat:[0,0,1,0,0,0,1,0], dec:.22 }, mel:{ v:.085, inst:"marimba", set:PENT_M, oct:1, p:.62, dec:.35 },
        bass:{ v:.1, type:"triangle", pat:[1,0,0,0,1,0,0,0], short:true }, shk:{ v:.025, pat:[1,0,1,1,1,0,1,1] }, tick:{ v:.04, pat:[0,0,1,0,0,0,1,0] },
        amb:[{ t:"crowd", v:.07 }] },
      // 주택가: 느린 핑거스타일 기타, 타악기 없이 조용하게
      housing:{ gain:1.0, bpm:70, root:65, scale:SC.maj, prog:[0,5,3,4], bpc:1,
        arp:{ v:.07, inst:"guitar", pat:[0,1,2,3,2,1,2,1], dec:.8 }, pad:{ v:.03, type:"triangle", lp:900, det:6 },
        mel:{ v:.05, inst:"harp", set:PENT_M, oct:1, p:.22, dec:1.4 }, bass:{ v:.07, type:"sine", pat:[1,0,0,0,1,0,0,0] },
        amb:[{ t:"wind", v:.04 }, { t:"birds", v:.025 }] },
      // 골목: 어두운 드론 + 심장박동 + 물방울 (멜로디 없음)
      alley:  { gain:0.6, bpm:52, root:50, scale:SC.phr, prog:[0,1,0,5], bpc:2,
        pad:{ v:.07, type:"sawtooth", lp:420, det:12 }, arp:{ v:.05, inst:"bell", pat:[0,null,null,null,null,2,null,null], dec:1.8 },
        bass:{ v:.07, type:"sine", pat:[1,0,0,0,0,0,0,0] }, kick:{ v:.16, pat:[1,0,0,1,0,0,0,0] },
        amb:[{ t:"drips", v:.1 }, { t:"hum", v:.035 }, { t:"wind", v:.02 }] },
      // 상점가: 라운지 재즈, 전자피아노 코드 + 워킹베이스 + 브러시
      market_st:{ gain:1.9, bpm:100, root:58, scale:SC.dor, prog:[0,3,1,4], bpc:1, swing:.3, seventh:true,
        comp:{ v:.05, inst:"epiano", pat:[0,0,0,1,0,0,1,0], dec:.5 }, mel:{ v:.06, inst:"epiano", set:PENT_m, oct:1, p:.34, dec:.6 },
        bass:{ v:.09, type:"triangle", pat:[1,0,1,0,1,0,1,0], short:true }, hat:{ v:.016, pat:[1,0,1,1,1,0,1,1] }, kick:{ v:.05, pat:[1,0,0,0,0,0,0,0] },
        amb:[{ t:"crowd", v:.035 }] },
      // 공터: 외로운 하모니카풍 멜로디 + 기타 한 음 + 센 바람
      lot:    { gain:1.0, bpm:62, root:52, scale:SC.min, prog:[0,3,0,4], bpc:2,
        pad:{ v:.025, type:"triangle", lp:700, det:8 }, arp:{ v:.07, inst:"guitar", pat:[0,null,null,null,2,null,null,null], dec:1.4 },
        mel:{ v:.07, inst:"flute", set:PENT_m, oct:1, p:.3, dec:1.8, vib:true }, bass:{ v:.06, type:"sine", pat:[1,0,0,0,0,0,0,0] },
        amb:[{ t:"wind", v:.1 }, { t:"crickets", v:.015 }] },
      // 보금자리(입양 전): 오르골 자장가
      home:   { gain:1.0, bpm:56, root:60, scale:SC.maj, prog:[0,4,5,3], bpc:2,
        pad:{ v:.025, type:"triangle", lp:800, det:5 }, arp:{ v:.05, inst:"bell", pat:[0,null,1,null,2,null,1,null], dec:1.3 },
        mel:{ v:.08, inst:"bell", set:PENT_M, oct:2, p:.5, dec:1.5 }, amb:[{ t:"wind", v:.03 }, { t:"crickets", v:.02 }] },
      // 집(입양 후): 로파이 힙합 비트
      home_adopted:{ gain:1.8, bpm:78, root:57, scale:SC.dor, prog:[0,3,1,4], bpc:1, seventh:true, swing:.2,
        comp:{ v:.05, inst:"epiano", pat:[1,0,0,0,0,1,0,0], dec:.9 }, mel:{ v:.04, inst:"epiano", set:PENT_m, oct:1, p:.22, dec:.9 },
        bass:{ v:.09, type:"sine", pat:[1,0,0,0,1,0,1,0] }, kick:{ v:.13, pat:[1,0,0,0,0,0,1,0] }, snare:{ v:.05, pat:[0,0,1,0,0,0,1,0] },
        hat:{ v:.014, pat:[1,0,1,1,1,0,1,0] }, amb:[{ t:"crackle", v:.045 }] },
      // 큰길: 질주하는 신스 베이스 + 지나가는 차
      road:   { gain:1.0, bpm:106, root:52, scale:SC.min, prog:[0,5,3,4], bpc:2,
        pad:{ v:.04, type:"sawtooth", lp:700, det:7 }, bass:{ v:.085, type:"sawtooth", pat:[1,1,1,1,1,1,1,1], short:true, lp:380 },
        kick:{ v:.12, pat:[1,0,0,0,1,0,0,0] }, hat:{ v:.018, pat:[0,0,1,0,0,0,1,0] }, tick:{ v:.03, pat:[0,0,0,0,0,0,1,1] },
        amb:[{ t:"traffic", v:.11 }] },
      // 하천: 흐르는 하프 + 물소리
      stream: { gain:0.9, bpm:88, root:62, scale:SC.maj, prog:[0,4,5,3], bpc:1,
        pad:{ v:.03, type:"triangle", lp:1500, det:6 }, arp:{ v:.09, inst:"harp", pat:[0,1,2,3,4,3,2,1], dec:1.3 },
        mel:{ v:.05, inst:"harp", set:PENT_M, oct:2, p:.2, dec:1.5 }, bass:{ v:.05, type:"sine", pat:[1,0,0,0,0,0,0,0] },
        amb:[{ t:"water", v:.13 }, { t:"birds", v:.025 }] },
      // 화재: 쫓기는 긴장
      fire:   { gain:0.9, bpm:128, root:48, scale:SC.phr, prog:[0,1,0,3], bpc:1,
        pad:{ v:.05, type:"sawtooth", lp:520, det:12 }, arp:{ v:.04, inst:"chip", pat:[0,null,0,null,1,null,0,null], dec:.15 },
        bass:{ v:.11, type:"sawtooth", pat:[1,1,0,1,1,0,1,0], short:true, lp:420 },
        hat:{ v:.022, pat:[1,0,1,0,1,0,1,1] }, kick:{ v:.15, pat:[1,0,0,0,1,0,0,0] }, snare:{ v:.06, pat:[0,0,0,0,1,0,0,0] },
        amb:[{ t:"crackle", v:.06 }, { t:"wind", v:.04 }] },
      // 엔딩: 따뜻한 오르골
      ending: { gain:0.55, bpm:60, root:65, scale:SC.maj, prog:[0,5,3,4], bpc:2,
        pad:{ v:.05, type:"triangle", lp:1000, det:6 }, arp:{ v:.05, inst:"harp", pat:[0,null,1,null,2,null,1,null], dec:1.4 },
        mel:{ v:.07, inst:"bell", set:PENT_M, oct:1, p:.34, dec:1.7 }, bass:{ v:.055, type:"sine", pat:[1,0,0,0,0,0,0,0] },
        amb:[{ t:"wind", v:.012 }] },
    };

    /* ---------- 오디오 그래프 ---------- */
    function makeNoise(c){
      const len = c.sampleRate * 3, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
      let a = 0; for(let i = 0; i < len; i++){ const w = Math.random()*2 - 1; a = (a + 0.02*w) / 1.02; d[i] = (w*0.6 + a*6) * 0.5; }   // 약간 부드러운(핑크에 가까운) 잡음
      return b;
    }
    function makeReverb(c){
      const len = Math.floor(c.sampleRate * 2.4), b = c.createBuffer(2, len, c.sampleRate);
      for(let ch = 0; ch < 2; ch++){ const d = b.getChannelData(ch); for(let i = 0; i < len; i++){ d[i] = (Math.random()*2 - 1) * Math.pow(1 - i/len, 2.6); } }
      const cv = c.createConvolver(); cv.buffer = b; return cv;
    }
    function buildGraph(c){
      master = c.createGain(); master.gain.value = muted ? 0 : volume;
      comp = c.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
      reverb = makeReverb(c); const rg = c.createGain(); rg.gain.value = 0.9;
      reverb.connect(rg); rg.connect(master); master.connect(comp); comp.connect(c.destination);
      noiseBuf = makeNoise(c);
      sfxBus = c.createGain(); sfxBus.gain.value = 2.4; sfxBus.connect(master);
      sfxSend = c.createGain(); sfxSend.gain.value = .6; sfxSend.connect(reverb);
    }
    function ensure(){
      if(ctx) return true;
      const AC = window.AudioContext || window.webkitAudioContext; if(!AC) return false;
      try{ ctx = new AC(); buildGraph(ctx); }catch(e){ ctx = null; return false; }
      return true;
    }

    /* ---------- 음 하나 (악기별 음색) ---------- */
    const hz = m => 440 * Math.pow(2, (m - 69) / 12);
    function note(inst, t, midi, dur, o){
      const f = hz(midi), g = ctx.createGain(), a = o.a == null ? 0.008 : o.a, end = t + a + dur;
      const mixer = ctx.createGain(), oscs = [];
      const add = (type, freq, gain, det)=>{ const os = ctx.createOscillator(); os.type = type; os.frequency.value = freq; if(det) os.detune.value = det;
        if(gain != null && gain !== 1){ const gg = ctx.createGain(); gg.gain.value = gain; os.connect(gg); gg.connect(mixer); } else os.connect(mixer); oscs.push(os); return os; };
      const fm = (carrier, ratio, depth, decay)=>{ const md = ctx.createOscillator(), mg = ctx.createGain(); md.frequency.value = f*ratio;
        mg.gain.setValueAtTime(depth, t); mg.gain.exponentialRampToValueAtTime(Math.max(0.01, depth*0.02), t + decay); md.connect(mg); mg.connect(carrier.frequency); oscs.push(md); };
      const kind = o.inst || "basic";
      let lp = o.lp, fenv = null, vib = o.vib, ampMul = 1;
      if(kind === "bell"){ const c = add("sine", f, 1); fm(c, 3.5, f*1.6, 0.5); add("sine", f*2, .18); }
      else if(kind === "epiano"){ const c = add("sine", f, 1); fm(c, 14, f*0.55, 0.14); add("triangle", f*2, .22); }
      else if(kind === "marimba"){ add("sine", f, 1); const h = add("sine", f*4, 0); const hg = ctx.createGain(); hg.gain.setValueAtTime(.35, t); hg.gain.exponentialRampToValueAtTime(0.0001, t + .09); h.connect(hg); hg.connect(mixer); }
      else if(kind === "chip"){ add("square", f, .55); lp = lp || 3800; }
      else if(kind === "flute"){ add("sine", f, 1); add("sine", f*2, .12); add("triangle", f, .15); vib = true; }
      else if(kind === "accordion"){ add("sawtooth", f, .5, -10); add("sawtooth", f, .5, 10); lp = lp || 2300; }
      else if(kind === "harp"){ add("triangle", f, 1); add("sine", f*2, .3); add("sine", f*3, .08); }
      else if(kind === "guitar"){ add("sawtooth", f, .65); add("triangle", f*2, .2); lp = 3800; fenv = [3800, 650, 0.28]; }
      else { (o.det ? [-o.det, o.det] : [0]).forEach(d=> add(o.type || "sine", f, 1, d)); if(o.harm) add("sine", f*2, .28); }
      if(vib){ const l = ctx.createOscillator(), lg = ctx.createGain(), dl = ctx.createGain(); l.frequency.value = 5.4; lg.gain.value = f*0.007; l.connect(lg); oscs.forEach(os=> lg.connect(os.frequency)); l.start(t); l.stop(end + 0.1); }
      if(lp){ const fl = ctx.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = lp; fl.Q.value = 0.6;
        if(fenv){ fl.frequency.setValueAtTime(fenv[0], t); fl.frequency.exponentialRampToValueAtTime(fenv[1], t + fenv[2]); }
        mixer.connect(fl); fl.connect(g); } else mixer.connect(g);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(o.v, t + a);
      if(o.sustain){ g.gain.setValueAtTime(o.v, end - o.rel); g.gain.linearRampToValueAtTime(0.0001, end); }
      else { g.gain.exponentialRampToValueAtTime(0.0001, end); }
      g.connect(inst.bus);
      if(o.send !== 0){ const sg = ctx.createGain(); sg.gain.value = o.send == null ? 0.3 : o.send; g.connect(sg); sg.connect(inst.sendBus); }
      oscs.forEach(os=>{ os.start(t); os.stop(end + 0.08); });
    }
    function snare(inst, t, v){
      noiseBurst(inst, t, .14, v*1.6, 1400, 6500, .15);
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "triangle"; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(150, t + .08);
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + .12); o.connect(g); g.connect(inst.bus); o.start(t); o.stop(t + .15);
    }
    function noiseBurst(inst, t, dur, v, hp, lp, send){
      const s = ctx.createBufferSource(); s.buffer = noiseBuf;
      const g = ctx.createGain(), f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp;
      s.connect(f); let last = f;
      if(lp){ const f2 = ctx.createBiquadFilter(); f2.type = "lowpass"; f2.frequency.value = lp; f.connect(f2); last = f2; }
      last.connect(g); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); g.connect(inst.bus);
      if(send){ const sg = ctx.createGain(); sg.gain.value = send; g.connect(sg); sg.connect(inst.sendBus); }
      s.start(t, Math.random()*2, dur + 0.05);
    }
    function kick(inst, t, v){
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine";
      o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
      o.connect(g); g.connect(inst.bus); o.start(t); o.stop(t + 0.3);
    }
    function chirp(inst, t, v){                                       // 새소리
      const n = 2 + Math.floor(Math.random()*3), base = 2400 + Math.random()*1400;
      for(let i = 0; i < n; i++){
        const tt = t + i*0.13, o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine";
        o.frequency.setValueAtTime(base, tt); o.frequency.exponentialRampToValueAtTime(base*1.35, tt + 0.05); o.frequency.exponentialRampToValueAtTime(base*0.95, tt + 0.1);
        g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(v, tt + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.11);
        o.connect(g); g.connect(inst.bus); const sg = ctx.createGain(); sg.gain.value = 0.3; g.connect(sg); sg.connect(inst.sendBus); o.start(tt); o.stop(tt + 0.13);
      }
    }
    function drip(inst, t, v){
      const o = ctx.createOscillator(), g = ctx.createGain(), f = 900 + Math.random()*900; o.type = "sine";
      o.frequency.setValueAtTime(f*1.4, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g); g.connect(inst.bus); const sg = ctx.createGain(); sg.gain.value = 0.9; g.connect(sg); sg.connect(inst.sendBus); o.start(t); o.stop(t + 0.4);
    }
    function cricket(inst, t, v){
      for(let i = 0; i < 4; i++){
        const tt = t + i*0.07, o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine"; o.frequency.value = 4300;
        g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(v, tt + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.05);
        o.connect(g); g.connect(inst.bus); o.start(tt); o.stop(tt + 0.06);
      }
    }
    function whoosh(inst, t, v){                                      // 차가 지나가는 소리
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = "bandpass"; f.Q.value = 0.9;
      const dur = 2.4 + Math.random()*1.6, dir = Math.random() < 0.5;
      f.frequency.setValueAtTime(dir ? 260 : 900, t); f.frequency.exponentialRampToValueAtTime(dir ? 900 : 260, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + dur*0.5); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(inst.bus); s.start(t, Math.random()); s.stop(t + dur + 0.1);
    }

    /* ---------- 지속되는 환경음 ---------- */
    function startAmbience(inst, spec){
      const t0 = ctx.currentTime;
      const loopNoise = ()=>{ const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; inst.nodes.push(s); return s; };
      const lfo = (rate, depth, target)=>{ const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = rate; lg.gain.value = depth; l.connect(lg); lg.connect(target); l.start(t0); inst.nodes.push(l); };
      if(spec.t === "wind"){
        const s = loopNoise(), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = "lowpass"; f.frequency.value = 450; g.gain.value = spec.v;
        lfo(0.07, 220, f.frequency); lfo(0.11, spec.v*0.5, g.gain); s.connect(f); f.connect(g); g.connect(inst.bus); s.start(t0);
      } else if(spec.t === "water"){
        const s = loopNoise(), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = "bandpass"; f.frequency.value = 1300; f.Q.value = 0.8; g.gain.value = spec.v;
        lfo(0.35, 400, f.frequency); lfo(0.5, spec.v*0.35, g.gain); s.connect(f); f.connect(g); g.connect(inst.bus); s.start(t0);
        const s2 = loopNoise(), f2 = ctx.createBiquadFilter(), g2 = ctx.createGain(); f2.type = "bandpass"; f2.frequency.value = 3000; f2.Q.value = 1.2; g2.gain.value = spec.v*0.3;
        lfo(4.3, spec.v*0.2, g2.gain); s2.connect(f2); f2.connect(g2); g2.connect(inst.bus); s2.start(t0 + 0.7);
      } else if(spec.t === "crowd"){
        const s = loopNoise(), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = "bandpass"; f.frequency.value = 420; f.Q.value = 0.6; g.gain.value = spec.v;
        lfo(0.23, spec.v*0.4, g.gain); lfo(0.6, 120, f.frequency); s.connect(f); f.connect(g); g.connect(inst.bus); s.start(t0);
      } else if(spec.t === "hum"){
        const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine"; o.frequency.value = 55; g.gain.value = spec.v; o.connect(g); g.connect(inst.bus); o.start(t0); inst.nodes.push(o);
        const o2 = ctx.createOscillator(), g2 = ctx.createGain(); o2.type = "sine"; o2.frequency.value = 110.4; g2.gain.value = spec.v*0.4; o2.connect(g2); g2.connect(inst.bus); o2.start(t0); inst.nodes.push(o2);
      } else if(spec.t === "traffic"){
        const s = loopNoise(), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = "lowpass"; f.frequency.value = 260; g.gain.value = spec.v*0.7;
        lfo(0.05, 60, f.frequency); s.connect(f); f.connect(g); g.connect(inst.bus); s.start(t0);
      }
      // birds / drips / crickets / crackle 은 스케줄러에서 가끔씩 뿌린다
    }

    /* ---------- 장면(인스턴스) ---------- */
    function makeInst(name, startAt){
      const th = THEMES[name];
      const inst = { name, th, step:0, next:startAt, nodes:[], dying:0, last:0, lastDeg:2, rnd:Math.random };
      inst.bus = ctx.createGain(); inst.bus.gain.value = th.gain || 1; inst.bus.connect(master);
      inst.sendBus = ctx.createGain(); inst.sendBus.gain.value = 1; inst.sendBus.connect(reverb);
      (th.amb || []).forEach(a=> startAmbience(inst, a));
      return inst;
    }
    function dangerNow(){ try{ return !!state && state.running && state.risk >= 65; }catch(e){ return false; } }

    function schedule(inst, until){
      const th = inst.th, sd = 30 / th.bpm, bar = sd*8, sc = th.scale, amb = th.amb || [];
      while(inst.next < until){
        const s = inst.step % 8, barNo = Math.floor(inst.step / 8), bpc = th.bpc || 1;
        const t = inst.next + ((s % 2) && th.swing ? sd*th.swing : 0);
        const cd = th.prog[Math.floor(barNo / bpc) % th.prog.length];
        const ch = [degMidi(th.root, sc, cd), degMidi(th.root, sc, cd + 2), degMidi(th.root, sc, cd + 4), th.seventh ? degMidi(th.root, sc, cd + 6) : degMidi(th.root, sc, cd + 7)];
        if(s === 0 && barNo % bpc === 0 && th.pad){            // 길게 깔리는 화음
          const d = bar*bpc;
          [ch[0], ch[1], ch[2], ch[3]].forEach(m=> note(inst, t, m, d - 0.4, { type:th.pad.type, v:th.pad.v, a:Math.min(1.1, d*0.3), rel:Math.min(1.2, d*0.35), lp:th.pad.lp, det:th.pad.det, sustain:true, send:0.45 }));
        }
        if(s === 0 && dangerNow()){                               // 위험도가 높으면 낮고 불안한 울림이 깔린다
          note(inst, t, th.root - 12, bar - 0.2, { type:"sawtooth", v:.035, a:.6, rel:.8, lp:260, sustain:true, send:.2 });
          note(inst, t, th.root - 12 + 6, bar - 0.2, { type:"sine", v:.02, a:.9, rel:.8, sustain:true, send:.2 });
        }
        if(th.comp && th.comp.pat[s]){                            // 화음 스트럼
          const n = th.seventh ? 4 : 3;
          for(let i = 0; i < n; i++) note(inst, t + i*0.014, ch[i] + (th.comp.inst === "accordion" ? 0 : 0), th.comp.dec, { inst:th.comp.inst, v:th.comp.v, a:.006, send:.25 });
        }
        if(th.arp){ const ix = th.arp.pat[s]; if(ix != null){ const m = ch[ix % 4] + 12*Math.floor(ix / 4); note(inst, t, m, th.arp.dec, { inst:th.arp.inst, type:th.arp.type, v:th.arp.v, a:.006, lp:th.arp.lp, harm:th.arp.harm }); } }
        if(th.mel && th.mel.p > 0 && s % 2 === 0 && !(barNo % 4 === 3 && s > 2) && Math.random() < th.mel.p){
          const set = th.mel.set, len = set.length * 2;
          inst.lastDeg = Math.max(0, Math.min(len - 1, inst.lastDeg + [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random()*7)]));
          const m = th.root + set[inst.lastDeg % set.length] + 12*Math.floor(inst.lastDeg / set.length) + 12*(th.mel.oct || 0);
          note(inst, t, m, th.mel.dec, { inst:th.mel.inst, type:th.mel.type, v:th.mel.v, a:.01, harm:th.mel.harm, vib:th.mel.vib, send:.45 });
        }
        if(th.bass && th.bass.pat[s]){ const m = ch[0] - 12; note(inst, t, m, th.bass.short ? .26 : sd*3.2, { inst:th.bass.inst, type:th.bass.type, v:th.bass.v, a:.01, lp:th.bass.lp || 500, send:0 }); }
        if(th.hat && th.hat.pat[s]) noiseBurst(inst, t, .05, th.hat.v, 7000, 0, .05);
        if(th.shk && th.shk.pat[s]) noiseBurst(inst, t, .07, th.shk.v, 4500, 9000, .1);
        if(th.tick && th.tick.pat[s]) note(inst, t, 96, .08, { type:"triangle", v:th.tick.v, a:.002, send:.2 });
        if(th.kick && th.kick.pat[s]) kick(inst, t, th.kick.v);
        if(th.snare && th.snare.pat[s]) snare(inst, t, th.snare.v);
        amb.forEach(a=>{
          if(a.t === "birds" && Math.random() < .045) chirp(inst, t + Math.random()*sd, a.v);
          else if(a.t === "drips" && Math.random() < .08) drip(inst, t + Math.random()*sd, a.v);
          else if(a.t === "crickets" && Math.random() < .09) cricket(inst, t, a.v);
          else if(a.t === "crackle" && Math.random() < .55) noiseBurst(inst, t + Math.random()*sd, .012 + Math.random()*.02, a.v, 2500, 7000, 0);
          else if(a.t === "traffic" && Math.random() < .04) whoosh(inst, t, a.v);
        });
        inst.step++; inst.next += sd;
      }
    }
    function dispose(inst){ inst.nodes.forEach(n=>{ try{ n.stop(); }catch(e){} }); try{ inst.bus.disconnect(); inst.sendBus.disconnect(); }catch(e){} }

    function tick(){
      if(!ctx || ctx.state !== "running") return;
      const now = ctx.currentTime;
      for(let i = insts.length - 1; i >= 0; i--){
        const it = insts[i];
        if(it.dying && now > it.dying){ dispose(it); insts.splice(i, 1); continue; }
        if(!it.dying) schedule(it, now + 0.35);
      }
    }
    function switchTo(name){
      if(!ctx || !THEMES[name] || name === curName) return;
      const now = ctx.currentTime;
      insts.forEach(it=>{ if(!it.dying){ it.dying = now + 1.8; it.bus.gain.cancelScheduledValues(now); it.bus.gain.setValueAtTime(it.bus.gain.value, now); it.bus.gain.linearRampToValueAtTime(0, now + 1.2); it.sendBus.gain.setValueAtTime(it.sendBus.gain.value, now); it.sendBus.gain.linearRampToValueAtTime(0, now + 1.2); } });
      const inst = makeInst(name, now + 0.12);
      inst.bus.gain.setValueAtTime(0, now); inst.bus.gain.linearRampToValueAtTime(inst.th.gain || 1, now + 1.4);
      insts.push(inst); curName = name;
    }

    /* ---------- 지금 화면에 맞는 곡 고르기 ---------- */
    function sceneNow(){
      try{
        if(!state) return "title";
        if(startOverlay.classList.contains("show") && !startOverlay.classList.contains("gone")) return "title";
        if(endOverlay.classList.contains("show")) return "ending";
        // 화재 연출을 위해 암전 중인 동안에는 기존 장소 음악을 유지한다.
        if(state.fireSearch || (state.fireEvent && state.fireMusicReady)) return "fire";
        if(state.currentLoc === "home") return state.adopted ? "home_adopted" : "home";
        return THEMES[state.currentLoc] ? state.currentLoc : "park";
      }catch(e){ return "title"; }
    }
    function sync(){ if(ctx && unlocked) switchTo(sceneNow()); }

    function applyMaster(){
      if(!ctx) return;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now); master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(muted ? 0 : volume, now + 0.25);
      if(muted){ setTimeout(()=>{ if(muted && ctx && ctx.state === "running") ctx.suspend(); }, 400); }
      else if(unlocked && ctx.state === "suspended" && !document.hidden){ ctx.resume(); }
    }
    function unlock(){
      if(!ensure()) return;
      unlocked = true;
      const go = ()=>{ sync(); if(muted){ ctx.suspend(); } };
      if(ctx.state === "suspended") ctx.resume().then(go, go); else go();
      if(!tickTimer) tickTimer = setInterval(()=>{ tick(); }, 60);
      setInterval(sync, 500);
      window.removeEventListener("pointerdown", unlock, true); window.removeEventListener("keydown", unlock, true);
    }
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    document.addEventListener("visibilitychange", ()=>{
      if(!ctx || !unlocked) return;
      if(document.hidden){ if(ctx.state === "running") ctx.suspend(); }
      else if(!muted && ctx.state === "suspended"){ ctx.resume(); }
    });

    /* ---------- 효과음 (이벤트·선택지·아이템·미니게임) ---------- */
    let lastDown = 0, lastSfx = {};
    function tone(t, f0, f1, dur, type, v, o){
      o = o || {};
      const os = ctx.createOscillator(), g = ctx.createGain(), a = o.a || 0.004;
      os.type = type; os.frequency.setValueAtTime(f0, t); if(f1 && f1 !== f0) os.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let n = os; if(o.lp){ const fl = ctx.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = o.lp; os.connect(fl); n = fl; }
      n.connect(g); g.connect(sfxBus);
      if(o.send){ const sg = ctx.createGain(); sg.gain.value = o.send; g.connect(sg); sg.connect(sfxSend); }
      os.start(t); os.stop(t + dur + 0.03);
    }
    function nz(t, dur, v, o){
      o = o || {};
      const s = ctx.createBufferSource(); s.buffer = noiseBuf;
      const f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = o.type || "bandpass"; f.Q.value = o.q || 1;
      f.frequency.setValueAtTime(o.f || 2000, t); if(o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
      v *= 3.2;                                        // 필터를 거친 잡음은 작게 들려서 보정
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + Math.min(0.012, dur/3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(sfxBus);
      if(o.send){ const sg = ctx.createGain(); sg.gain.value = o.send; g.connect(sg); sg.connect(sfxSend); }
      s.start(t, Math.random()*2, dur + 0.05);
    }
    function bell(t, midi, dur, v, send){
      const f = hz(midi), c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
      c.type = "sine"; c.frequency.value = f; m.type = "sine"; m.frequency.value = f*3.5;
      mg.gain.setValueAtTime(f*1.4, t); mg.gain.exponentialRampToValueAtTime(f*0.03, t + dur*0.6); m.connect(mg); mg.connect(c.frequency);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      c.connect(g); g.connect(sfxBus); if(send){ const sg = ctx.createGain(); sg.gain.value = send; g.connect(sg); sg.connect(sfxSend); }
      c.start(t); m.start(t); c.stop(t + dur + 0.05); m.stop(t + dur + 0.05);
    }
    const thud = (t, v)=> tone(t, 140, 42, 0.26, "sine", v || 0.22);
    const SFX = {
      // 버튼: 일반은 가볍게 "틱", 선택지는 묵직한 "달" + 경쾌한 "칵"
      down(t){ tone(t, 760, 420, .045, "triangle", .1); nz(t, .02, .07, { type:"highpass", f:3500 }); },
      up(t){ tone(t, 1500, 1000, .035, "triangle", .08); nz(t, .015, .05, { type:"highpass", f:5000 }); },
      optDown(t){ tone(t, 520, 250, .07, "triangle", .15); tone(t, 95, 60, .06, "sine", .12); nz(t, .03, .1, { f:2500, q:.8 }); },
      optUp(t){ tone(t, 1250, 800, .05, "square", .05, { lp:3000 }); nz(t, .02, .09, { type:"highpass", f:4500 }); tone(t + .01, 2400, 1800, .03, "sine", .04); },
      hover(t){ tone(t, 2300, 2100, .02, "sine", .03); },
      // 이벤트가 열릴 때: 안전 = 포근한 종소리 / 위험 = 낮고 불길한 울림
      eventSafe(t){ bell(t, 79, .9, .1, .5); bell(t + .13, 83, 1.0, .09, .5); bell(t + .27, 86, 1.4, .08, .6); },
      eventDanger(t){ thud(t, .24); tone(t, 98, 88, .8, "sawtooth", .09, { lp:420, send:.3 }); tone(t + .02, 329.6, 329.6, .7, "sine", .055); tone(t + .02, 349.2, 349.2, .7, "sine", .055);
        nz(t, .6, .07, { type:"lowpass", f:320 }); thud(t + .3, .2); tone(t + .3, 92.5, 82, .6, "sawtooth", .08, { lp:380 }); },
      // 결과
      good(t){ tone(t, 1319, 1319, .12, "square", .05, { lp:4000 }); tone(t + .07, 1760, 1760, .24, "square", .05, { lp:4000, send:.2 }); bell(t + .07, 93, .5, .04, .3); },
      bad(t){ tone(t, 320, 110, .4, "sawtooth", .1, { lp:900 }); tone(t + .02, 305, 105, .4, "square", .04, { lp:700 }); },
      hurt(t){ thud(t, .24); nz(t, .1, .13, { f:1200, q:.8 }); tone(t + .03, 900, 380, .2, "triangle", .09, { lp:2500 }); },
      dodge(t){ nz(t, .15, .08, { f:600, f1:2600, q:1.2 }); },
      eat(t){ for(let i = 0; i < 3; i++) nz(t + i*.075, .05, .13, { f:2600, q:1.5 }); tone(t + .26, 700, 1000, .09, "sine", .05); },
      pop(t){ tone(t, 520, 900, .08, "sine", .09); },
      mystery(t){ tone(t, 500, 700, .12, "triangle", .06); tone(t + .1, 700, 520, .12, "triangle", .06); tone(t + .2, 520, 880, .2, "triangle", .06, { send:.4 }); },
      trap(t){ nz(t, .05, .22, { f:3200, q:1.2 }); tone(t, 260, 70, .14, "square", .08, { lp:1200 }); tone(t + .04, 1900, 900, .08, "triangle", .05); },
      // 사냥 · 눈치 싸움
      huntStart(t){ tone(t, 300, 700, .12, "triangle", .06); nz(t, .1, .05, { f:800, f1:3000 }); },
      hit(t){ nz(t, .07, .2, { f:900, q:.7 }); tone(t, 170, 70, .14, "sine", .22); tone(t + .01, 800, 400, .06, "triangle", .07); nz(t, .1, .08, { f:1200, f1:4200, q:1.5 }); },
      miss(t){ nz(t, .16, .08, { f:900, f1:500, q:1 }); },
      catch(t){ [84, 88, 91, 96].forEach((m, i)=> bell(t + i*.08, m, .8, .08, .4)); },
      fail(t){ tone(t, 392, 392, .25, "triangle", .08, { send:.3 }); tone(t + .2, 311, 311, .45, "triangle", .08, { send:.3 }); },
      duelStart(t){ thud(t, .2); thud(t + .28, .2); },
      duelWin(t){ tone(t, 660, 660, .1, "triangle", .08); tone(t + .09, 880, 880, .18, "triangle", .08, { send:.3 }); },
      duelLose(t){ tone(t, 330, 300, .18, "sawtooth", .07, { lp:900 }); tone(t + .14, 247, 200, .3, "sawtooth", .07, { lp:800 }); },
      duelDraw(t){ tone(t, 560, 540, .1, "triangle", .06); },
      // 긴장 · 연출
      alert(t){ tone(t, 1568, 1568, .08, "square", .06, { lp:3500 }); tone(t + .11, 1568, 1568, .1, "square", .06, { lp:3500 }); thud(t, .1); },
      alertBoss(t){ thud(t, .26); tone(t, 110, 98, .9, "sawtooth", .1, { lp:500, send:.3 }); tone(t, 165, 147, .9, "sawtooth", .05, { lp:500 }); nz(t, .9, .06, { type:"lowpass", f:250 }); thud(t + .45, .22); },
      packRush(t){ for(let i = 0; i < 7; i++){ thud(t + i*.17, .12 + i*.012); } nz(t, 1.3, .09, { type:"lowpass", f:220 }); },
      fireStart(t){ for(let i = 0; i < 2; i++){ tone(t + i*.4, 600, 920, .36, "sawtooth", .07, { lp:1800 }); } nz(t, .9, .07, { f:3000, q:.6, send:.1 }); thud(t, .2); },
      guard(t){ nz(t, .18, .09, { f:500, f1:2500, q:1.2 }); tone(t + .12, 880, 1320, .1, "triangle", .07, { send:.2 }); },
      scared(t){ tone(t, 1200, 500, .22, "triangle", .08); tone(t + .08, 1400, 600, .18, "triangle", .06); },
      step(t){ nz(t, .1, .05, { type:"lowpass", f:700 }); },
      cutStart(t){ nz(t, .55, .06, { f:300, f1:1500, q:.8, send:.2 }); },
      cut(t){ nz(t, .12, .05, { type:"highpass", f:1800 }); tone(t, 1200, 900, .05, "sine", .025); },
      // 보상 · 성장
      rankUp(t){ [72, 76, 79, 84].forEach((m, i)=> tone(t + i*.12, hz(m), hz(m), i === 3 ? .7 : .16, "sawtooth", .06, { lp:1900, send:.35 })); bell(t + .36, 96, 1.2, .06, .5); },
      king(t){ SFX.rankUp(t); [76, 79, 84, 88].forEach((m, i)=> tone(t + .6 + i*.12, hz(m), hz(m), i === 3 ? 1.0 : .16, "sawtooth", .06, { lp:2100, send:.4 })); [96, 100, 103].forEach((m, i)=> bell(t + 1.1 + i*.1, m, 1.5, .06, .6)); },
      tribute(t){ [88, 91, 95, 100].forEach((m, i)=> bell(t + i*.1, m, 1.0, .07, .5)); nz(t, .4, .03, { type:"highpass", f:6000 }); },
      season(t){ bell(t, 79, 1.0, .08, .5); bell(t + .18, 76, 1.0, .07, .5); bell(t + .36, 72, 1.5, .08, .6); },
      love(t){ bell(t, 88, .9, .08, .5); bell(t + .15, 95, 1.2, .08, .6); },
      ending(t){ [72, 76, 79, 84, 88].forEach((m, i)=> bell(t + i*.22, m, 2.2, .07, .7)); },
      // 비밀 아지트 뽑기 · 스킬
      gachaRumble(t){ tone(t, 62, 46, .9, "sawtooth", .08, { lp:300 }); nz(t, .9, .05, { type:"lowpass", f:200 }); thud(t + .35, .16); },
      gachaCharge(t){ tone(t, 300, 1500, .6, "sawtooth", .045, { lp:2600, send:.3 }); nz(t, .6, .04, { f:600, f1:4200, q:1 }); },
      gachaFlip(t){ nz(t, .12, .08, { type:"highpass", f:2500 }); tone(t, 900, 1400, .12, "triangle", .06); bell(t + .05, 88, .6, .05, .3); },
      gachaRare(t){ nz(t, .14, .09, { type:"highpass", f:2300 }); tone(t, 700, 1500, .14, "triangle", .07); [84, 88, 91].forEach((m, i)=> bell(t + .05 + i*.07, m, .9, .07, .5)); },
      gachaEpic(t){ thud(t, .26); nz(t, .55, .1, { f:400, f1:6000, q:.8, send:.3 }); [72, 76, 79, 84, 88, 91].forEach((m, i)=> tone(t + i*.07, hz(m), hz(m), i === 5 ? .9 : .14, "sawtooth", .055, { lp:2200, send:.35 })); [96, 100, 103, 108].forEach((m, i)=> bell(t + .3 + i*.08, m, 1.4, .06, .6)); },
      gachaPick(t){ tone(t, 660, 990, .12, "triangle", .08); bell(t + .04, 91, .8, .07, .4); nz(t, .1, .07, { f:1500, f1:5000, q:1.2 }); },
      gachaShatter(t){ nz(t, .22, .12, { type:"highpass", f:2000 }); for(let i = 0; i < 4; i++) tone(t + i*.025, 2400 - i*300, 800, .08, "triangle", .04); },
      whoosh(t){ nz(t, .35, .1, { f:400, f1:2400, q:.9 }); },
      hudPing(t){ bell(t, 96, .6, .07, .3); bell(t + .08, 100, .8, .06, .4); },
      poof(t){ nz(t, .25, .08, { type:"lowpass", f:900, f1:300 }); },
      powder(t){ nz(t, .5, .06, { type:"highpass", f:3000 }); tone(t, 700, 1500, .4, "sine", .04, { send:.4 }); },
    };
    function sfx(name, arg){
      if(!ctx || ctx.state !== "running" || muted || !SFX[name]) return;
      const now = performance.now(); if(lastSfx[name] && now - lastSfx[name] < 45) return; lastSfx[name] = now;
      try{ SFX[name](ctx.currentTime + 0.005, arg); }catch(e){ console.error("sfx", name, e); }
    }
    // 모든 버튼에 달칵 소리 (선택지·컷신 선택지·눈치 싸움 버튼은 더 묵직하게)
    const BTN_SEL = "button, [role=button], .dex-btn";
    const HEAVY_SEL = ".opt-btn, .cs-opt, .duel-btn";
    const btnOf = el => (el && el.closest) ? el.closest(BTN_SEL) : null;
    document.addEventListener("pointerdown", e=>{
      const b = btnOf(e.target); if(!b || b.disabled) return;
      lastDown = performance.now(); sfx(b.matches(HEAVY_SEL) ? "optDown" : "down");
    }, true);
    document.addEventListener("click", e=>{
      const b = btnOf(e.target); if(!b || b.disabled) return;
      const heavy = b.matches(HEAVY_SEL);
      if(performance.now() - lastDown > 400){ sfx(heavy ? "optDown" : "down"); setTimeout(()=> sfx(heavy ? "optUp" : "up"), 55); }   // 키보드로 눌렀을 때
      else sfx(heavy ? "optUp" : "up");
    }, true);
    document.addEventListener("pointerover", e=>{
      if(e.pointerType !== "mouse") return;
      const b = e.target.closest && e.target.closest(HEAVY_SEL);
      if(b && !(e.relatedTarget && b.contains(e.relatedTarget))) sfx("hover");
    }, true);

    /* ---------- 음소거·볼륨 버튼 ---------- */
    function buildUI(){
      const st = document.createElement("style");
      st.textContent = `
        #music-ctl{ position:fixed; right:14px; bottom:14px; z-index:200; display:flex; align-items:center; gap:8px; padding:5px; border-radius:999px;
          background:rgba(255,255,255,.88); box-shadow:0 2px 10px rgba(60,40,70,.22); backdrop-filter:blur(4px); font-family:inherit; }
        #music-ctl button{ width:34px; height:34px; border-radius:50%; border:0; background:#FFF1E6; color:#B25C3A; cursor:pointer; display:grid; place-items:center; padding:0; transition:transform .12s, background .15s; }
        #music-ctl button:hover{ background:#FFE0CC; transform:scale(1.06); }
        #music-ctl button:focus-visible{ outline:2px solid #F08A5D; outline-offset:2px; }
        #music-ctl button svg{ width:20px; height:20px; }
        #music-ctl .mv{ width:0; opacity:0; margin:0; padding:0; transition:width .18s, opacity .18s, margin .18s; accent-color:#F08A5D; height:4px; }
        #music-ctl:hover .mv, #music-ctl:focus-within .mv{ width:84px; opacity:1; margin:0 8px 0 4px; }
        #music-ctl .mname{ display:none; font-size:11px; font-weight:700; color:#8A6A5A; padding-left:6px; white-space:nowrap; }
        @media (hover:hover){ #music-ctl:hover .mname{ display:none; } }
      `;
      document.head.appendChild(st);
      const box = document.createElement("div"); box.id = "music-ctl";
      const vol = document.createElement("input"); vol.type = "range"; vol.min = 0; vol.max = 100; vol.value = Math.round(volume*100); vol.className = "mv"; vol.setAttribute("aria-label", "음악 볼륨");
      const btn = document.createElement("button"); btn.type = "button";
      const SPK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" fill="currentColor"/>';
      const render = ()=>{
        btn.innerHTML = muted ? SPK + '<path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>' : SPK + '<path d="M15.5 9a4 4 0 010 6M18 6.5a8 8 0 010 11"/></svg>';
        btn.title = muted ? "음악 켜기" : "음악 끄기"; btn.setAttribute("aria-label", btn.title); btn.setAttribute("aria-pressed", muted ? "true" : "false");
      };
      btn.addEventListener("click", ()=>{ muted = !muted; savePref(); render(); if(!unlocked) unlock(); applyMaster(); });
      vol.addEventListener("input", ()=>{ volume = vol.value/100; if(muted && volume > 0){ muted = false; render(); } savePref(); if(ctx) applyMaster(); });
      box.appendChild(vol); box.appendChild(btn); render();
      document.body.appendChild(box);
    }
    if(document.body) buildUI(); else window.addEventListener("DOMContentLoaded", buildUI);

    /* ---------- 개발용: 곡을 미리 들어 보기 위해 오프라인으로 렌더링 ---------- */
    async function renderOffline(name, secs){
      const saved = { ctx, master, comp, reverb, noiseBuf, sfxBus, sfxSend }, oc = new OfflineAudioContext(2, Math.floor(44100*secs), 44100);
      try{
        ctx = oc; const wasMuted = muted; muted = false; buildGraph(oc); muted = wasMuted;
        const inst = makeInst(name, 0.05); inst.nodes.forEach(n=>{ try{ n.stop(secs); }catch(e){} });
        schedule(inst, secs - 0.5);
        return await oc.startRendering();
      } finally { ({ ctx, master, comp, reverb, noiseBuf, sfxBus, sfxSend } = saved); }
    }
    async function renderSfxOffline(name, secs){
      const saved = { ctx, master, comp, reverb, noiseBuf, sfxBus, sfxSend }, oc = new OfflineAudioContext(2, Math.floor(44100*secs), 44100);
      try{ ctx = oc; const wasMuted = muted; muted = false; buildGraph(oc); muted = wasMuted; SFX[name](0.02); return await oc.startRendering(); }
      finally { ({ ctx, master, comp, reverb, noiseBuf, sfxBus, sfxSend } = saved); }
    }
    return { sfx, sfxNames:()=> Object.keys(SFX), renderSfxOffline, names:()=> Object.keys(THEMES), renderOffline, sync, info:()=>({ scene:curName, state:ctx && ctx.state, muted, volume, insts:insts.length }) };
  })();


  state = freshState();
  renderAll();
  startFx();

})();
});
