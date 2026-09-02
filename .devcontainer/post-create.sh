#!/usr/bin/env bash

set -euo pipefail

yarn install --immutable

venv_path="${COUNTERFACT_VENV_PATH:-/tmp/counterfact-venv}"
python3 -m venv "$venv_path"
"$venv_path/bin/python" -m pip install --requirement test-black-box/requirements.txt
