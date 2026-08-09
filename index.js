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
    url,
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
// ==========================
// ==========================
// 🔍 GET USERS (feed)
// ==========================
app.get('/users', async (req, res) => {
  try {
    const user = await getUser(req);

    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized'
      });
    }

    const { province } = req.query;

    // ==========================
    // 1. ดึงคนที่เราเคย swipe
    // ==========================
    const {
      data: swipes,
      error: swipeError
    } = await supabase
      .from('swipes')
      .select('target_user_id')
      .eq('user_id', user.id);

    if (swipeError) {
      console.error('GET SWIPES ERROR:', swipeError);

      return res.status(400).json({
        error: swipeError.message
      });
    }

    const swipedIds = (swipes ?? [])
      .map(item => item.target_user_id)
      .filter(Boolean);

    console.log('CURRENT USER:', user.id);
    console.log('SWIPED IDS:', swipedIds);

    // ==========================
    // 2. ดึง Users
    // ==========================
    let query = supabase
      .from('users')
      .select(`
        *,
        photos (
          url
        )
      `)
      .neq('id', user.id);

    // จังหวัด
    if (province) {
      query = query.eq('province', province);
    }

    // ==========================
    // 3. ไม่เอาคนที่เคย Swipe
    // ==========================
    if (swipedIds.length > 0) {
      query = query.not(
        'id',
        'in',
        `(${swipedIds.map(id => `"${id}"`).join(',')})`
      );
    }

    const {
      data,
      error
    } = await query;

    if (error) {
      console.error('GET USERS ERROR:', error);

      return res.status(400).json({
        error: error.message
      });
    }

    // ==========================
    // 4. Format
    // ==========================
    const result = (data ?? []).map(u => ({
      id: u.id,
      phone: u.phone,
      name: u.name,
      age: u.age,
      gender: u.gender,
      province: u.province,
      bio: u.bio,
      created_at: u.created_at,

      photo_url:
        u.photos &&
        u.photos.length > 0
          ? u.photos[0].url
          : null
    }));

    console.log('USERS LEFT:', result.length);

    res.json(result);

  } catch (err) {
    console.error('GET USERS EXCEPTION:', err);

    res.status(500).json({
      error: err.message
    });
  }
});




// ==========================
// 👉 SWIPE
// ==========================

// ==========================
// 👉 SWIPE
// ==========================
app.post('/swipe', async (req, res) => {
  try {
    const user = await getUser(req);

    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized'
      });
    }

    const {
      target_user_id,
      action
    } = req.body;

    // ตรวจ target
    if (!target_user_id) {
      return res.status(400).json({
        error: 'target_user_id is required'
      });
    }

    // ตรวจ action
    if (!['like', 'dislike'].includes(action)) {
      return res.status(400).json({
        error: 'Invalid action'
      });
    }

    // ห้าม swipe ตัวเอง
    if (target_user_id === user.id) {
      return res.status(400).json({
        error: 'Cannot swipe yourself'
      });
    }

    // ==========================
    // บันทึก Swipe
    // ==========================
    const {
      data,
      error
    } = await supabase
      .from('swipes')
      .upsert(
        {
          user_id: user.id,
          target_user_id,
          action
        },
        {
          onConflict: 'user_id,target_user_id'
        }
      )
      .select()
      .single();

    if (error) {
      console.error('SWIPE ERROR:', error);

      return res.status(400).json({
        error: error.message
      });
    }

    console.log(
      `USER ${user.id} -> ${action} -> ${target_user_id}`
    );

    res.json(data);

  } catch (err) {
    console.error('SWIPE EXCEPTION:', err);

    res.status(500).json({
      error: err.message
    });
  }
});


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
