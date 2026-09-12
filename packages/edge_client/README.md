# CharmQuark Edge Client

This is a standard ROS2 Python package (`ament_python`) that runs natively on the physical robot. It acts as the edge daemon connecting the robot to the CharmQuark Cloud C2 (Command & Control) architecture.

## How it works

The `charmquark_client` node runs on the robot and initiates a persistent WebSocket connection to the cloud backend at `wss://charmquark.app/api/robots/{robot_id}/stream`.

1. **Telemetry**: It continuously streams health metrics (e.g., `ACTIVE` status, battery) up to the cloud, powering the live metrics in the C2 Dashboard.
2. **Commands**: It listens asynchronously for cloud-dispatched commands (like `ping` or `estop`).
3. **Hardware Execution**: When an `estop` command arrives from the web dashboard, the node immediately intercepts it and publishes a zeroed-out `geometry_msgs/Twist` message to the local `/cmd_vel` topic, executing a hard halt on the physical hardware.

## Installation

This package requires ROS2 (Humble/Iron/Jazzy) and the `websockets` Python library.

```bash
cd ~/ros2_ws/src
ln -s /path/to/charmquark/packages/edge_client charmquark_edge
cd ~/ros2_ws
colcon build --packages-select charmquark_edge
source install/setup.bash
```

## Running

```bash
ros2 run charmquark_edge client_node --ros-args -p robot_id:=robot-1 -p ws_url:=wss://charmquark.app/api/robots -p api_token:=cq_pat_...
```
