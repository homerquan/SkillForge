# Hackathon Tech Spec: Human → AI → Robot Simulation

## Goal

Build a fully local Physical AI demo where a user gives natural-language instructions through a simple web UI, OpenClaw converts them into robot actions, and ROS2 controls a robot inside Isaac Sim.

The user can watch the robot execute the task in real time.

## Architecture

```text
                     ┌──────── Web UI ────────┐
                     │                        │
Human ── text ──────►│ Conversation           │
                     │                        │
                     │              Live Video│◄──── Isaac Sim Camera
                     │              + Status  │
                     └──────────┬─────────────┘
                                │
                           OpenClaw
                                │
                      Structured Actions
                                │
                          ROS2 Control
                                │
                         Isaac Sim Robot
                                │
                    State / Camera / Events
                                └────────────► Web UI
```

## Web UI

Keep the interface simple with two panels:

```text
┌──────────────────────────┬───────────────────────────┐
│ Conversation             │ Live Robot               │
│                          │                           │
│ User:                    │ ┌───────────────────────┐ │
│ Pick up the blue box     │ │                       │ │
│                          │ │   Isaac Sim Video     │ │
│ AI:                      │ │                       │ │
│ I'll approach the box,   │ └───────────────────────┘ │
│ position the arm and     │                           │
│ close the gripper.       │ Status: Executing        │
│                          │ Action: move_arm(...)     │
│ [ Type instruction... ]  │ Robot: Connected         │
└──────────────────────────┴───────────────────────────┘
```

**Left:** human ↔ OpenClaw conversation.

**Right:** real-time Isaac Sim camera/video plus current ROS2 action and robot status.

## Control Flow

```text
Human instruction
      ↓
OpenClaw
      ↓
Structured robot actions

move()
rotate()
move_arm()
open_gripper()
close_gripper()

      ↓
ROS2
      ↓
Isaac Sim
      ↓
Camera + robot state
      ↓
Web UI
```

## Minimal Implementation

- **Frontend:** React / simple web app
- **Agent:** OpenClaw
- **Robot API:** ROS2
- **Simulation:** Isaac Sim + ROS2 Bridge
- **Live status:** WebSocket
- **Video:** Isaac Sim camera → ROS2 image topic → local video gateway → browser
- **Deployment:** Fully local

## Hackathon Success Criteria

A user can type:

> **“Move to the table and pick up the blue box.”**

OpenClaw generates the required ROS2 actions, Isaac Sim executes them, and the user watches the execution and status **live from the same web interface**.
