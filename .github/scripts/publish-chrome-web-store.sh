#!/usr/bin/env bash

set -euo pipefail

: "${ACCESS_TOKEN:?ACCESS_TOKEN is required}"
: "${CHROME_WEB_STORE_PUBLISHER_ID:?CHROME_WEB_STORE_PUBLISHER_ID is required}"
: "${CHROME_WEB_STORE_EXTENSION_ID:?CHROME_WEB_STORE_EXTENSION_ID is required}"
: "${EXPECTED_VERSION:?EXPECTED_VERSION is required}"
: "${PACKAGE_PATH:?PACKAGE_PATH is required}"

if [[ ! -f "$PACKAGE_PATH" ]]; then
  echo "Extension package not found: $PACKAGE_PATH" >&2
  exit 1
fi

package_version="$(unzip -p "$PACKAGE_PATH" manifest.json | jq -er '.version')"
if [[ "$package_version" != "$EXPECTED_VERSION" ]]; then
  echo "Package version $package_version does not match expected version $EXPECTED_VERSION" >&2
  exit 1
fi

item_name="publishers/${CHROME_WEB_STORE_PUBLISHER_ID}/items/${CHROME_WEB_STORE_EXTENSION_ID}"
api_url="https://chromewebstore.googleapis.com/v2/${item_name}"
upload_url="https://chromewebstore.googleapis.com/upload/v2/${item_name}:upload"

request() {
  local response
  if ! response="$(curl --fail-with-body --silent --show-error "$@")"; then
    if [[ -n "$response" ]]; then
      echo "$response" >&2
    fi
    return 1
  fi
  printf '%s' "$response"
}

fetch_status() {
  request \
    --header "Authorization: Bearer $ACCESS_TOKEN" \
    "${api_url}:fetchStatus"
}

status_response="$(fetch_status)"

if [[ "$(jq -r '.takenDown // false' <<< "$status_response")" == "true" ]]; then
  echo "Chrome Web Store item is taken down; resolve the policy issue in the dashboard first" >&2
  exit 1
fi

already_published="$(
  jq -r --arg version "$EXPECTED_VERSION" '
    [
      .publishedItemRevisionStatus.distributionChannels[]?.crxVersion,
      .submittedItemRevisionStatus.distributionChannels[]?.crxVersion
    ] | any(. == $version)
  ' <<< "$status_response"
)"

if [[ "$already_published" == "true" ]]; then
  echo "Chrome Web Store already has version $EXPECTED_VERSION published or under review"
  exit 0
fi

echo "Uploading Chrome Web Store version $EXPECTED_VERSION"
upload_response="$(
  request \
    --request POST \
    --header "Authorization: Bearer $ACCESS_TOKEN" \
    --header "Content-Type: application/zip" \
    --upload-file "$PACKAGE_PATH" \
    "$upload_url"
)"
echo "$upload_response" | jq .

upload_state="$(jq -er '.uploadState' <<< "$upload_response")"
if [[ "$upload_state" == "IN_PROGRESS" ]]; then
  for attempt in {1..30}; do
    sleep 2
    status_response="$(fetch_status)"
    upload_state="$(jq -r '.lastAsyncUploadState // "IN_PROGRESS"' <<< "$status_response")"
    [[ "$upload_state" != "IN_PROGRESS" ]] && break
    echo "Upload is still processing (attempt $attempt/30)"
  done
fi

if [[ "$upload_state" != "SUCCEEDED" ]]; then
  echo "Chrome Web Store upload did not succeed: $upload_state" >&2
  exit 1
fi

echo "Submitting Chrome Web Store version $EXPECTED_VERSION for review"
publish_response="$(
  request \
    --request POST \
    --header "Authorization: Bearer $ACCESS_TOKEN" \
    --header "Content-Type: application/json" \
    --data '{"publishType":"DEFAULT_PUBLISH","blockOnWarnings":true}' \
    "${api_url}:publish"
)"
echo "$publish_response" | jq .

publish_state="$(jq -er '.state' <<< "$publish_response")"
case "$publish_state" in
  PENDING_REVIEW|STAGED|PUBLISHED|PUBLISHED_TO_TESTERS)
    echo "Chrome Web Store accepted version $EXPECTED_VERSION with state $publish_state"
    ;;
  *)
    echo "Unexpected Chrome Web Store publish state: $publish_state" >&2
    exit 1
    ;;
esac
