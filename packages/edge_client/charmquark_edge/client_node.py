import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist
import asyncio
import websockets
import json
import threading
import time
import os

class CharmQuarkClient(Node):
    def __init__(self):
        super().__init__('charmquark_client')
        
        # Declare parameters
        self.declare_parameter('robot_id', 'robot-123')
        self.declare_parameter('ws_url', 'wss://charmquark.app/api/robots')
        self.declare_parameter('api_token', 'cq_pat_example')
        
        self.robot_id = self.get_parameter('robot_id').value
        self.ws_url = self.get_parameter('ws_url').value
        self.api_token = self.get_parameter('api_token').value
        
        # Publisher for E-Stop
        self.cmd_vel_pub = self.create_publisher(Twist, '/cmd_vel', 10)
        
        self.get_logger().info(f"CharmQuark Client starting for robot {self.robot_id}")
        
        # Run websocket loop in a separate thread
        self.ws_thread = threading.Thread(target=self.start_async_loop, daemon=True)
        self.ws_thread.start()

    def start_async_loop(self):
        asyncio.run(self.ws_loop())
        
    async def ws_loop(self):
        url = f"{self.ws_url}/{self.robot_id}/stream"
        headers = {"Authorization": f"Bearer {self.api_token}"}
        
        while True:
            try:
                self.get_logger().info(f"Connecting to C2 server at {url}...")
                async with websockets.connect(url, additional_headers=headers) as websocket:
                    self.get_logger().info("Connected to CharmQuark C2.")
                    
                    # Start telemetry ping
                    ping_task = asyncio.create_task(self.telemetry_loop(websocket))
                    
                    # Listen for commands
                    async for message in websocket:
                        self.handle_command(message)
                        
                    ping_task.cancel()
                    
            except Exception as e:
                self.get_logger().error(f"WebSocket error: {e}")
                await asyncio.sleep(5)  # Reconnect backoff

    async def telemetry_loop(self, websocket):
        while True:
            # Send simple heartbeat/telemetry payload
            payload = {
                "type": "telemetry",
                "status": "ACTIVE",
                "battery": 95,
                "timestamp": time.time()
            }
            try:
                await websocket.send(json.dumps(payload))
            except Exception:
                break
            await asyncio.sleep(2.0)

    def handle_command(self, raw_msg):
        try:
            msg = json.loads(raw_msg)
            action = msg.get("action")
            
            if action == "estop":
                self.get_logger().warn("EMERGENCY STOP received from C2 Dashboard!")
                self.trigger_estop()
            elif action == "ping":
                self.get_logger().info("Ping received from C2 Dashboard.")
            else:
                self.get_logger().info(f"Unknown command received: {action}")
                
        except json.JSONDecodeError:
            self.get_logger().error("Failed to decode JSON from C2.")

    def trigger_estop(self):
        # Publish zero twist to halt robot
        msg = Twist()
        msg.linear.x = 0.0
        msg.linear.y = 0.0
        msg.linear.z = 0.0
        msg.angular.x = 0.0
        msg.angular.y = 0.0
        msg.angular.z = 0.0
        self.cmd_vel_pub.publish(msg)
        self.get_logger().warn("Halting robot via /cmd_vel zeroes")


def main(args=None):
    rclpy.init(args=args)
    node = CharmQuarkClient()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()

if __name__ == '__main__':
    main()
