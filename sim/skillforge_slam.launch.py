"""Visual SLAM configuration for Isaac Sim 6's Carter warehouse sample."""

from launch import LaunchDescription
from launch_ros.actions import ComposableNodeContainer
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
                "enable_localization_n_mapping": True,
                "map_frame": "map",
                "odom_frame": "odom",
                "base_frame": "nova_carter",
                "rig_frame": "nova_carter",
                "enable_ground_constraint_in_odometry": True,
                "camera_optical_frames": [
                    "front_stereo_camera_left_rgb",
                    "front_stereo_camera_right_rgb",
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
            ComposableNodeContainer(
                name="visual_slam_launch_container",
                namespace="",
                package="rclcpp_components",
                executable="component_container_mt",
                composable_node_descriptions=[visual_slam],
                output="screen",
            ),
        ]
    )
