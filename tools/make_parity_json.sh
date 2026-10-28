#!/usr/bin/env bash
# Decompile every AF/BK in OMF_DATA_DIR to JSON with pyomftools, for parity tests.
# Usage: PYTHON=/path/to/python-with-validx tools/make_parity_json.sh OUT_DIR
set -euo pipefail
shopt -s nullglob nocaseglob
here="$(cd "$(dirname "$0")" && pwd)"
# Absolute paths: the decompilers run from inside the pyomftools checkout.
data="$(realpath "${OMF_DATA_DIR:-$here/../../openomf/build/resources}")"
pyomftools="$(realpath "${PYOMFTOOLS_DIR:-$here/../../pyomftools}")"
out="${1:?usage: $0 OUT_DIR}"
python="${PYTHON:-python3}"
mkdir -p "$out"
out="$(realpath "$out")"
files=("$data"/*.af "$data"/*.bk)
if [ ${#files[@]} -eq 0 ]; then
  echo "no .AF or .BK files in $data" >&2
  exit 1
fi
for f in "${files[@]}"; do
  name="$(basename "$f")"
  case "${name,,}" in
    *.af) mod=af_decompile ;;
    *.bk) mod=bk_decompile ;;
  esac
  (cd "$pyomftools" && "$python" -m "omftools.cli.$mod" "$f" "$out/$name.json")
  echo "$name"
done
