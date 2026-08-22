# SkillForge Simulation

`start_sim.sh` starts a local Isaac Sim and ROS 2 demonstration for SkillForge:

1. Isaac Sim opens the Nova Carter warehouse scene used by the upstream Isaac ROS Visual SLAM tutorial and publishes stereo camera data through the ROS 2 bridge.
2. Isaac ROS Visual SLAM subscribes to the rectified front stereo pair and publishes visual odometry, the SLAM pose, landmarks, and observations.
3. The script publishes a near-straight `cmd_vel` trajectory at 10 Hz so the robot visibly traverses the warehouse while SLAM runs.
4. `rqt_image_view` displays the left camera stream in a separate window.

The script uses the already-built Isaac ROS workspace at `~/workspaces/isaac_ros-dev` and Isaac Sim at `~/isaacsim`. Override either location with `ISAAC_ROS_WS` or `ISAAC_SIM_ROOT` if needed.

## Start

From this directory:

```bash
./start_sim.sh
```

The command remains in the foreground as the supervisor. Press `Ctrl-C` in that terminal to stop Isaac Sim, Visual SLAM, and the image viewer. Each run writes process logs below `sim/logs/`.

To start without the image viewer or automatic robot motion:

```bash
./start_sim.sh --no-viewer --no-drive
```

## Navigation

Start NVIDIA nvblox and Nav2 with Visual SLAM localization:

```bash
./start_sim.sh --navigation
```

`--navigation` disables the demo's automatic `/cmd_vel` publisher. The stack uses the following path:

```text
front stereo cameras -> Isaac ROS Visual SLAM -> map -> nova_carter TF
front 3D LiDAR -> nvblox static costmap -> Nav2 -> /cmd_vel
```

Once Visual SLAM publishes `map` to `nova_carter` and nvblox publishes its LiDAR costmap, navigation sends an 8 m forward Nav2 goal from the robot's current SLAM pose. Nav2 plans the route through the LiDAR-derived obstacle map rather than using a fixed simulator coordinate. Use `Ctrl-C` to stop it, or send another goal in RViz after the first goal completes.

The simulator publishes the calibrated Carter sensor tree from `nova_carter` to `front_stereo_camera_left_rgb`, `front_stereo_camera_right_rgb`, and `front_RPLidar`. A static `front_RPLidar` to `front_3d_lidar` alias lets nvblox consume the simulator's LiDAR topic while using the real simulated sensor pose.

After startup, open `rviz2`, set the fixed frame to `map`, then use the **Nav2 Goal** tool. Check the navigation stack before sending a goal:

```bash
ros2 topic echo --once /visual_slam/tracking/odometry
ros2 topic hz /nvblox_node/static_map_slice
ros2 lifecycle get /controller_server
ros2 lifecycle get /planner_server
```

Both Nav2 lifecycle commands must report `active`. The `nvblox_node` static costmap is built from `/front_3d_lidar/lidar_points`; it does not use `/chassis/odom` for navigation.

## Video

The viewer opens the ROS topic:

```text
/front_stereo_camera/left/image_raw
```

If the viewer was disabled or closed, open it from another terminal:

```bash
./view_ros_video.sh
```

Pass a different image topic as the first argument, for example:

```bash
./view_ros_video.sh /front_stereo_camera/right/image_raw
```

An alternative viewer is:

```bash
ros2 run image_tools showimage --ros-args -r image:=/front_stereo_camera/left/image_raw
```

## LAN Stream

To make the left camera available to browsers on the local network, install the ROS HTTP video server once:

```bash
sudo apt install -y ros-jazzy-web-video-server
```

Then run this in a separate terminal while the simulation is publishing:

```bash
./start_streaming_ros_video.sh
```

The script prints a `stream_viewer` browser URL and a direct MJPEG URL. By default it listens on port `8080` on all LAN interfaces. Use a different port when needed:

```bash
PORT=8081 ./start_streaming_ros_video.sh
```

The direct MJPEG URL can be assigned directly to an `<img>` element in the SkillForge UI.

Use these commands to inspect the two front camera streams:

```bash
ros2 topic hz /front_stereo_camera/left/image_raw
ros2 topic echo --once /front_stereo_camera/left/camera_info
ros2 topic echo --once /front_stereo_camera/right/camera_info
```

## SLAM

`skillforge_slam.launch.py` adapts Isaac ROS Visual SLAM to Isaac Sim 6's Carter sample. It uses the calibrated `nova_carter` sensor tree published by `run_carter_warehouse.py`, uses Visual SLAM's `map` frame for localization, and consumes:

```text
/front_stereo_camera/left/image_raw
/front_stereo_camera/left/camera_info
/front_stereo_camera/right/image_raw
/front_stereo_camera/right/camera_info
```

It publishes odometry and map-related topics beneath `/visual_slam`. Inspect them after startup:

```bash
ros2 topic list | grep visual_slam
ros2 topic echo /visual_slam/tracking/odometry
```

The supervisor moves the robot with the same `Twist` interface as the upstream tutorial. To stop its automatic motion and issue a one-time motion command yourself, start with `--no-drive`, then run:

```bash
ros2 topic pub --once /cmd_vel geometry_msgs/msg/Twist \
  "{linear: {x: 0.2, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.2}}"
```

## UI Integration

The current script publishes ROS video locally; it does not yet expose video to the React browser UI. A video gateway or backend bridge should subscribe to `/front_stereo_camera/left/image_raw`, encode frames, and emit the UI's existing `frame` WebSocket events. This keeps the ROS/Isaac Sim process separate from the browser-facing service.

## Troubleshooting

- If the script cannot find Isaac Sim, set `ISAAC_SIM_ROOT`, for example `ISAAC_SIM_ROOT=/home/dell/isaacsim ./start_sim.sh`.
- First launch can take several minutes while Isaac Sim compiles shaders and loads assets. The default camera readiness timeout is seven minutes. Inspect the run's `isaac-sim.log` if it expires.
- The image viewer needs an active desktop display. Use `--no-viewer` for a headless SSH session, then view the topic from a desktop ROS session.
- The image topic is configurable when testing a different camera: `IMAGE_TOPIC=/my/camera/image_raw ./start_sim.sh`.
- Navigation must start a fresh Isaac Sim session because `run_carter_warehouse.py` creates the required sensor TF graph while loading the scene.
