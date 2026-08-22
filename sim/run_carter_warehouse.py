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

app_utils.play()
simulation_app.update()
print("Simulation running. Publish Twist messages to /cmd_vel to move the Carter robot.")

while simulation_app.is_running():
    simulation_app.update()

app_utils.stop()
simulation_app.close()
