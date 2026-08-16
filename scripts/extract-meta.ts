/* Codemod: split {id,title,description,kind} out of every diversion's index.ts
 * into a sibling meta.ts, and re-spread it back at the same position.
 * Run once: `npx tsx scripts/extract-meta.ts`. Idempotent (skips folders that
 * already have a meta.ts). */
import * as fs from 'node:fs'
import * as path from 'node:path'
import ts from 'typescript'

const FIELDS = ['id', 'title', 'description', 'kind'] as const
const KINDS = new Set(['2d', 'webgl', 'webgpu'])
const root = path.resolve('src/diversions')

let changed = 0
let skipped = 0
for (const slug of fs.readdirSync(root).sort()) {
  const dir = path.join(root, slug)
  const indexPath = path.join(dir, 'index.ts')
  const metaPath = path.join(dir, 'meta.ts')
  if (!fs.existsSync(indexPath)) continue
  // Genuinely idempotent: a second run must not try to re-extract fields the first
  // run already removed (which would throw "missing id,title,..." on folder one and
  // abort the whole pass).
  if (fs.existsSync(metaPath)) {
    skipped++
    continue
  }
  const text = fs.readFileSync(indexPath, 'utf8')
  const sf = ts.createSourceFile(indexPath, text, ts.ScriptTarget.Latest, true)

  // Find the single defineDiversion(...) call and its object-literal argument.
  let obj: ts.ObjectLiteralExpression | undefined
  const walk = (n: ts.Node) => {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'defineDiversion' &&
      n.arguments.length === 1 &&
      ts.isObjectLiteralExpression(n.arguments[0])
    ) {
      if (obj) throw new Error(`${slug}: more than one defineDiversion() call`)
      obj = n.arguments[0]
    }
    ts.forEachChild(n, walk)
  }
  walk(sf)
  if (!obj) throw new Error(`${slug}: no defineDiversion({...}) found`)

  // Collect the four property assignments, verbatim (keeps escapes/quotes intact).
  const picked = new Map<string, ts.PropertyAssignment>()
  for (const p of obj.properties) {
    if (!ts.isPropertyAssignment(p) || !ts.isIdentifier(p.name)) continue
    if ((FIELDS as readonly string[]).includes(p.name.text)) picked.set(p.name.text, p)
  }
  const missing = FIELDS.filter((f) => !picked.has(f))
  if (missing.length) throw new Error(`${slug}: missing ${missing.join(',')}`)

  // The splice below deletes from the start of a property's line to the end of it,
  // so a property sharing a line with anything else would take that with it. True
  // for all 137 today; asserted so a re-run on reformatted source fails loudly
  // instead of eating code.
  for (const f of FIELDS) {
    const p = picked.get(f)!
    const lineStart = text.lastIndexOf('\n', p.getStart(sf)) + 1
    const before = text.slice(lineStart, p.getStart(sf))
    const after = text.slice(p.getEnd()).match(/^,?[^\n]*/)?.[0] ?? ''
    if (before.trim() !== '' || after.replace(/^,/, '').trim() !== '')
      throw new Error(
        `${slug}: \`${f}\` shares its line with other code — the codemod would delete it. ` +
          `Put it on its own line and re-run.`,
      )
  }

  // Two invariants that are otherwise only conventions. Checking them here means the
  // migration itself refuses to produce a registry that routes wrongly; contract.test.ts
  // then keeps them true for every diversion added afterwards.
  const literal = (f: string) => picked.get(f)!.initializer.getText(sf).slice(1, -1)
  if (literal('id') !== slug)
    throw new Error(`${slug}: id '${literal('id')}' must equal its folder name — routing keys on it`)
  if (!KINDS.has(literal('kind')))
    throw new Error(`${slug}: kind '${literal('kind')}' is not one of 2d|webgl|webgpu`)

  // ── write meta.ts ─────────────────────────────────────────────────────────
  const body = FIELDS.map((f) => {
    const p = picked.get(f)!
    // Carry any leading comment lines that belonged to the property.
    const lead = ts
      .getLeadingCommentRanges(text, p.getFullStart())
      ?.map((r) => '  ' + text.slice(r.pos, r.end).trim() + '\n')
      .join('') ?? ''
    return `${lead}  ${f}: ${p.initializer.getText(sf)},`
  }).join('\n')
  fs.writeFileSync(
    metaPath,
    `import type { DiversionMeta } from '../../framework/types'\n\n` +
      `/** Gallery card + routing identity. Split from index.ts so the registry can\n` +
      ` *  eager-glob every diversion's identity while lazy-importing its code (#288). */\n` +
      `export const meta = {\n${body}\n} as const satisfies DiversionMeta\n`,
  )

  // ── rewrite index.ts: replace the 4 props with `...meta,` at the first one ──
  // Splice by text range, back-to-front, so earlier offsets stay valid.
  const ranges = FIELDS.map((f) => {
    const p = picked.get(f)!
    const lead = ts.getLeadingCommentRanges(text, p.getFullStart())
    // Start at the beginning of the line (or the first leading comment), so the
    // whole visual block goes; end past a trailing comma + newline.
    let start = lead?.length ? lead[0].pos : p.getStart(sf)
    while (start > 0 && text[start - 1] !== '\n') start-- // eat the indent
    let end = p.getEnd()
    if (text[end] === ',') end++
    while (end < text.length && text[end] !== '\n') end++
    end++ // the newline
    return { start, end }
  }).sort((a, b) => a.start - b.start)

  const indent = '  '
  let out = text
  for (let i = ranges.length - 1; i >= 0; i--) {
    const r = ranges[i]
    out = out.slice(0, r.start) + (i === 0 ? `${indent}...meta,\n` : '') + out.slice(r.end)
  }
  // Add the meta import after the last existing import DECLARATION — via the AST,
  // not a `^import` regex: 26 of the 137 files open a multi-line `import {\n…`, and
  // a line-based match splices the new import INSIDE that brace list.
  const imports = sf.statements.filter(ts.isImportDeclaration)
  if (!imports.length) throw new Error(`${slug}: no import declarations to anchor './meta' after`)
  const at = imports.at(-1)!.getEnd()
  // Ranges were spliced out of `out` after `at`? No — imports always precede the
  // defineDiversion object, so `at` is still valid in the rewritten text.
  out = out.slice(0, at) + `\nimport { meta } from './meta'` + out.slice(at)

  fs.writeFileSync(indexPath, out)
  changed++
}
console.log(`meta.ts written for ${changed} diversions (${skipped} already had one)`)
