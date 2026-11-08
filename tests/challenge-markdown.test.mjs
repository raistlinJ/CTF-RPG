import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { parseChallenges } from "../lib/config-schema.mjs";

// Render the actual shared TSX component without a browser or a separate build.
const { outputText } = ts.transpileModule(readFileSync(new URL("../app/challenge-markdown.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
});
const source = outputText.replace(/from "([^"]+)"/g, (_, name) => `from ${JSON.stringify(import.meta.resolve(name))}`);
const { default: ChallengeMarkdown } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const render = text => renderToStaticMarkup(createElement(ChallengeMarkdown, { className: "question" }, text));

test("challenge Markdown renders rich instructions, GFM tables, and literal code", () => {
  const html = render('## Inspect\n\nFind **main** and *step* through `cmp`.\n\n1. Open\n2. Debug\n\n> Read registers\n\n```asm\nmov eax, <value>\n```\n\n| Register | Value |\n| --- | --- |\n| eax | 42 |\n\n- [x] Done\n\n~~old~~');
  for (const fragment of ['<h2>Inspect</h2>', '<strong>main</strong>', '<em>step</em>', '<code>cmp</code>', '<ol>', '<blockquote>', 'class="language-asm"', 'mov eax, &lt;value&gt;', '<table>', '<th>Register</th>', 'type="checkbox"', 'disabled=""', '<del>old</del>']) assert.ok(html.includes(fragment), fragment);
});

test("plain paragraphs and existing single line breaks remain readable", () => {
  assert.match(render('First line\nSecond line\n\nNext paragraph'), /<p>First line<br\/>\nSecond line<\/p>\n<p>Next paragraph<\/p>/);
  assert.match(render('A & B'), /A &amp; B/);
  assert.equal(render(undefined), '<div class="challenge-markdown question"></div>');
});

test("HTML and executable URLs cannot become active content", () => {
  const html = render('<script>alert(1)</script>\n\n<iframe src="https://evil.example"></iframe>\n\n[bad](javascript:alert%281%29)\n\n![bad](data:text/html,evil)\n\n<img src=x onerror=alert(1)>');
  assert.doesNotMatch(html, /<script|<iframe|onerror|javascript:|data:text\/html|alert\(1\)/i);
  const safe = render('[Worksheet](/downloads/worksheet.pdf) and [Docs](https://example.com)');
  assert.match(safe, /href="\/downloads\/worksheet.pdf"/);
  assert.match(safe, /href="https:\/\/example.com"/);
  assert.equal((safe.match(/target="_blank" rel="noopener noreferrer"/g) || []).length, 2);
});

test("challenge catalog round trip preserves Markdown and literal flags and hints", () => {
  const text = '## Inspect\n\n**Find** `main`\n\n```asm\nmov eax, 42\n```';
  const definition = { id: 'markdown-check', object: 'Inspect', location: { x: 11, y: 19 }, region: 'Test', text, points: 10, flags: ['**literal_flag**'], hints: [{ id: 'hint', label: 'Read', text: '*Check* `eax`', cost: 0 }] };
  const parsed = parseChallenges(JSON.stringify({ challenges: [definition] }));
  assert.equal(parsed[0].text, text);
  assert.equal(parsed[0].hints[0].text, definition.hints[0].text);
  assert.equal(parsed[0].flags[0], '**literal_flag**');
  assert.deepEqual(parseChallenges(JSON.stringify({ challenges: parsed })), parsed);
});
