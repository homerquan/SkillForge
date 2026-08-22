#!/usr/bin/env bash
# Launch the complete local SkillForge operator demo and clean it up together.

set -eo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE="${ISAAC_ROS_WS:-${HOME}/workspaces/isaac_ros-dev}"
IMAGE_TOPIC="${IMAGE_TOPIC:-/front_stereo_camera/left/image_raw}"
CAMERA_PORT="${CAMERA_PORT:-8080}"
BRIDGE_PORT="${SKILLFORGE_BRIDGE_PORT:-8787}"
UI_PORT="${UI_PORT:-5173}"
READY_TIMEOUT_SECONDS="${READY_TIMEOUT_SECONDS:-420}"
LAN_IP="${SKILLFORGE_LAN_IP:-$(hostname -I | cut -d ' ' -f 1)}"
PIDS=()

if [[ ! -f /opt/ros/jazzy/setup.bash || ! -f "${WORKSPACE}/install/setup.bash" ]]; then
    printf 'ROS 2 Jazzy and the built Isaac ROS workspace are required.\n' >&2
    exit 1
fi

if ! mongosh "${MONGODB_URI:-mongodb://127.0.0.1:27017/skillforge}" --quiet --eval "db.runCommand({ ping: 1 })" >/dev/null 2>&1; then
    printf 'MongoDB is unavailable. The UI will show Knowledge: Offline; start it with: sudo systemctl start mongod\n' >&2
fi

source /opt/ros/jazzy/setup.bash
source "${WORKSPACE}/install/setup.bash"
set -u

cleanup() {
    trap - EXIT INT TERM
    for pid in "${PIDS[@]:-}"; do
        kill -- "-${pid}" 2>/dev/null || true
    done
}
trap cleanup EXIT
trap 'exit 130' INT TERM

start() {
    setsid "$@" &
    PIDS+=("$!")
}

wait_for_camera() {
    for ((second = 0; second < READY_TIMEOUT_SECONDS; second += 2)); do
        if timeout 2 ros2 topic echo --once "${IMAGE_TOPIC}" sensor_msgs/msg/Image >/dev/null 2>&1; then
            return
        fi
        sleep 2
    done
    printf 'Timed out waiting for camera topic %s.\n' "${IMAGE_TOPIC}" >&2
    exit 1
}

printf 'Starting Isaac Sim and Visual SLAM...\n'
start "${ROOT_DIR}/sim/start_sim.sh" --no-viewer --no-drive --headless
wait_for_camera

printf 'Starting Nav2, OpenClaw ROS task bridge, and MJPEG video...\n'
start ros2 launch "${ROOT_DIR}/sim/skillforge_navigation.launch.py"
start python3 "${ROOT_DIR}/sim/autonomous_navigation.py"
start python3 "${ROOT_DIR}/sim/skillforge_task_bridge.py"
if curl -fsSI --max-time 3 "http://127.0.0.1:${CAMERA_PORT}/snapshot?topic=${IMAGE_TOPIC}" >/dev/null 2>&1; then
    printf 'Reusing existing ROS video gateway on port %s.\n' "${CAMERA_PORT}"
else
    # A prior gateway can keep its socket while losing the old DDS graph.
    # Reclaim only this configured port before starting a fresh ROS video node.
    printf 'Replacing stale ROS video gateway on port %s.\n' "${CAMERA_PORT}"
    fuser -k "${CAMERA_PORT}/tcp" >/dev/null 2>&1 || true
    sleep 1
    start "${ROOT_DIR}/sim/start_streaming_ros_video.sh"
fi

export SKILLFORGE_BRIDGE_PORT="${BRIDGE_PORT}"
export SKILLFORGE_BRIDGE_HOST="0.0.0.0"
export SKILLFORGE_UI_PORT="${UI_PORT}"
export VITE_SKILLFORGE_BRIDGE_URL="http://${LAN_IP}:${BRIDGE_PORT}"
export VITE_CAMERA_URL="http://${LAN_IP}:${CAMERA_PORT}/snapshot?topic=${IMAGE_TOPIC}"

printf 'Starting OpenClaw bridge and web UI...\n'
start npm --prefix "${ROOT_DIR}/ui" run bridge
start npm --prefix "${ROOT_DIR}/ui" run dev -- --host 0.0.0.0 --port "${UI_PORT}"

printf '\nSkillForge UI: http://%s:%s\n' "${LAN_IP}" "${UI_PORT}"
printf 'Press Ctrl-C to stop all SkillForge processes.\n'
wait "${PIDS[@]}"
