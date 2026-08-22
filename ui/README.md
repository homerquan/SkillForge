# SkillForge UI

The UI talks to the local bridge over HTTP and receives perception summaries and rule alerts through server-sent events. The browser never connects to the OpenClaw gateway or MongoDB directly.

## Run

```bash
cd ui
npm run bridge
VITE_SKILLFORGE_BRIDGE_URL=http://127.0.0.1:8787 \
VITE_CAMERA_URL='http://10.0.0.167:8080/snapshot?topic=/front_stereo_camera/left/image_raw' \
npm run dev
```

In a ROS-sourced terminal with Nav2 active, run the task executor:

```bash
python3 sim/skillforge_task_bridge.py
```

`skillforge_task_bridge.py` accepts `navigate_to`, `explore_area`, `search_for`, `inspect`, `detect_failure`, `record_finding`, `return_home`, and `stop_task` from `/skillforge/tasks`. It sends the perception/inspection intents to `/task/explore`, `/task/search`, `/task/inspect`, `/inspection/analyze`, and `/inspection/results`; Nav2 executes navigation and return-home. Update its `LOCATIONS` mapping with surveyed Isaac Sim map coordinates before operating the robot.

## MongoDB Rules

The bridge reads the `robot_rules` collection from `MONGODB_URI`, defaulting to `mongodb://127.0.0.1:27017/skillforge`. Rule documents can match detections through `object` or `tags`, and show an alert when `alert: true` or `action: "alarm"` is present:

```javascript
db.robot_rules.insertOne({
  object: "colorful_box",
  alert: true,
  message: "Colorful box detected: activate the warehouse alarm."
})
```

The bridge checks `/perception/detections` every 30 seconds, updates the UI scene summary, and retrieves matching safety rules before emitting an alert.
