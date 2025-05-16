#!/bin/bash

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "${SCRIPT_DIR}/.."

echo "==================================="
echo "Running OLED Care modernization tests"
echo "==================================="

gjs --module tests/run-tests.js

exit_code=$?

echo ""
echo "==================================="
if [ $exit_code -eq 0 ]; then
    echo "All tests passed!"
else
    echo "Some tests failed!"
fi
echo "==================================="

exit $exit_code 