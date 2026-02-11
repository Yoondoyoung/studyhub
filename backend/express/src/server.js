import "dotenv/config";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import multer from "multer";
import OpenAI from "openai";
import sharp from "sharp";
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

const requireUser = async (req) => {
  const authHeader = req.header("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) throw new Error("Unauthorized");
  const { data, error } = await serviceSupabase.auth.getUser(token);
  if (error || !data.user) throw new Error("Unauthorized");
  return data.user;
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
    const { name, subject, duration = 0 } = req.body ?? {};
    const todoId = crypto.randomUUID();
    const todo = {
      id: todoId,
      userId: user.id,
      name,
      subject,
      duration,
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
    const updated = { ...existing, ...(req.body ?? {}) };
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
      const hostProfile = group.hostId ? await kvGet(`user:${group.hostId}`) : null;
      const hostUsername = hostProfile?.username ?? hostProfile?.email ?? (group.hostId?.slice(0, 8) ?? "—");
      groups.push({ ...group, hostUsername });
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
    await requireUser(req);
    const groupId = req.params.id;
    const group = await kvGet(`study-group:${groupId}`);
    if (!group) return res.status(404).json({ error: "Group not found" });
    const presence = (await kvGet(`room-presence:${groupId}`)) || { users: [] };
    return res.json({ presence: presence.users });
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
    if (!participantIds.includes(user.id))
      return res.status(403).json({ error: "Not a participant of this room" });
    const profile = await kvGet(`user:${user.id}`);
    const username = profile?.username ?? profile?.email ?? user.id?.slice(0, 8) ?? "User";
    const presence = (await kvGet(`room-presence:${groupId}`)) || { users: [] };
    const existing = presence.users.find((u) => u.id === user.id);
    if (!existing) {
      presence.users.push({ id: user.id, username });
    }
    await kvSet(`room-presence:${groupId}`, presence);
    return res.json({ presence: presence.users });
  } catch (err) {
    if (String(err?.message).includes("Unauthorized"))
      return res.status(401).json({ error: "Unauthorized" });
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

app.delete("/study-groups/:id/presence", async (req, res) => {
  try {
    const user = await requireUser(req);
    const groupId = req.params.id;
    let presence = (await kvGet(`room-presence:${groupId}`)) || { users: [] };
    presence.users = (presence.users || []).filter((u) => u.id !== user.id);
    await kvSet(`room-presence:${groupId}`, presence);
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
    const { location, date, time, topic, maxParticipants = 10, studyType, duration } = req.body ?? {};
    const groupId = crypto.randomUUID();
    const group = {
      id: groupId,
      hostId: user.id,
      location,
      date,
      time,
      topic,
      maxParticipants,
      studyType: studyType ?? "In-person",
      duration: duration ?? "2 hours",
      participants: [user.id],
      applicants: [],
      createdAt: new Date().toISOString(),
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
    await kvDel(`study-group:${groupId}`);
    return res.json({ success: true });
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
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
      chatHistory: [],
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
        messageCount: s.chatHistory?.length || 0,
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
    const { message, mode = "student" } = req.body ?? {};

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
      systemPrompt = "You are a study assistant evaluating a student's explanation. Always respond in English only. Provide constructive feedback on their understanding. Point out what they explained well and what could be improved. Rate their understanding out of 10 and encourage them to keep learning.";
    }

    // Build messages array with chat history
    const messages = [
      { role: "system", content: systemPrompt }
    ];

    // Add previous chat history
    if (session.chatHistory && session.chatHistory.length > 0) {
      session.chatHistory.forEach(msg => {
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

    // Save to chat history
    session.chatHistory.push({
      role: "user",
      content: message,
      timestamp: new Date().toISOString()
    });
    session.chatHistory.push({
      role: "assistant",
      content: aiResponse,
      timestamp: new Date().toISOString()
    });
    session.updatedAt = new Date().toISOString();

    await kvSet(`ai-session:${user.id}:${sessionId}`, session);

    return res.json({ 
      success: true,
      response: aiResponse,
      messageCount: session.chatHistory.length
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
    const { mode = "student" } = req.body ?? {};

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
      systemPrompt = "You are a study assistant evaluating a student's explanation. Always respond in English only. Provide constructive feedback on their understanding.";
    }

    // Build messages with history
    const messages = [{ role: "system", content: systemPrompt }];
    
    if (session.chatHistory && session.chatHistory.length > 0) {
      session.chatHistory.forEach(msg => {
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

    // Save to chat history
    session.chatHistory.push({
      role: "user",
      content: userMessage,
      timestamp: new Date().toISOString()
    });
    session.chatHistory.push({
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
      messageCount: session.chatHistory.length
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

const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
