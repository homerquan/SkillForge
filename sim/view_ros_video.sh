#!/usr/bin/env bash
# Open a ROS 2 image viewer for an Isaac Sim camera topic.

set -eo pipefail

WORKSPACE="${ISAAC_ROS_WS:-${HOME}/workspaces/isaac_ros-dev}"
IMAGE_TOPIC="${1:-/front_stereo_camera/left/image_raw}"

if [[ ! -f /opt/ros/jazzy/setup.bash ]]; then
    printf 'ROS 2 Jazzy is not installed at /opt/ros/jazzy.\n' >&2
    exit 1
fi

if [[ ! -f "${WORKSPACE}/install/setup.bash" ]]; then
    printf 'Isaac ROS workspace is not built: %s/install/setup.bash\n' "${WORKSPACE}" >&2
    exit 1
fi

source /opt/ros/jazzy/setup.bash
source "${WORKSPACE}/install/setup.bash"

printf 'Opening ROS video topic: %s\n' "${IMAGE_TOPIC}"
ros2 run rqt_image_view rqt_image_view "${IMAGE_TOPIC}"
