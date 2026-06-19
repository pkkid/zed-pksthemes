# PKsThemes for Zed

Zed port of [PKsThemes](https://github.com/pkkid/vscode-pksthemes), a set of personal syntax
themes (RIT, Dracula, Gruvbox, Monokai, OneDark Pro) sharing one consistent editor/UI chrome.

## Installation

1. Open Zed
2. `Cmd+Shift+P` / `Ctrl+Shift+P` → `zed: extensions`
3. Search for "PKsThemes" and install

Or as a dev extension while developing locally:
1. `Cmd+Shift+P` / `Ctrl+Shift+P` → `zed: install dev extension`
2. Select this directory
3. `Cmd+K Cmd+T` / `Ctrl+K Ctrl+T` to pick a theme

## Development

The theme JSON files in `themes/` are generated from the VSCode source of truth in the sibling
[`vscode-pksthemes`](https://github.com/pkkid/vscode-pksthemes) repo (`window.json` for the shared
UI palette, `syntax-*.json` for each theme's TextMate scope colors).

After editing the VSCode source, regenerate the Zed themes with:

```bash
node build.js
```

`build.js` resolves each VSCode TextMate scope against a table of representative scopes for Zed's
tree-sitter-based syntax keys (`comment`, `string`, `keyword`, `function`, etc.) using standard
TextMate specificity rules, since Zed has no native concept of TextMate scopes.

For quick local testing without the dev-extension flow, copy the built themes straight into Zed's
user themes directory (which Zed watches and auto-reloads on change, no restart needed):

```bash
./install.sh
```

## Credits
Special thanks to Pavel Pertsev, the creator of the original gruvbox theme, and to jdinhify for
the VSCode editor theme colors that PKsThemes was originally based on.
