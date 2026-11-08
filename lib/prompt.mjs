// Minimal interactive prompts (multi-select and yes/no) on top of node:readline, so the package
// keeps zero dependencies. Every prompt takes an `io` object ({ input, output, env }) so tests can
// drive it with fake streams. Callers must check canPrompt() first; without a real terminal they
// should fall back to flags, config or detection instead of asking.
import { emitKeypressEvents } from 'node:readline';

export class PromptCancelled extends Error {
  constructor() { super('cancelled'); }
}

const defaultIo = () => ({ input: process.stdin, output: process.stdout, env: process.env });

export function canPrompt(io = defaultIo()) {
  return Boolean(io.input?.isTTY && io.output?.isTTY && typeof io.input.setRawMode === 'function');
}

// Unicode symbols where the terminal is known to render them; ASCII elsewhere (old Windows consoles).
function theme(io) {
  const { env, output } = io;
  const unicode = process.platform !== 'win32' || Boolean(env.WT_SESSION || env.TERM_PROGRAM || env.ConEmuANSI === 'ON');
  const color = !env.NO_COLOR && (typeof output.hasColors === 'function' ? output.hasColors() : Boolean(output.isTTY));
  const paint = (code) => (s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
  return {
    dim: paint('2'), bold: paint('1'), cyan: paint('36'), green: paint('32'), red: paint('31'),
    pointer: unicode ? '❯' : '>', on: unicode ? '◉' : '[x]', off: unicode ? '◯' : '[ ]',
    ask: unicode ? '?' : '?', done: unicode ? '✔' : 'v',
  };
}

// Runs one prompt: raw-mode key handling plus in-place redraw. `render` returns the lines to show;
// `onKey` returns { done: value } to finish, or nothing to keep going.
function session(io, render, onKey) {
  const { input, output } = io;
  return new Promise((resolve, reject) => {
    let drawn = 0;
    const width = () => Math.max(20, (output.columns || 80) - 1);
    // Lines are cut to the terminal width so a wrapped line can't break the redraw.
    const fit = (line) => {
      let visible = 0;
      let out = '';
      for (const part of line.split(/(\x1b\[[0-9;]*m)/)) {
        if (part.startsWith('\x1b[')) { out += part; continue; }
        const room = width() - visible;
        if (room <= 0) break;
        out += part.length > room ? `${part.slice(0, Math.max(0, room - 1))}…` : part;
        visible += Math.min(part.length, room);
      }
      return `${out}\x1b[0m`;
    };
    const draw = (lines) => {
      if (drawn) output.write(`\x1b[${drawn}A\x1b[0J`);
      output.write(`${lines.map(fit).join('\n')}\n`);
      drawn = lines.length;
    };
    const finish = (fn, finalLines) => {
      input.removeListener('keypress', handler);
      if (input.isTTY) input.setRawMode(false);
      input.pause();
      if (finalLines) draw(finalLines);
      output.write('\x1b[?25h');
      fn();
    };
    const handler = (str, key = {}) => {
      if ((key.ctrl && key.name === 'c') || key.name === 'escape') {
        return finish(() => reject(new PromptCancelled()));
      }
      const result = onKey(str, key);
      if (result && 'done' in result) return finish(() => resolve(result.done), result.final);
      draw(render());
    };
    emitKeypressEvents(input);
    if (input.isTTY) input.setRawMode(true);
    input.on('keypress', handler);
    input.resume();
    output.write('\x1b[?25l');
    draw(render());
  });
}

// choices: [{ value, label, hint?, tag?, checked? }]. Resolves to the selected values in list order.
export function multiSelect({ message, choices, min = 1 }, io = defaultIo()) {
  const t = theme(io);
  let cursor = 0;
  let error = '';
  const selected = new Set(choices.filter((c) => c.checked).map((c) => c.value));
  const labelWidth = Math.max(...choices.map((c) => c.label.length));
  const tagWidth = Math.max(0, ...choices.map((c) => (c.tag ?? '').length));
  const render = () => [
    `${t.cyan(t.ask)} ${t.bold(message)}`,
    t.dim('  ↑/↓ move · space select · a all/none · enter confirm · esc cancel'),
    ...choices.map((c, i) => {
      const here = i === cursor;
      const box = selected.has(c.value) ? t.green(t.on) : t.dim(t.off);
      const label = here ? t.cyan(c.label.padEnd(labelWidth)) : c.label.padEnd(labelWidth);
      const tag = tagWidth ? ` ${t.green((c.tag ?? '').padEnd(tagWidth))}` : '';   // own column, keeps hints aligned
      return `${here ? t.cyan(t.pointer) : ' '} ${box} ${label}${tag}  ${t.dim(c.hint ?? '')}`;
    }),
    ...(error ? [t.red(`  ${error}`)] : []),
  ];
  return session(io, render, (str, key) => {
    error = '';
    if (key.name === 'up' || str === 'k') cursor = (cursor - 1 + choices.length) % choices.length;
    else if (key.name === 'down' || str === 'j') cursor = (cursor + 1) % choices.length;
    else if (key.name === 'space') {
      const v = choices[cursor].value;
      selected.has(v) ? selected.delete(v) : selected.add(v);
    } else if (str === 'a') {
      const all = selected.size === choices.length;
      choices.forEach((c) => (all ? selected.delete(c.value) : selected.add(c.value)));
    } else if (key.name === 'return' || key.name === 'enter') {
      if (selected.size < min) { error = `Select at least ${min} (press space).`; return undefined; }
      const values = choices.filter((c) => selected.has(c.value)).map((c) => c.value);
      const names = choices.filter((c) => selected.has(c.value)).map((c) => c.label).join(', ');
      return { done: values, final: [`${t.green(t.done)} ${t.bold(message)} ${t.cyan(names)}`] };
    }
    return undefined;
  });
}

export function confirm({ message, initial = true }, io = defaultIo()) {
  const t = theme(io);
  const render = () => [`${t.cyan(t.ask)} ${t.bold(message)} ${t.dim(initial ? '(Y/n)' : '(y/N)')}`];
  return session(io, render, (str, key) => {
    let answer;
    if (str === 'y' || str === 'Y') answer = true;
    else if (str === 'n' || str === 'N') answer = false;
    else if (key.name === 'return' || key.name === 'enter') answer = initial;
    if (answer === undefined) return undefined;
    return { done: answer, final: [`${t.green(t.done)} ${t.bold(message)} ${t.cyan(answer ? 'Yes' : 'No')}`] };
  });
}
