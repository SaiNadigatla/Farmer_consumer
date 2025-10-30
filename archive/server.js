const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const multer = require('multer');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(bodyParser.json());
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
const fs = require('fs');
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Connect to MySQL database
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'amulya@2005', // Replace with your MySQL root password
  database: 'farmer_dashboard',
});

db.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err.message);
  } else {
    console.log('Connected to MySQL database.');
  }
});

// API to add a crop
app.post('/api/crops', upload.single('image'), (req, res) => {
  const { cropName, quantity, location, price } = req.body;
  const imageUrl = req.file ? `uploads/${req.file.filename}` : '';

  console.log('Received crop data:', { cropName, quantity, location, price, imageUrl });

  // Check if required fields are available
  if (!cropName || !quantity || !location || !price || !imageUrl) {
    return res.status(400).json({ message: 'All fields, including image, are required' });
  }

  const query =
    'INSERT INTO crops (crop_name, quantity, location, price, image_url) VALUES (?, ?, ?, ?, ?)';
  db.query(query, [cropName, quantity, location, price, imageUrl], (err, result) => {
    if (err) {
      console.error('Error inserting crop data:', err);
      return res.status(500).json({ message: 'Failed to add crop' });
    }
    console.log('Crop added successfully:', result);
    res.status(200).json({ message: 'Crop added successfully' });
  });
});

// API to get all crops
app.get('/api/crops', (req, res) => {
  const query = 'SELECT id, crop_name, quantity, location, price, image_url FROM crops';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error retrieving crops:', err);
      return res.status(500).json({ message: 'Error retrieving crops' });
    }
    res.json(results);
  });
});

// Serve uploaded images
app.use('/uploads', express.static('uploads'));

// Start the server
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});


