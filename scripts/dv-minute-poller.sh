#!/bin/bash
# Daily Verse durable minute poller (production). Do not set DV_TEST_MODE.
APP=/home/u593240408/morning-bible-verse
NODE=/opt/alt/alt-nodejs22/root/usr/bin/node
cd "$APP" || exit 1
unset DV_TEST_MODE
while true; do
  "$NODE" src/send.js >> data/cron-send.log 2>&1
  sleep 55
done
