/** @param {string} s */
export const norm = (s) =>
  s
    .replace(/\s+/g, '')
    .replace(/'/g, '"')
    .replace(/,([)\]}])/g, '$1');

/** True when the brackets on a line close, i.e. it is not the first line of a wrapped statement. @param {string} s */
export function balanced(s) {
  let d = 0;
  for (const c of s) {
    if (c === '(' || c === '[' || c === '{') d++;
    else if (c === ')' || c === ']' || c === '}') d--;
  }
  return d === 0;
}

const STR_RE = /(["'`])((?:\\.|(?!\1).)*)\1/g;
const NUM_RE = /(?<![\w.])-?\d+(?:\.\d+)?(?![\w.])/g;

/**
 * Split a code line into string literals, numeric literals and a skeleton in
 * which every literal is replaced by `#`.
 * @param {string} line
 */
export function literals(line) {
  /** @type {string[]} */
  const strings = [];
  const noStr = line.replace(STR_RE, (_m, _q, body) => {
    strings.push(body);
    return '#';
  });
  const numbers = noStr.match(NUM_RE) ?? [];
  const skeleton = norm(noStr.replace(NUM_RE, '#'));
  return { strings, numbers, skeleton };
}

const COMMENT_RE = /^\s*(\/\/+|#|--|\/\*+|\*)\s?/;

/** @param {string} line */
export const isComment = (line) => COMMENT_RE.test(line);

/** @param {string} line */
export const stripCommentMarker = (line) => line.replace(COMMENT_RE, '');

/**
 * Convert a simple glob (`*`, `**`, `?`) to a RegExp.
 * @param {string} glob
 */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*';
        i++;
        if (glob[i + 1] === '/') i++;
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/** @param {string} path */
export const extOf = (path) => (path.includes('.') ? path.slice(path.lastIndexOf('.') + 1).toLowerCase() : '');

/** @param {string} path */
export const baseName = (path) => path.slice(path.lastIndexOf('/') + 1);
