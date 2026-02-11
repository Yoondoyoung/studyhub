import "dotenv/config";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

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
      if (applyNoShowCleanup(group)) await kvSet(`study-group:${group.id}`, group);
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
    const hasSeats = participantIds.length < (group.maxParticipants || 0);
    const isParticipant = participantIds.includes(user.id);
    if (!isParticipant && !hasSeats)
      return res.status(403).json({ error: "Room is full" });
    if (!isParticipant && hasSeats) {
      group.participants = group.participants || [];
      group.participants.push(user.id);
      await kvSet(`study-group:${groupId}`, group);
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
