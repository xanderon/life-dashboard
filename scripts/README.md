# Script inventory

Scop: documentatie rapida pentru scripturile care ruleaza periodic si unde sunt instalate.

## Inventory (de completat)

| Script | Device | Path repo | Scheduler | Interval | Notes |
| --- | --- | --- | --- | --- | --- |
| termo_alert.mjs | Mac (Xan) | /Users/xan/Documents/Github repos/life-dashboard | launchd | 5m | CMTEB status |
| device_heartbeat.mjs | Mac (Xan) | /Users/xan/Documents/Github repos/life-dashboard | launchd | 30m | heartbeat |
| device_heartbeat.mjs | Laptop fiica | ... | Task Scheduler | 10-20m | heartbeat |
| device_heartbeat.mjs | Desktop fiu | ... | Task Scheduler | 10-20m | heartbeat |
| device_heartbeat.mjs | Mini server | ... | cron/systemd | 10-20m | heartbeat |

## Notes

- Scripturile citesc variabile din `/.env` cand folosesti `node --env-file .env`.
- Evita dublarea joburilor (verifica launchd/cron/Task Scheduler).

## macOS (Xan) - device heartbeat

- Plist: `/Users/xan/Library/LaunchAgents/ro.life-dashboard.device-heartbeat.plist`
- Logs:
  - `/Users/xan/device_heartbeat.log`
  - `/Users/xan/device_heartbeat.err`
- Env (in `/.env`):
  - `DEVICE_SLUG=mac`
  - `DEVICE_NAME=Mac`
  - `DEVICE_DISK=/System/Volumes/Data`
