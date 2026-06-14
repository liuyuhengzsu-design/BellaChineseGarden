const state = {
  sound: true,
  selectedLeft: null,
  currentRhymeMode: "match",
  currentRhymeRound: null,
  currentRhymeLesson: 0,
  completedRhymePairs: new Set(),
  rhythmIndex: 0,
  orderIndex: 0,
  stars: 0,
  flowers: 0,
  stats: {
    rhyme: 0,
    poem: 0,
    words: 0,
    antonyms: 0,
  },
  knownWords: new Set(),
  activeGardenRoom: "spring",
  activeGardenPanel: "shop",
  selectedDecorId: null,
  decorInventory: [],
  roomDecor: {},
  currentPoem: -1,
  currentPoemPhase: "learn",
  currentPoemFound: new Set(),
  poemDeck: [],
  currentWord: "月",
  currentAntonym: null,
  daily: {
    startedAt: "",
    completed: {},
  },
};

const SAVE_KEY = "chineseGardenState";
const SAVE_VERSION = 4;


const screens = {
  rhyme: document.querySelector("#rhymeScreen"),
  poem: document.querySelector("#poemScreen"),
  words: document.querySelector("#wordsScreen"),
  antonyms: document.querySelector("#antonymsScreen"),
  garden: document.querySelector("#gardenScreen"),
};

const toast = document.querySelector("#toast");
const rewardBurst = document.querySelector("#rewardBurst");
const updateToast = document.querySelector("#updateToast");
const importFile = document.querySelector("#importFile");
let audioContext;
let audioOutput;
let preferredVoice = null;
let speechQueue = [];
let isSpeaking = false;
let activeSpeech = null;
let speechRunId = 0;
let poemHighlightTimers = [];

const pronunciationHints = {
  长: "长短的长",
  重: "轻重的重",
  好: "好坏的好",
  少: "多少的少",
  干: "干湿的干",
  空: "满空的空",
  乐: "快乐的乐",
  觉: "睡觉的觉",
  脏: "脏乱的脏",
  乱: "整齐相反的乱",
  胜: "胜利的胜",
  败: "失败的败",
};

function refreshVoices() {
  if (!("speechSynthesis" in window)) return;
  const voices = window.speechSynthesis.getVoices();
  const chineseVoices = voices.filter((voice) => voice.lang === "zh-CN" || voice.lang.startsWith("zh"));
  preferredVoice = chineseVoices
    .map((voice) => {
      const name = voice.name.toLowerCase();
      let score = 0;
      if (voice.lang === "zh-CN") score += 8;
      if (/mandarin|普通话|xiaoxiao|xiaoyi|tingting|meijia|sinji|mei-jia|female|woman/.test(name)) score += 5;
      if (/premium|enhanced|natural|neural|online/.test(name)) score += 3;
      if (/google|microsoft|apple/.test(name)) score += 2;
      if (/male|man|yunjian|yunxi|kangkang/.test(name)) score -= 2;
      return { voice, score };
    })
    .sort((a, b) => b.score - a.score)[0]?.voice;
}

refreshVoices();
if ("speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = refreshVoices;
}

function clearSpeech() {
  clearPoemHighlight();
  speechQueue.forEach((item) => item.resolve());
  speechQueue = [];
  if (activeSpeech) activeSpeech.resolve();
  activeSpeech = null;
  isSpeaking = false;
  speechRunId += 1;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

function speak(text, options = {}) {
  if (!state.sound || !("speechSynthesis" in window)) return Promise.resolve();
  if (options.flush) clearSpeech();

  return new Promise((resolve) => {
    speechQueue.push({ text, options, resolve });
    runSpeechQueue();
  });
}

function runSpeechQueue() {
  if (isSpeaking || speechQueue.length === 0) return;

  const item = speechQueue.shift();
  const runId = speechRunId;
  const utterance = new SpeechSynthesisUtterance(item.text);
  const speechOptions = item.options || {};
  activeSpeech = item;
  isSpeaking = true;
  utterance.lang = "zh-CN";
  if (preferredVoice) utterance.voice = preferredVoice;
  utterance.rate = speechOptions.rate ?? 0.68;
  utterance.pitch = speechOptions.pitch ?? 0.96;
  utterance.volume = speechOptions.volume ?? 0.92;

  const finish = () => {
    if (runId !== speechRunId) return;
    activeSpeech = null;
    isSpeaking = false;
    item.resolve();
    window.setTimeout(runSpeechQueue, 160);
  };

  utterance.onend = finish;
  utterance.onerror = finish;
  window.speechSynthesis.speak(utterance);
}

function speakWord(word, options = {}) {
  return speak(pronunciationHints[word] || word, options);
}

function showToast(text) {
  toast.textContent = text;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 1600);
}

function playChime() {
  if (!state.sound) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  audioContext = audioContext || new AudioContext();
  if (audioContext.state === "suspended") audioContext.resume();
  if (!audioOutput) {
    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -28;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.2;
    const filter = audioContext.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 2600;
    filter.Q.value = 0.45;
    filter.connect(compressor);
    compressor.connect(audioContext.destination);
    audioOutput = filter;
  }

  const now = audioContext.currentTime;
  const notes = [
    { frequency: 659.25, delay: 0, gain: 0.026 },
    { frequency: 783.99, delay: 0.055, gain: 0.022 },
    { frequency: 987.77, delay: 0.12, gain: 0.018 },
  ];

  notes.forEach(({ frequency, delay, gain: peak }) => {
    const start = now + delay;
    const duration = 0.42;
    const oscillator = audioContext.createOscillator();
    const shimmer = audioContext.createOscillator();
    const toneGain = audioContext.createGain();
    const shimmerGain = audioContext.createGain();
    const envelope = audioContext.createGain();

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.985, start + duration);

    shimmer.type = "sine";
    shimmer.frequency.setValueAtTime(frequency * 2.01, start);

    toneGain.gain.setValueAtTime(0.82, start);
    shimmerGain.gain.setValueAtTime(0.18, start);

    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(peak, start + 0.028);
    envelope.gain.exponentialRampToValueAtTime(0.006, start + 0.18);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(toneGain);
    shimmer.connect(shimmerGain);
    toneGain.connect(envelope);
    shimmerGain.connect(envelope);
    envelope.connect(audioOutput);

    oscillator.start(start);
    shimmer.start(start);
    oscillator.stop(start + duration + 0.02);
    shimmer.stop(start + duration + 0.02);
  });
}

function getElementCenter(element) {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function createRewardBurst(element, words = []) {
  const center = element ? getElementCenter(element) : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  createBloom(center);
  const symbols = ["星", "花", "光", "好", "棒"];
  symbols.forEach((symbol, index) => {
    const spark = document.createElement("span");
    spark.className = "spark";
    spark.textContent = symbol;
    spark.style.setProperty("--x", `${center.x}px`);
    spark.style.setProperty("--y", `${center.y}px`);
    spark.style.setProperty("--dx", `${Math.cos(index * 1.26) * 110}px`);
    spark.style.setProperty("--dy", `${Math.sin(index * 1.26) * 92 - 40}px`);
    rewardBurst.appendChild(spark);
    window.setTimeout(() => spark.remove(), 950);
  });

  words.slice(0, 2).forEach((word, index) => {
    const card = document.createElement("span");
    card.className = "word-pop";
    card.textContent = word;
    card.style.setProperty("--x", `${center.x + index * 44 - 22}px`);
    card.style.setProperty("--y", `${center.y - 12}px`);
    rewardBurst.appendChild(card);
    window.setTimeout(() => card.remove(), 950);
  });
}

function createBloom(center) {
  const bloom = document.createElement("div");
  bloom.className = "bloom-reward";
  bloom.style.setProperty("--x", `${center.x}px`);
  bloom.style.setProperty("--y", `${center.y - 54}px`);
  bloom.innerHTML = `
    <span class="bloom-soil"></span>
    <span class="bloom-stem"></span>
    <span class="bloom-leaf left"></span>
    <span class="bloom-leaf right"></span>
    <span class="bloom-head">
      <span class="bloom-petal one"></span>
      <span class="bloom-petal two"></span>
      <span class="bloom-center"></span>
    </span>
  `;
  rewardBurst.appendChild(bloom);
  window.setTimeout(() => bloom.remove(), 1700);
}

function celebrateRhymeLine() {
  const line = document.querySelector("#rhymeLine");
  line.classList.remove("celebrate");
  void line.offsetWidth;
  line.classList.add("celebrate");
  window.setTimeout(() => line.classList.remove("celebrate"), 520);
}

function createDecor(type) {
  const item = decorCatalog.find((decor) => decor.type === type) || decorCatalog[0];
  return { ...item, id: `${item.type}-${Date.now()}-${Math.floor(Math.random() * 1000)}` };
}

function normalizeDecor(item) {
  const catalogItem = decorCatalog.find((decor) => decor.type === item?.type);
  return catalogItem ? { ...catalogItem, ...item, icon: item.icon || catalogItem.icon } : item;
}

function getDecorImage(type) {
  const fallback = { stone: "inkstone" }[type] || type;
  return `./assets/decor/${fallback}.png`;
}

function getDecorMarkup(item, extraClass = "") {
  const decor = normalizeDecor(item);
  return `<span class="decor ${extraClass} ${decor.type}">
    <img src="${getDecorImage(decor.type)}" alt="" loading="lazy" />
  </span>`;
}

function reward(words = [], element = null, game = null) {
  state.stars += 1;
  state.flowers += 1;
  if (game && state.stats[game] !== undefined) state.stats[game] += 1;
  words.forEach((word) => state.knownWords.add(word));
  saveState();
  renderGarden();
  playChime();
  createRewardBurst(element, words);
}

function getGardenRoom(id = state.activeGardenRoom) {
  return gardenRooms.find((room) => room.id === id) || gardenRooms[0];
}

function ensureGardenState() {
  gardenRooms.forEach((room) => {
    if (!Array.isArray(state.roomDecor[room.id])) state.roomDecor[room.id] = Array(room.spots.length).fill(null);
    state.roomDecor[room.id] = state.roomDecor[room.id].slice(0, room.spots.length);
    while (state.roomDecor[room.id].length < room.spots.length) state.roomDecor[room.id].push(null);
  });
  if (!gardenRooms.some((room) => room.id === state.activeGardenRoom)) state.activeGardenRoom = gardenRooms[0].id;
}

function getDecorCostText(item) {
  return `${item.cost.stars} 星 · ${item.cost.flowers} 花`;
}

function canBuyDecor(item) {
  return state.stars >= item.cost.stars && state.flowers >= item.cost.flowers;
}

function saveState() {
  ensureGardenState();
  localStorage.setItem(
    SAVE_KEY,
    JSON.stringify({
      version: SAVE_VERSION,
      sound: state.sound,
      stars: state.stars,
      flowers: state.flowers,
      stats: state.stats,
      knownWords: Array.from(state.knownWords),
      activeGardenRoom: state.activeGardenRoom,
      activeGardenPanel: state.activeGardenPanel,
      decorInventory: state.decorInventory,
      roomDecor: state.roomDecor,
      currentRhymeLesson: state.currentRhymeLesson,
      completedRhymePairs: Array.from(state.completedRhymePairs),
      daily: state.daily,
    })
  );
}

function loadState() {
  const saved = localStorage.getItem(SAVE_KEY);
  if (!saved) return;
  try {
    const parsed = JSON.parse(saved);
    state.sound = parsed.sound ?? true;
    state.stars = parsed.stars ?? 0;
    state.flowers = parsed.flowers ?? 0;
    state.stats = {
      rhyme: parsed.stats?.rhyme ?? (parsed.completedRhymePairs?.length || 0),
      poem: parsed.stats?.poem ?? 0,
      words: parsed.stats?.words ?? 0,
      antonyms: parsed.stats?.antonyms ?? 0,
    };
    state.knownWords = new Set(parsed.knownWords ?? []);
    state.activeGardenRoom = parsed.activeGardenRoom ?? "spring";
    state.activeGardenPanel = parsed.activeGardenPanel ?? "shop";
    state.daily = parsed.daily && typeof parsed.daily === "object" ? parsed.daily : { startedAt: getTodayKey(), completed: {} };
    state.decorInventory = Array.isArray(parsed.decorInventory) ? parsed.decorInventory : [];
    state.roomDecor = parsed.roomDecor && typeof parsed.roomDecor === "object" ? parsed.roomDecor : {};
    if (Array.isArray(parsed.placedDecor) && !state.roomDecor.spring) {
      state.roomDecor.spring = parsed.placedDecor;
    }
    if (parsed.pendingDecor) {
      state.decorInventory.push(parsed.pendingDecor);
    }
    ensureGardenState();
    ensureDailyState();
    state.currentRhymeLesson = Math.min(parsed.currentRhymeLesson ?? 0, rhymeSections.length - 1);
    state.completedRhymePairs = new Set(parsed.completedRhymePairs ?? []);
    saveState();
  } catch {
    localStorage.removeItem(SAVE_KEY);
  }
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function isScreenActive(name) {
  return screens[name]?.classList.contains("active");
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function announceAndWait(text, minMs) {
  return Promise.all([speak(text, { flush: true }), wait(minMs)]);
}

function getCurrentRhymeSection() {
  return rhymeSections[state.currentRhymeLesson];
}

function getLessonPairs(lessonIndex = state.currentRhymeLesson) {
  const section = rhymeSections[lessonIndex];
  return section.lines.flatMap((line) =>
    line.pairs.map(([left, right]) => ({
      left,
      right,
      text: line.text,
      section: section.title,
      key: `${section.title}-${left}-${right}`,
    }))
  );
}

function getCurrentLessonPairs() {
  return getLessonPairs();
}

function getFirstIncompleteRhymePair() {
  const pairs = getCurrentLessonPairs();
  return pairs.find((pair) => !state.completedRhymePairs.has(pair.key)) || pairs[Math.floor(Math.random() * pairs.length)];
}

function isCurrentRhymeLessonComplete() {
  return getCurrentLessonPairs().every((pair) => state.completedRhymePairs.has(pair.key));
}

function markRhymePairComplete(pair, element) {
  const wasComplete = isCurrentRhymeLessonComplete();
  if (!state.completedRhymePairs.has(pair.key)) {
    state.completedRhymePairs.add(pair.key);
    reward([pair.left, pair.right], element, "rhyme");
  } else {
    playChime();
    createRewardBurst(element, [pair.left, pair.right]);
  }
  completeDailyTask(getLearningDay() === 3 ? "rhyme-review" : "rhyme-play");
  saveState();
  renderRhymeProgress();
  if (!wasComplete && isCurrentRhymeLessonComplete()) {
    showToast(`${getCurrentRhymeSection().title}学完了`);
    speak(`${getCurrentRhymeSection().title}学完了。可以进入下一课。`, { flush: true });
  }
}

function renderRhymeProgress() {
  const section = getCurrentRhymeSection();
  const pairs = getCurrentLessonPairs();
  const done = pairs.filter((pair) => state.completedRhymePairs.has(pair.key)).length;
  const complete = done >= pairs.length;
  const box = document.querySelector("#rhymeProgress");
  box.innerHTML = `
    <div class="lesson-card">
      <span>第 ${state.currentRhymeLesson + 1} 课</span>
      <strong>${section.title}</strong>
      <em>${done} / ${pairs.length}</em>
    </div>
    <div class="lesson-actions">
      <button class="lesson-nav prev-lesson" id="prevRhymeLesson" type="button" ${state.currentRhymeLesson > 0 ? "" : "disabled"}>上一课</button>
      <button class="lesson-nav restart-lesson" id="restartRhymeLesson" type="button">重新学</button>
      <button class="lesson-nav next-lesson" id="nextRhymeLesson" type="button" ${complete && state.currentRhymeLesson < rhymeSections.length - 1 ? "" : "disabled"}>
        ${state.currentRhymeLesson >= rhymeSections.length - 1 && complete ? "第一册完成" : "下一课"}
      </button>
    </div>
  `;
  const prev = document.querySelector("#prevRhymeLesson");
  prev.addEventListener("click", () => {
    if (state.currentRhymeLesson <= 0) return;
    state.currentRhymeLesson -= 1;
    state.currentRhymeMode = "match";
    saveState();
    renderRhymes();
    speak(`回到第${state.currentRhymeLesson + 1}课，${getCurrentRhymeSection().title}。`, { flush: true });
  });
  const restart = document.querySelector("#restartRhymeLesson");
  restart.addEventListener("click", () => {
    getCurrentLessonPairs().forEach((pair) => state.completedRhymePairs.delete(pair.key));
    state.currentRhymeMode = "match";
    saveState();
    renderRhymes();
    showToast(`${getCurrentRhymeSection().title}重新开始`);
    speak(`${getCurrentRhymeSection().title}重新开始。`, { flush: true });
  });
  const next = document.querySelector("#nextRhymeLesson");
  next.addEventListener("click", () => {
    if (!isCurrentRhymeLessonComplete() || state.currentRhymeLesson >= rhymeSections.length - 1) return;
    state.currentRhymeLesson += 1;
    state.currentRhymeMode = "match";
    saveState();
    renderRhymes();
    speak(`进入第${state.currentRhymeLesson + 1}课，${getCurrentRhymeSection().title}。`, { flush: true });
  });
}

function renderRhymeStudy() {
  const section = getCurrentRhymeSection();
  const lines = section.lines.map((line) => line.text);
  const box = document.querySelector("#rhymeStudy");
  box.innerHTML = `
    <div class="rhyme-study-card">
      <div>
        <span>本课学习</span>
        <strong>${section.title}</strong>
      </div>
      <button class="listen-lesson" id="listenRhymeLesson" type="button">听这一课</button>
    </div>
    <div class="rhyme-lines">
      ${lines.map((line) => `<button class="rhyme-line-chip" type="button">${line}</button>`).join("")}
    </div>
  `;
  document.querySelector("#listenRhymeLesson").addEventListener("click", () => {
    speak(`${section.title}。${lines.join("")}`, { flush: true });
  });
  box.querySelectorAll(".rhyme-line-chip").forEach((button) => {
    button.addEventListener("click", () => speak(button.textContent, { flush: true }));
  });
}

function renderRhymes() {
  state.selectedLeft = null;
  state.rhythmIndex = 0;
  state.orderIndex = 0;
  document.querySelectorAll(".rhyme-mode").forEach((button) => {
    button.classList.toggle("active", button.dataset.rhymeMode === state.currentRhymeMode);
  });

  const titles = {
    match: "对对子找朋友",
    fill: "听声音补空",
    tap: "节奏拍一拍",
    order: "词卡拼小桥",
  };
  const hints = {
    match: "点一个左边的词，再点它右边的朋友。",
    fill: "听一句声律，从选项里补上空出来的词。",
    tap: "跟着字词的节奏，一下一下拍小鼓。",
    order: "按顺序点词卡，把一句声律拼成小桥。",
  };
  document.querySelector("#rhymeTitle").textContent = titles[state.currentRhymeMode];
  document.querySelector("#rhymeHint").textContent = hints[state.currentRhymeMode];
  renderRhymeProgress();
  renderRhymeStudy();

  if (state.currentRhymeMode === "match") renderRhymeMatch();
  if (state.currentRhymeMode === "fill") renderRhymeFill();
  if (state.currentRhymeMode === "tap") renderRhymeTap();
  if (state.currentRhymeMode === "order") renderRhymeOrder();
}

function renderRhymeMatch() {
  const pairs = getCurrentLessonPairs();
  state.currentRhymeRound = { pairs };
  document.querySelector("#rhymeLine").textContent = `${getCurrentRhymeSection().title}：按顺序完成这一课`;
  const game = document.querySelector("#rhymeGame");
  game.innerHTML = `
    <div class="match-area">
      <div class="choice-column" id="leftChoices"></div>
      <div class="bridge" aria-hidden="true"><span></span><span></span><span></span></div>
      <div class="choice-column" id="rightChoices"></div>
    </div>
  `;

  const left = document.querySelector("#leftChoices");
  const right = document.querySelector("#rightChoices");
  pairs.forEach((pair) => {
    const button = document.createElement("button");
    button.className = "choice";
    button.type = "button";
    button.textContent = pair.left;
    if (state.completedRhymePairs.has(pair.key)) button.classList.add("learned");
    button.addEventListener("click", () => selectRhymeLeft(button, pair));
    left.appendChild(button);
  });

  shuffle(pairs).forEach((pair) => {
    const button = document.createElement("button");
    button.className = "choice";
    button.type = "button";
    button.textContent = pair.right;
    if (state.completedRhymePairs.has(pair.key)) button.classList.add("learned");
    button.addEventListener("click", () => selectRhymeRight(button, pair));
    right.appendChild(button);
  });
}

function selectRhymeLeft(button, pair) {
  if (button.classList.contains("matched")) return;
  document.querySelectorAll("#leftChoices .choice").forEach((item) => item.classList.remove("selected"));
  button.classList.add("selected");
  state.selectedLeft = { button, pair };
  speak(pair.left, { flush: true });
}

function selectRhymeRight(button, pair) {
  if (!state.selectedLeft || button.classList.contains("matched")) {
    speak(pair.right, { flush: true });
    return;
  }

  const selected = state.selectedLeft;
  if (selected.pair.right === pair.right) {
    selected.button.classList.remove("selected");
    selected.button.classList.add("matched");
    button.classList.add("matched");
    document.querySelector("#rhymeLine").textContent = `${selected.pair.left} 对 ${selected.pair.right}`;
    celebrateRhymeLine();
    speak(`${selected.pair.left}对${selected.pair.right}。`, { flush: true });
    markRhymePairComplete(selected.pair, button);
    showToast("配对成功");
  } else {
    selected.button.classList.remove("selected");
    speak(`再想一想，${selected.pair.left}对谁呢？`, { flush: true });
    showToast("再试一次");
  }
  state.selectedLeft = null;
}

function renderRhymeFill() {
  const pair = getFirstIncompleteRhymePair();
  state.currentRhymeRound = { pair };
  const blankLine = `${pair.section}：${pair.left} 对 ____`;
  document.querySelector("#rhymeLine").textContent = blankLine;
  const lessonDecoys = getCurrentLessonPairs().filter((item) => item.right !== pair.right).map((item) => item.right);
  const backupDecoys = rhymePairBank.filter((item) => item.right !== pair.right).map((item) => item.right);
  const decoys = shuffle([...lessonDecoys, ...backupDecoys]).slice(0, 3);
  const options = shuffle([pair.right, ...decoys]);
  const game = document.querySelector("#rhymeGame");
  game.innerHTML = `<div class="rhyme-options"></div>`;
  const box = game.querySelector(".rhyme-options");
  options.forEach((word) => {
    const button = document.createElement("button");
    button.className = "choice";
    button.type = "button";
    button.textContent = word;
    button.addEventListener("click", () => {
      if (word === pair.right) {
        button.classList.add("matched");
        document.querySelector("#rhymeLine").textContent = `${pair.left} 对 ${pair.right}`;
        celebrateRhymeLine();
        speak(`${pair.left}对${pair.right}。`, { flush: true });
        markRhymePairComplete(pair, button);
        window.setTimeout(renderRhymes, 900);
      } else {
        button.classList.add("wrong");
        window.setTimeout(() => button.classList.remove("wrong"), 520);
        speak(`${word}，再想想。`, { flush: true });
      }
    });
    box.appendChild(button);
  });
  speak(`请补上，${pair.left}对什么？`, { flush: true });
}

function renderRhymeTap() {
  const pair = getFirstIncompleteRhymePair();
  const beats = [pair.left, "对", pair.right];
  state.currentRhymeRound = { pair, beats };
  document.querySelector("#rhymeLine").textContent = `${pair.section}：${beats.join(" / ")}`;
  const game = document.querySelector("#rhymeGame");
  game.innerHTML = `
    <div class="rhythm-board">
      <div class="beat-row">${beats.map((beat, index) => `<span class="beat ${index === 0 ? "active" : ""}">${beat}</span>`).join("")}</div>
      <button class="drum-button" type="button" id="drumButton">鼓</button>
    </div>
  `;
  document.querySelector("#drumButton").addEventListener("click", () => {
    const beatItems = document.querySelectorAll(".beat");
    const current = state.rhythmIndex;
    beatItems[current]?.classList.add("done");
    beatItems[current]?.classList.remove("active");
    speak(beats[current], { flush: true });
    state.rhythmIndex += 1;
    if (state.rhythmIndex >= beats.length) {
      celebrateRhymeLine();
      markRhymePairComplete(pair, document.querySelector("#drumButton"));
      showToast("节奏完成");
      window.setTimeout(renderRhymes, 900);
      return;
    }
    beatItems[state.rhythmIndex]?.classList.add("active");
  });
}

function renderRhymeOrder() {
  const pair = getFirstIncompleteRhymePair();
  const words = [pair.left, "对", pair.right];
  state.currentRhymeRound = { pair, words };
  state.orderIndex = 0;
  document.querySelector("#rhymeLine").textContent = `${pair.section}：请拼出一句声律`;
  const game = document.querySelector("#rhymeGame");
  game.innerHTML = `
    <div class="order-target" id="orderTarget"></div>
    <div class="rhyme-options"></div>
  `;
  const box = game.querySelector(".rhyme-options");
  shuffle(words).forEach((word) => {
    const button = document.createElement("button");
    button.className = "choice";
    button.type = "button";
    button.textContent = word;
    button.addEventListener("click", () => {
      if (word === words[state.orderIndex]) {
        button.classList.add("matched");
        button.disabled = true;
        document.querySelector("#orderTarget").insertAdjacentHTML("beforeend", `<span>${word}</span>`);
        speak(word, { flush: true });
        state.orderIndex += 1;
        if (state.orderIndex >= words.length) {
          document.querySelector("#rhymeLine").textContent = `${pair.left} 对 ${pair.right}`;
          celebrateRhymeLine();
          markRhymePairComplete(pair, button);
          window.setTimeout(renderRhymes, 1000);
        }
      } else {
        button.classList.add("wrong");
        window.setTimeout(() => button.classList.remove("wrong"), 520);
        speak("先找下一个词。", { flush: true });
      }
    });
    box.appendChild(button);
  });
}

function renderPoemPicker() {
  const picker = document.querySelector("#poemPicker");
  const poem = poems[state.currentPoem];
  if (state.currentPoemPhase === "learn") {
    picker.innerHTML = `
      <span class="poem-pill active">先学诗</span>
      <span class="poem-progress">字宝宝 ${poem.targets.length} 个</span>
    `;
    return;
  }
  picker.innerHTML = `
    <span class="poem-pill active">游戏中 ${state.currentPoem + 1} / ${poems.length}</span>
    <span class="poem-progress">找到 <b id="poemFoundCount">${state.currentPoemFound.size}</b> / ${poem.targets.length}</span>
  `;
}

function getNextPoemIndex() {
  if (state.poemDeck.length === 0) {
    const indices = poems.map((_, index) => index);
    const available = indices.length > 1 ? indices.filter((index) => index !== state.currentPoem) : indices;
    state.poemDeck = shuffle(available);
  }
  return state.poemDeck.shift();
}

function updatePoemProgress() {
  const count = document.querySelector("#poemFoundCount");
  if (count) count.textContent = state.currentPoemFound.size;
}

function renderPoem(settings = {}) {
  if (settings.next || state.currentPoem < 0) {
    state.currentPoem = getNextPoemIndex();
    state.currentPoemPhase = "learn";
  }
  state.currentPoemFound = new Set();
  renderPoemPicker();
  const poem = poems[state.currentPoem];
  if (state.currentPoemPhase === "learn") {
    renderPoemLearning(poem, settings);
    return;
  }

  renderPoemGame(poem, settings);
}

function renderPoemLine(line, index, extraClass = "") {
  return `<div class="poem-verse ${extraClass}" data-poem-line="${index}">
    ${typeof index === "number" ? `<span class="line-number">${index + 1}</span>` : ""}
    <span class="poem-line-text">${Array.from(line).map((char) => `<span class="poem-char">${char}</span>`).join("")}</span>
  </div>`;
}

function clearPoemHighlight() {
  poemHighlightTimers.forEach((timer) => window.clearTimeout(timer));
  poemHighlightTimers = [];
  document.querySelectorAll(".poem-char.active, .poem-verse.active-line").forEach((node) => {
    node.classList.remove("active", "active-line");
  });
}

function startPoemHighlight(poem, settings = {}) {
  clearPoemHighlight();
  const chars = Array.from(document.querySelectorAll("#poemText .poem-char"));
  if (!chars.length) return;
  const poemText = poem.lines.join("");
  const titleDelay = settings.includeTitle ? Math.max(800, poem.title.length * 360 + 380) : 160;
  const step = settings.step ?? 430;
  const duration = titleDelay + poemText.length * step;
  chars.forEach((char, index) => {
    const timer = window.setTimeout(() => {
      document.querySelectorAll("#poemText .poem-char.active").forEach((node) => node.classList.remove("active"));
      document.querySelectorAll("#poemText .poem-verse.active-line").forEach((node) => node.classList.remove("active-line"));
      char.classList.add("active");
      char.closest(".poem-verse")?.classList.add("active-line");
    }, titleDelay + index * step);
    poemHighlightTimers.push(timer);
  });
  poemHighlightTimers.push(window.setTimeout(clearPoemHighlight, duration + 700));
}

function renderPoemLearning(poem, settings = {}) {
  document.querySelector("#poemPrompt").textContent = `先听《${poem.title}》，看一看这首诗里的字宝宝。`;
  const explanation = poemExplanations[poem.title] || ["先听一听这首诗，看看里面有什么画面。"];
  const scene = document.querySelector("#poemScene");
  scene.innerHTML = `
    <div class="learn-scene">
      <div class="learn-sun">诗</div>
      <div class="learn-title">《${poem.title}》</div>
      <div class="learn-words">
        ${poem.targets.map((word) => `<button class="learn-word" type="button" data-word="${word}">${word}</button>`).join("")}
      </div>
    </div>
  `;
  scene.querySelectorAll(".learn-word").forEach((button) => {
    button.addEventListener("click", () => speakWord(button.dataset.word, { flush: true }));
  });

  const text = document.querySelector("#poemText");
  text.innerHTML = `
    <div class="poem-title">《${poem.title}》${poem.author}</div>
    ${poem.lines.map((line, index) => renderPoemLine(line, index, "learn-line")).join("")}
    <div class="poem-explain">
      <h3>小小讲解</h3>
      ${explanation.map((line) => `<p>${line}</p>`).join("")}
    </div>
    <button class="listen-poem-story" type="button" id="listenPoemStory">
      <span>▶</span>
      <strong>听诗和讲解</strong>
    </button>
    <button class="start-poem-game" type="button" id="startPoemGame">开始找字</button>
  `;
  document.querySelector("#listenPoemStory").addEventListener("click", () => {
    speakPoemLesson({ flush: true });
  });
  document.querySelector("#startPoemGame").addEventListener("click", () => {
    state.currentPoemPhase = "play";
    renderPoem();
    speak(`开始找《${poem.title}》里的字。`, { flush: true });
  });

  if (settings.announce && isScreenActive("poem")) {
    speak(`下一首，${poem.title}。先听一遍，再开始游戏。`, { flush: true });
  }
}

function renderPoemGame(poem, settings = {}) {
  renderPoemPicker();
  document.querySelector("#poemPrompt").textContent = `找出《${poem.title}》里出现的 ${poem.targets.length} 个字，小心有干扰字。`;
  const scene = document.querySelector("#poemScene");
  scene.innerHTML = "";
  const choices = shuffle([
    ...poem.targets.map((word) => ({ word, correct: true })),
    ...poem.decoys.map((word) => ({ word, correct: false })),
  ]);

  choices.forEach((item, index) => {
    const position = poemPositions[index % poemPositions.length];
    const button = document.createElement("button");
    button.className = "scene-item";
    button.type = "button";
    button.textContent = item.word;
    button.dataset.correct = item.correct ? "true" : "false";
    button.style.left = `${position.x}%`;
    button.style.top = `${position.y}%`;
    button.style.transform = "translate(-50%, -50%)";
    button.addEventListener("click", () => choosePoemWord(button, item));
    scene.appendChild(button);
  });

  const text = document.querySelector("#poemText");
  text.innerHTML = `
    <div class="poem-title">《${poem.title}》${poem.author}</div>
    ${poem.lines.map((line, index) => renderPoemLine(line, index)).join("")}
  `;

  if (settings.announce && isScreenActive("poem")) {
    speak(`请找《${poem.title}》里出现的字。`, { flush: true });
  }
}

function choosePoemWord(button, item) {
  const poem = poems[state.currentPoem];
  if (button.classList.contains("found") || button.disabled) {
    speakWord(item.word, { flush: true });
    return;
  }

  if (!item.correct) {
    button.classList.remove("wrong");
    void button.offsetWidth;
    button.classList.add("wrong");
    window.setTimeout(() => button.classList.remove("wrong"), 520);
    speak(`${item.word}，不在这首诗里。`, { flush: true });
    showToast(`“${item.word}”不在《${poem.title}》里`);
    return;
  }

  button.classList.add("found");
  state.currentPoemFound.add(item.word);
  updatePoemProgress();
  reward([item.word], button, "poem");
  completeDailyTask("poem-find");

  if (state.currentPoemFound.size >= poem.targets.length) {
    document.querySelectorAll("#poemScene .scene-item").forEach((choice) => {
      choice.disabled = true;
    });
    document.querySelector("#poemPrompt").textContent = `《${poem.title}》过关了，准备进入下一首。`;
    showToast(`《${poem.title}》过关了`);
    announceAndWait(`${item.word}。全部找到了，${poem.title}过关。`, 1900).then(() => {
      if (isScreenActive("poem")) {
        renderPoem({ next: true, announce: true });
      }
    });
    return;
  }

  speakWord(item.word, { flush: true });
  showToast(`找到“${item.word}”了`);
}

function speakPoem(options = {}) {
  const poem = poems[state.currentPoem];
  const speechOptions = { ...options, flush: false };
  if (options.flush) clearSpeech();
  startPoemHighlight(poem, { includeTitle: true });
  completeDailyTask(getLearningDay() === 3 ? "poem-review" : "poem-listen");
  speak(`${poem.title}。${poem.lines.join("")}`, speechOptions);
}

function speakPoemLesson(options = {}) {
  const poem = poems[state.currentPoem];
  const explanation = poemExplanations[poem.title] || ["先听一听这首诗，看看里面有什么画面。"];
  const speechOptions = { ...options, flush: false };
  if (options.flush) clearSpeech();
  startPoemHighlight(poem, { includeTitle: true });
  completeDailyTask(getLearningDay() === 3 ? "poem-review" : "poem-listen");
  speak(`${poem.title}。${poem.lines.join("")}。小小讲解。${explanation.join("")}`, speechOptions);
}

function switchPoem(offset) {
  const current = state.currentPoem < 0 ? 0 : state.currentPoem;
  state.currentPoem = (current + offset + poems.length) % poems.length;
  state.currentPoemPhase = "learn";
  clearPoemHighlight();
  renderPoem({ announce: true });
}

function renderWords(settings = {}) {
  const target = wordPool[Math.floor(Math.random() * wordPool.length)];
  state.currentWord = target;
  document.querySelector("#wordPrompt").textContent = `请找到“${target}”。`;
  const playground = document.querySelector("#wordPlayground");
  const options = shuffle([target, ...shuffle(wordPool.filter((word) => word !== target)).slice(0, 14)]);
  playground.innerHTML = "";

  options.forEach((word) => {
    const button = document.createElement("button");
    button.className = "word-tile";
    button.type = "button";
    button.textContent = word;
    button.addEventListener("click", () => {
      if (word === target) {
        button.classList.add("correct");
        button.disabled = true;
        announceAndWait(`找到了，${pronunciationHints[word] || word}`, 1000).then(() => {
          if (isScreenActive("words")) {
            window.setTimeout(() => renderWords({ announce: true }), 500);
          }
        });
        reward([word], button, "words");
        completeDailyTask("word-find");
        showToast(`“${word}”住进字宝宝盒子了`);
      } else {
        speakWord(word, { flush: true });
        showToast("这个字也很好看，再找找目标字");
      }
    });
    playground.appendChild(button);
  });
  if (settings.announce && isScreenActive("words")) {
    speak(`请找到，${pronunciationHints[target] || target}`, { flush: true });
  }
}

function renderAntonyms(settings = {}) {
  const pair = antonyms[Math.floor(Math.random() * antonyms.length)];
  const question = pair.a;
  const answer = pair.b;
  state.currentAntonym = { ...pair, question, answer };

  const stage = document.querySelector("#antonymStage");
  stage.className = "antonym-stage";
  document.querySelector("#leftSign").textContent = question;
  document.querySelector("#rightSign").textContent = answer;
  document.querySelector("#antonymPrompt").textContent = `谁是“${question}”的反义词？`;
  const caption = document.querySelector("#actionCaption");
  if (caption) caption.textContent = "选对后，小朋友会做动作";

  const options = shuffle([
    answer,
    ...shuffle(antonymWords.filter((word) => word !== question && word !== answer)).slice(0, 3),
  ]);
  const optionBox = document.querySelector("#antonymOptions");
  optionBox.innerHTML = "";

  options.forEach((word) => {
    const button = document.createElement("button");
    button.className = "antonym-option";
    button.type = "button";
    button.textContent = word;
    button.addEventListener("click", () => chooseAntonym(button, word));
    optionBox.appendChild(button);
  });

  if (settings.announce && isScreenActive("antonyms")) {
    speak(`请找，${pronunciationHints[question] || question}，的反义词。`, { flush: true });
  }
}

function chooseAntonym(button, word) {
  const pair = state.currentAntonym;
  if (!pair) return;

  if (word === pair.answer) {
    document.querySelectorAll(".antonym-option").forEach((item) => {
      item.disabled = true;
    });
    button.classList.add("correct");
    showAntonymAction(pair);
    announceAndWait(`${pronunciationHints[pair.question] || pair.question}，和，${pronunciationHints[pair.answer] || pair.answer}，是反义词。`, 2600).then(() => {
      if (isScreenActive("antonyms")) {
        window.setTimeout(() => renderAntonyms({ announce: true }), 700);
      }
    });
    reward([pair.question, pair.answer], button, "antonyms");
    completeDailyTask("antonym-play");
    showToast(`答对了：${pair.question} 和 ${pair.answer}`);
    return;
  }

  button.classList.remove("wrong");
  void button.offsetWidth;
  button.classList.add("wrong");
  speakWord(word, { flush: true });
  showToast("再想一想，找相反的词");
}

function showAntonymAction(pair) {
  const stage = document.querySelector("#antonymStage");
  stage.className = `antonym-stage show action-${pair.action}`;
  const caption = document.querySelector("#actionCaption");
  if (caption) caption.textContent = `看动作：${pair.question} 和 ${pair.answer} 是相反的`;
}

function renderGarden() {
  ensureGardenState();
  document.querySelector("#starCount").textContent = state.stars;
  document.querySelector("#knownCount").textContent = state.knownWords.size;
  document.querySelector("#flowerCount").textContent = state.flowers;
  renderGameStats();

  renderRoomPicker();
  renderGardenPanelTabs();
  renderDecorShop();
  renderDecorInventory();
  renderGardenRoom();
  renderKnownWords();
}

function renderGameStats() {
  const totalRhymePairs = rhymePairBank.length;
  const stats = [
    { label: "声律", count: state.stats.rhyme, detail: `${state.completedRhymePairs.size}/${totalRhymePairs}` },
    { label: "诗词", count: state.stats.poem, detail: "次找字" },
    { label: "识字", count: state.stats.words, detail: "次找到" },
    { label: "反义", count: state.stats.antonyms, detail: "次答对" },
  ];
  const box = document.querySelector("#gameStats");
  box.innerHTML = stats
    .map(
      (item) => `
        <div class="game-stat">
          <strong>${item.label}</strong>
          <span>${item.count}</span>
          <em>${item.detail}</em>
        </div>
      `
    )
    .join("");
}

function renderRoomPicker() {
  const picker = document.querySelector("#roomPicker");
  picker.innerHTML = "";
  gardenRooms.forEach((room) => {
    const placedCount = state.roomDecor[room.id].filter(Boolean).length;
    const button = document.createElement("button");
    button.className = `room-tab ${room.id === state.activeGardenRoom ? "active" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <strong>${room.label}</strong>
      <span>${placedCount} / ${room.spots.length}</span>
    `;
    button.addEventListener("click", () => {
      state.activeGardenRoom = room.id;
      state.selectedDecorId = null;
      saveState();
      renderGarden();
      speak(`来到${room.label}。${room.hint}`, { flush: true });
    });
    picker.appendChild(button);
  });
}

function renderGardenPanelTabs() {
  document.querySelectorAll(".palette-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.gardenPanel === state.activeGardenPanel);
  });
  document.querySelector("#decorShopView").classList.toggle("active", state.activeGardenPanel === "shop");
  document.querySelector("#decorInventoryView").classList.toggle("active", state.activeGardenPanel === "bag");
}

function renderDecorShop() {
  const shop = document.querySelector("#decorShop");
  shop.innerHTML = "";
  const orderedRooms = [
    getGardenRoom(),
    ...gardenRooms.filter((room) => room.id !== state.activeGardenRoom),
  ];

  orderedRooms.forEach((room) => {
    const items = decorCatalog.filter((item) => item.rooms?.includes(room.id));
    const group = document.createElement("section");
    group.className = `shop-group ${room.id === state.activeGardenRoom ? "active" : ""}`;
    group.innerHTML = `
      <div class="shop-group-title">
        <strong>${room.label}</strong>
        <span>${room.id === state.activeGardenRoom ? "正在布置" : "也可先挑"}</span>
      </div>
    `;
    const grid = document.createElement("div");
    grid.className = "shop-grid";
    items.forEach((item) => {
      const affordable = canBuyDecor(item);
      const button = document.createElement("button");
      button.className = `shop-item ${affordable ? "" : "disabled"}`;
      button.type = "button";
      button.disabled = !affordable;
      button.innerHTML = `
        ${getDecorMarkup(item, "shop-decor")}
        <span>
          <strong>${item.label}</strong>
          <em>${getDecorCostText(item)}</em>
        </span>
      `;
      button.addEventListener("click", () => buyDecor(item.type));
      grid.appendChild(button);
    });
    group.appendChild(grid);
    shop.appendChild(group);
  });
}

function renderDecorInventory() {
  const inventory = document.querySelector("#decorInventory");
  const hint = document.querySelector("#inventoryHint");
  const selectedInBag = state.decorInventory.some((item) => item.id === state.selectedDecorId);
  if (!selectedInBag) state.selectedDecorId = null;
  inventory.innerHTML = "";

  if (!state.decorInventory.length) {
    hint.textContent = "先去装饰铺子挑摆件。";
    const empty = document.createElement("div");
    empty.className = "inventory-empty";
    empty.textContent = "背包空空";
    inventory.appendChild(empty);
    return;
  }

  hint.textContent = state.selectedDecorId ? "点房间里的亮点，把选中的装饰贴上去。" : "点一个装饰，再贴到房间里。";
  state.decorInventory = state.decorInventory.map(normalizeDecor);
  state.decorInventory.forEach((item) => {
    const button = document.createElement("button");
    button.className = `inventory-item ${item.id === state.selectedDecorId ? "selected" : ""}`;
    button.type = "button";
    button.innerHTML = `
      ${getDecorMarkup(item)}
      <strong>${item.label}</strong>
    `;
    button.addEventListener("click", () => {
      state.selectedDecorId = item.id === state.selectedDecorId ? null : item.id;
      renderGarden();
      if (state.selectedDecorId) speak(`选中了${item.label}。点房间里的亮点，把它贴上去。`, { flush: true });
    });
    inventory.appendChild(button);
  });
}

function renderGardenRoom() {
  const room = getGardenRoom();
  const slots = state.roomDecor[room.id];
  document.querySelector("#roomTitle").textContent = room.label;
  document.querySelector("#roomHint").textContent = room.hint;
  const garden = document.querySelector("#myGarden");
  garden.className = `my-garden room-${room.id}`;
  garden.innerHTML = "";
  room.spots.forEach((spot, index) => {
    const slot = document.createElement("button");
    const placed = slots[index];
    slot.className = `decor-slot size-${spot.size || "medium"} ${placed ? "filled" : ""} ${state.selectedDecorId && !placed ? "ready" : ""}`;
    slot.type = "button";
    slot.style.left = `${spot.x}%`;
    slot.style.top = `${spot.y}%`;

    if (placed) {
      const decor = normalizeDecor(placed);
      slot.innerHTML = getDecorMarkup(decor, "garden-decor");
      slot.setAttribute("aria-label", placed.label);
    } else {
      slot.innerHTML = `<span class="slot-dot"></span>`;
      slot.setAttribute("aria-label", "空位置");
    }

    slot.addEventListener("click", () => {
      if (state.selectedDecorId) {
        placeDecor(index);
        return;
      }
      if (placed) playDecor(slot, placed);
    });
    garden.appendChild(slot);
  });
}

function renderKnownWords() {
  const known = document.querySelector("#knownWords");
  known.innerHTML = "";
  Array.from(state.knownWords)
    .sort((a, b) => wordPool.indexOf(a) - wordPool.indexOf(b))
    .forEach((word) => {
      const item = document.createElement("span");
      item.className = `known-word ${word.length > 1 ? "phrase" : ""}`;
      item.textContent = word;
      known.appendChild(item);
    });
}

function buyDecor(type) {
  const item = decorCatalog.find((decor) => decor.type === type);
  if (!item) return;
  if (!canBuyDecor(item)) {
    showToast("星星或小花还不够");
    speak("星星或小花还不够，先去玩一局吧。", { flush: true });
    return;
  }
  const decor = createDecor(type);
  state.stars -= item.cost.stars;
  state.flowers -= item.cost.flowers;
  state.decorInventory.push(decor);
  state.selectedDecorId = decor.id;
  state.activeGardenPanel = "bag";
  saveState();
  renderGarden();
  playChime();
  showToast(`${decor.label}放进背包了`);
  speak(`${decor.label}放进背包了。点房间里的亮点，把它贴上去。`, { flush: true });
}

function placeDecor(index) {
  const room = getGardenRoom();
  const slots = state.roomDecor[room.id];
  if (slots[index]) {
    showToast("这里已经有装饰了");
    speak("这里已经有装饰了，换一个亮点吧。", { flush: true });
    return;
  }
  const inventoryIndex = state.decorInventory.findIndex((item) => item.id === state.selectedDecorId);
  if (inventoryIndex < 0) {
    state.selectedDecorId = null;
    renderGarden();
    return;
  }
  const [decor] = state.decorInventory.splice(inventoryIndex, 1);
  slots[index] = decor;
  const label = decor.label;
  state.selectedDecorId = null;
  completeDailyTask("garden-place");
  saveState();
  renderGarden();
  showToast(`${label}放进花园了`);
  speak(`${label}放进花园了。`, { flush: true });
}

function clearActiveRoom() {
  const room = getGardenRoom();
  const slots = state.roomDecor[room.id];
  const placed = slots.filter(Boolean);
  if (!placed.length) {
    showToast("这个房间还没有装饰");
    return;
  }
  state.decorInventory.push(...placed);
  state.roomDecor[room.id] = Array(room.spots.length).fill(null);
  state.selectedDecorId = null;
  saveState();
  renderGarden();
  showToast(`${room.label}的装饰已收回背包`);
  speak(`${room.label}的装饰已收回背包。`, { flush: true });
}

function playDecor(slot, item) {
  slot.classList.remove("play", "rain", "glow", "spin", "light", "word");
  void slot.offsetWidth;
  const actionClass = {
    flower: "play",
    butterfly: "play",
    swing: "play",
    "gate-charm": "light",
    "pebble-path": "play",
    "potted-plum": "play",
    "tea-table": "play",
    star: "glow",
    cloud: "rain",
    firefly: "glow",
    "bamboo-shadow": "play",
    "jade-rabbit-lamp": "light",
    "cloud-step": "play",
    pinwheel: "spin",
    lantern: "light",
    "pond-lamp": "light",
    "water-ripple": "play",
    "lily-pad": "play",
    reed: "play",
    dragonfly: "spin",
    "fish-bubble": "play",
    stone: "word",
    "brush-pot": "play",
    "seal-cube": "light",
    scroll: "play",
    "bamboo-slip": "play",
    inkstone: "play",
    "book-stack": "play",
    "study-lamp": "light",
    "window-curtain": "play",
    tree: "play",
    bridge: "play",
    book: "word",
    moon: "glow",
    lotus: "light",
    kite: "spin",
  }[item.type] || "play";
  slot.classList.add(actionClass);

  if (item.type === "stone" || item.type === "book") {
    const words = Array.from(state.knownWords);
    const word = words.length ? words[Math.floor(Math.random() * words.length)] : "字";
    slot.dataset.word = word;
    speakWord(word, { flush: true });
  } else {
    speak(`${item.label}动起来了。`, { flush: true });
  }

  window.setTimeout(() => {
    slot.classList.remove("play", "rain", "glow", "spin", "light", "word");
  }, 1400);
}

function switchScreen(name) {
  clearSpeech();
  Object.entries(screens).forEach(([key, screen]) => {
    screen.classList.toggle("active", key === name);
  });
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.screen === name);
  });
  const lines = {
    rhyme: "找一找谁和谁是一对。",
    poem: "走进诗里，点一点你听到的字。",
    words: "字宝宝藏起来了，快找找。",
    antonyms: "找相反的词，看小朋友做动作。",
    garden: "这里会留下她玩过的痕迹。",
  };
  document.querySelector("#welcomeLine").textContent = lines[name];

  if (name === "words") {
    speak(`请找到，${pronunciationHints[state.currentWord] || state.currentWord}`, { flush: true });
  }
  if (name === "poem" && state.currentPoem >= 0) {
    const poem = poems[state.currentPoem];
    if (state.currentPoemPhase === "learn") {
      speak(`诗词花园，${poem.title}。先听一遍，再开始游戏。`, { flush: true });
    } else {
      speak(`诗词花园，${poem.title}。请找诗里出现的字。`, { flush: true });
    }
  }
  if (name === "antonyms" && state.currentAntonym) {
    speak(`请找，${pronunciationHints[state.currentAntonym.question] || state.currentAntonym.question}，的反义词。`, { flush: true });
  }
  if (name === "garden") {
    speak("我的中文花园。可以去装饰铺子挑摆件，再贴到不同小院里。", { flush: true });
  }
  if (name === "rhyme") {
    speak("声律小桥，选一个玩法开始吧。", { flush: true });
  }
  renderDailyQuest();
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchScreen(tab.dataset.screen));
  });

  document.querySelectorAll(".rhyme-mode").forEach((button) => {
    button.addEventListener("click", () => {
      state.currentRhymeMode = button.dataset.rhymeMode;
      renderRhymes();
    });
  });

  document.querySelector("#soundButton").addEventListener("click", () => {
    state.sound = !state.sound;
    document.querySelector("#soundText").textContent = state.sound ? "朗读开" : "朗读关";
    saveState();
    if (!state.sound) clearSpeech();
    if (state.sound) speak("朗读打开了", { flush: true });
  });

  document.querySelector("#readRhymeButton").addEventListener("click", () => {
    completeDailyTask("rhyme-listen");
    const round = state.currentRhymeRound;
    if (round?.pair) {
      speak(`${round.pair.section}。${round.pair.left}对${round.pair.right}。`, { flush: true });
      return;
    }
    if (round?.pairs?.length) {
      speak(round.pairs.map((pair) => `${pair.left}对${pair.right}`).join("。"), { flush: true });
      return;
    }
    speak("云对雨，雪对风。", { flush: true });
  });

  document.querySelector("#readPoemButton").addEventListener("click", () => {
    if (state.currentPoemPhase === "learn") {
      speakPoemLesson({ flush: true });
      return;
    }
    speakPoem({ flush: true });
  });
  document.querySelector("#prevPoemButton").addEventListener("click", () => switchPoem(-1));
  document.querySelector("#nextPoemButton").addEventListener("click", () => switchPoem(1));
  document.querySelector("#newWordButton").addEventListener("click", () => renderWords({ announce: true }));
  document.querySelector("#newAntonymButton").addEventListener("click", () => renderAntonyms({ announce: true }));
  document.querySelector("#clearRoomButton").addEventListener("click", clearActiveRoom);
  document.querySelector("#exportButton").addEventListener("click", exportProgress);
  document.querySelector("#importButton").addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", () => {
    importProgress(importFile.files?.[0]);
    importFile.value = "";
  });
  document.querySelectorAll(".palette-tab").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeGardenPanel = button.dataset.gardenPanel;
      saveState();
      renderGardenPanelTabs();
    });
  });

  document.querySelector("#resetButton").addEventListener("click", () => {
    state.stars = 0;
    state.flowers = 0;
    state.stats = { rhyme: 0, poem: 0, words: 0, antonyms: 0 };
    state.knownWords = new Set();
    state.activeGardenRoom = "spring";
    state.selectedDecorId = null;
    state.decorInventory = [];
    state.roomDecor = {};
    state.daily = { startedAt: getTodayKey(), completed: {} };
    ensureGardenState();
    ensureDailyState();
    state.currentRhymeLesson = 0;
    state.completedRhymePairs = new Set();
    saveState();
    renderRhymes();
    renderGarden();
    showToast("花园已经重新开始");
  });
}

loadState();
bindEvents();
renderRhymes();
renderPoem();
renderWords();
renderAntonyms();
renderGarden();
renderDailyQuest();
document.querySelector("#soundText").textContent = state.sound ? "朗读开" : "朗读关";

if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").then((registration) => {
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
      const showUpdate = () => {
        if (!updateToast) return;
        updateToast.classList.add("show");
        updateToast.onclick = () => {
          registration.waiting?.postMessage({ type: "SKIP_WAITING" });
        };
      };
      if (registration.waiting && navigator.serviceWorker.controller) showUpdate();
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdate();
        });
      });
    }).catch(() => {});
  });
}
