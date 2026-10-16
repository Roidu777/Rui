#!/usr/bin/env bash
# Construit dist/warwick-wallpaper.zip : uniquement les fichiers utiles à l'exécution.
#   index.html, project.json, preview.jpg, README.md, js/*.js, fonts/, et les scripts de lib/
#   réellement chargés par index.html. Exclus : dev/, dist/, CONTRACT.md, fichiers cachés.
# Usage : bash dev/package.sh      (lancer dev/preview.js avant pour rafraîchir preview.jpg)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAME="warwick-wallpaper"
OUT="$ROOT/dist/$NAME.zip"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/ww-pack.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT
cd "$ROOT"

fail() { echo "ERREUR : $*" >&2; exit 1; }

# --- vérifications ------------------------------------------------------------
for f in index.html project.json preview.jpg README.md js/main.js js/wallpaper.js; do
  [ -s "$f" ] || fail "fichier manquant ou vide : $f"
done

if command -v node >/dev/null 2>&1; then
  node - <<'NODE' || exit 1
const fs = require('fs');
const fail = m => { console.error('ERREUR : ' + m); process.exit(1); };
let pj;
try { pj = JSON.parse(fs.readFileSync('project.json', 'utf8')); } catch (e) { fail('project.json invalide : ' + e.message); }
if (pj.type !== 'web' || pj.file !== 'index.html') fail('project.json : type/file attendus « web » / « index.html »');
if (!fs.existsSync(pj.preview)) fail('aperçu introuvable : ' + pj.preview);
const props = (pj.general && pj.general.properties) || {};
const m = /DEFAULT_PROPS\s*=\s*\{([\s\S]*?)\};/.exec(fs.readFileSync('js/main.js', 'utf8'));
if (!m) fail('DEFAULT_PROPS introuvable dans js/main.js');
const keys = [...m[1].matchAll(/(\w+)\s*:/g)].map(x => x[1]);
const missing = keys.filter(k => !props[k]);
if (missing.length) fail('propriétés absentes de project.json : ' + missing.join(', '));
const sz = fs.statSync(pj.preview).size;
if (sz > 1024 * 1024) fail('preview.jpg dépasse 1 Mo (' + sz + ' octets)');
console.log('project.json : ' + Object.keys(props).length + ' propriétés, clés conformes à main.js, aperçu ' + Math.round(sz / 1024) + ' Ko');
NODE
fi

# --- liste des fichiers -------------------------------------------------------
FILES=(index.html project.json preview.jpg README.md)
while IFS= read -r f; do FILES+=("$f"); done < <(ls js/*.js)
while IFS= read -r f; do FILES+=("$f"); done < <(ls fonts/* 2>/dev/null || true)
# scripts de lib/ référencés par index.html (dans l'ordre de chargement)
while IFS= read -r f; do
  [ -f "$f" ] || fail "index.html référence $f, introuvable"
  FILES+=("$f")
done < <(grep -oE 'src="lib/[^"]+"' index.html | sed -E 's/^src="(.*)"$/\1/')

mkdir -p "$STAGE/$NAME"
for f in "${FILES[@]}"; do
  mkdir -p "$STAGE/$NAME/$(dirname "$f")"
  cp "$f" "$STAGE/$NAME/$f"
done

# --- archive ------------------------------------------------------------------
mkdir -p "$ROOT/dist"
rm -f "$OUT"
if command -v zip >/dev/null 2>&1; then
  (cd "$STAGE" && zip -qr -9 -X "$OUT" "$NAME")
elif command -v python3 >/dev/null 2>&1; then
  python3 -I -c 'import shutil,sys; shutil.make_archive(sys.argv[1][:-4], "zip", sys.argv[2], sys.argv[3])' "$OUT" "$STAGE" "$NAME"
else
  fail "ni zip ni python3 disponibles pour créer l'archive"
fi

echo "Paquet : $OUT ($(du -h "$OUT" | cut -f1), ${#FILES[@]} fichiers)"
for f in "${FILES[@]}"; do printf '  %s\n' "$f"; done
