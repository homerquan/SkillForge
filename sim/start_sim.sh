#!/usr/bin/env bash
# Start the Isaac Sim Carter stereo demo, Isaac ROS Visual SLAM, and an image viewer.

set -eo pipefail

SIM_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE="${ISAAC_ROS_WS:-${HOME}/workspaces/isaac_ros-dev}"
ISAAC_SIM_ROOT="${ISAAC_SIM_ROOT:-${HOME}/isaacsim}"
IMAGE_TOPIC="${IMAGE_TOPIC:-/front_stereo_camera/left/image_raw}"
READY_TIMEOUT_SECONDS="${READY_TIMEOUT_SECONDS:-420}"
OPEN_VIEWER=true
DRIVE_ROBOT=true
START_NAVIGATION=false

usage() {
    cat <<'EOF'
Usage: ./start_sim.sh [--no-viewer] [--no-drive] [--navigation]

Starts the Isaac Sim Nova Carter stereo-camera sample, Isaac ROS Visual SLAM,
and, by default, rqt_image_view plus a slow forward-and-turning robot motion.
Use --navigation to launch nvblox and Nav2. Navigation uses Visual SLAM pose
and Isaac Sim LiDAR, and disables the automatic robot motion.

Environment overrides:
  ISAAC_ROS_WS          Isaac ROS workspace (default: ~/workspaces/isaac_ros-dev)
  ISAAC_SIM_ROOT        Isaac Sim installation (default: ~/isaacsim)
  IMAGE_TOPIC           ROS image topic to display
  READY_TIMEOUT_SECONDS Time to wait for the camera topic (default: 420)
EOF
}

for argument in "$@"; do
    case "${argument}" in
        --no-viewer) OPEN_VIEWER=false ;;
        --no-drive) DRIVE_ROBOT=false ;;
        --navigation) START_NAVIGATION=true; DRIVE_ROBOT=false ;;
        --help|-h) usage; exit 0 ;;
        *) usage >&2; exit 2 ;;
    esac
done

if [[ ! -f /opt/ros/jazzy/setup.bash ]]; then
    printf 'ROS 2 Jazzy is not installed at /opt/ros/jazzy.\n' >&2
    exit 1
fi

if [[ ! -f "${WORKSPACE}/install/setup.bash" ]]; then
    printf 'Isaac ROS workspace is not built: %s/install/setup.bash\n' "${WORKSPACE}" >&2
    exit 1
fi

if [[ ! -x "${ISAAC_SIM_ROOT}/python.sh" ]]; then
    printf 'Isaac Sim was not found at %s. Set ISAAC_SIM_ROOT to its installation path.\n' "${ISAAC_SIM_ROOT}" >&2
    exit 1
fi

source /opt/ros/jazzy/setup.bash
source "${WORKSPACE}/install/setup.bash"
set -u

if ! ros2 pkg prefix isaac_ros_visual_slam >/dev/null 2>&1; then
    printf 'isaac_ros_visual_slam is not available after sourcing %s.\n' "${WORKSPACE}" >&2
    exit 1
fi

LOG_DIR="${SIM_DIR}/logs/$(date +%Y%m%d-%H%M%S)"
mkdir -p "${LOG_DIR}"

SIM_PID=""
SLAM_PID=""
VIEWER_PID=""
DRIVE_PID=""
NAVIGATION_PID=""

cleanup() {
    trap - EXIT INT TERM
    for pid in "${DRIVE_PID}" "${VIEWER_PID}" "${NAVIGATION_PID}" "${SLAM_PID}" "${SIM_PID}"; do
        if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
            kill "${pid}" 2>/dev/null || true
        fi
    done
}
trap cleanup EXIT INT TERM

printf 'Starting Isaac Sim. Logs: %s\n' "${LOG_DIR}"
"${ISAAC_SIM_ROOT}/python.sh" \
    "${SIM_DIR}/run_carter_warehouse.py" \
    >"${LOG_DIR}/isaac-sim.log" 2>&1 &
SIM_PID=$!

printf 'Waiting for camera topic %s...\n' "${IMAGE_TOPIC}"
for ((second = 0; second < READY_TIMEOUT_SECONDS; second += 2)); do
    if ! kill -0 "${SIM_PID}" 2>/dev/null; then
        printf 'Isaac Sim stopped before the camera became available. See %s/isaac-sim.log\n' "${LOG_DIR}" >&2
        exit 1
    fi
    if timeout 2 ros2 topic echo --once "${IMAGE_TOPIC}" sensor_msgs/msg/Image >/dev/null 2>&1; then
        break
    fi
    sleep 2
done

if ! timeout 2 ros2 topic echo --once "${IMAGE_TOPIC}" sensor_msgs/msg/Image >/dev/null 2>&1; then
    printf 'Timed out waiting for %s. See %s/isaac-sim.log\n' "${IMAGE_TOPIC}" "${LOG_DIR}" >&2
    exit 1
fi

printf 'Starting Isaac ROS Visual SLAM...\n'
ros2 launch "${SIM_DIR}/skillforge_slam.launch.py" \
    >"${LOG_DIR}/visual-slam.log" 2>&1 &
SLAM_PID=$!

if [[ "${START_NAVIGATION}" == true ]]; then
    if ! ros2 pkg prefix nav2_bringup >/dev/null 2>&1 || ! ros2 pkg prefix nvblox_ros >/dev/null 2>&1; then
        printf 'Navigation dependencies are missing. Install: sudo apt-get install -y ros-jazzy-nav2-bringup ros-jazzy-isaac-ros-nvblox\n' >&2
        exit 1
    fi
    printf 'Starting nvblox and Nav2 with Visual SLAM localization...\n'
    ros2 launch "${SIM_DIR}/skillforge_navigation.launch.py" \
        >"${LOG_DIR}/navigation.log" 2>&1 &
    NAVIGATION_PID=$!
fi

if [[ "${DRIVE_ROBOT}" == true ]]; then
    printf 'Moving the Carter robot with /cmd_vel. Use --no-drive to disable this.\n'
    ros2 topic pub --rate 10 /cmd_vel geometry_msgs/msg/Twist \
        "{linear: {x: 0.2, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.2}}" \
        >"${LOG_DIR}/robot-motion.log" 2>&1 &
    DRIVE_PID=$!
fi

if [[ "${OPEN_VIEWER}" == true ]]; then
    if ros2 pkg prefix rqt_image_view >/dev/null 2>&1; then
        printf 'Opening the ROS image viewer for %s...\n' "${IMAGE_TOPIC}"
        ros2 run rqt_image_view rqt_image_view "${IMAGE_TOPIC}" >"${LOG_DIR}/image-viewer.log" 2>&1 &
        VIEWER_PID=$!
    else
        printf 'rqt_image_view is not installed. Run: ros2 run image_tools showimage --ros-args -r image:=%s\n' "${IMAGE_TOPIC}" >&2
    fi
fi

printf '\nSimulation, SLAM, robot motion, navigation, and video are running. Press Ctrl-C here to stop them.\n'
printf 'ROS image: %s\nROS SLAM pose: /visual_slam/tracking/odometry\nLogs: %s\n' "${IMAGE_TOPIC}" "${LOG_DIR}"
if [[ "${START_NAVIGATION}" == true ]]; then
    printf 'Send goals in RViz or with the /navigate_to_pose action.\n'
fi

wait "${SIM_PID}"
