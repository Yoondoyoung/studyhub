import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

import crypto from "crypto";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import multer from "multer";
import OpenAI from "openai";
import sharp from "sharp";
import http from "http";
import { WebSocketServer } from "ws";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

// Multer setup for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// OpenAI setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  console.warn(
    "Missing Supabase env vars. Check SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY"
  );
}

const serviceSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const anonSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const KV_TABLE = "kv_store_ba522478";
const DM_MESSAGE_LIMIT = 200;
const ROOM_MESSAGE_LIMIT = 200;

const kvSet = async (key, value) => {
  const { error } = await serviceSupabase.from(KV_TABLE).upsert({ key, value });
  if (error) throw new Error(error.message);
};

const kvGet = async (key) => {
  const { data, error } = await serviceSupabase
    .from(KV_TABLE)
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.value;
};

const kvDel = async (key) => {
  const { error } = await serviceSupabase.from(KV_TABLE).delete().eq("key", key);
  if (error) throw new Error(error.message);
};

const kvGetByPrefix = async (prefix) => {
  const { data, error } = await serviceSupabase
    .from(KV_TABLE)
    .select("key, value")
    .like("key", `${prefix}%`);
  if (error) throw new Error(error.message);
  return data?.map((row) => row.value) ?? [];
};

const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const getUserFromToken = async (token) => {
  if (!token) throw new Error("Unauthorized");
  const { data, error } = await serviceSupabase.auth.getUser(token);
  if (error || !data.user) throw new Error("Unauthorized");
  return data.user;
};

const requireUser = async (req) => {
  const authHeader = req.header("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  return getUserFromToken(token);
};

const getConversationId = (userId, friendId) =>
  [userId, friendId].sort().join(":");

const getDmThread = async (userId, friendId) => {
  const key = `dm:${getConversationId(userId, friendId)}`;
  const thread = await kvGet(key);
  if (!thread || !Array.isArray(thread.messages)) {
    return { key, messages: [] };
  }
  return { key, messages: thread.messages };
};

const getRoomChat = async (roomId) => {
  const key = `room-chat:${roomId}`;
  const thread = await kvGet(key);
  if (!thread || !Array.isArray(thread.messages)) {
    return { key, messages: [] };
  }
  return { key, messages: thread.messages };
};

app.post("/auth/signup", async (req, res) => {
  try {
    const { email, password, username, userId, category } = req.body ?? {};
    const { data, error } = await serviceSupabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { username, userId, category },
      email_confirm: true,
    });
    if (error) return res.status(400).json({ error: error.message });

    await kvSet(`user:${data.user.id}`, {
      id: data.user.id,
      email,
      username,
      userId,
      category,
      profileImageUrl: "",
      profileImagePosition: "center",
      dailyGoal: 0,
      weeklyGoal: 0,
      monthlyGoal: 0,
      lastActivityAt: null,
      classes: [],
      preferences: {},
      allowTodoView: false,
      createdAt: new Date().toISOString(),
    });

    return res.json({ success: true, user: data.user });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

app.post("/auth/signin", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    const { data, error } = await anonSupabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return res.status(400).json({ error: error.message });

    const userProfile = await kvGet(`user:${data.user.id}`);
    return res.json({
      success: true,
      accessToken: data.session?.access_token,
      user: userProfile || data.user,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

app.get("/auth/session", async (req, res) => {
  try {
    const user = await requireUser(req);
    const userProfile = await kvGet(`user:${user.id}`);
    return res.json({ user: userProfile || user });
  } catch {
    return res.status(401).json({ error: "Invalid session" });
  }
});

app.post("/auth/signout", (_req, res) => {
  return res.json({ success: true });
});

app.get("/todos", async (req, res) => {
  try {
    const user = await requireUser(req);
    const todos = await kvGetByPrefix(`todo:${user.id}:`);
    return res.json({ todos });
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
});

app.post("/todos", async (req, res) => {
  try {
    const user = await requireUser(req);
    const {
      name,
      subject,
      duration = 0,
      plannedDuration,
      actualDuration,
      shared = false,
    } = req.body ?? {};
    const plannedSeconds = toNumber(plannedDuration, toNumber(duration, 0));
    const actualSeconds = toNumber(actualDuration, 0);
    const todoId = crypto.randomUUID();
    const todo = {
      id: todoId,
      userId: user.id,
      name,
      subject,
      duration: plannedSeconds,
      plannedDuration: plannedSeconds,
      actualDuration: actualSeconds,
      shared: Boolean(shared),
      completed: false,
      createdAt: new Date().toISOString(),
    };
    await kvSet(`todo:${user.id}:${todoId}`, todo);
    return res.json({ todo });
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
});

app.put("/todos/:id", async (req, res) => {
  try {
    const user = await requireUser(req);
    const todoId = req.params.id;
    const existing = await kvGet(`todo:${user.id}:${todoId}`);
    if (!existing) return res.status(404).json({ error: "Todo not found" });
    const plannedSeconds = toNumber(
      req.body?.plannedDuration ?? req.body?.duration ?? existing.plannedDuration ?? existing.duration,
      toNumber(existing.duration, 0)
    );
    const actualSeconds = toNumber(
      req.body?.actualDuration ?? existing.actualDuration,
      0
    );
    const updated = {
      ...existing,
      ...(req.body ?? {}),
      duration: plannedSeconds,
      plannedDuration: plannedSeconds,
      actualDuration: actualSeconds,
      shared: Boolean(req.body?.shared ?? existing.shared),
    };
    await kvSet(`todo:${user.id}:${todoId}`, updated);
    return res.json({ todo: updated });
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
});

app.delete("/todos/:id", async (req, res) => {
  try {
    const user = await requireUser(req);
    const todoId = req.params.id;
    await kvDel(`todo:${user.id}:${todoId}`);
    return res.json({ success: true });
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
});

app.post("/study-time", async (req, res) => {
  try {
    const user = await requireUser(req);
    const { duration = 0, date } = req.body ?? {};
    const dateKey = date || new Date().toISOString().split("T")[0];
    const existing = (await kvGet(`study-time:${user.id}:${dateKey}`)) || { total: 0 };
    existing.total += duration;
    await kvSet(`study-time:${user.id}:${dateKey}`, existing);
    const userProfile = await kvGet(`user:${user.id}`);
    if (userProfile) {
      await kvSet(`user:${user.id}`, {
        ...userProfile,
        lastActivityAt: new Date().toISOString(),
      });
    }
    return res.json({ total: existing.total });
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
});

app.get("/study-time/:date", async (req, res) => {
  try {
    const user = await requireUser(req);
    const date = req.params.date;
    const data = (await kvGet(`study-time:${user.id}:${date}`)) || { total: 0 };
    return res.json(data);
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
});

app.get("/study-groups", async (_req, res) => {
  try {
    const raw = await kvGetByPrefix("study-group:");
    const groups = [];
    for (const group of raw) {
      if (applyNoShowCleanup(group)) await kvSet(`study-group:${group.id}`, group);
      const hostProfile = group.hostId ? await kvGet(`user:${group.hostId}`) : null;
      const hostUsername = hostProfile?.username ?? hostProfile?.email ?? (group.hostId?.slice(0, 8) ?? "—");
      const applicantsWithNames = [];
      for (const id of group.applicants || []) {
        const profile = await kvGet(`user:${id}`);
        applicantsWithNames.push({
          id,
          username: profile?.username ?? profile?.email ?? id.slice(0, 8),
        });
      }
      groups.push({ ...group, hostUsername, applicantsWithNames });
    }
    return res.json({ groups });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

app.get("/study-groups/:id", async (req, res) => {
  try {
    await requireUser(req);
    const groupId = req.params.id;
    const group = await kvGet(`study-group:${groupId}`);
    if (!group) return res.status(404).json({ error: "Group not found" });
    if (applyNoShowCleanup(group)) await kvSet(`study-group:${groupId}`, group);
    const participantsWithNames = [];
    for (const id of group.participants || []) {
      const profile = await kvGet(`user:${id}`);
      participantsWithNames.push({
        id,
        username: profile?.username ?? profile?.email ?? id.slice(0, 8),
      });
    }
    return res.json({ group: { ...group, participantsWithNames } });
  } catch (err) {
    if (String(err?.message).includes("Unauthorized"))
      return res.status(401).json({ error: "Unauthorized" });
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

app.get("/study-groups/:id/presence", async (req, res) => {
  try {
    const user = await requireUser(req);
    const groupId = req.params.id;
    const group = await kvGet(`study-group:${groupId}`);
    if (!group) return res.status(404).json({ error: "Group not found" });
    if (!group.participants?.includes(user.id)) {
      return res.status(403).json({ error: "Not accepted" });
    }
    const presence = (await kvGet(`room-presence:${groupId}`)) || { users: [] };
    return res.json({ presence: presence.users });
  } catch (err) {
    if (String(err?.message).includes("Unauthorized"))
      return res.status(401).json({ error: "Unauthorized" });
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

app.get("/study-groups/:id/chat", async (req, res) => {
  try {
    const user = await requireUser(req);
    const roomId = String(req.params.id || "");
    if (!roomId) return res.status(400).json({ error: "Room id required" });
    const group = await kvGet(`study-group:${roomId}`);
    if (!group) return res.status(404).json({ error: "Group not found" });
    if (!group.participants?.includes(user.id)) {
      return res.status(403).json({ error: "Not accepted" });
    }
    const { messages } = await getRoomChat(roomId);
    return res.json({ messages });
  } catch (err) {
    if (String(err?.message).includes("Unauthorized"))
      return res.status(401).json({ error: "Unauthorized" });
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

app.post("/study-groups/:id/presence", async (req, res) => {
  try {
    const user = await requireUser(req);
    const groupId = req.params.id;
    const group = await kvGet(`study-group:${groupId}`);
    if (!group) return res.status(404).json({ error: "Group not found" });
    const participantIds = group.participants || [];
    const isParticipant = participantIds.includes(user.id);
    if (!isParticipant) {
      return res.status(403).json({ error: "Not accepted" });
    }
    const profile = await kvGet(`user:${user.id}`);
    const username = profile?.username ?? profile?.email ?? user.id?.slice(0, 8) ?? "User";
    const presence = (await kvGet(`room-presence:${groupId}`)) || { users: [] };
    const existing = presence.users.find((u) => u.id === user.id);
    if (!existing) {
      presence.users.push({ id: user.id, username });
    }
    await kvSet(`room-presence:${groupId}`, presence);
    if (!group.participantFirstJoinAt) group.participantFirstJoinAt = {};
    if (!group.participantFirstJoinAt[user.id]) {
      group.participantFirstJoinAt[user.id] = new Date().toISOString();
      await kvSet(`study-group:${groupId}`, group);
    }
    return res.json({ presence: presence.users });
  } catch (err) {
    if (String(err?.message).includes("Unauthorized"))
      return res.status(401).json({ error: "Unauthorized" });
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

const NO_SHOW_MINUTES = 15;

function applyNoShowCleanup(group) {
  if (!group || !group.date || !group.participants?.length) return false;
  const meetingStart = new Date(`${group.date}T${group.time || "00:00"}`);
  const cutoff = new Date(meetingStart.getTime() + NO_SHOW_MINUTES * 60 * 1000);
  if (new Date() < cutoff) return false;
  const firstJoin = group.participantFirstJoinAt || {};
  const before = group.participants.length;
  group.participants = group.participants.filter((id) => firstJoin[id] != null);
  return group.participants.length !== before;
}

app.delete("/study-groups/:id/presence", async (req, res) => {
  try {
    const user = await requireUser(req);
    const groupId = req.params.id;
    let presence = (await kvGet(`room-presence:${groupId}`)) || { users: [] };
    presence.users = (presence.users || []).filter((u) => u.id !== user.id);
    await kvSet(`room-presence:${groupId}`, presence);
    const group = await kvGet(`study-group:${groupId}`);
    if (group && Array.isArray(group.participants)) {
      group.participants = group.participants.filter((id) => id !== user.id);
      await kvSet(`study-group:${groupId}`, group);
    }
    return res.json({ presence: presence.users });
  } catch (err) {
    if (String(err?.message).includes("Unauthorized"))
      return res.status(401).json({ error: "Unauthorized" });
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

app.post("/study-groups", async (req, res) => {
  try {
    const user = await requireUser(req);
    const { location, date, time, topic, maxParticipants = 10, studyType, duration, meetingId } = req.body ?? {};
    const groupId = crypto.randomUUID();
    const group = {
      id: groupId,
      hostId: user.id,
      location: location ?? (meetingId ? "Online (Zoom)" : ""),
      date: date ?? new Date().toISOString().slice(0, 10),
      time: time ?? "00:00",
      topic,
      maxParticipants: maxParticipants ?? 50,
      studyType: studyType ?? (meetingId ? "Online" : "In-person"),
      duration: duration ?? "2 hours",
      participants: [user.id],
      applicants: [],
      createdAt: new Date().toISOString(),
      ...(meetingId ? { meetingId } : {}),
    };
    await kvSet(`study-group:${groupId}`, group);
    return res.json({ group });
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
});

app.post("/study-groups/:id/apply", async (req, res) => {
  try {
    const user = await requireUser(req);
    const groupId = req.params.id;
    const group = await kvGet(`study-group:${groupId}`);
    if (!group) return res.status(404).json({ error: "Group not found" });
    if (group.participants.includes(user.id)) {
      return res.status(400).json({ error: "Already a member" });
    }
    if (!group.applicants.includes(user.id)) {
      group.applicants.push(user.id);
    }
    await kvSet(`study-group:${groupId}`, group);
    return res.json({ success: true, group });
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
});

app.post("/study-groups/:id/manage", async (req, res) => {
  try {
    const user = await requireUser(req);
    const groupId = req.params.id;
    const group = await kvGet(`study-group:${groupId}`);
    if (!group) return res.status(404).json({ error: "Group not found" });
    if (group.hostId !== user.id) return res.status(403).json({ error: "Not authorized" });

    const { applicantId, action } = req.body ?? {};
    if (action === "accept") {
      group.applicants = group.applicants.filter((id) => id !== applicantId);
      if (!group.participants.includes(applicantId)) {
        group.participants.push(applicantId);
      }
    } else if (action === "reject") {
      group.applicants = group.applicants.filter((id) => id !== applicantId);
    }

    await kvSet(`study-group:${groupId}`, group);
    return res.json({ success: true, group });
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
});

app.put("/study-groups/:id", async (req, res) => {
  try {
    const user = await requireUser(req);
    const groupId = req.params.id;
    const group = await kvGet(`study-group:${groupId}`);
    if (!group) return res.status(404).json({ error: "Group not found" });
    if (group.hostId !== user.id) return res.status(403).json({ error: "Not authorized" });
    const { location, date, time, topic, maxParticipants, studyType, duration } = req.body ?? {};
    if (location !== undefined) group.location = location;
    if (date !== undefined) group.date = date;
    if (time !== undefined) group.time = time;
    if (topic !== undefined) group.topic = topic;
    if (studyType !== undefined) group.studyType = studyType;
    if (duration !== undefined) group.duration = duration;
    if (maxParticipants !== undefined) {
      const min = (group.participants || []).length;
      group.maxParticipants = Math.max(min, Number(maxParticipants) || min);
    }
    await kvSet(`study-group:${groupId}`, group);
    return res.json({ group });
  } catch (err) {
    if (String(err?.message).includes("Unauthorized"))
      return res.status(401).json({ error: "Unauthorized" });
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

app.delete("/study-groups/:id", async (req, res) => {
  try {
    const user = await requireUser(req);
    const groupId = req.params.id;
    const group = await kvGet(`study-group:${groupId}`);
    if (!group) return res.status(404).json({ error: "Group not found" });
    if (group.hostId !== user.id) return res.status(403).json({ error: "Not authorized" });
    if (group.meetingId) {
      const meeting = await kvGet(`meeting:${group.meetingId}`);
      if (meeting?.zoomMeetingNumber) {
        try {
          await deleteZoomMeetingViaApi(meeting.zoomMeetingNumber);
        } catch (err) {
          console.warn("Zoom delete meeting failed:", err?.message);
        }
      }
      await kvDel(`meeting:${group.meetingId}`);
    }
    await kvDel(`study-group:${groupId}`);
    return res.json({ success: true });
  } catch (err) {
    if (String(err?.message).includes("Unauthorized")) return res.status(401).json({ error: "Unauthorized" });
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

app.post("/friends/add", async (req, res) => {
  try {
    const user = await requireUser(req);
    const { friendEmail, friendUsername } = req.body ?? {};

    const normalizedUsername = String(friendUsername || "").trim().toLowerCase();
    const normalizedEmail = String(friendEmail || "").trim().toLowerCase();
    if (!normalizedUsername && !normalizedEmail) {
      return res.status(400).json({ error: "Friend identifier is required" });
    }

    const allUsers = await kvGetByPrefix("user:");
    const friend =
      (normalizedUsername
        ? allUsers.find(
            (u) => String(u.username || "").toLowerCase() === normalizedUsername
          )
        : null) ||
      (normalizedEmail
        ? allUsers.find(
            (u) => String(u.email || "").toLowerCase() === normalizedEmail
          )
        : null);
    if (!friend) return res.status(404).json({ error: "User not found" });
    if (friend.id === user.id) {
      return res.status(400).json({ error: "You cannot follow yourself" });
    }

    const existing = await kvGet(`friendship:${user.id}:${friend.id}`);
    if (existing) {
      return res.status(400).json({ error: "Already following this user" });
    }

    await kvSet(`friendship:${user.id}:${friend.id}`, {
      userId: user.id,
      friendId: friend.id,
      createdAt: new Date().toISOString(),
    });

    return res.json({ success: true, friend });
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
});

app.get("/friends", async (req, res) => {
  try {
    const user = await requireUser(req);
    const friendships = await kvGetByPrefix(`friendship:${user.id}:`);
    const friendIds = friendships.map((f) => f.friendId);
    const friends = [];
    for (const friendId of friendIds) {
      const friend = await kvGet(`user:${friendId}`);
      if (friend) friends.push(friend);
    }
    return res.json({ friends });
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
});

app.get("/friends/:id/activity", async (req, res) => {
  try {
    await requireUser(req);
    const friendId = req.params.id;
    const activity = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split("T")[0];
      const data = (await kvGet(`study-time:${friendId}:${dateKey}`)) || { total: 0 };
      activity.push({ date: dateKey, total: data.total });
    }
    return res.json({ activity });
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
});

// ============================================
// AI Study Assistant - Session Management
// ============================================

// Helper function to process file content
const processFileContent = async (file) => {
  let content = "";
  let fileType = "text";
  let base64Data = null;
  
  // Handle Image files
  if (file.mimetype.startsWith("image/")) {
    console.log(`Processing image: ${file.originalname}, mimetype: ${file.mimetype}, size: ${file.buffer.length} bytes`);
    
    fileType = "image";
    let processedBuffer = file.buffer;
    const MAX_DIMENSION = 2048;
    
    const metadata = await sharp(file.buffer).metadata();
    console.log(`Image dimensions: ${metadata.width}x${metadata.height}`);
    
    if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
      console.log(`Resizing image to fit within ${MAX_DIMENSION}x${MAX_DIMENSION}...`);
      processedBuffer = await sharp(file.buffer)
        .resize(MAX_DIMENSION, MAX_DIMENSION, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 85 })
        .toBuffer();
      console.log(`Resized image size: ${processedBuffer.length} bytes`);
    }
    
    base64Data = processedBuffer.toString("base64");
    console.log("Calling OpenAI Vision API...");
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Please analyze this image and extract all text, diagrams, charts, and educational content. Describe everything in detail as if creating study notes from this image. Provide all responses in English only."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Data}`,
                detail: "high"
              }
            }
          ]
        }
      ],
      max_tokens: 2000
    });
    
    content = response.choices[0].message.content;
    console.log("Image analysis completed successfully");
  }
  // Handle Audio files
  else if (file.mimetype.startsWith("audio/") || file.mimetype === "video/mp4" || file.mimetype === "video/webm") {
    fileType = "audio";
    const transcription = await openai.audio.transcriptions.create({
      file: new File([file.buffer], file.originalname, { type: file.mimetype }),
      model: "whisper-1",
    });
    content = transcription.text;
  }
  // Parse PDF files
  else if (file.mimetype === "application/pdf" || file.originalname.endsWith(".pdf")) {
    const pdfData = await pdfParse(file.buffer);
    content = pdfData.text;
  } 
  // Handle text files
  else if (file.mimetype === "text/plain" || file.originalname.endsWith(".txt")) {
    content = file.buffer.toString("utf-8");
  }
  // Handle markdown files
  else if (file.originalname.endsWith(".md")) {
    content = file.buffer.toString("utf-8");
  }
  // Try other document types
  else if (
    file.mimetype.includes("text") || 
    file.originalname.endsWith(".doc") ||
    file.originalname.endsWith(".docx")
  ) {
    content = file.buffer.toString("utf-8");
  }
  else {
    throw new Error("Unsupported file type. Please upload text, PDF, image, or audio files.");
  }

  if (!content || content.trim().length === 0) {
    throw new Error("File is empty or unreadable");
  }

  return { content, fileType, base64Data };
};

// Create a new study session
app.post("/ai/sessions", async (req, res) => {
  try {
    const user = await requireUser(req);
    
    // Check session count and delete oldest if >= 5
    const allSessions = await kvGetByPrefix(`ai-session:${user.id}:`);
    if (allSessions.length >= 5) {
      // Sort by createdAt and delete oldest
      const sorted = allSessions.sort((a, b) => 
        new Date(a.createdAt) - new Date(b.createdAt)
      );
      const oldest = sorted[0];
      await kvDel(`ai-session:${user.id}:${oldest.id}`);
      console.log(`Deleted oldest session: ${oldest.id}`);
    }

    const sessionId = crypto.randomUUID();
    const now = new Date();
    const sessionName = `Study Session - ${now.toLocaleDateString('en-US', { 
      month: 'short', day: 'numeric', year: 'numeric', 
      hour: '2-digit', minute: '2-digit' 
    })}`;

    const session = {
      id: sessionId,
      userId: user.id,
      name: sessionName,
      files: [],
      studentChatHistory: [],
      teachChatHistory: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    await kvSet(`ai-session:${user.id}:${sessionId}`, session);
    await kvSet(`active-session:${user.id}`, sessionId);

    return res.json({ success: true, session });
  } catch (err) {
    console.error("Session creation error:", err);
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

// Get all sessions for user (recent 5)
app.get("/ai/sessions", async (req, res) => {
  try {
    const user = await requireUser(req);
    const sessions = await kvGetByPrefix(`ai-session:${user.id}:`);
    
    // Sort by updatedAt (most recent first) and take 5
    const sorted = sessions
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 5)
      .map(s => ({
        id: s.id,
        name: s.name,
        fileCount: s.files?.length || 0,
        messageCount: (s.studentChatHistory?.length || 0) + (s.teachChatHistory?.length || 0),
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }));

    return res.json({ sessions: sorted });
  } catch (err) {
    if (String(err?.message).includes("Unauthorized"))
      return res.status(401).json({ error: "Unauthorized" });
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

// Get specific session details
app.get("/ai/sessions/:id", async (req, res) => {
  try {
    const user = await requireUser(req);
    const sessionId = req.params.id;
    const session = await kvGet(`ai-session:${user.id}:${sessionId}`);
    
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    return res.json({ session });
  } catch (err) {
    if (String(err?.message).includes("Unauthorized"))
      return res.status(401).json({ error: "Unauthorized" });
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

// Get friend's shared todos
app.get("/friends/:id/todos", async (req, res) => {
  try {
    await requireUser(req);
    const friendId = req.params.id;
    const friendProfile = await kvGet(`user:${friendId}`);
    if (!friendProfile) return res.status(404).json({ error: "User not found" });
    if (!friendProfile.allowTodoView) {
      return res.status(403).json({ error: "Todo sharing is disabled" });
    }
    const todos = await kvGetByPrefix(`todo:${friendId}:`);
    const sharedTodos = (todos || []).filter((todo) => todo.shared);
    return res.json({ todos: sharedTodos });
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
});

// Get active session
app.get("/ai/sessions/active/current", async (req, res) => {
  try {
    const user = await requireUser(req);
    const activeSessionId = await kvGet(`active-session:${user.id}`);
    
    if (!activeSessionId) {
      return res.json({ session: null });
    }

    const session = await kvGet(`ai-session:${user.id}:${activeSessionId}`);
    return res.json({ session: session || null });
  } catch (err) {
    if (String(err?.message).includes("Unauthorized"))
      return res.status(401).json({ error: "Unauthorized" });
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

// Set active session
app.post("/ai/sessions/:id/activate", async (req, res) => {
  try {
    const user = await requireUser(req);
    const sessionId = req.params.id;
    const session = await kvGet(`ai-session:${user.id}:${sessionId}`);
    
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    await kvSet(`active-session:${user.id}`, sessionId);
    return res.json({ success: true, session });
  } catch (err) {
    if (String(err?.message).includes("Unauthorized"))
      return res.status(401).json({ error: "Unauthorized" });
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

// Delete a session
app.delete("/ai/sessions/:id", async (req, res) => {
  try {
    const user = await requireUser(req);
    const sessionId = req.params.id;
    
    await kvDel(`ai-session:${user.id}:${sessionId}`);
    
    // If this was the active session, clear it
    const activeSessionId = await kvGet(`active-session:${user.id}`);
    if (activeSessionId === sessionId) {
      await kvDel(`active-session:${user.id}`);
    }

    return res.json({ success: true });
  } catch (err) {
    if (String(err?.message).includes("Unauthorized"))
      return res.status(401).json({ error: "Unauthorized" });
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

// Upload file to session (max 3 files)
app.post("/ai/sessions/:id/upload", upload.single("file"), async (req, res) => {
  try {
    const user = await requireUser(req);
    const sessionId = req.params.id;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const session = await kvGet(`ai-session:${user.id}:${sessionId}`);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Check file limit
    if (session.files.length >= 3) {
      return res.status(400).json({ error: "Maximum 3 files per session" });
    }

    try {
      const { content, fileType, base64Data } = await processFileContent(file);
      
      const fileId = crypto.randomUUID();
      const fileData = {
        id: fileId,
        fileName: file.originalname,
        fileType: fileType,
        content: content,
        uploadedAt: new Date().toISOString(),
      };

      if (base64Data && fileType === "image") {
        fileData.base64Data = base64Data;
        fileData.mimeType = file.mimetype;
      }

      session.files.push(fileData);
      session.updatedAt = new Date().toISOString();
      
      await kvSet(`ai-session:${user.id}:${sessionId}`, session);

      return res.json({ 
        success: true, 
        file: {
          id: fileId,
          fileName: file.originalname,
          fileType: fileType,
          preview: content.substring(0, 200)
        },
        session: {
          id: session.id,
          fileCount: session.files.length
        }
      });
    } catch (err) {
      console.error("File processing error:", err);
      return res.status(400).json({ error: err.message });
    }
  } catch (err) {
    console.error("Upload error:", err);
    if (String(err?.message).includes("Unauthorized"))
      return res.status(401).json({ error: "Unauthorized" });
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

// Delete file from session
app.delete("/ai/sessions/:sessionId/files/:fileId", async (req, res) => {
  try {
    const user = await requireUser(req);
    const { sessionId, fileId } = req.params;
    
    const session = await kvGet(`ai-session:${user.id}:${sessionId}`);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    session.files = session.files.filter(f => f.id !== fileId);
    session.updatedAt = new Date().toISOString();
    
    await kvSet(`ai-session:${user.id}:${sessionId}`, session);

    return res.json({ success: true, fileCount: session.files.length });
  } catch (err) {
    if (String(err?.message).includes("Unauthorized"))
      return res.status(401).json({ error: "Unauthorized" });
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

// AI Study Assistant - Chat with session history
app.post("/ai/sessions/:id/chat", async (req, res) => {
  try {
    const user = await requireUser(req);
    const sessionId = req.params.id;
    const { message, mode = "student", phase = "teaching" } = req.body ?? {};

    if (!message) {
      return res.status(400).json({ error: "No message provided" });
    }

    const session = await kvGet(`ai-session:${user.id}:${sessionId}`);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Build context from session files
    let filesContext = "";
    if (session.files && session.files.length > 0) {
      filesContext = session.files
        .map(f => `[File: ${f.fileName}]\n${f.content.substring(0, 2000)}`)
        .join("\n\n");
    }

    let systemPrompt = "";
    
    if (mode === "student") {
      if (filesContext) {
        systemPrompt = `You are a helpful study assistant. Always respond in English only. The student has uploaded the following study materials:\n\n${filesContext}\n\nBased on these materials, help the student understand the concepts. Answer their questions clearly and provide explanations. If they ask questions outside the scope of the material, let them know and still try to help.`;
      } else {
        systemPrompt = "You are a helpful study assistant. Always respond in English only. The student hasn't uploaded any material yet, but you can still help them with general study questions. Encourage them to upload their study materials for more specific help.";
      }
    } else if (mode === "teach") {
      if (phase === "teaching") {
        // Teaching Phase: Evaluate student's explanation with scoring
        if (filesContext) {
          systemPrompt = `You are an educational evaluator. Always respond in English only. The student has uploaded these study materials:\n\n${filesContext}\n\nThe student will explain the concepts from these materials. Your role is to:

1. **Compare** their explanation with the actual file content
2. **Score** their understanding from 0-10
3. **Identify** what they explained correctly ✅
4. **Point out** what they misunderstood or explained incorrectly ❌
5. **Highlight** important parts from the files they missed ⚠️
6. **Provide** specific feedback on how to improve

Format your response as:
⭐ Score: X/10

✅ Correct parts:
- [list what they got right]

❌ Incorrect/Incomplete parts:
- [list what needs correction]

⚠️ Missing key concepts (from the files):
- [list important parts they didn't mention]

💡 Suggestions:
- [how to improve their explanation]

Encourage them to explain again with improvements to get a higher score. When they reach 9-10/10, congratulate them and suggest they're ready for the Quiz Phase!`;
        } else {
          systemPrompt = "You are an educational evaluator. Always respond in English only. The student will explain concepts to you. Since no study materials are uploaded, evaluate based on general knowledge. Provide a score out of 10 and constructive feedback on their explanation.";
        }
      } else if (phase === "quiz") {
        // Quiz Phase: AI asks questions and validates answers
        if (filesContext) {
          systemPrompt = `You are a quiz master. Always respond in English only. You have access to these study materials:\n\n${filesContext}\n\nYour role is to:

**When asking questions:**
- Ask ONE clear question at a time based on the uploaded materials
- Focus on key concepts, formulas, or important details from the files
- Make questions specific and measurable
- Number your questions (Q1, Q2, etc.)

**When evaluating answers:**
- Check if the student's answer is correct based on the file content
- Respond with: "✅ Correct!" or "❌ Incorrect"
- If correct: Provide brief positive reinforcement and ask the next question
- If incorrect: Show the correct answer from the files and explain why
- After 3-5 questions, summarize their performance

Keep questions challenging but fair. Base everything on the actual file content.`;
        } else {
          systemPrompt = "You are a quiz master. Always respond in English only. Since no study materials are uploaded, you can ask general knowledge questions. Evaluate student answers and provide correct answers when they're wrong.";
        }
      }
    }

    // Determine which chat history to use based on mode
    const chatHistoryKey = mode === "teach" ? "teachChatHistory" : "studentChatHistory";
    
    // Initialize chat history arrays if they don't exist (for old sessions)
    if (!session.studentChatHistory) session.studentChatHistory = [];
    if (!session.teachChatHistory) session.teachChatHistory = [];
    
    const chatHistory = session[chatHistoryKey];

    // Build messages array with chat history
    const messages = [
      { role: "system", content: systemPrompt }
    ];

    // Add previous chat history for this mode
    if (chatHistory.length > 0) {
      chatHistory.forEach(msg => {
        messages.push({ role: msg.role, content: msg.content });
      });
    }

    // Add current user message
    messages.push({ role: "user", content: message });

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      temperature: 0.7,
      max_tokens: 1000,
    });

    const aiResponse = completion.choices[0].message.content;

    // Save to appropriate chat history
    session[chatHistoryKey].push({
      role: "user",
      content: message,
      timestamp: new Date().toISOString()
    });
    session[chatHistoryKey].push({
      role: "assistant",
      content: aiResponse,
      timestamp: new Date().toISOString()
    });
    session.updatedAt = new Date().toISOString();

    await kvSet(`ai-session:${user.id}:${sessionId}`, session);

    return res.json({ 
      success: true,
      response: aiResponse,
      messageCount: session.studentChatHistory.length + session.teachChatHistory.length
    });
  } catch (err) {
    console.error("Chat error:", err);
    if (String(err?.message).includes("Unauthorized"))
      return res.status(401).json({ error: "Unauthorized" });
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

// Legacy chat endpoint (for backward compatibility)
app.post("/ai/chat", async (req, res) => {
  try {
    const user = await requireUser(req);
    const { message, mode = "student" } = req.body ?? {};

    if (!message) {
      return res.status(400).json({ error: "No message provided" });
    }

    // Get active material
    const activeMaterialId = await kvGet(`active-material:${user.id}`);
    let studyMaterial = null;
    
    if (activeMaterialId) {
      studyMaterial = await kvGet(`study-material:${user.id}:${activeMaterialId}`);
    }

    let systemPrompt = "";
    
    if (mode === "student") {
      if (studyMaterial) {
        systemPrompt = `You are a helpful study assistant. Always respond in English only. The student has uploaded the following study material:\n\n${studyMaterial.content.substring(0, 3000)}\n\nBased on this material, help the student understand the concepts. Answer their questions clearly and provide explanations. If they ask questions outside the scope of the material, let them know and still try to help.`;
      } else {
        systemPrompt = "You are a helpful study assistant. Always respond in English only. The student hasn't uploaded any material yet, but you can still help them with general study questions. Encourage them to upload their study materials for more specific help.";
      }
    } else if (mode === "teach") {
      systemPrompt = "You are a study assistant evaluating a student's explanation. Always respond in English only. Provide constructive feedback on their understanding. Point out what they explained well and what could be improved. Rate their understanding out of 10 and encourage them to keep learning.";
    }

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const aiResponse = completion.choices[0].message.content;

    return res.json({ 
      success: true,
      response: aiResponse 
    });
  } catch (err) {
    console.error("Chat error:", err);
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

// AI Study Assistant - Voice Chat with session
app.post("/ai/sessions/:id/voice-chat", upload.single("audio"), async (req, res) => {
  try {
    const user = await requireUser(req);
    const sessionId = req.params.id;
    const audioFile = req.file;
    const { mode = "student", phase = "teaching" } = req.body ?? {};

    if (!audioFile) {
      return res.status(400).json({ error: "No audio file provided" });
    }

    const session = await kvGet(`ai-session:${user.id}:${sessionId}`);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    console.log(`Processing voice chat: ${audioFile.originalname}, size: ${audioFile.buffer.length} bytes`);

    // Step 1: Transcribe audio to text using Whisper
    let userMessage = "";
    try {
      console.log("Transcribing audio with Whisper...");
      const transcription = await openai.audio.transcriptions.create({
        file: new File([audioFile.buffer], audioFile.originalname || "audio.webm", { 
          type: audioFile.mimetype 
        }),
        model: "whisper-1",
      });
      userMessage = transcription.text;
      console.log("Transcription:", userMessage);
    } catch (err) {
      console.error("Transcription error:", err);
      return res.status(400).json({ error: "Failed to transcribe audio" });
    }

    // Step 2: Build context from session files
    let filesContext = "";
    if (session.files && session.files.length > 0) {
      filesContext = session.files
        .map(f => `[File: ${f.fileName}]\n${f.content.substring(0, 2000)}`)
        .join("\n\n");
    }

    let systemPrompt = "";
    
    if (mode === "student") {
      if (filesContext) {
        systemPrompt = `You are a helpful study assistant. Always respond in English only. The student has uploaded the following study materials:\n\n${filesContext}\n\nBased on these materials, help the student understand the concepts. Answer their questions clearly and provide explanations.`;
      } else {
        systemPrompt = "You are a helpful study assistant. Always respond in English only. The student hasn't uploaded any material yet, but you can still help them with general study questions.";
      }
    } else if (mode === "teach") {
      if (phase === "teaching") {
        if (filesContext) {
          systemPrompt = `You are an educational evaluator. Always respond in English only. The student has uploaded these study materials:\n\n${filesContext}\n\nEvaluate their explanation with a score (X/10), identify correct parts, incorrect parts, and missing key concepts from the files. Be encouraging and specific.`;
        } else {
          systemPrompt = "You are an educational evaluator. Always respond in English only. Evaluate the student's explanation with a score out of 10 and constructive feedback.";
        }
      } else if (phase === "quiz") {
        if (filesContext) {
          systemPrompt = `You are a quiz master. Always respond in English only. Ask ONE question based on:\n\n${filesContext}\n\nOr evaluate their answer with "✅ Correct!" or "❌ Incorrect" and provide the right answer from the files.`;
        } else {
          systemPrompt = "You are a quiz master. Always respond in English only. Ask questions or evaluate answers based on general knowledge.";
        }
      }
    }

    // Determine which chat history to use based on mode
    const chatHistoryKey = mode === "teach" ? "teachChatHistory" : "studentChatHistory";
    
    // Initialize chat history arrays if they don't exist (for old sessions)
    if (!session.studentChatHistory) session.studentChatHistory = [];
    if (!session.teachChatHistory) session.teachChatHistory = [];
    
    const chatHistory = session[chatHistoryKey];

    // Build messages with history
    const messages = [{ role: "system", content: systemPrompt }];
    
    if (chatHistory.length > 0) {
      chatHistory.forEach(msg => {
        messages.push({ role: msg.role, content: msg.content });
      });
    }
    
    messages.push({ role: "user", content: userMessage });

    console.log("Getting AI response...");
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      temperature: 0.7,
      max_tokens: 1000,
    });

    const aiResponseText = completion.choices[0].message.content;
    console.log("AI Response:", aiResponseText.substring(0, 100) + "...");

    // Step 3: Convert AI response to speech using TTS
    console.log("Converting response to speech...");
    const mp3Response = await openai.audio.speech.create({
      model: "tts-1",
      voice: "nova",
      input: aiResponseText,
    });

    const audioBuffer = Buffer.from(await mp3Response.arrayBuffer());
    console.log(`TTS audio generated: ${audioBuffer.length} bytes`);

    // Save to appropriate chat history
    session[chatHistoryKey].push({
      role: "user",
      content: userMessage,
      timestamp: new Date().toISOString()
    });
    session[chatHistoryKey].push({
      role: "assistant",
      content: aiResponseText,
      timestamp: new Date().toISOString()
    });
    session.updatedAt = new Date().toISOString();

    await kvSet(`ai-session:${user.id}:${sessionId}`, session);

    // Return both text and audio
    return res.json({
      success: true,
      userMessage: userMessage,
      aiResponse: aiResponseText,
      audioBase64: audioBuffer.toString("base64"),
      messageCount: session.studentChatHistory.length + session.teachChatHistory.length
    });
  } catch (err) {
    console.error("Voice chat error:", err);
    if (String(err?.message).includes("Unauthorized"))
      return res.status(401).json({ error: "Unauthorized" });
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

// Legacy voice chat endpoint (for backward compatibility)
app.post("/ai/voice-chat", upload.single("audio"), async (req, res) => {
  try {
    const user = await requireUser(req);
    const audioFile = req.file;
    const { mode = "student" } = req.body ?? {};

    if (!audioFile) {
      return res.status(400).json({ error: "No audio file provided" });
    }

    console.log(`Processing voice chat: ${audioFile.originalname}, size: ${audioFile.buffer.length} bytes`);

    // Step 1: Transcribe audio to text using Whisper
    let userMessage = "";
    try {
      console.log("Transcribing audio with Whisper...");
      const transcription = await openai.audio.transcriptions.create({
        file: new File([audioFile.buffer], audioFile.originalname || "audio.webm", { 
          type: audioFile.mimetype 
        }),
        model: "whisper-1",
      });
      userMessage = transcription.text;
      console.log("Transcription:", userMessage);
    } catch (err) {
      console.error("Transcription error:", err);
      return res.status(400).json({ error: "Failed to transcribe audio" });
    }

    // Step 2: Get AI response using the same logic as text chat
    const activeMaterialId = await kvGet(`active-material:${user.id}`);
    let studyMaterial = null;
    
    if (activeMaterialId) {
      studyMaterial = await kvGet(`study-material:${user.id}:${activeMaterialId}`);
    }

    let systemPrompt = "";
    
    if (mode === "student") {
      if (studyMaterial) {
        systemPrompt = `You are a helpful study assistant. Always respond in English only. The student has uploaded the following study material:\n\n${studyMaterial.content.substring(0, 3000)}\n\nBased on this material, help the student understand the concepts. Answer their questions clearly and provide explanations. If they ask questions outside the scope of the material, let them know and still try to help.`;
      } else {
        systemPrompt = "You are a helpful study assistant. Always respond in English only. The student hasn't uploaded any material yet, but you can still help them with general study questions. Encourage them to upload their study materials for more specific help.";
      }
    } else if (mode === "teach") {
      systemPrompt = "You are a study assistant evaluating a student's explanation. Always respond in English only. Provide constructive feedback on their understanding. Point out what they explained well and what could be improved. Rate their understanding out of 10 and encourage them to keep learning.";
    }

    console.log("Getting AI response...");
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const aiResponseText = completion.choices[0].message.content;
    console.log("AI Response:", aiResponseText.substring(0, 100) + "...");

    // Step 3: Convert AI response to speech using TTS
    console.log("Converting response to speech...");
    const mp3Response = await openai.audio.speech.create({
      model: "tts-1",
      voice: "nova",
      input: aiResponseText,
    });

    const audioBuffer = Buffer.from(await mp3Response.arrayBuffer());
    console.log(`TTS audio generated: ${audioBuffer.length} bytes`);

    // Return both text and audio
    return res.json({
      success: true,
      userMessage: userMessage,
      aiResponse: aiResponseText,
      audioBase64: audioBuffer.toString("base64"),
    });
  } catch (err) {
    console.error("Voice chat error:", err);
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

// Generate quiz questions for a session
app.post("/ai/sessions/:id/generate-quiz", async (req, res) => {
  try {
    const user = await requireUser(req);
    const sessionId = req.params.id;
    const { count = 10, difficulty = "medium" } = req.body || {};

    const session = await kvGet(`ai-session:${user.id}:${sessionId}`);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Build context from session files
    let filesContext = "";
    if (session.files && session.files.length > 0) {
      filesContext = session.files
        .map(f => `[File: ${f.fileName}]\n${f.content.substring(0, 3000)}`)
        .join("\n\n");
    }

    // Difficulty-specific instructions
    const difficultyInstructions = {
      easy: "Make the questions straightforward and test basic understanding of key terms and main concepts. Use simple language.",
      medium: "Make the questions moderately challenging, testing both understanding and application of concepts. Balance between recall and analysis.",
      hard: "Make the questions challenging, requiring deep understanding, critical thinking, and ability to apply concepts in new contexts. Include complex scenarios."
    };

    const difficultyInstruction = difficultyInstructions[difficulty.toLowerCase()] || difficultyInstructions.medium;

    const quizPrompt = filesContext
      ? `Based on the following study materials, generate exactly ${count} multiple-choice questions. Each question should test understanding of key concepts from the materials.

Study Materials:
${filesContext}

Generate the questions in this EXACT JSON format (respond ONLY with valid JSON, no additional text):
{
  "questions": [
    {
      "id": 1,
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "Brief explanation of why this is correct"
    }
  ]
}

Requirements:
- Exactly ${count} questions
- Each question has 4 options (A, B, C, D)
- correctAnswer is the index (0, 1, 2, or 3)
- Questions should cover different topics from the materials
- Difficulty level: ${difficulty.toUpperCase()} - ${difficultyInstruction}
- Always respond in English only`
      : `Generate ${count} general knowledge multiple-choice questions in this EXACT JSON format (respond ONLY with valid JSON):
{
  "questions": [
    {
      "id": 1,
      "question": "Question text?",
      "options": ["A", "B", "C", "D"],
      "correctAnswer": 0,
      "explanation": "Why this is correct"
    }
  ]
}

Difficulty: ${difficulty.toUpperCase()} - ${difficultyInstruction}`;

    console.log("Generating quiz questions...");
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a quiz generator. Always respond with valid JSON only, no additional text. Ensure all strings are properly escaped." },
        { role: "user", content: quizPrompt }
      ],
      temperature: 0.8,
      max_tokens: 2500,
      response_format: { type: "json_object" }
    });

    let quizData;
    try {
      const responseText = completion.choices[0].message.content;
      console.log("Quiz response received, parsing...");
      quizData = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse quiz JSON:", parseError);
      console.error("Raw response:", completion.choices[0].message.content?.substring(0, 500));
      return res.status(500).json({ error: "Failed to generate valid quiz format" });
    }

    console.log(`Generated ${quizData.questions?.length || 0} questions`);

    // Save quiz to session
    session.quizData = quizData;
    session.quizSettings = { count, difficulty };
    session.updatedAt = new Date().toISOString();
    await kvSet(`ai-session:${user.id}:${sessionId}`, session);

    return res.json({
      success: true,
      quiz: quizData
    });
  } catch (err) {
    console.error("Quiz generation error:", err);
    if (String(err?.message).includes("Unauthorized"))
      return res.status(401).json({ error: "Unauthorized" });
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

// Delete a session
app.delete("/ai/sessions/:id", async (req, res) => {
  try {
    const user = await requireUser(req);
    const sessionId = req.params.id;
    const sessionKey = `ai-session:${user.id}:${sessionId}`;

    // Check if session exists
    const session = await kvGet(sessionKey);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Delete the session
    await kvDel(sessionKey);

    // If this was the active session, clear it
    const activeSessionId = await kvGet(`active-session:${user.id}`);
    if (activeSessionId === sessionId) {
      await kvDel(`active-session:${user.id}`);
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Delete session error:", err);
    if (String(err?.message).includes("Unauthorized"))
      return res.status(401).json({ error: "Unauthorized" });
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

// ============================================
// Group Quiz APIs
// ============================================

// Upload file to group quiz (max = maxParticipants)
app.post("/study-groups/:groupId/quiz/upload", upload.single("file"), async (req, res) => {
  try {
    const user = await requireUser(req);
    const { groupId } = req.params;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Get group info to check max participants
    const group = await kvGet(`study-group:${groupId}`);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Get or create quiz data for this group
    let quizSession = await kvGet(`group-quiz:${groupId}`);
    if (!quizSession) {
      quizSession = {
        groupId,
        files: [],
        quiz: null,
        answers: {}, // userId -> [answers]
        createdAt: new Date().toISOString(),
      };
    }

    // Check file limit
    if (quizSession.files.length >= group.maxParticipants) {
      return res.status(400).json({ error: `Maximum ${group.maxParticipants} files allowed` });
    }

    // Process file based on type
    const fileId = crypto.randomUUID();
    const fileName = file.originalname;
    const fileType = file.mimetype;
    let content = "";

    try {
      if (fileType === 'application/pdf') {
        const pdfData = await pdfParse(file.buffer);
        content = pdfData.text;
      } else if (fileType.startsWith('image/')) {
        const resizedBuffer = await sharp(file.buffer).resize(800).toBuffer();
        const base64Image = resizedBuffer.toString('base64');
        const imageUrl = `data:${fileType};base64,${base64Image}`;
        
        const visionResponse = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{
            role: "user",
            content: [
              { type: "text", text: "Extract all text from this image. If there's no text, describe what you see." },
              { type: "image_url", image_url: { url: imageUrl } }
            ]
          }],
          max_tokens: 1000,
        });
        content = visionResponse.choices[0].message.content || "";
      } else if (fileType.startsWith('audio/')) {
        const audioTranscription = await openai.audio.transcriptions.create({
          file: new File([file.buffer], fileName, { type: fileType }),
          model: "whisper-1",
        });
        content = audioTranscription.text;
      } else {
        content = file.buffer.toString('utf-8');
      }
    } catch (err) {
      console.error("File processing error:", err);
      return res.status(500).json({ error: "Failed to process file" });
    }

    // Add file to quiz session
    const fileData = {
      id: fileId,
      fileName,
      fileType,
      content,
      uploadedBy: user.id,
      uploadedAt: new Date().toISOString(),
    };

    quizSession.files.push(fileData);
    quizSession.updatedAt = new Date().toISOString();
    await kvSet(`group-quiz:${groupId}`, quizSession);

    return res.json({
      success: true,
      file: { id: fileId, fileName, fileType },
      fileCount: quizSession.files.length,
      maxFiles: group.maxParticipants,
    });
  } catch (err) {
    console.error("Group quiz upload error:", err);
    if (String(err?.message).includes("Unauthorized"))
      return res.status(401).json({ error: "Unauthorized" });
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

// Get group quiz files
app.get("/study-groups/:groupId/quiz/files", async (req, res) => {
  try {
    await requireUser(req);
    const { groupId } = req.params;

    const quizSession = await kvGet(`group-quiz:${groupId}`);
    if (!quizSession) {
      return res.json({ files: [] });
    }

    const filesWithoutContent = quizSession.files.map(f => ({
      id: f.id,
      fileName: f.fileName,
      fileType: f.fileType,
      uploadedAt: f.uploadedAt,
    }));

    return res.json({ files: filesWithoutContent });
  } catch (err) {
    if (String(err?.message).includes("Unauthorized"))
      return res.status(401).json({ error: "Unauthorized" });
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

// Generate group quiz
app.post("/study-groups/:groupId/quiz/generate", async (req, res) => {
  try {
    await requireUser(req);
    const { groupId } = req.params;
    const { count = 10, difficulty = "medium" } = req.body || {};

    const quizSession = await kvGet(`group-quiz:${groupId}`);
    if (!quizSession || !quizSession.files || quizSession.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded for this quiz" });
    }

    // Build context from files
    const filesContext = quizSession.files
      .map(f => `[File: ${f.fileName}]\n${f.content.substring(0, 3000)}`)
      .join("\n\n");

    const difficultyInstructions = {
      easy: "Make the questions straightforward and test basic understanding of key terms and main concepts. Use simple language.",
      medium: "Make the questions moderately challenging, testing both understanding and application of concepts. Balance between recall and analysis.",
      hard: "Make the questions challenging, requiring deep understanding, critical thinking, and ability to apply concepts in new contexts. Include complex scenarios."
    };

    const difficultyInstruction = difficultyInstructions[difficulty.toLowerCase()] || difficultyInstructions.medium;

    const quizPrompt = `Based on the following study materials, generate exactly ${count} multiple-choice questions. Each question should test understanding of key concepts from the materials.

Study Materials:
${filesContext}

Generate the questions in this EXACT JSON format (respond ONLY with valid JSON, no additional text):
{
  "questions": [
    {
      "id": 1,
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "Brief explanation of why this is correct"
    }
  ]
}

Requirements:
- Exactly ${count} questions
- Each question has 4 options (A, B, C, D)
- correctAnswer is the index (0, 1, 2, or 3)
- Questions should cover different topics from the materials
- Difficulty level: ${difficulty.toUpperCase()} - ${difficultyInstruction}
- Always respond in English only`;

    console.log("Generating group quiz questions...");
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a quiz generator. Always respond with valid JSON only, no additional text. Ensure all strings are properly escaped." },
        { role: "user", content: quizPrompt }
      ],
      temperature: 0.8,
      max_tokens: 2500,
      response_format: { type: "json_object" }
    });

    let quizData;
    try {
      const responseText = completion.choices[0].message.content;
      quizData = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse quiz JSON:", parseError);
      return res.status(500).json({ error: "Failed to generate valid quiz format" });
    }

    // Save quiz to session
    quizSession.quiz = quizData;
    quizSession.quizSettings = { count, difficulty };
    quizSession.answers = {}; // Reset answers
    quizSession.updatedAt = new Date().toISOString();
    await kvSet(`group-quiz:${groupId}`, quizSession);

    console.log(`Generated ${quizData.questions?.length || 0} questions for group ${groupId}`);

    return res.json({
      success: true,
      quiz: quizData
    });
  } catch (err) {
    console.error("Group quiz generation error:", err);
    if (String(err?.message).includes("Unauthorized"))
      return res.status(401).json({ error: "Unauthorized" });
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

// Get group quiz
app.get("/study-groups/:groupId/quiz", async (req, res) => {
  try {
    await requireUser(req);
    const { groupId } = req.params;

    const quizSession = await kvGet(`group-quiz:${groupId}`);
    if (!quizSession || !quizSession.quiz) {
      return res.json({ quiz: null });
    }

    return res.json({ quiz: quizSession.quiz });
  } catch (err) {
    if (String(err?.message).includes("Unauthorized"))
      return res.status(401).json({ error: "Unauthorized" });
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

// Submit group quiz answer
app.post("/study-groups/:groupId/quiz/answer", async (req, res) => {
  try {
    const user = await requireUser(req);
    const { groupId } = req.params;
    const { questionId, answer } = req.body;

    if (questionId === undefined || answer === undefined) {
      return res.status(400).json({ error: "Missing questionId or answer" });
    }

    const quizSession = await kvGet(`group-quiz:${groupId}`);
    if (!quizSession || !quizSession.quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    // Initialize user answers if not exists
    if (!quizSession.answers[user.id]) {
      quizSession.answers[user.id] = {};
    }

    // Save answer
    quizSession.answers[user.id][questionId] = answer;
    quizSession.updatedAt = new Date().toISOString();
    await kvSet(`group-quiz:${groupId}`, quizSession);

    return res.json({ success: true });
  } catch (err) {
    if (String(err?.message).includes("Unauthorized"))
      return res.status(401).json({ error: "Unauthorized" });
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

// Get quiz completion status
app.get("/study-groups/:groupId/quiz/completion", async (req, res) => {
  try {
    await requireUser(req);
    const { groupId } = req.params;

    const quizSession = await kvGet(`group-quiz:${groupId}`);
    if (!quizSession || !quizSession.quiz) {
      return res.json({ completed: 0, total: 0, allCompleted: false });
    }

    // Get current presence
    const presence = await kvGet(`room-presence:${groupId}`);
    const currentUsers = presence?.users || [];
    const totalUsers = currentUsers.length;

    if (totalUsers === 0) {
      return res.json({ completed: 0, total: 0, allCompleted: false });
    }

    // Count how many users completed the quiz
    const totalQuestions = quizSession.quiz.questions.length;
    const allAnswers = quizSession.answers || {};
    
    let completedCount = 0;
    currentUsers.forEach((user) => {
      const userAnswers = allAnswers[user.id];
      if (userAnswers && Object.keys(userAnswers).length === totalQuestions) {
        completedCount++;
      }
    });

    const allCompleted = completedCount === totalUsers;

    return res.json({
      completed: completedCount,
      total: totalUsers,
      allCompleted,
    });
  } catch (err) {
    console.error("Get completion status error:", err);
    if (String(err?.message).includes("Unauthorized"))
      return res.status(401).json({ error: "Unauthorized" });
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

// Get group quiz results (aggregate statistics)
app.get("/study-groups/:groupId/quiz/results", async (req, res) => {
  try {
    await requireUser(req);
    const { groupId } = req.params;

    const quizSession = await kvGet(`group-quiz:${groupId}`);
    if (!quizSession || !quizSession.quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    const questions = quizSession.quiz.questions;
    const allAnswers = quizSession.answers || {};

    // Calculate statistics for each question
    const results = questions.map((question) => {
      let correctCount = 0;
      let incorrectCount = 0;
      let unansweredCount = 0;

      const userIds = Object.keys(allAnswers);
      
      if (userIds.length === 0) {
        unansweredCount = 1; // At least show something
      } else {
        userIds.forEach((userId) => {
          const userAnswers = allAnswers[userId];
          const userAnswer = userAnswers?.[question.id];

          if (userAnswer === undefined || userAnswer === null) {
            unansweredCount++;
          } else if (userAnswer === question.correctAnswer) {
            correctCount++;
          } else {
            incorrectCount++;
          }
        });
      }

      return {
        questionId: question.id,
        question: question.question,
        options: question.options,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
        correctCount,
        incorrectCount,
        unansweredCount,
      };
    });

    return res.json({ results });
  } catch (err) {
    console.error("Get quiz results error:", err);
    if (String(err?.message).includes("Unauthorized"))
      return res.status(401).json({ error: "Unauthorized" });
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

// Get active study material
app.get("/ai/material", async (req, res) => {
  try {
    const user = await requireUser(req);
    const activeMaterialId = await kvGet(`active-material:${user.id}`);
    
    if (!activeMaterialId) {
      return res.json({ material: null });
    }

    const material = await kvGet(`study-material:${user.id}:${activeMaterialId}`);
    
    return res.json({ 
      material: material ? {
        id: material.id,
        fileName: material.fileName,
        uploadedAt: material.uploadedAt,
        preview: material.content.substring(0, 200)
      } : null
    });
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
});

app.get("/settings", async (req, res) => {
  try {
    const user = await requireUser(req);
    const userProfile = await kvGet(`user:${user.id}`);
    return res.json({ settings: userProfile });
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
});

app.put("/settings", async (req, res) => {
  try {
    const user = await requireUser(req);
    const userProfile = await kvGet(`user:${user.id}`);
    const updated = { ...userProfile, ...(req.body ?? {}) };
    await kvSet(`user:${user.id}`, updated);
    return res.json({ settings: updated });
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
});

app.get("/users/search", async (req, res) => {
  try {
    const query = String(req.query.q ?? "");
    const allUsers = await kvGetByPrefix("user:");
    const results = allUsers
      .filter((u) =>
        u.username?.toLowerCase().includes(query.toLowerCase()) ||
        u.email?.toLowerCase().includes(query.toLowerCase())
      )
      .slice(0, 10);
    return res.json({ users: results });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

// --- Zoom Meeting SDK (embed in our site) ---
const ZOOM_SDK_KEY = process.env.ZOOM_SDK_KEY ?? "";
const ZOOM_SDK_SECRET = process.env.ZOOM_SDK_SECRET ?? "";

function base64UrlEncode(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generateZoomMeetingSignature(meetingNumber, role, expirationSeconds = 7200) {
  if (!ZOOM_SDK_KEY || !ZOOM_SDK_SECRET) {
    throw new Error("Zoom SDK key or secret not configured");
  }
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + Math.min(Math.max(Number(expirationSeconds) || 7200, 1800), 172800);
  const payload = {
    sdkKey: ZOOM_SDK_KEY,
    mn: String(meetingNumber),
    role: Number(role) === 1 ? 1 : 0,
    iat,
    exp,
    tokenExp: exp,
  };
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signInput = `${headerB64}.${payloadB64}`;
  const sig = crypto.createHmac("sha256", ZOOM_SDK_SECRET).update(signInput).digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${signInput}.${sig}`;
}

app.post("/api/zoom/sdk-jwt", async (req, res) => {
  try {
    const { meetingNumber, role = 0, expirationSeconds } = req.body ?? {};
    const mn = String(meetingNumber ?? "").trim();
    if (!mn) {
      return res.status(400).json({ error: "meetingNumber is required" });
    }
    const signature = generateZoomMeetingSignature(mn, role, expirationSeconds);
    return res.json({
      signature,
      sdkKey: ZOOM_SDK_KEY,
      meetingNumber: mn,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

app.post("/api/meetings", async (req, res) => {
  try {
    const user = await requireUser(req);
    const { zoomMeetingNumber, password = "", topic = "Meeting" } = req.body ?? {};
    const mn = String(zoomMeetingNumber ?? "").trim();
    if (!mn) {
      return res.status(400).json({ error: "zoomMeetingNumber is required" });
    }
    const meetingId = crypto.randomUUID();
    const joinUrl = `${req.protocol}://${req.get("host") || "localhost"}#meeting-${meetingId}`;
    const meeting = {
      meetingId,
      provider: "zoom",
      zoomMeetingNumber: mn,
      password: String(password),
      topic: String(topic),
      hostUserId: user.id,
      scheduledAt: new Date().toISOString(),
      status: "scheduled",
    };
    await kvSet(`meeting:${meetingId}`, meeting);
    return res.json({ meeting, joinUrl });
  } catch (err) {
    if (String(err?.message) === "Unauthorized") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

app.get("/dm/:friendId", async (req, res) => {
  try {
    const user = await requireUser(req);
    const friendId = String(req.params.friendId || "");
    if (!friendId) return res.status(400).json({ error: "Friend id required" });
    const { messages } = await getDmThread(user.id, friendId);
    return res.json({ messages });
  } catch (err) {
    if (String(err?.message).includes("Unauthorized"))
      return res.status(401).json({ error: "Unauthorized" });
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

app.get("/api/meetings/:id", async (req, res) => {
  try {
    const meeting = await kvGet(`meeting:${req.params.id}`);
    if (!meeting) {
      return res.status(404).json({ error: "Meeting not found" });
    }
    return res.json(meeting);
  } catch (err) {
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

// --- Zoom Server-to-Server OAuth (create meeting via API) ---
const ZOOM_ACCOUNT_ID = process.env.ZOOM_ACCOUNT_ID ?? "";
const ZOOM_CLIENT_ID = process.env.ZOOM_CLIENT_ID ?? "";
const ZOOM_CLIENT_SECRET = process.env.ZOOM_CLIENT_SECRET ?? "";

let zoomTokenCache = { token: null, expiresAt: 0 };

async function getZoomAccessToken() {
  if (!ZOOM_ACCOUNT_ID || !ZOOM_CLIENT_ID || !ZOOM_CLIENT_SECRET) {
    throw new Error("Zoom S2S OAuth not configured (ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET)");
  }
  if (zoomTokenCache.token && Date.now() < zoomTokenCache.expiresAt - 60000) {
    return zoomTokenCache.token;
  }
  const basic = Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString("base64");
  const res = await fetch("https://zoom.us/oauth/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "account_credentials",
      account_id: ZOOM_ACCOUNT_ID,
    }).toString(),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error ?? data.reason ?? "Failed to get Zoom token");
  }
  zoomTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
  };
  return zoomTokenCache.token;
}

async function createZoomMeetingViaApi(topic, durationMinutes = 60) {
  const token = await getZoomAccessToken();
  const duration = Math.min(Math.max(Number(durationMinutes) || 60, 15), 480);
  const startTime = new Date(Date.now() - 60 * 1000);
  const res = await fetch("https://api.zoom.us/v2/users/me/meetings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      topic: topic || "Study Meeting",
      type: 2,
      start_time: startTime.toISOString().replace(/\.\d{3}Z$/, "Z"),
      duration,
      timezone: "UTC",
      settings: {
        join_before_host: true,
        waiting_room: false,
        approval_type: 2,
        host_video: true,
        participant_video: true,
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message ?? data.code ?? "Zoom API create meeting failed");
  }
  return {
    zoomMeetingNumber: String(data.id),
    password: data.password ?? "",
    topic: data.topic ?? topic,
    joinUrl: data.join_url,
    startUrl: data.start_url,
  };
}

async function deleteZoomMeetingViaApi(zoomMeetingNumber) {
  if (!zoomMeetingNumber) return;
  const token = await getZoomAccessToken();
  const meetingId = String(zoomMeetingNumber).trim();
  const urlsToTry = [
    `https://api.zoom.us/v2/users/me/meetings/${meetingId}`,
    `https://api.zoom.us/v2/meetings/${meetingId}`,
  ];
  let lastError = null;
  for (const url of urlsToTry) {
    const res = await fetch(url, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` },
    });
    const body = await res.text();
    if (res.ok || res.status === 204) {
      console.log("[Zoom delete] OK meetingId=", meetingId);
      return;
    }
    if (res.status === 404) return;
    try {
      lastError = JSON.parse(body).message ?? body.slice(0, 150);
    } catch {
      lastError = body.slice(0, 150) || res.statusText;
    }
    console.warn("[Zoom delete] try", url, res.status, lastError);
  }
  throw new Error(lastError ?? "Zoom API delete meeting failed");
}

app.post("/api/meetings/create-zoom", async (req, res) => {
  try {
    const user = await requireUser(req);
    const { topic = "Study Meeting", durationMinutes } = req.body ?? {};
    const zoom = await createZoomMeetingViaApi(topic, durationMinutes);
    const meetingId = crypto.randomUUID();
    const joinUrl = `${req.protocol}://${req.get("host") || "localhost"}#meeting-${meetingId}`;
    const meeting = {
      meetingId,
      provider: "zoom",
      zoomMeetingNumber: zoom.zoomMeetingNumber,
      password: zoom.password,
      topic: zoom.topic,
      hostUserId: user.id,
      scheduledAt: new Date().toISOString(),
      status: "scheduled",
    };
    await kvSet(`meeting:${meetingId}`, meeting);
    return res.json({ meeting, joinUrl });
  } catch (err) {
    if (String(err?.message) === "Unauthorized") {
      return res.status(401).json({ error: "Unauthorized" });
    }
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const socketsByUser = new Map();
const roomSockets = new Map();
const roomsBySocket = new Map();

const addSocket = (userId, socket) => {
  const sockets = socketsByUser.get(userId) ?? new Set();
  sockets.add(socket);
  socketsByUser.set(userId, sockets);
};

const removeSocket = (userId, socket) => {
  const sockets = socketsByUser.get(userId);
  if (!sockets) return;
  sockets.delete(socket);
  if (sockets.size === 0) socketsByUser.delete(userId);
};

const sendToUser = (userId, payload) => {
  const sockets = socketsByUser.get(userId);
  if (!sockets) return;
  const message = JSON.stringify(payload);
  sockets.forEach((socket) => {
    if (socket.readyState === 1) {
      socket.send(message);
    }
  });
};

const joinRoom = (roomId, socket) => {
  if (!roomId) return;
  const sockets = roomSockets.get(roomId) ?? new Set();
  sockets.add(socket);
  roomSockets.set(roomId, sockets);
  const rooms = roomsBySocket.get(socket) ?? new Set();
  rooms.add(roomId);
  roomsBySocket.set(socket, rooms);
};

const leaveRoom = (roomId, socket) => {
  const sockets = roomSockets.get(roomId);
  if (sockets) {
    sockets.delete(socket);
    if (sockets.size === 0) roomSockets.delete(roomId);
  }
  const rooms = roomsBySocket.get(socket);
  if (rooms) {
    rooms.delete(roomId);
    if (rooms.size === 0) roomsBySocket.delete(socket);
  }
};

const sendToRoom = (roomId, payload) => {
  const sockets = roomSockets.get(roomId);
  if (!sockets) return;
  const message = JSON.stringify(payload);
  sockets.forEach((socket) => {
    if (socket.readyState === 1) {
      socket.send(message);
    }
  });
};

wss.on("connection", async (socket, req) => {
  try {
    const url = new URL(req.url ?? "", "http://localhost");
    if (url.pathname !== "/ws") {
      socket.close(1008, "Invalid path");
      return;
    }
    const token = url.searchParams.get("token") ?? "";
    const user = await getUserFromToken(token);
    const userProfile = await kvGet(`user:${user.id}`);
    socket.userId = user.id;
    socket.userName =
      userProfile?.username ||
      user.user_metadata?.username ||
      user.email ||
      "User";
    addSocket(user.id, socket);

    socket.on("message", async (data) => {
      try {
        const raw = typeof data === "string" ? data : data.toString();
        const payload = JSON.parse(raw);
        if (payload?.type === "chat:send") {
          const recipientId = String(payload?.recipientId ?? "");
          const content = String(payload?.content ?? "").trim();
          const clientId = payload?.clientId ? String(payload.clientId) : null;
          if (!recipientId || !content) return;
          if (!socket.userId) return;
          if (recipientId === socket.userId) return;

          const message = {
            id: crypto.randomUUID(),
            clientId,
            senderId: socket.userId,
            recipientId,
            content,
            createdAt: new Date().toISOString(),
          };

          const { key, messages } = await getDmThread(socket.userId, recipientId);
          const nextMessages = [...messages, message];
          const trimmed = nextMessages.slice(-DM_MESSAGE_LIMIT);
          await kvSet(key, { messages: trimmed });

          const outgoing = { type: "chat:message", message };
          sendToUser(socket.userId, outgoing);
          sendToUser(recipientId, outgoing);
          return;
        }

        if (payload?.type === "room:join") {
          const roomId = String(payload?.roomId ?? "");
          if (!roomId) return;
          const group = await kvGet(`study-group:${roomId}`);
          if (!group || !group.participants?.includes(socket.userId)) {
            socket.send(JSON.stringify({ type: "room:error", message: "Not accepted" }));
            return;
          }
          joinRoom(roomId, socket);
          return;
        }

        if (payload?.type === "room:leave") {
          const roomId = String(payload?.roomId ?? "");
          if (!roomId) return;
          leaveRoom(roomId, socket);
          return;
        }

        if (payload?.type === "room:send") {
          const roomId = String(payload?.roomId ?? "");
          const content = String(payload?.content ?? "").trim();
          const clientId = payload?.clientId ? String(payload.clientId) : null;
          if (!roomId || !content) return;
          if (!socket.userId) return;
          const group = await kvGet(`study-group:${roomId}`);
          if (!group || !group.participants?.includes(socket.userId)) {
            socket.send(JSON.stringify({ type: "room:error", message: "Not accepted" }));
            return;
          }

          const message = {
            id: crypto.randomUUID(),
            clientId,
            roomId,
            senderId: socket.userId,
            senderName: socket.userName,
            content,
            createdAt: new Date().toISOString(),
          };

          const { key, messages } = await getRoomChat(roomId);
          const nextMessages = [...messages, message];
          const trimmed = nextMessages.slice(-ROOM_MESSAGE_LIMIT);
          await kvSet(key, { messages: trimmed });

          sendToRoom(roomId, { type: "room:message", message });
          return;
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });

    socket.on("close", () => {
      if (socket.userId) removeSocket(socket.userId, socket);
      const rooms = roomsBySocket.get(socket);
      if (rooms) {
        rooms.forEach((roomId) => leaveRoom(roomId, socket));
      }
    });
  } catch (error) {
    console.error("WebSocket connection error:", error);
    socket.close(1008, "Unauthorized");
  }
});

const port = Number(process.env.PORT || 8080);
server.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
