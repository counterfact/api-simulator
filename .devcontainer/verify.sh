#!/usr/bin/env bash

set -euo pipefail

yarn install --immutable
yarn build
yarn test:boundaries
yarn check:boundaries
yarn lint
yarn typecheck
yarn test:packed-consumer
yarn test:package-closures
yarn test --runInBand --forceExit --verbose --no-watchman

venv_path="${COUNTERFACT_VENV_PATH:-/tmp/counterfact-venv}"
if [[ ! -x "$venv_path/bin/python" ]]; then
  python3 -m venv "$venv_path"
fi
"$venv_path/bin/python" -m pip install --requirement test-black-box/requirements.txt
PATH="$venv_path/bin:$PATH" yarn test:black-box
yarn build
yarn test:tsd
