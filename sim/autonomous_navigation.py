#!/usr/bin/env python3
"""Patrol a warehouse aisle with Nav2 goals derived from the live SLAM pose."""

import math
import os

import rclpy
from action_msgs.msg import GoalStatus
from geometry_msgs.msg import PoseStamped
from nav2_msgs.action import NavigateToPose
from nvblox_msgs.msg import DistanceMapSlice
from rclpy.action import ActionClient
from rclpy.duration import Duration
from rclpy.executors import ExternalShutdownException
from rclpy.node import Node
from tf2_ros import Buffer, TransformListener


class AutonomousNavigator(Node):
    def __init__(self):
        super().__init__("skillforge_autonomous_navigator")
        self._client = ActionClient(self, NavigateToPose, "navigate_to_pose")
        self._tf_buffer = Buffer()
        self._tf_listener = TransformListener(self._tf_buffer, self)
        self._map_ready = False
        self.create_subscription(
            DistanceMapSlice,
            "/nvblox_node/static_map_slice",
            self._map_callback,
            1,
        )
        self._patrol_distance = float(os.environ.get("PATROL_DISTANCE_METERS", "8.0"))
        self._targets = []
        self._target_index = 0
        self._goal_active = False
        self._retry_timer = None
        self.create_timer(1.0, self._start_when_ready)

    def _map_callback(self, _message):
        self._map_ready = True

    def _start_when_ready(self):
        if self._targets or self._goal_active:
            return
        if not self._client.wait_for_server(timeout_sec=0.0):
            self.get_logger().info("Waiting for Nav2 NavigateToPose action server.")
            return
        if not self._map_ready:
            self.get_logger().info("Waiting for the nvblox LiDAR costmap.")
            return
        if not self._tf_buffer.can_transform(
            "map", "nova_carter", rclpy.time.Time(), timeout=Duration(seconds=0.0)
        ):
            self.get_logger().info("Waiting for Visual SLAM map -> nova_carter transform.")
            return

        transform = self._tf_buffer.lookup_transform(
            "map", "nova_carter", rclpy.time.Time()
        )
        pose = transform.transform
        yaw = math.atan2(
            2.0 * (pose.rotation.w * pose.rotation.z + pose.rotation.x * pose.rotation.y),
            1.0 - 2.0 * (pose.rotation.y ** 2 + pose.rotation.z ** 2),
        )
        # The far target faces back toward home, so Nav2 turns the robot around
        # before it starts the collision-aware return leg.
        self._targets = [
            (pose.translation.x + self._patrol_distance * math.cos(yaw),
             pose.translation.y + self._patrol_distance * math.sin(yaw), yaw + math.pi, "aisle end"),
            (pose.translation.x, pose.translation.y, yaw, "home"),
        ]
        self.get_logger().info(
            f"Starting {self._patrol_distance:.1f} m SLAM patrol through the nvblox LiDAR costmap."
        )
        self._send_next_goal()

    def _send_next_goal(self):
        x, y, yaw, label = self._targets[self._target_index]
        goal = NavigateToPose.Goal()
        goal.pose = PoseStamped()
        goal.pose.header.frame_id = "map"
        goal.pose.header.stamp = self.get_clock().now().to_msg()
        goal.pose.pose.position.x = x
        goal.pose.pose.position.y = y
        goal.pose.pose.orientation.z = math.sin(yaw / 2.0)
        goal.pose.pose.orientation.w = math.cos(yaw / 2.0)
        self._goal_active = True
        self.get_logger().info(f"Navigating to {label}; Nav2 collision monitor remains active.")
        self._client.send_goal_async(goal).add_done_callback(self._goal_response)

    def _retry_later(self):
        if self._retry_timer is None:
            self._retry_timer = self.create_timer(3.0, self._retry_goal)

    def _retry_goal(self):
        self.destroy_timer(self._retry_timer)
        self._retry_timer = None
        self._send_next_goal()

    def _goal_response(self, future):
        goal_handle = future.result()
        if not goal_handle.accepted:
            self._goal_active = False
            self.get_logger().info("Nav2 rejected patrol goal; retrying when ready.")
            self._retry_later()
            return
        self.get_logger().info("Nav2 accepted the autonomous goal.")
        goal_handle.get_result_async().add_done_callback(self._goal_result)

    def _goal_result(self, future):
        status = future.result().status
        self._goal_active = False
        if status == GoalStatus.STATUS_SUCCEEDED:
            self._target_index = (self._target_index + 1) % len(self._targets)
            self.get_logger().info("Patrol goal complete; turning around for the next leg.")
            self._send_next_goal()
        else:
            self.get_logger().warning(f"Patrol goal ended with Nav2 status {status}; retrying shortly.")
            self._retry_later()


def main():
    rclpy.init()
    navigator = AutonomousNavigator()
    try:
        rclpy.spin(navigator)
    except (KeyboardInterrupt, ExternalShutdownException):
        pass
    finally:
        navigator.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == "__main__":
    main()
