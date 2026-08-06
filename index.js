import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
});

dotenv.config()

const app = express()





app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))

app.options('*', cors())

app.use(express.json())


const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)







// ==========================
// 🔐 MIDDLEWARE (สำคัญมาก)
// ==========================
const getUser = async (req) => {
  const token = req.headers.authorization?.replace('Bearer ', '')

  if (!token) return null

  const { data, error } = await supabase.auth.getUser(token)

  if (error) return null

  return data.user
}


// ==========================
// 📌 TEST
// ==========================
app.get('/', (req, res) => {
  res.send('API RUNNING')
})


// ==========================
// 📌API upload-photo เพิ่ม รูปให้ Users
// ==========================
app.post("/photo", async (req, res) => {

  const user = await getUser(req);

  if (!user)
    return res.status(401).json({
      error: "Unauthorized",
    });

  const { url } = req.body;

  const { data, error } = await supabase
    .from("photos")
    .insert({
      user_id: user.id,
      url: url,
    })
    .select()
    .single();

  if (error)
    return res.status(400).json(error);

  res.json(data);
});

// ==========================
// 📌API photo ดู รูปให้ Users คนใดคนหนึ่ง
// ==========================
app.get("/user/:id", async (req, res) => {

  const { id } = req.params;

  const { data, error } = await supabase
    .from("users")
    .select(`
      *,
      photos(
        url
      )
    `)
    .eq("id", id)
    .single();

  if (error)
    return res.status(400).json(error);

  res.json({
    id: data.id,
    phone: data.phone,
    name: data.name,
    age: data.age,
    gender: data.gender,
    province: data.province,
    bio: data.bio,
    created_at: data.created_at,
    photo_url:
      data.photos.length > 0
        ? data.photos[0].url
        : null,
  });

});
///// API ลบรูป ของ  users นั้น
app.delete("/photo", async (req, res) => {

  const user = await getUser(req);

  if (!user)
    return res.status(401).json({
      error: "Unauthorized",
    });

  await supabase
    .from("photos")
    .delete()
    .eq("user_id", user.id);

  res.json({
    success: true,
  });

});

/////////////////////////////////////////
app.post('/register', async (req, res) => {
  try {
    const { email, password, phone, name, province } = req.body

    // สมัคร auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password
    })

    if (error) {
      return res.status(400).json(error)
    }

    // เช็ค user
    if (!data.user) {
      return res.status(400).json({
        error: 'cannot create user'
      })
    }

    // insert profile
    const { error: profileError } = await supabase
      .from('users')
      .insert([{
        id: data.user.id,
        phone,
        name,
        province
      }])

    // ถ้า profile fail
    if (profileError) {
      return res.status(400).json(profileError)
    }

    res.json({
      message: 'register success',
      user: data.user
    })

  } catch (err) {
    res.status(500).json({
      error: err.message
    })
  }
})



app.post('/login', async (req, res) => {
  const { email, password } = req.body

  const { data, error } =
    await supabase.auth.signInWithPassword({
      email,
      password
    })

  if (error) {
    return res.status(400).json(error)
  }

  res.json(data)
})
// ==========================
// 👤 CREATE USER PROFILE
// ==========================
app.post('/users', async (req, res) => {
  const user = await getUser(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { phone, name, province } = req.body

  const { data, error } = await supabase
    .from('users')
    .insert([{
      id: user.id,
      phone,
      name,
      province
    }])

  if (error) return res.status(400).json(error)

  res.json(data)
})



// ==========================
// 🔍 GET USERS (feed)
// ==========================
app.get('/users', async (req, res) => {
  const user = await getUser(req)

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { province } = req.query

  let query = supabase
    .from('users')
    .select(`
      *,
      photos (
        url
      )
    `)

  if (province) {
    query = query.eq('province', province)
  }

  // ไม่เอาตัวเอง
  query = query.neq('id', user.id)

  const { data, error } = await query

  if (error) {
    return res.status(400).json(error)
  }

  const result = data.map((u) => ({
    id: u.id,
    phone: u.phone,
    name: u.name,
    age: u.age,
    gender: u.gender,
    province: u.province,
    bio: u.bio,
    created_at: u.created_at,
    photo_url:
      u.photos && u.photos.length > 0
        ? u.photos[0].url
        : null
  }))

  res.json(result)
})




// ==========================
// 👉 SWIPE
// ==========================
app.post('/swipe', async (req, res) => {
  const user = await getUser(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { target_user_id, action } = req.body

  const { data, error } = await supabase
    .from('swipes')
    .insert([{
      user_id: user.id,
      target_user_id,
      action
    }])

  if (error) return res.status(400).json(error)

  res.json(data)
})


// ==========================
// ❤️ MATCHES
// ==========================
app.get('/matches', async (req, res) => {
  const user = await getUser(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)

  if (error) return res.status(400).json(error)

  res.json(data)
})


// ==========================
// 💬 SEND MESSAGE
// ==========================
app.post('/message', async (req, res) => {
  const user = await getUser(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { match_id, message } = req.body

  const { data, error } = await supabase
    .from('messages')
    .insert([{
      match_id,
      sender_id: user.id,
      message
    }])

  if (error) return res.status(400).json(error)

  res.json(data)
})


// ==========================
// 💬 GET MESSAGES
// ==========================
app.get('/messages/:match_id', async (req, res) => {
  const user = await getUser(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { match_id } = req.params

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('match_id', match_id)
    .order('created_at', { ascending: true })

  if (error) return res.status(400).json(error)

  res.json(data)
})


// ==========================
// 💬 GET USERS
// ==========================
app.get('/health', async (req, res) => {
  const { count, error } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true });

  res.json({
    connected: !error,
    count,
    error
  });
});
app.get('/test-auth', async (req, res) => {
  const { data, error } = await supabase.auth.admin.listUsers();

  res.json({
    error,
    total: data?.users?.length,
    users: data?.users
  });
});


// ==========================
// 💬 แก้ไข ข้อมูล User PUT  Profile USERS
// ==========================
app.put("/profile", async (req, res) => {
  const user = await getUser(req);

  if (!user)
    return res.status(401).json({
      error: "Unauthorized",
    });

  const {
    name,
    age,
    gender,
    province,
    bio,
  } = req.body;

  const { data, error } = await supabase
    .from("users")
    .update({
      name,
      age,
      gender,
      province,
      bio,
    })
    .eq("id", user.id)
    .select()
    .single();

  if (error)
    return res.status(400).json(error);

  res.json(data);
});


// ==========================
// 💬 API ดูโปรไฟล์ตัวเอง
// ==========================
app.get("/profile", async (req, res) => {

  const user = await getUser(req);

  if (!user)
    return res.status(401).json({
      error: "Unauthorized",
    });

  const { data, error } = await supabase
    .from("users")
    .select(`
      *,
      photos(
        url
      )
    `)
    .eq("id", user.id)
    .single();

  if (error)
    return res.status(400).json(error);

  res.json({
    id: data.id,
    phone: data.phone,
    name: data.name,
    age: data.age,
    gender: data.gender,
    province: data.province,
    bio: data.bio,
    created_at: data.created_at,
    photo_url:
      data.photos.length > 0
        ? data.photos[0].url
        : null,
  });

})



// ==========================
// 💬 test  datababse ENV.
// ==========================
app.get('/env', (req, res) => {
  res.json({
    url: process.env.SUPABASE_URL,
    keyExists: !!process.env.SUPABASE_KEY
  })
})



// ==========================
// 🚀 START
// ==========================
const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
