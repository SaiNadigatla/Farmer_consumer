const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static('public')); // serve static files like contact.html

// MySQL connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'amulya@2005', // Replace with your password
  database: 'users', // Ensure this exists
});

db.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err.message);
  } else {
    console.log('Connected to MySQL database.');
  }
});



// POST /api/contact - handles contact form submissions
app.post('/api/contact', (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  const insertQuery = 'INSERT INTO contact_messages (name, email, message) VALUES (?, ?, ?)';
  db.query(insertQuery, [name, email, message], (err) => {
    if (err) {
      console.error('Error saving message:', err);
      return res.status(500).json({ message: 'Failed to send message' });
    }
    res.status(200).json({ message: 'Message sent successfully' });
  });
});

// ================= Existing routes (Signup/Login) ===================

// Signup route
app.post('/api/signup', async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const checkQuery = 'SELECT * FROM user_credentials WHERE email = ?';
    db.query(checkQuery, [email], (err, results) => {
      if (err) return res.status(500).json({ message: 'Database error' });

      if (results.length > 0) {
        return res.status(400).json({ message: 'Email already exists' });
      }

      const insertQuery = 'INSERT INTO user_credentials (name, email, password, role) VALUES (?, ?, ?, ?)';
      db.query(insertQuery, [name, email, hashedPassword, role], (err) => {
        if (err) return res.status(500).json({ message: 'Failed to save user' });
        res.status(200).json({ message: 'Signup successful' });
      });
    });
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Login route
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

  const query = 'SELECT * FROM user_credentials WHERE email = ?';
  db.query(query, [email], async (err, results) => {
    if (err) return res.status(500).json({ message: 'Login failed' });

    if (results.length > 0) {
      const user = results[0];
      const isValid = await bcrypt.compare(password, user.password);
      if (isValid) {
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

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});



