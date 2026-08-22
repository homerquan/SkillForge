## Slide 1 — Business Context: Automation Meets the Real World

Warehouses, factories, and data centers are rapidly adopting robots and autonomous systems.

But real operations are unpredictable:

- Boxes fall
- Aisles become blocked
- Equipment moves
- Humans enter work zones
- Normal procedures fail

Most automation is designed for expected workflows. The hardest problem is what happens when reality changes.

Opportunity: Give Physical AI a safe environment to experience, understand, and respond to unexpected events before operating in the real world.

## Slide 2 — Why Now: Local AI + Automation Control

AI is moving from answering questions to controlling physical systems.

For industrial environments, this intelligence increasingly needs to run locally:

- Local AI
  - Low latency
  - Private operational data
  - Works without cloud connectivity
  - Can continuously understand local context
- Automation Control
  - Translate human goals into machine actions
  - Connect AI to ROS 2 and existing robots
  - Validate actions before execution
  - Maintain deterministic safety boundaries

The next step for local AI is not just inference — it is safe control of the physical world.

## Slide 3 — What We’re Building

We are building a Local Physical AI testbed using NVIDIA Isaac Sim + ROS 2.

A user gives the AI a high-level goal:

> “Find the fallen boxes in the warehouse.”

The system:

Human Intent → AI Planning → ROS 2 → Robot → Perception → Feedback

Meanwhile, Isaac Sim generates unexpected physical events such as:

- Box falls
- Pallet tips
- Aisle blocked
- Object moved

The robot must discover what changed and autonomously respond.

## Slide 4 — Simulation as the Learning & Safety Layer

Instead of testing AI directly on expensive physical equipment, we first let it operate inside a digital twin.

- NVIDIA Isaac Sim
  - Realistic warehouse + physics
- Random Event Engine
  - Generates operational incidents
- Local AI Agent
  - Reasons about the situation
- ROS 2
  - Provides a standard robot control interface
- Mobile Robot
  - Navigates, observes, and executes

This creates a repeatable loop:

Simulate → Observe → Decide → Act → Evaluate → Improve

## Slide 5 — Hackathon Vision: From Demo to Physical AI Platform

### Hackathon demo

A warehouse robot receives:

> “Find any fallen boxes and report where they are.”

During the mission, Isaac Sim randomly creates incidents.

The local AI must detect the changed environment, plan a response, control the robot through ROS 2, and report the result.

### Roadmap

- Today: Warehouse simulation
- Next: Real robot
- Eventually: A local AI control layer for warehouses, factories, data centers, labs, and other physical operations.

Local AI that doesn’t just understand the world — it can safely act in it.