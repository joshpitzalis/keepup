#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, chmodSync, realpathSync, lstatSync, appendFileSync, openSync, closeSync, unlinkSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, resolve, relative, matchesGlob, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';

function git(...args) {
  const result = spawnSync('git', args, { encoding:'utf8' });
  if (result.status !== 0) throw new Error(result.stderr.trim() || 'Git command failed');
  return result.stdout;
}
let root;
let state;

function readConfig() {
  const config = JSON.parse(readFileSync(join(state, 'config.json'), 'utf8'));
  if (!config || !Array.isArray(config.include) || !Array.isArray(config.exclude)
      || ![...config.include, ...config.exclude].every(glob => typeof glob === 'string')
      || !(config.testCommand === null || typeof config.testCommand === 'string' && config.testCommand.trim())) {
    throw new Error(`Invalid ${join(state,'config.json')}: expected testCommand (string or null) and include/exclude glob arrays`);
  }
  return config;
}
function scopedFiles(config = readConfig()) {
  const result = spawnSync('git', ['ls-files', '-z'], { cwd:root, encoding:'utf8' });
  if (result.status !== 0) throw new Error(result.stderr.trim());
  return result.stdout.split('\0').filter(file => {
    if (!file || ['.keepup','.cogdebt','.git'].some(directory=>file === directory || file.startsWith(directory+'/'))) return false;
    if (!config.include.some(glob => matchesGlob(file, glob)) || config.exclude.some(glob => matchesGlob(file, glob))) return false;
    const path = join(root, file);
    if (!existsSync(path) || !lstatSync(path).isFile()) return false;
    const location = relative(root, realpathSync(path));
    return !location.startsWith('..') && !isAbsolute(location);
  });
}
function createIfMissing(path, content) {
  try { writeFileSync(path, content, { flag:'wx' }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
}
function inferTestCommand() {
  const manifest = join(root, 'package.json');
  if (!existsSync(manifest)) return null;
  const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
  if (!pkg.scripts?.test || /no test specified/i.test(pkg.scripts.test)) return null;
  const manager = typeof pkg.packageManager === 'string' ? pkg.packageManager.split('@')[0] : null;
  if (manager === 'pnpm' || existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm test';
  if (manager === 'yarn' || existsSync(join(root, 'yarn.lock'))) return 'yarn test';
  if (manager === 'bun' || existsSync(join(root, 'bun.lock')) || existsSync(join(root, 'bun.lockb'))) return 'bun run test';
  return 'npm test';
}
function initialize() {
  mkdirSync(join(state, 'scorers'), { recursive:true });
  mkdirSync(join(state, 'snapshots'), { recursive:true });
  createIfMissing(join(state, 'config.json'), JSON.stringify({ testCommand:inferTestCommand(), include:['**/*'], exclude:['**/node_modules/**', '**/dist/**', '**/build/**'] }, null, 2) + '\n');
  createIfMissing(join(state, 'MISSION.md'), '# Mission\n\n## Why\n\n## Success\n\n## Constraints\n\n## Exclusions\n');
  createIfMissing(join(state, 'events.jsonl'), '');
  createIfMissing(join(state, 'history.jsonl'), '');
  const bundledScorers = fileURLToPath(new URL('../scorers/', import.meta.url));
  if (existsSync(bundledScorers)) for (const name of readdirSync(bundledScorers)) {
    const destination = join(state, 'scorers', name);
    if (existsSync(destination)) continue;
    copyFileSync(join(bundledScorers, name), destination);
    chmodSync(destination, 0o755);
  }
  const ignorePath = join(root, '.gitignore');
  const ignore = existsSync(ignorePath) ? readFileSync(ignorePath, 'utf8') : '';
  const mapPath = relative(root,state) + '/map.html';
  if (!ignore.split(/\r?\n/).includes(mapPath)) {
    writeFileSync(ignorePath, ignore + (ignore && !ignore.endsWith('\n') ? '\n' : '') + mapPath + '\n');
  }
  return { root, state, config:readConfig(), files:scopedFiles() };
}

const EXPOSURE_MIND = 0.3;
const QUIZ_CAP = 0.6;
const PRACTICE_BONUS = 0.1;
function now() { return new Date(process.env.KEEPUP_NOW || process.env.COGDEBT_NOW || Date.now()).toISOString(); }
function learner() {
  const who = git('config', 'user.email').trim();
  if (!who) throw new Error('Set git user.email to identify the learner');
  return who;
}
function withLock(action) {
  const path = join(state, 'write.lock');
  const deadline = Date.now() + 5000;
  let lock;
  while (lock === undefined) {
    try { lock = openSync(path, 'wx'); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (Date.now() >= deadline) throw new Error('Learning state is busy; retry after the other writer finishes');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }
  try { return action(); }
  finally { closeSync(lock); unlinkSync(path); }
}
function readLog(name) {
  const content = readFileSync(join(state, name), 'utf8');
  if (content && !content.endsWith('\n')) throw new Error(`Incomplete ${name}; left untouched`);
  return content ? content.slice(0,-1).split('\n').map(line => JSON.parse(line)) : [];
}
function parseEvent(input) {
  const shapes = {
    shown:['depth'], response:['response'], quiz:['phase','answers','kataNumber'],
    explain:['text','kataNumber'], hint:['text','kataNumber'],
    kata_start:['technique','module','target'], kata_submit:['kataNumber','result','checks'],
  };
  const nonempty = value => typeof value === 'string' && value.trim().length > 0;
  if (!input || !shapes[input.type] || !nonempty(input.id) || !Array.isArray(input.files) || !input.files.length
      || !input.files.every(file => nonempty(file) && !file.includes('\n')) || new Set(input.files).size !== input.files.length) throw new Error('Invalid event id, type or files');
  const allowed = ['id','type','files',...shapes[input.type]];
  if (Object.keys(input).some(key => !allowed.includes(key))) throw new Error('Unknown or protected event field');
  if (input.kataNumber !== undefined && (!Number.isInteger(input.kataNumber) || input.kataNumber < 1)) throw new Error('Invalid kataNumber');
  if (['hint','kata_submit'].includes(input.type) && input.kataNumber === undefined) throw new Error('kataNumber is required');
  if (input.type === 'shown' && !['walkthrough','paragraph','line','none'].includes(input.depth)) throw new Error('Invalid shown depth');
  if (input.type === 'response' && !['got-it','skip','kata','next'].includes(input.response)) throw new Error('Invalid response');
  if (['hint','explain'].includes(input.type) && !nonempty(input.text)) throw new Error('Nonempty text is required');
  if (input.type === 'quiz') {
    if (!['pre','post','check'].includes(input.phase) || !Array.isArray(input.answers) || !input.answers.length) throw new Error('Invalid quiz phase or answers');
    for (const answer of input.answers) {
      if (!answer || !input.files.includes(answer.file) || !['concept','question','answer'].every(key => nonempty(answer[key]))
          || typeof answer.correct !== 'boolean' || Object.keys(answer).some(key => !['file','concept','question','answer','correct'].includes(key))) throw new Error('Invalid quiz answer');
    }
    if (input.phase === 'check' && (input.files.length !== 1 || input.answers.length !== 1)) throw new Error('A check requires exactly one answer about one file');
    if (input.files.some(file => !input.answers.some(answer => answer.file === file))) throw new Error('Every quiz file needs an answer');
  }
  if (input.type === 'kata_start') {
    const target = input.target;
    if (!nonempty(input.technique) || !nonempty(input.module) || !target || !input.files.includes(target.file)
        || !nonempty(target.metric) || !Number.isFinite(target.goal) || target.goal < 0 || target.goal > 1
        || Object.keys(target).some(key => !['file','metric','goal'].includes(key))) throw new Error('Invalid kata context');
  }
  if (input.type === 'kata_submit' && (!['pass','fail','abandon'].includes(input.result)
      || input.checks !== undefined && (!input.checks || typeof input.checks !== 'object' || Array.isArray(input.checks)))) throw new Error('Invalid kata result or checks');
  return input;
}
function readEvents() {
  const events = readLog('events.jsonl');
  for (const event of events) {
    if (!event || typeof event.who !== 'string' || !Number.isFinite(Date.parse(event.t))
        || !(event.sha === null || typeof event.sha === 'string') || typeof event.retryDigest !== 'string'
        || !event.snapshots || typeof event.snapshots !== 'object') throw new Error('Invalid stored event metadata; log left untouched');
    const input = Object.fromEntries(Object.entries(event).filter(([key]) => !['t','who','sha','snapshots','retryDigest','baseline'].includes(key)
      && !(event.type === 'kata_start' && key === 'kataNumber')));
    parseEvent(input);
    if (digest(JSON.stringify(canonical(input))) !== event.retryDigest
        || Object.entries(event.snapshots).some(([file,hash]) => !event.files.includes(file) || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))) throw new Error('Invalid stored event payload or snapshot');
    if (event.type === 'kata_start' && (!Number.isInteger(event.kataNumber) || event.kataNumber < 1 || !event.baseline)) throw new Error('Invalid stored kata context');
  }
  return events;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])]));
  return value;
}
function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function kataInventory(targets) {
  const sha = spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});
  if (sha.status !== 0) throw new Error('Commit the repository before starting a kata');
  const changed = spawnSync('git',['status','--porcelain','-z','--',...targets],{cwd:root,encoding:'utf8'});
  if (changed.status !== 0 || changed.stdout) throw new Error('Kata target files must be clean, including staged changes');
  const contentHashes = Object.create(null), snapshotBytes = new Map();
  for (const file of scopedFiles()) {
    const bytes = readFileSync(join(root,file));
    contentHashes[file] = digest(bytes);
    if (targets.includes(file)) snapshotBytes.set(file,bytes);
  }
  const definitions = ['config.json', ...readdirSync(join(state,'scorers')).sort().filter(name => {
    const stat = lstatSync(join(state,'scorers',name));
    return stat.isFile() && (stat.mode & 0o111);
  }).map(name=>`scorers/${name}`)];
  const definitionHashes = Object.create(null);
  for (const file of definitions) definitionHashes[file] = digest(readFileSync(join(state,file)));
  return {inventory:{sha:sha.stdout.trim(),contentHashes,definitionHashes},snapshotBytes};
}
function logEvent(input) {
  parseEvent(input);
  return withLock(() => {
    const events = readEvents();
    const who = learner();
    const retryDigest = digest(JSON.stringify(canonical(input)));
    const previous = events.find(event => event.who === who && event.id === input.id);
    if (previous) {
      if (previous.retryDigest !== retryDigest) throw new Error('Retry id already used with different input');
      return previous;
    }
    const scope = scopedFiles();
    if (input.files.some(file => !scope.includes(file))) throw new Error('Event files must be tracked regular files within configured scope');
    if (input.type === 'quiz' && input.phase === 'check'
        && !checkState(input.files[0],events.filter(event=>event.who===who),now()).due) throw new Error('No delayed check is due for this file');
    if (input.kataNumber !== undefined) {
      const start = events.find(event => event.type === 'kata_start' && event.who === who && event.kataNumber === input.kataNumber);
      if (!start || input.files.some(file => !start.files.includes(file))) throw new Error('Unknown kata or files outside kata');
      if (events.some(event => event.type === 'kata_submit' && event.who === who && event.kataNumber === input.kataNumber && ['pass','abandon'].includes(event.result))) throw new Error('Kata already closed');
    }
    const sha = spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'});
    const event = {...input,t:now(),who,sha:sha.status === 0 ? sha.stdout.trim() : null,snapshots:Object.create(null),retryDigest};
    let startingBytes;
    if (input.type === 'kata_start') {
      const before = kataInventory(input.files);
      startingBytes = before.snapshotBytes;
      event.sha = before.inventory.sha;
      event.kataNumber = 1 + Math.max(0,...events.filter(event => event.type === 'kata_start').map(event => event.kataNumber));
      const {files,summary,metrics,warnings} = computeStatus(events);
      let after;
      try { after = kataInventory(input.files); }
      catch { throw new Error('Repository changed during kata setup; restore clean targets and retry'); }
      if (JSON.stringify(canonical(before.inventory)) !== JSON.stringify(canonical(after.inventory))) throw new Error('Repository changed during kata setup; retry against a stable version');
      event.baseline = {files,summary,metrics,warnings,contentHashes:before.inventory.contentHashes,definitionHashes:before.inventory.definitionHashes};
      const baselineTarget = event.baseline.files.find(file=>file.file===input.target.file)?.metrics[input.target.metric]?.value;
      if (baselineTarget === undefined || input.target.goal <= baselineTarget) throw new Error('Kata goal must improve an available target metric');
    }
    if (['shown','quiz','kata_start'].includes(input.type) || input.type === 'kata_submit' && input.result === 'pass') {
      for (const file of input.files) {
        const bytes = startingBytes ? startingBytes.get(file) : readFileSync(join(root,file));
        const hash = digest(bytes);
        createIfMissing(join(state,'snapshots',hash),bytes);
        event.snapshots[file] = hash;
      }
    }
    appendFileSync(join(state,'events.jsonl'),JSON.stringify(event)+'\n');
    return event;
  });
}
function driftSince(file, hash, warnings) {
  if (!hash) return 1;
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid stored snapshot reference');
  const snapshot = join(state,'snapshots',hash);
  if (!existsSync(snapshot)) { warnings.push(`Missing snapshot for ${file}; drift is full`); return 1; }
  const before = readFileSync(snapshot), after = readFileSync(join(root,file));
  if (digest(before) !== hash) { warnings.push(`Damaged snapshot for ${file}; drift is full`); return 1; }
  if (before.equals(after)) return 0;
  const lines = lineCount(before.toString('utf8'));
  if (!lines) return 1;
  const directory = mkdtempSync(join(tmpdir(),'keepup-diff-'));
  try {
    const current = join(directory,'current');
    writeFileSync(current,after);
    const diff = spawnSync('git',['diff','--no-index','--no-ext-diff','--numstat','--no-renames','--',snapshot,current],{cwd:root,encoding:'utf8'});
    if (diff.error || ![0,1].includes(diff.status)) throw new Error(diff.error?.message || diff.stderr || 'Cannot measure drift');
    const [added,removed] = diff.stdout.split('\t');
    if (added === '-' || removed === '-') { warnings.push(`Binary changes in ${file}; drift is full`); return 1; }
    return Math.min(1,(Number(added)+Number(removed))/lines);
  } finally { rmSync(directory,{recursive:true,force:true}); }
}
const DAY_MS = 86400000;
function answerAccuracy(answers) {
  const recent = answers.slice(-10);
  return recent.length ? recent.reduce((sum,answer) => sum + (answer.correct ? answer.weight : 0),0) / recent.reduce((sum,answer) => sum+answer.weight,0) : null;
}
function checkState(file, events, at) {
  let lastQuiz = null, lastCheck = null, verified = false;
  const answers = [];
  const dueAt = time => {
    const quizDue = lastQuiz !== null && (!lastCheck || lastQuiz.index > lastCheck.index)
      && Date.parse(time)-Date.parse(lastQuiz.t) >= DAY_MS && time.slice(0,10) !== lastQuiz.t.slice(0,10);
    const weakDue = verified && lastCheck !== null && answerAccuracy(answers) < 0.7 && Date.parse(time)-Date.parse(lastCheck.t) >= 7*DAY_MS;
    return quizDue || weakDue;
  };
  events.forEach((event,index) => {
    if (event.type !== 'quiz') return;
    const current = event.answers.filter(answer=>answer.file===file);
    if (!current.length) return;
    if (event.phase === 'check') {
      if (dueAt(event.t)) {
        lastCheck = {t:event.t,index};
        verified ||= current.some(answer=>answer.correct);
      }
    } else lastQuiz = {t:event.t,index};
    answers.push(...current.map(answer=>({...answer,weight:event.phase==='post' ? 0.5 : 1})));
  });
  return {verified,due:dueAt(at)};
}
function learningState(file, events, warnings) {
  const relevant = events.filter(event => event.files.includes(file));
  const answers = relevant.filter(event => event.type === 'quiz').flatMap(event => event.answers.filter(answer => answer.file === file).map(answer => ({...answer,weight:event.phase === 'post' ? 0.5 : 1}))).slice(-10);
  const accuracy = answerAccuracy(answers);
  const check = checkState(file,events,now());
  const evidence = relevant.findLast(event => Object.hasOwn(event.snapshots,file));
  const exposed = relevant.some(event => ['shown','quiz','kata_start'].includes(event.type));
  const practised = relevant.some(event => event.type === 'kata_submit' && event.result === 'pass');
  const drift = driftSince(file,evidence?.snapshots[file],warnings);
  const base = check.verified ? accuracy : accuracy !== null ? Math.min(QUIZ_CAP,accuracy) : exposed ? EXPOSURE_MIND : 0;
  return {accuracy,drift,mind:Math.min(1,base+(practised ? PRACTICE_BONUS : 0))*(1-drift),state:practised && drift <= 0.5 ? 'practised' : check.verified && drift <= 0.5 ? 'verified' : exposed ? 'exposed' : 'dark',due:check.due,
    lastQuiz:relevant.findLast(event => event.type === 'quiz')?.t ?? null, explain:relevant.findLast(event => event.type === 'explain')?.text ?? null};
}
function kataContexts(events) {
  return events.filter(event => event.type === 'kata_start').map(start => {
    const continuation = events.filter(event => event.kataNumber === start.kataNumber && event !== start);
    const submissions = continuation.filter(event => event.type === 'kata_submit');
    return {...start,active:!submissions.some(event => ['pass','abandon'].includes(event.result)),submissions,
      hints:continuation.filter(event=>event.type==='hint'),quizzes:continuation.filter(event=>event.type==='quiz'),explanations:continuation.filter(event=>event.type==='explain')};
  });
}

const BASE_WEIGHT = 0.25;
const CODE_WEIGHT = 0.75;
function lineCount(text) {
  return text.length ? text.split('\n').length - Number(text.endsWith('\n')) : 0;
}
function scoreFiles(files, who, warnings) {
  const reports = new Map(files.map(file => [file, Object.create(null)]));
  const directory = join(state, 'scorers');
  const scorers = existsSync(directory) ? readdirSync(directory).sort().filter(name => {
    const stat = lstatSync(join(directory, name));
    return stat.isFile() && (stat.mode & 0o111);
  }) : [];
  if (!scorers.length) warnings.push('No executable scorers available');
  for (const scorer of scorers) {
    if (!files.length) break;
    const result = spawnSync(join(directory, scorer), [], {
      cwd:root, encoding:'utf8', input:files.join('\n') + '\n', timeout:120000,
      maxBuffer:16 * 1024 * 1024, env:{ ...process.env, KEEPUP_STATE:state, KEEPUP_LEARNER:who, COGDEBT_STATE:state, COGDEBT_LEARNER:who },
    });
    if (result.error || result.status !== 0) {
      warnings.push(`Scorer ${scorer} failed: ${result.error?.message || result.stderr.trim() || `exit ${result.status}`}`);
      continue;
    }
    try {
      const rows = result.stdout.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
      const seen = new Set();
      for (const row of rows) {
        if (!row || !reports.has(row.file) || typeof row.metric !== 'string' || !row.metric.trim()
            || !Number.isFinite(row.value) || row.value < 0 || row.value > 1
            || row.raw !== undefined && !Number.isFinite(row.raw)
            || row.line !== undefined && (!Number.isInteger(row.line) || row.line < 1)
            || row.fn !== undefined && typeof row.fn !== 'string') throw new Error('invalid report');
        const key = JSON.stringify([row.file, row.metric]);
        if (seen.has(key) || Object.hasOwn(reports.get(row.file), row.metric)) throw new Error('duplicate file/metric');
        seen.add(key);
      }
      for (const { file, metric, value, raw, line, fn } of rows) {
        Object.defineProperty(reports.get(file), metric, { value:{value, ...(raw === undefined ? {} : {raw}), ...(line === undefined ? {} : {line}), ...(fn === undefined ? {} : {fn})}, enumerable:true });
      }
      if (result.stderr.trim()) warnings.push(`Scorer ${scorer}: ${result.stderr.trim()}`);
    } catch (error) { warnings.push(`Scorer ${scorer} output ignored: ${error.message}`); }
  }
  return reports;
}
function computeStatus(allEvents = readEvents()) {
  const who = learner();
  const events = allEvents.filter(event => event.who === who);
  const warnings = [];
  const paths = scopedFiles();
  const reports = scoreFiles(paths, who, warnings);
  const files = paths.map(file => {
    const metrics = reports.get(file);
    const values = Object.values(metrics).map(report => report.value);
    return { file, lines:lineCount(readFileSync(join(root, file), 'utf8')), metrics,
      codeScore:values.length ? values.reduce((a,b) => a+b, 0) / values.length : null,
      ...learningState(file,events,warnings), debt:0, weight:0 };
  });
  const largest = Math.max(0, ...files.map(file => file.lines));
  let weights = 0, debts = 0, scoredLines = 0, code = 0;
  const lines = files.reduce((sum, file) => sum + file.lines, 0);
  for (const file of files) {
    file.weight = (largest ? file.lines / largest : 0) * (BASE_WEIGHT + CODE_WEIGHT * (1 - (file.codeScore ?? 0)));
    file.debt = file.weight * (1 - file.mind);
    weights += file.weight;
    debts += file.debt;
    if (file.codeScore !== null) { scoredLines += file.lines; code += file.lines * file.codeScore; }
  }
  const missing = files.filter(file => file.codeScore === null).length;
  if (missing) warnings.push(`${missing} files have unavailable code scores; debt conservatively uses zero, code health excludes their lines`);
  const summary = { cognitiveDebt:weights ? debts / weights : null, codeHealth:scoredLines ? code / scoredLines : null,
    scoredLineCoverage:lines ? scoredLines / lines : 0, coverage:Object.fromEntries(['dark','exposed','verified','practised'].map(name => [name,lines ? files.filter(file=>file.state===name).reduce((sum,file)=>sum+file.lines,0)/lines : 0])), due:files.filter(file=>file.due).length };
  return { who, files, metrics:[...new Set(files.flatMap(file => Object.keys(file.metrics)))].sort(), summary, delta:null, warnings, katas:kataContexts(events) };
}
function status() {
  const result = computeStatus();
  const historyPath = join(state, 'history.jsonl');
  const history = readFileSync(historyPath, 'utf8');
  if (history && !history.endsWith('\n')) throw new Error('Incomplete history log; left untouched');
  const previous = history.split('\n').filter(Boolean).map(line => JSON.parse(line)).findLast(entry => entry.who === result.who);
  if (previous) {
    const difference = (a,b) => a === null || b === null ? null : a-b;
    result.delta = { cognitiveDebt:difference(result.summary.cognitiveDebt, previous.summary.cognitiveDebt),
      codeHealth:difference(result.summary.codeHealth, previous.summary.codeHealth),
      scoredLineCoverage:difference(result.summary.scoredLineCoverage, previous.summary.scoredLineCoverage),
      coverage:Object.fromEntries(Object.keys(result.summary.coverage).map(key => [key, result.summary.coverage[key] - previous.summary.coverage[key]])),
      due:result.summary.due - previous.summary.due };
  }
  const t = now();
  appendFileSync(historyPath, JSON.stringify({ t, who:result.who, summary:result.summary }) + '\n');
  return result;
}
function textStatus(result) {
  const percent = value => value === null ? 'unavailable' : `${(value * 100).toFixed(1)}%`;
  const delta = result.delta ? `Delta: debt ${percent(result.delta.cognitiveDebt)}, health ${percent(result.delta.codeHealth)}, scored lines ${percent(result.delta.scoredLineCoverage)}, ${Object.entries(result.delta.coverage).map(([key,value])=>`${key} ${percent(value)}`).join(', ')}, due ${result.delta.due}` : 'No previous baseline';
  const rows = result.files.toSorted((a,b) => b.debt-a.debt || a.file.localeCompare(b.file)).slice(0,10).map(file => {
    const details = Object.entries(file.metrics).map(([name, report]) => `${name}=${percent(report.value)}${report.raw === undefined ? '' : ` raw=${report.raw}`}${report.fn ? ` ${report.fn}` : ''}${report.line ? `:${report.line}` : ''}`).join(', ');
    return `${file.file} | ${file.state} | debt ${file.debt.toFixed(3)} | code ${percent(file.codeScore)}${details ? ` | ${details}` : ''}`;
  });
  return [`Cognitive debt: ${percent(result.summary.cognitiveDebt)}`, `Code health: ${percent(result.summary.codeHealth)} (scored lines ${percent(result.summary.scoredLineCoverage)})`,
    `Coverage: ${Object.entries(result.summary.coverage).map(([key,value]) => `${key} ${percent(value)}`).join(', ')}`, `Due checks: ${result.summary.due}`, delta,
    ...rows, ...result.warnings.map(warning => `Warning: ${warning}`)].join('\n');
}

function inPlay() {
  const events = readEvents();
  const who = learner();
  const previous = events.findLast(event => event.who === who);
  const warnings = [];
  const paths = args => {
    const result = spawnSync('git', args, { cwd:root, encoding:'utf8' });
    if (result.status !== 0) throw new Error(result.stderr.trim() || 'Cannot inspect Git changes');
    return result.stdout.split('\0').filter(Boolean);
  };
  const changed = new Set([
    ...paths(['diff','--name-only','--no-relative','--no-renames','-z','--']),
    ...paths(['diff','--cached','--name-only','--no-relative','--no-renames','-z','--']),
  ]);
  const head = spawnSync('git', ['rev-parse','--verify','--quiet','--end-of-options','HEAD^{commit}'], { cwd:root, encoding:'utf8' });
  if (head.status !== 0) warnings.push('No commits yet; in-play includes tracked working-tree and staged changes only');
  else {
    const base = previous?.sha ? spawnSync('git', ['rev-parse','--verify','--quiet','--end-of-options',previous.sha+'^{commit}'], { cwd:root, encoding:'utf8' }) : null;
    const ancestor = base?.status === 0 && spawnSync('git', ['merge-base','--is-ancestor',base.stdout.trim(),head.stdout.trim()], { cwd:root }).status === 0;
    if (!ancestor) warnings.push(previous ? 'Latest learner event has no reachable historical commit; using the most recent 20 commits' : 'No prior learner event; using the most recent 20 commits');
    const range = ancestor ? [base.stdout.trim()+'..'+head.stdout.trim()] : ['--max-count=20',head.stdout.trim()];
    for (const file of paths(['log','--format=','--name-only','--no-relative','--no-renames','--diff-merges=first-parent','-z',...range,'--'])) changed.add(file);
  }
  return { files:scopedFiles().filter(file => changed.has(file)).sort(), warnings };
}

function map() {
  const result = withLock(status);
  const template = readFileSync(fileURLToPath(new URL('../templates/map.html', import.meta.url)), 'utf8');
  // Escape script delimiters even inside JSON strings; visible text uses textContent.
  const json = JSON.stringify(result).replaceAll('<', '\\u003c');
  const path = join(state, 'map.html');
  writeFileSync(path, template.replace('<!--STATUS_DATA-->', () => json));
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', path] : [path];
  const opened = spawnSync(opener, args, { encoding:'utf8', timeout:10000 });
  const success = !opened.error && opened.status === 0;
  return { path, opened:success, warnings:[...result.warnings, ...(success ? [] : [`Open ${path} in your browser; automatic opening failed`])] };
}

try {
  root = dirname(resolve(git('rev-parse', '--git-common-dir').trim()));
  if (existsSync(join(root,'.keepup')) && existsSync(join(root,'.cogdebt'))) throw new Error('Both .keepup and .cogdebt exist; choose one state directory before running keepup. No state was changed');
  state = join(root, '.keepup');
  if (existsSync(join(root,'.cogdebt'))) state = join(root,'.cogdebt');
  const command = process.argv[2];
  if (command === 'init') console.log(JSON.stringify(initialize()));
  else if (command === 'log') console.log(JSON.stringify(logEvent(JSON.parse(process.argv[3]))));
  else if (command === 'status') {
    const result = withLock(status);
    console.log(process.argv.includes('--json') ? JSON.stringify(result) : textStatus(result));
  } else if (command === 'map') console.log(JSON.stringify(map()));
  else if (command === 'in-play') console.log(JSON.stringify(withLock(inPlay)));
  else throw new Error('Usage: keepup init | log <json> | status [--json] | map | in-play');
} catch (error) {
  console.error(`keepup: ${error.message}`);
  process.exitCode = 1;
}
