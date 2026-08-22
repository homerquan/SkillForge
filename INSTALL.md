# SkillForge Isaac Sim and Isaac ROS Installation

This guide reproduces the SkillForge stereo Visual SLAM demo on an NVIDIA DGX Spark or another supported Ubuntu host. It installs ROS 2 Jazzy, Isaac Sim, Isaac ROS Visual SLAM 4.6, and the local simulation scripts in this repository.

The verified host configuration is:

| Component | Version |
|---|---|
| Operating system | Ubuntu 24.04 (Noble) |
| Architecture | `aarch64` |
| ROS 2 | Jazzy |
| Isaac ROS | 4.6 |
| Isaac Sim | 6.0.1 (`6.0.1-rc.7+release.42383.32955d8d.gl`) |
| CUDA | 13.0 |

## What This Provides

The demo starts the Isaac Sim Nova Carter warehouse scene and its ROS 2 bridge. Isaac ROS Visual SLAM consumes the front stereo cameras and publishes pose, odometry, landmarks, and observations under `/visual_slam`.

```text
Isaac Sim stereo cameras -> Isaac ROS Visual SLAM -> /visual_slam/tracking/odometry
Isaac Sim /cmd_vel       -> Nova Carter motion
```

Visual SLAM estimates localization and builds a feature map. Autonomous, collision-aware goal navigation uses NVIDIA nvblox and Nav2 as documented in [Navigation Dependencies](#navigation-dependencies).

## 1. Host Prerequisites

Install Ubuntu 24.04, an NVIDIA driver compatible with the installed CUDA/Isaac Sim release, and basic development tools. On DGX Spark, use the NVIDIA-provided Ubuntu image and drivers.

```bash
sudo apt-get update
sudo apt-get install -y \
  build-essential \
  cmake \
  curl \
  git \
  gnupg \
  lsb-release \
  python3-colcon-common-extensions \
  python3-pip \
  python3-rosdep \
  python3-vcstool \
  wget
```

Confirm the expected platform before continuing:

```bash
uname -m
nvidia-smi
```

`uname -m` should report `aarch64` on DGX Spark.

## 2. Install ROS 2 Jazzy

Configure the official ROS 2 apt repository and install the desktop distribution:

```bash
sudo curl -sSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.key \
  -o /usr/share/keyrings/ros-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/ros-archive-keyring.gpg] http://packages.ros.org/ros2/ubuntu $(. /etc/os-release && echo $UBUNTU_CODENAME) main" \
  | sudo tee /etc/apt/sources.list.d/ros2.list >/dev/null
sudo apt-get update
sudo apt-get install -y ros-jazzy-desktop ros-dev-tools
```

Initialize rosdep once per machine:

```bash
sudo rosdep init
rosdep update
```

For the current terminal, source ROS:

```bash
source /opt/ros/jazzy/setup.bash
```

## 3. Install Isaac Sim

1. Sign in to the NVIDIA Developer Program and download the Linux `aarch64` Isaac Sim release appropriate for the host from [NVIDIA Isaac Sim](https://developer.nvidia.com/isaac-sim).
2. Extract it to `~/isaacsim`. The SkillForge scripts use that path by default.
3. Follow the release's NVIDIA installation instructions for its asset pack, cache, and any driver requirements.

Example extraction, with the downloaded archive name adjusted to match the selected release:

```bash
mkdir -p ~/isaacsim
tar -xf ~/Downloads/isaac-sim-linux-aarch64.tar.gz -C ~/isaacsim --strip-components=1
```

Verify the installation:

```bash
~/isaacsim/python.sh -c 'from isaacsim import SimulationApp; print("Isaac Sim Python is available")'
cat ~/isaacsim/VERSION
```

The demo loads the included asset:

```text
Isaac/Samples/ROS2/Scenario/carter_warehouse_navigation.usd
```

It enables the `isaacsim.ros2.bridge` extension programmatically, so no manual extension toggle is required.

If Isaac Sim is installed elsewhere, set `ISAAC_SIM_ROOT` whenever launching the demo:

```bash
ISAAC_SIM_ROOT=/path/to/isaacsim ~/SkillForge/sim/start_sim.sh
```

## 4. Configure NVIDIA Isaac ROS Apt Packages

Isaac ROS 4.6 packages provide the dependencies needed to build Visual SLAM from source. Install NVIDIA's signing key and repository:

```bash
curl -fsSL https://isaac.download.nvidia.com/isaac-ros/repos.key \
  | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-isaac-ros.gpg
echo "deb [signed-by=/usr/share/keyrings/nvidia-isaac-ros.gpg] https://isaac.download.nvidia.com/isaac-ros/release-4.6 noble-fastos main" \
  | sudo tee /etc/apt/sources.list.d/nvidia-isaac-ros.list >/dev/null
sudo apt-get update
```

The expected repository entry is:

```text
deb [signed-by=/usr/share/keyrings/nvidia-isaac-ros.gpg] https://isaac.download.nvidia.com/isaac-ros/release-4.6 noble-fastos main
```

## 5. Build Isaac ROS Visual SLAM

Create an overlay workspace and clone the release branch plus its required common repository:

```bash
mkdir -p ~/workspaces/isaac_ros-dev/src
cd ~/workspaces/isaac_ros-dev/src
git clone --branch release-4.6 --depth 1 https://github.com/NVIDIA-ISAAC-ROS/isaac_ros_visual_slam.git
git clone --branch release-4.6 --depth 1 https://github.com/NVIDIA-ISAAC-ROS/isaac_ros_common.git
cd isaac_ros_visual_slam
git submodule update --init --recursive
```

Install all ROS package dependencies from the workspace. This command may install NVIDIA Isaac ROS binary dependencies from the repository configured above:

```bash
cd ~/workspaces/isaac_ros-dev
source /opt/ros/jazzy/setup.bash
rosdep install --from-paths src --ignore-src -r -y
```

Build Visual SLAM and its direct dependencies:

```bash
colcon build --symlink-install --cmake-clean-cache \
  --packages-up-to isaac_ros_visual_slam
source install/setup.bash
```

Confirm the package is visible:

```bash
ros2 pkg prefix isaac_ros_visual_slam
```

Make the workspace available in interactive Bash shells:

```bash
cat >> ~/.bashrc <<'EOF'
export ISAAC_ROS_WS="${ISAAC_ROS_WS:-${HOME}/workspaces/isaac_ros-dev}"
if [ -f "${ISAAC_ROS_WS}/install/setup.bash" ]; then
    source "${ISAAC_ROS_WS}/install/setup.bash"
fi
EOF
```

Open a new terminal, or source the two setup files manually:

```bash
source /opt/ros/jazzy/setup.bash
source ~/workspaces/isaac_ros-dev/install/setup.bash
```

## 6. Get SkillForge

Clone or copy this repository to `~/SkillForge`. The required simulator files are:

```text
sim/run_carter_warehouse.py
sim/skillforge_slam.launch.py
sim/start_sim.sh
sim/view_ros_video.sh
sim/start_streaming_ros_video.sh
```

Ensure the shell scripts are executable:

```bash
cd ~/SkillForge
chmod +x sim/start_sim.sh sim/view_ros_video.sh sim/start_streaming_ros_video.sh
```

## 7. Run the Stereo SLAM Demo

Start the full desktop demo:

```bash
cd ~/SkillForge/sim
./start_sim.sh
```

The supervisor starts Isaac Sim, waits for the left camera, launches Visual SLAM, drives Carter slowly through the warehouse, and opens `rqt_image_view`. First startup can take several minutes while Isaac Sim loads assets and compiles shaders. The default readiness timeout is seven minutes.

For headless or manual-motion operation:

```bash
./start_sim.sh --no-viewer --no-drive
```

Stop all processes with `Ctrl-C` in the `start_sim.sh` terminal. Each run writes logs under `~/SkillForge/sim/logs/`.

The launch uses these Isaac Sim topics:

```text
/front_stereo_camera/left/image_raw
/front_stereo_camera/left/camera_info
/front_stereo_camera/right/image_raw
/front_stereo_camera/right/camera_info
/front_stereo_imu/imu
/front_3d_lidar/lidar_points
/cmd_vel
/clock
/tf
```

Isaac Sim 6 provides a 15 cm front-stereo baseline in the right camera projection matrix but does not publish the corresponding static transform. `sim/skillforge_slam.launch.py` publishes that left-to-right transform and configures Visual SLAM for rectified image inputs.

## 8. Verify Operation

In another terminal, source ROS and the workspace if `.bashrc` has not been reloaded:

```bash
source /opt/ros/jazzy/setup.bash
source ~/workspaces/isaac_ros-dev/install/setup.bash
```

Confirm the cameras and SLAM outputs:

```bash
ros2 topic hz /front_stereo_camera/left/image_raw
ros2 topic echo --once /front_stereo_camera/left/camera_info
ros2 topic list | grep visual_slam
ros2 topic echo /visual_slam/tracking/odometry
```

To drive manually after launching with `--no-drive`:

```bash
ros2 topic pub --once /cmd_vel geometry_msgs/msg/Twist \
  "{linear: {x: 0.2, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.2}}"
```

## 9. Local and LAN Video

Open the local ROS viewer independently:

```bash
cd ~/SkillForge/sim
./view_ros_video.sh
```

Install the optional browser-accessible MJPEG server:

```bash
sudo apt-get install -y ros-jazzy-web-video-server
```

Then, while Isaac Sim is publishing, start it:

```bash
cd ~/SkillForge/sim
./start_streaming_ros_video.sh
```

The script prints the host-specific browser and direct MJPEG URLs. It listens on all LAN interfaces by default. Keep it on a trusted network; do not expose it directly to the internet.

## Navigation Dependencies

Visual SLAM provides localization, not autonomous navigation. NVIDIA's navigation architecture combines Visual SLAM pose with nvblox obstacle mapping and Nav2 planning:

```text
Visual SLAM pose + LiDAR/depth -> nvblox costmap -> Nav2 -> /cmd_vel
```

Install the required packages after configuring the Isaac ROS repository:

```bash
sudo apt-get update
sudo apt-get install -y ros-jazzy-nav2-bringup ros-jazzy-isaac-ros-nvblox
```

SkillForge's Isaac Sim scene publishes `/front_3d_lidar/lidar_points`, which is the obstacle sensor for this integration. Start Visual SLAM, nvblox, and Nav2 together with:

```bash
cd ~/SkillForge/sim
./start_sim.sh --navigation
```

This disables the demo motion publisher. Visual SLAM supplies the `map -> chassis_link` localization transform, nvblox converts LiDAR into `/nvblox_node/static_map_slice`, and Nav2 sends commands to `/cmd_vel`. In RViz, set the fixed frame to `map` and use the **Nav2 Goal** tool after both `/controller_server` and `/planner_server` report the `active` lifecycle state.

## Troubleshooting

- `Isaac Sim was not found`: set `ISAAC_SIM_ROOT` to the directory containing `python.sh`.
- `Isaac ROS workspace is not built`: run the build commands in [Build Isaac ROS Visual SLAM](#5-build-isaac-ros-visual-slam), then source `install/setup.bash`.
- No camera topic after startup: inspect the newest `~/SkillForge/sim/logs/*/isaac-sim.log`; confirm the selected Isaac Sim release includes the Carter warehouse asset.
- Visual SLAM starts but has no odometry: confirm both camera image and camera-info topics are active, then inspect `~/SkillForge/sim/logs/*/visual-slam.log`.
- GUI viewer fails over SSH: run `./start_sim.sh --no-viewer` and use the LAN video server from a desktop browser.
- ROS discovery fails across machines: ensure all machines use the same `ROS_DOMAIN_ID`, permit DDS traffic on the network, and source the Jazzy environment in every ROS terminal.

For runtime behavior and topic details, see [SIM_INTEGRATION.md](SIM_INTEGRATION.md) and [sim/README.md](sim/README.md).
