#!/usr/bin/env python3
"""Send a forward warehouse goal once Visual SLAM and Nav2 are ready."""

import math

import rclpy
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
        self._goal_sent = False
        self.create_timer(1.0, self._start_when_ready)

    def _map_callback(self, _message):
        self._map_ready = True

    def _start_when_ready(self):
        if self._goal_sent:
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

        goal = NavigateToPose.Goal()
        goal.pose = PoseStamped()
        goal.pose.header.frame_id = "map"
        goal.pose.header.stamp = self.get_clock().now().to_msg()
        transform = self._tf_buffer.lookup_transform(
            "map", "nova_carter", rclpy.time.Time()
        )
        pose = transform.transform
        yaw = math.atan2(
            2.0 * (pose.rotation.w * pose.rotation.z + pose.rotation.x * pose.rotation.y),
            1.0 - 2.0 * (pose.rotation.y ** 2 + pose.rotation.z ** 2),
        )
        # Plan from the live SLAM pose rather than an assumed map origin.
        goal.pose.pose.position.x = pose.translation.x + 8.0 * math.cos(yaw)
        goal.pose.pose.position.y = pose.translation.y + 8.0 * math.sin(yaw)
        goal.pose.pose.orientation.z = math.sin(yaw / 2.0)
        goal.pose.pose.orientation.w = math.cos(yaw / 2.0)
        self._goal_sent = True
        self.get_logger().info("Sending 8 m forward goal through the nvblox LiDAR costmap.")
        self._client.send_goal_async(goal).add_done_callback(self._goal_response)

    def _goal_response(self, future):
        goal_handle = future.result()
        if not goal_handle.accepted:
            self._goal_sent = False
            self.get_logger().info("Nav2 is not active yet; retrying the autonomous goal.")
            return
        self.get_logger().info("Nav2 accepted the autonomous goal.")
        goal_handle.get_result_async().add_done_callback(self._goal_result)

    def _goal_result(self, future):
        status = future.result().status
        self.get_logger().info(f"Autonomous goal completed with Nav2 status {status}.")


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
