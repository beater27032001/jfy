#!/bin/bash
# Instala o jfy: confere dependências, coloca o comando no PATH e liga o /pipeline no ~/.claude.
# Pode rodar de novo quando quiser (depois de um git pull, por exemplo).
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
ok() { printf '\033[32m✓\033[0m %s\n' "$1"; }
aviso() { printf '\033[33m!\033[0m %s\n' "$1"; }
erro() { printf '\033[31m✗\033[0m %s\n' "$1"; exit 1; }

[ "$(uname)" = Darwin ] || erro "O jfy foi feito para macOS."
[ -x /usr/bin/python3 ] && /usr/bin/python3 -c 'import ssl' 2>/dev/null || erro "Falta o Python do macOS. Rode: xcode-select --install"
ok "python3 do macOS"

command -v claude >/dev/null || erro "Falta o Claude Code. Instale: https://docs.claude.com/claude-code"
ok "Claude Code"

if ! command -v tmux >/dev/null; then
  command -v brew >/dev/null || erro "Falta o tmux e o Homebrew. Instale o Homebrew (https://brew.sh) e rode de novo."
  brew install tmux
fi
ok "tmux"

# notificação clicável: o clique leva para a aba do Claude, abre a chamada ou o email (sem ele, a do osascript, que não faz nada no clique)
if ! command -v terminal-notifier >/dev/null; then
  if command -v brew >/dev/null; then brew install terminal-notifier; else echo "  (sem Homebrew: notificações sem clique)"; fi
fi
command -v terminal-notifier >/dev/null && ok "terminal-notifier"

# comando jfy no PATH
for BIN in /opt/homebrew/bin /usr/local/bin "$HOME/.local/bin"; do
  [ -d "$BIN" ] && [ -w "$BIN" ] && break
done
mkdir -p "$BIN"
chmod +x "$DIR/jfy"
ln -sf "$DIR/jfy" "$BIN/jfy"
ok "comando jfy em $BIN"
case ":$PATH:" in *":$BIN:"*) ;; *) aviso "$BIN não está no PATH. Adicione ao ~/.zshrc: export PATH=\"$BIN:\$PATH\"";; esac

# /pipeline, agentes e hooks: do repo oficial da pipeline, por symlink, então atualizar o repo já atualiza.
# Não sobrescreve arquivo seu.
PIPE="$HOME/.jfy/pipeline-Claude"
if [ -d "$PIPE/.git" ]; then
  git -C "$PIPE" pull -q --ff-only || aviso "não consegui atualizar $PIPE, segui com a versão atual"
else
  git clone -q https://github.com/Carloscavalcante97/pipeline-Claude.git "$PIPE" || erro "Não consegui clonar a pipeline"
fi
ligar() {  # ligar <arquivo do repo> <destino em ~/.claude>
  mkdir -p "$(dirname "$2")"
  if [ -L "$2" ] || [ ! -e "$2" ] || cmp -s "$1" "$2"; then
    ln -sf "$1" "$2"
  else
    aviso "${2/#$HOME/~} já existe e é diferente da pipeline oficial, mantive o seu"
  fi
}
ligar "$PIPE/pipeline.md" "$HOME/.claude/commands/pipeline.md"
for f in "$PIPE"/agents/*.md; do ligar "$f" "$HOME/.claude/agents/$(basename "$f")"; done
for f in "$PIPE"/hooks/*.sh; do ligar "$f" "$HOME/.claude/hooks/pipeline/$(basename "$f")"; done
ok "/pipeline, agentes e hooks em ~/.claude (de github.com/Carloscavalcante97/pipeline-Claude)"

# MCP do Journify
if /usr/bin/python3 -c "import json,os,sys; sys.exit(0 if json.load(open(os.path.expanduser('~/.claude.json'))).get('mcpServers',{}).get('journify') else 1)" 2>/dev/null; then
  ok "MCP do Journify"
else
  aviso "Falta o MCP do Journify. Rode (com o SEU token):"
  echo '  claude mcp add --transport http journify https://journify.souv.tech/api/mcp/journify/mcp \'
  echo '    --header "Authorization: Bearer SEU_TOKEN" --scope user'
fi

# fonte JFY Mono: Maple Mono + ícones em pixel art dos temas (fonte/icones.txt)
mkdir -p "$HOME/Library/Fonts"
cp "$DIR/fonte/JFYMono.ttf" "$HOME/Library/Fonts/JFYMono.ttf"
ok "fonte JFY Mono: escolha \"JFY Mono\" no seu terminal e reinicie ele (os temas, menos o Padrão, usam os ícones dela)"

# barra de uso da IA: o statusline do Claude Code passa a gravar uma cópia do que recebe em ~/.jfy/claude-status.json
# e os hooks Stop/Notification avisam no macOS quando o Claude responde ou pede permissão (jfy --avisar)
mkdir -p "$HOME/.jfy"
/usr/bin/python3 - "$DIR/jfy" <<'EOF'
import json, os, sys
p = os.path.expanduser("~/.claude/settings.json")
s = json.load(open(p)) if os.path.exists(p) else {}
sl = s.get("statusLine") or {"type": "command", "command": "cat >/dev/null"}
if "claude-status.json" not in sl.get("command", ""):
    sl["command"] = "tee ~/.jfy/claude-status.json | " + sl["command"]
    s["statusLine"] = sl
cmd, hooks = sys.argv[1] + " --avisar", s.setdefault("hooks", {})
for ev, grupo in (("Stop", {}), ("Notification", {"matcher": "permission_prompt|elicitation_dialog"})):
    if not any("jfy --avisar" in h.get("command", "") for g in hooks.get(ev, []) for h in g.get("hooks", [])):
        hooks.setdefault(ev, []).append(dict(grupo, hooks=[{"type": "command", "command": cmd}]))
    json.dump(s, open(p, "w"), indent=2, ensure_ascii=False)
EOF
ok "uso da IA na barra do jfy e aviso do Claude no macOS (statusLine e hooks do ~/.claude/settings.json)"

# notificação do dia (reuniões + tasks no foco) às 7h, de segunda a sexta
PLIST="$HOME/Library/LaunchAgents/jfy.dia.plist"
DIAS=""; for d in 1 2 3 4 5; do DIAS="$DIAS<dict><key>Weekday</key><integer>$d</integer><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>"; done
mkdir -p "$(dirname "$PLIST")"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>jfy.dia</string>
  <key>ProgramArguments</key><array><string>$DIR/jfy</string><string>--notificar</string></array>
  <key>StartCalendarInterval</key><array>$DIAS</array>
</dict></plist>
EOF
launchctl bootout "gui/$(id -u)/jfy.dia" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST" && ok "notificação do dia às 7h (seg a sex)"

"$DIR/jfy" --selftest >/dev/null && ok "autoteste"
echo
echo "Pronto. Rode: jfy"
