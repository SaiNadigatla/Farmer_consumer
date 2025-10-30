// Handle Login
document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const role = document.getElementById("role").value;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const response = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, email, password }),
    });

    const result = await response.json();

    if (result.success) {
        if (role === "farmer") {
            window.location.href = "farmers.html";
        } else if (role === "consumer") {
            window.location.href = "index.html";
        }
    } else {
        document.getElementById("loginError").textContent = result.message;
    }
});

// Handle Signup
document.getElementById("signupForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const role = document.getElementById("role").value;
    const name = document.getElementById("name").value;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const response = await fetch("/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, name, email, password }),
    });

    const result = await response.json();

    if (result.success) {
        alert("Signup successful! Please login.");
        window.location.href = "login.html";
    } else {
        document.getElementById("signupError").textContent = result.message;
    }
});