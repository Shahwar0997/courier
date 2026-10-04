#!/bin/sh
# Compiles Courier firmware for the Freenove FNK0053 kit with arduino-cli (esp32:esp32@3.3.12,
# board esp32wrover, partitions min_spiffs: two 1.9 MB app slots for over-the-air updates, Stop 17).
# Compiles only; flashing needs the kit.
#   ./build-esp32.sh <main.cpp> [arduino-cli options]
set -eu
here=$(cd "$(dirname "$0")" && pwd)
main=$1; shift
out=$(mktemp -d)/courier_fw
mkdir -p "$out"
cp "$main" "$out/main.cpp"
cp "$here/courier_kit.h" "$here/courier_pins.h" "$here/courier_hal.cpp" "$here/../../firmware/courier.h" "$out/"
# The firmware's other files next to main.cpp: its own headers and sources (e.g. Stop 20's model.h),
# the robots' update key courier_key.h (Stop 17) and courier_config.h (Stop 18's broker and name).
for f in "$(dirname "$main")"/*.h "$(dirname "$main")"/*.hpp "$(dirname "$main")"/*.c "$(dirname "$main")"/*.cpp; do
  # not the entry file itself (it's main.cpp already), and nothing else that would replace it
  b=$(basename "$f")
  [ -f "$f" ] && [ "$b" != "$(basename "$main")" ] && [ "$b" != "main.cpp" ] && cp "$f" "$out/"
done
# ArduinoJson (Stop 6): the same release the simulator has, unmodified, next to the sketch.
if grep -q 'ArduinoJson' "$main"; then cp "$here/../../firmware/ArduinoJson-v7.4.3.h" "$out/ArduinoJson.h"; fi
printf '// Courier firmware: the code is in main.cpp; this file only names the sketch.\n' > "$out/courier_fw.ino"
# Updates, downloads and MQTT (Stops 17–18) bring Wi-Fi, HTTP, MQTT and libsodium: only for firmware that uses them.
flags=""
if grep -qE '(ota|net|mqtt)::' "$main"; then flags="-DCOURIER_WITH_NET"; fi
arduino-cli compile --fqbn esp32:esp32:esp32wrover:PartitionScheme=min_spiffs \
  --build-property "compiler.cpp.extra_flags=$flags" "$out" "$@"
