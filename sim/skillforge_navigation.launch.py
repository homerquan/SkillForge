"""Nvblox and Nav2 navigation for the SkillForge Isaac Sim Carter scene."""

from pathlib import Path

from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription, SetEnvironmentVariable
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch_ros.actions import Node, SetParameter


def generate_launch_description():
    sim_dir = Path(__file__).parent
    nav2_launch = Path(get_package_share_directory("nav2_bringup")) / "launch" / "navigation_launch.py"

    return LaunchDescription(
        [
            SetEnvironmentVariable("RCUTILS_LOGGING_BUFFERED_STREAM", "1"),
            SetParameter("use_sim_time", True),
            # Isaac Sim's 3D LiDAR graph labels point clouds front_3d_lidar,
            # while the simulated sensor prim is named front_RPLidar.
            Node(
                package="tf2_ros",
                executable="static_transform_publisher",
                arguments=[
                    "--frame-id",
                    "front_RPLidar",
                    "--child-frame-id",
                    "front_3d_lidar",
                ],
            ),
            Node(
                package="nvblox_ros",
                executable="nvblox_node",
                name="nvblox_node",
                output="screen",
                parameters=[str(sim_dir / "nvblox_lidar.yaml")],
                remappings=[("pointcloud", "/front_3d_lidar/lidar_points")],
            ),
            IncludeLaunchDescription(
                PythonLaunchDescriptionSource(str(nav2_launch)),
                launch_arguments={
                    "use_sim_time": "true",
                    "autostart": "true",
                    "use_composition": "False",
                    "params_file": str(sim_dir / "nav2_nvblox.yaml"),
                }.items(),
            ),
        ]
    )
