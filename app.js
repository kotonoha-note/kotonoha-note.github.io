'use strict';
const $ = id => document.getElementById(id);
const { parseNotes, normalize, shuffle, itemKey, buildChoices, cleanNote, readBackup, MAX_NOTES } = StudyCore;
const KEY = 'kotonoha-library-v2', LEGACY_KEY = 'kotonoha-notes-v1';
const SAMPLES = {
  english: { title: 'はじめての英単語', source: 'apple : りんご\nlibrary : 図書館\njourney : 旅\nquiet : 静かな\ndiscover : 発見する\nremember : 覚えている' },
  it: { title: 'ITパスポート 基礎用語', source: 'CPU : コンピュータで演算や制御を行う装置\nRAM : 作業中のデータを一時的に保存するメモリ\nOS : ハードウェアを管理し、アプリを動かす基本ソフトウェア\nLAN : 限られた範囲の機器をつなぐネットワーク\nクラウド : インターネット経由でサーバーなどの資源を利用する仕組み\nバックアップ : データの消失に備えて複製を保存すること' },
  idiom: { title: '覚えておきたい四字熟語', source: '一期一会 : 一生に一度の出会いと思い、その機会を大切にすること\n試行錯誤 : 試みと失敗を重ねながら、よい方法を探すこと\n一石二鳥 : 一つの行動で二つの利益を得ること\n温故知新 : 昔のことを学び、そこから新しい知識や考えを得ること\n切磋琢磨 : 仲間同士で励まし合い、学問や技芸を磨くこと\n臨機応変 : 状況に応じて適切な方法で対応すること' }
};
let library = { version: 2, currentId: '', notes: [] }, lastStored = null, saveBlocked = false, unsaved = false;
let items = [], mode = 'cards', index = 0, flipped = false, reverse = false, onlyUnlearned = false, order = [];
let remembered = new Set(), quizType = 'choice', quizOrder = [], quizAnswers = {}, quizChoices = {}, graded = false;
let includeAnswers = true, printReverse = false, timer, confirmResolve;
const newId = () => 'n-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
const active = () => library.notes.find(n => n.id === library.currentId);
const titleOf = note => note.title.trim() || '無題のノート';
function el(tag, cls, text) { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; }
function btn(text, cls, action) { const node = el('button', cls, text); node.type = 'button'; node.addEventListener('click', action); return node; }
function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(timer); timer = setTimeout(() => $('toast').classList.remove('visible'), 4000); }
function warn(message) { $('storageWarning').textContent = message; $('storageWarning').hidden = false; $('saveStatus').textContent = '未保存 · ファイル保存を'; }
function persist() {
  $('noteCount').textContent = library.notes.length;
  if (saveBlocked) { unsaved = true; return false; }
  try {
    if (localStorage.getItem(KEY) !== lastStored) {
      saveBlocked = true; unsaved = true;
      warn('別のタブでノートが変更されたため、このタブの保存を停止しました。必要な内容を「保存したノート」からバックアップしてから、ページを再読み込みしてください。');
      return false;
    }
    const data = JSON.stringify(library);
    localStorage.setItem(KEY, data); lastStored = data; unsaved = false;
    $('saveStatus').textContent = 'このブラウザに保存済み'; $('storageWarning').hidden = true; return true;
  } catch {
    unsaved = true;
    warn('ブラウザに保存できません。保存容量やブラウザの設定を確認し、「保存したノート」からバックアップしてください。ページを閉じると変更が失われる場合があります。');
    return false;
  }
}
function makeNote(data = {}) { return { ...cleanNote({ title: '', source: '', generatedSource: '', ...data }), id: newId() }; }
function resetQuiz(indices = items.map((_, i) => i)) {
  quizOrder = [...indices]; quizAnswers = {}; graded = false; quizChoices = {};
  quizOrder.forEach(i => { quizChoices[i] = buildChoices(items, i); });
}
function loadActive() {
  const note = active(); $('noteTitle').value = note.title; $('source').value = note.source; $('separator').value = note.delimiter;
  items = parseNotes(note.generatedSource, note.generatedDelimiter).items;
  remembered = new Set(note.mastered); order = items.map((_, i) => i); index = 0; flipped = false; onlyUnlearned = false;
  $('inputError').hidden = true; resetQuiz(); updateEditor(); render();
}
function updateEditor() {
  const note = active(), count = note.source.split(/\r?\n/).filter(s => s.trim()).length;
  $('lineCount').textContent = `${count} / 200語`;
  const pending = note.source !== note.generatedSource || note.delimiter !== note.generatedDelimiter;
  $('pendingNotice').hidden = !pending || !items.length;
  $('generateBtn').textContent = (pending && items.length ? '教材を更新する' : 'このノートで学ぶ') + '　→';
  $('sampleNotice').hidden = !note.sample; $('wordBadge').textContent = `${items.length} 語`;
  document.querySelectorAll('[data-sample]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sample === note.sample)));
}
function editNote() {
  const note = active(); note.title = $('noteTitle').value; note.source = $('source').value; note.delimiter = $('separator').value; note.sample = ''; note.updated = Date.now();
  $('inputError').hidden = true; $('source').removeAttribute('aria-invalid'); updateEditor(); persist();
  if (mode === 'print') render();
}
function generate() {
  const note = active(), parsed = parseNotes(note.source, note.delimiter), errors = [...parsed.errors];
  if (!parsed.items.length && !errors.length) errors.push('用語と意味を1組以上入力してください。');
  if (errors.length) {
    $('inputError').textContent = errors.slice(0, 5).join('\n') + (errors.length > 5 ? `\nほか ${errors.length - 5} 件` : '');
    $('inputError').hidden = false; $('source').setAttribute('aria-invalid', 'true'); $('source').focus(); return;
  }
  const keys = new Set(parsed.items.map(itemKey)); note.mastered = note.mastered.filter(key => keys.has(key));
  note.generatedSource = note.source; note.generatedDelimiter = note.delimiter; note.updated = Date.now();
  loadActive(); persist(); toast(`${items.length}語の教材ができました`);
  if (matchMedia('(max-width: 980px)').matches) document.querySelector('.study-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function addNote(data) {
  if (library.notes.length >= MAX_NOTES) { toast('保存できるノートは30冊までです。不要なノートをファイルに保存してから整理してください。'); return false; }
  const note = makeNote(data); library.notes.push(note); library.currentId = note.id; loadActive(); persist(); return true;
}
function newNote() {
  if (!addNote({})) return;
  $('libraryDialog').close(); mode = 'cards'; render(); $('noteTitle').focus(); document.querySelector('.editor-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function loadSample(name) {
  const found = library.notes.find(n => n.sample === name);
  if (found) { library.currentId = found.id; loadActive(); persist(); }
  else if (!addNote({ ...SAMPLES[name], generatedSource: SAMPLES[name].source, sample: name })) return;
  mode = 'cards'; render(); toast('サンプルを開きました。ほかのノートはそのまま残ります。');
}
function render() {
  document.querySelectorAll('[data-mode]').forEach(b => { b.setAttribute('aria-selected', String(b.dataset.mode === mode)); b.tabIndex = b.dataset.mode === mode ? 0 : -1; });
  const area = $('learningArea'); area.setAttribute('aria-labelledby', 'tab-' + mode); area.replaceChildren();
  if (!items.length) {
    const box = el('div', 'empty'); box.append(el('span', 'empty-symbol', '▤'), el('h3', '', '最初の一枚を、ここから。'), el('p', '', '用語と意味を入力して\n「このノートで学ぶ」を押しましょう。'), btn('英単語のサンプルで試す →', 'secondary', () => loadSample('english'))); area.append(box); return;
  }
  if (mode === 'cards') renderCards(area);
  else if (mode === 'quiz') renderQuiz(area);
  else renderPrint(area);
}
function selectControl(label, options, value, action) {
  const wrap = el('label', 'select-label', label), select = el('select');
  select.setAttribute('aria-label', label);
  options.forEach(([v, text]) => { const option = el('option', '', text); option.value = v; select.append(option); });
  select.value = value; select.onchange = () => action(select.value); wrap.append(select); return wrap;
}
function cardOrder() { return onlyUnlearned ? order.filter(i => !remembered.has(itemKey(items[i]))) : order; }
function renderCards(area) {
  const top = el('div', 'study-top');
  top.append(selectControl('出題方向', [['term', '用語 → 意味'], ['meaning', '意味 → 用語']], reverse ? 'meaning' : 'term', value => { reverse = value === 'meaning'; flipped = false; render(); }));
  const filter = el('label', 'check-label'), check = el('input'); check.type = 'checkbox'; check.checked = onlyUnlearned;
  check.onchange = () => { onlyUnlearned = check.checked; index = 0; flipped = false; render(); }; filter.append(check, document.createTextNode('未習得だけ')); top.append(filter); area.append(top);
  const visible = cardOrder(); index = Math.max(0, Math.min(index, visible.length - 1));
  if (!visible.length) {
    const done = el('div', 'empty card-complete'); done.append(el('span', 'empty-symbol', '✓'), el('h3', '', 'すべて「覚えた」になりました。'), el('p', '', '小テストで、思い出せるか確かめよう。'), btn('小テストへ →', 'primary', () => { mode = 'quiz'; resetQuiz(); render(); }), btn('すべてのカードを見る', 'quiet', () => { onlyUnlearned = false; render(); })); area.append(done); return;
  }
  const current = visible[index], item = items[current], front = reverse ? item.meaning : item.term, back = reverse ? item.term : item.meaning, value = flipped ? back : front;
  const card = btn('', 'card' + (value.length > 30 || flipped ? ' answer' : ''), () => { flipped = !flipped; render(); $('flipCard').focus({ preventScroll: true }); });
  card.id = 'flipCard'; card.setAttribute('aria-label', `${flipped ? '答え' : '問題'}：${value}。タップして${flipped ? '問題' : '答え'}を見る`);
  card.append(el('span', 'card-label', flipped ? 'ANSWER' : reverse ? 'MEANING' : 'KEYWORD'), el('span', 'card-value', value), el('span', 'card-tip', flipped ? 'タップして表に戻る ↺' : '考えてから、タップして答えを見る ↺')); area.append(card);
  const controls = el('div', 'card-controls');
  const move = amount => { index += amount; flipped = false; render(); $('flipCard').focus({ preventScroll: true }); };
  const prev = btn('←', 'nav-btn', () => move(-1)); prev.disabled = index === 0; prev.setAttribute('aria-label', '前のカード');
  const next = btn('→', 'nav-btn', () => move(1)); next.disabled = index === visible.length - 1; next.setAttribute('aria-label', '次のカード');
  controls.append(prev, el('span', '', `${String(index + 1).padStart(2, '0')} / ${String(visible.length).padStart(2, '0')}`), next); area.append(controls);
  card.onkeydown = event => { if (event.key === 'ArrowRight' && index < visible.length - 1) { event.preventDefault(); move(1); } else if (event.key === 'ArrowLeft' && index > 0) { event.preventDefault(); move(-1); } };
  const footer = el('div', 'card-footer'), key = itemKey(item), isKnown = remembered.has(key);
  const mark = btn(isKnown ? '✓ 覚えた' : '○ 覚えたことにする', 'secondary' + (isKnown ? ' remembered' : ''), () => {
    if (isKnown) remembered.delete(key); else remembered.add(key);
    active().mastered = [...remembered]; active().updated = Date.now(); persist(); flipped = false; render();
    toast(isKnown ? '未習得に戻しました' : '「覚えた」を記録しました');
  }); mark.setAttribute('aria-pressed', String(isKnown));
  footer.append(el('span', '', `覚えた用語 ${remembered.size} / ${items.length}`), mark); area.append(footer);
  const progress = el('progress'); progress.value = remembered.size; progress.max = items.length; progress.setAttribute('aria-label', '覚えた用語の割合'); area.append(progress);
  area.append(btn('⇄ 順番をシャッフル', 'quiet', () => { order = shuffle(order); index = 0; flipped = false; render(); toast('カードの順番を変えました'); }));
}
const isCorrect = i => normalize(quizAnswers[i] || '') === normalize(items[i].term);
function renderQuiz(area) {
  const top = el('div', 'study-top');
  top.append(selectControl('回答方法', [['choice', '選択式'], ['write', '記述式']], quizType, async value => {
    if (Object.keys(quizAnswers).length && !await ask('回答方法を変えると、今回の回答はリセットされます。変更しますか？', '変更する')) { render(); return; }
    quizType = value; resetQuiz(); render();
  }), el('span', 'subtle', `全 ${quizOrder.length} 問`)); area.append(top);
  const choiceAvailable = new Set(items.map(x => normalize(x.term))).size > 1;
  const effectiveChoice = quizType === 'choice' && choiceAvailable;
  area.append(el('p', 'quiz-description', effectiveChoice ? '意味に合う用語を選びましょう。選択肢はこのノートの用語から作っています。' : '意味を読んで用語を入力。英字の大小・全角半角・空白は区別しません。'));
  if (quizType === 'choice' && !choiceAvailable) area.append(el('p', 'input-hint', '異なる用語が2つ以上あると選択式を使えます。今回は記述式で出題します。'));
  if (graded) {
    const n = quizOrder.filter(isCorrect).length, score = el('div', 'score'); score.id = 'quizScore'; score.tabIndex = -1;
    score.append(el('strong', '', `${n} / ${quizOrder.length}`), el('p', '', n === quizOrder.length ? '全問正解！この調子で、少しずつ。' : 'あと一歩。間違えた言葉を、もう一度。')); area.append(score);
  }
  const form = el('form', 'quiz-form');
  quizOrder.forEach((i, k) => {
    const row = el('fieldset', 'quiz-row'), legend = el('legend'); legend.append(el('span', 'question-number', String(k + 1).padStart(2, '0')), document.createTextNode(items[i].meaning)); row.append(legend);
    if (effectiveChoice) {
      const choices = el('div', 'choice-grid');
      quizChoices[i].forEach((term, choiceIndex) => {
        const label = el('label', 'choice-option'), input = el('input'); input.type = 'radio'; input.name = 'q' + i; input.value = term; input.checked = quizAnswers[i] === term; input.disabled = graded;
        input.onchange = () => { quizAnswers[i] = term; }; label.append(input, el('span', '', term));
        if (graded && normalize(term) === normalize(items[i].term)) label.classList.add('right-choice');
        else if (graded && input.checked) label.classList.add('wrong-choice');
        choices.append(label);
      }); row.append(choices);
    } else {
      const input = el('input', 'written-answer'); input.id = 'q' + i; input.name = 'q' + i; input.placeholder = '用語を入力'; input.setAttribute('aria-label', `第${k + 1}問の回答`); input.maxLength = 200; input.autocomplete = 'off'; input.spellcheck = false; input.readOnly = graded; input.value = quizAnswers[i] || ''; input.oninput = () => { quizAnswers[i] = input.value; }; row.append(input);
    }
    if (graded) row.append(el('p', 'grade ' + (isCorrect(i) ? 'correct' : 'incorrect'), isCorrect(i) ? '✓ 正解' : `↻ ${quizAnswers[i] ? '不正解' : '未回答'}　正解：${items[i].term}`));
    form.append(row);
  });
  const actions = el('div', 'quiz-action');
  if (!graded) { const submit = el('button', 'primary', '答え合わせをする →'); submit.type = 'submit'; actions.append(submit); }
  else {
    const wrong = quizOrder.filter(i => !isCorrect(i));
    if (wrong.length) actions.append(btn(`間違えた ${wrong.length} 問に再挑戦`, 'primary', () => { resetQuiz(wrong); render(); focusLearning(); }));
    actions.append(btn('全問をもう一度', 'secondary', () => { resetQuiz(); render(); focusLearning(); }));
  }
  form.append(actions); form.onsubmit = event => { event.preventDefault(); graded = true; render(); $('quizScore').focus({ preventScroll: true }); $('quizScore').scrollIntoView({ behavior: 'smooth', block: 'center' }); }; area.append(form);
  if (!effectiveChoice) area.append(el('p', 'input-hint', '登録した用語との一致で採点します。同じ意味の別表現や誤字は判定できません。'));
}
function focusLearning() { $('learningArea').focus({ preventScroll: true }); $('learningArea').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function renderPrint(area) {
  const controls = el('div', 'print-controls');
  controls.append(selectControl('出題方向', [['term', '意味を見て、用語を書く'], ['meaning', '用語を見て、意味を書く']], printReverse ? 'meaning' : 'term', value => { printReverse = value === 'meaning'; render(); }));
  const label = el('label', 'check-label'), check = el('input'); check.type = 'checkbox'; check.checked = includeAnswers; check.onchange = () => { includeAnswers = check.checked; buildPrint(); }; label.append(check, document.createTextNode('解答ページを付ける')); controls.append(label, btn('印刷 / PDF保存 ↗', 'primary', () => { buildPrint(); window.print(); })); area.append(controls);
  const paper = el('div', 'paper-preview'); paper.append(el('div', 'eyebrow', 'STUDY WORKSHEET'), el('h3', '', titleOf(active())), el('small', '', `全 ${items.length} 問　　名前：________________`));
  items.slice(0, 3).forEach((item, i) => paper.append(el('div', 'paper-line', `${i + 1}. ${printReverse ? item.term : item.meaning}\n\n答え：________________________`)));
  if (items.length > 3) paper.append(el('p', 'input-hint', `印刷時は残りの ${items.length - 3} 問も含めます。`)); area.append(paper, el('p', 'print-notice', 'A4縦に対応。印刷画面でPDFに保存できます。解答は問題の後の別ページに出力します。端末によって操作は異なります。'));
  buildPrint();
}
function buildPrint() {
  const sheet = $('printSheet'); sheet.replaceChildren(); sheet.append(el('h1', '', titleOf(active())));
  const header = el('div', 'print-header'); header.append(el('span', '', `小テスト　全 ${items.length} 問`), el('span', '', '日付：　　　　　名前：　　　　　')); sheet.append(header);
  items.forEach((item, i) => { const q = el('div', 'print-question'); q.append(el('p', '', `${i + 1}. ${printReverse ? item.term : item.meaning}`), el('div', 'answer-space')); sheet.append(q); });
  if (includeAnswers) { const answers = el('section', 'answer-page'); answers.append(el('h1', '', '解答 — ' + titleOf(active()))); items.forEach((item, i) => answers.append(el('div', 'print-answer', `${i + 1}. ${printReverse ? item.meaning : item.term}`))); sheet.append(answers); }
  sheet.append(el('small', '', 'ことのはノート'));
}
function ask(message, accept = '続ける') {
  $('confirmText').textContent = message; $('acceptConfirm').textContent = accept; $('confirmDialog').returnValue = ''; $('confirmDialog').showModal(); $('cancelConfirm').focus();
  return new Promise(resolve => { confirmResolve = resolve; });
}
$('cancelConfirm').onclick = () => $('confirmDialog').close('cancel');
$('acceptConfirm').onclick = () => $('confirmDialog').close('accept');
$('confirmDialog').onclose = () => { if (confirmResolve) confirmResolve($('confirmDialog').returnValue === 'accept'); confirmResolve = null; };
function downloadNotes(notes) {
  const data = { format: 'kotonoha-library', version: 2, notes: notes.map(({ id, ...note }) => note) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = el('a'); a.href = url; a.download = `kotonoha-${notes.length === 1 ? 'note' : 'backup'}-${new Date().toISOString().slice(0, 10)}.json`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000); toast('保存画面を開きました。ファイルの保存先を確認してください。');
}
function renderLibrary() {
  const list = $('libraryList'); list.replaceChildren();
  library.notes.forEach(note => {
    const row = el('article', 'note-row' + (note.id === library.currentId ? ' current-note' : ''));
    const count = parseNotes(note.generatedSource, note.generatedDelimiter).items.length;
    const open = btn('', 'note-open', () => { library.currentId = note.id; loadActive(); persist(); $('libraryDialog').close(); toast(titleOf(note) + 'を開きました'); });
    open.append(el('strong', '', titleOf(note)), el('span', '', `${count}語 · 覚えた ${note.mastered.length}語${note.id === library.currentId ? ' · 開いています' : ''}`));
    const actions = el('div', 'note-actions');
    const save = btn('保存', 'quiet', () => downloadNotes([note])); save.setAttribute('aria-label', titleOf(note) + 'をファイルに保存');
    const remove = btn('削除', 'quiet danger', async () => {
      if (!await ask(`「${titleOf(note)}」をこのブラウザから削除します。元に戻せません。必要なら先にファイルに保存してください。`, '削除する')) return;
      library.notes = library.notes.filter(n => n.id !== note.id);
      if (!library.notes.length) library.notes.push(makeNote());
      if (note.id === library.currentId) { library.currentId = library.notes[0].id; loadActive(); }
      persist(); renderLibrary(); toast('ノートを削除しました');
    }); remove.setAttribute('aria-label', titleOf(note) + 'を削除'); actions.append(save, remove); row.append(open, actions); list.append(row);
  });
  $('libraryCapacity').textContent = `${library.notes.length} / ${MAX_NOTES}冊`;
}
function openLibrary() { renderLibrary(); $('libraryDialog').showModal(); }
$('backupBtn').onclick = () => downloadNotes(library.notes);
$('importBtn').onclick = () => $('importFile').click();
$('importFile').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 5000000) throw Error('ファイルは5MB以内にしてください。');
    const notes = readBackup(JSON.parse(await file.text()));
    if (notes.length + library.notes.length > MAX_NOTES) throw Error(`読み込むと30冊を超えます。現在${library.notes.length}冊、ファイル内${notes.length}冊です。`);
    const added = notes.map(makeNote); library.notes.push(...added); library.currentId = added[0].id; loadActive(); persist(); renderLibrary(); toast(`${added.length}冊を追加しました。既存のノートは残っています。`);
  } catch (err) { toast(err instanceof SyntaxError ? 'JSONファイルを読み取れませんでした。ことのはノートから保存したファイルを選んでください。' : err.message); }
  finally { event.target.value = ''; }
};
$('newBtn').onclick = newNote; $('libraryNewBtn').onclick = newNote; $('generateBtn').onclick = generate;
$('noteTitle').oninput = editNote; $('source').oninput = editNote; $('separator').onchange = editNote;
document.querySelectorAll('[data-library]').forEach(button => button.onclick = openLibrary);
document.querySelectorAll('[data-sample]').forEach(button => button.onclick = () => loadSample(button.dataset.sample));
document.querySelectorAll('[data-mode]').forEach(button => {
  button.onclick = () => { mode = button.dataset.mode; render(); };
  button.onkeydown = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const tabs = [...document.querySelectorAll('[data-mode]')];
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (tabs.indexOf(button) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].click(); tabs[next].focus();
  };
});
function init() {
  try {
    lastStored = localStorage.getItem(KEY);
    if (lastStored) {
      const saved = JSON.parse(lastStored);
      if (saved.version !== 2 || !Array.isArray(saved.notes) || !saved.notes.length || saved.notes.length > MAX_NOTES) throw Error('invalid');
      library.notes = saved.notes.map(n => ({ ...cleanNote(n), id: typeof n.id === 'string' ? n.id : newId() }));
      if (new Set(library.notes.map(n => n.id)).size !== library.notes.length) throw Error('duplicate ids');
      library.currentId = library.notes.some(n => n.id === saved.currentId) ? saved.currentId : library.notes[0].id;
    } else {
      const old = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
      const note = old ? makeNote({ ...old, generatedSource: old.source }) : makeNote({ ...SAMPLES.english, generatedSource: SAMPLES.english.source, sample: 'english' });
      library.notes = [note]; library.currentId = note.id;
    }
  } catch {
    saveBlocked = true;
    const note = makeNote(); library.notes = [note]; library.currentId = note.id;
    warn('保存データを読み込めないか、ブラウザの保存機能が無効になっています。元の保存データは上書きしません。この画面で作った内容は、ページを閉じる前にファイルへ保存してください。');
  }
  loadActive(); persist();
}
window.addEventListener('beforeprint', () => { if (items.length) buildPrint(); });
window.addEventListener('beforeunload', event => { if (unsaved) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('storage', event => {
  if (event.key === KEY || event.key === null) {
    saveBlocked = true;
    warn('別のタブで保存データが変更されました。このタブの保存は停止しています。必要なノートをバックアップしてから、再読み込みしてください。');
  }
});
init();
