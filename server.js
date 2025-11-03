const express = require('express');
require('dotenv').config();
const mysql = require('mysql2');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

const app = express();
app.use(express.json());
app.use(cors());

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Save files to the "uploads/" directory
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Unique filename
  },
});
const upload = multer({ storage });

// Ensure "uploads/" directory exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Connect to MySQL database (shared connection)
const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'farmer_consumer',
});

db.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err.message);
  } else {
    console.log('Connected to MySQL database.');
    initDb();
  }
});

function initDb() {
  const createUsers = `
    CREATE TABLE IF NOT EXISTS user_credentials (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      role ENUM('farmer','consumer') NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `;

  const createCrops = `
    CREATE TABLE IF NOT EXISTS crops (
      id INT AUTO_INCREMENT PRIMARY KEY,
      crop_name VARCHAR(100) NOT NULL,
      quantity INT NOT NULL,
      location VARCHAR(255) NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      image_url VARCHAR(255) NOT NULL,
      farmer_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `;

  const createCart = `
    CREATE TABLE IF NOT EXISTS cart (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      crop_id INT NOT NULL,
      quantity INT NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_cart_user FOREIGN KEY (user_id) REFERENCES user_credentials(id) ON DELETE CASCADE,
      CONSTRAINT fk_cart_crop FOREIGN KEY (crop_id) REFERENCES crops(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `;

  const createOrders = `
    CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      total DECIMAL(10,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES user_credentials(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `;

  const createOrderItems = `
    CREATE TABLE IF NOT EXISTS order_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      crop_id INT NOT NULL,
      quantity INT NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      CONSTRAINT fk_oi_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      CONSTRAINT fk_oi_crop FOREIGN KEY (crop_id) REFERENCES crops(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `;

  const createCropRatings = `
    CREATE TABLE IF NOT EXISTS crop_ratings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      crop_id INT NOT NULL,
      rating TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_user_crop (user_id, crop_id),
      CONSTRAINT fk_rating_user FOREIGN KEY (user_id) REFERENCES user_credentials(id) ON DELETE CASCADE,
      CONSTRAINT fk_rating_crop FOREIGN KEY (crop_id) REFERENCES crops(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `;

  db.query(createUsers, (e1) => {
    if (e1) console.error('Error creating user_credentials table:', e1);
    db.query(createCrops, (e2) => {
      if (e2) console.error('Error creating crops table:', e2);
      db.query(createCart, (e3) => {
        if (e3) console.error('Error creating cart table:', e3);
        db.query(createOrders, (e4) => {
          if (e4) console.error('Error creating orders table:', e4);
          db.query(createOrderItems, (e5) => {
            if (e5) console.error('Error creating order_items table:', e5);
            
            // Check if we need to update the constraint
            const checkConstraint = `
              SELECT COUNT(*) as needs_update 
              FROM information_schema.TABLE_CONSTRAINTS c
              JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
                ON c.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
                AND c.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
              WHERE c.CONSTRAINT_SCHEMA = DATABASE()
                AND c.TABLE_NAME = 'order_items'
                AND c.CONSTRAINT_NAME = 'fk_oi_crop'
                AND c.CONSTRAINT_TYPE = 'FOREIGN KEY'
                AND rc.DELETE_RULE != 'CASCADE';
            `;

            db.query(checkConstraint, (checkErr, results) => {
              if (checkErr) {
                console.error('Error checking constraint:', checkErr);
                return;
              }

              const needsUpdate = results && results[0] && results[0].needs_update > 0;
              
              if (!needsUpdate) {
                console.log('Constraint already has CASCADE rule');
                return;
              }

              // First drop the existing constraint
              const dropConstraint = 'ALTER TABLE order_items DROP FOREIGN KEY fk_oi_crop';
              
              db.query(dropConstraint, (dropErr) => {
                if (dropErr) {
                  console.error('Error dropping constraint:', dropErr);
                  return;
                }

                // Then add it back with CASCADE
                const addConstraint = `
                  ALTER TABLE order_items 
                  ADD CONSTRAINT fk_oi_crop 
                  FOREIGN KEY (crop_id) 
                  REFERENCES crops(id) 
                  ON DELETE CASCADE;
                `;

                db.query(addConstraint, (addErr) => {
                  if (addErr) {
                    console.error('Error adding constraint with CASCADE:', addErr);
                  } else {
                    console.log('Successfully updated order_items constraint to use CASCADE');
                  }
                });
              });
            });

            db.query(createCropRatings, (e6) => {
              if (e6) console.error('Error creating crop_ratings table:', e6);
            // Ensure legacy 'crops' table has 'farmer_id' column and FK
            const checkFarmerCol = `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS 
                                   WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'crops' AND COLUMN_NAME = 'farmer_id'`;
            db.query(checkFarmerCol, ['farmer_dashboard'], (chkErr2, rows2) => {
              if (chkErr2) {
                console.error('Error checking crops.farmer_id column:', chkErr2);
              } else {
                const hasFarmer = rows2 && rows2[0] && rows2[0].cnt > 0;
                if (!hasFarmer) {
                  const alterCrops = `ALTER TABLE crops ADD COLUMN farmer_id INT NULL AFTER image_url`;
                  db.query(alterCrops, (altErr1) => {
                    if (altErr1) console.error('Error adding farmer_id to crops:', altErr1);
                  });
                }
              }
            });
            // Ensure legacy 'orders' table has 'total' column
            const checkTotalCol = `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS 
                                   WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'total'`;
            db.query(checkTotalCol, ['farmer_dashboard'], (chkErr, rows) => {
              if (chkErr) {
                console.error('Error checking orders.total column:', chkErr);
                return; // non-fatal
              }
              const hasTotal = rows && rows[0] && rows[0].cnt > 0;
              if (!hasTotal) {
                const alterSql = `ALTER TABLE orders ADD COLUMN total DECIMAL(10,2) NOT NULL DEFAULT 0`;
                db.query(alterSql, (altErr) => {
                  if (altErr) {
                    console.error('Error adding total column to orders:', altErr);
                  } else {
                    console.log('Added missing total column to orders table.');
                  }
                });
              }
            });
            });
          });
        });
      });
    });
  });
}

// --------------------------- CROP MANAGEMENT APIs ---------------------------

// API to add a crop
app.post('/api/crops', upload.single('image'), (req, res) => {
  const { cropName, quantity, location, price, farmerId } = req.body;
  const imageUrl = req.file ? `uploads/${req.file.filename}` : '';

  if (!cropName || !quantity || !location || !price || !imageUrl) {
    return res.status(400).json({ message: 'All fields, including image, are required' });
  }
  const fId = Number(farmerId);
  if (!Number.isFinite(fId)) {
    return res.status(400).json({ message: 'Valid farmerId is required' });
  }

  const query =
    'INSERT INTO crops (crop_name, quantity, location, price, image_url, farmer_id) VALUES (?, ?, ?, ?, ?, ?)';
  db.query(query, [cropName, Number(quantity), location, Number(price), imageUrl, fId], (err) => {
    if (err) {
      console.error('Error inserting crop data:', err);
      return res.status(500).json({ message: 'Failed to add crop' });
    }
    res.status(200).json({ message: 'Crop added successfully' });
  });
});

// --------------------------- FARMER SALES HISTORY ---------------------------
// Get all sold items for a farmer with buyer details
app.get('/api/farmer/orders/:farmerId', (req, res) => {
  const farmerId = Number(req.params.farmerId);
  if (!Number.isFinite(farmerId)) {
    return res.status(400).json({ message: 'Invalid farmerId' });
  }
  const sql = `
    SELECT 
      o.id AS order_id,
      o.created_at,
      COALESCE(o.total, 0) AS order_total,
      COALESCE(u.name, 'Unknown') AS buyer_name,
      COALESCE(u.email, '') AS buyer_email,
      c.id AS crop_id,
      c.crop_name,
      COALESCE(oi.quantity, 0) AS quantity,
      COALESCE(oi.price, 0) AS price,
      (COALESCE(oi.quantity, 0) * COALESCE(oi.price, 0)) AS subtotal
    FROM crops c
    LEFT JOIN order_items oi ON c.id = oi.crop_id
    LEFT JOIN orders o ON oi.order_id = o.id
    LEFT JOIN user_credentials u ON o.user_id = u.id
    WHERE c.farmer_id = ?
    ORDER BY o.created_at DESC, o.id DESC`;

  db.query(sql, [farmerId], (err, rows) => {
    if (err) {
      console.error('Farmer sales history error:', err);
      return res.status(500).json({ message: 'Failed to fetch farmer sales history' });
    }
    res.json(rows);
  });
});

// Get cart items for a user
app.get('/api/cart/:userId', (req, res) => {
  const { userId } = req.params;
  const query = `
    SELECT c.id, cr.crop_name, cr.price, c.quantity, cr.image_url
    FROM cart c
    JOIN crops cr ON c.crop_id = cr.id
    WHERE c.user_id = ?
  `;
  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Error fetching cart:', err);
      return res.status(500).json({ message: 'Failed to fetch cart', error: err.code, detail: err.message });
    }
    res.json(results);
  });
});

// API to get all crops with search/filter/sort
app.get('/api/crops', (req, res) => {
  const { q, minPrice, maxPrice, sort, farmerId } = req.query || {};

  const where = [];
  const params = [];

  if (q && typeof q === 'string' && q.trim()) {
    where.push('(crop_name LIKE ? OR location LIKE ?)');
    params.push(`%${q.trim()}%`, `%${q.trim()}%`);
  }
  const minP = minPrice !== undefined ? Number(minPrice) : undefined;
  if (Number.isFinite(minP)) {
    where.push('price >= ?');
    params.push(minP);
  }
  const maxP = maxPrice !== undefined ? Number(maxPrice) : undefined;
  if (Number.isFinite(maxP)) {
    where.push('price <= ?');
    params.push(maxP);
  }
  const fId = farmerId !== undefined ? Number(farmerId) : undefined;
  if (Number.isFinite(fId)) {
    where.push('farmer_id = ?');
    params.push(fId);
  }

  let orderBy = 'c.id DESC';
  if (sort === 'price_asc') orderBy = 'price ASC';
  else if (sort === 'price_desc') orderBy = 'price DESC';
  else if (sort === 'name_asc') orderBy = 'crop_name ASC';
  else if (sort === 'rating_desc') orderBy = 'COALESCE(r.avg_rating, 0) DESC, COALESCE(r.rating_count,0) DESC';

  const base = `
    SELECT c.id, c.crop_name, c.quantity, c.location, c.price, c.image_url,
           COALESCE(r.avg_rating, 0) AS avg_rating,
           COALESCE(r.rating_count, 0) AS rating_count
    FROM crops c
    LEFT JOIN (
      SELECT crop_id, AVG(rating) AS avg_rating, COUNT(*) AS rating_count
      FROM crop_ratings
      GROUP BY crop_id
    ) r ON r.crop_id = c.id`;
  const sql = [
    base,
    where.length ? 'WHERE ' + where.map(w => w.replace(/\b(crop_name|location|price|farmer_id)\b/g, 'c.$1')).join(' AND ') : '',
    'ORDER BY ' + orderBy,
  ].filter(Boolean).join(' ');

  db.query(sql, params, (err, results) => {
    if (err) {
      console.error('Error retrieving crops:', err);
      return res.status(500).json({ message: 'Error retrieving crops' });
    }
    res.json(results);
  });
});

// Update a crop (only by owning farmer)
app.put('/api/crops/:id', (req, res) => {
  const cropId = Number(req.params.id);
  if (!Number.isFinite(cropId)) return res.status(400).json({ message: 'Invalid crop id' });
  const { farmerId, crop_name, price, quantity, location } = req.body || {};
  const fId = Number(farmerId);
  if (!Number.isFinite(fId)) return res.status(400).json({ message: 'farmerId required' });

  const fields = [];
  const values = [];
  if (typeof crop_name === 'string' && crop_name.trim() !== '') { fields.push('crop_name = ?'); values.push(crop_name.trim()); }
  if (price !== undefined && Number.isFinite(Number(price))) { fields.push('price = ?'); values.push(Number(price)); }
  if (quantity !== undefined && Number.isFinite(Number(quantity))) { fields.push('quantity = ?'); values.push(Number(quantity)); }
  if (typeof location === 'string' && location.trim() !== '') { fields.push('location = ?'); values.push(location.trim()); }

  if (!fields.length) return res.status(400).json({ message: 'No valid fields to update' });

  const sql = `UPDATE crops SET ${fields.join(', ')} WHERE id = ? AND farmer_id = ?`;
  values.push(cropId, fId);
  db.query(sql, values, (err, result) => {
    if (err) {
      console.error('Update crop error:', err);
      return res.status(500).json({ message: 'Failed to update crop' });
    }
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Crop not found or not owned by farmer' });
    res.json({ message: 'Crop updated' });
  });
});

// Delete a crop (only by owning farmer)
app.delete('/api/crops/:id', (req, res) => {
  const cropId = Number(req.params.id);
  if (!Number.isFinite(cropId)) return res.status(400).json({ message: 'Invalid crop id' });
  const { farmerId } = req.body || {};
  const fId = Number(farmerId);
  if (!Number.isFinite(fId)) return res.status(400).json({ message: 'farmerId required' });

  const sql = `DELETE FROM crops WHERE id = ? AND farmer_id = ?`;
  db.query(sql, [cropId, fId], (err, result) => {
    if (err) {
      console.error('Delete crop error:', err);
      return res.status(500).json({ message: 'Failed to delete crop' });
    }
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Crop not found or not owned by farmer' });
    res.json({ message: 'Crop deleted' });
  });
});

// Rate a crop: upsert a user's rating (1-5)
app.post('/api/crops/:cropId/rate', (req, res) => {
  const cropId = Number(req.params.cropId);
  const { userId, rating } = req.body || {};
  if (!Number.isFinite(cropId)) return res.status(400).json({ message: 'Invalid cropId' });
  if (!Number.isFinite(userId)) return res.status(400).json({ message: 'Invalid userId' });
  const r = Number(rating);
  if (!Number.isFinite(r) || r < 1 || r > 5) return res.status(400).json({ message: 'Rating must be 1-5' });

  const upsert = `
    INSERT INTO crop_ratings (user_id, crop_id, rating)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE rating = VALUES(rating), updated_at = CURRENT_TIMESTAMP`;
  db.query(upsert, [userId, cropId, r], (e1) => {
    if (e1) {
      console.error('Rating upsert error:', e1);
      return res.status(500).json({ message: 'Failed to save rating' });
    }
    // Return new average and count
    const q = `SELECT AVG(rating) AS avg_rating, COUNT(*) AS rating_count FROM crop_ratings WHERE crop_id = ?`;
    db.query(q, [cropId], (e2, rows) => {
      if (e2) {
        console.error('Rating fetch error:', e2);
        return res.status(500).json({ message: 'Rating saved but failed to fetch aggregate' });
      }
      const agg = rows && rows[0] ? rows[0] : { avg_rating: 0, rating_count: 0 };
      res.json({ message: 'Rating saved', avg_rating: Number(agg.avg_rating) || 0, rating_count: agg.rating_count });
    });
  });
});

// Endpoint to fix foreign key constraint (run this once)
app.get('/api/fix-constraint', (req, res) => {
  const alterSql = `
    ALTER TABLE order_items 
    DROP FOREIGN KEY fk_oi_crop,
    ADD CONSTRAINT fk_oi_crop 
    FOREIGN KEY (crop_id) REFERENCES crops(id) 
    ON DELETE CASCADE`;
    
  db.query(alterSql, (err) => {
    if (err) {
      console.error('Error updating constraint:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json({ success: true, message: 'Constraint updated successfully' });
  });
});

// Serve uploaded images and static frontend files
app.use('/uploads', express.static('uploads'));
app.use(express.static(__dirname));

// --------------------------- USER AUTHENTICATION APIs ---------------------------

app.get('/api/health', (req, res) => {
  db.query('SELECT 1 AS ok', (err, results) => {
    if (err) {
      return res.status(500).json({ ok: false, error: err.code, message: err.message });
    }
    res.json({ ok: true, db: results && results[0] && results[0].ok === 1 });
  });
});

// API for user signup
app.post('/api/signup', async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    // Check for existing user
    const checkQuery = 'SELECT * FROM user_credentials WHERE email = ?';
    db.query(checkQuery, [email], (err, results) => {
      if (err) {
        console.error('Error checking user:', err);
        return res.status(500).json({ message: 'Database error', error: err.code, detail: err.message });
      }

      if (results.length > 0) {
        return res.status(400).json({ message: 'Email already exists' });
      }

      // Insert new user
      const insertQuery =
        'INSERT INTO user_credentials (name, email, password, role) VALUES (?, ?, ?, ?)';
      db.query(insertQuery, [name, email, hashedPassword, role], (err) => {
        if (err) {
          console.error('Error inserting user:', err);
          return res.status(500).json({ message: 'Failed to save user details', error: err.code, detail: err.message });
        }
        res.status(200).json({ message: 'Signup successful' });
      });
    });
  } catch (err) {
    console.error('Error hashing password:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// API for user login
app.post('/api/login', (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const query = 'SELECT * FROM user_credentials WHERE email = ?';
  db.query(query, [email], async (err, results) => {
    if (err) {
      console.error('Error during login:', err);
      return res.status(500).json({ message: 'Login failed', error: err.code, detail: err.message });
    }

    if (results.length > 0) {
      const user = results[0];
      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (isPasswordValid) {
        if (role && role !== user.role) {
          return res.status(403).json({ message: 'Role mismatch for this user' });
        }
        res.status(200).json({
          message: 'Login successful',
          userType: user.role,
          userId: user.id,
        });
      } else {
        res.status(401).json({ message: 'Invalid email or password' });
      }
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  });
});
// Add this in your Express server.js
app.post('/api/cart', (req, res) => {
  const { userId, cropId, quantity } = req.body || {};
  const uId = Number(userId);
  const cId = Number(cropId);
  const qty = Number(quantity);
  if (!Number.isFinite(uId) || !Number.isFinite(cId) || !Number.isFinite(qty) || qty <= 0) {
    return res.status(400).json({ message: 'Invalid cart payload' });
  }
  // check if already in cart, then update quantity; else insert
  const sel = 'SELECT id, quantity FROM cart WHERE user_id = ? AND crop_id = ?';
  db.query(sel, [uId, cId], (e1, rows) => {
    if (e1) {
      console.error('Cart select error:', e1);
      return res.status(500).json({ message: 'Failed to add to cart' });
    }
    if (rows && rows.length) {
      const upd = 'UPDATE cart SET quantity = quantity + ? WHERE id = ?';
      return db.query(upd, [qty, rows[0].id], (e2) => {
        if (e2) {
          console.error('Cart update error:', e2);
          return res.status(500).json({ message: 'Failed to update cart' });
        }
        return res.json({ message: 'Cart updated' });
      });
    }
    const ins = 'INSERT INTO cart (user_id, crop_id, quantity) VALUES (?, ?, ?)';
    db.query(ins, [uId, cId, qty], (e3) => {
      if (e3) {
        console.error('Cart insert error:', e3);
        return res.status(500).json({ message: 'Failed to add to cart' });
      }
      return res.json({ message: 'Crop added to cart' });
    });
  });
});

// --------------------------- CART MANAGEMENT APIs ---------------------------

// --------------------------- CHECKOUT / STOCK UPDATE ---------------------------
// Decrement stock atomically and record order
// Request body: { userId: number, items: [{ cropId: number, qty: number }, ...] }
app.post('/api/checkout', (req, res) => {
  const { userId, items } = req.body || {};

  if (typeof userId !== 'number') {
    return res.status(400).json({ message: 'Invalid userId' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Invalid items' });
  }

  for (const it of items) {
    if (!it || typeof it.cropId !== 'number' || typeof it.qty !== 'number' || it.qty <= 0) {
      return res.status(400).json({ message: 'Invalid item in items list' });
    }
  }

  db.beginTransaction((txErr) => {
    if (txErr) {
      console.error('Transaction start error:', txErr);
      return res.status(500).json({ message: 'Could not start transaction' });
    }

    let idx = 0;
    const pricedItems = []; // { cropId, qty, price }
    let orderTotal = 0;

    const processNext = () => {
      if (idx >= items.length) {
        // Insert order header
        const orderSql = 'INSERT INTO orders (user_id, total) VALUES (?, ?)';
        db.query(orderSql, [userId, orderTotal], (oErr, oRes) => {
          if (oErr) {
            console.error('Insert order error:', oErr);
            return db.rollback(() => res.status(500).json({ message: 'Failed to create order' }));
          }
          const orderId = oRes.insertId;

          // Insert order items sequentially
          let oiIdx = 0;
          const insertNextItem = () => {
            if (oiIdx >= pricedItems.length) {
              return db.commit((commitErr) => {
                if (commitErr) {
                  console.error('Commit error:', commitErr);
                  return db.rollback(() => res.status(500).json({ message: 'Checkout failed on commit' }));
                }
                return res.json({ message: 'Checkout successful', orderId });
              });
            }
            const it = pricedItems[oiIdx];
            const oiSql = 'INSERT INTO order_items (order_id, crop_id, quantity, price) VALUES (?, ?, ?, ?)';
            db.query(oiSql, [orderId, it.cropId, it.qty, it.price], (oiErr) => {
              if (oiErr) {
                console.error('Insert order item error:', oiErr);
                return db.rollback(() => res.status(500).json({ message: 'Failed to create order items' }));
              }
              oiIdx += 1;
              insertNextItem();
            });
          };

          insertNextItem();
        });
        return;
      }

      const { cropId, qty } = items[idx];
      const lockSql = 'SELECT quantity, price FROM crops WHERE id = ? FOR UPDATE';
      db.query(lockSql, [cropId], (selErr, rows) => {
        if (selErr) {
          console.error('Select for update error:', selErr);
          return db.rollback(() => res.status(500).json({ message: 'Database error' }));
        }
        if (!rows || rows.length === 0) {
          return db.rollback(() => res.status(400).json({ message: `Crop ${cropId} not found` }));
        }

        const available = rows[0].quantity;
        const price = Number(rows[0].price);
        if (available < qty) {
          return db.rollback(() => res.status(400).json({ message: `Insufficient stock for crop ${cropId}. Available ${available}, requested ${qty}` }));
        }

        const updSql = 'UPDATE crops SET quantity = quantity - ? WHERE id = ?';
        db.query(updSql, [qty, cropId], (updErr) => {
          if (updErr) {
            console.error('Update stock error:', updErr);
            return db.rollback(() => res.status(500).json({ message: 'Failed to update stock' }));
          }
          pricedItems.push({ cropId, qty, price });
          orderTotal += price * qty;
          idx += 1;
          processNext();
        });
      });
    };

    processNext();
  });
});

// --------------------------- ORDERS LISTING ---------------------------
// Get all orders for a user with items
app.get('/api/orders/:userId', (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId)) {
    return res.status(400).json({ message: 'Invalid userId' });
  }
  const qOrders = 'SELECT id, total, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC';
  db.query(qOrders, [userId], (e1, orders) => {
    if (e1) {
      console.error('Orders fetch error:', e1);
      return res.status(500).json({ message: 'Failed to fetch orders' });
    }
    if (!orders || orders.length === 0) return res.json([]);

    const orderIds = orders.map(o => o.id);
    const placeholders = orderIds.map(() => '?').join(',');
    const qItems = `SELECT oi.order_id, oi.crop_id, oi.quantity, oi.price, c.crop_name
                    FROM order_items oi
                    JOIN crops c ON c.id = oi.crop_id
                    WHERE oi.order_id IN (${placeholders})
                    ORDER BY oi.order_id`;
    db.query(qItems, orderIds, (e2, items) => {
      if (e2) {
        console.error('Order items fetch error:', e2);
        return res.status(500).json({ message: 'Failed to fetch order items' });
      }
      const byOrder = new Map();
      for (const o of orders) byOrder.set(o.id, { id: o.id, total: o.total, created_at: o.created_at, items: [] });
      for (const it of items) {
        byOrder.get(it.order_id).items.push({ crop_id: it.crop_id, crop_name: it.crop_name, quantity: it.quantity, price: it.price });
      }
      res.json(Array.from(byOrder.values()));
    });
  });
});

// --------------------------- SERVER SETUP ---------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
