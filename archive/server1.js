const express = require("express");
const bodyParser = require("body-parser");
const mysql = require("mysql2");

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// MySQL Database Connection
const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "amulya@2005", // Replace with your MySQL password
    database: "farmer_dashboard",
});

// Connect to the database
db.connect((err) => {
    if (err) {
        console.error("Error connecting to MySQL Database:", err.message);
        process.exit(1);
    }
    console.log("Connected to MySQL Database.");
});

// Signup Route
app.post("/signup", (req, res) => {
    const { role, name, email, password } = req.body;

    if (!role || !name || !email || !password) {
        return res.status(400).json({ success: false, message: "All fields are required." });
    }

    const query = "INSERT INTO users (role, name, email, password) VALUES (?, ?, ?, ?)";
    db.query(query, [role, name, email, password], (err, result) => {
        if (err) {
            console.error("Error during signup:", err.message);
            return res.json({ success: false, message: "Signup failed. Email might already be registered." });
        }
        res.json({ success: true, message: "Signup successful." });
    });
});

// Login Route
app.post("/login", (req, res) => {
    const { role, email, password } = req.body;

    if (!role || !email || !password) {
        return res.status(400).json({ success: false, message: "All fields are required." });
    }

    const query = "SELECT * FROM users WHERE email = ? AND password = ? AND role = ?";
    db.query(query, [email, password, role], (err, results) => {
        if (err) {
            console.error("Error during login:", err.message);
            return res.status(500).json({ success: false, message: "Server error." });
        }

        if (results.length > 0) {
            res.json({ success: true, message: "Login successful." });
        } else {
            res.json({ success: false, message: "Invalid credentials or role." });
        }
    });
});

// Default Route
app.get("/", (req, res) => {
    res.send("Welcome to the Farmer Dashboard API!");
});

// Start the Server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

