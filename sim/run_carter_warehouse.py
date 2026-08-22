"""Load the Isaac ROS Visual SLAM Carter warehouse scene with the ROS 2 bridge."""

import argparse
import sys

from isaacsim import SimulationApp


parser = argparse.ArgumentParser()
parser.add_argument("--headless", action="store_true", help="Run Isaac Sim without a viewport.")
args, _ = parser.parse_known_args()

simulation_app = SimulationApp({"renderer": "RealTimePathTracing", "headless": args.headless})

import carb
import isaacsim.core.experimental.utils.app as app_utils
import omni
import omni.graph.core as og
import usdrt
from isaacsim.core.experimental.utils.stage import is_stage_loading
from isaacsim.core.simulation_manager import SimulationManager
from isaacsim.storage.native import get_assets_root_path


app_utils.enable_extension("isaacsim.ros2.bridge")
simulation_app.update()

assets_root_path = get_assets_root_path()
if assets_root_path is None:
    carb.log_error("Could not find the Isaac Sim assets root.")
    simulation_app.close()
    sys.exit(1)

scene_path = assets_root_path + "/Isaac/Samples/ROS2/Scenario/carter_warehouse_navigation.usd"
omni.usd.get_context().open_stage(scene_path, None)
simulation_app.update()
simulation_app.update()

print(f"Loading Carter warehouse scene: {scene_path}")
while is_stage_loading():
    simulation_app.update()
print("Warehouse loaded.")

SimulationManager.setup_simulation(dt=1.0 / 60.0, device="cpu")

# The scene ships both front Hawk camera graphs. Enable their render products.
camera_graph = "/World/Nova_Carter_ROS/front_hawk"
og.Controller.set(og.Controller.attribute(camera_graph + "/left_camera_render_product.inputs:enabled"), True)
og.Controller.set(og.Controller.attribute(camera_graph + "/right_camera_render_product.inputs:enabled"), True)

# The supplied Carter graph publishes only odom -> base_link. Publish the
# calibrated sensor tree as well so Visual SLAM and nvblox can transform
# camera and LiDAR measurements through the robot frame.
robot_base = "/World/Nova_Carter_ROS/chassis_link"
sensor_prims = [
    "/World/Nova_Carter_ROS/chassis_link/sensors/front_hawk/left/camera_left",
    "/World/Nova_Carter_ROS/chassis_link/sensors/front_hawk/right/camera_right",
    "/World/Nova_Carter_ROS/chassis_link/sensors/front_3d_lidar",
]
stage = omni.usd.get_context().get_stage()
missing_prims = [path for path in [robot_base, *sensor_prims] if not stage.GetPrimAtPath(path).IsValid()]
if missing_prims:
    carb.log_error(f"Could not publish Carter sensor transforms; missing prims: {missing_prims}")
    simulation_app.close()
    sys.exit(1)

og.Controller.edit(
    {"graph_path": "/SkillForgeSensorTF", "evaluator_name": "execution"},
    {
        og.Controller.Keys.CREATE_NODES: [
            ("OnPlaybackTick", "omni.graph.action.OnPlaybackTick"),
            ("ReadSimTime", "isaacsim.core.nodes.IsaacReadSimulationTime"),
            ("ComputeTF", "isaacsim.core.nodes.IsaacComputeTransformTree"),
            ("PublishTF", "isaacsim.ros2.bridge.ROS2PublishTransformTree"),
        ],
        og.Controller.Keys.SET_VALUES: [
            ("ComputeTF.inputs:parentPrim", usdrt.Sdf.Path(robot_base)),
            ("ComputeTF.inputs:targetPrims", [usdrt.Sdf.Path(path) for path in sensor_prims]),
            ("PublishTF.inputs:topicName", "/tf"),
        ],
        og.Controller.Keys.CONNECT: [
            ("OnPlaybackTick.outputs:tick", "ComputeTF.inputs:execIn"),
            ("ComputeTF.outputs:execOut", "PublishTF.inputs:execIn"),
            ("ComputeTF.outputs:parentFrames", "PublishTF.inputs:parentFrames"),
            ("ComputeTF.outputs:childFrames", "PublishTF.inputs:childFrames"),
            ("ComputeTF.outputs:translations", "PublishTF.inputs:translations"),
            ("ComputeTF.outputs:orientations", "PublishTF.inputs:orientations"),
            ("ReadSimTime.outputs:simulationTime", "PublishTF.inputs:timeStamp"),
        ],
    },
)

app_utils.play()
simulation_app.update()
print("Simulation running. Publish Twist messages to /cmd_vel to move the Carter robot.")

while simulation_app.is_running():
    simulation_app.update()

app_utils.stop()
simulation_app.close()
