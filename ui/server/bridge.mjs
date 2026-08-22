#!/usr/bin/env node
/**
 * Local-only bridge: browser -> OpenClaw -> validated ROS task topic.
 * It deliberately does not expose the OpenClaw gateway token to the browser.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";

const port = Number(process.env.SKILLFORGE_BRIDGE_PORT ?? 8787);
const host = process.env.SKILLFORGE_BRIDGE_HOST ?? "127.0.0.1";
const uiPort = Number(process.env.SKILLFORGE_UI_PORT ?? 5173);
const mongoUri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/skillforge";
const llmUrl = process.env.LLM_API_BASE ?? "http://127.0.0.1:8000/v1";
const llmModel = process.env.LLM_MODEL ?? "muse-glimmer-30b";
const snapshotUrl = process.env.SKILLFORGE_SNAPSHOT_URL ?? "http://127.0.0.1:8080/snapshot?topic=/front_stereo_camera/left/image_raw";
const sessionKey = process.env.OPENCLAW_SESSION_KEY ?? "agent:main:skillforge-ui";
const taskTopic = process.env.SKILLFORGE_TASK_TOPIC ?? "/skillforge/tasks";
const clients = new Set();
const actionNames = new Set([
  "navigate_to", "explore_area", "search_for", "inspect", "detect_failure",
  "record_finding", "return_home", "stop_task",
]);
let summarizing = false;
let probing = false;
let latestTelemetry = loadingTelemetry();

function loadingTelemetry() {
  const loading = { state: "loading", detail: "Waiting for bridge probe." };
  return { ros: loading, camera: loading, navigation: loading, agent: loading, knowledge: loading, updatedAt: new Date().toISOString() };
}

function run(command, args, timeout = 60_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill("SIGTERM"), timeout);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `${command} exited with ${code}`));
    });
  });
}

function json(value, status = 200) {
  return { status, body: JSON.stringify(value), headers: { "Content-Type": "application/json" } };
}

function send(response, result) {
  response.writeHead(result.status, { "Access-Control-Allow-Origin": "*", ...result.headers });
  response.end(result.body);
}

function parseJson(text) {
  const match = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
  if (!match) throw new Error("OpenClaw did not return the required JSON object.");
  // The local model can occasionally put a literal newline in a JSON string.
  // JSON forbids that, but it is safe to encode the control character before
  // parsing because all non-string content remains unchanged.
  let normalized = "";
  let inString = false;
  let escaped = false;
  for (const character of match[1]) {
    if (escaped) {
      normalized += character;
      escaped = false;
    } else if (character === "\\") {
      normalized += character;
      escaped = true;
    } else if (character === "\"") {
      normalized += character;
      inString = !inString;
    } else if (inString && character.charCodeAt(0) < 0x20) {
      normalized += character === "\n" ? "\\n" : " ";
    } else {
      normalized += character;
    }
  }
  return JSON.parse(normalized);
}

function validActions(actions) {
  if (!Array.isArray(actions)) return [];
  return actions.filter((action) =>
    action && typeof action === "object" && actionNames.has(action.name) &&
    (!action.args || (typeof action.args === "object" && !Array.isArray(action.args)))
  );
}

async function knowledgeFor(observations = []) {
  const query = observations.length
    ? { $or: observations.map((value) => ({ $or: [{ object: value }, { tags: value }] })) }
    : {};
  const script = `const x=db.robot_rules.find(${JSON.stringify(query)}).limit(20).toArray(); print(JSON.stringify(x));`;
  try {
    const output = await run("mongosh", [mongoUri, "--quiet", "--eval", script], 8_000);
    return JSON.parse(output.trim() || "[]");
  } catch {
    return [];
  }
}

async function loadKnowledge() {
  const script = "const x=db.robot_rules.find({}).limit(20).toArray(); print(JSON.stringify(x));";
  try {
    const output = await run("mongosh", [mongoUri, "--quiet", "--eval", script], 8_000);
    return JSON.parse(output.trim() || "[]");
  } catch {
    return null;
  }
}

async function publishTask(action) {
  const payload = JSON.stringify({ ...action, source: "openclaw", timestamp: new Date().toISOString() });
  await run("ros2", ["topic", "pub", "--once", taskTopic, "std_msgs/msg/String", `{data: '${payload.replaceAll("'", "\\'")}'}`], 10_000);
}

function broadcast(type, payload) {
  const event = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const response of clients) response.write(event);
}

async function probeTelemetry() {
  if (probing) return;
  probing = true;
  try {
    const [rosResult, navigationResult, agentResult, rules] = await Promise.allSettled([
      run("ros2", ["topic", "list"], 6_000),
      run("ros2", ["action", "list"], 6_000),
      run("openclaw", ["health"], 10_000),
      loadKnowledge(),
    ]);
    const topics = rosResult.status === "fulfilled" ? rosResult.value : "";
    const actions = navigationResult.status === "fulfilled" ? navigationResult.value : "";
    const rosOnline = rosResult.status === "fulfilled";
    latestTelemetry = {
      ros: rosOnline
        ? { state: "online", detail: "ROS graph is reachable." }
        : { state: "offline", detail: "ROS graph is unavailable." },
      camera: rosOnline && topics.includes("/front_stereo_camera/left/image_raw")
        ? { state: "online", detail: "Front stereo image topic is publishing." }
        : { state: "offline", detail: "Front stereo image topic was not found." },
      navigation: rosOnline && actions.includes("/navigate_to_pose")
        ? { state: "online", detail: "Nav2 NavigateToPose action is available." }
        : { state: "offline", detail: "Nav2 NavigateToPose action is unavailable." },
      agent: agentResult.status === "fulfilled"
        ? { state: "online", detail: "OpenClaw gateway is reachable." }
        : { state: "offline", detail: "OpenClaw gateway is unavailable." },
      knowledge: rules.status === "fulfilled" && rules.value !== null
        ? { state: "online", detail: `${rules.value.length} MongoDB rule${rules.value.length === 1 ? "" : "s"} loaded.` }
        : { state: "offline", detail: "MongoDB knowledge store is unavailable." },
      updatedAt: new Date().toISOString(),
    };
    broadcast("telemetry", latestTelemetry);
  } finally {
    probing = false;
  }
}

async function instruct(text) {
  const rules = await knowledgeFor();
  const prompt = `You are SkillForge's robot task planner. Translate the operator request into only safe, semantic ROS2 tasks. Never issue velocity, shell, ROS, or raw motor commands. Supported actions: navigate_to(args: {location}), explore_area(args: {area}), search_for(args: {object_type}), inspect(args: {target}), detect_failure(args: {target}), record_finding(args: {target, result}), return_home(), stop_task(). Apply these MongoDB safety rules: ${JSON.stringify(rules)}. Reply with one JSON object and no markdown: {"reply":"brief operator-facing acknowledgement","actions":[{"name":"supported action","args":{}}]}. If the request is unsafe, impossible, or needs missing information, explain it and return actions: []. Operator request: ${text}`;
  const agentText = await run("openclaw", ["agent", "--session-key", sessionKey, "--message", prompt, "--timeout", "90"], 100_000);
  const plan = parseJson(agentText);
  const actions = validActions(plan.actions);
  await Promise.all(actions.map(publishTask));
  return { reply: typeof plan.reply === "string" ? plan.reply : "Task plan sent to ROS2.", actions };
}

async function analyzeSnapshot(rules) {
  const snapshot = await fetch(snapshotUrl, { signal: AbortSignal.timeout(15_000) });
  if (!snapshot.ok) throw new Error(`Camera snapshot failed (${snapshot.status}).`);
  const image = Buffer.from(await snapshot.arrayBuffer()).toString("base64");
  const ruleIndex = rules.map((rule, index) => ({
    id: `r${index}`,
    object: rule.object,
    tags: rule.tags,
    action: rule.action,
    alert: rule.alert,
    message: rule.message,
  }));
  const prompt = `Analyze this robot camera snapshot. Return JSON only: {"summary":"one concise sentence","observations":["lowercase object"],"rule_ids":["r0"]}. Describe only clearly visible objects. Match a rule ID only when the image visibly satisfies its object or tags. Rules from MongoDB: ${JSON.stringify(ruleIndex)}.`;
  const response = await fetch(`${llmUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model: llmModel,
      messages: [{ role: "user", content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } },
      ] }],
      max_tokens: 250,
      temperature: 0.2,
    }),
  });
  if (!response.ok) throw new Error(`Vision model failed (${response.status}): ${await response.text()}`);
  const result = await response.json();
  const content = result?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Vision model returned no text.");
  const analysis = parseJson(content);
  return { analysis, ruleIndex };
}

async function summarizeScene() {
  if (summarizing) return;
  summarizing = true;
  try {
    const rules = await loadKnowledge();
    if (rules === null) {
      broadcast("scene", { summary: "Camera analysis is waiting for MongoDB knowledge rules." });
      return;
    }
    const { analysis, ruleIndex } = await analyzeSnapshot(rules);
    const matchedRules = Array.isArray(analysis.rule_ids)
      ? analysis.rule_ids.map((id) => ruleIndex.find((rule) => rule.id === id)).filter(Boolean)
      : [];
    const alertRule = matchedRules.find((rule) => rule.alert === true || rule.action === "alarm");
    broadcast("scene", {
      summary: typeof analysis.summary === "string" ? analysis.summary : "Vision analysis completed.",
      alert: alertRule?.message ?? (alertRule ? "Knowledge rule triggered." : undefined),
    });
  } catch (error) {
    broadcast("scene", { summary: `Camera analysis unavailable: ${error instanceof Error ? error.message : "unknown error"}` });
  } finally {
    summarizing = false;
  }
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") return send(response, { status: 204, body: "", headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, GET, OPTIONS" } });
  if (request.method === "GET" && request.url === "/") {
    const hostname = request.headers.host?.replace(/:\d+$/, "") ?? "127.0.0.1";
    response.writeHead(302, { Location: `http://${hostname}:${uiPort}/` });
    response.end();
    return;
  }
  if (request.method === "GET" && request.url === "/health") return send(response, json({ ok: true }));
  if (request.method === "GET" && request.url === "/api/events") {
    response.writeHead(200, { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache", Connection: "keep-alive", "Content-Type": "text/event-stream" });
    response.write("retry: 3000\n\n");
    response.write(`event: telemetry\ndata: ${JSON.stringify(latestTelemetry)}\n\n`);
    clients.add(response);
    request.on("close", () => clients.delete(response));
    return;
  }
  if (request.method === "POST" && request.url === "/api/stop") {
    try { await publishTask({ name: "stop_task" }); return send(response, json({ ok: true })); }
    catch (error) { return send(response, json({ error: error.message }, 503)); }
  }
  if (request.method === "POST" && request.url === "/api/instructions") {
    let body = "";
    for await (const chunk of request) body += chunk;
    try {
      const { text } = JSON.parse(body);
      if (typeof text !== "string" || !text.trim()) return send(response, json({ error: "Instruction text is required." }, 400));
      return send(response, json(await instruct(text.trim())));
    } catch (error) {
      return send(response, json({ error: error instanceof Error ? error.message : "Bridge request failed." }, 503));
    }
  }
  return send(response, json({ error: "Not found" }, 404));
});

server.listen(port, host, () => console.log(`SkillForge bridge listening on http://${host}:${port}`));
setInterval(() => void summarizeScene(), 30_000);
setInterval(() => void probeTelemetry(), 5_000);
void probeTelemetry();
void summarizeScene();
