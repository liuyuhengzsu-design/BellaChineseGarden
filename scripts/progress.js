function getTodayKey() {
  return new Date().toLocaleDateString("sv-SE");
}

function getLearningDay() {
  const startedAt = state.daily.startedAt || getTodayKey();
  const start = new Date(`${startedAt}T00:00:00`);
  const today = new Date(`${getTodayKey()}T00:00:00`);
  const diff = Math.max(0, Math.floor((today - start) / 86400000));
  return (diff % 3) + 1;
}

function getLearningIndex() {
  const startedAt = state.daily.startedAt || getTodayKey();
  const start = new Date(`${startedAt}T00:00:00`);
  const today = new Date(`${getTodayKey()}T00:00:00`);
  return Math.max(0, Math.floor((today - start) / 86400000));
}

function ensureDailyState() {
  const today = getTodayKey();
  if (!state.daily || typeof state.daily !== "object") {
    state.daily = { startedAt: today, completed: {} };
  }
  if (!state.daily.startedAt) state.daily.startedAt = today;
  if (!state.daily.completed || typeof state.daily.completed !== "object") state.daily.completed = {};
  state.daily.completed[today] = state.daily.completed[today] || {};
}

function isDailyTaskDone(id) {
  ensureDailyState();
  return Boolean(state.daily.completed[getTodayKey()]?.[id]);
}

function completeDailyTask(id) {
  ensureDailyState();
  if (state.daily.completed[getTodayKey()][id]) return;
  state.daily.completed[getTodayKey()][id] = true;
  saveState();
  renderDailyQuest();
}

function getDailyPlan() {
  const dayIndex = getLearningIndex();
  const themes = [
    { name: "月光诗会", poemIndex: 1, rhymeIndex: 0, room: "moon", decor: "挂一盏月亮灯" },
    { name: "春晓花会", poemIndex: 2, rhymeIndex: 1, room: "spring", decor: "添一件春日摆件" },
    { name: "小荷池会", poemIndex: 8, rhymeIndex: 5, room: "pond", decor: "布置小荷池" },
    { name: "书房读会", poemIndex: 0, rhymeIndex: 3, room: "study", decor: "给书房添笔墨" },
  ];
  const theme = themes[Math.floor(dayIndex / 3) % themes.length];
  return {
    ...theme,
    day: (dayIndex % 3) + 1,
    flower: (dayIndex % 3) + 1,
    poemIndex: Math.min(theme.poemIndex, poems.length - 1),
    rhymeIndex: Math.min(theme.rhymeIndex, rhymeSections.length - 1),
  };
}

function getDailyTasks() {
  const plan = getDailyPlan();
  const poem = poems[plan.poemIndex];
  const rhyme = rhymeSections[plan.rhymeIndex];
  const plans = {
    1: [
      { id: "rhyme-listen", icon: "声", title: `听 ${rhyme.title}`, detail: "慢慢听一遍，熟悉节奏。", screen: "rhyme" },
      { id: "poem-listen", icon: "诗", title: `听《${poem.title}》`, detail: "看字发亮，听完整首诗。", screen: "poem" },
      { id: "word-find", icon: "字", title: "找 1 个字宝宝", detail: "再找一个熟悉的字。", screen: "words" },
    ],
    2: [
      { id: "rhyme-play", icon: "桥", title: "玩一次声律", detail: "配对、补空、拍节奏都可以。", screen: "rhyme" },
      { id: "poem-find", icon: "花", title: `《${poem.title}》找字`, detail: "从诗的画面里找字宝宝。", screen: "poem" },
      { id: "antonym-play", icon: "反", title: "玩反义词", detail: "看动作，找相反的词。", screen: "antonyms" },
    ],
    3: [
      { id: "rhyme-review", icon: "复", title: "复习声律", detail: "再玩一小局，把小桥搭稳。", screen: "rhyme" },
      { id: "poem-review", icon: "读", title: `再读《${poem.title}》`, detail: "边听边看卡拉 OK 字。", screen: "poem" },
      { id: "garden-place", icon: "园", title: plan.decor, detail: "贴一件装饰，留下今天的花印。", screen: "garden" },
    ],
  };
  return plans[plan.day].map((task) => ({ ...task, plan }));
}

function prepareDailyTask(task) {
  const plan = task.plan || getDailyPlan();
  if (task.screen === "rhyme") {
    state.currentRhymeLesson = plan.rhymeIndex;
    state.selectedLeft = null;
    renderRhymes();
  }
  if (task.screen === "poem") {
    state.currentPoem = plan.poemIndex;
    state.currentPoemPhase = task.id === "poem-find" ? "play" : "learn";
    clearPoemHighlight();
    renderPoem();
  }
  if (task.screen === "garden") {
    state.activeGardenRoom = plan.room;
    renderGarden();
  }
  saveState();
}

function renderDailyQuest() {
  ensureDailyState();
  const plan = getDailyPlan();
  const title = document.querySelector("#dailyTitle");
  const pace = document.querySelector("#dailyPace");
  const cards = document.querySelector("#dailyCards");
  if (!title || !pace || !cards) return;
  const tasks = getDailyTasks();
  const doneCount = tasks.filter((task) => isDailyTaskDone(task.id)).length;
  title.textContent = plan.name;
  pace.textContent = `花印 ${plan.flower} / 3`;
  cards.innerHTML = "";
  tasks.forEach((task) => {
    const done = isDailyTaskDone(task.id);
    const button = document.createElement("button");
    button.className = `daily-card ${done ? "done" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <b>${task.icon}</b>
      <span><strong>${task.title}</strong><span>${task.detail}</span></span>
      <em>${done ? "✓" : "去"}</em>
    `;
    button.addEventListener("click", () => {
      prepareDailyTask(task);
      switchScreen(task.screen);
      if (task.id.includes("listen") || task.id.includes("review")) {
        window.setTimeout(() => {
          if (task.screen === "rhyme") document.querySelector("#readRhymeButton")?.click();
          if (task.screen === "poem") document.querySelector("#readPoemButton")?.click();
        }, 260);
      }
    });
    cards.appendChild(button);
  });
  const finish = document.createElement("div");
  finish.className = `daily-finish ${doneCount >= tasks.length ? "show" : ""}`;
  finish.innerHTML = doneCount >= tasks.length
    ? "<strong>今日游园完成</strong><span>今天还可以继续自由玩，明天会有新的游园花笺。</span>"
    : `<strong>今日游园 ${doneCount} / ${tasks.length}</strong><span>按顺序走一圈，也可以随时去别的地方玩。</span>`;
  cards.appendChild(finish);
}

function exportProgress() {
  ensureGardenState();
  ensureDailyState();
  const payload = {
    app: "BellaChineseGarden",
    exportedAt: new Date().toISOString(),
    data: JSON.parse(localStorage.getItem(SAVE_KEY) || "{}"),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `bella-chinese-garden-backup-${getTodayKey()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
  showToast("成长记录已备份");
}

function importProgress(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(String(reader.result || "{}"));
      const data = payload.app === "BellaChineseGarden" ? payload.data : payload;
      if (!data || typeof data !== "object") throw new Error("invalid backup");
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      showToast("成长记录已导入，正在刷新");
      window.setTimeout(() => window.location.reload(), 500);
    } catch {
      showToast("这个备份文件不能导入");
    }
  };
  reader.readAsText(file);
}
