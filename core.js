(function (root) {
  'use strict';
  const MAX_NOTES = 30;
  const SEPARATORS = ['auto', 'colon', 'tab', 'comma'];
  function normalize(value) { return value.normalize('NFKC').trim().replace(/\s+/g, '').toLowerCase(); }
  function parseNotes(source, separator = 'auto') {
    const items = [], errors = [], seen = new Set();
    source.split(/\r?\n/).forEach((line, i) => {
      if (!line.trim()) return;
      let pattern;
      if (separator === 'tab') pattern = /\t/;
      else if (separator === 'colon') pattern = /[:：]/;
      else if (separator === 'comma') pattern = /,/;
      else pattern = line.includes('\t') ? /\t/ : /[:：]/.test(line) ? /[:：]/ : /[,、]/;
      const match = line.match(pattern);
      if (!match) { errors.push(`${i + 1}行目：用語と意味を区切ってください。区切り文字の設定も確認してください。`); return; }
      const term = line.slice(0, match.index).trim(), meaning = line.slice(match.index + 1).trim();
      if (!term || !meaning) { errors.push(`${i + 1}行目：用語と意味の両方が必要です。`); return; }
      if (term.length > 200 || meaning.length > 2000) { errors.push(`${i + 1}行目：用語は200文字、意味は2,000文字以内にしてください。`); return; }
      const key = JSON.stringify([term, meaning]);
      if (seen.has(key)) { errors.push(`${i + 1}行目：同じ用語と意味が重複しています。`); return; }
      seen.add(key); items.push({ term, meaning });
    });
    if (items.length > 200) errors.push('1つのノートは200語までです。ノートを分けてください。');
    return { items, errors };
  }
  function shuffle(values, random = Math.random) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
    return result;
  }
  function itemKey(item) { return JSON.stringify([item.term, item.meaning]); }
  function buildChoices(items, index, random = Math.random) {
    const correct = items[index].term, seen = new Set([normalize(correct)]), alternatives = [];
    items.forEach(item => { const value = normalize(item.term); if (!seen.has(value)) { seen.add(value); alternatives.push(item.term); } });
    return shuffle([correct, ...shuffle(alternatives, random).slice(0, 3)], random);
  }
  function cleanNote(note) {
    if (!note || typeof note.title !== 'string' || note.title.length > 80 || typeof note.source !== 'string' || note.source.length > 450000) throw Error('ノートの形式・文字数を確認してください。');
    const delimiter = SEPARATORS.includes(note.delimiter) ? note.delimiter : 'auto';
    const generatedSource = typeof note.generatedSource === 'string' && note.generatedSource.length <= 450000 ? note.generatedSource : note.source;
    const generatedDelimiter = SEPARATORS.includes(note.generatedDelimiter) ? note.generatedDelimiter : delimiter;
    const parsed = parseNotes(generatedSource, generatedDelimiter);
    const keys = new Set(parsed.errors.length ? [] : parsed.items.map(itemKey));
    return {
      title: note.title, source: note.source, delimiter,
      generatedSource: parsed.errors.length ? '' : generatedSource, generatedDelimiter,
      mastered: Array.isArray(note.mastered) ? [...new Set(note.mastered.filter(x => keys.has(x)))] : [],
      sample: typeof note.sample === 'string' ? note.sample : '',
      updated: Number.isFinite(note.updated) ? note.updated : Date.now()
    };
  }
  function readBackup(data) {
    if (data?.format === 'kotonoha-note' && data.version === 1) return [cleanNote(data)];
    if (data?.format !== 'kotonoha-library' || data.version !== 2 || !Array.isArray(data.notes) || !data.notes.length || data.notes.length > MAX_NOTES) throw Error('ことのはノートから保存したJSONファイルを選んでください。');
    return data.notes.map(cleanNote);
  }
  const api = { parseNotes, normalize, shuffle, itemKey, buildChoices, cleanNote, readBackup, MAX_NOTES };
  if (typeof module !== 'undefined') module.exports = api; else root.StudyCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
