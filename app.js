/* ===================== 資料層 ===================== */

const LS_KEYS = {
  attempts: 'toeic_attempts',
  wrongbook: 'toeic_wrongbook',
  examHistory: 'toeic_exam_history',
  custom5: 'toeic_custom_part5',
  custom6: 'toeic_custom_part6',
  custom7: 'toeic_custom_part7',
};

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  scheduleCloudPush();
}

/* ===================== 雲端同步 ===================== */

const SYNC_CODE_KEY = 'toeic_sync_code';
const SUPABASE_URL = 'https://hiinhsxaxnsruuejhybq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_rTgFbEN54f0shHoq5FbkIQ_i7vL4tmA';

const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

function syncKeyList() {
  return [...Object.values(LS_KEYS), ...Object.values(VOCAB_LS_KEYS)];
}

function getSyncCode() {
  return localStorage.getItem(SYNC_CODE_KEY) || '';
}

function setSyncCode(code) {
  localStorage.setItem(SYNC_CODE_KEY, code);
}

function generateSyncCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function setSyncStatus(text) {
  const el = document.getElementById('sync-status');
  if (el) el.textContent = text;
}

function collectSyncBundle() {
  const bundle = {};
  syncKeyList().forEach(key => {
    const raw = localStorage.getItem(key);
    if (raw !== null) bundle[key] = JSON.parse(raw);
  });
  return bundle;
}

function applySyncBundle(bundle) {
  if (!bundle) return;
  Object.entries(bundle).forEach(([key, value]) => {
    localStorage.setItem(key, JSON.stringify(value));
  });
}

let cloudPushTimer = null;
function scheduleCloudPush() {
  if (!supabaseClient || !getSyncCode()) return;
  clearTimeout(cloudPushTimer);
  cloudPushTimer = setTimeout(pushToCloud, 1500);
}

async function pushToCloud() {
  const code = getSyncCode();
  if (!supabaseClient || !code) return;
  setSyncStatus('同步中…');
  try {
    const { error } = await supabaseClient
      .from('toeic_progress')
      .upsert({ code, data: collectSyncBundle(), updated_at: new Date().toISOString() });
    if (error) throw error;
    setSyncStatus(`已連結代碼「${code}」，上次同步：${new Date().toLocaleTimeString('zh-TW')}`);
  } catch (e) {
    setSyncStatus(`同步失敗：${e.message || e}`);
  }
}

async function pullFromCloud(code) {
  if (!supabaseClient || !code) return;
  setSyncStatus('讀取雲端紀錄中…');
  try {
    const { data, error } = await supabaseClient
      .from('toeic_progress')
      .select('data')
      .eq('code', code)
      .maybeSingle();
    if (error) throw error;
    if (data && data.data) {
      applySyncBundle(data.data);
      setSyncStatus(`已連結代碼「${code}」，讀取到雲端紀錄。`);
    } else {
      setSyncStatus(`已連結代碼「${code}」（雲端目前無資料，將以這台裝置的紀錄為主）。`);
      await pushToCloud();
    }
  } catch (e) {
    setSyncStatus(`讀取失敗：${e.message || e}`);
  }
}

async function initSync() {
  const code = getSyncCode();
  const input = document.getElementById('sync-code-input');
  if (code && input) input.value = code;
  if (code) await pullFromCloud(code);
}

function getMergedData() {
  const custom5 = loadJSON(LS_KEYS.custom5, []);
  const custom6 = loadJSON(LS_KEYS.custom6, []);
  const custom7 = loadJSON(LS_KEYS.custom7, []);
  return {
    5: [...(window.TOEIC_PART5 || []), ...custom5],
    6: [...(window.TOEIC_PART6 || []), ...custom6],
    7: [...(window.TOEIC_PART7 || []), ...custom7],
  };
}

function buildUnits() {
  const data = getMergedData();
  const units = [];
  data[5].forEach(q => units.push({ part: 5, id: q.id, difficulty: q.difficulty, category: q.category, raw: q }));
  data[6].forEach(q => units.push({ part: 6, id: q.id, difficulty: q.difficulty, category: q.category, raw: q }));
  data[7].forEach(q => units.push({ part: 7, id: q.id, difficulty: q.difficulty, category: q.category, raw: q }));
  return units;
}

function findUnit(part, id) {
  return buildUnits().find(u => u.part === part && u.id === id);
}

function correctAnswersOf(unit) {
  if (unit.part === 5) return [unit.raw.answer];
  if (unit.part === 6) return unit.raw.blanks.map(b => b.answer);
  return unit.raw.questions.map(q => q.answer);
}

function subUid(unit, subIndex) {
  if (unit.part === 5) return `5:${unit.id}`;
  return `${unit.part}:${unit.id}:${subIndex}`;
}

function subStemPreview(unit, subIndex) {
  if (unit.part === 5) return unit.raw.sentence;
  if (unit.part === 6) return `${unit.raw.title}（第 ${subIndex + 1} 格）`;
  return unit.raw.questions[subIndex].stem;
}

/* ===================== 隨機/工具 ===================== */

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fmtTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* ===================== 練習/模考共用渲染 ===================== */

function optionLetter(i) { return String.fromCharCode(65 + i); }

function renderUnitInto(container, unit, savedAnswers, onSelect) {
  container.innerHTML = '';
  const meta = document.createElement('div');
  meta.innerHTML = `<span class="meta-tag">Part ${unit.part}</span><span class="meta-tag">${escapeHtml(unit.category)}</span><span class="meta-tag">難度 ${unit.difficulty}</span>`;
  container.appendChild(meta);

  if (unit.part === 5) {
    const block = document.createElement('div');
    block.className = 'question-block';
    block.innerHTML = `<div class="question-stem">${escapeHtml(unit.raw.sentence)}</div>`;
    const list = document.createElement('div');
    list.className = 'option-list';
    unit.raw.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.type = 'button';
      btn.textContent = `${optionLetter(i)}. ${opt}`;
      if (savedAnswers[0] === i) btn.classList.add('selected');
      btn.addEventListener('click', () => onSelect(0, i));
      list.appendChild(btn);
    });
    block.appendChild(list);
    const expBox = document.createElement('div');
    expBox.className = 'explanation-box';
    expBox.style.display = 'none';
    expBox.dataset.role = 'explanation-0';
    block.appendChild(expBox);
    container.appendChild(block);
  } else if (unit.part === 6) {
    const passageBox = document.createElement('div');
    passageBox.className = 'passage-box';
    passageBox.innerHTML = `<div class="passage-label">${escapeHtml(unit.raw.title)}</div>${escapeHtml(unit.raw.passage).replace(/\((\d)\)_____/g, '<strong>($1)_____</strong>')}`;
    container.appendChild(passageBox);
    unit.raw.blanks.forEach((blank, i) => {
      const block = document.createElement('div');
      block.className = 'question-block';
      block.innerHTML = `<div class="question-stem">第 ${i + 1} 格</div>`;
      const list = document.createElement('div');
      list.className = 'option-list';
      blank.options.forEach((opt, j) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.type = 'button';
        btn.textContent = `${optionLetter(j)}. ${opt}`;
        if (savedAnswers[i] === j) btn.classList.add('selected');
        btn.addEventListener('click', () => onSelect(i, j));
        list.appendChild(btn);
      });
      block.appendChild(list);
      const expBox = document.createElement('div');
      expBox.className = 'explanation-box';
      expBox.style.display = 'none';
      expBox.dataset.role = `explanation-${i}`;
      block.appendChild(expBox);
      container.appendChild(block);
    });
  } else {
    unit.raw.passages.forEach(p => {
      const passageBox = document.createElement('div');
      passageBox.className = 'passage-box';
      passageBox.innerHTML = `<div class="passage-label">${escapeHtml(p.label)}</div>${escapeHtml(p.text)}`;
      container.appendChild(passageBox);
    });
    unit.raw.questions.forEach((q, i) => {
      const block = document.createElement('div');
      block.className = 'question-block';
      block.innerHTML = `<div class="question-stem">${i + 1}. ${escapeHtml(q.stem)}</div>`;
      const list = document.createElement('div');
      list.className = 'option-list';
      q.options.forEach((opt, j) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.type = 'button';
        btn.textContent = `${optionLetter(j)}. ${opt}`;
        if (savedAnswers[i] === j) btn.classList.add('selected');
        btn.addEventListener('click', () => onSelect(i, j));
        list.appendChild(btn);
      });
      block.appendChild(list);
      const expBox = document.createElement('div');
      expBox.className = 'explanation-box';
      expBox.style.display = 'none';
      expBox.dataset.role = `explanation-${i}`;
      block.appendChild(expBox);
      container.appendChild(block);
    });
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function applyFeedbackInto(container, unit, answers) {
  const correct = correctAnswersOf(unit);
  const blocks = container.querySelectorAll('.question-block');
  blocks.forEach((block, i) => {
    const buttons = block.querySelectorAll('.option-btn');
    buttons.forEach((btn, j) => {
      btn.disabled = true;
      if (j === correct[i]) btn.classList.add('correct');
      else if (j === answers[i] && answers[i] !== correct[i]) btn.classList.add('incorrect');
    });
    const expBox = block.querySelector(`[data-role="explanation-${i}"]`);
    if (expBox) {
      let explanation;
      if (unit.part === 5) explanation = unit.raw.explanation;
      else if (unit.part === 6) explanation = unit.raw.blanks[i].explanation;
      else explanation = unit.raw.questions[i].explanation;
      expBox.textContent = explanation;
      expBox.style.display = 'block';
    }
  });
}

/* ===================== 紀錄與錯題本 ===================== */

function recordUnitResult(unit, answers) {
  const correct = correctAnswersOf(unit);
  const attempts = loadJSON(LS_KEYS.attempts, []);
  const wrongbook = loadJSON(LS_KEYS.wrongbook, {});
  const now = Date.now();

  correct.forEach((correctIdx, i) => {
    const isCorrect = answers[i] === correctIdx;
    const uid = subUid(unit, i);
    attempts.push({ uid, part: unit.part, category: unit.category, difficulty: unit.difficulty, correct: isCorrect, ts: now });

    if (isCorrect) {
      if (wrongbook[uid]) {
        wrongbook[uid].correctStreak = (wrongbook[uid].correctStreak || 0) + 1;
        if (wrongbook[uid].correctStreak >= 2) delete wrongbook[uid];
      }
    } else {
      wrongbook[uid] = {
        uid, part: unit.part, id: unit.id, subIndex: i,
        category: unit.category, difficulty: unit.difficulty,
        stem: subStemPreview(unit, i),
        timesWrong: (wrongbook[uid] ? wrongbook[uid].timesWrong : 0) + 1,
        correctStreak: 0,
        lastTs: now,
      };
    }
  });

  saveJSON(LS_KEYS.attempts, attempts);
  saveJSON(LS_KEYS.wrongbook, wrongbook);
}

/* ===================== Tab 切換 ===================== */

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'dashboard') renderDashboard();
    if (btn.dataset.tab === 'wrongbook') renderWrongbook();
    if (btn.dataset.tab === 'import') renderImportCounts();
    if (btn.dataset.tab === 'vocab') {
      populateVocabCategorySelects();
      renderFlashcards();
      renderVocabStatsHint();
      renderVocabWeakList();
    }
  });
});

document.querySelectorAll('.subtab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const group = btn.parentElement;
    group.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.subtab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`subtab-${btn.dataset.subtab}`).classList.add('active');
  });
});

/* ===================== 練習模式 ===================== */

function populateCategoryOptions() {
  const units = buildUnits();
  const categories = [...new Set(units.map(u => u.category))].sort();
  const select = document.getElementById('practice-category');
  select.querySelectorAll('option:not([value="all"])').forEach(o => o.remove());
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    select.appendChild(opt);
  });
}

function getPracticeFilters() {
  const parts = [...document.querySelectorAll('.part-check:checked')].map(c => Number(c.value));
  const category = document.getElementById('practice-category').value;
  const difficulty = document.getElementById('practice-difficulty').value;
  const count = Math.max(1, Number(document.getElementById('practice-count').value) || 10);
  const wrongOnly = document.getElementById('practice-wrong-only').checked;
  return { parts, category, difficulty, count, wrongOnly };
}

function filterUnits(filters) {
  let units = buildUnits().filter(u => filters.parts.includes(u.part));
  if (filters.category !== 'all') units = units.filter(u => u.category === filters.category);
  if (filters.difficulty !== 'all') units = units.filter(u => u.difficulty === Number(filters.difficulty));
  if (filters.wrongOnly) {
    const wrongbook = loadJSON(LS_KEYS.wrongbook, {});
    const wrongKeys = new Set(Object.values(wrongbook).map(w => `${w.part}:${w.id}`));
    units = units.filter(u => wrongKeys.has(`${u.part}:${u.id}`));
  }
  return units;
}

function updatePracticePoolHint() {
  const filters = getPracticeFilters();
  const units = filterUnits(filters);
  document.getElementById('practice-pool-hint').textContent = `符合條件的題組共 ${units.length} 組（每組可能包含多小題）。`;
}

['practice-category', 'practice-difficulty', 'practice-wrong-only'].forEach(id => {
  document.getElementById(id).addEventListener('change', updatePracticePoolHint);
});
document.querySelectorAll('.part-check').forEach(c => c.addEventListener('change', updatePracticePoolHint));

let practiceSession = null;

function startPractice() {
  const filters = getPracticeFilters();
  let units = filterUnits(filters);
  if (units.length === 0) {
    alert('目前條件下沒有符合的題目，請調整篩選條件。');
    return;
  }
  units = shuffle(units).slice(0, filters.count);
  practiceSession = { units, index: 0, correctCount: 0, totalSub: 0, checked: false, currentAnswers: [] };
  document.getElementById('practice-setup').hidden = true;
  document.getElementById('practice-summary').hidden = true;
  document.getElementById('practice-session').hidden = false;
  showPracticeUnit();
}

function currentSubCount(unit) {
  if (unit.part === 5) return 1;
  if (unit.part === 6) return unit.raw.blanks.length;
  return unit.raw.questions.length;
}

function showPracticeUnit() {
  const s = practiceSession;
  const unit = s.units[s.index];
  s.checked = false;
  s.currentAnswers = new Array(currentSubCount(unit)).fill(-1);
  document.getElementById('practice-progress').textContent = `第 ${s.index + 1} / ${s.units.length} 題組`;
  document.getElementById('btn-check-answer').hidden = false;
  document.getElementById('btn-next-unit').hidden = true;
  renderPracticeUnit(unit);
}

function renderPracticeUnit(unit) {
  const s = practiceSession;
  const container = document.getElementById('practice-unit');
  renderUnitInto(container, unit, s.currentAnswers, (subIndex, optIndex) => {
    if (s.checked) return;
    s.currentAnswers[subIndex] = optIndex;
    renderPracticeUnit(unit);
  });
}

document.getElementById('btn-check-answer').addEventListener('click', () => {
  const s = practiceSession;
  const unit = s.units[s.index];
  if (s.currentAnswers.includes(-1)) {
    if (!confirm('還有題目沒作答，確定要對答案嗎？')) return;
  }
  s.checked = true;
  const container = document.getElementById('practice-unit');
  applyFeedbackInto(container, unit, s.currentAnswers);
  recordUnitResult(unit, s.currentAnswers);
  const correct = correctAnswersOf(unit);
  s.currentAnswers.forEach((a, i) => { if (a === correct[i]) s.correctCount++; });
  s.totalSub += correct.length;
  document.getElementById('btn-check-answer').hidden = true;
  document.getElementById('btn-next-unit').hidden = false;
});

document.getElementById('btn-next-unit').addEventListener('click', () => {
  const s = practiceSession;
  if (s.index + 1 >= s.units.length) {
    finishPractice();
  } else {
    s.index++;
    showPracticeUnit();
  }
});

document.getElementById('btn-end-practice').addEventListener('click', () => {
  if (confirm('確定要結束本次練習嗎？未作答的題目不會被記錄。')) finishPractice();
});

function finishPractice() {
  const s = practiceSession;
  document.getElementById('practice-session').hidden = true;
  document.getElementById('practice-summary').hidden = false;
  const pct = s.totalSub ? Math.round((s.correctCount / s.totalSub) * 100) : 0;
  document.getElementById('practice-summary-body').innerHTML = `
    <p>共作答 <strong>${s.totalSub}</strong> 小題，答對 <strong>${s.correctCount}</strong> 題。</p>
    <p>正確率：<strong>${pct}%</strong></p>
  `;
}

document.getElementById('btn-practice-again').addEventListener('click', () => {
  document.getElementById('practice-summary').hidden = true;
  document.getElementById('practice-setup').hidden = false;
  updatePracticePoolHint();
});

/* ===================== 模擬考模式 ===================== */

let mockSession = null;
let mockTimerHandle = null;

document.getElementById('btn-suggest-time').addEventListener('click', () => {
  const p5 = Number(document.getElementById('mock-p5-count').value) || 0;
  const p6 = Number(document.getElementById('mock-p6-count').value) || 0;
  const p7 = Number(document.getElementById('mock-p7-count').value) || 0;
  const p7Units = buildUnits().filter(u => u.part === 7);
  const avgP7Q = p7Units.length ? p7Units.reduce((sum, u) => sum + u.raw.questions.length, 0) / p7Units.length : 3;
  const minutes = Math.max(5, Math.round(p5 * 0.7 + p6 * 8 + p7 * avgP7Q * 1.1));
  document.getElementById('mock-time').value = minutes;
});

document.getElementById('btn-start-mock').addEventListener('click', () => {
  const p5Count = Number(document.getElementById('mock-p5-count').value) || 0;
  const p6Count = Number(document.getElementById('mock-p6-count').value) || 0;
  const p7Count = Number(document.getElementById('mock-p7-count').value) || 0;
  const minutes = Number(document.getElementById('mock-time').value) || 30;

  const units = buildUnits();
  const p5Pool = shuffle(units.filter(u => u.part === 5)).slice(0, p5Count);
  const p6Pool = shuffle(units.filter(u => u.part === 6)).slice(0, p6Count);
  const p7Pool = shuffle(units.filter(u => u.part === 7)).slice(0, p7Count);
  const all = shuffle([...p5Pool, ...p6Pool, ...p7Pool]);

  if (all.length === 0) {
    alert('請至少選擇一種題型的題數。');
    return;
  }

  mockSession = {
    units: all,
    answers: all.map(u => new Array(currentSubCount(u)).fill(-1)),
    index: 0,
    secondsLeft: minutes * 60,
    submitted: false,
  };

  document.getElementById('mock-setup').hidden = true;
  document.getElementById('mock-result').hidden = true;
  document.getElementById('mock-session').hidden = false;
  showMockUnit();
  startMockTimer();
});

function showMockUnit() {
  const s = mockSession;
  const unit = s.units[s.index];
  document.getElementById('mock-progress').textContent = `第 ${s.index + 1} / ${s.units.length} 題組`;
  const container = document.getElementById('mock-unit');
  const render = () => {
    renderUnitInto(container, unit, s.answers[s.index], (subIndex, optIndex) => {
      s.answers[s.index][subIndex] = optIndex;
      render();
    });
  };
  render();
  document.getElementById('btn-mock-prev').disabled = s.index === 0;
}

document.getElementById('btn-mock-prev').addEventListener('click', () => {
  if (mockSession.index > 0) { mockSession.index--; showMockUnit(); }
});
document.getElementById('btn-mock-next').addEventListener('click', () => {
  const s = mockSession;
  if (s.index + 1 < s.units.length) { s.index++; showMockUnit(); }
  else if (confirm('已經是最後一題組了，要交卷嗎？')) submitMock();
});
document.getElementById('btn-mock-submit').addEventListener('click', () => {
  if (confirm('確定要交卷嗎？交卷後會立即計分。')) submitMock();
});

function startMockTimer() {
  updateMockTimerDisplay();
  mockTimerHandle = setInterval(() => {
    mockSession.secondsLeft--;
    updateMockTimerDisplay();
    if (mockSession.secondsLeft <= 0) {
      clearInterval(mockTimerHandle);
      alert('時間到，自動交卷。');
      submitMock();
    }
  }, 1000);
}

function updateMockTimerDisplay() {
  document.getElementById('mock-timer').textContent = fmtTime(Math.max(0, mockSession.secondsLeft));
}

function estimateScaledScore(pct) {
  const anchors = [
    [0, 5], [10, 60], [20, 110], [30, 150], [40, 190],
    [50, 235], [60, 280], [70, 330], [80, 385], [90, 440], [100, 495],
  ];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [x0, y0] = anchors[i];
    const [x1, y1] = anchors[i + 1];
    if (pct >= x0 && pct <= x1) {
      return Math.round(y0 + ((pct - x0) / (x1 - x0)) * (y1 - y0));
    }
  }
  return pct <= 0 ? 5 : 495;
}

function submitMock() {
  if (mockSession.submitted) return;
  mockSession.submitted = true;
  if (mockTimerHandle) clearInterval(mockTimerHandle);

  const s = mockSession;
  const byPart = { 5: { c: 0, t: 0 }, 6: { c: 0, t: 0 }, 7: { c: 0, t: 0 } };
  let totalCorrect = 0, totalSub = 0;

  s.units.forEach((unit, idx) => {
    const answers = s.answers[idx];
    recordUnitResult(unit, answers);
    const correct = correctAnswersOf(unit);
    correct.forEach((c, i) => {
      byPart[unit.part].t++;
      totalSub++;
      if (answers[i] === c) { byPart[unit.part].c++; totalCorrect++; }
    });
  });

  const pct = totalSub ? (totalCorrect / totalSub) * 100 : 0;
  const estScore = estimateScaledScore(pct);

  const history = loadJSON(LS_KEYS.examHistory, []);
  history.push({ ts: Date.now(), totalItems: totalSub, correctItems: totalCorrect, estScore, byPart });
  saveJSON(LS_KEYS.examHistory, history);

  document.getElementById('mock-session').hidden = true;
  document.getElementById('mock-result').hidden = false;
  document.getElementById('mock-result-body').innerHTML = `
    <p>總作答 <strong>${totalSub}</strong> 小題，答對 <strong>${totalCorrect}</strong> 題，正確率 <strong>${Math.round(pct)}%</strong></p>
    <p>估算 RC 分數：<strong style="font-size:1.3rem;color:var(--primary-dark)">${estScore}</strong> / 495（粗略估算，非官方分數）</p>
    <div class="bar-list">
      ${[5, 6, 7].map(p => {
        const b = byPart[p];
        const pctPart = b.t ? Math.round((b.c / b.t) * 100) : 0;
        return `<div class="bar-item"><div class="bar-item-label"><span>Part ${p}</span><span>${b.c}/${b.t}（${pctPart}%）</span></div><div class="bar-track"><div class="bar-fill" style="width:${pctPart}%"></div></div></div>`;
      }).join('')}
    </div>
  `;
}

document.getElementById('btn-mock-review-wrong').addEventListener('click', () => {
  const s = mockSession;
  const container = document.getElementById('mock-result-body');
  const reviewDiv = document.createElement('div');
  reviewDiv.innerHTML = '<h3 style="margin-top:18px">錯題詳解</h3>';
  s.units.forEach((unit, idx) => {
    const answers = s.answers[idx];
    const correct = correctAnswersOf(unit);
    const hasWrong = correct.some((c, i) => answers[i] !== c);
    if (!hasWrong) return;
    const wrap = document.createElement('div');
    wrap.className = 'panel';
    renderUnitInto(wrap, unit, answers, () => {});
    applyFeedbackInto(wrap, unit, answers);
    reviewDiv.appendChild(wrap);
  });
  container.appendChild(reviewDiv);
  document.getElementById('btn-mock-review-wrong').hidden = true;
});

document.getElementById('btn-mock-again').addEventListener('click', () => {
  document.getElementById('mock-result').hidden = true;
  document.getElementById('mock-setup').hidden = false;
  document.getElementById('btn-mock-review-wrong').hidden = false;
});

/* ===================== 錯題本 ===================== */

function renderWrongbook() {
  const wrongbook = loadJSON(LS_KEYS.wrongbook, {});
  const entries = Object.values(wrongbook).sort((a, b) => b.lastTs - a.lastTs);
  const list = document.getElementById('wrongbook-list');
  list.innerHTML = '';
  if (entries.length === 0) {
    list.innerHTML = '<p class="empty-hint">目前沒有錯題，繼續保持！</p>';
    return;
  }
  entries.forEach(e => {
    const item = document.createElement('div');
    item.className = 'wrongbook-item';
    item.innerHTML = `
      <div class="wrongbook-item-head">
        <div class="wrongbook-item-stem">
          <span class="meta-tag">Part ${e.part}</span><span class="meta-tag">${e.category}</span>
          <div>${escapeHtml(e.stem)}</div>
          <div class="muted">錯過 ${e.timesWrong} 次</div>
        </div>
        <button class="remove-link" data-uid="${e.uid}">移除</button>
      </div>
    `;
    list.appendChild(item);
  });
  list.querySelectorAll('.remove-link').forEach(btn => {
    btn.addEventListener('click', () => {
      const wb = loadJSON(LS_KEYS.wrongbook, {});
      delete wb[btn.dataset.uid];
      saveJSON(LS_KEYS.wrongbook, wb);
      renderWrongbook();
      renderDashboard();
    });
  });
}

document.getElementById('btn-clear-wrongbook').addEventListener('click', () => {
  if (confirm('確定要清空整個錯題本嗎？')) {
    saveJSON(LS_KEYS.wrongbook, {});
    renderWrongbook();
    renderDashboard();
  }
});

document.getElementById('btn-retry-wrongbook').addEventListener('click', () => {
  document.querySelector('.tab-btn[data-tab="practice"]').click();
  document.getElementById('practice-wrong-only').checked = true;
  document.querySelectorAll('.part-check').forEach(c => c.checked = true);
  document.getElementById('practice-category').value = 'all';
  document.getElementById('practice-difficulty').value = 'all';
  updatePracticePoolHint();
  startPractice();
});

/* ===================== 匯入題庫 ===================== */

function validateImportItem(part, item) {
  if (!item || typeof item !== 'object') return false;
  if (!item.category || typeof item.difficulty !== 'number') return false;
  const isOptionSet = (opts, answer) => Array.isArray(opts) && opts.length === 4 && Number.isInteger(answer) && answer >= 0 && answer <= 3;

  if (part === '5') {
    return typeof item.sentence === 'string' && isOptionSet(item.options, item.answer) && typeof item.explanation === 'string';
  }
  if (part === '6') {
    return typeof item.title === 'string' && typeof item.passage === 'string' &&
      Array.isArray(item.blanks) && item.blanks.length > 0 &&
      item.blanks.every(b => isOptionSet(b.options, b.answer) && typeof b.explanation === 'string');
  }
  if (part === '7') {
    return Array.isArray(item.passages) && item.passages.length > 0 &&
      item.passages.every(p => typeof p.label === 'string' && typeof p.text === 'string') &&
      Array.isArray(item.questions) && item.questions.length > 0 &&
      item.questions.every(q => typeof q.stem === 'string' && isOptionSet(q.options, q.answer) && typeof q.explanation === 'string');
  }
  if (part === 'vocab') {
    return typeof item.word === 'string' && typeof item.pos === 'string' &&
      typeof item.meaning === 'string' && typeof item.example === 'string';
  }
  return false;
}

document.getElementById('btn-import-submit').addEventListener('click', () => {
  const part = document.getElementById('import-part').value;
  const status = document.getElementById('import-status');
  let parsed;
  try {
    parsed = JSON.parse(document.getElementById('import-textarea').value);
  } catch (e) {
    status.textContent = 'JSON 格式錯誤，請檢查貼上的內容。';
    status.style.color = 'var(--danger)';
    return;
  }
  if (!Array.isArray(parsed)) {
    status.textContent = '內容必須是一個 JSON 陣列。';
    status.style.color = 'var(--danger)';
    return;
  }

  const valid = parsed.filter(item => validateImportItem(part, item));
  const skipped = parsed.length - valid.length;
  if (valid.length === 0) {
    status.textContent = `沒有任何一筆符合 Part ${part} 的必要格式，未加入任何題目。`;
    status.style.color = 'var(--danger)';
    return;
  }

  const key = part === 'vocab' ? VOCAB_LS_KEYS.custom : LS_KEYS['custom' + part];
  const existing = loadJSON(key, []);
  const stamp = Date.now();
  const withIds = valid.map((item, i) => ({ ...item, id: `custom-p${part}-${stamp}-${i}` }));
  saveJSON(key, [...existing, ...withIds]);

  const label = part === 'vocab' ? '單字' : `Part ${part}`;
  status.textContent = `成功加入 ${withIds.length} 筆${label}題目。` + (skipped ? `（${skipped} 筆格式不符已略過）` : '');
  status.style.color = 'var(--success)';
  document.getElementById('import-textarea').value = '';
  populateCategoryOptions();
  populateVocabCategorySelects();
  renderImportCounts();
});

document.getElementById('btn-export-custom').addEventListener('click', () => {
  const dump = {
    part5: loadJSON(LS_KEYS.custom5, []),
    part6: loadJSON(LS_KEYS.custom6, []),
    part7: loadJSON(LS_KEYS.custom7, []),
    vocab: loadJSON(VOCAB_LS_KEYS.custom, []),
  };
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'toeic-custom-questions.json';
  a.click();
  URL.revokeObjectURL(url);
});

function renderImportCounts() {
  const c5 = loadJSON(LS_KEYS.custom5, []).length;
  const c6 = loadJSON(LS_KEYS.custom6, []).length;
  const c7 = loadJSON(LS_KEYS.custom7, []).length;
  const cv = loadJSON(VOCAB_LS_KEYS.custom, []).length;
  document.getElementById('import-counts').innerHTML = `
    <li>Part 5：${c5} 題</li>
    <li>Part 6：${c6} 篇</li>
    <li>Part 7：${c7} 篇組</li>
    <li>單字：${cv} 個</li>
  `;
}

/* ===================== 單字：資料 ===================== */

const VOCAB_LS_KEYS = {
  custom: 'toeic_vocab_custom',
  attempts: 'toeic_vocab_attempts',
  wrongbook: 'toeic_vocab_wrongbook',
};

function getVocabList() {
  const custom = loadJSON(VOCAB_LS_KEYS.custom, []);
  return [...(window.TOEIC_VOCAB || []), ...(window.HS7000_VOCAB || []), ...(window.DAOKAO_VOCAB || []), ...custom];
}

function vocabCategories() {
  return [...new Set(getVocabList().map(w => w.category))].sort();
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function populateVocabCategorySelects() {
  const cats = vocabCategories();
  ['vocab-fc-category', 'vocab-quiz-category'].forEach(id => {
    const select = document.getElementById(id);
    const prevValue = select.value;
    select.querySelectorAll('option:not([value="all"])').forEach(o => o.remove());
    cats.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      select.appendChild(opt);
    });
    if (cats.includes(prevValue)) select.value = prevValue;
  });
}

/* ===================== 單字：字卡瀏覽 ===================== */

let flashcardOrder = [];

function currentFlashcardList() {
  const category = document.getElementById('vocab-fc-category').value;
  let list = getVocabList();
  if (category !== 'all') list = list.filter(w => w.category === category);
  return list;
}

function flashcardFace(w, flipped) {
  if (!flipped) {
    return `
      <div class="fc-pos">${escapeHtml(w.category)}</div>
      <div class="fc-word">${escapeHtml(w.word)} <span style="font-weight:400;color:var(--text-muted)">${escapeHtml(w.pos)}</span></div>
      <div class="fc-hint">點擊看意思</div>
    `;
  }
  return `
    <div class="fc-pos">${escapeHtml(w.category)}</div>
    <div class="fc-word">${escapeHtml(w.word)} <span style="font-weight:400;color:var(--text-muted)">${escapeHtml(w.pos)}</span></div>
    <div class="fc-meaning">${escapeHtml(w.meaning)}</div>
    <div class="fc-example">${escapeHtml(w.example)}</div>
  `;
}

function renderFlashcards() {
  const list = currentFlashcardList();
  if (flashcardOrder.length !== list.length) flashcardOrder = list.map((_, i) => i);
  const grid = document.getElementById('vocab-flashcard-grid');
  grid.innerHTML = '';
  flashcardOrder.forEach(i => {
    const w = list[i];
    if (!w) return;
    const card = document.createElement('div');
    card.className = 'flashcard';
    card.innerHTML = flashcardFace(w, false);
    card.addEventListener('click', () => {
      const flipped = card.classList.toggle('flipped');
      card.innerHTML = flashcardFace(w, flipped);
    });
    grid.appendChild(card);
  });
}

document.getElementById('vocab-fc-category').addEventListener('change', () => {
  flashcardOrder = [];
  renderFlashcards();
});
document.getElementById('btn-vocab-fc-shuffle').addEventListener('click', () => {
  const list = currentFlashcardList();
  flashcardOrder = shuffle(list.map((_, i) => i));
  renderFlashcards();
});

/* ===================== 單字：測驗練習 ===================== */

function pickDistractors(correctWord, pool, count) {
  const sameCategory = shuffle(pool.filter(w => w.id !== correctWord.id && w.category === correctWord.category));
  const others = shuffle(pool.filter(w => w.id !== correctWord.id && w.category !== correctWord.category));
  return [...sameCategory, ...others].slice(0, count);
}

function generateVocabQuestion(word) {
  const pool = getVocabList();
  const distractors = pickDistractors(word, pool, 3);
  const canBlank = word.example.toLowerCase().includes(word.word.toLowerCase());
  const type = canBlank && Math.random() < 0.5 ? 'blank' : 'meaning';
  const explanation = `${word.word}（${word.pos}）意思是「${word.meaning}」。${word.example ? `例句：${word.example}` : ''}`;

  if (type === 'meaning') {
    const options = shuffle([word, ...distractors]).map(w => w.meaning);
    return { type, stem: `"${word.word}"（${word.pos}）最符合下列何者的意思？`, options, answer: options.indexOf(word.meaning), explanation };
  }
  const re = new RegExp(escapeRegExp(word.word), 'i');
  const stem = word.example.replace(re, '_____');
  const options = shuffle([word, ...distractors]).map(w => w.word);
  return { type, stem, options, answer: options.indexOf(word.word), explanation };
}

function vocabWeakOnlyWords() {
  const wb = loadJSON(VOCAB_LS_KEYS.wrongbook, {});
  const ids = new Set(Object.keys(wb));
  return getVocabList().filter(w => ids.has(w.id));
}

let vocabQuizSession = null;

document.getElementById('btn-start-vocab-quiz').addEventListener('click', () => {
  const category = document.getElementById('vocab-quiz-category').value;
  const count = Math.max(1, Number(document.getElementById('vocab-quiz-count').value) || 10);
  const weakOnly = document.getElementById('vocab-quiz-weak-only').checked;

  let pool = weakOnly ? vocabWeakOnlyWords() : getVocabList();
  if (category !== 'all') pool = pool.filter(w => w.category === category);
  if (pool.length === 0) {
    alert('目前條件下沒有符合的單字，請調整篩選條件。');
    return;
  }
  const words = shuffle(pool).slice(0, count);
  vocabQuizSession = { words, index: 0, correctCount: 0, checked: false, question: null, selected: -1 };

  document.getElementById('vocab-quiz-setup').hidden = true;
  document.getElementById('vocab-quiz-summary').hidden = true;
  document.getElementById('vocab-quiz-session').hidden = false;
  showVocabQuestion();
});

function showVocabQuestion() {
  const s = vocabQuizSession;
  const word = s.words[s.index];
  s.checked = false;
  s.selected = -1;
  s.question = generateVocabQuestion(word);
  document.getElementById('vocab-quiz-progress').textContent = `第 ${s.index + 1} / ${s.words.length} 題`;
  document.getElementById('btn-check-vocab-answer').hidden = false;
  document.getElementById('btn-next-vocab').hidden = true;
  renderVocabQuestion();
}

function renderVocabQuestion() {
  const s = vocabQuizSession;
  const container = document.getElementById('vocab-quiz-unit');
  container.innerHTML = `
    <div><span class="meta-tag">${escapeHtml(s.words[s.index].category)}</span><span class="meta-tag">難度 ${s.words[s.index].difficulty}</span></div>
    <div class="question-block">
      <div class="question-stem">${escapeHtml(s.question.stem)}</div>
      <div class="option-list" id="vocab-option-list"></div>
      <div class="explanation-box" id="vocab-explanation" style="display:none"></div>
    </div>
  `;
  const list = document.getElementById('vocab-option-list');
  s.question.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.type = 'button';
    btn.textContent = `${optionLetter(i)}. ${opt}`;
    if (s.selected === i) btn.classList.add('selected');
    btn.addEventListener('click', () => {
      if (s.checked) return;
      s.selected = i;
      renderVocabQuestion();
    });
    list.appendChild(btn);
  });
}

document.getElementById('btn-check-vocab-answer').addEventListener('click', () => {
  const s = vocabQuizSession;
  if (s.selected === -1) {
    if (!confirm('還沒作答，確定要對答案嗎？')) return;
  }
  s.checked = true;
  const word = s.words[s.index];
  const isCorrect = s.selected === s.question.answer;
  if (isCorrect) s.correctCount++;

  const buttons = document.querySelectorAll('#vocab-option-list .option-btn');
  buttons.forEach((btn, i) => {
    btn.disabled = true;
    if (i === s.question.answer) btn.classList.add('correct');
    else if (i === s.selected) btn.classList.add('incorrect');
  });
  const expBox = document.getElementById('vocab-explanation');
  expBox.textContent = s.question.explanation;
  expBox.style.display = 'block';

  const attempts = loadJSON(VOCAB_LS_KEYS.attempts, []);
  attempts.push({ wordId: word.id, category: word.category, correct: isCorrect, ts: Date.now() });
  saveJSON(VOCAB_LS_KEYS.attempts, attempts);

  const wb = loadJSON(VOCAB_LS_KEYS.wrongbook, {});
  if (isCorrect) {
    if (wb[word.id]) {
      wb[word.id].correctStreak = (wb[word.id].correctStreak || 0) + 1;
      if (wb[word.id].correctStreak >= 2) delete wb[word.id];
    }
  } else {
    wb[word.id] = {
      wordId: word.id, word: word.word, meaning: word.meaning, category: word.category,
      timesWrong: (wb[word.id] ? wb[word.id].timesWrong : 0) + 1,
      correctStreak: 0, lastTs: Date.now(),
    };
  }
  saveJSON(VOCAB_LS_KEYS.wrongbook, wb);

  document.getElementById('btn-check-vocab-answer').hidden = true;
  document.getElementById('btn-next-vocab').hidden = false;
});

document.getElementById('btn-next-vocab').addEventListener('click', () => {
  const s = vocabQuizSession;
  if (s.index + 1 >= s.words.length) finishVocabQuiz();
  else { s.index++; showVocabQuestion(); }
});

document.getElementById('btn-end-vocab-quiz').addEventListener('click', () => {
  if (confirm('確定要結束本次測驗嗎？')) finishVocabQuiz();
});

function finishVocabQuiz() {
  const s = vocabQuizSession;
  document.getElementById('vocab-quiz-session').hidden = true;
  document.getElementById('vocab-quiz-summary').hidden = false;
  const answered = s.index + (s.checked ? 1 : 0);
  const pct = answered ? Math.round((s.correctCount / answered) * 100) : 0;
  document.getElementById('vocab-quiz-summary-body').innerHTML = `
    <p>共作答 <strong>${answered}</strong> 題，答對 <strong>${s.correctCount}</strong> 題。</p>
    <p>正確率：<strong>${pct}%</strong></p>
  `;
  renderVocabWeakList();
}

document.getElementById('btn-vocab-quiz-again').addEventListener('click', () => {
  document.getElementById('vocab-quiz-summary').hidden = true;
  document.getElementById('vocab-quiz-setup').hidden = false;
  renderVocabStatsHint();
});

function renderVocabStatsHint() {
  const attempts = loadJSON(VOCAB_LS_KEYS.attempts, []);
  const wb = loadJSON(VOCAB_LS_KEYS.wrongbook, {});
  const pct = attempts.length ? Math.round((attempts.filter(a => a.correct).length / attempts.length) * 100) : null;
  document.getElementById('vocab-stats-hint').textContent = attempts.length
    ? `累積測驗 ${attempts.length} 題，正確率 ${pct}%，待加強單字 ${Object.keys(wb).length} 個。`
    : '還沒有測驗紀錄。';
}

function renderVocabWeakList() {
  const wb = loadJSON(VOCAB_LS_KEYS.wrongbook, {});
  const entries = Object.values(wb).sort((a, b) => b.lastTs - a.lastTs);
  const container = document.getElementById('vocab-weak-list');
  if (entries.length === 0) {
    container.innerHTML = '<p class="empty-hint">目前沒有待加強單字。</p>';
    return;
  }
  container.innerHTML = entries.map(e => `
    <span class="weak-word-chip">${escapeHtml(e.word)}（${escapeHtml(e.meaning)}）錯 ${e.timesWrong} 次
      <button data-word-id="${e.wordId}">移除</button>
    </span>
  `).join('');
  container.querySelectorAll('button[data-word-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const wb2 = loadJSON(VOCAB_LS_KEYS.wrongbook, {});
      delete wb2[btn.dataset.wordId];
      saveJSON(VOCAB_LS_KEYS.wrongbook, wb2);
      renderVocabWeakList();
    });
  });
}

/* ===================== 儀表板 ===================== */

function renderDashboard() {
  const attempts = loadJSON(LS_KEYS.attempts, []);
  const wrongbook = loadJSON(LS_KEYS.wrongbook, {});
  const history = loadJSON(LS_KEYS.examHistory, []);

  document.getElementById('stat-total').textContent = attempts.length;
  const correctCount = attempts.filter(a => a.correct).length;
  document.getElementById('stat-accuracy').textContent = attempts.length ? `${Math.round((correctCount / attempts.length) * 100)}%` : '--';
  document.getElementById('stat-wrongcount').textContent = Object.keys(wrongbook).length;

  const dateSet = new Set(attempts.map(a => todayStr(new Date(a.ts))));
  let streak = 0;
  let cursor = new Date();
  if (!dateSet.has(todayStr(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (dateSet.has(todayStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  document.getElementById('stat-streak').textContent = streak;

  const partBreakdown = document.getElementById('part-breakdown');
  partBreakdown.innerHTML = '';
  [5, 6, 7].forEach(p => {
    const subset = attempts.filter(a => a.part === p);
    const pct = subset.length ? Math.round((subset.filter(a => a.correct).length / subset.length) * 100) : 0;
    partBreakdown.innerHTML += `<div class="bar-item"><div class="bar-item-label"><span>Part ${p}</span><span>${subset.length ? pct + '%（' + subset.length + ' 題）' : '尚無資料'}</span></div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div></div>`;
  });

  const byCategory = {};
  attempts.forEach(a => {
    if (!byCategory[a.category]) byCategory[a.category] = { c: 0, t: 0 };
    byCategory[a.category].t++;
    if (a.correct) byCategory[a.category].c++;
  });
  const weak = Object.entries(byCategory)
    .filter(([, v]) => v.t >= 3)
    .map(([k, v]) => ({ category: k, pct: Math.round((v.c / v.t) * 100), t: v.t }))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 6);
  const weakDiv = document.getElementById('weak-categories');
  weakDiv.innerHTML = weak.length ? weak.map(w => `<div class="bar-item"><div class="bar-item-label"><span>${w.category}</span><span>${w.pct}%（${w.t} 題）</span></div><div class="bar-track"><div class="bar-fill weak" style="width:${w.pct}%"></div></div></div>`).join('') : '<p class="empty-hint">累積更多練習後會顯示最弱分類。</p>';

  const examDiv = document.getElementById('exam-history');
  if (history.length === 0) {
    examDiv.innerHTML = '<p class="empty-hint">還沒有模擬考紀錄，去「模擬考」分頁跑一次看看吧。</p>';
  } else {
    examDiv.innerHTML = history.slice().reverse().slice(0, 10).map(h => {
      const d = new Date(h.ts);
      return `<div class="exam-history-item"><span>${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</span><span>估算 ${h.estScore} 分（${h.correctItems}/${h.totalItems}）</span></div>`;
    }).join('');
  }
}

document.getElementById('btn-reset-all').addEventListener('click', () => {
  if (confirm('確定要清除所有練習紀錄、錯題本、單字測驗紀錄與模考歷史嗎？此動作無法復原。（已匯入的自訂題目與單字不會被刪除）')) {
    saveJSON(LS_KEYS.attempts, []);
    saveJSON(LS_KEYS.wrongbook, {});
    saveJSON(LS_KEYS.examHistory, []);
    saveJSON(VOCAB_LS_KEYS.attempts, []);
    saveJSON(VOCAB_LS_KEYS.wrongbook, {});
    renderDashboard();
    renderWrongbook();
    renderVocabStatsHint();
    renderVocabWeakList();
  }
});

document.getElementById('btn-sync-generate-code').addEventListener('click', async () => {
  const code = generateSyncCode();
  document.getElementById('sync-code-input').value = code;
  setSyncCode(code);
  await pushToCloud();
});

document.getElementById('btn-sync-set-code').addEventListener('click', async () => {
  const code = document.getElementById('sync-code-input').value.trim();
  if (!code) { setSyncStatus('請先輸入代碼。'); return; }
  setSyncCode(code);
  await pullFromCloud(code);
  renderDashboard();
  renderWrongbook();
  renderImportCounts();
  populateVocabCategorySelects();
  renderFlashcards();
  renderVocabStatsHint();
  renderVocabWeakList();
});

/* ===================== 初始化 ===================== */

(async function initApp() {
  await initSync();
  populateCategoryOptions();
  updatePracticePoolHint();
  renderDashboard();
  renderImportCounts();
  populateVocabCategorySelects();
  renderFlashcards();
  renderVocabStatsHint();
})();
