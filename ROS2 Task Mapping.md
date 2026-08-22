# High-Level ROS2 Task Mapping

## Goal

Expose ROS2 capabilities as **task-level actions** that an AI agent can use directly.

Example human instruction:

> Find the failing boxes in this warehouse.

OpenClaw should not generate `move_forward()` or raw `/cmd_vel` commands. It should generate semantic robot tasks.

## High-Level Actions

| AI Action | ROS2 Capability |
|---|---|
| `explore_area(area)` | Navigate/explore the specified warehouse zone |
| `search_for(object_type)` | Run perception while navigating |
| `inspect(object_id)` | Move to an observation pose and inspect the object |
| `detect_failure(object_id)` | Run visual/anomaly detection |
| `record_finding(object_id, result)` | Publish/store inspection result |
| `navigate_to(location)` | Send Nav2 navigation goal |
| `return_home()` | Navigate back to starting/docking location |
| `stop_task()` | Cancel active ROS2 actions |

## Example

Human:

> Find the failing boxes in this warehouse.

OpenClaw:

```json
{
  "task": "find_failing_boxes",
  "actions": [
    {
      "action": "explore_area",
      "area": "warehouse"
    },
    {
      "action": "search_for",
      "object_type": "box"
    },
    {
      "action": "inspect",
      "target": "detected_boxes"
    },
    {
      "action": "detect_failure",
      "target": "detected_boxes"
    },
    {
      "action": "record_finding",
      "condition": "failure_detected"
    }
  ]
}
```

## ROS2 Mapping

```text
explore_area()
      ↓
Nav2 / exploration node

search_for()
      ↓
Camera + object detection node

inspect()
      ↓
Nav2 goal → inspection viewpoint

detect_failure()
      ↓
Vision / anomaly detection service

record_finding()
      ↓
ROS2 inspection result topic
```

Example ROS2 interfaces:

```text
/task/explore
/task/search
/task/inspect
/perception/detections
/inspection/analyze
/inspection/results
/navigate_to_pose
```

## Design Principle

The AI controls **intent**, not motors:

```text
Human
  ↓
"Find the failing boxes"
  ↓
OpenClaw
  ↓
Semantic ROS2 Tasks
  ↓
Navigation + SLAM + Perception
  ↓
Robot
```

For the hackathon, implement only **4–5 semantic actions** and let ROS2 handle navigation, SLAM, sensing, and low-level control internally.