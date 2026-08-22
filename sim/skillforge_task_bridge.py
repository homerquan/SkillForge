#!/usr/bin/env python3
"""Execute validated high-level SkillForge tasks received from OpenClaw."""

import json
import math

import rclpy
from geometry_msgs.msg import PoseStamped
from nav2_msgs.action import NavigateToPose
from rclpy.action import ActionClient
from rclpy.node import Node
from std_msgs.msg import String


# Replace these map-frame coordinates with surveyed scene locations as needed.
LOCATIONS = {"home": (0.0, 0.0), "table": (3.0, 0.0), "warehouse": (6.0, 0.0)}


class SkillForgeTaskBridge(Node):
    def __init__(self):
        super().__init__("skillforge_task_bridge")
        self._navigation = ActionClient(self, NavigateToPose, "navigate_to_pose")
        self._active_goal = None
        self._explore = self.create_publisher(String, "/task/explore", 10)
        self._search = self.create_publisher(String, "/task/search", 10)
        self._inspect = self.create_publisher(String, "/task/inspect", 10)
        self._analyze = self.create_publisher(String, "/inspection/analyze", 10)
        self._findings = self.create_publisher(String, "/inspection/results", 10)
        self.create_subscription(String, "/skillforge/tasks", self._handle_task, 10)
        self.get_logger().info("Ready for validated OpenClaw tasks on /skillforge/tasks")

    def _handle_task(self, message):
        try:
            task = json.loads(message.data)
            name = task["name"]
            args = task.get("args", {})
        except (json.JSONDecodeError, KeyError, TypeError) as error:
            self.get_logger().warning(f"Ignoring malformed task: {error}")
            return

        if name == "stop_task":
            self._cancel_active_goal()
        elif name == "navigate_to":
            self._navigate(args.get("location"))
        elif name == "explore_area":
            self._publish_intent(self._explore, args)
            self._navigate(args.get("area"))
        elif name == "search_for":
            self._publish_intent(self._search, args)
        elif name == "inspect":
            self._publish_intent(self._inspect, args)
        elif name == "detect_failure":
            self._publish_intent(self._analyze, args)
        elif name == "record_finding":
            self._publish_intent(self._findings, args)
        elif name == "return_home":
            self._navigate("home")
        else:
            self.get_logger().warning(f"Ignoring unsupported task: {name}")

    def _publish_intent(self, publisher, args):
        message = String()
        message.data = json.dumps(args)
        publisher.publish(message)
        self.get_logger().info(f"Published semantic task intent: {message.data}")

    def _navigate(self, location):
        if not isinstance(location, str) or location not in LOCATIONS:
            self.get_logger().warning(f"Unknown navigation location: {location}")
            return
        if not self._navigation.wait_for_server(timeout_sec=1.0):
            self.get_logger().warning("Nav2 action server is unavailable")
            return
        x, y = LOCATIONS[location]
        goal = NavigateToPose.Goal()
        goal.pose = PoseStamped()
        goal.pose.header.frame_id = "map"
        goal.pose.header.stamp = self.get_clock().now().to_msg()
        goal.pose.pose.position.x = x
        goal.pose.pose.position.y = y
        goal.pose.pose.orientation.w = math.cos(0.0)
        self._cancel_active_goal()
        self._navigation.send_goal_async(goal).add_done_callback(self._goal_response)
        self.get_logger().info(f"Navigating to {location}: x={x}, y={y}")

    def _goal_response(self, future):
        goal_handle = future.result()
        if not goal_handle.accepted:
            self.get_logger().warning("Nav2 rejected task goal")
            return
        self._active_goal = goal_handle
        goal_handle.get_result_async().add_done_callback(self._goal_complete)

    def _goal_complete(self, future):
        self._active_goal = None
        self.get_logger().info(f"Task navigation completed with status {future.result().status}")

    def _cancel_active_goal(self):
        if self._active_goal is not None:
            self._active_goal.cancel_goal_async()
            self._active_goal = None
            self.get_logger().info("Cancelled active navigation goal")


def main():
    rclpy.init()
    node = SkillForgeTaskBridge()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
