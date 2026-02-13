import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as kv from './kv_store.tsx';

const app = new Hono();

app.use('*', cors());
app.use('*', logger(console.log));

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

// Auth Routes
app.post('/auth/signup', async (c) => {
  try {
    const body = await c.req.json();
    const { email, password, username, userId, category } = body;

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { username, userId, category },
      // Automatically confirm the user's email since an email server hasn't been configured.
      email_confirm: true
    });

    if (authError) {
      console.log(`Signup error: ${authError.message}`);
      return c.json({ error: authError.message }, 400);
    }

    // Store user profile in KV store
    await kv.set(`user:${authData.user.id}`, {
      id: authData.user.id,
      email,
      username,
      userId,
      category,
      classes: [],
      preferences: {},
      allowTodoView: false,
      createdAt: new Date().toISOString()
    });

    return c.json({ success: true, user: authData.user });
  } catch (error) {
    console.log(`Signup error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

app.post('/auth/signin', async (c) => {
  try {
    const body = await c.req.json();
    const { email, password } = body;

    const authSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    );

    const { data, error } = await authSupabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.log(`Signin error: ${error.message}`);
      return c.json({ error: error.message }, 400);
    }

    // Get user profile
    const userProfile = await kv.get(`user:${data.user.id}`);

    return c.json({ 
      success: true, 
      accessToken: data.session.access_token,
      user: userProfile || data.user
    });
  } catch (error) {
    console.log(`Signin error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

app.get('/auth/session', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'No token provided' }, 401);
    }

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      return c.json({ error: 'Invalid session' }, 401);
    }

    const userProfile = await kv.get(`user:${user.id}`);
    return c.json({ user: userProfile || user });
  } catch (error) {
    console.log(`Session check error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

app.post('/auth/signout', async (c) => {
  return c.json({ success: true });
});

// Todo Routes
app.get('/todos', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) return c.json({ error: 'Unauthorized' }, 401);

    const todos = await kv.getByPrefix(`todo:${user.id}:`);
    return c.json({ todos });
  } catch (error) {
    console.log(`Get todos error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

app.post('/todos', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) return c.json({ error: 'Unauthorized' }, 401);

    const body = await c.req.json();
    const todoId = crypto.randomUUID();
    const todo = {
      id: todoId,
      userId: user.id,
      name: body.name,
      subject: body.subject,
      duration: body.duration || 0,
      completed: false,
      createdAt: new Date().toISOString()
    };

    await kv.set(`todo:${user.id}:${todoId}`, todo);
    return c.json({ todo });
  } catch (error) {
    console.log(`Create todo error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

app.put('/todos/:id', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) return c.json({ error: 'Unauthorized' }, 401);

    const todoId = c.req.param('id');
    const body = await c.req.json();
    
    const existing = await kv.get(`todo:${user.id}:${todoId}`);
    if (!existing) return c.json({ error: 'Todo not found' }, 404);

    const updated = { ...existing, ...body };
    await kv.set(`todo:${user.id}:${todoId}`, updated);
    
    return c.json({ todo: updated });
  } catch (error) {
    console.log(`Update todo error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

app.delete('/todos/:id', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) return c.json({ error: 'Unauthorized' }, 401);

    const todoId = c.req.param('id');
    await kv.del(`todo:${user.id}:${todoId}`);
    
    return c.json({ success: true });
  } catch (error) {
    console.log(`Delete todo error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Study time tracking
app.post('/study-time', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) return c.json({ error: 'Unauthorized' }, 401);

    const body = await c.req.json();
    const { duration, date } = body;
    const dateKey = date || new Date().toISOString().split('T')[0];

    const existing = await kv.get(`study-time:${user.id}:${dateKey}`) || { total: 0 };
    existing.total += duration;

    await kv.set(`study-time:${user.id}:${dateKey}`, existing);
    return c.json({ total: existing.total });
  } catch (error) {
    console.log(`Study time tracking error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

app.get('/study-time/:date', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) return c.json({ error: 'Unauthorized' }, 401);

    const date = c.req.param('date');
    const data = await kv.get(`study-time:${user.id}:${date}`) || { total: 0 };
    
    return c.json(data);
  } catch (error) {
    console.log(`Get study time error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Study Groups
app.get('/study-groups', async (c) => {
  try {
    const groups = await kv.getByPrefix('study-group:');
    return c.json({ groups });
  } catch (error) {
    console.log(`Get study groups error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

app.post('/study-groups', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) return c.json({ error: 'Unauthorized' }, 401);

    const body = await c.req.json();
    const groupId = crypto.randomUUID();
    
    const group = {
      id: groupId,
      hostId: user.id,
      location: body.location,
      date: body.date,
      time: body.time,
      topic: body.topic,
      maxParticipants: body.maxParticipants || 10,
      participants: [user.id],
      applicants: [],
      createdAt: new Date().toISOString()
    };

    await kv.set(`study-group:${groupId}`, group);
    return c.json({ group });
  } catch (error) {
    console.log(`Create study group error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

app.post('/study-groups/:id/apply', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) return c.json({ error: 'Unauthorized' }, 401);

    const groupId = c.req.param('id');
    const group = await kv.get(`study-group:${groupId}`);
    
    if (!group) return c.json({ error: 'Group not found' }, 404);
    if (group.participants.includes(user.id)) {
      return c.json({ error: 'Already a member' }, 400);
    }
    if (!group.applicants.includes(user.id)) {
      group.applicants.push(user.id);
    }

    await kv.set(`study-group:${groupId}`, group);
    return c.json({ success: true, group });
  } catch (error) {
    console.log(`Apply to study group error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

app.post('/study-groups/:id/manage', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) return c.json({ error: 'Unauthorized' }, 401);

    const groupId = c.req.param('id');
    const group = await kv.get(`study-group:${groupId}`);
    
    if (!group) return c.json({ error: 'Group not found' }, 404);
    if (group.hostId !== user.id) return c.json({ error: 'Not authorized' }, 403);

    const body = await c.req.json();
    const { applicantId, action } = body; // action: 'accept' or 'reject'

    if (action === 'accept') {
      group.applicants = group.applicants.filter((id: string) => id !== applicantId);
      if (!group.participants.includes(applicantId)) {
        group.participants.push(applicantId);
      }
    } else if (action === 'reject') {
      group.applicants = group.applicants.filter((id: string) => id !== applicantId);
    }

    await kv.set(`study-group:${groupId}`, group);
    return c.json({ success: true, group });
  } catch (error) {
    console.log(`Manage study group error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Friends
app.post('/friends/add', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) return c.json({ error: 'Unauthorized' }, 401);

    const body = await c.req.json();
    const { friendEmail } = body;

    // Find friend by email
    const allUsers = await kv.getByPrefix('user:');
    const friend = allUsers.find((u: any) => u.email === friendEmail);
    
    if (!friend) return c.json({ error: 'User not found' }, 404);

    await kv.set(`friendship:${user.id}:${friend.id}`, {
      userId: user.id,
      friendId: friend.id,
      createdAt: new Date().toISOString()
    });

    return c.json({ success: true, friend });
  } catch (error) {
    console.log(`Add friend error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

app.get('/friends', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) return c.json({ error: 'Unauthorized' }, 401);

    const friendships = await kv.getByPrefix(`friendship:${user.id}:`);
    const friendIds = friendships.map((f: any) => f.friendId);
    
    const friends = [];
    for (const friendId of friendIds) {
      const friend = await kv.get(`user:${friendId}`);
      if (friend) friends.push(friend);
    }

    return c.json({ friends });
  } catch (error) {
    console.log(`Get friends error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

app.get('/friends/:id/activity', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) return c.json({ error: 'Unauthorized' }, 401);

    const friendId = c.req.param('id');
    
    // Get friend's study time for the last 7 days
    const activity = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      
      const data = await kv.get(`study-time:${friendId}:${dateKey}`) || { total: 0 };
      activity.push({ date: dateKey, total: data.total });
    }

    return c.json({ activity });
  } catch (error) {
    console.log(`Get friend activity error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Settings
app.get('/settings', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) return c.json({ error: 'Unauthorized' }, 401);

    const userProfile = await kv.get(`user:${user.id}`);
    return c.json({ settings: userProfile });
  } catch (error) {
    console.log(`Get settings error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

app.put('/settings', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) return c.json({ error: 'Unauthorized' }, 401);

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) return c.json({ error: 'Unauthorized' }, 401);

    const body = await c.req.json();
    const userProfile = await kv.get(`user:${user.id}`);
    
    const updated = { ...userProfile, ...body };
    await kv.set(`user:${user.id}`, updated);

    return c.json({ settings: updated });
  } catch (error) {
    console.log(`Update settings error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

// Search users
app.get('/users/search', async (c) => {
  try {
    const query = c.req.query('q') || '';
    const allUsers = await kv.getByPrefix('user:');
    
    const results = allUsers.filter((u: any) => 
      u.username?.toLowerCase().includes(query.toLowerCase()) ||
      u.email?.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 10);

    return c.json({ users: results });
  } catch (error) {
    console.log(`Search users error: ${error}`);
    return c.json({ error: String(error) }, 500);
  }
});

Deno.serve(app.fetch);
