---
name: marketplace
description: Use when the user wants to discover, install, enable, disable, update, or uninstall Claude Code plugins; add or manage plugin marketplaces; create a new plugin or skill; publish a plugin to GitHub or the community marketplace; validate a plugin manifest; debug plugin loading; understand plugin.json or marketplace.json structure; or navigate the /plugin UI.
---

# Claude Code Marketplace

## Mission

Act as a Claude Code plugin expert. Help the user with the full plugin lifecycle: discover → install → create → publish. Know every CLI command, every manifest field, every scope, and the complete submission process.

---

## Quick reference

### Session commands (inside Claude Code)

| Command | Effect |
|---------|--------|
| `/plugin` | Interactive UI — tabs: Discover / Installed / Marketplaces / Errors |
| `/plugin marketplace` | Jump directly to Marketplaces tab (alias: `/plugin market`) |
| `/reload-plugins` | Hot-reload all plugins without restarting |

---

## CLI commands

All `claude plugin …` commands also work as `/plugin …` inside a session.

### Install / uninstall

```bash
# Install from a marketplace (default scope: user)
claude plugin install <plugin-name>@<marketplace-name>
claude plugin install <plugin-name>@<marketplace-name> --scope project
claude plugin install <plugin-name>@<marketplace-name> --scope local

# Uninstall
claude plugin uninstall <plugin-name>@<marketplace-name>
claude plugin uninstall <plugin-name>@<marketplace-name> --keep-data  # preserve persistent data
claude plugin uninstall <plugin-name>@<marketplace-name> --prune      # also remove orphaned deps
claude plugin uninstall <plugin-name>@<marketplace-name> -y           # skip confirmation

# Aliases: remove, rm
claude plugin rm <plugin-name>@<marketplace-name>
```

### Enable / disable

```bash
claude plugin enable  <plugin-name>@<marketplace-name>
claude plugin disable <plugin-name>@<marketplace-name>
```

### Update

```bash
claude plugin update <plugin-name>@<marketplace-name>
```

### List and inspect

```bash
# List installed plugins
claude plugin list
claude plugin list --json

# List installed + available from all marketplaces
claude plugin list --available --json

# Show component inventory + projected token cost
claude plugin details <name>@<marketplace>
```

### Prune orphaned dependencies

```bash
claude plugin prune               # dry-run first to see what would be removed
claude plugin prune --dry-run
claude plugin prune -y            # skip confirmation
# Requires Claude Code v2.1.121+
```

### Validate a plugin or marketplace

```bash
# Validate plugin directory
claude plugin validate ./my-plugin
claude plugin validate ./my-plugin --strict   # treat warnings as errors (good for CI)

# Validate marketplace directory
claude plugin validate ./my-marketplace --strict
```

### Tag for release

```bash
# Inside the plugin directory
claude plugin tag              # creates git tag, prints what it would tag
claude plugin tag --push       # create + push to remote
claude plugin tag --dry-run    # preview without creating
claude plugin tag -f           # force even if working tree is dirty
```

---

## Marketplace management

### Add a marketplace

```bash
# GitHub shorthand (most common)
claude plugin marketplace add owner/repo

# Pinned to branch or tag
claude plugin marketplace add owner/repo@v2.0

# Full git URL
claude plugin marketplace add https://gitlab.com/company/plugins.git

# Pinned git URL
claude plugin marketplace add https://gitlab.com/company/plugins.git#v1.0.0

# Direct JSON URL (for custom hosts)
claude plugin marketplace add https://example.com/marketplace.json

# Local path (development)
claude plugin marketplace add ./my-local-marketplace

# Monorepo (only check out specific dirs)
claude plugin marketplace add owner/repo --sparse plugins/team-tools

# With scope (default: user)
claude plugin marketplace add owner/repo --scope project  # team-shared via VCS
claude plugin marketplace add owner/repo --scope local    # personal, gitignored
```

### List, remove, update marketplaces

```bash
claude plugin marketplace list
claude plugin marketplace list --json

claude plugin marketplace remove my-marketplace-name
# Warning: also uninstalls all plugins from that marketplace

claude plugin marketplace update                  # update all non-seed marketplaces
claude plugin marketplace update my-marketplace   # update one
```

---

## Known public marketplaces

| Name | Marketplace ID | Add command |
|------|---------------|-------------|
| Official (Anthropic) | `claude-plugins-official` | Auto-available by default |
| Community | `claude-community` | `claude plugin marketplace add anthropics/claude-plugins-community` |
| Browse all | — | [claude.com/plugins](https://claude.com/plugins) |
| Submit | — | `claude.ai/settings/plugins/submit` |

---

## Installation scopes

| Scope | Settings file | Best for |
|-------|--------------|---------|
| `user` (default) | `~/.claude/settings.json` | Personal tools, all projects |
| `project` | `.claude/settings.json` | Shared with team via version control |
| `local` | `.claude/settings.local.json` | Personal override, gitignored |
| `managed` | Managed settings (org admin only) | Org-wide, read-only for users |

---

## Development workflow

### Test a plugin locally

```bash
# Load plugin for a single session without installing
claude --plugin-dir ./my-plugin

# Load multiple plugins
claude --plugin-dir ./plugin-a --plugin-dir ./plugin-b

# Load from a remote zip
claude --plugin-url https://example.com/my-plugin.zip

# Debug plugin loading events
claude --debug
```

### Hot-reload during development

```text
/reload-plugins
```

No restart required — Claude re-reads all plugin files from disk immediately.

---

## Creating a plugin

### Minimal structure

```
my-plugin/
├── .claude-plugin/
│   └── plugin.json          ← manifest (only this file goes in .claude-plugin/)
├── skills/
│   └── my-skill/
│       └── SKILL.md         ← one or more skills
└── CLAUDE.md                ← NOT loaded as context (ignored by Claude)
                               Use a skill to inject context instead
```

### `plugin.json` — complete schema

```json
{
  "$schema": "https://json.schemastore.org/claude-code-plugin-manifest.json",
  "name": "my-plugin",              // kebab-case; drives namespacing (my-plugin:skill)
  "displayName": "My Plugin",       // shown in UI, not used for namespacing
  "version": "1.0.0",               // semver; omit to auto-version by git SHA
  "description": "What this plugin does",
  "author": {
    "name": "Your Name",
    "email": "you@example.com",     // optional
    "url": "https://github.com/you" // optional
  },
  "homepage": "https://docs.example.com/my-plugin",
  "repository": "https://github.com/you/my-plugin",
  "license": "MIT",
  "keywords": ["keyword1", "keyword2"],
  "category": "productivity",

  // Component paths (all optional; paths relative to plugin root)
  "skills": "./skills/",            // adds to default skills/ directory
  "commands": ["./commands/"],      // replaces default commands/ directory
  "agents": ["./agents/"],
  "hooks": "./config/hooks.json",   // or inline object
  "mcpServers": "./mcp-config.json",
  "lspServers": "./.lsp.json",

  // User-configurable settings
  "userConfig": {
    "api_token": {
      "type": "string",             // string | number | boolean | directory | file
      "title": "API Token",
      "description": "Authentication token",
      "sensitive": true,            // masked in UI, stored in keychain
      "required": false,
      "default": null
    }
  },

  // Plugin dependencies
  "dependencies": [
    "helper-lib",
    { "name": "other-plugin", "version": "~2.1.0" }
  ]
}
```

### SKILL.md — complete frontmatter

```yaml
---
name: my-skill                       # lowercase, hyphens, max 64 chars; defaults to dir name
description: Use when...             # key trigger text; combined with when_to_use, cap 1536 chars
when_to_use: "Also use when..."      # additional trigger context appended to description

argument-hint: "[issue-number]"      # shown in autocomplete hint
arguments: [issue, branch]           # named positional args → $issue, $branch in body

disable-model-invocation: true       # prevent auto-invocation (use for side-effect skills)
user-invocable: false                # hide from / menu (internal skills)

allowed-tools: "Bash(git *) Read"    # tools allowed without approval when skill is active
model: claude-opus-4-7               # override model for this skill's turn
effort: high                         # low | medium | high | xhigh | max

context: fork                        # run in isolated subagent (needs explicit task in body)
agent: Explore                       # subagent type: Explore | Plan | general-purpose | custom

paths: "src/**/*.ts, *.go"           # auto-activate only for matching file paths
shell: bash                          # bash (default) or powershell
---

Skill body here.

# String substitutions available:
# $ARGUMENTS           — all arguments passed on invocation
# $ARGUMENTS[0]        — first argument
# $name                — named argument from `arguments` frontmatter
# ${CLAUDE_SKILL_DIR}  — absolute path to this skill's directory (use for bundled scripts)
# ${CLAUDE_SESSION_ID} — current session ID

# Dynamic preprocessing:
# !`command`           — runs shell command; output injected before Claude sees skill
# ```!
# multi-line
# shell block
# ```
```

### Single-file plugin (no `skills/` directory)

If the plugin root contains only `SKILL.md` (no subdirectory), Claude treats the plugin itself as a single-skill plugin. The plugin `name` becomes the skill name.

---

## Creating a marketplace

### Structure

```
my-marketplace/
└── .claude-plugin/
    └── marketplace.json
```

Or when hosting multiple plugins in one repo:

```
my-org-plugins/
├── .claude-plugin/
│   └── marketplace.json
├── plugins/
│   ├── plugin-a/
│   │   ├── .claude-plugin/
│   │   │   └── plugin.json
│   │   └── skills/a/SKILL.md
│   └── plugin-b/
│       └── ...
```

### `marketplace.json` — complete schema

```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "my-marketplace",           // kebab-case; drives install namespace
  "owner": {
    "name": "Your Name",
    "email": "team@example.com"       // optional
  },
  "description": "What this marketplace contains",
  "version": "1.0.0",                 // optional

  "metadata": {
    "pluginRoot": "./plugins"          // optional base path prepended to relative sources
  },

  "plugins": [
    {
      "name": "plugin-a",              // kebab-case
      "source": "./plugins/plugin-a",  // relative path, GitHub object, git URL, npm, etc.
      "displayName": "Plugin A",
      "description": "...",
      "version": "1.0.0",
      "license": "MIT",
      "category": "productivity",
      "keywords": ["keyword"],
      "homepage": "https://...",
      "repository": "https://..."
    },
    {
      "name": "plugin-b",
      "source": {
        "source": "github",
        "repo": "owner/repo",
        "ref": "v2.0.0",
        "sha": "abc123..."             // pin for security/stability
      }
    }
  ]
}
```

### Plugin source types in `marketplace.json`

| Type | Example |
|------|---------|
| Relative path | `"./plugins/my-plugin"` |
| GitHub | `{ "source": "github", "repo": "owner/repo", "ref": "v2.0", "sha": "abc..." }` |
| Git URL | `{ "source": "url", "url": "https://gitlab.com/team/plugin.git", "ref": "main" }` |
| Git subdirectory | `{ "source": "git-subdir", "url": "...", "path": "tools/plugin", "ref": "main" }` |
| npm package | `{ "source": "npm", "package": "@acme/claude-plugin", "version": "^2.0.0" }` |

---

## Publishing a plugin

### Step-by-step

```bash
# 1. Validate before publishing
claude plugin validate ./my-plugin
claude plugin validate ./my-plugin --strict   # warnings = errors in CI

# 2. Commit and push to GitHub
git add . && git commit -m "feat: release v1.0.0"
git push origin main

# 3. Tag the release
cd my-plugin
claude plugin tag --push   # creates git tag, pushes to remote

# 4. Users install it
claude plugin marketplace add your-github-user/your-repo
claude plugin install my-plugin@your-repo-name
```

### Submit to Anthropic community marketplace

1. Validate: `claude plugin validate ./my-plugin --strict`
2. Push to public GitHub repo
3. Submit at: `claude.ai/settings/plugins/submit` or `platform.claude.com/plugins/submit`
4. Anthropic runs automated safety screening + manual review
5. Approved plugins appear in `anthropics/claude-plugins-community`
6. Auto-update: Anthropic bumps pinned SHA as you push new commits

### Team / org auto-install (no manual install needed)

Add to `.claude/settings.json` in your team repo:

```json
{
  "extraKnownMarketplaces": {
    "company-tools": {
      "source": { "source": "github", "repo": "your-org/claude-plugins" }
    }
  },
  "enabledPlugins": {
    "my-plugin@company-tools": true
  }
}
```

Commit `.claude/settings.json` — every developer who opens the repo gets the plugins automatically.

---

## Versioning strategy

| Goal | How |
|------|-----|
| Rapid internal iteration | Omit `version` in `plugin.json` — Claude uses git SHA, every commit is a new version |
| Stable published releases | Set `"version": "1.2.0"` — users get updates only when you bump this field |
| Pin a specific commit | Set `"sha": "abc123..."` in marketplace entry — ignores all new commits |

Version resolution order (first wins):
1. `version` in `plugin.json`
2. `version` in marketplace entry
3. Git commit SHA of the plugin source
4. `"unknown"` (npm or local non-git)

---

## Debugging

```bash
# Show plugin loading events, manifest errors, registration
claude --debug

# Validate manifest (catches schema errors, missing fields, path issues)
claude plugin validate ./my-plugin

# Hot-reload without restart (inside Claude Code)
/reload-plugins

# Check what's installed and enabled
claude plugin list --json

# Inspect component inventory and token cost
claude plugin details my-plugin@my-marketplace
```

Common issues:

| Symptom | Check |
|---------|-------|
| Skill not appearing in `/` picker | `plugin.json` name matches directory? Plugin enabled? Restart after install. |
| Skill loads but doesn't trigger | `description` has enough trigger keywords? `disable-model-invocation: true`? |
| Plugin installs but no skills show | `skills/` directory exists? SKILL.md has valid frontmatter? `claude plugin validate` |
| `claude plugin enable` fails | Already enabled — this is not an error, just a warning |
| Skills cached after edit | Run `/reload-plugins` or restart Claude Code |
| `CLAUDE.md` in plugin not loaded | Correct — `CLAUDE.md` is ignored in plugins. Move context to a skill body. |

---

## Reserved marketplace names

These names cannot be used by third parties:

`claude-code-marketplace`, `claude-code-plugins`, `claude-plugins-official`, `anthropic-marketplace`, `anthropic-plugins`, `agent-skills`, `anthropic-agent-skills`, `knowledge-work-plugins`, `life-sciences`, `claude-for-legal`, `claude-for-financial-services`, `financial-services-plugins`

---

## Plugin data and paths

| Variable | Path | Use for |
|----------|------|---------|
| `${CLAUDE_SKILL_DIR}` | Absolute path to the current skill's directory | Bundled scripts, templates |
| `${CLAUDE_PLUGIN_ROOT}` | Plugin root directory | Plugin-bundled resources |
| `${CLAUDE_PLUGIN_DATA}` | `~/.claude/plugins/data/{plugin-id}/` | Persistent state across updates |
| Plugin cache | `~/.claude/plugins/cache/` | Auto-managed by Claude Code |

---

## Quality checklist before publishing

- [ ] `claude plugin validate ./my-plugin --strict` passes with no warnings
- [ ] `plugin.json` has `name`, `description`, `author`, `version`, `license`
- [ ] `plugin.json` uses `$schema` field pointing to official schema
- [ ] Skill `description` fields start with "Use when..." and include trigger keywords
- [ ] Skills with side effects have `disable-model-invocation: true`
- [ ] No hard-coded absolute paths — use `${CLAUDE_SKILL_DIR}` instead
- [ ] `CLAUDE.md` removed or understood to be ignored (move content to a skill)
- [ ] `README.md` documents install command and invocation examples
- [ ] MIT or other OSI license declared in `plugin.json` and `LICENSE` file
