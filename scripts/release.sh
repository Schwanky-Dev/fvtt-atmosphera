#!/bin/bash
# Atmosphera release script — ensures version consistency
set -e

VERSION="$1"
if [ -z "$VERSION" ]; then
  echo "Usage: ./scripts/release.sh 0.3.0"
  exit 1
fi

TAG="v${VERSION}"
ZIP="atmosphera-${TAG}.zip"
MODULE="module.json"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="/tmp/atmosphera-build"

cd "$REPO_ROOT"

echo "=== Releasing Atmosphera ${TAG} ==="

# 1. Update module.json version and download URL
echo "[1/7] Updating module.json..."
sed -i "s/\"version\": \".*\"/\"version\": \"${VERSION}\"/" "$MODULE"
sed -i "s|\"download\": \".*\"|\"download\": \"https://github.com/Schwanky-Dev/fvtt-atmosphera/releases/download/${TAG}/${ZIP}\"|" "$MODULE"

# 2. Verify module.json is valid JSON and URLs match
echo "[2/7] Verifying module.json..."
python3 -c "
import json, sys
with open('module.json') as f:
    d = json.load(f)
v = d['version']
dl = d['download']
expected_dl = f'https://github.com/Schwanky-Dev/fvtt-atmosphera/releases/download/v{v}/atmosphera-v{v}.zip'
assert v == '${VERSION}', f'Version mismatch: {v} != ${VERSION}'
assert dl == expected_dl, f'Download URL mismatch:\n  got:    {dl}\n  expect: {expected_dl}'
print(f'  version: {v} ✓')
print(f'  download: {dl} ✓')
"

# 3. Syntax check main.js
echo "[3/7] Syntax checking main.js..."
node -c scripts/main.js
echo "  syntax OK ✓"

# 4. Git commit and push
echo "[4/7] Committing and pushing..."
git add -A
git commit -m "release: ${TAG}" || echo "  (nothing to commit)"
git push

# 5. Build zip
echo "[5/7] Building zip..."
rm -rf "${BUILD_DIR}/atmosphera"
mkdir -p "${BUILD_DIR}/atmosphera"
cp -r module.json scripts styles README.md LICENSE docker-compose.yml .env.example "${BUILD_DIR}/atmosphera/"
cd "$BUILD_DIR"
rm -f "$ZIP"
zip -r "$ZIP" atmosphera/
echo "  ${ZIP} ($(du -h "$ZIP" | cut -f1)) ✓"

# 6. Delete old release if exists, create new
echo "[6/7] Creating GitHub release..."
cd "$REPO_ROOT"
gh release delete "$TAG" --yes 2>/dev/null || true
gh release create "$TAG" "${BUILD_DIR}/${ZIP}" module.json --title "$TAG" --notes "Release ${TAG}"

# 7. Verify the release
echo "[7/7] Verifying release..."
sleep 2
REMOTE_VERSION=$(curl -sL "https://github.com/Schwanky-Dev/fvtt-atmosphera/releases/latest/download/module.json" | python3 -c "import json,sys; print(json.load(sys.stdin)['version'])")
REMOTE_DL=$(curl -sL "https://github.com/Schwanky-Dev/fvtt-atmosphera/releases/latest/download/module.json" | python3 -c "import json,sys; print(json.load(sys.stdin)['download'])")

if [ "$REMOTE_VERSION" != "$VERSION" ]; then
  echo "  ⚠️  WARNING: Remote version is ${REMOTE_VERSION}, expected ${VERSION}"
  exit 1
fi

# Verify zip downloads
HTTP_CODE=$(curl -sI -L "https://github.com/Schwanky-Dev/fvtt-atmosphera/releases/download/${TAG}/${ZIP}" | grep "HTTP/" | tail -1 | awk '{print $2}')
if [ "$HTTP_CODE" != "200" ]; then
  echo "  ⚠️  WARNING: Zip download returned HTTP ${HTTP_CODE}"
  exit 1
fi

echo ""
echo "=== ✅ Atmosphera ${TAG} released successfully ==="
echo "Manifest: https://github.com/Schwanky-Dev/fvtt-atmosphera/releases/latest/download/module.json"
