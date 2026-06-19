#!/usr/bin/env node
// build.js - Converts the PKsThemes VSCode source (window.json + syntax-*.json
// in the sibling vscode-pksthemes repo) into Zed theme files. Zed has no
// concept of TextMate scopes, so tokenColors are resolved against a table of
// representative scopes for each Zed syntax key using standard TextMate
// specificity rules (longest matching scope segment wins, ties broken by
// last-defined-wins).
const fs = require('fs')
const path = require('path')

const SRC_DIR = path.join(__dirname, '..', 'vscode-pksthemes', 'src')
const OUT_DIR = path.join(__dirname, 'themes')
const AUTHOR = 'Michael Shepanski'

const THEMES = [
  {file: 'rit', name: 'PKsTheme RIT'},
  {file: 'dracula', name: 'PKsTheme Dracula'},
  {file: 'gruvbox', name: 'PKsTheme Gruvbox'},
  {file: 'monokai', name: 'PKsTheme Monokai'},
  {file: 'onedarkpro', name: 'PKsTheme OneDark Pro'},
]

// Representative TextMate scopes to try (in order) for each Zed syntax key.
const SYNTAX_SCOPES = {
  'attribute': ['entity.other.attribute-name'],
  'boolean': ['constant.language.boolean', 'constant.language'],
  'comment': ['comment'],
  'comment.doc': ['comment.block.documentation', 'comment.documentation', 'comment'],
  'constant': ['constant', 'support.constant'],
  'constructor': ['entity.name.function.constructor', 'support.class', 'entity.name.type.class'],
  'embedded': ['punctuation.section.embedded', 'source'],
  'emphasis': ['markup.italic'],
  'emphasis.strong': ['markup.bold'],
  'enum': ['support.type.enum', 'entity.name.type.enum', 'constant.other.enum'],
  'function': ['entity.name.function', 'support.function'],
  'function.builtin': ['support.function.builtin', 'support.function'],
  'keyword': ['keyword.control', 'keyword'],
  'label': ['entity.name.label', 'constant.other.label'],
  'link_text': ['string.other.link', 'markup.underline.link'],
  'link_uri': ['markup.underline.link', 'constant.other.reference.link'],
  'namespace': ['entity.name.namespace', 'support.other.namespace', 'entity.name.type.module'],
  'number': ['constant.numeric'],
  'operator': ['keyword.operator'],
  'preproc': ['keyword.control.directive', 'meta.preprocessor', 'punctuation.definition.preprocessor'],
  'property': ['variable.other.property', 'support.type.property-name', 'meta.object-literal.key'],
  'punctuation': ['punctuation'],
  'punctuation.bracket': ['punctuation.section.brackets', 'punctuation.definition.parameters', 'punctuation'],
  'punctuation.delimiter': ['punctuation.separator', 'punctuation.terminator', 'punctuation'],
  'punctuation.list_marker': ['punctuation.definition.list', 'beginning.punctuation.definition.list'],
  'punctuation.markup': ['punctuation.definition.markdown', 'punctuation'],
  'punctuation.special': ['punctuation.special', 'punctuation.section.embedded'],
  'selector': ['entity.name.tag', 'meta.selector'],
  'selector.pseudo': ['entity.other.attribute-name.pseudo-class', 'entity.other.attribute-name.pseudo-element'],
  'string': ['string'],
  'string.escape': ['constant.character.escape'],
  'string.regex': ['string.regexp'],
  'string.special': ['constant.other.symbol', 'string.other'],
  'string.special.symbol': ['constant.other.symbol'],
  'tag': ['entity.name.tag'],
  'text.literal': ['markup.raw', 'markup.inline.raw', 'string'],
  'title': ['markup.heading', 'entity.name.section'],
  'type': ['entity.name.type', 'support.type', 'storage.type'],
  'variable': ['variable'],
  'variable.special': ['variable.language', 'variable.other.readwrite.alias'],
  'variant': ['entity.name.function.constructor', 'support.class'],
}

// ---------------------------------------------------------------------------
// Helpers

function readJson5(filename) {
  let text = fs.readFileSync(path.join(SRC_DIR, filename), 'utf8')
  text = text.replace(/(^|[^:"])\/\/.*$/gm, '$1')   // strip // comments
  text = text.replace(/,(\s*[}\]])/g, '$1')         // strip trailing commas
  return JSON.parse(text)
}

// Normalize any VSCode hex color (#rgb, #rgba, #rrggbb, #rrggbbaa) to the
// 8-digit #rrggbbaa format Zed requires.
function hex(color) {
  if (!color) return null
  let value = color.replace('#', '')
  if (value.length === 3) value = value.split('').map((c) => c + c).join('') + 'ff'
  else if (value.length === 4) value = value.split('').map((c) => c + c).join('')
  else if (value.length === 6) value = value + 'ff'
  return '#' + value.toLowerCase()
}

function alpha(color, hexAlpha) {
  return hex(color).slice(0, 7) + hexAlpha
}

function fontStyleOf(settings) {
  const style = (settings.fontStyle || '').toLowerCase()
  return {
    font_style: style.includes('italic') ? 'italic' : null,
    font_weight: style.includes('bold') ? 700 : null,
  }
}

// Scores how well a single TextMate rule scope matches a target scope using
// standard prefix specificity (e.g. rule "entity.name" matches target
// "entity.name.function" with score 2). Compound selectors like
// "source.css entity.name.tag" are matched on their last (most specific) part,
// but carry an ancestor penalty since they only apply in a narrower context
// than we can verify without a real document tree.
function scopeScore(ruleScope, target) {
  const parts = ruleScope.trim().split(/\s+/)
  const last = parts[parts.length - 1]
  const ancestors = parts.length - 1
  if (last === target || target.startsWith(last + '.')) {
    return {specificity: last.split('.').length, ancestors}
  }
  return null
}

// Scope lists are sometimes a single comma-separated string instead of an
// array (e.g. "comment, punctuation.definition.comment"); flatten to a plain
// list of individual scope selectors.
function getScopes(rule) {
  const raw = Array.isArray(rule.scope) ? rule.scope : [rule.scope]
  return raw.filter(Boolean).flatMap((scope) => scope.split(','))
}

function resolveSyntax(tokenColors, candidates) {
  for (const target of candidates) {
    let best = null
    tokenColors.forEach((rule, index) => {
      getScopes(rule).forEach((scope) => {
        const score = scopeScore(scope, target)
        if (!score) return
        const isBetter = !best
          || score.specificity > best.score.specificity
          || (score.specificity === best.score.specificity && score.ancestors < best.score.ancestors)
          || (score.specificity === best.score.specificity && score.ancestors === best.score.ancestors)
        if (isBetter) best = {rule, index, score}
      })
    })
    if (best) return best.rule.settings
  }
  return null
}

function buildSyntax(tokenColors, editorForeground) {
  const syntax = {}
  for (const [key, candidates] of Object.entries(SYNTAX_SCOPES)) {
    const settings = resolveSyntax(tokenColors, candidates)
    if (!settings || !settings.foreground) continue
    syntax[key] = {color: hex(settings.foreground), ...fontStyleOf(settings)}
  }
  syntax.primary = {color: editorForeground, font_style: null, font_weight: null}
  return syntax
}

// ---------------------------------------------------------------------------
// Shared UI ("style") base, built once from window.json. All five PKsThemes
// intentionally share one window/UI palette and only swap syntax colors.

function buildBaseStyle(window) {
  const c = window.colors
  const EDITOR_BG = hex(c['editor.background'])      // #151516
  const CHROME_BG = hex(c['activityBar.background']) // #252526
  const ELEV_BG = hex(c['sideBarSectionHeader.background']) // #333333
  const ACCENT = hex(c['activityBarBadge.background'])      // #458588
  const TEXT = hex(c['foreground'])
  const TEXT_MUTED = hex(c['tab.inactiveForeground'])
  const SELECTED = hex(c['list.activeSelectionBackground'])
  const HOVER = hex(c['list.hoverBackground'])

  return {
    accents: [
      hex(c['terminal.ansiRed']), hex(c['terminal.ansiGreen']), hex(c['terminal.ansiYellow']),
      hex(c['terminal.ansiBlue']), hex(c['terminal.ansiMagenta']), hex(c['terminal.ansiCyan']),
    ],
    background: CHROME_BG,
    // The VSCode source deliberately makes every border transparent
    // (focusBorder, sideBar.border, statusBar.border, editorBracketMatch.border
    // are all alpha 00) - carry that "no visible borders" intent over rather
    // than substituting a solid grey, which read as bright divider lines.
    border: '#00000000',
    'border.variant': hex(c['editorRuler.foreground']),
    'border.focused': ACCENT,
    'border.selected': ACCENT,
    'border.transparent': '#00000000',
    'border.disabled': hex(c['editorRuler.foreground']),
    'elevated_surface.background': ELEV_BG,
    'surface.background': CHROME_BG,
    'element.background': hex(c['dropdown.background']),
    'element.hover': HOVER,
    'element.active': SELECTED,
    'element.selected': SELECTED,
    'element.disabled': hex(c['dropdown.background']),
    'drop_target.background': hex(c['list.dropBackground']),
    'ghost_element.background': '#00000000',
    'ghost_element.hover': HOVER,
    'ghost_element.active': SELECTED,
    'ghost_element.selected': SELECTED,
    'ghost_element.disabled': hex(c['dropdown.background']),
    text: alpha(c['foreground'], 'bb'),
    'text.muted': TEXT_MUTED,
    'text.placeholder': hex(c['input.placeholderForeground']),
    'text.disabled': alpha(c['breadcrumb.foreground'], '44'),
    'text.accent': ACCENT,
    icon: alpha(c['foreground'], 'bb'),
    'icon.muted': TEXT_MUTED,
    'icon.disabled': alpha(c['breadcrumb.foreground'], '44'),
    'icon.placeholder': hex(c['input.placeholderForeground']),
    'icon.accent': ACCENT,
    'status_bar.background': CHROME_BG,
    'title_bar.background': CHROME_BG,
    'title_bar.inactive_background': CHROME_BG,
    'toolbar.background': EDITOR_BG,
    'tab_bar.background': CHROME_BG,
    'tab.inactive_background': CHROME_BG,
    'tab.active_background': EDITOR_BG,
    'search.match_background': hex(c['editor.findMatchHighlightBackground']),
    'search.active_match_background': hex(c['editor.findMatchBackground']),
    'panel.background': CHROME_BG,
    'panel.focused_border': null,
    'panel.indent_guide': hex(c['editorWhitespace.foreground']),
    'panel.indent_guide_active': hex(c['editorIndentGuide.activeBackground1']),
    'panel.indent_guide_hover': alpha(c['editorIndentGuide.activeBackground1'], '70'),
    'pane.focused_border': null,
    'pane_group.border': hex(c['editorRuler.foreground']),
    'scrollbar.thumb.background': alpha(c['editorCodeLens.foreground'], '4c'),
    'scrollbar.thumb.hover_background': HOVER,
    'scrollbar.thumb.border': HOVER,
    'scrollbar.track.background': '#00000000',
    'scrollbar.track.border': CHROME_BG,
    'editor.foreground': alpha(TEXT, 'ff'),
    'editor.background': EDITOR_BG,
    'editor.gutter.background': EDITOR_BG,
    'editor.subheader.background': ELEV_BG,
    'editor.active_line.background': hex(c['editor.lineHighlightBackground']),
    'editor.highlighted_line.background': hex(c['editor.findRangeHighlightBackground']),
    'editor.line_number': hex(c['editorLineNumber.foreground']),
    'editor.active_line_number': hex(c['editorLineNumber.activeForeground']),
    'editor.hover_line_number': alpha(c['editorLineNumber.activeForeground'], '80'),
    'editor.invisible': hex(c['editorWhitespace.foreground']),
    'editor.wrap_guide': hex(c['editorRuler.foreground']),
    'editor.active_wrap_guide': alpha(c['editorRuler.foreground'], '30'),
    'editor.document_highlight.bracket_background': hex(c['editorBracketMatch.background']),
    'editor.document_highlight.read_background': hex(c['editor.wordHighlightBackground']),
    'editor.document_highlight.write_background': hex(c['editor.hoverHighlightBackground']),
    'terminal.background': hex(c['terminal.background']),
    'terminal.foreground': hex(c['terminal.foreground']),
    'terminal.bright_foreground': hex(c['terminal.ansiBrightWhite']),
    'terminal.dim_foreground': hex(c['terminal.ansiBlack']),
    'terminal.ansi.black': hex(c['terminal.ansiBlack']),
    'terminal.ansi.bright_black': hex(c['terminal.ansiBrightBlack']),
    'terminal.ansi.red': hex(c['terminal.ansiRed']),
    'terminal.ansi.bright_red': hex(c['terminal.ansiBrightRed']),
    'terminal.ansi.green': hex(c['terminal.ansiGreen']),
    'terminal.ansi.bright_green': hex(c['terminal.ansiBrightGreen']),
    'terminal.ansi.yellow': hex(c['terminal.ansiYellow']),
    'terminal.ansi.bright_yellow': hex(c['terminal.ansiBrightYellow']),
    'terminal.ansi.blue': hex(c['terminal.ansiBlue']),
    'terminal.ansi.bright_blue': hex(c['terminal.ansiBrightBlue']),
    'terminal.ansi.magenta': hex(c['terminal.ansiMagenta']),
    'terminal.ansi.bright_magenta': hex(c['terminal.ansiBrightMagenta']),
    'terminal.ansi.cyan': hex(c['terminal.ansiCyan']),
    'terminal.ansi.bright_cyan': hex(c['terminal.ansiBrightCyan']),
    'terminal.ansi.white': hex(c['terminal.ansiWhite']),
    'terminal.ansi.bright_white': hex(c['terminal.ansiBrightWhite']),
    'link_text.hover': hex(c['textLink.activeForeground']),
    'version_control.added': hex(c['editorGutter.addedBackground']),
    'version_control.modified': hex(c['editorGutter.modifiedBackground']),
    'version_control.deleted': hex(c['editorGutter.deletedBackground']),
    conflict: hex(c['statusBar.debuggingBackground']),
    'conflict.background': alpha(c['statusBar.debuggingBackground'], '1a'),
    'conflict.border': alpha(c['statusBar.debuggingBackground'], '40'),
    created: hex(c['editorGutter.addedBackground']),
    'created.background': alpha(c['editorGutter.addedBackground'], '1a'),
    'created.border': alpha(c['editorGutter.addedBackground'], '40'),
    deleted: hex(c['editorGutter.deletedBackground']),
    'deleted.background': alpha(c['editorGutter.deletedBackground'], '1a'),
    'deleted.border': alpha(c['editorGutter.deletedBackground'], '40'),
    error: hex(c['terminal.ansiRed']),
    'error.background': alpha(c['terminal.ansiRed'], '1a'),
    'error.border': alpha(c['terminal.ansiRed'], '40'),
    hidden: hex(c['tab.inactiveForeground']),
    'hidden.background': CHROME_BG,
    'hidden.border': ELEV_BG,
    hint: alpha(c['editorCodeLens.foreground'], 'ff'),
    'hint.background': alpha(c['editorCodeLens.foreground'], '1a'),
    'hint.border': alpha(c['editorCodeLens.foreground'], '40'),
    ignored: hex(c['tab.inactiveForeground']),
    'ignored.background': CHROME_BG,
    'ignored.border': ELEV_BG,
    info: ACCENT,
    'info.background': alpha(ACCENT, '1a'),
    'info.border': alpha(ACCENT, '40'),
    modified: hex(c['editorGutter.modifiedBackground']),
    'modified.background': alpha(c['editorGutter.modifiedBackground'], '1a'),
    'modified.border': alpha(c['editorGutter.modifiedBackground'], '40'),
    predictive: alpha(c['editorCodeLens.foreground'], 'ff'),
    'predictive.background': alpha(c['editorCodeLens.foreground'], '1a'),
    'predictive.border': alpha(c['editorCodeLens.foreground'], '40'),
    renamed: hex(c['editorGutter.modifiedBackground']),
    'renamed.background': alpha(c['editorGutter.modifiedBackground'], '1a'),
    'renamed.border': alpha(c['editorGutter.modifiedBackground'], '40'),
    success: hex(c['editorGutter.addedBackground']),
    'success.background': alpha(c['editorGutter.addedBackground'], '1a'),
    'success.border': alpha(c['editorGutter.addedBackground'], '40'),
    unreachable: TEXT_MUTED,
    'unreachable.background': CHROME_BG,
    'unreachable.border': ELEV_BG,
    warning: hex(c['terminal.ansiYellow']),
    'warning.background': alpha(c['terminal.ansiYellow'], '1a'),
    'warning.border': alpha(c['terminal.ansiYellow'], '40'),
    players: [
      hex(c['terminal.ansiBlue']), hex(c['terminal.ansiMagenta']), hex(c['terminal.ansiYellow']),
      hex(c['terminal.ansiCyan']), hex(c['terminal.ansiGreen']), hex(c['terminal.ansiRed']),
      hex(c['terminal.ansiBrightYellow']), hex(c['terminal.ansiBrightGreen']),
    ].map((color) => ({cursor: color, background: color, selection: alpha(color, '3d')})),
  }
}

// ---------------------------------------------------------------------------

function main() {
  const window = readJson5('window.json')
  const baseStyle = buildBaseStyle(window)
  fs.mkdirSync(OUT_DIR, {recursive: true})

  for (const theme of THEMES) {
    const syntaxFile = readJson5(`syntax-${theme.file}.json`)
    const syntax = buildSyntax(syntaxFile.tokenColors, baseStyle['editor.foreground'])
    const style = {...baseStyle, syntax}

    const family = {
      $schema: 'https://zed.dev/schema/themes/v0.2.0.json',
      name: theme.name,
      author: AUTHOR,
      themes: [{name: theme.name, appearance: 'dark', style}],
    }

    const outfile = path.join(OUT_DIR, `pkstheme-${theme.file}.json`)
    fs.writeFileSync(outfile, JSON.stringify(family, null, 2) + '\n')
    console.log(`Saved ${path.relative(__dirname, outfile)}`)
  }
  console.log('Done!')
}

if (require.main === module) main()
