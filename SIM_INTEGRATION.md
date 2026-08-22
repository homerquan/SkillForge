# Simulation Integration

SkillForge runs Isaac Sim, Isaac ROS Visual SLAM, and browser-consumable camera video on the DGX Spark.

## Components

| Component | Location | Purpose |
|---|---|---|
| Isaac Sim | `~/isaacsim` | Runs the Nova Carter warehouse scene and ROS 2 bridge. |
| Isaac ROS workspace | `~/workspaces/isaac_ros-dev` | Provides the locally built Visual SLAM packages. |
| Simulation scripts | `~/SkillForge/sim` | Starts the scene, SLAM, local viewer, and LAN video stream. |

## Start The Demo

```bash
cd ~/SkillForge/sim
./start_sim.sh
```

The script performs the following work:

1. Starts `run_carter_warehouse.py`, which loads Isaac Sim's `carter_warehouse_navigation.usd` scene.
2. Enables the front stereo camera ROS render products.
3. Waits for `/front_stereo_camera/left/image_raw`.
4. Starts `skillforge_slam.launch.py`.
5. Sends `geometry_msgs/msg/Twist` commands to `/cmd_vel` at 10 Hz so the Carter robot moves while SLAM runs.
6. Opens a local `rqt_image_view` window for the left camera.

The first Isaac Sim launch can take several minutes for shader compilation and asset loading. The default readiness timeout is seven minutes. Press `Ctrl-C` in the `start_sim.sh` terminal to stop all child processes.

Useful options:

```bash
./start_sim.sh --no-viewer
./start_sim.sh --no-drive
./start_sim.sh --no-viewer --no-drive
```

## ROS Topics

Isaac Sim publishes the front stereo pair:

```text
/front_stereo_camera/left/image_raw
/front_stereo_camera/left/camera_info
/front_stereo_camera/right/image_raw
/front_stereo_camera/right/camera_info
/front_stereo_imu/imu
/cmd_vel
/clock
/tf
```

The two camera streams are intentional: Visual SLAM uses stereo vision. It matches the same scene features in the synchronized left and right images; their fixed 15 cm separation provides depth, while consecutive stereo frames estimate robot motion.

`skillforge_slam.launch.py` maps the raw left and right images to Isaac ROS Visual SLAM. Isaac Sim 6 publishes a 15 cm stereo baseline in the right camera projection matrix but does not publish that static transform, so the launch file publishes the matching left-to-right static transform.

SLAM uses `front_stereo_camera_left_optical` as its base frame and publishes results under `/visual_slam`, including:

```bash
ros2 topic echo /visual_slam/tracking/odometry
ros2 topic list | grep visual_slam
```

## Local Video Viewer

To open the local ROS image viewer separately:

```bash
cd ~/SkillForge/sim
./view_ros_video.sh
```

To view the right camera instead:

```bash
./view_ros_video.sh /front_stereo_camera/right/image_raw
```

The equivalent direct ROS command is:

```bash
ros2 run rqt_image_view rqt_image_view /front_stereo_camera/left/image_raw
```

## LAN Video Stream

`web_video_server` exposes the ROS camera as HTTP MJPEG, which browsers can consume without ROS software.

Install it once:

```bash
sudo apt install -y ros-jazzy-web-video-server
```

Start the server after Isaac Sim is publishing:

```bash
cd ~/SkillForge/sim
./start_streaming_ros_video.sh
```

The DGX Spark's current LAN address is `10.0.0.167`. Open either camera from a browser on the same network:

```text
http://10.0.0.167:8080/stream_viewer?topic=/front_stereo_camera/left/image_raw
http://10.0.0.167:8080/stream_viewer?topic=/front_stereo_camera/right/image_raw
```

The direct MJPEG endpoints for HTML image elements are:

```text
http://10.0.0.167:8080/stream?topic=/front_stereo_camera/left/image_raw&type=mjpeg&width=960&height=600&quality=80
http://10.0.0.167:8080/stream?topic=/front_stereo_camera/right/image_raw&type=mjpeg&width=960&height=600&quality=80
```

Show both streams side-by-side when debugging calibration, synchronization, or depth. The production UI can show the left stream only while Visual SLAM consumes both in the background.

Use another port if `8080` is occupied:

```bash
PORT=8081 ./start_streaming_ros_video.sh
```

The stream server listens on `0.0.0.0`, so it is reachable on the LAN. Do not expose it directly to the public internet.

## Web UI

The React UI accepts camera frames through the existing event contract:

```ts
{ type: "frame", src: string }
```

For the simplest integration, use the direct MJPEG URL as the `src` of the existing `<img>` in `RobotPanel`. A backend bridge can instead read the ROS `sensor_msgs/msg/Image` messages, encode frames, and emit `frame` events through the OpenClaw WebSocket.

## Manual Robot Motion

When `start_sim.sh --no-drive` is used, publish a one-time movement command with:

```bash
ros2 topic pub --once /cmd_vel geometry_msgs/msg/Twist \
  "{linear: {x: 0.2, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.2}}"
```

## Troubleshooting

- Source ROS when using commands outside the scripts:

  ```bash
  source /opt/ros/jazzy/setup.bash
  source ~/workspaces/isaac_ros-dev/install/setup.bash
  ```

- Confirm the camera is publishing:

  ```bash
  ros2 topic hz /front_stereo_camera/left/image_raw
  ros2 topic echo --once /front_stereo_camera/left/camera_info
  ```

- Process logs from each simulation run are written to `~/SkillForge/sim/logs/`.
- Close an existing Isaac Sim session before starting a new one to avoid GPU and ROS topic conflicts.
