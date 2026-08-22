#!/usr/bin/env bash
# Serve an Isaac Sim ROS image topic as an MJPEG stream on the local network.

set -eo pipefail

WORKSPACE="${ISAAC_ROS_WS:-${HOME}/workspaces/isaac_ros-dev}"
PORT="${PORT:-8080}"
ADDRESS="${ADDRESS:-0.0.0.0}"

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

if ! ros2 pkg prefix web_video_server >/dev/null 2>&1; then
    printf 'web_video_server is not installed. Install it once with:\n' >&2
    printf '  sudo apt install -y ros-jazzy-web-video-server\n' >&2
    exit 1
fi

LAN_IP="$(hostname -I | cut -d ' ' -f 1)"
TOPIC="/front_stereo_camera/left/image_raw"

printf 'Serving ROS video on all interfaces at port %s.\n' "${PORT}"
printf 'Open in a browser on this LAN:\n'
printf '  http://%s:%s/stream_viewer?topic=%s\n' "${LAN_IP}" "${PORT}" "${TOPIC}"
printf 'Direct MJPEG URL for <img> or a video gateway:\n'
printf '  http://%s:%s/stream?topic=%s&type=mjpeg&width=960&height=600&quality=80\n' \
    "${LAN_IP}" "${PORT}" "${TOPIC}"

ros2 run web_video_server web_video_server --ros-args \
    -p address:="${ADDRESS}" \
    -p port:="${PORT}" \
    -p default_stream_type:=mjpeg
