"""Visual SLAM configuration for Isaac Sim 6's Carter warehouse sample."""

from launch import LaunchDescription
from launch_ros.actions import ComposableNodeContainer, Node
from launch_ros.descriptions import ComposableNode


def generate_launch_description():
    visual_slam = ComposableNode(
        name="visual_slam_node",
        package="isaac_ros_visual_slam",
        plugin="nvidia::isaac_ros::visual_slam::VisualSlamNode",
        parameters=[
            {
                "use_sim_time": True,
                "rectified_images": True,
                "enable_image_denoising": False,
                "enable_slam_visualization": True,
                "enable_observations_view": True,
                "enable_landmarks_view": True,
                "base_frame": "front_stereo_camera_left_optical",
                "camera_optical_frames": [
                    "front_stereo_camera_left_optical",
                    "front_stereo_camera_right_optical",
                ],
            }
        ],
        remappings=[
            ("visual_slam/image_0", "/front_stereo_camera/left/image_raw"),
            ("visual_slam/camera_info_0", "/front_stereo_camera/left/camera_info"),
            ("visual_slam/image_1", "/front_stereo_camera/right/image_raw"),
            ("visual_slam/camera_info_1", "/front_stereo_camera/right/camera_info"),
        ],
    )

    return LaunchDescription(
        [
            # Isaac Sim 6 does not publish the front stereo rig baseline.
            # The right projection matrix exposes the 15 cm baseline used here.
            Node(
                package="tf2_ros",
                executable="static_transform_publisher",
                arguments=[
                    "--x",
                    "0.15",
                    "--frame-id",
                    "front_stereo_camera_left_optical",
                    "--child-frame-id",
                    "front_stereo_camera_right_optical",
                ],
            ),
            ComposableNodeContainer(
                name="visual_slam_launch_container",
                namespace="",
                package="rclcpp_components",
                executable="component_container",
                composable_node_descriptions=[visual_slam],
                output="screen",
            ),
        ]
    )
